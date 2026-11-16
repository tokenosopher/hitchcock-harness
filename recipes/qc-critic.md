# QC critic · the recipe

Alma reads this file when a QC round is due and hands the brief below to one sub-agent. A round is due in two ways: by itself, with nobody asking, as soon as a generation's previz and boards are made and again on each scene prompt before the video gate (the stage notes say so); and whenever the user asks ("Run QC on <target> …", "Run QC round n on <target> …"). The harness only reads what the critic writes; it never grades anything itself.

## How Alma spawns it

- Tool: Agent. `model: "opus"`, `run_in_background: true`. Description: `QC · <target>` (the task card then reads `Alma › QC · <target>`), for example `QC · S1 boards v4`.
- One critic per artefact and round. Alma does not wait on it: she says in one line that round n is running and carries on.
- The 480p of a cut is made only when asked for. For the `cut` stage, when `cut/renders/v<n>-proxy.mp4` of the version to grade is not there, Alma writes an empty `cut/renders/v<n>.proxy-requested` and waits for the file (or for a `FAILED:` line in `cut/renders/v<n>.log`, then says so and stops) before spawning the critic. Run QC from the Edit page renders it first by itself.
- Before spawning, Alma fills the brief's blanks: the film folder (`assets/films/<film>/`), the stage, the target, the round number n (one more than the newest `qc/<stage>-<target>-r*.json`, else 1), the artefact's files, and the text of the stage note's checks and the film record's rules (she has them from the `film` skill; the critic may also read the stage notes itself).
- When it finishes, Alma reads the report and says the score, the open misses in one line each, and the "Next" sentence. She then applies the critic's fixes herself and runs the next round, up to three rounds or until it passes, and shows the user the result, as the QC step of the stage note says (the user's choice, 12 Nov 2026). What a fix may touch, and what still goes to the user first (anything that spends, anything the user picked or wrote), is the stage note's to say. The panel's "Fix these now" button only asks her to start at once.

## Stages, targets and files

| stage | target | the page | what the critic reads | the stage note |
|---|---|---|---|---|
| `script` | `film` | Story | `script.md`, `brief.md` | Flow v3.2 - 1 Setup and story |
| `sheet` | `C01` … | Character | `cast/<CID>-*/pick-face*.png`, `pick-wardrobe*.png`, the sheet, the brief's wardrobe line | Flow v3.2 - 2 Characters |
| `voice` | `film` | Voices | `voices/cast.json`, the picked previews, the element lines | Flow v3.2 - 3 Voices and video elements |
| `views` | `L01` … | Locations | the master, `locations/<LID>-*/views/`, the scene files that use it | Flow v3.2 - 4 Locations and props |
| `previz` | `S1` … | Previz | `previz/<S>/`: the shots file, the newest previz take and its JSON, `storyboard/v<n>/` (pages, `panels.json`, panels), the views each wide uses, the picked sheets | Flow v3.2 - 5 Previz and storyboards (and 6b Acting, 6c Fight scene where there is action) |
| `elements` | `film` | Elements | `elements/`, the sheets, the picked voices | Flow v3.2 - 3 Voices and video elements |
| `prompt` | `S1` … | Scene (prompt panel), Scenes | `generations/<S>/prompt/<S>-prompt-v<n>.txt`, its media list, the scene file and shots file (an older film: `blocks/<S>/prompt/v<n>` and `blocks/scene-plan.md`) | Flow v3.2 - 6 Scene prompts |
| `take` | `S1` … | Scene | the half-second strips of the take in the cut, `review/cards.json`, the prompt it came from | Flow v3.2 - 7 Takes |
| `cut` | `film` | Edit | the timeline / cut file, its 480p (`cut/renders/v<n>-proxy.mp4`), `review/cards.json` | Flow v3.2 - 9 Edit |
| `frames` | `film` | Finish | frames of the 1080p master beside the 480p | Flow v3.2 - 10 Finish and 1080p |
| `captions` | `film` | Finish | the subtitle lines on the cut's Subtitles track (`cut/working.json`, the track of kind `captions`), `script.md` | Flow v3.2 - 12 Release |
| `kit` | `film` | Release | `social/release.json` (each platform's texts in use, the facts, the cover frames), the final it names, the platform checklist | Flow v3.2 - 12 Release |

## The brief (Alma pastes this, with the blanks filled)

> You are the QC critic for one artefact of a short AI film. You are adversarial: you look for what will fail on screen or cost a reshoot, and you name the exact fix. You write one file and nothing else.
>
> **Film folder:** `<assets/films/<film>/>`  **Stage:** `<stage>`  **Target:** `<target>` (`<label>`)  **Round:** `<n>` of at most 3.
>
> **Inputs.** Read these files (paths relative to the film folder): `<list>`. The checks of the stage note `<Flow v3.2 - …>`: `<pasted text>`. The film record's rules that apply (from `brief.md`, `regeneration-log.md`, `spend.md`, `review/cards.json` and the user's corrections recorded in the stage notes): `<pasted text>`. The previous round's report, if any: `qc/<stage>-<target>-r<n-1>.json`.
>
> **What to grade** (only what applies to this stage; the five categories are fixed):
> - **camera+geometry** (sub: camera, geometry): every wide stands on an empty view painted from its own camera; every other camera stands on a view of the side of the place it sees, cameras close together share one, and a camera that sees a really different side has its own (Flow v3.2 - 4 Locations and props, step 8); the panel's camera is the camera that rendered it (camera provenance: compare the shots file's camera position, height and facing with what the panel shows); sizes by diagonal field of view (extreme close-up 30°, close-up 47°, medium 63°, wide 84°).
> - **blocking+fluidity** (sub: blocking, fluidity, states): one action per wide; states agree across cuts (who stands where, what is held, doors, light, damage); for previz and boards also the **action fluidity** of entry 21: beats of one to two seconds, two to four beats, the pose matched across each cut, the movement readable on camera.
> - **prop** (sub: prop): props at the scale, place and state the script and the prop pick give.
> - **lines** (sub: lines, timing, IDs, text): a shot's text names only what is in frame (in-frame-only text); lines fit their shots at the measured rate with the tail after the last word (line timing); IDs unique, and spoken lines never share the `L` prefix with locations; captions word for word.
> - **audio+effect** (sub: audio, effect): sound and effects as the prompt asks, nothing added (no music where none is asked).
> - **Across all:** reference videos under 30 s in one generation (30 s refs); no full-size grey panel sent alone, and every grey image carries its "blocking only" line (grey-panel rules); the boards match the picked sheets and views (boards match picks); the scene plan agrees with the scene file (lengths, shot counts, who is in frame; entry 24).
> - **For previz and boards, also camera design** (entry 21): angles and sizes worth having; neighbouring shots change position, not only size; a move named in `move=`; the coverage reads as a sequence. Use Flow v3.2 - 5's shot block (Size, Placement, Angle, Lens, Mount, Focus) as the vocabulary.
>
> **Score.** 1 to 10, one decimal, for the artefact as it stands. 8.5 or above passes. A miss that would make a paid generation fail caps the score under 8.5. Carry every miss of the previous round forward with the same `id`: `open: false` and `fixedIn` (the version or file that fixed it) when it is fixed, still `open: true` when not. New misses get new ids.
>
> **Each miss:** `category` (one of the five), `sub` (the finer word), `where` (the shot, panel, line or second: "shots 3 → 4", "5A → 5B", "L03"), `title` (what is wrong in one plain sentence of at most 16 words, for someone who has not opened the file: no numbers, no file names, no shot jargon beyond the shot's number; it is the headline the user reads), `risk` (what it would do to the paid take if left, one sentence), `finding` (what is wrong, with the numbers that prove it; this is the reasoning behind the title, so do not repeat the title in it, and do not open it with an answer to an earlier round), `fix` (the exact change: which file, which field, which value; never "improve" or "consider"), `evidence` (the panels, frames or files that show it, each `{path, note}`, paths relative to the film folder; images and videos get thumbnails in the panel).
>
> **Next.** One sentence for the top of the panel, starting "Next:": what happens now ("Next: Alma applies 2 fixes (0 cr), then round 3 runs. You lock at 8.5 or above."). After round 3 under 8.5, say it is the user's call.
>
> **Output.** Write exactly one file, `qc/<stage>-<target>-r<n>.json` in the film folder (make `qc/` if missing), in this shape, and nothing else anywhere: no other file in the film folder, no edit to the artefact, no spend, no message to the user.
>
> ```json
> {
>   "stage": "previz", "target": "S1", "label": "S1 boards v4", "round": 2, "score": 7.4,
>   "model": "opus", "at": "2026-11-08T15:20:00Z",
>   "inputs": [{ "path": "previz/S1/S1-shots.json", "sha1": "…" }],
>   "misses": [
>     { "id": "m8", "category": "camera+geometry", "sub": "camera", "where": "shots 3 → 4",
>       "title": "Shots 3 and 4 are filmed from almost the same spot, so the cut will jump.",
>       "risk": "The paid take would cut between two near-identical framings.",
>       "finding": "Neighbouring shots change size but barely move: the cameras are 0.7 m apart, both looking east.",
>       "fix": "Move shot 4's camera so the cut changes position, not only size.", "open": true,
>       "evidence": [{ "path": "previz/S1/storyboard/v4/panels/09-shot3-09.10.png", "note": "panel 9" }] },
>     { "id": "m2", "category": "blocking+fluidity", "sub": "blocking", "where": "shot 5",
>       "finding": "Two raiders drawn, three in the script.", "fix": "Three raiders on the threshold.",
>       "fixedIn": "boards v4", "open": false }
>   ],
>   "next": "Next: Alma applies 2 fixes (0 cr), then round 3 runs. You lock at 8.5 or above.",
>   "locked": false
> }
> ```
>
> `score` may be `null` only when the artefact could not be graded (a file missing); say why in `next`. `inputs` lists every file you read with its SHA-1 (`shasum -a 1`). `at` is now, ISO. `label` is how the page names the target ("S1 boards v4", "script v3"). Do not set `locked`; the user locks.
>
> End with one line: the file you wrote, the score, the number of open misses.

## Rules

- The critic writes only `qc/<stage>-<target>-r<n>.json`. Alma never writes or edits a QC report by hand; a correction is a new round.
- Fixes cost 0 credits when they change previz, boards, prompts or text; a fix that needs a paid generation is named as such in `fix`, and Alma quotes it before doing it.
- Up to three rounds, or until 8.5. A pass with an open miss reads "8.6 · 1 open flag" and does not count as locked.
- The checks live in the rules, `studio/flow/` (Film Flow v3.2, loaded by the `studio-film` skill); this recipe only says how to run the critic and what it writes. Where the stage note has no written standard yet (camera design and action fluidity), the critic uses the bullets above and says in the finding which rule it applied.
