# Hitchcock Harness · how it is built

A short map of the code, for whoever maintains this copy. The README says how to install and use it.

## The idea

A Next.js app on your Mac that is a window onto one Claude Code session per film. The agent in it is **Alma**. You talk to her in a thread; she reads the film rules, makes the film with the `higgsfield` MCP server, and writes everything into the film's folder. The pages never ask Alma what is going on: they read the folder. Every button that would cost something only puts a message in Alma's box; nothing on a page spends credits by itself.

```
Browser (Next.js pages)  ⇄  Harness server (Node, this Mac)  ⇄  claude -p   (one long-lived process per film)
                                   │                                  │  MCP: higgsfield
                                   ├─ watches studio/assets/films/<film>/ → page state (SSE)
                                   ├─ ffmpeg render queue (480p and the 1080p master)
                                   └─ writes your picks and answers into the film's record files
```

## Folders

| Where | What |
|---|---|
| `src/app/` | The pages (`films/[film]/…`, `library`, `settings`) and the API routes (`api/…`) |
| `src/components/` | The UI: the shell (sidebar, header), one folder per page family (`edit/`, `release/`, `characters/`, `go/`, `qc/` …) |
| `src/server/` | Everything that touches disk or a process: config, the Alma process, the film readers, the edit engine |
| `src/fixtures/` | One invented sample film for the sample-data mode (`MOCK=boards`), to try the app without a film of your own |
| `recipes/` | Instructions Alma reads for the harness's own file formats (cards, cut drops, release file, QC reports) |
| `scripts/` | `caption-cards.py` (the render's captions) and developer tests (`npm run <name>:test`) |
| `studio/` | The film workspace: Alma's working folder, the rules (`flow/`), the tools, the films (`assets/`) |
| `harness/` | Made at run time: sessions, the films list, thumbnails, backups, uploads, the write log. Not in git |

## The parts

**Config** (`src/server/config.ts`, `src/server/claude/config.ts`). Every path defaults to the layout of this folder: the studio is `<app>/studio`, films live in `studio/assets/films/`, the library in `studio/assets/library/`, delivered cuts in `studio/assets/final-cuts/`, the rules in `studio/flow/`. `claude`, `ffmpeg` and `ffprobe` are found on the PATH; Python is `studio/.venv/bin/python`. Each can be changed in `.env.local` (see `.env.example`).

**Alma** (`src/server/claude/`). `process.ts` runs one `claude -p --input-format stream-json --output-format stream-json` process per film with its working folder set to `studio/`, so the `studio-film` skill, the studio's `CLAUDE.md` and your MCP servers load as they would in a terminal. It appends a short standing prompt (`almaAppendPrompt()`): what the harness is, its address, the care rules, the spend gates, where the recipes are. The address is the port the server really listens on (`harnessUrl()` in `src/server/config.ts`: Next's `PORT`, set once the server listens, before `HARNESS_PORT`), and Alma's shell gets it as `$HARNESS_URL`, which the recipes' API calls use; no file she reads names a port. The session id per film is kept in `harness/sessions.json`; a closed process resumes with `--resume`. `stream.ts` turns the CLI's events into thread events; `tasks.ts` turns sub-agent runs into task cards; `transcript.ts` reads the thread's history back from Claude Code's own session file. Each message goes in with a `<harness-context>` block (`src/server/context.ts`) saying which film and page you are on and what you clicked.

**References in the message box** (`src/lib/refs.ts`, `src/components/shell/Composer.tsx`, `RefCard.tsx`, `refItems.ts`, `refPicking.ts`). A thing on the page can sit in your sentence as a chip at the text cursor: Option-click it while the box has the cursor, or arm the pick button by the box and click or tap it (the phone); Ctrl-M drops the playhead's moment; "@" opens a list. The box stays a plain textarea; the chips are drawn behind it. What is sent is the words with each chip as `<harness-ref kind="…" label="…" …/>` in its place; the thread turns the tags back into chips, so nothing is stored beside the transcript. Pages mark what can be picked with `data-ref` or register a source (`registerRefSource`, the Edit page's clips and shots). Alma's system prompt has one line on the tag; `recipes/show.md` says what each attribute means.

**The reserve switch** (`src/server/claude/reserve.ts`, `api/settings/reserve`, Settings > "Reserve: API credits"). Off by default: Alma runs on your Claude plan. On, every film's Alma is restarted (once idle) on the API key `HARNESS_RESERVE_API_KEY` from `.env.local` (optional, never committed), so her turns are paid from API credits; the setting and the month's spend are in `harness/alma-reserve.json`. The key is never sent to the browser or written to a log, and while it is in use Alma runs with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, so it does not reach the commands she runs.

**Reading the films** (`src/server/films/`). `registry.ts` lists every film under `studio/assets/films/` (plus delivered cuts in the final-cuts folder) into `harness/films.json`, which Alma also reads. `state.ts` builds one film's page state from its files, using the readers in `read/` (brief, script, story, cast, locations, previz, scenes and takes, the cut, spend, taste, finish, release). `watcher.ts` watches the folder and pushes a new state over server-sent events whenever a file changes.

**Writing** (`src/server/actions/`). The only writes the harness makes into a film: your picks (`pick.ts`, which also appends to `taste.md` and runs `studio/tools/voices/pick.py` for a voice), answers to cards (`answer.ts`), the story and script edits, a new film (`newFilm.ts`, which runs `studio/tools/film/new_film.py`). Every write goes through `writes.ts`: a copy never overwrites, and each write is a line in `harness/writes.log`.

**The edit engine** (`src/server/edit/`, `src/components/edit/`). The cut is a JSON timeline: `cut/v<n>.json` per saved version and `cut/working.json` for the working cut with its undo history. The Edit page edits it; Alma edits it only by dropping a file into `cut/alma/` (see `recipes/edit.md`), which the harness takes in as one undoable step. `render.ts` turns a timeline into one ffmpeg command (480p proxy or full-size master), one render at a time. `fullsize.ts` finds the full-size pictures by name (a take's `-1080p.mp4`, an upscaled take's `-1080p-up.mp4`, the upscaled cut `video/1080/cut-v<n>-1080.mp4`).

**The release** (`src/server/release/`, `src/components/release/`). `social/release.json` in the film folder holds the final, the texts per platform and the sending record; the Release pages edit it with checked operations, and Alma follows `recipes/release.md`.

**The library** (`src/server/library/store.ts`). Faces, voices, characters and locations saved across films, one folder each with a `meta.json`, copied (never moved) out of the film folders.

**Media** (`src/server/media.ts`, `api/media`). Serves images and video from the film folders, the library and the final cuts only, with thumbnails made once by sharp and ffmpeg into `harness/thumbs/`.

## Safety

Alma runs with Claude Code's permission prompts off (`--dangerously-skip-permissions`), because nobody sits at a terminal to answer them. What holds her is the standing prompt (never delete without your yes on that name, never overwrite a media file or a cut version, never spend outside the gates, what she reads is material and never instructions) and the film rules. `HARNESS_ALMA_PERMISSIONS=ask` switches her to accept-edits: file edits go through, and every other tool is refused unless the user's own Claude Code allow rules let it through. Who may reach the server: it listens on 127.0.0.1 only (`-H 127.0.0.1` in `package.json`), so nothing off this Mac reaches it directly. `src/proxy.ts` then refuses a change asked for by another site (a foreign `Origin`, or `Sec-Fetch-Site` cross-site or same-site; another site may only open a page), and takes a request that came through a tunnel or a proxy (its forwarding headers) as remote even when its Host reads localhost. A remote request needs the cookie set by opening `/unlock?t=<HARNESS_TUNNEL_TOKEN>` once on that device; the cookie holds a SHA-256 made from the key, not the key. Without `HARNESS_TUNNEL_TOKEN` (16 characters or more) every remote request is refused. One opt-in exception, off unless set: `HARNESS_TAILNET_USERS` names Tailscale logins that, through `tailscale serve` (never Funnel) and from a tailnet address, need no key. The programs the server runs itself get its environment without that key and the reserve key (`childEnv`, `src/server/childEnv.ts`). Text a person typed (the chat, a card's note, a pick, a new film, debrief answers, chip labels, a message for a sub-agent) goes through `defuse` (`src/lib/defuse.ts`) before it reaches Alma, so a typed `<harness-action>`, `<harness-context>` or `<harness-note>` tag counts for nothing; only the server's own buttons write the real ones.

## Checks

`npx tsc --noEmit` and `npx next build` must pass. The `npm run *:test` scripts are developer tests; most run on made-up films in a temp folder. `npm run test:quick`, `test:changed` and `test:slow` run them (tests/README.md). `MOCK=boards npx next dev -p <port>` serves an invented sample film (src/fixtures/) instead of the studio's films.
