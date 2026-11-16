"""Contact sheet of previz check frames: one column per shot, rows = the frames rendered for it.
    .venv/bin/python tools/previz/sheet.py <check dir> <out.jpg> [height]"""
import sys, glob, os, re
from PIL import Image, ImageDraw
if len(sys.argv) < 3 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
d, out = sys.argv[1], sys.argv[2]; H = int(sys.argv[3]) if len(sys.argv) > 3 else 640
fs = sorted(glob.glob(os.path.join(d, 'shot*.png')))
shots = {}
for f in fs: shots.setdefault(int(re.match(r'shot(\d+)', os.path.basename(f)).group(1)), []).append(f)
im0 = Image.open(fs[0]); w = int(im0.width * H / im0.height); rows = max(len(v) for v in shots.values())
sheet = Image.new('RGB', (w * len(shots), H * rows), (0, 0, 0)); dr = ImageDraw.Draw(sheet)
for c, k in enumerate(sorted(shots)):
    for r, f in enumerate(shots[k]):
        sheet.paste(Image.open(f).convert('RGB').resize((w, H)), (c * w, r * H)); dr.text((c * w + 5, r * H + 5), os.path.basename(f)[:-4], fill=(255, 255, 0))
sheet.save(out, quality=88); print(out, sheet.size)
