---
tags: [ai-filmmaking, film-flow, film-flow-v3-3]
version: 3.3
status: live
---
# 12 · Release

**Purpose.** Turn the approved 1080p cut into the release: subtitles that land on the words, laid as lines on the cut's subtitle track and burnt into the master the app renders; the final the user names on the Release page; the FINAL files in the film's `Social kit` in its delivery folder, named from the public title; the copy for every platform on its own Release page, the cover frames and each platform's posting time; the film's records at the studio root; and, last, the debrief, where Alma asks why the user changed what she proposed and the answers become lessons.

## Inputs
- The cut on the Edit page, as this stage finds it: approved at 480p ([[Flow v3.3 - 9 Edit]]), moved to 1080p on the same timeline ([[Flow v3.3 - 10 Finish and 1080p]]), with its music and effects on its own tracks ([[Flow v3.3 - 11 Sound and music]]). Here the subtitles go on its subtitle track, and the master the app renders from it carries them.
- The final: the master the user names on the Release page. The harness records it in `social/release.json` (`final`) with its companions: the copy without subtitles, the `.srt` of the lines and the smaller file for posting, made when the final is named; and the 480p phone preview, made only when the user presses "Make it" on the Release page (one already on disk is used). The harness makes them; you never write `final` (the app's release recipe, `recipes/release.md` in the app's folder; its full path is in your instructions).
- The app's edit recipe, `recipes/edit.md` in the app's folder ("Subtitle lines", "Renders with options"), for how lines go on the subtitle track and which renders the Edit page asks for.
- The public title, in `$FILM/brief.md` (`- Title:`), asked for at setup ([[Flow v3.3 - 1 Setup and story]]). The slug and every release file name come from it.
- `$FILM/script.md`, current: its `## Script` holds every line as the final cut speaks it, under a `### S<n>` heading per generation, one `**NAME:** "words"` row per line, names spelt as the script spells them. `audio/lines.json` instead when the film has a line table.
- The film's delivery folder `assets/final-cuts/<YYYY-MM-DD> <Title>/` under the studio folder, named in `brief.md` ([[Flow v3.3 - 1 Setup and story]]).
- The Higgsfield account's transactions, net of refunds, the film's spend log for anything else, and the price per credit the user confirms from their own plan (`show_plans_and_credits`; [[Flow v3.3 - 13 Services and costs]]), for the cost line.
- Templates: `templates/social/script.json`, `templates/records/film-record.md`, `templates/records/voices-row.md`.
- Standing rules: [[Flow v3.3 - 0 Standing rules]]

## Steps

### Captions and the FINAL files

1. Subtitles are lines on the cut's subtitle track. They are made at 1080p, on the cut's 1080p timeline, when the user says "Create subtitles". They are edited there and burnt into the master. No improvised SRT, no other cue rules, no sidecar-only delivery.
2. Set the paths and the slug:
    ```bash
    STUDIO=<the studio folder's full path: your working directory>
    export FILM="$STUDIO/assets/films/<film>"
    S="$STUDIO/tools/release"
    PY="$STUDIO/.venv/bin/python"   # it has numpy and PIL
    cd "$FILM"
    ```
    - Start every shell call with these lines: the variables and the folder do not carry over from one call to the next.
    - The slug is the public title in `brief.md`, lower case, punctuation dropped, words joined by hyphens (`The Last Door` becomes `the-last-door`). Every release file you make in `social/` is named by it. The final and its companions keep the names the app gives them in `cut/renders/`.
3. Write the caption script `social/script.json` (its shape: `templates/social/script.json`): one entry per spoken line, in film order, `{"shot", "who", "line"}`.
    ```bash
    $PY $S/make_script_json.py --film "$FILM" [--lower WORD,WORD] [--skip S3,S5.2]
    ```
    - Without `audio/lines.json` it reads `script.md`: one entry per `**NAME:** "words"` row under the `### S<n>` headings of `## Script`. `shot` is the generation (`S1`, `S2`…), `who` the name title-cased. With `audio/lines.json` it reads the line table, and `shot` is the line id (`L01`…).
    - The captions carry the script's words. Where the final cut speaks a line differently, correct that line in `script.md` before the run, and tell the user which lines you changed.
    - It takes out stage directions such as "(beat)" and markdown emphasis. It lists words written in capitals for stress; lower them with `--lower`. Acronyms stay in capitals.
    - Leave out a line cut in the edit with `--skip`: a whole generation (`S3`), one line of it (`S5.2`, its second line) or a line id (`V09`).
    - Read the file back: every name spelt as the script spells it, the lines in film order.
4. Make the dialogue stem from the cut's own dialogue tracks, never from the mix:
    - The stem is the dialogue file of a render of the cut version the subtitles are for, with separate files (`stems`): `cut/renders/v<n>-<kind>-<tag>.dialogue.wav`, the cut's dialogue tracks alone, as long as the film (the app's edit recipe, "Renders with options"). The Edit page sends that request, not you: ask the user for it, on a card that asks, from More renders.
    - Make it the stem: `ffmpeg -v error -y -i cut/renders/v<n>-<kind>-<tag>.dialogue.wav -ac 1 -ar 48000 social/dialogue-stem.wav`.
    - Never transcribe the mixed film, and never time captions from the recordings: the music throws the word times off, and the video model re-performs each line and stretches its pauses.
5. Make the SRT from one transcription:
    ```bash
    W=social/<slug>.words.json      # the stem's words with their times, kept as a cache
    $PY "$STUDIO/tools/stt/transcribe.py" --audio social/dialogue-stem.wav --words-out $W
    $PY $S/make_srt.py social/dialogue-stem.wav social/script.json social/<slug>-w30.srt --width 30 --words $W --no-stt
    ```
    - The words come from Whisper, run on the Mac by `transcribe.py` itself, free (the setup in `tools/stt/README.md`). It writes the words cache in the shape `make_srt.py` reads. Untested in this copy: read the first SRT against the film.
    - `<slug>-w30.srt` is the one laid on the subtitle track (step 7), which the master burns in: 30 characters a line for the 46 px gold style. The `.srt` that goes out with the final is the one the app makes from the lines.
    - Each cue carries the script's words with the transcript's timing. Plain text only, because YouTube prints styling tags literally.
    - `make_srt.py` always runs with `--no-stt`: it never transcribes, and it stops on a missing or stale cache and writes nothing. A cache older than the stem is made again. New dialogue means a new stem and a new cache.
6. Read every cue before it goes on the subtitle track. Look for wrong names, a row that breaks before a short function word, and stray directions:
    ```bash
    awk 'BEGIN{RS="";FS="\n"}{t=$2;sub(/ --> .*/,"",t);l=$3;if($4!="")l=l" / "$4;print t"  "l}' social/<slug>-w30.srt
    ```
7. Lay the lines on the subtitle track. Where a word inside a spoken line was replaced after a refusal ([[Flow v3.3 - 0 Standing rules#Moderation]]), the line shows the word that was spoken in the take that is in the film. "Create subtitles" on the Edit page puts a request in your box that names the cut's version and lists the dialogue it knows. Write every cue of `social/<slug>-w30.srt` as one line on `C1 Subtitles`, with the cue's words, its two rows at most and its times on whole frames, in one drop (the app's edit recipe, "Subtitle lines"). When the request says the lines there are to be replaced, replace them.
    - The app draws the lines as cards in the film's caption style, the gold style: Poppins Medium 46 px at 1080 wide, champagne gold, a thin dark outline, the block's bottom edge at 0.79 of the frame height. The 480p and the master burn them in. Never ask about style or position.
    - Put only dialogue on the subtitle track: no headline, no hook sticker, no "AI film" band. A small series card ("Part N of M") is the most text to add.
    - The user moves, trims, splits and retypes lines on the Edit page. Read the version notes before you write lines again, and keep the user's words unless asked.
    - The master with the lines in it is rendered on the user's word ([[Flow v3.3 - 10 Finish and 1080p]]). The user names it the final on the Release page; the app then makes its companions.
8. **The loudness master.** The final that goes out is the loudness master of the version, at -14 LUFS integrated and -1 dBTP true peak, as social apps expect; the plain master itself is never trimmed or changed.
    - When the master that is to go out as the final is rendered, also request the loudness master of the same version, without being asked: the app's render with options, loudness (the app's edit recipe, "Renders with options"). Renders with options are otherwise sent by the Edit page; this one request is the user's standing word for you to send it yourself: `curl -s -X POST "$HARNESS_URL/api/films/<film>/cut/render" -H 'content-type: application/json' -d '{"version": "v<n>", "kind": "master", "options": {"loudness": {"lufs": -14, "truePeak": -1}}}'`. It lands as `cut/renders/v<n>-master-lufs14-tp1.mp4`.
    - Measure it when it lands, integrated loudness and true peak, with ffmpeg's `ebur128` filter (`peak=true`), and measure the plain master the same way. Propose the loudness master as the final on the Release page, with both readings; the user names it there.
    - Any other reading over -1 dBTP: report it to the user; the trim is the user's call, so change nothing.
    - When the master that is to go out as the final is rendered, write the experiments' post-analysis at the same time as the final and the social files are made (step 43).
9. Grab four captioned frames from the final, by frame index, on the busiest backgrounds, and show them on a card at Release (the app's show recipe):
    ```bash
    $PY $S/thumbnails.py --film "$FILM" --master <the final's path> --outdir "$FILM/cut/derived/<slug>-captions" \
        --at "<m:ss.xx>=cap-1" --at "<m:ss.xx>=cap-2" --at "<m:ss.xx>=cap-3" --at "<m:ss.xx>=cap-4"
    ```
    - It takes each frame by index from one straight decode of the file, never by seeking.
    - Keep `--outdir` out of `social/`, because every `social/youtube-thumbnail-*.jpg` goes to the Social kit as a thumbnail.
    - Read each frame at 480 wide, as a phone shows it. A line that reaches TikTok's in-feed overlay (Checks) is shortened or rewrapped on the subtitle track.
10. Deliver to the Social kit once the final's companions are made (the Release page shows their progress). Take the paths from `final` in `social/release.json` (the final and its `phone`, `clean` and `srt` companions). The `phone` copy exists only once the user has made it ("Make it" on the Release page): when it is not there, ask on the card whether to make it, and deliver without it until it is:
    ```bash
    $PY "$STUDIO/tools/deliver.py" --film "$FILM" \
      --folder "<YYYY-MM-DD> <Title>" --sub "Social kit" \
      <final path> "<Title> - FINAL captioned.mp4" <phone path> "<Title> - FINAL captioned 480p.mp4" \
      <clean path> "<Title> - FINAL clean (no captions).mp4" <srt path> "<slug>.srt"
    ```
    - `--folder` is the film's delivery folder under `assets/final-cuts/`, named in `brief.md`. `<Title>` is the public title in `brief.md`; the files are named after it.
    - The thumbnails follow with the same script (step 27).
    - The FINAL files are replaced in place under the same names, so there is no old copy to post by mistake. Never delete an older file in the folder: name it to the user and remove one only on the user's yes for that file.
    - Every copy is byte-compared.
11. Tell the user the full path (`assets/final-cuts/`, the folder `<YYYY-MM-DD> <Title>`, then `Social kit`, then `<Title> - FINAL captioned.mp4`). Say what you checked, and that the 480p copy, once made, is for the phone.
12. **GATE:** the user watches the FINAL captioned file, on the Release page or on the phone. Write a card that asks for a yes on `<Title> - FINAL captioned.mp4`, naming the cut version it is a master of, and wait for the user's yes.
13. After a change, redo only what the change touches:
    - A change on the timeline (the sound, the music, a subtitle line, a 1080p picture of a shot): the master is rendered again on the user's word, the user names it the final again, and you deliver (step 10). The SRT stays while the dialogue is unchanged.
    - New dialogue: a new stem, a new transcription, a new SRT, the lines laid again ("Create subtitles again…" on the Edit page), then the master and the final.

### The Release pages

14. Write the copy for every platform on that platform's own Release page in Hitchcock Harness. The Release pages are the one place for the texts: they are drawn from the film's `social/release.json` (its shape, and which parts are yours and which the user's: the app's release recipe). No `social/kit.md` is made.
    - Each platform in the file has its account, its route, its wave (the day and the time it goes out), its fields, the steps after it posts, the steps by hand, and its sending record.
    - Every post goes out by hand in this copy: every platform's `route` is `"hand"`, and `upload.bufferSets` stays empty. The user posts; you write the texts, the steps by hand and the record.
    - Its page shows one box per part the platform has (title, description, caption, first comment, a reply on X), each as it will be posted, the tags in a box of their own, the cover frame on a platform that takes one, the facts to confirm (step 24), and the go.
    - The candidates for each field, two or three with what each one does, live in `social/release.json`. The page shows them under their box as options, each with what it does and its whole text: a tap puts that text in the box, where the user can edit it. A candidate the user edited and saved to its option is marked `edited: true`: it is the user's words from then on, so never rewrite or drop it.
    - When the user names the final and no platform is written yet, the app sends you the ask for the texts at once ("Release texts · cut v<n>"): draft every platform's text then, without waiting to be asked again. The user then posts from the Release page; the last step in What's next stays theirs until every platform is posted.
    - When a line changes, check the other platforms' text for the same claim.
15. Write all copy to these rules:
    - Bring the evidence and two or three candidates (in `social/release.json`). Use the user's wording or the candidate the user picks, and fix only mechanics (handles, typos, a link that does not resolve). A text the user gives goes in word for word, in place of the draft.
    - Keep the twist out of every hook, title and thumbnail. The premise may promise a surprise, never the outcome: no number from the punchline, no frame with the punchline caption on it.
    - Claim only what the film shows. Check every story claim in the copy against the script.
    - Lead with the film or one concrete image, never with the fact that it is AI. Make the hook specific: a proper noun, a number, a line of dialogue, an absurd juxtaposition. No generic logline.
    - Put the tools last, in a flat first-person credits line.
    - Do not argue and do not ask the audience for anything.
    - Native upload; no outbound link in the hook post.
    - State making-of numbers as facts, never as boasts: the hours from the session transcripts' timestamps; the cost from the Higgsfield account's transactions (the `higgsfield` server's `transactions` tool), net of refunds, from the film's first charge, at the price per credit the user confirms from their own plan, and anything paid elsewhere from the spend log. Keep each one a fact to confirm (step 24) until the user confirms it.
    - Check a new @handle in autocomplete before tagging it the first time. A handle that resolved in an earlier post needs no check. Tag each company once, in its credit. Credit the reference film by plain name until its handle is verified.
16. Before every upload, on each platform (the platform's own settings at upload, the steps after it posts, the steps by hand):
    - Upload the smaller encode of the FINAL captioned file natively everywhere. The app makes it when the final is named, with no visible loss. It goes out in place of the final once it has passed its checks. While it is still being made, nothing is posted. If it fails its checks or comes out no smaller, the final goes out. Never post a TikTok download on another platform, because watermarked clips are pushed down.
    - Turn the platform's AI label on at upload: TikTok "AI-generated content", YouTube "Altered or synthetic content", Instagram "AI info". Flagging a post afterwards costs reach.
    - Instagram: "Upload at highest quality".
    - X: a film over 2:20 needs Premium, or a 2:20 cut.
    - Reddit: the first comment goes up straight after the post.
17. **TikTok**, from the user's account for the films (named in `social/release.json`):
    - Open the caption with the premise in one sentence; a teaser ending is fine. Use the film's own line as the opener only when it stands alone.
    - Credit the reference on the next line.
    - Then the account's fixed block of 3 to 5 tags, the same on every film, including `#ai`. Add a genre tag only if it has hits.
    - Parts are "Part N of M" in film order; the strongest clip can still go first.
    - Never open with "POV:", "wait for it", "watch until the end", "cinematic AI short film about…", "follow for more", a numbered synopsis, an unexplained in-world name or a vague one-liner.
18. **Instagram Reels, with Facebook and Threads**, from the user's account for the films:
    - The same first line as TikTok, because only the first line shows before "more". Then a blank line, the credit line and the tag block.
    - "Upload at highest quality" and the "AI info" label on. Share to Facebook and cross-post to Threads.
19. **YouTube Shorts**, from the user's channel for the films, the smaller encode of the FINAL captioned file:
    - Title: a concrete premise of 41 to 70 characters, often in the form "<Title>: <what happens>". Put the premise in the first words, because a phone shows only those. Never "AI", "(Short Film)" or a trailer as the hook.
    - Description: line 1 is the premise line or an in-world line, the user's pick. Then `<Title> · written, directed and edited by me, made alone in N days`, the tools, the inspiration. Never "Tools used:" at the top.
    - Tags, optional for the user: the film's story nouns plus one tool tag. Tags and "Altered or synthetic content" sit under Details, then Show more.
    - A long-form upload gets the final's copy without subtitles plus the final's `.srt`: Video elements, then Add subtitles, then Upload file, then check it in the subtitle editor. For long-form, 5 to 10 minutes is the best band and under a minute the worst.
20. **X**, from the account with followers; the user's other account, if any, reposts:
    - Line 1: the in-world premise with its consequence, longer than five words; a number in it helps.
    - Line 2: the genre and the tools, tagging the tool accounts (`@higgsfield_ai`, and the account of any other tool the credits line names, each checked as step 15 says).
    - Reply 1: the making-of fact and the inspiration credit with its verified handle.
    - The post and reply 1 go out together, as one thread, with the video in the first post. Reply 1 is a text the user picks like any other, and the go covers both.
    - Native video, under 240 characters, no hashtags, no link.
21. **Reddit**, from the user's personal account, because posts from new accounts with no karma get removed:
    - r/aivideo and r/aivideos, every time, as native uploads with a tool flair, with the same title and the same first comment in each. Write the account as "r/aivideo and r/aivideos" and the steps by hand for r/aivideo; the Release page adds the step for r/aivideos and a second link box itself, and counts Reddit as posted only when both links are in (the app's release recipe, "By hand").
    - A title: the premise or a joke; no teaser, no political wording.
    - The first comment, posted at once: "Fully AI-generated, human-written", the tools with the resolution stated honestly, the inspiration, the hardest part, a request for honest feedback.
    - A further subreddit only once the first posts have proved themselves, 6 to 12 hours later, with a different title: r/singularity (a declarative third-person title, no "I made", no links, best posted by someone else), r/ChatGPT (the GPT Image angle, "fully AI-generated, human-written and directed"), r/ClaudeAI only when Claude did the work, with the build story as the body.
    - Stay out of r/davinciresolve, r/artificial, r/scifi, r/Filmmakers, r/videos and r/shortfilms.
    - Reddit often refuses plain fetches of a thread. When it does, ask the user to paste what you need from it.
22. **LinkedIn**, from the user's personal account, posted last, the morning after the others, as a native upload of the smaller encode of the captioned file:
    - The shape is "What I made and what I learned", with one real reaction to mention; or the user's own text, word for word, when the user gives one.
    - Make the first line the hook: LinkedIn shows the first three lines before "see more".
23. Make the thumbnail options:
    ```bash
    $PY $S/thumbnails.py --film "$FILM" --master <the final's copy without subtitles> --at "<m:ss.xx>=<name>" [--at …] \
        [--zoom "<name>:W,X,Y=<new name>"] --srt <the final's .srt>
    ```
    - Three to five options from the final's copy without subtitles, including any frame the user points at and a zoomed crop. Each frame is taken by index from one straight decode, never by seeking. It writes `social/youtube-thumbnail-<name>.jpg` per option and `social/thumbnails-sheet.jpg`, every option at preview size and at feed size. Show the sheet on a card at Release, and give the same frames, with the same ids and times, as the cover frame options of every platform that takes one (the app's release recipe).
    - Always pass `--srt`: it flags a time with a caption on screen. A thumbnail picked in YouTube's frame picker comes from the captioned upload, and a caption can give the punchline away.
    - One image, one idea; faces close and lit; no "AI" on the image.
    - When the user asks for catchy thumbnails, typeset them: one to three words in Poppins Bold, the text under a fifth of the frame, legible at feed size, plus a text-free copy of each for the frame picker.
    - Find a frame the user sends in the master by matching, and give it its own options.
24. Add the things only the user can confirm (the number of days, the music used, the cost line, the tools) as facts in `social/release.json`. The user confirms each value on the Release page; never write a value yourself. A text that uses a fact cannot go out until it is confirmed (the app's release recipe).
25. For a new film, or when the user wants the wording to be whatever works in the niche right now, offer a fresh look at the niche, and run it only on the user's yes:
    - Use your own web search and page reads: the top recent posts for searches such as "ai short film", "ai film", "seedance", "ai comedy sketch" on TikTok, r/aivideo's top posts of the week and month, and the posts of a few small accounts in the niche on X. No paid data service is part of this copy.
    - Score each post against its own account where the page shows the numbers (views over the account's median). Check accounts that posted both kinds before believing a gap, because a gap can be genre.
    - Write the findings to `$FILM/social/research-<YYYY-MM-DD>.md`, with the numbers and the links to the posts behind them. Say plainly where a page could not be read.
26. **GATE:** write the candidates for each platform's fields into `social/release.json`, with the cover frames. The user writes or picks every line, on the platform's Release page or in the chat, platform by platform, and picks the cover frame there. To offer another text, add it as one more candidate of that field: the options are the way to choose. A note under a field is for a reason, a question, or a change that is not a plain candidate (a new text, an unlink), never a button that only sets a candidate (the app's release recipe). Wait for each pick: the text that is posted is only what the user picked or wrote.
    - A text the user gives in the chat (a title, a description, the tags, or which text goes on which platforms) is written straight into those platforms' boxes in `social/release.json`, word for word; say what you wrote. Never put it behind a note with buttons or ask for a confirmation: candidates and notes with buttons are only for texts the user has not given or picked. The go for posting stays its own gate, one platform at a time.
    - Every release choice the user makes (a title, a line, the tags, the thumbnail) gets a row in `taste.md` at the studio root. From the next film on, each release round is shown with a prediction of the user's pick, as every other round is ([[Flow v3.3 - 0 Standing rules]]).
    - One cover frame serves every platform that takes one (YouTube Shorts, TikTok, Instagram Reels). The thumbnail the user picks for one platform is the pick for all of them. Use a different cover on one platform only when the user asks for it.
    - The user may also pick any frame of the final as the cover ("Pick any frame" on a platform's page). The page writes it as the user's own option (`by: "user"`): never change or remove it, never offer it again among yours, and keep it when you rewrite the options. Its time is the cover frame's time when a platform asks for one.
27. Deliver the picked thumbnails into the Social kit:
    ```bash
    $PY "$STUDIO/tools/deliver.py" --film "$FILM" --folder "<YYYY-MM-DD> <Title>" --sub "Social kit" \
      social/youtube-thumbnail-<name>.jpg "YouTube thumbnail - <name>.jpg" [… one pair per picked thumbnail]
    ```
    - First move the options the user did not pick into `social/thumbnail-options/`. Never delete one.

### Posting times

28. Give each platform its account, its place in the posting order and its wave (the day and the time) in `social/release.json`; the Release page shows them:
    - Accounts: ask the user which account posts on each platform the first time, and keep them in `social/release.json`; a later film copies them from the film before (the app's release recipe). Reddit and LinkedIn go out from the user's personal account; X from whichever account has followers.
    - Waves the user can sit with, for example: Reddit, then YouTube Shorts; then TikTok, then Instagram (with Facebook and Threads); X the same evening; LinkedIn the next morning. The past slots are in `published-links.md` at the studio root.
    - Take the posting times from the accounts' own numbers: each platform's insights (YouTube Studio's chart, TikTok's and Instagram's analytics), read by the user or shared with you. Record the times, and the numbers they came from, with the release.
    - Check a date's weekday before quoting it.
29. Plan the friends' seeding:
    - 5 to 10 genuine one-sentence comments from people who watch to the end. Send each platform's link within 10 minutes of posting, spread over the platforms and the first hour.
    - Share the film before launch as a private link the user makes with whatever file sharing they use ("anyone with the link", view only, no sign-in needed), with the 480p copy for weak connections. Not WhatsApp, which compresses the video.
    - Warn the user about what hurts a new account: friends outside the audience, everyone in the same minute or on one Wi-Fi, bought or swapped engagement, quick exits, re-uploads, TikTok downloads posted elsewhere.
30. Plan the presence: replies for 60 to 90 minutes after each wave. One calm reply to a hostile take, saying what the film is actually about, then leave it.
31. A flat post waits 72 hours. New-account TikTok and Shorts can sit flat for two or three days. Never delete and re-upload.
    - After about 72 hours, propose a second post: a clip of about 60 s that reaches the punchline in its first 10 s, with the full film linked in the comments.
    - Cut it from the FINAL captioned file between two caption cues (an untested route).
    - Cut a clip from the same timeline the SRT came from, or its captions drift.
    - **GATE:** show each clip on a card that asks for a go for that clip, at Release, and wait for the user's go.
32. A shot that has a censored cut is posted only in that cut. Never post the uncensored frames, keep the word for what is censored out of TikTok and Instagram captions, and recheck that shot after the 1080p finalize or any upscale, because the 1080p can invent detail there.
33. Read analytics (retention, swipe-away, traffic source) only through the user's own login, read-only.

### The records

34. Before the first post, write the film record `film-records/<Title>.md` at the studio root, from `templates/records/film-record.md`:
    - The final video: the FINAL files' paths and length, the picture lock (the cut version the final is a master of), the 1080p route and the mix; the published links once posted.
    - Every voice heard in the final cut: its Higgsfield voice name and voice id only for a preset or a voice that was saved ([[Flow v3.3 - 3 Voices and video elements]], step 6), otherwise the picked candidate's file, which is the record; how it was made (the preset, the face, or the sample it was made from), the characters and the recordings folder.
    - The official references, last versions only: each character's sheet and video element with their Higgsfield element ids; each location view and prop with its Higgsfield media id.
    - The notes: the takes and pick-ups in the cut, each with its prompt version; the cut version on the Edit page; anything not checked, marked unverified.
    - Only what is in the final video, never the candidates.
    - Then the finished script note `finished-scripts/<Title>.md` at the studio root: every line matches `social/script.json` word for word and in order (fix the note, listing each change under `## Changes at the lock and after`); set `released` to the first post's date and `length` to the FINAL file's length.
35. Add one row per voice heard in the final cut to `film-records/voices.md` at the studio root, from `templates/records/voices-row.md` (voice, voice id, idea, film, character, status). Write a voice id only for a preset or a voice that was saved; for any other, write the picked candidate's file in its place. Listed means in use: nothing in the film records is deleted without the user's yes on that exact name.
36. Keep `published-links.md` at the studio root, the posting record the Release page reads: a section per film, newest film first, a row per platform.
    - The section's heading is `## <Title> (<the first post's date>)`, the public title first, so the page finds it. Under it, one line on the film (its length, what it is after) and the table `| Platform | Account | Title or first line | Link | Posted |`, as the file's own example shows.
    - Open the film's section with "add" rows when posting starts, the same moment as its film record: `add` in the Link cell is a link still to come.
    - Fill each link the moment the user shares it, with tracking parameters (`?feature=share`, `?si=`) stripped, and the posted date and time beside it.
    - A post with no link stays "add" until the user sends it; one posted with the link still to come reads `add (posted by hand)`. Never guess whether a post went up. A platform left out says why in its title cell, starting `not ` ("not posted (left out by the user)"), with the Link cell empty.
37. **GATE:** the user writes or picks every line of copy, and every post goes out only on the user's go, given on that platform's Release page, one platform at a time. The open choices (which line, which thumbnail, the posting times) are the user's.
    - The user posts by hand on each platform. On the go, show the exact text and the file to upload on the go card of the app's release recipe ("By hand"), with the platform's steps by hand in order, and wait for the user to say it is posted.
    - When the user sends the link (on the Release page or in the chat), the record takes it (the app's release recipe), and it goes into `published-links.md` at once.
    - Keep the steps by hand to what the platform needs: the settings of step 16 and the platform's own steps on its Release page. A thing that went through once needs no check each time.
38. After the release, write down what happened (views, what worked, what did not): the rule into this note, its evidence into [[Film Flow v3.3 - record]].

### The debrief
At the end of every film, once it is released, ask the user why they made the changes they made to your proposals, so the next film's first proposals come closer to how the user works.

39. **Read what changed between your proposals and the finished film:**
    - the AI editor's first cut against the user's final cut, change by change, from the cut's history ([[Flow v3.3 - 9 Edit]], step 4);
    - the sound variations the user picked and the ones passed over, with their prompts ([[Flow v3.3 - 11 Sound and music]], step 34);
    - the previz and storyboard corrections;
    - the takes redone, and why;
    - anything the user rewrote in a prompt or a script line.
    Read first the reasons already given during the work (the answers on the why cards and the reasons kept with the History tab's steps, [[Flow v3.3 - 9 Edit]], step 8), and ask nothing they already answer.
40. **Ask only where the reason is not plain.** At most about a dozen questions, in the film's order, grouped by kind (cutting, sound, previz, prompts). Each question names the change and shows it:
    - the change in frames, or the two prompts side by side;
    - a frame, or a play button;
    - a few likely answers to tap, and a box for the user's own words.
    Put them on the app's debrief page for the film: write them to `$FILM/review/debrief.json` as the app's show recipe says ("The debrief page"). It is answerable from the phone, every question skippable; the answers come back in one message and stay in `review/debrief-answers.json`. Say in the thread that it is up.
41. **The answers become lessons and fixes, through the user's word.** Keep each answer in the user's words, with the film and the change it explains.
    - A lesson for the AI editor goes into its lessons in `tools/edit/AI_EDITOR.md` at once, and a lesson for the sound designer into its lessons in `tools/sound/SOUND_DESIGNER.md`: those are taste, not flow rules.
    - A change to the flow itself goes into `flow-fixes.md` at the studio root ([[Flow v3.3 - 0 Standing rules]], The flow's text), and is decided with the user before it is written into a stage note.
42. **What the debrief measures**, film by film, written into the film's record: the number of changes the user made to the AI editor's first cut and the time the edit took; the sounds re-picked ("none of these"); the redos. They go down when the lessons work.

### The experiments' post-analysis
43. **When the master that is to go out as the final is rendered**, alongside making the final and the files for the social platforms, read the film's `$FILM/experiments.md` ([[Flow v3.3 - 8 Redos]], step 17) and its redo history (the `FIX-` generations, their prompt diffs and their rows in `spend.md`). Write a `## Post-analysis` section at the end of `experiments.md`:
    - what each experiment showed;
    - which lessons hold across films, read against the post-analyses of the films before;
    - which of them should become a fix to the flow. Propose each to the user. It goes into `flow-fixes.md` only on the user's word.
    A film with no experiments gets no post-analysis.

## Checks
- **The caption script:** `social/script.json` has every line the final cut speaks, in film order, in the words the cut speaks, names spelt as the script spells them, no stage directions or stress capitals left.
- **Caption timing:** the stem is the cut's dialogue tracks alone (step 4), never the mix. `make_srt.py` reports `script lines not found in the cut: 0`. Each cue has at most two lines and 6.5 s, starts 0.15 s before its first word and ends 0.12 s after its last. Every cue is read (step 6), and every line on the subtitle track has its cue's words, rows and times.
- **Caption widths:** the SRT laid on the subtitle track at 30 characters a line for the 46 px style. The caption block's bottom sits above y 1535 of 1920, and no line passes x 882 below y 805.
- **The burned frame at feed size:** four captioned frames, by frame index, on the busiest backgrounds, read at 480 wide: the caption is legible and clear of the overlay. Each thumbnail reads at 168×94, and none sits on a time with a caption on screen.
- **The true peak:** read the true peak in dBTP, not the sample peak. Over -1 dBTP, report it to the user.
- **The small viewing copy:** once the user has made it, `<Title> - FINAL captioned 480p.mp4` sits beside the big master in `Social kit`, for the phone and for friends on a weak connection.
- **The thumbnails:** before they are delivered, `social/` holds only the picked `youtube-thumbnail-*.jpg`.
- **The copy:** every story claim matches the script; every new handle is checked in autocomplete; no hook, title or thumbnail gives the punchline away; the YouTube title is 41 to 70 characters, the X post under 240 characters with no hashtags; every quoted date has its weekday checked.
- **The posting record:** every post the user made has its row and link in `published-links.md`, in the film's section, under its public title.

## Outputs
- In `$FILM/social/`: `script.json`, `dialogue-stem.wav`, `<slug>.words.json`, `<slug>-w30.srt` (the lines on the subtitle track), `thumbnails-sheet.jpg`, `youtube-thumbnail-<name>.jpg` (the picked options; the others in `thumbnail-options/`), `research-<YYYY-MM-DD>.md` when a look at the niche was made, and `release.json`: each platform's texts, the user's picks, the facts and the sending record.
- In the cut: the subtitle lines on `C1 Subtitles`. In `$FILM/cut/renders/`: the master and its loudness master at -14 LUFS and -1 dBTP (step 8), the one the user named the final with its companions (the copy without subtitles, the `.srt`, the smaller file, and the 480p once the user made it), made by the app.
- In `assets/final-cuts/<YYYY-MM-DD> <Title>/Social kit/`:
    - `<Title> - FINAL captioned.mp4`: the full-size final. Its smaller encode is the file posted everywhere.
    - `<Title> - FINAL captioned 480p.mp4`: the phone and friends copy.
    - `<Title> - FINAL clean (no captions).mp4`: YouTube long-form with the SRT, and the archive.
    - `<slug>.srt`: the final's `.srt`, made by the app from the subtitle lines.
    - `YouTube thumbnail - <name>.jpg`: one per picked option.
- On cards at Release: the four checked frames, the thumbnail sheet, any second-post clip.
- In `$FILM/experiments.md`: the `## Post-analysis` section (step 43), when the film had experiments.
- At the studio root: `film-records/<Title>.md`, the film's rows in `film-records/voices.md`, `finished-scripts/<Title>.md`, and the film's section in `published-links.md`.
- The debrief: the film's debrief page in the app with the user's answers; each lesson added to `tools/edit/AI_EDITOR.md` or `tools/sound/SOUND_DESIGNER.md`; each change to the flow added to `flow-fixes.md`; the debrief's counts in the film's record.

## Tools
Run with `$PY` (`.venv/bin/python` in the studio folder) from `$FILM`, the paths set as in step 2; the release scripts are in `tools/release/` (`$S`). `--film` takes the film folder's full path; relative paths in the film-aware scripts are read from it.

| Script | Command | Does |
|---|---|---|
| `tools/release/make_script_json.py` | `$PY $S/make_script_json.py --film "$FILM" [--script script.md] [--lines audio/lines.json] [--out social/script.json] [--lower WORD,WORD] [--skip S3,S5.2,V09]` | The caption script from `script.md` (shot = `S<n>`) or from a line table (shot = line id), performance marks taken out. `--script` or `--lines`, never both. |
| `tools/stt/transcribe.py` | `$PY "$STUDIO/tools/stt/transcribe.py" --audio social/dialogue-stem.wav --words-out social/<slug>.words.json` | The stem's words with their times, from Whisper on the Mac, free (`tools/stt/README.md`), in the cache shape `make_srt.py` reads. Untested in this copy. |
| `tools/release/make_srt.py` | `$PY $S/make_srt.py STEM.wav SCRIPT.json OUT.srt [--width 30] --words WORDS.json --no-stt` | Aligns the cached words to the script and writes cues with the script's words; default width 38. With `--no-stt` it never transcribes, and stops on a missing or stale cache. |
| `tools/deliver.py` | `$PY "$STUDIO/tools/deliver.py" --film "$FILM" --folder "<YYYY-MM-DD> <Title>" --sub "Social kit" SRC "Name" [SRC "Name" …]` | Copies the final, its companions and the picked thumbnails into `assets/final-cuts/<folder>/Social kit/` under their posting names, each copy byte-compared. |
| `tools/release/thumbnails.py` | `$PY $S/thumbnails.py --film "$FILM" --master <the final, or its copy without subtitles> --at "<m:ss.xx>=<name>" [--at …] [--zoom "<name>:W,X,Y=<new name>"] [--srt <the final's .srt>] [--fps 24] [--outdir social]` | Frames by index from one straight decode, zoomed 9:16 crops, and one sheet at preview and feed size; flags times under a caption. |
| Higgsfield `transactions`, `show_plans_and_credits` | no params | the film's charges for the cost line, net of refunds; the user's plan and its price per credit |
