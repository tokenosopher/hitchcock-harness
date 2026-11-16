// The release file, <film>/social/release.json (Release, 14 Nov 2026): the one source for the Release page, the
// platform pages and Alma. Its shape, and the check that says in plain words what is wrong with one (as
// validateTimeline does for the cut). Pure; the reader and the writer are src/server/release/file.ts.
//
// Who writes what (recipes/release.md says it to Alma):
//   the page, for the user: a pick, the user's own text, a fact's value, a tick, the route, a link or unlink, the
//     final, an ask and its cancel, a pasted link, "posted, link later", the answer to a note (operations in ops.ts);
//   Alma: candidates, aims, notes, the steps by hand, the post and its link when the user tells her (send.posted),
//     new facts and platforms.
// Every post is made by hand by the user in this copy: every platform's route is "hand" (a file that says otherwise,
// or says nothing, is read as "hand"), and `upload.bufferSets` stays empty.
// States are never stored: derive.ts works them out from this file and the clock.
import { isKind, type PlatformKind } from './platforms';

export const RELEASE_REL = 'social/release.json';
export const RELEASE_VERSION = 1;

/** A file made from the final master: where it is, and (for a render) the options it is asked with. */
export interface Companion { path: string; options?: Record<string, unknown> }

/** The master named as the final: every platform gets this file. */
export interface ReleaseFinal {
  /** The master, relative to the film folder ("cut/renders/v236-master.mp4"). */
  path: string;
  /** The cut version it is a master of ("v236"). */
  version: string;
  namedAt: string;
  /** The name it goes out as ("The Lighthouse - FINAL captioned.mp4"). */
  name: string;
  /** The files made from it: the copy without subtitles, the 480p preview, the subtitle file. Absent: not made
   *  (no subtitles in the final: `clean` is the final itself and there is no `srt`). `post` (14 Nov, ASKS 56): the
   *  smaller file of the final, the file that goes out once it is made (outfile.ts); the final itself when the final
   *  is a smaller file already; absent on finals named before it existed (then the final goes out, as before). */
  companions: { clean?: Companion; phone?: Companion; srt?: Companion; post?: Companion };
  /** The finals named before this one, oldest first. */
  before?: { path: string; version: string; namedAt: string }[];
}

/** Something only the user can say, confirmed before it appears in any text. `sentence` has one blank, "___"
 *  ("Cost about ___ Higgsfield credits"); a text uses the fact as `{id}` and shows its value there. */
export interface Fact {
  id: string;
  /** How a sentence names it: "the days it took", "the cost". */
  label: string;
  /** The label is plural ("the days it took are not confirmed"). */
  many?: boolean;
  sentence: string;
  value?: string;
  confirmedAt?: string;
}

export interface Candidate { id: string; text: string; does: string }
/** What Alma aims for, said in her words ("aim under 90, so the feed shows it whole"). Outside it is amber. */
export interface Aim { min?: number; max?: number; words: string }

/** What a note's button does, written by Alma with the note; the page applies it without knowing any rule. */
export type Effect =
  | { kind: 'set'; field: string; platforms: string[]; text: string }
  | { kind: 'unlink'; field: string; platform: string }
  | { kind: 'link'; field: string; platforms: string[] };
export interface NoteAction { id: string; label: string; effect: Effect[]; small?: string }
/** The fields as they were before a note's answer, for its undo: platform → field → what changed. */
export type FieldSnapshot = Record<string, Record<string, Pick<Field, 'text' | 'own' | 'pick' | 'sharedWith'>>>;
export interface Note {
  id: string; at: string; text: string; proposal?: string;
  /** The one Alma recommends first. */
  actions: NoteAction[];
  answered?: { action: string; at: string; before: FieldSnapshot };
}

export interface Field {
  id: string;
  label: string;
  /** The posted part it goes into (platforms.ts parts: "caption", "title", "description", "tags"); default the first. */
  part?: string;
  /** Tags: counted in tags, and shown in the page's Tags box even when the platform puts them inside another text
   *  (ASKS 57). Alma marks a tags field with it; a file written before 14 Nov 2026 is read by the field's words
   *  (derive.ts isTagField). */
  tags?: boolean;
  /** The text in use; "" while nothing is picked (or, with `own`, emptied by the user writing its box whole). */
  text: string;
  /** The user's own text (not a candidate). */
  own?: boolean;
  /** The candidate in use. */
  pick?: string;
  candidates: Candidate[];
  aim?: Aim;
  /** The other platforms whose field of the same id is this very text (both ways). */
  sharedWith?: string[];
  /** The text Alma last read, and when. */
  readByAlma?: { at: string; text: string };
  notes?: Note[];
}

export interface Step { id: string; text: string; done?: string }
export interface Upload {
  /** Not used in this copy (every post is made by hand): always []. Kept so older files still check out. */
  bufferSets: { label: string; value: string }[];
  /** What the user does in the app right after it posts. */
  after: Step[];
  /** The steps by hand, worded as actions. */
  hand: Step[];
}

export interface Send {
  /** The user asked for it ("Post TikTok now"): when, and the exact text of each field at that moment. */
  asked?: { at: string; when: 'now' | string; text: Record<string, string>; file?: string };   // file: the file that goes out, as the page named it at the ask (outfile.ts); absent on asks before 14 Nov (the final)
  go?: { at: string };
  /** `scheduled`, `sending`, `failed` and `requested` belong to a posting service this copy does not have: a post by
   *  hand never writes them. They are kept so an older file still checks out. */
  scheduled?: { for: string; bufferPostId?: string };
  sending?: { since: string; steps?: { label: string; at?: string }[]; inBuffer?: string; platformHas?: string };
  posted?: { at: string; link?: string };
  failed?: { at: string; reason: string; checked?: { at: string; text: string }; fix?: string; fixAction?: { label: string; href?: string; ask?: string }; cleared?: string };
  requested?: { unschedule?: string; stop?: string; check?: string };
}

/** A frame of the final to pick as the thumbnail (stage 2): `at` its time in seconds, `does` what it shows. */
export interface ThumbOption { id: string; at: number; does: string }
/** The thumbnail choice of a platform that has one: the options Alma offers, the one in use, and where it is set
 *  ("the frame to pick in YouTube"). A pick on one platform is the pick on every platform with a thumbnail (ASKS 55);
 *  `own: true` marks one that keeps its own (its picks do not spread, the others' do not change it). */
export interface Thumbnail { options: ThumbOption[]; pick?: string; where?: string; own?: true }

export interface Platform {
  id: string;
  kind: PlatformKind;
  name: string;
  account: string;
  /** Always "hand": the user posts it (validateRelease reads any other route, or none, as "hand"). */
  route: 'hand';
  /** Who set its route, and when (older files). */
  routeBy?: { by: 'user' | 'alma'; at: string };
  also?: string[];
  wave: { day: 'today' | 'tomorrow'; about: string };
  fields: Field[];
  /** The thumbnail to pick, when the platform has one. */
  thumbnail?: Thumbnail;
  upload: Upload;
  send: Send;
}

export interface ReleaseFile {
  v: 1;
  /** The day "today" means for the waves, "2026-11-14". */
  day: string;
  final?: ReleaseFinal;
  facts: Fact[];
  /** In posting order. */
  platforms: Platform[];
}

// ---- the check

const str = (v: unknown): v is string => typeof v === 'string';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const iso = (v: unknown): boolean => str(v) && !Number.isNaN(Date.parse(v));
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** `{id}` in a text: a fact it uses. */
export const FACT_TOKEN = /\{([a-z][a-z0-9-]*)\}/g;
export const factIdsIn = (text: string): string[] => [...new Set([...text.matchAll(FACT_TOKEN)].map((m) => m[1]))];

/** The file checked: `file` when it is a release file, and every problem in a short plain sentence. */
export function validateRelease(raw: unknown): { file?: ReleaseFile; problems: string[] } {
  const p: string[] = [];
  if (!obj(raw)) return { problems: ['The file is not a JSON object.'] };
  if (raw.v !== RELEASE_VERSION) p.push(`"v" must be ${RELEASE_VERSION}.`);
  if (!str(raw.day) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) p.push('"day" must be the release day as "2026-11-14".');
  const facts = Array.isArray(raw.facts) ? raw.facts : (p.push('"facts" must be a list (it may be empty).'), []);
  const factIds = new Set<string>();
  facts.forEach((f: unknown, i) => {
    const at = `Fact ${i + 1}`;
    if (!obj(f)) return void p.push(`${at} is not an object.`);
    if (!str(f.id) || !ID.test(f.id)) p.push(`${at} needs an id of small letters, digits and dashes.`);
    else if (factIds.has(f.id)) p.push(`Two facts are called "${f.id}".`);
    else factIds.add(f.id);
    if (!str(f.label) || !f.label.trim()) p.push(`${at} needs a label ("the days it took").`);
    if (!str(f.sentence) || !f.sentence.includes('___')) p.push(`${at} needs a sentence with one blank, "___".`);
    if (f.value !== undefined && !str(f.value)) p.push(`${at}: its value must be text.`);
    if (f.confirmedAt !== undefined && !iso(f.confirmedAt)) p.push(`${at}: confirmedAt must be a time.`);
    if (f.confirmedAt && !(str(f.value) && f.value.trim())) p.push(`${at} is confirmed without a value.`);
  });
  if (raw.final !== undefined) {
    const f = raw.final;
    if (!obj(f)) p.push('"final" must be an object.');
    else {
      if (!str(f.path) || !f.path || f.path.startsWith('/') || f.path.includes('..')) p.push('The final needs a path inside the film folder.');
      if (!str(f.version) || !/^v\d+$/.test(f.version)) p.push('The final needs the cut version it is of ("v236").');
      if (!iso(f.namedAt)) p.push('The final needs the time it was named.');
      if (!str(f.name) || !f.name) p.push('The final needs the name it goes out as.');
      if (!obj(f.companions)) p.push('The final needs "companions" (an object, maybe empty).');
      else for (const k of ['clean', 'phone', 'srt', 'post']) {
        const c = f.companions[k];
        if (c !== undefined && !(obj(c) && str(c.path) && c.path)) p.push(`The final's ${k} needs a path.`);
      }
    }
  }
  const plats = Array.isArray(raw.platforms) ? raw.platforms : (p.push('"platforms" must be a list (it may be empty).'), []);
  const ids = new Set<string>();
  for (const x of plats) if (obj(x) && str(x.id)) ids.add(x.id);
  const seen = new Set<string>();
  plats.forEach((x: unknown, i) => {
    if (!obj(x)) return void p.push(`Platform ${i + 1} is not an object.`);
    const name = str(x.name) && x.name ? x.name : `Platform ${i + 1}`;
    if (!str(x.id) || !ID.test(x.id)) p.push(`${name} needs an id of small letters, digits and dashes.`);
    else if (seen.has(x.id)) p.push(`Two platforms are called "${x.id}".`);
    else seen.add(x.id);
    if (!isKind(x.kind)) p.push(`${name}: "kind" must be one of reddit, youtube-shorts, tiktok, instagram-reels, facebook, threads, x, linkedin.`);
    if (!str(x.name) || !x.name) p.push(`Platform ${i + 1} needs a name.`);
    if (!str(x.account)) p.push(`${name} needs the account it posts from.`);
    // every post goes by hand in this copy: an older file's other route, or none, is read as "hand"
    x.route = 'hand';
    if (x.also !== undefined && !(Array.isArray(x.also) && x.also.every(str))) p.push(`${name}: "also" must be a list of names.`);
    const w = x.wave;
    if (!obj(w) || (w.day !== 'today' && w.day !== 'tomorrow') || !str(w.about) || !/^\d{1,2}:\d{2}$/.test(w.about)) p.push(`${name} needs a wave: {"day": "today" or "tomorrow", "about": "19:00"}.`);
    const fields = Array.isArray(x.fields) ? x.fields : (p.push(`${name}: "fields" must be a list.`), []);
    const fids = new Set<string>();
    fields.forEach((f: unknown, j) => {
      if (!obj(f)) return void p.push(`${name}, field ${j + 1} is not an object.`);
      const fl = `${name} ${str(f.label) && f.label ? f.label.toLowerCase() : `field ${j + 1}`}`;
      if (!str(f.id) || !ID.test(f.id)) p.push(`${fl} needs an id of small letters, digits and dashes.`);
      else if (fids.has(f.id)) p.push(`${name} has two fields called "${f.id}".`);
      else fids.add(f.id);
      if (!str(f.label) || !f.label) p.push(`${name}, field ${j + 1} needs a label.`);
      if (!str(f.text)) p.push(`${fl}: "text" must be text ("" while nothing is picked).`);
      if (!Array.isArray(f.candidates) || !f.candidates.every((c) => obj(c) && str(c.id) && str(c.text) && str(c.does))) p.push(`${fl}: each candidate needs an id, a text and what it does.`);
      else if (new Set(f.candidates.map((c) => (c as Candidate).id)).size !== f.candidates.length) p.push(`${fl} has two candidates with one id.`);
      if (f.pick !== undefined && !(Array.isArray(f.candidates) && f.candidates.some((c) => obj(c) && c.id === f.pick))) p.push(`${fl}: the pick "${String(f.pick)}" is not one of its candidates.`);
      if (f.pick !== undefined && f.own) p.push(`${fl} is both a pick and the user's own text.`);
      if (f.tags !== undefined && typeof f.tags !== 'boolean') p.push(`${fl}: "tags" is true or false.`);
      if (f.aim !== undefined && !(obj(f.aim) && str(f.aim.words) && (f.aim.min === undefined || typeof f.aim.min === 'number') && (f.aim.max === undefined || typeof f.aim.max === 'number'))) p.push(`${fl}: an aim needs its words and numbers.`);
      if (f.sharedWith !== undefined) {
        if (!Array.isArray(f.sharedWith) || !f.sharedWith.every(str)) p.push(`${fl}: "sharedWith" must be a list of platform ids.`);
        else for (const o of f.sharedWith) if (!ids.has(o)) p.push(`${fl} is shared with "${o}", which is not a platform here.`);
      }
      if (str(f.text)) for (const id of factIdsIn(f.text)) if (!factIds.has(id)) p.push(`${fl} uses the fact {${id}}, which is not in "facts".`);
      if (f.notes !== undefined) {
        if (!Array.isArray(f.notes)) p.push(`${fl}: "notes" must be a list.`);
        else f.notes.forEach((n: unknown, k) => {
          if (!obj(n) || !str(n.id) || !iso(n.at) || !str(n.text) || !Array.isArray(n.actions)) return void p.push(`${fl}, note ${k + 1} needs an id, a time, its words and a list of actions.`);
          for (const a of n.actions as unknown[]) {
            if (!obj(a) || !str(a.id) || !str(a.label) || !Array.isArray(a.effect)) { p.push(`${fl}, note "${n.id}": each action needs an id, a label and its effect.`); continue; }
            for (const e of a.effect as unknown[]) {
              const ok = obj(e) && str(e.field) && (
                (e.kind === 'set' && Array.isArray(e.platforms) && e.platforms.every((q) => str(q) && ids.has(q)) && str(e.text))
                || (e.kind === 'unlink' && str(e.platform) && ids.has(e.platform))
                || (e.kind === 'link' && Array.isArray(e.platforms) && e.platforms.length > 1 && e.platforms.every((q) => str(q) && ids.has(q))));
              if (!ok) p.push(`${fl}, note "${n.id}", action "${a.id}": an effect is "set" (field, platforms, text), "unlink" (field, platform) or "link" (field, two or more platforms).`);
            }
          }
        });
      }
    });
    if (x.thumbnail !== undefined) {
      const t = x.thumbnail;
      const good = obj(t) && Array.isArray(t.options) && t.options.every((o) => obj(o) && str(o.id) && typeof o.at === 'number' && o.at >= 0 && str(o.does))
        && (t.where === undefined || str(t.where));
      if (!good) p.push(`${name}: "thumbnail" needs options (an id, its time "at" in seconds, and what it shows).`);
      else if (t.pick !== undefined && !(t.options as { id: string }[]).some((o) => o.id === t.pick)) p.push(`${name}: the thumbnail "${String(t.pick)}" is not one of its options.`);
      if (obj(t) && t.own !== undefined && t.own !== true) p.push(`${name}: the thumbnail's "own" is true or left out.`);
    }
    const up = x.upload;
    const steps = (v: unknown) => Array.isArray(v) && v.every((s) => obj(s) && str(s.id) && str(s.text) && (s.done === undefined || iso(s.done)));
    if (!obj(up) || !Array.isArray(up.bufferSets) || !up.bufferSets.every((b) => obj(b) && str(b.label) && str(b.value)) || !steps(up.after) || !steps(up.hand)) {
      p.push(`${name}: "upload" needs bufferSets (label, value), after and hand (steps with an id and words).`);
    }
    const sd = x.send;
    if (!obj(sd)) p.push(`${name}: "send" must be an object (empty until it is asked for).`);
    else {
      if (sd.asked !== undefined && !(obj(sd.asked) && iso(sd.asked.at) && (sd.asked.when === 'now' || iso(sd.asked.when)) && obj(sd.asked.text))) p.push(`${name}: send.asked needs at, when ("now" or a time) and the text it was asked with.`);
      if (obj(sd.asked) && sd.asked.file !== undefined && !(str(sd.asked.file) && sd.asked.file && !sd.asked.file.startsWith('/') && !sd.asked.file.includes('..'))) p.push(`${name}: send.asked.file must be a path inside the film folder.`);
      if (sd.go !== undefined && !(obj(sd.go) && iso(sd.go.at))) p.push(`${name}: send.go needs at.`);
      if (sd.go !== undefined && sd.asked === undefined) p.push(`${name} has a go without an ask.`);
      if (sd.scheduled !== undefined && !(obj(sd.scheduled) && iso(sd.scheduled.for))) p.push(`${name}: send.scheduled needs "for", a time.`);
      if (sd.sending !== undefined && !(obj(sd.sending) && iso(sd.sending.since))) p.push(`${name}: send.sending needs "since", a time.`);
      if (sd.posted !== undefined && !(obj(sd.posted) && iso(sd.posted.at) && (sd.posted.link === undefined || str(sd.posted.link)))) p.push(`${name}: send.posted needs at (and a link when there is one).`);
      if (sd.failed !== undefined && !(obj(sd.failed) && iso(sd.failed.at) && str(sd.failed.reason))) p.push(`${name}: send.failed needs at and the reason.`);
      // stage 3: the sending record's extras
      if (obj(sd.sending) && sd.sending.platformHas !== undefined && !iso(sd.sending.platformHas)) p.push(`${name}: send.sending.platformHas must be a time.`);
      if (obj(sd.sending) && sd.sending.inBuffer !== undefined && !iso(sd.sending.inBuffer)) p.push(`${name}: send.sending.inBuffer must be a time.`);
      if (obj(sd.sending) && sd.sending.steps !== undefined && !(Array.isArray(sd.sending.steps) && sd.sending.steps.every((s) => obj(s) && str(s.label) && (s.at === undefined || iso(s.at))))) p.push(`${name}: send.sending.steps are {label, at?}.`);
      if (obj(sd.failed) && sd.failed.cleared !== undefined && !iso(sd.failed.cleared)) p.push(`${name}: send.failed.cleared must be a time.`);
      if (obj(sd.failed) && sd.failed.fixAction !== undefined && !(obj(sd.failed.fixAction) && str(sd.failed.fixAction.label) && (str(sd.failed.fixAction.href) || str(sd.failed.fixAction.ask)))) p.push(`${name}: send.failed.fixAction needs a label and an href or an ask.`);
      if (sd.requested !== undefined && !(obj(sd.requested) && Object.entries(sd.requested).every(([k, v]) => ['unschedule', 'stop', 'check'].includes(k) && iso(v)))) p.push(`${name}: send.requested holds unschedule, stop or check, each a time.`);
    }
  });
  // a shared text is one text: both ways, the same words
  if (!p.length) {
    const f = raw as unknown as ReleaseFile;
    for (const pl of f.platforms) for (const fl of pl.fields) for (const o of fl.sharedWith ?? []) {
      const other = f.platforms.find((q) => q.id === o)?.fields.find((q) => q.id === fl.id);
      if (!other) p.push(`${pl.name} ${fl.label.toLowerCase()} is shared with ${o}, which has no field "${fl.id}".`);
      else if (!(other.sharedWith ?? []).includes(pl.id)) p.push(`${pl.name} ${fl.label.toLowerCase()} is shared with ${o}, but not the other way.`);
      else if (other.text !== fl.text && pl.id < o) p.push(`${pl.name} and ${o} share ${fl.label.toLowerCase()} but their texts differ.`);
    }
  }
  return p.length ? { problems: p } : { file: raw as unknown as ReleaseFile, problems: [] };
}

/** A new file for a film with no release yet: the day, no facts, no platforms (Alma adds them). */
export const emptyRelease = (day: string): ReleaseFile => ({ v: 1, day, facts: [], platforms: [] });
