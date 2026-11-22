# Studio

This folder is the film studio of Hitchcock Harness: where Alma (Claude Code, run by the app) makes short AI films with Higgsfield, the Seedance 2.5 video-driven way. Every paid job goes through the `higgsfield` MCP server; everything else runs on this Mac.

## Before any film work
1. Load the `studio-film` skill (`.claude/skills/studio-film/SKILL.md`). It is this studio's film skill; a skill named plain `film`, if one is listed on this machine, belongs to another setup and is never loaded here. It reads the rules in `flow/`: the index `flow/Film Flow v3.3.md`, then `flow/Flow v3.3 - 0 Standing rules.md`, then the note of the stage at hand.
2. Say the stage back to the user in one line before doing anything.
3. A first film (no rows in `taste.md`, nothing in `assets/final-cuts/`) is guided, as `flow/Flow v3.3 - 0 Standing rules.md` says under "A first film": point the person to `../GUIDE.md` once.

## Where things are (all relative to this folder)
- `flow/`: the rules, one note per stage. Every rule lives there and only there; this file says where things are.
- `assets/films/<film>/`: each film (`$FILM` in the notes). `assets/library/`: the picks across films. `assets/final-cuts/<YYYY-MM-DD> <Title>/`: the delivered cuts.
- `taste.md`, `flow-fixes.md`, `published-links.md`, `film-records/`, `finished-scripts/`: the records, as the standing rules describe them.
- `templates/`: a template for every file written by hand. `tools/`: every script the notes name.
- `films.txt`: the films the app shows, written by `tools/film/new_film.py`.

## Python and ffmpeg
Run scripts with `.venv/bin/python tools/…`. ffmpeg, ffprobe, Blender and `uv` (which runs Demucs and Whisper) are installed or checked by `./setup.sh` in the app's folder, which also makes the environment. macOS has no `timeout`: use `perl -e 'alarm N; exec @ARGV' …`.

## Corrections
A correction from the user makes two writes, by the corrections agent the standing rules describe: the clean rule into the stage note in `flow/`, the user's words and the source into `flow/Film Flow v3.3 - record.md`. Never into this file. A fix the user wants kept for later goes into `flow-fixes.md`.
