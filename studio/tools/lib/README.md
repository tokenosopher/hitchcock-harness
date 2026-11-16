# tools/lib

Shared by more than one tools folder; a script imports them with `sys.path.insert(0, <tools>/lib)`, found from its own
location.

- `stt.py`: word times from Whisper on this Mac (faster-whisper through `uv`, free): `stt_words(path)` returns
  `[{text, start, end, type, probability}, …]`. `.venv/bin/python tools/lib/stt.py CLIP` prints the words. Used by
  `stt/transcribe.py`, `voices/`, `takes/verify_clip.py`, `release/make_srt.py`, `edit/probe_clip.py`.
- `filmpath.py`: finds the film folder (`--film` path or a name under `assets/films/`, `$FILM`, or the working
  directory). Used by the `release/` scripts.
- `script_md.py`: the spoken lines of `script.md` (`### S<n>` sections, `**NAME:** "words"` rows). Used by
  `release/make_script_json.py`, `takes/verify_clip.py` and `stt/transcribe.py --lines`.
