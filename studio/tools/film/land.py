"""Land a generated clip (Flow v3.3 - 7 Takes, steps 10 and 19): put it in its place, write its job id, put its card at the
very top of review/cards.json, the cards file the Hitchcock Harness reads, and, for a scene's take, put it in its boards'
place on the film's timeline in the same step. Nothing else comes before this; the checks come after.

    .venv/bin/python tools/film/land.py <film folder> --kind take|element|pickup|pass --id <G or CID or FIX-name> --take N
        (--file <downloaded mp4> | --url-file <file holding the result URL on its first line>)
        --job <job id> --title "<card title>" --section "<section heading>"
        [--sub "<card sub line>"] [--credits N] [--section-sub "<section text>"] [--of take|element|pickup] [--no-check]
        [--no-timeline] [--drop-wait SECONDS]

Where each kind lands (one folder per take; every file name unique in the film; the job id beside the clip under the same
name):
  take     generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4                      <G>-take<N>.jobid
  pickup   generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-480p.mp4        FIX-<name>-take<N>.jobid   (--id FIX-door-S4 or door-S4)
  element  elements/<CID>/takes/take<N>/E-<CID>-take<N>-480p.mp4                   E-<CID>-take<N>.jobid
  pass     the 1080p pass of take N, beside its draft: <id>-take<N>-1080p.mp4 and <id>-take<N>-1080p.jobid, <id> being
           <G>, FIX-<name> or E-<CID>; --id says whose take (FIX-... a pick-up, C01... an element, anything else a
           generation; --of overrides)
--file is moved into place. --url-file: the URL is read from the file and handed to curl on stdin, so a signed link never
sits on a command line or in the output; the file is deleted after a good download (--keep-url-file keeps it).
A clip that is already in place with the same bytes is accepted (a re-run); a different file there is refused, as is a
job-id file holding another job. The card goes first in its section and the section first in the file; no card is ever
removed, and a card for the same file is not added twice. The clip has landed when it plays in the Hitchcock Harness.
--no-check is accepted and does nothing (kept so older commands still run).

The timeline (--kind take only; a pick-up, an element clip and a 1080p pass never change the cut): the scene's boards,
planned shots and planned lines leave the cut and the whole take goes in their place, as one picture clip and its sound,
with what follows moved by the difference in length, exactly as the app's "A take in its boards' place" does. land.py
writes it as an Alma drop (the app's edit recipe): it reads cut/working.json, keeps its rev, and writes
cut/alma/<YYYYMMDD-HHMMSS>.json = {basedOnRev, note, tracks, markers} (a temp name, then a rename). The harness takes it in
as one step the user can undo and saves it as the next version. land.py waits up to --drop-wait seconds (default 15) for
the answer (cut/alma/<same>.answer.json): when the cut moved meanwhile it reads it again and writes a new drop (three
tries); when the harness is not running the drop waits there and is taken in when it starts. Nothing is dropped when the
scene has its take in the film already (a later take waits on the Takes view for the keeper pick or the user's word), when
the scene has no boards or planned shots on the cut, or when the film has no cut yet. --no-timeline skips it (a test take).
Exit 2: the take landed but the harness refused the drop (its reason is printed); run the app's call instead or ask."""
import argparse, copy, datetime, hashlib, json, math, os, re, shutil, subprocess, sys, tempfile, time

CHECKING = 'Checks running; this text gets the findings.'


def sha1(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def probe(p):
    """(seconds, 'WxH') of a video, or None when ffprobe cannot read it as one."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
                        '-of', 'json', p], capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
        s = d['streams'][0]
        return float(d['format']['duration']), f'{s["width"]}x{s["height"]}'
    except (ValueError, KeyError, IndexError, TypeError):
        return None


def download(url_file, dest_dir, fail):
    """curl the URL on the first line of url_file into dest_dir; the URL goes to curl through stdin (-K -), never argv."""
    lines = open(url_file).read().splitlines()
    url = lines[0].strip() if lines else ''
    if not re.match(r'https?://', url):
        fail(f'{url_file}: the first line is not an http(s) URL')
    cfg = 'url = "' + url.replace('\\', '\\\\').replace('"', '\\"') + '"\n'
    fd, part = tempfile.mkstemp(suffix='.mp4.part', dir=dest_dir)
    os.close(fd)
    r = subprocess.run(['curl', '-sS', '-f', '-L', '--retry', '3', '--retry-delay', '2', '-o', part, '-K', '-'],
                       input=cfg, capture_output=True, text=True)
    if r.returncode:
        err = re.sub(r'https?://\S+', '<url>', r.stderr.strip())     # never echo the link
        fail(f'download failed (curl exit {r.returncode}): {err}', part)
    return part


def place(film, kind, gid, take, of):
    """(kind, id, folder, clip name, job-id file name) for this landing."""
    if kind == 'pass':
        kind_of = of or ('pickup' if gid.startswith('FIX-') else 'element' if re.match(r'(E-)?C\d', gid) else 'take')
    else:
        kind_of = kind
    if kind_of == 'pickup' and not gid.startswith('FIX-'):
        gid = 'FIX-' + gid
    if kind_of == 'element':
        gid = re.sub(r'^E-', '', gid)
        folder = os.path.join(film, 'elements', gid, 'takes', f'take{take}')
        stem = f'E-{gid}-take{take}'
    else:
        folder = os.path.join(film, 'generations', gid, 'takes', f'take{take}')
        stem = f'{gid}-take{take}'
    if kind == 'pass':
        clip, jobid = f'{stem}-1080p.mp4', f'{stem}-1080p.jobid'
    else:
        clip, jobid = f'{stem}-480p.mp4', f'{stem}.jobid'
    return kind_of, gid, folder, clip, jobid


# ---- the timeline: the take in its boards' place (a port of the app's takeForBoards, components/edit/planned.ts)

SCENE = re.compile(r'(?:^|[^A-Za-z0-9])(S\d+[A-Z]?)(?![A-Za-z0-9])')     # the app's scene of a take folder (server/edit/shots.ts)


def r6(x):
    return math.floor(x * 1e6 + 0.5) / 1e6


def _len(c):
    sp = c.get('speed')
    return (c['out'] - c['in']) / (sp if sp and sp > 0 else 1)


def _mains(tracks):
    v = next((t for t in tracks if t.get('id') == 'V1'), None) or next((t for t in tracks if t.get('kind') == 'video'), None)
    a = next((t for t in tracks if t.get('id') == 'A1'), None) or next((t for t in tracks if t.get('kind') == 'audio'), None)
    return v, a


def take_for_boards(tl0, scene, take):
    """(tracks, markers, words) with the scene's planned clips replaced by the take, or a string saying why not."""
    tl = copy.deepcopy(tl0)
    v, a = _mains(tl['tracks'])
    if not v or not a:
        return 'The cut has no picture or dialogue track.'
    if any(not c.get('plan') and (c.get('takeRef') or {}).get('scene') == scene for c in v['clips']):
        return f'{scene} has its take in the film already.'
    mine = [c for c in v['clips'] + a['clips'] if c.get('plan') and c.get('scene') == scene]
    if not mine:
        return f'{scene} has no boards or planned shots on the timeline.'
    frm, to = min(c['at'] for c in mine), max(c['at'] + _len(c) for c in mine)
    gone = {id(c) for c in mine}
    v['clips'] = [c for c in v['clips'] if id(c) not in gone]
    a['clips'] = [c for c in a['clips'] if id(c) not in gone]
    fps = tl.get('fps') or 24
    secs = r6(math.floor(take['seconds'] * fps + 0.5) / fps)
    used = {c['id'] for t in tl['tracks'] for c in t['clips']}
    base = cid = f'{scene.lower()}-take'
    k = 2
    while cid in used or cid + 'a' in used:
        cid, k = f'{base}-{k}', k + 1
    label = f"{scene} · {take['name']}"
    pic = {'id': cid, 'src': take['src'], 'in': 0, 'out': secs, 'at': frm, 'label': label,
           'takeRef': {'scene': scene, 'take': take['name']}}
    d = secs - (to - frm)
    if abs(d) >= 1e-6:
        for t in tl['tracks']:
            for c in t['clips']:
                if c['at'] >= to - 1e-6:
                    c['at'] = r6(max(0, c['at'] + d))
        for m in tl.get('markers') or []:
            if m['at'] >= to - 1e-6:
                m['at'] = r6(max(0, m['at'] + d))
    v['clips'] = sorted(v['clips'] + [pic], key=lambda c: c['at'])
    if take.get('sound', True):
        a['clips'] = sorted(a['clips'] + [dict(pic, id=cid + 'a')], key=lambda c: c['at'])
    kind = 'boards' if any(c.get('plan') == 'board' for c in mine) else 'planned shots'
    return tl['tracks'], tl.get('markers') or [], f'{scene} {take["name"]} took the place of its {kind} ({secs:.1f} s)', frm, fps


def smpte(sec, fps):
    f = int(math.floor(sec * fps + 0.5))
    return f'{f // (3600 * fps):02d}:{f // (60 * fps) % 60:02d}:{f // fps % 60:02d}:{f % fps:02d}'


def media_info(p):
    """(seconds, has sound) of a clip, by ffprobe: the format's duration, as the app's takeInfo reads it."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', p],
                       capture_output=True, text=True)
    d = json.loads(r.stdout or '{}')
    return float(d['format']['duration']), any(s.get('codec_type') == 'audio' for s in d.get('streams', []))


def src_prefix(film):
    """The form the timeline's clips use for a file of this film: assets/films/<slug>/..."""
    for p in (film, os.path.realpath(film)):
        m = re.search(r'(?:^|/)(assets/films/[^/]+)/?$', p)
        if m:
            return m.group(1)
    return 'assets/films/' + os.path.basename(film.rstrip('/'))


def write_drop(alma, body):
    """cut/alma/<YYYYMMDD-HHMMSS>.json (-2, -3 … when the second is taken), written to a temp name and linked in."""
    os.makedirs(alma, exist_ok=True)
    stamp = datetime.datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    fd, tmp = tempfile.mkstemp(suffix='.json.tmp', dir=alma)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(body, f, indent=1, ensure_ascii=False)
        f.write('\n')
    for k in range(1, 100):
        name = os.path.join(alma, stamp + ('' if k == 1 else f'-{k}') + '.json')
        if os.path.exists(name) or os.path.exists(name[:-5] + '.answer.json'):
            continue
        try:
            os.link(tmp, name)           # never over another drop
        except FileExistsError:
            continue
        os.remove(tmp)
        return name
    os.remove(tmp)
    raise SystemExit('no free drop name in cut/alma/')


def to_timeline(film, gid, take_n, dest, wait):
    """Puts a scene's landed take in its boards' place by an Alma drop. Returns (exit code, message)."""
    m = SCENE.search(gid)
    if not m:
        return 0, f'timeline: {gid} is not a scene of the cut; nothing put on the timeline'
    scene = m.group(1)
    wp = os.path.join(film, 'cut', 'working.json')
    if not os.path.exists(wp):
        return 0, 'timeline: this film has no cut yet (cut/working.json); nothing put on the timeline'
    secs, sound = media_info(dest)
    lead = '' if gid == scene else gid.replace('-', ' ').replace('_', ' ').strip()
    name = (lead + ' · ' if lead else '') + f'take {take_n}'
    rel = os.path.relpath(os.path.realpath(dest), os.path.realpath(film))
    take = {'src': src_prefix(film) + '/' + rel, 'name': name, 'seconds': secs, 'sound': sound}
    alma = os.path.join(film, 'cut', 'alma')
    for attempt in range(3):
        w = json.load(open(wp, encoding='utf-8'))
        r = take_for_boards(w, scene, take)
        if isinstance(r, str):
            more = ' A later take waits on the Takes view until the keeper pick or the user\'s word puts it in.' if 'already' in r else ''
            return 0, f'timeline: {r} Nothing dropped.{more}'
        tracks, markers, words, at, fps = r
        note = f'{words} at {smpte(at, fps)}, as it landed, before its checks'
        drop = write_drop(alma, {'basedOnRev': w['rev'], 'note': note, 'tracks': tracks, 'markers': markers})
        shown = os.path.relpath(drop, film)
        ans_p = drop[:-5] + '.answer.json'
        t_end = time.time() + wait
        while time.time() < t_end and not os.path.exists(ans_p):
            time.sleep(0.5)
        if not os.path.exists(ans_p):
            return 0, (f'timeline: {note}; the drop {shown} waits for the harness (no answer in {wait:g} s): '
                       f'it is taken in when the harness runs; read {os.path.basename(ans_p)} beside it')
        time.sleep(0.1)
        ans = json.load(open(ans_p, encoding='utf-8'))
        if ans.get('taken'):
            ver = f", saved as {ans['version']}" if ans.get('version') else ''
            return 0, f'timeline: {note} (rev {ans.get("rev")}{ver})'
        if 'since' in ans and attempt < 2:
            print(f'timeline: the cut moved while the drop was written ({shown}); reading it again')
            continue
        probs = ''.join(f'\n  {x}' for x in ans.get('problems') or [])
        return 2, f'timeline: NOT taken ({shown}): {ans.get("why")}{probs}'
    return 2, 'timeline: NOT taken: the cut kept moving; put the take in with the app\'s call ("A take in its boards\' place")'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('film')
    ap.add_argument('--kind', required=True, choices=['take', 'element', 'pickup', 'pass'])
    ap.add_argument('--id', required=True, help='the generation (S1, S2), the element (C01) or the pick-up (FIX-door-S4)')
    ap.add_argument('--take', required=True, type=int)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--file', help='the downloaded mp4 (moved into place)')
    src.add_argument('--url-file', help='a file whose first line is the result URL (never put the URL on a command line)')
    ap.add_argument('--keep-url-file', action='store_true')
    ap.add_argument('--job', required=True, help='the Higgsfield job id')
    ap.add_argument('--title', required=True, help='the card title')
    ap.add_argument('--section', required=True, help='the section heading (what it holds, its state, the date)')
    ap.add_argument('--section-sub', help='the section text, when the section is new')
    ap.add_argument('--sub', help='the card sub line (default: job, credits, seconds, resolution)')
    ap.add_argument('--credits', help='credits for the sub line, e.g. 27')
    ap.add_argument('--of', choices=['take', 'element', 'pickup'], help='for --kind pass: whose take it is')
    ap.add_argument('--no-check', action='store_true', help='accepted for the commands in the stage notes; does nothing')
    ap.add_argument('--no-timeline', action='store_true', help='--kind take: do not put the take on the timeline (a test take)')
    ap.add_argument('--drop-wait', type=float, default=15, help='seconds to wait for the harness to answer the drop (default 15)')
    A = ap.parse_args()

    film = os.path.abspath(os.path.expanduser(A.film))
    cards_p = os.path.join(film, 'review', 'cards.json')
    if not os.path.exists(cards_p):
        sys.exit(f'no review manifest at {cards_p} (start the film with tools/film/new_film.py)')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', A.id):
        sys.exit(f'--id must be a plain ID like S3, C01 or FIX-door-S4 (got {A.id!r})')
    if A.take < 1:
        sys.exit('--take starts at 1')
    job = A.job.strip()
    if not re.fullmatch(r'[A-Za-z0-9-]{6,}', job):
        sys.exit(f'--job does not look like a job id: {job!r}')

    kind_of, gid, folder, clip, jobid_name = place(film, A.kind, A.id, A.take, A.of)
    if A.kind == 'pass' and not os.path.isdir(folder):
        print(f'note: {os.path.relpath(folder, film)} has no draft yet; the pass lands there on its own')
    dest = os.path.join(folder, clip)
    jobid_p = os.path.join(folder, jobid_name)

    # refuse before touching anything
    if os.path.exists(jobid_p):
        old = open(jobid_p).read().strip()
        if old != job:
            sys.exit(f'{os.path.relpath(jobid_p, film)} holds another job ({old}); is --take right? nothing changed')
    made = []                                       # folders this run made, removed again if the landing fails
    d = folder
    while not os.path.isdir(d):
        made.append(d)
        d = os.path.dirname(d)
    os.makedirs(folder, exist_ok=True)

    def fail(msg, part=None):
        if part and os.path.exists(part):
            os.remove(part)
        for m in made:
            try:
                os.rmdir(m)
            except OSError:
                break
        sys.exit(msg)

    # the file
    if A.url_file:
        incoming = download(A.url_file, folder, fail)
    else:
        incoming = os.path.abspath(os.path.expanduser(A.file))
        if not os.path.isfile(incoming):
            fail(f'no such file: {incoming}')
    info = probe(incoming)
    if not info:
        fail('the clip is not a readable video (an error page or a broken download?); nothing landed',
             incoming if A.url_file else None)
    if os.path.exists(dest):
        if os.path.realpath(dest) != os.path.realpath(incoming) and sha1(dest) != sha1(incoming):
            fail(f'{os.path.relpath(dest, film)} exists with other bytes: refusing to replace a landed clip (is --take right?)',
                 incoming if A.url_file else None)
        if os.path.realpath(dest) != os.path.realpath(incoming):
            if A.url_file:
                os.remove(incoming)
            print(f'{os.path.relpath(dest, film)} already in place with the same bytes')
    else:
        shutil.move(incoming, dest)
    if A.url_file and not A.keep_url_file:
        os.remove(A.url_file)
    if not os.path.exists(jobid_p):
        with open(jobid_p, 'w') as f:
            f.write(job + '\n')
    secs, size = info

    # the card
    rel = os.path.relpath(os.path.realpath(dest), os.path.realpath(film))
    sub = A.sub or ' · '.join(x for x in (f'job {job[:8]}', f'{A.credits} credits' if A.credits else '',
                                          f'{secs:.1f} s', size + ('' if A.kind == 'pass' else ' draft')) if x)
    d = json.load(open(cards_p, encoding='utf-8'))
    secs_list = d.setdefault('sections', [])
    sec = next((s for s in secs_list if s.get('heading') == A.section), None)
    if sec is None:
        sec = {'heading': A.section, 'cards': []}
        if A.section_sub:
            sec['sub'] = A.section_sub
        made_section = True
    else:
        secs_list.remove(sec)
        made_section = False
    secs_list.insert(0, sec)
    have = [c for s in secs_list for c in s.get('cards', []) if c.get('file') == rel]
    if have:
        print(f'a card for {rel} is already in review/cards.json ({have[0].get("title")!r}); not added again')
    else:
        sec.setdefault('cards', []).insert(0, {'type': 'video', 'title': A.title, 'sub': sub, 'text': CHECKING, 'file': rel})
    tmp = cards_p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=1, ensure_ascii=False)
        f.write('\n')
    os.replace(tmp, cards_p)

    print(f'landed {rel} ({secs:.2f} s, {size}); job {job} in {os.path.relpath(jobid_p, film)}')
    print(f'card first in "{A.section}"' + (' (new section)' if made_section else '') + ', section first in review/cards.json')

    # the take in its boards' place on the timeline, in the same step, before any check (Flow v3.3 - 7 Takes, step 19)
    if A.kind == 'take' and not A.no_timeline:
        code, msg = to_timeline(film, gid, A.take, dest, A.drop_wait)
        print(msg)
        if code:
            sys.exit(code)


if __name__ == '__main__':
    main()
