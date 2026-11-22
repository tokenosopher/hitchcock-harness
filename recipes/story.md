# Story · the recipe

Alma reads this file when a film starts in the harness and whenever the user works on the story. In the harness a film is first a short story the user can read and edit, and only then a script: the user needs to see the story before committing to it. This file says where that story lives and how the user and Alma both work on it. It holds no rule about what makes a good story or a good script: those are in the stage 1 note ("The script") and its method notes, and they win wherever this file seems to differ.

## What the story is

Prose with the dialogue inside it, the way the user would tell it to a friend: paragraphs that say what happens, with the spoken words in quotes where they are spoken.

It is not a script. No scene headings, no IDs, no generations, no timings, no shot or camera words, no speaker names set out as `**NAME:** "line"`. Those come when the script is written from it.

## Where it lives

`story/v<n>.md` in the film folder, one file per version: `story/v1.md`, `story/v2.md`, and so on. The Story page shows the newest and lets the user edit it in place.

- Plain text, paragraphs separated by a blank line. No heading and no front matter; the file is the story and nothing else. Notes about a version go in the thread, not in the file.
- **Never write over a version.** Every change, yours or the user's, is the next number. Read the folder right before you write, because the user may have saved a version since you last looked.
- The harness keeps two small files there and they are its own: `story/by.json` (which versions the user saved by hand) and `story/settled.json` (which version the user settled). Do not write either.

## The first version

When a film starts with the New film form, the first message carries the idea in the user's words.

- If the idea already reads as a story, `story/v1.md` is that text word for word. Fix nothing in it, not even spelling; the user edits their own words.
- If it is a seed (a premise, a few lines, a source to adapt), write `story/v1.md` as a first telling of it in that prose form, as short as the film (under three minutes when spoken and acted). Do the research the stage 1 note asks for first where the story needs it.
- Say in the thread, in one line, which of the two you did, and that the story is on the Story page to read and edit.

Setup (the brief, the delivery folder, the Higgsfield project) goes on as the stage 1 note says; the story does not wait for it.

## Working on it with the user

- The user edits on the page and saves: a new `story/v<n>.md` appears, marked theirs. You are not told each time. Before you answer anything about the story, read the newest version.
- When the user asks you for a change, write the next version with that change and leave every other sentence exactly as it was. The user's wording is theirs: never polish it. Then say in one or two lines what you changed.
- A message may carry a piece of the story the user selected on the page (a chip whose reference is the selected text). That piece is what the question or the change is about.
- When the user asks for options (two ways to end it, another opening), give them in the thread, short, with your pick. Write a version only once the user chooses.
- Flag in the thread, without changing them, the lines the stage 1 note says the video filter refuses, and anything that will not fit under three minutes. The user decides.

## When the story is settled

The user presses "Story settled" on the page, which reaches you as `<harness-action kind="story-settled" version="v<n>"/>`, or says so in words. Then:

1. Start `script.md` as the stage 1 note says. Its `## Story` section is that settled version, word for word, dated, with the line "settled in the harness as story/v<n>.md".
2. Write the script from it: pass 1, the audit, the cut into generations, the timings, the flagged lines. All of that is the stage 1 note's, unchanged.
3. Send the first numbered draft. The script lock is still the user's, and still the go for the first round of assets.

If the user changes the story after the script exists, the story gets its next version and the script gets its next draft from it; say which lines of the script moved.

## When the user edits the script on the page

Before the lock the user can change the words of a spoken line or of a direction in place on the Story page, and save. The rules for the script, its timing and its lock are the stage 1 note's (`Flow v3.3 - 1 Setup and story`, steps 20 to 29); this is only what the harness does and what reaches you.

What the harness writes, in `script.md`, as one save (all the changes of that sitting):

- the words, in place: only inside a line's quotes or after a direction's `` `[N s]` ``. Never the count or the order of the rows, who speaks, a line's delivery note or a direction's seconds; a new line, a cut or a new speaker is asked of you in the thread.
- the next version: a new note in front of the old one, `*v<n>, draft. <date>: the user's edit on the Story page, word for word: <where>: "<new>" (was "<old>"); … <the old note, whole>*`. The words are the user's: never polish them.
- the version it replaces, word for word, under `## Earlier drafts` as `### v<n-1> (<date>, as sent)`, newest first, as you keep yours.

Then it tells you, as `<harness-action kind="script-edited" version="v<n>" from="v<n-1>"/>`, with every change as where, the new words and the old ones. Yours, in that version (this is not a new version: do not write v<n+1> for it):

1. Re-time the changed generations and the whole film, as the stage 1 note says (the table under each generation, the whole-film table, the sentence under it).
2. Check the changed lines against the video filter and the cast rules, as the stage 1 note says, and flag what trips them.
3. Where the audit or a note quotes the old words, put the new ones.
4. Say in the thread, short, what you re-timed, and whether the script now differs from the settled story. If it does, say which lines; the user decides. Do not write a story version for it.

**The lock, pressed on the page.** "Lock v<n>" on the Story page reaches you at once as `<harness-action kind="script-lock" version="v<n>"/>`. That press is the user's yes naming the version, in the words "Lock script v<n>.": treat it exactly as those words typed in the thread. The harness writes nothing for it. Yours, as the stage 1 note says: check the version is ready (re-timed after any edit of the user's), record the lock in the version note with those words and the date, and start what the lock starts; if something stops the lock, say what in the thread. The harness refuses the press when that version is not the newest or is locked already.

The harness refuses a save on a locked script, and one that starts from a text you changed since: the user sees your version and chooses. A save never writes over your words. The lock stays the user's yes, through you, as before; re-time before you lock.

A film that already has a script and no `story/` folder (every film made before 11 Nov 2026) is left as it is: do not make a story folder for it unless the user asks.
