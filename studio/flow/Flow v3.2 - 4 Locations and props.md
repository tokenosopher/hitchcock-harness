---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 4 · Locations and props

**Purpose.** Design every location and prop in the locked script. From the user's pick of one picture per location, build the location's grey 3D room, the single source of where everything is, and make from it the plan from above, the master and a few empty views, a new one only where a camera sees a really different side of the place; the previz stages its scenes in the same room. Make an approved reference for every prop.

## Inputs
- The locked script and the brief: `$FILM/script.md` and `$FILM/brief.md` (the locations, the props, the aspect ratio, the look). `$FILM` is the full path to the film folder, in every path and command.
- The approved character sheets, `$FILM/cast/C0N-<name>/`, for the scale of every prop and for any prop state a sheet never shows.
- The room plan json format: "Describing a room from its plan and views" in `tools/previz/README.md`.
- For the views (step 8 on): each generation's previz and its cameras, the scene script `$FILM/previz/scenes/<G>_<name>.py` and its folder `$FILM/previz/<G>/`, from [[Flow v3.2 - 5 Previz and storyboards]].
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps
1. **Design every location before the previz.**
   - List every location in the script, abstract ones (a void, a mind) and small ones (a car, a corridor) included. Name what the place is: a police car, not "a car".
   - Run the first round of candidates at the script lock without asking for a go: the lock is the go. Say the round's size and cost in one line and log every paid job ([[Flow v3.2 - 0 Standing rules]]). If the user said during the script work that a location from an earlier film is reused, use that one instead of generating.
   - The library is the app's own: Hitchcock Harness keeps it in its sidebar, under Faces, Voices, Characters and Locations. It holds every pick across films. It is a source at the location pick, beside the new candidates.
   - When the story is historical, design each place and its props from the research of [[Flow v3.2 - 1 Setup and story]] (the site, the texts, the museum objects). Read the brief's location entry and the research before the first candidate.
   - Where the script or its sources name the place, start the candidates there, with its attested landmarks, and vary where in that place the action stands. Make the candidates different worlds only when the place is invented. Start from the user's references when there are any, or from text alone.
   - Spread every round wide in look. Keep each candidate true to the mood of the story's moment there.
   - Make every candidate wide: 16:9 at the largest size the model makes (`resolution: 4k`, `aspect_ratio: 16:9`) whatever the film's ratio, a three-quarter view that shows the place, never a portrait of one object.
   - A designed object the place is built around (a machine at the centre of a room) is made both ways: inside every location candidate, and on its own as prop candidates. Step 7 adds the third version, extracted from the picked place.
   - Make every new location and prop image with GPT Image 2.5 on Higgsfield (`generate_image`, `gpt_image_2_5`, `variant: sunburst`, `quality: high`, in the `locations` folder of `$FILM/higgsfield.json`). Make every edit of an earlier image (a prop's later version, a fix, a relight, an object extracted from the pick) as a Seedream 5.5 edit on Higgsfield, the image to change as Image 1, at its aspect ratio (the edit route: [[Flow v3.2 - 0 Standing rules]]). The views painted over a plate go to Seedream 5.5 first, with GPT Image 2.5 the fallback: step 10.
   - Write every location prompt by [[Flow v3.2 - 6d Anamorphic look]]: a named focus point, the lens in degrees, vertical oval bokeh on a named surface, a flare off a named source, the film stock by balance and speed, the tech tail.
   - Candidates, masters and the front and back views are 16:9: end their tech tail with `Aspect ratio 16:9.` Only a view made for one wide shot from that shot's own plate (step 10) is at the film's ratio, because the shot copies its exact framing. For such a 9:16 view: start at 35 mm (about 63°) and compose on height. Put the bright source near the centre line, because the frame edges cut a horizontal streak flare sooner. End the tech tail with `Aspect ratio 9:16.`
   - Put no real coats of arms, logos, badges or publication names in a set.
   - Show the candidates side by side on the Locations page, as a card that asks (a pick), each candidate with its ID, a one-line pitch, what the sources say about the place, and what the action needs from it (room to enter, the sun's side, a way out).
   - On each card, also say what the candidate's layout commits the scenes to: where the doors, the steps, the seats and the large pieces are, and what that means for the staging (who faces whom, who has their back to a door, what can be seen from where), and where it fights the script. The layout is costly to change once the room is built; the look is cheap, because it can be repainted over the same room at any time.
   - Read `taste.md` at the studio root and give the round's card your prediction of the pick, made from the earlier picks recorded there.
2. **GATE:** wait for the user's pick on the card: one picture per location, by ID. Add the pick to `taste.md` with the candidates, the user's words, the prediction and whether it was right. Add the pick to the library.
   - This is the only gate for a location. Put no master, plan or view in front of the user for approval, and ask for no mark-up by hand. Everything from step 3 on runs without asking.
   - Bring a layout question that changes how a scene plays (who faces whom, what a character can see) to the user once, as a card, at the pick or right after it. Decide everything smaller in the room and report it.
3. **Build the room from the pick.** Build the location's grey 3D room straight from the picked picture, with what the script needs of the place (a platform high enough to look up at, a door that looks onto a bench). Write it as the room plan json the previz kit builds from (Inputs).
   - Write `$FILM/previz/rooms/L0N-<name>.json`: the origin (a corner or the room's centre, on the floor), +X east and +Y north, the floor outline in metres, the openings (wall, centre along it, width, height, sill, a door's hinge; rectangular: an arched opening, `"shape": "arch"`, does not cut the wall in the kit yet, so draw an arch as a rectangle), raised floors and steps, the ceiling or wall heights, the wall thickness, the furniture heights. Take sizes from the picture (a person is about 1.7 m).
   - Large pieces only, as boxes, cylinders, tables, chairs and cables. Leave small dressing and designed detail out, so the boards stay grey and simple and the video model copies no finished design off a board.
   - Put the location's own light sources (windows, lamps, candles, screens, the sun) under `lights`, where the picture shows them: the boards carry the lighting.
   - Decide once, in the room, everything no picture shows: the sides behind the picture's camera and the ways in and out. Every view then agrees on them. Report what you chose.
   - Write the location's **lighting description** once: its sources, their direction and their colour. Use it in every view, edit and relight prompt of that place, so the light stays the same from clip to clip; change only the words that place the light relative to the direction a view faces (step 10).
   - Register the room in `$FILM/previz/film.json` as `"locations": {"L0N": {"name": "<the place>", "room": "previz/rooms/L0N-<name>.json"}}`. Create the file with only this key if it does not exist yet; [[Flow v3.2 - 5 Previz and storyboards]] adds the rest.
   - Write the location's views script, `$FILM/previz/scenes/L0N_<name>_views.py`, with one camera at the picked picture's own camera (step 4 fits it; step 9 adds the others):
     ```python
     import os, sys; sys.path.insert(0, os.path.join(os.path.abspath(__file__).rsplit('/assets/films/', 1)[0], 'tools', 'previz')); from kit import *
     setup('L0N', 1.0)                                    # plates go to $FILM/previz/L0N/plates/
     R = room('L0N')
     shot('PICK', 0, 1, <diag>, (x, y, z), (x, y, z))     # lens in degrees, camera position, the point it frames
     run()
     ```
   - The room is the single source of where everything is. Where a picture and the room disagree, the room holds, including what a camera at a given height can physically see (a low camera behind a chest-high block sees sky, not the sea beyond it).
4. **Fit the room and its camera to the pick.**
   - Read the camera from the picture: the horizon from converging edges, the camera height from a piece of known height, the lens from two pieces at right angles.
   - Print where the key points of every large piece (corners, feet, tops) land through that camera, in pixels at 2560 wide, and compare each with the same point in the picture, its pixels scaled to 2560 wide (the pick is made larger). Move the pieces and the camera and render again until every large piece is within about 1% of the frame width (about 25 px at 2560).
   - Keep the fitting renders and an overlay of the last one on the picture in `$FILM/previz/L0N/check/`.
5. **Render the plan from above.** Render the room through an orthographic camera straight down over the whole place, in the flat colours of step 9, and draw a legend on it in code: a label and the size of every large piece, a scale bar and a north arrow. File it as `L0N-<name>-plan-v<n>.png`. Never paint the plan with the image model and never draw it from a master. It is a working file: show it on the Locations page, and ask nothing about it.
6. **Hand the room to the previz.** [[Flow v3.2 - 5 Previz and storyboards]] stages every scene of this location in this same room, with `room('L0N')`, and builds the props at scale from their references. Write each scene file, or refit an existing one, to the room's coordinates and marks. The look of a place lives only in its views and prop references. Come back here when the generation's cameras exist.
7. **Make the props**, before the previz, so the previz builds them at scale.
   - One candidate each: a close-up reference of every prop that matters to the story, at its true scale against the sheets, in the location's light. State the size in the prompt ("a 3 to 4 mm brass stud").
   - A designed object the place is built around: extract it from the picked location as a Seedream 5.5 edit of the picked image, and show it beside its own candidates from step 1, on the same card that asks, so the pick can be either.
   - Story images that appear in frame (a hologram above a palm, a window onto a crowd seen from above) are props too: one each, all in one palette.
   - Give a screen something to do while a character works it: content that moves with the action (code appearing as they type, a loading bar).
   - Draw anything the audience must read (a dial, a sign, a paper, a headline) in code, or composite it from the real source, then set it into the plate in its light. The image model repeats and garbles numbers. Everything else carries no readable text: blank keys, code as a texture too small to read.
   - A plate that holds a drawn prop gets the drawing as a reference, so it sits in the room's perspective. Protect it in every later clean-up with the region composite (step 13).
   - **GATE:** show each prop on a card that asks, with your prediction of the pick from `taste.md`, and wait for the user's yes to each by ID, or the pick among a designed object's versions. Add every pick to `taste.md` with the candidates, the user's words, the prediction and whether it was right.
8. **Assign an empty view to every camera.** Every location gets a master (the picked picture's camera) and a front and a back view. Then, for each shot, write down where each character faces, and:
   - a close-up or a medium stands on the view **behind** the character, the reverse of what they face; their key light comes from what they face;
   - a wide gets a view of its own, painted from that shot's own camera and plate at the film's ratio, because the wide is the shot that shows the place. Two wides from the same camera, or from cameras a step apart with the same framing, share the one painted from it;
   - a camera that sees a really different side of the place from every view made so far gets a new view, made from its own plate;
   - a camera close to one that already has a view (a metre to the left) shares that view. A location ends with a few views, chosen to fit its different camera angles;
   - dialogue cut back and forth needs both sides of the room, so the model knows which way each shot looks.
   - Put every view camera at a height the scenes really use: standing eye height, seated, on the platform. Where the picture's own camera is at no such height, move the master camera to one, keeping its place, heading and lens.
9. **Render a colour plate for every view on the list** (Tools). Look at every plate (Checks).
   - Render each plate at full size, 2560x1440 (a wide shot's own plate at the film's ratio, 1440x2560 for 9:16), empty, in flat, distinct colours, one per material (stone, paving, plaster, tile, timber, foliage, water, sky), with dark outlines on every edge. The grey plates stay the previz boards.
   - The master, front and back views: one `shot()` each in the location's views script (`shot('FRONT', 0, 1, <diag>, (x, y, 1.6), (x, y, 1.6))`), rendered with `--plate <id> 0`. `--plate` takes a shot id only, so a view camera is a `shot()` there, never a `free_cam`. Run the views script with `--plate` only: any other mode writes a take and a shots file under `$FILM/generations/L0N/`.
   - Every other camera: the generation's scene script with `--plate <shot id> <t>`.
   - `--plate` removes the timeline markers, so the camera does not switch at render time, and hides every figure and what it holds, keyed visibility included, so a figure that enters mid-generation stays hidden.
10. **Paint the master and every view over its plate.** At 16:9 whatever the film's ratio; a wide's own view (step 8), from that shot's own plate, at the film's ratio (9:16 when the film is 9:16), because the shot's Placement line asks for exactly its camera, lens and framing.
    - Seedream 5.5 is the first choice. Paint every view on Seedream 5.5 first (`seedream_5_5`, the same two images and prompt, `resolution: 2k`, the view's aspect ratio) and measure it by step 11 like any painting; say on its card which model painted it and how it measured. GPT Image 2.5 on Higgsfield (`gpt_image_2_5`, `variant: sunburst`, `quality: high`, `resolution: 4k`, the view's aspect ratio, the plate and the pick as `image_references` in that order) is the fallback; use it for a view Seedream 5.5 fails, and say so on the card.
    - Image 1 is the colour plate: where everything is, the camera, lens and framing. Image 2 is the picked picture: its materials and light only. Give no other reference: no earlier painting, no master, no plan.
    - The prompt carries: a key to the colours (each colour named as the material and the piece it stands for; the outlines are only edges); "keep every edge of Image 1 where it is in the frame"; "do NOT use Image 2's camera, framing or background"; where each key piece sits as fractions of the frame (0 left or top, 1 right or bottom), read from the plate; the camera's height, direction and lens in degrees; the lighting description, its wording adjusted for the direction the view faces; a clause naming what does not exist in that direction (no sea in a view that faces inland); nothing added that Image 1 does not hold; the place empty of people; "absolutely no CGI or render look".
    - Frame the master as a three-quarter view that shows as much of the place as possible.
    - Put the story's marks on the set into the view itself (damage by the handle of a door someone is about to kick in).
    - A plate that is black because nothing lies that way: use it for the frame only and describe the view in words.
    - A light state the story needs (the room's main source dimmed) is a view of its own from the same plate.
    - Every empty view goes into the prompt with its pairing sentence (step 16).
11. **Measure every painting against its plate**, by its key points, before anyone sees it.
    - Mark the key points of every large piece in the plate and in the painting and measure the distance between each pair, both scaled to 2560 wide. Pass: every large piece within 40 px at 2560 wide (about 1.5% of the frame width), the right counts, nothing invented. Keep the side-by-side, the 50% overlay and the marked points in `$FILM/previz/L0N/check/`.
    - A painting that fails is repainted without asking, at most two repaints: the same plate and the pick, the prompt naming each piece that moved and where it must sit, in fractions of the frame. A painting still failing after them is shown on the Locations page with its remaining misses reported plainly.
    - Tell the user the count of repaints afterwards.
12. **Relight instead of re-rolling.** A good design that comes back too dark or in the wrong mood gets a Seedream 5.5 edit that keeps everything and changes only the light; measure it again (step 11) and re-check the counts and details against the image before it. A view must show its geometry and surfaces at the brightness a video reference needs, not only a mood.
13. **Fix from the plate.**
    - When a chain of edits drifts, paint again from the plate and the pick (step 10), with counts said outright ("exactly ONE desk, as in Image 1").
    - Put a small isolated fix back into the image by region only (`detail_composite.py --region`). If the edit moved things nearby and still reads right as a whole, use it whole.
14. **Show the location on the Locations page**: the plan, the master and each view beside its plate, with its ID, the cameras it serves, its measure and its repaints. Say in the thread what is up, with the repaint count. Nothing there asks for a yes. The user sees every view with the scenes it serves at "Go for the video?" ([[Flow v3.2 - 6 Scene prompts]]), and that go approves them; a view faulted there is painted again by steps 10 and 11 before any video. No generation's prompt uses a view that has not been measured.
15. **Make a reference for a prop state the sheets never show** (a sword the sheet shows only sheathed: the drawn blade in its true finish beside the empty scabbard).
    - Make it as a Seedream 5.5 edit with the character's sheet as Image 1, under its own prop ID.
    - Give the previz stand-in the same colour and re-render the boards ([[Flow v3.2 - 5 Previz and storyboards]]).
    - It goes into every shot that shows that part, with one fixed line naming it ("drawn from the black scabbard, the blade is bright polished steel").
    - A wardrobe or prop state worn by a character in a redo is a faceless sheet variant, a paid still with its own gate: the method in [[Flow v3.2 - 2 Characters]], the gate in [[Flow v3.2 - 8 Redos]].
16. **Put the views and props into the prompt** (its structure: [[Flow v3.2 - 6 Scene prompts]]).
    - Write one description per view and per prop, once, from its own prompt, as a `## KEY` section of `$FILM/generations/prompt-common.md` (from `templates/generation/prompt-common.md`: `## <LOC> FRONT`, `## <LOC> BACK`, `## <PROP TAG>`). Reuse it word for word in every generation as `@KEY`, which resolves only in a `## MEDIA` description or a `## TAGS` line. A view's description says whose background it is ("the background behind anyone who faces east").
    - In `$FILM/generations/<G>/<G>-prompt-spec.md` (from `templates/generation/prompt-spec.md`), each view is a `VIEW` line under `## MEDIA`, its file relative to the film folder: `VIEW | <LOC> FRONT | locations/L0N-<name>/L0N-<name>-front-v<n>.png | @<LOC> FRONT`. It is an image any shot may stand in front of. Give every camera an empty view, always; cameras close together share one (step 8).
    - Name each view by its `[TAG]` in the shots that stand in front of it: a view no shot names stops the pre-submit check.
    - Pair every empty view with the sentence that says the picture shows the set EMPTY and who is where, at the end of its `VIEW` description: "The picture shows the set EMPTY; it is the background of shot 2, where [A] sits in the chair at the table and [B] starts at the door." Without it the empty view empties the frame.
    - A wide stands on its own view and has the Placement line: "exactly [VIEW TAG], the same camera, lens, framing and look, with the people in it".
    - In a redo, use the shot's existing views; a camera that has none gets one made by steps 9 to 11 from the pick-up's own scene script, its plates under `$FILM/previz/FIX-<name>/plates/` ([[Flow v3.2 - 8 Redos]]).

## Checks
- Candidates: 16:9 at the model's largest size (`resolution: 4k`); the master and the front and back views 16:9; a wide shot's own view at the film's ratio. Candidates and the master are a three-quarter view of the place, never a portrait of one object. A named place starts from its attested landmarks.
- Every candidate card says what its layout commits the scenes to.
- The room against the pick: every large piece within about 1% of the frame width through the picture's own camera, from the printed points, with the overlay kept.
- The plan: a render of the room, orthographic and straight down, with its legend (labels, sizes, scale bar, north arrow); never a painting.
- Every plate: empty, full size, flat colours with outlines, and through the right camera at the right time, at a height the scenes use.
- Every painting against its plate (step 11): every large piece within 40 px at 2560 wide, the right counts, nothing invented; the camera, framing and background those of the plate, never of the picked picture.
- Every image, at full size, before it is shown: every detail against the room and the story. Whatever a view gets wrong, the take copies, so check the side of each object the camera sees (a monitor shows its dark back, not a lit screen).
- Every new view, in this order: the axis (the reverse of two facing things is shot down the line between them), then which wall each object belongs to, then left and right. Never fix a view by mirroring: it fixes only left and right and hides the real error.
- Set geography across views: the same furniture, doors and props in the same places in the plan, the master and every view, as the room has them; the light as in the lighting description.
- Empty of cast: no cast, no figures, no text, no second piece of furniture, nothing the room does not hold.
- Close-up views: the view is the one behind the character, and the key light comes from what they face.
- Brightness: geometry and surfaces read clearly.
- No real coats of arms, logos, badges or publication names.
- Props: true scale against the sheets and the stated size; surfaces as briefed; no invented letters; drawn text correct, every number once.

## Outputs
- `$FILM/locations/L0N-<name>/`: the candidates, the pick `L0N-<name>-pick.png`, the plan `L0N-<name>-plan-v<n>.png`, the master `L0N-<name>-master-v<n>.png`, the views (`L0N-<name>-front-v<n>.png`, `L0N-<name>-back-v<n>.png`, `L0N-<name>-wide-<G>-<shot>-v<n>.png`, any other camera or light state as `L0N-<name>-<what>-v<n>.png`), the lighting description.
- `$FILM/props/P0N-<name>/`: prop references `P0N-<name>-v<n>.png`, a designed object's candidates and its version extracted from the picked place, drawn readable props, prop-state references under their own prop ID.
- `taste.md` at the studio root: one entry per location and prop pick, with the candidates, the user's words, the prediction and whether it was right.
- `$FILM/previz/rooms/L0N-<name>.json`: the room plan json, built from the pick, registered under `locations` in `$FILM/previz/film.json`.
- `$FILM/previz/scenes/L0N_<name>_views.py`: the location's view cameras (the picture's camera, MASTER, FRONT, BACK, TOP and any other).
- The plates: the grey plates `$FILM/previz/L0N/plates/cam<id>-00.00-empty.png` from the views script and `$FILM/previz/<G>/plates/cam<id>-<t>-empty.png` (the time as `04.20`) from a generation's scene script; the colour plates the paintings are made from, beside them.
- `$FILM/previz/L0N/check/`: the fitting renders and their overlay on the pick; each painting's side-by-side, overlay and marked points against its plate.
- Beside every image: its prompt as `<name>.prompt.txt`. Every Higgsfield job's id goes into its `spend.md` row.
- `$FILM/generations/prompt-common.md`: one description per view and per prop. `$FILM/generations/<G>/<G>-prompt-spec.md`: the `VIEW` lines.
- `$FILM/brief.md`: each location under `## Locations` (the pick, the master, the plan with its compass, the views with the shots they serve) and each prop under `## Props`, as `templates/brief.md` lays them out, filled in as each is made or approved.
- Cards on the Locations page, written as the app's show recipe says: a card per candidate, the plan, the master, each view (beside its plate, with its measure) and prop, by ID. Only the location pick, a layout question (step 2) and the props ask for an answer.
- `$FILM/spend.md`: one row per paid job in the columns of `templates/spend.md`, stage `4 Locations and props`, priced from [[Flow v3.2 - 13 Services and costs]] (about 4.25 credits a GPT Image 2.5 still at high, 4k; 3.5 credits a Seedream 5.5 edit at 2k). Renders are free.

## Tools
Run from the studio folder. Templates: `templates/` (`brief.md`, `spend.md`, `generation/prompt-common.md`, `generation/prompt-spec.md`). The shape of a card: the app's show recipe. The room plan json has no template: its format is in the previz README.

The previz kit (`tools/previz/README.md`) has no mode for the colour plates: its normal render keeps only the colours of the lights, and `--grey` makes the grey boards; nothing paints flat material colours with outlines. It has no fitting mode: `--project` prints where named points land through one shot's camera, but nothing renders fitting stills. It draws no plan legend. The worked example is `tools/previz/examples/views/L01_views.py`: every render of a views script is 16:9 (set after `setup()` for that location's own renders only, whatever the mode and the film's ratio); its `--colour` flag recolours the room by a table of material colours with outlines on every edge; its `--iter <name> --cams <ids> [--proj] [--outsub <folder>]` mode renders fitting stills into `check/` (or, with `--outsub <folder>`, into that subfolder, `$FILM/previz/L0N/<folder>/cam<id>-<name>.png`, never overwritten) and prints where each key point lands in 2560x1440 pixels; its TOP camera is set orthographic. Copy from it into a new location's views script until the kit has these.

| Script | Command | Does |
|---|---|---|
| Higgsfield `gpt_image_2_5` | `generate_image` through the `higgsfield` MCP server, `variant: sunburst`, `quality: high`, `resolution: 4k`, `aspect_ratio: 16:9` (a wide's own view: the film's ratio), `folder_id` the `locations` folder of `$FILM/higgsfield.json`; references as `image_references` | First versions: location candidates and new props from text or references; the fallback for a view painted over its colour plate (step 10), the plate first, the pick second; never for an edit of an earlier image |
| Higgsfield `seedream_5_5` | `generate_image` through the `higgsfield` MCP server, the image to change as Image 1 (a local file uploaded first with `upload.py`), its aspect ratio, `resolution: 2k`, `folder_id` the `locations` folder of `$FILM/higgsfield.json` | Every edit of an earlier image: props' later versions, fixes, relights, a designed object extracted from the pick, prop states from a sheet; the first choice for the views over a plate (step 10) |
| `tools/higgsfield/upload.py` | `.venv/bin/python tools/higgsfield/upload.py plan $FILM <files>…`, then `put $FILM --response <saved media_upload response>` and `ids <files>… --film $FILM` | media ids for the plates and the pick, so they can go in as references |
| `tools/previz/blender_run.py` | `.venv/bin/python tools/previz/blender_run.py $FILM/previz/scenes/L0N_<name>_views.py -- --film $FILM --res 1440 --samples 16 --plate FRONT 0` | the empty room through one view camera, to `$FILM/previz/L0N/plates/`; `--res 1440` gives the full 2560x1440 plate |
| `tools/previz/blender_run.py` | `.venv/bin/python tools/previz/blender_run.py $FILM/previz/scenes/<G>_<name>.py -- --film $FILM --res 1440 --samples 16 --plate <shot id> <t>` | the empty set through one shot's camera, every figure and what it holds hidden, to `$FILM/previz/<G>/plates/` |
| worked example, fitting | `.venv/bin/python tools/previz/blender_run.py $FILM/previz/scenes/L0N_<name>_views.py -- --film $FILM --res 1440 --samples 16 --iter <name> --cams PICK,TOP --proj` | fitting renders into `check/`, and `PROJ` lines: where each key point lands, in pixels at 2560x1440 |
| worked example, colour plates | `.venv/bin/python tools/previz/blender_run.py $FILM/previz/scenes/L0N_<name>_views.py -- --film $FILM --res 1440 --samples 16 --colour --iter colour --cams MASTER,FRONT,BACK,TOP --outsub plates-colour` | the colour plates at 2560x1440, flat material colours with outlines, into `$FILM/previz/L0N/plates-colour/` (`--outsub` names the subfolder) |
| `tools/stills/detail_composite.py` | `.venv/bin/python tools/stills/detail_composite.py BASE.png EDIT.png OUT.png --region x0,y0,x1,y1` | takes the edit's pixels only inside the region; protects drawn props; unproven on a video-driven film |
| `tools/prompts/assemble.py` | `.venv/bin/python tools/prompts/assemble.py $FILM <G> --version vN` | builds the generation's prompt; pulls `@KEY` descriptions from `generations/prompt-common.md` and the `VIEW` lines from the spec; always pass the next version |
