"""A scene's own built state, reused between its runs (setup(..., reuse=True)).

A scene makes 30 to 45 Blender runs (--check, --project, --panels, --plate, --mannequin, takes). Most of them start from the
same built scene: only the mode differs. With reuse=True the first run saves the scene as its script built it, just before
the mode's work, to <film>/previz/<G>/built/<G>-built.blend, with a stamp (<G>-built.blend.json) of everything it was built
from: the script itself, every file the script and the kit read while building (the room plan, the people file, scene files,
helper modules), the location's shared file stamp, film.json, the kit's code, the Blender version and the build flags
(--film, --exposure). A later run whose stamp still matches opens that file and does only its own mode's work; any change to
any of those (one number in the script) and the run builds again and saves the new state. The build's printed lines are
printed again on a reused run, so checks the script prints still show.

What reuse asks of a script (old scripts without reuse=True run exactly as before):
- everything a run's mode needs goes through run(): no mode of the script's own (an unknown flag such as --stills turns
  reuse off for that run), no changes to the kit's functions, nothing after run();
- the building must not depend on the mode or on --res, --samples, --grey (the kit applies those after the saved point);
- points for --project as world points or specs: ('bone', 'ANNA', 'hand.R'), ('tail', 'ANNA', 'hand.R'),
  ('eyes', 'ANNA'), ('head', 'ANNA'), ('prop', 'LANTERN'). A function (lambda t: ...) still works, but then a --project
  run builds the scene again (a function cannot be saved).
PREVIZ_NO_REUSE=1 in the environment builds every time."""
import bpy, builtins, os, sys, time
from .core import S, MATS, ARGV, has, scene_settings
from . import saved

TEXT = 'previz-reuse'
MODE_FLAGS = {'--check': 0, '--shots': 1, '--panels': 0, '--version': 1, '--only': 1, '--panel-start': 1, '--panel-times': 1,
              '--project': 2, '--plate': 2, '--mannequin': 0, '--mq-time': 1, '--shots-file': 0, '--build': 0, '--grey': 0,
              '--res': 1, '--samples': 1}
BUILD_FLAGS = {'--film': 1, '--exposure': 1}
REC = None
_open = builtins.open


def _split_argv():
    """(the build flags with their values, the flags the kit does not know)"""
    build, unknown = [], []; i = 0
    while i < len(ARGV):
        a = ARGV[i]
        if a in MODE_FLAGS: i += 1 + MODE_FLAGS[a]; continue
        if a in BUILD_FLAGS: build += ARGV[i:i + 1 + BUILD_FLAGS[a]]; i += 1 + BUILD_FLAGS[a]; continue
        unknown.append(a); i += 1
    return build, unknown


def script_path():
    return os.path.abspath(sys.argv[sys.argv.index('-P') + 1]) if '-P' in sys.argv else None


def paths():
    b = os.path.join(S.outdir, 'built', '%s-built.blend' % S.gen); return b, b + '.json'


def _stamp(files, locations, flags):
    from . import shared
    fs = set(files) | set(saved.kit_files()) | {S.film.config_path}
    sp = script_path()
    if sp: fs.add(sp)
    inputs = saved.file_hashes(fs)
    extra = dict(flags=flags, blender=saved.blender_version(), ops_prims=os.environ.get('PREVIZ_OPS_PRIMS') == '1',
                 shared={lid: shared.stamp(lid)['stamp'] for lid in locations})
    return dict(inputs=inputs, extra=extra, stamp=saved.stamp_of(inputs, extra))


class _Tee(object):
    def __init__(self, out): self.out = out; self.buf = []
    def write(self, s): self.buf.append(s); return self.out.write(s)
    def flush(self): self.out.flush()
    def __getattr__(self, k): return getattr(self.out, k)


def _rec_open(file, mode='r', *a, **k):
    try:
        if REC is not None and isinstance(file, (str, bytes, os.PathLike)) and not any(c in mode for c in 'wax+'):
            REC['read'].add(os.path.abspath(os.fsdecode(file)))
    except Exception:
        pass
    return _open(file, mode, *a, **k)


def begin():
    """called by setup(reuse=True): reuse the saved build when it is still good (and exit after the mode), else record this build"""
    global REC
    if os.environ.get('PREVIZ_NO_REUSE') == '1':
        print('previz kit: reuse off (PREVIZ_NO_REUSE=1): building'); return
    flags, unknown = _split_argv()
    if unknown:
        print('previz kit: reuse off for this run: the kit does not know %s (the script may act on it): building' % ' '.join(unknown)); return
    bp, jp = paths(); old = saved.read_json(jp)
    if old and os.path.exists(bp):
        new = _stamp(old.get('inputs', {}).keys(), old.get('locations', []), flags)
        if new['stamp'] != old.get('stamp'):
            print('previz kit: the saved build of %s is out of date (%s): building' % (S.gen, saved.what_changed(old, new)))
        elif has('--project') and old.get('callables'):
            print('previz kit: the saved build of %s is good, but --project asks for points given as functions (%s), which cannot '
                  'be saved: building' % (S.gen, ', '.join(old['callables'])))
        else:
            _replay(bp, old)          # exits
    else:
        print('previz kit: no saved build of %s yet: building' % S.gen)
    REC = dict(t0=time.time(), read=set(), flags=flags, tee=_Tee(sys.stdout), stdout=sys.stdout)
    builtins.open = _rec_open; sys.stdout = REC['tee']; S.reuse = REC


def _stop():
    global REC
    r = REC; REC = None
    if r is None: return None
    builtins.open = _open; sys.stdout = r['stdout']; S.reuse = None
    return r


def _point_spec(v):
    return isinstance(v, (tuple, list)) and v and isinstance(v[0], str)


def save(kwargs):
    """called by run() at the saved point: the scene as built, its registries and run()'s arguments, with the stamp"""
    from .figures import FIGS
    from .lights import LIGHTS
    from .props import PROPS
    from .cameras import SHOTS, PLAN
    from . import shared
    r = _stop()
    if r is None: return
    t_build = time.time() - r['t0']; t0 = time.time()
    try:
        files = set(p for p in r['read'] if os.path.isfile(p))
        roots = [S.film_dir, os.path.dirname(script_path() or S.film_dir)]
        for m in list(sys.modules.values()):          # helper modules a script imports from the film or beside itself
            f = getattr(m, '__file__', None)
            if f and f.endswith('.py') and any(os.path.abspath(f).startswith(os.path.abspath(x) + os.sep) for x in roots): files.add(os.path.abspath(f))
        bp, jp = paths(); outd = os.path.abspath(S.outdir) + os.sep
        files = set(p for p in files if not p.startswith(outd) and not p.endswith('.blend.lock'))
        locations = [S.location['lid']] if S.location else []
        st = _stamp(files, locations, r['flags'])
        kw = dict(kwargs); pts = dict(kw.get('points') or {}); callables = sorted(k for k, v in pts.items() if callable(v))
        kw['points'] = {k: v for k, v in pts.items() if not callable(v)}
        out = ''.join(r['tee'].buf).splitlines()
        state = dict(figs=saved.enc(dict(FIGS)), lights=saved.enc(dict(LIGHTS)), props=saved.enc(dict(PROPS)),
                     room=shared._enc_room(S.room) if S.room is not None else None, shots=saved.enc(list(SHOTS)), plan=saved.enc(list(PLAN)),
                     kwargs=saved.enc(kw), out=out, location=S.location, built=time.strftime('%H:%M:%S'), build_s=round(t_build, 2))
        saved.put_text(TEXT, state)
        try:
            saved.save_copy(bp)
        finally:
            bpy.data.texts.remove(bpy.data.texts[TEXT])
        saved.write_json(jp, dict(st, locations=locations, callables=callables, built=state['built'], build_s=round(t_build, 2),
                                  save_s=round(time.time() - t0, 2)))
        print('previz kit: built scene saved for reuse (built in %.1f s, saved in %.1f s) -> %s' % (t_build, time.time() - t0, bp), flush=True)
    except saved.NotSaveable as e:
        print('previz kit: the built scene cannot be saved for reuse (run() was given %s); every run builds' % e)


def _replay(bp, old):
    from .figures import FIGS
    from .lights import LIGHTS
    from .props import PROPS
    from .cameras import SHOTS, PLAN
    from .rooms import ROOMS
    from . import shared
    t0 = time.time(); saved.open_file(bp); scene_settings(fresh=False)
    state = saved.get_text(TEXT); bpy.data.texts.remove(bpy.data.texts[TEXT])
    MATS.clear(); MATS.update({m.name: m for m in bpy.data.materials})
    FIGS.clear(); FIGS.update(saved.dec(state['figs'])); LIGHTS.clear(); LIGHTS.update(saved.dec(state['lights']))
    PROPS.clear(); PROPS.update(saved.dec(state['props']))
    ROOMS.clear(); S.room = None
    if state.get('room'):
        R = shared._dec_room(state['room']); ROOMS[R.name] = R; S.room = R
    SHOTS[:] = saved.dec(state['shots']); PLAN[:] = saved.dec(state['plan']); S.location = state.get('location')
    print('previz kit: reused the saved build of %s (built %s in %.1f s; opened in %.2f s): nothing it was built from has changed' % (
        S.gen, state.get('built'), state.get('build_s', 0), time.time() - t0), flush=True)
    for l in state.get('out', []):           # the script's own printed checks, as the build printed them (the kit's lines left out)
        if l.strip() and not l.startswith(('previz kit:', 'Info: ')): print('[build %s] %s' % (state.get('built'), l))
    from .output import run
    run(**saved.dec(state['kwargs']))
    sys.exit(0)
