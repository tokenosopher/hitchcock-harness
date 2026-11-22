"""First cut: take an untightened cut of a film and return it trimmed and mixed by measurable rules, each change with
its reason. Free and local: it reads the cut, the takes' cached word timings and their sound,
and never calls a paid service.

    .venv/bin/python tools/edit/first_cut.py <film folder> <base version> --out <file.json> [--report <file.md>]
        [--speed] [--learn <finished version>] [--no-motion]

<film folder> is assets/films/<film>; <base version> is a cut version such as v12 (the file cut/v12.json).
--out writes the new timeline in the harness's Timeline schema, without a version (the harness sets it).
--report writes the list of changes in Markdown (else it is printed).
--speed applies rule 2 (slow lines sped up); without it rule 2 only proposes.
--learn <version> calibrates every threshold again from the user's own edits: the base against that finished
  version of the same film, and the film's edit history (harness/cut-history.json and harness/cut-states/).
  Without it the default numbers below are used (learned from the first film this tool was made on).
--no-motion skips the measure of where motion starts in each shot (data for later, never applied).

The rules (written from a filmmaker's own editing habits; --learn fits their numbers to yours):
1. No dead space between lines: at a cut where both shots carry speech, the silence from the last word to the next
   first word is closed to the gap the user keeps, by trimming the outgoing tail and the incoming head, never past
   the handles the user keeps around a word and never into a word.
2. Lines spoken too slowly: a line's words per second against the same character's median; a speed-up toward it,
   capped at the user's largest speed-up. Proposed; applied only with --speed.
3. The line carries over the next picture: at a scene change the incoming head is kept (it shows the new place) and
   the time comes out of the outgoing picture; its sound stays whole on a second dialogue track, unlinked.
4. Ease in a loud start: at a real cut (the sound is not continuous), an incoming sound much louder in its first
   100 ms than what played just before, and with no ease-in of its own, gets a fade-in.
5. Levels by role: dialogue, music, reactions, room beds, from the user's finished gains.
6. Title card: no longer than its words read at the user's pace.

Times: the timeline is in whole frames at its fps; the frame helpers match the harness's own
(src/components/edit/model.ts: startF, lenF, endF, speedOf, srcPlus), with JavaScript's Math.round.
"""
import argparse, copy, datetime, difflib, gzip, json, math, os, re, statistics, subprocess, sys

try:
    import numpy as np
except ImportError:  # the sound rules need numpy; the studio's .venv has it
    np = None

# ---- the default numbers, learned from the first film this tool was made on (the cut before the filmmaker's edit
# against their finished cut, and the edit history). --learn recomputes them; the report prints them either way.
DEFAULT_CAL = {
    'gap_answer': 19,      # frames from the last word to the next speaker's first word: median the user keeps in the finished cut
    'gap_beat_max': 52,    # the longest pause inside one speaker's lines the user keeps in the finished cut (frames)
    'tail_min': 4,         # the fewest frames the user keeps after a last word at a cut (the finished cut)
    'head_min': 3,         # the fewest frames the user keeps before a first word at a cut (the finished cut)
    'lcut_tail': 8,        # frames of sound kept after the last word when the line carries over (the finished cut, median)
    'min_shot': 18,        # the shortest picture shot in the finished cut (frames): a trim never leaves a shot shorter
    'speed_cap': 1.25,     # the largest speed-up in the finished cut
    'fade_len': 13,        # frames: median of the user's dialogue fade-ins (history, fades over 2 f)
    'fade_jump': 8.6,      # dB louder in the first 100 ms than just before the cut: where a fade-in disagrees least with the user
    'title_wps': 4.54,     # words a second on the title card (14 words in 3.08 s)
    'gains': {'dialogue': 0.0, 'music': -8.0, 'reaction': -12.0, 'bed': -20.0},
    'source': 'the defaults (learned from the first film this tool was made on)',
}
MIN_TRIM = 3          # a trim under 3 frames is not made (word times move a few frames from one transcription to the next)
SLOW_RATIO = 0.8      # a line under 80% of its speaker's median pace is "slow" (no user data yet: a fixed guess)
EASE_DB = 3.0         # an incoming sound with its first 100 ms 3 dB or more under its next 300 ms eases in by itself
PHRASE_GAP = 0.35     # seconds: an unmatched word joins the line of a word this close to it
SR = 16000            # sample rate the sound is decoded at for the level measures
EPS = 1e-6


# ---- frames, as the harness counts them

def jround(x):
    """JavaScript's Math.round: halves go up."""
    return int(math.floor(x + 0.5))


def toF(sec, fps):
    return jround(sec * fps)


def toS(f, fps):
    return jround((f / fps) * 1e6) / 1e6


def speed_of(c):
    s = c.get('speed')
    return s if s and s > 0 else 1


def startF(c, fps):
    return toF(c['at'], fps)


def lenF(c, fps):
    return max(1, toF((c['out'] - c['in']) / speed_of(c), fps))


def endF(c, fps):
    return startF(c, fps) + lenF(c, fps)


def src_plus(c, sec, d, fps):
    """The source point d timeline frames after sec on this clip: whole source frames at speed 1, else exact."""
    sp = speed_of(c)
    if sp == 1:
        return toS(toF(sec, fps) + d, fps)
    return jround((sec + (d * sp) / fps) * 1e6) / 1e6


def fit_fades(c):
    ln = jround(((c['out'] - c['in']) / speed_of(c)) * 1e6) / 1e6
    for k in ('fadeIn', 'fadeOut'):
        if c.get(k) is not None and c[k] > ln:
            c[k] = ln


# ---- the film's files

class Film:
    def __init__(self, folder):
        self.dir = os.path.abspath(folder)
        p = self.dir.replace(os.sep, '/')
        i = p.find('/assets/films/')
        self.repo = p[:i] if i >= 0 else os.getcwd()
        self.slug = os.path.basename(self.dir)
        self._words = {}
        self._notes = {}
        self._audio = {}
        self._dur = {}

    def path(self, src):
        return os.path.join(self.repo, src) if src.startswith('assets/') else os.path.join(self.dir, src)

    def version(self, v):
        with open(os.path.join(self.dir, 'cut', v + '.json')) as f:
            return json.load(f)

    def audio_seconds(self, src):
        if src not in self._dur:
            r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration',
                                '-of', 'csv=p=0', self.path(src)], capture_output=True, text=True)
            try:
                self._dur[src] = float(r.stdout.strip().splitlines()[0])
            except (ValueError, IndexError):
                self._dur[src] = None
        return self._dur[src]

    def seconds(self, src):
        """The file's length as the harness reads it: the container's duration (probe.ts)."""
        k = ('format', src)
        if k not in self._dur:
            r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', self.path(src)],
                               capture_output=True, text=True)
            try:
                self._dur[k] = float(r.stdout.strip())
            except ValueError:
                self._dur[k] = None
        return self._dur[k]

    def stt_file(self, src):
        """The cached word timings of a take, where tools/stt/transcribe.py writes them: <clip name>-stt.json beside
        any clip, or stt.json for the 480p draft in its own take<N>/ folder."""
        media = self.path(src)
        d, base = os.path.split(media)
        stem = os.path.splitext(base)[0]
        own = os.path.join(d, stem + '-stt.json')
        if os.path.isfile(own):
            return own
        m = re.fullmatch(r'take(\d+)', os.path.basename(d))
        if m and re.fullmatch(r'(?:.+-)?take' + m.group(1) + r'-480p', stem) and os.path.isfile(os.path.join(d, 'stt.json')):
            return os.path.join(d, 'stt.json')
        return None

    def marks(self, src):
        """Every word and sound event Scribe heard in the file, with start and end in seconds of the file; None when no
        cached transcription exists. A variation made from another take with its sound unchanged (variation.json
        names it, and the two sounds are the same length) uses that take's words."""
        if src in self._words:
            return self._words[src]
        out, note = None, None
        f = self.stt_file(src)
        if f:
            with open(f) as fh:
                out = [w for w in json.load(fh) if w.get('type') in ('word', 'audio_event')]
        else:
            vj = os.path.join(os.path.dirname(self.path(src)), 'variation.json')
            if os.path.isfile(vj):
                with open(vj) as fh:
                    frm = json.load(fh).get('from')
                if frm and frm != src and self.marks(frm) is not None:
                    a, b = self.audio_seconds(src), self.audio_seconds(frm)
                    if a is not None and b is not None and abs(a - b) < 0.02:
                        out = self.marks(frm)
                        note = 'words of %s (variation.json: the same sound, %.2f s both)' % (os.path.basename(frm), a)
        self._words[src] = out
        self._notes[src] = note
        return out

    def audio(self, src):
        """The file's sound, mono at 16 kHz, decoded by ffmpeg into memory (nothing written)."""
        if src not in self._audio:
            r = subprocess.run(['ffmpeg', '-v', 'error', '-i', self.path(src), '-vn', '-ac', '1', '-ar', str(SR),
                                '-f', 'f32le', '-'], capture_output=True)
            self._audio[src] = np.frombuffer(r.stdout, dtype=np.float32) if (np is not None and r.returncode == 0) else None
        return self._audio[src]

    def level(self, src, t0, t1):
        """RMS level in dBFS of the file's sound from t0 to t1 seconds (-120 for silence or nothing)."""
        a = self.audio(src)
        if a is None:
            return None
        i0, i1 = max(0, int(t0 * SR)), max(0, int(t1 * SR))
        seg = a[i0:i1]
        if len(seg) == 0:
            return -120.0
        rms = float(np.sqrt(np.mean(seg.astype(np.float64) ** 2)))
        return 20 * math.log10(max(1e-6, rms))


# ---- the script: who says what

def norm_tokens(text):
    t = text.lower().replace('’', "'").replace('‘', "'")
    t = re.sub(r"\[[^\]]*\]", ' ', t)
    return [w for w in re.sub(r"[^a-z0-9' ]+", ' ', t).split() if w.strip("'")]


def script_lines(film):
    """The spoken lines of the script's current version (the '## Script' section of script.md), in order:
    {scene, who, text}."""
    p = os.path.join(film.dir, 'script.md')
    if not os.path.isfile(p):
        return []
    with open(p) as f:
        text = f.read()
    m = re.search(r'^## Script\s*$(.*?)(?=^## |\Z)', text, re.M | re.S)
    sect = m.group(1) if m else text
    scene, out = None, []
    for raw in sect.splitlines():
        h = re.match(r'^###\s+(S\d+)\b', raw)
        if h:
            scene = h.group(1)
            continue
        s = re.match(r'^\*\*([A-Z][A-Z .\'’-]*?):?\*\*(?:\s*\*\([^)]*\)\*)?\s*:?\s*["“](.+)["”]\s*$', raw.strip())
        if s:
            out.append({'scene': scene, 'who': s.group(1).strip(), 'text': s.group(2)})
    return out


def attribute(marks, lines):
    """For each mark of a take: the index of the script line it belongs to, or None. Words are matched to the script
    in order (difflib); a word with no match joins the line of a word within PHRASE_GAP of it."""
    words = [i for i, w in enumerate(marks) if w.get('type') == 'word']
    toks = []
    for i in words:
        nt = norm_tokens(marks[i]['text'])
        toks.append(nt[0] if nt else '')
    sc, owner = [], []
    for li, l in enumerate(lines):
        for t in norm_tokens(l['text']):
            sc.append(t)
            owner.append(li)
    lineof = [None] * len(marks)
    sm = difflib.SequenceMatcher(None, toks, sc, autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        if n >= 2 or (n == 1 and len(toks[a]) >= 4):
            for k in range(n):
                lineof[words[a + k]] = owner[b + k]
    # unmatched words take the line of a neighbour in the same phrase, forwards then backwards
    for order in (words, list(reversed(words))):
        prev = None
        for i in order:
            if lineof[i] is None and prev is not None and lineof[prev] is not None:
                gap = marks[i]['start'] - marks[prev]['end'] if order is words else marks[prev]['start'] - marks[i]['end']
                if gap < PHRASE_GAP:
                    lineof[i] = lineof[prev]
            prev = i
    return lineof


# ---- the cut read as shots

def linked_tracks(tl):
    v = next((t for t in tl['tracks'] if t['id'] == 'V1'), None) or next((t for t in tl['tracks'] if t['kind'] == 'video'), None)
    a = next((t for t in tl['tracks'] if t['id'] == 'A1'), None) or next((t for t in tl['tracks'] if t['kind'] == 'audio'), None)
    return v, a


def find(tl, cid):
    for t in tl['tracks']:
        for c in t['clips']:
            if c['id'] == cid:
                return t, c
    return None, None


def partner(tl, c):
    """The sound linked to a picture clip, as the harness reads it (model.ts partnerOf)."""
    v, a = linked_tracks(tl)
    if not a or c.get('unlinked'):
        return None
    fps = tl['fps']
    same = [k for k in a['clips'] if not k.get('unlinked') and k.get('plan') is None
            and startF(k, fps) == startF(c, fps) and lenF(k, fps) == lenF(c, fps)]
    p = next((k for k in same if k.get('src') == c.get('src') and toF(k['in'], fps) == toF(c['in'], fps)), None)
    return p or (same[0] if len(same) == 1 else None)


def companions(tl, c):
    """The sounds that move with a picture clip: its linked sound, and any sound of the same file at the same place
    and length on another track (a title card's sound sits on an effects track)."""
    fps = tl['fps']
    out = []
    p = partner(tl, c)
    if p:
        out.append(p)
    for t in tl['tracks']:
        if t['kind'] != 'audio':
            continue
        for k in t['clips']:
            if k is p or k.get('unlinked') or k.get('src') != c.get('src'):
                continue
            if startF(k, fps) == startF(c, fps) and lenF(k, fps) == lenF(c, fps) and toF(k['in'], fps) == toF(c['in'], fps):
                out.append(k)
    return out


def is_dialogue(t):
    return t['kind'] == 'audio' and (t['id'] == 'A1' or t['name'].lower().startswith('dialogue'))


def sound_of(tl, c):
    """The sound that carries a picture clip's words: its linked sound, else an unlinked sound of the same file starting
    with it on a dialogue track (a line that already carries over)."""
    p = partner(tl, c)
    if p:
        return p
    fps = tl['fps']
    for t in tl['tracks']:
        if is_dialogue(t):
            for k in t['clips']:
                if k.get('src') == c.get('src') and startF(k, fps) == startF(c, fps):
                    return k
    return None


def scene_of(c):
    tr = c.get('takeRef') or {}
    if tr.get('scene'):
        return tr['scene']
    m = re.match(r'\s*(S\d+)\b', c.get('label') or '')
    return m.group(1) if m else None


def shot_key(c):
    m = re.match(r'\s*(S\d+)\b.*\bshot (\w+)\s*$', c.get('label') or '')
    return (m.group(1), m.group(2)) if m else None


def name_of(c):
    return c.get('label') or c.get('id')


class Shot:
    pass


def read_shots(tl, film, lines, attrib_cache):
    """Each picture clip of the main picture track, with its sound, its scene and the words heard in it (in
    timeline seconds)."""
    fps = tl['fps']
    vt, _ = linked_tracks(tl)
    shots = []
    for c in sorted(vt['clips'], key=lambda k: k['at']):
        s = Shot()
        s.v, s.a = c, sound_of(tl, c)
        s.scene = scene_of(c)
        s.title = bool(re.match(r'\s*title card', c.get('label') or '', re.I)) or '/title/' in (c.get('src') or '')
        s.marks, s.words, s.stt = None, None, 'none'
        if s.a is not None and s.a.get('src') and not s.title:
            ms = film.marks(s.a['src'])
            if ms is None:
                s.stt = 'missing'
            else:
                s.stt = film._notes.get(s.a['src']) or 'cached'
                if s.a['src'] not in attrib_cache:
                    attrib_cache[s.a['src']] = attribute(ms, lines)
                lof = attrib_cache[s.a['src']]
                a, sp = s.a, speed_of(s.a)
                inside = []
                for i, w in enumerate(ms):
                    if w['end'] > a['in'] + EPS and w['start'] < a['out'] - EPS:
                        li = lof[i]
                        inside.append({
                            'text': w['text'], 'type': w.get('type'), 'line': li,
                            'who': lines[li]['who'] if li is not None else '?',
                            's': w['start'], 'e': w['end'],
                            'ts': a['at'] + (w['start'] - a['in']) / sp, 'te': a['at'] + (w['end'] - a['in']) / sp,
                            'cut': w['start'] < a['in'] - EPS or w['end'] > a['out'] + EPS,
                        })
                s.marks = inside
                s.words = [w for w in inside if w['type'] == 'word']
        shots.append(s)
    return shots


def contiguous(a, b, fps):
    """The sound runs on from one clip into the next: the same file, from the frame where the first stops, at speed 1."""
    return (a.get('src') == b.get('src') and speed_of(a) == 1 and speed_of(b) == 1
            and toF(a['out'], fps) == toF(b['in'], fps))


# ---- edits on the timeline (ripple, as the harness does it: what follows moves; captions follow the picture)

def shift_after(tl, r0, r1, dd, skip):
    """Frames [r0, r1) of the old timeline went (dd = r1 - r0, or less): everything starting at r1 or later moves dd
    earlier, what started inside the removed frames moves to r0, captions lose the frames they had there."""
    fps = tl['fps']

    def mp(f):
        if f <= r0:
            return f
        if f < r1:
            return r0
        return f - dd
    for t in tl['tracks']:
        if t.get('locked'):
            continue
        keep = []
        for c in t['clips']:
            if c['id'] in skip:
                keep.append(c)
                continue
            s = startF(c, fps)
            if t['kind'] == 'captions' and c.get('text') is not None:
                e = endF(c, fps)
                ns, ne = mp(s), mp(e)
                if ne - ns < 1:
                    continue
                c['at'], c['in'], c['out'] = toS(ns, fps), 0, toS(ne - ns, fps)
            elif s >= r0:
                c['at'] = toS(max(0, mp(s)), fps)
            keep.append(c)
        t['clips'] = sorted(keep, key=lambda k: k['at'])
    for m in tl.get('markers') or []:
        f = toF(m['at'], fps)
        if f >= r0:
            m['at'] = toS(max(0, mp(f)), fps)


def ripple_trim(tl, cid, edge, d):
    """Trim the head or the tail of a picture clip and the sounds that move with it by d timeline frames; what follows
    moves back. Returns the frames the film lost."""
    fps = tl['fps']
    _, c = find(tl, cid)
    group = [c] + companions(tl, c)
    s, e = startF(c, fps), endF(c, fps)
    for k in group:
        if edge == 'head':
            k['in'] = src_plus(k, k['in'], d, fps)
        else:
            k['out'] = src_plus(k, k['out'], -d, fps)
        fit_fades(k)
    dd = e - endF(c, fps)
    if dd > 0:
        r0, r1 = (s, s + dd) if edge == 'head' else (e - dd, e)
        shift_after(tl, r0, r1, dd, {k['id'] for k in group})
    return dd


def set_speed(tl, cid, sp):
    fps = tl['fps']
    _, c = find(tl, cid)
    group = [c] + companions(tl, c)
    e = endF(c, fps)
    for k in group:
        k['speed'] = sp
        fit_fades(k)
    dd = e - endF(c, fps)
    if dd > 0:
        shift_after(tl, e - dd, e, dd, {k['id'] for k in group})
    return dd


def free_dialogue_track(tl, a_track, f0, f1):
    """A dialogue track beside the main one with room from f0 to f1: Dialogue 2, Dialogue 3 ..., made when missing."""
    fps = tl['fps']
    for n in range(2, 9):
        name = 'Dialogue %d' % n
        t = next((x for x in tl['tracks'] if x['kind'] == 'audio' and x['name'] == name), None)
        if t is None:
            nums = [int(x['id'][1:]) for x in tl['tracks'] if re.fullmatch(r'A\d+', x['id'])]
            t = {'id': 'A%d' % (max(nums + [0]) + 1), 'kind': 'audio', 'name': name, 'clips': []}
            tl['tracks'].insert(tl['tracks'].index(a_track) + n - 1, t)
        if not t.get('locked') and not any(startF(k, fps) < f1 and endF(k, fps) > f0 for k in t['clips']):
            return t
    return None


def carry_over(tl, cid, t_pic, t_snd):
    """Rule 3: the picture of a shot ends t_pic frames sooner and what follows moves back; its sound, unlinked, stays on
    a second dialogue track with only t_snd frames off its tail, so the line plays on over the next picture."""
    fps = tl['fps']
    vt, at = linked_tracks(tl)
    _, c = find(tl, cid)
    p = partner(tl, c)
    if p is None:
        return 0, None
    p['out'] = src_plus(p, p['out'], -t_snd, fps)
    fit_fades(p)
    home = free_dialogue_track(tl, at, startF(p, fps), endF(p, fps))
    if home is None:
        return 0, None
    at['clips'] = [k for k in at['clips'] if k is not p]
    p['unlinked'] = True
    c['unlinked'] = True
    home['clips'] = sorted(home['clips'] + [p], key=lambda k: k['at'])
    e = endF(c, fps)
    c['out'] = src_plus(c, c['out'], -t_pic, fps)
    fit_fades(c)
    dd = e - endF(c, fps)
    if dd > 0:
        shift_after(tl, e - dd, e, dd, {c['id'], p['id']})
    return dd, home


def tidy(tl, lt):
    """Clips that now overlap on a track other than the picture and its dialogue go to a track beside it."""
    fps = tl['fps']
    moved = []
    for t in list(tl['tracks']):
        if t['id'] in lt or t['kind'] == 'captions':
            continue
        cs = sorted(t['clips'], key=lambda k: k['at'])
        for i in range(1, len(cs)):
            if startF(cs[i], fps) < endF(cs[i - 1], fps):
                f0, f1 = startF(cs[i], fps), endF(cs[i], fps)
                n = 2
                while True:
                    name = '%s %d' % (t['name'], n)
                    side = next((x for x in tl['tracks'] if x['kind'] == t['kind'] and x['name'] == name), None)
                    if side is None:
                        nums = [int(x['id'][1:]) for x in tl['tracks'] if re.fullmatch(r'[AV]\d+', x['id']) and x['id'][0] == t['id'][0]]
                        side = {'id': '%s%d' % (t['id'][0], max(nums + [0]) + 1), 'kind': t['kind'], 'name': name, 'clips': []}
                        tl['tracks'].insert(tl['tracks'].index(t) + 1, side)
                    if not any(startF(k, fps) < f1 and endF(k, fps) > f0 for k in side['clips']):
                        break
                    n += 1
                t['clips'] = [k for k in t['clips'] if k is not cs[i]]
                side['clips'] = sorted(side['clips'] + [cs[i]], key=lambda k: k['at'])
                moved.append('%s moved to %s %s (it overlapped after the trims)' % (name_of(cs[i]), side['id'], side['name']))
    return moved


# ---- calibration from the user's own edits

def cut_table(tl, film, lines, cache):
    """Every cut of the main picture track where both shots carry words: gap, handles, speakers, scenes."""
    fps = tl['fps']
    shots = read_shots(tl, film, lines, cache)
    rows = []
    for i in range(len(shots) - 1):
        a, b = shots[i], shots[i + 1]
        r = {'i': i, 'out': a, 'in': b}
        rows.append(r)
        if not a.words or not b.words:
            r['kind'] = 'silent' if (a.words is not None or a.title) and (b.words is not None or b.title) else 'no words'
            continue
        L, F = a.words[-1], b.words[0]
        lm, fm = max(a.marks, key=lambda w: w['te']), min(b.marks, key=lambda w: w['ts'])
        r.update({
            'kind': 'speech', 'L': L, 'F': F,
            'gap': (F['ts'] - L['te']) * fps,
            'tail_pic': (endF(a.v, fps) / fps - L['te']) * fps,
            'tail_snd': (endF(a.a, fps) / fps - L['te']) * fps,
            'tail_mark': (endF(a.a, fps) / fps - lm['te']) * fps,
            'head': (F['ts'] - startF(b.v, fps) / fps) * fps,
            'head_mark': (fm['ts'] - startF(b.a, fps) / fps) * fps,
            'answer': L['who'] != F['who'] or L['who'] == '?',
            'scene_change': a.scene != b.scene,
            'cutword': L['cut'] or F['cut'],
            'contig': contiguous(a.a, b.a, fps),
            'linked': partner(tl, a.v) is not None and partner(tl, b.v) is not None,
        })
    return shots, rows


def history_fades(film):
    """The user's fade-ins and fade-outs on dialogue sounds in the edit history: the last value per clip and the cut
    state just before each step."""
    p = os.path.join(film.dir, 'harness', 'cut-history.json')
    if not os.path.isfile(p):
        return []
    with open(p) as f:
        steps = json.load(f).get('steps', [])
    out = {}
    for i, s in enumerate(steps):
        m = re.match(r'fade (in|out) on the sound of (S\d+) shot (\w+): (\d+) f', s.get('words', ''))
        if m and s.get('by') == 'user' and i > 0:
            out[(m.group(1), m.group(2), m.group(3))] = {'frames': int(m.group(4)), 'before': steps[i - 1].get('state'), 'at': s.get('at')}
    return [dict(v, edge=k[0], key=(k[1], k[2])) for k, v in out.items()]


def load_state(film, state):
    p = os.path.join(film.dir, 'harness', 'cut-states', state + '.json.gz')
    if not os.path.isfile(p):
        return None
    with gzip.open(p) as f:
        return json.load(f)


def jump_at(tl, film, clip, track):
    """How much louder (dB) a dialogue sound is in its first 100 ms than the dialogue sound playing in the 100 ms
    before it starts, whether its own sound eases in, and whether the cut is real (not the same file running on)."""
    fps = tl['fps']
    s = startF(clip, fps)
    before = None
    cont = False
    for t in tl['tracks']:
        if not is_dialogue(t):
            continue
        for k in t['clips']:
            if k is clip or not k.get('src') or k.get('muted'):
                continue
            ks, ke = startF(k, fps), endF(k, fps)
            if ks < s <= ke:
                sp = speed_of(k)
                pos = k['in'] + (s / fps - k['at']) * sp
                lv = film.level(k['src'], pos - 0.1 * sp, pos)
                if lv is not None and (before is None or lv > before):
                    before = lv
                if ke == s and contiguous(k, clip, fps):
                    cont = True
    lin = film.level(clip['src'], clip['in'], clip['in'] + 0.1 * speed_of(clip))
    lnext = film.level(clip['src'], clip['in'] + 0.1 * speed_of(clip), clip['in'] + 0.4 * speed_of(clip))
    if lin is None:
        return None
    return {'jump': lin - (before if before is not None else -120.0), 'in': lin, 'next': lnext, 'before': before,
            'contig': cont, 'eases': lnext is not None and lin < lnext - EASE_DB}


def learn(film, base_v, fin_v, lines):
    """Every threshold from the user's own edits: the finished version measured, the base compared, and the history's
    fades. Returns the numbers and the lines that say where each came from."""
    cal = copy.deepcopy(DEFAULT_CAL)
    why = {}
    fin = film.version(fin_v)
    fps = fin['fps']
    cache = {}
    shots, rows = cut_table(fin, film, lines, cache)
    sp = [r for r in rows if r.get('kind') == 'speech' and r['gap'] > 0 and not r['cutword']]
    ans = [r['gap'] for r in sp if r['answer']]
    beat = [r['gap'] for r in sp if not r['answer'] and not r['scene_change']]
    linked = [r for r in sp if r['linked']]
    if ans:
        cal['gap_answer'] = jround(statistics.median(ans))
        why['gap_answer'] = 'median of %d answer gaps in %s: %s' % (len(ans), fin_v, ', '.join('%d' % jround(g) for g in ans))
    if beat:
        cal['gap_beat_max'] = jround(max(beat))
        why['gap_beat_max'] = 'longest of %d pauses inside one speaker\'s lines in %s: %s' % (len(beat), fin_v, ', '.join('%d' % jround(g) for g in beat))
    if linked:
        cal['tail_min'] = max(1, jround(min(r['tail_snd'] for r in linked)))
        cal['head_min'] = max(1, jround(min(r['head'] for r in linked)))
        why['tail_min'] = 'fewest frames after a last word at %d cuts in %s: %s' % (len(linked), fin_v, ', '.join('%d' % jround(r['tail_snd']) for r in linked))
        why['head_min'] = 'fewest frames before a first word at the same cuts: %s' % ', '.join('%d' % jround(r['head']) for r in linked)
    # the lines that carry over in the finished cut: an unlinked picture shorter than its sound
    lc = []
    for s in shots:
        if s.v.get('unlinked') and s.a is not None and s.a is not partner(fin, s.v) and s.words:
            lc.append((endF(s.a, fps) / fps - s.words[-1]['te']) * fps)
    if lc:
        cal['lcut_tail'] = jround(statistics.median(lc))
        why['lcut_tail'] = 'median sound kept after the last word on the %d lines that carry over in %s: %s' % (len(lc), fin_v, ', '.join('%d' % jround(x) for x in lc))
    vt, _ = linked_tracks(fin)
    real = [c for c in vt['clips'] if c.get('src') and not re.match(r'\s*title card', c.get('label') or '', re.I)]
    if real:
        short = min(real, key=lambda c: lenF(c, fps))
        cal['min_shot'] = lenF(short, fps)
        why['min_shot'] = 'the shortest picture shot in %s: %s, %d f' % (fin_v, name_of(short), lenF(short, fps))
    sps = [speed_of(c) for t in fin['tracks'] for c in t['clips'] if speed_of(c) > 1]
    if sps:
        cal['speed_cap'] = max(sps)
        why['speed_cap'] = 'the largest speed-up in %s' % fin_v
    cards = [c for c in vt['clips'] if re.match(r'\s*title card', c.get('label') or '', re.I)]
    if cards:
        c = cards[0]
        n = len(card_words(c))
        if n:
            cal['title_wps'] = round(n / (lenF(c, fps) / fps), 2)
            why['title_wps'] = '%d words in %d f on the title card of %s' % (n, lenF(c, fps), fin_v)
    gains = {}
    for t in fin['tracks']:
        if t['kind'] != 'audio':
            continue
        for c in t['clips']:
            r = role_of(t, c, fps)
            if r and not c.get('muted') and not t.get('muted'):
                gains.setdefault(r, []).append(c.get('gain') or 0.0)
    if gains:
        cal['gains'] = {r: round(statistics.median(v), 2) for r, v in gains.items()}
        why['gains'] = '; '.join('%s: median of %s' % (r, ', '.join('%g' % x for x in sorted(v))) for r, v in gains.items())
    # the fades: their length from the history; the loudness jump where a fade-in disagrees least with the user
    hf = history_fades(film)
    fins = [h for h in hf if h['edge'] == 'in' and h['frames'] > 2]
    if fins:
        cal['fade_len'] = jround(statistics.median(h['frames'] for h in fins))
        why['fade_len'] = 'median of the user\'s fade-ins on dialogue (history, over 2 f): %s' % ', '.join(
            '%s shot %s %d f' % (h['key'][0], h['key'][1], h['frames']) for h in fins)
    if np is not None and fins:
        faded_keys = {h['key'] for h in hf if h['edge'] == 'in'}
        yes, no = [], []
        for h in fins:
            st = load_state(film, h['before']) if h.get('before') else None
            if not st:
                continue
            for t in st['tracks']:
                if not is_dialogue(t):
                    continue
                hit = next((c for c in sorted(t['clips'], key=lambda k: k['at']) if shot_key(c) == h['key'] and c.get('src')), None)
                if hit:
                    j = jump_at(st, film, hit, t)
                    if j and not j['contig']:
                        yes.append((j['jump'], '%s shot %s' % h['key']))
                    elif j:
                        why.setdefault('fade_skipped', []).append('%s shot %s (the sound runs on from the shot before: not a real cut)' % h['key'])
                    break
        base = film.version(base_v)
        _, at = linked_tracks(base)
        for c in sorted(at['clips'], key=lambda k: k['at']):
            if startF(c, fps) == 0 or shot_key(c) in faded_keys or not c.get('src'):
                continue
            j = jump_at(base, film, c, at)
            if j and not j['contig']:
                no.append((j['jump'], '%s shot %s' % (shot_key(c) or ('?', '?'))))
        if yes:
            cands = sorted(set([round(x[0], 1) for x in yes + no] + [999.0]))
            best = None
            for k, th in enumerate(cands):
                # a threshold halfway between two measured values
                t2 = th if k == 0 else (cands[k - 1] + th) / 2
                err = sum(1 for x in yes if x[0] < t2) + sum(1 for x in no if x[0] >= t2)
                if best is None or err < best[0] or (err == best[0] and t2 > best[1]):
                    best = (err, t2)
            cal['fade_jump'] = round(best[1], 1)
            why['fade_jump'] = 'the jump that disagrees least with the user (%d disagreements): faded %s; not faded %s' % (
                best[0], ', '.join('%s %+.1f dB' % (n, j) for j, n in yes), ', '.join('%s %+.1f' % (n, j) for j, n in sorted(no, reverse=True)))
    cal['source'] = 'learned now from %s against %s and the history' % (base_v, fin_v)
    cal['why'] = why
    return cal


# ---- the rules

def card_words(c):
    m = re.match(r'\s*title card\s*[·:-]\s*(.+)$', c.get('label') or '', re.I)
    return (m.group(1).split() if m else [])


REACTION = re.compile(r'cheer|gasp|murmur|clap|laugh|crowd|applause|boo|sigh', re.I)
BED = re.compile(r'\bbed\b|wind|waves|room|ambien|tone|hall murmur', re.I)


def role_of(t, c, fps):
    if is_dialogue(t):
        return 'dialogue'
    if t['name'].lower().startswith('music'):
        return 'music'
    if re.match(r'\s*title card', c.get('label') or '', re.I):
        return None
    lab = c.get('label') or ''
    if BED.search(lab) or lenF(c, fps) / fps >= 20:
        return 'bed'
    if REACTION.search(lab):
        return 'reaction'
    return None


def who(w):
    return w['who'].title() if w['who'] != '?' else 'someone (a word not in the script)'


def plan_rule1(rows, cal, fps):
    """The trims rule 1 and rule 3 make, cut by cut, from the base cut's measures."""
    plans, notes = [], []
    for r in rows:
        if r.get('kind') != 'speech':
            continue
        a, b = r['out'], r['in']
        L, F = r['L'], r['F']
        where = '%s / %s' % (name_of(a.v), name_of(b.v))
        if r['gap'] <= 0 or r['cutword']:
            notes.append(('left', where, 'the shots run one into the other inside a word ("%s"): the take\'s own timing' % L['text']))
            continue
        if not r['linked']:
            notes.append(('left', where, 'picture and sound are unlinked here already'))
            continue
        target = cal['gap_answer'] if r['answer'] else cal['gap_beat_max']
        excess = jround(r['gap'] - target)
        kind = 'answer' if r['answer'] else 'pause inside %s\'s lines' % who(L)
        if excess < MIN_TRIM:
            notes.append(('left', where, '%.2f s (%d f) from "%s" to "%s" (%s): within %d f of the %d f the user keeps' % (
                r['gap'] / fps, jround(r['gap']), L['text'], F['text'], kind, MIN_TRIM - 1, target)))
            continue
        # what each side can give: down to the handles, never into a word or a sound event
        slack_t = max(0, int(math.floor(min(r['tail_snd'], r['tail_mark']) - cal['tail_min'] + EPS)))
        slack_h = max(0, int(math.floor(min(r['head'], r['head_mark']) - cal['head_min'] + EPS)))
        room_a = max(0, lenF(a.v, fps) - cal['min_shot'])
        room_b = max(0, lenF(b.v, fps) - cal['min_shot'])
        slack_t, slack_h = min(slack_t, room_a), min(slack_h, room_b)
        base = {'cut': r, 'where': where, 'target': target, 'kind': kind, 'excess': excess}
        if r['scene_change']:
            # rule 3: the new place keeps its head; the outgoing picture gives the time, its sound stays whole
            t_pic = min(excess, room_a)
            t_snd = min(t_pic, max(0, int(math.floor(r['tail_snd'] - cal['lcut_tail'] + EPS))))
            if t_pic >= MIN_TRIM:
                plans.append(dict(base, rule=3, t_pic=t_pic, t_snd=t_snd, h=0, t=0))
                if t_pic < excess:
                    notes.append(('short', where, 'rule 3 stopped at %d of %d f: the shot keeps at least %d f' % (t_pic, excess, cal['min_shot'])))
            continue
        total = min(excess, slack_t + slack_h)
        t = h = 0
        for _ in range(total):
            if slack_t - t > slack_h - h:
                t += 1
            elif slack_h - h > 0:
                h += 1
            else:
                t += 1
        if total >= MIN_TRIM:
            plans.append(dict(base, rule=1, t=t, h=h, slack_t=slack_t, slack_h=slack_h))
        if total < excess:
            notes.append(('short', where, 'the handles stop rule 1 at %d of %d f (%d f after "%s", %d f before "%s"): rule 3 could take the rest by letting the line carry over the next picture (not applied)' % (
                total, excess, jround(r['tail_snd']), L['text'], jround(r['head']), F['text'])))
    return plans, notes


def line_rates(shots):
    """Each spoken line heard in the cut (a run of words of one script line in one shot): words, seconds, pace."""
    out = []
    for s in shots:
        if not s.words:
            continue
        runs = []
        for w in s.words:
            if runs and runs[-1][0] == w['line'] and w['line'] is not None:
                runs[-1][1].append(w)
            else:
                runs.append((w['line'], [w]))
        for li, ws in runs:
            if li is None or len(ws) < 3:
                continue
            sec = ws[-1]['e'] - ws[0]['s']
            if sec <= 0:
                continue
            out.append({'shot': s, 'line': li, 'who': ws[0]['who'], 'n': len(ws), 'sec': sec, 'wps': len(ws) / sec,
                        'text': ' '.join(w['text'] for w in ws)})
    return out


def grab(film, src, first_frame, n, fps, w=32, h=56, rgb=False):
    """n frames of a file from frame first_frame on, scaled to w x h, as a numpy array (frames, h, w[, 3])."""
    if np is None or n < 1:
        return None
    t = max(0.0, (first_frame - 0.25) / fps)
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', '%.4f' % t, '-i', film.path(src), '-frames:v', str(n), '-an',
                        '-vf', 'scale=%d:%d' % (w, h), '-pix_fmt', 'rgb24' if rgb else 'gray', '-f', 'rawvideo', '-'],
                       capture_output=True)
    per = w * h * (3 if rgb else 1)
    a = np.frombuffer(r.stdout, dtype=np.uint8)
    k = len(a) // per
    if k < 1:
        return None
    return a[:k * per].reshape((k, h, w, 3) if rgb else (k, h, w))


def motion_profile(frames):
    """Frame-to-frame differences (mean absolute, grey): d[i] is the change from frame i to frame i+1."""
    a = frames.astype(np.float32)
    if a.ndim == 4:
        a = a.mean(axis=3)
    return np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))


def motion_edges(d):
    """Where the picture starts to move (the first difference past 30% of the way from the smallest to the largest)
    and where it stops (the last one), as frame indexes; None for a shot that is still or moves evenly."""
    if d is None or len(d) < 3:
        return None, None
    lo, hi = float(d.min()), float(d.max())
    if hi - lo < 0.5:
        return None, None
    over = np.nonzero(d >= lo + 0.3 * (hi - lo))[0]
    return int(over[0]), int(over[-1]) + 1


def motion_start(film, c, fps, frames=48):
    """The frame of a shot's head where its picture starts to move: frame differences of its first frames at 32x56
    grey (motion_edges). Data only."""
    a = grab(film, c['src'], toF(c['in'], fps), min(frames, lenF(c, fps)), fps)
    if a is None or len(a) < 4:
        return None
    first, _ = motion_edges(motion_profile(a))
    return {'frame': first}


# ---- the run

def first_cut(film, base_v, cal, use_speed=False, motion=True):
    lines = script_lines(film)
    base = film.version(base_v)
    tl = copy.deepcopy(base)
    fps = tl['fps']
    vt, at = linked_tracks(tl)
    lt = {vt['id'], at['id']} if vt and at else set()
    changes, proposals, notes = [], [], []
    cache = {}

    def change(clip, what, rule, why):
        changes.append({'clip': name_of(clip), 'id': clip['id'], 'what': what, 'rule': rule, 'why': why})

    # rule 6: the title card no longer than its words at the user's pace
    for c in sorted(vt['clips'], key=lambda k: k['at']):
        if not re.match(r'\s*title card', c.get('label') or '', re.I):
            continue
        n = len(card_words(c))
        if not n:
            notes.append(('left', name_of(c), 'a title card whose words are not in its label'))
            continue
        want = jround(n / cal['title_wps'] * fps)
        have = lenF(c, fps)
        if have - want >= MIN_TRIM:
            ripple_trim(tl, c['id'], 'tail', have - want)
            change(c, 'tail -%d f (%d f to %d f)' % (have - want, have, want), 6,
                   '%d words read at %.2f words a second take %.2f s; it ran %.2f s' % (n, cal['title_wps'], want / fps, have / fps))
        else:
            notes.append(('left', name_of(c), 'title card %d f for %d words: not longer than %d f' % (have, n, want)))

    # rule 2: lines spoken too slowly
    shots = read_shots(tl, film, lines, cache)
    missing = sorted({s.a['src'] for s in shots if s.stt == 'missing'})
    borrowed = sorted({(s.a['src'], s.stt) for s in shots if s.a is not None and s.stt not in ('cached', 'missing', 'none')})
    rates = line_rates(shots)
    seen, by_who = set(), {}
    for x in rates:
        k = (x['shot'].a['src'], x['line'])
        if k not in seen:
            seen.add(k)
            by_who.setdefault(x['who'], []).append(x['wps'])
    med = {k: statistics.median(v) for k, v in by_who.items()}
    sped = set()
    for x in rates:
        m = med.get(x['who'])
        if not m or len(by_who[x['who']]) < 3 or x['n'] < 4 or x['wps'] >= SLOW_RATIO * m:
            continue
        sp = min(cal['speed_cap'], round(m / x['wps'] / 0.05) * 0.05)
        s = x['shot']
        msg = '"%s" (%s): %.2f words a second against %s\'s median %.2f; %d%% would bring it toward it' % (
            x['text'], name_of(s.v), x['wps'], x['who'].title(), m, round(sp * 100))
        if use_speed and sp > 1.01 and s.v['id'] not in sped and partner(tl, s.v) is not None:
            dd = set_speed(tl, s.v['id'], sp)
            sped.add(s.v['id'])
            change(s.v, 'speed %d%%, %d f shorter' % (round(sp * 100), dd), 2, msg)
        else:
            proposals.append(('rule 2', msg))

    # rules 1 and 3, planned on the cut as it now stands, applied from the last cut back
    shots, rows = cut_table(tl, film, lines, cache)
    plans, n1 = plan_rule1(rows, cal, fps)
    notes += n1
    for p in sorted(plans, key=lambda p: -p['cut']['out'].v['at']):
        r, a, b = p['cut'], p['cut']['out'], p['cut']['in']
        L, F = r['L'], r['F']
        say = '%.2f s from "%s" to %s\'s "%s" (%s)' % (r['gap'] / fps, L['text'], who(F), F['text'], p['kind'])
        if p['rule'] == 3:
            dd, home = carry_over(tl, a.v['id'], p['t_pic'], p['t_snd'])
            if home is None:
                notes.append(('short', p['where'], 'rule 3 found no free dialogue track: left'))
                continue
            kept = jround(r['tail_snd'] - p['t_snd'])
            change(a.v, 'picture tail -%d f; its sound unlinked to %s %s, tail -%d f' % (dd, home['id'], home['name'], p['t_snd']), 3,
                   '%s, a new scene (%s to %s): the new place keeps its head (%d f before "%s"); the line plays on over it, %d f of sound kept after "%s"; the gap is now %d f' % (
                       say, a.scene, b.scene, jround(r['head']), F['text'], kept, L['text'], jround(r['gap'] - dd)))
            continue
        if p['h']:
            ripple_trim(tl, b.v['id'], 'head', p['h'])
            change(b.v, 'head +%d f' % p['h'], 1, '%s; kept %d f before "%s"; the gap is now %d f (target %d)' % (
                say, jround(r['head'] - p['h']), F['text'], jround(r['gap'] - p['h'] - p['t']), p['target']))
        if p['t']:
            ripple_trim(tl, a.v['id'], 'tail', p['t'])
            change(a.v, 'tail -%d f' % p['t'], 1, '%s; kept %d f after "%s"; the gap is now %d f (target %d)' % (
                say, jround(r['tail_snd'] - p['t']), L['text'], jround(r['gap'] - p['h'] - p['t']), p['target']))

    # rule 3, the rest: words cut by a clip's edge where the sound does not run on
    for r in rows:
        if r.get('kind') == 'speech' and r['cutword'] and not r['contig']:
            proposals.append(('rule 3', '%s / %s: a word is cut at the join ("%s" / "%s"); keep the outgoing sound whole on a second dialogue track' % (
                name_of(r['out'].v), name_of(r['in'].v), r['L']['text'], r['F']['text'])))

    # rule 5: levels by role, where a clip has no gain of its own
    roles_seen = {}
    for t in tl['tracks']:
        if t['kind'] != 'audio':
            continue
        for c in t['clips']:
            r = role_of(t, c, fps)
            if not r:
                continue
            roles_seen[r] = roles_seen.get(r, 0) + 1
            g = cal['gains'].get(r)
            if g is None:
                continue
            if c.get('gain') is None and abs(g) > 0.01:
                c['gain'] = g
                change(c, 'gain %g dB' % g, 5, 'a %s sound with no level of its own: the user\'s %s level' % (r, r))
            elif c.get('gain') is not None and abs((c.get('gain') or 0) - g) > 6:
                proposals.append(('rule 5', '%s on %s: %g dB, the user\'s %s level is %g dB (left: a level set by hand)' % (name_of(c), t['id'], c['gain'], r, g)))
    notes.append(('levels', 'sound roles in this cut', ', '.join('%s %d' % kv for kv in sorted(roles_seen.items())) or 'none'))

    # rule 4: ease in a loud start, on the cut as it now is
    if np is not None:
        for t in tl['tracks']:
            if not is_dialogue(t):
                continue
            for c in sorted(t['clips'], key=lambda k: k['at']):
                if startF(c, fps) == 0 or not c.get('src') or c.get('fadeIn'):
                    continue
                j = jump_at(tl, film, c, t)
                if not j or j['contig']:
                    continue
                if j['jump'] >= cal['fade_jump'] and not j['eases']:
                    n = min(cal['fade_len'], lenF(c, fps))
                    c['fadeIn'] = toS(n, fps)
                    change(c, 'fade-in %d f' % n, 4, 'its first 100 ms is %+.1f dB against the sound just before the cut (%.1f against %.1f dBFS) and does not ease in by itself' % (
                        j['jump'], j['in'], j['before'] if j['before'] is not None else -120))
                elif j['jump'] >= cal['fade_jump'] - 3:
                    notes.append(('near', name_of(c), 'start %+.1f dB against the sound before the cut%s: no fade (the line is %.1f dB)' % (
                        j['jump'], ', but it eases in by itself' if j['eases'] else '', cal['fade_jump'])))
    else:
        notes.append(('left', 'rule 4', 'numpy is missing: no sound measured'))

    moved = tidy(tl, lt)
    for m in moved:
        changes.append({'clip': m.split(' moved')[0], 'what': m, 'rule': 0, 'why': 'kept apart: two sounds never overlap on one track'})

    # motion at each shot's head in the base cut (data for later, never applied)
    motion_rows = []
    if motion and np is not None:
        for s in read_shots(base, film, lines, {}):
            c = s.v
            if c.get('src') and not s.title:
                m = motion_start(film, c, fps)
                fw = (s.words[0]['ts'] - startF(c, fps) / fps) * fps if s.words else None
                motion_rows.append((c, m, fw))

    out = {k: v for k, v in tl.items() if k not in ('version', 'renders')}
    out['basedOn'] = base_v
    out['by'] = 'alma'
    out['at'] = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
    out['note'] = 'first cut by tools/edit/first_cut.py from %s: %d changes (%s)' % (
        base_v, len(changes), ', '.join('rule %d: %d' % (k, sum(1 for c in changes if c['rule'] == k)) for k in sorted({c['rule'] for c in changes})))
    return {'timeline': out, 'base': base, 'changes': changes, 'proposals': proposals, 'notes': notes,
            'missing': missing, 'borrowed': borrowed, 'rates': rates, 'medians': med, 'motion': motion_rows,
            'frames': (max((endF(c, fps) for t in base['tracks'] for c in t['clips']), default=0),
                       max((endF(c, fps) for t in tl['tracks'] for c in t['clips']), default=0))}


def check(tl, base, film):
    """The output's own checks: no overlap on a track, nothing past a file's end, every picture that had a sound still
    has it (linked, or unlinked on a dialogue track)."""
    fps = tl['fps']
    probs = []
    # a file's length as the harness reads it (the container's duration, probe.ts); a clip may read as far as the
    # base version already did into the same file (the harness lets old damage through, timeline.ts checkFiles)
    before = {}
    for t in base['tracks']:
        for c in t['clips']:
            if c.get('src'):
                before[c['src']] = max(before.get(c['src'], 0), c['out'])
    for t in tl['tracks']:
        cs = sorted(t['clips'], key=lambda k: k['at'])
        for i in range(1, len(cs)):
            if cs[i]['at'] < cs[i - 1]['at'] + (cs[i - 1]['out'] - cs[i - 1]['in']) / speed_of(cs[i - 1]) - 0.5 / fps:
                probs.append('%s: %s overlaps %s' % (t['id'], cs[i]['id'], cs[i - 1]['id']))
        for c in cs:
            if c.get('src') and t['kind'] != 'captions' and c.get('plan') is None:
                d = film.seconds(c['src'])
                if d is not None and c['out'] > d + 1.5 / fps and c['out'] > before.get(c['src'], -1) + EPS:
                    probs.append('%s: %s reads %.3f s past the end of its file' % (t['id'], c['id'], c['out'] - d))
    bv, _ = linked_tracks(base)
    for c in bv['clips']:
        if partner(base, c) is None:
            continue
        _, now = find(tl, c['id'])
        if now is None:
            probs.append('%s is gone' % c['id'])
        elif partner(tl, now) is None and not (now.get('unlinked') and sound_of(tl, now) is not None):
            probs.append('%s lost its sound' % c['id'])
    return probs


def write_report(res, film, base_v, cal, out_path, use_speed):
    fps = res['timeline']['fps']
    L = []
    L.append('# First cut of %s from %s' % (film.slug, base_v))
    L.append('')
    L.append('Made %s by `tools/edit/first_cut.py`. Output: `%s`. %d frames before, %d after (%.2f s shorter).' % (
        datetime.date.today().isoformat(), out_path, res['frames'][0], res['frames'][1], (res['frames'][0] - res['frames'][1]) / fps))
    L.append('')
    L.append('## Calibration')
    L.append('')
    L.append('Source: %s.' % cal.get('source'))
    L.append('')
    L.append('| number | value | from |')
    L.append('|---|---|---|')
    why = cal.get('why', {})
    rows = [('gap_answer', 'gap kept at an answer (f)'), ('gap_beat_max', 'longest pause kept inside one speaker\'s lines (f)'),
            ('tail_min', 'handle kept after a last word (f)'), ('head_min', 'handle kept before a first word (f)'),
            ('lcut_tail', 'sound kept after the last word when the line carries over (f)'), ('min_shot', 'shortest shot a trim may leave (f)'),
            ('speed_cap', 'largest speed-up'), ('fade_len', 'fade-in length (f)'), ('fade_jump', 'loud start that gets a fade-in (dB)'),
            ('title_wps', 'title card words a second')]
    for k, label in rows:
        L.append('| %s | %s | %s |' % (label, cal[k], why.get(k, 'default')))
    L.append('| levels by role (dB) | %s | %s |' % (', '.join('%s %g' % kv for kv in sorted(cal['gains'].items())), why.get('gains', 'default')))
    L.append('| smallest trim made | %d f | fixed: word times move a few frames between transcriptions |' % MIN_TRIM)
    L.append('| slow line | under %d%% of the speaker\'s median | fixed: no user data yet |' % round(SLOW_RATIO * 100))
    for s in why.get('fade_skipped', []):
        L.append('')
        L.append('Left out of the fade calibration: %s.' % s)
    L.append('')
    L.append('## Changes (%d)' % len(res['changes']))
    L.append('')
    L.append('| clip | change | rule | why |')
    L.append('|---|---|---|---|')
    for c in res['changes']:
        L.append('| %s | %s | %s | %s |' % (c['clip'], c['what'], c['rule'] or '-', c['why']))
    L.append('')
    L.append('## Proposals, not applied')
    L.append('')
    if res['proposals']:
        for k, m in res['proposals']:
            L.append('- %s: %s%s' % (k, m, '' if use_speed or k != 'rule 2' else ' (run with --speed to apply)'))
    else:
        L.append('- none')
    L.append('')
    L.append('Pace of each speaker (median words a second over the lines of 3 words or more): %s.' % (
        ', '.join('%s %.2f' % (k.title(), v) for k, v in sorted(res['medians'].items())) or 'no lines'))
    L.append('')
    L.append('## Looked at and left')
    L.append('')
    for k, where, m in res['notes']:
        L.append('- %s: %s' % (where, m))
    L.append('')
    L.append('## Word timings')
    L.append('')
    if res['missing']:
        L.append('Takes with no cached transcription (rules 1 to 3 skip their shots; no transcription was run):')
        for m in res['missing']:
            L.append('- `%s`' % m)
    else:
        L.append('Every take in the base cut has cached word timings.')
    for src, note in res['borrowed']:
        L.append('- `%s`: %s' % (src, note))
    if res['motion']:
        L.append('')
        L.append('## Where motion starts (data for later, not applied)')
        L.append('')
        L.append('Frame of each shot\'s head where the picture starts to move (frame differences at 32x56, first 2 s).')
        L.append('')
        L.append('| shot | motion from | first word at |')
        L.append('|---|---|---|')
        for c, m, fw in res['motion']:
            L.append('| %s | %s | %s |' % (name_of(c), ('f %d' % m['frame']) if m and m.get('frame') is not None else 'still or even',
                                            ('f %d' % jround(fw)) if fw is not None else 'no words'))
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser(description='First cut by measurable rules (phase 1).')
    ap.add_argument('film')
    ap.add_argument('base')
    ap.add_argument('--out', required=True)
    ap.add_argument('--report')
    ap.add_argument('--speed', action='store_true')
    ap.add_argument('--learn')
    ap.add_argument('--no-motion', action='store_true')
    a = ap.parse_args()
    film = Film(a.film)
    if not os.path.isdir(film.dir):
        sys.exit('no film folder: %s (is the drive connected?)' % film.dir)
    cal = learn(film, a.base, a.learn, script_lines(film)) if a.learn else copy.deepcopy(DEFAULT_CAL)
    res = first_cut(film, a.base, cal, use_speed=a.speed, motion=not a.no_motion)
    probs = check(res['timeline'], res['base'], film)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump(res['timeline'], f, indent=1, ensure_ascii=False)
    rep = write_report(res, film, a.base, cal, a.out, a.speed)
    if probs:
        rep += '\n## Problems found in the output\n\n' + '\n'.join('- ' + p for p in probs) + '\n'
    if a.report:
        with open(a.report, 'w') as f:
            f.write(rep)
        print('wrote %s and %s: %d changes, %d proposals%s' % (a.out, a.report, len(res['changes']), len(res['proposals']),
                                                             ', PROBLEMS: ' + '; '.join(probs) if probs else ''))
    else:
        print(rep)
    sys.exit(1 if probs else 0)


if __name__ == '__main__':
    main()
