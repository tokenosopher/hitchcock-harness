// What the Shots page needs besides the takes and the cut: each generation folder's shot list
// (<G>-shots.json), the SHOT numbers of its newest prompt, when its list was written, its storyboard's first panel per
// shot, the planned cuts of each take's check (check.json), and the newest previz of the whole film with its scenes'
// times. Read only; the page places the shots from these (components/shots/places.ts).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../../actions/film';
import type { GenPlan, PlanShot } from '@/components/shots/places';
import { sceneOfFolder } from '../../edit/shots';
import { storyboardOf } from '../../edit/plan';
import { probe } from '../../edit/probe';
import { asNumber, asRecord, asString, natCmp } from '../util';

/** The whole film's previz: its file (repo-relative), version, length and where each scene runs in it. */
export interface FilmPreviz { path: string; version: string; seconds?: number; scenes: { scene: string; from: number; to: number }[] }
export interface ShotList { gens: GenPlan[]; checks: Record<string, number[]>; previz?: FilmPreviz }

const ROOTS = ['generations', 'blocks'];
const GEN = /^(S\d+|FIX-.+)$/;

const readJson = (f: string): Promise<unknown> => fs.readFile(f, 'utf8').then((x) => JSON.parse(x) as unknown, () => undefined);
const dirs = async (p: string): Promise<string[]> =>
  (await fs.readdir(p, { withFileTypes: true }).catch(() => [])).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).map((e) => e.name);
const files = async (p: string): Promise<string[]> => (await fs.readdir(p).catch(() => [] as string[])).filter((n) => !n.startsWith('.'));

/** A shots file's shots, in order: `{shots: [{id, t0, t1}]}` or the list alone. */
export function readPlan(v: unknown): PlanShot[] | undefined {
  const list = Array.isArray(v) ? v : asRecord(v)?.shots;
  if (!Array.isArray(list) || !list.length) return undefined;
  const out: PlanShot[] = [];
  for (const x of list) {
    const r = asRecord(x);
    const id = r ? (typeof r.id === 'number' ? String(r.id) : asString(r.id)) : undefined;
    if (!id?.trim()) return undefined;
    out.push({ id: id.trim(), ...(asNumber(r!.t0) !== undefined ? { t0: asNumber(r!.t0) } : {}), ...(asNumber(r!.t1) !== undefined ? { t1: asNumber(r!.t1) } : {}) });
  }
  return out;
}

/** The SHOT numbers a prompt's headings give, in order, once each: "SHOT 4: …", "SHOT 4A (…)". */
export function promptShots(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^[ \t]*SHOT[ \t]+(\d+[A-Za-z]?)(?=[\s:.(—-]|$)/gm)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

async function readGen(film: FilmTarget, root: string, name: string): Promise<GenPlan | undefined> {
  const dir = path.join(film.dir, root, name);
  const scene = sceneOfFolder([root, name]);
  if (!scene) return undefined;
  const shotsFile = path.join(dir, `${name}-shots.json`);
  const [plan, st] = await Promise.all([readJson(shotsFile).then(readPlan), fs.stat(shotsFile).catch(() => undefined)]);
  const promptDir = path.join(dir, 'prompt');
  const newest = (await files(promptDir)).filter((f) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-prompt-v\\d+\\.txt$`).test(f)).sort(natCmp).pop();
  const prompt = newest ? promptShots(await fs.readFile(path.join(promptDir, newest), 'utf8').catch(() => '')) : [];
  const board = await storyboardOf(film, name).catch(() => undefined);
  const first = new Map<string, string>();
  for (const p of [...(board?.panels ?? [])].sort((a, b) => a.t - b.t)) if (!first.has(p.shot)) first.set(p.shot, p.src);
  // the scene's newest previz take, for a place with no panel
  let previz: string | undefined;
  if (name === scene) {
    const re = new RegExp(`^${scene}-previz-take-(\\d+)\\.mp4$`);
    const takes = (await files(path.join(film.dir, 'previz', scene))).filter((f) => re.test(f)).sort(natCmp);
    if (takes.length) previz = film.show(path.join(film.dir, 'previz', scene, takes[takes.length - 1]));
  }
  const dropped = await fs.stat(path.join(dir, 'dropped.txt')).then(() => true, () => false)
    || await fs.stat(path.join(film.dir, 'previz', name, 'dropped.txt')).then(() => true, () => false);
  return {
    name, scene,
    ...(plan ? { plan } : {}),
    ...(prompt.length ? { prompt } : {}),
    ...(st ? { written: Math.floor(st.mtimeMs) } : {}),
    ...(first.size ? { board: [...first].map(([shot, src]) => ({ shot, src })) } : {}),
    ...(previz ? { previz } : {}),
    ...(dropped ? { dropped: true } : {}),
  };
}

/** Each take's check: `<G>/takes/<take>/check.json`'s planned cuts, by the take's folder (repo-relative). */
async function readChecks(film: FilmTarget, root: string, name: string, out: Record<string, number[]>): Promise<void> {
  const tdir = path.join(film.dir, root, name, 'takes');
  for (const t of await dirs(tdir)) {
    const j = asRecord(await readJson(path.join(tdir, t, 'check.json')));
    const planned = Array.isArray(j?.planned_cuts) ? j!.planned_cuts.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : undefined;
    if (planned?.length) out[film.show(path.join(tdir, t))] = planned;
  }
}

/** The newest previz of the whole film (previz/film/*-previz-film-vN.mp4), with its json's length and scene times. */
export async function readFilmPreviz(film: FilmTarget): Promise<FilmPreviz | undefined> {
  const dir = path.join(film.dir, 'previz', 'film');
  const mp4 = (await files(dir)).filter((f) => /-previz-film-v\d+[a-z]?\.mp4$/i.test(f)).sort(natCmp).pop();
  if (!mp4) return undefined;
  const version = `v${/-v(\d+[a-z]?)\.mp4$/i.exec(mp4)?.[1] ?? ''}`;
  const j = asRecord(await readJson(path.join(dir, mp4.replace(/\.mp4$/i, '.json'))));
  const scenes = (Array.isArray(j?.blocks) ? j!.blocks : []).flatMap((b) => {
    const r = asRecord(b);
    const scene = asString(r?.block), from = asNumber(r?.start), to = asNumber(r?.end);
    return scene && from !== undefined && to !== undefined && to > from ? [{ scene, from, to }] : [];
  });
  const seconds = asNumber(j?.duration) ?? (await probe(path.join(dir, mp4)).catch(() => undefined))?.duration;
  return { path: film.show(path.join(dir, mp4)), version, ...(seconds ? { seconds } : {}), scenes };
}

export async function readShotList(film: FilmTarget): Promise<ShotList> {
  const gens: GenPlan[] = [];
  const checks: Record<string, number[]> = {};
  for (const root of ROOTS) {
    for (const name of (await dirs(path.join(film.dir, root))).filter((n) => GEN.test(n))) {
      const g = await readGen(film, root, name);
      if (g) gens.push(g);
      await readChecks(film, root, name, checks);
    }
  }
  const previz = await readFilmPreviz(film);
  return { gens, checks, ...(previz ? { previz } : {}) };
}
