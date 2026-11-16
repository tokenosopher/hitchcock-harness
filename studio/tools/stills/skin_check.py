"""Skin-colour and backdrop-neutrality check for a film's character sheets or keyframes, against the target bands inlined
below (BANDS). Run it before a sheet is approved and again on the keyframes, before any video credit.
    .venv/bin/python tools/stills/skin_check.py [--stage sheet|keyframe|measure] [--cutouts DIR] [--who NAME] [--show OUT.jpg] FILE_OR_DIR ...
    .venv/bin/python tools/stills/skin_check.py --spec spec.json [--stage ...] [--show OUT.jpg]
Positional: image files, or folders (every .png/.jpg inside, not recursive). Character name = the token after the ID in
the filename (C03-agnes-ref.png -> agnes), or --who for every file given.
--spec: [{"who": "Agnes", "file": "...png", "skin": [[x0,x1,y0,y1], ...], "bg": [[x0,x1,y0,y1], ...]}, ...]
  boxes as fractions of the frame. Skin boxes on the key-lit cheeks, nose and forehead (no eyes, lips, hair, metal);
  bg boxes on plain backdrop (sheets; omit for keyframes). Boxes are the accurate route: the bands were set with them.
Without a spec the skin is found by a mask (warm, mid-bright pixels, not within 20 levels of the backdrop colour) in
the upper 45% of a sheet or the central window of a keyframe, inside the cutout's opaque part when --cutouts DIR holds
<ID>-<name>.png; then the half of those pixels with the most chroma stands in for the key-lit cheeks and forehead. The
backdrop is the top corners of each panel (3 panels when the image is wider than 1.5:1, else 1), or the cutout's
transparent part. The auto reading comes within about 2 chroma units of the boxes on sheets and
keyframes; Y' can differ more. Use auto to screen; use --spec with boxes to gate, and look at --show.
Units: BT.709 Y'CbCr from the gamma-coded picture, 8-bit video code units: Y' 0-255 (BT.709 weights), Cb and Cr as
224*(B'-Y')/1.8556 and 224*(R'-Y')/1.5748; chroma = hypot(Cb, Cr); hue = atan2(Cr, Cb) in degrees (skin sits near
121-130). Medians over the skin pixels. tools/finish/skin_survey.py (limited-range decode, means in a fixed window)
reads 3-10 units lower on the same faces: never compare the two.
--stage measure prints the numbers without judging them (for a reference film's frames).
Exit 1 if anything fails (sheet or keyframe stage), so it can sit in front of a spend. Local and free."""
import json, os, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BANDS = {  # the target bands, measured on approved character sheets and keyframes
    'sheet':    dict(chroma=(38, 50), hue=(121, 129), Y=(115, 155), ratio=0.80, bg_chroma=3.0, bg_Y=(110, 126), bg_Y_spread=6),
    'keyframe': dict(chroma=(47, 58), hue=(121, 130), Y=(110, 155), ratio=0.85),
    'measure':  None,
}
SHEET_FACE_ROWS = 0.45                                   # auto mode: heads live in the upper part of a sheet
KEYFRAME_WINDOW = (0.23, 0.77, 0.18, 0.57)               # x0, x1, y0, y1: tools/skin_survey.py's centre window
EXT = ('.png', '.jpg', '.jpeg', '.webp')


def ycc(path):
    """-> rgb 0-255 float, Y' 0-255, Cb, Cr (8-bit code units, offset from 128 removed)."""
    n = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255
    y = n @ np.array([.2126, .7152, .0722], np.float32)
    return n * 255, y * 255, 224 * (n[..., 2] - y) / 1.8556, 224 * (n[..., 0] - y) / 1.5748


def box_mask(shape, boxes):
    h, w = shape; m = np.zeros(shape, bool)
    for x0, x1, y0, y1 in boxes: m[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = True
    return m


def cutout_masks(path, shape):
    """Subject (opaque) and backdrop (transparent, a few px away from the subject) from an RGBA cutout."""
    a = Image.open(path).split()[-1].resize((shape[1], shape[0]), Image.LANCZOS)
    subj = np.asarray(a) > 128
    far = np.asarray(a.filter(ImageFilter.MaxFilter(15))) < 8              # transparent and not next to the subject
    return subj, far


def panel_corners(shape, panels):
    """Top corners of each panel, 2-10% of the height, 3-15% of the panel width in from each edge (sheet_light.py)."""
    h, w = shape; pw = w / panels; m = np.zeros(shape, bool); y0, y1 = int(h * .02), int(h * .10)
    for p in range(panels):
        m[y0:y1, int(p * pw + pw * .03):int(p * pw + pw * .15)] = True
        m[y0:y1, int((p + 1) * pw - pw * .15):int((p + 1) * pw - pw * .03)] = True
    return m


def skin_mask(rgb, Y, region):
    R, G, B = np.moveaxis(rgb, -1, 0)
    return region & (R > G) & (G > B) & (R - B > 25) & (Y > 60) & (Y < 200)


def measure(e, stage, cutouts=None):
    rgb, Y, cb, cr = ycc(e['file']); shape = Y.shape
    cut = None
    if cutouts and not e.get('skin'):
        stem = os.path.basename(e['file']); m = re.match(r'([A-Z]\d+-[a-z0-9]+)', stem)
        cand = os.path.join(cutouts, (m.group(1) if m else stem.rsplit('.', 1)[0]) + '.png')
        cut = cutout_masks(cand, shape) if os.path.exists(cand) else None
    portrait = shape[0] > shape[1]
    bg = None
    if e.get('bg'): bg = box_mask(shape, e['bg'])
    elif stage == 'sheet' or (stage == 'measure' and not portrait):
        bg = cut[1] if cut else panel_corners(shape, 3 if shape[1] / shape[0] > 1.5 else 1)
    if e.get('skin'):
        region, how = box_mask(shape, e['skin']), 'boxes'
    elif stage == 'keyframe' or (stage == 'measure' and portrait):
        region, how = box_mask(shape, [KEYFRAME_WINDOW]), 'centre window'
    else:
        region = np.zeros(shape, bool); region[:int(shape[0] * SHEET_FACE_ROWS)] = True; how = 'upper 45%'
        if cut: region &= cut[0]; how += ' of cutout'
    sk = skin_mask(rgb, Y, region)
    if not e.get('skin'):                                    # auto: drop backdrop-coloured pixels, keep the richer half
        if bg is not None and bg.sum() > 100: sk &= np.abs(rgb - rgb[bg].mean(0)).max(-1) > 20
        if sk.sum() >= 200: sk &= np.hypot(cb, cr) >= np.percentile(np.hypot(cb, cr)[sk], 50)
        how += ', richer half'
    if sk.sum() < 200: return dict(error=f'only {int(sk.sum())} skin pixels found ({how})'), sk, None
    out = dict(Y=float(np.median(Y[sk])), chroma=float(np.median(np.hypot(cb[sk], cr[sk]))),
               hue=float(np.median(np.degrees(np.arctan2(cr[sk], cb[sk])))), n=int(sk.sum()), how=how,
               rgb=[int(round(v)) for v in np.median(rgb[sk], 0)])
    if bg is not None and bg.sum() > 100:
        mc = rgb[bg].mean(0); b, r = float(cb[bg].mean()), float(cr[bg].mean())
        out.update(bg_Y=float(Y[bg].mean()), bg_chroma=float(np.hypot(b, r)), bg_rgb=[int(round(v)) for v in mc],
                   bg_spread=int(round(mc.max() - mc.min())))
    return out, sk, bg


def who_of(path, who, stage):
    if who: return who
    if stage == 'measure': return 'all'                      # a reference's frames: one band for the whole film
    m = re.match(r'[A-Z]\d+-([a-z0-9]+)', os.path.basename(path))
    return m.group(1) if m else os.path.basename(path).rsplit('.', 1)[0]


def expand(args):
    for a in args:
        if os.path.isdir(a):
            for f in sorted(os.listdir(a)):
                if f.lower().endswith(EXT): yield os.path.join(a, f)
        else: yield a


def contact(entries, out):
    """One tile per image: the picture with non-measured pixels dimmed, the skin and backdrop swatches, the numbers."""
    font = ImageFont.load_default(); tiles = []
    for e, m, sk, bg in entries:
        im = Image.open(e['file']).convert('RGB'); W = 360; H = max(1, int(im.size[1] * W / im.size[0]))
        a = np.asarray(im.resize((W, H), Image.BILINEAR), np.float32)
        keep = np.asarray(Image.fromarray(sk.astype(np.uint8) * 255).resize((W, H), Image.BILINEAR)) > 64
        if bg is not None: keep |= np.asarray(Image.fromarray(bg.astype(np.uint8) * 255).resize((W, H), Image.BILINEAR)) > 64
        a[~keep] *= 0.3; tile = Image.new('RGB', (W, H + 56), (24, 24, 24)); tile.paste(Image.fromarray(a.astype(np.uint8)), (0, 0))
        d = ImageDraw.Draw(tile)
        if 'rgb' in m: d.rectangle([0, H + 2, 50, H + 52], fill=tuple(m['rgb']))
        if 'bg_rgb' in m: d.rectangle([54, H + 2, 104, H + 52], fill=tuple(m['bg_rgb']))
        txt = f"{e['who']}  {os.path.basename(e['file'])}\n" + (m['error'] if 'error' in m else
              f"skin Y{m['Y']:.0f} C{m['chroma']:.1f} h{m['hue']:.1f} ({m['how']})" +
              (f"\nbg Y{m['bg_Y']:.0f} C{m['bg_chroma']:.1f} RGB{tuple(m['bg_rgb'])}" if 'bg_Y' in m else ''))
        d.multiline_text((110, H + 4), txt, fill=(235, 235, 235), font=font); tiles.append(tile)
    cols = min(3, len(tiles)); rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    heights = [max(t.size[1] for t in r) + 4 for r in rows]
    sheet = Image.new('RGB', (cols * 364, sum(heights)), (24, 24, 24)); y = 0
    for r, hgt in zip(rows, heights):
        for i, t in enumerate(r): sheet.paste(t, (i * 364, y))
        y += hgt
    sheet.save(out, quality=88); print('contact sheet:', out)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
    argv = sys.argv[1:]
    def opt(name, default=None):
        if name in argv:
            i = argv.index(name); v = argv[i + 1]; del argv[i:i + 2]; return v
        return default
    stage = opt('--stage', 'sheet'); cutouts = opt('--cutouts'); who = opt('--who'); show = opt('--show'); spec = opt('--spec')
    if stage not in BANDS: sys.exit(f'--stage must be one of {list(BANDS)}')
    if spec: entries = json.load(open(spec))
    else: entries = [dict(who=who_of(f, who, stage), file=f) for f in expand(argv)]
    if not entries: sys.exit(__doc__)
    T = BANDS[stage]; bad = []; per = {}; shown = []
    if T:
        print(f"target ({stage}): skin chroma {T['chroma'][0]}-{T['chroma'][1]}, hue {T['hue'][0]}-{T['hue'][1]}, Y {T['Y'][0]}-{T['Y'][1]}; "
              f"palest >= {T['ratio']} x richest" + (f"; backdrop chroma <= {T['bg_chroma']}, Y {T['bg_Y'][0]}-{T['bg_Y'][1]}, "
              f"sheets within {T['bg_Y_spread']} levels" if 'bg_chroma' in T else ''))
    for e in entries:
        m, sk, bg = measure(e, stage, cutouts); shown.append((e, m, sk, bg)); name = os.path.basename(e['file'])
        if 'error' in m: print(f"{e['who']:8s} {name:28s} {m['error']}"); bad.append((e['who'], 'no skin')); continue
        per.setdefault(e['who'], []).append(m); flag = []
        if T:
            flag = [k for k in ('chroma', 'hue', 'Y') if not T[k][0] <= m[k] <= T[k][1]]
            if 'bg_chroma' in m and 'bg_chroma' in T and m['bg_chroma'] > T['bg_chroma']: flag.append('bg not neutral')
            if 'bg_Y' in m and 'bg_Y' in T and not T['bg_Y'][0] <= m['bg_Y'] <= T['bg_Y'][1]: flag.append('bg level')
        print(f"{e['who']:8s} {name:28s} skin Y{m['Y']:4.0f} C{m['chroma']:5.1f} h{m['hue']:6.1f}  RGB{tuple(m['rgb'])}"
              + (f"  bg Y{m['bg_Y']:4.0f} C{m['bg_chroma']:4.1f} RGB{tuple(m['bg_rgb'])}" if 'bg_Y' in m else '')
              + f"  [{m['n']} px, {m['how']}]" + ('  FAIL ' + ', '.join(flag) if flag else ('  ok' if T else '')))
        bad += [(e['who'], f) for f in flag]
    if per:
        cast = {w: float(np.median([m['chroma'] for m in v])) for w, v in per.items()}
        hues = {w: float(np.median([m['hue'] for m in v])) for w, v in per.items()}
        lo, hi = min(cast.values()), max(cast.values())
        print('cast skin chroma:', {w: round(c, 1) for w, c in cast.items()}, ' hue:', {w: round(h, 1) for w, h in hues.items()},
              f' palest/richest {lo / hi:.2f}' + (f' (need >= {T["ratio"]})' if T else ''))
        if T:
            if lo / hi < T['ratio']: bad.append(('cast', 'spread'))
            mid = sum(T['chroma']) / 2
            for w, c in cast.items():          # the video keeps a keyframe's skin colour (-4 to -7%), so fix it on the still
                if not T['chroma'][0] <= c <= T['chroma'][1] or c < T['ratio'] * hi:
                    print(f"  {w}: chroma {c:.1f} -> saturation x{mid / c:.2f} on the still (or relight / re-prompt) before it reaches video")
            if all(c < T['chroma'][0] for c in cast.values()):
                print('  whole cast below the band: a neutral-lit sheet reads lower than the sheets the bands came from; '
                      'keep the ratio, and let the keyframe check decide')
            bgs = [m['bg_Y'] for v in per.values() for m in v if 'bg_Y' in m]
            if bgs and 'bg_Y_spread' in T and max(bgs) - min(bgs) > T['bg_Y_spread']:
                print(f'backdrop levels differ by {max(bgs) - min(bgs):.0f} (> {T["bg_Y_spread"]}): the sheets were not lit as one shoot'); bad.append(('bg', 'spread'))
    if show: contact(shown, show)
    if T: print('RESULT:', 'FAIL ' + str(sorted(set(bad))) if bad else 'PASS')
    sys.exit(1 if (T and bad) else 0)


if __name__ == '__main__':
    main()
