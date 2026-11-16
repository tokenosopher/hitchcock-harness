"""Prepare a cropped full-body panel for a head-to-toe extension: the figure (through its cutout alpha) is laid on a tall
flat canvas of the sheet's own backdrop colour, with empty backdrop below it for the outpaint (Seedream 5.5 on Higgsfield). Writes
the two inputs extend_figure.py expects (canvas 1296x2304 or 1080x1920, the panel centred at the top, the mask a float alpha of the panel):
    .venv/bin/python tools/stills/figure_canvas.py SHEET.png CUTOUT.png OUT_PREFIX --panel x0,y0,x1,y1 [--clear x0,y0,x1,y1 ...] [--size 1296x2304] [--at X,Y]
SHEET:   the approved sheet. CUTOUT: an RGBA cutout of the same sheet (Higgsfield remove_background), any size.
--panel: the full-body panel's box in SHEET pixels (keep the head room above the head). Only the largest connected
         figure in the box is kept, which drops a separate piece of a neighbouring view.
--clear: a box in PANEL pixels whose alpha is zeroed (repeatable): for a neighbouring view that touches the figure, as
         such as a middle view's back touching the full-body view's elbow. Check the printed mask.
--at:    where the panel's top-left corner goes on the canvas (default: centred, at the top).
Writes OUT_PREFIX-canvas.png, OUT_PREFIX-mask.npy (and -mask.png to check by eye), and prints the --at and --cut values for extend_figure.py."""
import argparse
import numpy as np
from PIL import Image, ImageFilter

def main_figure(m, q=4):
    """Keep only the largest connected figure in the alpha: on sheets whose panels touch, the box also catches a hand or
    hair of the neighbouring view. Connectivity is found at 1/q size, then grown a little so soft edges survive."""
    h, w = m.shape; small = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((max(1, w // q), max(1, h // q)), Image.BILINEAR)) > 127
    lab = np.zeros(small.shape, int); n = 0; sizes = {}
    for y0, x0 in zip(*np.nonzero(small)):
        if lab[y0, x0]: continue
        n += 1; stack = [(y0, x0)]; lab[y0, x0] = n; c = 0
        while stack:
            y, x = stack.pop(); c += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < small.shape[0] and 0 <= xx < small.shape[1] and small[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; stack.append((yy, xx))
        sizes[n] = c
    if n <= 1: return m, 0
    keep = Image.fromarray(((lab == max(sizes, key=sizes.get)) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    keep = np.asarray(keep.resize((w, h), Image.BILINEAR)).astype(float) / 255
    return m * keep, n - 1

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('sheet'); ap.add_argument('cutout'); ap.add_argument('out')
    ap.add_argument('--panel', required=True); ap.add_argument('--size', default='1296x2304'); ap.add_argument('--at')
    ap.add_argument('--clear', action='append', default=[])
    a = ap.parse_args()
    S = Image.open(a.sheet).convert('RGB'); A = Image.open(a.cutout)
    if A.mode != 'RGBA': raise SystemExit('CUTOUT must be RGBA (a background-removed image)')
    A = A.split()[-1].resize(S.size, Image.LANCZOS)
    x0, y0, x1, y1 = map(int, a.panel.split(','))
    P = np.asarray(S.crop((x0, y0, x1, y1))).astype(float); m = np.asarray(A.crop((x0, y0, x1, y1))).astype(float) / 255
    if m.max() < .5: raise SystemExit('no figure in that panel: check --panel against the cutout')
    bgc = np.median(P[m < .02].reshape(-1, 3), 0)                       # the backdrop colour around the figure(s)
    for c in a.clear:
        cx0, cy0, cx1, cy1 = map(int, c.split(',')); m = m.copy(); m[cy0:cy1, cx0:cx1] = 0
    m, dropped = main_figure(m)
    W, H = map(int, a.size.split('x')); h, w = m.shape
    X, Y = map(int, a.at.split(',')) if a.at else ((W - w) // 2, 0)
    if X < 0 or Y < 0 or X + w > W or Y + h > H: raise SystemExit(f'panel {w}x{h} at {X},{Y} does not fit a {W}x{H} canvas')
    C = np.ones((H, W, 3)) * bgc
    C[Y:Y + h, X:X + w] = P * m[..., None] + bgc * (1 - m[..., None])   # the figure blended onto the flat backdrop by its alpha
    Image.fromarray(np.clip(C, 0, 255).astype(np.uint8)).save(a.out + '-canvas.png'); np.save(a.out + '-mask.npy', m)
    Image.fromarray((m * 255).astype(np.uint8)).save(a.out + '-mask.png')                     # to look at before outpainting
    print(a.out + '-canvas.png', a.out + '-mask.npy', dict(backdrop=bgc.round().tolist(), at=f'{X},{Y}', cut=Y + h,
          room_below=H - (Y + h), other_pieces_dropped=dropped))

if __name__ == '__main__': main()
