"""Audio measurements for the voice scripts (numpy + ffmpeg, no service calls): pcm, f0 (median pitch), edges, speech_edges
(the same threshold, ignoring blips shorter than 40 ms), loud, dur.
    .venv/bin/python tools/voices/measure.py FILE ...   prints seconds, speech edges, median pitch and mean level of each file"""
import re, subprocess, sys
import numpy as np


def pcm(p, sr=16000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)


def f0(p, sr=16000):
    """Median pitch of the voiced 40 ms frames (normalised autocorrelation, 60-320 Hz). Unreliable on clips under ~1 s."""
    x, n, out = pcm(p, sr), 640, []
    for i in range(0, len(x) - n, n // 2):
        f = x[i:i + n] - x[i:i + n].mean()
        if np.sqrt((f ** 2).mean()) < 0.01: continue
        c = np.correlate(f, f, 'full')[n - 1:]; c /= c[0] + 1e-9
        lo, hi = sr // 320, sr // 60; k = lo + np.argmax(c[lo:hi])
        if c[k] > 0.5: out.append(sr / k)
    return round(float(np.median(out)), 1) if out else 0.0


def edges(p, sr=16000, thr=-38.0):
    """(first, last) speech time in seconds: 10 ms frames above thr dBFS."""
    x = pcm(p, sr); n = sr // 100
    e = 20 * np.log10(np.array([np.sqrt((x[i:i + n] ** 2).mean()) for i in range(0, len(x) - n, n)]) + 1e-9)
    on = np.where(e > thr)[0]
    return (round(on[0] / 100, 2), round((on[-1] + 1) / 100, 2)) if len(on) else (0.0, len(x) / sr)


def speech_edges(path, thr_db=-38.0, min_run=4):
    """Like edges(), but runs of speech frames shorter than min_run x 10 ms (a click, a breath) are ignored."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float) / 32768; n = 160
    e = np.array([np.sqrt((x[i:i + n] ** 2).mean()) for i in range(0, len(x) - n, n)])
    on = 20 * np.log10(e + 1e-9) > thr_db
    idx = np.where(on)[0]
    if not len(idx): return 0.0, len(x) / 16000
    runs, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i != prev + 1: runs.append((start, prev)); start = i
        prev = i
    runs.append((start, prev)); runs = [r for r in runs if r[1] - r[0] + 1 >= min_run] or runs
    return round(runs[0][0] * 0.01, 3), round((runs[-1][1] + 1) * 0.01, 3)


def loud(p):
    """Mean level in dB (ffmpeg volumedetect)."""
    o = subprocess.run(['ffmpeg', '-v', 'info', '-i', p, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'mean_volume: (-?[\d.]+) dB', o).group(1))


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__); sys.exit(0)
    for p in sys.argv[1:]:
        a, b = speech_edges(p)
        print(f'{p}: {dur(p):.2f} s, speech {a:.2f}-{b:.2f} s, f0 {f0(p)} Hz, mean {loud(p)} dB')
