"""Checks a built cut before it goes to the user: a 1080p master against the 480p render of the same version, or any
rebuild against the version it should match.
- frames and duration, from a straight decode (-fps_mode passthrough, frames counted from the start; never -ss or select=n on a
  joined film, whose frame counter can restart mid-film)
- every shot change, and any shot shorter than --min-frames (a flash frame at an edit)
- edge lines: a dark 1-px border on any side (a padded source), counted per side
- the last frames' brightness (a film that ends on black should end on true black)
- with --ref OTHER.mp4: the frame counts, the lowest per-frame picture correlation (both decoded to the same small grey size,
  so a 1080p master compares with its 480p render; about 0.98 or above for the same edit), and the sound: whether the audio
  streams are bit-identical, and the correlation of the decoded sound (about 0.99 or above for the same mix re-encoded)
- with --sheet DIR: one strip per shot change (2 frames before, 2 after) to look at, needs PIL
    .venv/bin/python tools/finish/check_cut.py MASTER.mp4 [--ref RENDER.mp4] [--min-frames 3] [--thresh 18] [--sheet DIR]"""
import argparse, os, subprocess
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], epilog=__doc__.split('\n', 1)[1], formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('cut'); ap.add_argument('--ref'); ap.add_argument('--min-frames', type=int, default=3)
ap.add_argument('--thresh', type=float, default=18.0); ap.add_argument('--fps', type=float, default=24.0); ap.add_argument('--sheet')
a = ap.parse_args()


def probe(p):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p],
                       capture_output=True, text=True).stdout.strip().split(',')
    return int(o[0]), int(o[1])


def frames(p, w, h):
    pr = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', p, '-vf', f'scale={w}:{h},format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                          stdout=subprocess.PIPE)
    while True:
        b = pr.stdout.read(w * h)
        if len(b) < w * h: break
        yield np.frombuffer(b, np.uint8).reshape(h, w).astype(np.float32)


W, H = probe(a.cut)
SW, SH = (96, 170) if H >= W else (170, 96)          # the small grey size both files are compared at
small = np.array([f.ravel() for f in frames(a.cut, SW, SH)])
n = len(small); dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.cut], capture_output=True, text=True).stdout)
print(f'{a.cut}: {W}x{H}, {n} frames, {dur:.2f} s')
d = np.abs(np.diff(small, axis=0)).mean(1)
cuts = [int(i + 1) for i in np.where(d > a.thresh)[0]]
bounds = [0] + cuts + [n]
flash = [(s, e) for s, e in zip(bounds[:-1], bounds[1:]) if e - s < a.min_frames]
print(f'shot changes: {len(cuts)}; shots under {a.min_frames} frames: ' + (', '.join(f'frames {s}-{e - 1} ({s / a.fps:.2f} s)' for s, e in flash) or 'none'))

edge = {'L': 0, 'R': 0, 'T': 0, 'B': 0}
for f in frames(a.cut, W, H):
    for k, (e, nb) in {'L': (f[:, :1], f[:, 3:7]), 'R': (f[:, -1:], f[:, -7:-3]), 'T': (f[:1], f[3:7]), 'B': (f[-1:], f[-7:-3])}.items():
        if nb.mean() > 12 and e.mean() < nb.mean() * 0.6: edge[k] += 1
print('frames with an edge line per side:', edge)
print('last 10 frames mean brightness:', [round(float(x), 1) for x in small[-10:].mean(1)])

if a.ref:
    md5 = lambda p: subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-map', '0:a', '-c:a', 'copy', '-f', 'md5', '-'], capture_output=True, text=True).stdout.strip()
    print('audio stream bit-identical to ref:', md5(a.cut) == md5(a.ref))

    def pcm(p):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'],
                             capture_output=True).stdout
        return np.frombuffer(raw, np.float32)
    x, y = pcm(a.cut), pcm(a.ref)
    if len(x) and len(y):
        k = min(len(x), len(y)); c = np.corrcoef(x[:k], y[:k])[0, 1] if x[:k].std() > 0 and y[:k].std() > 0 else float('nan')
        print(f'sound: {len(x) / 8000:.2f} s vs ref {len(y) / 8000:.2f} s; decoded correlation {c:.4f}')
    else:
        print('sound: ' + ('no audio in the cut' if not len(x) else 'no audio in the ref'))
    rw, rh = probe(a.ref)
    ref = np.array([f.ravel() for f in frames(a.ref, SW, SH)])
    m = min(len(ref), n); ix = [i for i in range(m) if small[i].std() > 1 and ref[i].std() > 1]; cs = [np.corrcoef(small[i], ref[i])[0, 1] for i in ix]
    print(f'ref {rw}x{rh}, {len(ref)} frames vs {n}; lowest picture correlation {min(cs):.3f} (frame {ix[int(np.argmin(cs))]})' if cs else 'no comparable frames')

if a.sheet:
    from PIL import Image
    os.makedirs(a.sheet, exist_ok=True)
    big = [f for f in frames(a.cut, 135 if H >= W else 240, 240 if H >= W else 135)]
    for c in cuts:
        idx = [i for i in range(c - 2, c + 2) if 0 <= i < n]
        bw, bh = (135, 240) if H >= W else (240, 135)
        strip = Image.new('L', (bw * len(idx) + 4 * (len(idx) - 1), bh), 255)
        for j, i in enumerate(idx): strip.paste(Image.fromarray(big[i].astype(np.uint8)), (j * (bw + 4), 0))
        strip.save(os.path.join(a.sheet, f'cut-{c:05d}.png'))
    print(f'{len(cuts)} strips in {a.sheet} (frames c-2, c-1 | c, c+1)')
