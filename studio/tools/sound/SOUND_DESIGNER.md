# The sound designer: effects planned on the cut, made in variations, picked by the user

What it is: a sound designer (an Opus agent) plans every sound effect of a film on its cut: where each goes, what kind it is, its level and its fades, with one line of reason each. The placing is the designer's. Each planned sound is then made in a few variations that differ in prompt style, on Higgsfield (`mirelo_text_to_audio`, through the `higgsfield` MCP server; `sfx.py` writes the calls and takes in the results), and the user picks one per sound on one card per scene. The step and its rules are in `flow/Flow v3.3 - 11 Sound and music.md`, "The sound designer".

## What the designer is given
- The cut as it is now: the AI editor's first cut, as soon as it is in, at 480p (`flow/Flow v3.3 - 9 Edit.md`, step 4). It does not wait for the music or the 1080p.
- The film's `script.md`, `brief.md` and the story.
- The take's own sound under every shot: levels per 100 ms, spectrograms, where it drops to silence at a join. The designer cannot listen; it reads the sound this way and pulls frames from the takes by index, into `$FILM/scratch.nosync/`.
- The user's levels and the lessons below, and the user's earlier picks: each film's `audio/sfx/*/pick.json` and `prompts.json`, and the sound rows of `taste.md`.
- The music is out of scope: the user chooses it.

## How it plans
1. For each scene, write down who is present, what happens, where the people on screen should react, what place is heard, what the take's own sound does, and what must carry over into the next scene.
2. Plan every effect against that: what kind (a bed, a reaction, an accent, a carry-over), where (start and end in frames and timecode), its level and its fades, what it ducks or replaces, a one-line reason and a confidence of 1 to 3. What it looks for:
   - the joins where a sound must carry across: a wave or a wind over a stitched cut, the people across a drop-out after a big moment;
   - the gaps in the background: the crowd's murmur, cheers, gasps;
   - a crowd on screen that should react to a line and does not in the take.
3. Write each sound's prompts in the plan as `variations`, one per style (below). Write down too what was weighed and left, with its reason.
4. Write the plan to `$FILM/audio/sfx/plan.json` and freeze it (its sha1 and the time) before anything is made. `sfx.py --plan` writes `plan-frozen.txt` beside it on its first run and refuses a plan changed after that (`--refreeze`, after saying why in the plan).

The plan's shape, with three optional fields per effect that `sfx.py` reads (`variations`, `tries`, `generate_seconds`):

```
{"film", "cut", "fps", "made", "by", "levels_note",
 "scenes": [{"scene", "frames", "present", "happens", "should_react", "place_heard", "take_sound", "carry_over"}],
 "effects": [{"id": "C2", "name": "quiet-cheer", "kind": "reaction",
              "start": {"tc": "00:00:07:15", "frame": 183}, "end": {"tc": "00:00:10:06", "frame": 246}, "seconds": 2.62,
              "what": "<the sound in one literal prompt>",
              "variations": [{"style": "literal", "prompt": "..."}, {"style": "natural, close", "prompt": "..."}, {"style": "quieter", "prompt": "..."}],
              "tries": 3, "generate_seconds": 4.6,
              "level_db": -14, "fade_in_frames": 4, "fade_out_frames": 14,
              "replaces_or_ducks": "...", "reason": "...", "confidence": 3}],
 "weighed_and_left": [{"where", "decision", "reason"}]}
```

`name` is the sound's folder under `audio/sfx/` (else the last part of `file`, else `<id>-<kind>`). `tries` overrides the count (default 4, 3 for a bed, or as many as `variations` gives). `generate_seconds` overrides the length made; 0 means the effect reuses another effect's sound.

## The variations
- **3 to 5 of each sound, across prompt styles, not only across wordings.** One literal and specific to the setting ("a small crowd of about fifteen guests at a long table in a timber hall ..."); one natural and close ("a short natural swell of approval ... close and dry"); the rest quieter or in between. A long bed takes 3. Different styles win at different moments, so the tries must really differ in style.
- **Crowd prompts are always wordless.** A generated crowd that speaks words rarely sounds right. `sfx.py` adds "no clear words" to a crowd prompt that does not say it, and warns when a crowd prompt has words in quotes.
- **Each reaction is made about 1 s longer at each end than its place,** so the user can slide it. A bed is made as long as its place; a sound over 30 s is made of pieces crossfaded over 2 s (two pieces up to 58 s).
- **For a big event** (a great wave, a crash), offer a generated sound as one variation and the take's own sound alone as another.
- They need no quote and no go: each job is logged in `spend.md` as "on the plan", by `sfx.py --add`.
- Each try is cleaned as `flow/Flow v3.3 - 11 Sound and music.md` says: a high-pass at 25 Hz, an 8 ms fade-in, its peak at -1 dBFS (`sfx.py --add` does it, and keeps the raw file).

## The user picks, and the pick is kept
- Lay the variations of each sound in place on the cut so the user hears each one there, and write one card that asks (a pick) per scene, with a prediction from `taste.md` and the earlier picks. "None of these" is always open: then 3 more (`sfx.py` adds them after the last try), or the user's own words for the prompt.
- Record every pick: `sfx.py "$FILM" <name> --pick N --note "<the user's words>" --predicted M`. It writes `pick.json` (the try, its prompt and style, the ones passed over), marks the pick in `prompts.json` and adds the `taste.md` row; its "What it says" cell is yours.
- Lay each picked sound as its own clip on the effects track at its planned place, level and fades: one drop per scene.
- Read the picks before writing the next film's variations, and add what they show to the lessons below.

## The user's picks win over the designer's reading
Where a pick goes against the script's wording or a lesson, the pick is the rule: offer that kind of sound among the next film's variations, and change the lesson.

## The user's levels
Until the user's own mixes give their numbers, start from these (from the film this step was first made on): dialogue at 0 dB, the music at -8 dB, reactions mostly at -12 dB (-8 to -14), room beds at -20 to -22.5 dB. Fades: a 24-frame fade-in on the film's first bed and a 48-frame fade-out at its end; cheers fade out over 10 to 24 frames; murmurs over about 40 frames, running on under the next line; beds over about 36 frames at a change of place. A generated file's own loudness varies widely, so set each effect by its loudness against the user's kept tries, then the plan's level on top: `sfx.py` records each try's loudness in `prompts.json`. Check the mix on laptop speakers as well as on headphones. Replace these numbers with the user's own as their mixes show them.

## The lessons
Taste, not flow rules: each one comes from the user's picks, their changes to the designer's effects, or the debrief after a release (`flow/Flow v3.3 - 12 Release.md`). Add each new one here at once, numbered, in plain words, with the film it came from. A lesson that a later pick contradicts is changed, not kept beside it.

<!-- One entry per lesson, in this shape:
1. <The lesson, as a rule the designer can follow.> (From <film>, <the pick or change behind it>.)
-->

(None yet.)

## Every effect stays open to the user's hand
Every effect is its own clip on the cut's effects track, so the user can play, move, trim, re-level and mute it on the Edit page. Never bake an effect into a take, never render a new sound file for the cut, and never touch the takes' own sound, the music or the user's levels and fades.

## Running it
```
.venv/bin/python tools/sound/sfx.py "$FILM" --plan audio/sfx/plan.json --dry-run      # every prompt, length and call
.venv/bin/python tools/sound/sfx.py "$FILM" --plan audio/sfx/plan.json                # freeze the plan, write and print the calls
#   send each printed generate_audio call through the higgsfield MCP server (generate_audio_batch for several), wait with
#   jobs_wait, download each result into $FILM/scratch.nosync/ without printing its link, then take it in:
.venv/bin/python tools/sound/sfx.py "$FILM" <name> --add 1 --file "$FILM/scratch.nosync/<download>" --job <job id> [--credits C]
.venv/bin/python tools/sound/sfx.py "$FILM" <name> --seconds 2.1 --prompt "<literal>" --prompt "<natural, close>"   # one sound, or 3 more
.venv/bin/python tools/sound/sfx.py "$FILM" <name> --pick 2 --note "<the user's words>" --predicted 1
```
Brief the designer with the sections above, the paths, and these rules: write nothing into the cut until the plan is frozen and the sounds are made, make no paid call but the sound effects on the plan (on Higgsfield, `mirelo_text_to_audio`), keep the music out, keep scratch in `$FILM/scratch.nosync/`, and put every question to the user on a card. If Higgsfield refuses `mirelo_text_to_audio`, use the sound Seedance made with the take, as `flow/Flow v3.3 - 13 Services and costs.md` says.
