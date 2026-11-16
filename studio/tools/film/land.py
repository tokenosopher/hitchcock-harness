"""Land a generated clip (Flow v3.2 - 7 Takes, step 10): put it in its place, write its job id and put its card at the very
top of review/cards.json, the cards file the Hitchcock Harness reads. Nothing else comes before this.

    .venv/bin/python tools/film/land.py <film folder> --kind take|element|pickup|pass --id <G or CID or FIX-name> --take N
        (--file <downloaded mp4> | --url-file <file holding the result URL on its first line>)
        --job <job id> --title "<card title>" --section "<section heading>"
        [--sub "<card sub line>"] [--credits N] [--section-sub "<section text>"] [--of take|element|pickup] [--no-check]

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
--no-check is accepted and does nothing (kept so older commands still run)."""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile

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


if __name__ == '__main__':
    main()
