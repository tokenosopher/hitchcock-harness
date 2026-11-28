# Where a shot stands

Which place of its scene ("Shot 5", "4a") a shot of a take stands for. Asked by the Takes view, the Shots page and Shot details. Decided in one place: `src/components/shots/places.ts` `shotPlaces`, with its parts in `stands.ts`.

## Why one rule
Before this rule, several parts of the app each worked out a shot's place their own way (the server's numbering from a shots file, the layouts' matching, the letters of "7a", the Shots page's mapping, the Takes view's pick-up rows, Shot details' prompt parts), and each had its own fallback that guessed "its own number" when it found nothing. A pick-up often has nothing for any of them to read (no shots file, a prompt with "SHOT (one shot …)" and no number), so it fell to "Shot 1" or to Other, and none of them looked at where the cut actually has the clip. Now the place is decided in one function, with its evidence in a fixed order, and it says "unknown" instead of guessing.

## The rule: one function, evidence in order
`shotPlaces` decides for every shot of every take, in this order. The first piece of evidence that answers wins, and the cut then checks it.
1. **The stands record** `<G>/<G>-stands.json`, if the pick-up has one. It is matched to the shots the take was really cut into (`stands.ts matchShots`):
   - by count;
   - else by time;
   - else one listed shot covers all the pieces.
2. **A list as long as the take's shots**: its shots file, its prompt's SHOT numbers, the scene's list (for the scene's own take), or the previz take's ids.
3. **check.json alignment**: a planned shot cut in two keeps its longest piece, and the other piece is an extra.
4. **A pick-up's shots file of another count, with times in the take**: matched by time (kind 8). A piece that holds two listed shots stands for both.
5. **The "shot N" in a cut clip's label.**
6. **The cut's position** (pick-ups and replans in the film). The clip sits among its scene's placed clips, between the place before it and the place after it, and some places in between are open:
   - A place said by 1–5 stands if it fits there, both ends included. That covers an insert, a split place, and a pick-up that keeps the scene's own shot after it.
   - If it does not fit and the cut leaves places open there, **the cut wins**, and both are said (`conflict`, shown in amber).
   - If nothing said a place, the clip takes the open places. With as many clips as open places, each clip takes one. One clip takes the run of open places whose planned length is nearest its own (a take of FIX-boat-S1 standing for places 5 and 6).
   - A number that is not a place of the scene (a pick-up's shot called "10") stands where the cut leaves exactly one place open, as before.
7. **Another take of the same pick-up**, cut into as many shots, stands where it stands.
8. **Otherwise unknown.** The shot goes under "Other shots" with why. Nothing falls back to the shot's own number.

A pick-up is never a version of its scene. That covers one with a record, and a shots file listing at most half the scene's places. Only a whole-scene replan is a new version, as before.

## The record (written by the film's tool at landing; the harness only reads it)
`generations/<G>/<G>-stands.json`, schema 1:
`{"schema":1,"scene":"S1","by":"land.py","at":"…","shots":[{"stands_for":["5","6"]}],"takes":{"take2":[…]}}`

Each shot has:
- `stands_for`: one id or a list (required);
- `inside`: `{place, from?, to?}`, optional, for part of a place;
- `t0`/`t1`, optional, where the shot lies in the take;
- `note`, optional.

A take that differs from the others gets its own list under `takes`. The reader is `stands.ts readStands`, which is lenient: an unknown schema or a shot without a place counts as no record. The server sends it with `GET …/shotlist` (`shotlist.ts`). `recipes/edit.md` tells Alma how to write it.

## The kinds, as the rule expresses them
| # | Kind | How it is expressed |
|---|---|---|
| 1 | One place (FIX-door-S4) | `stands_for: "1"`. Without a record, the cut alone works: it sits before place 2, with place 1 open. |
| 2 | Several places as one clip (FIX-boat-S1) | `stands_for: ["5","6"]`, or the cut. Listed under 5, named "5–6". |
| 3 | An insert (FIX-tight-S18) | `stands_for: "1", inside: {place:"1", from:4.75}`. Its position after place 1 fits. |
| 4 | A place split later (shot 4 and 4-b) | Nothing to write: both clips are pieces of shot 4. A pick-up of 4 between them fits. |
| 5 | Planned, not in the cut | The record. With no record and no list, the shot is under Other, with why. |
| 6 | A full retake | A normal take: the scene's list fits by count. |
| 7 | Cuts back into another take (FIX-start-S16) | `inside: {place:"1", to:4.5}`. Its position before place 1 fits. |
| 8 | A count that differs (FIX-rope-S10) | Matched by time. With the one-shot file, both pieces go under 2 ("2 · 1/2", "2 · 2/2"), side by side. With `stands_for: ["2","3"]`, one each. The note says "the record says 1 shot, the take was cut into 2". |

A ninth kind is one case in `places.ts`'s evidence order, or one field in the record. It is never a new fallback in another file.

## Who calls it
- **Shots page and Shot details:** both call `shots/useShotPlaces.ts`, which calls `shotPlaces`. Shot details names each shot by its place ("5–6") before its prompt part.
- **Takes view:** `pickupRows.ts pickupView` calls `shotPlaces` and keeps no fallback of its own. Its old "stays in its own column" fallback is removed. `stands` gives the cell its "5–6" label, its note, and the amber colour for a disagreement. A pick-up's shot that the film plays but whose place nothing knows (the sample's FIX-void take 2) sits under "Other shots", and the playhead line stands over that column while the film plays it, not over its own number.

**Not moved yet:**
- The server's first numbering (`server/edit/shots.ts tagsOf`, the same count-fit as step 2) still names the scene's own takes' shots. The whole edit model keys shots by it: `shotKey`, the cut's split, putShot. Pick-ups are renumbered from `shotPlaces`.
- `layouts.ts layoutShotOfTake` answers another question: which shot of a layout's previz a take's shot is. That is for safe swaps, not for columns.

Both are named here as the next things to fold in.

## Films with no record
Steps 2 to 5 run as before, so a pick-up made before the record existed stands where it stood. Two things can change: a pick-up whose shots file is timed but lists another count of shots is now matched by time instead of going under Other, and a take in the cut that stands for two places reads "5–6".

## Disagreement
When the record (or a list) and the cut disagree, the shot is shown where the cut has it. Its cell label is amber, and its note says both: "Its stands record says place 5; in the cut it sits before place 2, so it is shown at 1." When the cut leaves no place open there, the record stands, and the disagreement is still said.

On pages that are already open, the shot lists are fetched again whenever the film's files change: the Shots page now passes the film state's `updatedAt`, as the Edit page already did.
