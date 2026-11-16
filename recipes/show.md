# Show · the recipe

Alma reads this file whenever she puts something in front of the user, or needs the user to choose, say yes or give a go. It says how the harness finds what she made and how an answer comes back. It holds no film rule: what a round is, how big it is, what gets checked before it is shown and when something counts as approved are in the stage notes, and they win wherever this file seems to differ.

## What the harness shows by itself

The pages are built from the film folder, a moment after a file is written. Nothing has to be registered. Two things are read:

1. **The film's folders.** Each page lists what its folders hold, newest first.
2. **`review/cards.json`**, the film's record of every card you show the user. Every card in it shows in the harness under "Shown to you", on the page it belongs to, a moment after you write the file. Nothing else has to be run or built for a card to show.

The harness lists what it cannot read in the file among the film's warnings: a file that is not JSON (then no card shows), a card type it does not know (`card`, `asset`, `group`, `video`, `videos`, `audio`, `images`, `script`, `lines`, `shotlist`; another is shown as a plain card), an `"at"` that is not a place, an asking card without an id of its own, two asking cards with one id. Write the file whole and valid every time, and look at the page after a change that matters.

## Where files go so the pages find them

Use the folders `new_film.py` made and the stage notes name. These are the ones where a wrong folder hides the work:

| Work | Folder (inside the film folder) | Where it shows |
|---|---|---|
| Research notes | `refs/research/*.md`, the first heading is the title | Story |
| Recorded lines and their takes | `audio/lines/`, `audio/takes/`, `voices/lines/` | Sound |
| Re-voiced or cloned words and names | `voices/names/`, `voices/clone*`, `voices/fix*`, `voices/word*` | Sound |
| Table reads | `audio/table-reads/`, `audio/table-read*` | Sound |
| Music takes, plans, seeds | `audio/score/`, `audio/music/` | Sound, and the Music line on Finish |
| Sound effects | `audio/sfx/` | Sound |
| Stems | `audio/stems/`, `audio/clean-voices/`, `cut/stems.nosync/` | Sound |
| A mix or a loudness pass kept as a sound file | `audio/master/` | Sound |
| The film's finished sound | the master the app renders from the cut's tracks (`cut/renders/v<n>-master.mp4`, the edit recipe), not a sound folder | Finish and the Edit page's Renders tab. The Sound step (`page:sound`, reached from Edit's list on the board) is done once the user's yes on a master card at `sound` is recorded (its title names the master and the version), or a final is named in `social/release.json`; on older films also a finished film named `final` or a mix in `audio/master/` |
| Raw recordings | `audio/raw/` | Sound, as their own group |
| Any other sound | its own folder under `audio/` | Sound, under the folder's name |
| Cut versions | `cut/v<n>.json` (written by the harness only, from a save or your drop: the edit recipe) and their renders | Edit |
| Other renders of the cut, made outside the app's renders | `cut/*.mp4` | Edit, "Cuts on disk" |
| A title card, a graphic, any piece made for the cut that is not a take | `cut/cards/`, or `edits/<name>/` | Edit, "Title cards and made pieces" |
| 1080p files | `cut/*1080*`, `video/1080/` | Finish |
| Caption files | `subtitles/*.srt`, `social/*.srt` | Finish |
| The finished film | the master the user names as the final on the Release page; the harness records it and its companions in `social/release.json` (`final`, the release recipe) | Release. Older films: a file in `cut/` or `social/` with `final` or `as-posted` in its name, under "Finished films" |
| The release: the final, the facts, each platform's texts and sending | `social/release.json` (the release recipe) | Release and each platform's page |
| Where the film was posted | the film's section in the note the release stage keeps (`studio/published-links.md`), a row per platform | Release, "Posted" |

When the same sound exists as `.wav` and `.mp3` side by side, the page plays the `.mp3`; keep both.

Only files show. A result that is a link (a music take that lives on the maker's site) has to be downloaded into its folder first; until it is, a card about it needs an `options` list (below) for the user to pick from.

## Naming a page in the chat

When you tell the user that something is on a page, make the page's name a link, so one click takes them there in the same window. Write it as a Markdown link whose target starts with `page:`:

| Where | Write |
|---|---|
| The board | `[the board](page:main)` |
| Story | `[the Story page](page:story)` |
| Locations and views | `[the Locations page](page:locations)` |
| Shots, Previz and storyboards | `[the Previz step](page:previz)`, `[Shots](page:shots)` |
| The picks waiting for the user | `[Your picks](page:picks)` |
| All characters, one character | `[the Character page](page:character)`, `[C02 Tobias](page:character/C02)` |
| Voices, video elements | `[Voices](page:voices)`, `[Elements](page:elements)` |
| All scenes, one scene | `[the Scenes page](page:scenes)`, `[S3](page:scenes/S3)` |
| The go for the video | `[the Go page](page:go)` |
| Edit, Finish, Sound, Release | `[the Edit page](page:edit)`, `page:finish`, `page:sound`, `page:release` |
| One platform's page on Release (its id in social/release.json) | `[TikTok](page:release/tiktok)`, `[YouTube Shorts](page:release/youtube-shorts)` |

A clip made on a scene that is not one of its takes (a test take, a trial) shows on that scene's page in the open, under the takes, as "Test takes": give its card `"at": "scenes"` and `"for": "<the scene>"`, keep its file outside `generations/`, and link it as `[the test takes](page:scenes/S2#tests)`. A web address written out in full is a link too and opens in a new tab.

Link the most exact page: a scene's own page for a take, a character's own page for a face. One link per thing named is enough. A plain "the Story page" is linked by the harness anyway; a card's title is not, so name the page the card is on and link that. A link to a web address opens in a new tab; never link a file path.

## What the Scenes page reads about a take

The Scenes page shows every scene on one page: its best take, where the scene stands, and why, in one sentence. It reads that from the take's own `findings.md` (in `generations/<G>/takes/take<N>/`), so no card is needed for it.

- **Best: say it on one line.** A line `Verdict: redo — <what to do, as an instruction>`, `Verdict: usable — <with what trim or as which parts>` or `Verdict: good — <what holds>` anywhere in `findings.md` is read as written. Write the sentence as what happens next ("Redo the second half; keep shot 1"), short enough to read at a glance.
- **Without that line** the page reads the first sentences after "Take N, … credits.": "This take needs a redo: …" is a redo, "Usable …" is usable, a note that opens on "What holds:" is good. A redo whose sentence says a part can be kept shows as a partial redo.
- A take with only a clip and no `findings.md` shows as "Landed, not checked yet"; a take with `blocked.txt` or `failed.txt` and no clip shows as blocked or failed.

## A card the user talks about instead of answering

When the user writes to you about a card that asks (its chip rides along with their message) and does not press one of its buttons, the harness puts the card "In progress": it leaves "Waiting for you", its options are greyed and locked, and it says that none of them was used. The user sees that the question is being worked on. What is yours:

- **When the work on it ends, close the card or ask again, the same turn.** Settled in the chat: set its `"answer"` (`true`, or `{"note": "settled in the chat: <what was decided>", "at": "<now, ISO>"}`), so it leaves the page. Still a question, perhaps a changed one: rewrite the card with a new `"updated"`, and it comes back to "Waiting for you" with its buttons live.
- **You can say it yourself.** `"progress": "one line of what is being done"` on a card that asks puts it in progress with that line; take the key off when you ask again.
- **Never leave a card waiting whose question is no longer open.** A card overtaken by events, answered in words, or replaced by a newer card gets its `"answer"` with a note saying which. "Waiting for you" must hold only what really waits for the user.

## A card that says where it belongs

Older cards are placed by their section and title words, which is a guess. A card you write now says it. Add these to any card; all are optional:

- `"at"`: the page it belongs to. One of `story`, `loc`, `views`, `previz`, `faces`, `clothing`, `sheet`, `voices`, `elements`, `scenes`, `edit`, `finish`, `sound`, `release`. Any other word is reported as a warning and the card falls back to the guess.
- `"for"`: the ID, or the list of IDs, it is about (`"C01"`, `["S2", "S3"]`, `"FIX-S3-laugh"`). The card then also shows on that character, location or scene. A pick-up that covers two scenes lists both.
- `"updated"`: when you wrote or last changed the card, ISO (`"2026-11-11T14:05:00Z"`). The pages list cards newest first by it; a card without one sinks to the end.

## A card that asks

When you need the user to choose among options, say yes to what is shown, or give a go for a paid job, write one card that asks. The harness then shows it at the top of its page with buttons, lights its step on the board as "waits for you", and counts it at the gate.

```json
{
  "type": "videos", "id": "ASK-S3-laugh-take", "title": "S3 laugh: which take",
  "at": "scenes", "for": "S3", "updated": "2026-11-11T14:05:00Z",
  "ask": "pick", "prediction": "take2",
  "items": [
    {"id": "take1", "label": "Take 1", "file": "generations/FIX-S3-laugh/takes/take1/FIX-S3-laugh-take1-480p.mp4"},
    {"id": "take2", "label": "Take 2", "file": "generations/FIX-S3-laugh/takes/take2/FIX-S3-laugh-take2-480p.mp4"}
  ]
}
```

- `"ask"` is `"pick"` (one of several), `"yes"` (approve what the card shows) or `"go"` (a paid job; put the quote in `"cost"`, as you would say it: `"cost": "12 credits at 480p draft"`). Nothing else asks: the harness reads no question out of a card's words.
- **A `yes` or a `go` is for one named thing.** Its `"for"` names the exact asset, take or version it covers (`"C01"`, `"S4"`, `"FIX-S3-laugh"`), and its title says the version (`"C01 sheet v2: approve"`), because the button press counts as the user's yes naming that thing. One go covers what its card quotes and nothing more; where a stage note asks for a go per job, write a card per job.
- **The card needs an `"id"` of its own**, and it cannot be an `asset` card (an asset card's id is the asset's). Use any other card type (`card`, `video`, `videos`, `images`, `audio`). A `card` with one file per block works too: each block's `file` is an option. Two asking cards never share an id.
- **The options of a pick are the card's own files**, in order: the card's `items` (or each block's `file`). Give each one an `"id"` (it is what comes back, and what goes into `taste.md`). Add an `"options"` list, `{id, label}` each or plain strings, only when the choices are not files (two wordings of a line, two release times).
- `"who"`: for a card about a character, who they are in a sentence or two (the part, where they speak, the look in the brief). The harness shows it at the top of the card. Without it the harness shows that character's line from the `## Cast` list of `brief.md`, so write `who` only when the brief's line is not the right words for this choice. On a card that is not a face round the harness also shows the character's picked face by itself (from `"for"`), so a voice is picked looking at the face it belongs to: no extra picture card is needed.
- `"prediction"`: the option you expect the user to take, as `taste.md` asks, written before the pick.
- **A new round is a new card with a new id**, at the top. Close the old round's card with `"answer": "replaced by <the new card's id>"` so it stops asking; never rewrite it into the new round and never delete it.
- A card with no `"ask"` is history: it shows, and nothing waits on it.

## When the answer comes back

The user answers with a button in the harness, or in the thread in words. Either way it reaches you as a message.

A button press arrives as:

```
<harness-action kind="answer" ask="pick" card="ASK-S3-laugh-take" option="take2" prediction="take2"/>
```

followed by one line that names the card, the option and what the harness already wrote. This is the user's own answer, naming the card. Then:

1. Set `"answer"` on that card in `review/cards.json`: `{"option": "take2", "at": "<now, ISO>"}` for a pick, `true` for a yes or a go. The card stops asking the moment the harness records the press, and your `answer` makes it permanent in the film's own record.
2. For a pick, the harness has already added the row to `taste.md` (the options, your prediction, the pick). Fill in what is yours: the row's "What it says" cell and the running score.
3. Do the work the answer starts. A go covers the quote on that card and nothing else.
4. Commit, as after any change that matters.

A `<harness-action kind="pick" …/>` message is the same thing from an asset's own page (a face, clothing, a sheet, a voice, a location, a prop or a take picked there); the line after it says what the harness wrote. Continue the flow from there.

Most answers come together. A press on a card only sets the choice aside; when the user is done choosing they press "Done picking" at the foot of the page, and everything they chose arrives as one message:

```
<harness-action kind="answers" count="3"/> The user is done choosing and sent 3 choices with one button, in Hitchcock Harness. …

Answers to cards that ask:
- card="ASK-C02-voice-r1" ask="pick" option="2" prediction="2" · “C02 Tobias: which voice (round 1)” · Option 2
- card="ASK-L01-master-v1" ask="yes" · “L01 the shore, master v1: approve”

Picks made on an asset's own page:
- <harness-action kind="pick" what="face" target="C03" round="r1-faces" candidate="scirpalus-r1-14"/> The user picked … for C03's face on the Character page.
  The harness already wrote: …
  Yours: …
```

Each item is one answer or one pick, exactly as its own message would be: an answer line names the card by its id, a pick keeps its whole text. The harness has written what it writes for each (the `taste.md` row of every pick, a picked asset's files). Do your steps for every item in one turn, then continue the flow once. A go in the list covers the quote on its own card and nothing more. The user can still send one answer by itself; that arrives as before.

When the user answers in words instead, do all of it yourself: the `answer` on the card, the whole `taste.md` row, the work.

## Before you say "it is up"

- The checks the stage note gives before something counts as presented are done (looked at by you, the checks run). This file adds to them and replaces none.
- The card is in `review/cards.json` with its `at` and its `updated`, and the page shows it with no warning about the file.
- Every file the card names exists under the film folder, with a path relative to it. A `/Volumes/…` path or a path outside the film folder does not show.
- Say in the thread what is up and where ("three takes of the laugh, on S3"), with the card's ID if it asks.
