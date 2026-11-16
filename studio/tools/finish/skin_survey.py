"""Skin saturation per shot, by character: how intense the skin colour is (chroma distance from grey) on skin-like pixels in
the middle of the frame, averaged over 5 frames of each close-up/medium shot. Run it before a colour fix (to find the outlier)
and after it (to confirm the outlier moved and nobody else did).
    .venv/bin/python tools/finish/skin_survey.py VIDEO SHOTS.json [OUT.json] --match look/<who>/match.json
SHOTS.json comes from shot_survey.py on the same VIDEO; match.json's "who" maps shot number -> the character filling the
middle of that close-up or medium (wides and prop inserts are left out). Characters print in the order they first appear.
Reads frames by a straight decode (a joined film's frame counter can restart mid-film, so no ffmpeg select). The centre box
is a fraction of the frame; portrait films decode at 540x960, landscape at 960x540. Never compare its numbers with
tools/stills/skin_check.py's, which read 3 to 10 units higher."""
import argparse, json, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('video'); ap.add_argument('shots'); ap.add_argument('out', nargs='?')
ap.add_argument('--match', required=True, help="the film's look/<who>/match.json (needs 'who')")
A = ap.parse_args()
video, shots = A.video, json.load(open(A.shots))
M = json.load(open(A.match)); FPS = float(M.get('fps', 24))
# who fills the middle of each close-up/medium (from the shot sheet); wides and dial inserts are left out
WHO = {int(k): v for k, v in M['who'].items()}
bad = [i for i in WHO if i >= len(shots)]
if bad: sys.exit(f'skin_survey.py: shots {bad} are not in {A.shots} ({len(shots)} shots): re-read the sheet')
want = {}
for i in WHO:
    for f in np.linspace(shots[i]['a'] + 2, shots[i]['b'] - 3, 5).astype(int):
        want[int(f)] = i
pw, ph = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
                                   video], capture_output=True, text=True).stdout.strip().split(',')[:2])
w, h = (540, 960) if ph >= pw else (960, 540)
r0, r1, c0, c1 = round(h * 175 / 960), round(h * 550 / 960), round(w * 125 / 540), round(w * 415 / 540)   # the centre box
pr = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'scale={w}:{h}', '-pix_fmt', 'yuv444p', '-fps_mode', 'passthrough',
                       '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
acc = {i: [] for i in WHO}; n = 0
while n <= max(want):
    b = pr.stdout.read(w * h * 3)
    if len(b) < w * h * 3:
        break
    if n in want:
        Y, U, V = np.frombuffer(b, np.uint8).reshape(3, h, w).astype(np.float32)
        y, u, v = (Y - 16) * 1.164, U - 128, V - 128
        R, G, B = y + 1.793 * v, y - 0.213 * u - 0.533 * v, y + 2.112 * u
        m = (R > G) & (G > B) & (R - B > 25) & (y > 60) & (y < 200)       # skin-like: warm, mid-bright
        m[:r0] = False; m[r1:] = False; m[:, :c0] = False; m[:, c1:] = False
        if m.mean() > 0.03:
            acc[want[n]].append(float(np.hypot(u[m], v[m]).mean()))
    n += 1
pr.kill()
res = {str(i): {'who': WHO[i], 't': shots[i]['a'] / FPS, 'sat': float(np.mean(acc[i]))} for i in WHO if acc[i]}
for who in dict.fromkeys(WHO[i] for i in sorted(WHO)):
    v = [r['sat'] for r in res.values() if r['who'] == who]
    if not v: print(f'{who}: no skin found in the centre of their shots'); continue
    print(f"{who}: {min(v):.0f}-{max(v):.0f} (mean {np.mean(v):.0f}, ±{np.std(v):.1f})   " +
          '  '.join(f"{r['t']:.0f}s:{r['sat']:.0f}" for r in res.values() if r['who'] == who))
if A.out:
    json.dump(res, open(A.out, 'w'), indent=0)
