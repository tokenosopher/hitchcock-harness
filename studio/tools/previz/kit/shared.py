"""A location's shared scene, built once and loaded by every scene that plays there.

What the scenes of one location share is described once, in <film>/previz/rooms/<LID>-people.json (or <LID>-people.py, plain
Python that sets PEOPLE to the same dict):

  {"location": "L01",
   "cast":   {"ANNA": {"height": 1.68, "at": [2.0, 1.0], "facing": 90}, ...},
             the principals: built at their heights (else film.json's cast, else 1.70 m) and standing at "at" facing "facing";
             not keyed, so a scene places and poses them as it likes
   "groups": {"CROWD": [{"name": "CROWD01", "at": [x, y], "height": 1.71, "facing": 268, "hands": "side"}, ...],
              "QUEUE": [{"name": "QUEUE01", "at": [1.55, -1.15, 0.3], "height": 1.40, "build": [0.85, 0.85],
                         "facing": 90, "hands": "front"}, ...]},
             crowds and standing groups: each figure keyed standing at frame 1 (stand()); "build" [wide, deep] makes a stand-in
             broader or slighter (its torso and limbs, never a scaled rig); a shot's in_frame names the group's tag (CROWD)
   "props":  [{"name": "LANTERN", "kind": "box", "size": [0.15, 0.15, 0.3], "at": [3.9, 3.26, 0.98], "owner": "BEN"},
              {"name": "CUP", "kind": "cyl", "r": 0.04, "h": 0.1, "at": [...], "rot": [0, 0, 0]},
              {"name": "STAFF", "kind": "rod", "length": 1.85, "r": 0.018, "grip": 0.0, "at": [...]}],
             kinds box (size), cyl (r, h), rod (length, r, grip), blade (length, width, grip, guard); "owner" = the figure that
             holds it (plates hide it with the figures)
   "marks":  {"STAGE_TOP": [0, 0, 0.3], "DOOR": [3.25, 3.35], ...}}     named points, R.marks['DOOR'] in a scene

`R = location('L01')`, right after setup(), gives the scene the room, its lights, every figure and prop of the file (figure('X')
then returns the one already there) and R.marks, R.groups, R.cast. The file previz/rooms/<LID>.blend is built the first time it
is needed and again only when the description, the room plan, film.json or the kit's building code changes (its stamp, in
<LID>.blend.json, holds the hashes); two runs that need it at the same moment build it once (a lock). Build it ahead with
    .venv/bin/python tools/previz/blender_run.py tools/previz/build_location.py -- --film <film> --location L01 [--force]
How a scene takes it: PREVIZ_SHARED_LOAD=open (the default: the file is opened as the scene, the fastest) or append (its objects
appended into the empty scene; measured slower, kept to compare)."""
import bpy, json, math, os, sys, time
from mathutils import Vector
from .core import S, MATS, RESET, scene_settings, F
from . import saved
from .figures import FIGS, figure, stand, clear_probes
from .lights import LIGHTS
from .props import PROPS, prop_box, prop_cyl, rod, blade
from .rooms import ROOMS, Room, room

BUILD_CODE = ('core.py', 'figures.py', 'rooms.py', 'lights.py', 'props.py', 'film.py', 'shared.py', 'saved.py')   # what the file is built with
TEXT = 'previz-shared'


def people_path(lid):
    d = os.path.join(S.film_dir, 'previz', 'rooms')
    for ext in ('.json', '.py'):
        p = os.path.join(d, '%s-people%s' % (lid, ext))
        if os.path.exists(p): return p
    return None


def read_people(lid):
    p = people_path(lid)
    if p is None: return {}, None
    if p.endswith('.json'):
        with open(p) as fh: return json.load(fh), p
    g = {'__file__': p}
    with open(p) as fh: exec(compile(fh.read(), p, 'exec'), g)
    if not isinstance(g.get('PEOPLE'), dict): sys.exit('previz kit: %s must set PEOPLE to a dict' % p)
    return g['PEOPLE'], p


def blend_path(lid): return os.path.join(S.film_dir, 'previz', 'rooms', '%s.blend' % lid)


def stamp(lid):
    """what the shared file of location lid is built from, as {inputs: {file: hash}, extra: {...}, stamp}"""
    plan_ref = S.film.locations.get(lid, {}).get('room')
    files = [S.film.config_path] + saved.kit_files(BUILD_CODE)
    if isinstance(plan_ref, str): files.append(plan_ref if os.path.isabs(plan_ref) else os.path.join(S.film_dir, plan_ref))
    pp = people_path(lid)
    if pp: files.append(pp)
    inputs = saved.file_hashes(files)
    extra = dict(location=lid, blender=saved.blender_version(), ops_prims=os.environ.get('PREVIZ_OPS_PRIMS') == '1')
    return dict(inputs=inputs, extra=extra, stamp=saved.stamp_of(inputs, extra))


def _fresh():
    """an empty file with setup()'s settings and nothing locked (the build stores the room's own exposure)"""
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()
    for fn in RESET: fn()
    keep = S.exposure; S.exposure = None
    scene_settings(fresh=True); S.expo_locked = False; S.exposure = keep


def _build(lid, path, st):
    t0 = time.time(); _fresh()
    P, pp = read_people(lid)
    R = room(lid); t_room = time.time()
    cast = {}
    for n, c in (P.get('cast') or {}).items():
        c = c if isinstance(c, dict) else {'height': c}
        arm, T = figure(n, c.get('height'), build=c.get('build')); cast[arm.name] = FIGS[arm.name]['height']
        if c.get('at') is not None:
            at = list(c['at']) + [0.0] * (3 - len(c['at']))
            arm.location = at; arm.rotation_euler = (0, 0, math.radians(float(c.get('facing', 270)) + 90))
    groups = {}
    for tag, members in (P.get('groups') or {}).items():
        tag = tag.upper(); groups[tag] = []
        for m in members:
            arm, T = figure(m['name'], m.get('height', 1.70), build=m.get('build'))   # broader in its parts, never a scaled rig
            stand((arm, T), 0.0, loc=tuple(m['at']), facing=float(m.get('facing', 270)), hands=m.get('hands', 'side'))
            arm['group'] = tag; arm['fig'] = arm.name; groups[tag].append(arm.name)
    for p in P.get('props') or []:
        n, kind, at = p['name'], p.get('kind', 'box'), tuple(p.get('at', (0, 0, 0)))
        if kind == 'box': o = prop_box(n, tuple(p['size']), at=at)
        elif kind == 'cyl': o = prop_cyl(n, float(p['r']), float(p['h']), at=at)
        elif kind == 'rod': o = rod(n, float(p['length']), r=float(p.get('r', 0.012)), grip=float(p.get('grip', 0.1)), at=at)
        elif kind == 'blade': o = blade(n, **{k: float(p[k]) for k in ('length', 'width', 'grip', 'guard') if k in p}, at=at)
        else: sys.exit('previz kit: %s: unknown prop kind %r (box, cyl, rod, blade)' % (pp, kind))
        if p.get('rot'): o.rotation_euler = [math.radians(a) for a in p['rot']]
        if p.get('owner'): o['fig'] = str(p['owner']).upper()
    marks = {k: list(v) for k, v in (P.get('marks') or {}).items()}
    bpy.context.view_layer.update(); t_people = time.time()
    meta = dict(stamp=st['stamp'], location=lid, room=_enc_room(R), figs=saved.enc(dict(FIGS)), lights=saved.enc(dict(LIGHTS)),
                props=saved.enc(dict(PROPS)), groups=groups, cast=cast, marks=marks, exposure=S.sc.view_settings.exposure,
                volumetric_end=getattr(S.sc.eevee, 'volumetric_end', None), built=time.strftime('%Y-%m-%d %H:%M:%S'))
    clear_probes(); saved.put_text(TEXT, meta)
    saved.save_copy(path); t_save = time.time()
    saved.write_json(path + '.json', dict(st, built=meta['built'], seconds=dict(room=round(t_room - t0, 2), people=round(t_people - t_room, 2),
                                                                                save=round(t_save - t_people, 2))))
    print('previz kit: %s shared file built in %.1f s (room %.1f, people %.1f, save %.1f): %d principals, %s, %d props -> %s' % (
        lid, t_save - t0, t_room - t0, t_people - t_room, t_save - t_people, len(cast),
        ', '.join('%s %d' % (g, len(v)) for g, v in groups.items()) or 'no groups', len(P.get('props') or []), path), flush=True)


def _enc_room(R):
    return dict(attrs=saved.enc(dict(R.__dict__)), items=saved.enc(dict(R)))


def _dec_room(d):
    R = Room.__new__(Room); dict.__init__(R, saved.dec(d['items']))
    for k, v in saved.dec(d['attrs']).items(): setattr(R, k, v)
    return R


def ensure(lid, force=False):
    """the shared file of lid, built if it is missing or stale (once, under a lock). Returns (path, stamp, built_now)"""
    path = blend_path(lid); st = stamp(lid)
    def fresh():
        old = saved.read_json(path + '.json')
        return (not force) and os.path.exists(path) and old and old.get('stamp') == st['stamp'], old
    ok, old = fresh()
    if ok: return path, st, False
    with saved.lock(path + '.lock', 'the %s shared file' % lid):
        ok, old2 = fresh()
        if ok:
            print('previz kit: %s shared file was built by another run while this one waited' % lid); return path, st, False
        why = 'rebuild asked' if force else saved.what_changed(old2 or old, st)
        print('previz kit: %s shared file %s (%s): building it once' % (lid, 'missing' if not os.path.exists(path) else 'out of date', why), flush=True)
        _build(lid, path, st)
    return path, st, True


def location(lid, load=None):
    """the location's shared scene (the room, its lights, its people, its props, its marks) loaded into this scene, built first
    if needed. Call it right after setup(), in place of room(lid). Returns the Room with .marks, .groups, .cast."""
    if S.sc is None: sys.exit('previz kit: setup() before location()')
    if len(bpy.data.objects): sys.exit('previz kit: location() must come right after setup(), before anything is built (it replaces the scene)')
    path, st, built = ensure(lid)
    mode = load or os.environ.get('PREVIZ_SHARED_LOAD', 'open'); t0 = time.time()
    if mode == 'append': meta = _append(path)
    else:
        saved.open_file(path); meta = saved.get_text(TEXT)
    sc = scene_settings(fresh=False)
    if mode == 'append':        # the scene's own settings did not come with the objects
        if not S.expo_locked: sc.view_settings.exposure = meta.get('exposure', 0.0)
        if meta.get('volumetric_end') is not None:
            try: sc.eevee.volumetric_end = meta['volumetric_end']
            except Exception: pass
    R = restore(meta)
    S.location = dict(lid=lid, path=path, stamp=st['stamp'], built=built, mode=mode)
    print('previz kit: %s shared file %s (%s, %.2f s): room %s, %d principals, %s, %d props' % (
        lid, 'loaded' if not built else 'built and loaded', mode, time.time() - t0, R.name, len(R.cast),
        ', '.join('%s %d' % (g, len(v)) for g, v in R.groups.items()) or 'no groups', len(PROPS)), flush=True)
    return R


def _append(path):
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects); dst.texts = [TEXT]; dst.worlds = list(src.worlds)
    sc = bpy.context.scene
    for o in dst.objects:
        if o is not None: sc.collection.objects.link(o)
    if dst.worlds: sc.world = dst.worlds[0]
    t = dst.texts[0]; meta = json.loads(t.as_string()); return meta


def restore(meta):
    """the kit's registries from a shared file's record (after it was opened or appended)"""
    MATS.clear(); MATS.update({m.name: m for m in bpy.data.materials})
    FIGS.clear(); FIGS.update(saved.dec(meta['figs'])); LIGHTS.clear(); LIGHTS.update(saved.dec(meta['lights']))
    PROPS.clear(); PROPS.update(saved.dec(meta['props']))
    R = _dec_room(meta['room']); ROOMS.clear(); ROOMS[R.name] = R; S.room = R
    R.marks = {k: Vector(v + [0.0] * (3 - len(v))) for k, v in meta.get('marks', {}).items()}
    R.groups = dict(meta.get('groups', {})); R.cast = dict(meta.get('cast', {}))
    return R
