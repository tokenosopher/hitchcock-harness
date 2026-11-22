"""Cameras by shot. The lens is given in degrees: `diag` = the diagonal field of view of the film's frame (9:16 or 16:9);
84 wide, 63 medium, 47 close, 30 extreme close (about 24, 35, 50 and 80 mm full-frame equivalents in either ratio). The
vertical and horizontal angles follow from the ratio. Blender's sensor is 24 mm along the frame's long side."""
import bpy, math
from mathutils import Vector
from .core import S, F, sec, arg, compass

SHOTS = []            # one dict per shot(), in order
PLAN = []             # the cut: (label, shot index 0.., t0, t1)
def _reset(): SHOTS.clear(); PLAN.clear()


def _wh():
    w, h = S.aspect; return float(w), float(h)
def _part(diag, side):
    w, h = _wh(); return 2 * math.degrees(math.atan(math.tan(math.radians(diag / 2)) * side / math.hypot(w, h)))
def vfov(diag): return _part(diag, _wh()[1])
def hfov(diag): return _part(diag, _wh()[0])
def hhalf(diag): return hfov(diag) / 2
def long_fov(diag): return _part(diag, max(_wh()))
def lens_mm(diag): return 12.0 / math.tan(math.radians(long_fov(diag) / 2))     # 24 mm sensor along the long side
def lens_ff(diag): return 21.633 / math.tan(math.radians(diag / 2))             # full-frame (36 x 24) equivalent
def size_word(diag):
    """the lens's own word (its field of view), not the shot's size: the size is how much of the frame the subject fills
    (shot_size), which the board's camera line uses when it is known"""
    return 'wide' if diag >= 75 else 'medium' if diag >= 55 else 'close-up' if diag >= 40 else 'extreme close-up'
# The shot's size from how much of the frame the subject's height fills: fill = the subject's height /
# the height the frame covers at the subject's distance. 6.5 frame heights is a face; 3.4 head and shoulders; 2.3 to the
# chest; 1.45 to the waist or hips; 0.85 the whole figure; below that the place holds the figure.
SIZES = (('extreme close-up', 6.5), ('close-up', 3.4), ('medium close-up', 2.3), ('medium', 1.45), ('full', 0.85), ('wide', 0.0))
def shot_size(fill):
    for w_, lo in SIZES:
        if fill >= lo: return w_
    return 'wide'
def fill_of(height, depth, diag):
    """how many frame heights a figure of `height` m makes at `depth` m in front of a lens of `diag` degrees"""
    return height / max(1e-6, 2.0 * depth * math.tan(math.radians(vfov(diag) / 2)))
def compass8(yaw):
    return ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'][int(((yaw % 360) + 22.5) // 45) % 8]
def frame_on(pos, pt, diag, fx=0.0, fy=0.0):
    """yaw/pitch (deg) so world point pt sits at fx, fy in frame (fractions of the half frame, + = right / up)"""
    d = Vector(pt) - Vector(pos); yaw = math.degrees(math.atan2(d.y, d.x)); el = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
    return yaw + fx * hhalf(diag), el - fy * vfov(diag) / 2


def shot(id, t0, t1, diag, pos, pt, in_frame=(), name=None, fx=0.0, fy=0.0, focus=None, handheld=False, move=None, fstop=None,
         jolts=(), exposure=None, board=None, seed=None):
    """Declare shot `id` ('1', '5A', ...) from t0 to t1 s: camera at pos framing world point pt at (fx, fy) with lens diag (deg).
    in_frame: what the frame shows, as the prompt names it (cast keys, props, set pieces: ['NIA', 'SWORD', 'DOOR']); it goes into
    the generation's shots file for the pre-submit check. focus: a world point, or a figure's name ('NIA': the point between
    its eyes, followed as it moves); by default the nearest face in frame turned toward the lens among the
    shot's in_frame figures (else the nearest head in frame, else pt), followed as it moves. DOF f/2 at 47 deg and under, else
    f/2.8 (fstop overrides). handheld: True or an amplitude (seed varies the breathing); jolts: times of bumps.
    move = dict(pos=, pt=, fx=, fy=, focus=, diag=, t0=, t1=, ease='both'|'in'|'out'|'linear'): travels and re-aims between
    move t0 and t1 (default the shot's). exposure: this shot's EV (keyed at its cut). board: the storyboard camera line
    (default: written from the camera). Returns id."""
    SHOTS.append(dict(id=str(id), name=name or str(id), t0=float(t0), t1=float(t1), diag=float(diag), pos=Vector(pos), pt=Vector(pt), fx=fx, fy=fy,
                      focus=(Vector(focus) if focus is not None and not isinstance(focus, str) else Vector(pt)),
                      focus_fig=(str(focus).upper() if isinstance(focus, str) else None), focus_auto=focus is None, handheld=float(handheld), move=move, fstop=fstop, jolts=list(jolts),
                      in_frame=[str(x).strip().upper().replace(' ', '_') for x in in_frame], exposure=exposure, board=board,
                      seed=seed if seed is not None else len(SHOTS) + 1, obj=None))
    return str(id)
def _shot(x):
    """a shot dict from its id (or its 1-based number, or the dict)"""
    if isinstance(x, dict): return x
    for s_ in SHOTS:
        if s_['id'] == str(x): return s_
    if isinstance(x, int) and 1 <= x <= len(SHOTS): return SHOTS[x - 1]
    raise KeyError('no shot %r (shots: %s)' % (x, ', '.join(s_['id'] for s_ in SHOTS)))
def _ease(u, kind):
    u = min(1.0, max(0.0, u)); return {'linear': u, 'in': u * u, 'out': 1 - (1 - u) ** 2}.get(kind, u * u * (3 - 2 * u))
def cam_state(s_, t):
    """(pos, yaw, pitch, focus distance, diag) of a shot's camera at t"""
    s_ = _shot(s_); pos, pt, fx, fy, foc, diag = s_['pos'], s_['pt'], s_['fx'], s_['fy'], s_['focus'], s_['diag']; m = s_['move']
    if m:
        u = _ease((t - m.get('t0', s_['t0'])) / max(1e-6, m.get('t1', s_['t1']) - m.get('t0', s_['t0'])), m.get('ease', 'both'))
        L_ = lambda a, b: a + (b - a) * u
        pos = L_(pos, Vector(m.get('pos', pos))); pt = L_(pt, Vector(m.get('pt', pt))); fx = L_(fx, m.get('fx', fx)); fy = L_(fy, m.get('fy', fy))
        foc = L_(foc, Vector(m.get('focus', m.get('pt', foc)))); diag = L_(diag, m.get('diag', diag))
    yaw, pitch = frame_on(pos, pt, diag, fx, fy)
    return pos, yaw, pitch, (foc - pos).length, diag
def project(s_, t, p):
    """(x, y, depth) of world point p in shot s_'s frame at t, from the camera's numbers (x, y 0..1 from the top-left)"""
    pos, yaw, pitch, fd, diag = cam_state(s_, t); y_, p_ = math.radians(yaw), math.radians(pitch)
    f = Vector((math.cos(p_) * math.cos(y_), math.cos(p_) * math.sin(y_), math.sin(p_)))
    r = Vector((math.sin(y_), -math.cos(y_), 0.0)); u = r.cross(f)
    d = Vector(p) - pos; z = d.dot(f)
    if z <= 1e-6: return (0.5, 0.5, z)
    return (0.5 + 0.5 * d.dot(r) / (z * math.tan(math.radians(hfov(diag) / 2))), 0.5 - 0.5 * d.dot(u) / (z * math.tan(math.radians(vfov(diag) / 2))), z)
def focus_subject(s_):
    """the figure a shot focuses on by default: among its in_frame figures, the nearest whose face is in frame and turned
    toward the lens (within 100 deg) at the shot's middle; else the nearest head in frame; None when no named face is in frame"""
    from .figures import FIGS, fig_tag, eyes_world, head_world
    t = (s_['t0'] + s_['t1']) / 2; pos = cam_state(s_, t)[0]; best = []
    for n in s_['in_frame']:
        if n not in FIGS or fig_tag(FIGS[n]['arm']) != n: continue
        e = eyes_world(n, t); h = head_world(n, t); x, y, z = project(s_, t, e)
        if z <= 0.05 or not (0.02 <= x <= 0.98 and 0.02 <= y <= 0.98): continue
        face = (e - h).normalized(); to_cam = (pos - e).normalized()
        ang = math.degrees(face.angle(to_cam)) if face.length > 0 else 180.0
        best.append((0 if ang < 100 else 1, z, n))
    return sorted(best)[0][2] if best else None
def _cam_data(name, diag):
    cd = bpy.data.cameras.new(name); cd.sensor_fit = 'VERTICAL' if S.aspect[1] > S.aspect[0] else 'HORIZONTAL'
    if cd.sensor_fit == 'VERTICAL': cd.sensor_height = 24.0
    else: cd.sensor_width = 24.0
    cd.clip_start = 0.02; cd.clip_end = 1000; cd.lens = lens_mm(diag); return cd
def make_cameras():
    """create every declared shot's camera ('cam-<id>'), with its move and handheld keyed (run() calls it)"""
    for s_ in SHOTS:
        if s_['obj'] is not None: continue
        cd = _cam_data('cam-' + s_['id'], s_['diag']); cd.dof.use_dof = True; cd.dof.aperture_fstop = s_['fstop'] or (2.0 if s_['diag'] <= 47 else 2.8)
        c = bpy.data.objects.new('cam-' + s_['id'], cd); S.sc.collection.objects.link(c); s_['obj'] = c
        subj = s_.get('focus_fig') or (focus_subject(s_) if s_.get('focus_auto') else None)
        s_['subject'] = subj
        if subj:
            from .figures import focus_target, FIGS
            if subj in FIGS: cd.dof.focus_object = focus_target(subj)
            else: print('previz kit: WARN shot %s focus %s is not a figure here; focus on its aim point' % (s_['id'], subj)); s_['subject'] = None
        pos, yaw, pitch, fd, diag = cam_state(s_, s_['t0'])
        c.location = pos; c.rotation_euler = (math.radians(90 + pitch), 0.0, math.radians(yaw - 90)); cd.lens = lens_mm(diag); cd.dof.focus_distance = fd
        s_['yaw'], s_['pitch'], s_['lens'] = yaw, pitch, cd.lens
        if s_['move'] or s_['handheld']:
            m = s_['move'] or {}; ta = min(s_['t0'], m.get('t0', s_['t0'])); tb = max(s_['t1'], m.get('t1', s_['t1'])); prev = yaw; i = s_['seed']
            for f in range(F(ta), F(tb) + 1, 2):
                t = sec(f); pos, yaw, pitch, fd, diag = cam_state(s_, t); yaw += 360 * round((prev - yaw) / 360); prev = yaw
                rx, rz = math.radians(90 + pitch), math.radians(yaw - 90); a = s_['handheld']
                if a:
                    rx += a * (0.004 * math.sin(t * 1.3 + i) + 0.0015 * math.sin(t * 4.1 + 2 * i)); rz += a * (0.005 * math.sin(t * 0.9 + 2 * i) + 0.0012 * math.sin(t * 3.3 + i))
                    for bt in s_['jolts']:
                        if 0 <= t - bt < 0.2: rx += 0.008 * a
                c.location = pos; c.keyframe_insert('location', frame=f); c.rotation_euler = (rx, 0, rz); c.keyframe_insert('rotation_euler', frame=f)
                if s_['move']:
                    cd.lens = lens_mm(diag); cd.keyframe_insert('lens', frame=f)
                    if cd.dof.focus_object is None: cd.dof.focus_distance = fd; cd.dof.keyframe_insert('focus_distance', frame=f)
    if S.sc.camera is None and SHOTS: S.sc.camera = SHOTS[0]['obj']
    return [s_['obj'].name for s_ in SHOTS]
def cam(x):
    """a shot's camera object (by shot id); make_cameras() first"""
    if hasattr(x, 'type'): return x
    s_ = _shot(x)
    if s_['obj'] is None: make_cameras()
    return s_['obj']
def shot_plan(plan=None):
    """The cut: [(label, shot id, t0, t1), ...]; default one cut per shot at its own t0..t1. Creates the timeline markers that
    switch cameras in the film render, and keys each shot's exposure at its cut."""
    make_cameras(); PLAN[:] = []
    if plan is None: plan = [(s_['id'], s_['id'], s_['t0'], s_['t1']) for s_ in SHOTS]
    for m_ in list(S.sc.timeline_markers): S.sc.timeline_markers.remove(m_)
    for lab, sid, t0, t1 in plan:
        idx = SHOTS.index(_shot(sid)); PLAN.append((str(lab), idx, float(t0), float(t1)))
        mk = S.sc.timeline_markers.new(str(lab), frame=F(t0)); mk.camera = SHOTS[idx]['obj']
    S.sc.camera = SHOTS[PLAN[0][1]]['obj']
    if arg('--exposure') is None and any(SHOTS[i]['exposure'] is not None for _, i, _, _ in PLAN):
        vs = S.sc.view_settings; base = vs.exposure
        for lab, i, t0, t1 in PLAN:
            e = SHOTS[i]['exposure']; vs.exposure = base if e is None else e; vs.keyframe_insert('exposure', frame=F(t0))
        from .core import set_interp
        set_interp(S.sc, 'CONSTANT', 'view_settings.exposure')
    return PLAN
def free_cam(name, pos, pt, diag=63, fx=0.0, fy=0.0, fstop=4.0, focus=None):
    """a loose camera for checks (not a shot)"""
    cd = _cam_data(name, diag); cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    cd.dof.focus_distance = (Vector(focus if focus is not None else pt) - Vector(pos)).length
    c = bpy.data.objects.new(name, cd); S.sc.collection.objects.link(c); c.location = pos; yaw, pitch = frame_on(pos, pt, diag, fx, fy)
    c.rotation_euler = (math.radians(90 + pitch), 0, math.radians(yaw - 90)); return c
def camera_line(s_):
    """the storyboard's camera line for a shot: CAM FACING E | 63 deg medium | 1.29 m | handheld"""
    s_ = _shot(s_)
    if s_['board']: return s_['board']
    pos, yaw, pitch, fd, diag = cam_state(s_, s_['t0']); mount = []
    if s_['move']:
        p2, y2, pi2, _, d2 = cam_state(s_, s_['move'].get('t1', s_['t1'])); dp = p2 - pos
        if dp.length > 0.05:
            fwd = Vector((math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0))
            mount.append('push in %.1f m' % dp.length if dp.dot(fwd) > 0.7 * dp.length else 'pull out %.1f m' % dp.length if dp.dot(fwd) < -0.7 * dp.length else 'tracks %.1f m' % dp.length)
        if abs((y2 - yaw + 180) % 360 - 180) > 3: mount.append('pans %s' % ('left' if (y2 - yaw + 180) % 360 - 180 > 0 else 'right'))
        if abs(pi2 - pitch) > 3: mount.append('tilts %s' % ('up' if pi2 > pitch else 'down'))
        if abs(d2 - diag) > 2: mount.append('zooms %s' % ('out' if d2 > diag else 'in'))
    if s_['handheld']: mount.append('handheld')
    tilt = '' if abs(pitch) < 8 else ', tilted %s %d°' % ('up' if pitch > 0 else 'down', round(abs(pitch)))
    if s_.get('size'):            # the size from the scene's numbers (facts), the lens separately
        sz = '%s of %s' % (s_['size'], s_['size_of'].replace('_', ' ').title()) if s_.get('size_of') else s_['size']
        return 'CAM FACING %s | %s, %g° lens | %.2f m%s | %s' % (compass8(yaw), sz, s_['diag'], pos.z, tilt, ', '.join(mount) or 'locked off')
    return 'CAM FACING %s | %g° %s | %.2f m%s | %s' % (compass8(yaw), s_['diag'], size_word(s_['diag']), pos.z, tilt, ', '.join(mount) or 'locked off')
def shot_record(lab, i, t0, t1):
    """a cut's entry for the take json"""
    s_ = SHOTS[i]; d_ = dict(id=lab, label=lab, name=s_['name'], camera=s_['obj'].name, t0=t0, t1=t1, in_frame=s_['in_frame'],
                             diag_fov=s_['diag'], vfov=round(vfov(s_['diag']), 1), hfov=round(hfov(s_['diag']), 1), lens_mm=round(s_['lens'], 1),
                             lens_ff_mm=round(lens_ff(s_['diag']), 1), cam=[round(v, 2) for v in s_['pos']], yaw=round(s_['yaw'] % 360, 1), pitch=round(s_['pitch'], 1),
                             handheld=s_['handheld'], board=camera_line(s_))
    if s_['move']:
        m = s_['move']; p2, y2, pi2, _, dg2 = cam_state(s_, m.get('t1', s_['t1']))
        d_['move'] = dict(t0=m.get('t0', s_['t0']), t1=m.get('t1', s_['t1']), to_cam=[round(v, 2) for v in p2], to_yaw=round(y2 % 360, 1), to_pitch=round(pi2, 1), to_diag_fov=round(dg2, 1))
    if s_['exposure'] is not None: d_['exposure'] = s_['exposure']
    return d_
