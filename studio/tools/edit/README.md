# tools/edit

Local helpers for the edit. The cut itself is made on the Edit page of the Hitchcock Harness (the app's edit recipe and
`flow/Flow v3.2 - 9 Edit.md`); these scripts measure clips and make the few files the edit drops in beside the takes.
Run from the studio folder with `.venv/bin/python` (numpy, Pillow); ffmpeg and ffprobe on PATH.

| Script | Command | What it does |
|---|---|---|
| `cuts.py` | `.venv/bin/python tools/edit/cuts.py <clip.mp4> [<clip.mp4> …] [--json]` | the cut detector: each clip's length, frame count and cuts (seconds, and the frame number of each new shot's first frame), at an ffmpeg scene score above 0.18; the one place the threshold lives |
| `title_card.py` | `.venv/bin/python tools/edit/title_card.py --out "$FILM/edits/title/title-card" --title "<PLACE, YEAR>" [--sub "<line>" …] --seconds 3 --size 480x854 --size 1080x1920 [--sound <wav>]` | the house title card: Optima capitals on black, the still (1440x2560) and a clip per size, 24 fps |
| `freeze_region.py` | `.venv/bin/python tools/edit/freeze_region.py IN.mp4 OUT.mp4 SRC_FRAME START END\|-1 CX CY RX RY [--feather 4]` | freezes an ellipse of the picture from one good frame of the same take, from frame START; writes `OUT-check.jpg` to look at first. Unproven |
| `probe_clip.py` | `.venv/bin/python tools/edit/probe_clip.py --film "$FILM" <clip> [--thresh 18] [--no-words]` | one generation's frame count, its shot changes by frame difference, and its words with times (Whisper on this Mac) |
| `filmlib.py` | library | the film folder helpers the prompt and edit tools share: a generation's folder and files, a take, the media list a take was made from, its planned shots, its transcript |

Frames are always pulled by frame index from a decode from the start, never by `-ss` seeking.
