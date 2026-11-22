# tools/edit

Local helpers for the edit. The cut itself is made on the Edit page of the Hitchcock Harness (the app's edit recipe and
`flow/Flow v3.3 - 9 Edit.md`); these scripts measure clips and make the few files the edit drops in beside the takes.
Run from the studio folder with `.venv/bin/python` (numpy, Pillow); ffmpeg and ffprobe on PATH.

| Script | Command | What it does |
|---|---|---|
| `cuts.py` | `.venv/bin/python tools/edit/cuts.py <clip.mp4> [<clip.mp4> …] [--json]` | the cut detector: each clip's length, frame count and cuts (seconds, and the frame number of each new shot's first frame), at an ffmpeg scene score above 0.18; the one place the threshold lives |
| `title_card.py` | `.venv/bin/python tools/edit/title_card.py --out "$FILM/edits/title/title-card" --title "<PLACE, YEAR>" [--sub "<line>" …] --seconds 3 --size 480x854 --size 1080x1920 [--sound <wav>]` | the house title card: Optima capitals on black, the still (1440x2560) and a clip per size, 24 fps |
| `freeze_region.py` | `.venv/bin/python tools/edit/freeze_region.py IN.mp4 OUT.mp4 SRC_FRAME START END\|-1 CX CY RX RY [--feather 4]` | freezes an ellipse of the picture from one good frame of the same take, from frame START; writes `OUT-check.jpg` to look at first. Unproven |
| `probe_clip.py` | `.venv/bin/python tools/edit/probe_clip.py --film "$FILM" <clip> [--thresh 18] [--no-words]` | one generation's frame count, its shot changes by frame difference, and its words with times (Whisper on this Mac) |
| `first_cut.py` | `.venv/bin/python tools/edit/first_cut.py "$FILM" <base version> --out <file.json> [--report <file.md>] [--speed] [--learn <finished version>]` | the measured rules of a first cut (gaps between lines, slow lines, a line carried over the next picture, a loud start eased in, levels, the title card's pace), each change with its reason; free, writes nothing into the film. `FIRST_CUT.md` |
| `edit_sheet.py` | `.venv/bin/python tools/edit/edit_sheet.py "$FILM" <base version> --out-dir "$FILM/ai-editor/<YYYY-MM-DD>"` | the AI editor's edit sheet: per cut point the clips and words near it with times, the silences, a motion measure, the sound level, the rules' suggestions, and a picture strip per cut. `AI_EDITOR.md` |
| `first_cut_bench.py` | `.venv/bin/python tools/edit/first_cut_bench.py "$FILM" <base version> <first cut json> <finished version>` | a first cut measured against the user's own finished cut of the same base, shot by shot |
| `filmlib.py` | library | the film folder helpers the prompt and edit tools share: a generation's folder and files, a take, the media list a take was made from, its planned shots, its transcript |

The AI editor (`AI_EDITOR.md`: what it is given, how it works, its lessons) and the measured rules (`FIRST_CUT.md`) are
the first cut of `flow/Flow v3.3 - 9 Edit.md`, step 4.

Frames are always pulled by frame index from a decode from the start, never by `-ss` seeking.
