// The timeline from day one, on the server (15 Nov 2026, ASKS 47; ARCHITECTURE.md "The timeline from day one").
// `readPlanSource` reads what the planned parts are built from: the locked script, the shot lists and the boards.
// `planUpdate`, `planTake` and `planBoards` change the working cut as ONE step each, in the film's serial queue
// (working.ts inFilmQueue: never between a page step and a drop). A step asked by Alma is saved as a version with
// her note, as a drop is; one asked by the page is a step only. Nothing here runs by itself.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import type { Timeline } from '../types';
import { bringUp, boardsBack, hasPlanned, READING_PACE, takeForBoards, type PlanScene, type PlanShot, type PlanSource, type TakeIn } from '@/components/edit/planned';
import { CutError, resolveSrc } from './timeline';
import { ensureNow, historyNow, inFilmQueue, saveNow, stateNow, stepNow, WorkingError, type CutStore, type WorkingAnswer } from './working';
import { probe } from './probe';

// ---- reading the files

const read = (f: string) => fs.readFile(f, 'utf8').catch(() => undefined);
const readJson = async <T>(f: string): Promise<T | undefined> => { const t = await read(f); try { return t === undefined ? undefined : JSON.parse(t) as T; } catch { return undefined; } };

/** The `## Script` section of script.md, up to the next `## ` heading. */
function scriptSection(md: string): string | undefined {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Script\s*$/.test(l));
  if (start < 0) return undefined;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

const LINE = /^\*\*([^*]+?):?\*\*\s*(?:\*\([^)]*\):?\*\s*)?:?\s*["“](.*)["”]\s*$/;
const ACTION = /^`\[(\d+(?:\.\d+)?)\s*s\]`\s*(.*)$/;

/** script.md as the planned parts read it: the locked version, the pace it names, and per scene its title, its lines
 *  and actions in order and its own length ("≈ s"). Undefined when there is no `## Script`. */
export function parseScript(md: string): { locked?: { version: string; date?: string }; pace: { wps: number; gap: number }; scenes: PlanScene[]; names: Map<string, string> } | undefined {
  const body = scriptSection(md);
  if (!body) return undefined;
  const note = body.split('\n').find((l) => /^\*v\d/.test(l.trim())) ?? '';
  const lock = /\bv(\d+(?:\.\d+)*),?\s+LOCKED\b(?:[^(]*?(\d{4}-\d{2}-\d{2}))?/.exec(note);
  const wps = Number(/about\s+(\d+(?:\.\d+)?)\s+words a second/i.exec(md)?.[1]);
  const gap = Number(/(\d+(?:\.\d+)?)\s*s\s+(?:word to word\s+)?between lines/i.exec(md)?.[1]);
  const scenes: PlanScene[] = [];
  let cur: PlanScene | undefined;
  let tableCol = -1;
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    const h = /^###\s+(S\d+[A-Za-z]?)\s*[·:-]\s*([^·]+?)(?:\s*·.*)?$/.exec(l);
    if (h) { cur = { id: h[1], title: h[2].trim(), items: [] }; scenes.push(cur); tableCol = -1; continue; }
    if (/^###\s/.test(l)) { cur = undefined; continue; }
    if (!cur) continue;
    const a = ACTION.exec(l);
    if (a) { cur.items.push({ text: a[2].trim(), secs: Number(a[1]) }); continue; }
    const m = LINE.exec(l);
    if (m) { cur.items.push({ who: m[1].trim(), text: m[2].trim() }); continue; }
    // the scene's timing row: | S1 | 2 | 19 | 6 | 19 ÷ 2.9 + 0.5 + 6 = 13.1 → 13 | 0:13 |
    if (l.startsWith('|')) {
      const cells = l.split('|').slice(1, -1).map((c) => c.trim());
      const i = cells.findIndex((c) => /^≈\s*s$/.test(c));
      if (i >= 0) { tableCol = i; continue; }
      if (tableCol >= 0 && cells[0] === cur.id) {
        const n = Number(/(?:→\s*)?(\d+(?:\.\d+)?)(?:\s*\([^)]*\))?\s*$/.exec(cells[tableCol])?.[1] ?? /^(\d+(?:\.\d+)?)/.exec(cells[tableCol])?.[1]);
        if (Number.isFinite(n) && n > 0) cur.seconds = n;
      }
    }
  }
  // the names of the ID table, for "in frame": "MAREN" → "Maren", "the BOY" → "the boy"
  const names = new Map<string, string>();
  const ids = /^##\s+IDs\b[\s\S]*?(?=^##\s)/m.exec(md)?.[0] ?? /^##\s+IDs\b[\s\S]*$/m.exec(md)?.[0] ?? '';
  for (const m of `${ids}\n${md}`.matchAll(/(\bthe\s+)?\b([A-Z][A-Z'’]{2,})\b/g)) {
    const tag = m[2];
    if (names.has(tag) || /^(ID|IDS|LOCKED|HARD|CUT|CAM|S|L|C|P)$/.test(tag)) continue;
    names.set(tag, m[1] ? `the ${tag.toLowerCase()}` : tag.charAt(0) + tag.slice(1).toLowerCase());
  }
  return {
    ...(lock ? { locked: { version: `v${lock[1]}`, ...(lock[2] ? { date: lock[2] } : {}) } } : {}),
    pace: { wps: wps > 0 ? wps : READING_PACE.wps, gap: gap >= 0 && Number.isFinite(gap) ? gap : READING_PACE.gap },
    scenes, names,
  };
}

/** A shot file's `in_frame` tags in words: a character by its name, anything else as "the rope". */
export function inFrameWords(tags: string[], names: Map<string, string>): string {
  return tags.map((t) => {
    const k = t.toUpperCase();
    const n = names.get(k);
    if (n) return n;
    return `the ${t.toLowerCase().replace(/_/g, ' ')}`;
  }).join(', ');
}

/** The scene file's shots: "### SHOT 3: THE SHADE AND THE PURSE (CAM FACING: N)" and its "**Size:**" line. */
export function sceneFileShots(md: string): Map<string, { title: string; size?: string }> {
  const out = new Map<string, { title: string; size?: string }>();
  let cur: string | undefined;
  for (const l of md.split('\n')) {
    const h = /^###\s+SHOT\s+([0-9A-Za-z]+)\s*:\s*(.+?)(?:\s*\(CAM[^)]*\))?\s*$/.exec(l.trim());
    if (h) { cur = h[1]; out.set(cur, { title: h[2].trim() }); continue; }
    if (/^#{1,3}\s/.test(l.trim())) { cur = undefined; continue; }
    const s = /^\*\*Size:\*\*\s*(.+)$/.exec(l.trim());
    if (s && cur && out.get(cur) && !out.get(cur)!.size) out.get(cur)!.size = s[1].trim();
  }
  return out;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** A scene's boards: each shot id → its first panel in the newest storyboard that has one for it (a later storyboard
 *  can redo only some shots), relative to the film repo. */
async function boardsOf(film: FilmTarget, scene: string): Promise<Map<string, string>> {
  const dir = path.join(film.dir, 'previz', scene, 'storyboard');
  const vs = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => /^v\d+$/.test(n)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  const out = new Map<string, string>();
  for (const v of vs) {
    const panels = await readJson<{ shot?: string; file?: string; t?: number }[]>(path.join(dir, v, 'panels.json'));
    if (!Array.isArray(panels)) continue;
    for (const p of [...panels].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))) {
      if (!p?.shot || !p.file || out.has(String(p.shot))) continue;
      const abs = path.join(dir, v, p.file);
      if (resolveSrc(film, film.show(abs)) && await fs.access(abs).then(() => true, () => false)) out.set(String(p.shot), film.show(abs));
    }
  }
  return out;
}

/** What the planned parts are built from, read from the film's files; undefined when the film has no script. */
export async function readPlanSource(film: FilmTarget): Promise<PlanSource | undefined> {
  const md = await read(path.join(film.dir, 'script.md'));
  if (md === undefined) return undefined;
  const sc = parseScript(md);
  if (!sc) return undefined;
  for (const s of sc.scenes) {
    let folder: string | undefined;
    for (const f of ['generations', 'blocks']) if (await fs.access(path.join(film.dir, f, s.id)).then(() => true, () => false)) { folder = path.join(film.dir, f, s.id); break; }
    if (!folder) continue;
    const j = await readJson<{ duration?: number; shots?: { id?: string | number; t0?: number; t1?: number; in_frame?: string[] }[] }>(path.join(folder, `${s.id}-shots.json`));
    if (!j || !Array.isArray(j.shots) || !j.shots.length) continue;
    const file = sceneFileShots((await read(path.join(folder, `${s.id}-scene.md`))) ?? '');
    const boards = await boardsOf(film, s.id);
    const shots: PlanShot[] = [];
    j.shots.forEach((x, i) => {
      if (typeof x?.t0 !== 'number' || typeof x.t1 !== 'number') return;
      const id = String(x.id ?? i + 1);
      const f = file.get(id);
      const text = f ? (f.size ? `${sentence(f.title)}. ${f.size}` : sentence(f.title)) : undefined;
      shots.push({ n: shots.length + 1, id, t0: x.t0, t1: x.t1, ...(text ? { text } : {}), ...(x.in_frame?.length ? { inFrame: inFrameWords(x.in_frame, sc.names) } : {}),
        ...(boards.get(id) ? { board: boards.get(id) } : {}) });
    });
    if (shots.length) s.shots = shots;
  }
  return { ...(sc.locked ? { locked: sc.locked } : {}), pace: sc.pace, scenes: sc.scenes };
}

// ---- the steps

export interface PlanAnswer extends Partial<WorkingAnswer> {
  /** Nothing to change: the cut already says what the files say. */
  same?: boolean;
  words?: string;
  /** The version written (a step by Alma, or the first cut). */
  version?: string;
  /** Tracks kept as they were because they were changed by hand. */
  kept?: string[];
}

const timelineOf = (c: { fps: Timeline['fps']; width: number; height: number; tracks: Timeline['tracks']; markers: Timeline['markers'] }, version = 'v0'): Timeline =>
  ({ version, fps: c.fps, width: c.width, height: c.height, at: new Date().toISOString(), tracks: c.tracks, markers: c.markers ?? [] });

/** After a version the app wrote on a real film: its check, as the save route does (loaded late, as alma-drop does). */
async function afterVersion(s: CutStore, version: string): Promise<void> {
  if (!s.files) return;
  const { afterNewVersion } = await import('./render');
  await afterNewVersion(s.film.slug, version, 'page').catch(() => undefined);
}

/** One step on the working cut (by the page: a step; by Alma: a step and a version with her words). */
async function stepAndSave(s: CutStore, rev: number, tl: Timeline, words: string, by: 'user' | 'alma'): Promise<PlanAnswer> {
  const stepped = await stepNow(s, { rev, words, by, tracks: tl.tracks, markers: tl.markers });
  if (stepped.same) return { ...stepped, same: true };
  if (by !== 'alma') return { ...stepped, words };
  const saved = await saveNow(s, { rev: stepped.working.rev, why: 'alma', note: words });
  if (saved.made) await afterVersion(s, saved.version);
  return { working: saved.working, history: saved.history, words, version: saved.version };
}

/** The cut and the history now, or the first cut from the locked script. `rev`, when given, must be the history's. */
async function here(s: CutStore, rev?: number): Promise<{ tl?: Timeline; rev?: number }> {
  const a = await ensureNow(s);
  if (!a) return {};
  const h = (await historyNow(s))!;
  if (rev !== undefined && rev !== h.rev) throw new WorkingError('stale', `the cut changed meanwhile (it is at ${h.rev}, not ${rev}): reload and ask again`, 409, [], h.rev);
  return { tl: timelineOf(await stateNow(s, h), a.working.version), rev: h.rev };
}

/** Brings the cut up to date with the film's files (`bringUp`) as one step. A film with no cut gets its first version. */
export function planUpdate(s: CutStore, src: PlanSource | undefined, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    if (!src) throw new CutError('This film has no script.md with a "## Script" section yet.', 409);
    if (!src.locked) throw new CutError('The script is not locked yet: the timeline starts when it is.', 409);
    const now = await here(s, o.rev);
    const b = bringUp(now.tl, src);
    if (!b) return { same: true, ...(now.tl ? await peekNow(s) : {}) };
    if (!now.tl) {
      // the first cut: written as v1, then the working cut and its history seeded from it
      const t = await s.saveVersion({ note: b.words, by: o.by, tracks: b.tl.tracks, markers: b.tl.markers, fps: b.tl.fps, width: b.tl.width, height: b.tl.height });
      await afterVersion(s, t.version);
      const a = await ensureNow(s);
      return { ...(a ?? {}), words: b.words, version: t.version };
    }
    return { ...(await stepAndSave(s, now.rev!, b.tl, b.words, o.by)), kept: b.kept };
  });
}

async function peekNow(s: CutStore): Promise<Partial<WorkingAnswer>> {
  const a = await ensureNow(s);
  return a ?? {};
}

/** What an update would change, without writing anything: its words, or nothing. */
export async function planPending(s: CutStore | undefined, src: PlanSource | undefined): Promise<{ locked: boolean; pending?: string; first?: boolean }> {
  if (!src?.locked) return { locked: false };
  if (!s) return { locked: true, first: true, pending: bringUp(undefined, src)?.words };
  const h = await historyNow(s).catch(() => undefined);
  if (!h) {
    const newest = await s.newestReadable().catch(() => undefined);
    const b = bringUp(newest, src);
    return { locked: true, ...(newest ? {} : { first: true }), ...(b ? { pending: b.words } : {}) };
  }
  const tl = timelineOf(await stateNow(s, h));
  const b = bringUp(tl, src);
  return { locked: true, ...(b ? { pending: b.words } : {}) };
}

/** A scene's take in place of its boards (`takeForBoards`), as one step. */
export function planTake(s: CutStore, scene: string, take: TakeIn, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    const now = await here(s, o.rev);
    if (!now.tl) throw new WorkingError('no-cut', 'this film has no cut yet', 404);
    const r = takeForBoards(now.tl, scene, take);
    if (typeof r === 'string') throw new CutError(r, 409);
    return stepAndSave(s, now.rev!, r.tl, r.words, o.by);
  });
}

/** "Put the boards back" (`boardsBack`), as one step. */
export function planBoards(s: CutStore, scene: string, src: PlanSource | undefined, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    if (!src) throw new CutError('This film has no script to build the boards from.', 409);
    const now = await here(s, o.rev);
    if (!now.tl) throw new WorkingError('no-cut', 'this film has no cut yet', 404);
    const r = boardsBack(now.tl, scene, src);
    if (typeof r === 'string') throw new CutError(r, 409);
    return stepAndSave(s, now.rev!, r.tl, r.words, o.by);
  });
}

/** A take as `takeForBoards` takes it: its file, its length and whether it has sound. */
export async function takeInfo(film: FilmTarget, t: { src: string; name: string; seconds?: number }): Promise<TakeIn | undefined> {
  const abs = resolveSrc(film, t.src);
  const p = abs ? await probe(abs) : undefined;
  const seconds = p?.duration ?? t.seconds;
  if (!seconds) return undefined;
  return { src: t.src, name: t.name, seconds, sound: p ? p.audio : true };
}

export { hasPlanned };
