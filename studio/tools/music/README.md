# tools/music

The score and the music checks. The rules are in `flow/Flow v3.3 - 11 Sound and music.md`. Every paid job (a composed
take, a sound effect) is a Higgsfield call Alma makes through the `higgsfield` MCP server; these scripts work on the
files. Run them from the studio folder with `.venv/bin/python` (numpy); `S=tools/music`.

| Script | Command | What it does |
|---|---|---|
| `log_take.py` | `log_take.py --film "$FILM" <CUE> <N> --job <job id> --credits <cr>` | logs a landed take in `audio/score/score-log.json`: prompt, length, loudness, the level of each planned section |
| `beat_grid.py` | `beat_grid.py <take> [<stem> …] --bpm 105,125` | tempo, first beat and bar lines |
| `song_edit.py` | `song_edit.py --film "$FILM" audio/score/song-edit.json audio/score/<CUE>-take<N>-edit.mp3` | bar-grid cuts, repeats, organ swells, ducks and the end fade, from the spec below |
| `lay_song.py` | `lay_song.py --film "$FILM" --song audio/score/song.wav --picture <dialogue render> --out audio/score/auditions/song-v<N>.mp4 [--stop <s> …] [--bed-out audio/score/song-v<N>-as-mixed.wav] [--preview 30] [--lowres] [--size 480:854] [--bed-db 4.5]` | lays a finished song or edited take under the dialogue, untouched: level, dip, stops, end fade; prints the bed level |
| `check_render.py` | `check_render.py <master> <dialogue render> --approved <approved audition> --frames <N>` | frame count, loudness, true peak, where the music stops, level change while speaking and in the gaps |
| `mix_score.py` | `mix_score.py NAME --film "$FILM" --picture <dialogue render> [--out audio/score/cues-mixed]` | a score of several cues: one WAV per cue (levelled, cut, ducked, starting on a whole frame) for the music track, `manifest.json` and a full-film preview. Check `df` first |
| `preview_music.py` | `preview_music.py <cue file> <music at> <from> <to> NAME --film "$FILM" --picture <dialogue render>` | one cue under a stretch of the cut, ducked, at -14 LUFS |
| `music_analyze.py` | `music_analyze.py --film "$FILM" --stems <stem dir> --out <stem dir>/music.json` | key, register, lead and loop length of a reference, from its stems |
| `dethermin.py` | `STEMS=drums,bass LEAD=other BAND=600,2000 dethermin.py <stem dir> backing.wav backing-plain.wav` | removes one instrument's bleed from the other stems (exploring only) |

`<dialogue render>` is the cut rendered with its dialogue tracks only:
`.venv/bin/python tools/finish/cut_render.py "$FILM" cut/v<n>.json audio/score/auditions/v<n>-dialogue-480p.mp4 --tracks <ids>`.
Stems of a take or a song come from Demucs on this Mac: `tools/stems/split.py` (`tools/stems/README.md`). A song's words:
`tools/stt/transcribe.py --audio <song> --words-out <song>.words.json` (zero words means an instrumental).

## A composed take on Higgsfield

1. Write the cue in `audio/score/cues.json` (shape below).
2. Quote it: `generate_audio` with `model: elevenlabs_music_v2`, the cue's `prompt`, `duration` (3 to 600 s),
   `force_instrumental`, `lyrics` (only for a sung cue, up to 120 s), `batch_size` 1, `use_unlim: false`, `folder_id`,
   and `get_cost: true`. Then the same call without `get_cost` on the go. Log the row in `spend.md`.
3. Wait with `jobs_wait`. Write the result URL to a file with the file tool (never on a command line, never in the
   thread) and download it: `curl -sS -o "$FILM/audio/score/<CUE>-take<N>.mp3" "$(head -1 <url file>)"`, then delete the
   URL file. Use `.wav` when Higgsfield returns a WAV.
4. Log it: `.venv/bin/python tools/music/log_take.py --film "$FILM" <CUE> <N> --job <job id> --credits <cr>`. After the
   user's word on it: `log_take.py --film "$FILM" <CUE> <N> --verdict '<the user's words>'`.
5. Measure it: `beat_grid.py`, and listen.

### `audio/score/cues.json`

One entry per cue under `cues`. `at` and the sections' `to` are film seconds; `use` is added when a take is chosen
(read by `mix_score.py`).

```json
{
 "cues": {
  "THEME": {
   "version": 1,
   "purpose": "the whole film under the dialogue",
   "at": 0.0,
   "duration": 92,
   "force_instrumental": true,
   "prompt": "Slow, warm chamber piece in D minor, 72 BPM. Solo cello carries a simple four-bar melody over soft piano chords; no drums. 0:00-0:20 cello alone, quiet; 0:20-1:05 piano joins, the melody repeats a little fuller; 1:05-1:32 thins back to the cello and ends on a held low D. Never loud, never busy: it sits under speech.",
   "sections": [
    {"name": "intro", "to": 20.0},
    {"name": "theme", "to": 65.0},
    {"name": "outro", "to": 92.0}
   ],
   "use": {"take": 2, "level": -21, "end": "natural", "gains": {"2": -2}}
  }
 }
}
```

- `lyrics` (optional): the words of a sung cue, up to 120 s of song; leave `force_instrumental` false.
- `use`: `take` (N of `<CUE>-take<N>`), `level` (LUFS), `end` (`natural` or `hard`), `cut_at` (film s, with `hard`),
  `until` (film s), `at` (`end` = the cue ends on the last frame), `gains` (dB by section index).

### `audio/score/score-log.json`

Written by `log_take.py`, keyed `<CUE>-take<N>`:

```json
{
 "THEME-take2": {
  "cue": "THEME", "take": 2, "job": "<job id>", "model": "elevenlabs_music_v2",
  "prompt": "Slow, warm chamber piece in D minor, …", "duration_asked": 92, "seconds": 92.0, "credits": 13.4,
  "date": "2026-11-20", "file": "audio/score/THEME-take2.mp3", "lufs": -17.8,
  "sections": [{"name": "intro", "start": 0.0, "end": 20.0, "lufs": -24.1}, {"name": "theme", "start": 20.0, "end": 65.0, "lufs": -16.9}],
  "verdict": "the user: keep the cello, less piano"
 }
}
```

### `audio/score/song-edit.json`

Read by `song_edit.py`. Times in seconds of the take; a time may be `{"bar": k}` (first beat + k bars, on the grid from
`beat_grid.py`); `null` is the take's end. `ducks` and `fade` are in film time.

```json
{
 "take": "audio/score/THEME-take2.mp3",
 "grid": {"first_beat": 0.42, "bar": 3.333},
 "segments": [[0, {"bar": 16}], [{"bar": 8}, null]],
 "length": 92.0,
 "xfade": 0.015,
 "ducks": [{"down": [41.2, 41.8], "up": [43.0, 44.2], "depth_db": 14}],
 "fade": [88.0, 91.5]
}
```

Optional `organ`: a soft tremolo organ chord swelling into each hand-over, `{"chord_hz": [146.8, 174.6, 220.0],
"handover_bars": [16], "film_offset": 0, "swell": 2.0, "hold": 0.5, "tail": 2.0, "decay": 0.5, "level_db": -8,
"ref_window": [16, 36], "seed": 3}`; build the chord from the take's measured key.

## The user's own music

Copy the file into the film as `audio/score/song.wav`, untouched, and lay it with `lay_song.py`.
