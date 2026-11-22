# First cut: the measured rules

`first_cut.py` takes an untightened cut of a film and returns it trimmed and mixed by rules that can be measured.
Each change comes with its rule and the measure behind it. It is free and local: it reads the cut, the takes'
cached word timings (from `tools/stt/transcribe.py`) and their sound. It never runs a transcription or any paid call,
and it writes nothing into the film folder. The AI editor (`AI_EDITOR.md`) reads its suggestions; it decides.

## The three tools

```
.venv/bin/python tools/edit/first_cut.py "$FILM" <base version> --out <file.json> [--report <file.md>] [--speed] [--learn <finished version>] [--no-motion]
.venv/bin/python tools/edit/first_cut_bench.py "$FILM" <base version> <file.json> <finished version> [--report <file.md>]
.venv/bin/python tools/edit/edit_sheet.py "$FILM" <base version> --out-dir <folder> [--learn <finished version>]
```

- `first_cut.py` writes a timeline in the harness's schema (`cut/v<n>.json` without a version: the harness sets it)
  and a report of every change. It checks its own output: no clips overlap on a track, nothing reads past a file's
  end, every picture keeps its sound.
- `first_cut_bench.py` compares a first cut with the user's finished cut of the same base, shot by shot, where both
  use the same take file.
- `edit_sheet.py` writes the facts at every cut for an editor (a person or an AI editor deciding with taste):
  `edit-sheet.json` with the clips, the words near the cut and their times, the silences, where motion starts and
  stops, the sound level, what the rules suggest, and one picture strip per cut (`strips/cut-NN.jpg`: the last 6
  frames out and the first 12 in, then the incoming shot every 4 frames from 12 frames in).

Write their output into the film's run folder (`$FILM/ai-editor/<YYYY-MM-DD>/`) or `$FILM/scratch.nosync/`, never `/tmp`.

## The rules

1. **No dead space between lines.** At a cut where both shots carry words, the silence from the last word to the
   next first word is closed to the gap the user keeps. An answer (the speaker changes) is closed to the user's
   median answer gap. A pause inside one speaker's lines is only shortened when it is longer than the longest such
   pause the user kept. The outgoing tail and the incoming head are trimmed so that the two sides keep about the same
   room, never past the handles the user keeps around a word, never into a word or a sound event (a laugh, a cleared
   throat). Shots with no words are left alone.
2. **Lines spoken too slowly.** A line's words a second against the same speaker's median in the film. A line under
   80% of it gets a proposed speed-up toward the median, capped at the user's largest speed-up. Applied to the whole
   shot only with `--speed`.
3. **The line carries over the next picture.** At a scene change the incoming head is kept, since it shows the new
   place. The time comes out of the outgoing picture instead. Its sound is unlinked and stays on a second dialogue
   track with the user's handle after the last word, so the line plays on over the new picture.
4. **Ease in a loud start.** At a real cut (the sound does not run on from the shot before), an incoming sound that
   is much louder in its first 100 ms than what played just before, and that does not rise by itself, gets a fade-in
   of the user's usual length.
5. **Levels.** A sound with no level of its own gets the user's level for its role: dialogue, music, reactions,
   room beds. A level set by hand is left and reported when it is far from the role's.
6. **Title card.** No longer than its words read at the user's pace.

## Calibration

Every threshold can come from the user's own edits. With `--learn <finished version>` the tool measures that finished
cut, compares it with the base and reads the film's edit history (`harness/cut-history.json`, `harness/cut-states/`).
Without it, it uses these defaults, learned from the film the tool was first made on. The report prints the numbers
and where each came from.

| number | default | how it is learned |
|---|---|---|
| gap at an answer | 19 f | median of the answer gaps in the finished cut |
| longest pause inside one speaker's lines | 52 f | the longest the user kept |
| handles around a word | 4 f after, 3 f before | the fewest the user kept at a cut |
| sound kept when a line carries over | 8 f | the lines the user let carry over |
| shortest shot | 18 f | the shortest picture shot |
| speed-up cap | 125% | the largest speed-up |
| fade-in | 13 f, at +8.6 dB | the user's fade-ins in the history; the jump where a fade disagrees least with them |
| title card | 4.54 words a second | the title card's words over its length |
| levels | dialogue 0, music -8, reactions -12, beds -20 dB | medians of the finished cut's gains |

Two numbers are fixed, not learned: no trim under 3 frames (word times move a few frames from one transcription to
the next), and "slow" means under 80% of the speaker's pace.

## What it does not do yet

- Shots with no words: the slow start of a movement ("cut the fluff at the head"), a reaction held too long, a
  silent beat the user shortens. The strips and the motion numbers in the edit sheet are there for the editor.
- Which side of a cut to trim when the picture decides it (a hold on a face against the next shot's start).
- Bad frames, crowd reactions, music placement.
- Fade-outs, and fades a level jump does not explain.
- Loudness by role (ebur128) is not measured.
- A take with no cached transcription gets no speech rules; the report lists it.
- It writes no drop file for Alma; its timeline goes into the cut through the app's own route.
