---
tags: [ai-filmmaking, film-flow, film-flow-v3-3]
version: 3.3
status: live
---
# 13 · Services and costs

**Purpose.** What you need to call each Higgsfield job correctly and to quote its cost, and what runs on the Mac.

The spending rules (the script lock is the go for the first round of every asset, stills never asked about again, the one hard gate before the video, each later video job, skin pass, finalize, upscale and other 1080p its own quote and go (a video element's 1080p finalize goes on the yes to its draft), a small job under 20 credits that serves the user's ask done without a go, a retake the user asks for of a named shot its own go with no quote and one report when done, sound effects made without a quote or a go, every paid job logged) are in [[Flow v3.3 - 0 Standing rules]]. Every price below is an "about" figure, checked on the date it was measured: confirm it with a `get_cost` preflight (`estimate_image_cost` for a still) before you quote it.

## How to quote a cost

1. Read the user's balance and plan with the `balance` tool of the `higgsfield` MCP server before any quote. Never assume either, and never assume any other account's plan, rates or monthly credits. For the plan's price and credits, and the top-up packs, call `show_plans_and_credits` and pass on the numbers, not the sales copy.
2. Price the job per unit from the tables below (credits a second, credits an image, credits a line). Preflight every Higgsfield video and audio job that takes `get_cost: true`, and every Higgsfield still with `estimate_image_cost` with the same arguments (`generate_image` takes no `get_cost`), and use that figure. A job that cannot be preflighted (a saved voice, `voice_change`, the `upscale_video` second route) is quoted from the price on file below. With no price on file, measure first: quote it as "price not known yet", and the first go covers one unit only (one saved voice, one voice change, one upscale segment); read `balance` before and after it, write the measured price into its row below with the date, then quote the rest and ask a separate go. Removing music, splitting stems and transcription run on the Mac (Demucs and Whisper) and cost nothing.
3. Quote in credits. Give dollars only at the user's own rate, worked out from `show_plans_and_credits`: the plan's price over its monthly credits for credits from the plan, a top-up pack's price over its credits for credits bought beyond it. Say which rate you used.
4. Put the quote in front of the user: units, unit price, the total. A retake the user asks for of a named shot is not quoted: preflight it all the same, check it fits the film's budget, and give the cost in the one report after it lands ([[Flow v3.3 - 8 Redos]], step 13).
5. Log every paid job in `$FILM/spend.md`, one row under the header from `templates/spend.md`: `date | stage | service | job id | units | rate | cost | version or take | purpose | the user's go`. The service cell starts with "Higgsfield" ("Higgsfield · elevenlabs_v4"), because the app labels a row by the first service it finds; the rate and the cost are in credits (`cr`).

Scale (prices of November 2026):
- A 30 s generation: draft 90 credits; finalize 480 credits; 570 in all, at 19 credits a second.
- A 3-minute film in generations, each landing first time, with four speaking characters, comes to about 4,075 credits:
  - four video elements, drafted and finalized: 4 × 95 = 380 credits;
  - 180 s of drafts: 540 credits;
  - the stills, voices, lines, effects and a score: about 275 (four face rounds about 10, looks, sheets and details about 85, three locations of six candidates about 75, their views about 60, the voices and lines under 20, a 3-minute score about 26);
  - the 1080p, by finalizing every draft the cut uses: 16 credits a second, about 2,880 for 180 s.
- The default budget of 2,000 credits covers a film of about a minute at 1080p with two speaking characters (60 s at 19 credits, 95 for each video element, about 300 for the stills, voices and score: about 1,630) and leaves about 370 for second takes and redos: a 10 s redo is about 190 credits drafted and finalized, so about two of them. A longer film needs a larger budget: say so at the start.
- Say early when a film will pass the budget. At the script lock, work out the whole film: every generation's seconds at 19 credits (draft and finalize), 95 for each video element, about 300 for the stills, voices and score. When that passes 2,000 (or the budget the user set), say so at once. Say it again at "Go for the video?" with what is spent so far, and before any second take or redo that would take the film past it.

## Which service does what

- Every paid job goes to Higgsfield, through the `higgsfield` MCP server (the `mcp__higgsfield__…` tools), never through another Higgsfield connector and never the website. Session start checks that the server is present: [[Film Flow v3.3]].
- Everything else runs on the Mac and is free: the previz in Blender, the scripts in `tools/` with `.venv/bin/python`, ffmpeg, Demucs (removing music, stems), Whisper (transcription), and the Hitchcock Harness, which cuts, mixes and renders.
- GPT Image 2.6 makes first versions (a new image from text, with or without references), the views painted over a plate and a view's repaint or relight. Every other edit of an existing still runs on Seedream 5.5 (the rule: [[Flow v3.3 - 0 Standing rules]]).

Setup defaults, never asked; the user says at the start if anything differs: 9:16; voices from Higgsfield (preset voices, voices made from the face, variants of a preset); video elements 1920x1080, 5 s; 1080p by Seedance 2.5 finalize; a budget of 2,000 credits. The title is still asked ([[Flow v3.3 - 1 Setup and story]]).

| Job | Route |
|---|---|
| Character faces | Soul Cinema (`soul_cinematic`), a round of twenty faces run at once, the user picks from it; GPT Image 2.6 (`gpt_image_2_6`) the second route |
| Every other first version: location candidates, new props | GPT Image 2.6 (`gpt_image_2_6`); location candidates at 16:9, `resolution: 4k` |
| Non-human characters | Nano Banana Pro (`nano_banana_pro`) |
| Every edit of an existing still but a view's repaint or relight: looks on a picked face, sheets, details, fixes, outpaints, sheet variants, relights of characters and props, props from an earlier picture; the skin pass, on request only | Seedream 5.5 (`seedream_5_5`) ([[Flow v3.3 - 2 Characters]]) |
| Master and views painted over a plate, and a view's repaint or relight | GPT Image 2.6 first, measured against its plate for shifted geometry; Seedream 5.5 the fallback ([[Flow v3.3 - 4 Locations and props]]) |
| Image elements, video elements, every Seedance video, finalize, extend, Genjutsu | Higgsfield, as below |
| 1080p of the film | the Seedance 2.5 finalize of every draft the cut uses, by default; `upscale_video` in segments, the second route, only when the user asks for it ([[Flow v3.3 - 10 Finish and 1080p]]; steps in `tools/finish/README.md`) |
| Voices for characters | preset voices (`list_voices`), a voice from the face (`seed_audio`), variants of a preset (`qwen_audio_tts`); a pick that is not a preset saved with `create_voice_from_confirmed_audio` only when a later job must speak new words in it ([[Flow v3.3 - 3 Voices and video elements]], step 6) |
| Spoken lines | `elevenlabs_v4`; or `seed_audio`, `qwen_audio_tts` |
| A word-fix clone | the character's voice stem → `create_voice_from_confirmed_audio` → the word in that voice; or `voice_change` on the clip |
| Transcription (word times for takes, element lines, subtitles, reference films) | Whisper on the Mac, free, with `tools/stt/transcribe.py` (steps in `tools/stt/README.md`) |
| Score | `elevenlabs_music_v2`, or the user's own music ([[Flow v3.3 - 11 Sound and music]]; steps in `tools/music/README.md`) |
| Sound effects | `mirelo_text_to_audio`; when refused, the sound Seedance makes with the take |
| Removing music, stems | Demucs on the Mac, free, two or four stems, with `tools/stems/split.py "$FILM" <take|audio> [--four]` (the raw command in `tools/stems/README.md`); Higgsfield `separate_stems` the fallback when Demucs is not installed |
| Upload a local file | `tools/higgsfield/upload.py` with `media_upload` and `media_confirm` |
| Edit, mix, render | the Edit page of the Hitchcock Harness: the cut, its tracks and levels, the 480p and the master it renders ([[Flow v3.3 - 9 Edit]]) |
| Release | Claude writes every text; the user posts by hand; `published-links.md` at the studio root is the posting record ([[Flow v3.3 - 12 Release]]) |

## Higgsfield (the `higgsfield` MCP server)

Check a model's parameters with `models_explore action=get` (free) before the session's first call to it.

### Video

| Use | Reached by | Price (about) | Gotchas |
|---|---|---|---|
| A Seedance 2.5 draft: generation, pick-up, element clip | `generate_video` with `model: seedance_2_5`, `mode: omni_reference`, `draft: true`, `resolution: 480p`, `aspect_ratio` the film's ratio from `brief.md` (`16:9` for an element clip), duration 4 to 30 s, `generate_audio: true`, `count: 1`, `use_unlim: false`, `folder_id` from `$FILM/higgsfield.json` | 3 credits a second of generation (15 for 5 s, checked November 2026) | Put `draft: true` on every 480p job, or it can never be finalized. `use_unlim: false` pays from credits, so the server does not stop to ask which balance pays. Media roles: `start_image`, `end_image`, `image_references`, `video_references`, `audio_references`; leave `start_image` and `end_image` empty. A draft takes about 2 to 5 min |
| Finalize a draft to 1080p | `generate_video` with `draft_job_id` plus the draft's full original params (prompt, medias) and `resolution: 1080p`. `show_generation_by_ids` returns a job's exact submitted params; `.venv/bin/python tools/finish/finalize_params.py DRAFT_PARAMS.json --draft-job <the take's .jobid file> [--cost]` turns them into the finalize params ([[Flow v3.3 - 10 Finish and 1080p]]) | 16 credits a second, billed for the whole generation, shots the edit does not use included (80 for 5 s, checked) | `draft_job_id` alone fails with "prompt too short". Finalize within 7 days of the draft. The output is frame-aligned with the draft: same frame count, cuts on the same frames. A 30 s finalize takes about 15 min |
| A video element (1920x1080, 5 s) | a Seedance clip, passed later as `video_references` ([[Flow v3.3 - 3 Voices and video elements]]) | 15 credits as a 480p draft, 80 to finalize at 1080p | The user's yes on the draft clip is the go for its finalize: submit it right after that yes, before a scene prompt needs the element ([[Flow v3.3 - 3 Voices and video elements]], step 25) |
| 1080p of the film, by finalize (the default) | finalize each draft the cut uses, as above; each lands beside its draft as `<G>-take<N>-1080p.mp4`, and the app's master render uses it. Steps: [[Flow v3.3 - 10 Finish and 1080p]] and `tools/finish/README.md` | 16 credits a second of every finalized draft (preflight with `get_cost: true`) | Untested as the film's route in this studio. The whole draft is billed, not only the shots the cut uses. A draft past 7 days cannot be finalized |
| 1080p of the film, by upscale (the second route, only when the user asks) | `upscale_video` on the 480p render without title cards, in segments of at most 30 s cut by `tools/finish/segments.py` (results in `video/1080/upscale/`), or on one whole take (`…-1080p-up.mp4`); `topaz` first, `bytedance` the fallback. Steps: `tools/finish/README.md` | not known yet: it cannot be preflighted. Measured price: none yet (write it here in credits per output second, with the date) | Untried in this studio: measure the price first. The first go covers one segment: read `balance` before and after it, write the price here, then quote the rest and ask a separate go |
| Extend a shot; new angles from one take | `generate_video` with `mode: video_extension`, `extension_mode: forward`, the take as `video_references`; or the take as `video_references` with the new camera positions | preflight with `get_cost: true` | |
| Replace an object in a take (Genjutsu) | `generate_video` route `hf_mult_replace_object` | 15 credits for a 4.5 s span at 480p | |

### Stills

| Use | Reached by | Price (about) | Gotchas |
|---|---|---|---|
| Character faces | `generate_image` (or `generate_image_batch`) with `soul_cinematic`, `quality: 2k`, `aspect_ratio: 3:4` | 0.12 credits an image at 2k (a round of twenty is about 2.4 credits) | A face round is twenty faces, run at once. One optional image reference. How a face round runs: [[Flow v3.3 - 2 Characters]] |
| GPT Image 2.6: first versions (location candidates, new props, the second face route), views painted over a plate, a view's repaint or relight | `generate_image` with `model: gpt_image_2_6`, `quality: high`, `resolution` `1k`, `2k` or `4k` (the longest side up to 1024, 2048 or 4096 px), `aspect_ratio` or an exact `size` inside its resolution tier; references as `image_references`. Read its parameters once with `models_explore` (`action: get`) before the first job | read at the time with `estimate_image_cost`, with the same arguments, before every job; write the first job's price in `spend.md` | Sunburst only: pass no `variant`. Always pass `model`, `quality` and `resolution`: the server's defaults are lower. It shifts a plate's geometry a little: measure every view it paints against its plate. Never on any other existing still: GPT Image edits lay small artefacts over the picture that show most on people and objects and add up, and Seedream 5.5 beat 2.6 on faces, clothing and sheets |
| Nano Banana Pro: non-human characters | `generate_image` with `model: nano_banana_pro`, `resolution` `1k`, `2k` or `4k`, `aspect_ratio`; up to 14 `image_references` | 4 credits at 4k (checked) | Preflight at the size you run |
| Seedream 5.5: every edit of an existing still but a view's repaint or relight, and the skin pass | `generate_image` with `model: seedream_5_5`, the picture to change as image 1 (a local still uploaded first with `upload.py`), `resolution: 2k`, `aspect_ratio` the picture's own; for the skin pass a real skin photograph as image 2 (more surfaces: [[Flow v3.3 - 2 Characters]]); up to 10 `image_references`; `folder_id` from `$FILM/higgsfield.json` | 3.5 credits an image at 2k (checked) | The fallback for a view painted over a plate: it holds the plate's geometry but invents objects nobody asked for. It can drift on identity and arrangement when several people share a picture: re-check the identity, the counts and every briefed detail against the picture before it. The skin pass is quoted and waits for its go; it has no fallback in the flow |
| Image elements (`@char_x`, `@loc_x`, `@prop_x`) | `manage_reference_elements action=create` from an uploaded image. Name it in a prompt as `<<<element-id>>>`; the backend rewrites it to `@name` | not on file | Image only. A video element is a Seedance clip passed as `video_references`. The server cannot delete an element |
| A clean cutout for light matching | `remove_background` | not on file | Use it instead of a flood-fill mask, which leaks into subjects coloured like the backdrop |

### Voices, lines and sound

| Use | Reached by | Price (about) | Gotchas |
|---|---|---|---|
| Preset voices | `list_voices`, paged with `next_cursor`: each voice has `voice_id`, `voice_type` (`preset`, or `element` for the user's own), `name`, `gender`, `preview_url` | free | The names say nothing of age or accent. Download a preview without echoing its link |
| A voice from the face | `generate_audio` with `model: seed_audio`, the face as the one `image_references` item, the text to speak as `prompt`; `format`, `sample_rate`, `speech_rate` (-50 to 100), `pitch_rate` (-12 to 12), `loudness_rate` | 0.3 credits for the 44-character element line; 1.1 for about 150 characters (checked) | The image, a voice (`voice_type` + `voice_id`) and audio references are exclusive. Untested on reading a face's age and type |
| Variants of a preset; lines with a direction | `generate_audio` with `model: qwen_audio_tts`, `voice_type` and `voice_id` (required), `instruction` (at most 128 characters), `language: en`, `speech_rate` and `pitch_rate` (0.5 to 2), `batch_size` up to 4 | 0.07 credits a take, 0.14 for a call of two (measured) | Refuses some presets: vary the next closest preset it takes, and say which on the card ([[Flow v3.3 - 3 Voices and video elements]]) |
| Spoken lines | `generate_audio` (or `generate_audio_batch`) with `model: elevenlabs_v4`, `dialogue`: a list of turns `{text, voice_type, voice_id}`, up to 10 voices and 10,000 characters in all; `stability`, `similarity_boost` (0 to 1), `batch_size` up to 4. `elevenlabs_v4_turbo` takes one voice only | 0.23 credits for the element line (checked); about 0.46 credits for a typical line (measured) | No `previous_text`, no speed and no language setting: give context as the turn before, set the pace afterwards with ffmpeg `atempo` ([[Flow v3.3 - 3 Voices and video elements]]) |
| Save a voice from a sample | `create_voice_from_confirmed_audio` with an `audio_media_id` (uploaded with `upload.py`, confirmed with `type: audio`) and a `name` | charged on success; cannot be preflighted; not on file: measure the first one and write it here | 10 s to 3 minutes of clean speech. Save one only when a later job must speak new words in it ([[Flow v3.3 - 3 Voices and video elements]], step 6): a picked voice is kept as its file. It starts `processing`: check `list_voices` until it is ready. Use it as `voice_type: element`. Never call `create_voice`: it opens a recording widget |
| Change the voice of a clip | `voice_change` with `video_id`, `voice_id`, `voice_type` | not on file; cannot be preflighted | Keeps the timing and the picture; the whole clip's voice changes |
| Transcription with word times | not Higgsfield: Whisper runs on the Mac with `tools/stt/transcribe.py` (steps in `tools/stt/README.md`) | free, no go | Word times vary by a few frames from run to run: keep each transcript and reuse it |
| Stems, the fallback when Demucs is not installed | Removing music and splitting stems run on the Mac with Demucs (`tools/stems/split.py`; `tools/stems/README.md`), free. Only when Demucs is missing: tell the user `./setup.sh` in the app's folder installs it; if it cannot be installed, use `separate_stems` with a file already in the sandbox (`path` under `/home/user`), `mode: two` (vocals, no_vocals) or `four` (vocals, drums, bass, other); it returns a status file to read with `sandbox_exec` until it is done | not on file: read `balance` before and after the first split and write the price here | Up to 60 min of audio. Bring its stems back into the same folder and names the Demucs route uses |
| Score | `generate_audio` with `model: elevenlabs_music_v2`, the cue as `prompt`, `duration` 3 to 600 s, `force_instrumental`, `lyrics` (up to 120 s), `batch_size` up to 4. Steps: `tools/music/README.md` | 1.35 credits for a 21 s take, about 0.064 credits a second (measured) | Higgsfield refuses `elevenlabs_music_v2_5`; when a named model is refused, follow step 26 of [[Flow v3.3 - 11 Sound and music]]: the model list, else a price asked of the likely names, never a silent guess. No composition plans: a cue is written as a prompt. Keep composers' names out of the prompt. How cues are written and laid: [[Flow v3.3 - 11 Sound and music]] |
| Sound effects (crowd sounds, room tone, a laugh across a join, a title boom) | `generate_audio` with `model: mirelo_text_to_audio`, `prompt`, `duration` in seconds | 0.75 credits for 3 s (checked) | The catalog labels it "game pipeline only". If a job is refused, use the sound Seedance makes with the take, or a short Seedance draft kept for its sound (quoted like any draft). No quote and no go: make it when the edit calls for one or the user asks, in a few tries, say afterwards what you made, and log each job in `spend.md` |

### Files, waiting and the project

| Use | Reached by | Price (about) | Gotchas |
|---|---|---|---|
| Upload a local file | `.venv/bin/python tools/higgsfield/upload.py plan $FILM <files…>` sorts each file into new, changed (by sha1) or same; call `media_upload` with the list it prints and save the response to a file without printing it; `upload.py put $FILM --response <that file>` PUTs each file with curl and records it in `$FILM/generations/upload-registry.json`; call `media_confirm` as printed, one call per type; `upload.py ids <files…> [--out <file>]` prints the `medias` list. The steps in order: [[Flow v3.3 - 7 Takes]] | free | Never print an upload link: `put` hands it to curl and deletes the response file. A file changed since its upload is uploaded again; `ids` refuses its stale id |
| Waiting | `jobs_wait` with `jobs: [{"index": 0, "job_id": "<job id>"}]` (`index 0` for a single job) | no charge | Up to 12 jobs per call |
| The film's project | `create_project` once per film; `create_folder` for the cast, the locations, the prompts and each generation and pick-up; `folder_id` on every job | no charge | The project, workspace and folder ids live in `$FILM/higgsfield.json` (from `templates/higgsfield.json`) |

Limits and handling:
- The user's plan sets how many jobs run at once; beyond it a submit waits or returns 429. Keep at most about 12 jobs in flight.
- Reference video: 30 s per call in total, and at most three reference videos. A character beyond the three goes in as a picture and a voice reference ([[Flow v3.3 - 6 Scene prompts]], step 11); on a tie, the third element goes to the one who speaks more in that scene ([[Flow v3.3 - 3 Voices and video elements]], step 35).
- Audio references: each at least 2 s (shorter returns 422). Audio needs an image in the same call and adds no cost.
- References per call: up to 50 are documented; 16 images, 3 element clips and a voice line in one call go through. The real cap on the total is not known yet: it is found with a few cheap probes ([[Flow v3.3 - 6 Scene prompts]], step 11).
- Prompt length: aim at about 8,000 to 10,000 characters, never past about 15,000 ([[Flow v3.3 - 6 Scene prompts]], step 2).
- If the server answers with a preset recommendation, resubmit with `declined_preset_id`.
- If the server answers with `unlim_choice` (the account holds free generations the model accepts), ask the user which balance pays and call again with their choice in `use_unlim`.
- On a transport timeout the submission may have gone through: check before you resubmit.
- Download each result without echoing its URL.
- A blocked job (`nsfw`, `ip_detected`) costs nothing. What to do next is in [[Flow v3.3 - 0 Standing rules]].

## Unproven tools

The scripts and routes below have never run on a film made in this studio, or not in the part named. When a step uses one, tell the user it is unproven and check each of its results by hand.

| Script or route | Unproven |
|---|---|
| The Whisper route on the Mac (`tools/stt/README.md`, `stt/transcribe.py`) and everything that reads its JSON: the take checks, `lib/stt.py`, `release/make_srt.py`, the element line's cut | all of it |
| The Demucs stems route (`stems/split.py`, `tools/stems/README.md`), and `separate_stems` as its fallback | all of it |
| The score route (`tools/music/README.md`) | all of it |
| The 1080p routes (`tools/finish/README.md`) | all of it, finalize and upscale |
| `voices/hf_candidates.py`, `pick.py --voice-type`, `element_line.py`, `record.py`, `takes.py --add` | their Higgsfield forms |
| `finish/conform_1080.py` with `--bin scenes\|pick-ups` or `--clips` | the take mode: run on synthetic clips only |
| `finish/finalize_params.py` | finding the job id in a take folder: run on synthetic files only |
| `finish/compare_finalize.py`, `check_cut.py`, `skin_survey.py`, `shot_match.py`, `shotfix_check.py`, `filmgrain.py` | all of it |
| `music/mix_score.py` (`NAME --film "$FILM" --picture <dialogue render>`) | it has completed on test files only, never on a film. It can fill the disk: check `df` first |
| `music/preview_music.py`, `lay_song.py`, `song_edit.py`, `beat_grid.py`, `check_render.py`, `dethermin.py`, `music_analyze.py` | all of it |
| `stills/figure_canvas.py`, `extend_figure.py`, `match_light.py`, `detail_composite.py`, `sheet_light.py`, `skin_check.py`, `skin_tune.py` | all of it |
| `takes/verify_clip.py` | the transcript: it has run only without one |
| `edit/freeze_region.py`, `edit/probe_clip.py` | all of it (`probe_clip.py --no-words` has run on a synthetic `generations/` clip) |

## The Mac

- Everything local runs on the user's Mac, where the Hitchcock Harness runs. Check `df` before a render. Blender render slots: [[Flow v3.3 - 5 Previz and storyboards]].
- The programs the Mac needs, all installed or checked by `./setup.sh` in the app's folder (one level above the studio): ffmpeg (with ffprobe), the studio's Python (`.venv`), Blender for the previz, and `uv`, which runs Demucs and Whisper. When one is missing, ask the user to run `./setup.sh` and wait.
- Run scripts with the studio's `.venv/bin/python` (it has Pillow, numpy, scipy and requests). What a script needs beyond it is in `tools/REQUIREMENTS.md`; read it when a script stops on a missing module.
- ffmpeg and ffprobe are on PATH. Draw labels with PIL; do not count on ffmpeg's `drawtext` or on OpenCV.
- macOS has no `timeout` command: use `perl -e 'alarm N; exec @ARGV' CMD ARGS`.
- Stream 1080p frames. A check that decodes a whole film at once is killed with exit 137.
- Blender runs the previz, through `tools/previz/blender_run.py`. It is free: `/Applications/Blender.app`, or the path in `BLENDER_BIN`.
- Demucs (removing music, stems) and Whisper (word-timed transcripts) run through `uv`, free, by `tools/stems/split.py` and `tools/stt/transcribe.py`; the raw commands are in `tools/stems/README.md` and `tools/stt/README.md`.

## Keys

- **No keys in the studio.** Higgsfield is reached through the `higgsfield` MCP server, signed in with the user's own account. No script needs an API key.
- Never print a signed upload or download link or a session token, in the thread, a note, a log or a card.
