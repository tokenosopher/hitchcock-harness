"""Transcribe a landed take with Whisper on this Mac (free) and check its lines (Flow v3.3 - 7 Takes, step 12 and Checks):
every line word for word, each once, in order; no word missing, no extra word, no line repeated.

    .venv/bin/python tools/stt/transcribe.py $FILM <take folder or mp4> [--lines <json of expected lines>] [--again]
    .venv/bin/python tools/stt/transcribe.py --audio <any audio or video file> --words-out <words.json> [--again]

The take's sound is extracted with ffmpeg to <clip name>.wav beside the clip (kept: the pitch check reads it) and
transcribed by Whisper (faster-whisper, run through uv: tools/lib/stt.py). Writes into the take's folder: stt.json (the
words, each {"text", "start", "end", "type": "word"} in seconds) and transcript.txt (the words in phrases, a phrase per
pause over 0.5 s, each with its times). In a take<N>/ folder the 480p draft (<G>-take<N>-480p.mp4,
FIX-<name>-take<N>-480p.mp4, E-<CID>-take<N>-480p.mp4) gets those plain names; any other clip (a 1080p pass) gets
<clip name>-stt.json and <clip name>-transcript.txt.
A cached stt.json is reused (word times move a few frames from run to run, so one transcription serves every check);
--again transcribes again and replaces it. --whisper <json> takes words Whisper already wrote instead of running it.
--audio/--words-out: any file (a song, a dialogue stem, a reference film); writes the same word list to --words-out,
reused unless --again or the file is newer; zero words means no speech (an instrumental).
--lines: a JSON list of lines, each a string or {"text", "who"}, or a generation's <G>-shots.json (its "lines"; when it has
none, as the previz kit writes it, the generation's rows of script.md are read instead).
Text in brackets or parentheses, such as (beat), is not spoken. Each line prints as found (with its times), found twice
(or N times), out of order, or NOT FOUND (with the closest words heard); then the words heard outside every line, and the
tail after the last word. Exit 1 when anything is off."""
import argparse, difflib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
import stt                                         # tools/lib/stt.py: Whisper through uv
FFMPEG = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'
FFPROBE = os.environ.get('HARNESS_FFPROBE') or 'ffprobe'
TAIL_WANTED = 0.45


def read_whisper(p):
    """Words from a Whisper JSON: our list of {text, start, end}, or Whisper's own {"segments": [{"words": [...]}]}."""
    d = json.load(open(p, encoding='utf-8'))
    if isinstance(d, dict):
        d = [w for s in d.get('segments') or [] for w in s.get('words') or []]
    out = []
    for w in d:
        t = (w.get('text') or w.get('word') or '').strip()
        if t:
            out.append({'text': t, 'start': float(w['start']), 'end': float(w['end']), 'type': w.get('type') or 'word'})
    return out


def ffprobe_audio_seconds(p):
    r = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration:format=duration',
                        '-of', 'json', p], capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
    except ValueError:
        return None, None
    if not d.get('streams'):
        return None, float(d.get('format', {}).get('duration') or 0)
    s = d['streams'][0].get('duration') or d.get('format', {}).get('duration')
    return float(s), float(d.get('format', {}).get('duration') or s)


def pick_clip(target):
    t = os.path.abspath(os.path.expanduser(target))
    if os.path.isfile(t):
        return t
    if not os.path.isdir(t):
        sys.exit(f'no such take folder or clip: {t}')
    vids = sorted(f for f in os.listdir(t) if f.lower().endswith('.mp4') and not f.startswith('.'))
    drafts = [f for f in vids if f.endswith('-480p.mp4')]
    if len(drafts) == 1:
        return os.path.join(t, drafts[0])
    if len(vids) == 1:
        return os.path.join(t, vids[0])
    sys.exit(f'{t} holds {len(vids)} clips ({", ".join(vids) or "none"}): name the mp4')


def out_names(clip):
    """stt.json and transcript.txt for the 480p draft in its own take<N>/ folder (<id>-take<N>-480p.mp4, or the older
    take<N>-480p.mp4); <clip name>-stt.json and <clip name>-transcript.txt for any other clip (a 1080p pass, an old layout)."""
    folder, stem = os.path.dirname(clip), os.path.splitext(os.path.basename(clip))[0]
    m = re.fullmatch(r'take(\d+)', os.path.basename(folder))
    if m and re.fullmatch(r'(?:.+-)?take' + m.group(1) + r'-480p', stem):
        return os.path.join(folder, 'stt.json'), os.path.join(folder, 'transcript.txt')
    return os.path.join(folder, stem + '-stt.json'), os.path.join(folder, stem + '-transcript.txt')


def norm(t):
    t = t.replace('’', "'").replace('‘', "'")
    t = re.sub(r'\[[^\]]*\]', ' ', t)
    t = re.sub(r'\([^)]*\)', ' ', t)
    t = t.lower().replace('-', ' ').replace('—', ' ').replace('–', ' ')
    t = re.sub(r"[^a-z0-9' ]+", ' ', t)
    return [w.strip("'") for w in t.split() if w.strip("'")]


def load_lines(p, film=None):
    d = json.load(open(p, encoding='utf-8'))
    if isinstance(d, dict):
        if not d.get('lines') and 'shots' in d and film:
            # a shots file the previz kit wrote holds no lines: read the generation's rows of script.md, as verify_clip.py does
            sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
            import script_md
            g = os.path.basename(p).split('-shots')[0]
            src = os.path.join(film, 'script.md')
            rows = [r for r in script_md.lines(src) if r['gen'] == g] if os.path.exists(src) else []
            if not rows:
                sys.exit(f'{p}: no "lines" in it, and no rows under ### {g} in {src}: give --lines a JSON list of the lines')
            print(f'{os.path.basename(p)} holds no lines: read {len(rows)} from script.md ### {g}')
            return [(r.get('who') or '', r['line']) for r in rows]
        d = d.get('lines') or []
    out = []
    for x in d:
        if isinstance(x, str):
            out.append(('', x))
        elif isinstance(x, dict):
            out.append((x.get('who') or x.get('speaker') or x.get('name') or '', x.get('text') or x.get('line') or ''))
    if not out:
        sys.exit(f'{p}: no lines found (a list of strings or of {{"text", "who"}}, or {{"lines": [...]}})')
    return out


def phrases(words, gap=0.5):
    out, cur = [], []
    for w in words:
        if cur and w['start'] - cur[-1]['end'] > gap:
            out.append(cur); cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [f'[{p[0]["start"]:.2f}-{p[-1]["end"]:.2f}] ' + ' '.join(w['text'] for w in p) for p in out]


def check_lines(lines, words, clip_secs):
    heard = []                                    # (token, start, end)
    for w in words:
        if w.get('type') == 'word':
            for tok in norm(w['text']):
                heard.append((tok, w['start'], w['end']))
    H = [h[0] for h in heard]
    exp = [(who, text, norm(text)) for who, text in lines]

    def occ(toks):
        n = len(toks)
        return [p for p in range(len(H) - n + 1) if H[p:p + n] == toks] if n else []

    consumed, assigned, cursor = set(), {}, 0
    for i, (_, _, toks) in enumerate(exp):
        free = [p for p in occ(toks) if p >= cursor and not consumed & set(range(p, p + len(toks)))]
        if free:
            p = free[0]
            assigned[i] = p
            consumed |= set(range(p, p + len(toks)))
            cursor = p + len(toks)
    ok, rows = True, []
    span = lambda p, n: f'{heard[p][1]:5.2f}-{heard[p + n - 1][2]:5.2f}'
    for i, (who, text, toks) in enumerate(exp):
        n = len(toks)
        label = (who + '  ' if who else '') + f'"{text}"'
        if not n:
            rows.append(f'{i + 1:3}  {"(no words)":14} {"":11}  {label}')
            continue
        others = [p for p in occ(toks) if not consumed & set(range(p, p + n))]
        if i in assigned:
            p = assigned[i]
            if others:
                ok = False
                times = ', '.join(span(q, n) for q in others)
                rows.append(f'{i + 1:3}  {"found " + ("twice" if len(others) == 1 else str(len(others) + 1) + " times"):14} {span(p, n)}  {label}   again at {times}')
                for q in others:
                    consumed |= set(range(q, q + n))
            else:
                rows.append(f'{i + 1:3}  {"found":14} {span(p, n)}  {label}')
        elif others:
            ok = False
            q = others[0]
            for o in others:
                consumed |= set(range(o, o + n))
            more = f'   said {len(others)} times, also at ' + ', '.join(span(o, n) for o in others[1:]) if len(others) > 1 else ''
            rows.append(f'{i + 1:3}  {"OUT OF ORDER":14} {span(q, n)}  {label}{more}')
        else:
            ok = False
            best = (0, None, 0)
            for L in range(max(1, n - 2), n + 3):
                for p in range(0, max(0, len(H) - L + 1)):
                    r = difflib.SequenceMatcher(None, toks, H[p:p + L]).ratio()
                    if r > best[0]:
                        best = (r, p, L)
            near = (f'   closest at {heard[best[1]][1]:.2f} s: "{" ".join(H[best[1]:best[1] + best[2]])}" ({best[0]:.2f})'
                    if best[1] is not None and best[0] >= 0.5 else '   nothing close')
            rows.append(f'{i + 1:3}  {"NOT FOUND":14} {"":11}  {label}{near}')
    extra, run = [], []
    for k in range(len(H)):
        if k in consumed:
            if run: extra.append(run); run = []
        else:
            run.append(k)
    if run:
        extra.append(run)
    print('lines against the transcript, in order:')
    print('\n'.join(rows))
    if extra:
        ok = False
        print('words heard outside every line: ' + '; '.join(f'{heard[r[0]][1]:.2f}-{heard[r[-1]][2]:.2f} "{" ".join(H[k] for k in r)}"' for r in extra))
    else:
        print('words heard outside every line: none')
    spoken = [w for w in words if w.get('type') == 'word']
    if spoken:
        tail = clip_secs - spoken[-1]['end']
        enough = f'at least the {TAIL_WANTED} s wanted' if tail >= TAIL_WANTED else f'short of the {TAIL_WANTED} s wanted'
        print(f'last word ends {spoken[-1]["end"]:.2f} s, clip {clip_secs:.2f} s: tail {tail:.2f} s ({enough})')
    print('verdict: every line word for word, once, in order' if ok else 'verdict: something is off (see above)')
    return ok


def audio_mode(A):
    src = os.path.abspath(os.path.expanduser(A.audio))
    if not os.path.isfile(src):
        sys.exit(f'no such file: {src}')
    out = os.path.abspath(os.path.expanduser(A.words_out))
    if os.path.exists(out) and not A.again and os.path.getmtime(out) >= os.path.getmtime(src):
        words = json.load(open(out, encoding='utf-8'))
        print(f'using the cached {out} ({len(words)} words)')
    else:
        words = read_whisper(A.whisper) if A.whisper else stt.stt_words(src)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(words, f, indent=1, ensure_ascii=False)
        print(f'wrote {out} ({len(words)} words)')
    if not words:
        print('no words heard (an instrumental, or no speech)')
    for p in phrases(words):
        print('  ' + p)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('film', nargs='?', help='the film folder')
    ap.add_argument('target', nargs='?', help='the take folder (takes/take<N>/) or the clip itself')
    ap.add_argument('--lines', help='JSON of the expected lines')
    ap.add_argument('--again', action='store_true', help='transcribe again even when a cached stt.json exists')
    ap.add_argument('--whisper', help='a Whisper JSON already made for this clip: use its words instead of running Whisper')
    ap.add_argument('--audio', help='any audio or video file: transcribe it to --words-out (no film needed)')
    ap.add_argument('--words-out', help='with --audio: where to write the word list')
    A = ap.parse_args()

    if A.audio or A.words_out:
        if not (A.audio and A.words_out):
            sys.exit('--audio and --words-out go together')
        return audio_mode(A)
    if not (A.film and A.target):
        ap.error('give the film folder and the take folder (or --audio FILE --words-out JSON)')

    film = os.path.abspath(os.path.expanduser(A.film))
    if not os.path.isdir(film):
        sys.exit(f'not a folder: {film}')
    clip = pick_clip(A.target)
    rf, rc = os.path.realpath(film), os.path.realpath(clip)
    rel = lambda p: os.path.relpath(os.path.realpath(p), rf) if os.path.realpath(p).startswith(rf + os.sep) else p
    if not rc.startswith(rf + os.sep):
        print(f'note: the clip is outside the film folder: {clip}')
    stt_p, txt_p = out_names(clip)
    wav_p = os.path.splitext(clip)[0] + '.wav'
    lines = load_lines(A.lines, film) if A.lines else None
    secs, clip_secs = ffprobe_audio_seconds(clip)
    if secs is None:
        sys.exit(f'{rel(clip)} has no sound to transcribe')
    cached = os.path.exists(stt_p) and not A.again and not A.whisper

    if cached:
        words = json.load(open(stt_p, encoding='utf-8'))
        print(f'using the cached {rel(stt_p)} ({len(words)} words)')
    else:
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', clip, '-vn', '-acodec', 'pcm_s16le', wav_p], check=True)
        if A.whisper:
            words = read_whisper(A.whisper)
        else:
            print(f'Whisper on {secs:.1f} s of audio (local, free) ...')
            words = stt.stt_words(wav_p)
        with open(stt_p, 'w', encoding='utf-8') as f:
            json.dump(words, f, indent=1, ensure_ascii=False)
        print(f'wrote {rel(wav_p)}, {rel(stt_p)} ({len(words)} words)')
    if not os.path.exists(txt_p) or not cached:
        with open(txt_p, 'w', encoding='utf-8') as f:
            f.write('\n'.join(phrases(words)) + '\n')
        print(f'wrote {rel(txt_p)}')
    print('transcript:')
    for p in phrases(words):
        print('  ' + p)
    if lines:
        if not check_lines(lines, words, clip_secs):
            sys.exit(1)


if __name__ == '__main__':
    main()
