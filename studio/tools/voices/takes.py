"""Alternative deliveries of one line for the user to choose by ear, then the pick made the line's recording. Calls no
service: Alma speaks the takes on Higgsfield (elevenlabs_v4, CAPS on a stressed word or a short non-verbal; batch_size
up to 4 for variations of one text) and saves them; this script checks, trims and lists them.
    FILM=<film> .venv/bin/python tools/voices/takes.py V17 --add A audio/takes/V17-A.mp3 --add B audio/takes/V17-B.mp3
        [--text A "<the text as sent>"]
    FILM=<film> .venv/bin/python tools/voices/takes.py V17 --choose A --note '<the user's words, the date>'
Each take is checked by its transcript (Whisper on this Mac) against the line's words, trimmed to its speech edges and
sped up by the line's tempo, so takes compare like for like with the current one. The raw file stays where it is; the
trimmed take goes to audio/takes/<VID>-take<X>.wav and into lines.json 'alternates'. --choose copies the take over the
line's file (the old file is kept), sets chosen_take and note; then update the line's tags/text in voices/spec.py to the
chosen take, and run pad_short.py and record.py --read."""
import json, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film
from measure import dur, f0, speech_edges

F = film.film_root(); S_ = film.load_spec(F, required=False); EQ = getattr(S_, 'EQUIV', {}) if S_ else {}
a = sys.argv[1:]
if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
lid = a[0]
L = film.load_lines(F); idx = next(k for k, x in enumerate(L) if x.get('id') == lid); l = L[idx]
D = os.path.join(F, 'audio', 'takes'); os.makedirs(D, exist_ok=True)
takes, texts, i = [], {}, 1
while i < len(a):
    if a[i] in ('--add', '--take'): takes.append((a[i + 1], a[i + 2])); i += 3
    elif a[i] == '--text': texts[a[i + 1]] = a[i + 2]; i += 3
    else: i += 1
choose = a[a.index('--choose') + 1] if '--choose' in a else None
note = a[a.index('--note') + 1] if '--note' in a else None
tempo = float(l.get('tempo', 1.0)); words = (l.get('text') or '').replace('(beat)', ' ')

if takes:
    alts = [x for x in l.get('alternates', []) if x['take'] not in {t for t, _ in takes}]
    for name, src in takes:
        raw = src if os.path.isabs(src) else (os.path.join(F, src) if os.path.exists(os.path.join(F, src)) else os.path.abspath(src))
        if not os.path.isfile(raw): sys.exit(f'no such take file: {src}')
        tr = film.stt_text(raw)
        ok = film.canon(tr, EQ) == film.canon(words, EQ) and '[' not in tr and '(' not in tr
        trimmed = os.path.join(D, f'{lid}-take{name}-trim.wav'); film.trim(raw, trimmed)
        out = os.path.join(D, f'{lid}-take{name}.wav')
        if abs(tempo - 1.0) > 1e-6: film.atempo(trimmed, out, tempo)
        else: shutil.copy(trimmed, out)
        os.remove(trimmed)
        alts.append(dict(take=name, tts_text=texts.get(name), raw=os.path.relpath(raw, F), file=os.path.relpath(out, F),
                         verified=ok, transcript=tr, seconds=round(dur(out), 2), f0=f0(out), tempo=tempo))
        print(name, 'OK ' if ok else 'CHECK', repr(tr), alts[-1]['seconds'], 's', alts[-1]['f0'], 'Hz')
    l['alternates'] = alts
    film.save_lines(F, L)
    print('takes on the line; put them on a card that asks, then: takes.py', lid, '--choose <X> --note "..."')

if choose:
    t = next(x for x in l.get('alternates', []) if x['take'] == choose)
    dst = film.path_of(F, l['file']); kept = film.keep_previous(F, dst)
    film.ff('-i', film.path_of(F, t['file']), '-ar', '44100', '-ac', '1', dst)
    l['alternates'] = [x for x in l['alternates'] if x['take'] != choose] + ([dict(take='previous', file=kept)] if kept else [])
    l.update(chosen_take=choose, tts_text=t.get('tts_text') or l.get('tts_text'), transcript=t['transcript'], verified=t['verified'], seconds=round(dur(dst), 2),
             f0=f0(dst), tempo=t.get('tempo', tempo), padded_file=None, padded_seconds=None)
    l['speech_start'], l['speech_end'] = speech_edges(dst)
    l['previous'] = list(l.get('previous', [])) + ([kept] if kept else [])
    if note: l['note'] = note
    l.pop('sig', None)
    film.save_lines(F, L)
    print(lid, 'is now take', choose, '| update its tags/text in voices/spec.py, then pad_short.py and record.py --read')
