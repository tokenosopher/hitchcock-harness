"""Shared film-folder helpers for the edit and prompt tools. No per-film value inside: every function takes the film folder.
- a generation's folder: <film>/generations/<gen> first, then <film>/blocks/<gen>; film-wide files (prompt-common.md,
  upload-registry.json) the same way
- a generation's files: <gen>/prompt/<name> first, then <gen>/<name> (pick-ups written before Flow v3 keep them at the root)
- a take: 'take2', 'grey-take1', 'take4-aivoice3' or a file name, resolved inside <gen>/takes/
- the media list a take was made from: given as 'take2:v3', else the latest <gen>-media-vN.json written before the take's
  job id (or, without a job id, before the take file)
- the planned shots of a generation: ONLY from the previz take json its media list names (`previz_take`), cut to the media
  list's "span" (["4","5"]) when a pick-up points at a parent generation's previz json
- a take's transcript: takes/g<N>/stt.json, takes/t<N>/stt.json, takes/t<N>-stt.json, takes/<take>-stt.json"""
import glob, json, os, re


def gens_dir(film):
    """The folder new generations go in: <film>/generations if it exists, else <film>/blocks."""
    g = os.path.join(film, 'generations')
    return g if os.path.isdir(g) else os.path.join(film, 'blocks')


def gen_dir(film, gen):
    """<film>/generations/<gen> if it exists, else <film>/blocks/<gen> if it exists, else where a new one would go."""
    for root in ('generations', 'blocks'):
        p = os.path.join(film, root, gen)
        if os.path.isdir(p):
            return p
    return os.path.join(gens_dir(film), gen)


def film_file(film, name):
    """A film-wide file of the generations layout (prompt-common.md, upload-registry.json): generations/ first, then blocks/."""
    for root in ('generations', 'blocks'):
        p = os.path.join(film, root, name)
        if os.path.exists(p):
            return p
    return None


def norm_version(v):
    v = str(v).strip()
    return v if v.startswith('v') else 'v' + v


def find_gen_file(film, gen, name):
    """<gen>/prompt/<name>, else <gen>/<name>; None when neither exists."""
    for p in (os.path.join(gen_dir(film, gen), 'prompt', name), os.path.join(gen_dir(film, gen), name)):
        if os.path.exists(p):
            return p
    return None


def versions(film, gen, kind):
    """[(n, path)] of <gen>-<kind>-vN.<ext> in prompt/ and the generation root, by n (kind: 'media', 'prompt', 'take-medias')."""
    ext = 'txt' if kind == 'prompt' else 'json'
    out = {}
    for d in (os.path.join(gen_dir(film, gen), 'prompt'), gen_dir(film, gen)):
        for p in glob.glob(os.path.join(d, f'{gen}-{kind}-v*.{ext}')):
            m = re.search(rf'-{kind}-v(\d+)\.{ext}$', p)
            if m and int(m.group(1)) not in out:
                out[int(m.group(1))] = p
    return sorted(out.items())


def resolve_take(film, gen, token):
    """(take file, take number or None, jobid stem) for a take token inside <gen>/takes/ (or a path relative to the film)."""
    td = os.path.join(gen_dir(film, gen), 'takes')
    if token.endswith('.mp4'):
        for p in (os.path.join(td, token), os.path.join(film, token), token):
            if os.path.exists(p):
                f = p; break
        else:
            raise SystemExit(f'{gen}: no take file {token}')
    else:
        found = glob.glob(os.path.join(td, '*.mp4')) + glob.glob(os.path.join(td, 'take*', '*.mp4'))  # flat files, and one folder per take (land.py)
        byname = {os.path.basename(p): p for p in found}; allm = sorted(byname)
        exact = [n for n in allm if re.search(rf'(?:^|[-_]){re.escape(token)}(?:[-_]480p)?\.mp4$', n)]
        loose = [n for n in allm if re.search(rf'(?:^|[-_]){re.escape(token)}(?:[-_.]|$)', n) and not re.search(r'stamped|annotated|vs-|preview', n)]
        c = exact or loose
        if len(c) != 1:
            raise SystemExit(f'{gen}={token}: ' + (f'{len(c)} takes match ({", ".join(c)}); give the file name or a longer token' if c else f'no take in {td} matches; there are: {", ".join(allm) or "none"}'))
        f = byname[c[0]]
    name = os.path.basename(f)
    m = re.search(r'take(\d+)', name)
    n = int(m.group(1)) if m else None
    stem = re.sub(r'^' + re.escape(gen) + r'[-_]', '', name)
    sm = re.search(r'(.*?take\d+[A-Za-z]?)', stem)
    return f, n, (sm.group(1) if sm else os.path.splitext(stem)[0])


def jobid_for(film, gen, n, stem):
    if n is None:
        return None
    td = os.path.join(gen_dir(film, gen), 'takes')
    for d in (os.path.join(td, f'take{n}'), td, gen_dir(film, gen)):
        for name in (f'{gen}-{stem}.jobid', f'{stem}.jobid', f'take{n}.jobid'):
            if os.path.exists(os.path.join(d, name)):
                return os.path.join(d, name)
    return None


def media_for_take(film, gen, take_file, n, stem, version=None):
    """(media json path or None, prompt txt path or None, how it was chosen)."""
    if version:
        v = norm_version(version)
        return find_gen_file(film, gen, f'{gen}-media-{v}.json'), find_gen_file(film, gen, f'{gen}-prompt-{v}.txt'), f'given ({v})'
    ref = jobid_for(film, gen, n, stem) or take_file
    t = os.path.getmtime(ref) + 1
    med = [p for _, p in versions(film, gen, 'media') if os.path.getmtime(p) <= t]
    pro = [p for _, p in versions(film, gen, 'prompt') if os.path.getmtime(p) <= t]
    how = f'latest written before {os.path.basename(ref)}'
    return (med[-1] if med else None), (pro[-1] if pro else None), how


def load_json(path):
    with open(path) as f:
        return json.load(f)


def previz_path(film, media):
    pt = media.get('previz_take')
    if not pt:
        return None
    return pt if os.path.isabs(pt) else os.path.join(film, pt)


def plan_from_media(film, media):
    """The planned shots of a generation from the previz take json its media list names:
    {previz_take, span, shots: [{label, t0, t1}] (seconds from the generation's start), length, cuts, lines: [{who, text, t}]}.
    With "span": only those shots of the previz json, rebased to 0, and only the lines (or line parts) spoken in them."""
    p = previz_path(film, media)
    if not p or not os.path.exists(p):
        return None
    tj = load_json(p)
    rows = tj.get('shot_plan') or tj.get('shots') or []
    shots = [dict(label=str(s.get('label') or s.get('id')), t0=float(s['t0']), t1=float(s['t1'])) for s in rows]
    span = [str(x) for x in (media.get('span') or [])]
    lines = [dict(who=l.get('who'), text=(l.get('text') or '').strip(), t=l.get('t'), parts=l.get('parts')) for l in tj.get('lines', [])]
    if span:
        missing = [x for x in span if x not in [s['label'] for s in shots]]
        if missing:
            raise SystemExit(f"span {span}: shots {missing} are not in {os.path.relpath(p, film)}")
        keep = [s for s in shots if s['label'] in span]
        wins = [(s['t0'], s['t1']) for s in keep]
        inside = lambda a, b: any(w0 <= (a + b) / 2 < w1 for w0, w1 in wins)
        sl = []
        for l in lines:
            pieces = l['parts'] or [dict(text=l['text'], t=l['t'])]
            for pc in pieces:
                if pc.get('t') and inside(*pc['t']):
                    sl.append(dict(who=l['who'], text=(pc.get('text') or '').strip(), t=pc['t']))
        base, acc, out = keep[0]['t0'], 0.0, []
        for s in keep:     # back to back from 0, each shot its planned length
            d = s['t1'] - s['t0']; out.append(dict(label=s['label'], t0=round(acc, 3), t1=round(acc + d, 3))); acc += d
        shots, lines, length = out, sl, round(acc, 3)
    else:
        length = float(tj.get('duration') or (shots[-1]['t1'] if shots else 0))
        lines = [dict(who=l['who'], text=l['text'], t=l['t']) for l in lines]
    return dict(previz_take=os.path.relpath(p, film), span=span or None, shots=shots, length=length,
                cuts=[s['t0'] for s in shots[1:]], lines=lines)


def stt_for_take(film, gen, take_file, n):
    td = os.path.join(gen_dir(film, gen), 'takes'); name = os.path.basename(take_file); stem = os.path.splitext(name)[0]
    c = []
    if n is not None:
        g = [os.path.join(td, f'g{n}', 'stt.json')]; t = [os.path.join(td, f't{n}', 'stt.json'), os.path.join(td, f't{n}-stt.json')]
        c += (g + t) if 'grey' in name else (t + g)
    c += [os.path.join(td, f'{stem}-stt.json'), os.path.join(td, stem, 'stt.json')]
    tf = os.path.dirname(take_file)
    if os.path.basename(tf).startswith('take'): c = [os.path.join(tf, 'stt.json'), os.path.join(tf, f'{stem}-stt.json')] + c  # one folder per take (land.py, transcribe.py)
    return next((p for p in c if os.path.exists(p)), None)


def last_word_end(stt_path):
    d = load_json(stt_path)
    ws = d.get('words', d) if isinstance(d, dict) else d
    ends = [float(w['end']) for w in ws if w.get('type', 'word') == 'word' and 'end' in w]
    return max(ends) if ends else None


def shots_file(film, gen, media=None):
    """<gen>-shots.json, or (for a pick-up without one) the shots file of the generation its previz take belongs to."""
    p = os.path.join(gen_dir(film, gen), f'{gen}-shots.json')
    if os.path.exists(p):
        return p
    pt = (media or {}).get('previz_take') or ''
    m = re.match(r'previz/([^/]+)/', pt)
    if m:
        q = os.path.join(gen_dir(film, m.group(1)), f'{m.group(1)}-shots.json')
        if os.path.exists(q):
            return q
    return None
