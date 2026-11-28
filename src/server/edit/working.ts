// The working cut and its history on disk (14 Nov 2026, stage 1 of "saving apart from history"; the shapes and the
// pure moves: src/components/edit/history.ts). Per film:
//   cut/working.json                       the working cut (WorkingCut), what Alma reads
//   harness/cut-history.json               the steps and the pointer (CutHistory)
//   harness/cut-states/<sha1-16>.json.gz   one snapshot per distinct content (fps, size, tracks, markers)
//   harness/version-names.json             { "v236": { name, at } }: names given to versions on save
// Every change runs in one serial queue per film (globalThis, as left.ts). Write order: the snapshot (`wx`; one there
// already is the same content), the history (temp file then rename: the moment the step counts), working.json (temp
// file then rename). A working.json whose rev is not the history's is rebuilt from the history. Versions are written
// only by `save`, through timeline.ts writeNextVersion, exactly as the old POST …/cut writes them. Nothing here ever
// writes into or deletes a version or a media file; the cleanup only removes snapshots no step uses.
// In sample-data mode (MOCK=boards) the same code runs on a store in memory: nothing is written to disk.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  addStep, checkHistory, contentOf, goToOf, HISTORY_FORMAT, HISTORY_REL, markSaved, NAMES_REL, redoOf, seedSteps, STATES_REL,
  summaryOf, undoOf, wordsForSave, workingOf, WORKING_REL, type CutContent, type CutHistory, type HistoryStep, type HistorySummary, type SaveWhy,
  type StepBy, type WorkingCut,
} from '@/components/edit/history';
import type { FilmTarget } from '../actions/film';
import { frameSize, frameRule, type Aspect, type FrameRule } from '@/lib/frame';
import { readBrief } from '../films/read/brief';
import { Warnings } from '../films/util';
import { probe } from './probe';
import type { Timeline, TimelineMarker, TimelineTrack, TimelineVersionRef } from '../types';
import { CutError, listVersions, logWrite, readVersion, readVersions, resolveSrc, validateTimeline, writeNextVersion, type NewVersion } from './timeline';

export type WorkingErrorCode = 'stale' | 'no-cut' | 'bad-history' | 'missing-state' | 'no-undo' | 'no-redo' | 'no-step' | 'bad-request';

/** A refusal with a code the page can act on: `stale` (409: reload the working cut and history), `no-cut` (404: the
 *  film has no readable version yet), `bad-history` and `missing-state` (500: the files are damaged; nothing is
 *  guessed), `no-undo`, `no-redo`, `no-step` (409: nothing there to go to). */
export class WorkingError extends CutError {
  constructor(readonly code: WorkingErrorCode, message: string, status: number, problems: string[] = [], readonly rev?: number) {
    super(message, status, problems);
  }
}

export interface WorkingAnswer { working: WorkingCut; history: HistorySummary }

// ---- the content hash

/** Keys sorted at every level, so the same content always reads the same whatever order its fields came in. */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v));
/** sha1-16 of what the snapshot holds. Whether two timelines render the same is `sameCut`'s (sameCut.ts, not merged
 *  yet); it can replace this byte-level test later. */
export const contentHash = (c: CutContent): string => createHash('sha1').update(canon({ fps: c.fps, width: c.width, height: c.height, tracks: c.tracks, markers: c.markers ?? [] })).digest('hex').slice(0, 16);

// ---- where the files are kept: on disk, or in memory under MOCK=boards

interface Newest { version: string; state: string; timeline: Timeline }
export interface CutStore {
  key: string;
  film: FilmTarget;
  files: boolean;                                         // validate a step's files (the disk store)
  readHistory(): Promise<unknown | undefined>;            // undefined: no history yet
  writeHistory(h: CutHistory): Promise<void>;
  readWorking(): Promise<unknown | undefined>;
  writeWorking(w: WorkingCut): Promise<void>;
  readState(hash: string): Promise<CutContent | undefined>;
  writeState(hash: string, c: CutContent): Promise<void>;
  listStates(): Promise<string[]>;
  deleteState(hash: string): Promise<void>;
  versionRefs(): Promise<TimelineVersionRef[]>;           // the readable versions, oldest first
  readVersion(v: string): Promise<Timeline>;
  lastListed(): Promise<string | undefined>;              // the newest version file, readable or not (writeNextVersion's basedOn)
  newestReadable(): Promise<Timeline | undefined>;
  saveVersion(input: NewVersion): Promise<Timeline>;
  readNames(): Promise<Record<string, { name: string; at: string }>>;
  writeNames(n: Record<string, { name: string; at: string }>): Promise<void>;
  /** The film's aspect as its brief says it now (read afresh: the brief can change while the server runs), for the
   *  frame rule (src/lib/frame.ts). Undefined: the brief gives none. */
  aspect(): Promise<Aspect | undefined>;
  /** The picture size of a clip's source, when it can be read (the disk store probes the file). */
  sizeOf?(src: string): Promise<{ width: number; height: number } | undefined>;
}

const tmpOf = (f: string) => `${f}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
async function writeAtomic(f: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = tmpOf(f);
  await fs.writeFile(tmp, text, { flag: 'wx' });
  await fs.rename(tmp, f);
}
async function readJson(f: string): Promise<unknown | undefined> {
  let text: string;
  try { text = await fs.readFile(f, 'utf8'); } catch { return undefined; }
  try { return JSON.parse(text); } catch (e) { return { __unreadable: (e as Error).message.slice(0, 80) }; }
}

export function diskStore(film: FilmTarget): CutStore {
  const at = (rel: string) => path.join(film.dir, rel);
  const stateFile = (h: string) => path.join(film.dir, STATES_REL, `${h}.json.gz`);
  return {
    key: `disk:${film.dir}`, film, files: true,
    readHistory: () => readJson(at(HISTORY_REL)),
    writeHistory: (h) => writeAtomic(at(HISTORY_REL), `${JSON.stringify(h, null, 1)}\n`),
    readWorking: () => readJson(at(WORKING_REL)),
    writeWorking: (w) => writeAtomic(at(WORKING_REL), `${JSON.stringify(w, null, 1)}\n`),
    async readState(h) {
      try { return JSON.parse(gunzipSync(await fs.readFile(stateFile(h))).toString('utf8')) as CutContent; } catch { return undefined; }
    },
    async writeState(h, c) {
      await fs.mkdir(path.dirname(stateFile(h)), { recursive: true });
      try {
        await fs.writeFile(stateFile(h), gzipSync(JSON.stringify(c)), { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;   // the same content is there already
      }
    },
    async listStates() {
      const names = await fs.readdir(path.join(film.dir, STATES_REL)).catch(() => [] as string[]);
      return names.map((n) => /^([0-9a-f]{16})\.json\.gz$/.exec(n)?.[1]).filter((h): h is string => !!h);
    },
    async deleteState(h) {
      if (!/^[0-9a-f]{16}$/.test(h)) return;
      await fs.unlink(stateFile(h)).catch(() => undefined);
    },
    versionRefs: async () => (await readVersions(film)).versions,
    readVersion: (v) => readVersion(film, v),
    lastListed: async () => (await listVersions(film)).pop(),
    async newestReadable() {
      const vs = await listVersions(film);
      for (let i = vs.length - 1; i >= 0; i--) {
        try { return await readVersion(film, vs[i]); } catch { /* an unreadable file: the one before */ }
      }
      return undefined;
    },
    saveVersion: (input) => writeNextVersion(film, input, { action: 'cut save' }),
    async readNames() {
      const j = await readJson(at(NAMES_REL));
      return j && typeof j === 'object' && !Array.isArray(j) && !('__unreadable' in j) ? (j as Record<string, { name: string; at: string }>) : {};
    },
    writeNames: (n) => writeAtomic(at(NAMES_REL), `${JSON.stringify(n, null, 1)}\n`),
    aspect: async () => (await readBrief({ dir: film.dir, warn: new Warnings() }).catch(() => undefined))?.aspect,
    async sizeOf(src) {
      const file = resolveSrc(film, src);
      const v = file ? (await probe(file).catch(() => undefined))?.video : undefined;
      return v ? { width: v.width, height: v.height } : undefined;
    },
  };
}

/** A sample film's versions and the working cut, history and snapshots in memory for the server's life. */
interface MemFilm { versions: TimelineVersionRef[]; timelines: Map<string, Timeline>; history?: CutHistory; working?: WorkingCut; states: Map<string, string>; names: Record<string, { name: string; at: string }> }
const gm = globalThis as unknown as { __mockWorking?: Map<string, MemFilm> };
const mem = (gm.__mockWorking ??= new Map());

/** The memory store of a sample film, made from its fixture (`current`, `versions`, `timelines`) on first use.
 *  Versions the fixture lists without their content are left out. */
export function memoryStore(film: FilmTarget, fixture: { current?: unknown; versions?: unknown[]; timelines?: unknown[]; empty?: boolean } | undefined): CutStore | undefined {
  let m = mem.get(film.slug);
  if (!m) {
    const isTl = (x: unknown): x is Timeline => !!x && typeof x === 'object' && Array.isArray((x as Timeline).tracks) && typeof (x as Timeline).version === 'string';
    const tls = [...(fixture?.timelines ?? []), fixture?.current].filter(isTl);
    // a sample film with a locked script and no cut yet (`empty`, the timeline from day one) starts with no version
    if (!tls.length && !fixture?.empty) return undefined;
    const timelines = new Map(tls.map((t) => [t.version, { ...t, markers: t.markers ?? [] }] as const));
    const versions = ((fixture?.versions ?? []) as TimelineVersionRef[]).filter((v) => v && timelines.has(v.version));
    m = { versions, timelines, states: new Map(), names: {} };
    mem.set(film.slug, m);
  }
  const f = m;
  const copy = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
  const newest = () => f.timelines.get(f.versions[f.versions.length - 1]?.version ?? '');
  return {
    key: `mock:${film.slug}`, film, files: false,
    readHistory: async () => (f.history ? copy(f.history) : undefined),
    writeHistory: async (h) => { f.history = copy(h); },
    readWorking: async () => (f.working ? copy(f.working) : undefined),
    writeWorking: async (w) => { f.working = copy(w); },
    readState: async (h) => (f.states.has(h) ? (JSON.parse(f.states.get(h)!) as CutContent) : undefined),
    writeState: async (h, c) => { if (!f.states.has(h)) f.states.set(h, JSON.stringify(c)); },
    listStates: async () => [...f.states.keys()],
    deleteState: async (h) => { f.states.delete(h); },
    versionRefs: async () => copy(f.versions),
    async readVersion(v) {
      const t = f.timelines.get(v);
      if (!t) throw new CutError(`${v} does not exist`, 404);
      return copy(t);
    },
    lastListed: async () => f.versions[f.versions.length - 1]?.version,
    newestReadable: async () => { const t = newest(); return t ? copy(t) : undefined; },
    async saveVersion(input) {
      const last = f.versions[f.versions.length - 1]?.version;
      if ((input.basedOn ?? undefined) !== last) throw new CutError(`the current version is ${last}, not ${input.basedOn ?? 'none'}`, 409);
      const base = last ? f.timelines.get(last) : undefined;
      const version = `v${last ? Number(last.slice(1)) + 1 : 1}`;
      const t: Timeline = {
        version, fps: input.fps ?? base?.fps ?? 24, width: input.width ?? base?.width ?? frameSize(film.aspect).width, height: input.height ?? base?.height ?? frameSize(film.aspect).height,
        ...(last ? { basedOn: last } : {}), note: input.note?.trim() || undefined, by: input.by ?? 'user', at: new Date().toISOString(),
        tracks: input.tracks, markers: input.markers ?? base?.markers ?? [],
      };
      f.timelines.set(version, copy(t));
      f.versions.push({ version, at: t.at, note: t.note, by: t.by, basedOn: t.basedOn });
      return copy(t);
    },
    readNames: async () => copy(f.names),
    writeNames: async (n) => { f.names = copy(n); },
    aspect: async () => film.aspect,
  };
}
/** Sample mode only: forget a sample film's working cut (the test hook). */
export const forgetMock = (slug: string): boolean => mem.delete(slug);
/** Sample mode only: the versions a sample film holds in memory (the fixture's and those saved since) with their
 *  timelines, for GET …/cut; undefined before the film's store is made. */
export function mockVersions(slug: string): { versions: TimelineVersionRef[]; timelines: Timeline[] } | undefined {
  const m: MemFilm | undefined = mem.get(slug);
  if (!m) return undefined;
  const copy = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
  return { versions: copy(m.versions), timelines: m.versions.map((v: TimelineVersionRef) => m.timelines.get(v.version)).filter((t): t is Timeline => !!t).map(copy) };
}

// ---- the queue

const gq = globalThis as unknown as { __workingQueues?: Map<string, Promise<unknown>> };
const queues = (gq.__workingQueues ??= new Map());
function inQueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn);
  queues.set(key, run.catch(() => undefined));
  return run;
}
/** Runs `fn` in the film's serial queue, the one every change here runs in (stage 4: Alma's drops and the versions
 *  written outside `save`, alma-drop.ts). Inside `fn` call only the `…Now` functions below, never the queued ones
 *  (they would wait for `fn` itself). */
export const inFilmQueue = <T>(s: CutStore, fn: () => Promise<T>): Promise<T> => inQueue(s.key, fn);

// ---- reading and repair

async function newestOf(s: CutStore): Promise<Newest | undefined> {
  const t = await s.newestReadable();
  return t ? { version: t.version, state: contentHash(contentOf(t)), timeline: t } : undefined;
}

async function stateAt(s: CutStore, h: CutHistory, i = h.at): Promise<CutContent> {
  const step = h.steps[i];
  const c = await s.readState(step.state);
  if (!c) throw new WorkingError('missing-state', `the snapshot of step ${i + 1} ("${step.words.slice(0, 60)}") is missing: ${STATES_REL}/${step.state}.json.gz`, 500, [], h.rev);
  return c;
}

async function loadHistory(s: CutStore): Promise<CutHistory | undefined> {
  const raw = await s.readHistory();
  if (raw === undefined) return undefined;
  if (raw && typeof raw === 'object' && '__unreadable' in raw) throw new WorkingError('bad-history', `${HISTORY_REL} is not valid JSON (${String((raw as { __unreadable: string }).__unreadable)})`, 500);
  const { history, problems } = checkHistory(raw);
  if (!history) throw new WorkingError('bad-history', `${HISTORY_REL} does not read as a history`, 500, problems);
  return history;
}

const workingRev = (raw: unknown): number | undefined => (raw && typeof raw === 'object' && typeof (raw as WorkingCut).rev === 'number' ? (raw as WorkingCut).rev : undefined);

/** The history seeded from the readable versions: one snapshot per version on the chain; the pointer's step is the
 *  newest readable version itself (its content is the working cut). */
async function seed(s: CutStore): Promise<{ history: CutHistory; content: CutContent; newest: Newest } | undefined> {
  const refs = await s.versionRefs();
  const newest = await newestOf(s);
  if (!refs.length || !newest) return undefined;
  const { steps: seeded, at } = seedSteps(refs);
  const now = new Date().toISOString();
  const steps: HistoryStep[] = [];
  let content = contentOf(newest.timeline);
  for (const [i, x] of seeded.entries()) {
    const v = i === at ? newest.version : x.version;
    const t = i === at ? newest.timeline : await s.readVersion(v);
    const c = contentOf(t);
    const state = contentHash(c);
    await s.writeState(state, c);
    if (i === at) content = c;
    steps.push({ rev: i + 1, by: x.by, words: x.words, at: t.at ?? now, state, version: v });
  }
  return { history: { format: HISTORY_FORMAT, rev: steps.length, at, steps }, content, newest };
}

async function ensureIn(s: CutStore): Promise<WorkingAnswer | undefined> {
  const h = await loadHistory(s);
  if (!h) {
    const made = await seed(s);
    if (!made) return undefined;
    await s.writeHistory(made.history);
    const working = workingOf2(made.history, made.content, made.newest);
    await s.writeWorking(working);
    return { working, history: summaryOf(made.history) };
  }
  const raw = await s.readWorking();
  if (workingRev(raw) === h.rev) return { working: raw as WorkingCut, history: summaryOf(h) };
  // a crash between the history's write and working.json's: the history is the truth
  const working = workingOf2(h, await stateAt(s, h), await newestOf(s));
  await s.writeWorking(working);
  return { working, history: summaryOf(h) };
}

const workingOf2 = (h: CutHistory, c: CutContent, n?: Newest): WorkingCut => workingOf(h, c, n ? { version: n.version, state: n.state } : undefined);

/** The working cut and history of a film, made the first time from its newest readable version and its version
 *  notes (`edited: false`); undefined for a film with no readable version. Idempotent; repairs working.json from the
 *  history when their revs differ. */
export function ensureWorking(s: CutStore): Promise<WorkingAnswer | undefined> {
  return inQueue(s.key, () => ensureIn(s));
}

/** What is on disk, read only (GET …/cut): nothing is made, seeded or repaired. Undefined when there is no history. */
export async function peekWorking(s: CutStore): Promise<WorkingAnswer | undefined> {
  const h = await loadHistory(s);
  if (!h) return undefined;
  const raw = await s.readWorking();
  if (workingRev(raw) === h.rev) return { working: raw as WorkingCut, history: summaryOf(h) };
  return { working: workingOf2(h, await stateAt(s, h), await newestOf(s)), history: summaryOf(h) };
}

// ---- changes

async function current(s: CutStore, rev: unknown): Promise<{ h: CutHistory; w: WorkingCut }> {
  const a = await ensureIn(s);
  if (!a) throw new WorkingError('no-cut', 'this film has no readable cut version yet', 404);
  const h = (await loadHistory(s))!;
  if (rev !== h.rev) throw new WorkingError('stale', `the cut changed meanwhile (it is at ${h.rev}, not ${String(rev)}): reload and make the change again`, 409, [], h.rev);
  return { h, w: a.working };
}

/** The writes after the snapshot: the history (the step counts from here), then working.json. */
async function commit(s: CutStore, h: CutHistory, content: CutContent): Promise<WorkingAnswer> {
  await s.writeHistory(h);
  const working = workingOf2(h, content, await newestOf(s));
  await s.writeWorking(working);
  return { working, history: summaryOf(h) };
}

/** Removes the snapshots no step uses. Run only after a step passed the cap. Never anything outside cut-states. */
export async function cleanStates(s: CutStore, h: CutHistory): Promise<string[]> {
  const used = new Set(h.steps.map((x) => x.state));
  const gone: string[] = [];
  for (const hash of await s.listStates()) {
    if (used.has(hash)) continue;
    await s.deleteState(hash);
    gone.push(hash);
  }
  if (gone.length && s.files) await logWrite('cut history cleanup', 'delete', s.film.show(path.join(s.film.dir, STATES_REL)), `${gone.length} snapshot${gone.length === 1 ? '' : 's'} no step uses`).catch(() => undefined);
  return gone;
}

export interface StepInput {
  rev: number;
  words: string;
  by?: StepBy;
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
  fps?: Timeline['fps'];
  width?: number;
  height?: number;
  version?: string;               // a restore: the version whose content this is
  drop?: string;                  // an Alma drop's name (cut/alma/<drop>.json), kept on the step (alma-drop.ts)
}

// ---- the frame

/** The frame rule for a cut's content: the brief's aspect read now; the sources' sizes probed only when it would ask. */
export async function frameRuleOf(s: CutStore, c: Pick<CutContent, 'width' | 'height' | 'tracks'>): Promise<FrameRule> {
  const aspect = await s.aspect();
  const first = frameRule(c, aspect);
  if (first.kind !== 'ask' || !s.sizeOf) return first;
  const srcs = [...new Set(c.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips).map((x) => x.src).filter((x): x is string => !!x))];
  const sizes = new Map<string, { width: number; height: number } | undefined>();
  for (const src of srcs.slice(0, 200)) sizes.set(src, await s.sizeOf(src));
  return frameRule(c, aspect, (src) => sizes.get(src));
}

/** When the pointer's cut can take the brief's frame (no picture in the stored shape), one step that sets it ("frame
 *  size set to 1920x1080 from the brief") before the change that wrote it. Earlier versions are never touched. */
async function adoptFrame(s: CutStore, h: CutHistory, by: StepBy): Promise<{ h: CutHistory; w: WorkingCut } | undefined> {
  const before = await stateAt(s, h);
  const r = await frameRuleOf(s, before);
  if (r.kind !== 'adopt') return undefined;
  const content: CutContent = { ...before, width: r.width, height: r.height };
  const state = contentHash(content);
  await s.writeState(state, content);
  const { history, dropped } = addStep(h, { by, words: r.words, at: new Date().toISOString(), state });
  const out = await commit(s, history, content);
  if (dropped.length) await cleanStates(s, history);
  return { h: history, w: out.working };
}

/** Checks the new content against the state before it (the base, for clips past their file's end), keeps its
 *  snapshot, then adds the step. The same content as the pointer's adds nothing (`same: true`). */
async function stepIn(s: CutStore, input: StepInput): Promise<WorkingAnswer & { same?: boolean }> {
  let { h, w } = await current(s, input.rev);
  // a cut of the wrong frame with no picture in it takes the brief's at this write (a step that sets the size itself does not)
  if (input.width === undefined && input.height === undefined) {
    const a = await adoptFrame(s, h, input.by ?? 'user');
    if (a) ({ h, w } = a);
  }
  const before = await stateAt(s, h);
  const raw = {
    version: w.version ?? 'v0', at: new Date().toISOString(),
    fps: input.fps ?? before.fps, width: input.width ?? before.width, height: input.height ?? before.height,
    tracks: input.tracks, markers: input.markers ?? before.markers,
  };
  const { timeline, problems } = await validateTimeline(raw, s.film, { files: s.files, base: before });
  if (!timeline) throw new CutError(`not kept: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, 422, problems);
  const content = contentOf(timeline);
  const state = contentHash(content);
  if (state === h.steps[h.at].state) return { working: w, history: summaryOf(h), same: true };
  await s.writeState(state, content);
  const { history, dropped } = addStep(h, {
    by: input.by ?? 'user', words: (input.words ?? '').trim().slice(0, 300), at: raw.at, state, ...(input.version ? { version: input.version } : {}),
    ...(input.drop ? { drop: input.drop } : {}),
  });
  const out = await commit(s, history, content);
  if (dropped.length) await cleanStates(s, history);
  return out;
}

/** One step: refused with a `stale` WorkingError when `rev` is not the current one, with a 422 CutError when the cut
 *  does not validate. Writes no version. */
export function step(s: CutStore, input: StepInput): Promise<WorkingAnswer & { same?: boolean }> {
  return inQueue(s.key, () => stepIn(s, input));
}

async function move(s: CutStore, rev: unknown, to: (h: CutHistory) => CutHistory | undefined, none: () => WorkingError): Promise<WorkingAnswer> {
  const { h, w } = await current(s, rev);
  const next = to(h);
  if (!next) throw none();
  if (next === h) return { working: w, history: summaryOf(h) };
  return commit(s, next, await stateAt(s, next));
}

export const undo = (s: CutStore, rev: unknown): Promise<WorkingAnswer> =>
  inQueue(s.key, () => move(s, rev, undoOf, () => new WorkingError('no-undo', 'nothing to undo', 409)));
export const redo = (s: CutStore, rev: unknown): Promise<WorkingAnswer> =>
  inQueue(s.key, () => move(s, rev, redoOf, () => new WorkingError('no-redo', 'nothing to redo', 409)));
export const goTo = (s: CutStore, rev: unknown, stepRev: unknown): Promise<WorkingAnswer> =>
  inQueue(s.key, () => move(s, rev, (h) => goToOf(h, stepRev as number), () => new WorkingError('no-step', `no step ${String(stepRev)} in the history`, 409)));

/** An older version into the working cut, as one step ("restored v3") that can be undone. */
export function restore(s: CutStore, rev: unknown, version: string): Promise<WorkingAnswer & { same?: boolean }> {
  return inQueue(s.key, async () => {
    const { h } = await current(s, rev);
    const t = await s.readVersion(version);
    return stepIn(s, { rev: h.rev, words: `restored ${version}`, by: 'restore', tracks: t.tracks, markers: t.markers ?? [], fps: t.fps, width: t.width, height: t.height, version });
  });
}

const WHY_NOTE: Record<SaveWhy, string> = { you: '', render: ' (saved for a render)', final: ' (saved as the final)', alma: '', export: ' (saved for an export)' };

export interface SaveInput { rev: unknown; name?: string; why: SaveWhy; note?: string }

/** Keeps the working cut as the next version (cut/v<n+1>.json, through writeNextVersion: every check of the old
 *  POST …/cut applies). When its content equals the newest version, no file is written (`made: false`). A name goes to
 *  harness/version-names.json either way. The caller runs `afterNewVersion` when `made`, as the old route did. */
export function save(s: CutStore, input: SaveInput): Promise<WorkingAnswer & { version: string; made: boolean }> {
  return inQueue(s.key, () => saveIn(s, input));
}

/** `save` without the queue. `note`, when given, is the version's note as it is (Alma's drop: her own words) in place
 *  of the steps' words. */
async function saveIn(s: CutStore, input: SaveInput): Promise<WorkingAnswer & { version: string; made: boolean }> {
  let { h, w } = await current(s, input.rev);
  const a = await adoptFrame(s, h, input.why === 'alma' ? 'alma' : 'user');
  if (a) ({ h, w } = a);
  const here = h.steps[h.at];
  const newest = await newestOf(s);
  let version: string;
  let made: boolean;
  let out: WorkingAnswer;
  if (newest && newest.state === here.state) {
    version = newest.version;
    made = false;
    out = here.saved === version || here.version === version ? { working: w, history: summaryOf(h) } : await commit(s, markSaved(h, version, input.why, false), await stateAt(s, h));
  } else {
    const content = await stateAt(s, h);
    const note = input.note?.trim() ? input.note.trim().slice(0, 300) : `${wordsForSave(h, newest?.version)}`.slice(0, 280) + WHY_NOTE[input.why];
    const t = await s.saveVersion({
      basedOn: await s.lastListed(), note, by: input.why === 'alma' ? 'alma' : 'user',
      tracks: content.tracks, markers: content.markers, fps: content.fps, width: content.width, height: content.height,
    });
    version = t.version;
    made = true;
    out = await commit(s, markSaved(h, version, input.why, true), content);
  }
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  if (name) {
    const names = await s.readNames();
    names[version] = { name, at: new Date().toISOString() };
    await s.writeNames(names);
  }
    return { ...out, version, made };
}

// ---- without the queue, for code that already runs in it (inFilmQueue; alma-drop.ts)

export const ensureNow = ensureIn;
export const stepNow = stepIn;
export const saveNow = saveIn;
export const historyNow = loadHistory;
export const stateNow = stateAt;
export const commitNow = commit;
export const newestNow = newestOf;

export const readNames = (s: CutStore) => s.readNames();

/** A name for a saved version (stage 2: the name field after a save, which may come after later edits), kept exactly as
 *  typed (at most 120 characters) in harness/version-names.json; the version file is never touched. An empty name, or
 *  one of spaces only, takes the name away. A version that does not exist is a 404. */
export function nameVersion(s: CutStore, version: string, name: string): Promise<{ version: string; name?: string }> {
  return inQueue(s.key, async () => {
    const refs = await s.versionRefs();
    if (!refs.some((r) => r.version === version)) throw new WorkingError('bad-request', `${version} is not a saved version`, 404);
    const names = await s.readNames();
    const kept = name.slice(0, 120);
    if (kept.trim()) names[version] = { name: kept, at: new Date().toISOString() };
    else delete names[version];
    await s.writeNames(names);
    return { version, ...(kept.trim() ? { name: kept } : {}) };
  });
}
