"""Rooms from a plan: a rectangular or L-shaped (any right-angled) floor, walls with door and window openings, a ceiling,
floor-level platforms and steps, large furniture as named boxes, cylinders, tables, chairs and cables, and the location's own
lights. Everything is plain grey (glowing parts keep their light). A plan is a dict (inline in the scene script, in
previz/film.json under locations.<KEY>.room, or a json file it points to):

  {"floor": [x0, y0, x1, y1]            a rectangle, or [[x, y], [x, y], ...] the corners of a right-angled polygon (an L)
   "height": 3.0, "wall": 0.25,          wall height and thickness (walls stand OUTSIDE the floor outline)
   "ceiling": 0.2,                       ceiling slab thickness (0 = open to the sky)
   "exposure": 0.0, "world": [r, g, b], "haze": 0.0,
   "rough": {"floor": 0.3, "wall": 0.85},  roughness per surface class (default 0.75 matte); any entry below may carry its own "rough"
   "openings": [{"name": "door", "wall": "N", "at": 1.2, "w": 0.9, "h": 2.1, "door": {"hinge": "W"}},
                {"name": "win", "wall": "E", "at": 0.0, "w": 1.4, "h": 1.2, "sill": 0.9, "shape": "rect" | "round" | "arch"}],
   "platforms": [{"name": "dais", "rect": [x0, y0, x1, y1], "top": 0.3}],
   "steps": [{"name": "stairs", "rect": [x0, y0, x1, y1], "n": 3, "rise": 0.18, "going": 0.3, "inset": 0.0, "up": "E"}],
   "furniture": [{"name": "bed", "kind": "box", "at": [x, y], "size": [w, d, h], "rot": 0},
                 {"name": "desk", "kind": "table", "at": [x, y], "size": [w, d, h], "rot": 90},
                 {"name": "chair", "kind": "chair", "at": [x, y], "size": [w, d, seat_h], "facing": 0, "back": 0.95},
                 {"name": "drum", "kind": "cyl", "at": [x, y, z], "size": [r, h], "glow": 5, "rgb": [1, 0.6, 0.3]},
                 {"name": "pier", "kind": "box", "at": [[x, y], [x, y]], "size": [w, d, h]},   # one per point: pier-1, pier-2
                 {"name": "cable", "kind": "cable", "points": [[x, y, z], ...], "r": 0.02}],
   "lights": [{"kind": "candles", "name": "stand", "at": [x, y], "power": 35}, {"kind": "window", "opening": "win", "power": 800}]}

Walls are named by the side of the room they stand on: "N" is the wall along the north edge. "at" places an opening along that
wall in world coordinates (x for N/S walls, y for E/W walls); a numbered wall (the outline's edge index from 0) takes "at" as metres
from the edge's start. Box "at" is the centre of its footprint, "size" (w along x, d along y before rot, h up) and it stands on
z = at[2] (default 0); a cylinder's "at" is the centre of its base, "size" (radius, height). A chair's "facing" is the compass
direction its sitter faces (the back is behind them), "back" the top of its back. "alpha" < 1 makes see-through glass.
`room(...)` returns a Room: R.seat('chair') -> (x, y, seat_top, facing) for sit(); R.top('desk') the top surface height;
R.at('desk'); R.obj('desk'); R.opening('win') (centre, inward normal, size); R.open_door('door', t, deg) (+ swings into the room);
R.glow('drum') the emissive material for key_glow; R.lights[name]; R.bounds (lo, hi) for haze_to_box."""
import bpy, math
from mathutils import Vector, Matrix
from .core import S, F, mat, grey, glow_mat, box, cyl, curve, empty, noshadow, heading, compass, k, set_exposure, world, haze
from .lights import build_lights

ROOMS = {}
def _reset(): ROOMS.clear()
SIDES = {'E': 0.0, 'N': 90.0, 'W': 180.0, 'S': 270.0}


def _poly(fl):
    """outline corners, counter-clockwise"""
    if isinstance(fl[0], (int, float)):
        x0, y0, x1, y1 = fl; x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1)
        P = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    else:
        P = [tuple(p[:2]) for p in fl]
    a = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    return P if a > 0 else P[::-1]
def _slab(name, P, z_top, thick, m):
    """a horizontal slab with outline P (ccw) from z_top - thick to z_top"""
    n = len(P); verts = [(x, y, z_top) for x, y in P] + [(x, y, z_top - thick) for x, y in P]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update(); me.validate()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o
def _apply_bool(o, cutter):
    md = o.modifiers.new('cut', 'BOOLEAN'); md.object = cutter; md.operation = 'DIFFERENCE'
    try: md.solver = 'EXACT'
    except Exception: pass
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    try: bpy.ops.object.modifier_apply(modifier=md.name)
    except Exception as e:
        print('previz kit: boolean kept live on', o.name, e); cutter.hide_render = True; cutter.hide_viewport = True; return
    bpy.data.objects.remove(cutter, do_unlink=True)


class Room(dict):
    def __init__(self, plan):
        dict.__init__(self); self.plan = plan; self.name = plan.get('name', 'room')
        self.H = float(plan.get('height', 3.0)); self.wall_t = float(plan.get('wall', 0.25)); self.ceil_t = float(plan.get('ceiling', 0.2))
        self.rough = dict(plan.get('rough') or {})
        self.P = _poly(plan['floor']); self.walls = []; self.ops = {}; self.parts = {}; self.info = {}; self.glows = {}; self.hinges = {}
        xs = [p[0] for p in self.P]; ys = [p[1] for p in self.P]
        self.bounds = ((min(xs) - self.wall_t, min(ys) - self.wall_t, -0.1), (max(xs) + self.wall_t, max(ys) + self.wall_t, self.H + self.ceil_t))
        if 'exposure' in plan: set_exposure(plan['exposure'])
        if 'world' in plan: world(tuple(plan['world']))
        if plan.get('haze'): haze(plan['haze'])
        self._shell(); self._openings(); self._levels(); self._furniture()
        self.lights = build_lights(plan.get('lights'), self)
        self.update(parts=self.parts, lights=self.lights)

    # ---------------------------------------------------------------- floor, walls, ceiling
    def _shell(self):
        P, t, H = self.P, self.wall_t, self.H; n = len(P)
        _slab(self.name + '-floor', P, 0.0, 0.1, self._grey('floor'))
        if self.ceil_t > 0: _slab(self.name + '-ceiling', P, H + self.ceil_t, self.ceil_t, self._grey('ceiling'))
        def convex(i):   # corner i of a ccw outline
            a, b, c = Vector(P[i - 1]), Vector(P[i]), Vector(P[(i + 1) % n]); u, v = b - a, c - b
            return u.x * v.y - u.y * v.x > 0
        for i in range(n):
            a, b = Vector(P[i]), Vector(P[(i + 1) % n]); L = (b - a).length; d = (b - a) / L; nout = Vector((d.y, -d.x))
            e0 = t if convex(i) else 0.0; e1 = t if convex((i + 1) % n) else 0.0
            c = (a + b) / 2 + d * (e1 - e0) / 2 + nout * t / 2; ztop = H + self.ceil_t
            o = box('%s-wall%d' % (self.name, i), (c.x, c.y, (ztop - 0.1) / 2), (L + e0 + e1, t, ztop + 0.1), self._grey('wall'), rot=(0, 0, math.atan2(d.y, d.x)))
            side = min(SIDES, key=lambda s: abs((compass(nout) - SIDES[s] + 180) % 360 - 180))
            self.walls.append(dict(obj=o, a=a, b=b, d=d, out=nout, side=side if abs((compass(nout) - SIDES[side] + 180) % 360 - 180) < 1 else None, i=i))

    def _wall_for(self, spec, at):
        if isinstance(spec, int): w = self.walls[spec]; return w, w['a'] + w['d'] * at
        cands = [w for w in self.walls if w['side'] == spec]
        if not cands: raise ValueError('no %s wall in room %s' % (spec, self.name))
        ax = 0 if spec in ('N', 'S') else 1
        def inside(w): lo, hi = sorted((w['a'][ax], w['b'][ax])); return lo - 1e-6 <= at <= hi + 1e-6
        w = next((w for w in cands if inside(w)), cands[0])
        p = Vector(w['a']); p[ax] = at; return w, p

    def _openings(self):
        t = self.wall_t
        for op in self.plan.get('openings', []):
            w, p = self._wall_for(op['wall'], op['at']); ww, hh = float(op['w']), float(op.get('h', op['w'])); sill = float(op.get('sill', 0.0))
            shape = op.get('shape', 'rect'); yaw = math.atan2(w['d'].y, w['d'].x); mid = p + w['out'] * t / 2
            if shape == 'round':
                hh = ww; cut = cyl('cut', (mid.x, mid.y, sill + ww / 2), ww / 2, t * 3, grey(), rot=(math.pi / 2, 0, yaw), v=48)
            else:
                body_h = hh - (ww / 2 if shape == 'arch' else 0.0)
                cut = box('cut', (mid.x, mid.y, sill + body_h / 2 - (0.05 if sill <= 0 else 0)), (ww, t * 3, body_h + (0.1 if sill <= 0 else 0)), grey(), rot=(0, 0, yaw))
                if shape == 'arch':
                    top = cyl('cut-top', (mid.x, mid.y, sill + body_h), ww / 2, t * 3, grey(), rot=(math.pi / 2, 0, yaw), v=32)
                    bpy.ops.object.select_all(action='DESELECT'); cut.select_set(True); top.select_set(True); bpy.context.view_layer.objects.active = cut
                    bpy.ops.object.join()
            _apply_bool(w['obj'], cut)
            name = op['name']; inward = -Vector((w['out'].x, w['out'].y, 0.0))
            info = dict(name=name, wall=w, centre=Vector((p.x, p.y, sill + hh / 2)), inward=inward, w=ww, h=hh, sill=sill, shape=shape)
            self.ops[name] = info
            if op.get('door'): self._door(info, op['door'] if isinstance(op['door'], dict) else {})

    def _door(self, op, spec):
        """a door leaf in the opening, on a hinge at the jamb named by spec['hinge'] (a compass side, e.g. 'W' on a N wall)"""
        w = op['wall']; d = w['d']; c = op['centre']; half = op['w'] / 2; thick = float(spec.get('thickness', 0.08))
        hs = spec.get('hinge')
        if hs: dh = -heading(SIDES[hs])          # from the hinge jamb toward the free jamb
        else: dh = Vector((d.x, d.y, 0.0))
        jamb = Vector((c.x, c.y, 0.0)) - dh * half; free = Vector((dh.x, dh.y, 0.0))
        left = Vector((-free.y, free.x, 0.0)); s_ = 1.0 if left.dot(op['inward']) > 0 else -1.0
        if spec.get('swing', 'in') == 'out': s_ = -s_
        hinge = empty(op['name'] + '-hinge', jamb); hinge.rotation_euler = (0, 0, math.atan2(free.y, free.x))
        side_in = 1.0 if left.dot(op['inward']) > 0 else -1.0
        leaf = box(op['name'], (0, 0, 0), (op['w'] - 0.02, thick, op['h'] - 0.01), self._grey('furniture', spec.get('rough')))
        leaf.parent = hinge; leaf.location = (op['w'] / 2, side_in * thick / 2, (op['h'] - 0.01) / 2)
        self.hinges[op['name']] = (hinge, s_, hinge.rotation_euler[2]); self.parts[op['name']] = leaf; self.parts[op['name'] + '-hinge'] = hinge

    # ---------------------------------------------------------------- platforms and steps
    def _grey(self, kind, rough=None, alpha=1.0):
        return grey(kind, alpha, rough if rough is not None else self.rough.get(kind))
    def _platform(self, name, rect, top, rough=None):
        x0, y0, x1, y1 = rect; x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1)
        o = box(name, ((x0 + x1) / 2, (y0 + y1) / 2, top / 2 - 0.05), (x1 - x0, y1 - y0, top + 0.1), self._grey('floor', rough))
        self.parts[name] = o; self.info[name] = dict(top=top, at=((x0 + x1) / 2, (y0 + y1) / 2, 0.0)); return o
    def _levels(self):
        for p in self.plan.get('platforms', []): self._platform(p['name'], p['rect'], float(p['top']), p.get('rough'))
        for st in self.plan.get('steps', []):
            x0, y0, x1, y1 = st['rect']; x0, x1 = min(x0, x1), max(x0, x1); y0, y1 = min(y0, y1), max(y0, y1)
            g, ins, up = float(st.get('going', 0.3)), float(st.get('inset', 0.0)), st.get('up', 'E')
            for i in range(int(st['n'])):
                r = {'E': (x0 + i * g, y0 + i * ins, x1, y1 - i * ins), 'W': (x0, y0 + i * ins, x1 - i * g, y1 - i * ins),
                     'N': (x0 + i * ins, y0 + i * g, x1 - i * ins, y1), 'S': (x0 + i * ins, y0, x1 - i * ins, y1 - i * g)}[up]
                self._platform('%s-%d' % (st['name'], i + 1), r, (i + 1) * float(st['rise']), st.get('rough'))

    # ---------------------------------------------------------------- furniture
    def _material(self, f):
        if f.get('glow') is not None:
            m = glow_mat(f['name'], float(f['glow']), tuple(f.get('rgb', (1, 1, 1)))); self.glows[f['name']] = m; return m
        return self._grey('furniture', f.get('rough'), float(f.get('alpha', 1.0)))
    def _furniture(self):
        for f in self.plan.get('furniture', []):
            ats = f.get('at', [0, 0]); multi = isinstance(ats[0], (list, tuple)) if ats else False
            sizes = f.get('size'); msize = multi and sizes and isinstance(sizes[0], (list, tuple))
            for i, at in enumerate(ats if multi else [ats]):
                g = dict(f); g['at'] = at
                if msize: g['size'] = sizes[i]
                if multi: g['name'] = '%s-%d' % (f['name'], i + 1)
                self._piece(g)
    def _piece(self, f):
        name, kind = f['name'], f.get('kind', 'box'); at = list(f.get('at', [0, 0])); z0 = at[2] if len(at) > 2 else 0.0
        m = self._material(f); rot = math.radians(f.get('rot', 0.0))
        if kind == 'box':
            w, d, h = f['size']; o = box(name, (at[0], at[1], z0 + h / 2), (w, d, h), m, rot=(0, 0, rot))
            if f.get('glow') is not None: noshadow(o)
            self.info[name] = dict(top=z0 + h, at=(at[0], at[1], z0))
        elif kind == 'cyl':
            r, h = f['size']; o = cyl(name, (at[0], at[1], z0 + h / 2), r, h, m, v=int(f.get('sides', 32)))
            if f.get('glow') is not None: noshadow(o)
            self.info[name] = dict(top=z0 + h, at=(at[0], at[1], z0))
        elif kind == 'table':
            w, d, h = f['size']; tt = float(f.get('top', 0.05)); lg = float(f.get('leg', 0.07)); o = empty(name, (at[0], at[1], z0)); o.rotation_euler = (0, 0, rot)
            parts = [box(name + '-top', (0, 0, h - tt / 2), (w, d, tt), m)]
            for sx in (-1, 1):
                for sy in (-1, 1): parts.append(box('%s-leg%d%d' % (name, sx, sy), (sx * (w / 2 - lg / 2 - 0.03), sy * (d / 2 - lg / 2 - 0.03), (h - tt) / 2), (lg, lg, h - tt), m))
            for p in parts: p.parent = o
            self.info[name] = dict(top=z0 + h, at=(at[0], at[1], z0))
        elif kind == 'chair':
            w, d, h = f['size']; fac = float(f.get('facing', 0.0)); bt = float(f.get('back', h + 0.5)); st = 0.05; lg = 0.045
            o = empty(name, (at[0], at[1], z0)); o.rotation_euler = (0, 0, math.radians(fac))   # local +X = the way the sitter faces
            parts = [box(name + '-seat', (0, 0, h - st / 2), (d, w, st), m), box(name + '-back', (-(d / 2 - 0.025), 0, (h - st + bt) / 2), (0.05, w, bt - h + st), m)]
            for sx in (-1, 1):
                for sy in (-1, 1): parts.append(box('%s-leg%d%d' % (name, sx, sy), (sx * (d / 2 - lg / 2), sy * (w / 2 - lg / 2), (h - st) / 2), (lg, lg, h - st), m))
            for p in parts: p.parent = o
            self.info[name] = dict(top=z0 + h, at=(at[0], at[1], z0), facing=fac)
        elif kind == 'cable':
            o = curve(name, [tuple(p) for p in f['points']], float(f.get('r', 0.02)), m, kind='NURBS' if f.get('smooth') else 'POLY')
            self.info[name] = dict(top=max(p[2] for p in f['points']), at=tuple(f['points'][0]))
        else:
            raise ValueError('unknown furniture kind %r (box, cyl, table, chair, cable)' % kind)
        self.parts[name] = o; return o

    # ---------------------------------------------------------------- handles
    def obj(self, name): return self.parts[name]
    def at(self, name): return Vector(self.info[name]['at'])
    def top(self, name): return self.info[name]['top']
    def seat(self, name, up=0.0):
        """(x, y, seat top, facing) of a chair, for sit(fig, t, R.seat('chair'))"""
        i = self.info[name]; return (i['at'][0], i['at'][1], i['top'] + up, i.get('facing', 0.0))
    def opening(self, name): return self.ops[name]
    def glow(self, name): return self.glows[name]
    def open_door(self, name, t, deg, interp=None):
        """key the door `name` open `deg` degrees at t s (+ = into the room, 0 = shut)"""
        hinge, s_, base = self.hinges[name]
        k(hinge, 'rotation_euler', F(t), base + s_ * math.radians(deg), 2, interp)


def room(plan, name=None):
    """build a room from a plan dict, or from the film's location `plan` (a key of film.json's locations). Returns a Room."""
    plan = S.film.room_plan(plan) if isinstance(plan, str) else dict(plan)
    if name: plan['name'] = name
    plan.setdefault('name', 'room')
    R = Room(plan); ROOMS[R.name] = R; S.room = R; return R
