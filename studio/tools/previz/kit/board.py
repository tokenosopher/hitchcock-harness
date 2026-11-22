"""A storyboard version's board.json carried forward (plain Python: the kit's --panels and storyboard.py both use it).

A fresh kit-written board.json in a new version folder would lose the hand edits of the version before (the layout
note, a header, the captions as rewritten from the frames). So:
  - a new version whose folder has no hand-edited board.json starts from the newest earlier version's hand-edited one: every key
    the hand added (layout_note, header, ...) is kept; a caption is carried only to the panel of the same shot at the same time
    (within 0.05 s), marked "carried_from": "<version>", and precheck.py asks for it to be written again from the new frame
    (delete the mark when you have); a panel with no match gets the kit's caption;
  - the camera lines are the kit's, written from the scene's numbers, on a hand-edited board too (a shot entry with
    "camera_by_hand": true keeps its own).
"""
import json, os, re

TOL = 0.05


def _v(name):
    m = re.match(r'v(\d+)$', name); return int(m.group(1)) if m else None


def previous_hand_board(vdir):
    """(version name, board, panels) of the newest version before vdir whose board.json was edited by hand, else None"""
    sb = os.path.dirname(os.path.abspath(vdir)); me = _v(os.path.basename(os.path.abspath(vdir)))
    if me is None or not os.path.isdir(sb): return None
    vs = sorted((_v(d), d) for d in os.listdir(sb) if _v(d) is not None and _v(d) < me)
    for _, d in reversed(vs):
        bj, pj = os.path.join(sb, d, 'board.json'), os.path.join(sb, d, 'panels.json')
        if not os.path.exists(bj): continue
        with open(bj) as fh: b = json.load(fh)
        if b.get('generated_by') == 'previz kit': continue
        p = []
        if os.path.exists(pj):
            with open(pj) as fh: p = json.load(fh)
        return d, b, p
    return None


def carry(kitb, oldb, oldp, numbered, vname):
    """the new version's board: the kit's (camera lines, captions) with the old hand board's keys and matching captions"""
    nb = dict(kitb); nb.pop('generated_by', None)
    for k, v in oldb.items():
        if k not in ('shots', 'captions', 'generated_by', 'ratio', 'carried_from'): nb[k] = v
    oldcap = {c['n']: c for c in oldb.get('captions', [])}
    oldat = [(str(p['shot']), float(p['t']), oldcap.get(p['n'])) for p in oldp if p.get('n') in oldcap]
    caps, carried = [], 0
    for c in kitb['captions']:
        n = c['n']; me = next((x for x in numbered if x[0] == n), None); hit = None
        if me is not None:
            for sid, t, oc in oldat:
                if sid == str(me[1]) and abs(t - float(me[2])) <= TOL and oc: hit = oc; break
        if hit is not None and not (me[3]):              # a caption the script gives (run(panels=...)) wins over a carried one
            caps.append(dict(n=n, caption=hit['caption'], carried_from=vname)); carried += 1
        else: caps.append(dict(c))
    nb['captions'] = caps
    hand_cam = {str(s.get('shot')): s for s in oldb.get('shots', []) if s.get('camera_by_hand')}
    nb['shots'] = [hand_cam.get(str(s['shot']), s) for s in kitb['shots']]
    nb['carried_from'] = vname
    return nb, 'carried forward from %s: %s; %d of %d captions carried (marked carried_from: write each again from its new frame, then delete the mark)' % (
        vname, ', '.join(k for k in oldb if k not in ('shots', 'captions', 'generated_by', 'ratio', 'carried_from')) or 'no extra keys', carried, len(caps))


def refresh_cameras(handb, kitb):
    """a hand-edited board with the camera lines written again from the scene (except shots marked camera_by_hand), and
    entries added for shots it lacks. Returns (board, [shot ids changed])"""
    nb = dict(handb); kit = {str(s['shot']): s['camera'] for s in kitb['shots']}; changed = []; out = []; have = set()
    for s in handb.get('shots', []):
        s = dict(s); sid = str(s.get('shot')); have.add(sid)
        if not s.get('camera_by_hand') and sid in kit and s.get('camera') != kit[sid]: s['camera'] = kit[sid]; changed.append(sid)
        out.append(s)
    for sid, c in kit.items():
        if sid not in have: out.append(dict(shot=sid, camera=c)); changed.append(sid)
    nb['shots'] = out
    return nb, changed
