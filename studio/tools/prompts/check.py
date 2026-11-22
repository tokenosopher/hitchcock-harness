"""The pre-submit check (Flow v3.3 - 6 Scene prompts and 8 Redos): a script, not a read-through. Exits 1 and prints STOP lines
on any failure; the last line reads PASS when there is none.
    .venv/bin/python tools/prompts/check.py <film> <generation> [--version vN] [--media FILE] [--explain]
    .venv/bin/python tools/prompts/check.py --explain          (what every STOP means, one line each)
The generation folder is <film>/generations/<G> if it exists, else <film>/blocks/<G>. In it: prompt/<G>-prompt-vN.txt and
prompt/<G>-media-vN.json (or the same names at the folder root, as pick-ups made before Flow v3 keep them), <G>-shots.json,
<G>-prompt-spec.md, and the take medias <G>-take-medias-vN.json in prompt/ or at the root (both are read).
A pick-up (generations/FIX-<name>/) has the same layout. Its media list's `previz_take` is its own previz json, or a parent
generation's with "span": ["4","5"]: the shot plan, the lines and the length are then that span's, and the generation may run
from the span's length rounded down to 2 s over it (Flow v3.3 - 8 Redos, step 2: a second or two of room). Without its own
shots file it uses the parent's. Shots numbered 1..k against a span of k shots are matched in order (noted).
Stops the submit on:
  0. a file the check needs is missing (prompt, media list, shots file, previz take, a media file), or more than 30 images
  1. a reference the scene doesn't show (an image/video tag never used in a shot; the voice audio never named in AUDIO)
  2. a Blender panel, plate or frame on its own (previz/*/storyboard/*/panels, plates, frames-take, check), in the media list
     or in the take medias (looked up by media id in upload-registry.json)
  3. storyboard pages without their 'Position only' line beside their reference numbers
  4. reference videos over 30 s in total, or more than three reference videos
  5. something named in a shot that is not in its frame (a tag missing from the shot's in_frame list), and 'behind the camera',
     'behind the lens', 'off screen', 'offscreen', 'out of frame' (and their spellings) inside a shot
  6. a character in a shot's frame without its [TAG] in that shot
  7. a tag in the text with no reference behind it, or a 'REFERENCE n' that is not the n-th of its kind in the media list
  8. per-second timings anywhere but a FIGHT BEATS section (a shot range, 'HARD CUT at N s', seconds after a line, a clock time,
     'N seconds' other than the total length), a shot not in the previz plan or a plan shot missing from the prompt, a line not
     word for word, a generation length that doesn't fit the block (or the span), or one outside 4 to 30 whole seconds
  9. another block's name, a take number, Blender or previz talk, a working note or a leftover '@' in the prompt
  10. a start_image or end_image in the media list or the take medias, or a frame of the film as a reference
  11. a '## ' section in <G>-prompt-spec.md that assemble.py does not know (read from assemble.py's `order`): its text would
      never reach the prompt
  12. a template placeholder left in the prompt (<G>, <CID>, <Film>, <Something>) or an @KEY that did not resolve
The prompt's length is reported, not limited: its size (Flow v3.3 - 6 Scene prompts, step 2) is checked in the manual read."""
import argparse, ast, json, os, re, subprocess, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edit'))
import filmlib as L

EXPLAIN = {
    0: 'a file the check needs is missing (prompt, media list, shots file, previz take or a media file), or more than 30 images.',
    1: 'a reference the scene never shows: in the media list, but no shot names its [TAG] (or a voice audio never named in AUDIO).',
    2: 'a Blender panel, plate or frame sent on its own: it becomes the look of the clip; panels go in only on storyboard pages.',
    3: "the storyboard pages lack the 'Position only' line beside their IMAGE REFERENCES numbers.",
    4: 'the reference videos add up to more than 30 s, the model\'s limit, or there are more than three reference videos (Flow v3.3 - 6 Scene prompts, step 11).',
    5: 'a shot names something outside its frame (a tag not in its in_frame list) or says behind the camera / off screen / out of frame: the camera turns to what is named.',
    6: "a character is in a shot's frame (in_frame in <G>-shots.json) but the shot never names its [TAG].",
    7: 'a [TAG] with no reference behind it, or a REFERENCE n that is not the n-th of its kind in the media list.',
    8: 'per-second timings outside FIGHT BEATS, a shot the previz plan does not have (or a plan shot not written), a line not word for word, or a length that does not fit the block/span or 4-30 whole seconds.',
    9: "the prompt mentions another block, a take, Blender/previz/builder talk, a working note or a leftover '@'.",
    10: 'a start_image or end_image, or a frame of the film, among the references: the first frame is described in words.',
    11: "a '## ' section in the prompt spec that assemble.py does not emit, so its text would silently drop out of the prompt.",
    12: 'a template placeholder (<G>, <CID>, <Film>, <Something>) or an unresolved @KEY left in the prompt text.',
}
NUMWORDS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen '
                                         'seventeen eighteen nineteen twenty'.split())}
NUMWORDS.update({'thirty': 30, 'twenty-five': 25, 'half a': 0.5})
NUM = r'(?:\d+(?:\.\d+)?|' + '|'.join(sorted((re.escape(w) for w in NUMWORDS), key=len, reverse=True)) + ')'
TIMING = re.compile(r'\b\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*s\b'                                    # a range: 0–1.4s, 9.5–10.5 s
                    r'|\b(?:at|from|to|until|till|by|after|before|around)\s+\d+(?:\.\d+)?\s*s\b'           # a clock time: at 1.6 s
                    r'|\b\d+\.\d+\s*s\b'                                                                  # decimal seconds: 4.5 s
                    r'|\b' + NUM + r'\s*(?:secs?|seconds?)\b', re.I)                                       # N seconds, five seconds
SHOT_HEAD = re.compile(r'^(?:[\d.]+\s*[–-]\s*[\d.]+\s*s\s*—\s*)?(?:—\s*)?SHOT (\S+?)(?::|\.|\s+—|\s*$)')
PLACEHOLDER = re.compile(r'<(?:[A-Z][A-Za-z0-9 _./-]{0,40}|[a-z][a-z0-9_-]{0,30}[A-Za-z0-9])>')
BLENDER = re.compile(r'previz/[^/]+/(storyboard/[^/]+/panels|plates|frames-take|check)/')
FILMFRAME = re.compile(r'(?:^|/)(?:takes|cut)/|take\d+[A-Za-z]?[-_]f\d+')
is_film_frame = lambda f: bool(FILMFRAME.search(f)) and not f.startswith('elements/')   # a character's video element (elements/<CID>/takes/...) is a reference by design, not a frame of the film


def assemble_known():
    """The spec sections assemble.py reads: its `order` list (minus the @ entries, with and without a ' (...)' tail) and every
    key it reads from the spec (SP.get('MEDIA'), SP['X'])."""
    tree = ast.parse(open(os.path.join(HERE, 'assemble.py')).read())
    order, keys = [], set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'order' for t in node.targets):
            order = ast.literal_eval(node.value)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'get' \
                and isinstance(node.func.value, ast.Name) and node.func.value.id == 'SP' and node.args and isinstance(node.args[0], ast.Constant):
            keys.add(node.args[0].value)
    known = set(keys)
    for n in order:
        if not n.startswith('@'):
            known.add(n); known.add(n.split(' (')[0])
    return order, known


def split_sections(P, heads):
    """[{name, sid, start, end, text}] in prompt order: a section starts at a paragraph whose first line is a header (a known
    section name, a line without lower-case letters, or a SHOT header) and runs to the next one."""
    paras, pos = [], 0
    for m in re.finditer(r'\n[ \t]*\n', P):
        paras.append((pos, m.start())); pos = m.end()
    paras.append((pos, len(P)))
    secs = []
    for a, b in paras:
        first = P[a:b].split('\n', 1)[0].strip()
        sm = SHOT_HEAD.match(first)
        head = bool(sm) or first in heads or bool(re.fullmatch(r"[A-Z][A-Z0-9 &()\-—:,'/]{1,80}", first))
        if head or not secs:
            secs.append(dict(name=('SHOT ' + sm.group(1).rstrip(':.')) if sm else first, sid=sm.group(1).rstrip(':.') if sm else None, start=a, end=b))
        else:
            secs[-1]['end'] = b
    for s in secs:
        s['text'] = P[s['start']:s['end']]
    return secs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('film', nargs='?'); ap.add_argument('gen', nargs='?', metavar='generation')
    ap.add_argument('--version', default='v1', help='vN (default v1)')
    ap.add_argument('--media', help='the media list to check against (default: <G>-media-<version>.json)')
    ap.add_argument('--explain', action='store_true', help='print what each STOP means, one line each')
    a = ap.parse_args()
    order, known = assemble_known()
    EXPLAIN[11] += ' assemble.py knows: ' + ', '.join(sorted(known)) + '.'
    if not a.film:
        if a.explain:
            for k, v in EXPLAIN.items():
                print(f'STOP {k}: {v}')
            return 0
        ap.error('give <film> <generation>, or --explain alone')
    if not a.gen:
        ap.error('give the generation (S9, FIX-sword-S9)')
    FILM = os.path.abspath(os.path.expanduser(a.film)); B = a.gen; VER = L.norm_version(a.version)
    GD = L.gen_dir(FILM, B)
    stops, notes = [], []
    stop = lambda n, msg: stops.append((n, f'STOP {n}: {msg}'))
    note = lambda msg: notes.append(f'note: {msg}')

    def finish(header):
        print(header)
        for n_ in notes: print(n_)
        for _, s_ in stops: print(s_)
        print('PASS' if not stops else f'{len(stops)} STOP(S): do not submit')
        if a.explain and stops:
            print('what the STOPs mean:')
            for k in sorted({n_ for n_, _ in stops}): print(f'  STOP {k}: {EXPLAIN[k]}')
        return 1 if stops else 0

    pp = L.find_gen_file(FILM, B, f'{B}-prompt-{VER}.txt')
    if not os.path.isdir(GD):
        stop(0, f'no generation folder {B} under generations/ or blocks/'); return finish(f'{B} {VER}')
    if not pp:
        stop(0, f'no prompt {B}-prompt-{VER}.txt in {os.path.relpath(GD, FILM)}/prompt/ or {os.path.relpath(GD, FILM)}/'); return finish(f'{B} {VER}')
    P = open(pp).read()
    # ---- the media list
    mp = os.path.abspath(a.media) if a.media else L.find_gen_file(FILM, B, f'{B}-media-{VER}.json')
    M = None
    if mp and os.path.exists(mp):
        M = L.load_json(mp)
    else:
        lower = [(n, p) for n, p in L.versions(FILM, B, 'media') if n < int(VER[1:])] if VER[1:].isdigit() else []
        stop(0, f'no media list {B}-media-{VER}.json (prompt/ or the folder root): every prompt version has its own (assemble.py writes a block\'s; a pick-up\'s is written beside its prompt)'
             + (f'; the reference checks below ran against {os.path.basename(lower[-1][1])}' if lower else '; the reference, plan and in-frame checks are skipped'))
        if lower:
            M = L.load_json(lower[-1][1]); mp = lower[-1][1]
    media = M['media'] if M else []
    kinds = {'VIDEO': [], 'IMAGE': [], 'AUDIO': []}
    for m in media: kinds[m['kind']].append(m)
    # ---- the plan (previz take, maybe a span of a parent's)
    plan = None
    if M:
        try:
            plan = L.plan_from_media(FILM, M)
        except SystemExit as e:
            stop(0, str(e))
        if plan is None and not any(s.startswith('STOP 0: span') for _, s in stops):
            stop(0, f"previz take {M.get('previz_take')} named by {os.path.basename(mp)} not found")
    span = plan['span'] if plan else None
    # ---- the shots file
    shp = os.path.join(GD, f'{B}-shots.json'); SH = None
    if os.path.exists(shp):
        SH = L.load_json(shp)
    else:
        alt = L.shots_file(FILM, B, M)
        if alt and span:
            SH = L.load_json(alt); note(f'no {B}-shots.json: the in-frame lists come from {os.path.relpath(alt, FILM)}')
        else:
            stop(0, f'no {B}-shots.json in {os.path.relpath(GD, FILM)}: the in-frame checks are skipped')
    # ---- sections
    heads = set(n for n in order if not n.startswith('@')) | {'ACTIVE REFERENCES', 'ACTING TASKS', 'FIGHT BEATS', 'STORYBOARD'}
    secs = split_sections(P, heads)
    shot_secs = [s for s in secs if s['sid']]
    refs_sec = next((s['text'] for s in secs if s['name'].startswith('ACTIVE REFERENCES')), '')
    audio_sec = next((s['text'] for s in secs if s['name'] == 'AUDIO'), '')
    fight = [(s['start'], s['end']) for s in secs if s['name'].startswith('FIGHT BEATS')]
    shots_text = '\n'.join(s['text'] for s in shot_secs)
    reported = []   # spans of P already reported as timings
    in_fight = lambda pos: any(x <= pos < y for x, y in fight)

    # ---- 0, 2: files exist; no Blender stills on their own; counts
    for m in media:
        f = os.path.join(FILM, m['file'])
        if not os.path.exists(f): stop(0, f"missing file {m['file']}")
        if BLENDER.search(m['file']): stop(2, f"Blender still on its own: {m['file']}")
        if is_film_frame(m['file']) and not m.get('page'): stop(10, f"a frame of the film as a reference: {m['file']} (never, Flow v3.3 - 8 Redos, step 5)")
    if len(kinds['IMAGE']) > 30: stop(0, f"{len(kinds['IMAGE'])} images, over the 30 ceiling")
    # ---- 4: video length
    tot = 0.0
    for m in kinds['VIDEO']:
        fp = os.path.join(FILM, m['file'])
        if os.path.exists(fp):
            tot += float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fp], capture_output=True, text=True).stdout.strip() or 0)
    if tot > 30.0: stop(4, f'reference videos total {tot:.2f} s (> 30)')
    if len(kinds['VIDEO']) > 3:
        stop(4, f"{len(kinds['VIDEO'])} reference videos ({', '.join('[' + str(m.get('tag')) + ']' for m in kinds['VIDEO'])}): at most three. "
                'Keep the video elements of the three characters who act most in the scene; give each one beyond them as a '
                'picture (an IMAGE line) and a voice reference (an AUDIO line) in ## MEDIA, then assemble again '
                '(Flow v3.3 - 6 Scene prompts, step 11)')
    # ---- 3: pages carry their line
    pg = [m for m in media if m.get('page')]
    if pg:
        want = f"IMAGE REFERENCES {pg[0]['n']} TO {pg[-1]['n']}"
        if not any(want in l and 'Position only' in l for l in refs_sec.splitlines()):
            stop(3, 'storyboard pages without their position-only line beside their numbers')
    # ---- 7: reference numbers and tags
    deftags = {}
    for l in refs_sec.splitlines()[1:]:
        mo = re.match(r'\[([^\]]+)\]', l)
        if mo: deftags[mo.group(1)] = l
    nonpage = [m for m in media if not m.get('page')]
    if nonpage and not deftags:
        stop(7, 'ACTIVE REFERENCES defines no [TAG] line, so no reference has a tag: ' + ', '.join(f"[{m['tag']}] = {m['kind']} REFERENCE {m['n']}" for m in nonpage)
             + ' (assemble.py writes them)')
    else:
        for m in nonpage:
            l = deftags.get(m['tag']); want = f"{m['kind']} REFERENCE {m['n']}"
            if not l or want not in l: stop(7, f"[{m['tag']}] should be {want} (media list order)")
    if M:
        for mo in re.finditer(r'(VIDEO|IMAGE|AUDIO) REFERENCES? (\d+)', P):
            if int(mo.group(2)) > len(kinds[mo.group(1)]): stop(7, f'{mo.group(0)} but only {len(kinds[mo.group(1)])} {mo.group(1).lower()}s in the media list')
    used = set(re.findall(r'\[([A-Z][A-Z0-9_ ]*)\]', P))
    for t in sorted(used):
        if t not in deftags: stop(7, f'[{t}] used but never defined in ACTIVE REFERENCES')
    for t, l in deftags.items():
        if t not in [m['tag'] for m in media] and not re.search(r'REFERENCE \d+|\[[A-Z0-9_ ]+\]', l[len(t) + 2:]):
            stop(7, f'[{t}] is described in words with no reference behind it')
    # ---- 1: every reference is shown
    pointers = {}
    for t, l in deftags.items():
        for tt in re.findall(r'\[([A-Z][A-Z0-9_ ]*)\]', l[len(t) + 2:]): pointers.setdefault(tt, set()).add(t)
        for n_ in re.findall(r'IMAGE REFERENCE (\d+)', l[len(t) + 2:]):
            mm = next((x for x in media if x['kind'] == 'IMAGE' and x['n'] == int(n_)), None)
            if mm: pointers.setdefault(mm['tag'], set()).add(t)

    def shown(tag):
        if f'[{tag}]' in shots_text: return True
        if tag.endswith(' SHEET') and f'[{tag[:-6]}]' in shots_text: return True
        return any(f'[{w}]' in shots_text for w in pointers.get(tag, ()))
    tagless = shot_secs and not re.search(r'\[[A-Z][A-Z0-9_ ]*\]', shots_text)
    if tagless and media:
        stop(1, 'no shot names any reference by its [TAG], so no reference is shown (assemble.py copies the tagged shots from the scene file)')
    for m in media:
        if m.get('page'): continue
        if m['kind'] == 'AUDIO':
            if f"AUDIO REFERENCE {m['n']}" not in audio_sec: stop(1, f"[{m['tag']}] AUDIO REFERENCE {m['n']} never used in AUDIO")
        elif not tagless and not shown(m['tag']): stop(1, f"[{m['tag']}] is in the media list but no shot shows it")
    # ---- shot ids against the plan (a pick-up may number its span 1..k)
    plan_labels = [s['label'] for s in plan['shots']] if plan else []
    sids = [s['sid'] for s in shot_secs]
    remap = {}
    if span and sids and not set(sids) & set(plan_labels) and sids == [str(i + 1) for i in range(len(sids))] and len(sids) == len(plan_labels):
        remap = dict(zip(sids, plan_labels)); note(f"shots numbered 1..{len(sids)}: read as the span's shots {', '.join(plan_labels)}")
    # ---- 5 + 6: per shot, tags against the frame
    VIEWTAGS = {m['tag'] for m in media if m.get('view')}
    shmap = {str(s.get('id')): s for s in (SH or {}).get('shots', [])}
    for s in shot_secs:
        sid = s['sid']; txt = s['text']; low = txt.lower()
        if SH is not None:
            js = shmap.get(remap.get(sid, sid))
            if not js:
                stop(8, f"shot {sid} not in {os.path.basename(shp) if os.path.exists(shp) else 'the shots file'}")
            else:
                frame = {re.sub(r'\s*\(.*\)', '', x).strip().upper().replace(' ', '_') for x in js.get('in_frame', [])}
                tags_here = {t.replace(' ', '_') for t in re.findall(r'\[([A-Z][A-Z0-9_ ]*)\]', txt)}
                for t in sorted(tags_here - frame):
                    if t.replace('_', ' ') in VIEWTAGS or t in VIEWTAGS: continue
                    stop(5, f'shot {sid} names [{t}] but its in_frame list is {sorted(frame)}')
                if frame and not tags_here:
                    stop(6, f"shot {sid}: {', '.join(sorted(frame))} in frame, but the shot names no [TAG]")
                else:
                    for c in sorted(frame - tags_here): stop(6, f'shot {sid}: {c} is in frame but has no [{c}] tag in the shot')
        for w in ('behind the camera', 'behind the lens', 'behind camera'):
            if w in low: stop(5, f"shot {sid} says '{w}' (S1: naming what is outside the frame turns the camera to it)")
        for w in ('off screen', 'off-screen', 'offscreen', 'out of frame', 'out of the frame', 'off frame', 'off-frame', 'out of shot'):
            if w in low: stop(5, f"shot {sid} says '{w}': a shot names only what is in its frame; give an exit or a gaze as a screen direction")
    # ---- 9: the prompt speaks only of this block
    for mo in re.finditer(r'\bS(\d{1,2})\b', P): stop(9, f"mentions block S{mo.group(1)}: '...{P[max(0, mo.start() - 40):mo.end() + 20]}...'")
    for w in ('Builder', 'Blender', 'previz builder', '@', 'previz cam', 'NEW in this pass', 'the user', '(was:', 'in this pass'):
        if w in P: stop(9, f'leftover {w!r} in the prompt')
    for mo in re.finditer(r'\btake \d', P): stop(9, f"mentions a take: '...{P[max(0, mo.start() - 30):mo.end() + 20]}...'")
    # ---- 12: template placeholders and unresolved @KEYs
    cp = L.film_file(FILM, 'prompt-common.md')
    common = set(re.findall(r'^## (.+?)\s*$', open(cp).read(), re.M)) if cp else set()
    for mo in PLACEHOLDER.finditer(P):
        stop(12, f"template placeholder {mo.group(0)} left in the prompt: '...{P[max(0, mo.start() - 30):mo.end() + 20]}...'")
    for mo in re.finditer(r'@([A-Z][A-Z0-9_]*(?: [A-Z0-9_]+)*)', P):
        k = mo.group(1)
        stop(12, f'@{k} did not resolve' + (' (prompt-common.md has it: reassemble)' if k in common else ' (no ## ' + k + ' in prompt-common.md)'))
    # ---- 8: timings (FIGHT BEATS keeps its seconds)
    for s in shot_secs:
        head = s['text'].splitlines()[0]; sid = s['sid']
        if plan and remap.get(sid, sid) not in plan_labels: stop(8, f'shot {sid} not in the previz shot plan')
        if re.search(r'\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*s\b', head) and not in_fight(s['start']):
            stop(8, f"shot {sid}: a time range in its header ({head.strip()!r}); no per-second timings")
            mo = re.search(r'\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*s\b', head); reported.append((s['start'] + mo.start(), s['start'] + mo.end()))
        for mo in re.finditer(r'HARD CUT at ([\d.]+) ?s', s['text']):
            stop(8, f"shot {sid}: 'HARD CUT at {mo.group(1)} s'; cuts are named by shot, not by second"); reported.append((s['start'] + mo.start(), s['start'] + mo.end()))
    if plan:
        missing = [l for l in plan_labels if l not in [remap.get(x, x) for x in sids]]
        if missing and not shot_secs:
            stop(8, f"no 'SHOT <n>:' block in the prompt: the plan's shots {', '.join(missing)} are not written as SHOT blocks (assemble.py writes them)")
        elif missing:
            stop(8, f"previz plan shot(s) {', '.join(missing)} have no SHOT block in the prompt")
    for mo in re.finditer(r'"([^"]+)" \(([\d.]+)[–-]([\d.]+) ?s?\)', P):
        if in_fight(mo.start()): continue
        stop(8, f'seconds after a line: "{mo.group(1)[:40]}" ({mo.group(2)}–{mo.group(3)}); no per-second timings'); reported.append((mo.start(), mo.end()))
    for s in shot_secs:
        for mo in re.finditer(r'\bat ([\d.]+) ?s\b', s['text']):
            a0 = s['start'] + mo.start()
            if any(x <= a0 < y for x, y in reported): continue
            stop(8, f"a clock time in a shot: '{s['text'][max(0, mo.start() - 40):mo.end()]}'; moves are tied to the words and the beats, not to seconds")
            reported.append((a0, s['start'] + mo.end()))
    gen_len = M['settings'].get('duration') if M else None
    total = gen_len
    if total is None:
        vals = [NUMWORDS.get(x.lower(), None) if not re.match(r'\d', x) else float(x) for x in re.findall(NUM + r'(?=\s*(?:secs?|seconds?)\b)', P, re.I)]
        vals = [v for v in vals if v is not None]
        total = max(vals) if vals else None
        if total: note(f'no media list: {total:g} seconds, the largest stated, is taken as the total length')
    for s in secs:
        if s['name'].startswith('FIGHT BEATS'): continue
        hits = []
        for mo in TIMING.finditer(s['text']):
            a0, a1 = s['start'] + mo.start(), s['start'] + mo.end()
            if any(not (a1 <= x or a0 >= y) for x, y in reported): continue
            nm = re.match(NUM + r'\s*(?:secs?|seconds?)\b', mo.group(0), re.I)
            if nm:
                v = mo.group(0).split()[0].lower()
                v = float(v) if re.match(r'\d', v) else NUMWORDS.get(re.sub(r'\s*(secs?|seconds?)$', '', mo.group(0).lower()).strip(), NUMWORDS.get(v))
                if total is not None and v is not None and abs(v - float(total)) < 1e-6: continue   # the total length may be said
            hits.append(mo.group(0)); reported.append((a0, a1))
        if hits:
            where = f"shot {s['sid']}" if s['sid'] else (s['name'][:40] or 'the opening')
            stop(8, f"seconds in {where}: {', '.join(repr(h) for h in hits[:6])}{' ...' if len(hits) > 6 else ''}; no per-second timings outside FIGHT BEATS")
    # ---- 8: the length
    if M and plan:
        dur = plan['length'] if span else float(L.load_json(L.previz_path(FILM, M)).get('duration') or (SH or {}).get('duration') or plan['length'])
        g = gen_len
        if span:
            if g < int(dur) or g > dur + 2 + 1e-6:
                stop(8, f"generation {g} s for a {dur:g} s span (shots {', '.join(span)}): from {int(dur)} s to 2 s over the span")
        elif g < dur - 1e-6 or g - dur >= 1:
            stop(8, f"generation {g} s for a {dur} s block")
    if gen_len is not None and (int(gen_len) != gen_len or not 4 <= gen_len <= 30):
        stop(8, f'generation {gen_len} s: Seedance takes whole seconds, 4 to 30')
    # ---- 8: the lines, word for word
    if plan:
        for l in plan['lines']:
            txt = (l.get('text') or '').strip()
            if not txt: note(f"previz line for {l.get('who')} has no text to compare"); continue
            if f'"{txt}"' not in P and txt not in P: stop(8, f'line not word for word: "{txt}"')
    # ---- 10: no start or end image; the take medias
    for m in media:
        if m.get('role') in ('start_image', 'end_image'): stop(10, f"{m['role']}: {m['file']} (never a frame as start or end image; references only)")
    reg_p = L.film_file(FILM, 'upload-registry.json')
    by_id = {}
    if reg_p:
        reg = L.load_json(reg_p)
        if isinstance(reg, dict):
            by_id = {v: k for k, v in reg.items() if isinstance(v, str)}
    tms = []
    for d in (os.path.join(GD, 'prompt'), GD):
        p = os.path.join(d, f'{B}-take-medias-{VER}.json')
        if os.path.exists(p) and p not in tms: tms.append(p)
    for TM in tms:
        for e in L.load_json(TM):
            if e.get('role') in ('start_image', 'end_image'): stop(10, f"{e['role']} in {os.path.basename(TM)} (never a frame as start or end image)")
            f = by_id.get(e.get('value') or e.get('media_id') or e.get('id'))
            if f and BLENDER.search(f): stop(2, f'Blender still on its own in {os.path.basename(TM)}: {f}')
            if f and is_film_frame(f): stop(10, f'a frame of the film in {os.path.basename(TM)}: {f}')
    if tms:
        note('take medias read: ' + ', '.join(os.path.relpath(t, FILM) for t in tms) + ('' if reg_p else ' (no upload-registry.json: media ids not mapped to files)'))
    # ---- 11: spec sections assemble.py knows
    spec = os.path.join(GD, f'{B}-prompt-spec.md')
    if os.path.exists(spec):
        for ln in open(spec).read().splitlines():
            if ln.startswith('## ') and not ln.startswith('###'):
                h = ln[3:].strip()
                if h not in known: stop(11, f"## {h} in {B}-prompt-spec.md: assemble.py does not emit it, so its text never reaches the prompt (--explain lists the sections it knows)")
    else:
        note(f'no {B}-prompt-spec.md: the spec-section check is skipped (a pick-up prompt is cut from the approved take\'s prompt)')
    size = ('inside the aim of about 8,000 to 10,000' if len(P) <= 10000 else
            'over the aim of about 8,000 to 10,000, under the ceiling of about 15,000' if len(P) <= 15000 else
            'PAST the ceiling of about 15,000: cut the acting tasks down to the least the note allows before sending')
    note(f'{len(P)} characters, {size} (Flow v3.3 - 6 Scene prompts, step 2; said here, not a STOP)')
    if M:
        header = (f"{B} {VER}: {len(P)} chars | {len(kinds['VIDEO'])} videos ({tot:.1f} s) | {len(kinds['IMAGE'])} images ({len(pg)} pages) | "
                  f"{len(kinds['AUDIO'])} audio | {M['settings']['duration']} s generation" + (f" | span {', '.join(span)} of {plan['previz_take']}" if span else ''))
    else:
        header = f'{B} {VER}: {len(P)} chars | no media list'
    return finish(header)


if __name__ == '__main__':
    sys.exit(main())
