"""Check a master the Hitchcock Harness rendered (or any mixed film) against the film without music: where the music plays, where it
stops, how loud the whole thing is, and (with --approved) whether everything outside the stops still matches the mix the
user approved. Use it to say back what the user changed on the timeline (Flow v3.2 - 11 Sound and music).
Music = render minus the music-free film, level per window. Re-encoded dialogue leaves a residue in that difference, so
read it for stops and relative changes only, never as the bed's level (lay_song.py measures the bed itself).
    .venv/bin/python tools/music/check_render.py RENDER.mp4 PICTURE_NO_MUSIC.mp4 [--approved APPROVED_MIX.mp4] [--frames N]
        [--win 0.25] [--drop 12] [--min 0.4]
A stop is a run of at least --min seconds where the music sits --drop dB or more below its median level. Expect the
deliberate ones (the user's cuts, a 14 dB duck, the end fade) and the occasional natural lull in the song."""
import argparse, subprocess
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('render'); ap.add_argument('nomusic')
ap.add_argument('--approved', help='the approved mix, to compare the music outside the stops')
ap.add_argument('--frames', type=int, help='expected frame count (the cut\'s)')
ap.add_argument('--win', type=float, default=0.25); ap.add_argument('--drop', type=float, default=12.0); ap.add_argument('--min', type=float, default=0.4)
a = ap.parse_args()
SR = 48000


def dec(p): return np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-vn', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32)
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
def mmss(s): return f'{int(s // 60)}:{s % 60:05.2f}'


r, d = dec(a.render), dec(a.nomusic); n = min(len(r), len(d)); m = r[:n] - d[:n]
w = int(a.win * SR); M = np.array([db(m[i:i + w]) for i in range(0, n - w, w)])
med = np.median(M); low = M < med - a.drop
runs, s = [], None
for i, f in enumerate(np.append(low, False)):
    if f and s is None: s = i
    elif not f and s is not None:
        if (i - s) * a.win >= a.min: runs.append((s * a.win, i * a.win, float(M[s:i].mean())))
        s = None
fr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,width,height,r_frame_rate',
                     '-of', 'csv=p=0', a.render], capture_output=True, text=True).stdout.strip()
e = subprocess.run(['ffmpeg', '-v', 'info', '-i', a.render, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
I = next((l.split('I:')[1].strip() for l in e.splitlines()[::-1] if ' I:' in l), '?')
pk = next((l.split('Peak:')[1].strip() for l in e.splitlines()[::-1] if 'Peak:' in l), '?')
print(f'render: {fr} (width,height,rate,frames)' + (f'; expected {a.frames} frames' if a.frames else '') + f'; loudness {I}, true peak {pk}')
print(f'music median {med:.1f} dB (residual); stops ({a.drop:g} dB or more down for {a.min:g} s or longer):')
for x, y, lv in runs: print(f'  {mmss(x)} - {mmss(y)}  ({y - x:.2f} s, {lv - med:+.0f} dB)')
if a.approved:
    # compare whole-mix levels, not residuals: the approved mix is AAC, so "approved minus film" is mostly coding residue.
    # In the gaps between lines the mix is mostly music, so the gap difference reads as a change of music level.
    p = dec(a.approved); k = min(n, len(p))
    R = np.array([db(r[i:i + w]) for i in range(0, k - w, w)]); Q = np.array([db(p[i:i + w]) for i in range(0, k - w, w)])
    Dl = np.array([db(d[i:i + w]) for i in range(0, k - w, w)])
    L = min(len(R), len(Q), len(low)); keep = ~low[:L] & (Q[:L] > -60); sp = Dl[:L] > -30
    dd = R[:L] - Q[:L]
    print(f'vs approved mix, outside the stops: whole mix {np.median(dd[keep & sp]):+.2f} dB while speaking, '
          f'{np.median(dd[keep & ~sp]):+.2f} dB in the gaps (a gap change of a few dB = the music level moved)')
