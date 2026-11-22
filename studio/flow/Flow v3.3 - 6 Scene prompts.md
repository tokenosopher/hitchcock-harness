---
tags: [ai-filmmaking, film-flow, film-flow-v3-3]
version: 3.3
status: live
---
# 6 · Scene prompts

**Purpose.** One checked Seedance prompt per generation, with its ordered media list; then every generation's prompt and the assets behind it in front of the user in one place, for the one go for the video.

## Inputs
- `$FILM`: the full path to the film folder, in every command and path below.
- The generation's scene file `$FILM/generations/<G>/<G>-scene.md`, started in [[Flow v3.3 - 5 Previz and storyboards]] from `templates/generation/scene.md` and approved with the previz: the scene, the geography with its compass, `## START STATE`, `## END STATE`, `## Shots` with one `### SHOT <n>: <name> (CAM FACING: <compass>)` heading per shot, `## ACTING TASKS`, and `## FIGHT BEATS` when the generation has a fight. `assemble.py` reads only `## Shots`, `## ACTING TASKS` and `## FIGHT BEATS`, by those exact headings.
- The shots file `$FILM/generations/<G>/<G>-shots.json` (shape: `templates/generation/shots.json`): each shot's `id` is its SHOT number, and its `in_frame` list holds every `[TAG]` the shot names except the location views.
- The previz approved at its gate ([[Flow v3.3 - 5 Previz and storyboards]]): the latest `$FILM/previz/<G>/<G>-previz-take-<N>.json` (the shots, the moves in order, the lines, the generation's length) and the latest storyboard folder `$FILM/previz/<G>/storyboard/v<N>/` (`panels.json`, `page-*.png`).
- The generation's continuity sheet, written from the previz ([[Flow v3.3 - 5 Previz and storyboards]]): who stands where, what is in frame and what must not be, what the previous scene's last frame shows and what the next needs, costume sides, the sun.
- The approved character sheets ([[Flow v3.3 - 2 Characters]]); the video elements with their voices, finalized to 1080p on the user's say-so ([[Flow v3.3 - 3 Voices and video elements]]); the approved props and the empty views behind the cameras, every wide included, each measured against its plate; the views are approved with the go for the video ([[Flow v3.3 - 4 Locations and props]]).
- Shared descriptions in `$FILM/generations/prompt-common.md` (step 10).
- Standing rules: [[Flow v3.3 - 0 Standing rules]]

## Steps
1. Read the generation's continuity sheet, then the method note the generation needs, before you write. The previz is the source of camera, blocking and screen direction; the prompt agrees with it and with the continuity sheet. Where the prompt block or the wording of [[Flow v3.3 - 6b Acting]] differs from steps 2, 6 and 7 of this note, these steps hold: the scene direction and the line about the eyes are written once for the generation, not under each character; a visible change in the face is written; and the least acting text of step 2 is allowed when the prompt would pass its ceiling.
   - [[Flow v3.3 - 6a Prompt engine]]: to build or audit the generation's scene text, and whenever a scene does not work.
   - [[Flow v3.3 - 6b Acting]]: for every acting task, and whenever a face reads dead, flat or over-acted. Its line on facial beats points here; step 7 is the rule.
   - [[Flow v3.3 - 6c Fight scene]]: for any fight, hold, throw or weapon. A fight follows it in full (step 9).
   - [[Flow v3.3 - 6d Anamorphic look]]: for the anamorphic character in OPTICS and for STYLE, in degrees, not millimetres. Its focal-length table is for still plates; the video's lens degrees are the table in step 3.
2. Plan **one prompt per generation**: every shot of the generation in one Seedance job, the hard cuts inside.
   - The length is the lines spoken at each character's pace plus about 1 s a shot. Keep it tight, so the model does not pad by repeating lines.
   - Seedance takes whole seconds, 4 to 30, and the check stops outside that range. A stretch under 4 s goes into one generation with its neighbour.
   - `assemble.py` takes the length from the latest previz take, rounded up. If that length is off, fix it in the previz plan ([[Flow v3.3 - 5 Previz and storyboards]]) before you assemble.
   - **The prompt's size.** Aim at about 8,000 to 10,000 characters. Never go past about 15,000.
   - **Written to size, never cut down to it.** The scene file holds all the thinking and is as long as it needs to be; it is never sent. Write the prompt from it to fit the size. Never write a long prompt and then cut it down. Fill the prompt in this order: the shots and the spoken lines, word for word; the acting (below); the references by their tags, saying only what differs in this scene; placement only where the storyboard cannot show it; each constraint once. Say a fact once, in the section it belongs to.
   - A character with a video element or a sheet is named by its tag. What the references already show is not described again; only what differs in this scene is said (step 11).
   - **The acting in the prompt.** Every prompt carries acting text. At the least: the scene direction once, and for each person a shot is about, one intent and one visible change (a change in the face or an action of the body). Never send a prompt with no acting text.
   - When the prompt stays under about 15,000 characters with the acting tasks in full (steps 6 and 7), send them in full. When it does not, cut the acting tasks down to that least, and cut no further.
   - **One take a generation.** Do not split a generation into shorter takes to make room for acting text.
3. Write each shot in the scene file's `## Shots` in **the Nexus shape**. `assemble.py` copies the shots from there into the prompt.
   - Heading `### SHOT <n>: <name> (CAM FACING: <compass>)`. No seconds; the script adds the shot's panel numbers.
   - Then Size, Placement, Angle, Lens, Mount and Focus, a line each.
   - Then `In shot:` with every character and prop in frame by its `[TAG]` and what each does, in order, one short sentence an action.
   - An italic *Builder* line under a shot (the camera in metres and compass) is for Blender only. The script drops it.
   - Size: state it, and say it holds ("a close-up exactly as framed there").
   - Placement: place the camera by landmarks: what it looks at, where it stands relative to the set and to what is in frame.
   - Lens: the diagonal field of view for the shot size, the same as the previz camera: **extreme close-up 30°, close-up 47°, medium 63°, wide 84°**. Never 84° on a face. The Lens lines are the only place the prompt gives degrees.
   - Sizes, heights and angles are the previz's designed camera ([[Flow v3.3 - 5 Previz and storyboards]]): dialogue in close-ups (47°) and tight mediums (63°); a wide only where an object or the whole party needs it, brief, at most one a generation; physical action from the body's level; height and angle changing from shot to shot. Never change a size or an angle in the text alone; a shot that breaks this goes back to the previz.
   - Name the location view behind the shot by its `[TAG]` in the Placement line. A wide stands on its own view ([[Flow v3.3 - 4 Locations and props]], step 8); its Placement line reads "exactly [<LOC> WIDE], the same camera, lens, framing and look, with the people in it".
4. Write what is in each shot.
   - **A shot names only what is in its frame.** Never "behind the camera", "behind the lens", "off screen", "out of frame": the camera turns to what is named, and the check stops on them.
   - Describe an off-camera source only by its effect on what is in frame, or not at all. Give a gaze toward someone off camera as a direction only ("straight into the lens").
   - Name a prop only in the shots that show it. Never list a forbidden object by name. Never name a body part outside a close-up's frame, so the close-up does not widen.
   - **Every move in camera terms**: screen left or right, toward or away from the lens ("walks towards the camera, down the frame", "turns his back three-quarters to the camera"). Landmarks alone send people the wrong way. The camera placed by landmarks and the moves in camera terms do not conflict.
   - Read the moves from the previz take json, in order, never typed. Its seconds stay in the file, except a fight's beat timings (step 9). Text and boards that disagree give the model a choice you do not want it to make.
   - After a move, say where a prop sits in frame ("the hilt at the height of her sash, the blade in frame"). A rigid prop is "one rigid piece in every frame".
   - A carried prop is written into the hands that carry it, in every shot where the prop should be held.
   - When one person touches or points at another, name that person by what he wears ("the tall man in grey").
   - **From behind stays from behind.** When the boards show a character from behind, say so in every place the prompt describes that character for that shot: the reference line, the Placement, the `In shot:` line, the acting beat and POSITIVE CONSTRAINTS, each with "face turned away from the camera and never seen". This and a carried prop in the hands (below) are the facts said in more than one place.
   - Any crowd in frame moves: heads turn, people shift and lean to each other, a ripple at a joke. Never a frozen backdrop.
   - Beats written as separate steps play as separate steps. When an action leads into a line, write that it flows straight into the line.
   - State the intent and keep the hard facts: who, where, which line, which reference, which camera. Leave the small choices to the model. The prompt's size is in step 2.
   - A blocking change in the text needs boards that show it, because the model follows the picture over the words. Re-render the previz and the panels ([[Flow v3.3 - 5 Previz and storyboards]]), then reassemble.
5. Write the **close-up continuity lock** wherever a shot cuts to a close-up of the same person or the same object.
   - The wider shot ends with that person or object locked in the pose the close-up opens on: head position, eyeline, hands.
   - Write it on both sides of the cut in the scene file, so it is in the prompt on both sides.
   - The panels either side of the cut show the same pose. If they do not, the previz goes back to [[Flow v3.3 - 5 Previz and storyboards]].
   - In a redo of the wider shot, the pose comes from re-rendered grey boards on both sides of the cut, never from a frame of the film and never as an end image ([[Flow v3.3 - 8 Redos]]).
6. Write the scene file's `## ACTING TASKS`: one for every character in frame, listeners and silent characters included. Each gives the inner direction: scene direction, motive, goal, obstacle, tactic, then moment to moment ([[Flow v3.3 - 6b Acting]]).
   - Write "fully invested in the tactic; the work happens in the eyes" once for the scene, with the SCENE DIRECTION, never after each character's ACTING TASK heading.
7. Write **the faces**, the same way for speakers and listeners.
   - Write the face beats only in `## ACTING TASKS`, in each character's moment to moment. The `In shot:` lines hold the actions and the lines, never a face beat.
   - On each line, physical beats name the visible change of the face: brows, mouth, eyes, a smile forming or going, a nod. Two to four small beats in order through the line, positive and moderate. A still carries one expression; the video needs the change through the line.
   - Never a bare emotion word ("sadly", "nervously"): a verb aimed at the partner, and what the face does.
   - Never stillness words: "unblinking", "deadpan", "a beat of perfect stillness", "dead straight". The model plays them literally. A deadpan line is a dry delivery, not a frozen face.
   - Keep eye beats small, because they get exaggerated ("slow blink" plays as long closed eyes). Prefer brow and mouth beats.
   - End `## ACTING TASKS` with one line for the generation: the faces stay alive while they speak, never frozen and never exaggerated, with natural blinking.
8. Write **the dialogue**.
   - Every line word for word, in English, in the voice of its reference. The model rewrites anything looser.
   - **Every line on its own row.** In a shot's `In shot:` lines the actions go in order, one short sentence each. Every line sits on its own row as `SPEAKER: "words"`, right after a sentence whose subject is the speaker ("[MAYA] speaks, low, to him:"), with no other character named in between. Never quote a line inside a description sentence.
   - Quote each line once as dialogue, plus its AUDIO entry. Never quote a line's words in a direction, in a shot or in a spec section, because quoted words get spoken again. In the ACTING TASKS a beat may be labelled by its line's words.
   - Place an action that belongs to a line by description ("as she finishes", "on the last words"), never by a clock time.
   - Where a short line leaves spare time, write "she says it once, then holds, silent", so the time is not filled with speech.
   - A generation that opens on a line says it starts on the very first frame: no silence, no in-breath, no pause before it.
   - **Never write a beat before a line.** A pause lives inside a line only.
   - When a generation continues the one before, each gets only its own lines. Split a line that runs across two generations at the cut; each generation speaks only what its shots show. The join: [[Flow v3.3 - 9 Edit]].
9. Write a fight from [[Flow v3.3 - 6c Fight scene]], following it in full.
   - Two to four beats, each one to two seconds, in order, in the scene file's `## FIGHT BEATS`. Each beat: its shot and its timing in seconds, read from the previz take json; the position; the strike, limb and target; the physical reaction; the new position. FIGHT BEATS is the only place the prompt may hold seconds, besides the total length.
   - The same beats go, in order and without seconds, into the shots' `In shot:` lines.
   - POSITIVE CONSTRAINTS hold the style (for example: every kick below the belt; the first visible motion is the strike).
   - Shrink the stage ("everything within 2 m of the desk"). The starting positions come from the boards. Mediums show the move; close-ups sell the contact.
   - No martial-arts terms and no prohibitions in the prompt body: body geometry and positive wording only.
   - Add a `## FIGHT STYLE LOCK` section to the spec holding the words of the style's lock line, exactly as in the method note's references (`moves-catalog.md`, or the style's file under `styles/`). The assembler emits it after POSITIVE CONSTRAINTS. Write it only there, not in the scene file's FIGHT BEATS, so it is said once.
10. Write the spec `$FILM/generations/<G>/<G>-prompt-spec.md`, copied from `templates/generation/prompt-spec.md`: the hand-written parts.
    - Use only the `## ` headings of step 12's table, spelled as there. Any other `## ` heading stops the check (STOP 11), because its text would never reach the prompt; `check.py --explain` lists the headings the assembler knows.
    - Delete each guidance comment as you fill its section, and leave no `<…>` placeholder: a leftover `@` or `<…>` stops the check. Delete a section you do not need.
    - `## MEDIA`: one reference per line, `KIND | TAG | file | description`. KIND is VIDEO, IMAGE, VIEW (an empty location view) or AUDIO; the file is a path relative to `$FILM`; the order is step 11's. Lines starting with `#` are skipped.
    - `## TAGS`: tags described in words, each pointing at a reference by `[TAG]` or `{IMAGE:TAG}`. Each line becomes a line of ACTIVE REFERENCES. End with `@SHEETS ONLY` whenever the generation has a video reference.
    - The text sections of step 12's table that come from the spec.
    - Write a description used by more than one generation once, as a `## <KEY>` section of `$FILM/generations/prompt-common.md`, copied at the first generation from `templates/generation/prompt-common.md`: `## <NAME>` (the character, ending with its VOICE line), `## <NAME> SHEET`, `## <GROUP TAG>`, `## <PROP TAG>`, `## <VOICE TAG>`, `## <LOC> FRONT`, `## <LOC> BACK` and `## SHEETS ONLY`.
    - Call it as `@KEY` in a MEDIA description or a TAGS line, the only two places it resolves. The longest key wins, so `@MAYA SHEET` is not read as `@MAYA`. An `@KEY` anywhere else stays in the prompt and stops the check.
    - Write `{IMAGE:TAG}`, `{VIDEO:TAG}` or `{AUDIO:TAG}` wherever text in the spec or the scene file needs a reference number. Nothing is typed twice.
11. Build **the reference list** in `## MEDIA`. Seedance numbers references per kind in media-list order (VIDEO REFERENCE n, IMAGE REFERENCE n, AUDIO REFERENCE n), and the prompt uses those numbers.
    - **VIDEO**: the video element of each character in the generation, at its 1080p finalize; an element still at 480p goes back to its finalize, which goes out on the user's yes to its draft ([[Flow v3.3 - 3 Voices and video elements]], step 25). The description is `@<NAME>`, which carries "VOICE: the voice heard in this reference", then what differs here: what the character holds, in which hand, the state of the clothes. Never describe again what the element or a sheet already shows, here or in the `@<NAME>` sections of `prompt-common.md`. The exact character-reference line: [[Flow v3.3 - 3 Voices and video elements]]. The `@SHEETS ONLY` line in TAGS declares them character sheets only.
    - **A character with a video element gets ONLY the element. The one case beyond that: a fourth such character in a scene goes in as a picture and a voice reference (the limits below).** Never put its sheet beside it: the two compete. There are two exceptions. One is a faceless sheet variant for a costume or prop state the element does not show. The other is a character's second look (other clothes, some years on): the same video element plus that look's sheet, and the prompt says which clothes he wears in place of the clip's. A second element is made only if the first look's clothes come back in the take ([[Flow v3.3 - 3 Voices and video elements]]). A voice that comes out off does not call for a new element.
    - **Every person seen in a shot has a reference.** A character with a video element has the element. Everyone else has a picture, extras included. Only the background crowd has none.
    - **IMAGE**, then **VIEW**, in this order: a sheet only for a character with no element, and any sheet the exceptions above allow; for extras, their group picture cropped to this scene, holding only the people the scene shows, in the order the camera sees them; a reference each for extras who look alike; the props in frame; **the empty view behind each camera, always** (front, back, or a view made from that camera's own plate), each saying what it controls. A shot shares a view only when that view shows its background well; any other shot has its own, and when the views would pass the 30 images, those that matter most go in and the pages carry the rest ([[Flow v3.3 - 4 Locations and props]], step 8). The script adds the storyboard pages after them.
    - Beside the pages' reference numbers the script writes: "Position only: 3D previz, mannequins and placeholder models that give camera, framing, placement and screen direction; no look is taken from them."
    - A wide's view: its description says the picture shows the set EMPTY, and who is where in it for this shot ("in this shot the woman sits at the table, the man starts at the door"), or the empty view empties the frame.
    - A picture given only for a look (for a view that has no picture of its own) is said to be only the look far behind ("only the look of the house fronts far behind"). The people and the action go in the shot's own lines.
    - **AUDIO** only for a voice that no element carries. Name it in AUDIO by `{AUDIO:<VOICE TAG>}`.
    - **`start_image` and `end_image` stay EMPTY**, and no frame of the film is ever a reference. The first frame is described in words, from the first panel.
    - The set holds only what the scene shows: the elements of the characters in it, the sheets and prop pictures this step allows, the empty views behind its shots, the wide views, the storyboard pages of its shots. Nothing else, and never a frame of a take or of any video.
    - Never a previz video: it carries motion and look, not only staging. The pages replace it.
    - Never a panel, plate or Blender frame on its own: a single full-size grey panel becomes the look of the clip. Panels go in only on pages.
    - At most 30 images. Reference videos at most 30 s in total. At most three reference videos.
    - When more than three characters with a video element are in the scene, the three who act most get their video elements. When two tie, the third element goes to the one who speaks more in that scene ([[Flow v3.3 - 3 Voices and video elements]], step 35). Each one beyond them is given as a picture and a voice reference (AUDIO).
    - The cap on the total number of references is not known yet. Find it with a few cheap probes on the next film.
    - How a redo's set is built: [[Flow v3.3 - 8 Redos]].
    - **Tags, the way `check.py` reads them:**
      - A tag is capitals, digits, spaces and underscores, starting with a capital (`[A-Z][A-Z0-9_ ]*`), in square brackets wherever the text names it.
      - A character's VIDEO tag is the tag the shots name them by (`VIDEO | MAYA | …` and `[MAYA]` in the shots). A faceless sheet variant beside the element takes that tag plus ` SHEET` (`IMAGE | MAYA SHEET | …`); it counts as shown wherever `[MAYA]` is.
      - Every reference appears as a `[TAG]` in at least one shot: a view in the Placement line of each shot it stands behind, a prop in the shots that show it, a member of a group through a TAGS line that points at the group's reference.
      - Every `[TAG]` in the text is a MEDIA tag or a TAGS line.
      - Every tag a shot names, location views excepted, is in that shot's `in_frame` list in `<G>-shots.json`, and everything in that list is named in the shot by its `[TAG]`.
12. The assembler writes **the prompt sections in this order** and skips any the spec and the scene file leave empty. Fill the spec headings exactly as written here.

    | # | Section in the prompt | Written in | What it holds |
    |---|---|---|---|
    | 1 | SCENE CONTEXT | spec `## SCENE CONTEXT` | the look, the film's ratio, the place in a line, the tone in a word; what happens, in order; the length, the number of shots and hard cuts |
    | 2 | ACTIVE REFERENCES | the script, from `## MEDIA` and `## TAGS` | every reference with its tag, its number and what it controls; the TAGS lines; the sheets-only sentence; the pages with their position-only line |
    | 3 | LOCATION MAP | spec `## LOCATION MAP` | the geography as fixed facts: what lies at each end, the furniture, who stays outside every frame; no start positions |
    | 4 | COMPASS (fixed backdrop) | spec `## COMPASS` | what lies north, east, south and west |
    | 5 | FIRST FRAME AND SPATIAL BLOCKING | spec `## FIRST FRAME AND SPATIAL BLOCKING` | the first frame in words, from panel 1 and the scene file's START STATE: the shot, who is already where; the only place for start positions. When the generation is the next moment after the one before, it opens with where the one before left every character who is in both: the same place, facing the same way, the same posture, holding the same things |
    | 6 | FORMAT MODE | spec `## FORMAT MODE` | a controlled multi-shot sequence, the total length, the number of shots, hard cuts; no length per shot |
    | 7 | OPTICS | spec `## OPTICS` | the lens fixed within a shot; anamorphic character on the practical lights; no degrees (the Lens lines hold them) |
    | 8 | CAMERA | spec `## CAMERA` | locked off or one controlled move; which shots move, and how |
    | 9 | SHOT sections | scene file `## Shots` | one per shot, in order, in the Nexus shape, with the panel numbers the script adds |
    | 10 | ACTING TASKS | scene file `## ACTING TASKS` | every character in frame with its face beats, the invested line once, and the faces-alive line |
    | 11 | FIGHT BEATS | scene file `## FIGHT BEATS` | fights only (step 9) |
    | 12 | PHYSICS | spec `## PHYSICS` | how each moving thing moves with weight; what is one rigid piece |
    | 13 | LIGHTING | spec `## LIGHTING` | the practical sources and their colours; what changes, by the action |
    | 14 | AUDIO | spec `## AUDIO` | English only; every line numbered in order with its shot and speaker, word for word; who never speaks; the sounds in order; no music of any kind, no narration, no subtitles; one AUDIO LOCK line per speaker on their reference (`{VIDEO:<NAME>}`, or `{AUDIO:<VOICE TAG>}`) |
    | 15 | STYLE | spec `## STYLE` | the film stock, grain, blacks, palette and anamorphic marks ([[Flow v3.3 - 6d Anamorphic look]]) |
    | 16 | QUALITY | spec `## QUALITY` | readable faces and hands at held moments, natural motion blur, stable anatomy |
    | 17 | POSITIVE CONSTRAINTS | spec `## POSITIVE CONSTRAINTS` | say what is there: exactly who is in frame by shot, what stays the same, the number of hard cuts; who is seen from behind (step 4) |
    | 18 | FIGHT STYLE LOCK | spec `## FIGHT STYLE LOCK` | fights only: the style's lock line, word for word (step 9) |
    | 19 | STORYBOARD | the script | the closing line: follow the panels in order, each a key frame of its shot; match camera position, framing, screen direction and action; cut only where the shot number changes; the panels are 3D previz stand-ins and every look comes from the references and the text |

    - Fill `## LOCATION MAP` and `## CAMERA`. The template also carries `## GEOGRAPHY` and `## CAMERA STYLE`, which the assembler emits as well; delete them, so nothing is said twice.
    - The total length is the only number of seconds the prompt may hold outside FIGHT BEATS.
    - **One home per fact**, so the prompt never holds two versions of it: what a character holds, its reference line in `## MEDIA` (step 11); start positions, FIRST FRAME; lens degrees, the Lens lines (step 3); readable faces, QUALITY; face beats, ACTING TASKS (step 7); the invested line, once per scene (step 6). From behind and a carried prop in the hands that carry it are the exceptions (step 4).
13. Assemble the prompt and its media list with `assemble.py` (Tools), always with `--version`: `v1` for the first, then the next number for every change. Without `--version` the script writes v1 over the first version. Every version the user saw stays on disk.
14. Run `check.py` with the same `--version` and with `--explain`, and save its output (Tools). On any STOP, read what it means (printed under the STOP lines), fix the source (the scene file, the spec, `prompt-common.md`, the shots file, the media), reassemble and re-run until the last line reads PASS. Never edit the assembled prompt by hand.
15. Do the manual read under Checks. Fix in the sources, reassemble, re-run the check.
16. Run the QC critic on the prompt without being asked: it reads the prompt, its media list with every picture in it, the scene file, the shots file and the continuity sheet, grades them 1 to 10 against this note's Checks and names the exact fix per miss. Fix in the sources, reassemble, check, and run it again, up to three rounds or until 8.5. How a QC report is written: the app's QC recipe (`recipes/qc-critic.md` in the app's folder; its full path is in your instructions).
17. Put the generation on a card on its scene's page, as the app's show recipe says (the card says it is about the generation): the prompt text, the media list in reference order with every image and video shown at its number and tag, the storyboard pages, the generation length, the check output ending PASS, and the QC score.
18. **GATE: Go for the video?** When every asset is ready and every generation's prompt and media list has passed steps 14 to 16, stop.
    - Put every generation in one place for the user's review: each generation's card on its scene's page, the Scenes page listing them all, each card with its scene, its prompt and the exact assets fed into it. Say in the thread that they are up, the Scenes page named as a link.
    - Quote the first take of every generation with `get_cost: true` ([[Flow v3.3 - 7 Takes]]), and give the quote per generation and the total.
    - Ask "Go for the video?" once, as one card that asks for a go with the quote on it; the app lists it on the Go page. One answer covers the first take of every generation; there is no separate yes per prompt.
    - A change, before or after the go, makes the next version of that prompt: edit the sources, assemble, check, manual read and QC again, put it on its card, and show it to the user again before it is submitted. The one exception: a change after the go needed only to get a first take through (a refusal, a filter, Higgsfield's limit of references) is sent under the go and reported, as [[Flow v3.3 - 7 Takes]], step 6 says.
19. After the go, submit the first take of every generation, `count: 1` each, without asking again. Takes for different scenes are all submitted at the same time; takes for the same scene go one at a time: [[Flow v3.3 - 7 Takes]]. A second take, a redo or a pick-up keeps its own quote and its own go: [[Flow v3.3 - 8 Redos]].

## Checks
**The pre-submit check is a script, not a read-through.** `check.py` prints one numbered STOP line per failure, then `<n> STOP(S): do not submit`, and exits 1; `--explain` adds what each of those STOPs means below that line. With none, its last line reads PASS and it exits 0.
- STOP 0: a file it needs is missing (the prompt or media list of that version, `<G>-shots.json`, the previz take, a media file), or more than 30 images.
- STOP 1: a reference no shot names by its `[TAG]`, or a voice audio never named in AUDIO.
- STOP 2: a Blender panel, plate or frame on its own, in the media list or the take medias.
- STOP 3: storyboard pages without the "Position only" line beside their reference numbers.
- STOP 4: reference videos over 30 s in total, or more than three reference videos.
- STOP 5: a shot names a tag that is not in its `in_frame` list, or says "behind the camera", "behind the lens", "off screen" or "out of frame", in any spelling.
- STOP 6: something in a shot's `in_frame` list without its `[TAG]` in that shot.
- STOP 7: a `[TAG]` with no reference behind it, or a "REFERENCE n" that is not the n-th of its kind in the media list.
- STOP 8: seconds outside FIGHT BEATS (a shot range, a hard cut at a time, seconds after a line, a clock time, a number of seconds other than the total length); a shot not in the previz plan, or a plan shot not written; a line not word for word; a length that does not fit the previz take, or one outside 4 to 30 whole seconds.
- STOP 9: a generation ID (S1, S2…), a take number, Blender, previz or Builder talk, the words "the user", a working note or a leftover `@` in the prompt.
- STOP 10: a `start_image` or `end_image`, or a frame of the film (a file from a take or the cut), among the references or the take medias.
- STOP 11: a `## ` heading in the spec that `assemble.py` does not know.
- STOP 12: a template placeholder `<…>` or an unresolved `@KEY` left in the prompt.

It reports the prompt's length and says where it sits against the sizes of step 2 (inside the aim, over the aim, past the ceiling); it does not stop on it. The manual read checks the size (step 2).

**After a refusal** ([[Flow v3.3 - 7 Takes]]). Nothing is banned beforehand. When a prompt is refused, read it for words that are not safe for work, or lean that way ("bare", "weeping"), and replace those. Then make the next version: steps 13 to 16. When the risky word is in a spoken line, replace it there too, send again, and tell the user what was changed. The script and the subtitles follow: they show the word that was spoken in the take that is in the film. This is the one case where a line's words change without a new go.

**The manual read**, for what the script cannot see. Do it before the QC and the gate:
- the prompt is about 8,000 to 10,000 characters and never past about 15,000; no character with an element or a sheet is described beyond its tag and what differs in this scene;
- open every storyboard page and every view in the media list and compare them with the text shot by shot: each shot's Size and Placement lines, the locks either side of each cut, the order of the action, FIRST FRAME against panel 1, the view behind each camera against the panel's background. Fix the text to the boards; a board that is the error goes back to [[Flow v3.3 - 5 Previz and storyboards]];
- the prompt agrees with the continuity sheet: who stands where, what is in frame and what must not be, costume sides, the sun;
- hunt for repeats and competing details and cut them: each fact in its one home (step 12), no fact said twice in different words, no detail that fights another;
- every character the boards show from behind is said to be from behind in every place step 4 names;
- every line comes right after a sentence naming its speaker, no other character named in between; no line's words quoted in a direction (an acting-task beat labelled by its line's words is fine);
- the prompt carries acting text: at the least the scene direction once and, for each person a shot is about, one intent and one visible change; when the prompt stays under about 15,000 characters, every character in frame, listeners too, has an acting task and two to four face beats on each line; all of it in ACTING TASKS only; no bare emotion word, no stillness word; eye beats small; the invested line once; the faces-alive line is there;
- no beat before a line; an opening line starts on the first frame; an action leading into a line flows straight into it;
- every move is in camera terms and in the previz json's order; props are placed after moves; rigid props are one piece; any crowd moves;
- off-camera things only by their effect; no body part outside a close-up's frame;
- FIRST FRAME AND SPATIAL BLOCKING matches panel 1 and the scene file's START STATE;
- **the seam** ([[Flow v3.3 - 5 Previz and storyboards]], step 4): when the generation follows the one before in the same place with no time passing, FIRST FRAME and the first action lines put every character who is in both where the last lines of the prompt before left them: the same place, facing, posture and what each holds (step 12). The take is judged by eye ([[Flow v3.3 - 7 Takes]]). A broken seam is fixed ahead of most other faults; a previz that breaks it goes back to [[Flow v3.3 - 5 Previz and storyboards]];
- every close-up lock is written on both sides of its cut, and the panels either side show the same pose;
- each shot's size, lens degrees (step 3) and view agree, and no face is shot at 84°; each wide view carries its EMPTY sentence and its Placement line;
- a fight has two to four beats of one to two seconds, no martial-arts term and no prohibition in the body, and its FIGHT STYLE LOCK word for word, once;
- the generation length is the lines at pace plus about 1 s a shot;
- open every reference in the media list yourself: the 1080p element per character that has one, with no sheet beside it except the two exceptions of step 11; the sheet for one without; the extras' group picture cropped to the scene, in camera order; a reference for every person seen, the background crowd excepted; no more than three reference videos; the right empty view behind each camera; the pages in order; nothing that is not on step 11's list;
- every carried prop is in the hands that carry it in every shot where it is held; a person touched or pointed at is named by what he wears; a look-only picture is said to be only the look far behind.

**The QC critic** (step 16) grades the prompt against these checks, up to three rounds or until 8.5, before the gate.

## Outputs
Per generation `<G>` and prompt version `<v>`:
- `$FILM/generations/<G>/<G>-prompt-spec.md`: the hand-written spec; shot, acting and fight text stays in `<G>-scene.md`.
- `$FILM/generations/prompt-common.md`: the shared descriptions, one file for the film.
- `$FILM/generations/<G>/prompt/<G>-prompt-<v>.txt`: the prompt.
- `$FILM/generations/<G>/prompt/<G>-media-<v>.json`: the ordered media with kinds, tags, roles and reference numbers, the generation settings, the previz take and storyboard used (shape: `templates/generation/media.json`).
- `$FILM/generations/<G>/prompt/<G>-check-<v>.txt`: the check output, ending PASS.
- `$FILM/qc/prompt-<G>-r<n>.json`: the QC critic's report per round.
- The generation's card on its scene's page with the prompt version, and the user's one go for the video, given on its card, covering the first take of every generation.

## Tools
Run every command from the studio folder (your working directory).

| Script | Command | Does |
|---|---|---|
| `tools/prompts/assemble.py` | `.venv/bin/python tools/prompts/assemble.py "$FILM" <G> --version <v>` | Builds the prompt in step 12's order from the scene file's shots, acting tasks and fight beats, the latest panels per shot, the spec and `prompt-common.md`; writes the prompt txt and the media json under `prompt/`. Without `--version` it writes v1. |
| `tools/prompts/check.py` | `.venv/bin/python tools/prompts/check.py "$FILM" <G> --version <v> --explain 2>&1 \| tee "$FILM/generations/<G>/prompt/<G>-check-<v>.txt"` | The pre-submit check: numbered STOP lines and exit 1 on any failure, PASS and exit 0 otherwise; `--explain` adds what each STOP in the output means. |
| `tools/prompts/check.py` | `.venv/bin/python tools/prompts/check.py --explain` | Prints what every STOP means and the spec headings the assembler knows. |
