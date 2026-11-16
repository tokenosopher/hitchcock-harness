"""Strip a lead instrument's bleed out of a backing built from separated stems (a generated song's stems can be
regenerated rather than split, so the lead bleeds into the others). The lead's own stem says which pitch it plays in every
21 ms frame. In the backing's spectrum, each frame gets notches that follow that pitch and its overtones (narrow, deep,
only while the lead plays), plus a softer mask shaped by the lead stem's own spectrum, which catches vibrato wiggles and
slides. Brushes, cross-stick and bass mostly sit elsewhere or are brief broadband clicks, so they come through.
    [STEMS=Drums,Bass,Percussion] [LEAD=Synth] [BAND=600,2000] .venv/bin/python tools/music/dethermin.py STEM_DIR OUT_BACKING.wav [OUT_PLAIN.wav]
STEM_DIR holds one WAV per stem, named "<Name>.wav" or "... (<Name>).wav" (tools/stems/split.py --four writes vocals.wav,
drums.wav, bass.wav, other.wav: STEMS=drums,bass LEAD=other). Set BAND to the lead's fundamental range in Hz, measured from
its pitch track. Other knobs: DEPTH_DB (55), WIDTH (130 cents), HARM (10), SOFT (3.0), PASSES (2). For exploring only:
use the backing to find a sound; a published score is made fresh, not built on a reference's recording."""
import subprocess, sys, numpy as np
SR = 48000; N = 4096; HOP = 1024
import os
DEPTH = 10 ** (-float(os.environ.get('DEPTH_DB', 55)) / 20)          # notch floor
WIDTH_CENTS = float(os.environ.get('WIDTH', 130))                  # half-width of each notch (vibrato is about +-20 cents, slides add more)
HARMONICS = int(os.environ.get('HARM', 10))
SOFT_K = float(os.environ.get('SOFT', 3.0))
PASSES = int(os.environ.get('PASSES', 2))

def load(path, ch=2):
    x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'],
                                     capture_output=True).stdout, np.float32)
    return x.reshape(-1, ch).T.astype(np.float64)

def stft(x):
    w = np.hanning(N); pad = np.pad(x, (N, N + HOP))
    frames = np.lib.stride_tricks.sliding_window_view(pad, N)[::HOP]
    return np.fft.rfft(frames * w, axis=1)

def istft(X, n):
    w = np.hanning(N); frames = np.fft.irfft(X, n=N, axis=1) * w
    out = np.zeros(HOP * (len(frames) - 1) + N)
    for i, f in enumerate(frames): out[i * HOP:i * HOP + N] += f
    return out[N:N + n] / (np.sum(w ** 2) / HOP)

def find_stem(d, name):
    for f in sorted(os.listdir(d)):
        if f.lower().endswith('.wav') and (f[:-4] == name or f[:-4].endswith(f'({name})')):
            return os.path.join(d, f)
    sys.exit(f'dethermin.py: no "{name}.wav" or "... ({name}).wav" in {d}')

def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    d = sys.argv[1].rstrip('/')
    stem = lambda name, ch=2: load(find_stem(d, name), ch)
    back = sum(stem(n) for n in os.environ.get('STEMS', 'Drums,Bass,Percussion').split(','))
    ther = stem(os.environ.get('LEAD', 'Synth'), 1)[0]
    n = back.shape[1]
    T = np.abs(stft(ther)); f = np.fft.rfftfreq(N, 1 / SR)
    lo_hz, hi_hz = (float(v) for v in os.environ.get('BAND', '600,2000').split(','))
    band = (f > lo_hz) & (f < hi_hz)
    e = T[:, band].max(1); thr = np.percentile(e, 95) * 10 ** (-38 / 20)
    active = e > thr
    # pitch of the lead per frame (strongest partial 600-2000 Hz, parabolic refinement)
    k = np.argmax(T[:, band], 1) + np.argmax(band)
    a, b, c = T[np.arange(len(T)), k - 1], T[np.arange(len(T)), k], T[np.arange(len(T)), k + 1]
    f0 = (k + 0.5 * (a - c) / np.where(a - 2 * b + c == 0, -1e-12, a - 2 * b + c)) * SR / N
    f0 = np.where(active, f0, 0)
    # widen where it slides (pitch change across neighbouring frames)
    slide = np.abs(np.log2(np.maximum(np.roll(f0, -1), 1) / np.maximum(np.roll(f0, 1), 1))) * 1200
    slide = np.where(active & np.roll(active, 1) & np.roll(active, -1), np.minimum(slide, 300), 0)
    gain = np.ones_like(T)
    cents = lambda fc: 1200 * np.log2(np.maximum(f, 1) / fc)
    for t in np.where(active)[0]:
        wdt = WIDTH_CENTS + slide[t] / 2
        for h in range(1, HARMONICS + 1):
            fc = h * f0[t]
            if fc > SR / 2 - 500: break
            dist = np.abs(cents(fc)) / wdt
            g = np.where(dist < 1, DEPTH + (1 - DEPTH) * (0.5 - 0.5 * np.cos(np.pi * dist)), 1.0)
            gain[t] = np.minimum(gain[t], g)
    # the lead stem's own spectral shape, normalised per frame: catches what the pitch notches miss
    Tn = T / (T.max(1, keepdims=True) + 1e-12)
    soft = np.clip(1 - SOFT_K * Tn ** 0.6, DEPTH, 1)
    soft[~active] = 1
    gain = np.minimum(gain, soft)
    # smooth the mask a little in time so it doesn't flutter
    gain = np.minimum(gain, (np.roll(gain, 1, 0) + gain + np.roll(gain, -1, 0)) / 3)
    out = back
    for _ in range(PASSES): out = np.stack([istft(stft(ch) * gain, n) for ch in out])
    plain = back
    # measured: backing energy in the lead's tracked bins, before and after, and everywhere else
    B = np.abs(stft(back.mean(0))); A = np.abs(stft(out.mean(0)))
    inside = gain < 0.5
    db = lambda x: 10 * np.log10(np.sum(x ** 2) + 1e-20)
    print(f'lead active in {active.mean() * 100:.0f}% of frames; backing energy where the lead sits: '
          f'{db(B[inside]) - db(A[inside]):.1f} dB lower; everywhere else: {db(B[~inside]) - db(A[~inside]):.1f} dB lower')
    pk = max(np.abs(out).max(), 1e-9); out = out * (0.89 / pk); plain = plain * (0.89 / pk)
    write = lambda x, p: subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', p],
                                        input=x.T.astype(np.float32).tobytes(), check=True)
    write(out, sys.argv[2]); print('->', sys.argv[2])
    if len(sys.argv) > 3: write(plain, sys.argv[3]); print('->', sys.argv[3])

if __name__ == '__main__':
    main()
