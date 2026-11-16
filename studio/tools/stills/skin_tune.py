"""Nudge a character's skin colour on a sheet or still without touching the backdrop, the clothes or the hair: a hue
rotation and a chroma scale applied to the skin pixels only (inside the cutout's opaque part, warm mid-bright pixels in
the skin band), feathered at the mask's edge. Use it when one character's skin hue sits off the cast's
after the light match (say hue 138 against the cast's 118-126).
    .venv/bin/python tools/stills/skin_tune.py IN.png OUT.png [--cutout IN-cutout.png] [--hue -12] [--chroma 1.3] [--show MASK.jpg]
--hue is degrees added to the skin hue as skin_check.py measures it (atan2(Cr, Cb)); --chroma multiplies the skin's
distance from grey. Units and the skin mask follow skin_check.py so a run can be verified with it. Keep the nudges small
(a few degrees, up to about x1.4): a large one makes the face look painted. Local and free."""
import argparse, sys
import numpy as np
from PIL import Image, ImageFilter

KR, KB = 0.2126, 0.0722      # BT.709


def ycc(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = KR * r + (1 - KR - KB) * g + KB * b
    cb = 224 * (b - y) / 1.8556
    cr = 224 * (r - y) / 1.5748
    return y * 255, cb, cr


def rgb_from(y, cb, cr):
    y = y / 255
    b = y + cb * 1.8556 / 224
    r = y + cr * 1.5748 / 224
    g = (y - KR * r - KB * b) / (1 - KR - KB)
    return np.stack([r, g, b], axis=-1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--cutout', help='RGBA cutout of the same image; the skin mask stays inside its opaque part')
    ap.add_argument('--hue', type=float, default=0.0, help='degrees to add to the skin hue')
    ap.add_argument('--chroma', type=float, default=1.0, help='scale on the skin chroma')
    ap.add_argument('--band', default='95,160', help='hue band (degrees) that counts as skin')
    ap.add_argument('--show', help='write the mask as a greyscale image')
    A = ap.parse_args()
    im = Image.open(A.inp).convert('RGB'); rgb = np.asarray(im, np.float32) / 255
    y, cb, cr = ycc(rgb)
    chroma = np.hypot(cb, cr); hue = np.degrees(np.arctan2(cr, cb)) % 360
    lo, hi = (float(v) for v in A.band.split(','))
    mask = (chroma > 8) & (chroma < 70) & (hue > lo) & (hue < hi) & (y > 50) & (y < 240)
    if A.cutout:
        a = np.asarray(Image.open(A.cutout).convert('RGBA').getchannel('A').resize(im.size), np.float32) / 255
        mask &= a > 0.5
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    w = np.asarray(m, np.float32) / 255
    if A.show:
        m.save(A.show)
    ang = np.radians(A.hue)
    cb2 = (cb * np.cos(ang) - cr * np.sin(ang)) * A.chroma
    cr2 = (cb * np.sin(ang) + cr * np.cos(ang)) * A.chroma
    out = rgb_from(y, cb + (cb2 - cb) * w, cr + (cr2 - cr) * w)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(A.out)
    print(f'{A.out}: skin pixels {int(mask.sum())} ({100 * mask.mean():.1f}% of the frame), hue {A.hue:+.1f} deg, chroma x{A.chroma}')


if __name__ == '__main__':
    main()
