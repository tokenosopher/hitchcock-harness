---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 10 · Finish and 1080p

**Purpose.** Move the cut the user approved at 480p to 1080p on the same timeline, in Hitchcock Harness, with the picture touched only where the user sees a problem. The 1080p comes straight from Seedance 2.5: each draft the cut uses is finalized to 1080p, the same frames at full size. The Edit page's 1080p view plays each shot from its take's 1080p file. The master is what the app renders from them and from the tracks the user has switched on, the same cut frame for frame; the user decides what goes into it.

## Inputs
- The cut the user approved by name in [[Flow v3.2 - 9 Edit]]: its version on the Edit page (`cut/v<n>.json`), named on the user's yes card. The edit does not change in this stage, except as step 13 says. The music, the effects and the mix go on the 1080p timeline in [[Flow v3.2 - 11 Sound and music]]; a title card plays from its full-size original (step 10).
- The user's go for the 1080p spend, given on its card against your quote (step 2). Approving the cut, or a general go, never covers resolution.
- For every take the cut uses: the draft made with `draft: true` and under 7 days old, its job-id file `$FILM/generations/<G>/takes/take<N>/<G>-take<N>.jobid` (a pick-up: `$FILM/generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>.jobid`), and its prompt and media list as sent.
- The app's edit recipe, `recipes/edit.md` in the app's folder (its full path is in your instructions): "Full-size pictures" (where every full-size file goes and how it is named), "Renders with options" and "Master (1080p)".
- The user's own Higgsfield plan and credits (`balance`, `show_plans_and_credits`), and the finalize price on file ([[Flow v3.2 - 13 Services and costs]]).
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps
Run every command from the studio folder (your working directory). `T=tools`, `$FILM` is the full path to the film folder (`assets/films/<film>` under the studio folder), `TK` a take folder, `$FILM/generations/<G>/takes/take<N>`, and `v<n>` the approved version.

1. **Before any spend.**
   - Confirm the version going to 1080p is the one the user approved by name on its card. Never finalize for an unapproved cut.
   - List the takes the cut uses: every take a clip of `cut/v<n>.json` plays from. Each one is finalized whole, once, however many of its shots the cut uses.
   - Check each draft's age (the date of its row in `spend.md`). A draft can be finalized within 7 days of it: flag any draft 5 or more days old on the quote. A draft past 7 days cannot be finalized: say so, and give the user the choice for that take (a new take of it, quoted as [[Flow v3.2 - 8 Redos]] says; the upscale of step 8; or leaving it at 480p).
   - Check the free space on this Mac's disk (`df -h .`). A finalized take runs 20 to 100 MB. With under about 3 GB free, put the free space and the expected size in front of the user and wait for what may go.
   - Quote each finalize with `get_cost: true`: build its params (step 4) with `--cost` and preflight them. The quote lists each take, its seconds and its credits, and the total. Each finalize is billed for the whole generation, shots the cut does not use included.
   - Check `balance` before promising the run.
2. **GATE:** write the quote on a card that asks for a go ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]) and wait for the user's go to this 1080p spend. The go covers the takes on the card; a take that joins the cut later gets its own quote and go (step 13).
3. **Take the route.**
   - The default and first route is the Seedance 2.5 finalize of each draft the cut uses: `generate_video` with `draft_job_id`, the draft's full original params and `resolution: 1080p`. It runs once, on the finished cut, when every edit is done and the user says to send it.
   - The finalize is frame-aligned with its draft: the same frame count, the cuts on the same frames, so the cut needs no change. It brings real detail everywhere and keeps out-of-focus backgrounds soft.
   - It is billed for the whole generation, about 16 credits a second when this note was written; the price moves, so quote with `get_cost: true` every time. About 10 to 15 min a job.
   - Every 480p Seedance draft keeps `draft: true` ([[Flow v3.2 - 7 Takes]]), so it can be finalized as the same frames within 7 days of the draft.
   - This route is untested in this copy: say so on the quote card, and check every result at full size.
   - The 1080p work happens on the same timeline as the approved cut, on the Edit page's 1080p view: each shot plays from its take's 1080p file, and the master is what the app renders from them. Where the full-size files go and how they are named: the app's edit recipe, "Full-size pictures".
   - The Higgsfield upscale (`upscale_video`) is the second route, used only when the user asks for it (step 8). There is no other upscaler in this flow.
4. **The params for each take.**
   - Get the draft's exact submitted params with `show_generation_by_ids` and save them in the take folder as `<G>-take<N>-draft-params.json`.
   - Run `finalize_params.py` on them with `--draft-job` and the take's job-id file, and save its output as `<G>-take<N>-1080p-params.json` (Tools). It drops `draft`, sets `resolution: 1080p` and `draft_job_id`, and submits nothing. `--cost` adds `get_cost: true` for the quote; write the file you submit without it. It prints the job id it used and the file it came from: check that it is the take you mean, because its job-id lookup is unproven.
   - With only `draft_job_id` the call fails with "prompt too short". For a quick quote, a placeholder prompt and one media with `get_cost: true` return the right figure.
   - Never rebuild the prompt from the current files: they drift from what went out. Use the prompt and media list kept as sent.
5. **Submit the finalizes.**
   - After the go, submit every take on the card at once, one `generate_video` call each, keeping at most about 12 jobs in flight.
   - Log each in `spend.md` the moment it goes out (Outputs).
   - A take whose `<G>-take<N>-1080p.jobid` already exists is waited on, never sent again, so nothing is paid twice.
   - If the balance runs out partway, stop, say how many takes are done and what the rest would cost, and wait.
6. **Wait actively, land and check.** `jobs_wait` on the jobs, `timeout_seconds: 15`, looped until every job is terminal. Land each result as a 1080p pass with the landing routine of [[Flow v3.2 - 7 Takes]] (`land.py --kind pass`): it goes beside the draft as `<G>-take<N>-1080p.mp4` with `<G>-take<N>-1080p.jobid`, the name the app reads. Check it against its draft with `compare_finalize.py` as it lands (Checks).
7. **The 1080p view.** One finalized take serves all its shots: the app plays every shot of the cut from that take's 1080p file, at its own in and out, and the master uses it. No join is needed. The bar over the 1080p view reads "Full size · n of n shots"; a shot still shown at 480p, in amber, is a take not finalized yet.
8. **The second route: the Higgsfield upscale, only when the user asks for it.** The app calls it "Higgsfield upscale". It is untried in this studio and has no price on file: measure the price first (the first go covers one segment; read `balance` before and after it, write the price per output second into [[Flow v3.2 - 13 Services and costs]], then quote the rest and ask a separate go). The exact calls: `tools/finish/README.md`.
   - The whole cut: a 480p render of the approved version with the title cards left out (the user asks for it in More renders on the Edit page; it lands in `cut/renders/`), split with `segments.py split` into `video/1080/segments/`, each segment uploaded with `upload.py` and sent to `upscale_video` (provider `topaz`, `resolution: 1080p`, the film's `aspect_ratio`; when a result does not keep the segment's frame count at 24 fps, provider `bytedance` with `fps: 24` and the segment's `width` and `height`). The results land as `video/1080/upscale/seg-NN-up.mp4`, each job logged in `video/1080/upscale/batch-log.json` (a list of `{segment, media_id, job_id, provider, seconds, credits}`, as `tools/finish/README.md` defines it), and `segments.py join` makes the upscaled cut `video/1080/cut-v<n>-1080.mp4`.
   - One take: uploaded whole, one `upscale_video` call, the result beside the take as `<G>-take<N>-1080p-up.mp4`.
   - The app plays a take's Seedance file first, then its upscaled file, then the upscaled cut. Check every result with `compare_finalize.py` against what went in. Comparing a centre-cropped 16:9 upscale with `compare_finalize.py` is untried: check such a result by eye at full size as well.
9. **A take that did not come out well at 1080p.**
   - The user checks the 1080p view shot by shot on the Edit page. Judge every 1080p shot at full size too, and write what you find into the regeneration log. A mark the user puts on a take there is the user's note, not a go.
   - A finalize keeps the draft's frames, so a fault it shows is usually in the draft: propose a retake of that shot ([[Flow v3.2 - 8 Redos]]), or the upscale of that take if the user asks for it (step 8). Name the take, the shots it serves and their timecodes, with the quote.
   - **GATE:** write a card that asks for a go for that fix, its `for` naming the generation's ID and its quote in it, and wait for the user's go.
10. **Titles, censors and patches.**
    - Each title card plays from its full-size original: the card's 1080p file made in [[Flow v3.2 - 9 Edit]], beside its small file under the name the app reads (the app's edit recipe, "Full-size pictures"). Check the frame count again.
    - Rebuild text on any other graphic from its full-size original instead of scaling it up.
    - A censor or patch made at 480p is a made piece of its own. Make it again at full size and put it beside its small file under the name the app reads (`<name>-480x854.mp4` beside `<name>-1080x1920.mp4`, the app's edit recipe, "Full-size pictures"), then check that shot again at 1080p.
    - A paint-in on finalized footage may need more or less blur to match its neighbours: compare at full size.
11. **Present it, then stop.**
    - Write a card on the Finish page (the app's show recipe): the version, its length, its size, exactly which cut it is, where every shot came from (the Renders tab and the render's log say it, line `picture:`), any patch, the cost, the checks you ran. Say in the thread that the 1080p view on the Edit page plays it, the page named as a link.
    - The master is rendered with "Render master" in the Edit page's header (More renders once a master exists), or the master marker, only on the user's word (the app's edit recipe, "Master (1080p)"). It takes a few minutes; say so.
    - Write the spend rows into `spend.md` (Outputs).
    - Deliver the master to the film's delivery folder, `assets/final-cuts/<YYYY-MM-DD> <Title>/`, with a 480p copy beside it, with `deliver.py` (Tools).
    - Then wait. Do not propose a grade.
12. **GATE:** write a card that asks for a yes on one 1080p version, its `for` and its title naming the version, and wait for the user's yes. Every finalize (and any upscale) in it went out on the user's say-so against a quote. Note on the card which master and which fixes it is, so a re-cut can rebuild it. That 1080p timeline goes on to [[Flow v3.2 - 11 Sound and music]] for the sound and the music. The subtitles are made on it at 1080p, as lines on the cut's subtitle track, and burnt into the master ([[Flow v3.2 - 12 Release]]). No subtitles before this yes.
13. **After a change on the timeline.** A change after the finalizes is made on the timeline itself ([[Flow v3.2 - 9 Edit]], [[Flow v3.2 - 8 Redos]]).
    - A trim needs nothing: each take is finalized whole, so every trim stays covered.
    - A different take for one shot, or a re-shoot: the Edit page shows that shot at 480p, in amber. Quote the finalize of that take with `get_cost: true` and wait for the go (step 2), then steps 4 to 6. A draft past 7 days goes to the user's choice as in step 1.
    - When the page says the master is out of date, a new master is made, on the user's word. It is a new file beside the first.
    - The music and the mix stay on the timeline ([[Flow v3.2 - 11 Sound and music]]).

## Checks
- **Every 1080p file passes `compare_finalize.py DRAFT FINAL`:** each finalize against its draft (and, on the second route, each upscaled segment against its segment and each upscaled take against its take). Pass ("frame-aligned"): equal frame counts, best offset 0 on every sampled frame (a tie with 0 on still frames counts as 0), the hard cuts on the same frames.
- **"NOT aligned" can be fast-motion detail.** With offset 0 everywhere and equal frame counts, extra detected "cuts" can come from fast motion where the 1080p frame holds more detail. Compare consecutive-frame differences against the draft (a match within 1 to 2 grey levels) and look at side-by-side strips for flicker before calling it a fault.
- **`check_cut.py MASTER --ref RENDER --sheet DIR`**, where `RENDER` is a 480p render of the same version (asked for as the app's edit recipe says): the frame count; every shot change, none under 3 frames; no edge line on any side; the closing black still black; lowest picture correlation about 0.98 or above.
- An edge line means a padded source: fill and crop, never pad.
- **Where each shot comes from:** the bar over the 1080p view reads "Full size · n of n shots" and says how many play at 480p; the master's log line `picture:` says what it was made from. Every shot full size before the master, unless the user said otherwise.
- Look at frames by index, never with `-ss`. Faces, hands and props must be what the draft had.
- The censored, patched or flagged shot, checked again at full size.
- Compare files with different colour tags in raw YUV, not in an RGB or grey decode. Stream frames in every check; never hold the whole 1080p film in memory.
- Say what you checked when you present.

## Outputs
- Each finalize, in the take folder beside its draft: `<G>-take<N>-draft-params.json`, `<G>-take<N>-1080p-params.json`, `<G>-take<N>-1080p.mp4` and `<G>-take<N>-1080p.jobid`.
- On the second route only: `$FILM/video/1080/segments/` (`seg-NN.mp4`, `segments.json`), `$FILM/video/1080/upscale/` (`seg-NN-up.mp4`, `seg-NN-1080.mp4`, `concat.txt`, `batch-log.json`), the upscaled cut `$FILM/video/1080/cut-v<n>-1080.mp4`, and beside an upscaled take `<G>-take<N>-1080p-up.mp4`.
- The master the app renders, `cut/renders/v<n>-master.mp4` (a master made again: `-2`, `-3`), from the tracks the user has switched on, the title cards from their full-size originals; delivered to the film's delivery folder `assets/final-cuts/<YYYY-MM-DD> <Title>/` as `<Film> 1080p v<N> (<what changed>).mp4` with its 480p copy.
- `spend.md` rows in the columns of `templates/spend.md`, every cost in credits (`cr`):
  - each finalize: `Higgsfield · seedance_2_5 finalize 1080p`, its job id, the whole generation's seconds, credits a second, credits, `<G>` take N, the shots it is for, the user's go;
  - each upscale run (second route): `Higgsfield upscale (upscale_video, topaz, 1080p)` (the word "upscale" in the row: the Finish page finds the last run by it), job ids or `video/1080/upscale/batch-log.json`, output seconds, the credits a second (measured, or "unknown, measured after" on the measuring segment), credits, what it upscaled, the user's go.
- The card on the Finish page, naming the master and its fixes.

## Tools
Run the Python scripts with `.venv/bin/python` from the studio folder (your working directory). Never print a signed link or a result URL. Untested in this copy, so check each result by hand: the finalize as the film's route, the unproven `finalize_params.py` (its job-id lookup), `compare_finalize.py` and `check_cut.py`, and the whole upscale route.

| Script | Command | Does |
|---|---|---|
| Higgsfield `show_generation_by_ids` | the draft's job id | the draft's exact submitted params, saved as `$TK/<G>-take<N>-draft-params.json` |
| `tools/finish/finalize_params.py` | `.venv/bin/python $T/finish/finalize_params.py $TK/<G>-take<N>-draft-params.json --draft-job $TK/<G>-take<N>.jobid [--cost] > $TK/<G>-take<N>-1080p-params.json` | draft params to finalize params; submits nothing; `--film $FILM --gen <G> --take N` finds the job-id file instead |
| Higgsfield `generate_video` | the finalize params; with `get_cost: true` for the quote | the 1080p finalize of one draft |
| Higgsfield `jobs_wait`, `balance` | as in [[Flow v3.2 - 7 Takes]] | waits for the jobs; the balance before the run |
| `tools/film/land.py` | `.venv/bin/python $T/film/land.py $FILM --kind pass --id <G> --take N --url-file <file> --job <job id> --title "…" --section "…"` | lands a finalize beside its draft and its card where the app shows it ([[Flow v3.2 - 7 Takes]]) |
| `tools/finish/compare_finalize.py` | `.venv/bin/python $T/finish/compare_finalize.py DRAFT.mp4 FINAL.mp4` | frame counts, best offsets, hard cuts, lowest correlation; "frame-aligned" or not |
| `tools/finish/check_cut.py` | `.venv/bin/python $T/finish/check_cut.py MASTER --ref RENDER --sheet DIR` | frames, shot changes, edge lines, closing black, correlation |
| `tools/deliver.py` | `.venv/bin/python $T/deliver.py --film $FILM cut/renders/v<n>-master.mp4 "<Film> 1080p v<N> (<what changed>).mp4" --480p` | copies into the film's delivery folder `assets/final-cuts/<YYYY-MM-DD> <Title>/` with a 480p copy, compared byte for byte |
| `tools/finish/README.md` | read before the first finalize, and before any upscale | the finalize steps; the second route's upload, `upscale_video`, download and logging steps for segments and for a whole take |
| `tools/finish/segments.py` | `split RENDER $FILM/video/1080/segments [--max 30] [--min 12]`; `join $FILM/video/1080/segments $FILM/video/1080/upscale RENDER $FILM/video/1080/cut-v<n>-1080.mp4` | second route only: splits a render on hard cuts into segments of at most 30 s; fills, crops and joins the upscaled segments |
| Higgsfield `upscale_video` | `{provider: "topaz", video_id: <media id>, resolution: "1080p", aspect_ratio: <the film's ratio>}`; or `{provider: "bytedance", video_id, resolution: "1080p", fps: 24, width, height}` | second route only: the upscale of one segment or one take; no cost preflight |
