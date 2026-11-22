# tools/stems

Splits a take or an audio file into stems with Demucs, on this Mac, free: two stems (`vocals`, `no_vocals`: the voice
and everything else, for removing music or for a character's voice stem) or four (`vocals`, `drums`, `bass`, `other`).
Demucs runs through `uv`; `tools/setup/install_local.sh` downloads it ahead of the first film.

```bash
.venv/bin/python tools/stems/split.py "$FILM" <take.mp4 | audio file> [--name <name>] [--four] [--again]
```

The stems land in `$FILM/audio/stems/<name>/` (`<name>` is the file's name by default) as full-length 44.1 kHz stereo
WAV files, with `source.txt` naming the input. A folder that already holds them is left alone unless `--again`.
Isolating one named sound has no route: use the four stems, or leave it.

The command it runs, if you need it by hand:

```bash
uv run --quiet --no-project --python 3.12 --with demucs==4.1.0 --with numpy --with soundfile \
    demucs -n htdemucs --two-stems vocals -o <out folder> <file.wav>
```

(Drop `--two-stems vocals` for four stems. The results are `<out folder>/htdemucs/<file name>/<stem>.wav`.)

## When Demucs is not installed

Use Higgsfield's `separate_stems` through the `higgsfield` MCP server (paid; quote it from the price on file in
`flow/Flow v3.3 - 13 Services and costs.md`):

1. Bring the file into the Higgsfield sandbox with `sandbox_exec` (it lives under `/home/user`).
2. Call `separate_stems` with `path` (the file in the sandbox), `mode: two` (vocals, no_vocals) or `four`, and a new
   `out_dir`. It returns a status file: read it with `sandbox_exec` until the job is done.
3. Bring the FLAC stems back and save them as `$FILM/audio/stems/<name>/<stem>.flac`, without printing any link.
