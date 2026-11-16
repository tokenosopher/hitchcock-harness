"""Check a per-shot fix pass (shot_match.py output applied to a master) before showing it: same frames, same sound, the change
starts and stops exactly on the fixed shots' cuts, nothing else moved, and the whites did not take a tint.
    .venv/bin/python tools/finish/shotfix_check.py BEFORE.mp4 AFTER.mp4 SHOTS.json --match look/<who>/match.json --who <NAME>
Compares raw YUV planes (decoded at 270x480 for 9:16, 480x270 for 16:9, both files streamed side by side), not RGB or grey:
a master built by the cut is untagged and the fixed file is tagged BT.709, and an RGB/grey decode converts each by its own
tag, which reads as a 1-3 level change on every frame outside the fix. Outside the fixed shots expect re-encode noise only
(up to about 1.3 at this size; a fix inside reads about 2.5 to 3); a boundary is right when the difference jumps on the
shot's first frame and drops after its last. Streams frames instead of loading the film."""
import argparse, json, subprocess
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('before'); ap.add_argument('after'); ap.add_argument('shots')
ap.add_argument('--match', required=True); ap.add_argument('--who', required=True)
A = ap.parse_args()
S = json.load(open(A.shots)); M = json.load(open(A.match)); FIX = M['fix'][A.who]
pw, ph = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
                                   A.before], capture_output=True, text=True).stdout.strip().split(',')[:2])
w, h = (270, 480) if ph >= pw else (480, 270)
dec = lambda p: subprocess.Popen(['ffmpeg', '-v', 'error', '-i', p, '-vf', f'scale={w}:{h}', '-pix_fmt', 'yuv444p', '-fps_mode', 'passthrough',
                                  '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
pa, pb = dec(A.before), dec(A.after)
owner = {}
for i in FIX:
    for f in range(S[i]['a'], S[i]['b']): owner[f] = i
d, whites, n = [], {i: [[], []] for i in FIX}, 0
sz = w * h * 3
while True:
    ba, bb = pa.stdout.read(sz), pb.stdout.read(sz)
    if len(ba) < sz or len(bb) < sz: break
    X = np.frombuffer(ba, np.uint8).reshape(3, h, w).astype(np.float32); Z = np.frombuffer(bb, np.uint8).reshape(3, h, w).astype(np.float32)
    d.append(float(np.abs(X - Z).mean()))
    if n in owner:
        m = X[0] > 200                                       # the brightest parts (gloves, coat highlights): chroma should not move
        if m.sum() > 50:
            whites[owner[n]][0].append(float(np.hypot(X[1][m] - 128, X[2][m] - 128).mean()))
            whites[owner[n]][1].append(float(np.hypot(Z[1][m] - 128, Z[2][m] - 128).mean()))
    n += 1
rest_a, rest_b = len(pa.stdout.read()) // sz, len(pb.stdout.read()) // sz
pa.wait(); pb.wait(); d = np.array(d)
print(f'frames: before {n + rest_a}, after {n + rest_b}' + ('' if rest_a == rest_b == 0 else '  << DIFFERENT LENGTH'))
md5 = lambda p: subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-map', '0:a', '-c:a', 'copy', '-f', 'md5', '-'], capture_output=True, text=True).stdout.strip()
print('audio identical:', md5(A.before) == md5(A.after))
tags = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=color_range,color_space,color_primaries,color_transfer',
                       '-of', 'csv=p=0', A.after], capture_output=True, text=True).stdout.strip()
print('after colour tags (range,space,transfer,primaries):', tags)
inside = np.zeros(len(d), bool)
for f in owner:
    if f < len(d): inside[f] = True
print(f'outside the fixed shots: max diff {d[~inside].max():.2f} (re-encode noise: up to about 1.3) | inside: mean {d[inside].mean():.2f}')
off = []
for i in FIX:
    a, b = S[i]['a'], S[i]['b']
    before_in, first, last = d[a - 1] if a > 0 else 0.0, d[a], d[b - 1]
    after_out = d[b] if b < len(d) else 0.0
    ok = first > before_in and last > after_out
    if not ok: off.append(i)
    wa, wb = whites[i]
    wtxt = f'  whites chroma {np.mean(wa):.1f} -> {np.mean(wb):.1f}' if wa else ''
    print(f'#{i:<3d} {a / M.get("fps", 24):6.2f}s  in {before_in:.2f}|{first:.2f} .. {last:.2f}|{after_out:.2f}  {"ok" if ok else "CHECK"}{wtxt}')
print('fix starts and stops on the cuts:', not off, off or '')
