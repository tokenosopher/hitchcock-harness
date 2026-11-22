---
tags: [ai-filmmaking, film-flow, film-flow-v3-3]
version: 3.3
status: live
---
# 11 · Sound and music

**Purpose.** The film's finished sound on the 1080p timeline in Hitchcock Harness: every clip's own sound kept and cleaned of stray music, the music the user chose fitted under the dialogue, effects where no clip carries them, planned by the sound designer on the AI editor's first cut and picked by the user among variations, each laid as clips on the cut's own tracks on the Edit page, and the user's mix made there. The master is what the app renders from the tracks the user has switched on; it goes on to release.

## Inputs
- The 1080p timeline the user approved by name in [[Flow v3.3 - 10 Finish and 1080p]]: the cut's version on the Edit page, named on the user's yes card, playing in the 1080p view. Its sound is every clip's own generated sound; the music may already be on it if the user laid it at 480p ([[Flow v3.3 - 9 Edit]]). Below, `v<n>` is the newest version of the cut, read from `cut/working.json` right before each change (the app's edit recipe, `recipes/edit.md` in the app's folder; its full path is in your instructions).
- The keeper take of every generation in the cut, in its take folder `$FILM/generations/<G>/takes/take<N>/` ([[Flow v3.3 - 7 Takes]], [[Flow v3.3 - 8 Redos]]).
- The user's wishes for the music: their own song file, the previous film's song, music they lay on the Edit page themselves, or composed takes. You get them in step 9.
- The app's edit recipe for every change to the cut (a drop, never a write of the cut itself), and its show recipe (`recipes/show.md` in the app's folder; its full path is in your instructions) for the cards. Sound files show on the Sound page by folder (`audio/`, `voices/`).
- Demucs (stems, removing music) and Whisper (transcripts), both on the Mac, free, installed by `./setup.sh` in the app's folder; Higgsfield's `separate_stems` only when Demucs is not installed ([[Flow v3.3 - 13 Services and costs]]).
- The spend log (`$FILM/spend.md`, its header from `templates/spend.md`).
- Standing rules: [[Flow v3.3 - 0 Standing rules]]

## Steps
Run every command from the studio folder (your working directory). In every command `$FILM` is the full path to the film folder (`assets/films/<film>` under the studio folder) and `S=tools/music`. Run Python with `.venv/bin/python` (it has numpy). A script that takes `--film` reads relative paths from the film folder; every other path is written in full.

### The clips' own sound
1. Keep every clip's own generated sound. Never replace it with studio recordings. A defect (a stutter, a mangled word) gets a targeted fix of only the words affected; tell the user up front. A word that came out wrong is fixed as [[Flow v3.3 - 8 Redos]] says; the fix ladder is in [[Flow v3.3 - 9 Edit]].
2. Check every generation of the cut for music inside its clips before any music is laid. Seedance improvises music at times (a swell, a stinger, faint strings under the dialogue) even though every scene prompt says no music ([[Flow v3.3 - 6 Scene prompts]]). An element clip with a stray sting already goes into the generations as a muted copy ([[Flow v3.3 - 3 Voices and video elements]]).
3. Separate every keeper take of the cut into four stems with Demucs on the Mac, one take at a time. It is free and needs no quote and no go: `.venv/bin/python tools/stems/split.py "$FILM" <the take> --four` (the raw Demucs command is in `tools/stems/README.md`).
   - The take is `"$FILM/generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4"` (a pick-up's take is `generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-480p.mp4`).
   - Its stems come back as `vocals`, `drums`, `bass` and `other`, into `$FILM/audio/stems/<G>-take<N>-480p/`. The music, wind and birds land in `other` and `bass`; the steps and hits land in `drums`.
   - When Demucs is not installed, ask the user to run `./setup.sh` in the app's folder. Only if it cannot be installed, use Higgsfield's `separate_stems` with the same modes, as [[Flow v3.3 - 13 Services and costs]] says.
   - This route is untested in this copy: listen to the first stems before anything is built on them.
4. Make each take's music-out sound beside the original, which stays untouched:
   - voices plus drums: `ffmpeg -i <the vocals stem file> -i <the drums stem file> -filter_complex amix=inputs=2:normalize=0 -c:a pcm_s24le <G>-take<N>-nomusic.wav`, into the take folder;
   - measure `other` plus `bass` against the take with `ebur128` and report, per generation, how far under the voices the removed music sat.
5. Lay the music-out sound in the cut, as one change of the cut (a drop, the app's edit recipe, "What the timeline cannot say"): on each take's sound clip on the dialogue track, `src` points at that take's `-nomusic.wav`, with the same in, out and place, so every trim stays. The picture clips are unchanged, and the take's own file stays untouched in its take folder. Say what was done in each clip's label and in the note. The version before keeps the original sound: the user can go back to it on the Edit page. Tell the user which clips changed.
6. Put each generation's music-out sound and its removed stems (`other` plus `bass`) on a card on the Sound page, so the user hears what went, and say in the thread where it is, the page named as a link. **GATE:** write a card that asks for a yes and wait for the user's yes. Where the user still hears music in a generation, named by ID:
   - make that generation's music-out sound from its `vocals` stem alone (the drums go too, since music with a beat leaves part of it there), or split that take again into two stems and use its `vocals`;
   - the voices alone come back quieter than the take. Read the integrated loudness (`I:`) of both with `ffmpeg -i <file> -af ebur128 -f null -`, raise the voices by the difference and write it over that generation's `<G>-take<N>-nomusic.wav` (`-c:a pcm_s24le`); the sound clip that points at it then plays it. Put it on a card and wait for the user's yes on a card that names the generation;
   - if music is still heard, say so plainly: this copy has no way to lift one named sound out of a mix. What is left is to let the score cover it, or a redo of that generation with its own quote and go ([[Flow v3.3 - 8 Redos]]).
7. From here on the cut's dialogue sound is the music-out sound.
8. Every other separation job goes through Demucs too ([[Flow v3.3 - 3 Voices and video elements]] uses it for the voice stem):
   - a voice: the two-stem split gives `vocals` and `no_vocals`; `no_vocals` is the bed to lay under a replacement word;
   - one named sound (one effect, one voice among several speaking at once): there is no exact way here. Use the four stems if the sound lands in one of them; else tell the user it cannot be lifted out and drop the job;
   - when the user asks for voice stems, split every clip of the edit into two stems and lay the `vocals` on a sound track of their own in one drop;
   - a donor-word clone for a word fix is built from the `vocals` stems of that character's keeper takes, 25 s or more of clear speech (Higgsfield takes 10 s to 3 minutes), uploaded as audio and made a voice with `create_voice_from_confirmed_audio`, as [[Flow v3.3 - 3 Voices and video elements]] says. The user hears the sample beside the clone before any word is spliced ([[Flow v3.3 - 9 Edit]]). For a wrong word, 4 second Seedance probes of the word said in various ways come first; the clone, saying many variations of the word, is the fallback. Either way the user chooses among the options as video, in the cut that contains the word ([[Flow v3.3 - 8 Redos]]).

### Where the music comes from
9. Ask the user where the music comes from, before composing or spending anything. Offer the sources, the fast path first:
   - the user's own song, laid untouched (about half an hour of work, against hours for composed takes);
   - the previous film's song again, for an episode of a series;
   - music the user lays on the Edit page themselves;
   - composed takes with ElevenLabs Music on Higgsfield, `elevenlabs_music_v2` (steps 15 to 27).
   - The music may already be on the 480p edit: the user may lay it there ([[Flow v3.3 - 9 Edit]]). Fades the user set by hand are kept where they are, at 480p and at 1080p.
   - No other music model is in this flow. Higgsfield refuses `elevenlabs_music_v2_5`: never ask for it. Its catalog also lists `sonilo_music` (marked for its game pipeline only: never for a film). Step 26 says what to do when a model this note names is refused, or the catalog shows one it does not name.
10. State the licence with the source. Composed music made through Higgsfield falls under the user's Higgsfield terms. ElevenLabs Music's own terms, when bought from ElevenLabs, allow all online and offline commercial use except film, TV and radio below its Enterprise Music plan, and do not define "film"; whether that catch carries through Higgsfield is not known in this copy. Say so whenever composed music is proposed, and point the user to Higgsfield's terms, as information for the user's choice, not as a separate question.
11. **GATE:** write a card that asks the user to pick the source, film by film, and wait for the pick. Nothing is composed, created or downloaded before it. For music the user lays on the Edit page themselves, go to step 39.
12. Spot the music with the user. The user chooses the music. It runs under almost the whole film and changes with each scene; leave no dry stretches. The moments of tension, where something pivotal, unexpected and grave changes the action, are where it changes or swells. Silence is only a device: propose one to three stops at beats (a door slam, a verdict, a number falling, a dark line, the music stopping just before a closing line), each with its film time, and let the user place them. The user may cut more stops on the Edit page. Turn big emotional swells under dialogue down.

### The user's own song
13. Bring the user's song in untouched: full range, full stereo, no EQ, no narrowing, no grit. Only its level, the dip under speech, the stops the user places and the end fade get set (step 29).
    - Copy the file into the film as `audio/score/song.wav`. Keep the user's file name for the card.
    - Transcribe it with Whisper on the Mac (`transcribe.py --audio`; Tools; `tools/stt/README.md`). Zero words means an instrumental. Compare its length with the film's. If it has vocals or the lengths are far apart, tell the user before anything changes.
    - Cut or edit the song only if the user asks.
14. When a word could mean the picture or the sound ("lo-fi" can mean a low-res video), ask, or make the cheap reading (a 480p copy) first. `lay_song.py --fx lofi` brings back a muffled chain: use it only if the user asks for that sound in those words.

### Composed takes with ElevenLabs Music on Higgsfield
The composer is `generate_audio` with `model: elevenlabs_music_v2`: a `prompt`, a `duration` of 3 to 600 s, `force_instrumental`, `lyrics` (up to 120 s of song) and `batch_size` up to 4. It takes no composition plan: each cue is one prompt. The wording rules of step 16 were learned on ElevenLabs Music through its own API; on Higgsfield they are untested, so check every take against them. The exact calls, the landing and the log: `tools/music/README.md`.

15. Write the brief in `audio/score/cues.json`, one entry per cue: its id, the `prompt` that is sent, its `duration`, `force_instrumental`, the film times it covers, and later its `use` block (step 30). The shape: `tools/music/README.md`. A film has one full-film cue, or a theme plus cues. Each prompt holds:
    - the mood and the comic function; each instrument's register and articulation; the form with section times on the film's beats; a BPM where cuts land on bars (frames per beat = 1440 / BPM at 24 fps);
    - what must stay out, named once at the end: screeching strings, shrill sustained brass, harsh high-pitched drone, static unchanging dynamics, wall of sound. Vocals stay out with `force_instrumental: true`. Listen for each of these in the take: in a single prompt, a word that names a thing can bring it in.
16. Word the prompt so the composer renders it:
    - Never name a composer or artist: the model refuses it as copyrighted material. Write the era, the instruments and the playing.
    - One lead instruction per section, first in that section's words: `prominent <instrument> playing the melody, clearly audible on top`. Named among the other instruments, the lead goes missing. A section loaded with "exactly" and "prominent" instructions drops parts. A musical saw never renders; a whistle works.
    - Register words ("high", "upper register") and requested chords are ignored. Measure where the lead sits and tell the user. Doubling the lead with a whistle can move it up an octave.
    - Never ask for breaks, stops or hard endings: make them in post. Section times are targets: edges drift by up to about 7 s, and every cue ends with a fade. For a hard cut, let the cue run about 6 s past the cut and cut it on the frame (`cut_at`).
    - Write "clearly audible". Soft wording ("softens", "stopping short", "almost nothing") makes near-silent sections.
17. Check the prompt against the brief and the rules above, then preflight it, free: the same call with `get_cost: true` and `use_unlim: false`. It costs about 0.064 credits a second (1.35 for a 21 s take, about 3.9 for 60 s); the preflight is the price. Keep the prompt short: Higgsfield does not state a limit, and a prompt it refuses says why.
18. **GATE:** quote the round's credits on a card that asks for a go, and wait for the user's go. Then compose one take: `generate_audio` with `model: elevenlabs_music_v2`, the cue's `prompt` and `duration`, `force_instrumental`, `batch_size: 1`, `use_unlim: false`, and the film's project folder from `higgsfield.json` as `folder_id`. One take per round; more only when the user asks (step 23). At most two jobs at once. Log the job in `spend.md` the moment it goes out.
19. Wait with `jobs_wait`, then land the take: download it as `audio/score/<CUE>-take<N>.mp3` (`.wav` if that is what Higgsfield returns; the result URL written to a file with the file tool, never on a command line) and add its entry to `audio/score/score-log.json` (job id, credits, duration, loudness, the level of each planned section) with `log_take.py`: `.venv/bin/python $S/log_take.py --film "$FILM" <CUE> <N> --job <job id> --credits <cr>` (Tools; `tools/music/README.md`).
20. Measure each take before anyone listens: length, tempo grid (`.venv/bin/python $S/beat_grid.py "$FILM/audio/score/<CUE>-take<N>.mp3" --bpm 105,125`), key, the level of each section (in `score-log.json`), and whether the lead came in (band energy, intro against theme).
21. Key and register need stems: split the take into four stems with Demucs, as step 3 says. Align the stems to the take by correlation, then run `music_analyze.py` on them.
22. There is no listener model in this copy: tell the user you measured but cannot hear; the user's ears decide. The takes go on cards on the Sound page (step 37).
23. More takes of the same cue only when the user asks: `batch_size` 2 to 4 in one call, one quote for all of them, each landed under its own take number.
24. A cue with sung words only when the user asks for one: `lyrics` holds the words (up to 120 s of song), with `force_instrumental` off. Under dialogue, sung words compete with the lines: say so when it is proposed.
25. Re-making a cue: the composer cannot be told to keep an approved stretch. Keep it by editing instead: cut the new take into the approved one on the bar grid (step 28), or re-make only the cue that changes.
26. Read the audio models with `models_explore` (`type: audio`) before a film's first music round. If the catalog shows a music model this note does not name, tell the user it exists and is untried in this flow; use it only on the user's word, with its own preflight, quote and go.
    - When Higgsfield refuses the model this note names, never guess another silently. Read the model list (`models_explore`, `type: audio`). If that fails or times out, ask the price of the likely names (the same call with `get_cost: true`, free) and choose the one that answers. Say on the quote card which model you will use, why, and that it is not the one the note names, and write the name that worked into this note and [[Flow v3.3 - 13 Services and costs]].
27. Use covers and remixes on a reference's own stems only to explore a sound; music in a published film is written fresh from a description. To drop an instrument from such a backing, notch out its bleed with `dethermin.py` and measure the result.

### Fitting the music
28. Edit a composed take to the film on its bar grid. Composed takes only: the user's song is edited only if the user asks.
    - `.venv/bin/python $S/beat_grid.py <take or its bass and drums stems> --bpm 105,125`. Give a range around the likely tempo: half and double readings are common.
    - Write `audio/score/song-edit.json` in the shape `tools/music/README.md` gives, then run `.venv/bin/python $S/song_edit.py --film "$FILM" audio/score/song-edit.json audio/score/<CUE>-take<N>-edit.mp3`.
    - Cut, repeat and re-enter only on bar lines (15 ms crossfades). Repeat staccato bars, never a sliding lead: it re-attacks with an audible hiccup. Fill a short take with an earlier groove section re-entering on a downbeat. Fade before the take's own drop-out.
    - Under an effect that must land, duck the whole score about 14 dB with smooth ramps and bring it back on a downbeat; a bass-only break sounds thin and chopped.
    - Synthesise a chord the generator gets wrong (mono, dry, band-limited) on the take's measured key; pitch-shifting the generator's version keeps the wrong notes.
29. Mix the song, or the edited take, against the film's dialogue. Number the music versions `v<N>`:
    - First render the cut's dialogue alone, as the film to mix against: `.venv/bin/python tools/finish/cut_render.py "$FILM" cut/v<n>.json audio/score/auditions/v<n>-dialogue-480p.mp4 --tracks <the dialogue tracks' ids>`. That file is `<dialogue>` below.
    ```bash
    .venv/bin/python $S/lay_song.py --film "$FILM" --song audio/score/song.wav --picture <dialogue> \
        --out audio/score/auditions/song-v<N>.mp4 --stop <film second> --preview 30 --lowres \
        --bed-out audio/score/song-v<N>-as-mixed.wav
    ```
    - It sets the level, the dip, the stops and the fade, and nothing else. The bed sits 4.5 dB under the speech level and dips gently under speech (sidechain threshold 0.06, ratio 1.8). Each `--stop` ducks it 14 dB: down over the half second before the beat, back over about 1.2 s under the next line. It fades out over 2 s, so the final black frames are silent. The film's own sound is never touched.
    - The picture is copied. `--preview 30` and `--lowres` write the 480p auditions `audio/score/auditions/song-v<N>-first30-480p.mp4` and `audio/score/auditions/song-v<N>-480p.mp4`, at 480×854; give `--size 854:480` for a 16:9 film. Keep auditions out of `cut/`: a video there shows on the Edit page as a cut the timeline has not taken in.
    - `--bed-out` writes the bed exactly as mixed, a 24-bit WAV: the file laid on the timeline (step 39).
    - Leave out `--stop` where the take's edit already ducks.
    - Read its last line: about 8 dB under the voices while anyone speaks and 2.5 to 3 dB higher in the gaps. If it is far off, change `--bed-db`, never the song. Keep the dip at 0.06 and 1.8: a stronger dip (0.04, 2.5) buries the bed about 15 dB under.
    - Give a second version of the user's song the same command, so the versions compare fairly.
30. For a cue score (a theme plus separate cues):
    - give each cue in `cues.json` a `use` block: the take, its level in LUFS, a natural or hard end with `cut_at`;
    - each cue is laid as its own clip on the music track (step 39);
    - level the cues around −21 to −23 LUFS against dialogue at −16 LUFS under a strong sidechain. The bed levels of step 29 are the approved reference.

### The sound designer
This step runs on the AI editor's first cut, as soon as it is in ([[Flow v3.3 - 9 Edit]], step 4), at 480p: it does not wait for the music or the 1080p. It covers the effects and the background beds; the music stays the user's.

31. **The sound designer plans every effect on the cut.** Brief one Opus agent ([[Flow v3.3 - 0 Standing rules]], Agents) with `tools/sound/SOUND_DESIGNER.md` (its process, the starting levels and its lessons), the cut as it is now, `script.md`, `brief.md` and the story. It plans every effect: what kind, where, its level and its fades, each with a one-line reason. The placing is the sound designer's: lay the effects where it plans them.
    - What it looks for: the joins where a sound must carry across (a wave or a wind over a stitched cut, the people across a drop-out after a big moment); the gaps in the background (the crowd's murmur, cheers, gasps); a crowd on screen that should react to a line and does not in the take.
    - It writes the plan to `$FILM/audio/sfx/plan.json`, each effect with its `variations` (one prompt per style), in the shape SOUND_DESIGNER.md gives. The plan is frozen in `$FILM/audio/sfx/plan-frozen.txt` the first time sounds are made from it; a changed plan is refused without `--refreeze`.
32. **Each sound is made in 3 to 5 variations**, spread across prompt styles, not only across wordings: one literal and specific to the setting ("a small crowd of about fifteen guests at a long table in a timber hall…"), one natural and close ("a short natural swell of approval… close and dry"), and the rest between them or quieter. A long bed takes 3. Crowd prompts are always wordless.
    - Generate each reaction about 1 s longer at each end than its place, so the user can slide it.
    - They need no quote and no go ([[Flow v3.3 - 0 Standing rules]], Spending): log each job in `spend.md`. They are cleaned as step 36 says.
    - `sfx.py` makes no call itself. `.venv/bin/python tools/sound/sfx.py "$FILM" --plan audio/sfx/plan.json --dry-run` prints every prompt and length; without `--dry-run` it freezes the plan and prints one `generate_audio` call (`mirelo_text_to_audio`) per try. Send them through the `higgsfield` MCP server (`generate_audio_batch` for several), wait with `jobs_wait`, download each result into `$FILM/scratch.nosync/` without printing its link, and take each in with `sfx.py "$FILM" <sound> --add <N> --file <download> --job <job id> [--credits C]`: it keeps the raw file, cleans it, measures its loudness, writes it into the sound's `prompts.json` and logs the `spend.md` row. Each sound's tries are in `$FILM/audio/sfx/<sound>/`.
33. **The user picks on one card per scene.** Lay the variations of each sound in place on the cut so the user hears each one there, and write one card that asks (a pick) per scene, with your prediction from `taste.md` (the app's show recipe, "Sound picks"). "None of these" is always open: then make 3 more (`sfx.py` adds them after the last try), or take the user's own words for the prompt. Lay each picked sound as its own clip on the effects track, at its planned place, level and fades: one drop per scene.
34. **Every pick is recorded** with its prompt and the ones not picked, by `sfx.py "$FILM" <sound> --pick <N> --note "<the user's words>" [--predicted <M>]`: the sound's `pick.json`, the pick in its `prompts.json` and a row in `taste.md`. A pick on the card runs it in the app; do not run it again. The prompts that win teach the next film's prompts: read them before writing the next film's variations, and add what they show to the sound designer's lessons in SOUND_DESIGNER.md.

### Sound effects
The joins get one sound pass, over every join of the film, made by the sound designer (step 31) on the AI editor's first cut, without waiting for the user's word: every effect is a clip that moves with the cut. At each join the sound is made to carry across: the outgoing sound faded, or a sound laid across the join. Every effect is its own clip on the effects track of the cut, so the user can play, move and mute it on the Edit page; never bake an effect into a take.

35. Take each effect from the clips' own sound first, in the order of the edit's fix ladder ([[Flow v3.3 - 9 Edit]]):
    - a slice of a clip's sound moved to where the action lands, with a short natural tail ringing past the cut;
    - or, on the user's go, the action re-shot with the next shot so it lands on the cut;
    - tell the user the effect's peak against the dialogue.
36. Generate a sound effect on Higgsfield where no clip's own sound carries it (a title boom, a crowd laugh across a join) or the user asks for one: `generate_audio` with `model: mirelo_text_to_audio`, a `prompt` and a `duration` in seconds (about 0.75 credits for 3 s when this note was written). It needs no quote and no go: make it in a few tries, say afterwards what you made, and log each job in `spend.md` with its credits (the call: [[Flow v3.3 - 13 Services and costs]]). Higgsfield's catalog marks this model "game pipeline only": if a job is refused, use a slice of the sound Seedance made with a take instead, or a short Seedance draft kept for its sound (a video job: it keeps its quote and go). Clean an effect before placing it:
    - high-pass at about 25 Hz (removes a DC offset), an 8 ms fade-in from silence, level set by its peak (−1 dBFS);
    - to make it louder: `acompressor` (no lookahead), then `alimiter` with `latency=1`, then the fade-in again. Never `alimiter` without `latency=1`: its lookahead leaves 5 ms of silence and a jump that sounds like a click at the start;
    - keep the file in the film folder and lay it, with its fades, as its own clip on the effects track of the next cut version. An effect every film uses (the title boom) is also kept in `assets/library/sfx/`.

### Showing the music
37. Put each music version on a new card on the Sound page (the app's show recipe), and say in the thread what is up, the page named as a link.
    - The card: what the music is (the user's file name for their song), how it is mixed (the measured level under speech, the stops with their film times, the fade) and what changed from the previous card.
    - Auditions: the film's first 30 s at 480p for every take, then the full film and the music alone for any take still in the running. Mix every take identically (same level, dips and fade), so only the music differs. One take unless the user asks for variations.
    - 480p first, quick on a phone. Music never asks for new video or an upscale ([[Flow v3.3 - 10 Finish and 1080p]]).
    - Say what you checked: the levels, every stop, the end, and that the clips' own sound is unchanged.
    - Auditions live in the film folder and on their cards; the delivery folder `assets/final-cuts/` gets only finished films ([[Flow v3.3 - 1 Setup and story]]).
38. **GATE:** write a card that asks for a yes on one music version, its title naming the version, and wait for the user's yes. Nothing goes on the timeline before it.

### The mix
39. Set up the mix on the Edit page, on the cut's own tracks, the user's. Add to it; never change what is there. Make each piece one drop (the app's edit recipe, "Common operations"):
    - the approved version's bed as mixed (`audio/score/song-v<N>-as-mixed.wav`) as one clip on the music track, from the film's start, labelled with the version. Its level, dips, stops and fade are baked into the file, so lay it at 0 dB with no fades of its own. Tell the user which track is which. For music the user lays themselves, lay nothing;
    - a cue score: each cue's file as its own clip on the music track at its film time; two cues that overlap go on a second music track beside it, since clips on one track never overlap;
    - the effects stay on the effects track as their own clips (Sound effects above);
    - set each effect's level and fades as starting values from SOUND_DESIGNER.md (the user's own levels once their mixes show them); the user changes them on the Edit page.
40. The mix is the user's. When the user is done, read the steps and versions made since you laid the music (the History tab's words and each version's note) and say back exactly what changed, in film times ("the music stops 0:55 to 0:58").
41. The master is rendered by the app, only on the user's word: "Render master" in the Edit page's header, or, for the delivery loudness, a render with the loudness option at −14 LUFS and −1 dBTP that the user asks for in More renders (the app's edit recipe, "Master (1080p)" and "Renders with options"). Never change the user's levels or fades yourself.
42. Check the master: `.venv/bin/python $S/check_render.py <the master> <dialogue> --approved audio/score/auditions/song-v<N>.mp4 --frames <the cut's frame count>` (full paths), with `<dialogue>` rendered again from the version the master is of (step 29). If the level in the gaps moved, ask the user whether they meant it.
43. That master goes on to [[Flow v3.3 - 12 Release]], where the user names the final.
44. Report the true peak: `ffmpeg -i <the master> -af ebur128=peak=true -f null -` for the true peak, plus the sample peak per channel from the undownmixed decode. Never decode with `-ac 1` to measure it: that sums the channels. Delivery is −14 LUFS and −1 dBTP; report a true peak over −1 dBTP to the user, who sets the levels on the Edit page.
45. Put the master on a card on the Sound page: the version it is of, what the user changed in film times, the loudness and the true peak, and the checks you ran. Say in the thread where it is. **GATE:** write a card that asks for a yes on that master, its title naming the version, and wait for the user's yes. Captions and release come after it ([[Flow v3.3 - 12 Release]]).

## Checks
- Before any music is laid: every keeper take of the cut split into four stems, the removed music's level reported per generation, and the user's yes on the music-out sound.
- The music-out sound: voices plus drums only (voices alone where step 6 needed it, loudness-matched to the take's original sound), each sound clip pointing at its take's `-nomusic.wav` with its in, out and place unchanged, the picture clips unchanged, the drop taken by the app.
- Nothing of the clips' own sound lost: `lay_song.py` leaves the film's sound untouched, and the user's song is untouched (no EQ, no narrowing, no grit).
- Bed level from `lay_song.py`'s last line: about 8 dB under the voices while anyone speaks, 2.5 to 3 dB higher in the gaps. Measure the bed file itself against the film; never subtract a re-encoded film from the mix (the AAC residue reads as music).
- Every stop at its film time; the end fade complete and the final black frames silent.
- Every composed take measured before anyone listens: length, tempo grid, key, each section's level, the lead present, none of the things the brief keeps out.
- A generated effect peaks at −1 dBFS and starts with its 8 ms fade-in, with no gap or jump at its head.
- The sound designer's plan frozen before any sound was generated; every planned sound made in 3 to 5 variations across prompt styles (3 for a bed), each reaction about 1 s longer at each end than its place; one pick card per scene; every pick in its `prompts.json` and in `taste.md`.
- The mix heard on laptop speakers as well as on headphones.
- The master: `check_render.py --frames` reads the cut's frame count; loudness, true peak, the music stops and the level change while speaking and in the gaps against the approved version are read and said back.
- The true peak from `ebur128` plus the per-channel sample peak, both from the undownmixed decode, never `-ac 1`. Delivery: −14 LUFS, −1 dBTP.

## Outputs
- `$FILM/audio/stems/<G>-take<N>-480p/`: the four stems of every keeper take (`vocals`, `drums`, `bass`, `other`). Per generation in its take folder `generations/<G>/takes/take<N>/`: `<G>-take<N>-nomusic.wav` (voices plus drums, or voices alone where step 6 needed it).
- In the cut: a version whose dialogue sound clips point at the `-nomusic.wav` files.
- `audio/score/song.wav`: the user's song, untouched; their file name on the card.
- `audio/score/cues.json`, `audio/score/<CUE>-take<N>.mp3`, `audio/score/score-log.json`: the brief with each cue's prompt, the composed takes, and the per-take log (job id, credits, duration, loudness, per-section level).
- `audio/score/song-edit.json` and `audio/score/<CUE>-take<N>-edit.mp3`: a composed take fitted on its bar grid.
- `audio/score/auditions/`: the dialogue render `v<n>-dialogue-480p.mp4`, `song-v<N>.mp4` with its auditions `-first30-480p.mp4` and `-480p.mp4`, plus the music alone.
- `audio/score/song-v<N>-as-mixed.wav`: the bed exactly as mixed, 24-bit, laid on the music track.
- In the cut: the bed (or each cue) as clips on the music track, the effects on the effects track, the user's levels and fades.
- The master the app renders, with its true peak, handed to [[Flow v3.3 - 12 Release]].
- Cards on the Sound page: one per music version, and one for the master.
- `$FILM/audio/sfx/plan.json`: the sound designer's frozen plan. `$FILM/audio/sfx/<sound>/`: each sound's tries, raw and cleaned, its `calls.json`, `prompts.json` and `pick.json`. One pick card per scene, and a `taste.md` row per pick.
- `$FILM/spend.md`: one row per paid job the moment it goes out (each composed take, each sound effect, and any `separate_stems` fallback split), under the header of `templates/spend.md`, every cost in credits (`cr`).

## Tools
Run every command from the studio folder (your working directory). Never print a signed link or a result URL. `S=tools/music`.

Unproven on a film of this flow; check every result by hand the first time: the Demucs stems and the Whisper transcript on the Mac, the Higgsfield routes (`elevenlabs_music_v2`, `mirelo_text_to_audio`), `lay_song.py`, `song_edit.py`, `beat_grid.py`, `check_render.py`, `dethermin.py`, `music_analyze.py`, `log_take.py`, `preview_music.py` and `cut_render.py` (its `--tracks` route); `mix_score.py` has completed on test files only.

| Script | Command | Does |
|---|---|---|
| `tools/stems/split.py` | `.venv/bin/python tools/stems/split.py "$FILM" <take\|audio> [--name N] [--four] [--again]`, out to `$FILM/audio/stems/<name>/` (for a take, `<G>-take<N>-480p/`); Demucs on the Mac, the raw command in `tools/stems/README.md` | Full-length stems, free: `vocals`, `drums`, `bass`, `other` (four) or `vocals`, `no_vocals` (two). Higgsfield `separate_stems` only when Demucs is not installed ([[Flow v3.3 - 13 Services and costs]]). |
| `tools/stt/transcribe.py` | `.venv/bin/python tools/stt/transcribe.py --audio "$FILM/audio/score/song.wav" --words-out "$FILM/audio/score/song.words.json"` | A word-level transcript of any audio file from Whisper on the Mac, free (`tools/stt/README.md`); zero words means an instrumental. |
| Higgsfield `generate_audio`, music | `model: elevenlabs_music_v2`, `prompt`, `duration` (3 to 600), `force_instrumental`, `lyrics` (up to 120 s), `batch_size` (1 to 4), `use_unlim: false`, `folder_id`; `get_cost: true` to quote | One composed take per call (or up to four variations). The landing and the log: `tools/music/README.md`. |
| `tools/sound/sfx.py` | `.venv/bin/python tools/sound/sfx.py "$FILM" --plan audio/sfx/plan.json [--dry-run] [--only ID …] [--refreeze]` · `… <sound> --add N --file <download> --job <id> [--credits C]` · `… <sound> --prompt "…" --seconds S` · `… <sound> --pick N --note "…" [--predicted M]` | The sound designer's tries: writes and prints the `generate_audio` calls, takes in and cleans each result, records the pick; makes no call itself |
| `tools/sound/SOUND_DESIGNER.md` | read in full before step 31 | The sound designer's brief: the plan's shape, the variations, the starting levels, its lessons |
| Higgsfield `generate_audio`, effects | `model: mirelo_text_to_audio`, `prompt`, `duration` (s), `use_unlim: false` | One sound effect. Marked "game pipeline only" in the catalog: a refusal sends you to step 36's other routes. |
| `tools/finish/cut_render.py` | `.venv/bin/python tools/finish/cut_render.py "$FILM" cut/v<n>.json <out>.mp4 --tracks <ids>` | Renders a cut version with the app's own filter graph at 480p, keeping only the named sound tracks: the dialogue to mix the music against. Draws no subtitles. |
| `$S/lay_song.py` | `.venv/bin/python $S/lay_song.py --film "$FILM" --song audio/score/song.wav --picture <dialogue> --out audio/score/auditions/song-v<N>.mp4 [--stop <s> …] [--bed-out audio/score/song-v<N>-as-mixed.wav] [--preview 30] [--lowres] [--size 480:854] [--bed-db 4.5]` | Lays a finished song or edited take under the film's dialogue, untouched: level, dip, stops, end fade; picture copied; `--bed-out` the bed as mixed. Prints the bed level under speech and in the gaps. |
| `$S/beat_grid.py` | `.venv/bin/python $S/beat_grid.py <take> [<stem> …] --bpm 105,125` | Tempo, first beat and bar lines. |
| `$S/song_edit.py` | `.venv/bin/python $S/song_edit.py --film "$FILM" audio/score/song-edit.json audio/score/<CUE>-take<N>-edit.mp3` | Bar-grid cuts, repeats, ducks and the end fade from a JSON spec (its shape: `tools/music/README.md`). |
| `$S/dethermin.py` | `STEMS=drums,bass LEAD=other BAND=600,2000 .venv/bin/python $S/dethermin.py "$FILM/audio/stems/<name>" backing.wav backing-plain.wav` (stem names match the file names exactly, case included: Demucs writes `vocals`, `drums`, `bass`, `other`) | Removes one instrument's bleed from the other stems (exploring only). |
| `$S/log_take.py` | `.venv/bin/python $S/log_take.py --film "$FILM" <CUE> <N> --job <job id> --credits <cr> [--file <path>] [--model elevenlabs_music_v2] [--verdict '…'] [--again]` · `<CUE> <N> --verdict '<the user's words>'` | Logs a landed score take in `audio/score/score-log.json` under `<CUE>-take<N>`: job, credits, prompt, length, loudness, the level of each planned section. Calls no service. |
| `$S/mix_score.py` | `.venv/bin/python $S/mix_score.py NAME --film "$FILM" --picture <dialogue render> [--dialogue <wav>] [--out audio/score/cues-mixed]` | A cue score against the locked cut: one WAV per cue (levelled, cut, ducked, starting on a whole frame) for the music track, `manifest.json`, and the full-film preview `NAME.mp4` beside the picture. Check `df` first; delete its `mix-*` temp folders in `$TMPDIR` after. |
| `$S/preview_music.py` | `.venv/bin/python $S/preview_music.py CUE AT FROM TO NAME --film "$FILM" --picture <dialogue render> [--dialogue <wav>] [--music-lufs -21]` | One cue laid in at film time AT under the stretch FROM to TO of the cut (AT or TO may be `end`), ducked, at −14 LUFS: `NAME.mp4` beside the picture. Unproven. |
| `$S/check_render.py` | `.venv/bin/python $S/check_render.py <master> <dialogue> --approved <approved version>.mp4 --frames <N>` (full paths) | Frame count, loudness, true peak, where the music stops, level change while speaking and in the gaps. |
| `$S/music_analyze.py` | `.venv/bin/python $S/music_analyze.py --film "$FILM" --stems <stem dir> --out <stem dir>/music.json` | Key, register and lead from aligned stems. |
