"""Speed up recorded lines (pitch kept, ffmpeg atempo), re-verify them by transcript (Whisper on this Mac), and keep the
originals. Make a line faster before making its shot longer; 1.1-1.45x works.
    FILM=<film> .venv/bin/python tools/voices/speed_up.py V04 --factor 1.15
    FILM=<film> .venv/bin/python tools/voices/speed_up.py V04 --target 5.1   (seconds; factor = current / target, never slower)
    FILM=<film> .venv/bin/python tools/voices/speed_up.py --all --factor 1.2 (every line: "the whole read is too slow")
    ... [--no-verify]                                      skip the transcript check (lines marked unverified)
Updates audio/lines.json (seconds, tempo, transcript, verified, speech edges, previous, note). For --all, also set TEMPO
in voices/spec.py so lines recorded later match. Then run pad_short.py and record.py --read (new table read and starts). For a brisker re-record instead, change the line's tags in voices/spec.py and run record.py --redo <id>."""
import os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film
from measure import dur, f0, speech_edges

F = film.film_root(); S_ = film.load_spec(F, required=False); EQ = getattr(S_, 'EQUIV', {}) if S_ else {}
a = sys.argv[1:]
factor0 = float(a[a.index('--factor') + 1]) if '--factor' in a else None
target = float(a[a.index('--target') + 1]) if '--target' in a else None
every = '--all' in a; verify = '--no-verify' not in a
if every and (target is not None or factor0 is None): sys.exit('--all takes --factor only')
L = film.load_lines(F); key = lambda x: x.get('id') or f"{x.get('shot')}-{x.get('idx')}"
todo = [l for l in L if l.get('file')] if every else [next(x for x in L if key(x) == a[0])]
for l in todo:
    src = film.path_of(F, l['file']); d = dur(src); factor = factor0
    if factor is None:
        if target is None: sys.exit('give --factor or --target')
        factor = max(1.0, d / target)
    if factor <= 1.0: print(f'{key(l)} is {d:.2f} s, nothing to do'); continue
    kept = film.keep_previous(F, src)
    tmp = src + '.tempo' + os.path.splitext(src)[1]; film.atempo(src, tmp, factor); shutil.move(tmp, src)
    l['seconds'] = round(dur(src), 2); l['tempo'] = round(l.get('tempo', 1.0) * factor, 4)
    l['speech_start'], l['speech_end'] = speech_edges(src); l['f0'] = f0(src)
    l['previous'] = list(l.get('previous', [])) + [kept]
    l['note'] = (l.get('note', '') + ' ' if l.get('note') else '') + f'Sped up x{factor:.2f} (atempo, pitch kept); original kept as {kept}.'
    if not verify:
        l['transcript'], l['verified'] = None, False      # not checked: listen, or transcribe it
    else:
        tr = film.stt_text(src); text = l.get('text') or l.get('line', '')
        l['transcript'] = tr; l['verified'] = isinstance(tr, str) and film.canon(tr, EQ) == film.canon(text.replace('(beat)', ' '), EQ)
    film.save_lines(F, L)
    print(f"{key(l)}: {d:.2f} s -> {l['seconds']:.2f} s (x{factor:.3f}), verified {l.get('verified')}"
          + ('  | now under 2 s: run pad_short.py' if l['seconds'] < 2.0 else ''))
