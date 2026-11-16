"""Build the film's lines from the takes Alma spoke on Higgsfield (elevenlabs_v4) and saved in audio/raw/: verify each take by
its transcript (Whisper on this Mac), cut the line out of a take that also speaks the line before it, join the parts of a
line with a written (beat), trim to the speech edges, speed up by TEMPO (pitch kept), and assemble a numbered table read at
the planned timing: GAP s word to word between lines, longer (or negative, for an interruption) only where the script
writes it (GAP_BEFORE). Calls no service.
    FILM=<film> .venv/bin/python tools/voices/record.py                    build every line that has a take and no record yet
    FILM=<film> .venv/bin/python tools/voices/record.py --redo V05 V07     rebuild these from their newest raw takes (old kept)
    FILM=<film> .venv/bin/python tools/voices/record.py --changed          rebuild every line whose text or voice changed
    FILM=<film> .venv/bin/python tools/voices/record.py --read [--take N]  only rebuild the table read and the 'start' times
    FILM=<film> .venv/bin/python tools/voices/record.py --todo             list the takes still to speak, with their text
The tables (LINES, GAP, BEAT, GAP_BEFORE, TEMPO, EQUIV, ALLOW_EVENTS) come from <film>/voices/spec.py.
Raw takes: audio/raw/<VID>-<name>-<n>.mp3 (or .wav), where <n> is the part number, 1 for a line without a (beat); the
newest file of each part is used. A take may also speak the line before it (sent as the turn before in the same dialogue):
the part's words are found in its transcript and cut out by their word times. A take whose words are not the line is
used whole and the line is marked to check (verified false). Every raw take stays in audio/raw/; a replaced line file is
kept in audio/takes/ and lines.json is snapshotted in audio/history/. Picks (note, chosen_take, alternates) survive.
Writes audio/lines/<VID>-<name>.wav, audio/lines.json, audio/table-read-vN.wav/.mp3."""
import json, os, re, shutil, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import film
from measure import f0, speech_edges

F = film.film_root(); S_ = film.load_spec(F)
LINES = S_.LINES; GAP = getattr(S_, 'GAP', 0.5); BEAT = getattr(S_, 'BEAT', 0.8); GAP_BEFORE = getattr(S_, 'GAP_BEFORE', {})
TEMPO = getattr(S_, 'TEMPO', 1.2); EQ = getattr(S_, 'EQUIV', {}); ALLOW = set(getattr(S_, 'ALLOW_EVENTS', ()))
LD = os.path.join(F, 'audio', 'lines'); TMP = os.path.join(F, 'audio', '.tmp')


def tempo_of(cid):
    """TEMPO is one factor for every line, or a dict per character ({'C01': 1.25, 'default': 1.2})."""
    return float(TEMPO.get(cid, TEMPO.get('default', 1.2))) if isinstance(TEMPO, dict) else float(TEMPO)


KEEP = ('note', 'chosen_take', 'alternates', 'previous')     # user picks and history survive a re-record


def parts_of(tags, parts):
    return [p if isinstance(p, tuple) else (p, tags, BEAT if k else 0) for k, p in enumerate(parts)]


def clean(s):
    """The script text of a part: inline [directions] removed (CAPS for stress are kept)."""
    return re.sub(r'\s+', ' ', re.sub(r'\[[^\]]*\]', ' ', s)).strip()


def raw_take(lid, k, nparts):
    """The newest raw take of part k (1-based) of a line: audio/raw/<VID>-<anything>-<k>.<ext>; a one-part line takes
    any audio/raw/<VID>-* file."""
    d = os.path.join(F, 'audio', 'raw')
    if not os.path.isdir(d): return None
    pat = re.compile(re.escape(lid) + r'-(?:.*-)?' + str(k) + r'\.(mp3|wav|m4a|flac)$', re.I)
    anyp = re.compile(re.escape(lid) + r'-.*\.(mp3|wav|m4a|flac)$', re.I)
    fs = [f for f in os.listdir(d) if (pat.match(f) or (nparts == 1 and anyp.match(f))) and '.stt.' not in f]
    fs = [os.path.join(d, f) for f in fs]
    return max(fs, key=os.path.getmtime) if fs else None


def take(lid, k, text, nparts):
    """Part k of a line from its raw take: (file to trim, transcript, verified, info). The part's words are cut out of a
    take that speaks more than the line (the line before it as context), 0.1 s before the first word to the middle of the
    pause after the last."""
    fn = raw_take(lid, k + 1, nparts)
    if not fn: return None
    W = [w for w in film.words_of(fn) if w.get('type', 'word') == 'word']
    heard = ' '.join(w['text'] for w in W)
    toks = [(i, t) for i, w in enumerate(W) for t in film.canon(w['text'], EQ)]
    want = film.canon(text, EQ)
    info = dict(raw=os.path.relpath(fn, F))
    if [t for _, t in toks] == want:
        ok = lid in ALLOW or ('[' not in heard and '(' not in heard)
        return fn, heard, ok, info
    j = next((j for j in range(len(toks) - len(want) + 1) if want and [t for _, t in toks[j:j + len(want)]] == want), None)
    if j is None:
        return fn, heard, False, info
    i0, i1 = toks[j][0], toks[j + len(want) - 1][0]
    t0 = max(0.0, W[i0]['start'] - 0.1) if i0 == 0 else (W[i0 - 1]['end'] + W[i0]['start']) / 2
    t1 = (W[i1]['end'] + W[i1 + 1]['start']) / 2 if i1 + 1 < len(W) else film.dur(fn)
    cut = os.path.join(TMP, f'{lid}-{k}-cut.wav')
    film.ff('-i', fn, '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-ac', '1', '-ar', '44100', cut)
    info.update(cut_from=round(t0, 3), cut_to=round(t1, 3))
    return cut, ' '.join(w['text'] for w in W[i0:i1 + 1]), True, info


def table_read(out, take_n):
    import numpy as np
    # GAP is word to word: each file is placed so its first word falls GAP s after the previous line's last word, so the
    # room the trim leaves either side of the speech (film.trim) does not lengthen the gaps. Lines without speech edges
    # (older records) count their whole file as speech.
    t = 0.0      # where the previous line's speech ended
    for i, l in enumerate(out):
        s0, s1 = l.get('speech_start') or 0.0, l.get('speech_end') or l['seconds']
        l['start'] = round(max(0.0, (t + GAP_BEFORE.get(l['id'], GAP)) - s0 if i else 0.0), 3); t = l['start'] + s1
    A = os.path.join(F, 'audio')
    if take_n is None:
        nums = [int(m.group(1)) for f in os.listdir(A) for m in [re.match(r'table-read-v(\d+)\.(wav|mp3)$', f)] if m]
        take_n = max(nums or [0]) + 1
    tr = os.path.join(A, f'table-read-v{take_n}.wav')
    clips = [np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', film.path_of(F, l['file']), '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'],
                                          capture_output=True, check=True).stdout, np.float32) for l in out]
    buf = np.zeros(int((max(l['start'] for l in out) + 1) * 44100) + max(len(c) for c in clips), np.float32)
    for l, c in zip(out, clips):
        i0 = int(round(l['start'] * 44100)); buf[i0:i0 + len(c)] += c
    buf = buf[:int(round(max(l['start'] + l['seconds'] for l in out) * 44100))]
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', '-', tr], input=np.clip(buf, -1, 1).tobytes(), check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', tr, '-b:a', '192k', tr.replace('.wav', '.mp3')], check=True)
    return tr.replace('.wav', '.mp3')


def main():
    a = sys.argv[1:]
    redo = set()
    if '--redo' in a:
        i = a.index('--redo') + 1
        while i < len(a) and not a[i].startswith('--'): redo.add(a[i]); i += 1
    take_n = int(a[a.index('--take') + 1]) if '--take' in a else None
    changed_ok, read_only, todo = '--changed' in a, '--read' in a, '--todo' in a
    cast = json.load(open(os.path.join(F, 'voices', 'cast.json')))
    missing = sorted({c for _, c, _, _ in LINES} - set(cast))
    if missing: sys.exit('no voice in voices/cast.json for ' + ' '.join(missing) + ' (pick.py records the approved voice)')
    done = {l['id']: l for l in film.load_lines(F)}
    os.makedirs(LD, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    out, stale, recorded, prev, snap, waiting = [], [], [], None, None, []
    for lid, cid, tags, parts in LINES:
        P = parts_of(tags, parts); sent = ' (beat) '.join(p[0] for p in P)
        text = ' (beat) '.join(clean(p[0]) for p in P); plain = ' '.join(clean(p[0]) for p in P)
        vid = cast[cid].get('voice_id'); sig = json.dumps([cid, vid, P], ensure_ascii=False)
        old = done.get(lid); have = bool(old) and os.path.exists(film.path_of(F, old['file']))
        if have and (lid not in redo or read_only):
            same = old['sig'] == sig if 'sig' in old else (film.canon(old.get('text', ''), EQ) == film.canon(text, EQ) and old.get('character') == cid)
            if same or not changed_ok or read_only:
                rec = dict(old)
                if same: rec['sig'] = sig
                else: stale.append(lid)
                out.append(rec); prev = plain; continue
        if read_only: sys.exit(f'{lid} has no recording yet; run without --read first')
        need = [k for k in range(len(P)) if not raw_take(lid, k + 1, len(P))]
        if need or todo:
            for k in need:
                waiting.append(f'  audio/raw/{lid}-{cast[cid]["name"].lower()}-{k + 1}.mp3  {cast[cid]["name"]}: '
                               + (f'[{P[k][1]}] ' if P[k][1] else '') + P[k][0])
            if old: out.append(dict(old))
            prev = plain; continue
        if snap is None: snap = film.snapshot_lines(F, 'before-record') or ''
        wav = os.path.join(LD, f'{lid}-{cast[cid]["name"].lower()}.wav')
        kept = film.keep_previous(F, film.path_of(F, old['file'])) if have else None
        pieces, trs, oks, info = [], [], [], []
        for k, (t, ptags, before) in enumerate(P):
            if k:
                g = os.path.join(TMP, f'{lid}-{k}-gap.wav'); film.silence(before, g); pieces.append(g)
            fn, tr, ok, inf = take(lid, k, clean(t), len(P))
            pw = os.path.join(TMP, f'{lid}-{k}.wav'); film.trim(fn, pw); pieces.append(pw); trs.append(tr); oks.append(ok); info.append(inf)
        joined = os.path.join(TMP, f'{lid}-joined.wav'); film.concat(pieces, joined)
        tp = tempo_of(cid)
        if abs(tp - 1.0) > 1e-6: film.atempo(joined, wav, tp)
        else: shutil.copy(joined, wav)
        s0, s1 = speech_edges(wav)
        rec = {k: old[k] for k in KEEP if old and k in old}
        rec.update(id=lid, character=cid, name=cast[cid]['name'], voice_id=vid, tags=tags, text=text, transcript=' | '.join(str(x) for x in trs),
                   verified=all(oks), seconds=round(film.dur(wav), 2), f0=f0(wav), file=os.path.relpath(wav, F), tempo=tp,
                   speech_start=s0, speech_end=s1, takes=info, sig=sig,
                   padded_file=None, padded_seconds=None)
        if len(P) > 1 and any(p[1] != tags for p in P): rec['part_tags'] = [p[1] for p in P]
        if sent != text: rec['tts_text'] = sent          # the text as sent, with its inline [directions] and CAPS
        if kept: rec['previous'] = list(rec.get('previous', [])) + [kept]
        out.append(rec); recorded.append(lid); prev = plain
        print(lid, cast[cid]['name'], 'OK ' if rec['verified'] else 'CHECK', rec['seconds'], 's', rec['f0'], 'Hz', repr(rec['transcript'])[:90], flush=True)
        film.save_lines(F, out + [l for l in done.values() if l['id'] not in {o['id'] for o in out}])
    dropped = [i for i in done if i not in {o['id'] for o in out}]
    if waiting:
        print('takes still to speak (generate_audio elevenlabs_v4 in the voice of voices/cast.json, saved as named):')
        print('\n'.join(waiting))
    if dropped and not todo: print('no longer in the spec, dropped from lines.json (kept in audio/history/):', ' '.join(dropped))
    if stale: print('spec changed but NOT re-recorded (pass --redo ' + ' '.join(stale) + ', or --changed):', ' '.join(stale))
    if todo:
        shutil.rmtree(TMP, ignore_errors=True); return
    if out and (recorded or read_only or dropped):
        mp3 = table_read(out, take_n)
        print('table read', round(max(l['start'] + l['seconds'] for l in out), 1), 's (last word at',
              round(out[-1]['start'] + (out[-1].get('speech_end') or out[-1]['seconds']), 1), 's) ->', os.path.relpath(mp3, F))
    film.save_lines(F, out)
    shutil.rmtree(TMP, ignore_errors=True)
    print(len(recorded), 'built,', sum(not l.get('verified') for l in out), 'lines to check,', len(waiting), 'takes still to speak')


if __name__ == '__main__': main()
