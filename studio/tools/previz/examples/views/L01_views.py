"""A worked example of a location's views script: the empty place through its view cameras, for the plates the views are
painted over, the colour plates, and the fitting renders (Flow v3.3 - 4 Locations and props, steps 3 to 10). Copy it to
$FILM/previz/scenes/L0N_<name>_views.py and change the cameras, the colour table and the key points to the location's own.
The place here is a made-up walled courtyard (L01-room.json beside this file): a stage with steps on the south side, an
arcade of four columns on the east, a fountain, a tree, two benches, a gate in the north wall, a door in the west.
A film's own copy takes its room from $FILM/previz/film.json (`room('L0N')`); this example falls back to the json beside it.

    PY=.venv/bin/python; T=tools/previz
    $PY $T/blender_run.py <this script> -- --film $FILM --res 1440 --samples 16 --plate FRONT 0          the grey plate
    $PY $T/blender_run.py <this script> -- --film $FILM --res 1440 --samples 16 --iter fit1 --cams MASTER,TOP --proj
                                         fitting renders into $FILM/previz/L01/check/iter-fit1-<cam>.png, and PROJ lines
    $PY $T/blender_run.py <this script> -- --film $FILM --res 1440 --samples 16 --colour --iter colour \\
        --cams MASTER,FRONT,BACK,TOP --outsub plates-colour       the colour plates, $FILM/previz/L01/plates-colour/cam<id>-colour.png

Run it only with --plate <id> 0 or --iter (any other mode would write a take and a shots file under generations/L01/).
Every render here is 16:9: the frame is set to 16:9 after setup() for this location's own renders only (film.json and the
film's ratio are untouched). Compass as the kit: 0 east, 90 north. --res 1440 gives 2560x1440.
  MASTER  the picked picture's camera, worked out from the picture (step 4): here from the gate, lens 1.6 m up, looking south
  TOP     straight down over the whole place, orthographic, 24 m across, north at the top, east on the right
  FRONT   from the middle of the courtyard at standing height, looking south at the stage
  BACK    from the stage, standing on it, looking north at the gate
  EAST    from the west benches, looking east at the arcade
--colour: flat, distinct material colours (stone, plaster, timber, foliage, water) with thin dark outlines on every edge,
instead of the greys, for the plates the location's images are painted from; the grey plates stay the previz boards.
--iter <name> --cams <ids> [--proj] [--grey] [--outsub <folder>]: stills through the named cameras; --proj prints where each
key point lands in each camera, in pixels at 2560x1440 (PROJ <cam> <point> <x> <y>), to compare with the same points on the
picture, scaled to 2560 wide."""
import os, sys
_d = os.path.dirname(os.path.abspath(__file__))                   # the kit: the studio's tools/previz, found by walking up
while not os.path.isdir(os.path.join(_d, 'tools', 'previz', 'kit')) and os.path.dirname(_d) != _d: _d = os.path.dirname(_d)
sys.path.insert(0, os.path.join(_d, 'tools', 'previz')); from kit import *
import json, math, bpy

LID = 'L01'
setup(LID, 1.0, title='the courtyard views')
S.ratio, S.aspect = '16:9', (16, 9)                                   # this location's own renders are 16:9
S.sc.render.resolution_x, S.sc.render.resolution_y = S.film.size(S.res)[::-1] if S.film.portrait else S.film.size(S.res)
if LID in S.film.locations:
    R = room(LID)                                                     # the film's own room, from film.json
else:                                                                 # the example's room, beside this file
    R = room(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'L01-room.json'))))


def aim(pos, yaw, pitch, d=20.0):
    """a point d m away from pos along compass yaw, tilted pitch degrees (+ up)"""
    y, p = math.radians(yaw), math.radians(pitch)
    return (pos[0] + d * math.cos(p) * math.cos(y), pos[1] + d * math.cos(p) * math.sin(y), pos[2] + d * math.sin(p))


M_POS, M_YAW, M_PITCH, M_DIAG = (-3.0, 5.2, 1.6), 290.0, -4.0, 84.0   # the picture's camera, from step 4's fitting
shot('MASTER', 0, 1, M_DIAG, M_POS, aim(M_POS, M_YAW, M_PITCH), fstop=16)
shot('TOP', 0, 1, 84, (0.0, -0.01, 60.0), (0.0, 0.0, 0.0), fstop=64)
shot('FRONT', 0, 1, 84, (0.0, 3.0, 1.6), (0.0, -4.0, 1.2), fstop=16)
shot('BACK', 0, 1, 84, (0.0, -4.0, 2.25), (-2.0, 6.0, 1.8), fstop=16)
shot('EAST', 0, 1, 84, (-6.0, 0.0, 1.6), (6.6, 0.0, 1.8), fstop=16)

from kit.cameras import make_cameras
make_cameras()
top = cam('TOP'); top.data.type = 'ORTHO'; top.data.ortho_scale = 24.0; top.data.dof.use_dof = False
# thin dark outlines on every edge (Freestyle), so the grey pieces read apart in the plan and in the views painted from them
S.sc.render.use_freestyle = True; S.sc.render.line_thickness_mode = 'ABSOLUTE'; S.sc.render.line_thickness = max(1.0, S.res / 540.0)
vl_ = S.sc.view_layers[0].freestyle_settings
ls_ = vl_.linesets[0] if vl_.linesets else vl_.linesets.new('lines')
ls_.linestyle = ls_.linestyle or bpy.data.linestyles.new('lines'); ls_.linestyle.color = (0.05, 0.05, 0.05)
ls_.select_by_visibility = True; ls_.select_by_edge_types = True
ls_.select_silhouette = ls_.select_border = ls_.select_crease = True
NO_LINES = ()                                                          # name prefixes drawn without outlines (far scenery, the ground)
far_ = bpy.data.collections.new('no-lines'); S.sc.collection.children.link(far_)
for o_ in list(bpy.data.objects):
    if NO_LINES and o_.name.startswith(NO_LINES):
        for c_ in list(o_.users_collection): c_.objects.unlink(o_)
        far_.objects.link(o_)
ls_.select_by_collection = True; ls_.collection = far_; ls_.collection_negation = 'EXCLUSIVE'

COLOURS = [   # (object name prefixes, rgb): first match wins; every object of the room should match one (else it is reported)
    (('stage-steps', 'stage'), (0.70, 0.50, 0.26)),                    # dressed limestone
    (('floor',), (0.82, 0.76, 0.64)),                                   # paving
    (('wall',), (0.80, 0.58, 0.28)),                                    # ochre plaster
    (('arcade-column',), (0.93, 0.91, 0.86)),                           # white stucco
    (('arcade-roof',), (0.60, 0.24, 0.13)),                             # terracotta tile
    (('fountain-water',), (0.20, 0.42, 0.48)),                          # water
    (('fountain-basin',), (0.58, 0.53, 0.46)),                          # rubble stone
    (('tree-trunk',), (0.45, 0.36, 0.26)), (('tree-crown',), (0.22, 0.40, 0.12)),
    (('bench', 'door', 'street-door', 'gate'), (0.36, 0.24, 0.14))]    # timber


def colour_world():
    mats = {}
    for o_ in bpy.data.objects:
        if o_.type not in ('MESH', 'CURVE'): continue
        nm_ = o_.name[len(LID) + 1:] if o_.name.startswith(LID + '-') else o_.name   # the room names its shell L01-floor, L01-wall0
        for pre, rgb in COLOURS:
            if nm_.startswith(pre):
                m_ = mats.get(rgb) or mat('flat-%.2f-%.2f-%.2f' % rgb, rgb, 0.8); mats[rgb] = m_
                o_.data.materials.clear(); o_.data.materials.append(m_)
                break
        else: print('COLOUR: no colour for', o_.name)
    nt_ = S.sc.world.node_tree; out_ = nt_.nodes['World Output']; bg_ = nt_.nodes['Background']   # sky blue to the camera,
    bg_.inputs['Color'].default_value = (0.45, 0.45, 0.45, 1); bg_.inputs['Strength'].default_value = 1.0  # neutral fill light
    sky_ = nt_.nodes.new('ShaderNodeBackground'); sky_.inputs['Color'].default_value = (0.36, 0.56, 0.90, 1)
    lp_ = nt_.nodes.new('ShaderNodeLightPath'); mx_ = nt_.nodes.new('ShaderNodeMixShader')
    nt_.links.new(lp_.outputs['Is Camera Ray'], mx_.inputs[0]); nt_.links.new(bg_.outputs[0], mx_.inputs[1]); nt_.links.new(sky_.outputs[0], mx_.inputs[2])
    nt_.links.new(mx_.outputs[0], out_.inputs['Surface'])
    vs_ = S.sc.view_settings; vs_.view_transform = 'Standard'; vs_.look = 'None'; vs_.exposure = float(arg('--exposure', -1.0))   # flat colours read true


if has('--colour'): colour_world()

if has('--iter'):                                    # fitting renders and colour plates, then exit
    from kit.output import still
    from kit.cameras import cam_state
    if has('--grey'): grey_world()
    name = arg('--iter'); cams = (arg('--cams') or 'MASTER').split(',')
    if has('--proj'):                                # where the key points land in each camera, in 2560x1440 pixels
        from bpy_extras.object_utils import world_to_camera_view as w2c
        S.sc.frame_set(1)
        KEYS = {'stage NE top': (2.5, -2.5, 0.6), 'stage NE foot': (2.5, -2.5, 0), 'stage NW top': (-2.5, -2.5, 0.6),
                'stage NW foot': (-2.5, -2.5, 0), 'steps foot': (0.0, -1.6, 0), 'column 1 foot': (6.6, -4.5, 0),
                'column 1 top': (6.6, -4.5, 3.0), 'column 4 foot': (6.6, 4.5, 0), 'column 4 top': (6.6, 4.5, 3.0),
                'fountain rim': (-3.5, 1.4, 0.55), 'trunk foot': (4.0, 3.5, 0), 'crown top': (4.0, 3.5, 4.8),
                'wall SW top': (-8.0, -6.0, 3.2), 'wall SE top': (8.0, -6.0, 3.2), 'gate top': (-4.0, 6.0, 2.8)}
        for c in cams:
            pos_, yaw_, pitch_, fd_, dg_ = cam_state(c, 0.0); KEYS['horizon'] = aim(pos_, yaw_, 0.0, 900.0)
            for k_, p_ in KEYS.items():
                v = w2c(S.sc, cam(c), Vector(p_))
                if v.z > 0 and -0.05 <= v.x <= 1.05 and -0.05 <= v.y <= 1.05:
                    print('PROJ %-10s %-24s %7.0f %7.0f' % (c, k_, v.x * 2560, (1 - v.y) * 1440))
    for c in cams:
        sub = arg('--outsub')
        p_ = os.path.join(S.outdir, sub, 'cam%s-%s.png' % (c, name)) if sub else os.path.join(S.outdir, 'check', 'iter-%s-%s.png' % (name, c))
        if os.path.exists(p_) and sub: sys.exit('exists, not overwriting: ' + p_)
        p = still(c, 0.0, p_); print('ITER', p)
    sys.exit(0)
run()
