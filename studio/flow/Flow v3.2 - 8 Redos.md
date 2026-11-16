---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 8 · Redos

**Purpose.** Make a pick-up or reshoot of the shots the user names, built exactly like a first pass, and land it as a take of its own generation `FIX-<name>`, where the Edit page lists it under its scene to be tried in place.

## Inputs
- The user's redo list from the full-video check ([[Flow v3.2 - 7 Takes]]): the shots by their previz shot labels, and why each needs redoing. Or the user's ask to retake a named shot.
- The approved take of the generation `<G>` that holds those shots: `$FILM/generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4`, with its `stt.json` and `transcript.txt` in the same take folder.
- The prompt that made that take, `$FILM/generations/<G>/prompt/<G>-prompt-vN.txt` (the `version or take` column of `$FILM/spend.md` names its version), and its media lists beside it: `<G>-media-vN.json` and `<G>-take-medias-vN.json`.
- The generation's previz: the scene script `$FILM/previz/scenes/<G>_<name>.py`, the previz take `$FILM/previz/<G>/<G>-previz-take-N.json`, the storyboard `$FILM/previz/<G>/storyboard/vN/`, the shots file `$FILM/generations/<G>/<G>-shots.json`.
- Every reference that media list names: the empty views per camera, the character elements, the faceless wardrobe references, the props. For a sheet variant, the character's locked sheet `$FILM/cast/<CID>-<name>/pick.png`.
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps
1. **Try the edit first.** Answer every note with the footage that exists: a trim, a cut, a re-assembly, an audio fix, by the fix ladder in [[Flow v3.2 - 9 Edit]].
   - A request phrased as an edit ("cut the draft", "trim shot 4") is an edit and nothing else.
   - Only when a new generation is the one fix: tell the user what it would change and what it costs, then stop. Never start a generation in reaction to a note or a remark.
   - The user's explicit ask to retake a named shot is not a note: it is the go for that retake. Skip this step and build it (step 13).
   - When only one figure or object in a shot is wrong, the new generation to offer first is a Seedance video edit of that shot alone, with only that figure or object changed. A pick-up comes only if the edit does not fix it.
   - A word that came out wrong, in this order:
     1. First, 4 second Seedance probes of the word, said in various ways: one quote and one go for the whole set, all made on that go. A probe is a pick-up of the shot the word is in, 4 seconds long, built as a pick-up is (steps 2 to 11) with that shot's own references and storyboard panel and the sentence as it is; each probe writes the word a different way (spelled by its sound, a hyphen between its syllables, another stress). Name them `FIX-<word>-<G>-a`, `-b`… and land each like any pick-up.
     2. If the probes do not give it, take the voice from the video and clone it on Higgsfield: the character's voice stem from the takes ([[Flow v3.2 - 11 Sound and music]], step 8) made into a voice with `create_voice_from_confirmed_audio`, as [[Flow v3.2 - 3 Voices and video elements]] says. Make many variations of the word in that voice, said in different ways that make sense for that moment. `voice_change` on the clip, into the character's voice, is the other route.
     3. Either way, give the user all the options as video, with the sentence as it is: the take or the cut that contains the word. The user chooses.
2. **Define the span.**
   - Default: the whole shot, cut to cut. Find the shot's cut points in the approved take: `cuts.py` gives the take's own cuts in seconds and frames, and the take folder's `transcript.txt` gives the words with their times. Regenerate the full span, with a second or two of room if the new pacing is slower. Never regenerate a slice of a longer shot to splice back into it: a fragment adds a splice inside one performance and caps how far the pacing can change.
   - When the user asks for the whole take: the whole continuous stretch of the character's performance, every shot of it in one generation with the cuts inside.
   - When the redone shot cuts into a close-up of the same person or object: the whole take (the wider shot and the close-up in one generation) is the surest span. Offer it in the quote. When the user keeps the redo to the wider shot, the lock comes from the boards (step 4).
   - Seedance takes 4 to 30 seconds, in whole seconds. A redo shorter than 4 s is done together with the scene before it or the one after it, whichever is shortest and makes the most sense. Never pad it with held time before or after, so the characters do not talk strangely or leave long pauses.
   - A wide that fails in its generation: redo it alone, 6 to 8 s, spliced at the hard cut, with the plain set of step 8.
   - Notes on several shots get one pick-up reel: one generation holding only the shots that change, written like a scene prompt. The shots that do not change stay from the take, cut in between at the take's own shot changes.
   - Each redo is a generation of its own, named `FIX-<name>` for what it fixes and the generation it comes from (such as `FIX-door-S4`), in its own folder `$FILM/generations/FIX-<name>/`. Separate generations meet only at hard cuts.
   - Write the span down as the shot labels it covers (`4`, `5`): the previz shot labels.
3. **Write the continuity sheet** before anything is built, in `$FILM/generations/FIX-<name>/FIX-<name>-continuity.md`, from the pieces in play, in words:
   - who stands where in each redone shot, from the previz marks;
   - what is in frame and what must not be (props, people);
   - what the last frame of the shot before the span shows and what the first frame of the shot after it needs;
   - the costume sides (which side a pin, a strap or a scabbard sits on);
   - the sun: its side and height.
   The boards, the references and the prompt follow the sheet.
4. **Re-render the boards for the new action**, in the pick-up's own folders, never in the parent generation's. The previz is the source of the camera, the blocking and the screen direction.
   - Copy the scene script to `$FILM/previz/scenes/FIX-<name>.py`. Change its `setup('<G>', …)` to `setup('FIX-<name>', …)`, so it writes under `$FILM/previz/FIX-<name>/` and `$FILM/generations/FIX-<name>/`. Change only the redone action.
   - List the panels in its `run(panels=[(shot id, t, caption), …])`: one plain panel per beat of the redone shots, no others.
   - Render them grey through each shot's own camera (`blender_run.py` with `--grey --panels --version vN`). They land in `$FILM/previz/FIX-<name>/storyboard/vN/panels/` with `panels.json` and `board.json`, and the run writes the pick-up's shots file `$FILM/generations/FIX-<name>/FIX-<name>-shots.json` with each shot's `in_frame` list.
   - Lay them out on storyboard pages with `storyboard.py`, as a new storyboard version. The boards carry the lighting, the placement and the camera. The previz kit's rules hold: [[Flow v3.2 - 5 Previz and storyboards]].
   - Into a close-up: the panel before the cut shows the pose the close-up opens on (head position, eyeline, hands), and the panel after the cut opens on the same pose.
5. **Build the reference set exactly as a first pass, and nothing else.** Start from the approved take's media list and keep only what the redone shots use:
   - one empty view per camera: the painted background for each shot's camera, empty of people. A wide reuses the view from its own camera made in the first pass.
   - the re-rendered storyboard pages of the redone shots.
   - each character as their video element, which carries the face, the costume and the voice, plus faceless wardrobe references. No still image of the face at all.
   - the props the shots show.
   - `start_image` and `end_image` empty. Continuity with the footage around the redo comes from the references and the words.
   - The references are only the previz panels of the redone shots, the empty location views, the sheets and the prop pictures. Never a frame of a take or of any video, even cleaned up, and never a photoreal picture of the cast staged in the scene, in any reference set.
6. **Make a sheet variant for every wardrobe or prop state the redo must show** (a sword drawn, a sheath empty, a coat torn). A state no reference shows drops out of the take. The edit method is in [[Flow v3.2 - 2 Characters]].
   - A Seedream 5.5 edit of the character's own sheet on its studio background (`seedream_5_5` on Higgsfield, the sheet as Image 1; the edit route: [[Flow v3.2 - 0 Standing rules]]), with the state changed and nothing else.
   - Crop it to the body, below the face, so the face comes only from the element. Keep the face only when the change is about the face itself, which is rare.
   - Crop to the part of the body the shot frames: a full-length view can pull the framing wide.
   - Save it and its crops in `$FILM/generations/FIX-<name>/refs/`.
7. **GATE: the sheet variant.** It is a paid still. Quote it in credits from [[Flow v3.2 - 13 Services and costs]] on a card that asks for the go, and wait for the go. Then show it with its ID on a card that asks for the yes, and wait for the user's yes on that ID ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]). The redo's quote comes only after every variant it uses has its yes. A retake the user asked for keeps this gate too: the variant is quoted and waits, and the retake goes only after the variant's yes.
8. **A failed wide gets the plain set.** The photoreal view from the shot's own camera, plain, with the sentence that it shows the set empty and who stands where in this shot; the board page or pages of this shot only, one plain panel per beat; the elements; the location views and props the shot shows. No annotations. Never a Blender panel on its own at full size.
9. **Write the media list** `$FILM/generations/FIX-<name>/prompt/FIX-<name>-media-vM.json` by hand, in the shape of `templates/generation/media.json`, from the set of steps 5 to 8.
   - Number the references per kind in media order, the storyboard pages after the other images. No `start_image` or `end_image` role.
   - `storyboard`: the pick-up's storyboard folder, `previz/FIX-<name>/storyboard/vN`.
   - `previz_take`: the parent's `previz/<G>/<G>-previz-take-N.json`, with `"span": ["4","5"]` holding the redone shots' labels. The check then takes the shots, the lines and the length from those shots alone, and accepts a generation from the span's length rounded down to two seconds over it.
   - When the new action needs more time than that: render the variant as a previz take as well (`blender_run.py` with no mode flag) and name its `previz/FIX-<name>/FIX-<name>-previz-take-N.json`, with the same `"span"` when it holds more shots than the redo.
   - `settings.duration`: the redo's length, set from the lines: the real length of every line in the redo at the character's pace, by the duration rule in [[Flow v3.2 - 6 Scene prompts]], in whole seconds.
10. **Write the prompt from the approved take's prompt.** Copy that file to `$FILM/generations/FIX-<name>/prompt/FIX-<name>-prompt-vM.txt` as the pick-up's next version and cut it to the redone shots. Never overwrite a version.
    - Keep every action and acting line word for word.
    - Keep the storyboard's own shot numbers (`SHOT 4`, `SHOT 5`), also in a reel. Never renumber the shots.
    - Trim the scene context, references, location, lighting, audio and constraints to the redone shots. The pick-up's prompt keeps to the size rule of [[Flow v3.2 - 6 Scene prompts]].
    - Renumber the reference lines to the pick-up's media list: each `[TAG]` line under ACTIVE REFERENCES names its kind and number in media order, and the pages' line reads `IMAGE REFERENCES a TO b` with its "Position only" sentence.
    - Write the fix as plain clauses that name exactly what changes. Mark nothing inside the prompt: no tag such as NEW, no old wording in brackets, no note to yourself, so the model reads only the scene and the check passes. The diff against the approved take's prompt is the record of the fix.
    - Drop only what the prompt rules of [[Flow v3.2 - 6 Scene prompts]] forbid, such as per-second timings. The shape stays: shot order, who says what, the expression beats in order, the total duration as in the media list.
    - Describe the first frame in words from the first panel.
    - Into a close-up: name the locked pose on both sides of the cut (head position, eyeline, hands). In a whole take, write the lock across the cut inside the prompt.
    - A prop that moves: say where it sits in frame after the move ("the handle at waist height, the whole blade in frame") and that a rigid prop is "one rigid piece in every frame".
    - Never write a prompt from scratch, and never patch the pick-up's own prompt take after take. A further take starts again from the approved take's prompt, as the next version.
    - Save the diff beside the prompt as `FIX-<name>-prompt-vM.diff`.
    - Write the set-up card, as the app's show recipe says, on the page of the scene the pick-up belongs to: which lines stay word for word and what the fix clauses say.
11. **Run the pre-submit check** (`check.py $FILM FIX-<name> --version vM`) and the checks below. It reads the pick-up's folder: the prompt and media list in `prompt/`, the span, `FIX-<name>-shots.json` (the parent's shots file when the pick-up has none) and the take medias. A pick-up has no prompt spec, so the spec-section check is skipped. Fix every STOP before the quote; `--explain` says what each STOP means.
12. **Quote the whole span**, never the fragment, as in [[Flow v3.2 - 7 Takes]]: upload the new files (the pages, the variants) with `upload.py`, write the medias list to `prompt/FIX-<name>-take-medias-vM.json`, preflight the cost. Put on the set-up card: the span (which shots, cut to cut, how many seconds), the reference list, the prompt diff, the set-up text and the cost. Make it a card that asks for the go, the pick-up's name in its `for` and the cost as its quote, and say in the thread that it is up and on which page.
    - A retake the user asked for: do the uploads, the medias list, the preflight and the set-up card the same way, but give no quote and write no card that asks. Go straight to step 14.
13. **GATE:** the user's go for this redo, by its pick-up name: a press on its go card, or the user's own words naming it. Wait. A go is a word from the user that names the thing. A note or a remark is not a go, and a sentence that could mean voice work or an edit is not a go for video. Each redo, and each further take of it, needs its own go.
    - **A retake the user asks for is its own go.** When the user explicitly asks to retake a named shot, do not quote it and do not wait: build it by steps 2 to 11, run any quality check the prompt needs, and submit it (step 14). Send no progress messages on the way. Report once, when the take has landed and been checked: what was made, what it cost, what the check found. Its row still goes into `spend.md`, with the user's ask in the go column.
    - That go covers one take of the shot or shots the user named. It does not cover a further take after that one (the user asks again), a whole scene the user did not ask to redo, a paid still or sheet variant the retake turns out to need (step 7), or a redo you propose yourself. Each of those is quoted and waits.
    - If the retake would take the film over its budget, stop and say so instead of sending it. If the filter refuses it, check the prompt for not-safe-for-work words and words that lean that way and replace those, a word inside a spoken line included ([[Flow v3.2 - 7 Takes]], steps 23 and 24), and report the refusal and what you changed.
    - Before any batch over 50 credits (several redos or takes at once), say the count and the cost back and wait for the go, however clear the request seems.
14. **Generate and land** as in [[Flow v3.2 - 7 Takes]]: one generation, `count: 1`, `start_image` and `end_image` never set.
    - Land it with `land.py --kind pickup --id FIX-<name>`: the clip goes to `$FILM/generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-480p.mp4` with `FIX-<name>-take<N>.jobid` beside it, its card at the very top where the app shows it. It has landed when its file is in that take folder and plays in the Hitchcock Harness: on its scene's page, and cut into its shots on the Edit page's Takes view, listed under its scene ([[Flow v3.2 - 7 Takes]], step 10). Say in the thread what landed and on which page.
    - Then the same checks and the same human checks as a generation's take. Add the redo checks after landing (below).
15. **GATE:** the user names the keeper by its take ID (`FIX-<name>-take<N>`): a card that asks, a pick among the pick-up's takes. Propose any fix and wait. A further take comes only after the user's notes, built the same way.
16. **Place it in the edit on the user's word** ([[Flow v3.2 - 9 Edit]]). Report how many frames longer or shorter the pick-up runs than the span it replaces: everything after it moves.
    - The span is replaced on the Edit page: the user tries the pick-up's shots in place from the Takes view, or you write the swap as one change of the cut on the user's word, the shots of the span replaced by the pick-up's (from a pick-up made with a neighbour, only the shot needed) and everything after moved by the difference. How: "Replace a take" in the app's edit recipe (`recipes/edit.md` in the app's folder; its full path is in your instructions). The note of the change names the pick-up and the span.

## Checks
- **The span.** The redo starts at or before the shot's first cut point and ends at or after its last, with room for slower pacing; it is never a slice of a longer shot; it runs 4 to 30 whole seconds; it holds no padded time; a short shot rides with its neighbour.
- **The lock frame pair.** Before the go: the board panel before the cut and the one after it show the same pose (head position, eyeline, hands). After landing: the last frame before the cut against the first frame after it, pulled by frame index into the take folder, judged at full size.
- **The continuity sheet.** Written before the boards; the boards, the references and the prompt agree with it.
- **The references.** No face still (no sheet head view, no face crop, no frame with a face). No frame of a take or of any video. No photoreal picture of the cast in the scene. No `start_image` or `end_image` in the media list or the take medias. Every wardrobe and prop state the footage around the redo shows has a reference, each variant with the user's yes by ID. Only what the redone shots use. One empty view per camera. No Blender panel alone at full size. Every board from `previz/FIX-<name>/`.
- **The prompt diff.** `diff -u` the approved take's prompt against the redo's. Every removed line belongs to a shot not redone, is a per-second timing, or is a reference line renumbered. Every added line is a fix clause, the first-frame sentence or a renumbered reference line. Every action and acting line is word for word. No marker of the fix inside the prompt.
- **The pre-submit check.** `check.py` ends with PASS for the version you quote.
- **After landing.** The framing and the light against the footage on either side of the cut; every character who is also in that footage looks to be in the same place and posture across the cut ([[Flow v3.2 - 7 Takes]], the seam); every prop that moves, in frame and in one piece; every line once, in order; the tail after the last word ([[Flow v3.2 - 7 Takes]]).

## Outputs
- `$FILM/generations/FIX-<name>/`: the pick-up's own generation folder.
  - `prompt/`: each version's `FIX-<name>-prompt-vM.txt`, `FIX-<name>-prompt-vM.diff`, `FIX-<name>-media-vM.json` and `FIX-<name>-take-medias-vM.json`, never overwritten.
  - `FIX-<name>-continuity.md`: the continuity sheet.
  - `FIX-<name>-shots.json`: the redone shots with their `in_frame` lists, written by the variant.
  - `refs/`: the sheet variants and their crops.
  - `takes/take<N>/`: one folder per take with `FIX-<name>-take<N>-480p.mp4`, `FIX-<name>-take<N>.jobid`, `stt.json`, `transcript.txt`, the checks and the lock frames.
- `$FILM/previz/scenes/FIX-<name>.py`: the variant scene script. `$FILM/previz/FIX-<name>/storyboard/vN/`: the re-rendered panels, `panels.json`, `board.json` and the pages.
- In the Hitchcock Harness: the set-up card and each sheet variant before the go (for a retake the user asked for, the set-up card before submitting, with no card that asks), then the take's card with the findings after landing; the take on the Edit page's Takes view, under its scene.
- Once the user's word places it: the change of the cut that puts it in, one step in the cut's history.
- `$FILM/spend.md`: one row per paid job (the redo, each sheet variant edit, a blocked job at 0) under the header of `templates/spend.md`, the user's go in its column.
- The report to the user: the frame difference against the span it replaces. For a retake the user asked for, one report when the take has landed and been checked: what was made, what it cost, what the check found.

## Tools
Run every command from the studio folder (your working directory).

| Script | Command | Does |
|---|---|---|
| `tools/edit/cuts.py` | `.venv/bin/python tools/edit/cuts.py $FILM/generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4` | The take's length, frame count and own cuts (scene score above 0.18), in seconds and as the frame number of each new shot's first frame: the cut points of the span. |
| `tools/stt/transcribe.py` | `.venv/bin/python tools/stt/transcribe.py $FILM $FILM/generations/<G>/takes/take<N>` | The take's words with times, `stt.json` and `transcript.txt` in its take folder, from Whisper on the Mac, free ([[Flow v3.2 - 7 Takes]], step 12; `tools/stt/README.md`). A cached `stt.json` is reused. |
| `tools/previz/blender_run.py` | `.venv/bin/python tools/previz/blender_run.py $FILM/previz/scenes/FIX-<name>.py -- --film $FILM --grey --res 540 --samples 16 --panels --version vN` | Renders the variant's panels, grey, through each shot's own camera into `$FILM/previz/FIX-<name>/storyboard/vN/panels/`, with `panels.json`, `board.json` and `$FILM/generations/FIX-<name>/FIX-<name>-shots.json`. `--check` renders three frames per cut instead; no mode flag renders the variant as a previz take. |
| `tools/previz/storyboard.py` | `.venv/bin/python tools/previz/storyboard.py $FILM/previz/FIX-<name>/storyboard/vN` | Lays the panels out on storyboard pages, three a page, at the film's ratio. |
| Higgsfield `seedream_5_5` | `generate_image` through the `higgsfield` MCP server: the sheet `$FILM/cast/<CID>-<name>/pick.png` as Image 1 (uploaded first with `upload.py`), `aspect_ratio: 16:9`, `resolution: 2k`, `folder_id` the pick-up's folder of `$FILM/higgsfield.json`; save the result as `$FILM/generations/FIX-<name>/refs/<variant>.png` | The sheet variant, a Seedream 5.5 edit; its job id goes into the `spend.md` row. |
| `diff` | `diff -u $FILM/generations/<G>/prompt/<G>-prompt-vN.txt $FILM/generations/FIX-<name>/prompt/FIX-<name>-prompt-vM.txt > $FILM/generations/FIX-<name>/prompt/FIX-<name>-prompt-vM.diff` | The prompt diff against the approved take's prompt, kept as the record of the fix. |
| `tools/prompts/check.py` | `.venv/bin/python tools/prompts/check.py $FILM FIX-<name> --version vM [--explain]` | The pre-submit check on the pick-up's folder and span: STOP lines and exit 1 on any failure, PASS when there is none. `--explain` adds what each STOP means; alone it lists them all. |
| `tools/higgsfield/upload.py` | `.venv/bin/python tools/higgsfield/upload.py plan $FILM <files…>`, then `put $FILM --response <saved media_upload json>`, then `ids <files…> --out $FILM/generations/FIX-<name>/prompt/FIX-<name>-take-medias-vM.json` | Uploads the new files once, never printing a signed link, and writes the medias list in the prompt's order ([[Flow v3.2 - 7 Takes]]). |
| `tools/film/land.py` | `.venv/bin/python tools/film/land.py $FILM --kind pickup --id FIX-<name> --take N --url-file <file with the result URL on line 1> --job <job id> --title "<card title>" --section "<section heading>" [--credits N]` | Lands the pick-up in `generations/FIX-<name>/takes/take<N>/` under its unique names and puts its card at the top where the app shows it. |
| `ffmpeg` | `ffmpeg -v error -y -i <clip>.mp4 -vf "select=eq(n\,<frame>)" -fps_mode passthrough -frames:v 1 $FILM/generations/FIX-<name>/takes/take<N>/lock-<frame>.png` | One frame by frame index, never by seeking: the lock frame pair. |
