// What's next (14 Nov 2026, ASKS 47; first named "What is left", renamed on the user's word of 14 Nov). The user: "a
// video is not done until it's been published on all of the social media platforms … If it's 480p it has to be
// updated to 1080p. If it's 1080p we need to have the film rendered. If the film is rendered we need to publish it … Making the sound and the songs for the video should also be a step before
// rendering … at the end, select the rendering that you want to go out"). Pure: the Edit page's "What's next" tab, its
// route and scripts/left-test.ts use it.
//
// Seven steps in the user's own order. Each says whether it is done and one line of facts read from the film; the
// current step is the first that is not done. Where the app cannot know (the cut approved when the record does not say
// it, the sound listened through, a film without subtitles), the user ticks the step. The ticks are kept with the film
// in <film>/harness/left.json, each with the cut version it was made on. No judgement: facts and the user's own ticks.
import type { FeedCard, PictureMade, Timeline, TimelineClip } from '@/server/types';
import type { CutGap, RenderPart } from './sameCut';
import { PENDING_STATE } from './history';
import { EARLY_NAME, EARLY_SHORT, type EarlyDo, type EarlyId, type EarlyStep } from './early';

export const LEFT_REL = 'harness/left.json';
/** The tab's name, the same everywhere a person or Alma reads it (the user, 14 Nov: "'What's next' only relates to
 *  everything"). The tab shows beside it the number of steps still to do (`LeftView.left`). */
export const NEXT_TAB = "What's next";
export const LEFT_NOTE = `The user's own ticks on the Edit page's "${NEXT_TAB}" tab, each with the cut version it was made on. Only the user sets or takes back a tick.`;

export type TickId = 'approved' | 'sound' | 'subs';
export const TICK_IDS: TickId[] = ['approved', 'sound', 'subs'];
/** A tick: when, the version the cut was (its name, for the words) and, since 15 Nov (stage 3b), the state it was
 *  made on (its content's hash in the history, and the step's rev while the history holds it) and whether that state
 *  had edits since the version. */
export interface Tick { at: string; cut: string; state?: string; step?: number; edited?: boolean }
export interface LeftFile { note?: string; ticks: Partial<Record<TickId, Tick>> }

const VERSION = /^v\d+$/;
const HASH = /^[0-9a-f]{16}$/;
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
export const vnum = (v: string): number => Number(/\d+/.exec(v)?.[0] ?? 0);

/** The file as read: unknown steps and broken ticks are dropped. Undefined when it is not a ticks file at all. */
export function cleanLeft(raw: unknown): LeftFile | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const t = (raw as { ticks?: unknown }).ticks;
  if (t === undefined) return { ticks: {} };
  if (!t || typeof t !== 'object' || Array.isArray(t)) return undefined;
  const ticks: LeftFile['ticks'] = {};
  for (const id of TICK_IDS) {
    const x = (t as Record<string, unknown>)[id] as Partial<Tick> | undefined;
    if (x && isIso(x.at) && typeof x.cut === 'string' && VERSION.test(x.cut)) ticks[id] = { at: x.at, cut: x.cut, ...(typeof x.state === 'string' && HASH.test(x.state) ? { state: x.state } : {}), ...(int(x.step) ? { step: x.step } : {}), ...(x.edited === true ? { edited: true } : {}) };
  }
  return { ticks };
}

/** One change the page asks for: a tick on the cut shown (the version it is, and the state it is at), or a tick taken
 *  back. */
export type TickOp = { tick: TickId; cut: string; state?: string; step?: number; edited?: boolean } | { untick: TickId };
export function parseTickOp(raw: unknown): TickOp | undefined {
  const o = raw as { tick?: unknown; untick?: unknown; cut?: unknown; state?: unknown; step?: unknown; edited?: unknown } | null;
  if (!o || typeof o !== 'object') return undefined;
  if (typeof o.tick === 'string' && TICK_IDS.includes(o.tick as TickId) && typeof o.cut === 'string' && VERSION.test(o.cut)) {
    if (o.state !== undefined && (typeof o.state !== 'string' || !HASH.test(o.state))) return undefined;
    if (o.step !== undefined && !int(o.step)) return undefined;
    return { tick: o.tick as TickId, cut: o.cut, ...(typeof o.state === 'string' ? { state: o.state } : {}), ...(int(o.step) ? { step: o.step } : {}), ...(o.edited === true ? { edited: true } : {}) };
  }
  if (typeof o.untick === 'string' && TICK_IDS.includes(o.untick as TickId)) return { untick: o.untick as TickId };
  return undefined;
}
export function applyTick(file: LeftFile | undefined, op: TickOp, now: string): LeftFile {
  const ticks = { ...(file?.ticks ?? {}) };
  if ('tick' in op) ticks[op.tick] = { at: now, cut: op.cut, ...(op.state ? { state: op.state } : {}), ...(op.step !== undefined ? { step: op.step } : {}), ...(op.edited ? { edited: true } : {}) };
  else delete ticks[op.untick];
  return { note: LEFT_NOTE, ticks };
}

/** What GET /api/films/<film>/left answers: the ticks, the record's yes for a cut, the newest master of any version
 *  and the release file in brief. */
export interface LeftAnswer {
  note: string;
  ticks: LeftFile['ticks'];
  approved?: { version: string; card: string };
  newestMaster?: string;
  /** That master's file and its record (when it was made, what its picture was made from), for its own out-of-date
   *  check against what the page would use now (masters.ts masterAge). */
  masterFile?: MasterFileBrief;
  release?: { final?: { version: string }; platforms: number; posted: number };
  /** What the render reads of the versions the page compares with the cut now (ASKS 49, sameCut.ts): the newest
   *  master's, the final's, and any the page asked for (`?v=`). Only those versions; a version that cannot be read is
   *  absent (the page then says the two numbers, as before). */
  cuts?: Record<string, RenderPart>;
}
export interface MasterFileBrief { version: string; path: string; at?: string; picture?: PictureMade }
/** The release file in brief: the final's version, the platforms and how many are posted. */
export function releaseBrief(file: { final?: { version: string }; platforms: { send: { posted?: unknown } }[] } | undefined): LeftAnswer['release'] {
  if (!file) return undefined;
  return { ...(file.final ? { final: { version: file.final.version } } : {}), platforms: file.platforms.length, posted: file.platforms.filter((p) => !!p.send.posted).length };
}
/** The newest master of any version among a render listing (the plain masters that are the master of their version). */
export function newestMasterOf(files: { kind: string; tag?: string; earlier?: boolean; version: string; path: string }[]): string | undefined {
  return newestMasterFileOf(files)?.version;
}
/** The same master's file, with its record when the listing has one. */
export function newestMasterFileOf<F extends { kind: string; tag?: string; earlier?: boolean; version: string; path: string; at?: string; picture?: PictureMade }>(files: F[]): MasterFileBrief | undefined {
  let best: F | undefined;
  for (const f of files) {
    if (f.kind !== 'master' || f.tag || f.earlier || !/-master(-\d+)?\.mp4$/.test(f.path)) continue;
    if (!best || vnum(f.version) > vnum(best.version)) best = f;
  }
  return best ? { version: best.version, path: best.path, ...(best.at ? { at: best.at } : {}), ...(best.picture ? { picture: best.picture } : {}) } : undefined;
}

// ---- what the record says

/** The record's yes for a cut: the newest answered yes card placed (by itself) at the edit or finish stage that names a
 *  cut version this film has ("cut v230" in its title or its id), not answered no. Undefined when the record says
 *  nothing of the kind: the step is then the user's own tick. */
export function approvalOf(cards: FeedCard[], versions: string[]): { version: string; card: string } | undefined {
  const have = new Set(versions);
  let best: { version: string; card: string } | undefined;
  for (const c of cards) {
    const a = c.ask;
    if (!a || a.kind !== 'yes' || !a.answer || a.answer.option === 'no') continue;
    if (c.placed !== 'card' || (c.place !== 'edit' && c.place !== 'finish')) continue;
    const v = /\bcut (v\d+)\b/i.exec(c.title)?.[1]?.toLowerCase() ?? /\b(v\d+)\b/i.exec(c.id ?? '')?.[1]?.toLowerCase();
    if (!v || !have.has(v)) continue;
    if (!best || vnum(v) > vnum(best.version)) best = { version: v, card: c.id ?? c.key };
  }
  return best;
}

// ---- counts read from the cut on screen

/** How many versions came after `v` up to `cur` (the cut's changes since; the count before the history, kept for a
 *  version the history no longer holds). */
export function changesSince(versions: string[], v: string, cur: string): number {
  const a = vnum(v), b = vnum(cur);
  return versions.filter((x) => vnum(x) > a && vnum(x) <= b).length;
}

/** The history as What's next reads it: each step's content hash and the version it saved or equals, the pointer. */
export interface LeftHistory { at: number; steps: { rev?: number; state: string; version?: string; saved?: string; by?: string }[] }
/** What changed since a state (a tick's) or a version (the record's approval, a tick before 15 Nov), counted in the
 *  history's steps (stage 3b): 0 when the cut is still at that step, "same" when steps were taken since and the content
 *  is that content again, else the steps from there to the pointer; undefined when the history holds neither (the
 *  version count is used then). */
export function stepsSince(h: LeftHistory | undefined, ref: { cut: string; state?: string; step?: number }): number | 'same' | undefined {
  if (!h || !h.steps[h.at]) return undefined;
  // a step the page predicted carries no hash yet (PENDING_STATE): it is never taken for any content
  const known = (x: string) => x !== PENDING_STATE;
  const here = h.steps[h.at].state;
  // the tick's own step, while the history holds it; else the newest step with its content
  let i = ref.step !== undefined ? h.steps.findIndex((x) => x.rev === ref.step && (!ref.state || !known(x.state) || x.state === ref.state)) : -1;
  if (i < 0 && ref.state) {
    for (let k = h.at; k >= 0 && i < 0; k--) if (h.steps[k].state === ref.state) i = k;
    for (let k = h.at + 1; k < h.steps.length && i < 0; k++) if (h.steps[k].state === ref.state) i = k;
    if (i < 0 && ref.state === here && known(here)) return 'same';
  }
  if (i < 0) {
    for (let k = h.steps.length - 1; k >= 0 && i < 0; k--) if (h.steps[k].saved === ref.cut) i = k;
    for (let k = 0; k < h.steps.length && i < 0; k++) if (h.steps[k].version === ref.cut && h.steps[k].by !== 'restore') i = k;
  }
  if (i < 0) return undefined;
  if (i === h.at) return 0;
  if (known(here) && h.steps[i].state === here) return 'same';
  return Math.abs(h.at - i);
}

/** The dialogue tracks as the render counts them (render-options.ts dialogueTracks): the main sound track and the ones
 *  named after it with a number. Music: a sound track named for music. Everything else on a sound track: effects. */
export function soundCounts(tl: Pick<Timeline, 'tracks'>): { music: number; effects: number; first?: { trackId: string; clipId: string; at: number } } {
  const audio = tl.tracks.filter((t) => t.kind === 'audio');
  const main = audio.find((t) => t.id === 'A1') ?? audio[0];
  const esc = main ? main.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  const beside = new RegExp(`^${esc} \\d+$`);
  let music = 0, effects = 0;
  let first: { trackId: string; clipId: string; at: number } | undefined;
  for (const t of audio) {
    if (main && (t.id === main.id || beside.test(t.name))) continue;
    if (/music|score|song/i.test(t.name)) music += t.clips.length; else effects += t.clips.length;
    for (const c of t.clips) if (!first || c.at < first.at) first = { trackId: t.id, clipId: c.id, at: c.at };
  }
  return { music, effects, first };
}

const isLineClip = (c: TimelineClip): boolean => typeof c.text === 'string' && !c.src;
const isSrt = (c: TimelineClip): boolean => !!c.src && /\.srt$/i.test(c.src);
/** The subtitle lines of the cut: text lines, and the cues of each .srt clip (`cues(clip)`, once its file is read). */
export function subsCounts(tl: Pick<Timeline, 'tracks'>, cues: (c: TimelineClip) => number | undefined = () => undefined): { lines: number; srt: number; unread: number; first?: { trackId: string; clipId: string; at: number } } {
  let lines = 0, srt = 0, unread = 0;
  let first: { trackId: string; clipId: string; at: number } | undefined;
  for (const t of tl.tracks) {
    if (t.kind !== 'captions') continue;
    for (const c of t.clips) {
      if (isLineClip(c)) lines++;
      else if (isSrt(c)) { srt++; const n = cues(c); if (n === undefined) unread++; else lines += n; }
      else continue;
      if (!first || c.at < first.at) first = { trackId: t.id, clipId: c.id, at: c.at };
    }
  }
  return { lines, srt, unread, first };
}

/** The shots of the cut and how many have a full-size picture (the 1080p view's pieces, fullsize.ts picturePieces): a
 *  shot is a picture clip; it is full size when no frame of it is scaled up from 480p. And the takes marked to redo in
 *  Seedance among the cut's shots, with how many shots they are. */
export function fullCounts(pieces: { kind: string; clip: Pick<TimelineClip, 'id' | 'src'> }[], marks: Set<string>): { shots: number; full: number; takes: number; markedShots: number } {
  const small = new Map<string, boolean>();
  const src = new Map<string, string>();
  for (const p of pieces) {
    small.set(p.clip.id, (small.get(p.clip.id) ?? false) || p.kind === 'small');
    if (p.clip.src) src.set(p.clip.id, p.clip.src);
  }
  const marked = new Set<string>();
  let markedShots = 0;
  for (const s of src.values()) if (marks.has(s)) { marked.add(s); markedShots++; }
  return { shots: small.size, full: [...small.values()].filter((x) => !x).length, takes: marked.size, markedShots };
}

// ---- the seven steps

export type StepId = EarlyId | 'approved' | 'full' | 'sound' | 'subs' | 'master' | 'final' | 'posted';
export const STEP_IDS: StepId[] = ['approved', 'full', 'sound', 'subs', 'master', 'final', 'posted'];
export const STEP_NAME: Record<StepId, string> = {
  ...EARLY_NAME,
  approved: 'The cut approved at 480p', full: 'The 1080p', sound: 'Sound and music', subs: 'Subtitles',
  master: 'Render the master', final: 'The final', posted: 'Publish on every platform',
};
/** The step as Alma's chip names it ("next: the 1080p"). */
export const STEP_SHORT: Record<StepId, string> = {
  ...EARLY_SHORT,
  approved: 'the cut approved at 480p', full: 'the 1080p', sound: 'sound and music', subs: 'subtitles',
  master: 'the master', final: 'the final', posted: 'publishing',
};

/** What a press does. The page maps each to its own call; only `release` leaves the page. */
export type LeftDo =
  | { kind: 'tick'; tick: TickId }
  | { kind: 'start' }                   // the playhead to the start of the film
  | { kind: 'upscale' }                 // the Upscale tab, in the 1080p view
  | { kind: 'upscaled' }                  // no full-size picture at all: the Seedance 2.5 ask in Alma's box
  | { kind: 'sound' }                   // the sound tracks' first clip selected, the playhead to the start
  | { kind: 'subs' }                    // the Subtitles track scrolled to, its first line selected
  | { kind: 'subs-ask' }                // the existing "Create subtitles" ask
  | { kind: 'master'; again: boolean; retry?: boolean }   // the header's "Render master" call, then the Renders tab
  | { kind: 'renders' }                 // the Renders tab
  | { kind: 'release' }                 // the Release page
  | EarlyDo;                            // the six early steps (early.ts, 15 Nov): Alma's box, a page, the planned shots, the takes, the go

export interface LeftStep {
  id: StepId;
  n: number;
  name: string;
  done: boolean;
  current: boolean;
  /** One line of facts. */
  facts: string;
  /** An amber line under the facts (the final is of an older cut). */
  note?: string;
  /** The version names behind the facts, said quietly ("master v235 · cut v239"). */
  versions?: string;
  /** Done by the user's tick: the tick can be taken back. */
  ticked?: TickId;
  /** The current step's one filled button. */
  action?: { label: string; do: LeftDo };
  /** A quiet second way for the current step (a tick where the app cannot know). */
  also?: { label: string; do: LeftDo };
  /** What a press on the row does. */
  row: LeftDo;
}

export interface LeftInput {
  /** The current version of the cut: the version the working cut equals, else the newest one (stage 2). */
  cut: string;
  /** The working cut has edits since `cut` (stage 2 of "saving apart from history"): a master or a final of `cut` is
   *  then judged by content (`gap`, `finalGap`), never taken as the cut's own. */
  edited?: boolean;
  /** Every readable version, oldest first. */
  versions: string[];
  /** The history (stage 3b, 15 Nov): "n changes since" counts its steps; absent, versions are counted as before. */
  history?: LeftHistory;
  /** The route has answered (ticks, the record, the release file): before that nothing is counted. */
  ready: boolean;
  /** The record's yes for a cut (approvalOf). */
  approved?: { version: string; card?: string };
  /** fullCounts of the current version; undefined while the full-size pictures are read. `has`: any full-size
   *  picture exists (the 1080p view can be opened). */
  full?: { shots: number; full: number; takes: number; markedShots: number; has: boolean };
  sound: { music: number; effects: number };
  subs: { lines: number; srt: number; unread: number };
  /** The master of the current version as the page follows it, and the newest master of any version. `stale`: why
   *  the master of the current version is out of date (masters.ts masterAge). `gap`: the newest master's cut against
   *  the cut now, when it is of another version (ASKS 49). */
  master: { state?: 'queued' | 'running' | 'done' | 'failed' | 'none'; stale?: string; newest?: string; gap?: MasterGap };
  /** The release file: the final's version, how many platforms and how many posted. Undefined: no file. */
  release?: { final?: { version: string }; platforms: number; posted: number };
  /** The final's cut against the cut now, when it is of another version (`words` end on "since the final"). */
  finalGap?: CutGap;
  ticks: LeftFile['ticks'];
  /** The six early steps from the script on (early.ts, 15 Nov), put before the seven; absent: the seven alone. */
  early?: EarlyStep[];
}

/** The newest master's cut against the cut now (sameCut.ts cutGap, `words` ending on "since the master"). `app`: the
 *  app rendered that master (an outside master of the same content counts as the outside master of the cut does: not
 *  yet the app's). `stale`: why that master is out of date by its picture against what the page would use now. */
export interface MasterGap extends CutGap { app: boolean; stale?: string }

export interface LeftView {
  steps: LeftStep[];
  current?: StepId;
  done: number;
  /** The tab's name: always "What's next". */
  label: string;
  /** How many steps are still to do, shown quietly beside the tab's name (the user, 14 Nov: "it should just say the
   *  number of steps that are left"). Undefined until the route answered. */
  left?: number;
  /** The same in words, for the panel and Alma's chip: "5 steps left", "1 step left", "Nothing left"; '' until the
   *  route answered. */
  count: string;
  /** The line under the list. */
  footer: string;
  /** For Alma's chip: "the 1080p" or "nothing left". */
  next: string;
  /** With the early steps: how many of them there are and whether all are done (the list then folds them into one row). */
  early?: { n: number; done: boolean };
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const since = (n: number | 'same'): string => (n === 'same' ? ' · nothing changed since' : n > 0 ? ` · ${plural(n, 'change')} since` : '');
const lower1 = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const upper1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** "5 steps left", "1 step left", "Nothing left". */
export const leftWords = (n: number): string => (n > 0 ? `${plural(n, 'step')} left` : 'Nothing left');
/** Alma's chip while the tab is open: "What's next · 5 steps left · the 1080p", "What's next · nothing left", or
 *  "What's next · the 1080p" before the route answered. */
export const leftChip = (v: LeftView): string =>
  [NEXT_TAB, v.current && v.count ? v.count : '', v.current ? v.next : 'nothing left'].filter(Boolean).join(' · ');

export function whatIsLeft(i: LeftInput): LeftView {
  // the steps since (stage 3b), "nothing changed since" when steps were taken and the content is the same again, and
  // nothing when the cut is still there; without the history, the versions since, as before
  const ch = (v: string, x?: Pick<Tick, 'state' | 'step'>) => {
    const n = stepsSince(i.history, { cut: v, ...x });
    return n !== undefined ? since(n) : v === i.cut && !i.edited ? '' : since(changesSince(i.versions, v, i.cut));
  };
  const at = (x: Tick) => (x.edited ? `with edits since ${x.cut}` : `at ${x.cut}`);
  const t = i.ticks;
  type Draft = Omit<LeftStep, 'n' | 'name' | 'current' | 'action' | 'also'> & { act?: LeftStep['action']; also?: LeftStep['also'] };
  const drafts: Draft[] = [];
  // the six early steps first (15 Nov): while any is not done, the later ones only say what they wait for
  const early = i.early ?? [];
  for (const e of early) drafts.push({ id: e.id, done: e.done, facts: e.facts, row: e.row, ...(e.act ? { act: e.act } : {}) });
  const before = early.length > 0 && early.some((e) => !e.done);

  // 1. the cut approved at 480p: the record's yes, else the user's tick
  if (i.approved) drafts.push({ id: 'approved', done: true, facts: `approved at ${i.approved.version}${ch(i.approved.version)}`, row: { kind: 'start' } });
  else if (t.approved) drafts.push({ id: 'approved', done: true, ticked: 'approved', facts: `ticked by you ${at(t.approved)}${ch(t.approved.cut, t.approved)}`, row: { kind: 'start' } });
  else drafts.push({ id: 'approved', done: false, facts: 'the record does not say a cut was approved', row: { kind: 'start' }, act: { label: i.edited ? 'Approve this cut' : `Approve ${i.cut}`, do: { kind: 'tick', tick: 'approved' } } });

  // 2. the 1080p: every shot full size and no take marked to redo
  const f = i.full;
  if (!f) drafts.push({ id: 'full', done: false, facts: 'reading the full-size pictures…', row: { kind: 'upscale' } });
  else {
    const go: LeftDo = f.has ? { kind: 'upscale' } : { kind: 'upscaled' };
    const head = !f.shots ? 'no shots in the cut' : f.full === f.shots ? `all ${plural(f.shots, 'shot')} full size` : `${f.full} of ${plural(f.shots, 'shot')} full size`;
    const marks = f.takes ? ` · ${plural(f.takes, 'take')} to redo in Seedance, which is ${plural(f.markedShots, 'shot')}` : '';
    drafts.push({ id: 'full', done: f.shots > 0 && f.full === f.shots && f.takes === 0, facts: head + marks, row: go,
      act: { label: f.has ? 'Go through them' : 'Ask Alma for 1080p in Seedance 2.5', do: go } });
  }

  // 3. sound and music: only the user knows it was listened through
  const s = `${plural(i.sound.music, 'music clip')}, ${plural(i.sound.effects, 'effect')}`;
  if (t.sound) drafts.push({ id: 'sound', done: true, ticked: 'sound', facts: `${s} · listened through ${at(t.sound)}${ch(t.sound.cut, t.sound)}`, row: { kind: 'sound' } });
  else drafts.push({ id: 'sound', done: false, facts: s, row: { kind: 'sound' }, act: { label: 'Listened through', do: { kind: 'tick', tick: 'sound' } } });

  // 4. subtitles: lines in the cut, or the user's word that this film has none
  const sub = i.subs;
  const has = sub.lines > 0 || sub.srt > 0;
  const words = sub.lines > 0 || !sub.unread ? `${plural(sub.lines, 'line')}${sub.unread ? ` and ${plural(sub.unread, 'subtitle file')} being read` : ''}` : `${plural(sub.unread, 'subtitle file')} being read`;
  if (has) drafts.push({ id: 'subs', done: true, facts: words, row: { kind: 'subs' } });
  else if (t.subs) drafts.push({ id: 'subs', done: true, ticked: 'subs', facts: `no subtitles on this film, ticked by you ${at(t.subs)}${ch(t.subs.cut, t.subs)}`, row: { kind: 'subs-ask' } });
  else drafts.push({ id: 'subs', done: false, facts: 'no lines yet', row: { kind: 'subs-ask' }, act: { label: 'Create subtitles', do: { kind: 'subs-ask' } }, also: { label: 'No subtitles on this film', do: { kind: 'tick', tick: 'subs' } } });

  // 5. the master of the cut now
  const m = i.master;
  const renders: LeftDo = { kind: 'renders' };
  if (m.state === 'queued' || m.state === 'running') drafts.push({ id: 'master', done: false, facts: `rendering the master of ${i.cut}`, row: renders });
  else if (m.state === 'failed') drafts.push({ id: 'master', done: false, facts: `the master of ${i.cut} failed`, row: renders, act: { label: 'Try again', do: { kind: 'master', again: false, retry: true } } });
  else if (m.state === 'done' && m.stale) drafts.push({ id: 'master', done: false, facts: `out of date: ${lower1(m.stale)}`, row: renders, act: { label: 'Render master again', do: { kind: 'master', again: true } } });
  else if (m.state === 'done') drafts.push({ id: 'master', done: true, facts: `the master of ${i.cut}, up to date`, row: renders });
  else if (m.newest && (m.newest !== i.cut || i.edited) && !(m.gap?.same && !m.gap.app)) {
    // a master of another version (ASKS 49): current when its cut has the same content as the cut now
    const g = m.gap;
    const versions = `master ${m.newest} · cut ${i.cut}`;
    const again: LeftStep['action'] = { label: 'Render master again', do: { kind: 'master', again: false } };
    if (g?.same && g.stale) drafts.push({ id: 'master', done: false, facts: `out of date: ${lower1(g.stale)}`, versions, row: renders, act: again });
    else if (g?.same) drafts.push({ id: 'master', done: true, facts: `the master of ${m.newest} · nothing changed since`, versions, row: renders });
    else if (g?.words) drafts.push({ id: 'master', done: false, facts: `out of date: ${g.words}`, versions, row: renders, act: again });
    else drafts.push({ id: 'master', done: false, facts: `out of date: the master is of ${m.newest}, the cut is ${i.cut}`, row: renders, act: again });
  }
  else drafts.push({ id: 'master', done: false, facts: 'no master yet', row: renders, act: { label: 'Render master', do: { kind: 'master', again: false } } });

  // 6. the final: the master named in the release file; of another version, said in words when its cut differs
  const fin = i.release?.final;
  if (fin) {
    const other = fin.version !== i.cut || !!i.edited, fg = other ? i.finalGap : undefined;
    const note = !other || fg?.same ? undefined : fg?.words ? `${upper1(fg.words)}.` : vnum(i.cut) > vnum(fin.version) ? `The final is of ${fin.version}. The cut is now ${i.cut}.` : undefined;
    drafts.push({ id: 'final', done: true, facts: `the final is the master of ${fin.version}${fg?.same ? ' · nothing changed since' : ''}`, note,
      ...(other && fg ? { versions: `final ${fin.version} · cut ${i.cut}` } : {}), row: renders });
  }
  else drafts.push({ id: 'final', done: false, facts: 'no final yet', row: renders, act: { label: 'Open Renders', do: renders } });

  // 7. published on every platform
  const r = i.release;
  const posted = !!r && r.platforms > 0 && r.posted === r.platforms;
  drafts.push({ id: 'posted', done: posted, facts: !r || !r.platforms ? 'no texts yet' : `${r.posted} of ${r.platforms} posted`, row: { kind: 'release' }, act: { label: 'Open Release', do: { kind: 'release' } } });

  if (before) {
    // nothing to approve or upscale before the takes are in
    for (const d of drafts) {
      if (d.id === 'approved') d.facts = 'after the first takes are in';
      if (d.id === 'full') { d.facts = 'after the cut is approved'; d.done = false; }
      if (d.id === 'sound' && !t.sound && i.sound.music + i.sound.effects === 0) d.facts = 'no music yet';
    }
  }
  const cur = drafts.find((d) => !d.done)?.id;
  const steps: LeftStep[] = drafts.map((d, k) => {
    const { act, also, ...rest } = d;
    const on = d.id === cur;
    return { ...rest, n: k + 1, name: STEP_NAME[d.id], current: on, ...(on && act ? { action: act } : {}), ...(on && also ? { also } : {}) };
  });
  const done = steps.filter((x) => x.done).length;
  return {
    steps, current: cur, done,
    label: NEXT_TAB,
    ...(i.ready ? { left: steps.length - done } : {}),
    count: i.ready ? leftWords(steps.length - done) : '',
    footer: posted ? 'Published on every platform. The film is done.' : 'The film is done when it is published on every platform.',
    next: cur ? STEP_SHORT[cur] : 'nothing left',
    ...(early.length ? { early: { n: early.length, done: !before } } : {}),
  };
}

// ---- the versions that could not be read (the header's orange line)

/** The short reason of a problem ("track C1 clip s1: id used twice" → "id used twice"). */
export const shortProblem = (p: string): string => p.split(': ').pop() ?? p;

/** The unreadable versions, split: `loud` the ones the header shows in orange (one newer than the version on screen or
 *  the current one, or the very version on screen), `quiet` the old ones, said only on their own row of the versions
 *  menu. A version the page can read (in `readable`) is not unreadable. */
export function unreadableSplit(unreadable: Record<string, string[]>, readable: string[], shown: string): { loud: [string, string][]; quiet: [string, string][] } {
  const ok = new Set(readable);
  const loud: [string, string][] = [], quiet: [string, string][] = [];
  for (const [v, ps] of Object.entries(unreadable).sort((a, b) => vnum(a[0]) - vnum(b[0]))) {
    if (ok.has(v)) continue;
    const p = ps[0] ?? 'invalid';
    (vnum(v) >= vnum(shown) ? loud : quiet).push([v, p]);
  }
  return { loud, quiet };
}
