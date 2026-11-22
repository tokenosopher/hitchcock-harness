# Release · the recipe

Alma reads this file before she first touches a film's release in a session: when the user names the final, when she writes the platforms' texts, when the user asks to post, and when she records a post. It says where the release lives, its exact shape, which parts are hers and which are the user's, and how the pages read it. It holds no film rule: the stage notes say how the texts are written and when to post.

## The file

`<film>/social/release.json`, one per film. The Release page (`page:release`) and one page per platform (`page:release/<id>`, for example `[TikTok](page:release/tiktok)`) are drawn from it, a moment after it is written. The harness checks it after every change (`src/components/release/file.ts`, `validateRelease`); a file that does not check out is shown with its problems and nothing on the pages can change it until it does. A film with only the old `social/kit.md` keeps the old read-only page until this file exists.

The shape (version 1):

- `v`: `1`. `day`: the release day, `"2026-11-14"`: what "today" means for the waves.
- `final`: the master named as the final. `path` (relative to the film folder), `version` (the cut version it is a master of), `namedAt`, `name` (the file name it goes out as, `"<Title> - FINAL captioned.mp4"`), `companions`: `clean` (the copy without subtitles; its `path` is the final's own when the final has no subtitles), `phone` (the 480p preview), `srt` (the subtitle file), `post` (the smaller file of the final, the file that goes out; the final itself when the final is a smaller file already; absent on finals named before 14 Nov), each `{path, options?}`; `before`: the finals named before it. Written by the harness only. A smaller file of a master (`cut/renders/v<n>-master-…-small.mp4`, the render option `small`, recipes/edit.md) is on offer as a final like any other whole master, its title and length row with both sizes ("60 MB, from 101 MB"); named, its copy without subtitles is made smaller too (the same options), and its 480p preview takes the other options. The user names the final on the Release page (or from a master's row in the Renders tab); you never write `final.path`, a smaller final included: when the user wants the smaller file to go out, tell them to name it there.
- `facts`: what only the user can confirm before it appears in any text. `{id, label, many?, sentence, value?, confirmedAt?}`. `label` is how a sentence names it ("the days it took", `many: true` when it takes "are"); `sentence` has one blank, `___` ("Cost about ___ Higgsfield credits"). A text uses a fact as `{id}` ("Made alone in {days} days."); every place shows the one value.
- `platforms`: in posting order. `{id, kind, name, account, route, routeBy?, also?, wave, fields, upload, send}`.
  - `kind`: one of `reddit`, `youtube-shorts`, `tiktok`, `instagram-reels`, `facebook`, `threads`, `x`, `linkedin` (the harness knows each one's hard limits from it). `id`: small letters, digits and dashes; the page's address.
  - `route`: always `"hand"`. Every post is made by hand by the user in this copy: you write the texts and the steps, the user posts, and you record the link. The harness reads any other route, or none, as `"hand"`, and refuses to set another. `routeBy` (`{by: "user" | "alma", at}`) is only in older files; do not write it. `also`: other apps the post goes to (`["Facebook", "Threads"]`).
  - `wave`: `{day: "today" | "tomorrow", about: "19:00"}`.
  - `fields`: `{id, label, part?, tags?, text, own?, pick?, candidates, aim?, sharedWith?, readByAlma?, notes?}`. `part` is the posted piece it goes into (`caption`, `title`, `description`, `tags`, `comment`, `text`, `reply` on X and Threads, by kind; a field without one goes into the platform's first); fields of one part are joined in their order. A part may be one field or several; both are fine. `tags: true` marks a field of tags: it is counted in tags and shown in the page's Tags box. Write it on every tags field, including hashtags that go inside a caption or a description. `text` is the text in use (`""` while nothing is picked; `""` with `own: true` when the user emptied it by writing its box whole, below); `pick` the candidate in use; `own: true` the user's own words. `candidates`: `{id, text, does}` ("does" is a few words: "the premise", "a line from the film"). `aim`: `{min?, max?, words}`, said in your words ("aim under 90, so the feed shows it whole"); outside it is amber and never blocks. `sharedWith`: the other platforms whose field of the same `id` is this very text, written on both sides with the same text. `readByAlma`: `{at, text}`, the text as you last read it: write it with every field whose text you write or read. The page counts a field whose `text` differs from `readByAlma.text` as changed since you read it: it names the box it is in at the top of the text column ("Since Alma last read it: the caption"), puts one chip per platform in "Alma sees" ("Edited: TikTok caption", with the box's whole text before and now, and the ids of the fields that changed), and its button "Ask Alma to read it" sends the user's message with that chip. After you read them, set each one's `readByAlma` to the text you read. A field with no `readByAlma` is never counted as changed. `notes`: below.
  - `thumbnail` (optional, a platform where a cover frame is picked): `{options: [{id, at, does}], pick?, where?, own?}`. `at` is the frame's time in the final, in seconds; `does` what it shows ("his face, looking up"); `where` where it is set ("the frame to pick in YouTube"). The page shows the frames and the user's pick (`pick`). Give a `thumbnail` to every platform that can take a cover frame (YouTube Shorts, TikTok, Instagram Reels) and offer the same frames on each, with the same ids and times. A pick on one is the pick on all of them: the page sets it on every platform with a `thumbnail` that is not locked and not `own`. `own: true` marks a platform that keeps its own cover frame (its picks stay there, picks elsewhere leave it alone); never set `own` unless the user asked for that platform to differ.
  - `upload`: `bufferSets`, `after` and `hand`, all three always there. `bufferSets` stays `[]`. `after` stays `[]` too: what the user does in the app right after posting goes into `hand`, after the `link` step (the page shows only `hand` for a post by hand). `hand` is the steps by hand, worded as actions, each step `{id, text, done?}` with `done` the time it was ticked (below, "By hand").
  - `send`: the posting record, `{}` until it is posted. `posted: {at, link?}`: when the user posted it, and the post's own link once they give it. The file's shape also has `asked`, `go`, `scheduled` (with `bufferPostId`), `sending`, `failed` and `requested`, from a posting service this copy does not have: a post by hand never uses them, so never write them.

Times are ISO with an offset or `Z`.

A full example (three platforms of the release on the day, all by hand: TikTok ready, Instagram posted with its link, X ready with a note from you):

```json
{
 "v": 1,
 "day": "2026-11-14",
 "final": {
  "path": "cut/renders/v236-master-lufs-14.mp4",
  "version": "v236",
  "namedAt": "2026-11-14T17:02:00.000Z",
  "name": "The Lighthouse - FINAL captioned.mp4",
  "companions": {
   "clean": {
    "path": "cut/renders/v236-master-lufs-14-without-c1.mp4",
    "options": {
     "loudness": {
      "lufs": -14,
      "truePeak": -1
     },
     "leaveOut": {
      "tracks": [
       "C1"
      ]
     }
    }
   },
   "phone": {
    "path": "cut/renders/v236-proxy-lufs-14.mp4",
    "options": {
     "loudness": {
      "lufs": -14,
      "truePeak": -1
     }
    }
   },
   "srt": {
    "path": "cut/renders/v236.srt"
   }
  }
 },
 "facts": [
  {
   "id": "days",
   "label": "the days it took",
   "many": true,
   "sentence": "Days it took ___",
   "value": "6",
   "confirmedAt": "2026-11-14T18:12:00.000Z"
  },
  {
   "id": "cost",
   "label": "the cost",
   "sentence": "Cost about ___ Higgsfield credits"
  }
 ],
 "platforms": [
  {
   "id": "tiktok",
   "kind": "tiktok",
   "name": "TikTok",
   "account": "sample_studio",
   "route": "hand",
   "wave": {
    "day": "today",
    "about": "19:00"
   },
   "fields": [
    {
     "id": "first",
     "label": "First line",
     "text": "A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.",
     "pick": "a",
     "candidates": [
      {
       "id": "a",
       "text": "A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.",
       "does": "the premise"
      },
      {
       "id": "b",
       "text": "A letter washes up at the lighthouse. Someone across the water is waiting.",
       "does": "who she is"
      }
     ],
     "sharedWith": [
      "instagram-reels"
     ],
     "aim": {
      "max": 90,
      "words": "aim under 90, so the feed shows it whole"
     }
    },
    {
     "id": "credit",
     "label": "Credit line",
     "text": "An original story. Voices and pictures made on Higgsfield.",
     "pick": "a",
     "candidates": [
      {
       "id": "a",
       "text": "An original story. Voices and pictures made on Higgsfield.",
       "does": "the source"
      },
      {
       "id": "b",
       "text": "An original story.",
       "does": "shorter"
      }
     ],
     "sharedWith": [
      "instagram-reels"
     ]
    }
   ],
   "upload": {
    "bufferSets": [],
    "after": [],
    "hand": [
     {
      "id": "save",
      "text": "Save the video to this phone"
     },
     {
      "id": "copy",
      "text": "Copy the caption"
     },
     {
      "id": "open",
      "text": "Open TikTok"
     },
     {
      "id": "settings",
      "text": "I turned on AI-generated content and turned off auto-captions"
     },
     {
      "id": "link",
      "text": "Paste the post's link"
     }
    ]
   },
   "send": {}
  },
  {
   "id": "instagram-reels",
   "kind": "instagram-reels",
   "name": "Instagram Reels",
   "account": "sample_studio",
   "also": [
    "Facebook",
    "Threads"
   ],
   "route": "hand",
   "wave": {
    "day": "today",
    "about": "19:00"
   },
   "fields": [
    {
     "id": "first",
     "label": "First line",
     "text": "A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.",
     "pick": "a",
     "candidates": [
      {
       "id": "a",
       "text": "A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.",
       "does": "the premise"
      },
      {
       "id": "b",
       "text": "A letter washes up at the lighthouse. Someone across the water is waiting.",
       "does": "who she is"
      }
     ],
     "sharedWith": [
      "tiktok"
     ]
    },
    {
     "id": "credit",
     "label": "Credit line",
     "text": "An original story. Voices and pictures made on Higgsfield.",
     "pick": "a",
     "candidates": [
      {
       "id": "a",
       "text": "An original story. Voices and pictures made on Higgsfield.",
       "does": "the source"
      },
      {
       "id": "b",
       "text": "An original story.",
       "does": "shorter"
      }
     ],
     "sharedWith": [
      "tiktok"
     ]
    }
   ],
   "upload": {
    "bufferSets": [],
    "after": [],
    "hand": [
     {
      "id": "save",
      "text": "Save the video to this phone",
      "done": "2026-11-14T19:02:00.000Z"
     },
     {
      "id": "copy",
      "text": "Copy the caption",
      "done": "2026-11-14T19:03:00.000Z"
     },
     {
      "id": "open",
      "text": "Open Instagram",
      "done": "2026-11-14T19:03:00.000Z"
     },
     {
      "id": "settings",
      "text": "I posted it as a reel shared to the feed, with AI info on, and checked the cover frame",
      "done": "2026-11-14T19:09:00.000Z"
     },
     {
      "id": "link",
      "text": "Paste the post's link"
     }
    ]
   },
   "send": {
    "posted": {
     "at": "2026-11-14T19:10:00.000Z",
     "link": "https://www.instagram.com/reel/DCx1a2b3c4d/"
    }
   }
  },
  {
   "id": "x",
   "kind": "x",
   "name": "X",
   "account": "sample_x",
   "route": "hand",
   "wave": {
    "day": "today",
    "about": "21:00"
   },
   "fields": [
    {
     "id": "text",
     "label": "Post",
     "text": "A lighthouse keeper finds a letter in a bottle.",
     "pick": "a",
     "aim": {
      "max": 120,
      "words": "aim under 120, room for the video card"
     },
     "candidates": [
      {
       "id": "a",
       "text": "A lighthouse keeper finds a letter in a bottle.",
       "does": "the premise"
      },
      {
       "id": "b",
       "text": "\"Fish get sold lying down. Why not people?\" A short film.",
       "does": "a line from the film"
      }
     ],
     "notes": [
      {
       "id": "n1",
       "at": "2026-11-14T18:30:00.000Z",
       "text": "X shows the whole post. A question at the end gets more replies here than a plain line.",
       "proposal": "A lighthouse keeper finds a letter in a bottle. Would you answer it?",
       "actions": [
        {
         "id": "use",
         "label": "Use it on X",
         "effect": [
          {
           "kind": "set",
           "field": "text",
           "platforms": [
            "x"
           ],
           "text": "A lighthouse keeper finds a letter in a bottle. Would you answer it?"
          }
         ]
        },
        {
         "id": "keep",
         "label": "Keep yours",
         "effect": [],
         "small": "nothing changes"
        }
       ]
      }
     ]
    }
   ],
   "upload": {
    "bufferSets": [],
    "after": [],
    "hand": [
     {
      "id": "save",
      "text": "Save the video to this Mac"
     },
     {
      "id": "copy",
      "text": "Copy the post"
     },
     {
      "id": "open",
      "text": "Open X"
     },
     {
      "id": "link",
      "text": "Paste the post's link"
     }
    ]
   },
   "send": {}
  }
 ]
}
```

## Starting the platforms

When the user asks you to draft the texts (the Release page's "Ask Alma to draft them", once a final is named and `platforms` is empty), add the platforms to the file the page already has (it holds `final`; re-read it, keep `final` and `facts`, write `platforms`):

- **From the film before**: when an earlier film has a `social/release.json`, take the newest one (by its `day`) and copy, per platform, its `id`, `kind`, `name`, `account`, `also`, `wave` and order, with `route: "hand"`. Copy its `hand` steps (and any `after` steps, moved into `hand` after the `link` step) only as a starting point you check against this film and the user's release notes: a step the user has since said they do not want is not carried over. `bufferSets` and `after` start as `[]`. The tags the user used there (its `tags: true` fields) are their usual tags: start this film's tag candidates from them. Never copy its other texts, `send`, notes or `readByAlma`. When there is no earlier release file but an earlier `social/kit.md`, read the accounts, the order, the times and the tags from it the same way.
- **From nothing**: one platform per place the user posts, in the order and with the accounts the user's stage notes give; ask the user for what they do not say.
- Then each platform's `fields` with their candidates and aims (the stage notes say how the texts are written), every field's `readByAlma` set to the text you wrote, its `upload` (`{"bufferSets": [], "after": [], "hand": [...]}`, the steps by hand), `send: {}`.

## What the page shows, and what an edit writes

The platform page shows one box per part the platform has, named with the platform's word and in its order ("Title", "Description"; "Caption"; "First comment"; "Post"), and a "Tags" box. A box holds the whole text of its part as it will be posted: its fields joined as the part joins them, empty fields left out, the tags left out of it and shown in the Tags box. No candidates are shown on the page and no field labels: the page lists nothing of yours but your notes, under the box of the field they are about.

The candidates live only in the file: two or three for each field, each with what it does (`does`), as the release note asks (Flow v3.3 - 12 Release, step 14). The page shows only the text in use. So a field nobody has filled shows an empty box on its page ("Text to pick"), and its row on the Release page says how many candidates wait ("3 candidates to pick from"); the page has no button that picks a candidate. A candidate reaches a box in one of two ways: the user writes or pastes the text in the box, or presses a button of a note of yours under that field. To put a candidate in front of the user, or to offer another one for a text already in a box, write a note under its field (below) with one or two buttons, the one you recommend first, each a `set` of one candidate's text on the platforms it is for. A note's button writes the candidate's text into the field without `pick`. When the user names a candidate in the chat, offer it the same way, as a note, so the user's press puts it in. The text that is posted is only what the user picked or wrote. A field is in the Tags box when its part is `tags`, or it has `tags: true`; in a file written before 14 Nov 2026 also when its id is `tags` or `hashtags` or its text is only hashtags.

What an edit of a box writes:

- A box of one field: that field's `text`, with `own: true` and no `pick`.
- A box of several fields: the box's first field holds the whole text as the user wrote it, with `own: true` and no `pick`; the box's other fields get `text: ""` with `own: true` and no `pick`. Their candidates stay. On a shared box the same is written on every platform it is shared with. Do not refill the emptied fields or split the user's text back into fields unless the user asks: the posted text is exactly what they wrote.
- The user's Command-Z back to the text the box started from puts every field back as it was (its text, `own` and `pick`).
- An edit in the Tags box writes the tags field's `text` with `own: true` and sets `tags: true` on it.
- "Only here" unlinks every field of the box; "Link again" links them all again.

## Notes under a field

A note is your advice about one field, shown under it: `{id, at, text, proposal?, actions}`. `actions` are one or two buttons, the one you recommend first: `{id, label, effect, small?}`, the label saying what each platform ends up with ("Use it on both", "Only on Instagram"), `small` a line under it ("unlinks the first line"). `effect` is a list the page applies without knowing why:

- `{"kind": "set", "field": "first", "platforms": ["tiktok", "instagram-reels"], "text": "…"}`: that text on those platforms (a platform sharing the field that the list leaves out keeps its own text and is unlinked);
- `{"kind": "unlink", "field": "first", "platform": "instagram-reels"}`;
- `{"kind": "link", "field": "tags", "platforms": ["tiktok", "instagram-reels"]}`: the first one's text on all of them, shared;
- `[]`: nothing changes ("Keep yours").

A pressed button writes `answered: {action, at, before}` on the note (`before` is the fields as they were, for its undo). An answered note is no longer counted. Advice is never a state: an open note shows as "1 note from Alma".

## Who writes what

| Part | Who |
|---|---|
| `final` and its companions | the harness, when the user names the final (the Release page, or a master's row in the Edit page's Renders tab) |
| facts: `value`, `confirmedAt` | the user. You may add a fact (`id`, `label`, `sentence`) and use it in candidates |
| `pick`, `text` with `own` (the emptied fields of a box written whole too), `tags: true` on a field written in the Tags box, `sharedWith` changes, ticks of `hand`, a pasted `posted.link`, `posted` without a link ("I posted it, link later"), a note's `answered`, `thumbnail.pick`, `thumbnail.own` | the user, through the page (you set `own` only when the user asks for a platform to differ) |
| `platforms` (new ones, accounts, waves, `route: "hand"`), `candidates`, `aim`, `part`, `tags`, `notes`, `readByAlma`, `thumbnail.options` and `where`, `upload.hand` (with `bufferSets` and `after` left `[]`) | you |
| `send.posted` and its `link` when the user tells you in the chat that it is posted, or sends the link there | you |

Re-read the file right before every write and change only your parts: the page writes one small change at a time and never the whole file, so a write of yours made from an old reading would take back the user's. Write a temp file and rename it over, as the harness does. Never a sub-agent.

A candidate's text, an aim or a note is yours to rewrite at any time, except on a locked platform (below). The user's own text (`own: true`) and their picks are theirs: propose a change in a note, never write it.

## The states, and how each comes about

The page works out each platform's state from the file and the clock; nothing stores it.

- **Text to pick**: a field's `text` is empty and it is not the user's own, or a posted part has no text at all. Its candidates may use an unconfirmed fact; it is said quietly then.
- **Ready**: every field has a text and nothing below applies. Part-way through its `hand` steps it says "By hand, step n of m".
- **Posted**: `send.posted`. Without a link it says "Posted, link to add".
- **Needs you**: a text in use uses a fact not confirmed, or a posted part is over the platform's hard limit.

A posted platform's text is **locked**: nothing rewrites it, not you, not a note's button, not a shared edit. The page refuses an edit of a field shared with a posted platform until the user keeps the change on this platform only (unlinking it). To change a post that is up, the user edits or deletes it in the app.

**A go for one platform is a go for that platform only.** "Post TikTok" says nothing about Instagram, even when they share text. You never post anything yourself: the user posts by hand, and you record it (below).

## Posting it by hand (stage 3)

Mechanics only. When to post, and how a text is written, are in the stage notes. Every post is made by hand by the user; you write the texts and the steps, show the user exactly what goes out, and record the post.

### The file that goes out

**The file is the one the page names, never another**: the final's smaller file (`companions.post`) once the harness has made it and it passed its checks, else the final (a final named before 14 Nov has no `post`: the final, as before; a smaller file that failed or came out no smaller: the final, and the page says why). The page's `save` step downloads it. Never pick, swap or make a file yourself. While the smaller file is still being made, nothing is posted.

### The go card

The user's go is given one platform at a time: on the platform page by working through its steps, or in the chat ("Post TikTok", "go for TikTok"). On a go in the chat, answer with one card that asks, in `review/cards.json`, the same turn, and nothing else for that platform until it is answered. Its shape (the show recipe's card that asks, with the fields the harness reads for a post):

```
{
  "type": "card", "id": "GO-release-tiktok-1", "at": "release", "for": "tiktok", "updated": "<now, ISO>",
  "title": "TikTok, from sample_studio, by hand.",
  "sub": "Only TikTok. Instagram gets its own go.",
  "quote": "<the text exactly as it will be posted>",
  "fileLine": {"name": "The Lighthouse - FINAL captioned.mp4", "sub": "1:09, 60 MB", "path": "cut/renders/v236-master-lufs-14-small.mp4"},
  "text": ["Save the video to your phone, copy the caption, open TikTok, turn on AI-generated content and turn off auto-captions, post it, then paste its link on the TikTok page."],
  "note": "<any note of yours, one or two sentences; leave the key out when there is none>",
  "ask": "yes", "yesLabel": "I posted it", "noLabel": "Not now"
}
```

- `id`: `GO-release-<platform id>-<n>`, `n` counting up per platform (a new card for the same platform closes the old one with `"answer": {"note": "replaced by GO-release-tiktok-2"}`). `at` is `release`, `for` the platform's id: the card shows at the gate.
- `title`: platform, account, "by hand".
- `sub`: "Only <platform>. <the platforms sharing a text with it> get their own go." ("The others get their own go." when it shares nothing.)
- `quote`: each posted part exactly as it will be posted, facts filled, joined as the platform joins them. Several parts: `Title:\n…\n\nDescription:\n…`. With a reply on X or Threads, the reply last, as `Reply:`. The harness shows it as written, line breaks kept, nothing removed.
- `fileLine`: the file that goes out (above) by its name, its length and size, and its path. Never the 480p preview.
- `text`: the platform's steps by hand, in order, in one or two sentences.
- `yesLabel` is "I posted it", `noLabel` "Not now".

On the yes, set `"answer": true` on the card; if `send.posted` is not there yet, write `send.posted` `{at}` (the page then shows "Posted, link to add"), open its row in `published-links.md` as `add (posted by hand)`, and ask the user for the link. On the no, set `"answer": {"option": "no", "at": "<now>"}` and do nothing else for it.

### Recording the post

- When the user pastes the link on the platform page, or presses "I posted it, link later", the page writes `send.posted` and puts a chip in "Alma sees" that goes with their next message. Take it from there: write the platform's row in `published-links.md` at the studio root, as Flow v3.2 - 12 Release says (the link with tracking parameters stripped, the date and time beside it; `add (posted by hand)` while the link is still to come).
- When the user tells you in the chat that it is posted, or sends the link there, write it yourself: `send.posted` `{at, link?}` in `social/release.json` (the link on the platform's own site, tracking parameters stripped), then the row in `published-links.md`. Never guess whether a post went up.
- A file written before this copy may still hold `send.asked`, `go`, `scheduled`, `sending` or `failed` for a platform. Nothing in this copy acts on them: ask the user whether that post went up, and once they say, write `send.posted` (with the link when they give it) or clear `send` to `{}`.

### By hand

`upload.hand` is the list the page shows as numbered steps, in your order. The page knows a step by its `id`: `save` (a download of the final, full size), `copy` (copies the first posted part) or a posted part's id (`title`, `caption`, `comment`, `description`, `tags`, `text`) or `copy-<part>` (copies that part's exact text, shown on the step), `open` (opens the app's site), `link` (the user pastes the post's link, or says "I posted it, link later"). Any other id is a check the user ticks; word it as what the user did ("I turned on AI-generated content"). Ticks are written as `done` on the step; a pasted link is `send.posted.link`, checked to be on the platform's own site. X's reply by hand is a step of its own, `copy-reply`, right after the post's: the page adds it when your steps have none for it (worded "Copy the reply and post it as a reply to your post.") and writes it into `upload.hand` when it is ticked; write your own `copy-reply` step only to word it otherwise.
