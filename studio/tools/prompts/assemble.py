"""Assemble a block's Seedance 2.5 prompt (Flow v3.3 - 6 Scene prompts, steps 12 and 13) from what already exists, and write its media list.
    .venv/bin/python tools/prompts/assemble.py <film> <block> [--version vN]
Sources (nothing here is typed twice):
  blocks/<B>/<B>-scene.md         the shots (the *Builder* lines and the kit's *Previz numbers* lines dropped) and the ACTING TASKS
  previz/<B>/storyboard/<latest>  the panels per shot (PANELS a TO b) and the pages
  previz/<B>/<B>-previz-take-N    the block's length (the check script compares the shot list and the duration against it; no per-second timings)
  blocks/<B>/<B>-prompt-spec.md   the hand-written parts: ## MEDIA (one reference per line: KIND | TAG | file | description; KIND is VIDEO, IMAGE, VIEW (a location view) or AUDIO),
                                  ## TAGS (tags described in words, each pointing at a reference), and the sections of `order` below
                                  (SCENE CONTEXT, LOCATION MAP, ..., POSITIVE CONSTRAINTS, FIGHT STYLE LOCK); check.py stops on any other
                                  ## section, because this script would drop its text
Writes blocks/<B>/prompt/<B>-prompt-<v>.txt and <B>-media-<v>.json (ordered media, roles, reference numbers, generation settings).
The generation folder is generations/<B>/ when it exists, else blocks/<B>/ (and prompt-common.md the same way).
Reference numbers count per kind in MEDIA order (VIDEO REFERENCE n, IMAGE REFERENCE n, AUDIO REFERENCE n), as Seedance numbers them;
the storyboard pages are added after the other images. {VIDEO:TAG} / {IMAGE:TAG} / {AUDIO:TAG} in any spec text become that tag's
'VIDEO REFERENCE n' etc."""
import glob, json, math, os, re, sys

if len(sys.argv) < 3 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0)
FILM, B = sys.argv[1], sys.argv[2]; A = sys.argv[3:]
VER = A[A.index('--version') + 1] if '--version' in A else 'v1'
GROOT = next((r for r in ('generations', 'blocks') if os.path.isdir(os.path.join(FILM, r, B))), 'generations' if os.path.isdir(os.path.join(FILM, 'generations')) else 'blocks')
BD = os.path.join(FILM, GROOT, B); OUT = os.path.join(BD, 'prompt'); os.makedirs(OUT, exist_ok=True)
ROLE = {'VIDEO': 'video_references', 'IMAGE': 'image_references', 'AUDIO': 'audio_references'}


def sections(text, level='## '):
    out, cur = {}, None
    for ln in text.splitlines():
        if ln.startswith(level) and not ln.startswith(level + '#'):
            cur = ln[len(level):].strip(); out[cur] = []
        elif cur is not None:
            out[cur].append(ln)
    return {k: '\n'.join(v).strip() for k, v in out.items()}


def latest(pattern, key):
    c = glob.glob(pattern)
    return max(c, key=key) if c else None


def fmt_t(x):
    return ('%g' % round(float(x), 2))


def clean_md(s):
    s = s.replace('**', '')
    lines = []
    for ln in s.splitlines():
        if ln.strip().startswith(('*Builder', '*Previz numbers (kit')): continue   # notes for the previz, never the prompt
        st = ln.strip()
        if st.startswith('- '): st = st[2:]
        lines.append(st)
    out = '\n'.join(lines)
    return re.sub(r'\n{2,}', '\n', out).strip()


# ---- sources
scene = open(os.path.join(BD, f'{B}-scene.md')).read(); S = sections(scene)
spec = open(os.path.join(BD, f'{B}-prompt-spec.md')).read(); SP = sections(spec)
COMMON_P = next((p for p in (os.path.join(FILM, r, 'prompt-common.md') for r in ('generations', 'blocks')) if os.path.exists(p)), None)
COMMON = sections(open(COMMON_P).read()) if COMMON_P else {}
def common(text):   # @KEY -> blocks/prompt-common.md's section KEY (the longest known key wins, so '@NIA SHEET' beats '@NIA')
    for k in sorted(COMMON, key=len, reverse=True):
        text = text.replace('@' + k, COMMON[k])
    return text
take = latest(os.path.join(FILM, 'previz', B, f'{B}-previz-take-*.json'), lambda p: int(re.search(r'take-(\d+)', p).group(1)))
TJ = json.load(open(take)); dur = float(TJ.get('duration') or json.load(open(os.path.join(BD, f'{B}-shots.json')))['duration'])
sbv = latest(os.path.join(FILM, 'previz', B, 'storyboard', 'v*'), lambda p: int(re.sub(r'\D', '', os.path.basename(p)) or 0))
panels = json.load(open(os.path.join(sbv, 'panels.json'))); pages = sorted(glob.glob(os.path.join(sbv, 'page-*.png')), key=lambda p: int(re.search(r'page-(\d+)', p).group(1)))

# ---- media: ordered, numbered per kind
media, tags = [], {}
for ln in SP.get('MEDIA', '').splitlines():
    if not ln.strip() or ln.strip().startswith('#'): continue
    kind, tag, f, desc = [x.strip() for x in ln.split('|', 3)]
    view = kind == 'VIEW'   # a location view: an IMAGE that any shot may stand in front of
    media.append(dict(kind='IMAGE' if view else kind, tag=tag, file=f, desc=common(desc), view=view))
imgs = [m for m in media if m['kind'] == 'IMAGE']; vids = [m for m in media if m['kind'] == 'VIDEO']; auds = [m for m in media if m['kind'] == 'AUDIO']
ordered = vids + imgs + [dict(kind='IMAGE', tag=f'PAGE {i}', file=os.path.relpath(p, FILM), desc='storyboard page', page=i) for i, p in enumerate(pages, 1)] + auds
cnt = {'VIDEO': 0, 'IMAGE': 0, 'AUDIO': 0}
for m in ordered:
    cnt[m['kind']] += 1; m['n'] = cnt[m['kind']]; m['role'] = ROLE[m['kind']]
    if not m['tag'].startswith('PAGE '): tags[m['tag']] = m
page_ns = [m['n'] for m in ordered if m.get('page')]


def refs(text):
    return re.sub(r'\{(VIDEO|IMAGE|AUDIO):([^}]+)\}', lambda mo: f"{mo.group(1)} REFERENCE {tags[mo.group(2).strip()]['n']}", text)


# ---- the shots
def shot_panels(label):
    ns = [p['n'] for p in panels if str(p['shot']) == str(label)]
    if not ns: return ''
    if len(ns) == 1: return f' (PANEL {ns[0]})'
    if len(ns) == 2: return f' (PANELS {ns[0]} AND {ns[1]})'
    return f' (PANELS {ns[0]} TO {ns[-1]})'


shots_md = S.get('Shots', ''); blocks = re.split(r'^### ', shots_md, flags=re.M)[1:]
shot_txt = []
for blk in blocks:
    head, _, body = blk.partition('\n')
    mo = re.match(r'SHOT (\S+): (.+?) \(CAM FACING: ([^)]+)\)(?: \(([\d.]+)[–-]([\d.]+) ?s\))?', head.strip())  # a time range in the scene file is accepted and dropped
    if not mo: sys.exit(f'{B}: cannot read shot header: {head}')
    sid, name, facing, t0, t1 = mo.groups()
    shot_txt.append(f'SHOT {sid}: {name} (CAM FACING: {facing}){shot_panels(sid)}\n' + clean_md(body))  # no seconds in the header

acting = clean_md(S.get('ACTING TASKS', ''))
order = ['SCENE CONTEXT', '@REFS', 'LOCATION MAP', 'GEOGRAPHY', 'COMPASS (fixed backdrop)', 'FIRST FRAME AND SPATIAL BLOCKING', 'FORMAT MODE', 'OPTICS', 'CAMERA', 'CAMERA STYLE',
         '@SHOTS', '@ACTING', '@FIGHT', 'PHYSICS', 'LIGHTING', 'AUDIO', 'STYLE', 'QUALITY', 'POSITIVE CONSTRAINTS', 'FIGHT STYLE LOCK', '@STORYBOARD']  # a section is emitted only if the spec has it; check.py reads this list
parts = []
for sec in order:
    if sec == '@REFS':
        L = ['ACTIVE REFERENCES']
        for m in ordered:
            if m.get('page'): continue
            if m['kind'] == 'VIDEO': L.append(f"[{m['tag']}] video character sheet, VIDEO REFERENCE {m['n']}: {refs(m['desc'])}")
            else: L.append(f"[{m['tag']}] {m['kind']} REFERENCE {m['n']}: {refs(m['desc'])}")
        for ln in SP.get('TAGS', '').splitlines():
            if ln.strip(): L.append(refs(common(ln.strip())))
        if page_ns:
            L.append(f"Storyboard pages 1 to {len(page_ns)}, IMAGE REFERENCES {page_ns[0]} TO {page_ns[-1]}: {len(panels)} numbered panels, three a page, in order. "
                     "Position only: 3D previz, mannequins and placeholder models that give camera, framing, placement and screen direction; no look is taken from them.")
        parts.append('\n'.join(L))
    elif sec == '@SHOTS': parts.append(refs('\n\n'.join(shot_txt)))
    elif sec == '@ACTING': parts.append('ACTING TASKS\n' + refs(acting))
    elif sec == '@FIGHT':
        if S.get('FIGHT BEATS', '').strip(): parts.append('FIGHT BEATS\n' + refs(clean_md(S['FIGHT BEATS'])))
    elif sec == '@STORYBOARD':
        parts.append(f"STORYBOARD\nFollow panels 1 to {len(panels)} in order, each a key frame of its shot, in order: match camera position, framing, "
                     "screen direction and action; cut only where the shot number changes. The panels are 3D previz, mannequins and placeholder models; every look comes from the references and this text.")
    else:
        key = sec if sec in SP else sec.split(' (')[0]
        if key in SP and SP[key].strip(): parts.append(f'{sec}\n' + refs(SP[key].strip()))
prompt = '\n\n'.join(parts).strip() + '\n'
pp = os.path.join(OUT, f'{B}-prompt-{VER}.txt'); open(pp, 'w').write(prompt)
def film_ratio(film):
    """The film's aspect ratio: previz/film.json 'ratio', else brief.md '- Aspect ratio: 9:16', else 9:16."""
    fj = os.path.join(film, 'previz', 'film.json')
    if os.path.exists(fj):
        try:
            r = json.load(open(fj)).get('ratio')
            if r: return r
        except Exception: pass
    bp = os.path.join(film, 'brief.md')
    if os.path.exists(bp):
        mo = re.search(r'^- Aspect ratio:\s*(\d+:\d+)', open(bp).read(), re.M)
        if mo: return mo.group(1)
    return '9:16'
settings = dict(model='seedance_2_5', mode='omni_reference', duration=int(math.ceil(dur - 1e-6)), aspect_ratio=film_ratio(FILM), resolution='480p', draft=True, generate_audio=True)
json.dump(dict(block=B, version=VER, settings=settings, previz_take=os.path.relpath(take, FILM), storyboard=os.path.relpath(sbv, FILM),
               media=[{k: v for k, v in m.items()} for m in ordered]), open(os.path.join(OUT, f'{B}-media-{VER}.json'), 'w'), indent=1)
print(f'{B} {VER}: {len(prompt)} chars, {cnt["VIDEO"]} videos, {cnt["IMAGE"]} images ({len(page_ns)} pages), {cnt["AUDIO"]} audio, {settings["duration"]} s -> {pp}')
