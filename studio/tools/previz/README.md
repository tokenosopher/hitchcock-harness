# Previz kit (`kit/`)

A grey Blender previz for any film: rooms built from each location's plan, plain grey mannequins at the cast's heights, props,
the lighting, and cameras by shot. One scene script per generation writes the previz take, the storyboard panels and their
board, and the generation's shots file for the pre-submit check.

## Rules
- Blender is `/Applications/Blender.app`, or the program named in `BLENDER_BIN`.
- Run Blender **only** through the slot wrapper (at most eight renders at once on this Mac, shared with other agents; the limit
  is `SLOTS` in `blender_run.py`), from the studio folder:
  `.venv/bin/python tools/previz/blender_run.py <script>.py -- --film $FILM [flags]`. The kit refuses a headless run that
  did not come through it. Waiting runs are served first come, first served (a numbered ticket each). Runs that render
  nothing (`--project`, `--shots-file`, `--build`, `--facts`, `build_location.py`) never wait behind renders: they have their own fast
  lane (`FAST_SLOTS`, 3). Every run ends with `blender_run: <lane> slot N, waited W s, ran R s, exit E`.
  Eight is the ceiling, not a promise: a render also waits while the Mac has no room for one more
  (the first four always start; a further one needs normal memory pressure and about 3 GB free, `MEM_NEED_GB`). A waiting
  run says `waiting for memory...`; that is the wrapper doing its job, not a hang. Each render prints the memory free at
  its start and its peak, and every run is logged in `scratch.nosync/previz-blender/blender-runs.log` in the studio folder.
- A scene in a location that has a people file starts with `R = location('<LID>')`, not `room(...)`, and builds no one
  the file already holds (below). Write new scene scripts with `setup(..., reuse=True)`.
- Use `--res 540 --samples 16` for everything until told otherwise.
- Panels render through **each shot's own camera** with the timeline markers removed (bound markers override the scene camera
  at render time). `run()` does this; never render a panel through another camera.
- Compare every panel with the film frame at the same moment (`--check`, or the take's frames) before showing it.
- Before the critic: `precheck.py` (below), free and in seconds; fix every WARN or say in the scene file why the shot wants it.
- Look at every render yourself before you hand it on.

## Units and conventions
- Metres, seconds, degrees. +Z up. **Compass** angles: 0 = east (+X), 90 = north (+Y), 180 = west, 270 = south.
- **Frames vs seconds:** the low-level keyers `k`, `pose_bone`, `tgt`, `place` take FRAMES (write `F(t)`); every other helper takes SECONDS.
- A figure's **local body coords** (for `tgt`): rest pose facing -Y, its left = +X, feet on z 0, 1.70 m body units (a taller
  figure is the same rig scaled, so local numbers stay the same). The hand target is where the **fingertips** go; the foot
  target is the **ankle** (z 0.09 standing). Poles: `elbow.L/R` (default behind, `(±0.45, 0.35, 1.05)`), `knee.L/R` (in front).
- Root rotation: `rot z = facing + 90`. Spine/neck/head bones: `rx +` bends forward / nods down, `ry +` turns to the figure's left.
- Key the root first (`stand`/`walk`/`sit`/`place`), then `look_at`/`reach` (they read the pose at t). A key holds until the
  next key on the same channel. Blender 5.2 in the background ignores the "new key" interpolation setting: use `k(..., interp=)`
  or `set_interp(obj, 'CONSTANT', t0=, t1=)` on the keys.

## The film config: `<film>/previz/film.json`
```json
{"title": "Kitchen Test", "prefix": "KT", "ratio": "16:9", "fps": 24, "res": 540,
 "cast": {"ANNA": {"height": 1.68}, "BEN": {"height": 1.84}},
 "locations": {"L01": {"name": "the kitchen", "room": {"floor": [0, 0, 4, 3], "height": 2.6}},
               "L02": {"name": "the hall", "room": "previz/rooms/L02-hall.json"}}}
```
- `ratio` is `9:16` or `16:9`; `res` the short side of the draft frame (540 -> 540x960 or 960x540). Every key is optional:
  without film.json the ratio comes from `brief.md` ("Aspect ratio 9:16"), the title from its first heading, the prefix from the
  folder name's initials, fps 24, res 540.
- The ratio sets the frame, the lens maths, the storyboard page layout (`storyboard.py`) and the assembly (`assemble_film.py`).
- **Cast:** one entry per character, keyed by the tag the prompts use (`ANNA`, `GUARD`); `height` in metres. Every figure is
  the same neutral grey mannequin scaled to that height (no costume, hair or colour: the looks come from the reference images).
- **Locations:** a room plan inline, or a path (relative to the film folder) to a plan json.

## Describing a room from its plan and views
1. On the location's plan drawing, pick the origin (a corner or the room's centre, on the floor) and keep +X east, +Y north as
   drawn. Read the floor outline in metres: a rectangle is two corners `[x0, y0, x1, y1]`; an L (any right-angled outline) is its
   corners `[[x, y], ...]` in order.
2. From the views: the ceiling height (a person in a view is about 1.7 m) and the wall thickness. Walls stand outside the outline.
3. Openings: the wall they are in (`N` = the wall along the north edge), their centre along it in world coordinates (x on N/S
   walls, y on E/W walls), width, height, sill. A door gets `"door": {"hinge": "W"}` (the jamb it hangs on).
4. Levels: raised floors (`platforms`) and flights (`steps`: each step `going` further along `up`, `inset` narrower each side).
5. Large furniture only, as boxes, cylinders, tables, chairs and cables, placed from the plan with heights from the views. Leave
   small dressing and designed detail out: the boards stay grey and simple (detail on a board gets copied into the video).
6. The location's own light sources (windows, lamps, candles, screens) go in `lights`, placed where the views show them: the
   boards carry the lighting.
7. Check it: `--plate <shot> <t>` through a camera matching one of the location's views, side by side with the view.

```json
{"floor": [0, 0, 4, 3], "height": 2.6, "wall": 0.15, "ceiling": 0.2,
 "exposure": 0.0, "world": [0.01, 0.01, 0.01], "haze": 0.0, "rough": {"floor": 0.3},
 "openings": [{"name": "door", "wall": "S", "at": 0.8, "w": 0.9, "h": 2.05, "door": {"hinge": "W"}},
              {"name": "window", "wall": "E", "at": 1.5, "w": 1.2, "h": 1.1, "sill": 0.95}],
 "platforms": [{"name": "dais", "rect": [3.0, 2.0, 4.0, 3.0], "top": 0.3}],
 "steps": [{"name": "stairs", "rect": [2.8, 0, 4.0, 0.9], "n": 3, "rise": 0.18, "going": 0.3, "up": "E"}],
 "furniture": [{"name": "table", "kind": "table", "at": [2.4, 1.6], "size": [1.2, 0.8, 0.75], "rot": 0},
               {"name": "chair", "kind": "chair", "at": [2.4, 2.25], "size": [0.45, 0.45, 0.46], "facing": 270, "back": 0.95},
               {"name": "fridge", "kind": "box", "at": [0.4, 2.6], "size": [0.6, 0.65, 1.8]},
               {"name": "pillar", "kind": "cyl", "at": [[1.2, 1.2], [1.2, 2.2]], "size": [0.12, 2.6]},
               {"name": "lamp-shade", "kind": "cyl", "at": [2, 1.5, 2.2], "size": [0.2, 0.2], "glow": 3, "rgb": [1, 0.8, 0.6]},
               {"name": "hose", "kind": "cable", "points": [[0, 0, 0.02], [1, 0.5, 0.02]], "r": 0.02}],
 "lights": [{"kind": "window", "opening": "window", "power": 600, "target": [2.4, 1.6, 0.75], "cone": 70},
            {"kind": "point", "name": "lamp", "at": [2.0, 1.5, 2.1], "power": 40}]}
```
- An open place (`"ceiling": 0`): `haze` is a box volume round the place (300 m each way, 60 m high), not a world volume, which
  in Blender 5.2 EEVEE is endless and blacks out the open sky.
- `box`: `at` = centre of its footprint (+ base z), `size` = width along x, depth along y (before `rot`), height. `cyl`: `at` = centre
  of its base, `size` = radius, height. `table`: top + four legs. `chair`: `facing` = where the sitter faces, `back` = top of its back.
  `cable`: a tube through points. Any entry: `at` as a list of points makes numbered copies (`pillar-1`, `pillar-2`; `size` may be a
  matching list); `glow` (+ `rgb`) makes it emit light; `alpha` < 1 see-through; `rough` its roughness.
- `rough` per class (`floor wall ceiling furniture`): 0.75 matte by default; a polished floor about 0.3 (its sheen is part of the
  lighting, so it stays in `--grey`).
- Light entries take the arguments of the light helpers below (`at` may be a list of points).

`R = room('L01')` (or `room({...plan...})`) returns the Room:

| handle | gives |
|---|---|
| `R.seat('chair', up=0)` | `(x, y, seat top, facing)` for `sit()` |
| `R.top('table')`, `R.at('table')`, `R.obj('table')` | top surface height, base point, the object (an empty with parts for tables/chairs) |
| `R.open_door('door', t, deg)` | keys the door open `deg` at t (+ swings into the room, 0 shut) |
| `R.opening('window')` | `centre`, `inward` normal, `w`, `h`, `sill`, `shape` |
| `R.glow('lamp-shade')` | the emissive material, for `key_glow` |
| `R.lights[name]`, `R.bounds` | the location's lights; `(lo, hi)` for `haze_to_box` |

## What a scene agent does
1. Before any scene of a location starts, its people file exists: `previz/rooms/<LID>-people.json` (the principals at their
   heights on their marks, every crowd and standing group, the props that live there, the marks), built once with
   `build_location.py` (below). A scene agent never writes it; if it needs a change, it says so.
2. The scene script starts with `setup('<G>', <seconds>, title=..., reuse=True)` and `R = location('<LID>')`, not `room(...)`.
3. It builds no one the people file holds: `figure('X')` gives the shared figure, `group('CROWD')` the crowd, `prop('LANTERN')`
   the prop, `R.marks['DOOR']` a mark, `R.cast['X']` a height. It moves, poses or keys any of them by name, and takes out
   anyone the scene does not show with `remove_figure('X')`.
4. It stages only its own action: poses, walks, looks, the props' places, the cameras.
5. In `in_frame` a crowd is named by its tag (`CROWD`, `QUEUE`), not figure by figure; `--check` counts it that way.
6. `points` for `--project` are world points or specs (`('bone', 'ANNA', 'hand.R')`, `('eyes', 'X')`, `('prop', 'LANTERN')`),
   not functions, so a camera question is answered from the saved build in about a second.
7. Everything a run needs goes through `run()`: no modes of the script's own, nothing after `run()`.

## A location's shared scene: built once, loaded by every scene there
What every scene of one location has in common (the room, its lights, the principals at their heights, the crowd and any
standing group, the props that live there, the marks) is described once, in `<film>/previz/rooms/<LID>-people.json`, and built
once into `<film>/previz/rooms/<LID>.blend`. Each scene opens that file and stages only its own action, so every scene of the
place has the same people at the same heights in the same places, and no run spends time building a crowd.

**Who writes it:** one job, after the location's room is built and before the scene agents start, from the scene files' marks
and the brief's cast: the people every scene of the place shows, where they stand, how tall and how built.

**The file** (`.json`, or `.py` plain Python that sets `PEOPLE` to the same dict). Every key is optional.
```json
{"location": "L01",
 "cast":   {"ANNA": {"height": 1.68, "at": [2.0, 1.0, 0.3], "facing": 90},
            "BEN":  {"height": 1.84, "at": [2.0, 3.1], "facing": 270}},
 "groups": {"QUEUE": [{"name": "QUEUE01", "at": [1.55, -1.15], "height": 1.40, "build": [0.85, 0.85],
                       "facing": 90, "hands": "front"}],
            "CROWD": [{"name": "CROWD01", "at": [-6.6, 2.7], "height": 1.77, "facing": 309, "hands": "crossed"},
                      {"name": "CROWD02", "at": [4.25, 3.0], "height": 1.76, "facing": 165, "hands": "front"}]},
 "props":  [{"name": "LANTERN", "kind": "box", "size": [0.15, 0.15, 0.3], "at": [2.4, 3.26, 0.98], "owner": "BEN"},
            {"name": "STAFF", "kind": "rod", "length": 1.85, "r": 0.018, "at": [0, 0, 0], "owner": "ANNA"}],
 "marks":  {"STAGE_TOP": [0, 0, 0.3], "BEN": [2.0, 3.1], "DOOR": [3.25, 3.35]}}
```
- `cast`: the principals. Built at `height` (else film.json's cast, else 1.70 m), standing at `at` facing `facing`, **not keyed**:
  the scene places and poses them. A scene that does not show one calls `remove_figure('X')`.
- `groups`: crowds and standing groups, by the tag the prompts use. Each figure is keyed standing at frame 1 (`stand()` with its
  `hands` preset); `build` widens or narrows a stand-in (x and y scale on top of the height). In `--check` a crowd figure counts as
  its group's tag (`IN_FRAME shot 4 sees CROWD(45), QUEUE(3), ANNA`), so `in_frame` lists `CROWD`, not 45 names. `--project`
  and `--mannequin` cover the principals only.
- `props`: `box` (size), `cyl` (r, h), `rod` (length, r, grip), `blade` (length, width, grip, guard), at `at`, `rot` in degrees,
  not keyed; `owner` = who holds it (plates hide it with the figures). The scene takes it with `prop('LANTERN')`.
- `marks`: named points; `R.marks['DOOR']` is a Vector (z 0 when only x, y are given).

**Built and loaded by itself.** `R = location('L01')`, right after `setup()`, builds the file if it is missing or out of date,
then opens it as the scene. Its stamp (`L01.blend.json`) holds the hashes of the people file, the room plan, film.json, the kit's
building code and the Blender version; any change and the next run that needs the file rebuilds it once and says why
(`L01 shared file out of date (L01-people.json changed): building it once`). Two runs that need it at the same moment build it
once: the second waits on a lock (`previz/rooms/L01.blend.lock`) and loads what the first built. To have it ready before the
scene agents start (it renders nothing, so it runs in the fast lane):
`.venv/bin/python tools/previz/blender_run.py tools/previz/build_location.py -- --film $FILM --location L01 [--force]`.
A place with about 66 figures builds in under half a minute and opens in under a second.

**Opened, not appended or linked.** The file is opened as the scene (fast); `PREVIZ_SHARED_LOAD=append` appends its objects into
the empty scene instead (several times slower, kept to compare). A linked figure could not be posed or keyed without a library
override for each, so linking is not used. After `location()` the scene owns its copy: it may move, pose, hide or remove any
figure by name.

## A scene's own build, reused between its runs
`setup('S4', 17.0, title=..., reuse=True)`: the first run saves the scene as the script built it, just before the mode's work
(`previz/S4/built/S4-built.blend`), with a stamp of everything it was built from: the script, every file the script and the kit
read while building, helper modules it imported from the film, the location's shared file, film.json, the kit's code, the
Blender version and the build flags (`--film`, `--exposure`). A later run whose stamp still matches opens that file and does only
its own mode (`previz kit: reused the saved build of S4 ... nothing it was built from has changed`), and prints the script's own
check lines again, marked `[build hh:mm:ss]`. Change one number in the script and the next run builds again and says which file
changed. `--build` only builds (and saves); `PREVIZ_NO_REUSE=1` builds every time. A reused `--project` answers in a second or
two; a `--check` saves the build and the render is what is left.

What reuse asks of a script (scripts without `reuse=True` build every time):
- everything a run's mode needs goes through `run()`: no mode of the script's own (an unknown flag such as `--stills` turns reuse
  off for that run and says so), no changes to the kit's functions, nothing after `run()`;
- the building does not depend on the mode or on `--res`, `--samples`, `--grey` (applied after the saved point);
- `points` for `--project` as world points or specs: `('bone', 'ANNA', 'hand.R')`, `('tail', 'ANNA', 'hand.R')`,
  `('eyes', 'X')`, `('head', 'X')`, `('prop', 'LANTERN')`. A function (`lambda t: ...`) still works, but a `--project` run then builds.

## Pose questions ask one figure, not the whole scene
`eyes_world`, `head_world`, `bone_world`, `to_local`, `look_at`, `reach` and `turn` read one figure, not the whole scene: each
figure asked about gets a small side scene (`probe-<NAME>`) holding only its armature and its IK targets and poles; the question
sets that scene's frame and reads the figure as Blender evaluated it there (the same keys, constraints and IK solver, so the same
answer). The side scenes are removed before anything is saved, checked or rendered. A figure with a parent, an object constraint
or an IK target outside its own rig is asked by setting the scene's frame. `PREVIZ_FRAME_SET=1` does that for every question.
A pose question does not move the scene's frame, so a script that reads an object's place right after one sets the frame itself
(`S.sc.frame_set(F(t))`).

## A scene script with a shared location
```python
setup('S4', 17.0, title='The stranger at the door', reuse=True)
R = location('L01')
TOP = R.marks['STAGE_TOP'].z
anna, ben = figure('ANNA'), figure('BEN')                      # already there, at their heights
B_MARK = tuple(R.marks['BEN'])[:2]
queue = group('QUEUE')                                         # standing on their marks
for f_ in queue: look_at(f_, 0.0, eyes_world(anna, 0.0)); idle(f_, 0.0, 17.0, amount=0.4, head=False)
for i_, f_ in enumerate(group('CROWD')):                       # standing on their spots
    look_at(f_, 0.0, eyes_world(anna, 0.0)); idle(f_, 0.0, 17.0, amount=0.6, head=False, seed=i_ + 3)
...                                                            # the scene's own action and its shots
run(..., points={'ben_wrist_R': ('bone', 'BEN', 'hand.R')})
```
Helpers: `group(tag)` (the group's figures in file order), `remove_figure(fig)`, `figure('X')` (the shared one; a different
height asked is ignored and said), `R.marks`, `R.cast`, `R.groups`.

## Figures
`arm, T = figure('ANNA')` builds the cast member's mannequin (height from the cast; `figure('X', height=1.8)` for someone not in
it). Every helper takes the figure as its name, the armature or the `(arm, T)` tuple. The mannequin has two dark eyes, a nose and a
brow, so where it looks reads in every panel, and its limbs are capsules, round at both ends, so no flat cap shows at a shoulder,
elbow, hip or knee in a close shot. `figure('X', build=(1.1, 1.05))` (or a people file's `"build"`) makes a broader or slighter body
in its torso and limbs; never scale an armature in x or y for this (the limbs shear): `run()` turns such a scale into a build, keeps
the hands where they were and says so.

| helper | does |
|---|---|
| `stand(fig, t, loc=None, facing=None, hands='side', spine=0, head=(0,0))` | standing; with loc/facing also places it |
| `hands(fig, t, preset)` | `side front behind hips lap crossed pockets wrists_front` |
| `idle(fig, t0, t1, amount=1, head=True)` | breathing + small head drift |
| `walk(fig, [(x,y), ...], t0, t1, step=0.6, arms=True, settle=True)` | walks the path, feet planted; `settle=False` still striding at t1 |
| `turn(fig, t0, t1, facing)` | turns on the spot (standing) |
| `sit(fig, t, R.seat('chair'), lean=0, hands='lap')` | seated, thighs on the cushion (or `seat=(x, y, top)` + `facing`) |
| `kneel(fig, t, (x,y), facing, style='both'/'left'/'right')`, `lie(fig, t, (x,y), heading, side='back')` | kneeling; lying (heading = where the head points, side = the side down) |
| `look_at(fig, t, point, hold=None)`, `head_turn(fig, t, nod, turn, tilt)` | aim the face at a world point; or key the head directly |
| `reach(fig, t, 'L'/'R', point, elbow=None)` | fingertips to a world point |
| `eyes_world(fig, t)`, `head_world(fig, t)`, `bone_world(fig, bone, t)`, `to_local(fig, t, p)`, `facing_now(fig, t)` | where things are |
| `hide_figure(fig)` | hidden in stills (not keyed) |
| `place(fig, F(t), loc, rot)`, `pose_bone(fig, bone, F(t), rx, ry, rz)`, `tgt(fig, key, F(t), local)` | the low-level keyers (frames) |

## Props
Each prop is an empty (origin = where a hand holds it, +Z along its length) with grey shapes as children; its upper-case name is
what `in_frame` uses.

| helper | does |
|---|---|
| `prop_box(name, (w, d, h))`, `prop_cyl(name, r, h)` | a box / cylinder centred on its origin (`glow=` for a lit one) |
| `rod(name, length, r=0.012, grip=0.1)` | a staff, a baton, a pole |
| `blade(name, length=0.8, width=0.032, grip=0.2, guard=0.11)` | a sword-like blade (a knife: 0.2, guard 0.04, grip 0.11) |
| `cab, end = cable(name, points, r=0.004)` | a cable through world points; its last points follow the `end` empty |
| `grip(prop, fig, 'R', t, axis=(0,-1,0))`, `touch(prop, fig, 'R', t)` | in the fist / at the fingertips from t |
| `attach(prop, fig, bone, t, offset)`, `detach(prop, t)`, `place_prop(prop, t, loc, rot)`, `prop_world(prop, t)` | carried on a bone / put down / keyed free / where it is |

## Lights
`point(name, at, W)`, `spot(name, at, target, W, cone=30)`, `area(name, at, target, W, size)`, `sun(name, compass, elevation, W)`,
`candle(name, at, power=12)`, `candles(name, (x, y), n=5, h=1.3, power=35)` (a stand: topple it by keying its rotation),
`screen(name, at, (w, h), facing, strength, power=3)` (a lit panel + its soft light), `window_light(R, 'window', W, target=...)`
(the pane glows, a light shines in). Keys: `key_light(name, t, W)`, `key_glow(mat, t, strength)`, `show(objs, t, on)`;
`haze(density)` (indoors a world volume; in an open place a box volume, so the sky stays), `world(rgb)`, `set_exposure(ev)`,
`haze_to_box(lo, hi)` (before any object volume such as smoke: in Blender 5.2 EEVEE a world volume hides object volumes). Colours
are kept for the normal render; `--grey` makes every light and glow white at the same place and strength, and every surface one
grey, except a material that keeps its own grey: `grey('water')` (0.07, still water darker than the sand), `grey('foam')` (0.80,
foam and breaking water white), the mannequins' eyes, or any `mat(..., grey=0.5)` / `m['previz_grey'] = 0.5`.

## Cameras
`shot(id, t0, t1, diag, pos, pt, in_frame=[...], fx=0, fy=0, focus=None, handheld=False, move=None, exposure=None, board=None)`
declares shot `id` (`'1'`, `'5A'`). `diag` = the diagonal field of view of the film's frame in degrees: 84 wide, 63 medium,
47 close, 30 extreme close (about 24, 35, 50, 80 mm full-frame in either ratio); the vertical and horizontal angles follow
from the ratio (`vfov`, `hfov`, `lens_mm`, `lens_ff`). `pt` lands at `(fx, fy)` (fractions of the half frame, + = right/up).
**`in_frame`** = what the frame shows, as the prompt tags it (cast keys, props, set pieces); it goes into the shots file and
`--check` warns when a camera sees a figure the list leaves out (or never sees one it lists). `move=dict(pos=, pt=, fx=, fy=,
focus=, diag=, t0=, t1=, ease='both'|'in'|'out'|'linear')` travels between t0 and t1. `handheld=True` breathes, `jolts=[t]` bump.
`board=` overrides the storyboard camera line (default written from the scene: `CAM FACING E | close-up of Anna, 47° lens | 1.29 m | locked off`:
the size from how many frame heights the subject's height makes, the lens apart). `focus=`: a world point, or a figure's name (the
point between its eyes, followed as it moves); left out, the camera focuses on the nearest face in frame turned toward the lens
among the shot's `in_frame` figures, else the nearest head, else `pt`.
The cut defaults to one cut per shot at its own times; `shot_plan([(label, shot id, t0, t1), ...])` reuses a camera.
Helpers: `ring(center, compass, dist, dz)`, `frame_on`, `free_cam`, `cam(id)`.

## A scene script (complete minimal example)
`film.json` holds a kitchen like the one above (door, window, table, chair, fridge, the window light and a lamp) and the cast
`ANNA` 1.68, `BEN` 1.84; the files are `examples/minimal/`.
```python
import os, sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))); from kit import *

setup('G01', 6.0, title="You're late")                     # -> <film>/previz/G01/, 6 s
R = room('L01')                                            # the kitchen from film.json
anna, ben = figure('ANNA'), figure('BEN')                  # heights from the cast

sit(anna, 0.0, R.seat('chair'), hands='lap')               # at the table, facing south (the chair's facing)
look_at(anna, 0.0, (0.8, 0.0, 1.7))                        # watching the door
stand(ben, 0.0, loc=(0.8, -0.7), facing=90)                # outside the door, facing in
R.open_door('door', 0.3, 0); R.open_door('door', 0.9, 95)  # he pushes it open
walk(ben, [(0.8, -0.7), (0.8, 0.7), (1.45, 1.15)], 0.6, 3.2)
turn(ben, 3.2, 3.6, 45)                                    # to face her
look_at(anna, 3.4, eyes_world(ben, 3.4))
look_at(ben, 3.6, eyes_world(anna, 3.6), hold=6.0)
idle(anna, 3.4, 6.0, head=False); idle(ben, 3.6, 6.0, head=False)

eA, eB = eyes_world(anna, 4.2), eyes_world(ben, 5.5)
shot('1', 0.0, 3.4, 84, (3.8, 0.2, 1.6), (1.2, 1.4, 1.0), in_frame=['ANNA', 'BEN', 'DOOR'])
shot('2', 3.4, 5.0, 47, ring(eA, 235, 1.1), eA, in_frame=['ANNA'], fx=0.25)
shot('3', 5.0, 6.0, 63, (3.5, 2.2, 1.55), eB, in_frame=['BEN'], move=dict(pos=(3.2, 2.05, 1.55)))   # a slow push in
run(lines=[dict(who='ANNA', text="You're late.", t=[3.9, 4.6])],
    moves=[dict(who='BEN', what='comes in through the door and stops at the end of the table', t=[0.6, 3.2])])
```
A film's scene script lives in `$FILM/previz/scenes/` and reaches the kit five folders up:
`import os, sys; sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../../tools/previz'))); from kit import *`
(the example's own first line reaches it from `examples/minimal/`). `run(panels=[(shot id, t, caption), ...])` picks the panels
(default three per cut, captions written from the moves and lines under way); `points={name: point}` feeds `--project`;
`extra={...}` adds keys to the take json; `header=` overrides the board header.

## Modes and flags (one mode per invocation; OUTDIR = `<film>/previz/<G>/`)
| flag | output |
|---|---|
| `--check [--shots 1,2]` | three frames per cut -> `check/shotNN-<id>-<t>.png`, the in_frame check, the sight check (named faces covered or too small, hands in use out of frame or covered: `SIGHT CHECK ok` or WARN lines), `<G>-previz.blend`. Sheet: `.venv/bin/python tools/previz/sheet.py <check dir> <out.jpg>` |
| `--panels [--version v1] [--only 1,3] [--panel-start N] [--panel-times "id:t,..."]` | `storyboard/<version>/panels/NN-shot<id>-<t>.png`, `panels.json`, `board.json` (written unless a hand-made one is there), the shots file |
| `--plate <id> <t>` | the empty set through that shot's camera (figures and what they hold hidden) -> `plates/`, with the camera beside it (`<plate>.json`: position, yaw, pitch, lens) for views.md |
| `--project <id> t1,t2` | prints `PROJECT {...}`: where each figure's head and hips and each `points` entry land (x, y from top-left 0..1, depth) |
| `--mannequin [--mq-time t]` | close-ups and full views of every figure at t, the set hidden -> `check/mq-<name>-<view>.png` |
| `--facts` | only the scene's facts -> `<G>-facts.json` (nothing rendered, fast lane; `--check`, `--panels` and the take write them too) |
| `--shots-file` | only the shots file |
| `--build` | only builds the scene (and, with `reuse=True`, saves it for the next runs); prints `BUILD DONE` |
| (none) | the take: `<G>-previz-take-N.mp4` (crf 18, yuv420p, faststart) + `.json` + the .blend + the shots file |

`--project`, `--shots-file` and `--build` render nothing and run in the wrapper's fast lane.

With any mode: `--grey` (every surface one grey, every light and glow white, the lighting's shape kept: the boards for the
video model), `--res <short side>`, `--samples <n>`, `--exposure <EV>` (beats the room's and the script's).

## What it writes
- **Take json** `<G>-previz-take-N.json`: `generation, take, fps, frames, duration, ratio, res, grey`, `shots` (per cut: `id`,
  `name`, `camera`, `t0`, `t1`, `in_frame`, `diag_fov`, `vfov`, `hfov`, `lens_mm` (24 mm long-side sensor), `lens_ff_mm`, `cam`,
  `yaw`, `pitch`, `handheld`, `board`, `move`), `shot_plan` (`label, cam, t0, t1`), `moves` (`who, what, t`, sorted by start),
  `lines` (`who, text, t`; the pre-submit check compares the words), `script`, plus `extra`.
- **Facts** `<G>-facts.json`: per cut, at its start, middle, end and every panel time, each figure's head (place in frame, size,
  covered or not and by what), its look (the angle between face and lens, screen left / right, whom it looks at), each hand (in
  frame, covered, raised, holding; a held prop's gap), body parts inside furniture, figures cut by the edge; per shot the subject,
  the size, the lens, the camera and its move; the lines, moves and panels; `built_from` (the hashes of what the scene was built
  from). The take json and `storyboard/vN/built-from.json` keep `built_from` too, so a stale take is found.
- **Shots file** `<G>-shots.json` in the generation's folder, found as the pre-submit check finds it: `generations/<G>` if it
  exists, else `blocks/<G>` if it exists, else a new folder under `generations/` (or `blocks/` when the film has no `generations/`):
  `{"duration": s, "shots": [{"id": "1", "t0", "t1", "in_frame": [...]}]}`, merged by id into an existing file (its other keys
  kept; ids this previz no longer has move to `retired_shots`). The pre-submit check (`tools/prompts/check.py`) reads it.
- **Storyboard pages:** `.venv/bin/python tools/previz/storyboard.py $FILM/previz/<G>/storyboard/<version>` turns `board.json` +
  `panels.json` into `page-N.png` (3300x2550, three panels a page in one row, sized for the film's ratio).
  `board.json` = `{"header", "ratio", "shots": [{"shot", "camera"}], "captions": [{"n", "caption"}]}`; every panel `n` needs a
  caption and every panel's shot an entry. Edit it by hand freely: once it no longer says `"generated_by": "previz kit"`, the
  kit keeps its words, but writes the camera lines again from the scene (a shot entry with `"camera_by_hand": true` keeps its own).
  A new version starts from the newest earlier hand-edited board (`kit/board.py`, by `--panels` and by `storyboard.py` when the
  folder has no board.json): the layout note and header kept, a caption carried only to the panel of the same shot and time and
  marked `"carried_from"`, which `precheck.py` reports until it is written again from the new frame and the mark deleted.
- **The whole film:** `.venv/bin/python tools/previz/assemble_film.py $FILM --generations G1,G2,...` stamps every generation's latest take
  (shot labels, dialogue captions) into `<film>/previz/film/<PREFIX>-previz-film-vN.mp4` (+ json) and gathers the latest
  storyboard pages into `<PREFIX>-storyboards-vN.pdf`, at the film's ratio. There is no default list.

## A location's views: the worked example
`examples/views/L01_views.py` is a location's views script, with a made-up walled courtyard as its room
(`examples/views/L01-room.json`). Copy it to `$FILM/previz/scenes/L0N_<name>_views.py` and change the cameras, the colour table
and the key points to the location's own; a film's copy builds its room from film.json (`room('L0N')`). It adds what the kit
has no mode for:
- `MASTER`, `TOP`, `FRONT`, `BACK`, `EAST`: the view cameras, every render 16:9 (set after `setup()`, for this location only);
  `TOP` is orthographic, straight down, north at the top. Thin dark outlines on every edge (Freestyle).
- `--plate <id> 0`: the kit's own plate, the empty room through one camera, to `$FILM/previz/L0N/plates/`.
- `--colour`: flat material colours by a table of object-name prefixes (`COLOURS`; an object with no colour is reported), a sky
  seen by the camera only, standard view transform.
- `--iter <name> --cams <ids> [--proj] [--grey] [--outsub <folder>]`: stills through the named cameras into `check/iter-<name>-<cam>.png`
  (or `<folder>/cam<id>-<name>.png`, never overwritten); `--proj` prints `PROJ <cam> <point> <x> <y>`, where each key point
  (`KEYS`) and the horizon land, in pixels at 2560x1440, to compare with the same points on the picture scaled to 2560 wide.
```bash
PY=.venv/bin/python; V=$FILM/previz/scenes/L01_<name>_views.py
$PY tools/previz/blender_run.py $V -- --film $FILM --res 1440 --samples 16 --plate FRONT 0
$PY tools/previz/blender_run.py $V -- --film $FILM --res 1440 --samples 16 --iter fit1 --cams MASTER,TOP --proj
$PY tools/previz/blender_run.py $V -- --film $FILM --res 1440 --samples 16 --colour --iter colour --cams MASTER,FRONT,BACK,TOP --outsub plates-colour
```
Run it only with `--plate` or `--iter`: any other mode writes a take and a shots file under `generations/L0N/`.

## Measuring a stage
`.venv/bin/python tools/previz/timing.py <film's session>.jsonl [--from ISO] [--to ISO] [--split ISO] [--runs] [--json out.json]`
reads the film's main thread and its sub-agents (`<session>/subagents/agent-*.jsonl`) and prints, per scene, every Blender run by
kind with its wait and run (from the wrapper's last line, else from the tool calls and the files' times), agent time, QC rounds
and scores, and the stage's totals; `--split` compares the runs before and after a time. Read-only. The session files are in
`~/.claude/projects/<the studio folder, every / and . turned into ->/`.

## Before the critic: the free checks
After every change, in this order (each takes seconds):
1. `blender_run.py <script> -- --film $FILM --facts` (or the `--check` / `--panels` / take that is due: they write the facts too).
2. `.venv/bin/python tools/previz/precheck.py $FILM <G> --write`: writes the kit's line into every shot of the scene file
   (`*Previz numbers (kit, <time>): size of SUBJECT (n frame heights) · lens · camera place, height, distance, facing, tilt, move ·
   in frame: who, where · who looks where*`, replaced on every run; the builder writes only what numbers cannot say) and the
   board's camera lines, then prints the checks: `size` (the size against the scene file's word), `sight` (named faces and hands
   in use in frame, big enough, not covered; an unnamed figure cut by the edge), `lens` (a face under 5° off the lens the shot
   does not ask for), `line` (screen sides kept across a cut and across the seam from the scene before; two people who look at each
   other look opposite ways), `reach` (a held prop within 6 cm of the palm), `inside` (no body in furniture), `timing` (each line's
   words at the scene file's "n words a second", else film.json `speech_wps`, default 2.6; a move mostly off screen), `panels`
   (the panels of a shot that show an action differ), `claims` (every screen left / right in the shot text and the captions
   checked by projection; names in "In shot" the camera never sees; film.json `"aliases": {"the captain": "MAREN"}` lets it read
   the text's names), `plate` (a shot off the plate its view was painted over), `stale` (the take or boards older than a change to
   what the scene is built from), `carried` (captions not yet written again). Exit 1 with any WARN; `--json <out>` keeps the list.
3. Write the captions again from the new frames (never patch them), run `precheck.py` once more, then the critic.
- `.venv/bin/python tools/previz/views_cams.py $FILM --write [--plates-from <film folder>]`: the camera of every painted view's plate
  in a Camera column of `locations/views.md` (from the plate's own record, else from the take nearest in time, marked "~").
- `.venv/bin/python tools/previz/qc_recheck.py $FILM <G> [--qc-dir <folder>]`: every miss an earlier QC round marked fixed, in
  `<qc-dir>/previz-<G>-fixed-misses.json`; the critic of round 2 and on looks at each first, and a miss that is back keeps its
  id, open and `"reopened": true`.

## Left for later
- **One trip for several modes**: one Blender run doing `--check --mannequin`, or `--take --panels`, on the scene it built. With
  reuse a second trip costs about a second of opening, so this matters less than it did.
- **Colour plates, fitting renders and a plan legend in the kit itself**: today they live in the views example.

## Known limits
Mannequins are blockouts: no finger curl (props ride the fist), no face animation, no hair or clothing; the eyes are dots fixed in
the head (a look is the head's turn). precheck's text reading is a heuristic: it reads "screen left / right" phrases and names,
and says what it found; a claim it misreads is a false alarm to ignore, not a reason to rewrite good text. IK elbows and knees
follow their poles; an extreme reach can flip an elbow (key the pole). Round and arched openings are boolean cuts in a straight
wall; walls must be axis-aligned to be named by compass (a numbered wall works on any outline). Screen-traced reflections only
mirror what is on screen. 16 samples leave soft-shadow grain.

Arched openings (`"shape": "arch"`) did not cut the wall in a test of the views example (the rectangular and round cuts did):
check an arch in a render, and use a rectangle if it is missing.
