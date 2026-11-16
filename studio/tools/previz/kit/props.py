"""Props: named grey primitives at real scale. Each prop is an empty (its origin = where a hand holds it, its +Z = along its
length) with the shapes as children, so it can be held (grip), carried on any bone (attach), put down (detach) or keyed free
(place_prop). The prop's name (upper case) is what a shot's in_frame list uses."""
import bpy, math
from mathutils import Vector, Matrix
from .core import S, F, grey, glow_mat, box, cyl, ell, seg, curve, empty, fcurves, set_interp
from .figures import BONES, FIGS, _fig

PROPS = {}
def _reset(): PROPS.clear()


def _root(name, at, size=0.08):
    o = empty(name.upper(), at if at is not None else (0, 0, 0), size=size); PROPS[name.upper()] = o; return o
def _kids(root, objs):
    for o in objs: o.parent = root
    return root
def _m(glow, rgb):
    return glow_mat('prop-glow-%.2f-%.2f-%.2f-%.2f' % ((glow,) + tuple(rgb)), glow, rgb) if glow else grey('prop')
def prop_box(name, size, at=None, glow=0.0, rgb=(1, 1, 1)):
    """a box w x d x h centred on its origin (a case, a book, a phone, a crate)"""
    return _kids(_root(name, at), [box(name.upper() + '-box', (0, 0, 0), size, _m(glow, rgb))])
def prop_cyl(name, r, h, at=None, glow=0.0, rgb=(1, 1, 1)):
    """a cylinder of radius r, height h along +Z, centred on its origin (a cup, a bottle, a lantern)"""
    return _kids(_root(name, at), [cyl(name.upper() + '-cyl', (0, 0, 0), r, h, _m(glow, rgb), v=24)])
def rod(name, length, r=0.012, grip=0.1, at=None):
    """a thin rod along +Z (a staff, a baton, a cue, a pole); its origin is `grip` m from the butt end"""
    return _kids(_root(name, at), [cyl(name.upper() + '-rod', (0, 0, length / 2 - grip), r, length, grey('prop'), v=12)])
def blade(name, length=0.8, width=0.032, grip=0.2, guard=0.11, at=None):
    """a sword-like blade: the origin at the middle of the grip, +Z toward the point; a straight single-edged blade of
    `length`, a guard `guard` wide, a grip `grip` long and a pommel (a knife: length 0.2, guard 0.04, grip 0.11)"""
    root = _root(name, at, 0.12); n = name.upper(); m = grey('prop'); z0 = grip / 2 + 0.016
    prof = [(width / 2, z0), (width / 2, z0 + length - 0.06), (width * 0.1, z0 + length), (-width / 2, z0 + length - 0.14 * length / 0.8), (-width / 2, z0)]
    me = bpy.data.meshes.new(n + '-blade'); me.from_pydata([(x, 0, z) for x, z in prof], [], [list(range(5))])
    bl = bpy.data.objects.new(n + '-blade', me); bpy.context.collection.objects.link(bl); bl.data.materials.append(m)
    so = bl.modifiers.new('thick', 'SOLIDIFY'); so.thickness = 0.005; so.offset = 0
    return _kids(root, [bl, cyl(n + '-grip', (0, 0, 0), 0.0155, grip, m, v=12), ell(n + '-pommel', (0, 0, -grip / 2 - 0.012), (0.022, 0.018, 0.02), m),
                        box(n + '-guard', (0, 0, grip / 2 + 0.008), (guard, 0.026, 0.016), m)])
def cable(name, points, r=0.004, end=True, smooth=True):
    """a cable through world points; with end=True its last three points hook to an empty at the end (the plug), so moving
    that empty drags the cable (touch(end, fig, 'R', t) puts it at the fingertips). Returns (curve, end empty or None)."""
    n = name.upper(); cu = curve(n, [tuple(p) for p in points], r, grey('prop'), kind='NURBS' if smooth and len(points) > 2 else 'POLY', res=24)
    PROPS[n] = cu
    if not end: return cu, None
    e = empty(n + '-END', tuple(points[-1]), size=0.03); PROPS[n + '-END'] = e
    for i, (idx, st) in enumerate(((len(points) - 1, 1.0), (len(points) - 2, 0.55), (len(points) - 3, 0.25))):
        if idx < 1: continue
        hm = cu.modifiers.new('hook%d' % i, 'HOOK'); hm.object = e; hm.strength = st; hm.vertex_indices_set([idx]); hm.matrix_inverse = e.matrix_world.inverted()
    return cu, e
def prop(name):
    """a prop by name"""
    return PROPS[name.upper()]

# ---------------------------------------------------------------- holding, carrying, putting down (SECONDS)
def _frame(origin, z, xhint):
    z = Vector(z).normalized(); x = Vector(xhint); x = x - z * x.dot(z)
    x = x.normalized() if x.length > 1e-4 else z.orthogonal().normalized(); y = z.cross(x); o = Vector(origin)
    return Matrix(((x.x, y.x, z.x, o.x), (x.y, y.y, z.y, o.y), (x.z, y.z, z.z, o.z), (0, 0, 0, 1)))
def attach(p, fig, bone, t=0.0, offset=None):
    """From t the prop rides on a bone of the figure (offset = a Matrix in the bone's head space). Earlier attachments switch
    off at t. While attached, keying p.rotation_euler turns it about its own origin."""
    p = prop(p) if isinstance(p, str) else p; arm = _fig(fig)[0]; f = F(t)
    if not fcurves(p):
        for p_ in ('location', 'rotation_euler', 'scale'): p.keyframe_insert(p_, frame=1)
    for c in p.constraints: c.influence = 0; c.keyframe_insert('influence', frame=f)
    c = p.constraints.new('CHILD_OF'); c.name = '%s.%s@%.2f' % (arm.name, bone, t); c.target = arm; c.subtarget = bone
    c.inverse_matrix = offset if offset is not None else Matrix.Identity(4)
    try: c.set_inverse_pending = False
    except Exception: pass
    if f > 1: c.influence = 0; c.keyframe_insert('influence', frame=1)
    c.influence = 1; c.keyframe_insert('influence', frame=f)
    p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
    for p_ in ('location', 'rotation_euler', 'scale'): p.keyframe_insert(p_, frame=f)
    set_interp(p, 'CONSTANT', t0=0.0, t1=0.0); set_interp(p, 'CONSTANT', t0=t, t1=t); p['fig'] = arm.name
    return c
def detach(p, t):
    """from t the prop stays where it is in the world (dropped, put down)"""
    p = prop(p) if isinstance(p, str) else p; S.sc.frame_set(F(t)); mw = p.matrix_world.copy()
    for c in p.constraints: c.influence = 0; c.keyframe_insert('influence', frame=F(t))
    p.matrix_basis = mw
    for p_ in ('location', 'rotation_euler', 'scale'): p.keyframe_insert(p_, frame=F(t))
    set_interp(p, 'CONSTANT', t0=t, t1=t)
def grip(p, fig, side='R', t=0.0, axis=(0, -1, 0), edge=(0, 0, -1)):
    """From t the prop is held in the fist of hand side ('L'/'R'). axis = where its +Z points with the arm hanging in the rest
    pose, in body coords (+X the figure's left, -Y forward, +Z up); it then turns with the hand. edge = its +X hint."""
    arm = _fig(fig)[0]; bone = 'hand.' + side; h, tl = Vector(BONES[bone][0]), Vector(BONES[bone][1]); d = (tl - h).normalized(); sx = 1 if side == 'L' else -1
    o = h + d * 0.06 + Vector((-sx * 0.02, -0.004, 0))
    return attach(p, arm, bone, t, arm.data.bones[bone].matrix_local.inverted() @ _frame(o, axis, edge))
def touch(p, fig, side='R', t=0.0):
    """From t the prop's origin sits at the FINGERTIPS of hand side (a plug, a small object)"""
    arm = _fig(fig)[0]; return attach(p, arm, 'hand.' + side, t, Matrix.Translation((0, arm.data.bones['hand.' + side].length, 0)))
def prop_world(p, t):
    """where the prop's origin is at t"""
    p = prop(p) if isinstance(p, str) else p; S.sc.frame_set(F(t)); return p.matrix_world.translation.copy()
def place_prop(p, t, loc, rot=(0, 0, 0)):
    """key a free prop's location and rotation (deg) at t"""
    p = prop(p) if isinstance(p, str) else p
    p.location = loc; p.keyframe_insert('location', frame=F(t))
    p.rotation_euler = [math.radians(a) for a in rot]; p.keyframe_insert('rotation_euler', frame=F(t))
