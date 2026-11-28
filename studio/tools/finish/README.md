# tools/finish

The 1080p of a film, and the checks on it. The rules are in `flow/Flow v3.3 - 10 Finish and 1080p.md`; this README gives
the exact steps of both routes. Run from the studio folder; `$FILM` is the film folder, `TK` a take folder
`$FILM/generations/<G>/takes/take<N>`. Every Higgsfield call goes through the `higgsfield` MCP server; never print a
signed link or a result URL. Both routes are untested in this studio: check every result at full size.

## Route 1, the default: Seedance 2.5 finalize of each draft the cut uses

Each take the cut plays from is finalized whole, once, after the user's go on the quote. The finalize keeps the draft's
frames (same frame count, cuts on the same frames), so the cut needs no change.

1. Get the draft's exact submitted params with `show_generation_by_ids` and save them as `$TK/<G>-take<N>-draft-params.json`.
2. Make the finalize params (submits nothing; check the job id it prints):
   ```bash
   .venv/bin/python tools/finish/finalize_params.py $TK/<G>-take<N>-draft-params.json --draft-job $TK/<G>-take<N>.jobid --cost
   .venv/bin/python tools/finish/finalize_params.py $TK/<G>-take<N>-draft-params.json --draft-job $TK/<G>-take<N>.jobid \
       > $TK/<G>-take<N>-1080p-params.json
   ```
   The first prints the params with `get_cost: true` for the quote; the second is the file you submit. A draft can be
   finalized within 7 days. A take made without `draft: true` cannot be finalized at all (Higgsfield answers "Completed
   Seedance 2.5 draft not found"): it goes to route 2.
3. After the go: `generate_video` with those params, one call per take, at most about 12 in flight; log each in `spend.md`
   (`Higgsfield · seedance_2_5 finalize 1080p`). A take whose `<G>-take<N>-1080p.jobid` exists is waited on, never sent again.
4. `jobs_wait` until done, then land each beside its draft:
   ```bash
   .venv/bin/python tools/film/land.py $FILM --kind pass --id <G> --take N --url-file <file> --job <job id> --title "…" --section "…"
   ```
   It writes `$TK/<G>-take<N>-1080p.mp4` and `<G>-take<N>-1080p.jobid`, the names the app reads.
5. Check it against its draft: `.venv/bin/python tools/finish/compare_finalize.py $TK/<G>-take<N>-480p.mp4 $TK/<G>-take<N>-1080p.mp4`
   ("frame-aligned": equal frame counts, offset 0, hard cuts on the same frames).
6. The app renders the master from the 1080p takes; check it against a 480p render of the same version:
   `.venv/bin/python tools/finish/check_cut.py cut/renders/v<n>-master.mp4 --ref <the 480p render> --sheet <dir>`.

## Route 2, for a take that cannot be finalized or when the user asks: the Higgsfield upscale (`upscale_video`)

A few such takes are upscaled each whole (uploaded whole, one call each, the result beside the take as
`<G>-take<N>-1080p-up.mp4`); the whole cut goes through the segments below only when most of it is such takes.

No price on file and no cost preflight: the first go covers one segment; read `balance` before and after it and write the
price per output second into note 13, then quote the rest.

1. A 480p render of the approved version without the title cards (it lands in `cut/renders/`). Split it on hard cuts:
   ```bash
   .venv/bin/python tools/finish/segments.py split RENDER $FILM/video/1080/segments [--max 30] [--min 12]
   ```
   It writes `seg-NN.mp4` (frame-exact, no sound, small enough to upload) and `segments.json`, and prints the seconds to upscale.
2. Upload each segment with `tools/higgsfield/upload.py` (`plan`, `media_upload`, `put`, `media_confirm`, `ids`).
3. `upscale_video` per segment: first `{provider: "topaz", video_id: <media id>, resolution: "1080p", aspect_ratio: <the film's ratio>}`;
   when a result does not keep the segment's frame count at 24 fps, `{provider: "bytedance", video_id, resolution: "1080p",
   fps: 24, width, height}` (the segment's size; `preset: "aigc"` suits generated video; above 30 fps doubles the price).
   Topaz keeps the skin's texture; ByteDance smooths skin to wax, so look at every face at full size when it is used.
4. `jobs_wait`, then download each result without printing its link to `$FILM/video/1080/upscale/seg-NN-up.mp4`. Log every
   job in `$FILM/video/1080/upscale/batch-log.json` (a list of `{segment, media_id, job_id, provider, seconds, credits}`) and
   one `spend.md` row for the run (`Higgsfield upscale (upscale_video, topaz, 1080p)`).
5. Check each against its segment: `compare_finalize.py $FILM/video/1080/segments/seg-NN.mp4 $FILM/video/1080/upscale/seg-NN-up.mp4`.
6. Join:
   ```bash
   .venv/bin/python tools/finish/segments.py join $FILM/video/1080/segments $FILM/video/1080/upscale RENDER $FILM/video/1080/cut-v<n>-1080.mp4
   ```
   Each `seg-NN-up.mp4` is filled and centre-cropped (never padded) to 1080x1920 for 9:16 or 1920x1080 for 16:9 as
   `seg-NN-1080.mp4`, its frame count checked, listed in `concat.txt`, joined, and muxed with the render's sound.
7. `.venv/bin/python tools/finish/check_cut.py $FILM/video/1080/cut-v<n>-1080.mp4 --ref RENDER --sheet <dir>`.

One take instead of the whole cut: upload the take, one `upscale_video` call, the result beside the take as
`<G>-take<N>-1080p-up.mp4`, checked with `compare_finalize.py`.

## Scripts

| Script | What it does |
|---|---|
| `finalize_params.py` | a draft's params → the finalize params (`--cost` for the quote); finds the job id from `--draft-job` or `--film --gen --take` |
| `compare_finalize.py DRAFT FINAL` | frame counts, best offsets, hard cuts, lowest correlation; "frame-aligned" or not |
| `check_cut.py CUT [--ref OTHER] [--sheet DIR]` | frames, shot changes and flash frames, edge lines, closing black; with `--ref` (any size: both are compared at the same small size) the frame counts, the lowest picture correlation (about 0.98 or above for the same edit) and the sound (bit-identical or not, and its decoded correlation) |
| `segments.py split\|join` | the upscale route's segments, as above |
| `cut_render.py $FILM cut/v<n>.json OUT.mp4 [--tracks IDS] [--no-music]` | renders a cut version at 480p with the app's own filter graph (the dialogue to mix music against) |
| `conform_1080.py --bin scenes\|pick-ups` | 1080p copies of 480p takes with the same frame count and the 480p sound (unproven) |
| `shot_survey.py VIDEO OUT.json [--sheet]` | every shot of a cut with its black level and warmth; the shot numbers the look tools use |
| `skin_survey.py`, `shot_match.py`, `shotfix_check.py` | a per-shot colour fix for one character's outlier shots: measure, write the filter chain, check the fixed master (unproven) |
| `filmgrain.py` | film grain on the Y/U/V planes, numpy only (unproven) |

All take `--help`. ffmpeg and ffprobe come from PATH (`HARNESS_FFMPEG` / `HARNESS_FFPROBE` override them in `segments.py`).
