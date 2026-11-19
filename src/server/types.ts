// Hitchcock Harness · shared types between the server (files, claude -p) and the UI.
// This file is the contract of build step 1. Change it only by agreement (note the change in ARCHITECTURE.md).

export type Stage =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // Film Flow v3 numbering (1 Setup and story … 12 Release)

export const STAGE_NAMES: Record<Stage, string> = {
  1: 'Setup and story', 2: 'Characters', 3: 'Voices and video elements', 4: 'Locations and props',
  5: 'Previz and storyboards', 6: 'Scene prompts', 7: 'Takes', 8: 'Redos', 9: 'Edit',
  10: 'Finish and 1080p', 11: 'Sound and music', 12: 'Release',
};

export type Flow = 'video-driven' | 'audio-first';

/** One film the user has made or is making. Built by the films registry from the folders. */
export interface FilmRef {
  slug: string;                 // folder name, e.g. "maren-and-the-sea"
  title: string;                // from brief.md's first heading, e.g. "Maren and the Sea"
  workingTitle?: string;        // e.g. "A Letter in a Bottle" for The Lighthouse
  folder: string;               // absolute path of the film folder (through the repo's assets link)
  repo: string;                 // absolute path of the repo that owns it
  flow: Flow;
  started?: string;             // ISO date
  delivered?: { date: string; folder: string }[];  // the "final cuts" folders of a film that went out (see `released`)
  /** "delivered" only when the record shows the film went out (`released`); a copy in final cuts alone is not that (ASKS 37). */
  status: 'in-progress' | 'delivered';
  /** What shows the film went out: its row in the published-links note ("posted"), or the release stage's FINAL
   *  files in its final-cuts folder ("final files": a Social kit folder with a video, or a video named FINAL or "as posted"). */
  released?: { date: string; by: 'posted' | 'final files' };
  /** Final-cuts folders with a video in them, for a film the record does not show as released: a copy to watch on the
   *  phone, not a release. `date` is the day of the newest video in it (13 Nov, ASKS 37). */
  copies?: { date: string; folder: string }[];
  stage?: Stage;                // the stage the film is at, when derivable
  aspect?: '9:16' | '16:9';
  supersededBy?: string;        // slug of the film that carried this draft folder on; the sidebar hides it (integration, 8 Nov)
}

export interface Cost { credits?: number; usd?: { amount: number; service: string }[] }

export interface ScriptVersion { version: string; date?: string; locked: boolean; path: string; /** saved by the user on the Story page (ASKS 64) */ by?: 'you' }
export interface ScriptLine { id: string; speaker: string; text: string; sceneId?: string; direction?: string }  // direction: "beat" from **MAREN** *(beat)*

export interface CharacterRef {
  id: string;                   // "C01"
  name: string;                 // "Maren"
  role?: string;
  folder: string;               // cast/C01-maren
  face?: { rounds: Round[]; pick?: Pick };
  wardrobe?: { rounds: Round[]; pick?: Pick };
  sheet?: { path?: string; approved?: boolean };
  voice?: { rounds: Round[]; pick?: Pick; elementLine?: { path: string; seconds?: number; hz?: number } };
  element?: { path?: string; state: 'none' | 'draft' | 'final' };
  extra?: boolean;              // extras share a group sheet, no voice
  /** No lines in the film (the script's ID table or the brief's Cast list says "no lines"): no voice and no video
   *  element are needed; the character is done once the sheet is approved and registered as an image element. */
  silent?: boolean;
  /** Registered as an image element (an entry with an id in elements.json). */
  imageElement?: boolean;
  /** Taken whole from the library or an earlier film: a sheet and a picked face with no rounds behind them. */
  reused?: boolean;
  /** The pick files themselves (cast/<folder>/pick-face.png, pick-wardrobe.png, the newest version), so a character
   *  taken whole from the library, with no rounds, still shows its face (ASKS 46, 14 Nov 2026). */
  picks?: { face?: string; wardrobe?: string };
  cost?: Cost;                  // every spend.md row for this character (labelled with its ID or naming it)
}

export interface Round {
  id: string;                   // "r1", "r2a"
  date?: string;
  candidates: Candidate[];
  prediction?: string;          // Alma's predicted pick (candidate id), from taste.md or the review cards
  pick?: string;                // the candidate the user picked in this round, when the pick came from it
}
export interface Candidate { id: string; path?: string; note?: string; hz?: number; seconds?: number }
export interface Pick { candidateId: string; date?: string; words?: string; predictionRight?: boolean }

export interface LocationRef {
  id: string;                   // "L01"
  name: string;
  folder: string;
  styleImages?: Round[];
  /** `measured`: a measure of the painting against its colour plate is in previz/<LID>/check/. */
  master?: { path?: string; picked?: boolean; measured?: boolean };
  views?: { camera: string; path: string; measured?: boolean }[];
  /** The view cameras that have a colour plate (previz/<LID>/plates-colour/cam<X>-colour.png, the plan's TOP left out),
   *  lower case ("master", "front", "back"): each wants a painted view, measured against it (Flow v3.2, 4, steps 8 to
   *  11). Undefined when the film keeps no colour plates. */
  plates?: string[];
  props?: PropRef[];
}
/** A prop (props/<PID>-<name>/): its candidate rounds, made on its own or cut out of a place, and the pick
 *  (pick.png, the copy of one candidate). Rounds and pick added 8 Nov for "props both ways" on Locations. */
export interface PropRef { id: string; name: string; path?: string; rounds?: Round[]; pick?: string }

export interface SceneRef {
  id: string;                   // "S9"
  title: string;
  folder: string;               // blocks/S9 or generations/S9 (both layouts exist)
  seconds?: number;             // from the scene file (the truth), never from the scene plan
  shots?: number;
  sceneFile?: string;           // generations/S9/S9-scene.md when it is written: the shot list the previz and the prompt are built from
  planSeconds?: number;         // from blocks/scene-plan.md; shown as "superseded" when it differs
  planShots?: number;
  promptVersions: { version: string; path: string; checkPath?: string; checkPassed?: boolean; mediaPath?: string }[];  // checkPassed: the check file's PASS/FAIL line
  takes: TakeRef[];
  inCut?: string;               // the take ids in the current cut, " + "-joined ("grey-take2 + grey-take3 + FIX-lamp-S3 · take 2"), from the cut reader
  previzPath?: string;          // the newest previz take of the scene (previz/S1/S1-previz-take-10.mp4), for its poster
  cutSource?: CutSource;        // how inCut was derived (the cut reader, 8 Nov); also on the server's more.cutSource
  location?: string;            // "L01 the shore", from the scene file (the truth), not the script heading
  cost?: Cost;                  // the scene's takes and pick-ups together
}
export interface TakeRef {
  id: string;                   // "take3", "FIX-lamp-S3 · take 2"
  path?: string;
  seconds?: number;
  date?: string;
  jobId?: string;
  cost?: Cost;
  misses?: string[];            // from the review cards
  kind: 'take' | 'pickup';
  stopped?: 'blocked' | 'failed'; // no clip will come: blocked.txt or failed.txt sits beside the job id (12 Nov)
  stoppedWhy?: string;          // that file's first line
  /** What the take's check concluded, from its findings.md: "redo", "usable" (with a trim or as parts) or "good". */
  verdict?: 'redo' | 'usable' | 'good';
  finding?: string;             // the reason in a sentence: "the scene's punchline was never spoken"
  placement?: TakePlacement;    // where the take sits in the current cut, when it is in it (the cut reader, 8 Nov)
}

/** How the current cut was read: the cut's name, the files it came from, the date, and a one-line label
 *  for the UI ("from spend.md · 1 Nov"). `note` says what the record could not settle. */
export interface CutSource {
  cut: string;                  // "Grey draft 10 · S3 lamp", "rough assembly v1"
  from: string[];               // the files read, relative to the film folder: spend.md, edits/fcpxml/…, review/cards.json
  date?: string;                // ISO date of the newest fact used
  label: string;                // "from spend.md · 1 Nov"
  note?: string;
}
/** One stretch of a take on the cut's timeline, in frames from the cut's first frame. */
export interface CutPiece { at: number; frames: number; sourceIn?: number; over?: boolean; shot?: string }
export interface TakePlacement {
  cut: string; fps: number; pieces: CutPiece[]; shots?: string; frames: number;
  toConfirm?: boolean;          // the current timeline's clip of this take says "(to confirm)" (9 Nov); the take card and cut lane badge it
}
/** The current cut of the film: what the Edit and Release nodes and the Scene page's cut lane read. */
export interface CutInfo {
  name: string;
  fps: number;
  frames?: number;              // the delivered length, when the record gives it (4303)
  render?: string;              // the render of it ("Resolve edit 7"), when named
  video?: string;               // that render's file, relative to the film folder
  master?: string;              // the delivered 1080 master, relative to the film folder
  source: CutSource;
  // the harness's own timeline files cut/v<n>.json (build step 4a, 8 Nov); absent until a film has one
  versions?: TimelineVersionRef[];   // oldest first
  current?: Timeline;                // the highest version
  renders?: Record<string, CutRenders>;   // per version: the proxy and master render states
  recordAhead?: RecordAhead;         // a cut the terminal workflow rendered after the newest cut/v<n>.json (9 Nov)
}
/** A cut in the record the harness's timeline has not taken in: the newest video directly in `cut/` (an assembly,
 *  a draft, a Resolve export, the final) or on a cut card, newer than the last version Alma or the migration
 *  wrote. The user's own trims and undos do not count as catching up (10 Nov). The Edit page asks Alma to bring
 *  the timeline up to it. */
export interface RecordAhead {
  file: string;                 // relative to the film folder: cut/DMA-rough-assembly-v7-480p.mp4
  date: string;                 // ISO date of that file
  label: string;                // "rough assembly v7"
  timeline: string;             // the newest timeline version it is ahead of ("v1")
  timelineDate?: string;        // ISO date of that version
}

export interface SpendLine { date: string; what: string; service: string; jobId?: string; userWords?: string; cost: Cost; note?: string; details?: SpendDetails }
/** What a spend.md row says beyond the amount: groups a character's rows into rounds on the Character page. */
export interface SpendDetails {
  stage?: string;               // "2 Characters"
  label?: string;               // "C01 r1-2", "S3 take 2": the version or take the row paid for
  units?: string;               // "1 image", "5 s"
  rate?: string;                // "0.12 cr, plan rate"
  unpriced?: boolean;           // the row names no amount ("on the plan")
}
export interface TastePick { date: string; what: string; prediction?: string; pick: string; right?: boolean }

/** Everything a film's pages render. Derived from files only; rebuilt on every change the watcher sees. */
export interface FilmState {
  film: FilmRef;
  brief?: { path: string; markdown: string };
  script?: { versions: ScriptVersion[]; current?: string; lines: ScriptLine[]; markdown?: string };
  characters: CharacterRef[];
  locations: LocationRef[];
  scenes: SceneRef[];
  spend: { lines: SpendLine[]; total: Cost; charged?: Cost; refunded?: Cost };   // total is net: refund rows ("+72 cr") count negative (9 Nov)
  taste: TastePick[];
  reviewCardsPath?: string;
  previz?: { film: { version: string; path: string }[]; storyboards: { version: string; path: string }[] };
  cut?: CutInfo;                // the current cut and how it was derived (the cut reader, 8 Nov)
  post?: PostInfo;              // what exists after the takes: cut versions, 1080 masters, captions, the social kit (flow board, 8 Nov)
  /** The film's newest full-size master, found by the rule in read/master.ts (13 Nov, ASKS 37). */
  master?: FilmMaster;
  qc?: Record<string, QCEntry>; // every QC report in qc/, keyed "<stage>-<target>" (build step 3, 8 Nov)
  /** Spend rows of stages 6 to 8 that no single scene owns: probes, a pick-up reel across two scenes (9 Nov). With the
   *  scenes' costs it accounts for every credit those stages spent; the Scenes page shows it as its own row. */
  scenesRest?: { cost: Cost; rows: number; items: string[] };
  /** The review record as the pages use it: how many cards each place has, and the cards waiting for an answer (10 Nov). */
  feed?: FeedSummary;
  /** The research notes under refs/research/ (place, faces, costume, sources), with each note's first heading (11 Nov). */
  research?: { path: string; title: string }[];
  /** The story before it is a script (story/v<n>.md): prose with the dialogue inside it, edited by the user and Alma (11 Nov). */
  story?: StoryInfo;
  /** Stage 11's sound work, counted by folder group (mix, music, sfx, lines, fixes, reads, stems): the Sound node's status. */
  sound?: SoundSummary;
  warnings?: string[];          // what the readers could not parse ("spend.md: 7 rows name no amount")
  updatedAt: string;            // ISO
}

// ---- QC (build step 3, 8 Nov). The critic sub-agent (recipes/qc-critic.md) writes one file per round:
// qc/<stage>-<target>-r<n>.json in the film folder. The harness only reads them.

/** Where QC runs; the stage pages and the flow board name this same set. */
export type QCStage = 'script' | 'sheet' | 'voice' | 'views' | 'previz' | 'elements' | 'prompt' | 'take' | 'cut' | 'frames' | 'captions' | 'kit';
/** The five colour groups; the finer word ("camera", "geometry", "fluidity" …) goes in `sub`. */
export type QCCategory = 'camera+geometry' | 'blocking+fluidity' | 'prop' | 'lines' | 'audio+effect';
export const QC_CATEGORIES: QCCategory[] = ['camera+geometry', 'blocking+fluidity', 'prop', 'lines', 'audio+effect'];
export const QC_LOCK_SCORE = 8.5;
export const QC_MAX_ROUNDS = 3;

export interface QCMiss {
  id: string;                   // "m1", stable across rounds so a miss can be followed
  category: QCCategory;
  sub: string;                  // "camera", "geometry", "fluidity", "IDs" …
  finding: string;              // what is wrong, with where (shot, panel, line, second)
  fix: string;                  // the exact fix
  fixedIn?: string;             // "boards v4", "round 2", "take 4" when resolved
  open: boolean;
  evidence?: { path: string; note: string }[];  // paths relative to the film folder (panels, frames, files)
  where?: string;               // "shots 3 → 4", "5A → 5B", "L03": the shot, panel or line it is about (optional)
  title?: string;               // what is wrong in one plain sentence, no numbers or file names (the panel's headline; 12 Nov)
  risk?: string;                // what it would do to the paid take if left, in one sentence
}

export interface QCReport {
  stage: QCStage | string;
  target: string;               // the file-name target: "S1", "C01", "script", "cut" (no spaces)
  label?: string;               // how the UI names it when the target alone is too short: "S1 boards v4"
  round: number;
  score: number | null;         // 0–10, one decimal; null = a round that gave no score
  model: string;                // "opus"
  at: string;                   // ISO
  inputs: { path: string; sha1: string }[];
  misses: QCMiss[];
  next: string;                 // the "Next" sentence
  locked?: boolean;
  file?: string;                // filled by the reader: qc/<stage>-<target>-r<n>.json
}

/** One (stage, target): its latest report and every round in order. */
export interface QCEntry { key: string; stage: string; target: string; latest: QCReport; history: QCReport[] }

/** The files of stages 9 to 12, by name only: cut/ (edits and drafts), the 1080 masters (cut/*1080*, video/1080/),
 *  subtitles/ (.srt, .vtt) and social/kit.md. */
/** The film's newest full-size master (13 Nov, ASKS 37): the newest full-size video the record vouches for (a review
 *  card at Finish shows it, the app rendered it as a master, or spend.md's render rows name it), else the older films'
 *  reading by name. See src/server/films/read/master.ts. */
export interface FilmMaster {
  path: string;                 // relative to the film folder
  /** The cut version it is the picture of ("v230"): the render's own version, else a "v<n>" its card's title or its
   *  file name gives, kept only when cut/v<n>.json exists. */
  version?: string;
  date?: string;                // ISO, the file's time
  bytes?: number;
  /** How it was found: a card shows it, the app's own master render, a render row of spend.md, or by name only. */
  from: 'card' | 'render' | 'record' | 'name';
  /** The review card that shows it. */
  card?: { key: string; id?: string; title: string };
  /** The card that asks about it and is not answered yet (a yes), when there is one. */
  ask?: { key: string; id?: string; title: string };
  /** What sound it carries, in the record's words ("dialogue only"), when the record says. */
  sound?: string;
}

export interface PostInfo {
  cuts: string[];
  masters: string[];
  /** subtitles/ and social/ (.srt, .vtt): the caption files wherever the film keeps them (10 Nov). */
  captions: string[];
  kit?: string;
  /** The finished films: videos in cut/ and social/ named "final" or "as-posted" (10 Nov). */
  finals?: string[];
  /** Pieces made for the cut that are not takes: title cards, graphics, inserts. Videos in cut/cards/ and edits/ (one folder deep) (11 Nov). */
  pieces?: string[];
  /** The film's release file, social/release.json (Release, 14 Nov), in brief: there, and the master named as the final
   *  when one is (Film Flow v3.2: the release starts from it; no social/kit.md is made). */
  release?: { path: string; final?: { path: string; version?: string } };
  /** When each cut and finished film was last written (ISO), so a page can list them newest first (11 Nov). */
  written?: Record<string, string>;
}

// ---- The feed (10 Nov). Everything Alma shows the user is a card in the film's review/cards.json, as the film
// flow says. The harness reads that one file into FeedCards and puts each on the page of the work it belongs to,
// so a kind of work the pages have no panel for (a round of word readings, a music take, a title card, a light
// test, a before-and-after) still has a place, and a card that asks for a choice shows up at the gate.
/** Where a card belongs: a node of the flow board. */
export type FeedPlace = 'story' | 'loc' | 'views' | 'previz' | 'faces' | 'clothing' | 'sheet' | 'voices' | 'elements' | 'scenes' | 'edit' | 'finish' | 'sound' | 'release';
export const FEED_PLACES: FeedPlace[] = ['story', 'loc', 'views', 'previz', 'faces', 'clothing', 'sheet', 'voices', 'elements', 'scenes', 'edit', 'finish', 'sound', 'release'];
export interface FeedMedia {
  kind: 'video' | 'audio' | 'image' | 'file';
  path: string;                 // relative to the film folder
  label?: string;
  sub?: string;
  /** The option this file is, when the card asks for a pick among its files. */
  option?: string;
}
export interface FeedOption { id: string; label: string; path?: string }
/** What a card asks of the user. Only a card that says so asks: nothing is read out of its words. */
export interface FeedAsk {
  kind: 'pick' | 'yes' | 'go';  // choose one option · say yes to what is shown · give the go for a paid job
  options: FeedOption[];        // for "pick": the card's own options, else its files
  prediction?: string;          // the option Alma expects, said before the pick (taste.md)
  cost?: string;                // for "go": the quote, as written ("12 credits at 480p draft")
  /** Set once answered: by Alma on the card, or by the harness the moment the user clicks (harness/answers.json). */
  answer?: { option?: string; at?: string; note?: string; by: 'card' | 'harness' };
  /** In progress: the user wrote to Alma about the card instead of answering (harness), or Alma says on the card
   *  that she is working on it ("progress": "one line"). The options lock and the card leaves "Waiting for you". */
  progress?: { at?: string; note?: string; by: 'card' | 'harness' };
  /** The yes button's own words ("Post to TikTok now"): pressed once, it answers at once. Release, stage 3. */
  yesLabel?: string;
  /** A second button that answers no in its own words ("Cancel the ask"); comes back as option "no". */
  noLabel?: string;
}
export interface FeedCard {
  key: string;                  // stable within the film: the card's id, else a hash of where it sits and its title
  id?: string;                  // the card's own id, said in chat; a card that asks must have one
  title: string;
  sub?: string;
  text?: string[];              // paragraphs, markdown marks stripped
  who?: string;                 // the card's own "who": who the character it asks about is, in a sentence or two
  date?: string;                // ISO, from the card's "updated"
  section: string;              // the review record's section heading
  group?: string;               // the group path inside the section ("S3", "C01 Maren › Earlier rounds")
  place: FeedPlace;
  ids: string[];                // C01, L01, P02, S3, FIX-S3-laugh: what the card is about
  /** "card": the card says where it belongs (its "at" and "for"); "guess": read from its group and title (older cards). */
  placed: 'card' | 'guess';
  media: FeedMedia[];
  ask?: FeedAsk;
  /** Release, stage 3: a block of exact words, shown as they are (the caption as it will be posted). */
  quote?: string;
  /** A file named in one line, with its facts ("1:53, 101 MB"), not played. */
  fileLine?: { name: string; sub?: string; path?: string };
  /** A short note of Alma's, set apart under the words. */
  note?: string;
}
/** The part of the feed every page needs at once; the cards themselves come from GET /api/films/[film]/feed. */
export interface FeedSummary {
  counts: Partial<Record<FeedPlace, number>>;
  /** Cards that ask, have no answer yet and are not in progress, newest first. */
  asks: FeedCard[];
  /** Cards that ask and are being worked on instead of answered (FeedAsk.progress). */
  working?: FeedCard[];
  /** The user's yeses: cards that ask for a yes, answered with anything but a no or "replaced by …", in brief (the go
   *  for the first takes reads the yes on the boards and on each prop from them). */
  approvals?: FeedApproval[];
}
export interface FeedApproval { key: string; id?: string; place: FeedPlace; ids: string[]; title: string; at?: string }

// ---- Sound (10 Nov): stage 11's files, by name only. The rounds and their story are the feed's sound cards.
export interface SoundFile { path: string; name: string; bytes?: number; date?: string }
export interface SoundGroup { key: string; title: string; note: string; folder: string; files: SoundFile[]; more?: number }
/** How many sound files each folder group holds; the keys are SoundGroup keys. */
export interface SoundSummary {
  counts: Record<string, number>;
  /** The user's yes on a master at the Sound page (Film Flow v3.2, 11 Sound and music, the gate after the master): the
   *  newest answered yes card placed at `sound` whose title names a master. The finished sound is in the app's master. */
  masterYes?: { key: string; id?: string; title: string };
}
export interface SoundInfo {
  groups: SoundGroup[];         // only the groups the film has
  warnings: string[];
}

/** Thread events the UI renders, normalised from claude -p stream-json. */
export type ThreadEvent =
  | { kind: 'user'; id: string; at: string; text: string; context?: HarnessContext }
  | { kind: 'assistant_text'; id: string; at: string; text: string; partial?: boolean }
  | { kind: 'tool_use'; id: string; at: string; name: string; summary: string; input?: unknown }
  | { kind: 'tool_result'; id: string; at: string; toolUseId: string; summary: string; ok: boolean }
  | { kind: 'task'; id: string; at: string; task: TaskCard }           // an Agent spawn (sub-agent) and its updates
  | { kind: 'system'; id: string; at: string; text: string }            // one-line system notes ("QC · voices · not run …")
  | { kind: 'compaction'; id: string; at: string; summary: string }
  | { kind: 'result'; id: string; at: string; ok: boolean; costUsd?: number; durationMs?: number; sessionId: string }
  | { kind: 'error'; id: string; at: string; text: string };

export interface TaskCard {
  id: string;                   // the Agent tool_use id
  title: string;                // "Alma › faces · C01 round 2"  (always `Alma › <job> · <target>`)
  liveLine?: string;            // last tool call or progress line
  state: 'queued' | 'running' | 'done' | 'failed';
  startedAt: string; endedAt?: string;
  cost?: Cost;                   // filled by the UI from spend.md rows that name the card's target (live cards, 9 Nov)
  toolUses?: number;            // the sub-agent's tool calls so far (task_progress usage.tool_uses; live cards, 9 Nov)
  steps: { at: string; text: string }[];   // tool lines, Claude Code style
  result?: { text: string; opens?: { page: string; target?: string } };
}

/** What the composer sends with every message, built from the chips. Serialised as
 *  <harness-context film="…" page="…" selected="[…]">…</harness-context> before the user's text. */
export interface HarnessContext {
  film: string;                 // slug
  page: string;                 // route, e.g. "/films/maren-and-the-sea/scenes/S9"
  pinned: string;               // the pinned chip's text, e.g. "Maren · stage 3 · 4 of 4 voices picked"
  selected: Chip[];             // removable chips
  playhead?: string;            // SMPTE, when on a page with a player
}
/** `text` is the newest version's. `by`: who wrote a version, the user on the Story page or Alma. `settled`: the version the
 *  user said the script is to be written from. */
export interface StoryInfo {
  versions: { version: string; path: string; date?: string; by: 'you' | 'alma' }[];
  current: string;
  text: string;
  settled?: { version: string; at?: string };
}
export interface Chip {
  id: string; label: string; ref?: string;   // ref = file path or ID the chip points at
  /** A small picture shown in the chip (the page's own; never sent to Alma). */
  image?: string;
  /** While this chip is in the box, the box asks this instead of the page's own words (never sent to Alma). */
  placeholder?: string;
}

/** The models Alma can run on, as the Claude Code CLI names them (`--model`). '' leaves it to Claude Code's own setting. */
export const ALMA_MODELS = [
  { id: '', label: 'Default' },
  { id: 'fable', label: 'Fable' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
] as const;
export type AlmaModel = (typeof ALMA_MODELS)[number]['id'];
export interface ThreadInfo {
  film: string; sessionId?: string; messageCount: number; stage?: Stage; since?: string; running: TaskCard[];
  /** The model chosen for this film's Alma ('' = Claude Code's own setting, named in `defaultModel`). */
  model?: AlmaModel;
  defaultModel?: string;
  /** The model the CLI last said it is running, e.g. "claude-fable-5-2[1m]"; unset until a turn has started. */
  servedModel?: string;
  /** The reserve switch: `on` is the setting, `hasKey` whether a key is saved (never the key), `onKey`
   *  whether this Alma's current process was started on it (it differs from `on` while a flip waits for her to be idle). */
  reserve?: { on: boolean; hasKey: boolean; onKey: boolean };
  /** Alma is mid-turn on a message of this server's, or a message waits for her (`running` lists only helper agents).
   *  `since`: when the turn now running was handed to her; `queued`: messages waiting behind it. A turn the CLI starts
   *  by itself (a background job's report) is not counted: the pages see it in the thread. */
  turn?: { working: boolean; since?: string; queued: number };
}

// ---- The edit (build step 4). The timeline is a file in the film folder: cut/<version>.json.
export type TrackKind = 'video' | 'audio' | 'captions';
export interface TimelineClip {
  id: string;
  src?: string;                 // path relative to the film repo (assets/films/<film>/…), video or audio or an SRT for captions; absent on a subtitle line (text)
  text?: string;                // a subtitle line on a captions track (14 Nov): one or two lines, "\n" between them; such a clip has no src. On a planned clip (`plan`): the line's words, the shot's description
  in: number;                   // source in-point, seconds
  out: number;                  // source out-point, seconds
  at: number;                   // position on the timeline, seconds
  label?: string;               // "S3 · lamp take 2 · shot 4"
  takeRef?: { scene: string; take: string };
  gain?: number;                // dB, audio clips and the audio of video clips; default 0
  fadeIn?: number; fadeOut?: number;   // seconds
  muted?: boolean;
  speed?: number;               // playback rate, default 1 (0.75 = slowed); the clip lasts (out − in) / speed on the timeline (step 4a, 8 Nov)
  unlinked?: boolean;           // a picture clip or its sound, set free of the other (13 Nov): an edit on one no longer touches the other
  flip?: 'h';                   // picture clips: mirrored left to right (the render's hflip), wherever the clip is used
  dissolve?: number;            // seconds of dissolve (picture) or cross-fade (sound) with the clip that ends where this one starts on its track, centred on the join
  gainPoints?: { t: number; db: number }[];   // sound: level changes inside the clip, t in seconds of the source file (the clock of in and out), dB added to gain, linear in dB between points, flat before the first and after the last
  // ---- the timeline from day one (15 Nov 2026, ASKS 47; ARCHITECTURE.md "The timeline from day one"). A planned clip is
  // built by the app from the film's files (components/edit/planned.ts), never written by hand, and never rendered.
  /** 'line': a spoken line or an action on the Dialogue track (`text`, `who`, no src); 'shot': a planned shot on the
   *  picture track (`text`, `inFrame`, no src); 'board': the previz panel of a planned shot (`src` a still image). */
  plan?: PlanKind;
  scene?: string;               // the scene a planned clip belongs to ("S4")
  shot?: number;                // a planned shot's or board's number in its scene (1, 2 …)
  who?: string;                 // a line's speaker ("TOBIAS"); absent on an action
  inFrame?: string;             // who and what a planned shot shows ("the boy, Maren, the bottle")
  made?: string;                // what the app built, "<scene hash>.<clip hash>": a clip changed by hand no longer matches
  part?: number; parts?: number; // a planned line the previz take splits over several shots: this clip is part `part` of `parts`
  timing?: string;              // a planned line: where its time comes from, in words ("at previz take 9's times", or why it is at reading pace)
  /** A board that is one panel of its shot's storyboard: board `k` of the shot's `of`,
   *  `n` its number in the storyboard, `s` its time in the scene as the storyboard names it (seconds). Every panel of a
   *  shot is its own clip, from its own time to the next panel's; a take replaces all of a shot's panels together. */
  panel?: BoardPanel;
}
export interface BoardPanel { k: number; of: number; n: number; s: number }
export type PlanKind = 'line' | 'shot' | 'board';
export interface TimelineTrack {
  id: string;                   // "V1", "A1", "A2", "C1"
  kind: TrackKind;
  name: string;
  muted?: boolean; solo?: boolean; locked?: boolean;
  clips: TimelineClip[];
}
export interface TimelineMarker { at: number; text: string; by?: 'user' | 'alma' }
/** What a master's picture was made from (14 Nov): per source, the shots (picture clips, split at their takes' shot
 *  cuts as the Edit page shows them) and frames. A shot counts as "small" when any of its frames is scaled up from
 *  480p, else under the source that gives most of its frames. Absent on renders made before it was recorded. */
export interface PictureSource { kind: 'take' | 'upscaled' | 'original' | 'base' | 'small'; shots: number; frames: number }
export interface PictureMade {
  sources: PictureSource[];
  shots: number; frames: number;
  /** The upscaled cut used: its version, its file (relative to the film repo) and the cheap pass's name. */
  base?: { version: string; path: string; label: string };
}
export interface RenderInfo { path: string; at: string; hash: string; seconds?: number; picture?: PictureMade }
export interface Timeline {
  version: string;              // "v12" — the file is cut/v12.json; every change writes the next version
  fps: 24 | 25 | 30;
  width: number; height: number;   // 1080×1920 for 9:16
  basedOn?: string;             // previous version
  note?: string;                // what changed, one line (Alma or the user)
  by?: 'user' | 'alma' | 'migration';
  at: string;                   // ISO
  tracks: TimelineTrack[];
  markers: TimelineMarker[];
  /** master: the newest master (the master of the version); earlierMasters: the masters made before it, oldest first,
   *  each with its own record (a master made again is a new file beside the first, masters.ts). */
  renders?: { proxy?: RenderInfo; master?: RenderInfo; earlierMasters?: RenderInfo[] };
}

/** One version file of the cut, as listed (cut/v<n>.json). */
export interface TimelineVersionRef {
  version: string; at: string; note?: string; by?: Timeline['by']; basedOn?: string;
  /** What the version file records as made from it (its `renders`): a 480p, a master (the versions menu's marks, 15 Nov). */
  made?: { proxy?: true; master?: true };
}
/** The marks of a version as listed: the renders its file records (`renders.proxy`, `renders.master`). */
export const madeOf = (t: { renders?: Timeline['renders'] }): TimelineVersionRef['made'] => {
  const proxy = !!t.renders?.proxy?.path, master = !!t.renders?.master?.path || !!t.renders?.earlierMasters?.length;
  return proxy || master ? { ...(proxy ? { proxy: true as const } : {}), ...(master ? { master: true as const } : {}) } : undefined;
};
export type RenderKind = 'proxy' | 'master';
/** What a render can be asked for beyond its kind (13 Nov). A render with options writes new files beside the plain
 *  render (cut/renders/<version>-<kind>-<tag>…); a render without options is exactly the plain one. */
export interface RenderOptions {
  loudness?: { lufs: number; truePeak?: number };   // the full mix brought to this integrated loudness (LUFS, −40 to −5), its true peak at or under truePeak (dBTP, −9 to 0, default −1)
  stems?: boolean;              // also writes the picture alone, each sound track alone, dialogue only, everything but dialogue, and the mix (WAV)
  leaveOut?: { tracks?: string[]; clips?: string[]; cards?: boolean };   // track or clip ids not drawn or heard (black or silence in their place, length kept); cards: every clip labelled "Title card…"
  small?: true;                 // a master only, not with stems (14 Nov, ASKS 56): the same render with the same other options, its picture encoded again smaller (x264 veryslow, CRF 21), its sound copied untouched
}
/** What the smaller file of a render (options.small) was made from and what it measured against it. */
export interface RenderSmall {
  from: string;                 // the file it was encoded from, relative to the film folder; a render made for it and not kept: "made for it, not kept"
  made: boolean;                // true: the normal render was made first for it (and not kept); false: an existing render was used
  fromBytes: number; bytes: number;   // the sizes before and after
  frames: number;               // frame count, the same in both (checked)
  ssim: number;                 // SSIM of the smaller file against the one it came from, the whole film (ffmpeg ssim, All)
  sound: { codec: string; seconds: number; copied: boolean };   // the sound stream: its codec, its length, and that its packets are byte for byte the source's
  encode: string;               // "libx264 veryslow CRF 21"
}
/** One file a render wrote, relative to the film folder. */
export interface RenderOutput { path: string; what: string }
/** The loudness pass of a render: what the mix measured before, what the written file measured after. */
export interface RenderLoudness {
  target: number; ceiling: number;                  // LUFS, dBTP asked for
  before: { i: number; tp: number; lra: number };   // the mix as the cut makes it
  after: { i: number; tp: number };                 // the written file's sound, measured by ebur128 (true peak)
  mode: 'linear' | 'limiter';                       // linear: one gain for the whole mix; limiter: the gain, then a true-peak limiter at the ceiling, when one gain would pass it
  gain: number;                                     // dB, the gain applied (before the limiter, in limiter mode)
}
/** A render of one version: queued and running live in the server's queue; done and failed also come from the files. */
export interface RenderState {
  version: string;
  kind: RenderKind;
  state: 'none' | 'queued' | 'running' | 'done' | 'failed';
  percent?: number;             // 0–100 while running
  path?: string;                // cut/renders/<version>-<kind>.mp4, relative to the film folder
  log?: string;                 // cut/renders/<version>.log
  seconds?: number;             // how long the render took
  error?: string;
  queuedAt?: string; startedAt?: string; finishedAt?: string;
  options?: RenderOptions;      // a render with options (13 Nov); absent on the plain proxy and master
  tag?: string;                 // the options in the file names: "lufs14-tp1", "without-cards", "stems"
  outputs?: RenderOutput[];     // every file it wrote, when done
  loudness?: RenderLoudness;    // with options.loudness, when measured
  leftOut?: string[];           // what options.leaveOut took out, in words
  picture?: PictureMade;        // a master: what its picture was made from (14 Nov)
  small?: RenderSmall;          // with options.small, when measured
}
export interface CutRenders { proxy?: RenderState; master?: RenderState; variants?: RenderState[] }

// ---- The go for the video (9 Nov): the one hard spend gate (SPEC principle 7, §4 "Go for the video").
// GET /api/films/[film]/go serves it, read from each scene's prompt/ folder, its shots and scene files, and spend.md.
// Paths are relative to the film folder, as everywhere in FilmState.

/** One reference of a generation's media list, at the number the prompt cites it by ("VIDEO REFERENCE 1" = V1). */
export interface GoMediaItem {
  order: number;                // 1-based position in the media list (the order sent with the job)
  kind: 'VIDEO' | 'IMAGE' | 'AUDIO';
  n: number;                    // the number within its kind
  ref: string;                  // "V1", "I4", "A1"
  tag: string;                  // "MAREN", "THE LAMP ROOM", "PAGE 2"
  what: string;                 // "C02 element", "C05-C06 sheet", "P01 prop", "L01 view", "boards v4 · page 2", "voice line"
  file: string;                 // the file sent, relative to the film folder
  desc?: string;                // the media list's description (what the prompt says about it)
  view?: boolean;
  page?: number;
  missing?: boolean;            // the file is not on disk
}
export interface GoCheck {
  path: string;
  verdict?: 'pass' | 'fail';    // the last line: PASS, or "<n> STOP(S): do not submit"
  summary?: string;             // the first line ("S3 v5: 22462 chars | 3 videos (15.1 s) | 11 images (6 pages) | 0 audio | 25 s generation")
  lines: string[];              // every line of the file
}
/** A line diff of the prompt against the version before it: runs of kept or added lines of the current text
 *  (by count, in order) and the removed lines (by text). */
export type GoDiffOp = { op: '=' | '+'; count: number } | { op: '-'; lines: string[] };
export interface GoPrompt {
  version: string;              // "v6"
  path: string;
  text: string;
  chars: number;
  previous?: { version: string; diff: GoDiffOp[]; added: number; removed: number };
  check?: GoCheck;
  media?: {
    path: string;
    settings: { model?: string; mode?: string; duration?: number; aspect?: string; resolution?: string; draft?: boolean; audio?: boolean };
    previzTake?: string;
    storyboard?: string;
    items: GoMediaItem[];
  };
  takeMediasPath?: string;      // the take-medias file (the list as uploaded), when written
}
export interface GoShot { id: string; name?: string; facing?: string; t0?: number; t1?: number }
/** What the go needs from a scene, and why it is not ready when it is not. */
export interface GoScene {
  id: string;
  title: string;
  folder: string;
  seconds?: number;             // the scene file's length
  shotsSeconds?: number;        // the shots file's duration
  shots: GoShot[];
  versions: string[];           // every prompt version, oldest first
  prompt?: GoPrompt;            // the newest version
  takes: number;                // takes (not pick-ups) the scene has
  lastTake?: { id: string; version?: string; date?: string };  // the newest take and the prompt version it ran
  ready: boolean;               // newest prompt checked PASS, with a media list whose files are all there
  blockers: string[];           // why not: "v6 has no check yet", "I3 missing: props/…", …
  warnings: string[];           // what to look at: "the media list sends 25 s; the shots file says 27 s"
  duration?: number;            // the seconds the job asks for (the media list's settings, else the shots file rounded up)
  credits?: number;             // duration × the rate
}
export interface GoRate {
  crPerSec: number;             // 3
  resolution: string;           // "480p"
  basis: string;                // "3 cr/s at 480p draft: 14 seedance_2_5 rows in spend.md, the newest S5 prompt v5 take 1 (8 Nov)"
  rows: number;
}
export interface GoReview {
  film: string;
  scenes: GoScene[];            // every scene in film order; the UI filters (no take yet, or all)
  rate?: GoRate;
  balance?: { credits: number; date?: string; source: string };   // the last balance the record mentions
  warnings: string[];
}

// ---- Notifications (9 Nov). One server-wide SSE (GET /api/notify) of what happened in any film's thread,
// so the UI can count unread per film, badge the sidebar and the tab title, and raise a browser notification.
export type NoticeKind = 'turn' | 'task' | 'pick';
export interface HarnessNotice {
  id: string;                   // "<kind>:<event or card id>"
  seq: number;                  // emission number on this server (the SSE id; ?after=<seq> replays what came later)
  film: string;                 // slug, or "library"
  filmTitle: string;            // "Maren" (the short name the pinned chip uses), "Library"
  kind: NoticeKind;             // Alma finished a turn · a sub-agent finished · picks are waiting at the gate
  at: string;                   // ISO
  text: string;                 // one line: "faces · C02 · 15 faces landed", "2 picks waiting"
  taskId?: string;              // the card, for kind "task"
}
