"""Caption cards for the harness's cut render (src/server/edit/render.ts): one transparent PNG per cue and an ffmpeg
concat list that shows each card for exactly its cue (blank between), so the render overlays one stream instead of a
filter per cue. This ffmpeg has no drawtext, so the text is drawn here with PIL.

The style is the films' approved caption style, as the film repo's tools/release/burn_captions.py draws it (Poppins
Medium, champagne gold fill, thin dark outline and a soft shadow, centred, the block's bottom edge at 79% of the height,
46 px at 1080 wide, scaled with the width). The font is looked for under <studio>/assets/brand/fonts/ (or
<studio>/brand/fonts/), then Geist, then a system sans.

    python3 caption-cards.py JOB.json   (the app runs it with studio/.venv/bin/python)
JOB.json: {"width": 480, "height": 854, "duration": 179.3, "out_dir": "...", "font_roots": ["<film repo>"],
           "cues": [{"a": 1.2, "b": 3.4, "lines": ["…"]}]}
Writes out_dir/c000.png…, out_dir/blank.png and out_dir/list.txt; prints the list path."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

STYLE = dict(size=46, pos=0.79, fill=(246, 214, 128, 255), outline=(20, 14, 8, 255), stroke=3)
FALLBACKS = ['/Library/Fonts/Geist-Medium.ttf', os.path.expanduser('~/Library/Fonts/Geist-Medium.ttf'),
             '/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc',
             '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def find_font(roots):
    for r in roots:
        for sub in (('assets', 'brand'), ('brand',)):
            p = os.path.join(r, *sub, 'fonts', 'Poppins-Medium.ttf')
            if os.path.isfile(p):
                return p
    for p in FALLBACKS:
        if os.path.isfile(p):
            return p
    return None


def main():
    job = json.load(open(sys.argv[1]))
    W, H, out = int(job['width']), int(job['height']), job['out_dir']
    os.makedirs(out, exist_ok=True)
    k = W / 1080.0
    size = max(8, round(STYLE['size'] * k))
    path = find_font(job.get('font_roots', []))
    font = ImageFont.truetype(path, size) if path else ImageFont.load_default()
    lh = int(size * 1.22)
    stroke, sh_stroke = max(1, round(STYLE['stroke'] * k)), max(1, round(5 * k))
    sh_dy, blur = max(1, round(3 * k)), max(1, round(5 * k))

    def card(lines, p):
        y0 = int(H * STYLE['pos']) - lh * len(lines)
        shadow = Image.new('RGBA', (W, H))
        ds = ImageDraw.Draw(shadow)
        for i, l in enumerate(lines):
            ds.text((W / 2, y0 + i * lh + sh_dy), l, font=font, anchor='ma', fill=(0, 0, 0, 150), stroke_width=sh_stroke, stroke_fill=(0, 0, 0, 150))
        im = Image.alpha_composite(Image.new('RGBA', (W, H)), shadow.filter(ImageFilter.GaussianBlur(blur)))
        d = ImageDraw.Draw(im)
        for i, l in enumerate(lines):
            d.text((W / 2, y0 + i * lh), l, font=font, anchor='ma', fill=STYLE['fill'], stroke_width=stroke, stroke_fill=STYLE['outline'])
        im.save(p)

    def wrap(lines, maxw=0.84 * W):
        # a cue line wider than the safe width breaks at word boundaries into balanced lines
        out_lines = []
        for l in lines:
            if font.getlength(l) <= maxw:
                out_lines.append(l)
                continue
            words, n = l.split(), 2
            while True:
                per = max(1, -(-len(words) // n))
                rows = [' '.join(words[i:i + per]) for i in range(0, len(words), per)]
                if all(font.getlength(r) <= maxw for r in rows) or per == 1:
                    break
                n += 1
            out_lines += rows
        return out_lines

    blank = os.path.join(out, 'blank.png')
    Image.new('RGBA', (W, H)).save(blank)
    lst, t = [], 0.0
    for n, c in enumerate(sorted(job['cues'], key=lambda c: c['a'])):
        a, b = max(float(c['a']), t), float(c['b'])
        if b <= a:
            continue
        if a > t:
            lst += ["file '%s'" % blank, 'duration %.4f' % (a - t)]
        p = os.path.join(out, 'c%03d.png' % n)
        card(wrap([l for l in c['lines'] if l.strip()]), p)
        lst += ["file '%s'" % p, 'duration %.4f' % (b - a)]
        t = b
    lst += ["file '%s'" % blank, 'duration %.4f' % max(0.05, float(job['duration']) - t), "file '%s'" % blank]
    lp = os.path.join(out, 'list.txt')
    open(lp, 'w').write('\n'.join(lst) + '\n')
    print(lp)


if __name__ == '__main__':
    main()
