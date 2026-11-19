<!-- Read by: no script; every generations/<G>/<G>-scene.md and social/script.json take their lines from it, word for word.
     Described in: Flow v3.2 - 1 Setup and story (step 4 for the IDs, step 19 for the story, steps 20-29 for the script, the timing and the lock); the audit with Flow v3.2 - 6a Prompt engine. -->
# <Film>: script

## IDs (an ID never changes and is never reused; a cut shot leaves a gap)

| what | ID | example |
|---|---|---|
| character | C01, C02…; one character in two forms keeps its number with a letter | C03a, C03b |
| location | L01, L02… | L02 |
| prop | P01, P02… | P03 |
| generation (one Seedance job, 4 to 30 whole seconds), folder `generations/<G>/` | S1, S2… | S4 |
| shot inside a generation | 1, 2, 5A, 5B… | S4 shot 5B |
| pick-up, folder `generations/FIX-<what>/` | FIX-<what> | FIX-door-S4 |
| video element clip | E-<CID> | E-C01 |
| take | numbered per generation | S4 take 3 |
| cut version | numbered | edit 7 |
| spoken line (captions) | V01, V02… in film order (never L, which is for locations) | V07 |

The user cites by ID and version ("C01 v4b").

In the film's own script the table's last column holds the film's entries, separated in one cell by a semicolon (`C01 <Name>; C02 <Name>`), a character written `C01 <Name>, <role>` at most.

## Story (the settled story, story/v<n>.md, <YYYY-MM-DD>, word for word)

<The settled version of story/ exactly as it is in its file, misheard names and all. Say once, below it, which cast names the misheard ones map to.>

## Script

*v<N>, <draft | LOCKED by the user on <YYYY-MM-DD>>. <YYYY-MM-DD>: <what changed in this version, the old wording kept>. Generations of up to 30 s, one Seedance generation each. Dialogue in quotes is word for word. `[N s]` is action time. Working names: <Name> (<who>), <Name> (<who>). Structural notes in `## Audit`.*

### <G> · <generation name> · <LID> <location>
`[2 s]` <ACTION: what the frame shows, present tense, one idea a sentence; the first line carries the stakes or a surprise.>
**<NAME>:** "<line, word for word>"
**<NAME>** *(<to whom, or an action; never a breath or a sigh before the line>)*: "<line>"
`[1 s]` <action between the lines; a silence longer than 0.5 s exists only where it is written: "(beat)", "A beat.", a leading "…">
**<NAME>** *(off)*: "<line; a cut-off line ends on a dash, like this—>"
**<NAME>** *(over the picture)*: "<a line heard over the picture and spoken by no one in the shot, a narrator's; the timeline does not expect it in the previz or the take>"

| generation | lines | words | action s | ≈ s | ends at |
|---|---|---|---|---|---|
| <G> | <n> | <n> | <n> | <words ÷ 2.9 + 0.5 × (lines − 1) + pauses + action> | <m:ss> |

### Timing (whole film)

| generation | lines | words | action s | ≈ s | ends at |
|---|---|---|---|---|---|
| <G> | <n> | <n> | <n> | <s> | <m:ss> |

Spoken at about 2.9 words a second, 0.5 s word to word between lines (0.35 s for the same speaker), pauses and action as written: **<m:ss>** for <n> words in <n> lines.

**Flagged lines** (swear words, self-directed despair or self-harm trip the video filter): <line> → <the user's answer: reworded to "…" | kept, risk accepted>.

## Audit (prompt engine)

**Story goal (<NAME>):** <what they want across the whole film>.

| Sequence | Obstacle (what is at risk, scale) | Tactic → what its failure returns | Reversal | Value shift (the audience's verdict) |
|---|---|---|---|---|
| <G>–<G> <name> | <…> | <tactic> → <what its failure returns> | <…> | <character: before → after> |

**Weakest point.** <The sequence most likely to drag or fail, and the first fix to try.>

## Earlier drafts

### v<N-1> (<YYYY-MM-DD>, as sent)
<the draft as it went out>
