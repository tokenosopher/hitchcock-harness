---
name: studio-film
description: Make, fix, finish or release a short AI film with Film Flow (the video-driven Seedance 2.5 flow on Higgsfield): characters, voices, video elements, locations, previz, scene prompts, takes and redos, the edit in Hitchcock Harness, 1080p, music, subtitles and the release. Use it whenever a film, a take, a pick-up, a prompt for Seedance or Higgsfield, a cut, a caption or a release is mentioned, even if the word "skill" is not. Loads the rules from the studio's flow/ folder.
---

# Studio film: the rules loader

This is the film skill of this studio. If a skill named plain `film` is also listed on this machine, it belongs to another setup: never load it here.

The rules live in this studio's `flow/` folder, in one place, and nowhere else. On each invocation, use Read to load, from the studio folder:

`flow/Film Flow v3.3.md`

That index names the stages and the note for each. Then, before doing anything:

1. Read `flow/Flow v3.3 - 0 Standing rules.md` in full.
2. Read the note of the stage at hand (`flow/Flow v3.3 - 1 … 13`) and the method notes it names (`6a Prompt engine`, `6b Acting`, `6c Fight scene`, `6d Anamorphic look`).
3. Say the stage back to the user in one line.

This file is only the entry and the pointer. If a note is missing, report the missing path instead of guessing its contents. Never write a rule into this file, into the studio's `CLAUDE.md` or into memory. A correction from the user goes two places, by the corrections agent described in the standing rules: the clean rule into the stage note it belongs to, the user's words and the source into `flow/Film Flow v3.3 - record.md`.

The scripts the notes name are in `tools/`, the templates in `templates/`, the films in `assets/films/`. The app the films are made in is Hitchcock Harness, the folder that holds this studio.
