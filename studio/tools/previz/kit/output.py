"""run(): the render modes and what they write. One mode per invocation (OUTDIR = <film>/previz/<G>/):
  --check [--shots 1,2]       three frames per cut -> OUTDIR/check/shotNN-<id>-<t>.png; checks in_frame against what the cameras
                              see (WARN lines); saves OUTDIR/<G>-previz.blend
  --panels [--version v1] [--only 1,3] [--panel-start N] [--panel-times "id:t,id:t"]
                              storyboard panels through each panel's own shot camera -> OUTDIR/storyboard/<version>/panels/NN-shot<id>-<t>.png,
                              panels.json and board.json beside them (board.json only if missing or written by the kit); the shots file
  --project <id> t1,t2        prints PROJECT {...}: where each figure's head and hips and every `points` entry land in that shot's camera
  --plate <id> <t>            the empty set through a shot's camera (figures and what they hold hidden) -> OUTDIR/plates/
  --mannequin [--mq-time t]   close-ups and full views of every figure at t -> OUTDIR/check/mq-<name>-<view>.png
  --facts                     only the scene's facts -> OUTDIR/<G>-facts.json (nothing rendered; precheck.py reads it)
  (--check, --panels and the take also write the facts; --check prints the sight check: covered or too small heads, the
  hands in use out of frame or covered)
  --shots-file                only write the generation's shots file
  --build                     only build the scene (with setup(reuse=True): and save it for the next runs); prints BUILD DONE
  (none)                      the take: frames -> OUTDIR/<G>-previz-take-N.mp4 (+ .json: shots, shot_plan, moves, lines) + .blend; the shots file
  --grey (with any mode) every surface one grey, every light white; --res <short side> --samples <n> --exposure <EV>
The shots file (for the pre-submit check): <G>-shots.json in the generation's folder (generations/<G>, else blocks/<G>, as the check finds it):
{"duration": s, "shots": [{"id": "1", "t0", "t1", "in_frame": [...]}, ...]}, merged into an existing file by id (its other keys
kept; shots this previz no longer has move to "retired_shots")."""
import bpy, json, math, os, subprocess, sys
from mathutils import Vector
from .core import S, F, sec, ARGV, arg, has, grey_world
from .figures import FIGS, fig_objects, head_world, facing_now, fig_tag, clear_probes, fix_scaled_builds
from .cameras import SHOTS, PLAN, make_cameras, shot_plan, cam, _shot, cam_state, frame_on, lens_mm, vfov, camera_line, shot_record, _cam_data
from .core import fcurve


def _no_markers():
    for m_ in list(S.sc.timeline_markers): S.sc.timeline_markers.remove(m_)   # markers bound to cameras override sc.camera at render time
def still(c, t, path):
    """render one frame at t through a shot's camera (id or camera object) to path; removes the camera markers first"""
    _no_markers(); S.sc.frame_set(F(t)); S.sc.camera = cam(c)
    os.makedirs(os.path.dirname(path), exist_ok=True); S.sc.render.filepath = path; bpy.ops.render.render(write_still=True); return path


def _norm_panels(panels):
    out = []
    for p in panels:
        if isinstance(p, dict): out.append((str(p['shot']), float(p['t']), p.get('caption')))
        else: out.append((str(p[0]), float(p[1]), p[2] if len(p) > 2 else None))
    return out
def _norm_lines(lines):
    out = []
    for l in lines or []:
        l = dict(l)
        if 't' not in l and 't0' in l: l['t'] = [l.pop('t0'), l.pop('t1')]
        if not l.get('who') or 't' not in l: raise ValueError('a line needs who, text and t=[t0, t1]: %r' % (l,))
        if not (l.get('text') or '').strip(): print('previz kit: WARN line of %s at %s has no text (the pre-submit check compares words)' % (l['who'], l['t']))
        l['who'] = str(l['who']).upper(); l['t'] = [round(float(l['t'][0]), 3), round(float(l['t'][1]), 3)]; out.append(l)
    return sorted(out, key=lambda l: l['t'][0])
def _norm_moves(moves):
    def start(m):
        if m.get('t'): return float(m['t'][0])
        a = m.get('at'); return float((a[0] if isinstance(a, (list, tuple)) else a) or 0)
    out = [dict(m, who=str(m.get('who', '')).upper()) for m in moves or []]
    return sorted(out, key=start)
def _active(items, t):
    res = []
    for m in items:
        tt = m.get('t')
        if tt and tt[0] - 1e-6 <= t <= (m.get('hold_to') or tt[1]) + 1e-6: res.append(m)
    return res
def auto_caption(t, moves, lines, sid=None):
    """a caption from what happens at t: the moves under way and the line being spoken (else what the shot shows)"""
    parts = ['%s %s' % (m['who'].title(), m['what']) for m in _active(moves, t) if m.get('what')]
    parts += ['%s: "%s"' % (l['who'].title(), l['text']) for l in _active(lines, t) if l.get('text')]
    if not parts and sid is not None:
        s_ = _shot(sid)
        if s_['name'] != s_['id']: return s_['name']
        if s_['in_frame']: return 'In frame: %s.' % ', '.join(x.replace('_', ' ').title() for x in s_['in_frame'])
    c = '; '.join(parts) if parts else '(caption)'
    return c if c[-1] in '.!?"\')' else c + '.'


def shots_file_path():
    return os.path.join(S.film.generation_dir(S.gen), '%s-shots.json' % S.gen)
def write_shots_file():
    """the generation's shots file for the pre-submit check, from this script's shots and in_frame lists (merged by id)"""
    p = shots_file_path(); os.makedirs(os.path.dirname(p), exist_ok=True)
    old = {}
    if os.path.exists(p):
        with open(p) as fh: old = json.load(fh)
    byid = {str(s_.get('id')): s_ for s_ in old.get('shots', [])}; seen = {}; shots = []
    for lab, i, t0, t1 in PLAN:
        if lab in seen:
            e = seen[lab]; e['t1'] = max(e['t1'], t1); e['in_frame'] = e['in_frame'] + [x for x in SHOTS[i]['in_frame'] if x not in e['in_frame']]; continue
        e = dict(byid.get(lab, {})); e.update(id=lab, t0=t0, t1=t1, in_frame=list(SHOTS[i]['in_frame'])); seen[lab] = e; shots.append(e)
        if not SHOTS[i]['in_frame']: print('previz kit: WARN shot %s declares no in_frame (the pre-submit check needs it)' % lab)
    dropped = [k_ for k_ in byid if k_ not in seen]
    out = dict(old); out['duration'] = S.dur; out['shots'] = shots
    ret = {str(e.get('id')): e for e in old.get('retired_shots', [])}; ret.update({k_: byid[k_] for k_ in dropped})
    ret = [e for k_, e in ret.items() if k_ not in seen]   # hand-written entries this previz no longer has: kept aside, never lost
    if ret: out['retired_shots'] = ret
    else: out.pop('retired_shots', None)
    with open(p, 'w') as fh: json.dump(out, fh, indent=1)
    print('SHOTS FILE', p, ('(ids not in this previz moved to retired_shots: %s)' % ', '.join(dropped)) if dropped else '')
    return p
def _board(panels, moves, lines, header):
    shots = []; seen = set()
    for lab, i, t0, t1 in PLAN:
        if lab in seen: continue
        seen.add(lab); shots.append(dict(shot=lab, camera=camera_line(SHOTS[i])))
    for n, sid, t, cap in panels:
        if sid not in seen: shots.append(dict(shot=sid, camera=camera_line(sid))); seen.add(sid)
    head = header or 'PROJECT: %s  |  %s%s  |  %s, %g s' % (S.film.title.upper(), S.gen, (' · ' + S.title.upper()) if S.title else '', S.ratio, S.dur)
    return dict(header=head, ratio=S.ratio, generated_by='previz kit', shots=shots,
                captions=[dict(n=n, caption=cap or auto_caption(t, moves, lines, sid)) for n, sid, t, cap in panels])


def _in_frame_check():
    """WARN when a figure the camera sees is not in the shot's in_frame list, or a listed figure is never seen. A crowd figure of
    the location's shared file counts as its group's tag (CROWD), as the prompts name it."""
    from bpy_extras.object_utils import world_to_camera_view as w2c
    sc = S.sc; bad = 0; tags = {n: fig_tag(FIGS[n]['arm']) for n in FIGS}
    for lab, i, t0, t1 in PLAN:
        c = SHOTS[i]['obj']; seen = set(); count = {}
        for tt in (t0 + 0.05, (t0 + t1) / 2, t1 - 0.05):
            sc.frame_set(F(tt))
            for n in FIGS:
                arm = FIGS[n]['arm']
                if arm.hide_render and all(o.hide_render for o in arm.children_recursive): continue
                for v in (arm.matrix_world @ arm.pose.bones['head'].matrix @ Vector((0, 0.11, 0)), arm.matrix_world @ arm.pose.bones['hips'].head):
                    x, y, z = w2c(sc, c, v)
                    if z > 0 and 0 <= x <= 1 and 0 <= y <= 1: seen.add(tags[n]); count.setdefault(tags[n], set()).add(n)
        declared = set(SHOTS[i]['in_frame'])
        groups = {t for n, t in tags.items() if t != n}
        if groups & seen: print('IN_FRAME shot %s sees %s' % (lab, ', '.join('%s(%d)' % (g, len(count[g])) if g in groups else g for g in sorted(seen))))
        for n in sorted(seen - declared): print('previz kit: WARN shot %s sees %s but its in_frame is %s' % (lab, n, sorted(declared))); bad += 1
        for n in sorted((declared & set(tags.values())) - seen): print('previz kit: WARN shot %s lists %s but its camera never sees them' % (lab, n)); bad += 1
    print('IN_FRAME CHECK', 'ok' if not bad else '%d warning(s)' % bad)


def _point(v, t):
    """a --project point at t: a world point, an object, a function of t, or a spec ('bone'|'tail', fig, bone) ('eyes'|'head', fig) ('prop', name)"""
    if callable(v): return v(t)
    if hasattr(v, 'matrix_world'): S.sc.frame_set(F(t)); return v.matrix_world.translation
    if isinstance(v, (tuple, list)) and v and isinstance(v[0], str):
        from .figures import bone_world, eyes_world
        from .props import prop_world
        k = v[0]
        if k in ('bone', 'tail'): return bone_world(v[1], v[2], t, tail=(k == 'tail'))
        if k == 'eyes': return eyes_world(v[1], t)
        if k == 'head': return head_world(v[1], t)
        if k == 'prop': return prop_world(v[1], t)
        raise ValueError('unknown point spec %r' % (v,))
    return v


def run(panels=None, moves=None, lines=None, points=None, extra=None, header=None):
    """Render per the command-line mode (see the module doc). panels: [(shot id, t[, caption]), ...] (default three per cut);
    moves: [dict(who, what, t=[t0, t1])] (sorted by start); lines: [dict(who, text, t=[t0, t1])]; points: {name: world point |
    object | callable(t)} for --project; extra: more keys for the take json; header: the board header."""
    sc = S.sc; od = S.outdir; G = S.gen
    if not SHOTS: sys.exit('previz kit: no shots declared')
    clear_probes()              # the pose questions' side scenes go before anything is saved, checked or rendered
    fix_scaled_builds()         # an armature scaled unevenly tears its shoulders and elbows: made even, the breadth in the parts
    make_cameras()
    if not PLAN: shot_plan()
    clear_probes()              # (the default focus asks where the faces are)
    if S.reuse:                 # setup(reuse=True): the scene as built, saved before any mode changes it (reuse.py)
        from . import reuse as _reuse
        _reuse.save(dict(panels=panels, moves=moves, lines=lines, points=points, extra=extra, header=header))
    if has('--build'): print('BUILD DONE', G); sys.exit(0)
    moves = _norm_moves(moves); lines = _norm_lines(lines)
    if has('--panel-times'):
        panels = [(x.split(':')[0], float(x.split(':')[1])) for x in arg('--panel-times').split(',')]
    if panels is None: panels = [(SHOTS[i]['id'], round(tt, 2)) for lab, i, t0, t1 in PLAN for tt in (t0 + 0.1, (t0 + t1) / 2, t1 - 0.1)]
    panels = _norm_panels(panels)
    numbered = [(n, sid, t, cap) for n, (sid, t, cap) in enumerate(panels, int(arg('--panel-start', 1)))]
    if has('--facts'):          # the scene's facts only (fast lane, nothing rendered): <G>-facts.json for precheck.py
        from .facts import write_facts
        write_facts(numbered, moves, lines); sys.exit(0)
    if has('--grey'): grey_world()
    if has('--shots-file'): write_shots_file(); sys.exit(0)
    if has('--project'):
        from bpy_extras.object_utils import world_to_camera_view as w2c
        c = cam(arg('--project'))
        for tt in [float(x) for x in ARGV[ARGV.index('--project') + 2].split(',')]:
            vals = {nm: _point(v, tt) for nm, v in (points or {}).items()}   # (a function of t may move the frame: evaluated first)
            sc.frame_set(F(tt))
            def P(v):
                x, y, z = w2c(sc, c, Vector(v)); return [round(x, 4), round(1 - y, 4), round(z, 2)]
            out = {'t': tt}
            for n in FIGS:
                arm = FIGS[n]['arm']
                if fig_tag(arm) != n: continue          # crowd figures of the shared file: not one by one
                out[n + '_head'] = P(arm.matrix_world @ arm.pose.bones['head'].matrix @ Vector((0, 0.11, 0))); out[n + '_hips'] = P(arm.matrix_world @ arm.pose.bones['hips'].head)
            for nm, vv in vals.items(): out[nm] = P(vv)
            print('PROJECT', json.dumps(out))
        sys.exit(0)
    if has('--plate'):
        sid, tt = arg('--plate'), float(ARGV[ARGV.index('--plate') + 2])
        for o in fig_objects():
            fc = fcurve(o, 'hide_render')
            if fc: fc.mute = True
            o.hide_render = True
        p = still(sid, tt, os.path.join(od, 'plates', 'cam%s-%05.2f-empty.png' % (sid, tt)))
        pos, yaw, pitch, fd, diag = cam_state(_shot(sid), tt); from .cameras import lens_ff
        cam_rec = dict(shot=sid, t=tt, cam=[round(v, 3) for v in pos], yaw=round(yaw % 360, 2), pitch=round(pitch, 2), diag=round(diag, 2),
                       lens_ff_mm=round(lens_ff(diag), 1), ratio=S.ratio, script=os.path.basename(sys.argv[sys.argv.index('-P') + 1]) if '-P' in sys.argv else None)
        with open(p[:-4] + '.json', 'w') as fh: json.dump(cam_rec, fh, indent=1)      # the plate's camera, for views.md (views_cams.py)
        print('PLATE CAMERA', json.dumps(cam_rec)); print('PLATE DONE', p); sys.exit(0)
    if has('--panels'):
        from .facts import write_facts
        from . import board as _bd
        from . import reuse as _r
        facts = write_facts(numbered, moves, lines)          # also gives each shot its size for the camera lines
        vd = os.path.join(od, 'storyboard', arg('--version', 'v1')); pd = os.path.join(vd, 'panels'); os.makedirs(pd, exist_ok=True)
        only = [int(x) for x in arg('--only', '').split(',') if x]
        for n, sid, t, cap in numbered:
            if only and n not in only: continue
            still(sid, t, os.path.join(pd, '%02d-shot%s-%05.2f.png' % (n, sid, t)))
        with open(os.path.join(vd, 'panels.json'), 'w') as fh:
            json.dump([dict(n=n, shot=sid, cam=cam(sid).name, t=t, file='panels/%02d-shot%s-%05.2f.png' % (n, sid, t)) for n, sid, t, cap in numbered], fh, indent=1)
        bj = os.path.join(vd, 'board.json'); kitb = _board(numbered, moves, lines, header)
        old_b = None
        if os.path.exists(bj):
            with open(bj) as fh: old_b = json.load(fh)
        if old_b is not None and old_b.get('generated_by') != 'previz kit':
            nb, changed = _bd.refresh_cameras(old_b, kitb)        # a hand-edited board: its words kept, the camera lines from the scene
            print('previz kit: board.json kept (written by hand); %s' % ('camera lines written again from the scene: shots ' + ', '.join(changed) if changed else 'its camera lines already match the scene'))
        else:
            prev = _bd.previous_hand_board(vd)
            if prev:                                           # carry the hand-edited board of the version before forward
                nb, note = _bd.carry(kitb, prev[1], prev[2], numbered, prev[0]); print('previz kit: board.json %s' % note)
            else: nb = kitb
        with open(bj, 'w') as fh: json.dump(nb, fh, indent=1)
        with open(os.path.join(vd, 'built-from.json'), 'w') as fh: json.dump(dict(written=facts['written'], built_from=facts['built_from']), fh, indent=1)
        write_shots_file(); print('PANELS DONE', pd); sys.exit(0)
    if has('--mannequin'):
        md = os.path.join(od, 'check'); tt = float(arg('--mq-time', 0)); _no_markers()
        sc.frame_set(F(tt))          # the pose at --mq-time, never whatever frame the file was on
        keep = set(fig_objects())
        for o in bpy.data.objects:   # the set out of the way (walls would block the full views); its lights stay
            if o.type in ('MESH', 'CURVE') and o not in keep: o.hide_render = True
        cd = _cam_data('mq', 47); c = bpy.data.objects.new('mq', cd); sc.collection.objects.link(c); sc.camera = c
        kd = 0.5341 / math.tan(math.radians(vfov(63) / 2))   # full views keep the whole body in either ratio (1 at 9:16)
        for n in FIGS:
            if fig_tag(FIGS[n]['arm']) != n: continue    # the principals only, not each crowd figure
            arm = FIGS[n]['arm']; fac = facing_now(arm, tt)
            for view, ang, dist, diag, up in (('cu-34', -40, 0.7, 47, 0.11), ('cu-front', 0, 0.7, 47, 0.11), ('cu-side', -90, 0.7, 47, 0.11), ('full-34', -35, 3.0 * kd, 63, -0.62), ('full-back', 180, 3.0 * kd, 63, -0.62)):
                hp = head_world(arm, tt, up=up); a = fac + ang
                pos = Vector((hp.x + dist * math.cos(math.radians(a)), hp.y + dist * math.sin(math.radians(a)), hp.z + 0.05)); yaw, pitch = frame_on(pos, hp, diag)
                cd.lens = lens_mm(diag); c.location = pos; c.rotation_euler = (math.radians(90 + pitch), 0, math.radians(yaw - 90))
                sc.frame_set(F(tt)); sc.render.filepath = os.path.join(md, 'mq-%s-%s.png' % (n, view)); bpy.ops.render.render(write_still=True)
        clear_probes(); print('MANNEQUIN DONE %s (at %.2f s)' % (md, tt)); sys.exit(0)
    blend = os.path.join(od, '%s-previz.blend' % G)
    if has('--check'):
        from .facts import write_facts, warn_lines
        _in_frame_check()
        f_ = write_facts(numbered, moves, lines)
        wl = warn_lines(f_)
        for l in wl: print('previz kit: WARN', l)
        print('SIGHT CHECK', 'ok' if not wl else '%d warning(s): fix them, or say in the scene file why the shot wants it' % len(wl))
        cd_ = os.path.join(od, 'check'); only = [x for x in arg('--shots', '').split(',') if x]
        for j, (lab, i, t0, t1) in enumerate(PLAN, 1):
            if only and lab not in only and str(j) not in only: continue
            for tt in (t0 + 0.1, (t0 + t1) / 2, t1 - 0.1): still(SHOTS[i]['obj'], tt, os.path.join(cd_, 'shot%02d-%s-%05.2f.png' % (j, lab, tt)))
        bpy.ops.wm.save_as_mainfile(filepath=blend); print('CHECK DONE', cd_); sys.exit(0)
    from .facts import write_facts
    facts = write_facts(numbered, moves, lines)
    take = 1
    while os.path.exists(os.path.join(od, '%s-previz-take-%d.mp4' % (G, take))): take += 1
    fd = os.path.join(od, 'frames-take-%d' % take); os.makedirs(fd, exist_ok=True)
    sc.render.filepath = os.path.join(fd, 'f'); sc.render.image_settings.file_format = 'PNG'
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.render.render(animation=True)
    mp4 = os.path.join(od, '%s-previz-take-%d.mp4' % (G, take))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(S.fps), '-i', os.path.join(fd, 'f%04d.png'), '-c:v', 'libx264', '-crf', '18',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], check=True)
    data = dict(generation=G, block=G, title=S.title, take=take, fps=S.fps, frames=S.nf, duration=S.dur, ratio=S.ratio,
                res=[sc.render.resolution_x, sc.render.resolution_y], grey=has('--grey'),
                shots=[shot_record(lab, i, t0, t1) for lab, i, t0, t1 in PLAN],
                shot_plan=[dict(label=lab, cam=SHOTS[i]['obj'].name, t0=t0, t1=t1) for lab, i, t0, t1 in PLAN],
                moves=moves, lines=lines, script=os.path.abspath(sys.argv[sys.argv.index('-P') + 1]) if '-P' in sys.argv else None,
                built_from=facts['built_from'])
    data.update(extra or {})
    with open(mp4[:-4] + '.json', 'w') as fh: json.dump(data, fh, indent=1)
    write_shots_file(); print('WROTE', mp4)
