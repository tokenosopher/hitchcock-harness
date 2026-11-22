# The AI editor: a first cut made by looking

What it is: an AI editor (an Opus agent) tightens a film's assembled cut shot by shot, by looking at frames and reading the lines, with the user's own editing rules, and writes one line of reason for every decision. The rule tool (`first_cut.py`) only measures; the editor decides. The step and its rules are in `flow/Flow v3.3 - 9 Edit.md`, step 4. Each run's work is kept in the film, in `$FILM/ai-editor/<YYYY-MM-DD>/`.

## What the editor is given
- The assembled cut before the user edits it (`cut/v<n>.json`), the film's `script.md` and `brief.md`.
- The edit sheet and strips from `edit_sheet.py`. For each cut point the sheet gives:
  - the clips and the words near the cut, with times;
  - the silences;
  - a rough motion measure;
  - the sound level at the cut.

  Each strip shows the outgoing shot's last frames, the incoming shot's first frames, and the incoming shot further in, where slow starts hide.
- The user's rules (`flow/Flow v3.3 - 9 Edit.md`, step 4) and their measured habits. Until the user's own finished cuts have been measured (`first_cut.py --learn <finished version>`), these starting numbers, from the film this tool was first made on:
  - about 19 frames between lines when the speaker changes;
  - pauses within one speaker up to about 52 frames;
  - at least 3 frames before a first word and 4 after a last;
  - the shortest shot about 18 frames;
  - fade-ins of about 13 frames.
- The lessons below.
- Freedom to pull more frames from any take with ffmpeg, into `$FILM/scratch.nosync/`.

## How it works
1. For each shot, write what it is for in the story; then decide: trim the head, trim the tail, speed up (up to 125%), carry the line over the next picture (the sound unlinked onto a second dialogue track), fade the shot's own sound in. Leaving a shot alone is a decision too.
2. Write every decision with its reason and a confidence of 1 to 3 into `decisions.json` in the run folder, then freeze the file (its sha1 and the time, in `frozen.txt` beside it) before anything else.
3. Apply the decisions to the cut, check it with the harness's validator, and hand it to the user as a new version beside theirs, through the app's own route (an Alma drop, the app's edit recipe), on the user's yes. The user's cut is never touched.
4. The user watches, keeps or corrects. Each correction, with the user's reason when given, goes into the lessons below for the next film.

## Every edit stays open to the user's hand
The editor only moves clips' in and out points on the original take files, sets a clip's speed, and unlinks or moves a clip's sound. It never renders, cuts or re-encodes a new file for the cut. Every edge can then be dragged back out in the timeline as far as its take goes.

## Out of scope so far
Music (the user chooses it), added sound effects (the sound designer's, `tools/sound/SOUND_DESIGNER.md`), levels and the title card. Take swaps and dropping scenes are proposals to the user, never made by the editor.

## The lessons
Taste, not flow rules: each one comes from the user's corrections of a first cut, the reasons they gave for their own changes while editing, or the debrief after a release (`flow/Flow v3.3 - 12 Release.md`). Add each new one here at once, numbered, in plain words, with the film it came from. A lesson that a later correction contradicts is changed, not kept beside it.

<!-- One entry per lesson, in this shape:
1. <The lesson, as a rule the editor can follow.> (From <film>, <what the user changed or said>.)
-->

(None yet.)

## Running it
Make the edit sheet first, into the run folder:

```
.venv/bin/python tools/edit/edit_sheet.py "$FILM" <base version> --out-dir "$FILM/ai-editor/<YYYY-MM-DD>"
```

Its other options are in `FIRST_CUT.md`. Then brief an Opus agent with the sections above, the paths, and these rules: write nothing into the film's cut until the user says so, make no paid calls, keep scratch in `$FILM/scratch.nosync/` (never `/tmp`), and freeze the decisions before applying them.
