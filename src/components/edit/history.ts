// The working cut and its history (14 Nov 2026, stage 1 of "saving apart from history"). The user: "an undo would
// step back to v235, with no v239 written, and numbers would go only to states you mean to keep". Pure: the shapes of
// cut/working.json and harness/cut-history.json, the strict check of a history read from disk, the pointer moves,
// a history seeded from a film's version notes (today's undo chain), the words of a step and the "edits since" count.
// The server (src/server/edit/working.ts) does the reading, the writing and the content hashes; scripts/working-test.ts
// checks both.
import type { Timeline, TimelineMarker, TimelineTrack, TimelineVersionRef } from '@/server/types';

export const WORKING_REL = 'cut/working.json';
export const HISTORY_REL = 'harness/cut-history.json';
export const STATES_REL = 'harness/cut-states';
export const NAMES_REL = 'harness/version-names.json';
export const HISTORY_FORMAT = 1;
/** The hash a step the page predicted carries until the server's answer gives the real one (useCut.ts): the page keeps
 *  the prediction when the answer agrees on what it shows, so a step at the pointer may still carry it. */
export const PENDING_STATE = '0000000000000000';
/** The history keeps the last 1,000 steps; older ones go, and their snapshots with them when nothing else uses them. */
export const HISTORY_CAP = 1000;

export type StepBy = 'user' | 'alma' | 'start' | 'restore';
/** Why a version was saved: the user's own save, a render asked for, the final named, a piece of Alma's work done, an
 *  export (FCPXML) of the cut (stage 2). */
export type SaveWhy = 'you' | 'render' | 'final' | 'alma' | 'export';
export const SAVE_WHYS: SaveWhy[] = ['you', 'render', 'final', 'alma', 'export'];
const BYS: StepBy[] = ['user', 'alma', 'start', 'restore'];

/** What a state of the cut is: what a snapshot file holds and what its hash is made of. */
export interface CutContent { fps: Timeline['fps']; width: number; height: number; tracks: TimelineTrack[]; markers: TimelineMarker[] }

export interface HistoryStep {
  rev: number;                  // the history's rev when the step was made (unique, rising)
  by: StepBy;
  words: string;                // what the step did, in the page's own words ("moved S3 to 00:00:12:04")
  at: string;                   // ISO
  state: string;                // sha1-16 of the content: harness/cut-states/<state>.json.gz
  version?: string;             // "v235": the step was seeded from that version, or its content equals it
  saved?: string;               // "v240": a version was saved at this step
  why?: SaveWhy;                // with saved: why it was saved
  drop?: string;                // an Alma drop taken in at this step: cut/alma/<drop>.json (stage 4, alma-drop.ts)
}
export interface CutHistory { format: 1; rev: number; at: number; steps: HistoryStep[] }

/** cut/working.json: the one state per film, kept at once on every step (Alma reads this file). */
export interface WorkingCut extends CutContent {
  rev: number;                  // the history's rev
  version?: string;             // the newest version's name
  equals?: string;              // a version with the same content as the working cut
  edited: boolean;              // the working cut differs from the newest version
  by: StepBy;
  at: string;
  note: string;                 // the last step's words
}

/** What the page and GET …/cut get of the history: every step (no snapshot, only its hash), the pointer, what an undo
 *  and a redo would do, and the edits since the last version. */
export interface HistorySummary {
  rev: number;
  at: number;
  steps: HistoryStep[];
  undo?: { rev: number; words: string; by: StepBy };   // the step an undo takes back
  redo?: { rev: number; words: string; by: StepBy };   // the step a redo brings back
  since: EditsSince;
}
export interface EditsSince { version?: string; count: number }

// ---- the check of a history read from disk

const VERSION = /^v\d{1,5}$/;
const HASH = /^[0-9a-f]{16}$/;
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Strict: a history file is taken as it is or not at all (a broken one is said, never mended by guessing). */
export function checkHistory(raw: unknown): { history?: CutHistory; problems: string[] } {
  const p: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: ['not an object'] };
  const h = raw as Partial<CutHistory>;
  if (h.format !== HISTORY_FORMAT) p.push(`format must be ${HISTORY_FORMAT}`);
  if (!int(h.rev)) p.push('rev must be a whole number');
  if (!Array.isArray(h.steps) || !h.steps.length) p.push('steps must be a non-empty list');
  else if (h.steps.length > HISTORY_CAP) p.push(`more than ${HISTORY_CAP} steps`);
  if (!int(h.at) || (Array.isArray(h.steps) && h.at >= h.steps.length)) p.push('at must be the index of a step');
  if (p.length) return { problems: p };
  let prev = -1;
  for (const [i, s] of h.steps!.entries()) {
    const w = `step ${i + 1}`;
    if (!s || typeof s !== 'object') { p.push(`${w}: not an object`); continue; }
    if (!int(s.rev) || s.rev <= prev) p.push(`${w}: rev must rise from step to step`);
    else prev = s.rev;
    if (!BYS.includes(s.by)) p.push(`${w}: by must be user, alma, start or restore`);
    if (typeof s.words !== 'string') p.push(`${w}: words must be a string`);
    if (!isIso(s.at)) p.push(`${w}: at must be an ISO date`);
    if (typeof s.state !== 'string' || !HASH.test(s.state)) p.push(`${w}: state must be 16 hex characters`);
    if (s.version !== undefined && (typeof s.version !== 'string' || !VERSION.test(s.version))) p.push(`${w}: version must be "v<n>"`);
    if (s.saved !== undefined && (typeof s.saved !== 'string' || !VERSION.test(s.saved))) p.push(`${w}: saved must be "v<n>"`);
    if (s.why !== undefined && !SAVE_WHYS.includes(s.why)) p.push(`${w}: why must be you, render, final, alma or export`);
    if (s.drop !== undefined && (typeof s.drop !== 'string' || !s.drop)) p.push(`${w}: drop must be a drop's name`);
  }
  if (!p.length && h.rev! < prev) p.push('rev is older than its newest step');
  if (p.length) return { problems: p };
  return { history: { format: 1, rev: h.rev!, at: h.at!, steps: h.steps!.map((s) => ({ ...s })) }, problems: [] };
}

// ---- pointer moves (each returns a new history with rev + 1, or undefined when there is nowhere to go)

/** Keeps at most `cap` steps around the pointer: the oldest go first; the pointer's step always stays. */
export function capSteps<T>(steps: T[], at: number, cap = HISTORY_CAP): { steps: T[]; at: number; dropped: T[] } {
  if (steps.length <= cap) return { steps, at, dropped: [] };
  let from = Math.min(steps.length - cap, at);
  if (from < 0) from = 0;
  const kept = steps.slice(from, from + cap);
  return { steps: kept, at: at - from, dropped: [...steps.slice(0, from), ...steps.slice(from + cap)] };
}

/** A new step after the pointer. Steps that were undone (after the pointer) leave the list, as in every editor; their
 *  snapshots stay until the cleanup (only when the cap was passed). */
export function addStep(h: CutHistory, s: Omit<HistoryStep, 'rev'>, cap = HISTORY_CAP): { history: CutHistory; undone: HistoryStep[]; dropped: HistoryStep[] } {
  const rev = h.rev + 1;
  const undone = h.steps.slice(h.at + 1);
  const all = [...h.steps.slice(0, h.at + 1), { ...s, rev }];
  const c = capSteps(all, all.length - 1, cap);
  return { history: { format: 1, rev, at: c.at, steps: c.steps }, undone, dropped: c.dropped };
}

export const canUndo = (h: CutHistory): boolean => h.at > 0;
export const canRedo = (h: CutHistory): boolean => h.at < h.steps.length - 1;
export function undoOf(h: CutHistory): CutHistory | undefined {
  return canUndo(h) ? { ...h, rev: h.rev + 1, at: h.at - 1 } : undefined;
}
export function redoOf(h: CutHistory): CutHistory | undefined {
  return canRedo(h) ? { ...h, rev: h.rev + 1, at: h.at + 1 } : undefined;
}
/** The pointer on the step made at `stepRev`; the same history when it is there already; undefined when no step has it. */
export function goToOf(h: CutHistory, stepRev: number): CutHistory | undefined {
  const i = h.steps.findIndex((s) => s.rev === stepRev);
  if (i < 0) return undefined;
  return i === h.at ? h : { ...h, rev: h.rev + 1, at: i };
}
/** The step at the pointer marked: a version was saved at it (`saved`), or its content was found to equal one. */
export function markSaved(h: CutHistory, version: string, why: SaveWhy, made: boolean): CutHistory {
  const steps = h.steps.map((s, i) => (i !== h.at ? s : made ? { ...s, saved: version, why } : { ...s, version: s.version ?? version }));
  return { ...h, rev: h.rev + 1, steps };
}

// ---- seeding from the versions (today's undo chain, EditPage.tsx before stage 2)

/** A seeded step: the version it stands for, whose words, and who made the change. */
export interface SeedStep { version: string; words: string; by: StepBy }

/** The version whose change a version is: "redo: v10 again" is v10's change (controls.ts `changeOf`). */
function changeOf(versions: TimelineVersionRef[], v: TimelineVersionRef | undefined): TimelineVersionRef | undefined {
  for (let k = 0; v && k < 50; k++) {
    const again = /^redo: (v\d+) again/.exec(v.note ?? '')?.[1];
    if (!again) return v;
    v = versions.find((x) => x.version === again);
  }
  return v;
}

/** The undo chain as the Edit page reads it from the version notes: the versions an undo goes back to (oldest
 *  first), the one the cut is (`cur`), and those a redo brings back (the next redo last). */
export function undoChain(versions: TimelineVersionRef[]): { undo: string[]; cur?: string; redo: string[] } {
  const u: string[] = [], r: string[] = [];
  let cur: string | undefined;
  for (const v of versions) {
    const back = /^undo: back to (v\d+)/.exec(v.note ?? '')?.[1];
    const again = /^redo: (v\d+) again/.exec(v.note ?? '')?.[1];
    if (back && cur && u[u.length - 1] === back) { u.pop(); r.push(cur); cur = back; continue; }
    if (again && cur && r[r.length - 1] === again) { r.pop(); u.push(cur); cur = again; continue; }
    if (cur) u.push(cur);
    r.length = 0;
    cur = v.version;
  }
  return { undo: u, cur, redo: r };
}

/** The steps of a history seeded from the readable versions (oldest first), so that the first undo goes where
 *  today's ⌘Z would go and a redo where today's ⇧⌘Z would: the undo chain, then the version the cut is (the
 *  pointer), then the redo chain, the next redo first. The first step is "start". At most `cap` steps. */
export function seedSteps(versions: TimelineVersionRef[], cap = HISTORY_CAP): { steps: SeedStep[]; at: number } {
  const { undo, cur, redo } = undoChain(versions);
  if (!cur) return { steps: [], at: -1 };
  const names = [...undo, cur, ...[...redo].reverse()];
  const c = capSteps(names, undo.length, cap);
  const steps = c.steps.map((v, i): SeedStep => {
    const ref = changeOf(versions, versions.find((x) => x.version === v));
    const note = (ref?.note ?? '').trim();
    const by: StepBy = i === 0 ? 'start' : ref?.by === 'alma' ? 'alma' : /^restored v\d+/.test(note) ? 'restore' : 'user';
    return { version: v, words: note || (i === 0 ? 'the first version' : v), by };
  });
  return { steps, at: c.at };
}

// ---- words and counts

/** The status line after an undo (the step taken back) or a redo (the step brought back), as `undoLine` says it. */
export function stepLine(kind: 'undo' | 'redo', s: Pick<HistoryStep, 'words' | 'by'>): { alma: boolean; text: string } {
  const alma = s.by === 'alma';
  const w = alma ? " Alma's change" : s.by === 'start' ? ' the first version' : '';
  const words = s.words.trim() || 'a change';
  return kind === 'undo' ? { alma, text: `Undid${w}: ${words}. ⇧⌘Z brings it back.` } : { alma, text: `Redid${w}: ${words}.` };
}

/** The edits since the last version: the steps between the pointer and the nearest step before it that equals or
 *  saved a version; zero when the content at the pointer equals that version. */
export function editsSince(h: CutHistory): EditsSince {
  const here = h.steps[h.at];
  for (let i = h.at; i >= 0; i--) {
    const s = h.steps[i];
    const v = s.saved ?? s.version;
    if (!v) continue;
    return { version: v, count: s.state === here.state ? 0 : h.at - i };
  }
  return { count: h.at + 1 };
}

/** The words of the steps a save keeps, for the version's note: those since the newest version's step, or, when the
 *  pointer went back past it, the steps undone ("undid: …"). Never "undo: back to" (the old chain's own words). */
export function wordsForSave(h: CutHistory, newest?: string): string {
  let k = -1;
  if (newest) for (let i = h.steps.length - 1; i >= 0; i--) if (h.steps[i].saved === newest || h.steps[i].version === newest) { k = i; break; }
  if (k > h.at) return `undid: ${h.steps.slice(h.at + 1, k + 1).reverse().map((s) => s.words).join('; ')}`;
  if (k < 0) for (let i = h.at; i >= 0; i--) if (h.steps[i].saved || h.steps[i].version) { k = i; break; }
  const words = h.steps.slice(k + 1, h.at + 1).map((s) => s.words.trim()).filter(Boolean);
  return words.join('; ') || h.steps[h.at].words;
}

export function summaryOf(h: CutHistory): HistorySummary {
  const u = h.steps[h.at];
  const r = h.steps[h.at + 1];
  return {
    rev: h.rev, at: h.at, steps: h.steps,
    ...(canUndo(h) ? { undo: { rev: u.rev, words: u.words, by: u.by } } : {}),
    ...(r ? { redo: { rev: r.rev, words: r.words, by: r.by } } : {}),
    since: editsSince(h),
  };
}

/** The working cut for the step at the pointer, given its content and the newest version (name and content hash). */
export function workingOf(h: CutHistory, content: CutContent, newest?: { version: string; state: string }): WorkingCut {
  const s = h.steps[h.at];
  let equals: string | undefined = newest && newest.state === s.state ? newest.version : undefined;
  for (let i = h.steps.length - 1; !equals && i >= 0; i--) {
    const x = h.steps[i];
    if (x.state === s.state) equals = x.saved ?? x.version;
  }
  return {
    rev: h.rev, ...(newest ? { version: newest.version } : {}), ...(equals ? { equals } : {}),
    edited: !newest || newest.state !== s.state, by: s.by, at: s.at, note: s.words,
    fps: content.fps, width: content.width, height: content.height, tracks: content.tracks, markers: content.markers,
  };
}

/** The content of a timeline (what a snapshot holds). */
export const contentOf = (t: Pick<Timeline, 'fps' | 'width' | 'height' | 'tracks' | 'markers'>): CutContent => ({ fps: t.fps, width: t.width, height: t.height, tracks: t.tracks, markers: t.markers ?? [] });
