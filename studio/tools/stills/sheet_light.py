"""Measure the lighting of character sheets so they can be matched: background colour (the plain studio wall, sampled
from the top corners of each panel), skin tone and brightness (a patch on the front-facing face), contrast, and warmth.
    .venv/bin/python tools/stills/sheet_light.py SHEET.png [SHEET.png ...] [--skin x0,y0,x1,y1 ...]   (skin boxes in each sheet's own pixels)
Assumes a sheet of three equal side-by-side panels on a plain backdrop (the backdrop is sampled at each panel's top corners)."""
import sys
import numpy as np
from PIL import Image

def stats(path, skin=None):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float); H, W = a.shape[:2]
    pw = W // 3
    bg = np.concatenate([a[int(H * .02):int(H * .10), p * pw + int(pw * .03):p * pw + int(pw * .15)].reshape(-1, 3) for p in range(3)] +
                        [a[int(H * .02):int(H * .10), (p + 1) * pw - int(pw * .15):(p + 1) * pw - int(pw * .03)].reshape(-1, 3) for p in range(3)])
    Y = a.mean(2); lo, hi = np.percentile(Y, [2, 98])
    out = dict(bg=bg.mean(0).round(), bg_warmth=round(float(bg[:, 0].mean() - bg[:, 2].mean()), 1), p2=round(lo), p98=round(hi), mid=round(float(np.median(Y))))
    if skin:
        x0, y0, x1, y1 = skin; s = a[y0:y1, x0:x1].reshape(-1, 3); out.update(skin=s.mean(0).round(), skin_warmth=round(float(s[:, 0].mean() - s[:, 2].mean()), 1))
    return out

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
    files = [x for x in sys.argv[1:] if not x.startswith('--') and ',' not in x]
    boxes = [tuple(map(int, x.split(','))) for x in sys.argv[1:] if ',' in x]
    for i, f in enumerate(files):
        print(f.split('/')[-1], stats(f, boxes[i] if i < len(boxes) else None))
