"""Cut the element line, "This is how I look and this is how I sound.", from the picked candidate itself, exactly as
it sounds: no new take, no tags, no speed change, no clean-up (Flow v3.3 - 3 Voices and video elements, step 7).
    FILM=<film> .venv/bin/python tools/voices/element_line.py C02 [--option N | --preview FILE] [--dry-run] [--force]
        [--out-dir DIR] [--transcribe]
The candidate is the chosen option's file in voices/options.json (or option N of it, or FILE: a picked preset speaks the
line in a take of its own, voices/options/<CID>-<name>-element-take.mp3), else the picked preview pick.py recorded in
voices/cast.json ("preview": a pick from another character's options or the library). Its word times come from <file>.stt.json
beside it (what `transcribe.py --audio <file> --words-out <file>.stt.json` writes: a list of words, or {"words": [...]});
without one, Whisper runs here on this Mac (free) and writes it. The cut runs from 0.1 s before
"This" to 0.35 s after "sound", or to the middle of the pause when the next word starts sooner, with a 40 ms fade at each
end. Writes cast/<CID>-<name>/voice/element-line-5s.mp3, the whole preview as element-line-5s-raw.mp3 beside it, and the
character's entry in voices/element-lines-5s.json (name, option, voice_id and voice_type when known, note, raw, file,
seconds_raw, seconds, transcript, f0 measured as measure.py does), keeping the file's shape (a list with "character", or a
map by ID; a new file is a list).
  --dry-run     say what it would do; write nothing
  --force       replace an existing element line (the old pair is kept as element-line-5s[-raw]-replacedN.mp3)
  --out-dir DIR write the cast/ and voices/ outputs under DIR instead of the film folder (tests)
  --transcribe  transcribe the cut itself for the transcript; by default it is the candidate's words in the cut"""
import glob, json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film
from measure import f0

LINE = 'This is how I look and this is how I sound.'
LEAD, TAIL, FADE = 0.10, 0.35, 0.04
F = film.film_root(); a = sys.argv[1:]
def opt(name, default=None):
    if name in a:
        i = a.index(name); v = a[i + 1]; del a[i:i + 2]; return v
    return default
num = opt('--option'); pv = opt('--preview'); out = opt('--out-dir')
dry, force, trans = '--dry-run' in a, '--force' in a, '--transcribe' in a
a = [x for x in a if x not in ('--dry-run', '--force', '--transcribe')]
if not a: sys.exit(__doc__)
cid = a[0]; H = os.path.join(F, 'voices'); B = os.path.abspath(out) if out else F
load = lambda p: json.load(open(p)) if os.path.exists(p) else {}
O, C = load(os.path.join(H, 'options.json')).get(cid, {}), load(os.path.join(H, 'cast.json')).get(cid, {})

# ---- the preview
if pv:
    src, how = film.path_of(F, pv), 'the preview given'
else:
    n = int(num) if num else (O.get('chosen') or {}).get('option')
    o = next((x for x in O.get('options', []) if x['option'] == n), None) if n else None
    if o:
        src, how = os.path.join(F, o['file']), f'option {n}' + ('' if num else ' (the chosen one in options.json)')
    elif C.get('preview'):
        src, how = film.path_of(F, C['preview']), 'the picked preview in voices/cast.json'
    else:
        sys.exit(f'{cid}: no picked option in voices/options.json and no preview in voices/cast.json: give --option N or --preview FILE')
if not os.path.exists(src): sys.exit(f'missing preview {src}')
name = C.get('name') or O.get('name') or cid
n_opt = None if pv else (int(num) if num else (O.get('chosen') or {}).get('option'))
cd = next(iter(sorted(glob.glob(os.path.join(F, 'cast', f'{cid}-*')))), None)
folder = os.path.basename(cd) if cd and os.path.isdir(cd) else f'{cid}-{name.lower()}'
rel = lambda p: os.path.relpath(p, F) if os.path.abspath(p).startswith(F + os.sep) else os.path.abspath(p)

# ---- the word times
sj = os.path.splitext(src)[0] + '.stt.json'
sj2 = src + '.stt.json'                 # also read <name>.mp3.stt.json, as the note names it
if not os.path.exists(sj) and os.path.exists(sj2): sj = sj2
if os.path.exists(sj):
    W = json.load(open(sj)); W = W['words'] if isinstance(W, dict) else W
elif dry:
    sys.exit(f'{cid}: {rel(src)} has no word times beside it ({os.path.basename(sj)}); a real run runs Whisper first')
else:
    W = film.stt_words(src)
    if not W: sys.exit(f'{cid}: Whisper heard no words in {rel(src)}')
    sj = os.path.join(B, rel(sj)) if out else sj; os.makedirs(os.path.dirname(sj), exist_ok=True)
    json.dump(W, open(sj, 'w'), indent=1); print('word times ->', sj)
W = [dict(w, type=w.get('type') or 'word') for w in W]
W = [w for w in W if w['type'] in ('word', 'audio_event')]
toks = [(i, t) for i, w in enumerate(W) if w['type'] == 'word' for t in film.canon(w['text'])]
want = film.canon(LINE)
k = next((j for j in range(len(toks) - len(want) + 1) if [t for _, t in toks[j:j + len(want)]] == want), None)
if k is None:
    sys.exit(f'{cid}: the element line is not in {rel(src)}: it starts "' + ' '.join(w['text'] for w in W[:12]) + '"')
i0, i1 = toks[k][0], toks[k + len(want) - 1][0]
nxt = W[i1 + 1] if i1 + 1 < len(W) else None
t0, end = max(0.0, W[i0]['start'] - LEAD), W[i1]['end'] + TAIL
t1 = (W[i1]['end'] + nxt['start']) / 2 if nxt and nxt['start'] < end else min(end, film.dur(src))
said = ' '.join(w['text'].strip() for w in W[i0:i1 + 1])

# ---- the outputs
vd = os.path.join(B, 'cast', folder, 'voice'); cut, raw = os.path.join(vd, 'element-line-5s.mp3'), os.path.join(vd, 'element-line-5s-raw.mp3')
jp = os.path.join(B, 'voices', 'element-lines-5s.json')
print(f'{cid} {name}: {how}, {rel(src)}')
print(f'  "{said}" {W[i0]["start"]:.2f}-{W[i1]["end"]:.2f} s; next: ' + (f'"{nxt["text"].strip()}" at {nxt["start"]:.2f} s' if nxt else 'nothing'))
print(f'  cut {t0:.3f}-{t1:.3f} s ({t1 - t0:.2f} s), {FADE * 1000:.0f} ms fades -> {cut}')
if os.path.exists(cut) and not force:
    sys.exit(f'  {cut} exists: pass --force to replace it (the old pair is kept)')
if dry:
    print(f'  dry run: would write {cut}, {raw} (the whole preview, {film.dur(src):.2f} s) and the {cid} entry of {jp}'
          + (' (replacing the existing pair, kept as -replacedN)' if os.path.exists(cut) else '')); sys.exit(0)
os.makedirs(vd, exist_ok=True); old = None
if os.path.exists(cut):
    n = 1
    while os.path.exists(os.path.join(vd, f'element-line-5s-replaced{n}.mp3')): n += 1
    old = os.path.join(vd, f'element-line-5s-replaced{n}.mp3'); shutil.move(cut, old)
    if os.path.exists(raw): shutil.move(raw, os.path.join(vd, f'element-line-5s-raw-replaced{n}.mp3'))
film.ff('-i', src, '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}',
        '-af', f'afade=t=in:d={FADE},afade=t=out:st={max(0, t1 - t0 - FADE):.3f}:d={FADE}', '-c:a', 'libmp3lame', '-b:a', '128k', cut)
shutil.copy2(src, raw)
tr = film.stt_text(cut) if trans else ' '.join(w['text'].strip() for w in W if w['type'] == 'word' and w['start'] >= t0 and w['end'] <= t1)
e = dict(name=name)
if n_opt is not None: e['option'] = n_opt
vid = C.get('voice_id') or (O.get('chosen') or {}).get('voice_id')
if vid: e['voice_id'] = vid
vty = C.get('voice_type') or (O.get('chosen') or {}).get('voice_type')
if vty: e['voice_type'] = vty
nt = C.get('note') or (O.get('chosen') or {}).get('note')
if nt: e['note'] = nt
e.update(raw=os.path.relpath(raw, B), file=os.path.relpath(cut, B), seconds_raw=round(film.dur(raw), 2), seconds=round(film.dur(cut), 2),
         transcript=tr if isinstance(tr, str) else str(tr), f0=f0(cut),
         source=f'the picked candidate ({rel(src)}), {t0:.2f}-{t1:.2f} s, cut by element_line.py')
J = json.load(open(jp)) if os.path.exists(jp) else (json.load(open(os.path.join(H, 'element-lines-5s.json'))) if out and os.path.exists(os.path.join(H, 'element-lines-5s.json')) else [])
if isinstance(J, list):
    prev = next((x for x in J if x.get('character') == cid), None); e = dict(character=cid, **e)
    if prev and old: e['previous'] = {k_: v for k_, v in prev.items() if k_ != 'previous'}
    J = [e if x is prev else x for x in J] if prev else J + [e]
else:
    if J.get(cid) and old: e['previous'] = {k_: v for k_, v in J[cid].items() if k_ != 'previous'}
    J[cid] = e
os.makedirs(os.path.dirname(jp), exist_ok=True); json.dump(J, open(jp, 'w'), indent=1, ensure_ascii=False)
print(f'  wrote {e["seconds"]} s, f0 {e["f0"]} Hz, "{e["transcript"]}"; raw {e["seconds_raw"]} s' + (f'; the old one kept as {os.path.basename(old)}' if old else ''))
print('  ->', jp)
