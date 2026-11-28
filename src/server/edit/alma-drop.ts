// Alma's changes to the cut (14 Nov 2026, stage 4 of "saving apart from history"). She reads cut/working.json, keeps
// its rev, and writes one file per piece of work, cut/alma/<YYYYMMDD-HHMMSS>.json = {basedOnRev, note, tracks,
// markers?} (a temp name in the same folder, then a rename). The cut watcher (watch.ts) calls `takeIn` for it, in the
// film's serial queue (working.ts inFilmQueue: a page step and a drop never interleave). The answer goes beside it,
// cut/alma/<same>.answer.json; its existence is the mark that the drop was taken in (also across a restart). Neither a
// drop nor an answer is ever deleted or written over.
//
// Two other ways a version reaches the cut without `save` are brought into the working cut here as well:
//   - `takeInVersion`, the fallback for Alma's old recipe: a cut/v<n>.json written by hand (not by this server) and
//     newer than every version the history names becomes one step on top of the working cut, marked saved, the
//     state before it one undo away;
//   - `writePageVersion`, the old POST …/cut (the page until stage 2): the version written through writeNextVersion,
//     then one step by the user marked saved, so the working cut does not drift.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addStep, contentOf, editsSince, markSaved, type CutHistory, type StepBy } from '@/components/edit/history';
import type { FilmTarget } from '../actions/film';
import type { Timeline, TimelineMarker, TimelineTrack } from '../types';
import { dropFrame } from '@/lib/frame';
import { CUT_DIR, CutError, MAX_SIDE, isVersion, listVersions, logWrite, readVersion, validateTimeline, versionNum, writeNextVersion, writtenByServer, type NewVersion } from './timeline';
import {
  commitNow, contentHash, diskStore, ensureNow, historyNow, inFilmQueue, saveNow, stateNow, stepNow, WorkingError, type CutStore,
} from './working';

export const DROP_DIR = `${CUT_DIR}/alma`;
/** A drop's name: the time it was written, `YYYYMMDD-HHMMSS`, with `-2`, `-3` … when two share a second. */
export const DROP_NAME = /^(\d{8}-\d{6}(?:-\d{1,3})?)\.json$/;
/** What the watcher hands to `takeIn`: any `<name>.json` in cut/alma/ but an answer or a hidden file. A temp name
 *  (`….json.tmp`) is not a `.json`. */
export const isDropFile = (name: string): boolean => /^[^.][^/]*\.json$/.test(name) && !name.endsWith('.answer.json');
export const answerName = (dropFile: string): string => dropFile.replace(/\.json$/, '.answer.json');

export type DropAnswer =
  | { taken: true; rev: number; version?: string; same?: true; unsaved?: true; why?: string }
  | { taken: false; why: string; rev?: number; since?: string[]; problems?: string[] };

// ---- reading a drop

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The drop's text, read again while it is still growing (a file written in place rather than renamed in): up to
 *  three reads 700 ms apart until it parses. */
async function readDrop(file: string): Promise<{ raw?: unknown; error?: string }> {
  let last = '';
  for (let i = 0; i < 4; i++) {
    let text: string;
    try { text = await fs.readFile(file, 'utf8'); } catch { return { error: 'the file could not be read' }; }
    try { return { raw: JSON.parse(text) as unknown }; } catch (e) { last = (e as Error).message.slice(0, 100); }
    if (i < 3) await sleep(700);
  }
  return { error: `the file is not complete JSON (${last}). Write it to a temp name in cut/alma/ and rename it when it is whole` };
}

/** `width` and `height` (or `aspect`, "16:9"): the frame Alma asks for, when she changes it. */
interface Drop { basedOnRev: number; note: string; tracks: TimelineTrack[]; markers?: TimelineMarker[]; width?: number; height?: number }

/** The drop's shape, said in plain words when it is wrong. */
export function checkDrop(raw: unknown): { drop?: Drop; problems: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: ['the file is not a JSON object {basedOnRev, note, tracks, markers} (aspect, or width and height, when the frame changes)'] };
  const d = raw as Record<string, unknown>;
  const p: string[] = [];
  if (typeof d.basedOnRev !== 'number' || !Number.isInteger(d.basedOnRev) || d.basedOnRev < 0) p.push('basedOnRev must be the rev you read in cut/working.json (a whole number)');
  if (typeof d.note !== 'string' || !d.note.trim()) p.push('note must say in one line what you changed');
  if (!Array.isArray(d.tracks) || !d.tracks.length) p.push('tracks must be the full list of tracks of the cut');
  if (d.markers !== undefined && !Array.isArray(d.markers)) p.push('markers must be a list');
  const fr = dropFrame(d, MAX_SIDE);
  p.push(...fr.problems);
  if (p.length) return { problems: p };
  return { drop: { basedOnRev: d.basedOnRev as number, note: (d.note as string).trim().replace(/\s+/g, ' ').slice(0, 300), tracks: d.tracks as TimelineTrack[], ...(d.markers ? { markers: d.markers as TimelineMarker[] } : {}), ...(fr.frame ?? {}) }, problems: [] };
}

// ---- the answer

async function exists(f: string): Promise<boolean> {
  return fs.access(f).then(() => true, () => false);
}

/** Writes the answer once: a temp file, then a hard link to the answer's name (refused if one is there: never over
 *  an answer), then the temp name goes. */
async function writeAnswer(film: FilmTarget, file: string, a: DropAnswer): Promise<boolean> {
  const to = answerName(file);
  const tmp = path.join(path.dirname(to), `.${path.basename(to)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  await fs.writeFile(tmp, `${JSON.stringify(a, null, 1)}\n`, { flag: 'wx' });
  try {
    await fs.link(tmp, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
  await logWrite('alma drop', 'write', film.show(to), a.taken ? `taken${a.version ? ` as ${a.version}` : ''}` : `not taken: ${a.why.slice(0, 120)}`).catch(() => undefined);
  return true;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The words of the steps made after `rev` (the newest last), for a refusal: what changed since she read the cut. */
function stepsSince(h: CutHistory, rev: number): string[] {
  return h.steps.filter((s) => s.rev > rev).map((s) => `${s.by === 'alma' ? 'Alma: ' : ''}${s.words}`);
}

// ---- takeIn

export interface TakeInResult { file: string; answer?: DropAnswer; already?: boolean }

/** One drop into the cut, in the film's queue. Never throws for a bad drop: the reason goes into its answer. A drop
 *  already answered (its answer file exists) is left alone. */
export function takeIn(film: FilmTarget, file: string, store: CutStore = diskStore(film)): Promise<TakeInResult> {
  return inFilmQueue(store, () => takeInNow(film, file, store));
}

async function takeInNow(film: FilmTarget, file: string, s: CutStore): Promise<TakeInResult> {
  const name = path.basename(file);
  if (!isDropFile(name)) return { file };
  if (await exists(answerName(file))) return { file, already: true };
  if (!(await exists(file))) return { file };
  const answer = await answerFor(s, name, file);
  const wrote = await writeAnswer(film, file, answer);
  return wrote ? { file, answer } : { file, already: true };
}

async function answerFor(s: CutStore, name: string, file: string): Promise<DropAnswer> {
  const stem = DROP_NAME.exec(name)?.[1];
  if (!stem) return { taken: false, why: `The name ${name} is not a drop's name. Name it by the time you write it, YYYYMMDD-HHMMSS.json (for example 20261114-101500.json).` };
  const { raw, error } = await readDrop(file);
  if (error) return { taken: false, why: `Not taken: ${error}.` };
  const { drop, problems } = checkDrop(raw);
  if (!drop) return { taken: false, why: `Not taken: the file is not a drop. ${problems.join('; ')}.`, problems };
  let h: CutHistory | undefined;
  try {
    if (!(await ensureNow(s))) return { taken: false, why: 'Not taken: this film has no readable cut version yet.' };
    h = (await historyNow(s))!;
  } catch (e) {
    return { taken: false, why: `Not taken: the cut's history cannot be read (${(e as Error).message}).`, ...(e instanceof CutError && e.problems.length ? { problems: e.problems } : {}) };
  }
  // the same drop taken in before its answer was written (a crash between the two): answer what happened then
  const before = h.steps.find((x) => x.drop === stem);
  if (before) return { taken: true, rev: h.rev, ...(before.saved ? { version: before.saved } : {}) };
  if (drop.basedOnRev !== h.rev) {
    const since = stepsSince(h, drop.basedOnRev);
    const what = since.length ? `${plural(since.length, 'step')} since: ${since.slice(-5).join('; ')}` : 'an undo, a redo or a save since';
    return {
      taken: false, rev: h.rev, since,
      why: `Not taken: the cut changed after you read it (you read rev ${drop.basedOnRev}, it is now at rev ${h.rev}; ${what}). Nothing was written to the cut. Read cut/working.json again and make your change on it.`,
    };
  }
  let stepped: Awaited<ReturnType<typeof stepNow>>;
  try {
    stepped = await stepNow(s, { rev: h.rev, words: drop.note, by: 'alma', tracks: drop.tracks, ...(drop.markers ? { markers: drop.markers } : {}), ...(drop.width ? { width: drop.width, height: drop.height } : {}), drop: stem });
  } catch (e) {
    if (e instanceof WorkingError && e.code === 'stale') return { taken: false, rev: e.rev, why: `Not taken: the cut changed after you read it. Read cut/working.json again and make your change on it.`, since: [] };
    if (e instanceof CutError && e.status === 422) return { taken: false, rev: h.rev, why: `Not taken: the cut does not check out (${plural(e.problems.length, 'problem')}). Nothing was written to the cut. Fix them and write a new drop.`, problems: e.problems };
    return { taken: false, rev: h.rev, why: `Not taken: ${(e as Error).message}.` };
  }
  if (stepped.same) {
    const w = stepped.working;
    // nothing changed: the version with the same content, or none when the cut holds edits the user has not saved
    return w.equals
      ? { taken: true, same: true, rev: w.rev, version: w.equals }
      : { taken: true, same: true, unsaved: true, rev: w.rev, why: 'Your drop is the cut as it is: nothing changed. The cut has edits the user has not saved as a version.' };
  }
  try {
    const saved = await saveNow(s, { rev: stepped.working.rev, why: 'alma', note: drop.note });
    if (saved.made) void afterVersion(s.film, saved.version);
    return { taken: true, rev: saved.working.rev, version: saved.version };
  } catch (e) {
    // the step is in (the user can undo it); the version could not be written
    return { taken: true, rev: stepped.working.rev, unsaved: true, why: `Your change is in the cut as one step, but it was not saved as a version: ${(e as Error).message}` };
  }
}

/** What the old route did after a version: its check (render.ts afterNewVersion 'page'), loaded late so the pure
 *  parts of this module load without the render queue. */
async function afterVersion(film: FilmTarget, version: string): Promise<void> {
  try {
    const { afterNewVersion } = await import('./render');
    await afterNewVersion(film.slug, version, 'page');
  } catch { /* the check is the render's; the version is written */ }
}

// ---- versions written outside `save`

/** The highest version number the history names (seeded from, equal to, or saved at a step). */
const newestNamed = (h: CutHistory): number => Math.max(0, ...h.steps.flatMap((x) => [x.saved, x.version].filter(isVersion).map(versionNum)));

/** Is cut/<version>.json one the server did not write? This process wrote it through writeNextVersion (in memory), or
 *  the history names it or a newer one (what survives a restart): either way it is the server's or already in. */
export function handWritten(film: FilmTarget, version: string, h: CutHistory): boolean {
  if (writtenByServer(film, version)) return false;
  return versionNum(version) > newestNamed(h);
}

export interface VersionResult { version: string; took?: 'step' | 'mark'; skipped?: string; words?: string }

/** The fallback for Alma's old recipe: a version file written by hand becomes one step on top of the working cut, in
 *  the film's queue. Nothing when there is no working cut yet (the history is seeded from the newest version when it
 *  is made), when the server wrote the file, when the history names it or a newer one, or when it does not check out
 *  (the refusal is render.ts checkVersion's log, as before). */
export function takeInVersion(film: FilmTarget, version: string, store: CutStore = diskStore(film)): Promise<VersionResult> {
  return inFilmQueue(store, () => takeInVersionNow(film, version, store));
}

async function takeInVersionNow(film: FilmTarget, version: string, s: CutStore): Promise<VersionResult> {
  if (!isVersion(version)) return { version, skipped: 'not a version name' };
  let h: CutHistory | undefined;
  try { h = await historyNow(s); } catch { return { version, skipped: 'the history cannot be read' }; }
  if (!h) return { version, skipped: 'no working cut yet' };
  if (!handWritten(film, version, h)) return { version, skipped: 'written by the server, or in the history already' };
  let t: Timeline;
  try { t = await readVersion(film, version); } catch { return { version, skipped: 'does not read as a timeline' }; }
  const base = t.basedOn && isVersion(t.basedOn) ? await readVersion(film, t.basedOn).catch(() => undefined) : undefined;
  const { timeline, problems } = await validateTimeline(t, film, { base: base ?? (await stateNow(s, h).catch(() => undefined)) });
  if (!timeline) return { version, skipped: `does not check out (${problems.length})` };
  const content = contentOf(timeline);
  const state = contentHash(content);
  const here = h.steps[h.at];
  if (state === here.state) {
    await commitNow(s, markSaved(h, version, 'alma', false), content);
    return { version, took: 'mark' };
  }
  const by: StepBy = t.by === 'user' ? 'user' : 'alma';
  const note = (t.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 220) || version;
  const n = editsSince(h).count;
  const over = n > 0 ? `, over ${plural(n, 'edit')} not saved as a version; Undo brings them back` : '';
  const words = `${by === 'alma' ? 'Alma: ' : `${version} written on disk: `}${note}${over}`;
  await s.writeState(state, content);
  const { history } = addStep(h, { by, words, at: t.at ?? new Date().toISOString(), state, saved: version, why: by === 'alma' ? 'alma' : 'you' });
  await commitNow(s, history, content);
  return { version, took: 'step', words };
}

/** The old POST …/cut (the page's way until stage 2): the version written through writeNextVersion, in the film's
 *  queue, then, when the film has a working cut, one step by the user with the version's note, marked saved (or the
 *  step at the pointer marked, when it is that content already). A history that cannot be read is left as it is. */
export function writePageVersion(film: FilmTarget, input: NewVersion, store: CutStore = diskStore(film)): Promise<Timeline> {
  return inFilmQueue(store, async () => {
    const t = await writeNextVersion(film, input);
    try {
      const h = await historyNow(store);
      if (h) {
        const content = contentOf(t);
        const state = contentHash(content);
        if (state === h.steps[h.at].state) await commitNow(store, markSaved(h, t.version, 'you', true), content);
        else {
          await store.writeState(state, content);
          const by: StepBy = t.by === 'alma' ? 'alma' : 'user';
          const { history } = addStep(h, { by, words: t.note ?? t.version, at: t.at, state, saved: t.version, why: by === 'alma' ? 'alma' : 'you' });
          await commitNow(store, history, content);
        }
      }
    } catch { /* the version is written; the working cut catches up on the next change */ }
    return t;
  });
}

// ---- at start

/** What waited while the server was down, oldest first (by the file's time, then its name): versions written by hand
 *  newer than the history, and drops with no answer. */
export async function takeInWaiting(film: FilmTarget, store: CutStore = diskStore(film)): Promise<(TakeInResult | VersionResult)[]> {
  const items: { at: number; name: string; run: () => Promise<TakeInResult | VersionResult> }[] = [];
  const h = await historyNow(store).catch(() => undefined);
  if (h) {
    for (const v of await listVersions(film)) {
      if (!handWritten(film, v, h)) continue;
      const st = await fs.stat(path.join(film.dir, CUT_DIR, `${v}.json`)).catch(() => undefined);
      items.push({ at: st?.mtimeMs ?? 0, name: v, run: () => takeInVersion(film, v, store) });
    }
  }
  const dir = path.join(film.dir, DROP_DIR);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const have = new Set(names);
  for (const n of names) {
    if (!isDropFile(n) || have.has(answerName(n))) continue;
    const st = await fs.stat(path.join(dir, n)).catch(() => undefined);
    items.push({ at: st?.mtimeMs ?? 0, name: n, run: () => takeIn(film, path.join(dir, n), store) });
  }
  items.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
  const out: (TakeInResult | VersionResult)[] = [];
  for (const it of items) out.push(await it.run());
  return out;
}
