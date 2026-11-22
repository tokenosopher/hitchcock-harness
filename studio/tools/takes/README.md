# tools/takes

The record of what was sent for a take, and the check of a landed take (`flow/Flow v3.3 - 7 Takes.md`, step 8 and the checks after landing).

| Script | Command | What it does |
|---|---|---|
| `record_sent.py` | `.venv/bin/python tools/takes/record_sent.py "$FILM" --kind take\|pickup\|element --id <G> --take N --version vN --job <job id> [--params <the generate_video arguments as sent, saved to a file>]` | the record of what was sent to the model for one take, run right after `generate_video` returns the job id: `<G>-take<N>-sent.json` beside the take with the exact prompt, the model and its settings, every reference in the order sent (role, tag, media id, file), the layout (previz take, storyboard version) and the `spend.md` row it found; writes the job id file when there is none. The shape is in its docstring |
| `verify_clip.py` | `.venv/bin/python tools/takes/verify_clip.py "$FILM/generations/<G>/takes/take<N>" --film "$FILM" [--no-stt] [--lines FILE] [--shots FILE] [--panels DIR]` | the take's words against the generation's lines (its `stt.json`, written by `tools/stt/transcribe.py`, else Whisper runs now), its cuts against the planned shots (scene score above 0.18), the tail after the last word, and a contact sheet by frame index; writes `check.json` and `check.jpg` in the take folder |

The verdict is a prompt for your own look and listen: open the sheet and play the clip. Its words check is unproven on a
real transcript: read it against `transcribe.py --lines`.
