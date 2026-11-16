"""Shot survey of a built cut: every shot (by frame difference on a straight decode), with its black level and warmth, plus a
contact sheet to read the shot numbers off. The numbers are what match.json, skin_survey.py, shot_match.py and
shotfix_check.py refer to.
    .venv/bin/python tools/finish/shot_survey.py VIDEO OUT.json [--sheet SHEET.jpg] [--thresh 18] [--fps 24]
OUT.json: [{a, b, p1: [R,G,B 1st percentile], y1, y5 (luma percentiles), Y (mean luma), rg (R-G in the mid-tones)}, ...],
a/b = first frame and end frame (exclusive) counted from the start of the file. Pieces under 3 frames are skipped, so a flash
frame does not take a number. Frames come from one straight decode with -fps_mode passthrough: a cut joined from clips with
different colour tags restarts ffmpeg's frame counter partway through, so select=eq(n,..) lands on the wrong frames.
Frames are held as small uint8 thumbnails."""
import argparse, json, subprocess
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('video'); ap.add_argument('out')
ap.add_argument('--sheet'); ap.add_argument('--thresh', type=float, default=18.0); ap.add_argument('--fps', type=float, default=24.0)
A = ap.parse_args()
pw, ph = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
                                   A.video], capture_output=True, text=True).stdout.strip().split(',')[:2])
w, h = (135, 240) if ph >= pw else (240, 135)
pr = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', A.video, '-vf', f'scale={w}:{h},format=rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                      stdout=subprocess.PIPE)
M, d, prev = [], [], None
while True:
    b = pr.stdout.read(w * h * 3)
    if len(b) < w * h * 3: break
    f = np.frombuffer(b, np.uint8).reshape(h, w, 3); M.append(f)
    g = f.astype(np.float32).mean(-1)
    if prev is not None: d.append(float(np.abs(g - prev).mean()))
    prev = g
pr.wait(); M = np.stack(M)
cuts = [0] + [i + 1 for i in np.where(np.array(d) > A.thresh)[0]] + [len(M)]
shots = []
for a, b in zip(cuts[:-1], cuts[1:]):
    if b - a < 3: continue
    S = M[a:b].astype(np.float32); Y = 0.2126 * S[..., 0] + 0.7152 * S[..., 1] + 0.0722 * S[..., 2]
    mids = (Y > 60) & (Y < 170)
    shots.append(dict(a=int(a), b=int(b), p1=[float(np.percentile(S[..., c], 1)) for c in range(3)], y1=float(np.percentile(Y, 1)),
                      y5=float(np.percentile(Y, 5)), Y=float(Y.mean()), rg=float((S[..., 0] - S[..., 1])[mids].mean()) if mids.any() else 0))
json.dump(shots, open(A.out, 'w'), indent=0)
print(len(M), 'frames,', len(shots), 'shots ->', A.out)
for i, s in enumerate(shots):
    print(i, f'{s["a"] / A.fps:6.2f}-{s["b"] / A.fps:6.2f}', 'y1 %.1f y5 %.1f Y %.0f rg %.0f' % (s['y1'], s['y5'], s['Y'], s['rg']), 'p1 rgb', [round(v) for v in s['p1']])
if A.sheet:
    from PIL import Image, ImageDraw
    tw, th = (108, 192) if h >= w else (192, 108); cols = 12; rows = (len(shots) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + 4), rows * (th + 30)), 'white'); dr = ImageDraw.Draw(sheet)
    for i, s in enumerate(shots):
        m = (s['a'] + s['b']) // 2; x, y = (i % cols) * (tw + 4), (i // cols) * (th + 30)
        sheet.paste(Image.fromarray(M[m]).resize((tw, th)), (x, y))
        dr.text((x + 2, y + th + 2), f'#{i} {s["a"] / A.fps:.1f}s', fill='black'); dr.text((x + 2, y + th + 14), f'blk {s["y1"]:.0f} rg {s["rg"]:.0f}', fill='black')
    sheet.save(A.sheet, quality=88); print('sheet ->', A.sheet)
