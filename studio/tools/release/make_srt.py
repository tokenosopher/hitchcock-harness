"""Subtitles (SRT) for a finished cut: the cut's music-free dialogue stem (never the mixed film) is transcribed with word
times (Whisper on this Mac), the transcript is aligned to the script in film order, and every cue takes the script's
exact words (names, punctuation) with the transcript's timing. Words the cut does not contain are dropped; words the
script does not have (ad-libs) are left out. Cues follow the script lines, split to at most 2 lines x 38 characters and
6.5 s; each starts 0.15 s before its first word and ends 0.12 s after its last. Plain text only: YouTube prints styling
tags literally.
    .venv/bin/python tools/release/make_srt.py STEM.wav SCRIPT.json OUT.srt [--width 30] [--words WORDS.json] [--no-stt]
SCRIPT.json: [{"shot", "who", "line"}, ...] in film order (make_script_json.py builds it from script.md or audio/lines.json).
--words names the transcript cache (default: OUT with .words.json), the list `tools/stt/transcribe.py --audio STEM
--words-out WORDS.json` writes; a cache older than the stem is transcribed again. --no-stt never transcribes: it stops if
the cache is missing or older than the stem (and leaves the cache alone)."""
import difflib, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'lib')); import stt

def norm(w): return re.sub(r"[^a-z0-9']", '', w.lower().replace('’', "'"))

WIDTH, MAX_S, GAP, LEAD, TAIL, MIN_S = 38, 6.5, 1.2, 0.15, 0.12, 0.8
STOP, COMMA = re.compile(r'[.?!]["\'’]?$'), re.compile(r'[,;:—–-]["\'’]?$')

def wrap(text, width=None):
    """One line if it fits, else two balanced lines, broken after punctuation where that costs little balance."""
    width = width or WIDTH
    if len(text) <= width: return [text]
    words, best = text.split(), None
    for k in range(1, len(words)):
        a, b = ' '.join(words[:k]), ' '.join(words[k:])
        cost = abs(len(a) - len(b)) + (100 if max(len(a), len(b)) > width else 0) - (20 if STOP.search(a) else 12 if COMMA.search(a) else 0)
        cost += 15 if dangling(words[k - 1]) else 0
        if best is None or cost < best[0]: best = (cost, [a, b])
    return best[1]

def dangling(w):
    """A word a row should not end on: a short function word, or the start of a quote that has not closed."""
    return w.lower().strip('\'"‘“') in ('a', 'an', 'the', 'to', 'of', 'i', 'my', 'your', 'and', 'or') or (w[0] in '\'"‘“' and not w[-1] in '\'"’”')

def fits(ws):
    text = ' '.join(w['text'] for w in ws)
    return max(len(l) for l in wrap(text)) <= WIDTH and len(wrap(text)) <= 2 and ws[-1]['end'] - ws[0]['start'] <= MAX_S

def chunks(ws):
    """Split one script line's timed words into cues: always at a pause longer than GAP; at sentence ends once the
    line runs past one row; otherwise only when it will not fit 2 rows x WIDTH chars / MAX_S, at the best-balanced
    punctuation or pause."""
    for k in range(1, len(ws)):
        if ws[k]['start'] - ws[k - 1]['end'] > GAP: return chunks(ws[:k]) + chunks(ws[k:])
    text = ' '.join(w['text'] for w in ws)
    if len(text) > WIDTH:
        ends = [k for k in range(1, len(ws)) if STOP.search(ws[k - 1]['text'])]
        if ends and len(text) > 2 * WIDTH * 0.75:                                          # the best-balanced sentence end
            k = min(ends, key=lambda k: abs(len(' '.join(w['text'] for w in ws[:k])) - len(' '.join(w['text'] for w in ws[k:]))))
            return chunks(ws[:k]) + chunks(ws[k:])
    if fits(ws) or len(ws) == 1: return [ws]
    best = None
    for k in range(1, len(ws)):
        a, b = ' '.join(w['text'] for w in ws[:k]), ' '.join(w['text'] for w in ws[k:])
        cost = abs(len(a) - len(b)) / len(text) * 40 - min(ws[k]['start'] - ws[k - 1]['end'], 1.0) * 20
        cost -= 30 if STOP.search(ws[k - 1]['text']) else 15 if COMMA.search(ws[k - 1]['text']) else 0
        cost += 15 if dangling(ws[k - 1]['text']) else 0
        if best is None or cost < best[0]: best = (cost, k)
    return chunks(ws[:best[1]]) + chunks(ws[best[1]:])

def ts(t):
    ms = int(round(t * 1000)); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

def main():
    global WIDTH
    if len(sys.argv) < 4 or sys.argv[1] in ('-h', '--help'): sys.exit(__doc__)
    film, spec, out = sys.argv[1:4]; script = json.load(open(spec))
    if '--width' in sys.argv: WIDTH = int(sys.argv[sys.argv.index('--width') + 1])   # narrower for vertical clips
    cache = sys.argv[sys.argv.index('--words') + 1] if '--words' in sys.argv else os.path.splitext(out)[0] + '.words.json'
    if '--no-stt' in sys.argv and not (os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(film)):
        sys.exit(f'make_srt.py --no-stt: {cache} is {"older than " + film if os.path.exists(cache) else "missing"}; nothing transcribed, nothing written')
    if os.path.exists(cache) and os.path.getmtime(cache) < os.path.getmtime(film):
        print(f'{cache} is older than {film}: transcribing the stem again'); os.remove(cache)
    if os.path.exists(cache): heard = [w for w in json.load(open(cache)) if w.get('type', 'word') == 'word']
    else:
        heard = [w for w in stt.stt_words(film) if w.get('type', 'word') == 'word']
        if not heard: sys.exit(f'make_srt.py: the transcription of {film} came back empty')
        json.dump(heard, open(cache, 'w'), indent=1)
    sw = [(i, w) for i, l in enumerate(script) for w in l['line'].split()]                   # script words, with their line index
    a, b = [norm(w) for _, w in sw], [norm(w['text']) for w in heard]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    lines = {}                                                                              # line index -> timed words
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                li, txt = sw[i1 + k]; h = heard[j1 + k]; lines.setdefault(li, []).append(dict(text=txt, start=h['start'], end=h['end']))
        elif tag == 'replace':                                                             # same place, different words: keep the script's
            n = min(i2 - i1, j2 - j1)
            for k in range(i2 - i1):
                li, txt = sw[i1 + k]; h = heard[j1 + min(k, j2 - j1 - 1)]
                if k < n or j2 > j1: lines.setdefault(li, []).append(dict(text=txt, start=h['start'], end=h['end']))
    cues = []
    for li in sorted(lines):
        ws = sorted(lines[li], key=lambda w: w['start'])
        for c in chunks(ws): cues.append([c[0]['start'], c[-1]['end'], ' '.join(w['text'] for w in c)])
    cues.sort()
    for k, c in enumerate(cues):            # lead-in and tail; a short cue reaches further back (never past the tail rule)
        prev = cues[k - 1][1] + 0.04 if k else 0.0
        c[1] = c[1] + TAIL; c[0] = max(prev, min(c[0] - LEAD, c[1] - MIN_S), c[0] - 0.45)
    for k in range(len(cues) - 1): cues[k][1] = min(cues[k][1], cues[k + 1][0] - 0.04)
    with open(out, 'w') as f:
        for k, (s, e, text) in enumerate(cues, 1):
            f.write(f'{k}\n{ts(s)} --> {ts(e)}\n' + '\n'.join(wrap(text)) + '\n\n')
    got = {li for li in lines}; missing = [script[i]['line'] for i in range(len(script)) if i not in got]
    print(f'{out}: {len(cues)} cues from {len(heard)} heard words; script lines not found in the cut: {len(missing)}')
    for m in missing: print('   -', m[:90])

if __name__ == '__main__': main()
