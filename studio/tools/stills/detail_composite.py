"""Base skin + edited details. A base still (natural skin) is edited to add details (Seedream 5.5 on Higgsfield); the edit
also re-renders the skin a little sharper. Both images are pixel-aligned, so this keeps the base everywhere and takes the
edit's pixels only where the edit really changed something (the added details), found by a blurred difference mask, grown and
feathered. Optional fixes move or copy a round detail by hand when the model will not:
    .venv/bin/python tools/stills/detail_composite.py BASE.png EDIT.png OUT.png [--thresh 22] [--grow 6] [--feather 4]
        [--erase x,y,r]... [--copy sx,sy,sr:dx,dy,dr[,squash]]... [--mask-out MASK.png]
--erase: paste the BASE back over a disc (removes a detail the edit put in the wrong place).
--copy:  copy the disc at (sx,sy,sr) of the composite to (dx,dy) scaled to radius dr; squash < 1 narrows it horizontally
         (a detail on a temple that is turned away from the camera)."""
import argparse
import numpy as np
from PIL import Image, ImageFilter

def disc(shape, x, y, r, soft=2.0):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return np.clip((r - np.hypot(xx - x, yy - y)) / soft + 0.5, 0, 1)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('base'); ap.add_argument('gpt', metavar='EDIT'); ap.add_argument('out')
    ap.add_argument('--thresh', type=float, default=22); ap.add_argument('--grow', type=int, default=6); ap.add_argument('--feather', type=float, default=4)
    ap.add_argument('--erase', action='append', default=[]); ap.add_argument('--copy', action='append', default=[]); ap.add_argument('--mask-out')
    ap.add_argument('--region', action='append', default=[], help='x0,y0,x1,y1: only take edit pixels inside these boxes (any number)')
    ap.add_argument('--close', type=int, default=0, help='fill holes in the mask: closing radius in pixels (done at 1/4 size)')
    a = ap.parse_args()
    BI = Image.open(a.base).convert('RGB'); B = np.asarray(BI).astype(float); W0, H0 = BI.size
    GI = Image.open(a.gpt).convert('RGB'); GI = GI.resize((W0, round(GI.height * W0 / GI.width)), Image.LANCZOS)   # match widths, keep its aspect
    if GI.height != H0:                                                         # the edit came back at a slightly different aspect:
        g = np.asarray(GI.convert('L')).astype(float)[:, ::4]; b = np.asarray(BI.convert('L')).astype(float)[:, ::4]   # find the vertical offset
        span = GI.height - H0
        offs = range(min(0, span) - 8, max(0, span) + 9)
        def err(o):
            ys = max(0, o); yb = max(0, -o); n = min(H0 - yb, GI.height - ys)
            return np.abs(g[ys:ys + n] - b[yb:yb + n]).mean()
        o = min(offs, key=err); canvas = Image.new('RGB', (W0, H0)); canvas.paste(GI, (0, -o)); GI = canvas
        print(f'aligned the edit: height {GI.height}, vertical offset {o} px')
    G = np.asarray(GI).astype(float)
    blur = lambda x, r: np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float)
    d = np.abs(blur(G, 2) - blur(B, 2)).max(2)                                   # colour change, ignoring fine-grain re-rendering
    m = (d > a.thresh).astype(np.uint8) * 255
    m = Image.fromarray(m).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(2 * a.grow + 1))   # drop specks, grow
    if a.region:                                                                  # keep the mask only inside the given boxes
        R = np.zeros(m.size[::-1], np.uint8)
        for r in a.region: x0, y0, x1, y1 = map(int, r.split(',')); R[y0:y1, x0:x1] = 255
        m = Image.fromarray(np.minimum(np.asarray(m), R))
    if a.close:                                                                   # closing at quarter size: fills the holes a subtle change leaves
        q = m.resize((m.size[0] // 4, m.size[1] // 4), Image.BILINEAR); k = 2 * max(1, a.close // 4) + 1
        q = q.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)); m = Image.fromarray(np.maximum(np.asarray(m), np.asarray(q.resize(m.size, Image.BILINEAR))))
        if a.region: m = Image.fromarray(np.minimum(np.asarray(m), R))
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(a.feather))).astype(float)[..., None] / 255
    C = B * (1 - m) + G * m
    for c in a.copy:
        src, dst = c.split(':'); sx, sy, sr = map(float, src.split(',')); dv = list(map(float, dst.split(','))); dx, dy, dr = dv[:3]; sq = dv[3] if len(dv) > 3 else 1.0
        S = Image.fromarray(np.clip(C, 0, 255).astype(np.uint8)).crop((int(sx - sr), int(sy - sr), int(sx + sr), int(sy + sr)))
        w, h = max(2, int(2 * dr * sq)), int(2 * dr); S = np.asarray(S.resize((w, h), Image.LANCZOS)).astype(float)
        k = np.asarray(Image.fromarray((disc((int(2 * sr), int(2 * sr)), sr, sr, sr - 1, 1.5) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(float)[..., None] / 255
        x0, y0 = int(dx - w / 2), int(dy - h / 2); C[y0:y0 + h, x0:x0 + w] = C[y0:y0 + h, x0:x0 + w] * (1 - k) + S * k
    for e in a.erase:
        x, y, r = map(float, e.split(',')); k = disc(B.shape, x, y, r, 3)[..., None]; C = C * (1 - k) + B * k
    Image.fromarray(np.clip(C, 0, 255).astype(np.uint8)).save(a.out)
    if a.mask_out: Image.fromarray((m[..., 0] * 255).astype(np.uint8)).save(a.mask_out)
    print(a.out, f'edit pixels used: {m.mean() * 100:.1f}% of the frame')

if __name__ == '__main__': main()
