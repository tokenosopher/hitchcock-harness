"""Match the studio lighting of character references to a reference sheet, so the video model sees one shoot.
Matches the light, not the people, in this order (the code's order; doing white balance second keeps it from being
undone): (1) the black level; (2) the light colour, read from the plain backdrop (lit by the same light as the face) and
corrected to the reference's; (3) the backdrop brightness, applied to the backdrop only, so faces keep their own tone.
    .venv/bin/python tools/stills/match_light.py REF.png IN.png OUT.png [--strength 1.0] [--cutout CUT.png] [--ref-cutout CUT.png]
--cutout: an RGBA cutout of IN (subject opaque, e.g. from a background remover); the backdrop is its transparent part.
Without it the backdrop is found by flood fill, which leaks into subjects coloured like the backdrop (porcelain)."""
import sys
import numpy as np
from PIL import Image, ImageFilter

def backdrop_mask(a, tol=30):
    """Pixels connected to the border whose colour is close to the border's (a smooth studio backdrop)."""
    H, W = a.shape[:2]; small = np.asarray(Image.fromarray(a.astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR)).astype(float)
    h, w = small.shape[:2]; border = np.concatenate([small[0], small[-1], small[:, 0], small[:, -1]])
    # local tolerance: compare each pixel with a heavily blurred copy of the image near the border colour
    ref = np.median(border, 0); close = np.linalg.norm(small - ref, axis=2) < tol * 1.6
    seen = np.zeros((h, w), bool); stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if seen[y, x] or not close[y, x]: continue
        seen[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not seen[yy, xx]: stack.append((yy, xx))
    m = Image.fromarray((seen * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
    return np.asarray(m).astype(float)[..., None] / 255

def stats(a, m):
    bg = (a * m).reshape(-1, 3).sum(0) / max(m.sum(), 1); Y = a.mean(2)
    return bg, np.percentile(Y, 1.5)

def cut_mask(path, shape):
    a = Image.open(path).split()[-1].resize((shape[1], shape[0]), Image.LANCZOS)
    a = a.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(3))   # reach a few px into the edge: the old backdrop's glow sits there
    return 1 - np.asarray(a).astype(float)[..., None] / 255

def match(ref, src, strength=1.0, cut=None, refcut=None):
    mr = cut_mask(refcut, ref.shape) if refcut else backdrop_mask(ref)
    ms = cut_mask(cut, src.shape) if cut else backdrop_mask(src)
    (bgr, br), (bgs, bs) = stats(ref, mr), stats(src, ms)
    out = (src - bs) / (255 - bs) * (255 - br) + br if strength else src.copy()         # black level first...
    bgs = (out * ms).reshape(-1, 3).sum(0) / max(ms.sum(), 1)
    wb = (bgr / bgr.mean()) / (bgs / bgs.mean()); wb = 1 + (wb - 1) * strength          # ...then the light colour, so it stays matched
    out = out * wb
    bg_now = (out * ms).reshape(-1, 3).sum(0) / max(ms.sum(), 1)
    k = 1 + (bgr.mean() / bg_now.mean() - 1) * strength                                  # backdrop brightness, backdrop only
    out = out * (1 - ms) + out * k * ms
    return np.clip(out, 0, 255), dict(white_balance=wb.round(3), black=(round(bs, 1), round(br, 1)), backdrop_gain=round(float(k), 3),
                                      backdrop_mask=round(float(ms.mean()), 3))

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
    refp, inp, outp = sys.argv[1:4]; s = float(sys.argv[sys.argv.index('--strength') + 1]) if '--strength' in sys.argv else 1.0
    ref = np.asarray(Image.open(refp).convert('RGB')).astype(float); src = np.asarray(Image.open(inp).convert('RGB')).astype(float)
    cut = sys.argv[sys.argv.index('--cutout') + 1] if '--cutout' in sys.argv else None
    refcut = sys.argv[sys.argv.index('--ref-cutout') + 1] if '--ref-cutout' in sys.argv else None
    out, info = match(ref, src, s, cut, refcut); Image.fromarray(out.astype(np.uint8)).save(outp); print(outp, info)
