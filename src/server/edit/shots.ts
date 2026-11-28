// Every take of a film cut into its shots (13 Nov 2026, ASKS 16: "the cuts are already made").
// A take is one generation; the hard cuts inside it are found with ffmpeg's scene detector and kept in
// <film>/harness/shots.json, keyed by the file with its size and time, so a take is read once. The Edit page
// shows the timeline shot by shot and, under it, each scene's takes by shot.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { readShotTags, shotTagsFor } from '@/components/edit/shotCols';
import { FFMPEG, probe } from './probe';

export interface TakeShots {
  src: string;                  // "assets/films/<film>/…", the form the timeline's clips use
  scene: string;                // "S2"
  name: string;                 // "take 1", "row picture · take 1", "prompt length C · take 1"
  group?: string;               // the test's folder ("prompt-length"), absent for the scene's own takes
  seconds?: number;
  cuts?: number[];              // the seconds where a new shot starts (never 0); absent until read
  /** The scene's number of each shot, in order (ASKS 60): from the shots file of the take's own generation folder
   *  (`<generation>/<generation>-shots.json`, beside its `takes/`), only when the file lists as many shots as the take
   *  was cut into and they are not simply 1, 2, 3 … (a pick-up that redoes shot 5 is `[5]`). Absent: 1, 2, 3 ….
   *  When that file has none that fit, the previz take the take's `<G>-take<N>-sent.json` names (`layout.previz_take`,
   *  written by the kit's record_sent.py) gives them, if its shots fit. */
  ids?: number[];
  /** Each shot's own id ("1", "7a", "7b": a letter after the number is a shot added to that one), when one of them has a
   *  letter; two shots can then share a number (components/edit/shotCols.ts). Read every time, never kept. */
  tags?: string[];
  /** 'making': a variation Alma started (its folder has `variation.json` and no video yet; `src` is the folder). */
  state: 'ready' | 'waiting' | 'failed' | 'making';
  /** The take is a variation of another (ASKS 51): its folder's `variation.json`, as Alma wrote it. */
  variation?: TakeVariation;
  /** The file's modification time (ms): when the take landed, so the Edit page can tell a take newer than the cut's
   *  (components/edit/openAt.ts newTakes). */
  made?: number;
}

/** `<take folder>/variation.json`, written by Alma when she starts a variation of a take (recipes/edit.md). `from`:
 *  the source take's file as the chip gave it; `note`: the user's words; `failed`: why it could not be made. */
export interface TakeVariation { from: string; note: string; startedAt: string; failed?: string }

/** A `variation.json` read leniently: undefined unless it names a source. */
export function readVariation(v: unknown): TakeVariation | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const x = v as Record<string, unknown>;
  const str = (k: string) => (typeof x[k] === 'string' ? (x[k] as string).trim() : '');
  const from = str('from');
  if (!from) return undefined;
  const failed = str('failed');
  return { from, note: str('note'), startedAt: str('startedAt'), ...(failed ? { failed } : {}) };
}

interface Kept { size: number; mtime: number; seconds?: number; cuts: number[] }
type Store = Record<string, Kept>;

const ROOTS = ['generations', 'blocks', 'tests'];
// A pick-up's own letter after the scene number is lowercase ("FIX-S6b" is a pick-up of S6): it is not part of the scene.
const SCENE = /(?:^|[^A-Za-z0-9])(S\d+[A-Z]?)[a-z]?(?![A-Za-z0-9])/;
/** The scene a take folder belongs to, from its path under the film: the folder's own name first, then the path. */
export const sceneOfFolder = (rel: string[]): string | undefined => SCENE.exec(rel[rel.length - 1] ?? '')?.[1] ?? SCENE.exec(rel.join('/'))?.[1];
const THRESHOLD = 0.25;         // found every cut and no false one in the fourteen takes tried (13 Nov)

const g = globalThis as unknown as { __shots?: { busy: Map<string, Promise<void>>; stores: Map<string, Store>; failed: Set<string> } };
const mem = (g.__shots ??= { busy: new Map(), stores: new Map(), failed: new Set() });

const storeFile = (film: FilmTarget) => path.join(film.dir, 'harness', 'shots.json');

async function readStore(film: FilmTarget): Promise<Store> {
  const hit = mem.stores.get(film.slug);
  if (hit) return hit;
  let s: Store = {};
  try { s = JSON.parse(await fs.readFile(storeFile(film), 'utf8')) as Store; } catch { /* none yet */ }
  mem.stores.set(film.slug, s);
  return s;
}
async function writeStore(film: FilmTarget, s: Store): Promise<void> {
  const f = storeFile(film);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(s, null, 1)}\n`);
  await fs.rename(tmp, f);
}

const words = (s: string) => s.replace(/[-_]+/g, ' ').trim();
const takeWords = (folder: string) => {
  const m = /^(.*?)[-_ ]?take[-_ ]?(\d+)$/i.exec(folder);
  if (!m) return words(folder);
  return { lead: words(m[1]), n: Number(m[2]) };
};

interface Found { abs: string; rel: string; scene: string; name: string; group?: string; variation?: TakeVariation; making?: boolean; tags?: string[] }

const readTags = (file: string): Promise<string[] | undefined> =>
  fs.readFile(file, 'utf8').then((x) => readShotTags(JSON.parse(x) as unknown)).catch(() => undefined);
/** `<generation>/<generation>-shots.json`'s shot ids (components/edit/shotCols.ts readShotTags); undefined without one. */
const shotTagsIn = (dir: string): Promise<string[] | undefined> => readTags(path.join(dir, `${path.basename(dir)}-shots.json`));

/** The shot ids of the previz take a take was made from: its folder's `*-sent.json` (record_sent.py) names it as
 *  `layout.previz_take`, a path in the film; that file lists the shots with their ids. Undefined when any is missing. */
async function sentTagsIn(film: FilmTarget, takeDir: string): Promise<string[] | undefined> {
  const names = await fs.readdir(takeDir).catch(() => [] as string[]);
  const sent = names.find((n) => /-sent\.json$/i.test(n) && !n.startsWith('.'));
  if (!sent) return undefined;
  const rec = await fs.readFile(path.join(takeDir, sent), 'utf8').then((x) => JSON.parse(x) as { layout?: { previz_take?: unknown } }).catch(() => undefined);
  const rel = rec?.layout?.previz_take;
  if (typeof rel !== 'string' || !rel.trim() || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return undefined;
  return readTags(path.join(film.dir, rel));
}

/** A take's shot numbers and ids for its cuts: the generation's shots file (`tags`), else the previz take its sent
 *  record names, read only then. Nothing when neither fits the take's shots (left to right, as before). */
async function tagsOf(film: FilmTarget, abs: string, fileTags: string[] | undefined, cuts: number[]): Promise<{ ids: number[]; tags?: string[] } | undefined> {
  const own = shotTagsFor([fileTags], cuts);
  if (own || (fileTags && fileTags.length === cuts.length + 1)) return own;
  return shotTagsFor([await sentTagsIn(film, path.dirname(abs))], cuts);
}

/** The takes with a video file: <root>/…/<scene or pick-up>/takes/<take>/<file>.mp4; and a take folder with a
 *  `variation.json` and no video yet, a variation being made (`making`, `abs` is then the folder). */
async function findTakes(film: FilmTarget): Promise<Found[]> {
  const out: Found[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 5) return;
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith('.') || e.name.endsWith('.nosync')) continue;
      const p = path.join(dir, e.name);
      if (e.name !== 'takes') { await walk(p, depth + 1); continue; }
      const rel = path.relative(film.dir, dir).split(path.sep);
      const scene = sceneOfFolder(rel);
      if (!scene) continue;
      const tags = await shotTagsIn(dir);
      const group = rel[0] === 'tests' ? rel[1] : undefined;
      for (const t of await fs.readdir(p, { withFileTypes: true }).catch(() => [])) {
        if (!t.isDirectory()) continue;
        const names = await fs.readdir(path.join(p, t.name)).catch(() => [] as string[]);
        const files = names.filter((n) => /\.mp4$/i.test(n) && !n.startsWith('.'));
        const file = files.find((n) => /-480p\.mp4$/i.test(n)) ?? files[0];
        const variation = names.includes('variation.json')
          ? readVariation(await fs.readFile(path.join(p, t.name, 'variation.json'), 'utf8').then((x) => JSON.parse(x) as unknown).catch(() => undefined))
          : undefined;
        if (!file && !variation) continue;
        const tw = takeWords(t.name);
        const lead = [group ? words(group) : rel[rel.length - 1] !== scene ? words(rel[rel.length - 1]) : '', typeof tw === 'string' ? '' : tw.lead].filter(Boolean).join(' ');
        const name = typeof tw === 'string' ? [lead, tw].filter(Boolean).join(' · ') : [lead, `take ${tw.n}`].filter(Boolean).join(' · ');
        const abs = file ? path.join(p, t.name, file) : path.join(p, t.name);
        out.push({ abs, rel: path.relative(film.dir, abs), scene, name, group, ...(variation ? { variation } : {}), ...(file ? {} : { making: true }), ...(tags ? { tags } : {}) });
      }
    }
  };
  for (const r of ROOTS) await walk(path.join(film.dir, r), 0);
  return out;
}

function detect(abs: string): Promise<number[] | undefined> {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-i', abs, '-vf', `select='gt(scene,${THRESHOLD})',showinfo`, '-an', '-f', 'null', '-'],
      { signal: AbortSignal.timeout(120000), maxBuffer: 8 << 20 }, (err, _out, stderr) => {
        if (err) return resolve(undefined);
        const cuts = [...String(stderr).matchAll(/pts_time:([0-9.]+)/g)].map((m) => Math.round(Number(m[1]) * 1e6) / 1e6).filter((t) => t > 0.2);
        resolve(cuts);
      });
  });
}

/** One take at a time: a film with thirty takes must not start thirty ffmpegs. */
function queue(film: FilmTarget, todo: { abs: string; rel: string; size: number; mtime: number }[], done: () => void): void {
  if (mem.busy.has(film.slug) || !todo.length) return;
  const run = (async () => {
    const store = await readStore(film);
    for (const t of todo) {
      const [cuts, pr] = await Promise.all([detect(t.abs), probe(t.abs)]);
      if (!cuts) { mem.failed.add(`${film.slug}:${t.rel}:${t.mtime}`); continue; }
      const end = pr?.duration;
      store[t.rel] = { size: t.size, mtime: t.mtime, seconds: end, cuts: end ? cuts.filter((c) => c < end - 0.2) : cuts };
      await writeStore(film, store).catch(() => undefined);
    }
  })().finally(() => { mem.busy.delete(film.slug); done(); });
  mem.busy.set(film.slug, run);
}

/** A take's cuts as corrected by hand (when the detector misses a cut or finds a false one): `cuts.json` in the
 *  take's folder, `{"cuts":[2.375,4.042,8]}` or the bare list, in seconds. Read leniently: the numbers inside the take,
 *  in order, once each; undefined when the file is absent or holds no list. An empty list says the take has no cut. */
export function readCuts(v: unknown, seconds?: number): number[] | undefined {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { cuts?: unknown }).cuts) ? (v as { cuts: unknown[] }).cuts : undefined;
  if (!list) return undefined;
  const ok = list.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0.2 && (seconds === undefined || x < seconds - 0.2));
  return [...new Set(ok.map((x) => Math.round(x * 1e6) / 1e6))].sort((x, y) => x - y);
}
const cutsOf = async (abs: string, kept: Kept): Promise<number[]> =>
  readCuts(await fs.readFile(path.join(path.dirname(abs), 'cuts.json'), 'utf8').then((x) => JSON.parse(x) as unknown).catch(() => undefined), kept.seconds) ?? kept.cuts;

/** The film's takes with their shots; takes not read yet are queued and come back as "waiting". */
export async function filmShots(film: FilmTarget, onDone: () => void = () => undefined): Promise<{ takes: TakeShots[]; waiting: number }> {
  const [found, store] = await Promise.all([findTakes(film), readStore(film)]);
  const todo: { abs: string; rel: string; size: number; mtime: number }[] = [];
  const takes: TakeShots[] = [];
  for (const t of found) {
    const v = t.variation ? { variation: t.variation } : {};
    // a variation still being made (or that could not be made): its folder, no shots
    if (t.making) { takes.push({ src: film.show(t.abs), scene: t.scene, name: t.name, group: t.group, ...v, state: 'making' }); continue; }
    const st = await fs.stat(t.abs).catch(() => undefined);
    if (!st) continue;
    const mtime = Math.floor(st.mtimeMs);
    const kept = store[t.rel];
    const base = { src: film.show(t.abs), scene: t.scene, name: t.name, group: t.group, ...v, made: mtime };
    if (kept && kept.size === st.size && kept.mtime === mtime) {
      const cuts = await cutsOf(t.abs, kept);
      const tg = await tagsOf(film, t.abs, t.tags, cuts);
      takes.push({ ...base, seconds: kept.seconds, cuts, ...(tg ?? {}), state: 'ready' });
      continue;
    }
    if (mem.failed.has(`${film.slug}:${t.rel}:${mtime}`)) { takes.push({ ...base, state: 'failed' }); continue; }
    takes.push({ ...base, state: 'waiting' });
    todo.push({ abs: t.abs, rel: t.rel, size: st.size, mtime });
  }
  queue(film, todo, onDone);
  takes.sort((a, b) => a.scene.localeCompare(b.scene, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { takes, waiting: todo.length };
}

/** The shots already found, by clip src, without starting any reading (the master render counts its shots the way
 *  the Edit page shows them: components/edit/shots.ts shotTimeline). A take changed since it was read is left out. */
export async function storedShots(film: FilmTarget): Promise<Map<string, TakeShots>> {
  const store = await readStore(film);
  const out = new Map<string, TakeShots>();
  for (const [rel, kept] of Object.entries(store)) {
    const abs = path.join(film.dir, rel);
    const st = await fs.stat(abs).catch(() => undefined);
    if (!st || st.size !== kept.size || Math.floor(st.mtimeMs) !== kept.mtime) continue;
    const src = film.show(abs);
    // <generation>/takes/<take>/<file>: the generation's shots file numbers the shots, as filmShots does
    const parts = rel.split(/[\\/]/);
    const cuts = await cutsOf(abs, kept);
    const tg = parts.length >= 4 && parts[parts.length - 3] === 'takes' ? await tagsOf(film, abs, await shotTagsIn(path.join(film.dir, ...parts.slice(0, -3))), cuts) : undefined;
    out.set(src, { src, scene: '', name: '', seconds: kept.seconds, cuts, ...(tg ?? {}), state: 'ready' });
  }
  return out;
}
