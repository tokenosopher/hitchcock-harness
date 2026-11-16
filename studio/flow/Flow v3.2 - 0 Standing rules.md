---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 0 · Standing rules

**Purpose.** The rules that hold at every stage. Stage notes link here once and never repeat them.

## Session start

Before any work, run the session-start list in [[Film Flow v3.2#Before any work]]:

- Work in the studio folder (the one that holds `flow/`, `tools/`, `templates/` and `assets/`). Every path in these notes is relative to it.
- Check that `.venv/bin/python`, `ffmpeg`, `ffprobe` and `uv` answer. If one does not, tell the user to run `./setup.sh` in the app's folder (one level above the studio) and wait. The same script installs or checks Blender, and `uv` runs Demucs and Whisper.
- Check that the `higgsfield` MCP server is present (tools named `mcp__higgsfield__…`). Every Higgsfield call goes through it, never through another Higgsfield connector.
- Check that the `studio-film` skill loaded (`.claude/skills/studio-film/SKILL.md`), not a skill named plain `film` from another setup; it reads the index [[Film Flow v3.2]].
- Read the user's Higgsfield balance and plan (the `balance` tool) before you quote anything.

Then read this note in full, then the note of the stage at hand and the method notes it names ([[Flow v3.2 - 6a Prompt engine]], [[Flow v3.2 - 6b Acting]], [[Flow v3.2 - 6c Fight scene]], [[Flow v3.2 - 6d Anamorphic look]]). Say the stage back to the user in one line before doing anything.

## A first film

- When `taste.md` has no rows and `assets/final-cuts/` is empty, this is the person's first film. Guide them: at the start of each stage, say in one or two plain sentences what the stage is, what you will do and what you will need from them.
- Once, at the start of the first stage, point them to `GUIDE.md` in the app's folder (one level above the studio).
- Stop guiding when the person says they know the ropes.

## Spending

- **Quote every paid job** before you submit it, in credits, with `get_cost: true` on the Higgsfield call. A job Higgsfield cannot preflight (a saved voice, `voice_change`, the `upscale_video` second route) is quoted from the price on file in [[Flow v3.2 - 13 Services and costs]]. With no price on file, measure first: the first go covers one unit (one saved voice, one voice change, one upscale segment); read `balance` before and after it, write the measured price into note 13, then quote the rest and ask a separate go. Removing music, splitting stems and transcription run on the Mac (Demucs and Whisper): free, no quote and no go.
- **The script lock is the go for the first round of every asset**, whenever its turn comes in its chain: location candidates, faces, clothing on the picked face, the sheet and its details, voices once each character's face is picked, props, the previz. After a location pick it also covers the master and every view painted over that location's room, and up to two repaints of each one that fails its measure ([[Flow v3.2 - 4 Locations and props]]). Run these without asking. Say each round's size and cost in one line.
- **Stills are never asked about again.** A further round of faces, clothing or a sheet runs when the user's note asks for it; that note is its go. "Locked" means go on to the next step and keep going.
- If the user said during the script work that a character, voice or location from an earlier film is reused, use that one instead of generating.
- **Never ask the setup defaults:** 9:16; voices from Higgsfield (preset voices, voices made from the face, variants of a preset); video elements 1920x1080, 5 s; 1080p by Seedance 2.5 finalize; a budget of 5,000 credits. The user says at the start if anything differs. The title is still asked ([[Flow v3.2 - 1 Setup and story]]).
- **The one hard gate is before the video.** When every asset and every scene prompt is ready, stop and ask "Go for the video?" with the quote for the first take of every generation. The user reviews every scene, its prompt and the exact assets fed into it in one place before answering; there is no separate yes per prompt. Method: [[Flow v3.2 - 6 Scene prompts]].
- After the go, submit the first take of every generation, `count: 1` each, without asking again ([[Flow v3.2 - 7 Takes]]). Takes for different scenes are all submitted at the same time. Takes for the same scene go one at a time, so the user can check each before another is made.
- **Each of these keeps its own quote and its own go:** a second take (only after the user's notes on the first), a redo, a pick-up, a probe (a set of 4 second probes for one word is one quote and one go: quote the whole set once and make them all on it), a video element, a sheet variant, a skin pass or upscale, any 1080p. The one exception is a retake the user asks for (below).
- **Sound effects need no quote and no go.** Make a sound effect on Higgsfield (`mirelo_text_to_audio`: crowd sounds, room tone, a laugh carried across a join and the like) whenever the edit calls for one or the user asks, in a few tries, and say afterwards what you made. Log each job in `spend.md` with its credits. This covers sound effects only: music, voices, stills and upscales keep their own rules. The spend that matters is the video generations, and every one keeps its quote and its go, except a retake the user asks for (below).
- **What counts as a go.** A paid generation starts only on a word from the user that names the thing. A sentence that could mean voice work or an edit is not a go for video. The user's explicit ask to retake a named shot is the go for that retake. Before any batch over 50 credits, say the count and the cost back and wait; the first round the script lock covers is the one exception.
- **A retake the user asks for is its own go.** When the user asks for a retake of a specific shot, do not quote it and do not wait. Build it as [[Flow v3.2 - 8 Redos]] says (the span, the continuity sheet, the boards, the right references, the prompt from the approved take's prompt, the pre-submit check and any quality check the prompt needs), submit it, land it and check it. Send no progress messages on the way. Report once, when the take has landed and been checked: what was made, what it cost, what the check found. Log its row in `spend.md` as usual.
  - It covers one take of the shot or shots the user named, and nothing more. A further take after that one waits for the user to ask again. A whole scene the user did not ask to redo, a paid still or sheet variant the retake turns out to need, and a redo you propose yourself each keep their own quote and go.
  - If the retake would take the film over its budget, stop and say so instead of sending it.
  - If the filter refuses it, check the prompt and replace its not-safe-for-work words as under Moderation, then send it again. Say in the one report that it was refused and which words were replaced.
- **Feedback is not a go.** Answer a note on a take with analysis and edits of the footage that exists: trims, cuts, re-assembly, audio fixes. When only a new generation would fix it, say what it would change and what it costs, then stop and wait. Treat a request phrased as an edit ("cut the second take") as an edit only.
- **Drafts only.** Generate video at 480p. Run no 1080p, finalize, upscale or extend without the user's say-so for that exact action. A general go never covers resolution, and a test of the finalize path is not pre-approved.
- Give every 480p Seedance job `draft: true`, so it can still be finalized ([[Flow v3.2 - 7 Takes]]). The route to 1080p is in [[Flow v3.2 - 10 Finish and 1080p]].
- **Inputs final before video.** Every input a generation uses (character sheets, video elements, location views, grey boards, prop refs, the prompt) is final and approved before you spend the first video credit on it. Never shoot on an input known to be provisional, however small the open change.
- Test a new prompt shape or route on one generation, never on a batch.
- **One candidate by default** for every still, edit, voice design, element clip and video: one draft per generation, no batches. Mention an alternative in words; never run it unasked. Run no paid A/B or comparison unless the user asks for one.
- **GPT Image 2.5 makes a still's first version only; every edit runs on Seedream 5.5.** Both run on Higgsfield `generate_image`: GPT Image 2.5 is `gpt_image_2_5` with `variant: sunburst`. A first version is a new image from text, with or without references. An edit is any still that starts from an existing picture: a details edit, a fix, clothing on a picked face, a sheet from a picked face and look, a state variant of a locked sheet, a relight, an outpaint, a prop or view made from an earlier picture. Each GPT Image 2.5 edit lays small artefacts over the picture that show most on people and objects, and they add up over repeated edits. Run every edit on Higgsfield `generate_image` with `seedream_5_5`, the picture to change as Image 1, at the picture's own aspect ratio, `resolution: 2k`; upload a local still first with `upload.py`. The price and the call: [[Flow v3.2 - 13 Services and costs]]. Seedream 5.5 can drift on a face and on the arrangement when several people share a picture, so after every Seedream edit re-check the identity, the counts and every briefed detail against the picture before it. Seedream 5.5 is untried on views painted over a plate ([[Flow v3.2 - 4 Locations and props]]) and on the three-panel sheet ([[Flow v3.2 - 2 Characters]]).
- Two kinds of work are batches, and only these two:
  - **Face rounds.** A round is twenty faces, run at once. Method: [[Flow v3.2 - 2 Characters]].
  - **Location designs.** Every interior gets creative candidates and the user's pick before the Blender previz. Method: [[Flow v3.2 - 4 Locations and props]].
- **Log every paid job** in `$FILM/spend.md` the moment you submit it, one row under the header of `templates/spend.md` (`tools/film/new_film.py` writes it into a new film): `date | stage | service | job id | units | rate | cost | version or take | purpose | the user's go`. Write the service cell as "Higgsfield · <model> <settings>" (Higgsfield first: the app labels a row by the first service it finds), the billed seconds or images in units, and the rate and the cost in credits (`cr`). How to put credits into dollars for the user's own plan: [[Flow v3.2 - 13 Services and costs]].

## Showing the work and judging

- **The user judges by eye and ear**, on the pages of the Hitchcock Harness, over AI-listener scores and over the numbers. How the app finds what you made, and how a card is written, is in the app's show recipe, `../recipes/show.md` (the app's folder holds the studio).
- Give every asset and every take its stable ID. Show each one where the app shows it: its file in the folder its page reads, and a card with the page it belongs to and the IDs it is about. The newest comes first. Keep every version.
- **Approvals come by ID, on a card.** Count something as approved only when the user's answer names it: a press on its card that asks (a pick, a yes or a go, the card naming the exact asset, take or version), or the user's own words naming it, which you then record on the card. A press on a card is the user's own answer by ID.
- **Every question is a card in "Waiting for you".** In the Hitchcock Harness, write every choice, yes or go you ask of the user as a card that asks, in the same turn as the question.
- **Every pick goes into the library.** The library is the Hitchcock Harness's own: Faces, Voices, Characters and Locations in its sidebar, kept in `assets/library/`. It holds the picks of every film. At every pick, the library is a source beside the new round.
- **A prediction with every round.** Put every round of candidates (faces, clothing, sheets, locations, props, voices, takes) in front of the user with a prediction of the pick, made from the record of earlier picks, `taste.md` at the studio root. Read it before the round; with no picks in it yet, say the prediction is a first guess. Add every pick to it: the candidates, the user's words, the prediction and whether it was right.
- **A landed clip shows first**: its file in its take folder and its card at the top, before the checks. Say in the thread what landed and on which page, the page's name as a link (the show recipe). Run the checks after. The landing routine is in [[Flow v3.2 - 7 Takes]].
- **Verify before presenting.** For every image, frame or take, write a checklist of the briefed details. Check each one in every view and panel: present, on the same side, the same shape, size and material everywhere, and nothing there that should not be (a second window, garbled text).
  - Crop at full resolution. Judge clips at full size, never from a small contact sheet or a downscaled sheet.
  - Pull video frames by frame index, never by `-ss` seeking.
  - Fix the misses before showing, or report them plainly. Say what you checked.

## Keeping things

- **Never delete anything without the user's yes on that exact name.** No exceptions: not a take nobody has seen yet, a version, a voice, an element or a file that looks unused.
- Before calling anything unused, list every delivered film in `assets/final-cuts/`. Map each asset to every film.
- Treat everything listed in `film-records/` (the voices in `voices.md`, the sheets, reference images and element ids in each film's record) and in `assets/library/` as in use.
- Show the exact delete list, get a yes on that list, and never go past the names the user confirmed. A deletion on Higgsfield cannot be undone.
- **Keep raw originals.** Keep every raw generation and recording; make every edit as a copy. Any script that trims, speeds up or processes generated media writes the original somewhere permanent first, never only into a scratch folder. For recordings: [[Flow v3.2 - 3 Voices and video elements]].
- Keep the film's regeneration log, `$FILM/regeneration-log.md`: for every take, what changed, the misses by category, the credits and what to do differently.
- **Never print a key, a signed URL or a session token.** Higgsfield is reached through its MCP server, with no key in the studio. Download results without echoing their URL; `upload.py` keeps upload links out of sight. No key or signed URL goes into chat, a note, a card or a log.
- **No assistant model identifiers** in a note, a film file, a card or a prompt.

## Sound

- **Keep each clip's own generated sound.** In the first cut, trim and order the generations with their own audio. Never swap whole clips or every line for studio takes. Patch a broken word with a targeted fix, and say the reason up front. Method: [[Flow v3.2 - 9 Edit]].
- **Lay the user's music untouched:** full range, full stereo. Set only its level, the dip under speech and the deliberate stops. Levels and scoring: [[Flow v3.2 - 11 Sound and music]].
- When a word could mean the picture or the sound ("lo-fi"), ask, or make the cheap reading first (a low-res video).

## Git and files

- **`$FILM`** in every command and path is the full path to the film folder, set as in [[Flow v3.2 - 1 Setup and story]].
- **Make no git commits** and never push. The studio is the user's: if they keep it in git, they commit when they want.
- Deliver only finished films, every 1080p cut included, to the film's folder in `assets/final-cuts/`. Keep everything else in the film folder. Storage: [[Flow v3.2 - 1 Setup and story]].

## After the script locks: work in parallel

Run two chains at once after the script locks. Fan the jobs out to agents and land each result where the app shows it, as it comes back.

1. **Write the script and lock it** ([[Flow v3.2 - 1 Setup and story]]).
2. **Start both chains together, at the lock.** The lock is the go for the first round of every asset in them (Spending above).
   - **Chain A, the places**, in this order:
     1. For each location, make candidates for its look and feel, wide, each card saying what its layout commits the scenes to ([[Flow v3.2 - 4 Locations and props]]).
     2. The user picks one picture per location. That is the location's only gate.
     3. Without asking, build the grey 3D room from the picked picture and fit it to the picture; render the plan from above from the room; paint the master and every view over colour renders of the room, measure each against its render and repaint a failing one. A layout question that changes how a scene plays goes to the user once, at the pick or right after it.
     4. Build the previz in that same room ([[Flow v3.2 - 5 Previz and storyboards]]). Do not wait for the faces, sheets or elements: use grey stand-ins for the people, with heights from the brief; fit the picked faces and clothing in as they are chosen. The QC critic runs on it by itself (Agents below).
   - **Chain B, the people**, beside chain A: make options for the characters' faces ([[Flow v3.2 - 2 Characters]]), the characters' clothing as its own job, apart from the faces and the body type, and the voices ([[Flow v3.2 - 3 Voices and video elements]]). Put them in front of the user while the location and previz work goes on. Voices wait for the face: make a character's voice options only after that character's face is picked, from a brief written from the face, never at the lock. Put them in front of the user with the face and who the character is on the card.
3. **GATE: the taste picks.** Which face, which clothing, which voice and which location. Wait for each pick on its card (approvals above).
4. **Then build on the picks:** the video elements, the boards with the real cast and the scene prompts. Then the one **GATE: "Go for the video?"** (Spending above), then the generations.
5. **A later change to the script** redoes only the parts it touches. Keep everything else that is already done.

The aim is a film a day.

## Agents and waiting

- **Delegated agents run on Opus.** Give every Agent call, and every `agent()` inside a workflow script, judges and verifiers included, `model: "opus"`; none inherits the main thread's model. Say in the launch line that the agents run on Opus. If a task truly needs the stronger model, say so and ask first.
- **The QC critic runs by itself.** As soon as a generation's previz and boards are made, start a quality-control critic agent on them without being asked. It reads the previz data (shots file, start and end states, cameras), the boards and the plates, grades them 1 to 10 and names the exact fix per miss. Apply its fixes yourself without asking and run it again, up to three rounds or until 8.5, then show the user the result. The same critic runs on each scene prompt before the video gate. How a QC report is written: the app's QC recipe, `../recipes/qc-critic.md`. What it checks: [[Flow v3.2 - 5 Previz and storyboards]] and [[Flow v3.2 - 6 Scene prompts]].
- Write an agent's or a model's brief as the intent plus the hard constraints (API limits, fixed lines, paid-for rules). Leave creative judgement to the model.
- **Wait on renders actively.** After a submission, poll with `jobs_wait` until each job is done. Land and check each one as it comes back ([[Flow v3.2 - 7 Takes]]), and report.
- Never end a turn with a scheduled check-in or a "check back later" while the user is around. Use `send_later` only when the user is clearly away.

## Access prompts on the Mac

- The first command that reaches a folder macOS protects (Desktop, Documents, Downloads, an external drive) can raise an "allow access" prompt that only shows on the Mac. Warn the user before you run it. Run such commands with a time limit: `perl -e 'alarm N; exec @ARGV' …` (macOS has no `timeout`).
- A hang or a time-out there means a prompt is waiting. Tell the user at once that access is blocked, probably by a permission prompt on the Mac. Never skip the step quietly.
- The lasting fix: System Settings, Privacy & Security, Files and Folders, for the app that runs Alma.

## Moderation

- Blocked attempts are free. No word is banned from a prompt beforehand.
- **After a refusal, check the prompt for not-safe-for-work words and words that lean that way** (such as "bare" or "weeping"), and replace those. Then send it again.
- If it is still refused, reword the directions: neutral verbs, no touching, only what is in frame, "costume design reference for a film" for a costume. Send a torso or lower-half crop if the full figure trips it. Swear words, armed figures and a body lying flat and still can trip the filter.
- **A child appears only in a scene that is fully safe for work:** nothing violent, no restraints, no threat, fully clothed. When the story puts a young person in a scene with violence, restraint or danger (a captive, a prisoner, a fight), write that person as an adult from the start: a young man or woman in their twenties, who can still be called young in the lines. Check it at the story and the script, and again when the characters and group pictures are briefed, before any picture is generated. The video filter refuses such pictures, and the rule holds regardless of the filter.
- **Never reword a line of dialogue to pass a filter.** Stop and put the choice in front of the user; either fix needs a new go.
  - The one exception is a refusal: when the risky word is inside a spoken line, replace that word in the line, send it again, and tell the user what you changed. The script and the subtitles follow: they show the word that was spoken in the take that is in the film.
- Log every blocked job in `$FILM/spend.md` with cost 0. Tell the user when a frame or a take needed retries.

## The flow's text

- **Rules live only in these notes.** The studio holds code and templates beside them: `tools/` holds every script the notes name, and `templates/` holds a template for every file you write by hand (`templates/README.md` maps each to its place in the film folder and the script that reads it). The `film` skill and the studio's `CLAUDE.md` point to [[Film Flow v3.2]] and hold no rule. Write each rule once, in the note of its stage; other notes link to it.
- Each stage note names its scripts by path with their commands, and the template its steps start from. Change a script that carries a rule together with the rule.
- **Stage notes are instructions.** Imperative, step by step, each one standing alone: purpose, inputs, steps, checks, gates, outputs, tools. They carry no provenance: no dates, quotes, names, version words, history or evidence.
- **The record holds the provenance.** The user's words, the dates, the sessions and the lessons go only into [[Film Flow v3.2 - record]].
- Change these notes only on the user's word. A correction from the user is their word; save it as below. Add, remove or reword nothing otherwise.
- **A fix kept for later goes into `flow-fixes.md`** at the studio root: a fix to the flow the user asks for but wants applied later, a change the flow needs in a script or in the app, and anything the user had to provide by hand that the flow should have known. One row each in its table: the number, the date, the user's words verbatim, what it was about (with the film), the note and step it would change, and whether it is applied. Something the user provided by hand goes in the second table (number, date, what, film). Apply an entry only on the user's word, then mark it applied.
- **A change of route is a new version of the flow** (another video model, another way of building a scene or a film): ask the user before writing one. Corrections and additions go into these notes in place.
- The method notes 6a to 6d are method references. Never edit them by hand; a change to scene direction goes into [[Flow v3.2 - 6 Scene prompts]].

## Saving corrections

Every time the user corrects the work (a rule, a craft note, a question about why you did something), start one background agent that saves the correction, and keep working without waiting for it.

1. **Find the transcript.** It is `~/.claude/projects/<folder>/<session id>.jsonl`, where `<folder>` is the full path of the studio folder with every `/` and `.` turned into `-` (a studio at `/Users/sam/films/studio` writes to `~/.claude/projects/-Users-sam-films-studio/`). The live session's file is the newest `.jsonl` there: `ls -t ~/.claude/projects/<folder>/*.jsonl | head -1`. Check that its last user turn is the correction. The file name is the session id.
2. **Spawn the agent** with the Agent tool, `model: "opus"` and `run_in_background: true`, on the brief below, filled in. Say in one line in the thread that it is running.
3. **Keep working.** Send a further correction to the same agent with `SendMessage` while it runs; never start a second one.
4. **Report** when it finishes, one line per correction: the note and section it went into, and whether it was new, an update or a duplicate.

Where a correction goes:

| About | Note |
|---|---|
| film folder, IDs, storage, story and script | [[Flow v3.2 - 1 Setup and story]] |
| faces, sheets, skin | [[Flow v3.2 - 2 Characters]] |
| voices, recordings, video elements | [[Flow v3.2 - 3 Voices and video elements]] |
| locations, views, props | [[Flow v3.2 - 4 Locations and props]] |
| previz, grey boards, storyboard pages | [[Flow v3.2 - 5 Previz and storyboards]] |
| scene prompts, acting and fight direction | [[Flow v3.2 - 6 Scene prompts]] |
| generating, landing and checking takes | [[Flow v3.2 - 7 Takes]] |
| redos and pick-ups | [[Flow v3.2 - 8 Redos]] |
| the cut | [[Flow v3.2 - 9 Edit]] |
| 1080p, upscale and finalize | [[Flow v3.2 - 10 Finish and 1080p]] |
| sound and music | [[Flow v3.2 - 11 Sound and music]] |
| captions, posting, film records, published links | [[Flow v3.2 - 12 Release]] |
| services, prices, machines, keys | [[Flow v3.2 - 13 Services and costs]] |
| anything that holds at every stage | this note |
| not about filmmaking (another project, a machine or tool note) | that project's memory folder |

The brief:

```
You are saving the user's corrections from a live Claude Code session into Film Flow v3.2, in
<the studio folder's full path>/flow/.
Edit only the stage notes named below and "Film Flow v3.2 - record.md" in that folder. Never edit the method
notes 6a-6d, tools/, templates/, the app, the film's folder, its prompts or git. Touch memory only for a correction
that is not about filmmaking: it goes to that project's memory folder instead.
Never print an API key or a signed URL; never write the assistant's model name into a note. Use the studio's
.venv/bin/python for scripts.

THE CONVERSATION: transcript <jsonl path> (session <id>, <date>, film <name>, <what was being worked on>).
Read ONLY from the user message beginning "<first words>" to the end. Stream it line by line; transcripts run to
hundreds of MB. The user's turns are message.role == "user" text blocks (not tool_result blocks) and queued mid-turn
messages (attachment.type == "queued_command"); read assistant text only to understand what a correction was about.

THE CORRECTIONS (verify each against the transcript, quote the user verbatim, say what it was about):
1. <the correction as the main thread understood it> - <context> - likely note: <v3.2 note and section>

DUPLICATE CHECK: search every v3.2 note for the same rule first.
Already there: leave the stage note as it is; write only the record entry.
Partly there: rewrite the rule in place so the note states the whole rule once.
New: add it as a step, check, gate, output or tool in the section of the stage note it belongs to.

TWO WRITES PER CORRECTION:
1. The stage note: the clean rule as an instruction to the AI. Imperative, short plain sentences, no em-dashes,
   no provenance (no dates, quotes, names, version words, history or evidence).
2. "Film Flow v3.2 - record": one row of its table: the date of the user's message, their words verbatim, what it was
   about, the session id and transcript path, the film and the evidence (when the correction came from a take), the
   note and section the rule went into, and new / update / duplicate.

The main thread is editing <files> right now; stay off them.
Return the notes changed and one line per correction: new / update / duplicate.
```
