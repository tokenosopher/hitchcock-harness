# tools/takes

The check of a landed take (`flow/Flow v3.2 - 7 Takes.md`, the checks after landing).

| Script | Command | What it does |
|---|---|---|
| `verify_clip.py` | `.venv/bin/python tools/takes/verify_clip.py "$FILM/generations/<G>/takes/take<N>" --film "$FILM" [--no-stt] [--lines FILE] [--shots FILE] [--panels DIR]` | the take's words against the generation's lines (its `stt.json`, written by `tools/stt/transcribe.py`, else Whisper runs now), its cuts against the planned shots (scene score above 0.18), the tail after the last word, and a contact sheet by frame index; writes `check.json` and `check.jpg` in the take folder |

The verdict is a prompt for your own look and listen: open the sheet and play the clip. Its words check is unproven on a
real transcript: read it against `transcribe.py --lines`.
