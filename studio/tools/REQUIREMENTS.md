# What the tools need

Everything here runs on this Mac and is free. The app's `setup.sh` installs or checks all of it.

| Needed | For | Where it comes from |
|---|---|---|
| The studio's Python, `.venv/bin/python` (3.11 or newer), with Pillow, numpy and scipy | every script in `tools/` | `setup.sh` makes `studio/.venv` and installs the three packages at the exact versions in `tools/requirements.txt` |
| ffmpeg and ffprobe, on PATH | almost every script (`HARNESS_FFMPEG` / `HARNESS_FFPROBE` point some scripts at another copy) | `brew install ffmpeg` |
| `uv` | Whisper (`tools/stt/`, `tools/lib/stt.py`) and Demucs (`tools/stems/`), each in its own Python 3.12 that uv brings | `brew install uv`; `bash studio/tools/setup/install_local.sh` (run by `setup.sh`) downloads both and their models ahead of the first film |
| Blender | the previz (`tools/previz/`, through `blender_run.py`) | the user installs it: `/Applications/Blender.app`, or its program's path in `BLENDER_BIN` |
| The Optima font | `tools/edit/title_card.py` | ships with macOS (`/System/Library/Fonts/Optima.ttc`) |

No script needs an API key: every paid job is a Higgsfield call Alma makes through the `higgsfield` MCP server.
macOS has no `timeout` command: use `perl -e 'alarm N; exec @ARGV' …`. ffmpeg's `drawtext` is not assumed; labels are
drawn with Pillow.
