"""The record of what was sent to the model for one take (Flow v3.3 - 7 Takes, step 8): run right after generate_video
returns its job id, with the same inputs the submit used. Takes are submitted through the higgsfield MCP server, not a
script, so this records them from the files the submit was built from (and, best, from the arguments as sent).

    .venv/bin/python tools/takes/record_sent.py <film folder> --kind take|pickup|element --id <G | FIX-name | CID> --take N
        --version vN --job <job id> [--params <file>] [--seed N] [--prompt FILE] [--media-list FILE] [--take-medias FILE]
        [--submitted <ISO time>] [--dry-run]

--params  a file holding the generate_video arguments exactly as sent (model, mode, aspect_ratio, resolution, draft,
          duration, generate_audio, count, use_unlim, folder_id, seed, prompt, medias), saved with the file tool. With it
          the record holds what was really sent and says where it differs from the files. Without it the record is built
          from the prompt file, the media list's settings and the take-medias file, plus the fixed settings of step 7
          (count 1, use_unlim false, the folder of higgsfield.json).
The files, by default (vN as given; "8" means "v8"):
  take     generations/<G>/prompt/<G>-prompt-vN.txt, <G>-media-vN.json, <G>-take-medias-vN.json
  pickup   the same under generations/FIX-<name>/prompt/ (--id FIX-door-S4 or door-S4)
  element  elements/<CID>/E-<CID>-vN-5s.prompt.txt and E-<CID>-take-medias-vN.json (no media list: each reference's file
           is found by its media id in the upload registry)
Writes, beside the take, once (a re-run with the same content is accepted; anything else is refused):
  take     generations/<G>/takes/take<N>/<G>-take<N>-sent.json
  pickup   generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-sent.json
  element  elements/<CID>/takes/take<N>/E-<CID>-take<N>-sent.json
and the job id file beside it (<G>-take<N>.jobid, as land.py names it) when there is none; a job id file holding another
job is refused, so a wrong take number shows at once.

It completes what the kit already writes and replaces none of it: the prompt file, the media list and the take-medias
file (never overwritten), the upload registry (file, media id, sha1), the job id file, the spend.md row (found by the job
id; a missing row is said), and later stored-prompt.txt from the job itself (verify_prompt.py). No signed link goes
into it: any http(s) link found is replaced by "<link removed>".

The record (JSON; the app's view of it is built from this shape):
  about, written_by, written           what the file is, the script, when it was written (UTC)
  take, kind, id, take_number          "S3-take1", "take", "S3", 1
  job_id, submitted                    the job id; when it was submitted (given, else the time of writing)
  model                                "seedance_2_5"
  settings                             mode, aspect_ratio, resolution, duration, draft, generate_audio, seed (null when
                                       none was sent), count, use_unlim, folder_id, and declined_preset_id or
                                       draft_job_id when sent
  settings_from                        "the generate_video arguments as sent" or "the files and step 7"
  prompt                               file, version, text (exactly as sent), sha1 and chars of that text, same_as_file
  references                           in the order sent, each: order (1, 2 …), role (video_references …), kind (VIDEO,
                                       IMAGE, AUDIO), n and label (its number per kind as the prompt names it, "VIDEO
                                       REFERENCE 1"), tag ("MAREN", "PAGE 2"; null when no media list names it),
                                       media_id, file (film-relative: the file that media id was uploaded from, by the
                                       registry), listed_file (only when the media list names another file at that
                                       place), view / page when the media list has them, uploaded (the registry's date)
  layout                               previz_take (file and number) and storyboard (folder and version) the media list
                                       names: the layout the take was made from; null for an element
  lists                                the media list and take-medias files read
  spend                                {"row": true|false, "cost": "<the row's cost cell>"}
  differences                          plain-words list: where the arguments as sent differ from the files, a reference
                                       whose media id is not the registry's for its file, a missing spend row"""
import argparse, datetime, hashlib, json, os, re, sys

URL = re.compile(r'https?://\S+')
ROLE_KIND = {'video_references': 'VIDEO', 'image_references': 'IMAGE', 'audio_references': 'AUDIO'}
STEP7 = {'count': 1, 'use_unlim': False}
SETTING_KEYS = ['mode', 'aspect_ratio', 'resolution', 'duration', 'draft', 'generate_audio', 'seed', 'count', 'use_unlim',
                'folder_id', 'declined_preset_id', 'draft_job_id']


def load(p, default=None):
    return json.load(open(p, encoding='utf-8')) if p and os.path.exists(p) else default


def scrub(x, found):
    if isinstance(x, str):
        if URL.search(x):
            found.append(x[:40]); return URL.sub('<link removed>', x)
        return x
    if isinstance(x, list): return [scrub(v, found) for v in x]
    if isinstance(x, dict): return {k: scrub(v, found) for k, v in x.items()}
    return x


def registry_path(film):
    new, old = os.path.join(film, 'generations', 'upload-registry.json'), os.path.join(film, 'blocks', 'upload-registry.json')
    return new if os.path.exists(new) or not os.path.exists(old) else old


def paths(film, kind, gid, take, v):
    """(id, prompt, media list, take-medias, take folder, stem) for this take."""
    if kind == 'element':
        cid = re.sub(r'^E-', '', gid); base = os.path.join(film, 'elements', cid)
        return (cid, os.path.join(base, f'E-{cid}-{v}-5s.prompt.txt'), None, os.path.join(base, f'E-{cid}-take-medias-{v}.json'),
                os.path.join(base, 'takes', f'take{take}'), f'E-{cid}-take{take}')
    if kind == 'pickup' and not gid.startswith('FIX-'):
        gid = 'FIX-' + gid
    pr = os.path.join(film, 'generations', gid, 'prompt')
    return (gid, os.path.join(pr, f'{gid}-prompt-{v}.txt'), os.path.join(pr, f'{gid}-media-{v}.json'),
            os.path.join(pr, f'{gid}-take-medias-{v}.json'), os.path.join(film, 'generations', gid, 'takes', f'take{take}'), f'{gid}-take{take}')


def spend_row(film, job):
    p = os.path.join(film, 'spend.md')
    if not os.path.exists(p): return {'row': False}
    for line in open(p, encoding='utf-8'):
        if job in line and line.lstrip().startswith('|'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            return {'row': True, **({'cost': cells[6]} if len(cells) > 6 else {})}
    return {'row': False}


def build(A):
    film = os.path.abspath(os.path.expanduser(A.film))
    v = A.version if A.version.startswith('v') else 'v' + A.version
    gid, prompt_p, media_p, tm_p, folder, stem = paths(film, A.kind, A.id, A.take, v)
    prompt_p, media_p, tm_p = A.prompt or prompt_p, A.media_list or media_p, A.take_medias or tm_p
    rel = lambda p: os.path.relpath(os.path.realpath(p), os.path.realpath(film)) if p else None
    diffs = []
    if not os.path.exists(prompt_p): sys.exit(f'no prompt file {rel(prompt_p)} (give --prompt)')
    file_text = open(prompt_p, encoding='utf-8').read().rstrip('\n')
    ml = load(media_p) if A.kind != 'element' else None
    if A.kind != 'element' and ml is None: sys.exit(f'no media list {rel(media_p)} (give --media-list)')
    tm = load(tm_p)
    params = load(A.params) if A.params else None
    if A.params and params is None: sys.exit(f'no such file: {A.params}')
    if tm is None and not params: sys.exit(f'no take-medias file {rel(tm_p)} and no --params: the media ids sent are unknown')
    h = load(os.path.join(film, 'higgsfield.json'), {})
    reg = load(registry_path(film), {})
    by_id = {}
    for f, e in reg.items():
        mid = e.get('media_id') if isinstance(e, dict) else e
        if mid: by_id.setdefault(mid, f)

    # the prompt
    if params is not None and isinstance(params.get('prompt'), str):
        text = params['prompt']
        same = text.rstrip('\n') == file_text
        if not same: diffs.append(f'the prompt sent differs from {rel(prompt_p)}')
    else:
        text, same = file_text, True

    # the settings
    if params is not None:
        model = params.get('model')
        settings = {k: params.get(k) for k in SETTING_KEYS if k in params or k == 'seed'}
        settings_from = 'the generate_video arguments as sent'
        mset = (ml or {}).get('settings') or {}
        for k in ('mode', 'aspect_ratio', 'resolution', 'duration', 'draft', 'generate_audio'):
            if k in mset and k in params and mset[k] != params[k]:
                diffs.append(f'{k}: {params[k]!r} sent, {mset[k]!r} in the media list')
    else:
        mset = dict((ml or {}).get('settings') or {})
        model = mset.pop('model', 'seedance_2_5')
        folders = (h.get('folders') or {})
        fid = folders.get('cast') if A.kind == 'element' else (folders.get('generations') or {}).get(gid)
        settings = {**{k: mset.get(k) for k in ('mode', 'aspect_ratio', 'resolution', 'duration', 'draft', 'generate_audio')},
                    'seed': None, **STEP7, **({'folder_id': fid} if fid else {})}
        settings_from = 'the files and step 7'
    if A.seed is not None:
        if settings.get('seed') not in (None, A.seed): diffs.append(f'seed: {settings["seed"]} in the arguments, {A.seed} given')
        settings['seed'] = A.seed

    # the references, in the order sent
    sent = params.get('medias') if params is not None and params.get('medias') is not None else tm
    if params is not None and tm is not None and params.get('medias') is not None and params['medias'] != tm:
        diffs.append(f'the medias sent differ from {rel(tm_p)}')
    entries = (ml or {}).get('media') or []
    if ml is not None and len(entries) != len(sent):
        diffs.append(f'{len(sent)} references sent, {len(entries)} in the media list')
    refs, per_kind = [], {}
    for i, m in enumerate(sent):
        role, mid = m.get('role'), m.get('value')
        kind = ROLE_KIND.get(role, (role or '?').split('_')[0].upper())
        per_kind[kind] = per_kind.get(kind, 0) + 1
        e = entries[i] if i < len(entries) else {}
        f = e.get('file')
        if e and e.get('role') and e['role'] != role:
            diffs.append(f'reference {i + 1}: sent as {role}, the media list says {e["role"]}')
        listed = None
        if f:
            re_ = reg.get(f); rid = re_.get('media_id') if isinstance(re_, dict) else re_
            if rid and rid != mid:
                owner = by_id.get(mid)
                diffs.append(f'reference {i + 1} ({e.get("tag")}): media id {mid} is not the registry\'s for {f}' + (f' (it is {owner}\'s)' if owner else ''))
                if owner: f, listed = owner, f       # the file the id was uploaded from is what was sent
        else:
            f = by_id.get(mid)
        n = e.get('n') or per_kind[kind]
        r = {'order': i + 1, 'role': role, 'kind': kind, 'n': n, 'label': f'{kind} REFERENCE {n}', 'tag': e.get('tag'),
             'media_id': mid, 'file': f}
        if listed: r['listed_file'] = listed
        for k in ('view', 'page'):
            if k in e: r[k] = e[k]
        ent = reg.get(f) if f else None
        if isinstance(ent, dict) and ent.get('uploaded'): r['uploaded'] = ent['uploaded']
        if not f: diffs.append(f'reference {i + 1}: media id {mid} is not in the upload registry')
        refs.append(r)

    # the layout the take was made from
    layout = None
    if ml is not None:
        pt, sb = ml.get('previz_take'), ml.get('storyboard')
        layout = {'previz_take': pt, 'previz_take_number': int(re.search(r'take-(\d+)', pt).group(1)) if pt and re.search(r'take-(\d+)', pt) else None,
                  'storyboard': sb, 'storyboard_version': (re.search(r'/(v\d+)/?$', sb) or [None, None])[1] if sb else None}

    sp = spend_row(film, A.job)
    if not sp['row']: diffs.append('no spend.md row with this job id yet (step 8 writes it at submission)')
    now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
    rec = {
        'about': 'What was sent to the model for this take, written at submission (Flow v3.3 - 7 Takes, step 8).',
        'written_by': 'tools/takes/record_sent.py', 'written': now,
        'take': stem, 'kind': A.kind, 'id': gid, 'take_number': A.take,
        'job_id': A.job, 'submitted': A.submitted or now,
        'model': model, 'settings': settings, 'settings_from': settings_from,
        'prompt': {'file': rel(prompt_p), 'version': v, 'text': text, 'sha1': hashlib.sha1(text.encode('utf-8')).hexdigest(),
                   'chars': len(text), 'same_as_file': same},
        'references': refs, 'layout': layout,
        'lists': {'media_list': rel(media_p) if ml is not None else None, 'take_medias': rel(tm_p) if tm is not None else None},
        'spend': sp, 'differences': diffs,
    }
    found = []
    rec = scrub(rec, found)
    if found: print(f'warning: {len(found)} link(s) found and removed from the record')
    return film, folder, stem, rec


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('film')
    ap.add_argument('--kind', default='take', choices=['take', 'pickup', 'element'])
    ap.add_argument('--id', required=True, help='S3, FIX-door-S4 (or door-S4) or C01')
    ap.add_argument('--take', required=True, type=int)
    ap.add_argument('--version', required=True, help='the prompt version sent: v8 (or 8)')
    ap.add_argument('--job', required=True, help='the job id generate_video returned')
    ap.add_argument('--params', help='the generate_video arguments exactly as sent, saved to a file')
    ap.add_argument('--seed', type=int)
    ap.add_argument('--prompt'); ap.add_argument('--media-list'); ap.add_argument('--take-medias')
    ap.add_argument('--submitted', help='when it was submitted, ISO time (default: now)')
    ap.add_argument('--dry-run', action='store_true', help='print the record; write nothing')
    A = ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9-]{6,}', A.job.strip()): sys.exit(f'--job does not look like a job id: {A.job!r}')
    A.job = A.job.strip()
    film, folder, stem, rec = build(A)
    out = os.path.join(folder, f'{stem}-sent.json')
    jobid = os.path.join(folder, f'{stem}.jobid')
    shown = os.path.relpath(out, film)
    if A.dry_run:
        print(json.dumps(rec, indent=1, ensure_ascii=False)); print(f'dry run: would write {shown}'); return
    if os.path.exists(jobid) and open(jobid).read().strip() != A.job:
        sys.exit(f'{os.path.relpath(jobid, film)} holds another job ({open(jobid).read().strip()}); is --take right? nothing written')
    if os.path.exists(out):
        old = load(out)
        keep = lambda r: {k: v for k, v in r.items() if k not in ('written', 'submitted')}
        if keep(old) == keep(rec):
            print(f'{shown} is there already with the same content'); return
        sys.exit(f'{shown} exists with other content: a record is never written over (is --take right?)')
    os.makedirs(folder, exist_ok=True)
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(rec, f, indent=1, ensure_ascii=False); f.write('\n')
    os.replace(tmp, out)
    if not os.path.exists(jobid):
        with open(jobid, 'w') as f: f.write(A.job + '\n')
    s = rec['settings']
    print(f'wrote {shown}: {rec["model"]} {s.get("mode")}, {s.get("aspect_ratio")}, {s.get("resolution")}'
          f'{" draft" if s.get("draft") else ""}, {s.get("duration")} s, audio {"on" if s.get("generate_audio") else "off"}, '
          f'seed {s.get("seed")}; prompt {rec["prompt"]["version"]} ({rec["prompt"]["chars"]} chars); {len(rec["references"])} references; '
          f'from {rec["settings_from"]}')
    for d in rec['differences']:
        print('  note:', d)


if __name__ == '__main__':
    main()
