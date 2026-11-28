// A scene's layouts, read from the film's files (components/edit/layouts.ts says what a layout
// is). Read on request only (GET /api/films/<film>/layouts and the plan route's "layout" action); writes nothing.
//   - the previz takes of each scene: previz/<S>/<S>-previz-take-<n>.json (their shots, framing and spoken parts);
//   - its storyboard versions: previz/<S>/storyboard/v<k>/, each with the previz take it was made from;
//   - its takes: every take with a video (server/edit/shots.ts), each with the layout the record of what was sent names
//     (<G>-take<N>-sent.json beside it, `layout`, written at submission by the kit's record_sent.py), else its date.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { sceneLayouts, type Layout, type TakeLayoutIn } from '@/components/edit/layouts';
import { boardsVersions, previzTakes } from './plan';
import { filmShots } from './shots';
import { resolveSrc } from './timeline';

export interface SceneLayouts { scene: string; layouts: Layout[] }

const readJson = async (f: string): Promise<unknown> => fs.readFile(f, 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);

/** The layout a take's record of what was sent names: the previz take's number and the storyboard version. With
 *  `scene`, only a previz take of that scene's own (previz/<scene>/…): a pick-up's record names its own previz
 *  (previz/FIX-egg-S2/FIX-egg-S2-previz-take-3.json), whose number is not the scene's previz take 3 (such a
 *  pick-up was put under an older layout and left out of the Takes view). It is then placed by its date. */
export function sentLayout(raw: unknown, scene?: string): { previzTake?: number; storyboard?: string } {
  const lay = raw && typeof raw === 'object' ? (raw as { layout?: unknown }).layout : undefined;
  if (!lay || typeof lay !== 'object') return {};
  const l = lay as { previz_take_number?: unknown; previz_take?: unknown; storyboard_version?: unknown };
  const pv = typeof l.previz_take === 'string' ? l.previz_take.replace(/\\/g, '/') : undefined;
  if (scene && pv && !new RegExp(`(^|/)previz/${scene}/`).test(pv)) return {};
  const n = typeof l.previz_take_number === 'number' ? l.previz_take_number : Number(/take-(\d+)/.exec(String(l.previz_take ?? ''))?.[1]);
  return { ...(Number.isInteger(n) && n > 0 ? { previzTake: n } : {}), ...(typeof l.storyboard_version === 'string' ? { storyboard: l.storyboard_version } : {}) };
}

/** Every scene of the film that has a previz take, with its layouts (oldest first). `only`: one scene. */
export async function readLayouts(film: FilmTarget, only?: string): Promise<SceneLayouts[]> {
  const scenes = (await fs.readdir(path.join(film.dir, 'previz')).catch(() => [] as string[]))
    .filter((n) => /^S\d+[A-Za-z]?$/.test(n) && (!only || n === only))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!scenes.length) return [];
  const { takes } = await filmShots(film);
  const out: SceneLayouts[] = [];
  for (const scene of scenes) {
    const previz = await previzTakes(film, scene);
    if (!previz.length) continue;
    const boards = await boardsVersions(film, scene, previz);
    const mine: TakeLayoutIn[] = [];
    for (const t of takes.filter((x) => x.scene === scene && x.state !== 'making')) {
      const abs = resolveSrc(film, t.src);
      if (!abs) continue;
      const dir = path.dirname(abs);
      const sent = (await fs.readdir(dir).catch(() => [] as string[])).find((n) => /-sent\.json$/.test(n));
      const rec = sent ? sentLayout(await readJson(path.join(dir, sent)), scene) : {};
      const made = await fs.stat(abs).then((x) => x.mtimeMs, () => undefined);
      mine.push({ src: t.src, name: t.name, landed: t.state !== 'failed', ...(t.seconds !== undefined ? { seconds: t.seconds } : {}), ...(made !== undefined ? { made } : {}), ...rec });
    }
    const layouts = sceneLayouts(previz.map((p) => ({ n: p.n, shots: p.shots, lines: p.lines, written: p.written })), boards, mine);
    if (layouts.length) out.push({ scene, layouts });
  }
  return out;
}
