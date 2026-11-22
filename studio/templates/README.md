# Templates for a new film

One template for every file Alma writes by hand for a film. The rules live in `flow/` (Film Flow v3.3); each template opens with a two-line header naming the script that reads it and the Flow v3.3 note that describes it (an HTML comment in Markdown, an `_about` key in JSON). Placeholders: `<Film>` the title, `<film-slug>` the folder, `<CID>` a character ID (C01), `<LID>` a location, `<PID>` a prop, `<G>` a generation (S1, or FIX-<what> for a pick-up), `<N>`/`<n>` numbers, `<CODE>` the film's element prefix.

| Template | Where it goes (film folder `assets/films/<film-slug>/` unless shown) | Read by |
|---|---|---|
| `brief.md` | `brief.md` | no script (every stage, by hand) |
| `script.md` | `script.md` | no script (scene files and `social/script.json` take their lines from it) |
| `generation/scene.md` | `generations/<G>/<G>-scene.md` | `tools/prompts/assemble.py` (`## Shots`, `## ACTING TASKS`, `## FIGHT BEATS`); `tools/prompts/check.py` through the prompt |
| `generation/prompt-spec.md` | `generations/<G>/<G>-prompt-spec.md` | `tools/prompts/assemble.py` (`## MEDIA`, `## TAGS`, the text sections) |
| `generation/prompt-common.md` | `generations/prompt-common.md` | `tools/prompts/assemble.py` (`@KEY` in MEDIA descriptions and TAGS lines only) |
| `generation/shots.json` | `generations/<G>/<G>-shots.json` | `tools/prompts/check.py` (`id`, `in_frame`, `duration`); `tools/prompts/assemble.py` (`duration` fallback); the previz scene script |
| `generation/media.json` | `generations/<G>/prompt/<G>-media-<v>.json` (written by `assemble.py`; by hand only for a set it does not build) | `tools/prompts/check.py` |
| `previz/previz-take.json` | `previz/<G>/<G>-previz-take-<N>.json` (written by the scene script's `run()`) | `tools/prompts/assemble.py`, `tools/prompts/check.py`, `tools/previz/assemble_film.py` |
| `previz/board.json` | `previz/<G>/storyboard/v<N>/board.json` | `tools/previz/storyboard.py` |
| `views.md` | `locations/views.md` (one table per location, a row per painted view) | `tools/previz/views_cams.py` (adds the Camera column); `tools/previz/precheck.py` (the plate check) |
| `elements.json` | `elements.json` | no script (looked up for prompts, finalizes, the record) |
| `higgsfield.json` | `higgsfield.json` | no script (`folder_id` for every Higgsfield job) |
| `spend.md` | `spend.md` | no script (cost lines are added up by hand) |
| `review/cards.json` | `review/cards.json` (written by `tools/film/new_film.py`) | the Hitchcock Harness, whose show recipe (`recipes/show.md` in the app's folder) gives the card shapes; `tools/film/land.py` (adds a landed clip's card); `tools/deliver.py` (`delivery_folder`) |
| `social/script.json` | `social/script.json` | `tools/release/make_srt.py` |
| `records/film-record.md` | `film-records/<Film>.md` at the studio root | no script |
| `records/voices-row.md` | one row per voice in `film-records/voices.md` at the studio root | no script |
| `records/finished-script.md` | `finished-scripts/<Public Title>.md` at the studio root, written at the lock and kept current | no script |

Notes:
- `generations/` is the folder name. The tools read `generations/<G>/` first and fall back to `blocks/<G>/` for an older film.
- JSON templates carry their two header lines as an `_about` key, which every reader ignores. `social/script.json` is a list, so its header is two `//` lines: delete them when you copy it in.
- In `prompt-spec.md` every guidance comment holds an `@`, so one left in a section that reaches the prompt makes `check.py` stop. No `<…>` placeholder may stay in a section `assemble.py` reads; `check.py` does not look for them.
