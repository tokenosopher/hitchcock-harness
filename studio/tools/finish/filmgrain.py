"""Film grain for 8-bit yuv420p video, applied natively on the Y/U/V planes.

Pipeline:  ffmpeg decode (+ optional look filters via --pre-vf) -> numpy grain -> ffmpeg encode.

Grain model
- Spatially correlated grain, larger than 1 px: two octaves of white noise, each shaped with
  a Gaussian filter in the Fourier domain (fine sigma = --size, coarse = 2.2 x --size),
  mixed and renormalised to unit std.
- A new pattern on every frame: a bank of precomputed fields, and each frame picks one at
  random with a random toroidal offset and random flips, so frames never repeat.
- Strength depends on brightness: amount * w(Y). w peaks in the lower mid-tones, is about
  0.3 in deep blacks and falls to 0 in clipped whites.
- Mostly luma: independent U and V grain at --chroma x the luma strength. It sits on the
  half-resolution chroma planes, so chroma grain is softer and blotchier, like dye clouds.
Only numpy is needed; ffmpeg must be on PATH.
"""
import argparse, shlex, subprocess, sys, time
import numpy as np


def shaped_noise_bank(n, h, w, sigmas, mix, rng):
    """n fields of unit-std noise, each a mix of Gaussian-filtered white-noise octaves."""
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    f2 = fx * fx + fy * fy
    # The Fourier transform of a Gaussian blur with spatial sigma s is exp(-2 pi^2 s^2 f^2).
    filters = [np.exp(-2.0 * np.pi ** 2 * s * s * f2) for s in sigmas]
    bank = np.empty((n, h, w), np.float32)
    for i in range(n):
        acc = np.zeros((h, w), np.float64)
        for filt, m in zip(filters, mix):
            g = np.fft.irfft2(np.fft.rfft2(rng.standard_normal((h, w))) * filt, s=(h, w))
            acc += m * g / g.std()
        bank[i] = (acc / acc.std()).astype(np.float32)
    return bank


def weight_lut(black=0.30, gamma=0.6, full_range=False):
    """Grain strength as a function of 8-bit luma code value."""
    y = np.arange(256, dtype=np.float64)
    x = y / 255.0 if full_range else np.clip((y - 16.0) / 219.0, 0.0, 1.0)
    bell = np.power(np.clip(4.0 * x * (1.0 - x), 0.0, 1.0), gamma)
    floor = black * (1.0 - x) ** 2          # keep some grain in the blacks
    return (floor + (1.0 - floor) * bell).astype(np.float32)


def pick(bank, rng):
    f = bank[rng.integers(len(bank))]
    f = np.roll(f, (int(rng.integers(f.shape[0])), int(rng.integers(f.shape[1]))), axis=(0, 1))
    if rng.random() < 0.5:
        f = f[:, ::-1]
    if rng.random() < 0.5:
        f = f[::-1, :]
    return f


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", path], text=True)
    w, h, r = out.strip().split(",")[:3]
    return int(w), int(h), r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--size", type=float, default=0.9, help="fine-octave grain sigma in px (luma)")
    ap.add_argument("--amount", type=float, default=5.0, help="luma grain std in 8-bit code values at peak")
    ap.add_argument("--chroma", type=float, default=0.3, help="chroma grain strength relative to luma")
    ap.add_argument("--coarse-mix", type=float, default=0.55, help="weight of coarse octave (fine = 1)")
    ap.add_argument("--black", type=float, default=0.30, help="relative grain in deep blacks")
    ap.add_argument("--bank", type=int, default=8)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--pre-vf", default="", help="ffmpeg filter chain applied before grain (the look)")
    ap.add_argument("--enc", default="-c:v libx264 -preset slow -crf 16 -tune grain",
                    help="ffmpeg encoder args")
    ap.add_argument("--audio", action="store_true", help="copy audio from input")
    ap.add_argument("--ss", default=None, help="seek (seconds) into input")
    ap.add_argument("--t", default=None, help="duration (seconds)")
    a = ap.parse_args()
    seek = (["-ss", a.ss] if a.ss else []) + (["-t", a.t] if a.t else [])
    import os
    if a.output != "-" and os.path.realpath(a.output) == os.path.realpath(a.input):
        sys.exit("refusing to overwrite the input")

    w, h, rate = probe(a.input)
    rng = np.random.default_rng(a.seed)
    t0 = time.time()
    s = a.size
    ybank = shaped_noise_bank(a.bank, h, w, [s, 2.2 * s], [1.0, a.coarse_mix], rng)
    # On the half-res chroma planes the same sigma covers 2x the area, so it reads larger.
    cbank = shaped_noise_bank(a.bank, h // 2, w // 2, [max(0.5, s * 0.75)], [1.0], rng)
    lut = weight_lut(a.black)
    t_bank = time.time() - t0

    vf = ["-vf", a.pre_vf + ",format=yuv420p"] if a.pre_vf else ["-vf", "format=yuv420p"]
    dec = subprocess.Popen(["ffmpeg", "-v", "error", *seek, "-i", a.input, *vf, "-f", "rawvideo",
                            "-pix_fmt", "yuv420p", "-"], stdout=subprocess.PIPE)
    if a.output == "-":            # raw yuv420p frames to stdout (for analysis pipes)
        class _Raw:
            stdin = sys.stdout.buffer
            def wait(self): pass
        enc = _Raw()
    else:
        # the frames are BT.709 limited range; say so, or ffmpeg assumes BT.601 and converts when the output is tagged 709
        enc_cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p",
                   "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
                   "-s", f"{w}x{h}", "-r", rate, "-i", "-"]
        if a.audio:
            enc_cmd += [*seek, "-i", a.input, "-map", "0:v", "-map", "1:a?", "-c:a", "aac", "-b:a", "192k"]
        enc_cmd += shlex.split(a.enc) + [a.output]
        enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE)

    ysz, csz = w * h, (w // 2) * (h // 2)
    fsz = ysz + 2 * csz
    n = 0
    t_np = 0.0
    while True:
        buf = dec.stdout.read(fsz)
        if len(buf) < fsz:
            break
        t1 = time.time()
        fr = np.frombuffer(buf, np.uint8)
        Y = fr[:ysz].reshape(h, w)
        U = fr[ysz:ysz + csz].reshape(h // 2, w // 2)
        V = fr[ysz + csz:].reshape(h // 2, w // 2)
        wy = lut[Y]
        Yo = Y + (a.amount * wy) * pick(ybank, rng)
        wc = wy[::2, ::2]
        ca = a.amount * a.chroma
        Uo = U + (ca * wc) * pick(cbank, rng)
        Vo = V + (ca * wc) * pick(cbank, rng)
        out = np.concatenate([np.clip(np.rint(p), 0, 255).astype(np.uint8).ravel()
                              for p in (Yo, Uo, Vo)])
        t_np += time.time() - t1
        enc.stdin.write(out.tobytes())
        n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
    tot = time.time() - t0
    print(f"frames={n} bank_init={t_bank:.2f}s numpy={t_np:.2f}s ({1000*t_np/max(n,1):.1f} ms/frame) "
          f"total={tot:.2f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
