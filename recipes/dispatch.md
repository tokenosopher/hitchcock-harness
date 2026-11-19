# Dispatch · the recipe

Alma reads this file whenever work can run side by side: at the script lock, when several characters, locations or scenes are ready at once, and when a long job (a render, a mix, an upscale) should not hold the thread. It says how to hand work to background sub-agents so the harness shows each one in the right place and so two writers never spoil one file. It holds no film rule: which jobs exist, their round sizes, their checks and their gates are in the standing rules ("After the script locks: work in parallel", "Agents and waiting") and the stage notes, and they win wherever this file seems to differ.

## The order the board shows

The Main page draws the film as this board. Each step lights while a sub-agent works on it, shows "waits for you" while a card asks there, and fills once its files exist.

```
Story (the script lock)
  ├─ Places:  Locations → the pick → Views (only if the script needs more angles) → Shots (the scene files) → Previz
  └─ People:  Faces → the pick → Clothing → Sheet        and, after each face pick, that character's Voices
The gate: every pick made, every prompt ready → "Go for the video?"
Elements → Scenes → Edit → Finish → Sound → Release
```

Both chains start together at the lock. Inside a chain a step waits only for the pick before it; across chains nothing waits. Shots are the scene files the previz stage note starts with (one per scene: shots, acting tasks, fight beats, start and end states); the Blender previz is built from them, and the scene prompts are assembled from them later. Previz starts on grey stand-ins and takes the faces and clothing as they are picked. A character's voices start once that character's face is picked, not at the lock: dispatch that voice round when the face pick comes in (the standing rules, "Chain B, the people", and Flow v3.2 - 3 Voices and video elements).

**The previz kit shares a location's people (since 15 Nov 2026).** On the first film that used it, each scene's agent built the room and its own crowd on every Blender run: one harbour had five different crowds, and the stage took over five hours, most of it building. The kit (`tools/previz/README.md` in the film repo, the section "What a scene agent does now") now builds what a location's scenes share once, into one file every scene opens: the room, the principals at their heights on their marks, each crowd and standing group, the props that live there. The mechanics for a dispatch:
- Before any scene agent of a location is briefed, that location's people file exists and is built (`previz/rooms/<LID>-people.json`, `build_location.py`). One job writes it; a scene agent never does.
- Each scene's brief names the people file and points to that README section: the script loads the shared file, builds no one it holds, and stages only its own action.
- The cast's heights reach the scenes through the people file, never as numbers typed into a brief.
- Blender runs go through `tools/previz/blender_run.py` (eight renders at once; runs that render nothing have their own lane). After the stage, `tools/previz/timing.py` prints how long every run waited and ran.

## One sub-agent per independent unit

A unit is something that can be finished without anyone else's result: one character's face round, one location's style image, one scene's prompt, one voice's options, one take's checks, one clip's upscale. Start each as its own background sub-agent, on the model the standing rules name (say the model in the line that announces the launch, as they ask), and keep answering the user while they run.

- Do not chain inside one sub-agent what the user has to pick between (faces, then clothing for the picked face): end the sub-agent at the pick.
- Do not split what shares one result (the two characters of one two-shot board).
- **Video generations are not units.** You submit each take yourself; sub-agents write the prompts before and run the checks after, side by side. Takes for different scenes are submitted together, in one message; takes for the same scene go one at a time, the next only after the one before has landed (the standing rules and Flow v3.2 - 7 Takes say when and on which go). Stills, voices, music and upscales follow their own stage notes.
- Keep the thread yours: you read reports, show results (the show recipe) and talk to the user. A sub-agent never asks the user anything; it reports to you.

## The name is how the board finds the job

Write every sub-agent's description as `<job> · <target>`. The harness lights the step whose word appears in the job, and ties the task to the part whose ID appears in the target.

| Step | A job word that lights it | Example |
|---|---|---|
| Story | script, story, brief, research | `script · table read notes`, `research · lighthouse lamps` |
| Locations | location, style image, master, prop | `location · L01 style images` |
| Views | view, plate, angle | `views · L01 reverse angle` |
| Shots | shot list, shots, scene file | `shot list · S3`, `scene files · S1-S5` |
| Previz | previz, storyboard, board | `previz · S3 boards` |
| Faces | face | `faces · C01 round 2` |
| Clothing | clothing, wardrobe, costume | `clothing · C02 looks` |
| Sheet | sheet | `sheet · C01` |
| Voices | voice | `voices · C02 options` |
| Elements | element | `element · C01 clip` |
| Scenes | prompt, take, scene, generation, redo, pick-up, speed | `take · S4 take 2`, `pick-up · FIX-S3-laugh`, `speeds · S2 pacing` |
| Edit | edit, cut, stitch, proxy, timeline, render, draft | `cut · v12 trims`, `render · v14 480p` |
| Finish | 1080, finish, upscale, upscaled, caption, subtitle, title card | `upscale · S5 take 3`, `captions · final` |
| Sound | music, score, sound, mix, sfx, loudness, lufs, mux, stem, table read, clone, voice fix | `music · score take 3`, `voice fix · C02 "island"`, `stems · S3 music out` |
| Release | release, kit, social, deliver, post, thumbnail | `social · platform texts`, `post · TikTok`, `thumbnails · round 2` |

- Use one job word. A name with two goes to the first match in this order: Sound, then `1080`, `upscale` or `upscaled` (Finish), then Faces, Clothing, Sheet, Voices, Views, Shots, Previz, Locations, Elements, Scenes, Edit, the rest of Finish, Release, Story. So `voice fix` lights Sound, and `caption cut` would light Edit, not Finish: say `captions`.
- `master` alone means a location's master image. For the film's 1080p file say `1080p`.
- A check names its target and the word `qc`: `qc · S4 take 2` lights Scenes, on S4. A check that names only an ID goes by the ID's kind (`qc · C01` lights Sheet, `qc · L01` Locations, `qc · S3` Scenes, `qc · film` Edit). Its report goes through the QC recipe.
- IDs in the target (`C01`, `L01`, `P01`, `S3`, `C05-C06` for a range) put the task on that character, location, prop or scene. Without one it shows on the step only. A pick-up that covers two scenes names both: `pick-up · FIX-S2S3-reel` shows on S2 and on S3.

## Who writes what

Parallel writers on one file lose each other's work. So:

| File | Who writes it |
|---|---|
| Anything inside the unit's own folder (`cast/C01/…`, `locations/L01/…`, `generations/S4/…`, a new file under `audio/…`) | the sub-agent |
| `spend.md` | one writer per job: whoever submits it, the moment it is submitted, as one new row at the end of the table (the stage notes give the row). Read the file right before, add the row, change no other line. If you submit the job yourself, the row is yours; never both. |
| Files a flow script rewrites whole (`voices/options.json`, `voices/cast.json`, `generations/upload-registry.json`, `generations/upload-pending.json`, `audio/score/score-log.json`, `cues.json`) | one writer at a time: run those scripts yourself, or one sub-agent after another, never two side by side |
| `review/cards.json`, and so every landing with `land.py` | you, one at a time, as each report comes in |
| `taste.md`, `regeneration-log.md`, `brief.md`, `script.md`, `elements.json` | you |
| `cut/alma/<YYYYMMDD-HHMMSS>.json` (a drop: your change to the cut) | you (the edit recipe), one per piece of work; never a sub-agent |
| `cut/v<n>.json`, `cut/working.json`, the history (`harness/cut-history.json`, `harness/cut-states/`), a drop's answer | the harness only: it takes your drop in and saves the version (the edit recipe) |
| `social/release.json` | you and the page, one change each, re-read right before each write (the release recipe); never a sub-agent |
| git commits | you. A sub-agent never runs git. |

## The brief you give

Write it as the standing rules ask (the intent and the hard constraints; creative judgement stays with the model), and always include:

1. The film folder and the unit's own folder, and that it writes nowhere else except its one `spend.md` line per paid job and its scratch (viewing copies, crops, downloaded previews), which goes in `$FILM/scratch.nosync/<job>/`, never `/tmp`.
2. The stage note to read for the job, by name. Do not paste rules into the brief.
3. What it may spend: the round the script lock or the user's go covers, in the words of that go, and that it stops there.
4. What to send back: the files it made (paths relative to the film folder), what it checked and what it found, each job's id and cost, and anything it could not do. No keys and no signed URLs: a result still to be landed is handed over as its job id and the path of the URL file it left in its unit's folder, never the link itself.
5. That it deletes, moves and overwrites nothing, and never asks the user.

## When a report comes in

1. Read it and look at the files yourself; a sub-agent's "done" is a claim.
2. Land or card the result, one report at a time (the show recipe), and say in one line in the thread what is up and where.
3. If it starts the next step and nothing waits on the user, dispatch that step now. If it waits on a pick, write the card that asks and carry on with the other chain.
4. Commit.

- **The timeline follows the work.** After the script lock, after the shot lists and after each scene's boards, bring the timeline up to date with one call (`recipes/edit.md`, "The timeline from day one"); once a scene's take has passed its check, put it in its boards' place there. Never write a planned clip yourself.

## What you may start without asking

The spend gates in your instructions are the whole of it: the script lock is the go for the first round of each asset; setup defaults are never asked; every later paid round waits for its go; "Go for the video?" is the one hard gate before the generations. When several units are ready and covered, start them together in one message, and say the count, the size, the cost and the model in one line. After "Go for the video?" the first takes of the different scenes go out together; takes of the same scene still go one at a time.
