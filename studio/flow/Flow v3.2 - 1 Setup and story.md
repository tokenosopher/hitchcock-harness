---
tags: [ai-filmmaking, film-flow, film-flow-v3-2]
version: 3.2
status: live
---
# 1 · Setup and story

**Purpose.** This stage produces the film's folder with its delivery folder and logs, the research the film draws on, a short story the user has settled, and a script written from it that the user has locked, under three minutes of film, cut into generations, with an ID for every character, location and prop it names, saved in `finished-scripts/` once locked.

## Inputs
- The session start, done: [[Film Flow v3.2]] (Before any work).
- The user's idea, seed story or script, in the thread or as a file.
- Any reference film the user shares: the exact file or link.
- The finished scripts of earlier films, `finished-scripts/` at the studio root (one note per film, the words as released): read every one before writing, for shape, length, pace and how a line reads aloud. A new studio has none yet.
- Standing rules: [[Flow v3.2 - 0 Standing rules]]

## Steps

### The film folder
1. Work in the studio folder. Every film's working files live in `assets/films/<film>/`; finished films go to `assets/final-cuts/`; the library of picks across films is `assets/library/`. Always use these `assets/...` paths.
   - If the studio sits in a folder macOS protects (Desktop, Documents, Downloads, an external drive), the first command there can raise an "allow access" prompt that only the user can see: [[Flow v3.2 - 0 Standing rules]] (Access prompts on the Mac).
2. Set up the shell the same way for every command of the film:
   ```bash
   cd <the studio folder>                    # the folder that holds flow/, tools/ and assets/
   STUDIO=$PWD
   export FILM=$STUDIO/assets/films/<film>   # absolute: the shell's cwd resets between commands
   export PYTHONDONTWRITEBYTECODE=1
   PY=$STUDIO/.venv/bin/python; T=$STUDIO/tools
   ```
   - `<film>` is the folder name: lower case with hyphens, made from the title (`the-quiet-room`). `$FILM` is the full path to the film folder; use it in every command of the film.
   - Python is the studio's `.venv/bin/python` (with Pillow and numpy). ffmpeg and ffprobe are on PATH.
   - Draw labels with PIL; do not count on ffmpeg's `drawtext`, which many builds lack.
   - Take every rule from this flow. A memory note is a pointer; where one says otherwise, this flow holds.
3. Make the film folder and its files with one command.
   - **GATE:** Ask the user for the film's public title only, and name the folder and the short code you will make from the title. The title goes into `brief.md`, names the delivery folder and the Higgsfield project, and the release slug is made from it ([[Flow v3.2 - 12 Release]]). Wait for the title.
   - Never ask about the setup defaults; take them as they are unless the user said otherwise at the start: 9:16; voices from Higgsfield (preset voices, voices made from the face, variants of a preset); video elements 1920x1080, 5 s; 1080p by Seedance 2.5 finalize; a budget of 2,000 credits.
   - Run `$PY $T/film/new_film.py $FILM --title "<Public Title>" --code <ABC> --ratio 9:16|16:9 [--budget-credits N] [--date YYYY-MM-DD]`.
     - `--code`: 2 to 6 capitals or digits, the prefix of the film's element and upload names.
     - `--ratio`: 9:16, or 16:9 only when the user said so.
     - `--budget-credits`: 2000, or the budget the user set. Always pass it.
     - `--date`: the day the film starts, when that is not today; it dates the delivery folder.
   - It never overwrites a file, makes no delivery folder, calls no service, adds the folder to `films.txt` (the list of films the app shows, at the studio root) and prints the next commands. It makes every top-level folder and file below, the empty `story/` and `refs/research/` included, except `script.md` (step 20), `refs/README.md` and `refs/characters/SOURCES.md` (steps 14 to 16) and `video/` (the finish stage). The folders inside them come with the stages that fill them:
   ```
   <film>/
     brief.md               title, code, aspect ratio, budget, delivery folder; then premise, decisions, cast, locations, props, look
     story/                 v1.md, v2.md…: the short story, one file per version
     script.md              the settled story, the script, the timing, the audit
     spend.md               the header; one line per paid job
     regeneration-log.md    every miss in a landed take and what fixes it
     higgsfield.json        the Higgsfield project, workspace and folder ids
     elements.json          the image elements and element clips: ids, media ids, job ids, source files
     refs/                  README.md, characters/ (with SOURCES.md), analysis/, research/
     cast/<CID>-<name>/     face rounds, the pick, the sheet
     elements/<CID>/        takes/take<N>/: the element clips
     voices/, audio/
     locations/<LID>-<name>/  masters, plans, views
     props/<PID>-<name>/
     previz/                film.json, rooms/, scenes/ (one scene script per generation), <G>/ and FIX-<what>/ (the grey previz, storyboard pages)
     generations/           upload-registry.json
       <G>/                 the scene file, the shots file, every prompt version, the media lists, takes/
       <G>/takes/take<N>/   one folder per take: the clip, its job id, its transcript, its checks, its 1080p finalize
       FIX-<what>/          a pick-up (for example FIX-door-S4), laid out like a generation
     cut/, social/, subtitles/
     video/1080/            the upscale route's segments and upscaled cut, used only when the user asks (the finish stage)
     review/                the cards the app shows (the show recipe)
   ```
   - Put scratch in `*.nosync` folders inside the film folder: the tools' own (`cut/segs.nosync/`) and `$FILM/scratch.nosync/` for everything else, never `/tmp` ([[Flow v3.2 - 0 Standing rules#Keeping things]]).
   - Check free space on the Mac before any render: a finished film takes 10 to 15 GB, a 1080p cut about 150 MB plus about 160 MB of intermediates. `disk_report.py` reports; `--prune` lists what could go, and considers only older versioned renders (`v<N>-*` video files in `cut/renders/`, and in `cut/` itself; the newest of each kind is kept) and the scratch folders `cut/*.nosync`, never takes, elements, cut files or deliveries. Delete only when the user asks, with `--keep` naming the approved cut.
4. Give every character, location, prop, generation and shot an ID that never changes.
   - Characters C01, C02…; locations L01…; props P01…; spoken lines V01, V02… (never L, which is for locations); generations S1, S2…; shots inside a generation 1, 2, 5A, 5B…; pick-ups FIX-<what>.
   - One character in two forms keeps its number with a letter (C03a, C03b). Element clips are `E-C01`. Takes are numbered per generation (S1 take 3). Cut versions are numbered.
   - Never reuse an ID: a cut shot leaves a gap. The user refers to things by ID and version ("C01 v4b").
   - The ID table opens `script.md` (step 20).
5. Fill `brief.md` below the lines `new_film.py` wrote, following `templates/brief.md`: the premise, the cast list, the locations, the props, the look, and every decision for this film, one line each, the setup defaults of step 3 among them.
   - The Cast, Locations and Props entries grow in [[Flow v3.2 - 2 Characters]], [[Flow v3.2 - 3 Voices and video elements]] and [[Flow v3.2 - 4 Locations and props]].

### The pages
6. The film shows in Hitchcock Harness, the user's app, straight from its folder. The user sees every asset and every take there. Every asset and every take has its card, written as the app's show recipe says (`../recipes/show.md`). A question to the user is a card that asks, and the user answers on it ([[Flow v3.2 - 0 Standing rules#Showing the work and judging]]).
7. Keep the cards in order.
   - Every card says the page it belongs to, the IDs it is about and when it was written. The pages list the newest first.
   - Candidates sit side by side on one card, each with its ID. The card types are in the show recipe.
   - A prompt goes on a card in a drawer (a `pre` block) that holds the text verbatim. Long text never sits open on a card.
   - Never delete a card for a version the user has seen. Mark it ("not used", "replaced by v5").
   - The card's text answers the user's notes in the user's own words, one paragraph per note, and says what you checked.
8. Present, then say where it is.
   - Something counts as **presented** only when every file its card names exists under the film folder, by a path relative to it, the file plays or opens on its page, and, if it is delivered, its copy in `assets/final-cuts/` compares identical. For a landed clip `land.py` puts the file and the card in place; look at it on its page yourself.
   - Say in the thread what is up, one line per new card: what it is, what changed, what you checked, and on which page, the page's name as a link (the show recipe). Files cannot be attached in these sessions: the app's pages are the channel.
   - Something counts as **approved** only when the user's answer names its ID or version, on its card or in words, after seeing it on its page. Generate no video before the user has approved, by ID, every asset it uses.
9. Land everything that lands (a take, a pick-up, an element clip, a 1080p pass) with `tools/film/land.py`, as [[Flow v3.2 - 7 Takes]] describes: it puts the clip in its take folder under a unique name and its card at the top of the cards file the app reads. A clip has landed when its file is in the film folder and plays in the Hitchcock Harness. Nothing lands any other way.

### Delivery folder, project and logs
10. Make the delivery folder named in `brief.md`: `assets/final-cuts/<YYYY-MM-DD> <Public Title>`, dated the day the film starts. `new_film.py` wrote the name but makes no delivery folder, so this step is yours. Make the folder and test it:
    ```bash
    mkdir -p "$STUDIO/assets/final-cuts/<YYYY-MM-DD> <Public Title>"
    $PY $T/deliver.py --film $FILM --check
    ```
    - Pass: `deliver.py --check` prints the folder's path and `answers`.
    - The delivery folder holds final cuts only: every full film, every 1080p cut, the `Social kit` ([[Flow v3.2 - 12 Release]]) and anything the user asks for there. No working-file subfolders. Everything else stays in the film folder and shows in the app.
    - Deliver with `deliver.py` only: it compares every copy byte for byte.
    - Put a 480p copy next to every 1080p film. For the final, that copy is the final's 480p phone companion, which the app makes when the user names the final (the app's release recipe); for any other 1080p film, `deliver.py --480p` makes it.
    - Name files for a person (`<Film> 1080p v<N> (<what changed>).mp4`), put batches in subfolders, and always give the full path: folder, subfolder, file. Replace FINAL files in place under the same names.
    - Check `assets/final-cuts/` before calling anything unused.
11. Make the film's Higgsfield project once (`create_project`, named `<CODE> <Public Title>`) and its folders (`create_folder`): one each for the cast (the key `cast`), locations and prompts, and one per generation (S1, S2…, and each FIX-<what>). Write the project id, the workspace id and every folder id into `higgsfield.json` (`templates/higgsfield.json`). Pass the right `folder_id` with every job, so every job of the film lands in its project.
12. Keep `spend.md` and `elements.json`; `new_film.py` started both.
    - `spend.md` (`templates/spend.md`) has one header: `| date | stage | service | job id | units | rate | cost | version or take | purpose | the user's go |`. Add one line per paid job the moment you submit it; a blocked job goes in at 0. Prices: [[Flow v3.2 - 13 Services and costs]].
    - `elements.json` (`templates/elements.json`) holds elements only: every image element and element clip with its Higgsfield id, its media id, its job id and the file it came from. The project and folder ids live in `higgsfield.json`.
13. Make no git commits and run no snapshot. Every version of a file stays in the film folder under its own name ([[Flow v3.2 - 0 Standing rules]]); if the user keeps the studio in git, they commit when they want.

### Research and references
14. Research before the cast. Research spends no image or video credits.
    - Tag every research claim with where it comes from: the creator's own words, OFFICIAL vendor docs, PRACTITIONER with results shown, community, or your inference from measurement, with the source and date.
    - A research agent writes its findings to a file in the film folder as it goes, not only in its last message: `refs/research/<question>.md`, one file per question, its first heading the title. Parallel agents each get a separate question and keep the creator's statements apart from guesses.
15. Study the reference film, when the user shares one.
    - Work from the exact file the user shared, not the creator's work in general.
    - Measure, never describe from memory. Find the cuts with `$PY $T/edit/cuts.py REF.mp4 --json > $FILM/refs/analysis/cuts.json` (threshold 0.18) and look at the frames on both sides of every cut it reports. Count every shot (who, size, what is behind them, where they look) and total the screen time per type: the room is its backdrops.
    - Write each gaze and blocking convention as a sentence a prompt can carry ("in the doorway conversation each speaker looks straight into the lens").
    - Measure the cut rhythm from the cut times and the word times: take the words by Whisper on the Mac, `$PY $T/stt/transcribe.py --audio REF.mp4 --words-out $FILM/refs/analysis/words.json` (`tools/stt/README.md`); then at every cut measure the gap from the last word before it to the first word after it. Write the gaps to `refs/analysis/rhythm.json`.
    - Borrow the format (cast shape, room, device, shot grammar), never the lines or the plot, and make the film's characters visibly different.
    - Write down what you took, what is the film's own, and the credit line in `refs/README.md`. Compare both scripts before calling the film a sequel or an answer. Verify the creator's handle in each platform's own search before it goes into a post; several handles can circulate for one creator.
    - Compare look numbers only when one script measured both sides. The reference's grade is not a target; ask the user if it matters. Captions: [[Flow v3.2 - 12 Release]]. Music: [[Flow v3.2 - 11 Sound and music]].
16. Look up the real thing behind everything real the story names, before any image of it.
    - A real product, mascot or brand character: its official design.
    - A historical story: the ancient or period evidence for the cast, the places and the props (portraits, museum objects, the texts, the site), before any face round or location design. Write the cast, location and prop briefs from it ([[Flow v3.2 - 2 Characters]], [[Flow v3.2 - 4 Locations and props]]). Do this only when the cast is historical.
    - Write the findings to `refs/research/` (step 14). Save every image in `refs/characters/` with the source URL and date in `refs/characters/SOURCES.md`. Open every file, because a download can come back empty. Make a contact sheet and pass it as an image reference ([[Flow v3.2 - 2 Characters]]).
    - Put the story's own details on top and check each one survives. Never invent the look from prose.
17. Make every living real person an archetype with a trait name ("the Careful One"). Never name a living person in a line, a prompt, a caption or a post, and never use their photos as references. Put the archetype names in front of the user with the premise on a card that asks for a yes, and wait for the user's yes.
    - A real person who is no longer living is named and portrayed. For one who died before 1900, do not ask. For one who lived in the 1900s or later, ask the user first, on a card that asks for a yes, before naming or portraying them.
    - Research a named figure from portraits and sources of their own time (step 16); they go in as a type, never as a likeness to copy.
18. Use practitioner breakdowns to close gaps in the flow.
    - Map a practitioner's rules to the gaps they close in the flow, with the timestamp or page, cheapest first.
    - A YouTube breakdown: work from its timestamped transcript, and cite each rule by its timestamp.
    - A Higgsfield blog: take the full text from the page's embedded data, with any "Recreate" payloads (model, settings, full prompt). Strip invite and tracking codes from saved URLs.
    - Where a source and the flow differ, the flow holds: no batches (standing rules), no per-second timings ([[Flow v3.2 - 6 Scene prompts]]). The sources the flow follows are in the table below.

| Source | Where to find it | What the flow takes |
|---|---|---|
| Video, "Forget Everything You Know About AI Filmmaking. Here's the New Playbook" | Higgsfield's video channel; search the title | the playbook; video references for people |
| Blog, "How to Make a Cinematic AI Short Film", with every prompt | Higgsfield's blog; search the title | the prompt format |
| Higgsfield Animation's "Passport Rush" breakdown | Higgsfield's blog; search the title | the asset-first plan; previz first |
| Blog, "This Blender + Higgsfield AI Workflow Changes How You Make AI Video" | Higgsfield's blog; search the title | the Blender greybox previz ([[Flow v3.2 - 5 Previz and storyboards]]) |
| Video, "5-Step Workflow - How to Make Viral AI Short Dramas" | search the title | the three-quarter view of every interior ([[Flow v3.2 - 4 Locations and props]]) |

The flow already carries what it takes from each; read a source only to close a new gap.

### The story
19. Make the film a short story first, and write no script before the user settles it.
    - The story is prose with the dialogue inside it, the way the user would tell it to a friend: paragraphs that say what happens, the spoken words in quotes where they are spoken. It is not a script: no scene headings, IDs, generations, timings, shot or camera words, and no `**NAME:** "line"` rows.
    - It lives in `story/v<n>.md` in the film folder, one file per version: plain paragraphs, no heading, no front matter, no notes. Never write over a version: every change, yours or the user's, is the next number. Read the folder right before you write, because the user may have saved a version since.
    - The first version: when the user's idea already reads as a story, `story/v1.md` is that text word for word, spelling included. When it is a seed (a premise, a few lines, a source to adapt), write a first telling of it, as short as the film, after the research of steps 14 to 17 where the story needs it. Say in one line which of the two you did.
    - The story does not wait for the setup steps, nor they for it.
    - Before answering anything about the story, read its newest version. A change the user asks for is the next version with that change only, every other sentence left exactly as it was; never polish the user's wording. Say in one or two lines what changed.
    - Options (two endings, another opening) go in the thread, short, with your pick; write a version only once the user chooses.
    - Flag, without changing them, the lines the video filter refuses (step 25) and anything that will not fit under three minutes. The user decides.
    - The story is settled when the user settles it by version ("Story settled" on the Story page, or in words). A change to the story after the script exists makes the next story version and the next script draft from it; say which lines of the script moved.
    - A film that already has a script and no `story/` folder keeps its script; make a story folder for it only when the user asks.

### The script
20. Start `script.md` from `templates/script.md`: the ID table, then `## Story` with the settled story version word for word, dated, naming its file (`story/v<n>.md`). Below it go `## Script` (the generations, with a header line for every version: its number, its date, what changed), a timing table per generation, the whole-film timing, the flagged lines, and `## Audit`.
    - Keep the template's generation headings (`### S<n> · <name> · <LID> <location>`) and line rows (`**NAME:** "line"`), because `tools/release/make_script_json.py` reads them for the captions ([[Flow v3.2 - 12 Release]]).
    - In the ID table's last column, the film's own entries, separate the entries in one cell with a semicolon (`C01 Maren; C02 Tobias`), and write a character as `C01 Name, role` at most.
    - Mark a line heard over the picture and spoken by no one in the shot (a narrator) `*(over the picture)*` after the speaker's name (`**NARRATOR** *(over the picture)*: "line"`), so the timeline does not expect it in the previz or the take.
    - The user often dictates, so names arrive misheard. Map them to the cast and say once which names you used.
21. Read the finished scripts folder first (Inputs). Then write pass 1 from the settled story: the dialogue and what happens, with no stage directions except the user's own. The film is under three minutes; plan the script to land there.
    - When the film opens on a title card, the script names it before the first generation: the place and year, and its subtitle line. It is the default opening for a period film. The card itself: [[Flow v3.2 - 9 Edit]].
    - Where the story jumps in time or place, the script names a card there too: the place and the time passed, in the same house style. The edit puts it in. Every card in the film carries the opening card's boom.
    - The premise is one sentence a stranger gets: who, what they try, the stake. Keep the twist out. Every claim in it is something the film shows.
    - The first line carries the stakes or a surprise within a second or two: never exposition, an establishing image or someone reading.
    - Write for the ear: short spoken sentences, contractions, one idea each.
    - Every answer has its question spoken first, every outcome its announcement, and each line goes to the character the audience is looking at.
    - A turning point is a scene, never a reported stage direction.
    - An adaptation keeps the source's essence and famous lines, simplifies the language, and opens on the source's own words.
    - Long speeches are allowed. The scene-prompt stage carries a long speech over several shots, because a long line in one held shot drops a sentence per take ([[Flow v3.2 - 6 Scene prompts]]).
    - When an agent or a prompt drafts the script, give it the intent and the hard limits (length, cast, generations, filter) and leave the creative choices to it.
22. Audit the story with the prompt engine ([[Flow v3.2 - 6a Prompt engine]]): the story goal, every scene a causal link toward it, at least one reversal per sequence, and the value shift each reversal makes in the audience. Write the table under `## Audit` in `script.md` (sequence, obstacle, tactic, reversal, value shift) and name the weakest point. The table goes into the file, not only into the thread, and the script keeps the template's `**NAME:** "line"` rows, whatever layout the prompt engine's note shows.
23. Cut the script into generations S1, S2…: each is one Seedance job of 4 to 30 seconds, in whole seconds, with a few shots inside, and later gets one prompt and one shots file.
    - Separate generations meet only at hard cuts. Split a scene into two generations only past 30 s or where its shots are in different places.
    - Each generation names what each character wants in it.
    - Name every character, location and prop the asset stages must build, and give each its ID.
24. Time every generation from its words, never by guess, and write the table under the generation.
    - Count the spoken words at about 2.9 a second, add 0.5 s between lines, then add the written pauses and the action.
    - Lines follow each other at about 0.5 s word to word (0.35 s for the same speaker). A longer silence exists only where the script writes it: "(beat)", "A beat.", a leading "…", or an action between lines. Tails in the edit: [[Flow v3.2 - 9 Edit]].
    - Write a pause before a line between the lines, never as a breath or sigh at the start of the line. A sigh is an action, with the spoken line left plain. A cut-off line ends on a dash.
    - When a line does not fit, make the delivery faster before making the shot longer. Lengthen the shot only when speeding up would hurt the delivery.
    - Fix every line word for word, or the model rewrites it.
25. Read every draft for swear words and for self-directed despair or self-harm: the video filter refuses both. Settle each flagged line with the user before the lock: reword it now, or keep it and accept the risk. A gesture written as an action can carry the dark word while the spoken line stays mild.
    - Check the cast in every draft too: a child only in scenes that are fully safe for work; a young person in a scene with violence, restraint or danger is written as an adult in their twenties ([[Flow v3.2 - 0 Standing rules#Moderation]]).
26. Send one full numbered draft at a time, with notes: what changed, the length, the easy cuts, the flagged lines, one question.
    - Put the user's line edits in verbatim; never polish the user's wording.
    - Show a rewrite the user asks for in the thread first, with at most one alternative. Write it into `script.md` only after the user picks.
    - Answer a question about one choice with a short numbered list and your pick.
    - Save every draft into `script.md` as it goes out, the earlier ones under `## Earlier drafts`.
27. Write pass 2 only when the user says "add the stage directions": what happens between the lines, what the frame shows, the camera only where it carries something. Write it into the script before any shot is planned, so the whole storyline is in view from the start. Shots and the Nexus shape come later: [[Flow v3.2 - 6 Scene prompts]].
28. **GATE:** Put the final numbered draft in front of the user, with its length per generation, the whole-film length (it must be under three minutes) and every flagged line settled. Wait until the user locks it on a yes card that names the version, or in words naming it. Record the lock in the script's header line.
    - At the lock, save the finished script to `finished-scripts/<Public Title>.md` at the studio root (make the folder if it is not there) from `templates/records/finished-script.md`: premise, setting, characters, the script scene by scene with its stage directions and every line as `**NAME:** "words"`, `released: not yet`.
29. When a line changes after the lock:
    - Write the change with a dated reason in the header; the header keeps each old wording.
    - Update every live copy: the generation's scene file (`generations/<G>/<G>-scene.md`) and prompt, the captions script (`social/script.json`), every card that quotes the line, and the finished script in `finished-scripts/` (the new words in the script, the old ones under `## Changes at the lock and after`). Leave earlier rounds' files alone.
    - A new take for a changed line needs its own go from the user.
    - When the filter refuses a line at the video stage, first check and reword the prompt as the standing rules say, a risky word inside the line included, and tell the user what you changed ([[Flow v3.2 - 0 Standing rules#Moderation]]). The script and the subtitles then show the word that was spoken in the take that is in the film. Only if it is still refused, offer about five replacements that keep the line's job and rhythm, ask whether the line after it should go too, and wait for the user's pick on a card that asks.

## Checks
- `$FILM` resolves under `assets/films/` in the studio folder.
- `new_film.py` lists the folders and files under `made:`, and nothing under `kept as they were` for a new film. `brief.md` holds the user's title, the code, the ratio (9:16 unless the user said otherwise) and the budget (2000 unless the user set another); `films.txt` lists the folder.
- `deliver.py --check` prints the delivery folder's path and `answers`.
- Every file a new card names exists under the film folder and plays or opens on its page in the app; every delivered copy compares identical.
- `higgsfield.json` holds the project id, the workspace id and a folder id for the cast (`cast`), locations, prompts and every generation. `elements.json` holds elements only.
- Reference film: you looked at the frames on both sides of every cut `cuts.py` reported; every look number you compare comes from one script run on both sides.
- Real characters: every file in `refs/characters/` opens and is not empty, and each has its source URL and date in `SOURCES.md`. A historical film has its research in `refs/research/` before the first face round or location design, each file opening with its title as the first heading.
- Story: every version is its own file in `story/`, none written over; `## Story` in `script.md` is the settled version word for word.
- Script: the premise is one sentence; the first line carries the stakes or a surprise; every generation runs 4 to 30 whole seconds by word count; generations split only at hard cuts or past 30 s; no line starts with a breath or a sigh; every silence longer than 0.5 s is written; no living person is named (one no longer living is; one from the 1900s or later only on the user's yes); a title card the film opens on is named, and a card at every jump in time or place; every flagged line has a settled answer; the audit table is complete with its weakest point named.
- After a changed line: search the film folder's live files for the old wording (`grep -rn "<old words>" "$FILM" --include=*.md --include=*.json --include=*.srt`). Pass: only the script header and earlier rounds' files hold it.

## Outputs
- `$FILM` (`assets/films/<film>/`), listed in `films.txt`, with `brief.md` (the public title, code, ratio, budget and delivery folder, then the premise, decisions, cast, locations, props and look), `script.md` (the ID table, `## Story`, `## Script` with its version header and a timing table per generation, `## Audit`, `## Earlier drafts`), `spend.md` with its header, `regeneration-log.md`, `higgsfield.json`, `elements.json` and `generations/upload-registry.json`.
- A card for everything shown, on its page in the app.
- The delivery folder `assets/final-cuts/<YYYY-MM-DD> <Public Title>/`, tested.
- The film's Higgsfield project with its folders, their ids in `higgsfield.json`.
- `refs/README.md` (what is borrowed, what is the film's own, the credit line), `refs/analysis/` (cuts, words, rhythm), `refs/characters/` with `SOURCES.md`, and a findings file per research question in `refs/research/`.
- `story/v1.md`, `story/v2.md`…: the short story, every version, the settled one named in `script.md`.
- The locked script: generations S1…Sn with their timing tables, and the IDs of every character (C0N), location (L0N) and prop (P0N) it names, for [[Flow v3.2 - 2 Characters]], [[Flow v3.2 - 3 Voices and video elements]] and [[Flow v3.2 - 4 Locations and props]].
- `finished-scripts/<Public Title>.md` at the studio root, from the lock on.

## Tools
All paths under the studio folder; `$PY`, `$T`, `$STUDIO` and `$FILM` as in step 2.

| Script | Command | Does |
|---|---|---|
| `tools/film/new_film.py` | `$PY $T/film/new_film.py $FILM --title "<Public Title>" --code <ABC> --ratio 9:16\|16:9 [--budget-credits N] [--date YYYY-MM-DD]` | the folder tree, `brief.md` (title, code, ratio, budget, delivery folder), the `spend.md` header, the cards file the app reads, `higgsfield.json`, `elements.json`, `generations/upload-registry.json`, `regeneration-log.md`; adds the folder to `films.txt`; never overwrites |
| `tools/film/land.py` | `$PY $T/film/land.py $FILM --kind take\|element\|pickup\|pass --id <G\|CID\|FIX-name> --take N (--file <mp4> \| --url-file <file>) --job <job id> --title "…" --section "…"` | lands a clip in its take folder under a unique name and puts its card at the top, where the app shows it; the routine is in [[Flow v3.2 - 7 Takes]] |
| `tools/deliver.py` | `$PY $T/deliver.py --film $FILM SRC "Name.mp4" [SRC "Name" …] [--sub "Social kit"] [--480p]` | copies into the film's delivery folder in `assets/final-cuts/` and compares byte for byte; `--check` tests the folder |
| `tools/disk_report.py` | `$PY $T/disk_report.py --film $FILM [--prune]` | free space and where it went; `--prune` lists what could go (older `cut/renders/v<N>-*` renders and `cut/*.nosync` only); `--prune --yes --keep <approved cut>` deletes, only on the user's ask |
| `tools/edit/cuts.py` | `$PY $T/edit/cuts.py REF.mp4 --json > $FILM/refs/analysis/cuts.json` | the cut detector at threshold 0.18: length, frame count, and every cut in seconds and frame number |
| `tools/stt/transcribe.py` | `$PY $T/stt/transcribe.py --audio REF.mp4 --words-out $FILM/refs/analysis/words.json` | word-timed transcript of a reference film by Whisper on the Mac, free (`tools/stt/README.md`); untested in this studio: check its words against the film before using its times |
