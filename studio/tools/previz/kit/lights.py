"""Lights. The boards carry the lighting, so every source is placed and keyed like the real one: sun, window, candles, lamps,
screens. Colours are kept for the normal render; --grey turns every light and glow white at the same place and strength."""
import bpy, math
from mathutils import Vector
from .core import S, F, mat, glow_mat, grey, box, cyl, ell, empty, noshadow, heading, key_energy, setmat

WARM = (1.0, 0.52, 0.2)          # candle / tungsten
DAY = (0.75, 0.8, 1.0)           # daylight through a window
SCREEN = (0.35, 0.55, 1.0)       # a monitor's blue
LIGHTS = {}
def _reset(): LIGHTS.clear()


def _lamp(name, kind, loc, power, rgb, size=0.1, rot=None, spot=None, shadow=True):
    d = bpy.data.lights.new(name, kind); d.energy = power; d.color = rgb
    if kind in ('POINT', 'SPOT'): d.shadow_soft_size = size
    if kind == 'AREA':
        if isinstance(size, (tuple, list)): d.shape = 'RECTANGLE'; d.size, d.size_y = size
        else: d.size = size
    if spot: d.spot_size = math.radians(spot[0]); d.spot_blend = spot[1]
    try: d.use_shadow = shadow
    except Exception: pass
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    if rot: o.rotation_euler = rot
    LIGHTS[name] = o
    return o
def aim(o, target):
    """point a light's / camera's -Z at a world point"""
    d = Vector(target) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
def point(name, at, power, rgb=WARM, size=0.1):
    """an omni light (a bulb, a candle's pool, a practical)"""
    return _lamp(name, 'POINT', at, power, rgb, size)
def spot(name, at, target, power, rgb=DAY, cone=30.0, blend=0.3, size=0.3):
    """a spot from `at` aimed at the world point `target`; cone = full angle in degrees"""
    o = _lamp(name, 'SPOT', at, power, rgb, size, spot=(cone, blend)); aim(o, target); return o
def area(name, at, target, power, size=1.0, rgb=DAY):
    """a soft rectangle (size = side or (w, h)) at `at` facing the world point `target`"""
    o = _lamp(name, 'AREA', at, power, rgb, size); aim(o, target); return o
def sun(name, compass, elevation, power=3.0, rgb=(1.0, 0.95, 0.88), angle=1.0):
    """sunlight arriving FROM compass direction `compass` (deg) at `elevation` degrees above the horizon; power in W/m2"""
    o = _lamp(name, 'SUN', (0, 0, 20), power, rgb)
    try: o.data.angle = math.radians(angle)
    except Exception: pass
    d = -(heading(compass) * math.cos(math.radians(elevation)) + Vector((0, 0, math.sin(math.radians(elevation)))))
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return o
def candle(name, at, power=12.0, h=0.22, rgb=WARM, flame=True):
    """one candle standing on at (x, y, z of the surface): a grey stick, a small glowing flame, a warm point light
    (power 0 = no light of its own, only the flame)"""
    at = Vector(at); cyl(name + '-wax', at + Vector((0, 0, h / 2)), 0.025, h, grey('prop'), v=10)
    if flame: noshadow(ell(name + '-flame', at + Vector((0, 0, h + 0.03)), (0.012, 0.012, 0.03), glow_mat('flame', 40.0, (1.0, 0.55, 0.18)), seg_=8))
    return point(name, at + Vector((0, 0, h + 0.12)), power, rgb, size=0.15) if power else None
def candles(name, at, n=5, h=1.3, power=35.0, radius=0.15, stand=True, rgb=WARM):
    """a cluster of n candles in a ring (an iron candle stand when stand=True, h m tall) at at (x, y[, floor z]) with ONE warm
    point light above it. Returns the root empty (topple it by keying its rotation)."""
    x, y = at[0], at[1]; z0 = at[2] if len(at) > 2 else 0.0
    root = empty(name, (x, y, z0))
    parts = []
    if stand:
        parts += [cyl(name + '-pole', (0, 0, h / 2), 0.02, h, grey('prop'), v=10), cyl(name + '-plate', (0, 0, h), radius + 0.07, 0.02, grey('prop'), v=20)]
    top = h + 0.01 if stand else 0.0
    for i in range(n):
        a = i * math.tau / n; r = radius if n > 1 else 0.0
        parts += [cyl('%s-wax%d' % (name, i), (r * math.cos(a), r * math.sin(a), top + 0.11), 0.025, 0.22, grey('prop'), v=8)]
        fl = ell('%s-flame%d' % (name, i), (r * math.cos(a), r * math.sin(a), top + 0.25), (0.012, 0.012, 0.03), glow_mat('flame', 40.0, (1.0, 0.55, 0.18)), seg_=8)
        noshadow(fl); parts.append(fl)
    parts.append(_lamp(name + '-L', 'POINT', (0, 0, top + 0.35), power, rgb, 0.15))
    for o in parts: o.parent = root
    return root
def screen(name, at, size, facing, strength=1.0, rgb=SCREEN, power=3.0, back=True):
    """a lit screen (monitor, TV, phone): a glowing w x h panel centred at `at` facing compass `facing`, a dark back, and a soft
    area light in front of it that lights what faces it. Returns dict(obj, mat, light); key with key_glow(mat, t, s) and
    key_energy(light, t, W)."""
    w, h = size; d = heading(facing); yaw = math.radians(facing)
    m = glow_mat(name, strength, rgb)
    o = box(name, at, (0.02, w, h), m, rot=(0, 0, yaw)); noshadow(o)
    if back: box(name + '-back', Vector(at) - d * 0.02, (0.02, w + 0.02, h + 0.02), grey('prop'), rot=(0, 0, yaw))
    L = _lamp(name + '-L', 'AREA', Vector(at) + d * 0.06, power, rgb, (w, h)); aim(L, Vector(at) + d * 2.0)
    return dict(obj=o, mat=m, light=L, power=power)
def window_light(room, opening, power, rgb=DAY, target=None, cone=30.0, blend=0.4, glow=1.5, kind='spot', depth=0.5):
    """daylight through a window: the opening's pane glows (glow = its strength) and a light just inside it shines into the room
    ('spot' aimed at `target` with `cone`, or 'area' filling the opening, facing in). Returns dict(light, pane, mat)."""
    op = room.opening(opening); c, n = op['centre'], op['inward']
    m = glow_mat('window-' + opening, glow, rgb)
    pane = box('window-' + opening + '-pane', c - n * (room.wall_t - 0.03), (0.02, op['w'], op['h']), m, rot=(0, 0, math.radians(compass_of(n))))
    if op['shape'] == 'round':
        bpy.data.objects.remove(pane, do_unlink=True)
        pane = cyl('window-' + opening + '-pane', c - n * (room.wall_t - 0.03), op['w'] / 2, 0.02, m, rot=(0, math.pi / 2, math.radians(compass_of(n))), v=48)
    noshadow(pane)
    if kind == 'area':
        L = _lamp('window-' + opening + '-L', 'AREA', c + n * 0.05, power, rgb, (op['w'], op['h'])); aim(L, c + n * 2)
    else:
        L = _lamp('window-' + opening + '-L', 'SPOT', c + n * depth, power, rgb, 1.0, spot=(cone, blend)); aim(L, target if target is not None else c + n * 5 - Vector((0, 0, 3)))
    return dict(light=L, pane=pane, mat=m)
def compass_of(v): return math.degrees(math.atan2(v[1], v[0]))
def key_light(name_or_obj, t, power):
    """key a light's power at t s (by object or name)"""
    o = LIGHTS.get(name_or_obj) or bpy.data.objects.get(name_or_obj) if isinstance(name_or_obj, str) else name_or_obj
    key_energy(o, t, power)


def build_lights(entries, room=None):
    """lights from plan entries (dicts): {"kind": "point"|"spot"|"area"|"sun"|"candle"|"candles"|"screen"|"window", "name", ...}.
    "at" may be a list of points (one light per point, named name-1, name-2, ...). Keys follow each helper's arguments."""
    out = {}
    for e in entries or []:
        e = dict(e); kind = e.pop('kind'); name = e.pop('name', kind); ats = e.pop('at', None)
        rgb = tuple(e.pop('rgb')) if 'rgb' in e else None
        multi = isinstance(ats, (list, tuple)) and ats and isinstance(ats[0], (list, tuple))
        pts = ats if multi else [ats]
        for i, at in enumerate(pts, 1):
            nm = '%s-%d' % (name, i) if multi else name; kw = dict(e)
            if rgb is not None: kw['rgb'] = rgb
            if kind == 'point': o = point(nm, at, kw.pop('power'), **kw)
            elif kind == 'spot': o = spot(nm, at, kw.pop('target'), kw.pop('power'), **kw)
            elif kind == 'area': o = area(nm, at, kw.pop('target'), kw.pop('power'), **kw)
            elif kind == 'sun': o = sun(nm, kw.pop('compass'), kw.pop('elevation'), **kw)
            elif kind == 'candle': o = candle(nm, at, **kw)
            elif kind == 'candles': o = candles(nm, at, **kw)
            elif kind == 'screen': o = screen(nm, at, kw.pop('size'), kw.pop('facing'), **kw)
            elif kind == 'window': o = window_light(room, kw.pop('opening', nm), kw.pop('power'), **kw)
            else: raise ValueError('unknown light kind %r' % kind)
            out[nm] = o
    return out
