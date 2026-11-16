"""Where does the stress fall? Per-word level (RMS dB) and pitch of a recorded line, from Whisper word times (on this Mac).
A stressed word that drops about 14 dB reads as "not exclaimed". The user judges by ear; this only says which take to
play first and why.
    FILM=<film> .venv/bin/python tools/voices/emphasis.py V17 [--word any]   a line from audio/lines.json (word times cached)
    .venv/bin/python tools/voices/emphasis.py take.mp3 [--word face]         any file (transcribed, not cached)
    ... [--words-json words.json]                             word times you already have: [{text, start, end}, ...]
Prints each word's level against the line's median word level and its median pitch, and for --word whether it is the
loudest and the highest word in the line."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import film
from measure import pcm

SR = 16000
a = sys.argv[1:]
word = a[a.index('--word') + 1].lower() if '--word' in a else None
wj = a[a.index('--words-json') + 1] if '--words-json' in a else None
if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
target = a[0]
if os.path.exists(target):
    path = target; ws = json.load(open(wj)) if wj else [w for w in film.stt_words(path) if w.get('type', 'word') == 'word']
else:
    F = film.film_root(); l = next(x for x in film.load_lines(F) if x.get('id') == target)
    path = film.path_of(F, l['file']); ws = json.load(open(wj)) if wj else film.words_for(F, target, path, l['seconds'])
x = pcm(path, SR)


def pitch(seg):
    n, out = 640, []
    for i in range(0, len(seg) - n, n // 2):
        f = seg[i:i + n] - seg[i:i + n].mean()
        if np.sqrt((f ** 2).mean()) < 0.01: continue
        c = np.correlate(f, f, 'full')[n - 1:]; c /= c[0] + 1e-9
        lo, hi = SR // 320, SR // 60; k = lo + np.argmax(c[lo:hi])
        if c[k] > 0.5: out.append(SR / k)
    return float(np.median(out)) if out else 0.0


rows = []
for w in ws:
    seg = x[int(w['start'] * SR):max(int(w['end'] * SR), int(w['start'] * SR) + 1)]
    db = 20 * np.log10(np.sqrt((seg.astype(np.float64) ** 2).mean()) + 1e-9)
    rows.append((w['text'], w['start'], w['end'], db, pitch(seg)))
med = float(np.median([r[3] for r in rows]))
for t, s, e, db, hz in rows:
    mark = ' <' if word and t.strip('.,?!…;:"\'').lower() == word else ''
    print(f'{s:6.2f}-{e:5.2f}  {db - med:+6.1f} dB  {hz:5.0f} Hz  {t}{mark}')
if word:
    hit = [r for r in rows if r[0].strip('.,?!…;:"\'').lower() == word]
    if not hit: sys.exit(f'"{word}" not in the transcript')
    r = hit[0]; loudest = max(rows, key=lambda q: q[3]); highest = max(rows, key=lambda q: q[4])
    print(f'"{r[0]}": {r[3] - med:+.1f} dB against the median word; loudest word is "{loudest[0]}", highest is "{highest[0]}"'
          f' ({r[4]:.0f} Hz vs {highest[4]:.0f} Hz)')
