"""Get Higgsfield media ids for a film's local files without a signed link ever reaching the chat, a log or a command line.
Flow v3.2 - 7 Takes, step 3. The registry is <film>/generations/upload-registry.json: film-relative path -> {media_id, sha1, size,
type, uploaded}. A film made before generations/ keeps blocks/upload-registry.json, read and written in place; its older
entries are a bare media id with no sha1.

    .venv/bin/python tools/higgsfield/upload.py plan <film folder> <file>... [--no-write] [--include-unknown]
    .venv/bin/python tools/higgsfield/upload.py put  <film folder> --response <json saved from media_upload> [--batch K] [--keep]
    .venv/bin/python tools/higgsfield/upload.py ids  <file>... [--film <film folder>] [--out <take-medias json>]

plan   says for each file: new, changed (its sha1 differs from its registry entry), same (with its media id), or unknown
       (an old entry without a sha1; --include-unknown uploads it again). The new and changed files go into
       upload-pending.json beside the registry, in batches of 20 (not with --no-write), and the media_upload arguments are printed
       per batch: call media_upload with exactly that list, in that order, and save its response to a file without
       printing it.
put    reads the saved response ({"uploads": [{"upload_url", "media_id", ...}]}, in the order of the request), PUTs each
       file of the batch to its slot with curl (the link goes to curl on stdin), records path -> media id, sha1, size in
       the registry, prints the media_confirm calls (by type, 20 ids a call), and deletes the response file, which holds
       signed links (--keep keeps it). A failed PUT stays pending alone, with the media_upload call that asks for new
       slots. --batch picks the pending batch the response answers (default: the first one left).
ids    prints, for files already uploaded, the media_confirm ids by type and the medias list for generate_video
       ([{"role": "image_references", "value": id}, ...] in the order given; video -> video_references, audio ->
       audio_references). A file changed since its upload is refused (its id is stale). --out writes the medias list to a
       new file (never over an existing one). The film is found from the files' paths, or --film.
Files are film-relative or absolute. Upload names are "<code>-<file name>", the code from <film>/higgsfield.json."""
import argparse, datetime, hashlib, json, os, re, subprocess, sys

CT = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.mov': 'video/quicktime'}
ROLE = {'image': 'image_references', 'video': 'video_references', 'audio': 'audio_references'}
URL = re.compile(r'https?://\S+')


def sha1(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def registry_path(film):
    new, old = os.path.join(film, 'generations', 'upload-registry.json'), os.path.join(film, 'blocks', 'upload-registry.json')
    return new if os.path.exists(new) or not os.path.exists(old) else old


def pending_path(film):
    return os.path.join(os.path.dirname(registry_path(film)), 'upload-pending.json')


def load(p, default):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else default


def save(p, data):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')
    os.replace(tmp, p)


def entry_id(e):
    return e if isinstance(e, str) else (e or {}).get('media_id')


def resolve(film, f):
    """(absolute path, registry key) for a file given film-relative or absolute (or relative to the current folder)."""
    cands = [f] if os.path.isabs(f) else [os.path.join(film, f), os.path.abspath(f)]
    p = next((c for c in cands if os.path.isfile(c)), cands[0])
    rp, rf = os.path.realpath(p), os.path.realpath(film)
    key = os.path.relpath(rp, rf) if rp.startswith(rf + os.sep) else rp
    return p, key


def kind(p):
    ct = CT.get(os.path.splitext(p)[1].lower())
    if not ct:
        sys.exit(f'unknown file type for an upload: {p} (known: {", ".join(sorted(CT))})')
    return ct


def find_film(files, given):
    if given:
        return os.path.abspath(os.path.expanduser(given))
    if os.environ.get('FILM'):
        return os.path.abspath(os.environ['FILM'])
    for f in files:
        d = os.path.dirname(os.path.abspath(f))
        while d != os.path.dirname(d):
            if any(os.path.exists(os.path.join(d, s, 'upload-registry.json')) for s in ('generations', 'blocks')):
                return d
            d = os.path.dirname(d)
    sys.exit('cannot tell which film these files belong to: give --film')


def film_meta(film):
    h = load(os.path.join(film, 'higgsfield.json'), {})
    return h.get('code') or '', h.get('workspace_id')


def cmd_plan(A):
    film = os.path.abspath(os.path.expanduser(A.film))
    reg_p = registry_path(film)
    reg = load(reg_p, {})
    code, ws = film_meta(film)
    todo, missing = [], 0
    print(f'registry: {os.path.relpath(reg_p, film)} ({len(reg)} entries)')
    seen = set()
    for f in A.files:
        p, key = resolve(film, f)
        if key in seen:
            continue
        seen.add(key)
        if not os.path.isfile(p):
            print(f'missing   {key} (no such file)')
            missing += 1
            continue
        ct = kind(p)
        e = reg.get(key)
        if e is None:
            print(f'new       {key}')
            todo.append((p, key, ct))
        elif isinstance(e, str) or not e.get('sha1'):
            print(f'unknown   {key}  {entry_id(e)} (old entry, no sha1: cannot tell whether it changed)')
            if A.include_unknown:
                todo.append((p, key, ct))
        elif sha1(p) != e['sha1']:
            print(f'changed   {key}  (was {e["media_id"]}, uploaded {e.get("uploaded", "?")}; its sha1 differs)')
            todo.append((p, key, ct))
        else:
            print(f'same      {key}  {e["media_id"]}')
    if not todo:
        print('nothing to upload' + (f' ({missing} missing)' if missing else ''))
        sys.exit(1 if missing else 0)
    used, items = set(), []
    for p, key, ct in todo:
        base = (code + '-' if code else '') + os.path.basename(p)
        name, k = base, 2
        while name in used:
            name = re.sub(r'(\.[^.]+)$', f'-{k}\\1', base)
            k += 1
        used.add(name)
        items.append(dict(file=key, path=os.path.abspath(p), filename=name, content_type=ct))
    batches = [items[i:i + 20] for i in range(0, len(items), 20)]
    print(f'{len(items)} to upload in {len(batches)} media_upload call(s):')
    for i, b in enumerate(batches, 1):
        args = {'files': [dict(filename=x['filename'], content_type=x['content_type']) for x in b]}
        if ws:
            args['workspace_id'] = ws
        print(f'batch {i}: media_upload ' + json.dumps(args, ensure_ascii=False))
    if A.no_write:
        print('(--no-write: nothing saved; run plan again without it before uploading)')
    else:
        pend_p = pending_path(film)
        save(pend_p, {'made': datetime.datetime.now().isoformat(timespec='seconds'), 'registry': os.path.relpath(reg_p, film),
                      'batches': batches})
        print(f'saved {os.path.relpath(pend_p, film)}. Save each media_upload response to a file without printing it, then:')
        print(f'  upload.py put "{film}" --response <file>' + (' --batch K' if len(batches) > 1 else ''))
    sys.exit(1 if missing else 0)


def in_film(film, rel):
    """The full path of `rel` when it is a plain relative path inside the film (no "..", not absolute, links resolved);
    None otherwise."""
    if not isinstance(rel, str) or not rel or os.path.isabs(rel) or '..' in re.split(r'[\\/]', rel):
        return None
    p = os.path.join(film, rel)
    return p if os.path.realpath(p).startswith(os.path.realpath(film) + os.sep) else None


def may_upload(film, p):
    """True when `p` (links resolved) sits in the studio's films and library: the folder that holds this film's
    folder (assets/), or a library named by HARNESS_LIBRARY. A list that names any other file on the Mac uploads
    nothing for it: a film folder from elsewhere, or a misled assistant, cannot send a private file to Higgsfield."""
    rp = os.path.realpath(p)
    roots = [os.path.dirname(os.path.dirname(os.path.realpath(film)))]
    if os.environ.get('HARNESS_LIBRARY'):
        roots.append(os.path.realpath(os.path.expanduser(os.environ['HARNESS_LIBRARY'])))
    return any(rp.startswith(r + os.sep) for r in roots)


def put_one(path, ct, url):
    if not isinstance(url, str) or re.search(r'\s', url):
        return 'refused'                        # a space or a line break would end the url line of curl's config
    cfg = 'url = "' + url.replace('\\', '\\\\').replace('"', '\\"') + '"\n'
    code = '000'
    for _ in range(3):
        r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'PUT', '-H', f'Content-Type: {ct}',
                            '--data-binary', '@' + path, '-K', '-'], input=cfg, capture_output=True, text=True)
        code = r.stdout.strip() or '000'
        if code in ('200', '201', '204') or code.startswith('4'):
            break
    return code


def cmd_put(A):
    film = os.path.abspath(os.path.expanduser(A.film))
    pend_p = pending_path(film)
    pend = load(pend_p, None)
    if not pend or not any(pend.get('batches', [])):
        sys.exit(f'nothing pending ({os.path.relpath(pend_p, film)}): run plan first')
    batches = pend['batches']
    if A.batch:
        if not 1 <= A.batch <= len(batches) or not batches[A.batch - 1]:
            sys.exit(f'batch {A.batch} is not pending (batches 1 to {len(batches)}; done ones are empty)')
        bi = A.batch - 1
    else:
        bi = next(i for i, b in enumerate(batches) if b)
    batch = batches[bi]
    try:
        r = json.load(open(A.response, encoding='utf-8'))
    except (OSError, ValueError) as x:
        sys.exit(f'cannot read the response file as JSON: {type(x).__name__}')
    slots = r.get('uploads') if isinstance(r, dict) else r
    if not isinstance(slots, list) or not slots:
        sys.exit('no "uploads" list in the response file')
    if len(slots) != len(batch):
        sys.exit(f'the response has {len(slots)} slots, batch {bi + 1} has {len(batch)} files: was it this batch\'s call? nothing uploaded')
    for i, (s, it) in enumerate(zip(slots, batch)):
        if not (s.get('upload_url') and s.get('media_id')):
            sys.exit(f'slot {i + 1} has no upload_url or media_id; nothing uploaded')
        if s.get('content_type') and s['content_type'] != it['content_type']:
            sys.exit(f'slot {i + 1} is {s["content_type"]} but {it["file"]} is {it["content_type"]}: the order differs from the plan; nothing uploaded')
        if (s.get('method') or 'PUT').upper() != 'PUT':
            sys.exit(f'slot {i + 1} asks for {s.get("method")}, not PUT; nothing uploaded')
        if not isinstance(s['upload_url'], str) or re.search(r'\s', s['upload_url']):
            sys.exit(f'slot {i + 1}\'s upload_url has a space or a line break; nothing uploaded')
    reg_p = in_film(film, pend.get('registry') or os.path.relpath(registry_path(film), film))
    if not reg_p:
        sys.exit(f'{os.path.relpath(pend_p, film)} names a registry outside the film folder; nothing uploaded')
    reg = load(reg_p, {})
    done, failed, ok_files = {}, 0, set()
    today = datetime.date.today().isoformat()
    for s, it in zip(slots, batch):
        p = it['path'] if os.path.isfile(it['path']) else os.path.join(film, it['file'])
        if not os.path.isfile(p):
            print(f'FAILED {it["file"]}: the file is gone')
            failed += 1
            continue
        if not may_upload(film, p):
            print(f'REFUSED {it["file"]}: it is outside the studio\'s films and library; not uploaded')
            failed += 1
            continue
        h, size = sha1(p), os.path.getsize(p)
        code = put_one(p, it['content_type'], s['upload_url'])
        if code not in ('200', '201', '204'):
            print(f'FAILED {it["file"]}: ' + ('its upload_url has a space or a line break' if code == 'refused' else f'HTTP {code}'))
            failed += 1
            continue
        t = it['content_type'].split('/')[0]
        reg[it['file']] = {'media_id': s['media_id'], 'sha1': h, 'size': size, 'type': t, 'uploaded': today,
                           'name': it['filename']}
        done.setdefault(t, []).append(s['media_id'])
        ok_files.add(it['file'])
        print(f'ok  {it["file"]} -> {s["media_id"]}')
    save(reg_p, reg)
    if failed:
        batches[bi] = [it for it in batch if it['file'] not in ok_files]
        save(pend_p, pend)
        args = {'files': [dict(filename=x['filename'], content_type=x['content_type']) for x in batches[bi]]}
        print(f'{failed} failed; batch {bi + 1} now holds only those. Ask for new slots and put again:')
        print('  media_upload ' + json.dumps(args, ensure_ascii=False))
        if not A.keep:
            os.remove(A.response)
    else:
        batches[bi] = []
        if any(batches):
            save(pend_p, pend)
        else:
            os.remove(pend_p)
        if not A.keep:
            os.remove(A.response)
    _, ws = film_meta(film)
    print(f'registry: {os.path.relpath(reg_p, film)}. Confirm with:')
    for t, ms in done.items():
        for i in range(0, len(ms), 20):
            args = {'media_ids': ms[i:i + 20], 'type': t}
            if ws:
                args['workspace_id'] = ws
            print('media_confirm ' + json.dumps(args))
    sys.exit(1 if failed else 0)


def cmd_ids(A):
    if A.out and os.path.exists(A.out):
        sys.exit(f'{os.path.abspath(A.out)} exists: a media list is never overwritten; give the next version')
    film = find_film(A.files, A.film)
    reg_p = registry_path(film)
    reg = load(reg_p, {})
    medias, by_type, bad = [], {}, 0
    for f in A.files:
        p, key = resolve(film, f)
        e = reg.get(key)
        if e is None:
            print(f'NOT UPLOADED  {key} (run plan, then put)')
            bad += 1
            continue
        mid = entry_id(e)
        if isinstance(e, dict) and e.get('sha1') and os.path.isfile(p) and sha1(p) != e['sha1']:
            print(f'STALE  {key}: changed since its upload on {e.get("uploaded", "?")} ({mid}); upload it again')
            bad += 1
            continue
        t = (e.get('type') if isinstance(e, dict) else None) or kind(p).split('/')[0]
        note = '' if isinstance(e, dict) and e.get('sha1') else '   (old entry, no sha1: not checked for changes)'
        print(f'{mid}  {t:5}  {key}{note}')
        medias.append({'role': ROLE[t], 'value': mid})
        if mid not in by_type.setdefault(t, []):
            by_type[t].append(mid)
    if bad:
        sys.exit(f'{bad} file(s) without a valid id: nothing printed for media_confirm or medias')
    _, ws = film_meta(film)
    for t, ms in by_type.items():
        for i in range(0, len(ms), 20):
            args = {'media_ids': ms[i:i + 20], 'type': t}
            if ws:
                args['workspace_id'] = ws
            print('media_confirm ' + json.dumps(args))
    print('medias ' + json.dumps(medias))
    if A.out:
        out = os.path.abspath(A.out)
        save(out, medias)
        print(f'wrote {out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('plan', help='which files are new or changed')
    p.add_argument('film'); p.add_argument('files', nargs='+')
    p.add_argument('--no-write', action='store_true', help='print only; save no pending list')
    p.add_argument('--include-unknown', action='store_true', help='also upload files whose old entry has no sha1')
    p = sp.add_parser('put', help='PUT the files of a saved media_upload response')
    p.add_argument('film'); p.add_argument('--response', required=True)
    p.add_argument('--batch', type=int); p.add_argument('--keep', action='store_true')
    p = sp.add_parser('ids', help='media ids for media_confirm and the medias list')
    p.add_argument('files', nargs='+'); p.add_argument('--film'); p.add_argument('--out')
    A = ap.parse_args()
    {'plan': cmd_plan, 'put': cmd_put, 'ids': cmd_ids}[A.cmd](A)


if __name__ == '__main__':
    main()
