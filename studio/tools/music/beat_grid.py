"""Measure a take's beat grid (tempo and the time of its first beat) from onset strength, so cuts, repeats, breaks and
re-entries can sit on bar lines. Spectral flux on the summed inputs (a take, or its bass + drums stems for a cleaner
pulse), then the BPM and phase whose beats carry the most onset energy.
A grid is only as good as its range: tempo reads at half or double are common, so give a --bpm range around what you
hear and check by ear. The first beat is not necessarily a downbeat: listen to where bar 1 starts before cutting on bars.
    .venv/bin/python tools/music/beat_grid.py AUDIO [AUDIO ...] [--bpm 105,125] [--beats-per-bar 4] [--fps 24]"""
import argparse, subprocess
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('audio', nargs='+', help='one take, or several stems to sum (e.g. bass.mp3 drums.mp3)')
ap.add_argument('--bpm', default='105,125', help='tempo range to search, LO,HI (default 105,125)')
ap.add_argument('--beats-per-bar', type=int, default=4)
ap.add_argument('--fps', type=float, default=24.0, help='film frame rate, for frames per beat (default 24)')
a = ap.parse_args()
SR = 22050


def dec(p): return np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)


xs = [dec(p) for p in a.audio]; n = min(len(x) for x in xs); x = sum(v[:n] for v in xs)
hop = 128; fps = SR / hop
X = np.log1p(np.array([np.abs(np.fft.rfft(x[i:i + 1024] * np.hanning(1024))) for i in range(0, len(x) - 1024, hop)]))
fl = np.maximum(0, np.diff(X, axis=0)).sum(1); fl = (fl - fl.mean()) / fl.std()
lo, hi = (float(v) for v in a.bpm.split(','))
best = None
for bpm in np.arange(lo, hi, 0.05):
    per = fps * 60 / bpm
    for ph in np.arange(0, per, 1.0):
        idx = (ph + per * np.arange(int((len(fl) - ph) / per))).astype(int); s = fl[idx].mean()
        if best is None or s > best[0]: best = (s, bpm, ph / fps)
s, bpm, ph = best
beat = 60 / bpm; bar = beat * a.beats_per_bar
print(f'beat grid: {bpm:.2f} BPM, first beat at {ph:.3f} s (score {s:.2f}); beat {beat:.4f} s, bar {bar:.4f} s, '
      f'{a.fps * beat:.2f} frames per beat at {a.fps:g} fps; length {n / SR:.2f} s')
print('first bar lines:', ' '.join(f'{ph + k * bar:.3f}' for k in range(8)))
