"""Plain grey mannequins: one neutral body (a nose and brow so the face direction reads, no hair, costume or colour), scaled
to each character's height from the cast, rigged and posed as before: stand, sit, kneel, lie, walk, turn, hands, head.
Local body coords (for tgt): rest pose faces -Y, the figure's left = +X, feet on z 0, in 1.70 m body units (a taller figure
is the same rig scaled). The hand target is where the FINGERTIPS go, the foot target the ANKLE (z 0.09 standing). Poles:
elbow.L/R (default behind, (+-0.45, 0.35, 1.05)), knee.L/R (in front). Root rotation z = facing + 90.
Spine/neck/head: rx + bends forward / nods down, ry + turns to the figure's left."""
import bpy, math, os, random
from mathutils import Vector, Matrix, Euler
from .core import S, F, sec, mat, grey, box, cyl, ell, seg, empty, fcurve, fcurves, k

FIGS = {}
def _reset(): FIGS.clear(); PROBES.clear()
BONES = {
 'hips': ((0, 0, 0.92), (0, 0, 1.04), None), 'spine': ((0, 0, 1.04), (0, 0, 1.36), 'hips'), 'neck': ((0, 0, 1.36), (0, 0, 1.47), 'spine'),
 'head': ((0, 0, 1.47), (0, 0, 1.70), 'neck'),
 'uarm.L': ((0.18, 0, 1.36), (0.21, 0.02, 1.08), 'spine'), 'farm.L': ((0.21, 0.02, 1.08), (0.23, -0.03, 0.84), 'uarm.L'), 'hand.L': ((0.23, -0.03, 0.84), (0.245, -0.06, 0.67), 'farm.L'),
 'uarm.R': ((-0.18, 0, 1.36), (-0.21, 0.02, 1.08), 'spine'), 'farm.R': ((-0.21, 0.02, 1.08), (-0.23, -0.03, 0.84), 'uarm.R'), 'hand.R': ((-0.23, -0.03, 0.84), (-0.245, -0.06, 0.67), 'farm.R'),
 'thigh.L': ((0.09, 0, 0.92), (0.09, -0.02, 0.5), 'hips'), 'shin.L': ((0.09, -0.02, 0.5), (0.09, 0.01, 0.09), 'thigh.L'), 'foot.L': ((0.09, 0.01, 0.09), (0.09, -0.14, 0.03), 'shin.L'),
 'thigh.R': ((-0.09, 0, 0.92), (-0.09, -0.02, 0.5), 'hips'), 'shin.R': ((-0.09, -0.02, 0.5), (-0.09, 0.01, 0.09), 'thigh.R'), 'foot.R': ((-0.09, 0.01, 0.09), (-0.09, -0.14, 0.03), 'shin.R')}
LEG = 0.8315          # hip joint to ankle, straight
THIGH_R = 0.062       # seated, the thighs rest on the cushion: sit() puts the hip joint this far above the seat
BODY = dict(chest=(0.16, 0.1, 0.14), belly=(0.135, 0.09, 0.11), pelvis=(0.15, 0.1, 0.1), uarm=0.045, farm=0.036, thigh=THIGH_R, knee=0.052, shin=0.046)


def _hand(n, s, m):
    h, t = Vector(BONES['hand.' + s][0]), Vector(BONES['hand.' + s][1]); d = (t - h).normalized(); sx = 1 if s == 'L' else -1
    P = [ell(n + '-palm' + s, h + d * 0.05, (0.014, 0.042, 0.05), m)]
    for k_, oy in enumerate((-0.026, -0.009, 0.008, 0.024)):
        ln = 0.075 - 0.012 * abs(k_ - 1.4)
        P.append(seg('%s-finger%s%d' % (n, s, k_), h + d * 0.085 + Vector((0, oy, 0)), h + d * (0.085 + ln) + Vector((0, oy, 0)), 0.0085, m))
    P.append(seg(n + '-thumb' + s, h + d * 0.03 + Vector((0, -0.035, 0)), h + d * 0.08 + Vector((-sx * 0.012, -0.065, 0)), 0.0095, m))
    return [('hand.' + s, o) for o in P]


def figure(name, height=None):
    """A rigged plain grey mannequin for cast member `name` (its key in film.json's cast; height from there, else `height`,
    else 1.70 m). Returns (arm, T): T holds the IK targets 'hand.L/R' (fingertips), 'foot.L/R' (ankles) and the poles
    'elbow.L/R', 'knee.L/R', in local body coords. Every helper takes the figure as its name, the armature or the tuple."""
    key = str(name).upper(); cast = S.film.character(key)
    if key in FIGS:            # already there: loaded from the location's shared file (location()), never built twice
        f = FIGS[key]
        if height is not None and abs(float(height) - f['height']) > 0.005:
            print('previz kit: %s comes from the shared file at %.2f m; the %.2f m asked here is ignored (change it in the '
                  'location\'s people file)' % (key, f['height'], float(height)))
        return f['arm'], f['T']
    h = float(height or cast.get('height') or 1.70)
    if not cast and height is None: print('previz kit: %s is not in the film cast; %.2f m' % (key, h))
    m = grey('figure'); B = BONES; R_ = BODY
    ad = bpy.data.armatures.new(key); arm = bpy.data.objects.new(key, ad); bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    for b_, (hd, tl, p) in BONES.items():
        e = ad.edit_bones.new(b_); e.head = hd; e.tail = tl; e.roll = 0
        if p: e.parent = ad.edit_bones[p]; e.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT'); bpy.context.view_layer.update()
    def att(o, bone):
        M_ = arm.matrix_world @ arm.pose.bones[bone].matrix @ Matrix.Translation((0, arm.pose.bones[bone].bone.length, 0))
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone; o.matrix_parent_inverse = M_.inverted()
    n = key
    parts = [('head', ell(n + '-skull', (0, 0.01, 1.59), (0.08, 0.095, 0.105), m)), ('head', ell(n + '-face', (0, -0.04, 1.555), (0.068, 0.06, 0.085), m)),
             ('head', ell(n + '-jaw', (0, -0.035, 1.51), (0.058, 0.062, 0.05), m)), ('head', ell(n + '-chin', (0, -0.08, 1.478), (0.022, 0.016, 0.016), m)),
             ('head', ell(n + '-nose', (0, -0.096, 1.558), (0.011, 0.02, 0.024), m)), ('head', ell(n + '-brow', (0, -0.078, 1.603), (0.056, 0.018, 0.012), m)),
             ('neck', seg(n + '-neck', (0, 0.005, 1.37), (0, 0.005, 1.49), 0.043, m)),
             ('spine', ell(n + '-chest', (0, 0, 1.26), R_['chest'], m)), ('spine', ell(n + '-belly', (0, 0, 1.1), R_['belly'], m)),
             ('hips', ell(n + '-pelvis', (0, 0, 0.95), R_['pelvis'], m))]
    for s in ('L', 'R'):
        x = 1 if s == 'L' else -1
        parts += [('head', ell(n + '-ear' + s, (x * 0.08, 0.01, 1.565), (0.01, 0.02, 0.028), m)),
                  ('spine', ell(n + '-shoulder' + s, (x * 0.165, 0, 1.335), (0.065, 0.06, 0.06), m)),
                  ('uarm.' + s, seg(n + '-uarm' + s, B['uarm.' + s][0], B['uarm.' + s][1], R_['uarm'], m)),
                  ('uarm.' + s, ell(n + '-elbow' + s, B['uarm.' + s][1], (R_['uarm'],) * 3, m)),
                  ('farm.' + s, seg(n + '-farm' + s, B['farm.' + s][0], B['farm.' + s][1], R_['farm'], m))]
        parts += _hand(n, s, m)
        fx = B['foot.' + s][0][0]
        parts += [('thigh.' + s, seg(n + '-thigh' + s, B['thigh.' + s][0], B['thigh.' + s][1], R_['thigh'], m)),
                  ('shin.' + s, ell(n + '-knee' + s, B['shin.' + s][0], (R_['knee'],) * 3, m)),
                  ('shin.' + s, seg(n + '-shin' + s, B['shin.' + s][0], B['shin.' + s][1], R_['shin'], m)),
                  ('shin.' + s, ell(n + '-ankle' + s, (fx, 0.005, 0.075), (0.036, 0.04, 0.04), m)),
                  ('foot.' + s, ell(n + '-foot' + s, (fx, -0.05, 0.04), (0.045, 0.12, 0.04), m)),
                  ('foot.' + s, ell(n + '-toes' + s, (fx - x * 0.004, -0.145, 0.025), (0.042, 0.032, 0.022), m))]
    for bone, o in parts: att(o, bone)
    T = {}
    for s, x in (('L', 1), ('R', -1)):
        T['hand.' + s] = empty('%s-ik-hand.%s' % (n, s), BONES['hand.' + s][1], arm); T['elbow.' + s] = empty('%s-pole-elbow.%s' % (n, s), (x * 0.45, 0.35, 1.05), arm)
        T['foot.' + s] = empty('%s-ik-foot.%s' % (n, s), BONES['shin.' + s][1], arm); T['knee.' + s] = empty('%s-pole-knee.%s' % (n, s), (x * 0.1, -0.6, 0.5), arm)
        c = arm.pose.bones['hand.' + s].constraints.new('IK'); c.target = T['hand.' + s]; c.pole_target = T['elbow.' + s]; c.chain_count = 3; c.pole_angle = math.radians(90)
        c = arm.pose.bones['shin.' + s].constraints.new('IK'); c.target = T['foot.' + s]; c.pole_target = T['knee.' + s]; c.chain_count = 2; c.pole_angle = math.radians(-90)
    for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'
    arm.hide_render = True
    sc_ = h / 1.70; arm.scale = (sc_, sc_, sc_)
    FIGS[key] = dict(arm=arm, T=T, scale=sc_, height=h, props={})
    bpy.context.view_layer.update()
    return arm, T
def _fig(x):
    """(arm, T) from a figure name, an armature, or the (arm, T) tuple figure() returned"""
    if isinstance(x, str): f = FIGS[x.upper()]; return f['arm'], f['T']
    if isinstance(x, tuple): return x
    return x, FIGS[x.name]['T']
def fig_name(x): return _fig(x)[0].name
def hide_figure(fig, hidden=True):
    """hide/show a whole figure and the props it holds in every render (not keyed: checks and stills)"""
    arm = _fig(fig)[0]; pr = [o for o in bpy.data.objects if o.get('fig') == arm.name]
    for o in list(arm.children_recursive) + pr + [c for p_ in pr for c in p_.children_recursive]: o.hide_render = hidden
def remove_figure(fig):
    """take a figure (and the props it holds) out of the scene altogether: for someone of the location's shared file who is not
    in this scene. Cheaper than hiding: a hidden rig is still evaluated on every frame change."""
    arm = _fig(fig)[0]; nm = arm.name; pr = [o for o in bpy.data.objects if o.get('fig') == nm]
    for o in list(arm.children_recursive) + [c for p_ in pr for c in p_.children_recursive] + pr + [arm]:
        if o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
    FIGS.pop(nm, None)
def group(tag):
    """the figures of a group of the location's shared file ('CROWD', 'QUEUE'), as (arm, T) tuples, in their file order"""
    tag = str(tag).upper()
    return [(FIGS[n]['arm'], FIGS[n]['T']) for n in FIGS if FIGS[n]['arm'].get('group') == tag]
def fig_tag(arm):
    """what a shot's in_frame list calls this figure: its group's tag for a crowd figure, else its own name"""
    return arm.get('group') or arm.name
def fig_objects():
    """every object that belongs to a figure (its body, IK targets, the props it holds)"""
    figs = [FIGS[n]['arm'] for n in FIGS]; out = []
    for o in bpy.data.objects:
        top = o
        while top.parent is not None: top = top.parent
        if top in figs or o.get('fig') or top.get('fig'): out.append(o)
    return out

# ---------------------------------------------------------------- keyers (FRAMES)
def pose_bone(fig, b, f, rx=0, ry=0, rz=0):
    """key a bone's rotation (deg) at FRAME f. spine/neck/head: rx + = bend forward (nod down), ry + = turn to the figure's left"""
    arm = _fig(fig)[0]; pb = arm.pose.bones[b]; pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz)); pb.keyframe_insert('rotation_euler', frame=f)
def tgt(T, key, f, loc):
    """key an IK target / pole (local body coords) at FRAME f. T: the targets dict, or the figure"""
    if not isinstance(T, dict): T = _fig(T)[1]
    T[key].location = loc; T[key].keyframe_insert('location', frame=f)
def place(fig, f, loc, rot_deg, unwrap=True):
    """key the figure's root (between the feet on the floor at rest) at FRAME f: world loc, rotation (deg; z = facing + 90).
    unwrap: z moves by whole turns to the nearest of its current value (no accidental spins)"""
    arm = _fig(fig)[0]; rz = rot_deg[2]
    fc = fcurve(arm, 'rotation_euler', 2) if unwrap else None
    if fc: cur = math.degrees(fc.evaluate(f)); rz += 360 * round((cur - rz) / 360)
    arm.location = loc; arm.keyframe_insert('location', frame=f)
    arm.rotation_euler = (math.radians(rot_deg[0]), math.radians(rot_deg[1]), math.radians(rz)); arm.keyframe_insert('rotation_euler', frame=f)
def facing_rot(facing): return facing + 90.0
def facing_now(fig, t):
    """the figure's compass facing at t s"""
    arm = _fig(fig)[0]; fc = fcurve(arm, 'rotation_euler', 2); f = F(t)
    return (math.degrees(fc.evaluate(f)) if fc else math.degrees(arm.rotation_euler[2])) - 90.0
def _facing_f(arm, f):
    fc = fcurve(arm, 'rotation_euler', 2); return (math.degrees(fc.evaluate(f)) if fc else math.degrees(arm.rotation_euler[2])) - 90.0

# ---------------------------------------------------------------- where things are (SECONDS)
# A pose question used to set the scene's frame, so Blender evaluated every rig and every object of the scene to answer about
# one figure (a crowd scene: 66 rigs, 3,689 objects; about 16 s of a build). Now each figure asked about gets a small side
# scene ("probe-<NAME>") holding only its armature and its IK targets and poles; the question sets THAT scene's frame and reads
# the figure as Blender evaluated it there (the same keys, constraints and IK solver, on 9 objects). The scene's own frame and
# its objects are not touched. The side scenes are removed before anything is saved, checked or rendered (clear_probes(), called
# by run() and by the shared file's build). PREVIZ_FRAME_SET=1 goes back to setting the scene's frame for every question.
FAST_POSE = os.environ.get('PREVIZ_FRAME_SET') != '1'
PROBES = {}
def clear_probes():
    """remove the side scenes of the pose questions (nothing they hold is lost: the objects stay in the real scene)"""
    for n, (sc, dg) in list(PROBES.items()):
        try:
            if sc.name in bpy.data.scenes: bpy.data.scenes.remove(sc)
        except ReferenceError:
            pass
    PROBES.clear()
def _rig(arm, f):
    """the figure evaluated at FRAME f in its side scene (an evaluated copy: .matrix_world, .pose), or None when it cannot be
    asked alone (a parent, or a constraint that reaches outside its own targets): then the caller sets the scene's frame"""
    if not FAST_POSE or arm.parent is not None or arm.constraints: return None
    p = PROBES.get(arm.name)
    try:
        ok = p is not None and p[0].name in bpy.data.scenes
    except ReferenceError:
        ok = False
    if not ok:
        mine = set([arm] + list(arm.children))
        for pb in arm.pose.bones:
            for c in pb.constraints:
                for t_ in (getattr(c, 'target', None), getattr(c, 'pole_target', None)):
                    if t_ is not None and t_ not in mine: return None
        sc = bpy.data.scenes.new('probe-' + arm.name)
        for o in [arm] + [o for o in arm.children if o.type == 'EMPTY']: sc.collection.objects.link(o)
        p = PROBES[arm.name] = (sc, sc.view_layers[0].depsgraph)
    sc, dg = p
    sc.frame_set(f)
    return arm.evaluated_get(sc.view_layers[0].depsgraph)
def _world_at(arm, f):
    """the figure's matrix_world at FRAME f"""
    e = _rig(arm, f)
    if e is not None: return e.matrix_world.copy()
    S.sc.frame_set(f); return arm.matrix_world.copy()
def head_world(fig, t, up=0.11, fwd=0.0):
    """world point on the head at t: up from the top of the neck along the head, fwd toward the face"""
    arm = _fig(fig)[0]; e = _rig(arm, F(t))
    if e is None: S.sc.frame_set(F(t)); e = arm
    return e.matrix_world @ e.pose.bones['head'].matrix @ Vector((0, up, fwd))
def eyes_world(fig, t):
    """the point between the eyes at t (focus and look targets)"""
    return head_world(fig, t, up=0.118, fwd=0.085)
def bone_world(fig, bone, t, tail=False):
    arm = _fig(fig)[0]; e = _rig(arm, F(t))
    if e is None: S.sc.frame_set(F(t)); e = arm
    pb = e.pose.bones[bone]; return e.matrix_world @ (pb.tail if tail else pb.head)
def to_local(fig, t, p):
    """a world point in the figure's local body coords at t (for tgt)"""
    arm = _fig(fig)[0]; return _world_at(arm, F(t)).inverted() @ Vector(p)

# ---------------------------------------------------------------- poses (SECONDS)
HANDS = {  # hand presets: side -> (fingertips, elbow pole) in local body coords; x = +1 for L, -1 for R
    'side': lambda x: ((x * 0.245, -0.05, 0.68), (x * 0.45, 0.35, 1.05)),
    'front': lambda x: ((x * 0.035, -0.17, 0.84), (x * 0.5, 0.15, 1.0)),          # loosely clasped in front of the hips
    'behind': lambda x: ((x * 0.04, 0.16, 0.9), (x * 0.45, 0.4, 1.1)),            # clasped behind the back
    'hips': lambda x: ((x * 0.12, -0.07, 1.0), (x * 0.6, 0.05, 1.1)),             # hands on hips
    'lap': lambda x: ((x * 0.12, -0.38, 1.0), (x * 0.45, 0.25, 1.0)),             # seated, on the thighs
    'crossed': lambda x: ((-x * 0.14, -0.16, 1.2), (x * 0.5, 0.0, 1.05)),         # arms folded across the chest
    'pockets': lambda x: ((x * 0.17, -0.06, 0.86), (x * 0.5, 0.3, 1.0)),          # hands in trouser pockets
    'wrists_front': lambda x: ((x * 0.03, -0.2, 0.86), (x * 0.5, 0.2, 1.0))}       # standing, wrists together in front
def hands(fig, t, preset):
    """key both hands to a HANDS preset at t ('side' 'front' 'behind' 'hips' 'lap' 'crossed' 'pockets' 'wrists_front')"""
    T = _fig(fig)[1]; f = F(t)
    for s, x in (('L', 1), ('R', -1)):
        hp, ep = HANDS[preset](x); tgt(T, 'hand.' + s, f, hp); tgt(T, 'elbow.' + s, f, ep)
def stand(fig, t, loc=None, facing=None, width=0.11, hands='side', spine=0.0, head=(0, 0)):
    """standing at t (feet under the hips, legs straight); loc (x, y[, floor z]) and facing (compass deg) also place the root.
    hands: a HANDS preset or None (leave them)"""
    arm, T = _fig(fig); f = F(t)
    if loc is not None:
        place(arm, f, (loc[0], loc[1], loc[2] if len(loc) > 2 else 0.0), (0, 0, facing_rot(facing if facing is not None else _facing_f(arm, f))))
    for s, x in (('L', 1), ('R', -1)):
        tgt(T, 'foot.' + s, f, (x * width, 0.01, 0.09)); tgt(T, 'knee.' + s, f, (x * 0.1, -0.6, 0.5))
    if hands: globals()['hands'](arm, t, hands)
    pose_bone(arm, 'spine', f, spine); pose_bone(arm, 'neck', f, 0); pose_bone(arm, 'head', f, head[0], head[1], 0)
def idle(fig, t0, t1, amount=1.0, head=True, seed=1):
    """breathing (spine) and small head drift between t0 and t1, around the spine/head angles keyed at t0"""
    arm = _fig(fig)[0]; R = random.Random(seed); f0 = F(t0)
    def cur(b):
        return [math.degrees(fcurve(arm, 'pose.bones["%s"].rotation_euler' % b, i).evaluate(f0)) if fcurve(arm, 'pose.bones["%s"].rotation_euler' % b, i) else 0 for i in range(3)]
    sp, hd = cur('spine'), cur('head'); t = t0; ph = R.uniform(0, 6)
    while t <= t1 + 1e-6:
        pose_bone(arm, 'spine', F(t), sp[0] + amount * 1.2 * math.sin(t * math.tau / 4.2 + ph), sp[1], sp[2])
        if head: pose_bone(arm, 'head', F(t), hd[0] + amount * R.uniform(-2, 2), hd[1] + amount * R.uniform(-3, 3), hd[2] + amount * R.uniform(-1.5, 1.5))
        t += 0.7
def sit(fig, t, seat, facing=None, lean=0.0, feet_fwd=0.42, width=0.11, hands='lap', floor=0.0):
    """seated at t: seat = (x, y, cushion top[, facing]) under the pelvis (R.seat('chair') gives all four); facing = compass deg
    (default the seat's); lean = spine deg (+ forward). The thighs rest on the cushion."""
    arm, T = _fig(fig); s = arm.scale[0]; f = F(t)
    if facing is None:
        if len(seat) < 4: raise ValueError('sit(): give facing, or a seat from R.seat(name)')
        facing = seat[3]
    a = math.radians(facing); rz = seat[2] - (0.92 - THIGH_R) * s
    place(arm, f, (seat[0] + math.cos(a) * 0.05 * s, seat[1] + math.sin(a) * 0.05 * s, rz), (0, 0, facing_rot(facing)))
    fz = (floor - rz) / s + 0.09
    for sd, x in (('L', 1), ('R', -1)):
        tgt(T, 'foot.' + sd, f, (x * width, -feet_fwd, fz)); tgt(T, 'knee.' + sd, f, (x * 0.12, -0.9, 1.1))
    if hands: globals()['hands'](arm, t, hands)
    pose_bone(arm, 'spine', f, lean)
def kneel(fig, t, loc, facing, style='both', hands='side', lean=0.0, floor=0.0):
    """kneeling at t at loc (x, y): style 'both' (upright on both knees), 'left' / 'right' (that knee down, the other foot planted)"""
    arm, T = _fig(fig); s = arm.scale[0]; f = F(t); drop = 0.44
    place(arm, f, (loc[0], loc[1], floor - drop * s), (0, 0, facing_rot(facing)))
    fz = drop + 0.09
    for sd, x in (('L', 1), ('R', -1)):
        down = style == 'both' or (style == 'left') == (sd == 'L')
        if down: tgt(T, 'foot.' + sd, f, (x * 0.1, 0.38, fz)); tgt(T, 'knee.' + sd, f, (x * 0.1, -0.6, 0.6))
        else: tgt(T, 'foot.' + sd, f, (x * 0.12, -0.45, fz)); tgt(T, 'knee.' + sd, f, (x * 0.12, -0.9, 1.3))
    if hands: globals()['hands'](arm, t, hands)
    pose_bone(arm, 'spine', f, lean)
def lie(fig, t, loc, heading, side='back', floor=0.0):
    """lying at t: loc = (x, y) of the pelvis, heading = compass deg the head points, side 'back'|'front'|'left'|'right' (the side DOWN)"""
    arm, T = _fig(fig); s = arm.scale[0]; f = F(t); a = math.radians(heading); hd = Vector((math.cos(a), math.sin(a), 0))
    rot, lift = {'back': ((-90, 0, heading - 90), 0.12), 'front': ((90, 0, heading + 90), 0.12),
                 'left': ((0, 90, heading), 0.2), 'right': ((0, -90, heading + 180), 0.2)}[side]
    root = Vector((loc[0], loc[1], floor + lift * s)) - hd * 0.95 * s
    place(arm, f, tuple(root), rot)
    for sd, x in (('L', 1), ('R', -1)):
        if side in ('back', 'front'): tgt(T, 'foot.' + sd, f, (x * 0.12, 0.01, 0.09)); tgt(T, 'hand.' + sd, f, (x * 0.27, -0.02, 0.7)); tgt(T, 'elbow.' + sd, f, (x * 0.5, 0.0, 1.05))
        else:
            tgt(T, 'foot.' + sd, f, (x * 0.09, -0.12 if (side == 'left') == (sd == 'L') else -0.02, 0.16))
            low = (side == 'left') == (sd == 'L')
            tgt(T, 'hand.' + sd, f, (x * 0.12, -0.35, 1.25) if low else (x * 0.2, -0.15, 0.85)); tgt(T, 'elbow.' + sd, f, (x * 0.4, 0.2, 1.0))
        tgt(T, 'knee.' + sd, f, (x * 0.1, -0.6, 0.5))
    pose_bone(arm, 'spine', f, 0); pose_bone(arm, 'neck', f, 0); pose_bone(arm, 'head', f, 0, 70 if side == 'front' else 0, 0)
def head_turn(fig, t, nod=0.0, turn=0.0, tilt=0.0, neck=0.4):
    """key the head at t: nod (+ down), turn (+ to the figure's left), tilt, shared between neck and head"""
    arm = _fig(fig)[0]; f = F(t)
    pose_bone(arm, 'neck', f, nod * neck, turn * neck, 0); pose_bone(arm, 'head', f, nod * (1 - neck), turn * (1 - neck), tilt)
def look_at(fig, t, point, neck=0.4, max_yaw=80, max_pitch=50, hold=None):
    """turn neck + head at t so the face points at a world point (the spine's lean/twist is respected); hold = key the same then"""
    arm = _fig(fig)[0]; f = F(t); e = _rig(arm, f)
    if e is None: S.sc.frame_set(f); e = arm
    mw = e.matrix_world; piv = mw @ e.pose.bones['head'].head
    R = mw.to_3x3().normalized() @ e.pose.bones['spine'].matrix.to_3x3()
    d = R.inverted() @ (Vector(point) - piv)
    yaw = max(-max_yaw, min(max_yaw, math.degrees(math.atan2(d.x, d.z)))); pitch = max(-max_pitch, min(max_pitch, math.degrees(math.atan2(-d.y, math.hypot(d.x, d.z)))))
    for ff in [f] + ([F(hold)] if hold is not None else []):
        pose_bone(arm, 'neck', ff, pitch * neck, yaw * neck, 0); pose_bone(arm, 'head', ff, pitch * (1 - neck), yaw * (1 - neck), 0)
    return yaw, pitch
def reach(fig, t, side, point, elbow=None):
    """the fingertips of hand side ('L'/'R') to a world point at t (key the start pose before it); elbow = local pole"""
    arm, T = _fig(fig); f = F(t); p = _world_at(arm, f).inverted() @ Vector(point)
    tgt(T, 'hand.' + side, f, tuple(p))
    if elbow is not None: tgt(T, 'elbow.' + side, f, elbow)
    return p
def walk(fig, path, t0, t1, step=0.6, lift=0.1, arms=True, start='L', settle=True, floor=0.0, lean=4.0):
    """Walk along path [(x, y), ...] (world, on floor z) from t0 to t1: the root follows the path facing along it, the feet plant
    and swing, the hips dip as the legs need, the arms counter-swing (arms=False leaves the hands alone).
    settle=True: arrives at the end at t1 with the feet together; False: still mid-stride at t1 (walking on or out)."""
    arm, T = _fig(fig); s = arm.scale[0]
    P = [Vector((p[0], p[1], floor)) for p in path]; segs = [(P[i + 1] - P[i]).length for i in range(len(P) - 1)]; Lt = sum(segs)
    def at(d):
        d = max(0.0, min(Lt, d))
        for i, l in enumerate(segs):
            if d <= l or i == len(segs) - 1: return P[i] + (P[i + 1] - P[i]) * (d / l if l else 0)
            d -= l
    def tan(d):
        v = at(d + 0.3) - at(d - 0.3); return v.normalized() if v.length > 1e-6 else Vector((0, 1, 0))
    N = max(1, round(Lt / step)); st = Lt / N; dt = (t1 - t0) / (N + (0.6 if settle else 0)); other = {'L': 'R', 'R': 'L'}
    sched = {'L': [], 'R': []}; pos = {'L': 0.0, 'R': 0.0}; body = [(t0, 0.0)]; last = start
    for kk in range(1, N + 1):
        ft = start if kk % 2 else other[start]; ta = t0 + (kk - 1) * dt; tb = ta + dt
        sched[ft].append((ta, tb, pos[ft], kk * st)); pos[ft] = kk * st; body.append((tb, (kk - 0.5) * st)); last = ft
    if settle:
        ft = other[last]; sched[ft].append((t0 + N * dt, t1, pos[ft], Lt)); body.append((t1, Lt))
    def bdist(t):
        if t <= body[0][0]: return 0.0
        for (ta, da), (tb, db) in zip(body, body[1:]):
            if t <= tb: return da + (db - da) * (t - ta) / (tb - ta)
        return body[-1][1]
    def foot(sd, t):
        d = 0.0
        for (ta, tb, da, db) in sched[sd]:
            if t >= tb: d = db
            elif t > ta:
                u = (t - ta) / (tb - ta); u2 = u * u * (3 - 2 * u); return da + (db - da) * u2, lift * math.sin(math.pi * u), False
        return d, 0.0, True
    f0 = F(t0); prev = _facing_f(arm, f0) + 90.0; Lr = LEG * 0.985
    hip = {'L': Vector((0.09, 0, 0.92)), 'R': Vector((-0.09, 0, 0.92))}
    for fr in range(f0, F(t1) + 1):
        t = sec(fr); db = bdist(t)
        c = at(db); tv = tan(db); yaw = math.degrees(math.atan2(tv.y, tv.x)) + 90.0; yaw += 360 * round((prev - yaw) / 360); prev = yaw
        Rinv = Matrix.Rotation(math.radians(-yaw), 3, 'Z'); loc = {}; need = 0.0
        for sd in ('L', 'R'):
            d, z, planted = foot(sd, t); fc = at(d); ft_ = tan(d); left = Vector((-ft_.y, ft_.x, 0)); x = 1 if sd == 'L' else -1
            w = fc + left * (x * 0.1 * s) + Vector((0, 0, (0.09 + z) * s))
            l_ = (Rinv @ (w - c)) / s
            if planted: l_.z += 0.05 * min(1.0, max(0.0, (l_.y - 0.05) / 0.25))
            loc[sd] = l_
            hd = min(math.hypot(l_.x - hip[sd].x, l_.y - hip[sd].y), Lr * 0.999)
            need = max(need, (0.92 - math.sqrt(Lr * Lr - hd * hd)) - l_.z)
        drop = max(0.0, need)
        arm.location = (c.x, c.y, floor - drop * s); arm.keyframe_insert('location', frame=fr)
        arm.rotation_euler = (0, 0, math.radians(yaw)); arm.keyframe_insert('rotation_euler', frame=fr)
        for sd in ('L', 'R'):
            l_ = loc[sd]; tgt(T, 'foot.' + sd, fr, (l_.x, l_.y, l_.z + drop)); tgt(T, 'knee.' + sd, fr, ((1 if sd == 'L' else -1) * 0.1, -0.6, 0.5))
        if arms:
            for sd, x in (('L', 1), ('R', -1)):
                oy = loc[other[sd]].y; hy = max(-0.24, min(0.2, -0.03 + 0.55 * oy))
                tgt(T, 'hand.' + sd, fr, (x * 0.245, hy, 0.69 + 0.5 * (hy + 0.03) ** 2)); tgt(T, 'elbow.' + sd, fr, (x * 0.45, 0.35, 1.05))
    pose_bone(arm, 'spine', f0, lean)
    if settle: pose_bone(arm, 'spine', F(t0 + N * dt), lean); pose_bone(arm, 'spine', F(t1), 0)
    else: pose_bone(arm, 'spine', F(t1), lean)
    return t1
def turn(fig, t0, t1, facing, shuffle=True):
    """turn on the spot to a compass facing between t0 and t1 (standing figures; the feet pivot with two small lifts)"""
    arm, T = _fig(fig); f0, f1 = F(t0), F(t1); e = _rig(arm, f0)
    if e is None: S.sc.frame_set(f0); e = arm
    loc = tuple(e.location); r0 = list(e.rotation_euler)
    place(arm, f0, loc, (math.degrees(r0[0]), math.degrees(r0[1]), math.degrees(r0[2])), unwrap=False)
    place(arm, f1, loc, (math.degrees(r0[0]), math.degrees(r0[1]), facing_rot(facing)))
    if shuffle:
        for sd, x, u in (('L', 1, 0.33), ('R', -1, 0.66)):
            fm = F(t0 + (t1 - t0) * u)
            tgt(T, 'foot.' + sd, F(t0 + (t1 - t0) * (u - 0.2)), (x * 0.11, 0.01, 0.09)); tgt(T, 'foot.' + sd, fm, (x * 0.11, 0.0, 0.15)); tgt(T, 'foot.' + sd, F(t0 + (t1 - t0) * (u + 0.2)), (x * 0.11, 0.01, 0.09))
