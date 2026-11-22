---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# Film Flow v3.2

Film Flow v3.2 is the flow this studio uses. It ships with Hitchcock Harness v0.1.0 and needs only Claude and Higgsfield: every paid job goes through the `higgsfield` MCP server, and everything else runs on the user's Mac, free: the app, ffmpeg, the studio's Python, Blender for the previz, Demucs for stems and Whisper for transcripts (both run by `uv`). `./setup.sh` in the app's folder installs or checks them all.

Instructions for making a short AI film, under three minutes: Seedance 2.5 video built from character video elements, empty location views and grey Blender storyboards, made in Hitchcock Harness, the user's app: cut on its Edit page, finished at 1080p on the same timeline, scored, subtitled and released from its pages. The script is cut into **generations** (`S1`, `S2`…): a generation is one Seedance job of 4 to 30 s with a few shots inside, and has one prompt and one shots file. Each stage below is one note that stands alone: purpose, inputs, steps, checks, the gate where the user approves, outputs, tools. The rules that hold at every stage are in [[Flow v3.2 - 0 Standing rules]]; the stage notes link to them and never repeat them.

## Before any work

### Session start

1. Check that the session runs in the studio folder: the folder that holds `flow/`, `tools/`, `templates/` and `assets/`. The app starts Alma there. If the folder is wrong, tell the user and wait.
2. Check the local tools: `.venv/bin/python --version`, `ffmpeg -version`, `ffprobe -version` and `uv --version` answer. If one does not, tell the user to run `./setup.sh` in the app's folder (one level above the studio) and wait. The same script installs or checks Blender, and `uv` runs Demucs and Whisper.
3. Check that the `studio-film` skill loaded (`.claude/skills/studio-film/SKILL.md` in the studio), not a skill named plain `film` from another setup. It points here.
4. Check that the `higgsfield` MCP server is present: its tools (`mcp__higgsfield__…`) are in your tool list. Make every Higgsfield call through the `higgsfield` server, never through another Higgsfield connector (such as the claude.ai Higgsfield AI connector, whose tools have other names). If it is missing, tell the user and wait.
5. Before you quote anything, read the user's Higgsfield balance and plan with the `higgsfield` server's `balance` tool.

### Every stage

1. Read [[Flow v3.2 - 0 Standing rules]] in full.
2. Read the note of the stage at hand, and the method notes it names.
3. Say the stage back to the user in one line. Then follow the note's steps in order and stop at every **GATE** until the user answers.
4. At a gate, show the thing on its page in the Hitchcock Harness with a card that asks, say in the thread what is up and on which page, and wait for the user's answer on the card: a pick, a yes or a go that names it ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]).

## The stages

| | Note | Produces | Gate |
|---|---|---|---|
| 1 | [[Flow v3.2 - 1 Setup and story]] | The film's folder with its `brief.md` (the public title), delivery folder and logs; the research; the film as a short story, `story/v<n>.md`, one file per version, settled by the user before any script; a locked `script.md` with the settled story under `## Story`, cut into generations, with an ID for every character, location, prop and generation | The public title, written to `brief.md`; the user settles the story; the user locks the script, which is the go for the first round of every asset |
| 2 | [[Flow v3.2 - 2 Characters]] | Per character: the picked face, the sheet with its head-to-toe view, extra views, on one light and neutral colour, registered as an image element | Face pick; sheet approved by ID; a sheet variant by ID after its quote |
| 3 | [[Flow v3.2 - 3 Voices and video elements]] | One picked voice per character (a Higgsfield preset voice, a voice made from the face, or a variant of a preset), saved as a voice Higgsfield can reuse; the reference lines; one 5 s split-screen video element per speaking character carrying face, costume and voice, finalized to 1080p | Voice pick; element line; each element clip; the say-so for each element's 1080p finalize, before a scene prompt needs it |
| 4 | [[Flow v3.2 - 4 Locations and props]] | Every location and prop designed; from the picked picture, the location's grey 3D room, fitted to the picture, which the previz stages its scenes in; the plan from above rendered from the room; the master and a few empty views, a new one only where a camera sees a really different side of the place, painted over colour renders of the room and measured against them; a reference for every prop | Location pick, the only gate for a location (no master, plan or view to approve; the views are seen at "Go for the video?"); props by ID |
| 5 | [[Flow v3.2 - 5 Previz and storyboards]] | Scene files with shot lists, a grey Blender previz of every generation with its shots file and board, staged in the location's room from stage 4 with grey stand-ins without waiting for the faces, sheets or elements; the QC critic's report, run by itself on every previz and board, its fixes applied without asking, up to three rounds or until 8.5, the result shown; storyboard pages, an empty view for every wide, the whole-film previz | The previz and the storyboard approved by version |
| 6 | [[Flow v3.2 - 6 Scene prompts]] | One checked Seedance prompt per generation with its ordered media list, passed by the QC critic | **"Go for the video?"**: the one hard spend gate, asked when every asset and every scene prompt is ready, with the quote for the first take of every generation, after the user reviews every scene, its prompt and the exact assets fed into it in one place |
| 7 | [[Flow v3.2 - 7 Takes]] | Each generation uploaded, generated, landed in its own take folder, transcribed and checked; each take shown on its scene's page and, cut into its shots, on the Edit page; once a scene's take has passed your check, it takes its boards' place on the Edit page's timeline without waiting for the user to name it | None for the first takes: the go for the video covers the first take of every generation; takes for different scenes are submitted at the same time, takes for the same scene one at a time; a second take its own quote and go; the user picks the keeper among a scene's takes on a card; the full-video check |
| 8 | [[Flow v3.2 - 8 Redos]] | Pick-ups and reshoots of the shots the user names, each its own generation `FIX-<name>`, built like a first pass | A sheet variant by ID before the redo's quote; the go per redo (the user's ask to retake a named shot is its go: no quote, one report when done); the user's choice of take |
| 9 | [[Flow v3.2 - 9 Edit]] | The user's cut on the Edit page, its versions and steps, changed by Alma only through the app's own route; the timeline from the script lock on (lines, planned shots, boards, then takes); music on it if the user lays it there; every take of a scene shown cut into its shots, the film picked shot by shot from any take; a 480p render only when the user asks for one | The user's cut is theirs; a version approved on a yes card that names it |
| 10 | [[Flow v3.2 - 10 Finish and 1080p]] | The same timeline in the Edit page's 1080p view, made 1080p by the Seedance 2.5 finalize of every draft the cut uses, on the user's word after all the edits, and checked shot by shot; the Higgsfield upscale only when the user asks for it; the master rendered by the app from the tracks the user has switched on, the same cut frame for frame | Say-so before any 1080p spend; the master approved on a yes card that names it, before the music |
| 11 | [[Flow v3.2 - 11 Sound and music]] | The music and the effects laid as clips on the cut's own tracks on the Edit page, levels and fades set there: every clip's own sound kept, any music Seedance slipped into it removed with Demucs on the Mac, the chosen music (a score made on Higgsfield, or the user's own) fitted, effects where needed; the master the app renders carries the mix | The music choice; the mix approved on a yes card that names it |
| 12 | [[Flow v3.2 - 12 Release]] | Subtitles as lines on the cut's subtitle track, made at 1080p, burnt into the master by the app; the final named by the user on the Release page; the FINAL files in the Social kit under a slug made from the public title; each platform's texts on its own Release page, thumbnails, the posting plan, the records | The user writes or picks every line on the Release pages and posts each one by hand |

Reference, read when a stage calls for it:

- [[Flow v3.2 - 13 Services and costs]]: how to call each Higgsfield job and quote its cost; the Mac's tools; keys.
- Method notes under stage 6: [[Flow v3.2 - 6a Prompt engine]], [[Flow v3.2 - 6b Acting]], [[Flow v3.2 - 6c Fight scene]], [[Flow v3.2 - 6d Anamorphic look]].

## Where things are

Every path is relative to the studio folder, Alma's working directory.

- **These notes**, in `flow/`, are the only place the rules live. The code lives beside them:
  - `tools/<area>/` holds every script: `film`, `higgsfield`, `stt`, `stills`, `voices`, `previz`, `prompts`, `takes`, `edit`, `finish`, `music`, `stems`, `release`, `review` (voice and word-fix templates only), `lib`, `setup` (`install_local.sh`, run by `./setup.sh`), with `deliver.py` and `disk_report.py` at the top of `tools/`. Run them with `.venv/bin/python`. A reference film's words come from `tools/stt/transcribe.py --audio <the film's file> --words-out <json>`. Every stage note names its scripts by path with the command. A route whose steps are more than one script's command has them in the README of its folder: Whisper transcripts in `tools/stt/README.md`, Demucs stems in `tools/stems/README.md` (both local and free), the score in `tools/music/README.md`, the 1080p finalize and the upscale in `tools/finish/README.md`.
  - `templates/` holds a template for every file you write by hand. `templates/README.md` maps each one to its place in the film folder and the script that reads it. Every stage note names the template its steps start from.
- **The film's files** live in `assets/films/<film>/`. In every command `$FILM` is the full path to the film folder, `$PWD/assets/films/<film>` taken in the studio folder. Each generation has its folder `generations/<G>/` (`S1`, `S2`…; a pick-up is `generations/FIX-<name>/`), with one folder per take under `takes/take<N>/` that holds the take, its transcript and its checks. Finished films go to `assets/final-cuts/<YYYY-MM-DD> <Public Title>/`. The library of picks across films (faces, voices, characters, locations) is `assets/library/`. `films.txt` at the studio root lists the films the app shows. Layout and IDs: [[Flow v3.2 - 1 Setup and story]].
- **Records**, at the studio root: `taste.md` (every pick the user made, with your prediction), `flow-fixes.md` (fixes the user wants kept for later), `published-links.md` (every post), `film-records/<Public Title>.md` and `film-records/voices.md` (what each released film used), `finished-scripts/<Public Title>.md` (every finished film's script, read for inspiration before a new script). In the film folder: `spend.md` (its one header from `templates/spend.md`) and the regeneration log. [[Film Flow v3.2 - record]] holds this flow's own record: the user's words behind each correction, the dates and where each rule went. Nothing in it is a rule.
- **Corrections** from the user make two writes: the clean rule into the stage note it belongs to, the words and the source into the record. The procedure is in [[Flow v3.2 - 0 Standing rules]].
