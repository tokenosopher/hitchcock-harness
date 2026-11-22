# tools/voices

The voice scripts. They call no service: every paid voice job (a voice from the face, a variant of a preset, a saved
voice, the spoken lines) is a Higgsfield call Alma makes through the `higgsfield` MCP server, and these scripts handle the
files before and after. Word times come from Whisper on this Mac (`tools/lib/stt.py`, free). The rules are in
`flow/Flow v3.3 - 3 Voices and video elements.md`.

A pick is recorded, never saved: `cast.json` holds the picked preview file and the user's words. The video model learns
the voice from the element line cut from that preview. A voice is saved on Higgsfield (`create_voice_from_confirmed_audio`)
only when a later job must speak new words in it, and then `pick.py --voice-id` records the saved voice. Old `cast.json`
entries (a voice id and no preview) read as before.

Run from the studio folder with the film folder in `FILM` (or `--film <folder>` on any script):

```bash
FILM=$PWD/assets/films/<film> .venv/bin/python tools/voices/<script> ...
```

## Per film

Copy `spec_template.py` to `$FILM/voices/spec.py` and fill it from the locked script: `TITLE`, `SPEC` (per character:
name, brief, instruction, candidate text, sample lines), `LINES` (id, character, tags, parts), `GAP`, `BEAT`,
`GAP_BEFORE`, `TEMPO`, `EQUIV`, `ALLOW_EVENTS`. Update a line there whenever `takes.py` or `speed_up.py` changes its
recording, so the spec matches the file.

## Scripts

| Script | Command | What it does |
|---|---|---|
| `hf_candidates.py` | `hf_candidates.py add <CID> --round r1 --kind preset\|face\|variant --file <audio> [--voice-id ID] [--voice-type preset\|element] [--job ID] [--instruction '…']` · `hf_candidates.py list` | records one candidate Alma made: copies it to `voices/options/`, measures pitch and length, writes `voices/options.json` (the round's text from `spec.py`) |
| `pick.py` | `pick.py C01 3 --note '…'` · `pick.py C01 --preview FILE --note '…'` · `pick.py C01 --voice-id ID --voice-type preset\|element --source '…'` | records the pick in `voices/cast.json` (the preview file and the user's words) and the chosen option in `voices/options.json`; `--preview` records any preview file (another character's option, a library voice's preview); `--voice-id` records a voice saved on Higgsfield, or a preset |
| `element_line.py` | `element_line.py C01 [--option N \| --preview FILE] [--dry-run] [--force]` | cuts "This is how I look and this is how I sound." from the picked candidate (the chosen option, else the preview in `cast.json`) by its word times → `cast/<CID>-<name>/voice/element-line-5s.mp3` (+ `-raw.mp3`), its entry in `voices/element-lines-5s.json` |
| `record.py` | `record.py [--todo] [--redo V05 …] [--changed] [--read [--take N]]` | builds every line from its raw takes in `audio/raw/<VID>-<name>-<part>.mp3`: checks the words, cuts a line out of a take with context, joins parts, trims, applies `TEMPO` → `audio/lines/`, `audio/lines.json`, `audio/table-read-vN`; `--todo` lists the takes still to speak |
| `takes.py` | `takes.py V17 --add A <file> --add B <file>` · `takes.py V17 --choose A --note '…'` | alternative deliveries of one line, checked and trimmed; then the pick becomes the line |
| `speed_up.py` | `speed_up.py V04 --factor 1.15` · `--target 5.1` · `--all --factor 1.2` | `atempo` (pitch kept), re-checked by transcript, original kept |
| `emphasis.py` | `emphasis.py V17 --word any` · `emphasis.py take.mp3 --word face` | per-word level and pitch: where the stress falls |
| `pad_short.py` | `pad_short.py [--min 2.0] [--to 2.6]` | padded copies of lines under 2 s for Seedance → `audio/padded/` |
| `measure_speech.py` | `measure_speech.py` | speech edges, level and pitch of every line; outliers per character |
| `measure.py` | `measure.py FILE …` (no `FILM` needed) | length, speech edges, median pitch, level |
| `film.py` | library | film folder, `spec.py`, `lines.json`, snapshots, transcript folding, Whisper word times, ffmpeg helpers (`trim`, `atempo`, `concat`, `silence`, `dur`) |
| `spec_template.py` | copy to `$FILM/voices/spec.py` | the per-film tables, with a made-up example |

## Files they write

- `voices/options.json`, by character ID: `name`, `options[]` (`option`, `round`, `file`, `f0`, `f0_element_line`,
  `seconds`, `brief`, `voice_id`, `kind`, `voice_type`, `job`, `instruction`), `rounds.<round>` (`design_prompt` = the
  candidate text, `brief`, `instruction`), `chosen` (`option`, `note`, `voice_id`, `voice_type`).
- `voices/cast.json`, by character ID: `name`, `preview` (the picked preview file), `voice_id` (only for a preset or a
  voice saved on Higgsfield), `voice_type`, `source` ("… option N …" marks the pick), `note`, `model`, and `history` when
  the voice changed (a saved voice is never lost).
- `voices/element-lines-5s.json`: a list of `{character, name, option, voice_id, voice_type, note, raw, file,
  seconds_raw, seconds, transcript, f0, source}` (or a map by character ID, when the file already is one).
- `audio/lines.json`: one record per line (`id`, `character`, `file`, `text`, `transcript`, `verified`, `seconds`,
  `tempo`, `speech_start`, `speech_end`, `takes`, picks under `note`, `chosen_take`, `alternates`, `previous`).

Every raw take stays in `audio/raw/`; a replaced line file is kept in `audio/takes/`, and `lines.json` is snapshotted in
`audio/history/` before a run changes it.
