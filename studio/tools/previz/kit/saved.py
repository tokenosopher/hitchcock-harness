"""What the kit needs to save a built scene to a .blend and pick it up again: the kit's own Python registries (figures, the
room, lights, props, shots) written as JSON into the file, the stamps that say what a saved file was built from, and a lock
so two runs never build the same file at once. Used by shared.py (a location's shared file) and reuse.py (a scene's own
built file)."""
import bpy, fcntl, hashlib, json, os, sys, time
from contextlib import contextmanager
from mathutils import Vector, Matrix, Euler

KIT_DIR = os.path.dirname(os.path.abspath(__file__))
# bpy.data collections by ID type, for references to Blender data inside the registries
COLL = {'OBJECT': 'objects', 'MATERIAL': 'materials', 'LIGHT': 'lights', 'CAMERA': 'cameras', 'WORLD': 'worlds', 'SCENE': 'scenes',
        'MESH': 'meshes', 'ARMATURE': 'armatures', 'CURVE': 'curves', 'NODETREE': 'node_groups', 'TEXT': 'texts', 'ACTION': 'actions'}


class NotSaveable(Exception):
    pass


DROPPED = []           # registry entries whose Blender data a script deleted (a shared script removing room objects)


def enc(v):
    """a registry value as JSON: Blender data by name, vectors and matrices as lists, tuples and non-string keys kept.
    Blender data the script deleted after it was registered (a room object a shared script removed) is saved as None and
    noted in DROPPED: the saved build no longer has it, and nothing can ask for it"""
    if v is None or isinstance(v, (bool, int, float, str)): return v
    if isinstance(v, bpy.types.ID):
        try:
            v.name
        except ReferenceError:
            DROPPED.append(v.__class__.__name__); return None
        c = COLL.get(v.id_type)
        if c is None: raise NotSaveable('a %s datablock (%s)' % (v.id_type, v.name))
        return {'__id__': [c, v.name]}
    if isinstance(v, Vector): return {'__v__': list(v)}
    if isinstance(v, Euler): return {'__e__': list(v), 'order': v.order}
    if isinstance(v, Matrix): return {'__m__': [list(r) for r in v]}
    if isinstance(v, tuple): return {'__t__': [enc(x) for x in v]}
    if isinstance(v, list): return [enc(x) for x in v]
    if isinstance(v, dict):
        if all(isinstance(k, str) and not k.startswith('__') for k in v): return {k: enc(x) for k, x in v.items()}
        return {'__d__': [[enc(k), enc(x)] for k, x in v.items()]}
    if hasattr(v, '__float__') and not callable(v): return float(v)
    raise NotSaveable('%s %r' % (type(v).__name__, v))


def dec(v):
    if isinstance(v, list): return [dec(x) for x in v]
    if not isinstance(v, dict): return v
    if '__id__' in v:
        c, n = v['__id__']; col = getattr(bpy.data, c)
        if n not in col: raise KeyError('the saved file has no %s %r' % (c, n))
        return col[n]
    if '__v__' in v: return Vector(v['__v__'])
    if '__e__' in v: return Euler(v['__e__'], v.get('order', 'XYZ'))
    if '__m__' in v: return Matrix(v['__m__'])
    if '__t__' in v: return tuple(dec(x) for x in v['__t__'])
    if '__d__' in v: return {_key(dec(k)): dec(x) for k, x in v['__d__']}
    return {k: dec(x) for k, x in v.items()}


def _key(k): return tuple(k) if isinstance(k, list) else k


def put_text(name, data):
    """JSON into a text datablock of the current file (it is saved with it)"""
    t = bpy.data.texts.get(name) or bpy.data.texts.new(name); t.clear(); t.write(json.dumps(data)); return t


def get_text(name):
    t = bpy.data.texts.get(name)
    return json.loads(t.as_string()) if t else None


# ---------------------------------------------------------------- stamps: what a saved file was built from
def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''): h.update(b)
    return h.hexdigest()[:16]


def file_hashes(paths):
    out = {}
    for p in sorted(set(os.path.abspath(p) for p in paths)):
        out[p] = sha(p) if os.path.isfile(p) else 'missing'
    return out


def kit_files(names=None):
    """the kit's own source files (all of them unless names)"""
    fs = sorted(f for f in os.listdir(KIT_DIR) if f.endswith('.py'))
    return [os.path.join(KIT_DIR, f) for f in fs if names is None or f in names]


def stamp_of(inputs, extra):
    """one short hash over the input files' hashes and the extra settings"""
    h = hashlib.sha256(json.dumps([sorted(inputs.items()), extra], sort_keys=True).encode()); return h.hexdigest()[:16]


def what_changed(old, new):
    """plain words for why a saved stamp no longer matches"""
    if not old: return 'never built'
    out = []
    oi, ni = old.get('inputs', {}), new.get('inputs', {})
    for p in sorted(set(oi) | set(ni)):
        if oi.get(p) != ni.get(p):
            out.append('%s %s' % (os.path.basename(p), 'is new' if p not in oi else 'is gone' if p not in ni else 'changed'))
    for k in sorted(set(old.get('extra', {})) | set(new.get('extra', {}))):
        if old.get('extra', {}).get(k) != new.get('extra', {}).get(k): out.append('%s changed' % k)
    return ', '.join(out) or 'stamp differs'


def read_json(p):
    try:
        with open(p) as fh: return json.load(fh)
    except (OSError, ValueError):
        return None


def write_json(p, d):
    tmp = p + '.tmp%d' % os.getpid()
    with open(tmp, 'w') as fh: json.dump(d, fh, indent=1)
    os.replace(tmp, p)


@contextmanager
def lock(path, what):
    """an exclusive lock (flock on path); says so when it has to wait"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fh = open(path, 'w'); t0 = time.time()
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('previz kit: another run is building %s; waiting for it' % what, flush=True)
        fcntl.flock(fh, fcntl.LOCK_EX)
        print('previz kit: waited %.1f s for %s' % (time.time() - t0, what), flush=True)
    try:
        yield
    finally:
        fcntl.flock(fh, fcntl.LOCK_UN); fh.close()


def save_copy(path):
    """the current file saved to path (written beside it, then moved into place, so a reader never sees half a file)"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path[:-6] + '.tmp%d.blend' % os.getpid()
    bpy.ops.wm.save_as_mainfile(filepath=tmp, copy=True, compress=False, check_existing=False)
    os.replace(tmp, path)


def open_file(path):
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False)


def blender_version(): return bpy.app.version_string
