---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 9 · Edit

**Purpose.** Turn the keeper takes into the user's cut on the Edit page of Hitchcock Harness, with the takes' own sound, one numbered version per round of notes, until the user approves a version by name.

## Inputs
- The keeper take of each generation, named by the user by ID, and every landed pick-up ([[Flow v3.2 - 7 Takes]], [[Flow v3.2 - 8 Redos]]): `$FILM/generations/<G>/takes/take<N>/<G>-take<N>-480p.mp4`, a pick-up `$FILM/generations/FIX-<name>/takes/take<N>/FIX-<name>-take<N>-480p.mp4`. Each take keeps its own voices, room sound and hard cuts.
- Each take's transcript in its take folder (`stt.json`, `transcript.txt`), and its media list `generations/<G>/prompt/<G>-media-vN.json` with the previz take json that list names: the planned length and the planned cuts.
- The film's cut on the Edit page. It exists from the script lock: the locked script's lines, the planned shots and each scene's boards, then each scene's take in its boards' place once it has passed its checks ([[Flow v3.2 - 7 Takes]], step 19). How the app keeps it: the app's edit recipe, `recipes/edit.md` in the app's folder (its full path is in your instructions).
- The Hitchcock Harness running on the film. If it does not answer, say so and stop.
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps
1. **Make the first cut.** Trim and order the takes, each with its own sound.
   - The timeline follows the work from the script lock: after the lock, after the shot lists and after each scene's boards, bring it up to date with the app's one call ("The timeline from day one" in the app's edit recipe). Never write a planned line, shot or board yourself. Nothing is rendered while anything in the cut is still planned.
   - Use the keeper of each generation for the first cut. A scene's take is on the timeline, in its boards' place, as soon as it has passed its checks; the keeper pick decides which take is in the film when a generation has more than one ([[Flow v3.2 - 7 Takes]], steps 18 and 19). Every take of a scene is listed on the Edit page's Takes view, cut into its shots, so the user can pick the film shot by shot from any take.
   - Patch nothing, level nothing by hand, add no effect: each of those comes later as a named fix, its reason said up front.
   - Music may be laid on the 480p edit. Fades the user set on it by hand stay where the user put them, in every later version ([[Flow v3.2 - 11 Sound and music]]).
   - Lay a whole line from a recording only when the user asks for that line ([[Flow v3.2 - 3 Voices and video elements]]).
   - The title card, where the script names one; it is the default opening of a period film ([[Flow v3.2 - 1 Setup and story]]). Use the house card: the place and year in Optima capitals with wide letter-spacing, warm off-white on black, the subtitle line in Optima Italic under it, hard cut in and out, the boom on its first frame. Make it with `title_card.py` (Tools) at the film's 480p and 1080p frame sizes, with `--sound assets/library/sfx/title-boom.wav`, the house boom kept for every film. If the library has no boom yet, make one first as a sound effect ([[Flow v3.2 - 11 Sound and music]], step 32: a deep cinematic boom, one hit, a long low tail, about 3 s), clean it as that step says, show it on a card, and once the user keeps it, save it there. A card with a subtitle line holds about 3 s. Put its 480p clip into the cut as its own clip at the place the script names, with a hard cut and no dissolve, as "Add a title card" in the app's edit recipe says; the 1080p clip sits beside it under the name the recipe gives a full-size piece.
   - A card also goes in wherever the story jumps in time or place, at the place the script names it: the place and the time passed, in the house style, made the same way, with the opening card's boom on its first frame. Every card in the film carries that boom.
   - The app numbers the cut's versions itself (`v1`, `v2`…), one sequence for the film, and keeps every step in the cut's history. Never write a version yourself.
2. **End each generated clip after its last word.** For the first cut and any re-assembly:
   - End the clip at the latest of three points: its planned length; its last word plus 0.45 s; its last detected cut plus the planned length of its last shot. Never later than the clip itself. The planned length and cuts come only from the previz take json the media list names, never from the prompt text.
   - Never trim a clip to its planned length: the model starts lines 0.2 to 0.6 s late and runs its cuts late, so a planned-length trim cuts last words and turns a silent last shot into a flash. Tighten the overrun on the sound, not on the plan.
   - Take the last word's time from the take's `stt.json`. Transcribe a take that has none first, as [[Flow v3.2 - 7 Takes]] step 12 says (`transcribe.py`, Whisper on the Mac, Tools); a cached `stt.json` is reused.
   - A take that holds less than 0.45 s after its last word ends where its picture ends. The landing check reports it.
   - A clip whose audio stops short of the picture and clicks at the cut: fade its sound's last 60 ms.
   - At a join between two clips, keep about 0.1 s after the outgoing last word instead, cut on the sound once the cut exists (step 3).
   - Listen at every join before showing it.
3. **Tighten the joins.**
   - Where the speaker changes: 0.5 s word to word. The outgoing clip keeps about 0.1 s after its last word; the incoming one starts about 0.4 s before its first word. Same speaker: 0.35 s. A longer pause only where the script writes one.
   - A reaction that matters may hold 1.3 to 1.6 s. End a narration shot about 1.5 s after the voice-over. End an atmosphere shot on its action, not on a long hold.
   - Trim a late head so the first line starts about 0.4 s into the shot. A generation that opens on a silent shot can start speaking about 3 s late.
   - Never cut inside a word. Cut the picture on the take's own hard cut; a last word that runs past it plays on over the first frames of the next shot as an L-cut tail.
   - End the outgoing clip just after its own last line, not at its last frame, so no word plays twice across the join.
   - Join separate generations only at hard cuts, each speaking only its own lines ([[Flow v3.2 - 6 Scene prompts]]).
   - Cut on movement: a whip pan, a turn or a fall hides the seam between two generations. For a turn across a cut, end the outgoing shot as the turn begins and open the incoming one mid-turn.
   - A long line that lost a sentence: splice two takes and hide the join with a cutaway to a listener. How to write such a line so it holds: [[Flow v3.2 - 6 Scene prompts]].
   - When the user re-cuts on the Edit page, measure their cuts (word to word, heads, tails) and report the numbers beside these.
4. **Work the notes, one round per version.**
   - Locate each note before touching anything. The user gives notes by film time, by word or by shot. Film times shift with every trim and redo, so map each note through the version's own map to the clip and the source second, and say back which shot it is: read the cut as it is now on the Edit page; each clip gives its place on the timeline, the stretch of its source it plays and its label (scene, take, shot), so a film time maps to the clip under it and its source second (the shape: the app's edit recipe).
   - Fix each note the cheapest way that works, in this order (the **fix ladder**):
     1. A pause too long, dead air, a shot opening late: trim or tighten (step 3).
     2. One wrong frame at a cut: a frame-exact trim that takes that frame out.
     3. A held moment too long: a clean sub-range of the take, or leave the beat uncut. Never a jump cut inside a continuous take: cutting breath out of a sigh shows a head dip.
     4. A wrong, garbled or clipped word: that word only. First, 4 second Seedance probes of the word said in various ways. If none is right, a clone of the character's video voice says many variations of the word, inserted dry ([[Flow v3.2 - 3 Voices and video elements]]). Either way the user chooses among them as video, in the cut that contains the word ([[Flow v3.2 - 8 Redos]]).
     5. A prop that wobbles or garbles in a still shot: freeze that region from one good frame of the same take (`freeze_region.py`), enabled by frame number counted from the shot's first frame, because a time-based enable leaves one moving frame. Look at its check image before cutting it in.
     6. An effect missing or wrong: a slice of a clip's own sound first; else a Higgsfield sound effect (`generate_audio`, model `mirelo_text_to_audio`, [[Flow v3.2 - 11 Sound and music]] step 32), made without a quote or a go and logged in `spend.md`. An effect is its own clip on the effects track, never baked into a take. The sound pass over every join comes once the picture is right, on the user's word ([[Flow v3.2 - 11 Sound and music]]).
     7. A voice that has to change: re-voice only the lines the user asks for ([[Flow v3.2 - 3 Voices and video elements]]).
     8. Words that must change: put the new line in front of the user first, on a card on the Edit page, voiced and timed in the character's voice on Higgsfield (`generate_audio` with `elevenlabs_v4` and the character's voice, as [[Flow v3.2 - 3 Voices and video elements]] says), before any generation is touched. Propose the redo only after.
     9. A performance, a framing, a delivery too slow: propose the redo with its cost and stop. It is the whole shot cut to cut, built like the first pass; a short shot goes with its neighbour ([[Flow v3.2 - 8 Redos]]).
   - Each round is one change of the cut, saved as the next version with its note. Never write over a shown version. Every version and every step stays in the cut's history.
   - Start from the cut as it is now on the Edit page, which holds the last approved version and every change since, never from a fresh computation, so every unchanged clip keeps its exact range. Transcription varies run to run, and a fresh pass moves clips by frames.
5. **Cut in a redo.**
   - The landed take waits on the Edit page's Takes view, under its scene. Place it only on the user's word, and ripple only the way they say (step 8). Their word can pick the pieces, such as which part of the old take stays.
   - A pick-up replaces its shot from cut-in to cut-out. Leave the rest of the generation untouched and frame-aligned: split the old take at its own hard cuts (`cuts.py`), frame-exact, with the pick-up between the two parts. Never splice in a fragment of a shot.
   - From a redo made with a neighbouring shot, use only the shot needed: place that part of the take (the clip's in and out on its source). Keep the neighbour's approved take if its line came out stretched in the new one.
   - Before cutting a redo in, compare its voice with the approved take by ear and check every short word by transcript. Keep the original if the voice or the read changed, and say so.
   - Into a close-up of the same person or object, check the outgoing last frame against the close-up's first frame ([[Flow v3.2 - 6 Scene prompts]], close-up continuity lock).
   - Say what moves, in frames, before placing. A take of a different length either ripples everything after it (a take N frames longer moves everything after it by N frames) or a neighbour is trimmed to keep the length (the next shot's head loses the extra frames and nothing after moves).
   - Fades the user set by hand on a replaced item stay where the user put them: carry them over to the clip that replaces it, and say in the report where they are.
6. **Show each version.**
   - Run the checks below on every changed spot first.
   - Render a version at 480p only when the user asks for it, with the app's 480p request ("Ask for the 480p" in the app's edit recipe). The app renders the whole cut at 480p with picture and sound, and the user can watch it from the Renders tab.
   - Write a card for the version on the Edit page, as the app's show recipe says: `cut v<n> · m:ss · what changed`, and a paragraph that answers each of the user's notes in their own words. The user watches the changed passages on the Edit page's timeline.
   - Say in the thread what changed and that it is on the Edit page, the page named as a link.
   - Copy a full cut to the film's delivery folder, `assets/final-cuts/<YYYY-MM-DD> <Title>/`, only when the user asks for it there ([[Flow v3.2 - 1 Setup and story]]).
7. **Change the cut only through the app.** The film's cut is one working cut that the app keeps and the Edit page plays; the user cuts in it too. Place, replace, trim and render on the user's word.
   - Every change of yours is one drop: one per piece of work, with a one-line note that says what changed and where, in timecode. The app checks it, takes it in as one step the user can undo, and saves it as the next version with your note. Read the cut right before you change it. When the drop is refused, read the reason, read the cut again and write a new drop. How: "The one rule" and "Steps" in the app's edit recipe.
   - Never write the cut, a version or the cut's history yourself, and never delete a file of the cut. Undo is the user's, on the Edit page.
   - A render is of a saved version. When the cut holds edits the user has not saved, ask the user to save on the Edit page; never save them for the user.
   - Anything the timeline cannot say (a crop, a frozen region, a cleaned voice) is a new file beside the original, and the clip then plays the new file ("What the timeline cannot say" in the app's edit recipe).
   - Mark what is open on the cut with a marker at its place, its text saying what is open (`<G> · <title>: …`).
   - The user's own changes: read them in the version notes and the words of the History tab under the timeline before you change anything, and say what changed in film times. Never undo or rebuild them.
8. **GATE:** the user's cut is theirs. Never change what the user did by hand: each change of yours is a step of its own on top of theirs. Place a redo, and choose how it ripples, only on the user's word; until then the take stays on the Takes view. Before any render, say back every change you made: what moved, by how many frames, at which film times.
9. **GATE:** a version approved by name. Ask for the yes on a card that asks, naming the version (`cut v<n>`), and wait for the user's yes on it ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]). The user watches it on the Edit page, or its 480p when they asked for one. Once it is approved, the same timeline moves to 1080p in the app ([[Flow v3.2 - 10 Finish and 1080p]]). No 1080p before that approval, and none after it without the user's say-so for that spend. The sound and music are finished in [[Flow v3.2 - 11 Sound and music]]. The subtitles are made at 1080p, as lines on the cut's subtitle track, and burnt into the master ([[Flow v3.2 - 12 Release]]). After the 1080p finalize has run on the finished cut, a change is made on the timeline, and only a take new to the cut is finalized, on its own quote and go ([[Flow v3.2 - 10 Finish and 1080p]], step 13).

## Checks
- Own sound: every clip carries its own sound. The music laid on the edit and the title card's boom are the standing exceptions; the music's hand-set fades are where the user put them. Any other sound is a named fix with its reason, its own clip on the effects track. A generated sound effect for such a fix needs no quote and no go: make it, log it in `spend.md`, then say what you made.
- The title card, where the script names one: the boom starts on the card's first frame, the cut in and out is hard, and the card's text reads as the script writes it.
- A card at every jump in time or place the script names, its text as the script writes it, the boom on its first frame.
- Every drop taken: its answer says taken and names the version. A refused drop's reasons are fixed in a new drop.
- Tails: every generated clip ends at or after its last word plus 0.45 s, or at its picture end (reported). Every join keeps about 0.1 s after the outgoing last word. No cut inside a word. No word heard twice across a join: transcribe both sides and listen.
- No jump cut inside one take: a cut inside a generation falls only on one of its own hard cuts, as `cuts.py` finds them (scene score above 0.18).
- Frame-exact: frames counted from a straight decode, never by `-ss` seeking. Look at the two frames either side of every cut; one wrong frame is visible.
- The seam at every join between two generations in the same place with no time passing: the outgoing last second beside the incoming first second. Every character in both looks to be in the same place and posture across the cut ([[Flow v3.2 - 7 Takes]], the seam). A broken seam goes on the fix list ahead of most other faults.
- Frame counts after a ripple or a replace: read the cut before and after. Every clip after the change moved by exactly the frames you stated and nothing else moved. No gap where none is meant, no overlap, the planned length.
- `check_cut.py <cut>.mp4 --sheet <dir>`: no shot under 3 frames (a flash frame at an edit), no edge lines, the length expected, a black ending staying black. A rebuild that should match a version: `--ref` gives the audio md5 and the lowest picture correlation.
- Frame-number filters only inside one take's file. On a joined film use time-based filters, because ffmpeg can restart its frame counter partway. The other ffmpeg gotchas: [[Flow v3.2 - 10 Finish and 1080p]].
- Listen to every tightened cut and every join. Read the transcript wherever a word sounds off.
- Every changed spot by eye and ear before the report: on the Edit page, or in the version's 480p, or in an ffmpeg rebuild of the same frames and sound. Say in the report what you checked.

## Outputs
- The film's cut in the app: one version per change shown, each with its note, every step in the cut's history; the user's changes untouched. The app writes the versions (`cut/v<n>.json`).
- The title card, where the script names one: `$FILM/edits/title/title-card.png` and its clips `title-card-<W>x<H>.mp4` at 480p and 1080p, the boom under each.
- Renders of a version at 480p (`cut/renders/v<n>-proxy.mp4`), made only when the user asks. The approved version goes on to [[Flow v3.2 - 10 Finish and 1080p]].
- The edit record: every version and step, kept by the app, and every render; a card per version on the Edit page.
- A full cut in the film's delivery folder (`assets/final-cuts/<YYYY-MM-DD> <Title>/`) only when the user asks.

## Tools
`.venv/bin/python` (numpy, PIL) runs every script here, from the studio folder (your working directory). What each script needs: `tools/REQUIREMENTS.md`. `$FILM` is the full path to the film folder, `assets/films/<film>` under the studio folder. A script marked unproven has never run on a video-driven film: check its output before the user sees anything built from it.

| Script | Command | Does |
|---|---|---|
| The app's edit recipe | `recipes/edit.md` in the app's folder (its full path is in your instructions) | How the cut is kept and changed: the drop and its answer, the 480p request, a title card, a spliced word, a swapped take, the timeline from the script lock, the film in shots, files made beside the original. |
| `tools/edit/title_card.py` | `.venv/bin/python tools/edit/title_card.py --out "$FILM/edits/title/title-card" --title "<PLACE, YEAR>" [--sub "<subtitle line>" …] --seconds 3 --size 480x854 --size 1080x1920 --sound assets/library/sfx/title-boom.wav [--size-title 92] [--size-sub 64]` | The house title card: the title in Optima capitals, tracked wide, warm off-white on black, each `--sub` a line in Optima Italic under it. Writes the still `<out>.png` (1440x2560) and, with `--seconds`, one clip `<out>-<W>x<H>.mp4` per `--size`, 24 fps, the `--sound` laid from the first frame and padded with silence (silent stereo without it). The still is 9:16 only. |
| `tools/edit/cuts.py` | `.venv/bin/python tools/edit/cuts.py <clip.mp4> [<clip.mp4> …] [--json]` | The cut detector: each clip's length, frame count and cuts (seconds, and the frame number of each new shot's first frame), at an ffmpeg scene score above 0.18. |
| `tools/stt/transcribe.py` | `.venv/bin/python tools/stt/transcribe.py $FILM $FILM/generations/<G>/takes/take<N> [--lines $FILM/generations/<G>/<G>-shots.json]` | A take's transcript into its folder (`stt.json`, `transcript.txt`) from Whisper on the Mac, free, as [[Flow v3.2 - 7 Takes]] step 12 and `tools/stt/README.md` say. A cached `stt.json` is reused; `--lines` reports each expected line found once, in order, or not. Untested in this copy. |
| `tools/finish/check_cut.py` | `.venv/bin/python tools/finish/check_cut.py <cut>.mp4 [--ref <approved>.mp4] [--sheet <dir>]` | The build check: frames, shots under 3 frames, edge lines, closing black; `--ref` the audio md5 and the lowest picture correlation; `--sheet` a strip of frames around every cut. Unproven. |
| `tools/edit/freeze_region.py` | `.venv/bin/python tools/edit/freeze_region.py IN.mp4 OUT.mp4 SRC_FRAME START END CX CY RX RY` | Freezes an ellipse from one good frame of the same take from frame START (END -1 holds to the end), enabled by frame number. Writes `OUT-check.jpg` to look at first. Unproven. |
