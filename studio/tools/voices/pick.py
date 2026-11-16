"""Record the user's voice pick in voices/cast.json and the chosen option in voices/options.json. Calls no service: every
Higgsfield voice job is made by Alma through the MCP server, and this script only writes down what was picked.
    FILM=<film> .venv/bin/python tools/voices/pick.py C01 3 --note '<the user's words, the date>'     option 3 of options.json
    FILM=<film> .venv/bin/python tools/voices/pick.py C01 --voice-id <id> [--voice-type preset|element] --source '<text>'
        [--note '...']                                                                            a voice Higgsfield can reuse
With an option number: the option's voice_id and voice_type go into cast.json when it has one (a preset is reusable as it
is); a voice from the face or a variant has none until it is saved with create_voice_from_confirmed_audio, and then
--voice-id records the saved voice (its source keeps "option N"). cast.json per character: name, voice_id (only for a
voice Higgsfield can reuse), voice_type, source, note, model. A changed voice keeps the old one under "history".
  --test   prints how to hear the picked voice on the character's sample lines (no call is made here)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film

if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0)
F = film.film_root(); S_ = film.load_spec(F, required=False)
SPEC = getattr(S_, 'SPEC', {}) if S_ else {}
a = sys.argv[1:]
def opt(name, default=None):
    if name in a:
        i = a.index(name); v = a[i + 1]; del a[i:i + 2]; return v
    return default
note = opt('--note', ''); vid = opt('--voice-id'); vtype = opt('--voice-type'); source = opt('--source')
test = '--test' in a; a = [x for x in a if x != '--test']
if vtype and vtype not in ('preset', 'element'):
    sys.exit('--voice-type is preset or element')
if not a:
    sys.exit(__doc__)
cid = a[0]; num = int(a[1]) if len(a) > 1 else None
H = os.path.join(F, 'voices'); os.makedirs(H, exist_ok=True)
oj = os.path.join(H, 'options.json'); O = json.load(open(oj)) if os.path.exists(oj) else {}
cj = os.path.join(H, 'cast.json'); C = json.load(open(cj)) if os.path.exists(cj) else {}
name = (SPEC.get(cid) or O.get(cid) or C.get(cid) or {}).get('name', cid)
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
    O[cid]['chosen'] = dict(option=num, note=note, voice_id=vid)
    if vtype: O[cid]['chosen']['voice_type'] = vtype
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
    sys.exit('say which voice: an option number, or --voice-id ID')

row = C.setdefault(cid, {})
if row.get('voice_id') and vid and row.get('voice_id') != vid:
    row.setdefault('history', []).append({k: row[k] for k in ('voice_id', 'voice_type', 'source') if k in row})
row['name'] = name
if vid:
    row['voice_id'] = vid
if vtype:
    row['voice_type'] = vtype
row['source'] = source
row['model'] = 'elevenlabs_v4'
if note:
    row['note'] = note
json.dump(C, open(cj, 'w'), indent=1, ensure_ascii=False)
if O:
    json.dump(O, open(oj, 'w'), indent=1, ensure_ascii=False)
print(cid, name, '->', vid or '(not saved yet)', '|', vtype or '-', '|', row['source'])
if not vid:
    print('  next: save the voice from the option\'s file (upload it, create_voice_from_confirmed_audio), then\n'
          f'  pick.py {cid} --voice-id <the saved id> --voice-type element')

if test:
    samples = SPEC.get(cid, {}).get('samples', [])
    if not vid:
        print('  --test: the voice is not saved yet, so nothing can speak in it')
    for k, (line, tags) in enumerate(samples, 1):
        fn = os.path.join('voices', 'options', f'{cid}-{name.lower()}-pick-{k}.mp3')
        print(f'  sample {k}: generate_audio elevenlabs_v4, dialogue [{{text: "[{tags}] {line}", voice_type: {vtype}, '
              f'voice_id: {vid}}}] -> {fn}; then measure.py {fn}')
