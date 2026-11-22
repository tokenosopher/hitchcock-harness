"""The builder's check before the critic: free, in seconds, from the scene's own numbers.
    .venv/bin/python tools/previz/blender_run.py <scene script> -- --film <film> --facts     (or any --check / --panels / take)
    .venv/bin/python tools/previz/precheck.py <film> <G> [--write] [--json <out>] [--quiet]
It reads <film>/previz/<G>/<G>-facts.json (what the cameras see, measured in the built scene by the kit), the scene file
generations/<G>/<G>-scene.md, the newest storyboard version (board.json, panels), the newest take json, locations/views.md and
the scene before's facts, and prints one line per miss, grouped by check, then a count. Exit code 1 when there is a WARN.

The checks, for every shot:
  size      the shot's size, from how many frame heights its subject's height makes, against the word the scene file uses
  sight     each named head and each hand in use (raised or holding) inside the frame, big enough, not covered; a figure
            nobody named cut by the frame's edge
  lens      a face turned less than 5 degrees off the lens (reads as a look into it) unless the shot asks for it
  line      two people keep their screen sides across a cut; two who look at each other in two cuts look opposite ways;
            the same across the seam from the scene before
  reach     a held prop within a hand's reach (its nearest surface within 6 cm of the palm)
  inside    no body part inside furniture (more than 3 cm in)
  timing    each line's words against its seconds at speaking pace (film.json "speech_wps", default 2.6 words a second,
            plus 0.3 s); a move whose most happens off screen (before the cut, or out of frame)
  panels    the panels of one shot different enough to show its action
  claims    every "screen left / right", "left / right edge", "left / right of centre" in the scene file's shot text and in
            the board's captions, checked by projection; names in a shot's "In shot" lines the camera never sees
  plate     a shot standing off the plate its painted view was painted over (views.md's camera column, views_cams.py)
  stale     the newest take or storyboard older than a change to what the scene is built from (a shared script, a room)
  carried   captions carried from an earlier version and not written again from the new frame
--write (proposal 1): writes the kit's line into every shot of the scene file, from the numbers ("*Previz numbers (kit):
size, lens, camera place, who is in frame and the look directions*", replaced on every run, never edited by hand), and the
board's camera lines. The builder then writes only what numbers cannot say."""
import glob, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from views_cams import view_cameras

SIZE_ORDER = ['extreme close-up', 'close-up', 'medium close-up', 'medium', 'full', 'wide']
SIZE_WORDS = [('extreme close-up', 0), ('extreme close', 0), ('ecu', 0), ('medium close-up', 2), ('medium close', 2),
              ('medium wide', 4), ('medium long', 4), ('medium full', 4), ('full-length', 4), ('full length', 4), ('full shot', 4),
              ('cowboy', 4), ('close-up', 1), ('close up', 1), ('close', 1), ('medium', 3), ('mid shot', 3), ('wide', 5),
              ('long shot', 5), ('establishing', 5), ('two-shot', None), ('insert', None)]
KIT_LINE = '*Previz numbers (kit'
LOOK_ASK = re.compile(r'into the lens|to the lens|at the lens|into camera|to camera|at camera|down the lens', re.I)


def natural(s): return [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', s)]


def load(p):
    with open(p) as fh: return json.load(fh)


# ------------------------------------------------------------------ the scene file
def scene_shots(md):
    """{shot id: dict(start, end, size_line, text, in_shot, lines)} from the scene file's ### SHOT blocks"""
    out = {}; L = md.split('\n'); cur = None
    for i, l in enumerate(L):
        m = re.match(r'#{2,4}\s*SHOT\s+([0-9]+[A-Za-z]?)\b', l, re.I)
        if m:
            if cur: cur['end'] = i
            cur = dict(id=m.group(1).upper(), start=i, end=len(L)); out[cur['id']] = cur; continue
        if cur and re.match(r'#{1,3}\s', l) and not re.match(r'#{2,4}\s*SHOT', l, re.I): cur['end'] = i; cur = None
    for s in out.values():
        blk = L[s['start']:s['end']]; s['text'] = '\n'.join(blk)
        s['size_line'] = next((x for x in blk if x.startswith('**Size:**')), '')
        s['in_shot'] = [x for x in blk if x.lstrip().startswith('- ')]
        s['builder'] = next((x for x in blk if x.startswith('*Builder')), '')
    return out


def size_class(line):
    t = line.lower().replace('**size:**', '')
    t = re.sub(r'\(.*?\)', '', t)
    best = None
    for w, c in SIZE_WORDS:
        i = t.find(w)
        if i >= 0 and (best is None or i < best[0] or (i == best[0] and len(w) > len(best[1]))): best = (i, w, c)
    return (best[1], best[2]) if best else (None, None)


# ------------------------------------------------------------------ names
def name_map(film, facts):
    names = {}
    for n in facts.get('people', {}):
        names[n.lower().replace('_', ' ')] = n; names['[%s]' % n.lower().replace('_', ' ')] = n; names['[%s]' % n.lower()] = n
    try:
        fj = load(os.path.join(film, 'previz', 'film.json'))
        for a, n in (fj.get('aliases') or {}).items(): names[a.lower()] = n.upper()
    except Exception:
        pass
    return names


# ------------------------------------------------------------------ claims of screen side
SIDE = re.compile(r"(?:(?:screen|frame)[ -](left|right))|(?:(left|right)[ -](?:edge|side) of (?:the )?(?:frame|screen))|"
                  r"(?:the (left|right) edge)|(?:(left|right) of (?:the )?(?:centre|center|frame))|(?:(?:upper|lower|top|bottom) (left|right)\b)|"
                  r"(?:\bat (?:the )?(left|right)\b(?! (?:hand|arm|knee|foot|shoulder|side of)))", re.I)
OUTSIDE = re.compile(r'outside the (left|right) edge|out of (?:the )?frame at (?:the |screen )?(left|right)|leaves? (?:the )?frame at (?:screen )?(left|right)', re.I)


def claims(text, names, subject):
    """[(who, kind, side, phrase)] from free text: kind 'look', 'hand.L/R', 'pos', 'out'"""
    res = []
    for line in text.split('\n'):
      ctx = [None]                           # the last person this line names: "his" and "he" are that one (else the subject)
      for cl in re.split(r'[.;:]\s|—|\(|\)', line):
        subject_ = subject
        def named(txt):
            w_, p_ = None, -1
            for k, n in names.items():
                for mm in re.finditer(r'(?<![a-z])' + re.escape(k) + r'(?![a-z])', txt.lower()):
                    if mm.start() > p_: w_, p_ = n, mm.start()
            return w_
        subject = ctx[0] or subject_
        for m in SIDE.finditer(cl):
            side = next(g for g in m.groups() if g).lower(); before = cl[:m.start()].lower()
            def last_subject(txt):
                w_, p_ = None, -1
                for k, n in names.items():
                    for mm in re.finditer(r'(?<![a-z])' + re.escape(k) + r'(?![a-z])', txt):
                        if mm.start() > p_: w_, p_ = n, mm.start()
                for mm in re.finditer(r"\bhe\b|\bhis (?:\w+ )?(?:hand|arm|fist|palm|eyes|face|head|gaze|look)\b", txt):
                    if mm.start() > p_ and subject: w_, p_ = subject, mm.start()
                return w_, p_
            lw = list(re.finditer(r'\b(looks?|looking|eyes|gaze|glances?|watch(?:es)?|face|turned|turns)\b', before))
            looky = lw and re.search(r'past the lens|lens at|toward screen|to screen|away from the lens', cl[lw[-1].start():m.end()].lower())
            if looky and not re.search(r'(,|\band)\s+(his|he)\b', before[lw[-1].end():]):   # not "..., and his right arm rises at screen left"
                who, wpos = last_subject(before[:lw[-1].start() + len(lw[-1].group(0))])   # the one who looks, not the one looked at
                if who is None: continue
                res.append((who, 'look', side, cl.strip()[:140])); continue
            who, wpos = last_subject(before)
            if who is None: continue
            seg = before[max(0, wpos):] if wpos >= 0 else before
            om = OUTSIDE.search(cl[max(0, m.start() - 30):m.end() + 5])
            hm = re.search(r'\b(left|right) (?:hand|arm|fist|palm)\b', seg) or re.search(r'\b(left|right) (?:hand|arm|fist|palm)\b', cl.lower())
            if re.search(r'\b(look|looks|looking|eyes|gaze|glance|past the lens|watch|watches)\b', seg): kind = 'look'
            elif hm and re.search(r'hand|arm|fist|palm', seg + cl.lower()[m.start():m.end() + 10]): kind = 'hand.' + hm.group(1)[0].upper()
            elif re.search(r'\b(hand|arm|fist|palm)\b', seg): kind = 'hand.?'
            elif om: kind = 'out'
            else: kind = 'pos'
            res.append((who, kind, side, cl.strip()[:140]))
        n_ = named(cl)
        if n_: ctx[0] = n_
        subject = subject_
    return res


def judge(c, mom):
    """None when the claim holds (or cannot be judged) at this moment, else what the scene has"""
    who, kind, side, _ = c; d = mom['figures'].get(who)
    if d is None:
        pr = mom.get('props', {}).get(who)
        if pr is None or kind != 'pos': return None
        x = pr[0]; return None if (side == 'left') == (x < 0.5) or 0.45 <= x <= 0.55 else 'x %.2f' % x
    if kind == 'look':
        if d['look'] in ('into the lens', 'away from the lens') or abs(d.get('look_x', 0)) < 0.15: return None
        return None if d['look'] == 'screen ' + side else 'looks %s (%.0f° off the lens)' % (d['look'], d['face_to_lens'])
    if kind == 'hand.?':                     # "his raised hand in the upper left": any raised hand on that side holds
        hs = [h for h in d.get('hands', {}).values() if h.get('raised') and h['at'][2] > 0]
        if not hs: return None
        return None if any((side == 'left' and h['at'][0] < 0.55) or (side == 'right' and h['at'][0] > 0.45) for h in hs) else 'the raised hand at x %.2f' % hs[0]['at'][0]
    if kind.startswith('hand.'):
        h = d.get('hands', {}).get(kind[-1])
        if not h: return None
        x = h['at'][0]
        if h['at'][2] <= 0: return None
        return None if (side == 'left' and x < 0.55) or (side == 'right' and x > 0.45) else 'the %s hand at x %.2f' % ('left' if kind[-1] == 'L' else 'right', x)
    x = d['head'][0]
    if d['head'][2] <= 0: return None
    if kind == 'out': return None if (side == 'left' and x < 0.2) or (side == 'right' and x > 0.8) else 'head at x %.2f (in the frame)' % x
    return None if (side == 'left' and x < 0.55) or (side == 'right' and x > 0.45) else 'head at x %.2f' % x


# ------------------------------------------------------------------ the checks
class Report(object):
    def __init__(self): self.items = []
    def add(self, check, where, msg, level='WARN'): self.items.append(dict(check=check, where=where, msg=msg, level=level))


def mid(sh): return sh['moments'][len(sh['moments']) // 2]


def check_all(film, G, opts):
    pv = os.path.join(film, 'previz', G); fp = os.path.join(pv, '%s-facts.json' % G)
    if not os.path.exists(fp): sys.exit('precheck: no %s; run the scene script with --facts first' % fp)
    F_ = load(fp); R = Report(); shots = F_['shots']; names = name_map(film, F_)
    gdir = os.path.join(film, 'generations', G); mdp = os.path.join(gdir, '%s-scene.md' % G)
    md = open(mdp).read() if os.path.exists(mdp) else ''
    S_ = scene_shots(md)
    try: fj = load(os.path.join(film, 'previz', 'film.json'))
    except Exception: fj = {}
    m_ = re.search(r'(\d+(?:\.\d+)?) words a second', md)
    wps = float(m_.group(1)) if m_ else float(fj.get('speech_wps', 2.6)); tail = float(fj.get('speech_tail', 0.0))
    # size
    for sh in shots:
        st = S_.get(sh['id'].upper())
        if not st or not st['size_line'] or not sh.get('size'): continue
        w, c = size_class(st['size_line'])
        if c is None: continue
        who, fill = sh['subject'], sh['fill']
        low = st['size_line'].lower(); best = None
        for k_, n_ in names.items():                       # the figure the Size line names, when it names one
            i_ = low.find(k_)
            if i_ >= 0 and (best is None or i_ < best[0]): best = (i_, n_)
        if best and best[1] != who:
            fs = sorted(m['figures'][best[1]]['fill'] for m in sh['moments'] if best[1] in m['figures'] and m['figures'][best[1]].get('fill'))
            if fs: who, fill = best[1], fs[len(fs) // 2]
        size = None
        for w_, lo in (('extreme close-up', 6.5), ('close-up', 3.4), ('medium close-up', 2.3), ('medium', 1.45), ('full', 0.85), ('wide', 0.0)):
            if fill >= lo: size = w_; break
        have = SIZE_ORDER.index(size)
        if abs(have - c) >= 2:
            R.add('size', 'shot %s' % sh['id'], 'the scene file says "%s"; the frame is a %s: %s makes %.1f frame heights (at %g°)' % (
                w, size, who, fill, sh['diag']))
    # sight (the kit's in-frame sight lines) and edges, lens
    for sh in shots:
        seen_edge = set()
        for m in sh['moments']:
            for n, d in m['figures'].items():
                if n == '_edges':
                    for e in d:
                        if e['tag'] not in sh['in_frame'] and (e['tag'], e['cut_by']) not in seen_edge:
                            seen_edge.add((e['tag'], e['cut_by'])); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), 'a %s figure (%s), not named in the shot, stands cut by the %s' % (e['tag'], e['fig'], e['cut_by']))
                    continue
                if not d.get('in_frame'):
                    continue
                if n not in sh['in_frame']:
                    if d.get('cut_by') and (n, d['cut_by']) not in seen_edge:
                        seen_edge.add((n, d['cut_by'])); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), '%s, not named in the shot, stands cut by the %s' % (n, d['cut_by']))
                    continue
                k = (n, 'cover')
                if d.get('head_covered') and k not in seen_edge:
                    big = n == sh.get('subject') or d.get('head_px', 0) >= 0.04 * F_['res'][1]
                    seen_edge.add(k); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), "%s's face is covered by %s" % (n, d['head_covered']), 'WARN' if big else 'INFO')
                if d.get('head_px', 99) < 0.025 * F_['res'][1] and sh.get('size') not in ('wide', 'full') and (n, 'small') not in seen_edge:
                    seen_edge.add((n, 'small')); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), "%s's head is %d px high: too small to read" % (n, d['head_px']))
                for sd, h in (d.get('hands') or {}).items():
                    if not (h.get('raised') or h.get('holding')): continue
                    what = "%s's %s hand (%s)" % (n, 'left' if sd == 'L' else 'right', 'holding ' + ', '.join(h['holding']) if h.get('holding') else 'raised')
                    kk = (n, sd)
                    if kk in seen_edge: continue
                    if not h.get('in_frame'):
                        said = re.search(r'\b(hand|palm|fist)\b', S_.get(sh['id'].upper(), {}).get('text', '') + ' '.join(p_.get('caption') or '' for p_ in F_.get('panels', []) if p_['shot'] == sh['id']), re.I)
                        seen_edge.add(kk); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), '%s is out of the frame%s' % (what, ' (the words of the shot speak of the hand)' if said else ''), 'WARN' if said else 'INFO')
                    elif h.get('covered'): seen_edge.add(kk); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), '%s is covered by %s' % (what, h['covered']))
                    elif h.get('at_edge'): seen_edge.add(kk); R.add('sight', 'shot %s at %.2f s' % (sh['id'], m['t']), '%s is at the very edge of the frame (x %.2f, y %.2f)' % (what, h['at'][0], h['at'][1]))
                if d.get('face_to_lens', 99) < 5 and not LOOK_ASK.search(S_.get(sh['id'].upper(), {}).get('text', '')) and (n, 'lens') not in seen_edge:
                    seen_edge.add((n, 'lens')); R.add('lens', 'shot %s at %.2f s' % (sh['id'], m['t']), "%s's face is %.1f° off the lens: it reads as a look into the lens, and the shot does not ask for one" % (n, d['face_to_lens']))
                for part, v in (d.get('inside') or {}).items():
                    if (n, part) not in seen_edge:
                        seen_edge.add((n, part)); R.add('inside', 'shot %s at %.2f s' % (sh['id'], m['t']), "%s's %s is %.0f cm inside %s" % (n, part, v['depth'] * 100, v['inside']))
                for sd, h in (d.get('hands') or {}).items():
                    for pn, gap in (h.get('prop_gap') or {}).items():
                        if gap is not None and gap > 0.06 and (pn, 'gap') not in seen_edge:
                            seen_edge.add((pn, 'gap')); R.add('reach', 'shot %s at %.2f s' % (sh['id'], m['t']), '%s held in %s\'s %s hand is %.0f cm from the palm: it floats' % (pn, n, 'left' if sd == 'L' else 'right', gap * 100))
    # the line between two people, and eyelines, across each cut
    def sides(sh):
        m = mid(sh); out = {n: d['head'][0] for n, d in m['figures'].items() if not n.startswith('_') and d.get('in_frame') and n in sh['in_frame']}
        out.update({n: p[0] for n, p in (m.get('props') or {}).items() if n in sh['in_frame'] and n not in out})   # a prop named in the shot (the throne)
        return out
    def cut_pairs(a, b, where):
        sa, sb = sides(a), sides(b)
        both = sorted(set(sa) & set(sb))
        for i in range(len(both)):
            for j in range(i + 1, len(both)):
                p, q = both[i], both[j]
                if abs(sa[p] - sa[q]) < 0.08 or abs(sb[p] - sb[q]) < 0.08: continue
                if (sa[p] < sa[q]) != (sb[p] < sb[q]):
                    R.add('line', where, '%s and %s swap screen sides across the cut (%s %.2f / %.2f, then %.2f / %.2f): the camera crossed the line between them' % (p, q, p, sa[p], sa[q], sb[p], sb[q]))
        ma, mb = mid(a)['figures'], mid(b)['figures']
        for p, d in ma.items():
            if p.startswith('_') or not d.get('in_frame') or not d.get('looks_at'): continue
            q = d['looks_at']; e = mb.get(q)
            if e and e.get('in_frame') and p not in sb and q not in sa and q in b['in_frame']:   # A looks at B, then B alone
                if d['look'] == e['look'] and d['look'].startswith('screen'):
                    R.add('line', where, '%s looks %s at %s, then %s looks %s: if they look at each other, both look the same way, so they never seem to face each other' % (p, d['look'], q, q, e['look']))
    for a, b in zip(shots, shots[1:]): cut_pairs(a, b, 'shots %s → %s' % (a['id'], b['id']))
    prevs = sorted([g for g in os.listdir(os.path.join(film, 'previz')) if os.path.exists(os.path.join(film, 'previz', g, '%s-facts.json' % g)) and natural(g) < natural(G)], key=natural)
    if prevs and shots:
        pf = load(os.path.join(film, 'previz', prevs[-1], '%s-facts.json' % prevs[-1]))
        if pf['shots']: cut_pairs(pf['shots'][-1], shots[0], 'the seam %s shot %s → %s shot %s' % (prevs[-1], pf['shots'][-1]['id'], G, shots[0]['id']))
    # timing: lines and moves
    for l in F_.get('lines') or []:
        words = len(re.findall(r"[A-Za-z0-9']+", l.get('text', ''))); need = words / wps + tail; have = l['t'][1] - l['t'][0]
        if words and have + 0.05 < need:
            R.add('timing', '%s at %.1f-%.1f s' % (l['who'], l['t'][0], l['t'][1]), '%d words need %.1f s at %.1f words a second; the line has %.1f s' % (words, need, wps, have))
        if l['t'][1] > F_['duration'] + 0.01: R.add('timing', '%s at %.1f s' % (l['who'], l['t'][0]), 'the line runs past the end of the scene (%.1f s)' % F_['duration'])
    for mv in F_.get('moves') or []:
        t = mv.get('t'); who = (mv.get('who') or '').upper()
        if not t or t[1] - t[0] < 0.2 or who not in F_.get('people', {}): continue
        on = 0.0
        for sh in shots:
            a, b = max(t[0], sh['t0']), min(t[1], sh['t1'])
            if b <= a: continue
            if any(m['figures'].get(who, {}).get('in_frame') for m in sh['moments']): on += b - a
        frac = on / (t[1] - t[0])
        if frac < 0.5:
            R.add('timing', '%s %.2f-%.2f s' % (who, t[0], t[1]), '%s "%s": only %.0f%% of it is on screen (%.2f of %.2f s): it happens before the cut or out of frame' % (who, mv.get('what', '')[:60], frac * 100, on, t[1] - t[0]))
    # the storyboard: panels alike, captions' claims, carried captions
    sb = sorted(glob.glob(os.path.join(pv, 'storyboard', 'v*')), key=natural)
    board, panels = None, []
    if sb:
        vd = sb[-1]
        if os.path.exists(os.path.join(vd, 'board.json')): board = load(os.path.join(vd, 'board.json'))
        if os.path.exists(os.path.join(vd, 'panels.json')): panels = load(os.path.join(vd, 'panels.json'))
        try:
            from PIL import Image
            by = {}
            for p in panels: by.setdefault(str(p['shot']), []).append(p)
            for sid, ps in by.items():
                ims = []
                for p in ps:
                    f = os.path.join(vd, p['file'])
                    if os.path.exists(f): ims.append((p['n'], Image.open(f).convert('L').resize((54, 96))))
                sh = next((x for x in shots if x['id'] == sid), None)
                acts = [mv for mv in (F_.get('moves') or []) if sh and mv.get('t') and mv['t'][0] < sh['t1'] and mv['t'][1] > sh['t0']
                        and (mv.get('who') or '').upper() in set(sh['in_frame'])]
                for (n1, a), (n2, b) in zip(ims, ims[1:]):
                    d = sum(abs(x - y) for x, y in zip(a.getdata(), b.getdata())) / float(54 * 96)
                    if d < opts.get('alike', 0.6):
                        R.add('panels', 'shot %s, panels %s and %s (%s)' % (sid, n1, n2, os.path.basename(vd)),
                              'the two panels differ by %.1f of 255 on average%s' % (d, ': the action (%s) does not show between them' % '; '.join('%s %s' % (mv['who'].title(), mv.get('what', '')[:40]) for mv in acts[:2]) if acts else ' (no move of anyone in frame here: a held moment)'),
                              'WARN' if acts else 'INFO')
        except ImportError:
            pass
        if board:
            caps = {c['n']: c for c in board.get('captions', [])}
            for p in panels:
                c = caps.get(p['n'])
                if not c: continue
                if c.get('carried_from'):
                    R.add('carried', 'panel %s (%s)' % (p['n'], os.path.basename(vd)), 'its caption was carried from %s: write it again from the new frame, then delete "carried_from"' % c['carried_from'])
                sh = next((s for s in shots if s['id'] == str(p['shot'])), None)
                if not sh: continue
                mom = min(sh['moments'], key=lambda m: abs(m['t'] - float(p['t'])))
                if abs(mom['t'] - float(p['t'])) > 0.06: continue
                for cl in claims(c.get('caption', ''), names, sh.get('subject')):
                    bad = judge(cl, mom)
                    if bad: R.add('claims', 'panel %s caption' % p['n'], '"%s": %s says %s, the frame has %s' % (cl[3][:90], cl[0], cl[2], bad))
    # the scene file's claims and names
    for sh in shots:
        st = S_.get(sh['id'].upper())
        if not st: continue
        txt = '\n'.join(x for x in st['text'].split('\n') if not x.startswith(KIT_LINE))
        for cl in claims(txt, names, sh.get('subject')):
            bads = [judge(cl, m) for m in sh['moments']]; nb = [b for b in bads if b]
            if (cl[1] == 'out' and len(nb) == len(bads)) or (cl[1] != 'out' and len(nb) * 2 > len(bads)):   # leaving the frame: true at some moment
                R.add('claims', 'shot %s text' % sh['id'], '"%s": %s %s, the frame has %s' % (cl[3][:100], cl[0], cl[2], nb[len(nb) // 2]))
        seen = set()
        for m in sh['moments']: seen |= set(k for k, v in m['seen'].items() if v)
        for l in st['in_shot']:
            for tag in re.findall(r'\[([A-Z][A-Z _]+)\]', l):
                t = tag.strip().replace(' ', '_')
                if t in F_.get('people', {}) and t not in seen:
                    R.add('claims', 'shot %s In shot' % sh['id'], 'the text names %s; the camera never sees %s (in-frame-only text)' % (t, t)); seen.add(t)
    # plate: the shot against the camera its view was painted over
    vc = view_cameras(film)
    for sh in shots:
        st = S_.get(sh['id'].upper())
        if not st: continue
        for tag in sorted(set(re.findall(r'\[[A-Z][A-Z ]+\]', st['text']))):
            c = vc.get(tag)
            if not c: continue
            used = re.search(r'%s shots? ([0-9A-Z ,and]+)' % re.escape(G), c.get('used', ''))
            if used and sh['id'].upper() not in re.findall(r'[0-9]+[A-Z]?', used.group(1)): continue
            dp = math.dist(c['cam'], sh['cam']); dy = abs((c['yaw'] - sh['yaw'] + 180) % 360 - 180); dt = abs(c['pitch'] - sh['pitch']); dd = abs(c['diag'] - sh['diag'])
            if dp > 0.15 or dy > 1.5 or dt > 1.5 or dd > 1.0:
                R.add('plate', 'shot %s %s' % (sh['id'], tag), 'the camera stands %.2f m, yaw %.1f°, pitch %.1f°, lens %.0f° off the plate the view was painted over%s (%s): repaint, or move the camera back' % (
                    dp, dy, dt, dd, ' (approximate: from the take nearest the plate)' if c.get('approx') else '', c['plate'].strip('`')))
    # stale: the newest take and storyboard against what the scene is built from now
    now = {p: h for p, h in (F_.get('built_from') or {}).items() if '/tools/previz/kit/' not in p and not p.endswith(('.blend', '.blend.json', '.lock'))}
    takes = sorted(glob.glob(os.path.join(pv, '%s-previz-take-*.json' % G)), key=natural)
    def stale(rec_from, mtime, what):
        if rec_from:
            ch = [os.path.basename(p) for p, h in now.items() if p in rec_from and rec_from[p] != h]
            if ch: R.add('stale', what, 'rendered before %s changed: render it again before the critic' % ', '.join(sorted(ch)))
        else:
            newer = [os.path.basename(p) for p in now if os.path.exists(p) and os.path.getmtime(p) > mtime + 1]
            if newer: R.add('stale', what, 'older than %s (by the files\' times): render it again before the critic' % ', '.join(sorted(newer)))
    if takes: tj = load(takes[-1]); stale(tj.get('built_from'), os.path.getmtime(takes[-1]), os.path.basename(takes[-1]))
    if sb:
        bf = os.path.join(sb[-1], 'built-from.json')
        stale(load(bf).get('built_from') if os.path.exists(bf) else None, os.path.getmtime(os.path.join(sb[-1], 'panels.json')) if os.path.exists(os.path.join(sb[-1], 'panels.json')) else 0, 'storyboard ' + os.path.basename(sb[-1]))
    return F_, R, S_, md, mdp, board, sb


# ------------------------------------------------------------------ proposal 1: the words written from the numbers
def kit_line(sh, F_):
    m = mid(sh); figs = {n: d for n, d in m['figures'].items() if not n.startswith('_')}
    where = lambda x: 'left' if x < 0.4 else 'right' if x > 0.6 else 'centre'
    inf = []
    for n, d in sorted(figs.items(), key=lambda kv: kv[1]['head'][0]):
        if d.get('in_frame'): inf.append('%s (%s)' % (n, where(d['head'][0])))
    for k, v in m['seen'].items():
        if k not in figs and v: inf.append('%s (%d)' % (k, v))
    looks = []
    for n, d in figs.items():
        if not d.get('in_frame') or n not in sh['in_frame']: continue
        l = d['look'] if d['look'] in ('into the lens', 'away from the lens') else 'past the lens at %s' % d['look'] if d['face_to_lens'] < 45 else d['look']
        looks.append('%s looks %s (%.0f° off the lens)%s' % (n, l, d['face_to_lens'], (' at %s' % d['looks_at']) if d.get('looks_at') else ''))
    subj = sh.get('subject'); dist = figs.get(subj, {}).get('dist') if subj else None
    mv = 'locked off' if not sh.get('move') else 'moves to x %.2f y %.2f, %.2f m high, yaw %.0f°' % (sh['move_to']['cam'][0], sh['move_to']['cam'][1], sh['move_to']['cam'][2], sh['move_to']['yaw'])
    return ('%s, %s): %s · lens %g° (%d mm full-frame) · camera x %.2f y %.2f, %.2f m high%s, facing %s (yaw %.0f°), %s %d°, %s%s · in frame: %s%s*' % (
        KIT_LINE, F_['written'][:16].replace('T', ' '),
        ('%s of %s (%.1f frame heights)' % (sh['size'], subj, sh['fill'])) if sh.get('size') else 'no named figure in frame',
        sh['diag'], sh['lens_ff_mm'], sh['cam'][0], sh['cam'][1], sh['cam'][2], (', %.1f m from %s' % (dist, subj)) if dist else '', sh['facing'], sh['yaw'],
        'tilted up' if sh['pitch'] >= 0 else 'tilted down', round(abs(sh['pitch'])), mv, ', handheld' if sh.get('handheld') else '',
        ', '.join(inf) or 'no one', (' · ' + '; '.join(looks)) if looks else ''))


def write_scene(F_, S_, md, mdp):
    L = md.split('\n'); ins = []
    for sh in F_['shots']:
        st = S_.get(sh['id'].upper())
        if not st: continue
        line = kit_line(sh, F_); blk = range(st['start'], st['end'])
        old = [i for i in blk if L[i].startswith(KIT_LINE)]
        if old: ins.append((old[0], line, True))
        else:
            b = [i for i in blk if L[i].startswith('*Builder')]
            at = (b[0] + 1) if b else next((i + 1 for i in blk if L[i].startswith('**Focus:**')), st['start'] + 1)
            ins.append((at, line, False))
    for i, line, rep in sorted(ins, reverse=True):
        if rep: L[i] = line
        else: L[i:i] = ['', line] if L[i - 1].strip() else [line]
    open(mdp, 'w').write('\n'.join(L)); return len(ins)


def main():
    a = sys.argv[1:]
    if a[:1] in (['-h'], ['--help']): print(__doc__); sys.exit(0)
    if len(a) < 2: sys.exit(__doc__)
    film, G = os.path.abspath(a[0]), a[1]
    opts = dict(alike=float(a[a.index('--alike') + 1]) if '--alike' in a else 0.6)
    F_, R, S_, md, mdp, board, sb = check_all(film, G, opts)
    if '--write' in a:
        if md: print('precheck: the kit line written into %d shot(s) of %s' % (write_scene(F_, S_, md, mdp), mdp))
        if board and sb:
            kit = {s['id']: s['board'] for s in F_['shots']}; n = 0
            for s in board.get('shots', []):
                if not s.get('camera_by_hand') and str(s.get('shot')) in kit and s.get('camera') != kit[str(s['shot'])]: s['camera'] = kit[str(s['shot'])]; n += 1
            with open(os.path.join(sb[-1], 'board.json'), 'w') as fh: json.dump(board, fh, indent=1)
            print('precheck: %d camera line(s) of %s/board.json written from the scene' % (n, os.path.basename(sb[-1])))
    order = ['size', 'sight', 'lens', 'line', 'reach', 'inside', 'timing', 'panels', 'claims', 'plate', 'stale', 'carried']
    nw = 0
    if '--quiet' not in a:
        for c in order:
            for it in [x for x in R.items if x['check'] == c]:
                print('%-5s %-7s %s: %s' % (it['level'], c, it['where'], it['msg'])); nw += it['level'] == 'WARN'
    else: nw = sum(1 for x in R.items if x['level'] == 'WARN')
    print('PRECHECK %s: %s' % (G, 'ok' if not nw else '%d warning(s) (%s)' % (nw, ', '.join('%s %d' % (c, sum(1 for x in R.items if x['check'] == c and x['level'] == 'WARN')) for c in order if any(x['check'] == c and x['level'] == 'WARN' for x in R.items)))))
    if '--json' in a:
        with open(a[a.index('--json') + 1], 'w') as fh: json.dump(dict(generation=G, facts_written=F_['written'], items=R.items), fh, indent=1)
    sys.exit(1 if nw else 0)


if __name__ == '__main__':
    main()
