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
  - `route`: `"buffer"` or `"hand"`. `routeBy`: `{by: "user" | "alma", at}`, who moved it last. `also`: other apps the post goes to (`["Facebook", "Threads"]`).
  - `wave`: `{day: "today" | "tomorrow", about: "19:00"}`.
  - `fields`: `{id, label, part?, tags?, text, own?, pick?, candidates, aim?, sharedWith?, readByAlma?, notes?}`. `part` is the posted piece it goes into (`caption`, `title`, `description`, `tags`, `comment`, `text`, `reply` on X and Threads, by kind; a field without one goes into the platform's first); fields of one part are joined in their order. A part may be one field or several; both are fine. `tags: true` marks a field of tags: it is counted in tags and shown in the page's Tags box. Write it on every tags field, including hashtags that go inside a caption or a description. `text` is the text in use (`""` while nothing is picked; `""` with `own: true` when the user emptied it by writing its box whole, below); `pick` the candidate in use; `own: true` the user's own words. `candidates`: `{id, text, does}` ("does" is a few words: "the premise", "a line from the film"). `aim`: `{min?, max?, words}`, said in your words ("aim under 90, so the feed shows it whole"); outside it is amber and never blocks. `sharedWith`: the other platforms whose field of the same `id` is this very text, written on both sides with the same text. `readByAlma`: `{at, text}`, the text as you last read it: write it with every field whose text you write or read. The page counts a field whose `text` differs from `readByAlma.text` as changed since you read it: it names the box it is in at the top of the text column ("Since Alma last read it: the caption"), puts one chip per platform in "Alma sees" ("Edited: TikTok caption", with the box's whole text before and now, and the ids of the fields that changed), and its button "Ask Alma to read it" sends the user's message with that chip. After you read them, set each one's `readByAlma` to the text you read. A field with no `readByAlma` is never counted as changed. `notes`: below.
  - `thumbnail` (optional, a platform where a cover frame is picked): `{options: [{id, at, does}], pick?, where?, own?}`. `at` is the frame's time in the final, in seconds; `does` what it shows ("his face, looking up"); `where` where it is set ("the frame to pick in YouTube"). The page shows the frames and the user's pick (`pick`). Give a `thumbnail` to every platform that can take a cover frame (YouTube Shorts, TikTok, Instagram Reels) and offer the same frames on each, with the same ids and times. A pick on one is the pick on all of them: the page sets it on every platform with a `thumbnail` that is not locked and not `own`. `own: true` marks a platform that keeps its own cover frame (its picks stay there, picks elsewhere leave it alone); never set `own` unless the user asked for that platform to differ.
  - `upload`: `bufferSets` (`{label, value}`, what Buffer sets at upload, as you read it from Buffer), `after` (steps the user does in the app right after it posts) and `hand` (the steps by hand, worded as actions), each step `{id, text, done?}` with `done` the time it was ticked.
  - `send`: the sending record. `asked: {at, when: "now" | <time>, text: {<field id>: <the exact text>}}`, `go: {at}`, `scheduled: {for, bufferPostId?}`, `sending: {since, steps?: [{label, at?}]}`, `posted: {at, link?}`, `failed: {at, reason, checked?: {at, text}, fix?}`.

Times are ISO with an offset or `Z`.

A full example (three platforms of the release on the day):

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
   "route": "buffer",
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
    "bufferSets": [
     {
      "label": "AI-generated content",
      "value": "on"
     }
    ],
    "after": [
     {
      "id": "captions",
      "text": "Turn off auto-captions"
     }
    ],
    "hand": [
     {
      "id": "save",
      "text": "Save the video to this phone"
     },
     {
      "id": "copy",
      "text": "Copy the caption"
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
   "route": "buffer",
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
    "bufferSets": [
     {
      "label": "Posted as",
      "value": "a reel, shared to the feed"
     },
     {
      "label": "AI-generated",
      "value": "on"
     }
    ],
    "after": [
     {
      "id": "cover",
      "text": "Check the cover frame"
     }
    ],
    "hand": []
   },
   "send": {
    "asked": {
     "at": "2026-11-14T18:40:00.000Z",
     "when": "2026-11-14T19:10:00.000Z",
     "text": {
      "first": "A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.",
      "credit": "An original story. Voices and pictures made on Higgsfield.",
      "tags": "#ai #aifilm #shortfilm #lighthouse"
     }
    },
    "go": {
     "at": "2026-11-14T18:41:00.000Z"
    },
    "scheduled": {
     "for": "2026-11-14T19:10:00.000Z",
     "bufferPostId": "6736f1c2a9e4b40012d3c4e5"
    }
   }
  },
  {
   "id": "x",
   "kind": "x",
   "name": "X",
   "account": "sample_x",
   "route": "buffer",
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
    "bufferSets": [
     {
      "label": "AI-generated",
      "value": "on"
     }
    ],
    "after": [],
    "hand": []
   },
   "send": {}
  }
 ]
}
```

## Starting the platforms

When the user asks you to draft the texts (the Release page's "Ask Alma to draft them", once a final is named and `platforms` is empty), add the platforms to the file the page already has (it holds `final`; re-read it, keep `final` and `facts`, write `platforms`):

- **From the film before**: when an earlier film has a `social/release.json`, take the newest one (by its `day`) and copy, per platform, its `id`, `kind`, `name`, `account`, `route`, `also`, `wave` and order. Copy its `upload.bufferSets`, `after` and `hand` steps only as a starting point you check against Buffer, this film and the user's release notes: a step the user has since said they do not want is not carried over. The tags the user used there (its `tags: true` fields) are their usual tags: start this film's tag candidates from them. Never copy its other texts, `send`, notes or `readByAlma`. When there is no earlier release file but an earlier `social/kit.md`, read the accounts, the order, the times and the tags from it the same way.
- **From nothing**: one platform per place the user posts, in the order and with the accounts the user's stage notes give; ask the user for what they do not say.
- Then each platform's `fields` with their candidates and aims (the stage notes say how the texts are written), every field's `readByAlma` set to the text you wrote, `send: {}`.

## What the page shows, and what an edit writes

The platform page shows one box per part the platform has, named with the platform's word and in its order ("Title", "Description"; "Caption"; "First comment"; "Post"), and a "Tags" box. A box holds the whole text of its part as it will be posted: its fields joined as the part joins them, empty fields left out, the tags left out of it and shown in the Tags box. No candidates are shown on the page and no field labels: the page lists nothing of yours but your notes, under the box of the field they are about.

The candidates live only in the file: two or three for each field, each with what it does (`does`), as the release note asks (Flow v3.2 - 12 Release, step 14). The page shows only the text in use. So a field nobody has filled shows an empty box on its page ("Text to pick"), and its row on the Release page says how many candidates wait ("3 candidates to pick from"); the page has no button that picks a candidate. A candidate reaches a box in one of two ways: the user writes or pastes the text in the box, or presses a button of a note of yours under that field. To put a candidate in front of the user, or to offer another one for a text already in a box, write a note under its field (below) with one or two buttons, the one you recommend first, each a `set` of one candidate's text on the platforms it is for. A note's button writes the candidate's text into the field without `pick`. When the user names a candidate in the chat, offer it the same way, as a note, so the user's press puts it in. The text that is posted is only what the user picked or wrote. A field is in the Tags box when its part is `tags`, or it has `tags: true`; in a file written before 14 Nov 2026 also when its id is `tags` or `hashtags` or its text is only hashtags.

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
| `pick`, `text` with `own` (the emptied fields of a box written whole too), `tags: true` on a field written in the Tags box, `sharedWith` changes, `route`, ticks of `after` and `hand`, `asked`, `go`, a pasted `posted.link`, `posted` without a link, a note's `answered`, `thumbnail.pick`, `thumbnail.own` | the user, through the page (you set `own` only when the user asks for a platform to differ) |
| `platforms` (new ones, accounts, waves), `candidates`, `aim`, `part`, `tags`, `notes`, `readByAlma`, `thumbnail.options` and `where`, `upload.bufferSets`, `upload.after`, `upload.hand` | you |
| `send.go` when the user gives the go in the chat, `send.scheduled`, `send.sending`, `send.posted`, `send.failed` | you |

Re-read the file right before every write and change only your parts: the page writes one small change at a time and never the whole file, so a write of yours made from an old reading would take back the user's. Write a temp file and rename it over, as the harness does. Never a sub-agent.

A candidate's text, an aim or a note is yours to rewrite at any time, except on a locked platform (below). The user's own text (`own: true`) and their picks are theirs: propose a change in a note, never write it.

## The states, and how each comes about

The page works out each platform's state from the file and the clock; nothing stores it.

- **Text to pick**: a field's `text` is empty and it is not the user's own, or a posted part has no text at all. Its candidates may use an unconfirmed fact; it is said quietly then.
- **Ready**: every field has a text and nothing below applies. By hand part-way through its `hand` steps it says "By hand, step n of m".
- **Waiting for your go**: `send.asked` is there (the user pressed "Post now" or "Schedule…", which also sends you their words, "Post TikTok now"). Answer with your asking card, as the show recipe says for a go.
- **Scheduled**: `send.scheduled` and its time is ahead.
- **Sending**: a `send.go`, or your `send.sending`, or a scheduled time that has come. Past 20 minutes without `send.posted` it is **Needs you** ("still not posted after 20 minutes"); a new `send.sending.since` starts the 20 minutes again.
- **Posted**: `send.posted`. Without a link it says "Posted, link to add"; an `after` step not ticked says "1 thing left in TikTok".
- **Needs you**: also when a text in use uses a fact not confirmed, a posted part is over the platform's hard limit, or `send.failed` is there (until the user asks again: an `asked.at` later than `failed.at`).

A platform's text is **locked** from the ask until it is posted or the ask is cancelled (Waiting for your go, Scheduled, Sending, Posted). Nothing rewrites a locked text: not you, not a note's button, not a shared edit. The page refuses an edit of a field shared with a locked platform until the user keeps the change on this platform only (unlinking it). To change a scheduled post the user asks you to unschedule it; take it out of Buffer, then remove `send.scheduled`, `send.go` and `send.asked`, and it is Ready again.

**A go for one platform is a go for that platform only.** "Post TikTok now" says nothing about Instagram, even when they share text. After the go: post through Buffer with your tools, write `send.sending` when Buffer has it, then `send.posted` with the link, or `send.failed` with the reason, what you checked (`checked`) and a fix if you have one (`fix`). By hand (`route: "hand"`), Buffer must never post it: the user ticks the `hand` steps and pastes the link.

## What Buffer can set (its tools' schemas, 13 Nov 2026)

What `create_post` can carry per service; anything else is the user's, in the app after it posts, and belongs in `upload.after`. Write an after-post step only when the user's release notes ask for it; the steps in this recipe's examples are examples, not steps to copy. The numbers and their sources are in `src/components/release/platforms.ts`.

- **Every service**: when (`mode`: queue, share now, the next slot, or a set time with `dueAt`), a draft, a reminder instead of a post (`schedulingType: "notification"`, Instagram, TikTok and YouTube only), the video as a public web address (not a file on this Mac), a thumbnail only as a frame of the video (`thumbnailOffset`, in milliseconds).
- **YouTube (Shorts)**: `title` and `categoryId` (both required), `isAiGenerated` (altered or synthetic content), `privacy` (public, unlisted, private), `madeForKids`, `license`, `embeddable`, `notifySubscribers`. Not: tags, a thumbnail picture of its own, a playlist.
- **TikTok**: `isAiGenerated` (video posts only), `title`. Not: who can see it, comments, duet and stitch, auto-captions, the sound.
- **Instagram**: `type: "reel"`, `shouldShareToFeed`, `isAiGenerated`, `firstComment`, `geolocation`. Not: collaborators, a cover picture of its own, the sound.
- **Facebook**: `type` (post, reel, story), `firstComment`, a link card. Not: an AI label.
- **Threads**: a thread of posts, a topic, a location, a link card; no reels (a video goes as a post). Not: an AI label.
- **X**: `isAiGenerated` (original posts only), a thread of posts (`metadata.twitter.thread`). Not: who can reply.
- **Threads**: the thread is `metadata.threads.thread`.
- **LinkedIn**: `firstComment`, mentions, a link card; video at 720p at most. Not: an AI label.
- **Reddit**: no Buffer channel: always by hand.

The schemas state no length limits; Buffer's own pages do (the platforms module cites them).

## Sending it: the ask, your go card, the post (stage 3)

Mechanics only. When to post, and how a text is written, are in the stage notes.

### How the user's asks reach you

Every button on the platform page that says it asks you sends the user's own words to you as their message, with one chip in "Alma sees" (its `ref` holds the details). The page has written its part of the file first.

| The user pressed | Their words | The file, before the message |
|---|---|---|
| Post now | `Post TikTok now` | `send.asked` `{at, when: "now", text}` (the exact text of each field) |
| Schedule… (a time) | `Schedule Instagram for 19:10` | `send.asked` with `when` the time |
| Try again (after a failure) | `Post TikTok now`; the chip says it is again, after what | a new `send.asked` (the old record is replaced) |
| Cancel the ask | `Cancel the ask for TikTok` | `send.asked` removed |
| Unschedule (page or Release row) | `Unschedule Instagram` | `send.requested.unschedule` |
| Stop sending (Buffer still holds it) | `Stop sending TikTok` | `send.requested.stop` |
| Ask Alma whether it can still be stopped (your record says neither `inBuffer` nor `platformHas`) | `Can TikTok still be stopped?` | nothing |
| Ask Alma to check Buffer (past 20 minutes) | `Check Buffer for TikTok: still not posted after 20 minutes` | `send.requested.check` |
| Your suggested fix, when it is an ask | your own `fixAction.ask` words | nothing |

The chip of an ask carries exactly what was asked: platform, account, route, when, each posted part as it will be posted (facts filled), the file's path, name, length and size, what Buffer sets, and what is left for the user after it posts. Post exactly that. **The file is the one the page names, never another**: the final's smaller file (`companions.post`) once the harness has made it and it passed its checks, else the final (a final named before 14 Nov has no `post`: the final, as before; a smaller file that failed or came out no smaller: the final, and the page says why). The page records it in the ask as `send.asked.file`, and a platform keeps that file from its ask on; while the smaller file is still being made the page does not let the user ask. Never pick, swap or make a file yourself.

Every message goes with all the chips in "Alma sees" at that moment (a pending "Edited" chip too), the button's own chip among them. If the message does not reach you, the page takes the ask back at once (`cancelAsk`) and tells the user to try again: an ask in the file always has its message in your thread.

The route can change only while nothing of the platform could still go out: the page refuses by hand while it is asked ("Cancel the ask first"), scheduled ("Unschedule it first"), going out ("Wait until it is posted, or ask Alma to stop it") or failed without `cleared`. On a Ready platform it changes at once.

The route switch ("Through Buffer / By hand"), a pasted link and "I posted it, link later" send no message: they write the file (`route` and `routeBy`, `send.posted`) and put a chip in "Alma sees" that goes with the user's next message. When a platform moves to by hand, Buffer must never post it: if anything of it is in Buffer, take it out and say so.

### The go card

Answer `Post TikTok now` (or a schedule) with one card that asks, in `review/cards.json`, the same turn, and nothing else for that platform until it is answered. Its shape (the show recipe's card that asks, with four fields the harness reads for a post):

```
{
  "type": "card", "id": "GO-release-tiktok-1", "at": "release", "for": "tiktok", "updated": "<now, ISO>",
  "title": "TikTok, from sample_studio, through Buffer, now.",
  "sub": "Only TikTok. Instagram gets its own go.",
  "quote": "<the text exactly as it will be posted>",
  "fileLine": {"name": "The Lighthouse - FINAL captioned.mp4", "sub": "1:09, 101 MB", "path": "cut/renders/v236-master-lufs-14.mp4"},
  "text": ["At upload Buffer sets AI-generated content on. You turn off auto-captions in TikTok right after it posts."],
  "note": "<any note of yours, one or two sentences; leave the key out when there is none>",
  "ask": "go", "yesLabel": "Post to TikTok now", "noLabel": "Cancel the ask"
}
```

- `id`: `GO-release-<platform id>-<n>`, `n` counting up per platform (a Try again is a new card; close the old one with `"answer": {"note": "replaced by GO-release-tiktok-2"}`). `at` is `release`, `for` the platform's id: the card then shows on that platform's page, under "Waiting for your go", and at the gate.
- `title`: platform, account, route, when ("now", or "at 19:10").
- `sub`: "Only <platform>. <the platforms sharing a text with it> get their own go." ("The others get their own go." when it shares nothing.)
- `quote`: each posted part exactly as `send.asked.text` makes it, facts filled, joined as the platform joins them. Several parts: `Title:\n…\n\nDescription:\n…`. The harness shows it as written, line breaks kept, nothing removed.
- `fileLine`: the file that goes out (the chip's `File:` line: the smaller file of the final, or the final) by its name, its length and size, and its path. Never the 480p preview.
- `text`: one sentence of what Buffer sets, one of what the user does in the app after it posts.
- `yesLabel` names what is approved: "Post to TikTok now", "Schedule Instagram for 19:10". `noLabel` is always "Cancel the ask". These two only work on a `yes` or a `go`; a card without them shows as before.

### On the yes

The yes arrives as `<harness-action kind="answer" ask="go" card="GO-release-tiktok-1"/> The user pressed “Post to TikTok now” …`. When the user pressed it on the platform page, the page has already recorded `send.go` (the go operation checks the text is the one asked). If not (the gate page, or the user said go in words), record it yourself: `curl -s -X POST 'http://localhost:8800/api/films/<film>/release' -H 'content-type: application/json' -d '{"op":"go","platform":"tiktok"}'`, or write `send.go` `{at}` into the file. A refusal means the go cannot stand (the text changed since the ask; already recorded): read it and do not post. Then:

1. Set `"answer": true` on the card.
2. Post through Buffer, as the stage notes and the buffer skill say, exactly what the card showed: that text, that file, that platform only. For a schedule, give Buffer that time and write `send.scheduled` `{for, bufferPostId}`.
   - **A reply on X (or Threads)** is the field with `part: "reply"`: its own posted part, under the post's box on the page, locked with it at the ask and on the card as `Reply:`. With a reply, send ONE Buffer post: its `text` is the post, and `metadata.twitter.thread` (`metadata.threads.thread` on Threads) holds every post in order, the first included, the first one's `text` the same as the outer `text`. The video goes on the first only, in the top-level asset shape; the reply has no asset. The reply is never sent later as a separate post: Buffer cannot reply to a post that is already up. Without a reply field, send the post alone as before. A platform file written before 14 Nov with the reply as an `upload.after` step stays as it is: leave that step to the user, do not move it into a field.
3. Write `send.sending` `{since, steps}` the moment Buffer has it: `steps` are your words for each step, in order, each `{label, at?}`; `at` once it is done, the first without `at` is the one under way ("Buffer has the file" 19:02, "TikTok is processing", "Posted"). Update `at` as each one ends.
4. Say whether it can still be stopped, from what you see in Buffer: `send.sending.inBuffer` (a time) while Buffer still holds it and the platform does not have it yet; `send.sending.platformHas` (a time, and remove `inBuffer`) the moment the platform has taken it. The page offers "Stop sending" only on `inBuffer`, says "Too late to stop it…" only on `platformHas`, and with neither asks you ("Can TikTok still be stopped?"): answer by writing one of the two.
5. When it is up: `send.posted` `{at, link}` with the post's own link. When it did not go out: `send.failed` `{at, reason, checked: {at, text}, fix?, fixAction?}`. `reason` is one plain sentence ("TikTok answered with an unknown error."); `checked.text` what you looked at and when ("Alma checked sample_studio on TikTok at 19:04. No new post. The text and file are unchanged."); `fix` your suggestion in words when you have one, and `fixAction` `{label, href}` (a page to open) or `{label, ask}` (words the user sends you) when it can be a button.
6. Write a failure whole, in one write: `failed` with `reason`, `checked` (what you looked at in Buffer and on the platform, and when) and, once you have seen that Buffer holds nothing of it, `cleared` (a time). Until `cleared` is there, both "Try again" (a new ask) and "Post it by hand" are refused with "Wait until Alma confirms Buffer has dropped it.", so a post can never go out twice. If Buffer still holds it, take it out first, then write `cleared`.

A send past 20 minutes without `send.posted` shows as Needs you with "Ask Alma to check Buffer". A new `send.sending.since` restarts the 20 minutes.

### On the no, a cancel, an unschedule, a stop

- The card's "Cancel the ask" arrives with `option="no"`. On the platform page the page has already removed `send.asked`; if it is still there, `{"op":"cancelAsk","platform":"tiktok"}`. Set `"answer": {"option": "no", "at": "<now>"}` on the card. Post nothing.
- `Cancel the ask for TikTok` from the page: the ask is gone already; close your card the same way.
- `Unschedule Instagram`: take the post out of Buffer, then remove `send.scheduled`, `send.go`, `send.asked` and `send.requested`. The page shows "Unscheduling…" until you do; then the platform is Ready again. If it had already gone out, write `send.posted` instead and say so.
- `Stop sending TikTok` (offered only on your `inBuffer`): if Buffer still holds it, take it out and remove `send.sending`, `send.go`, `send.asked` and `send.requested`; if the platform already has it, write `send.sending.platformHas` and tell the user it can only be deleted in the app once it is up.
- `Check Buffer …`: write what you find (`send.posted`, `send.failed`, or a new `send.sending.since` with where it is) and remove `send.requested.check`.

### By hand

`upload.hand` is the list the page shows as numbered steps, in your order. The page knows a step by its `id`: `save` (a download of the final, full size), `copy` (copies the first posted part) or a posted part's id (`title`, `caption`, `comment`, `description`, `tags`, `text`) or `copy-<part>` (copies that part's exact text, shown on the step), `open` (opens the app's site), `link` (the user pastes the post's link, or says "I posted it, link later"). Any other id is a check the user ticks; word it as what the user did ("I turned on AI-generated content"). Ticks are written as `done` on the step; a pasted link is `send.posted.link`, checked to be on the platform's own site. X's reply by hand is a step of its own, `copy-reply`, right after the post's: the page adds it when your steps have none for it (worded "Copy the reply and post it as a reply to your post.") and writes it into `upload.hand` when it is ticked; write your own `copy-reply` step only to word it otherwise.
