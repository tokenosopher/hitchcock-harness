<!-- Read by: no script; written at release, before the first post, as film-records/<Film>.md at the studio root. Only what is in the final video, last versions only; listed = in use, nothing deleted without the user's yes on that exact name.
     Described in: Flow v3.2 - 12 Release (the film record). -->
# <Film>

<One line: what the film is (after <source>, if any), the ratio, the length.>

Folder shorthand used below (relative to the studio folder):
- FILM = `assets/films/<film-slug>`
- KIT = `assets/final-cuts/<YYYY-MM-DD> <Film>/Social kit`

- **Final video**: length <s> s (<m:ss>) for every file (ffprobe)
  - `KIT/<Film> - FINAL captioned.mp4` (<W×H>, the final; it or its smaller encode went out to every platform)
  - `KIT/<Film> - FINAL clean (no captions).mp4` (the final's copy without subtitles)
  - `KIT/<Film> - FINAL captioned 480p.mp4` (phone copy)
  - Subtitles: `KIT/<slug>.srt`. The final in the film folder: `FILM/cut/renders/v<n>-master.mp4` (`final` in `FILM/social/release.json`).
  - Picture lock: <the cut version on the Edit page the final is a master of (cut v<n>), the date>. The 1080p: <Seedance finalize of which takes | Higgsfield upscale>; <the mix>.
  - **Published <YYYY-MM-DD>**: <platform (account) link>; the rest in `published-links.md` at the studio root.

## Voices

<Where the voices in the final come from: for a video-driven film, Seedance's own audio from each character's video element; any word fixed with a clone or a recording laid in, by line.>

| Character | Higgsfield voice name | voice_id (voice_type) | How it was made | Speech model/settings | Where it's used | Recordings on disk |
|---|---|---|---|---|---|---|
| <CID> <Name> | <Film> – <Name>, or the preset's name | `<voice id>` (<preset or element>) | <preset, from the face (seed_audio) or a variant of a preset (qwen_audio_tts); round and option; saved from its sample> | <elevenlabs_v4, settings> | <the element line; the generations it speaks in> | `FILM/cast/<CID>-<name>/voice/`, `FILM/voices/` |

## Characters and references (the official/final ones)

| Character/ID | Final reference image path(s) | Higgsfield id | Short description |
|---|---|---|---|
| <CID> <Name> (<role, age>) | `FILM/cast/<CID>-<name>/pick.png` (sheet); `FILM/elements/<CID>/takes/take<N>/E-<CID>-take<N>-1080p.mp4` (video element) | element `<id>` (<CODE>-<CID>-<Name>-v<n>); video element jobs: draft `<job id>`, 1080p `<job id>` | <the look in a line> |
| <CID>, <CID> <the extras> | `FILM/cast/<CID>-<CID>-<name>/pick.png` (group picture) | element `<id>` | <…> |

Locations:

| ID | Final reference path | Higgsfield media id | Description |
|---|---|---|---|
| <LID> <view> | `FILM/locations/<LID>-<name>/<file>.png` | <media id> | <what it shows; the shots it is behind> |

Props:

| ID | Final reference path | Higgsfield media id | Description |
|---|---|---|---|
| <PID> <name> | `FILM/props/<PID>-<name>/<file>.png` | <media id> | <…> |

## Notes

- **Final generations**: <the takes and pick-ups in the cut, each with its prompt version>.
- **Edit**: <the cut version on the Edit page>. Social copy: the Release pages (`FILM/social/release.json`). Spend: `FILM/spend.md` and the Higgsfield account's transactions.
- **Unresolved**: <anything not checked, marked (unverified)>.
