"""Storyboard pages from previz panels (3300x2550 landscape, a layout note on page 1, per panel a title,
a camera line, the frame and a caption, a footer). Three panels a page, one row. The footer is one fixed line on
every page; board.json carries none.
The frame's ratio (9:16 or 16:9) comes from the film config (<film>/previz/film.json or brief.md; the film is the folder above
previz/, or --film), else from board.json's "ratio", else from the first panel image; the header, when board.json has none, from the
film's title. Reads <dir>/board.json + <dir>/panels.json, writes <dir>/page-N.png.
    .venv/bin/python tools/previz/storyboard.py $FILM/previz/<G>/storyboard/v2 [--film $FILM]"""
import sys, os, json, textwrap, re
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit.film import Film, find_film, RATIOS
if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
D = sys.argv[1]; B = json.load(open(os.path.join(D, 'board.json'))); P = json.load(open(os.path.join(D, 'panels.json')))
FD = sys.argv[sys.argv.index('--film') + 1] if '--film' in sys.argv else find_film(D)
FILM = Film(FD) if FD and os.path.isdir(FD) else None
if FILM: AW, AH = FILM.aspect
elif B.get('ratio') in RATIOS: AW, AH = RATIOS[B['ratio']]
else: AW, AH = Image.open(os.path.join(D, P[0]['file'])).size
W, H, M = 3300, 2550, 150; COLS = 3; PW = 840 if AH > AW else 960; PH = int(round(PW * AH / float(AW)))
WRAP_CAM, WRAP_CAP = (48, 50) if PW <= 840 else (55, 57)
if 'header' not in B: B['header'] = 'PROJECT: %s' % (FILM.title.upper() if FILM else os.path.basename(FD or D).upper())
REG = lambda s: ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', s)
BOLD = lambda s: ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', s)
FOOTER = ("3D previz: mannequins and placeholder models. Follow each panel's composition, placement, camera angle, screen direction and action; "
          "every look comes from the reference images.")
cap = {c['n']: c for c in B['captions']}; shots = {str(s['shot']): s for s in B['shots']}
pages = [P[i:i + COLS] for i in range(0, len(P), COLS)]
for pi, panels in enumerate(pages, 1):
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    d.text((M, 70), B['header'], font=REG(40), fill='black'); d.text((W - M, 70), f'PAGE {pi} OF {len(pages)}', font=REG(40), fill='black', anchor='ra')
    y0 = 180
    if pi == 1 and B.get('layout_note'):   # optional: the pages stay simple (the layout is in the prompt)
        for line in textwrap.wrap(B['layout_note'], 150): d.text((M, y0), line, font=REG(30), fill='black'); y0 += 40
        y0 += 30
    cw = (W - 2 * M) // COLS
    for i, p in enumerate(panels):
        x = M + i * cw + (cw - PW) // 2; y = y0; s = shots[str(p['shot'])]
        d.text((x, y), f"{p['n']}   SHOT {p['shot']}", font=BOLD(44), fill='black')
        for k_, line in enumerate(textwrap.wrap(s['camera'], WRAP_CAM)): d.text((x, y + 60 + k_ * 34), line, font=BOLD(27), fill=(90, 90, 90))
        fy = y + 135
        fr = Image.open(os.path.join(D, p['file'])).convert('RGB').resize((PW, PH)); im.paste(fr, (x, fy)); d.rectangle([x - 1, fy - 1, x + PW, fy + PH], outline='black', width=2)
        ty = fy + PH + 24
        caption = re.sub(r'^\s*\d+(?:\.\d+)?\s*s\.\s*', '', cap[p['n']]['caption'])  # no clip time on a panel: panels are numbered by shot, not by second
        for line in textwrap.wrap(caption, WRAP_CAP): d.text((x, ty), line, font=REG(31), fill='black'); ty += 40
    for k_, line in enumerate(textwrap.wrap(FOOTER, 210)): d.text((M, H - 110 + k_ * 32), line, font=REG(24), fill=(70, 70, 70))
    im.save(os.path.join(D, f'page-{pi}.png')); print('page', pi, [p['n'] for p in panels])
