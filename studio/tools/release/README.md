# tools/release

The release scripts: the caption script, the SRT laid on the cut's subtitle track, and the thumbnail options. The rules
are in `flow/Flow v3.3 - 12 Release.md`; the app burns the subtitles into the master and renders the finals, and every
text for posting is written by Alma and posted by the user by hand.

Run from the film folder, as note 12 does: `STUDIO` the studio folder, `PY="$STUDIO/.venv/bin/python"`,
`S="$STUDIO/tools/release"`, `FILM` the film folder. `--film` takes a path or a name under the studio's
`assets/films/`; relative paths are read from the film folder.

| Script | Command | What it does |
|---|---|---|
| `make_script_json.py` | `$PY $S/make_script_json.py --film "$FILM" [--script script.md \| --lines audio/lines.json] [--out social/script.json] [--lower WORD,WORD] [--skip S3,S5.2,V09]` | `social/script.json`: one `{shot, who, line}` per spoken line in film order, from `script.md` (shot = `S<n>`) or a line table (shot = line id), stage directions and emphasis marks taken out; capitals for stress listed, lowered only with `--lower` |
| `make_srt.py` | `$PY $S/make_srt.py social/dialogue-stem.wav social/script.json social/<slug>-w30.srt --width 30 --words social/<slug>.words.json --no-stt` | aligns the stem's cached words to the script; each cue has the script's words and the transcript's timing, at most 2 lines × width and 6.5 s, 0.15 s lead, 0.12 s tail; reports script lines not found in the cut |
| `thumbnails.py` | `$PY $S/thumbnails.py --film "$FILM" --master <the final's copy without subtitles> --at "<m:ss.xx>=<name>" [--at …] [--zoom "<name>:W,X,Y=<new name>"] [--srt social/<slug>-w30.srt] [--fps 24] [--outdir social]` | frames by index from one straight decode, zoomed 9:16 crops, `youtube-thumbnail-<name>.jpg` per option and one `thumbnails-sheet.jpg` at preview and feed size; flags times under a caption |

## The subtitle steps (note 12, steps 3 to 5)

```bash
$PY $S/make_script_json.py --film "$FILM"                       # social/script.json
ffmpeg -v error -y -i cut/renders/v<n>-<kind>-<tag>.dialogue.wav -ac 1 -ar 48000 social/dialogue-stem.wav
W=social/<slug>.words.json
$PY "$STUDIO/tools/stt/transcribe.py" --audio social/dialogue-stem.wav --words-out $W      # Whisper on this Mac, free
$PY $S/make_srt.py social/dialogue-stem.wav social/script.json social/<slug>-w30.srt --width 30 --words $W --no-stt
```

The stem is the dialogue file of a render with separate stems, never the mixed film. `make_srt.py --no-stt` never
transcribes: it stops on a missing cache, or one older than the stem, and writes nothing. The words cache is the list
`transcribe.py` writes (`tools/stt/README.md`).

Copying the final, its companions and the picked thumbnails into the Social kit is `tools/deliver.py`
(`--folder "<YYYY-MM-DD> <Title>" --sub "Social kit"`).
