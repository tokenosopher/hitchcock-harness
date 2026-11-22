---
tags: [ai-filmmaking, film-flow, film-flow-v3-3]
version: 3.3
status: live
---
# 7 · Takes

**Purpose.** Turn each generation's approved prompt into a landed, checked take in its own folder (uploaded, quoted, generated, shown in the Hitchcock Harness, transcribed, checked), with a record of exactly what was sent to the model; put each take in its boards' place on the film's timeline the moment it lands, before its checks; once every generation has a take on the timeline, render the whole film at 480p and have the user watch it for the full-video check.

## Inputs
- `$FILM`: the full path to the film folder, `assets/films/<film>` under the studio folder, in every command. `<G>` is a generation (`S1`, `S2`…; a pick-up is `FIX-<name>`), `<N>` a take number, `vN` a prompt version.
- The generation's approved prompt `$FILM/generations/<G>/prompt/<G>-prompt-vN.txt` and its media list `<G>-media-vN.json` beside it (shape: `templates/generation/media.json`), through the pre-submit check, and the user's yes to "Go for the video?" ([[Flow v3.3 - 6 Scene prompts]]). A pick-up comes from its own folder `$FILM/generations/FIX-<name>/`, built in [[Flow v3.3 - 8 Redos]].
- The generation's shots file `$FILM/generations/<G>/<G>-shots.json` with its lines, and the previz take json its media list names under `previz_take` ([[Flow v3.3 - 5 Previz and storyboards]]).
- Every reference the prompt uses, approved by ID: the character elements ([[Flow v3.3 - 3 Voices and video elements]]), the location views and props ([[Flow v3.3 - 4 Locations and props]]), the storyboard pages ([[Flow v3.3 - 5 Previz and storyboards]]).
- What `new_film.py` made ([[Flow v3.3 - 1 Setup and story]]): `$FILM/brief.md` (the title, the ratio), `$FILM/higgsfield.json` (workspace id, project id, a folder id per generation under `folders.generations`; shape: `templates/higgsfield.json`), the upload registry `$FILM/generations/upload-registry.json`, `$FILM/spend.md` (its one header from `templates/spend.md`) and `$FILM/regeneration-log.md`.
- The Hitchcock Harness running on the film, so a landed take shows on its scene's page and on the Edit page.
- Standing rules: [[Flow v3.3 - 0 Standing rules]].

## Steps

### Submit a take
1. Make one Seedance 2.5 job per generation: every shot of the generation in it, the cuts inside it. The script is already cut into generations ([[Flow v3.3 - 1 Setup and story]]). The duration is whole seconds, 4 to 30.
2. Before the first call of a session, read the model's parameters: `models_explore` with `action: get` for `seedance_2_5`.
3. Upload every file of the media list that has no media id yet or has changed after its upload. A file goes up once. Signed links never appear in the thread, in a log or on a command line.
   1. Run `upload.py plan` with every file of the media list. It says per file new, changed, same or unknown, saves the pending batches beside the registry, and prints the `media_upload` arguments, 20 files a batch.
   2. Call `media_upload` with exactly those arguments. Save its response to a file with the file tool, without printing it.
   3. Run `upload.py put` with that file (`--batch K` when there are several batches). It PUTs each file to its slot with `curl`, records the media id, sha1, size and type in the registry, deletes the response file and prints the `media_confirm` calls. A failed PUT stays pending and the script prints the `media_upload` call for new slots: repeat 2 and 3 for it.
   4. Call `media_confirm` as printed, once per type.
4. Write the media list as it will be sent: `upload.py ids` with the media list's files in its order and `--out $FILM/generations/<G>/prompt/<G>-take-medias-vN.json`. Each reference becomes its role plus its media id, in the order the prompt numbers them. It refuses a file changed after its upload: upload that file again. A take after the user's notes gets a new version of the prompt file, the media list and the take-medias file. Never overwrite any of them (`--out` refuses an existing file).
5. Quote the cost. Preflight the exact params of step 7 with `get_cost: true`; nothing is submitted.
   - A 480p draft cost 3 credits a second when this note was written: a 24 s generation is 72, a 9 s pick-up 27. The preflight is the price.
   - Quote a redo for the whole shot or the whole take, never a fragment.
   - When you put a quote in money, say which rate you used, the user's plan rate or the top-up rate, read from the user's own plan (`balance`, `show_plans_and_credits`; [[Flow v3.3 - 13 Services and costs]]).
   - Check `balance` before promising a whole stage.
6. **The go.** The first take of every generation runs on the user's yes to the one "Go for the video?" at the end of [[Flow v3.3 - 6 Scene prompts]]; its quote is the say-back for the whole batch. After that yes, submit the first take of every generation at the same time, `count: 1` each, without asking again, and land each one as it finishes (steps 7 to 16). Takes for different generations are all submitted at once. Takes of the same generation go one at a time: one take, so the user can check it before another of that generation is made. The stop of step 17 is for fixes, not for the first takes of other generations.
   - **The first round runs without stopping.** Make every generation's first take and put it in the timeline, without a stop or a card in between, until every generation has a take on the timeline (step 21).
   - **A change needed only to get a first take through** is made and sent under the go for the video, never held on a card: a refusal or a filter (steps 23 and 24), a reference over Higgsfield's limit of references, or any other block of the same kind. Make the fewest changes that get it through, as the next prompt version and media list (step 4), send it, and report what changed and why in the thread and on the take's card.
   - A go is a word from the user that names the thing: the yes to "Go for the video?", a generation or pick-up named by its ID, or the user's explicit ask to retake a named shot ([[Flow v3.3 - 8 Redos]], step 13). A sentence that could mean voice work or an edit is not a go for video. Notes or feedback on a take are not a go.
   - **GATE: a second take.** A second take of a generation, and anything after the user's notes, keeps its own quote and its own go. Write a card that asks for the go, for this one generation by its ID, with the prompt and media list versions, the duration and the credits as its quote ([[Flow v3.3 - 0 Standing rules#Showing the work and judging]]), and wait for the go. It comes only after the user's notes on the first take.
   - Before any batch over 50 credits, say the count and the cost back and wait for the go, however clear the request seems.
   - Each job its own call, `count: 1`, never a batch call.
7. Submit with `generate_video`:
   ```
   model: seedance_2_5
   mode: omni_reference
   aspect_ratio: <the film's ratio in brief.md: 9:16 or 16:9>
   resolution: 480p
   draft: true
   generate_audio: true
   count: 1
   use_unlim: false
   duration: <whole seconds, 4 to 30>
   folder_id: <folders.generations.<G> in higgsfield.json>
   prompt: <the prompt file's text>
   medias: <the take-medias file's list, in its order>
   ```
   - `use_unlim: false` goes on the quote and on the submit, so the job is paid from credits and the call never stops to ask which balance pays. Use a free-trial allowance only when the user asks for it.
   - Roles: `video_references` for the character elements, 30 s in total at most ([[Flow v3.3 - 3 Voices and video elements]]); `image_references` for sheets, wardrobe crops, props, location views and storyboard pages; `audio_references` for a voice that has no element.
   - **480p means draft.** Every 480p Seedance 2.5 job carries `draft: true`: element clips, generations, tests and redos alike. A draft can be finalized to 1080p within 7 days as the same frames. A job sent without the flag never can, and a fresh 1080p job is a new random take. Which route makes the film's 1080p: [[Flow v3.3 - 10 Finish and 1080p]].
   - Never set `start_image` or `end_image`.
   - If Higgsfield answers with a preset recommendation, resubmit with that preset's id as `declined_preset_id`.
   - On a transport timeout the job may have gone through. Check for it before you resubmit.
8. Log the job the moment it is submitted.
   - The job id into `$FILM/generations/<G>/takes/take<N>/<G>-take<N>.jobid` (`FIX-<name>-take<N>.jobid` for a pick-up). `land.py` writes the same file and refuses a different job in it, so a wrong take number shows at landing.
   - A row into `$FILM/spend.md` under its one header: the date, `7 Takes`, `Higgsfield seedance_2_5 omni_reference, 480p draft`, the job id, the seconds, the credits a second, the credits, `<G> prompt vN, take <N>`, the purpose, the user's go in their own words.
   - **The record of what was sent**, `$FILM/generations/<G>/takes/take<N>/<G>-take<N>-sent.json` (a pick-up's `FIX-<name>-take<N>-sent.json`), written at submission by `.venv/bin/python tools/takes/record_sent.py "$FILM" --kind take --id <G> --take <N> --version v<n> --job <id> --params <file>` (`--kind pickup --id FIX-<name>` for a pick-up; `<file>` holds the `generate_video` arguments as sent, saved with the file tool) (it also writes the `.jobid` when there is none, pulls in the spend row, and lists any difference between the arguments and the files in plain words), beside the job id: the job id; the prompt file and its exact text as sent; the model and every setting of step 7 (mode, ratio, resolution, duration, `draft`, `generate_audio`, seed when there is one); every reference in the order it was sent, each with its role, its tag, its media id and the film file it came from, read from the media list and the take-medias file of step 4; and the layout the take was made from, the previz take and the storyboard version its media list names ([[Flow v3.3 - 5 Previz and storyboards]], step 13). It completes what is already written (the prompt file, the media lists, the job id, the `spend.md` row); it never replaces them. No signed link goes into it.
   - The app shows that record for each scene and each take, reached from What's next and from the take's card: the prompt as it was sent, beside each picture, element and sound it named, each shown as itself (a picture as a picture, a sound with a play button), and the settings in one line. When the user asks what was sent, point to it.

### Land the take
Every generated clip lands through `land.py`: a generation's take, a pick-up, an element clip, a 1080p pass. Each take has its own folder and every file name is unique in the film:
- take: `generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4`, with `<G>-take<N>.jobid`;
- pick-up: `generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-480p.mp4`;
- element clip: `elements/<CID>/takes/take<N>/E-<CID>-take<N>-480p.mp4`;
- 1080p pass: `<id>-take<N>-1080p.mp4` beside its draft, `<id>` being `<G>`, `FIX-<name>` or `E-<CID>`.

9. Wait actively. Call `jobs_wait` with `jobs: [{index: 0, job_id: <the job id>}]` and `timeout_seconds: 15`, looped until the job is terminal. A single `generate_video` job is always index 0. A draft takes about 2 to 5 minutes. Never leave a job for later while the user is around; use `send_later` only when the user is clearly away.
10. Land it in one step, with no analysis attached. Nothing else comes before this, so the user can watch while you check. Show every video take to the user this way as soon as it lands, before any check or scoring and whatever they find: a take of the film, a redo, a pick-up and a test take alike, each with its own card (in the Hitchcock Harness, on the page of the scene it belongs to), also when its files are kept outside `generations/`; the findings go onto that card afterwards (step 15).
    - Write the result URL on the first line of a file with the file tool, never on a command line.
    - Run `land.py` with `--kind take --id <G> --take <N> --url-file <that file> --job <job id>`, a `--title`, the `--section` heading `<G> · take <N> · landed · <date>` and `--credits`. For the other kinds: `--kind pickup --id FIX-<name>`, `--kind element --id <CID>`, `--kind pass --id <G>` (or `FIX-<name>`, `E-<CID>`). `--file` moves a clip already downloaded instead.
    - It puts the clip and its job id file in the take folder under a unique name, and its video card at the very top, where the app shows it, with the text "Checks running; this text gets the findings." The take has landed when its file is in its take folder under `$FILM` and plays in the Hitchcock Harness: on its scene's page, and cut into its shots on the Edit page's Takes view.
    - In the same step, before any check, put the take on the film's timeline in its boards' place (step 19).
    - Say in the thread what landed and on which page, the scene's page named as a link (the app's show recipe).
11. Verify the job ran the prompt. Fetch the prompt Higgsfield stored for the job with the `higgsfield` server's `show_generation_by_ids` (it returns the job's submitted parameters), save the prompt text with the file tool to `takes/take<N>/stored-prompt.txt`, and run `verify_prompt.py` on the prompt file with `--stored` that file. It prints "identical" (exit 0) or the first difference (exit 1). It flags a difference where an element id came back as `@name`, the backend's rewrite: check whether that is the only one. Put any difference in the card and the report.
12. Transcribe with `transcribe.py` on the take folder, `--lines` the generation's shots file (a pick-up's own `FIX-<name>-shots.json`). The words come from Whisper, run on the Mac by `transcribe.py` itself (free, no go; the setup in `tools/stt/README.md`).
    - It writes the clip's `.wav` into the take folder, runs Whisper on it and reads the word times.
    - It writes `stt.json` and `transcript.txt` into the take folder, in the shape the other scripts read, and prints each line as found, found twice, out of order or NOT FOUND, then the words heard outside every line and the tail after the last word; exit 1 when anything is off. A cached `stt.json` is reused; `--again` makes a new one.
    - This route is untested in this copy: check the first transcripts against what you hear.
13. Run `verify_clip.py` on the take folder. It reuses `stt.json` and writes `check.json` and the contact sheet `check.jpg` into the take folder: the words against the lines, the detected cuts against the planned ones, the tail, and per shot its first storyboard panel above its first and middle frames, taken by frame index.
14. Run the rest of the checks below while the user watches.
15. Write the findings into the take's card, as the app's show recipe says, and the take's verdict in its `findings.md`, which the Scenes page reads. Report per take: what it holds, whether the lines came word for word, the cuts, what you saw and heard, the credits, any moderation retries, and what the edit should fix.
    - The take is already on the timeline (step 19). Its checks change only its card: a take that needs a redo stays on the timeline until its replacement lands.
16. Log the misses in `$FILM/regeneration-log.md` by category (camera/geography, blocking/count, prop/scale, performance/lines, audio, effect), each with what fixes it: the previz, the prompt, a reference, or the edit with no new take.
17. Propose, then stop. Do fixes only on the user's word. For a fix that needs a new generation, say what it would change and what it costs, then wait ([[Flow v3.3 - 8 Redos]]).

### The keeper and the timeline
18. **No keeper card per take.** A generation's first take is in the film from the moment it lands (step 19). Write no card that asks about it and wait for no pick: go on to the next take until every generation has one on the timeline, then the full-video check (step 21). The take's checks still run, and their findings go on its take card as information, never as a question. When a generation has more than one take, the user picks the keeper by its take ID (`<G>-take<N>`) on a card that asks, a pick among the generation's takes ([[Flow v3.3 - 0 Standing rules#Showing the work and judging]]). When the keeper is not the take on the timeline, swap it in as one change of the cut ("Replace a take" in the app's edit recipe).
    - When the takes are put in front of the user to choose, read `taste.md` (at the studio root) first and say which take the user will pick, from the record of earlier picks.
    - A scene with more than one layout ([[Flow v3.3 - 5 Previz and storyboards]], step 13): the user chooses the layout under the scene's Takes, and under each layout sees the takes and the storyboard made from it. Say on the card which layout each take was made from.
    - Once the user names the keeper, add the pick to `taste.md`: the takes, the user's words, the prediction and whether it was right.
19. The moment a scene's take lands, in the same step as the landing and before any check, put it in its boards' place on the film's timeline, without waiting for the user to name it: the scene's boards and planned lines leave, and the take goes in their place, with what follows moved by the difference in length. `land.py` does it itself as the take lands, by a drop into the cut (exit 2 means the take landed but the drop was refused; then make the call "A take in its boards' place" in the app's edit recipe, `recipes/edit.md` in the app's folder; its full path is in your instructions). It is one step the user can undo. What's next on the Edit page says the same: when the videos land, they are put in the edit directly.
    - A later take never replaces the one in the film by itself. It waits on the Takes view until the keeper pick or the user's word puts it in.
    - Putting the boards back is the user's, on the Edit page.
20. A take that is not in the film needs nothing: every take in a take folder shows on the Edit page's Takes view, cut into its shots, ready to be tried in place. Apart from the keeper pick, swapping a take or a shot, and any other change of the cut, waits for the user's word ([[Flow v3.3 - 9 Edit]]).

### The full-video check
21. **GATE: the full-video check.** Once every generation has a take on the timeline, render the whole film's 480p without being asked ("Ask for the 480p" in the app's edit recipe; this step is the ask) and tell the user it is ready to watch, on the Renders tab and on the phone, on one card that holds the render and asks what is wrong. The user watches the whole film and says what is wrong. Say in the thread which generations you think need redoing, each with its reason, broken seams first. Wait for the user's list; it goes to [[Flow v3.3 - 8 Redos]]. The list is not a go for any generation.

### Moderation blocks
22. A blocked job comes back as a status (`nsfw`, `ip_detected`) and costs nothing. Log it in `spend.md` at 0 credits.
23. After a refusal, check the prompt for not-safe-for-work words and words that lean that way (such as "bare" or "weeping"), and replace those. Make the fewest changes that could let it through. No word is banned beforehand. The retries run under the go already given. Each retry takes the next take number; a reworded prompt is the next prompt version.
24. If it keeps failing, reword the directions, never a line of dialogue. Swear words, armed figures and a body lying flat and still can trip the filter: empty the hands, prop the body on an elbow. A changed line is the user's choice and needs a new go. The one exception is a refusal: when the risky word is inside a spoken line, replace the word in the line, send again, and tell the user what you changed. The script and the subtitles follow: they show the word that was spoken in the take that is in the film.
25. Tell the user in the report when a take needed retries.

## Checks
Run on every landed clip, after it has landed. Pull every frame by frame index, decoding from the start, never by seeking.
- **The prompt.** `verify_prompt.py` prints "identical": the job's stored prompt equals the prompt file apart from trailing newlines.
- **Transcript.** `transcribe.py` finds every line word for word, each once, in order: no word missing, no extra word, no line repeated (exit 0).
- **Voices.** Each voice's pitch, from the `.wav` in the take folder, against its character's voice.
- **Cuts.** `cuts.py`: a cut is an ffmpeg scene score above 0.18 (0.30 misses a cut between two shots of the same room). The cut points and the shot order match the plan in `<G>-shots.json`.
- **Frames.** Each shot's frames beside its storyboard panels. `check.jpg` is for timing only; the verdict comes from full-size frames.
- **The tail.** At least 0.45 s after the last word, there to keep ([[Flow v3.3 - 9 Edit]]).
- **The lock pair.** At a cut into a close-up of the same person or object, the last frame before the cut beside the first frame after it: the pose matches.
- **The seam** ([[Flow v3.3 - 5 Previz and storyboards]], step 4). When the generation follows the one before in the same place with no time passing, the take's first second beside the last second of the take before it in the cut, frames pulled by index and judged at full size. Judged by eye: a take passes when every character in both looks to be in the same place and posture across the cut. A broken seam counts above most other faults when choosing a keeper and what to redo. When it breaks, check the previz seam and the prompt seam first, to tell a wrong source from a wrong take.
- **Grey figures.** Every shot looked at for a grey figure: a previz mannequin showing in the take. A grey figure in the crowd is fixed in the storyboard page and in the prompt's wording.
- **Briefed details.** Every detail the prompt briefs, found by frame index and judged at full size.
- **From behind.** Every character the boards show from behind, looked at frame by frame through each shot that shows them, never from a strip of sample frames: the face stays turned away and is never seen. A face seen fails the take.
- **The whole film.** On the Edit page's timeline, every seam between generations passes the seam check.

## Outputs
- One folder per take, `$FILM/generations/<G>/takes/take<N>/` (a pick-up's under `$FILM/generations/FIX-<name>/`), holding the take `<G>-take<N>-480p.mp4`, its job id `<G>-take<N>.jobid`, the record of what was sent `<G>-take<N>-sent.json`, `stored-prompt.txt`, `stt.json`, `transcript.txt`, `<G>-take<N>-480p.wav`, `check.json`, `check.jpg` and the full-size frames under `frames/`. A 1080p pass `<G>-take<N>-1080p.mp4` and its `.jobid` land beside the draft.
- The prompt and the lists sent with each take, `prompt/<G>-prompt-vN.txt`, `<G>-media-vN.json` and `<G>-take-medias-vN.json`, never overwritten: a finalize needs them ([[Flow v3.3 - 10 Finish and 1080p]]), and a redo starts from the approved take's prompt ([[Flow v3.3 - 8 Redos]]).
- `$FILM/generations/upload-registry.json`: each uploaded file's media id, sha1, size and type.
- `$FILM/spend.md`: one row per job at submit, blocked jobs at 0, in the columns of `templates/spend.md`: date, stage, service, job id, units, rate, cost, version or take, purpose, the user's go.
- The take's card, written as the app's show recipe says: title, sub (job, credits, seconds, size), the findings as its text, the file; first, newest at the top. The take's `findings.md` in its take folder, with its verdict line, for the Scenes page.
- `$FILM/regeneration-log.md`: the misses by category, each with its fix.
- `taste.md` (at the studio root): each keeper pick among takes, with the prediction and whether it was right.
- On the film's timeline: each scene's take in its boards' place from the moment it landed, and the keeper in the film where the user picked another take, one step each in the cut's history.

## Tools
Run every script with `.venv/bin/python`, from the studio folder (your working directory).

| Tool | Command | Does |
|---|---|---|
| Higgsfield `models_explore` | `action: get`, model `seedance_2_5` | the model's parameters, once a session |
| Higgsfield `balance` | no params | credits left, before promising a stage |
| Higgsfield `generate_video` | the params of step 7; add `get_cost: true` to quote | submits a take, or quotes it without submitting |
| `tools/higgsfield/upload.py` | `.venv/bin/python tools/higgsfield/upload.py plan "$FILM" <files…>`, then `… put "$FILM" --response <saved media_upload response> [--batch K]`, then `… ids <files…> --film "$FILM" --out "$FILM/generations/<G>/prompt/<G>-take-medias-vN.json"` | new, changed or same per file and the `media_upload` arguments; the PUTs, the registry and the `media_confirm` calls; the medias list in the order given. Never prints a signed link |
| Higgsfield `media_upload`, `media_confirm` | the arguments `upload.py` prints | upload slots, 20 files a call; confirms the ids by type |
| Higgsfield `jobs_wait` | `jobs: [{index: 0, job_id: <job id>}]`, `timeout_seconds: 15`, looped | waits for the result |
| `send_later` | a message and a delay | only when the user is clearly away |
| `tools/film/land.py` | `.venv/bin/python tools/film/land.py "$FILM" --kind take\|pickup\|element\|pass --id <G> --take <N> --url-file <file> --job <job id> --title "<title>" --section "<G> · take <N> · landed · <date>" [--credits N] [--file <mp4>]` | step 10 in one command: the clip and its job id in the take folder under a unique name, its card at the top where the app shows it, and a scene's take dropped into its boards' place on the timeline |
| `tools/takes/record_sent.py` | `.venv/bin/python tools/takes/record_sent.py "$FILM" --kind take\|pickup\|element --id <G> --take <N> --version v<n> --job <job id> --params <file of the generate_video arguments> [--dry-run]` | the record of what was sent, `<G>-take<N>-sent.json`, beside the job id (step 8) |
| `tools/higgsfield/verify_prompt.py` | `.venv/bin/python tools/higgsfield/verify_prompt.py "$FILM/generations/<G>/prompt/<G>-prompt-vN.txt" --stored "$FILM/generations/<G>/takes/take<N>/stored-prompt.txt"` | "identical", or the first difference (exit 1) |
| `tools/stt/transcribe.py` | `.venv/bin/python tools/stt/transcribe.py "$FILM" "$FILM/generations/<G>/takes/take<N>" --lines "$FILM/generations/<G>/<G>-shots.json" [--again]` | the `.wav`, Whisper on the Mac, `stt.json` and `transcript.txt` in the shape the scripts read; each line found, twice, out of order or not found. Untested in this copy |
| `tools/takes/verify_clip.py` | `.venv/bin/python tools/takes/verify_clip.py "$FILM/generations/<G>/takes/take<N>" --film "$FILM"` | words against the lines, cuts against the plan, the tail, `check.json` and `check.jpg`. Its words check is unproven on a real transcript: read it against `transcribe.py`'s verdict |
| `tools/edit/cuts.py` | `.venv/bin/python tools/edit/cuts.py <clip.mp4>… [--json]` | the cut detector, 0.18: length, frames and cut points in seconds and frames |
| ffmpeg, a frame | `ffmpeg -v error -i TAKE.mp4 -vf "select='eq(n\,N)'" -fps_mode passthrough -frames:v 1 OUT.png` | frame N by index, decoded from the start |
