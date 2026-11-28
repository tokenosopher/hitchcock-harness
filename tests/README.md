# Testing Hitchcock Harness

The checks are the unit scripts in `scripts/*-test.ts`. Each runs in its own process with `npx tsx`, needs no server
and no browser, works in a temp folder of its own and exits 1 when a check fails. `tests/run.mjs` runs them.

## Which command

| when | command | about |
|---|---|---|
| after a change, before you say it works | `npm run test:changed` | seconds to 2 min |
| a broad change | `npm run test:quick` | about 10 s |
| one or a few checks you named | `node tests/run.mjs render refs` | as long as they take |
| before a release | `npm run test:slow` | 1 to 2 min |

Run each once. Run it again only after a fix.

## What they do

- **`test:quick`** runs the fast checks (`tier: 'quick'` in `tests/map.mjs`, a few seconds each at most).
- **`test:changed`** compares your branch with `main` (committed, staged, not staged and new files) and runs every check
  whose row in `tests/map.mjs` covers a changed file, and every check you changed. When nothing matches, it runs the
  quick tier. `-- --base HEAD` tests only what is not committed yet.
- **`test:slow`** runs every check, with the slow ones: `render-test` (makes real renders with ffmpeg, about a minute),
  `files-test`, `ondemand-test`, `alma-drop-test`, and the ffmpeg checks `cancel-render-test`, `fadefrom-test`,
  `frame-render-test` and `realres-test`.

The checks run four at a time, the longest first, each with `HARNESS_ALMA_DRYRUN=1`, so none reaches a real Alma.
`--plan` says what would run and runs nothing. The log goes to a folder under the system's temp folder (`TEST_OUT` to
choose); the last line names it.

`render-test` needs ffmpeg and the studio's Python: `studio/.venv` (made by `setup.sh`), or `HARNESS_PYTHON`. The
ffmpeg checks take ffmpeg from the PATH, or from `HARNESS_FFMPEG`.

## When you add or change a check

- Give it a row in `tests/map.mjs`: its tier, the source files it checks (`covers`, as globs) and its time in seconds.
- A check needs no arguments, makes its own temp folder (`mkdtemp`) and deletes it, and sets `HARNESS_ALMA_DRYRUN=1`
  itself if it loads anything that can send to Alma.

## Not checks

These are hand tools, and no tier runs them:

- `npm run smoke:thread` sends a real message to Alma.
- `npm run films:check` reads the films in the studio.
