"""Extend a cut-off figure with an outpaint while keeping the original figure's pixels. The outpaint redraws everything it
is given (face, hands, grain), so its result is aligned back onto the canvas (scale and offset, searched on the figure),
colour-matched on the backdrop, and the original figure is laid over it through its alpha mask. Near the bottom edge
of the original crop the original fades out over --fade px, so the outpaint's continuation takes over without a seam.
    .venv/bin/python tools/stills/extend_figure.py CANVAS.png MASK.npy OUTPAINT.png OUT.png --at X,Y [--fade 24] [--blend 300] [--cut Y]
MASK.npy: the figure alpha (0..1) of the original crop, placed at X,Y on the canvas. --cut: canvas y where the
original crop ends (default: Y + mask height). OUT has the outpaint's frame, scaled to the figure.
CANVAS and MASK.npy come from figure_canvas.py; OUTPAINT.png is the outpaint of CANVAS (Seedream 5.5 on Higgsfield)."""
import argparse
import numpy as np
from PIL import Image, ImageFilter

def gray(a): return a @ np.array([.299, .587, .114])

def silhouette(a, bgc, tol=28):
    """Figure pixels: far from the backdrop colour (porcelain is lighter, hair is copper), cleaned up."""
    m = (np.linalg.norm(a - bgc, axis=2) > tol).astype(np.uint8) * 255
    return np.asarray(Image.fromarray(m).filter(ImageFilter.MedianFilter(5))) > 127

def clean_plate(a, sil):
    """The backdrop alone: the figure (silhouette, grown) filled from the surrounding backdrop, coarse to fine."""
    bgm = 1 - np.asarray(Image.fromarray(sil.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(13))).astype(float) / 255
    out = a.copy(); done = bgm > .5
    for r in (12, 40, 120):
        w = np.asarray(Image.fromarray((bgm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float) / 255
        f = np.stack([np.asarray(Image.fromarray(np.clip(a[..., c] * bgm, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float)
                      for c in range(3)], -1) / np.maximum(w, 1e-3)[..., None]
        put = ~done & (w > .05); out[put] = f[put]; done |= put
    return out

def warp_rows(a, y0, cut, L, src_edges, dst_edges):
    """Stretch rows horizontally so the figure's edges at the cut (src) land on the original's (dst); full shift down to
    the cut, easing out over L rows below it."""
    out = a.copy(); W = a.shape[1]; xs = np.arange(W, dtype=float)
    for y in range(max(0, y0), min(a.shape[0], cut + L)):
        t = 1.0 if y <= cut else 1 - (y - cut) / L; w = t * t * (3 - 2 * t)
        tgt = [0] + [s + w * (d - s) for s, d in zip(src_edges, dst_edges)] + [W - 1]
        src = np.interp(xs, tgt, [0] + list(src_edges) + [W - 1])
        out[y] = np.stack([np.interp(src, xs, a[y, :, c]) for c in range(3)], -1)
    return out

def align(canvas, gpt, m, cut, bgc):
    """Best scale and offset of GPT onto the canvas: silhouette overlap (IoU) above the crop edge at 1/4 size,
    then a fine intensity search at full size around it."""
    H, W = canvas.shape[:2]; q = 4; tgt = (m > .5)[:cut - 30:q, ::q]; best = None
    sg = silhouette(gpt, bgc)
    for s in np.linspace(.85, 1.5, 131) * W / gpt.shape[1]:
        g = np.asarray(Image.fromarray(sg.astype(np.uint8) * 255).resize((round(gpt.shape[1] * s / q), round(gpt.shape[0] * s / q)), Image.BILINEAR)) > 127
        gp = np.pad(g, 60)
        for dy in range(-50, 51):
            for dx in range(-50, 51):
                win = gp[60 + dy:60 + dy + tgt.shape[0], 60 + dx:60 + dx + tgt.shape[1]]
                if win.shape != tgt.shape: continue
                iou = (win & tgt).sum() / max((win | tgt).sum(), 1)
                if best is None or iou > best[0]: best = (iou, s, dx * q, dy * q)
    iou, s0, dx0, dy0 = best; cg = gray(canvas); ys, xs = np.nonzero(m[:cut - 30] > .5); sel = (ys[::5], xs[::5]); fine = None
    for s in s0 * np.linspace(.99, 1.01, 9):
        g = gray(np.asarray(Image.fromarray(gpt.astype(np.uint8)).resize((round(gpt.shape[1] * s), round(gpt.shape[0] * s)), Image.LANCZOS)).astype(float))
        for dy in range(dy0 - 8, dy0 + 9):
            for dx in range(dx0 - 8, dx0 + 9):
                yy, xx = sel[0] + dy, sel[1] + dx
                ok = (yy >= 0) & (yy < g.shape[0]) & (xx >= 0) & (xx < g.shape[1])
                e = np.abs(g[yy[ok], xx[ok]] - cg[sel[0][ok], sel[1][ok]]).mean()
                if fine is None or e < fine[0]: fine = (e, s, dx, dy)
    return fine + (round(float(iou), 3),)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('canvas'); ap.add_argument('mask'); ap.add_argument('gpt', metavar='OUTPAINT'); ap.add_argument('out')
    ap.add_argument('--at', required=True); ap.add_argument('--fade', type=int, default=24); ap.add_argument('--cut', type=int); ap.add_argument('--blend', type=int, default=300)
    a = ap.parse_args(); X, Y = map(int, a.at.split(','))
    C = np.asarray(Image.open(a.canvas).convert('RGB')).astype(float); G = np.asarray(Image.open(a.gpt).convert('RGB')).astype(float)
    fm = np.load(a.mask); M = np.zeros(C.shape[:2]); M[Y:Y + fm.shape[0], X:X + fm.shape[1]] = fm
    cut = a.cut or Y + fm.shape[0]; bgc = np.median(C[M < .02].reshape(-1, 3), 0)
    e, s, dx, dy, iou = align(C, G, M, cut, bgc)
    # The output keeps GPT's whole frame (it may have drawn the figure larger than the canvas allows), at the figure's scale.
    A = np.asarray(Image.fromarray(G.astype(np.uint8)).resize((round(G.shape[1] * s), round(G.shape[0] * s)), Image.LANCZOS)).astype(float)
    gh, gw = A.shape[:2]; h, w = C.shape[:2]                                   # canvas (x, y) sits at GPT (x + dx, y + dy)
    Cg = np.zeros_like(A); Mg = np.zeros((gh, gw)); valid = np.zeros((gh, gw), bool)
    y0, x0 = max(0, dy), max(0, dx); y1, x1 = min(gh, h + dy), min(gw, w + dx)
    Cg[y0:y1, x0:x1] = C[y0 - dy:y1 - dy, x0 - dx:x1 - dx]; Mg[y0:y1, x0:x1] = M[y0 - dy:y1 - dy, x0 - dx:x1 - dx]; valid[y0:y1, x0:x1] = True
    cut += dy; yy = np.arange(gh)[:, None]
    bg = valid & (Mg < .02) & (yy < cut)                                       # the backdrop the two share
    bg = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(15))) > 0
    gain = Cg[bg].mean(0) / A[bg].mean(0); A = A * gain
    # Edges of the figure just above the cut, original vs GPT: GPT's continuation is warped to meet the original's.
    rows = range(cut - 8, cut); sil = silhouette(A, bgc)
    oe = [np.median([np.nonzero(Mg[r] > .5)[0].min() for r in rows]), np.median([np.nonzero(Mg[r] > .5)[0].max() for r in rows])]
    ge = [np.median([np.nonzero(sil[r])[0].min() for r in rows]), np.median([np.nonzero(sil[r])[0].max() for r in rows])]
    A = warp_rows(A, cut - a.fade, cut, a.blend, ge, oe); sil = silhouette(A, bgc)
    # The canvas holds the figure already blended onto a flat backdrop by the mask; un-blend it so edges are not matted twice.
    F = (Cg - (1 - Mg[..., None]) * bgc) / np.maximum(Mg, .05)[..., None]
    upper = clean_plate(A, sil) * (1 - Mg[..., None]) + F * Mg[..., None]      # above the cut: only the original figure
    f = np.clip((cut - yy) / a.fade, 0, 1)[..., None]                          # ...handing over to GPT across the cut
    out = upper * f + A * (1 - f)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(a.out)
    fig = (Mg > .5) & (yy < cut - a.fade)
    print(a.out, dict(size=(gw, gh), iou=iou, err=round(e, 2), scale=round(s, 4), dx=dx, dy=dy, gain=gain.round(3),
                      edges=dict(original=oe, gpt=ge), figure_diff=round(float(np.abs(gray(A) - gray(Cg))[fig].mean()), 2)))

if __name__ == '__main__': main()
