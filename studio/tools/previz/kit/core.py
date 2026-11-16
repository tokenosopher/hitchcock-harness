"""Core of the previz kit: command line, setup, materials, geometry primitives, keyers, haze, grey mode.
Units: metres, seconds, degrees, +Z up. Compass: 0 = east (+X), 90 = north (+Y). The low-level keyers (k, pose_bone, tgt,
place) take FRAMES (write F(t)); every other helper takes SECONDS."""
import bpy, bmesh, math, os, sys, json
from types import SimpleNamespace
from mathutils import Vector, Matrix, Euler
from .film import Film

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None):
    """the value after flag k on the command line (after --), else d"""
    return ARGV[ARGV.index(k) + 1] if k in ARGV and ARGV.index(k) + 1 < len(ARGV) else d
def has(k): return k in ARGV

S = SimpleNamespace(sc=None, gen=None, title=None, dur=0.0, nf=0, film=None, film_dir=None, outdir=None, fps=24, res=540,
                    samples=16, ratio='9:16', aspect=(9, 16), expo_locked=False, room=None, exposure=None, reuse=None, location=None)
MATS = {}
RESET = []            # registries of the other modules clear themselves through these on setup()
def F(t): return int(round(t * S.fps)) + 1        # seconds -> frame (frame 1 = 0.0 s)
def sec(f): return (f - 1) / float(S.fps)         # frame -> seconds
def V(*a): return Vector(a)

# ================================================================ setup
def setup(gen, duration, title=None, exposure=None, reuse=False):
    """A fresh scene for generation `gen` (the folder name: S1, G03, ...), `duration` s long. Reads the film config
    (--film <folder> is required), sets EEVEE + AgX, the film's ratio at --res (short side, default the film's res),
    --samples (default 16), the film's fps, volumetrics, a black world. Output goes to <film>/previz/<gen>/.
    title: the generation's title for the board header. exposure: this script's choice (else the room's; --exposure beats both).
    reuse=True: when nothing this script builds from has changed since its last run (the script, the files it read, the
    location's shared file, the kit), the run opens the scene as that run built it and does only its own mode's work, without
    running the rest of the script (reuse.py says what that asks of a script)."""
    if bpy.app.background and not os.environ.get('PREVIZ_SLOT'):
        sys.exit('previz kit: run Blender only through the slot wrapper (eight renders at once):\n'
                 '    .venv/bin/python tools/previz/blender_run.py <script>.py -- --film <film> [flags]')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    for fn in RESET: fn()
    fd = arg('--film')
    if not fd: sys.exit('previz kit: --film <film folder> is required')
    S.film = Film(fd); S.film_dir = S.film.folder; S.gen = str(gen); S.title = title
    S.fps = S.film.fps; S.ratio = S.film.ratio; S.aspect = S.film.aspect
    S.dur = float(duration); S.nf = int(round(S.dur * S.fps))
    S.res = int(arg('--res', S.film.res)); S.samples = int(arg('--samples', 16)); S.room = None; S.exposure = exposure
    S.reuse = None; S.location = None
    S.outdir = os.path.join(S.film_dir, 'previz', S.gen); os.makedirs(S.outdir, exist_ok=True)
    scene_settings(fresh=True)
    w, h = S.film.size(S.res)
    print('previz kit: %s  %s %s  %dx%d  %d fps  %.2f s' % (S.film.title, S.gen, S.ratio, w, h, S.fps, S.dur))
    if reuse:
        from . import reuse as _reuse
        _reuse.begin()          # opens the saved build, does this run's mode and exits, when the build is still good
    return S
def scene_settings(fresh=False):
    """setup()'s render settings on the current scene: fresh=True on a new empty file (a black world, the exposure set),
    False after a saved file was opened (the file's world and the room's exposure kept unless the exposure is locked)"""
    sc = S.sc = bpy.context.scene
    sc.render.fps = S.fps; sc.frame_start = 1; sc.frame_end = max(1, S.nf)
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: sc.render.engine = eng; break
        except Exception: pass
    w, h = S.film.size(S.res); sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    try: sc.eevee.taa_render_samples = S.samples
    except Exception: pass
    for k_, v_ in (('use_shadows', True), ('use_volumetric_shadows', True), ('volumetric_tile_size', '4'), ('volumetric_samples', 48)):
        try: setattr(sc.eevee, k_, v_)
        except Exception: pass
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    e = arg('--exposure'); S.expo_locked = e is not None or S.exposure is not None
    if fresh or S.expo_locked:
        sc.view_settings.exposure = float(e) if e is not None else (S.exposure if S.exposure is not None else 0.0)
    if fresh:
        wd = bpy.data.worlds.new('world'); sc.world = wd; wd.use_nodes = True
        wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    return sc
def set_exposure(v):
    """the room's/scene's default exposure (ignored when --exposure or setup(exposure=) set it)"""
    if not S.expo_locked: S.sc.view_settings.exposure = v
def world(rgb=(0, 0, 0), strength=1.0):
    bg = S.sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*rgb, 1); bg.inputs['Strength'].default_value = strength
def haze(density, rgb=(1, 1, 1), anisotropy=0.0, end=None):
    """world volume scatter (the haze that shows light shafts); end = how far it reaches (m)"""
    nt = S.sc.world.node_tree; vs = nt.nodes.get('haze') or nt.nodes.new('ShaderNodeVolumeScatter'); vs.name = 'haze'
    vs.inputs['Density'].default_value = density; vs.inputs['Color'].default_value = (*rgb, 1)
    try: vs.inputs['Anisotropy'].default_value = anisotropy
    except Exception: pass
    nt.links.new(vs.outputs[0], nt.nodes['World Output'].inputs['Volume'])
    if end:
        try: S.sc.eevee.volumetric_end = end
        except Exception: pass
    return vs
def haze_to_box(lo, hi, gain=1.5):
    """move the world haze into a box volume lo..hi. Needed before any object volume (smoke): in Blender 5.2 EEVEE a world
    volume makes object volumes invisible."""
    wn = S.sc.world.node_tree; hz = wn.nodes.get('haze')
    if hz is None or not wn.nodes['World Output'].inputs['Volume'].links: return None
    for l in list(wn.nodes['World Output'].inputs['Volume'].links): wn.links.remove(l)
    m = bpy.data.materials.new('haze-box'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial')
    vs = nt.nodes.new('ShaderNodeVolumeScatter')
    for k_ in ('Density', 'Color', 'Anisotropy'):
        try: vs.inputs[k_].default_value = hz.inputs[k_].default_value
        except Exception: pass
    vs.inputs['Density'].default_value *= gain; nt.links.new(vs.outputs[0], out.inputs['Volume'])
    lo, hi = Vector(lo), Vector(hi); return box('haze-box', (lo + hi) / 2, tuple(hi - lo), m)

# ================================================================ materials (everything grey; glows keep their light)
GREYS = {'floor': 0.16, 'wall': 0.30, 'ceiling': 0.22, 'furniture': 0.24, 'prop': 0.20, 'figure': 0.42}
def mat(name, rgb=(0.25, 0.25, 0.25), rough=0.6, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    """cached Principled material (same name -> same material)"""
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
    MATS[name] = m; return m
def grey(kind='prop', alpha=1.0, rough=None):
    """the kit's plain grey for a class of surface: floor wall ceiling furniture prop figure. rough: its roughness
    (default 0.75, matte; a polished floor 0.3) - the sheen is part of the lighting, so it stays in --grey"""
    g = GREYS.get(kind, 0.25); r = 0.75 if rough is None else float(rough)
    return mat('grey-%s%s%s' % (kind, '' if alpha >= 1 else '-a%.2f' % alpha, '' if rough is None else '-r%.2f' % r), (g, g, g), r, alpha=alpha)
def glow_mat(name, strength, rgb=(1, 1, 1)):
    """an emissive surface (screens, flames, glowing cores): keys with key_glow(name, t, strength)"""
    return mat(name, (0.02, 0.02, 0.02), 0.5, emit=rgb, strength=strength)
def bsdf(m): return m.node_tree.nodes['Principled BSDF']
def setmat(o, m):
    o.data.materials.clear(); o.data.materials.append(m)

# ================================================================ geometry
def act(): return bpy.context.active_object
def box(name, loc, size, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = act(); o.name = name
    o.scale = size; bpy.ops.object.transform_apply(scale=True); setmat(o, m); return o
# cyl, ell and seg make the mannequins (about 64 parts a figure). Through bpy.ops the cost grows with every object already
# in the scene (a figure about 7 s, a crowd of forty about ten minutes, on every run), so they build the same primitive straight into a mesh (the bmesh operators the bpy.ops ones call), which costs
# milliseconds and does not grow with the scene. PREVIZ_OPS_PRIMS=1 in the environment goes back to the old way.
OPS_PRIMS = os.environ.get('PREVIZ_OPS_PRIMS') == '1'
def _mesh_obj(name, bm, loc, rot, m, smooth):
    bm.normal_update(); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update(); me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot; bpy.context.view_layer.objects.active = o; return o
def cyl(name, loc, r, h, m, rot=(0, 0, 0), v=24):
    if OPS_PRIMS:
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=h, location=loc, rotation=rot); o = act(); o.name = name; setmat(o, m); return o
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=v, radius1=r, radius2=r, depth=h, calc_uvs=True)
    return _mesh_obj(name, bm, loc, rot, m, False)
def ell(name, loc, radii, m, seg_=20):
    if OPS_PRIMS:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg_, ring_count=seg_ // 2, radius=1, location=loc); o = act(); o.name = name
        o.scale = radii; bpy.ops.object.transform_apply(scale=True); setmat(o, m); bpy.ops.object.shade_smooth(); return o
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg_, v_segments=seg_ // 2, radius=1, calc_uvs=True)
    # as the old transform_apply left it: scale and place baked into the mesh, the object's origin at the world origin
    L = Vector(loc)
    for v_ in bm.verts: v_.co = Vector((v_.co.x * radii[0], v_.co.y * radii[1], v_.co.z * radii[2])) + L
    return _mesh_obj(name, bm, (0, 0, 0), (0, 0, 0), m, True)
def seg(name, a, b, r, m, v=16):
    """a cylinder from point a to point b"""
    a, b = Vector(a), Vector(b); d = b - a
    if OPS_PRIMS:
        o = cyl(name, (a + b) / 2, r, d.length, m, v=v)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bpy.ops.object.transform_apply(rotation=True); bpy.ops.object.shade_smooth(); o.rotation_mode = 'XYZ'; return o
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=v, radius1=r, radius2=r, depth=d.length, calc_uvs=True)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(a + b) / 2)
    return _mesh_obj(name, bm, (0, 0, 0), (0, 0, 0), m, True)
def torus(name, loc, R, r, m, rot=(0, 0, 0), seg_=48):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg_, minor_segments=10, location=loc, rotation=rot)
    o = act(); o.name = name; setmat(o, m); bpy.ops.object.shade_smooth(); return o
def curve(name, pts, r, m, kind='POLY', res=12):
    """a tube through pts (POLY straight segments, NURBS smooth)"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new(kind); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    if kind == 'NURBS': sp.order_u = min(4, len(pts)); sp.use_endpoint_u = True; sp.resolution_u = res
    o = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o
def empty(name, loc=(0, 0, 0), parent=None, size=0.05):
    o = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(o); o.location = loc; o.empty_display_size = size
    if parent: o.parent = parent
    return o
def noshadow(o):
    try: o.visible_shadow = False
    except Exception: pass
def compass(v):
    """compass angle (deg, 0 = east, 90 = north) of a horizontal direction"""
    return math.degrees(math.atan2(v[1], v[0])) % 360.0
def heading(deg):
    """unit vector of a compass angle"""
    return Vector((math.cos(math.radians(deg)), math.sin(math.radians(deg)), 0.0))
def ring(center, ang, dist, dz=0.0):
    """a point at compass angle ang and distance dist from center, dz higher"""
    return Vector((center[0] + dist * math.cos(math.radians(ang)), center[1] + dist * math.sin(math.radians(ang)), center[2] + dz))

# ================================================================ keying (Blender 5 slotted actions; interpolation set on the keys)
def fcurves(idb):
    """every F-curve animating an ID (object, light data, material node tree, scene)"""
    ad = getattr(idb, 'animation_data', None)
    if not ad or not ad.action: return []
    a = ad.action
    try: return list(a.fcurves)
    except AttributeError: pass
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(a, ad.action_slot)
        if cb: return list(cb.fcurves)
    except Exception: pass
    out = []
    for layer in a.layers:
        for strip in layer.strips:
            for cb in strip.channelbags: out += list(cb.fcurves)
    return out
def fcurve(idb, path, idx=0):
    for fc in fcurves(idb):
        if fc.data_path == path and fc.array_index == idx: return fc
def set_interp(idb, kind='CONSTANT', path=None, t0=None, t1=None):
    """set the interpolation of existing keys of idb ('CONSTANT', 'LINEAR', 'BEZIER'), optionally only on data paths starting
    with path and between t0 and t1 s. (Blender 5.2 in the background ignores the 'new key' preference: set it on the keys.)"""
    lo = F(t0) - 1e-6 if t0 is not None else -1e9; hi = F(t1) + 1e-6 if t1 is not None else 1e9
    for fc in fcurves(idb):
        if path and not fc.data_path.startswith(path): continue
        for kp in fc.keyframe_points:
            if lo <= kp.co.x <= hi: kp.interpolation = kind
def _interp_at(idb, path, f, kind, idx=-1):
    if not kind: return
    for fc in fcurves(idb):
        if fc.data_path == path and (idx < 0 or fc.array_index == idx):
            for kp in fc.keyframe_points:
                if abs(kp.co.x - f) < 0.5: kp.interpolation = kind
def k(o, path, f, v, idx=-1, interp=None):
    """set and key o.<path> (or one index of it) at FRAME f; interp = 'CONSTANT'|'LINEAR' for this key"""
    setattr(o, path, v) if idx < 0 else getattr(o, path).__setitem__(idx, v)
    o.keyframe_insert(path, frame=f, index=idx); _interp_at(o, path, f, interp, idx)
def key_energy(lo, t, w, interp=None):
    """key a light object's power (W) at t s"""
    lo.data.energy = w; lo.data.keyframe_insert('energy', frame=F(t)); _interp_at(lo.data, 'energy', F(t), interp)
def key_glow(m, t, strength=None, rgb=None, interp=None):
    """key an emissive material's strength / colour at t s (m: the material or its name)"""
    m = bpy.data.materials[m] if isinstance(m, str) else m; b = bsdf(m)
    if strength is not None:
        s_ = b.inputs['Emission Strength']; s_.default_value = strength; s_.keyframe_insert('default_value', frame=F(t))
    if rgb is not None:
        c_ = b.inputs['Emission Color']; c_.default_value = (*rgb, 1); c_.keyframe_insert('default_value', frame=F(t))
    if interp: set_interp(m.node_tree, interp, t0=t, t1=t)
def show(objs, t, on=True):
    """key visibility of objects (and their children) from t s on"""
    if not isinstance(objs, (list, tuple)): objs = [objs]
    for o in objs:
        for x in [o] + list(o.children_recursive):
            x.hide_render = not on; x.keyframe_insert('hide_render', frame=F(t)); _interp_at(x, 'hide_render', F(t), 'CONSTANT')
            x.hide_viewport = not on; x.keyframe_insert('hide_viewport', frame=F(t)); _interp_at(x, 'hide_viewport', F(t), 'CONSTANT')
def drift(o, path='location', idx=0, strength=0.5, period=8.0, phase=0.0):
    """slow random wander (an F-curve noise modifier) on o.<path>[idx] around its current value; period in s"""
    o.keyframe_insert(path, frame=1, index=idx); fc = fcurve(o, path, idx)
    m = fc.modifiers.new('NOISE'); m.scale = period * S.fps; m.strength = strength; m.phase = phase; m.depth = 1
    return m
def loop(o, path, idx, v0, v1, period, phase=0.0):
    """o.<path>[idx] runs linearly v0 -> v1 every period s, forever"""
    f0 = 1 - phase * S.fps
    getattr(o, path)[idx] = v0; o.keyframe_insert(path, frame=f0, index=idx)
    getattr(o, path)[idx] = v1; o.keyframe_insert(path, frame=f0 + period * S.fps, index=idx)
    fc = fcurve(o, path, idx)
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    fc.modifiers.new('CYCLES')

# ================================================================ grey mode (--grey)
def grey_world(g=0.25):
    """--grey: every surface one neutral grey g, every light and glow white; positions, sizes, strengths and keys untouched,
    so the lighting keeps its shape. Pictures on emissive surfaces turn to their own greyscale."""
    n_, kept = 0, []
    for m in bpy.data.materials:
        if not m.use_nodes or not m.node_tree: continue
        nt = m.node_tree; fcs_ = fcurves(nt)
        for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
            es = b.inputs['Emission Strength']
            if es.is_linked or es.default_value > 0 or any(fc.data_path == 'nodes["%s"].inputs[%d].default_value' % (b.name, list(b.inputs).index(es)) for fc in fcs_):
                kept.append(m.name)
            for nm, v in (('Base Color', (g, g, g, 1)), ('Metallic', 0.0), ('Subsurface Weight', 0.0), ('Coat Weight', 0.0), ('Sheen Weight', 0.0)):
                if nm not in b.inputs: continue
                for l in list(b.inputs[nm].links): nt.links.remove(l)
                dp = 'nodes["%s"].inputs[%d].default_value' % (b.name, list(b.inputs).index(b.inputs[nm]))
                for fc in fcs_:
                    if fc.data_path == dp: fc.mute = True
                b.inputs[nm].default_value = v
            n_ += 1
    W = (1.0, 1.0, 1.0, 1.0)
    for d in bpy.data.lights:
        d.color = W[:3]
        for fc in fcurves(d):
            if fc.data_path == 'color': fc.mute = True
    for m in bpy.data.materials:
        if not m.use_nodes or not m.node_tree: continue
        nt = m.node_tree; fcs_ = fcurves(nt)
        for nd in list(nt.nodes):
            sock = (nd.inputs.get('Emission Color') if nd.type == 'BSDF_PRINCIPLED' else
                    nd.inputs.get('Color') if nd.type in ('EMISSION', 'VOLUME_SCATTER', 'PRINCIPLED_VOLUME') else None)
            if sock is None: continue
            if sock.is_linked:
                src = sock.links[0].from_socket
                if src.node.type != 'RGBTOBW':
                    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs[0]); nt.links.new(bw.outputs[0], sock)
                continue
            sock.default_value = W; dp = 'nodes["%s"].inputs[%d].default_value' % (nd.name, list(nd.inputs).index(sock))
            for fc in fcs_:
                if fc.data_path == dp: fc.mute = True
    wn = S.sc.world.node_tree if S.sc.world and S.sc.world.use_nodes else None
    if wn:
        for nd in wn.nodes:
            c_ = nd.inputs.get('Color') if nd.type in ('BACKGROUND', 'VOLUME_SCATTER') else None
            if c_ is not None and not c_.is_linked:
                v_ = sum(c_.default_value[:3]) / 3; c_.default_value = (v_, v_, v_, 1) if nd.type == 'BACKGROUND' else W
    print('previz kit: grey: %d surfaces grey; lights, glows and haze white; glows kept: %s' % (n_, ', '.join(sorted(set(kept))) or 'none'))
