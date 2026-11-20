# tools/stt

Whisper is a speech-recognition model: it turns speech into text, with the time each word starts and ends. Here it runs
on this Mac, free, as faster-whisper started through `uv` (model `small.en`), so it does not depend on the studio's own
Python; `tools/setup/install_local.sh` downloads it ahead of the first film.

## Commands

Run from the studio folder.

```bash
# a landed take: stt.json and transcript.txt in its take folder, and each expected line found once, in order, or not
.venv/bin/python tools/stt/transcribe.py "$FILM" "$FILM/generations/<G>/takes/take<N>" \
    [--lines "$FILM/generations/<G>/<G>-shots.json"] [--again]

# any audio or video file (a voice candidate, a song, the dialogue stem, a reference film): its words to a JSON file
.venv/bin/python tools/stt/transcribe.py --audio <file> --words-out <words.json> [--again]
```

- A take's `stt.json` is reused on every later run (word times move a few frames from run to run); `--again` replaces
  it. `--words-out` is reused while it is newer than the file.
- Both write the same shape: a list of words, each `{"text", "start", "end", "type": "word", "probability"}`, times
  in seconds. `transcript.txt` holds the words in phrases, a phrase per pause over 0.5 s, each with its times.
- Zero words means no speech (an instrumental).
- `--whisper <json>` uses words Whisper already wrote (this shape, or Whisper's own `{"segments": [{"words": …}]}`)
  instead of running it.

Read by `tools/takes/verify_clip.py` (a take's `stt.json`), `tools/release/make_srt.py --words`,
`tools/voices/element_line.py` (the candidate's `.stt.json`), `tools/edit/probe_clip.py` and the voice scripts.

## Files

- `transcribe.py`: the command above.
- `whisper_words.py`: runs Whisper on one file; started by `tools/lib/stt.py` as
  `uv run --quiet --no-project --python 3.12 --with faster-whisper==1.2.1 python tools/stt/whisper_words.py IN OUT.json --model small.en`.
  Another model: set `HARNESS_WHISPER_MODEL` (for example `medium.en`, slower and about 1.5 GB).
