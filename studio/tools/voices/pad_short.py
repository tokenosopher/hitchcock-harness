"""Padded copies of short lines for Seedance. Audio references under 2.0 s are rejected (HTTP 422), so a line under
--min s gets trailing silence up to --to s in audio/padded/<VID>.mp3; the original keeps the timing and stays the line's
file. Writes padded_file / padded_seconds into audio/lines.json and clears them for lines that are long enough now. Run
after record.py and after every speed-up or edit: a speed-up can take a line under 2 s.
    FILM=<film> .venv/bin/python tools/voices/pad_short.py [--min 2.0] [--to 2.6]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film
from measure import dur

F = film.film_root(); a = sys.argv[1:]
MIN = float(a[a.index('--min') + 1]) if '--min' in a else 2.0
TO = float(a[a.index('--to') + 1]) if '--to' in a else 2.6
D = os.path.join(F, 'audio', 'padded'); os.makedirs(D, exist_ok=True)
L = film.load_lines(F); n = 0
for l in L:
    if not l.get('file'): continue
    src = film.path_of(F, l['file']); d = dur(src); key = l.get('id') or f"{l.get('shot')}-{l.get('idx')}"
    dst = os.path.join(D, f'{key}.mp3')
    if d < MIN:
        film.ff('-i', src, '-af', f'apad=whole_dur={TO}', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', dst)
        l['padded_file'] = os.path.relpath(dst, F); l['padded_seconds'] = round(dur(dst), 3); n += 1
        print(f'{key}: {d:.2f} s -> {l["padded_seconds"]:.2f} s')
    else:
        if os.path.exists(dst): os.remove(dst)
        l['padded_file'] = l['padded_seconds'] = None
film.save_lines(F, L)
print(n, 'lines padded to', TO, 's (under', MIN, 's)')
