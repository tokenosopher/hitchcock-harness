"""Does a 1080p file (a finalize, or an upscale) match its 480p draft frame for frame? Run it on every 1080p source before
it goes into the cut: the cut keeps the draft's frame ranges, so a source that is not frame-aligned would shift every trim.
    .venv/bin/python tools/finish/compare_finalize.py DRAFT.mp4 FINAL.mp4
Prints frame counts and fps, then for frames sampled across the clip the best-matching draft frame within +/-4 frames
(mean absolute grey-level difference after scaling the 1080p frame to the draft size), and the lowest per-frame picture
correlation over the whole clip (finalizes measure about 0.99 or above). A match means every sample's best offset is 0
(or ties with 0 on still frames), the frame counts are equal, and the generation's hard cuts fall on the same frames (the
sharpest test: on still dialogue frames the neighbours are nearly identical). The comparison size is half the draft's,
so the correlation reads a little lower than at a smaller size."""
import subprocess, sys, json
import numpy as np
if len(sys.argv) != 3 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0 if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help') else 2)
draft, final = sys.argv[1], sys.argv[2]
def info(p):
    o = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,r_frame_rate,nb_read_packets', '-of', 'json', p], capture_output=True, text=True).stdout
    return json.loads(o)['streams'][0]
a, b = info(draft), info(final)
W, H = int(a['width']) // 2 // 2 * 2, int(a['height']) // 2 // 2 * 2
def frames(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-vf', f'scale={W}:{H}:flags=area,format=gray', '-fps_mode', 'passthrough',
                          '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
print('draft', a['width'], a['height'], a['r_frame_rate'], a['nb_read_packets'], '| final', b['width'], b['height'], b['r_frame_rate'], b['nb_read_packets'])
D, F = frames(draft), frames(final)
n = min(len(D), len(F)); offs = []
for i in np.linspace(4, n - 5, 12).astype(int):
    diffs = {o: float(np.abs(F[i] - D[i + o]).mean()) for o in range(-4, 5) if 0 <= i + o < len(D)}
    best = min(diffs, key=diffs.get)
    # a near-still stretch makes neighbouring frames almost identical: offset 0 within 0.15 levels (or 3%) of the best is a tie
    tie = best != 0 and 0 in diffs and diffs[0] - diffs[best] <= max(0.15, 0.03 * diffs[best])
    offs.append(0 if tie else best)
    print(f'frame {i:4d}: best draft offset {best:+d}  diff {diffs[best]:5.2f}  (same frame {diffs.get(0, -1):5.2f}, +/-1: {diffs.get(-1, -1):5.2f}/{diffs.get(1, -1):5.2f})' + ('  tie with 0 (still frames)' if tie else ''))
cs = [np.corrcoef(D[i].ravel(), F[i].ravel())[0, 1] for i in range(n) if D[i].std() > 1 and F[i].std() > 1]
if cs: print(f'lowest picture correlation {min(cs):.3f} over {len(cs)} frames')
# the generation's own hard cuts are the sharpest test: they must fall on the same frames
cuts = lambda X: [int(i + 1) for i in np.where(np.abs(np.diff(X, axis=0)).mean((1, 2)) > 18)[0]]
cd, cf = cuts(D), cuts(F)
print('hard cuts: draft', cd, '| final', cf)
ok = all(o == 0 for o in offs) and len(D) == len(F) and cd == cf
print('VERDICT:', 'frame-aligned' if ok else 'NOT aligned (offsets %s, frames %d vs %d, cuts %s vs %s)' % (sorted(set(offs)), len(D), len(F), cd, cf))
