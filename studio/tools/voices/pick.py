"""Record the user's voice pick in voices/cast.json and the chosen option in voices/options.json (Flow v3.3 - 3 Voices
and video elements, steps 5 and 6). Calls no service: every Higgsfield voice job is made by Alma through the MCP server,
and this script only writes down what was picked. A pick is recorded, never saved: its preview file and the user's words.
The video model learns the voice from the element line cut from that preview (element_line.py); a voice is saved on
Higgsfield only when a later job must speak new words in it, and then --voice-id records the saved voice.
    FILM=<film> .venv/bin/python tools/voices/pick.py C01 3 --note '<the user's words, the date>'     option 3 of options.json
    FILM=<film> .venv/bin/python tools/voices/pick.py C01 --preview FILE --note '...'     any preview file as the pick (another
                                                                            character's option, a library voice's preview)
    FILM=<film> .venv/bin/python tools/voices/pick.py C01 --voice-id <id> [--voice-type preset|element] --source '<text>'
        [--note '...']                                                                            a voice Higgsfield can reuse
With an option number: the option's voice_id and voice_type go into cast.json when it has one (a preset is reusable as it
is); a voice from the face or a variant has none until it is saved with create_voice_from_confirmed_audio, and then
--voice-id records the saved voice (its source keeps "option N"). cast.json per character: name, voice_id (only for a
voice Higgsfield can reuse), voice_type, source, preview (the picked preview file, film-relative), note, model. A changed
voice keeps the old one under "history", so a saved voice is never lost. Old cast.json entries (a voice id and no
preview) read as they are. The
character's name comes from options.json, else cast.json, else its folder (cast/C01-agnes: Agnes).
  --test   prints how to hear the picked voice on the character's sample lines, from voices/spec.py (no call is made
           here); only --test loads spec.py, which is the film's own Python: a plain pick, which the harness runs on
           every press, never runs it"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0)
F = film.film_root()
a = sys.argv[1:]
def opt(name, default=None):
    if name in a:
        i = a.index(name); v = a[i + 1]; del a[i:i + 2]; return v
    return default
note = opt('--note', ''); preview_arg = opt('--preview'); vid = opt('--voice-id'); vtype = opt('--voice-type'); source = opt('--source')
test = '--test' in a; a = [x for x in a if x != '--test']
S_ = film.load_spec(F, required=False) if test else None
SPEC = getattr(S_, 'SPEC', {}) if S_ else {}
if vtype and vtype not in ('preset', 'element'):
    sys.exit('--voice-type is preset or element')
if not a:
    sys.exit(__doc__)
cid = a[0]; num = int(a[1]) if len(a) > 1 else None
preview = None
H = os.path.join(F, 'voices'); os.makedirs(H, exist_ok=True)
oj = os.path.join(H, 'options.json'); O = json.load(open(oj)) if os.path.exists(oj) else {}
cj = os.path.join(H, 'cast.json'); C = json.load(open(cj)) if os.path.exists(cj) else {}
def folder_name(cid):
    """'Agnes' from the character's folder cast/C01-agnes, as the harness names it; None without one."""
    d = os.path.join(F, 'cast')
    for n in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if n.startswith(cid + '-') and os.path.isdir(os.path.join(d, n)):
            return ' '.join(w[:1].upper() + w[1:] for w in re.split(r'[-_ ]+', n[len(cid) + 1:]) if w) or None
    return None
name = ((SPEC.get(cid) or {}).get('name') or (O.get(cid) or {}).get('name') or (C.get(cid) or {}).get('name')
        or folder_name(cid) or cid)
model = None

if num is not None:
    if cid not in O:
        sys.exit(f'voices/options.json has no {cid}')
    o = next((x for x in O[cid].get('options', []) if x.get('option') == num), None)
    if not o:
        sys.exit(f'voices/options.json has no option {num} for {cid}')
    kind = o.get('kind')
    vid = vid or o.get('voice_id')
    vtype = vtype or o.get('voice_type') or ('preset' if kind == 'preset' and vid else None)
    if kind == 'variant':
        vid, vtype = (vid if vtype == 'element' else None), (vtype if vtype == 'element' else None)
    what = {'preset': 'preset', 'face': 'from the face', 'variant': 'variant'}.get(kind, '')
    source = source or (f'{what} option {num}'.strip() + (f" ({o['round']} round)" if o.get('round') else ''))
    preview = o.get('file')
    O[cid]['chosen'] = dict(option=num, note=note, voice_id=vid)
    if vtype: O[cid]['chosen']['voice_type'] = vtype
elif preview_arg:
    pp = film.path_of(F, preview_arg)
    if not os.path.isfile(pp):
        sys.exit(f'no such preview file: {preview_arg}')
    rp, rf = os.path.realpath(pp), os.path.realpath(F)
    preview = os.path.relpath(rp, rf) if rp.startswith(rf + os.sep) else rp
    hit = next(((k, x) for k, v in O.items() for x in (v.get('options') or []) if x.get('file') == preview), (None, None))
    source = source or (f'option {hit[1]["option"]} of {hit[0]}' if hit[0] else f'the preview {os.path.basename(preview)}')
    if not vid and hit[1] and hit[1].get('kind') == 'preset' and hit[1].get('voice_id'):
        vid, vtype = hit[1]['voice_id'], vtype or hit[1].get('voice_type') or 'preset'    # a preset is reusable as it is
    if hit[0] == cid:
        O[cid]['chosen'] = dict(option=hit[1]['option'], note=note, voice_id=vid)
    elif cid in O:
        O[cid]['chosen'] = dict(preview=preview, note=note, voice_id=vid)
    if vid and not vtype and hit[1]:
        vtype = hit[1].get('voice_type')
elif vid:
    ch = (O.get(cid) or {}).get('chosen')
    if ch:                                      # the saved voice of the picked option
        ch['voice_id'] = vid
        if vtype: ch['voice_type'] = vtype
    if not source:
        source = (C.get(cid) or {}).get('source') or 'voice id given by hand'
    if not vtype:
        o = next((x for x in (O.get(cid) or {}).get('options', []) if x.get('voice_id') == vid), None)
        vtype = (o or {}).get('voice_type')
else:
    sys.exit('say which voice: an option number, --preview FILE, or --voice-id ID')

row = C.setdefault(cid, {})
if (row.get('voice_id') and row.get('voice_id') != vid and (vid or preview)) or (preview and row.get('preview') and row['preview'] != preview):
    row.setdefault('history', []).append({k: row[k] for k in ('voice_id', 'voice_type', 'source', 'preview', 'note') if k in row})
    if not vid:
        row.pop('voice_id', None); row.pop('voice_type', None)
row['name'] = name
if vid:
    row['voice_id'] = vid
if vtype:
    row['voice_type'] = vtype
row['source'] = source
if preview:
    row['preview'] = preview
row['model'] = 'elevenlabs_v4'
if note:
    row['note'] = note
json.dump(C, open(cj, 'w'), indent=1, ensure_ascii=False)
if O:
    json.dump(O, open(oj, 'w'), indent=1, ensure_ascii=False)
print(cid, name, '->', vid or '(recorded, not saved)', '|', vtype or '-', '|', row['source'])
if not vid:
    print('  recorded: the preview is the voice; element_line.py cuts the element line from it. Only if a later job must\n'
          '  speak new words in it: save it (upload the preview, create_voice_from_confirmed_audio), then\n'
          f'  pick.py {cid} --voice-id <the saved id> --voice-type element')

if test:
    samples = SPEC.get(cid, {}).get('samples', [])
    if not vid:
        print('  --test: the voice is not saved yet, so nothing can speak in it')
    for k, (line, tags) in enumerate(samples, 1):
        fn = os.path.join('voices', 'options', f'{cid}-{name.lower()}-pick-{k}.mp3')
        print(f'  sample {k}: generate_audio elevenlabs_v4, dialogue [{{text: "[{tags}] {line}", voice_type: {vtype}, '
              f'voice_id: {vid}}}] -> {fn}; then measure.py {fn}')
