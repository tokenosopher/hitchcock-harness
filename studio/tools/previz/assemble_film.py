"""The whole film as one previz: every generation's latest take in the order given, stamped with generation + shot labels
(top left) and the dialogue as captions (bottom), joined into <film>/previz/film/<PREFIX>-previz-film-vN.mp4 (+ .json index), and
every generation's latest storyboard pages gathered into one PDF (<PREFIX>-storyboards-vN.pdf). A generation with no previz yet
gets a 2 s card. The frame's ratio (9:16 or 16:9), fps and the file prefix come from the film config (<film>/previz/film.json,
else brief.md and the folder name).
    .venv/bin/python tools/previz/assemble_film.py $FILM --generations G1,G2,...      (--blocks is the same flag)"""
import glob, json, os, re, subprocess, sys, tempfile, textwrap
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit.film import Film

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
FILM = sys.argv[1]; A = sys.argv[2:]
def opt(k, d=None): return A[A.index(k) + 1] if k in A and A.index(k) + 1 < len(A) else d
GL = opt('--generations') or opt('--blocks')
if not GL: sys.exit('assemble_film: give the generations in film order: --generations G1,G2,...\n' + __doc__)
BLOCKS = [g for g in GL.split(',') if g]
CFG = Film(FILM); PREFIX = CFG.prefix
(W, H), FPS = CFG.size(540), CFG.fps
WRAP = int(29 * W / 540); CARD_WRAP = int(24 * W / 540)
BOLD = lambda s: ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', s)
REG = lambda s: ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', s)
OUT = os.environ.get('PREVIZ_FILM_OUT') or os.environ.get('ASV_FILM_OUT') or os.path.join(FILM, 'previz', 'film'); os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix='previz-film-')


def latest(block):
    takes = glob.glob(os.path.join(FILM, 'previz', block, f'{block}-previz-take-*.mp4'))
    if not takes: return None, None
    n = max(int(re.search(r'take-(\d+)\.mp4$', t).group(1)) for t in takes)
    mp4 = os.path.join(FILM, 'previz', block, f'{block}-previz-take-{n}.mp4'); js = mp4[:-4] + '.json'
    return mp4, (json.load(open(js)) if os.path.exists(js) else {})


def windows(meta):
    """[(label, t0, t1)] from shot_plan if present, else from shots (first word of the name)."""
    if meta.get('shot_plan'):
        return [(str(s.get('label') or s.get('id')), float(s['t0']), float(s['t1'])) for s in meta['shot_plan']]
    out = []
    for s in meta.get('shots', []):
        lab = str(s.get('label') or s.get('id') or str(s.get('name', '')).split(' ')[0])
        out.append((lab, float(s['t0']), float(s['t1'])))
    return sorted(out, key=lambda w: w[1])


def lines(meta):
    L = []
    for l in meta.get('lines', []) or []:
        t = l.get('t') or [l.get('t0'), l.get('t1')]
        L.append((l.get('who', ''), l.get('text', ''), float(t[0]), float(t[1])))
    for k, t in (meta.get('lines_from_take1') or {}).items():   # S1 take 1's older format: timings only
        L.append((k.split(' ')[0].upper(), '', float(t[0]), float(t[1])))
    return L


def png_label(path, block, lab, t0, t1):
    im = Image.new('RGBA', (W - 24, 46), (0, 0, 0, 175)); d = ImageDraw.Draw(im)
    d.text((10, 8), f'{block} · SHOT {lab} · {t0:.1f}-{t1:.1f} s', font=BOLD(26), fill=(255, 230, 0, 255)); im.save(path)


def png_caption(path, who, text):
    body = textwrap.wrap(f'{who}: {text}' if text else f'{who} speaks', WRAP)
    h = 18 + 34 * len(body); im = Image.new('RGBA', (W - 40, h), (0, 0, 0, 170)); d = ImageDraw.Draw(im)
    for i, ln in enumerate(body): d.text((12, 9 + 34 * i), ln, font=REG(27), fill=(255, 255, 255, 255))
    im.save(path); return h


def card(path, text, secs=2.0):
    im = Image.new('RGB', (W, H), 'black'); d = ImageDraw.Draw(im)
    for i, ln in enumerate(textwrap.wrap(text, CARD_WRAP)): d.text((W // 2, H // 2 - 40 + 40 * i), ln, font=BOLD(32), fill=(220, 220, 220), anchor='mm')
    png = path[:-4] + '.png'; im.save(png)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', png, '-t', str(secs), '-r', str(FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path], check=True)


def stamp_block(i, block, mp4, meta):
    ins = ['-i', mp4]; fc = f'[0:v]scale={W}:{H},fps={FPS}[b0];'; prev = '[b0]'; n = 1
    for j, (lab, t0, t1) in enumerate(windows(meta)):
        p = os.path.join(TMP, f'{block}-l{j}.png'); png_label(p, block, lab, t0, t1); ins += ['-i', p]
        fc += f"{prev}[{n}:v]overlay=12:12:enable='between(t,{t0},{t1 - 0.001})'[v{n}];"; prev = f'[v{n}]'; n += 1
    for j, (who, text, t0, t1) in enumerate(lines(meta)):
        p = os.path.join(TMP, f'{block}-c{j}.png'); h = png_caption(p, who, text); ins += ['-i', p]
        fc += f"{prev}[{n}:v]overlay=20:{H - h - 60}:enable='between(t,{t0},{t1})'[v{n}];"; prev = f'[v{n}]'; n += 1
    out = os.path.join(TMP, f'{i:02d}-{block}.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc.rstrip(';'), '-map', prev, '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out], check=True)
    return out


def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip() or 0)


parts, index, t = [], [], 0.0
for i, b in enumerate(BLOCKS):
    mp4, meta = latest(b)
    if mp4:
        p = stamp_block(i, b, mp4, meta); src = os.path.relpath(mp4, FILM)
    else:
        p = os.path.join(TMP, f'{i:02d}-{b}.mp4'); card(p, f'{b}: previz not built yet'); src = None
    d = dur(p); parts.append(p); index.append(dict(block=b, start=round(t, 2), end=round(t + d, 2), source=src)); t += d
lst = os.path.join(TMP, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
v = 1
while os.path.exists(os.path.join(OUT, f'{PREFIX}-previz-film-v{v}.mp4')): v += 1
film = os.path.join(OUT, f'{PREFIX}-previz-film-v{v}.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', film], check=True)
json.dump(dict(version=v, duration=round(t, 2), blocks=index), open(film[:-4] + '.json', 'w'), indent=1)

# every block's latest storyboard pages, in order, as one PDF
pages = []
for b in BLOCKS:
    vers = sorted(glob.glob(os.path.join(FILM, 'previz', b, 'storyboard', 'v*')), key=lambda p: int(re.sub(r'\D', '', os.path.basename(p)) or 0))
    if vers: pages += sorted(glob.glob(os.path.join(vers[-1], 'page-*.png')), key=lambda p: int(re.search(r'page-(\d+)', p).group(1)))
if pages:
    ims = [Image.open(p).convert('RGB') for p in pages]
    pdf = os.path.join(OUT, f'{PREFIX}-storyboards-v{v}.pdf'); ims[0].save(pdf, save_all=True, append_images=ims[1:], resolution=150)
    print('wrote', pdf, len(pages), 'pages')
print('wrote', film, f'{t:.1f} s')
