"""The scene's facts from its own numbers: what each shot's camera sees, measured in the built scene, so
the words about a shot are written from the scene and checked against it, never kept beside it by hand.

For every cut, at its start, middle and end, and at every panel's time, for every figure:
  - where its head is in the frame (x, y from the top-left 0..1), how tall the head is (px), whether it is covered and by what;
  - which way it looks: the angle between its face and the lens, the look on screen (left / right / into the lens / away), and
    the figure it looks at, if any;
  - each hand: in frame or not, covered or not, raised, holding a prop; a held prop's distance from the hand;
  - any body part inside the furniture (more than 3 cm in);
  - a figure cut by the frame's edge;
and per shot the subject (the focus figure), the size (how many frame heights the subject's height makes), the lens, the
camera's place, yaw, pitch and move. Written to <OUTDIR>/<G>-facts.json by --check, --panels, the take and --facts (fast lane,
no render); precheck.py reads it. The in-frame check prints the covered heads and hands as WARN lines."""
import bpy, json, math, os, re, time
from mathutils import Vector
from .core import S, F, sec
from .figures import FIGS, fig_tag
from .cameras import SHOTS, PLAN, cam_state, compass8, shot_size, fill_of, lens_ff, vfov, hfov, camera_line
from .props import PROPS

HEAD_PARTS = ('-skull', '-face', '-jaw', '-chin', '-nose', '-brow', '-ear', '-eye', '-neck')
HAND_PARTS = ('-palm', '-finger', '-thumb', '-farm')
BODY_PTS = (('pelvis', 'hips', 0.4), ('belly', 'spine', 0.25), ('chest', 'spine', 0.7), ('thigh.L', 'thigh.L', 0.5),
            ('thigh.R', 'thigh.R', 0.5), ('farm.L', 'farm.L', 0.5),            # (not the shins: legs under a table's cloth are fine)
            ('farm.R', 'farm.R', 0.5), ('uarm.L', 'uarm.L', 0.5), ('uarm.R', 'uarm.R', 0.5))
INSIDE_M = 0.03          # a body part this far inside furniture is a miss
HOLD_M = 0.06            # a held prop this far from the hand floats


def _top(o):
    while o.parent is not None: o = o.parent
    return o


def _owner(o):
    """(figure name, part suffix) when o is part of a figure (or a prop riding it), else (None, None)"""
    t = _top(o)
    if t.name in FIGS: return t.name, o.name[len(t.name):]
    f = o.get('fig') or t.get('fig')
    if f: return str(f), 'prop:' + t.name
    for c in t.constraints:
        if c.type == 'CHILD_OF' and c.target is not None and c.influence > 0.5 and c.target.name in FIGS:
            return c.target.name, 'prop:' + t.name
    return None, None


def _skip(o):
    if o is None: return True
    if o.hide_render: return True
    if o.get('previz_volume') or o.name.startswith(('haze', 'probe-')): return True
    try:
        for m in o.data.materials:
            if m is not None and m.use_nodes:
                out = m.node_tree.nodes.get('Material Output')
                if out is not None and out.inputs['Volume'].is_linked and not out.inputs['Surface'].is_linked: return True
                b = m.node_tree.nodes.get('Principled BSDF')
                if b is not None and b.inputs['Alpha'].default_value < 0.5: return True
    except Exception:
        pass
    return False


class Facts(object):
    def __init__(self):
        self.sc = S.sc; self.res = (self.sc.render.resolution_x, self.sc.render.resolution_y)
        self.colliders = None

    # ------------------------------------------------------------ projection and sight
    def proj(self, cam, p):
        from bpy_extras.object_utils import world_to_camera_view as w2c
        x, y, z = w2c(self.sc, cam, Vector(p)); return (round(x, 4), round(1 - y, 4), round(z, 3))

    @staticmethod
    def inside(pr, m=0.0):
        return pr[2] > 0 and -m <= pr[0] <= 1 + m and -m <= pr[1] <= 1 + m

    def first_hit(self, origin, target):
        """the first object a ray from origin meets on its way to target (hidden things, volumes and see-through glass skipped)"""
        dg = bpy.context.evaluated_depsgraph_get(); o_ = Vector(origin); d = Vector(target) - o_; L = d.length
        if L < 1e-6: return None, None
        d.normalize(); gone = 0.0
        for _ in range(24):
            hit, loc, nrm, idx, ob, mx = self.sc.ray_cast(dg, o_, d, distance=max(1e-4, L - gone - 1e-3))
            if not hit: return None, None
            ob = getattr(ob, 'original', ob)
            if not _skip(ob): return ob, loc
            step = (loc - o_).length + 1e-3; gone += step; o_ = loc + d * 1e-3
        return None, None

    def cover(self, cam, p, fig, parts, bones=()):
        """None when the line from the lens to p reaches the figure's own `parts` (or a piece riding one of `bones`, or nothing)
        first, else the name of what is in the way (a figure's name, a prop's, an object's)"""
        ob, loc = self.first_hit(cam.matrix_world.translation, p)
        if ob is None: return None
        own, part = _owner(ob)
        if own == fig and (part.startswith('prop:') or any(part.startswith(x) for x in parts) or
                           (ob.parent_type == 'BONE' and ob.parent_bone in bones)): return None
        if own is not None and own != fig:
            arm = FIGS.get(own, {}).get('arm') if own in FIGS else None
            return fig_tag(arm) if arm is not None else own
        if own == fig: return 'own body (%s)' % part.strip('-')
        return _top(ob).name

    # ------------------------------------------------------------ the figure at the current frame
    def figure(self, n, cam, campos):
        arm = FIGS[n]['arm']; s = arm.scale.z; mw = arm.matrix_world; pb = arm.pose.bones
        parts = [o for o in arm.children if o.type == 'MESH']
        if parts and all(o.hide_render for o in parts): return None
        H = lambda b, v: mw @ pb[b].matrix @ Vector(v)
        head_c = H('head', (0, 0.11, 0)); eyes = H('head', (0, 0.118, 0.085)); top = H('head', (0, 0.235, 0)); chin = H('head', (0, 0.005, 0.07))
        face = (eyes - head_c).normalized()
        to_cam = (campos - eyes); dist = to_cam.length; to_cam = to_cam.normalized()
        ang = math.degrees(face.angle(to_cam)) if face.length > 0 else 180.0
        pe, pt_, pc = self.proj(cam, eyes), self.proj(cam, top), self.proj(cam, chin)
        r = Vector((cam.matrix_world.to_3x3() @ Vector((1, 0, 0))))
        side = face.dot(r)
        if ang < 5: look = 'into the lens'
        elif ang > 135: look = 'away from the lens'
        else: look = 'screen right' if side > 0 else 'screen left'
        hips = mw @ pb['hips'].head
        d = dict(tag=fig_tag(arm), head=list(self.proj(cam, head_c)), eyes=list(pe), head_px=round(abs(pt_[1] - pc[1]) * self.res[1] * 1.15, 1),
                 dist=round(dist, 2), face_to_lens=round(ang, 1), look=look, look_x=round(side, 3), height=round(FIGS[n]['height'], 3))
        d['in_frame'] = self.inside(pe) or self.inside(self.proj(cam, head_c))
        if d['in_frame'] and d['tag'] == n: d['head_covered'] = self.cover(cam, eyes, n, HEAD_PARTS, ('head', 'neck'))
        # who it looks at
        best = None
        for m in FIGS:
            if m == n: continue
            am = FIGS[m]['arm']
            if am.hide_render and all(o.hide_render for o in am.children if o.type == 'MESH'): continue
            hm = am.matrix_world @ am.pose.bones['head'].matrix @ Vector((0, 0.11, 0)); v = hm - eyes
            if v.length < 1e-3: continue
            a = math.degrees(face.angle(v.normalized()))
            if a < 14 and (best is None or a < best[0]): best = (a, fig_tag(am) if fig_tag(am) != m else m)
        if best: d['looks_at'] = best[1]
        # the body's extent on screen (edge cuts) and its parts
        pts = [head_c, H('spine', (0, 0.7 * pb['spine'].bone.length, 0)), hips, H('shin.L', (0, 0, 0)), H('shin.R', (0, 0, 0)),
               H('foot.L', (0, 0, 0)), H('foot.R', (0, 0, 0))]
        r_ = Vector((cam.matrix_world.to_3x3() @ Vector((1, 0, 0)))); r_.z = 0
        if r_.length > 1e-6: r_.normalize()
        pts += [pts[1] + r_ * 0.21 * s, pts[1] - r_ * 0.21 * s, hips + r_ * 0.16 * s, hips - r_ * 0.16 * s]   # the body's breadth
        prs = [self.proj(cam, p) for p in pts]; xs = [p_[0] for p_ in prs if p_[2] > 0]
        if xs:
            d['x_span'] = [round(min(xs), 3), round(max(xs), 3)]
            chest = self.proj(cam, pts[1])
            ins = [self.inside(p_) for p_ in prs]; d['body_in_frame'] = any(ins)
            if any(ins) and not all(ins):
                if min(xs) < 0 < max(xs): d['cut_by'] = 'left edge'
                elif min(xs) < 1 < max(xs): d['cut_by'] = 'right edge'
            if chest[2] > 0 and (-0.04 < chest[0] < 0.04 or 0.96 < chest[0] < 1.04) and 0 <= chest[1] <= 1: d['cut_by'] = 'left edge' if chest[0] < 0.5 else 'right edge'
        if d['tag'] != n: return d                    # a crowd figure: place, look and edges only
        d['fill'] = round(fill_of(FIGS[n]['height'], max(0.05, self.proj(cam, pts[1])[2]), self._diag), 2)
        hands = {}
        for sd in ('L', 'R'):
            hb = pb['hand.' + sd]; palm = mw @ (hb.head + (hb.tail - hb.head) * 0.35); tip = mw @ hb.tail
            pp = self.proj(cam, palm)
            hd = dict(at=list(pp), in_frame=self.inside(pp), raised=bool(palm.z - hips.z > 0.3 * s))
            held = [nm for nm, po in PROPS.items() if self._held_by(po, arm, 'hand.' + sd)]
            if held:
                hd['holding'] = held; hd['prop_gap'] = {nm: self._gap(PROPS[nm], palm) for nm in held}
            if hd['in_frame']: hd['covered'] = self.cover(cam, palm, n, HAND_PARTS, ('hand.' + sd, 'farm.' + sd))
            if hd['in_frame'] and (pp[0] < 0.04 or pp[0] > 0.96 or pp[1] < 0.04 or pp[1] > 0.96): hd['at_edge'] = True
            hands[sd] = hd
        d['hands'] = hands
        inside = self._inside_furniture(arm, mw, pb)
        if inside: d['inside'] = inside
        return d

    def _held_by(self, po, arm, bone):
        if po is None or getattr(po, 'type', None) != 'EMPTY': return False
        for c in po.constraints:
            if c.type == 'CHILD_OF' and c.target == arm and c.subtarget == bone and c.influence > 0.5: return True
        return False

    def _gap(self, po, p):
        """the distance from world point p to the nearest surface of the prop's shapes (0 when p is inside one)"""
        best = None
        dg = bpy.context.evaluated_depsgraph_get()
        for o in [po] + list(po.children_recursive):
            if o.type != 'MESH' or o.hide_render: continue
            e = o.evaluated_get(dg); lp = e.matrix_world.inverted() @ p
            ok, loc, nrm, idx = e.closest_point_on_mesh(lp)
            if not ok: continue
            w = e.matrix_world @ loc; g = (w - p).length
            if (lp - loc).dot(nrm) < 0: g = 0.0
            best = g if best is None else min(best, g)
        return None if best is None else round(best, 3)

    def _colliders(self):
        if self.colliders is not None: return self.colliders
        shell = ('-floor', '-wall', '-ceiling')
        out = []
        for o in self.sc.objects:
            if o.type != 'MESH' or _skip(o) or o.get('water') or o.name.startswith(('water', 'kt-water', 'kt-foam')): continue
            own, part = _owner(o)
            if own is not None and not part.startswith('prop:'): continue
            if any(o.name.endswith(x) or (x + '') in o.name and o.name.split(x)[-1].isdigit() for x in shell): continue
            dims = o.dimensions
            if max(dims) > 60: continue          # the ground, the sea and the far land: not furniture
            out.append(o)
        self.colliders = out; return out

    def _inside_furniture(self, arm, mw, pb):
        dg = bpy.context.evaluated_depsgraph_get(); found = {}
        held = set()
        for nm, po in PROPS.items():
            if po is not None and getattr(po, 'type', None) == 'EMPTY' and any(c.type == 'CHILD_OF' and c.target == arm and c.influence > 0.5 for c in po.constraints):
                held.add(po.name)
        for o in self._colliders():
            t = _top(o)
            if t.name in held or o.get('fig') == arm.name or t.get('fig') == arm.name: continue
            e = o.evaluated_get(dg); M = e.matrix_world; Mi = M.inverted()
            bb = [M @ Vector(c) for c in e.bound_box]; lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
            for nm, b, u in BODY_PTS:
                p = mw @ (pb[b].head + (pb[b].tail - pb[b].head) * u)
                if not (lo.x - 0.01 <= p.x <= hi.x + 0.01 and lo.y - 0.01 <= p.y <= hi.y + 0.01 and lo.z - 0.01 <= p.z <= hi.z + 0.01): continue
                lp = Mi @ p; ok, loc, nrm, idx = e.closest_point_on_mesh(lp)
                if not ok: continue
                if (lp - loc).dot(nrm) < 0:
                    depth = (M @ loc - p).length
                    if depth > INSIDE_M and depth > found.get(nm, (0, ''))[0]: found[nm] = (round(depth, 3), _top(o).name)
        return {k: dict(depth=v[0], inside=v[1]) for k, v in found.items()}

    # ------------------------------------------------------------ one moment of one shot
    def moment(self, s_, t):
        self.sc.frame_set(F(t)); cam = s_['obj']; campos = cam.matrix_world.translation.copy()
        pos, yaw, pitch, fd, diag = cam_state(s_, t); self._diag = diag
        figs = {}; seen = {}
        for n in FIGS:
            d = self.figure(n, cam, campos)
            if d is None: continue
            vis = d['in_frame'] or ('x_span' in d and d['x_span'][1] > 0 and d['x_span'][0] < 1 and d['head'][2] > 0 and 0 <= d['head'][1] <= 1.3)
            if d['tag'] == n: figs[n] = d
            elif vis:
                if d.get('cut_by'): figs.setdefault('_edges', []).append(dict(fig=n, tag=d['tag'], cut_by=d['cut_by'], head=d['head']))
            if d['in_frame'] or d.get('body_in_frame'): seen.setdefault(d['tag'], []).append(n)
        props = {}
        for nm, po in PROPS.items():
            if po is None or getattr(po, 'type', None) != 'EMPTY': continue
            try: p = po.matrix_world.translation
            except ReferenceError: continue
            pr = self.proj(cam, p)
            if self.inside(pr): props[nm] = list(pr)
        return dict(t=round(t, 3), cam=[round(v, 3) for v in campos], yaw=round(yaw % 360, 1), pitch=round(pitch, 1), diag=round(diag, 1),
                    figures=figs, seen={k: len(v) for k, v in seen.items()}, props=props)


def subject_of(s_, moments):
    """the shot's subject: its focus figure, else the in_frame figure whose face is largest in frame across its moments"""
    if s_.get('subject'): return s_['subject']
    best = {}
    for m in moments:
        for n, d in m['figures'].items():
            if n.startswith('_') or not d.get('in_frame') or n not in s_['in_frame']: continue
            best[n] = max(best.get(n, 0), d.get('fill', 0))
    return max(best, key=best.get) if best else None


def build_facts(panels, moves, lines):
    """every shot's facts (see the module doc); returns the dict written to <G>-facts.json"""
    t0_ = time.time(); fx = Facts(); shots = []
    ptimes = {}
    for n, sid, t, cap in panels: ptimes.setdefault(str(sid), []).append((n, t))
    for lab, i, t0, t1 in PLAN:
        s_ = SHOTS[i]; times = sorted(set([round(t0 + 0.1, 3), round((t0 + t1) / 2, 3), round(t1 - 0.1, 3)] +
                                          [round(t, 3) for n, t in ptimes.get(lab, []) if t0 - 1e-6 <= t <= t1 + 1e-6]))
        moms = [fx.moment(s_, t) for t in times]
        subj = subject_of(s_, moms)
        fills = [m['figures'][subj]['fill'] for m in moms if subj and subj in m['figures'] and m['figures'][subj].get('in_frame') and 'fill' in m['figures'][subj]]
        fill = round(sorted(fills)[len(fills) // 2], 2) if fills else None
        s_['size'] = shot_size(fill) if fill is not None else None; s_['size_of'] = subj if fill is not None else None
        pos, yaw, pitch, fd, diag = cam_state(s_, t0)
        rec = dict(id=lab, t0=t0, t1=t1, in_frame=s_['in_frame'], subject=subj, focus=('%s (followed)' % s_['subject']) if s_.get('subject') else 'aim point',
                   size=s_['size'], fill=fill, diag=s_['diag'], lens_ff_mm=round(lens_ff(s_['diag'])), cam=[round(v, 2) for v in pos],
                   yaw=round(yaw % 360, 1), pitch=round(pitch, 1), facing=compass8(yaw), move=bool(s_['move']), handheld=bool(s_['handheld']),
                   board=camera_line(s_), moments=moms, panels=[n for n, t in ptimes.get(lab, [])])
        if s_['move']:
            p2, y2, pi2, _, d2 = cam_state(s_, s_['move'].get('t1', t1)); rec['move_to'] = dict(cam=[round(v, 2) for v in p2], yaw=round(y2 % 360, 1), pitch=round(pi2, 1), diag=round(d2, 1))
        shots.append(rec)
    from . import reuse as _r
    out = dict(generation=S.gen, title=S.title, duration=S.dur, ratio=S.ratio, res=list(fx.res), written=time.strftime('%Y-%m-%dT%H:%M:%S'),
               script=_r.script_path(), built_from=_r.inputs_now(), shots=shots,
               panels=[dict(n=n, shot=str(sid), t=t, caption=cap) for n, sid, t, cap in panels], moves=moves, lines=lines,
               people={n: dict(height=FIGS[n]['height'], tag=fig_tag(FIGS[n]['arm'])) for n in FIGS if fig_tag(FIGS[n]['arm']) == n},
               seconds=round(time.time() - t0_, 1))
    return out


def write_facts(panels, moves, lines):
    f = build_facts(panels, moves, lines)
    p = os.path.join(S.outdir, '%s-facts.json' % S.gen)
    with open(p, 'w') as fh: json.dump(f, fh, indent=1)
    print('FACTS %s (%d shots, %.1f s)' % (p, len(f['shots']), f['seconds']))
    return f


def warn_lines(f):
    """the in-frame check's WARN lines from the facts: named heads and the hands in use out of frame, covered or too small"""
    out = []
    for sh in f['shots']:
        for m in sh['moments']:
            for n, d in m['figures'].items():
                if n.startswith('_') or n not in sh['in_frame']: continue
                if d.get('in_frame') and d.get('head_covered'):
                    out.append('shot %s at %.2f s: %s\'s face is covered by %s' % (sh['id'], m['t'], n, d['head_covered']))
                if d.get('in_frame') and d.get('head_px', 99) < 0.025 * f['res'][1] and sh.get('size') not in ('wide', 'full'):
                    out.append('shot %s at %.2f s: %s\'s head is %d px high (under %d): too small to read' % (sh['id'], m['t'], n, d['head_px'], 0.025 * f['res'][1]))
                for sd, h in (d.get('hands') or {}).items():
                    if not (h.get('raised') or h.get('holding')): continue
                    what = '%s\'s %s hand (%s)' % (n, 'left' if sd == 'L' else 'right', 'holding ' + ', '.join(h['holding']) if h.get('holding') else 'raised')
                    if d.get('in_frame') and not h.get('in_frame'): out.append('shot %s at %.2f s: %s is out of the frame' % (sh['id'], m['t'], what))
                    elif h.get('covered'): out.append('shot %s at %.2f s: %s is covered by %s' % (sh['id'], m['t'], what, h['covered']))
    seen = set(); res = []
    for l in out:
        k_ = re.sub(r'\d+ px high \(under \d+\)', 'px', re.sub(r' at [\d.]+ s', '', l))
        if k_ not in seen: seen.add(k_); res.append(l)
    return res
