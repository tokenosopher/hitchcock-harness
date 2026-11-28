// For the Shot details page (GET /api/films/[film]/shotdetails): the previz take a take's storyboard was drawn from,
// with the times of its shots (previz/<G>/<G>-previz-take-<N>.json, written by the previz kit: `duration` and
// `shots: [{id, t0, t1}]`, the clip beside it as .mp4), and the storyboard's panels (<storyboard>/panels.json:
// `[{n, shot, file}]`, each panel's picture under the storyboard folder). Read only; nothing here is sent to the model.
import { abs, asNumber, asRecord, asString, exists, readJson, type FilmCtx } from '../util';

export interface PrevizTake {
  /** The previz take's record and its clip, relative to the film folder (the clip only when it is on disk). */
  json: string;
  clip?: string;
  take?: number;
  seconds: number;
  /** Its shots' times, in its order; empty when the record gives none. */
  shots: { id?: string; t0: number; t1: number }[];
}
export interface BoardPanel { n: number; shot?: string; file: string }
/** What GET …/shotdetails answers. `from`: the take's own previz, or its scene's newest when the take's record names
 *  none. */
export interface ShotDetailsExtra { previz?: PrevizTake & { from: 'take' | 'scene' }; panels?: BoardPanel[] }

const safe = (rel: string) => !rel.split(/[\\/]/).includes('..') && !rel.includes('\0') && !rel.startsWith('/');
/** A previz take's record or clip under previz/. */
export const previzPathOk = (rel: string): boolean => /^previz\/.+-previz-take-\d+\.(json|mp4)$/.test(rel) && safe(rel);
/** A storyboard folder under previz/. */
export const boardPathOk = (rel: string): boolean => /^previz\/.+\/storyboard\/[^/]+\/?$/.test(rel) && safe(rel);

/** A previz take's record as written, made safe: undefined without a length. */
export function parsePrevizTake(raw: unknown, json: string): PrevizTake | undefined {
  const j = asRecord(raw);
  const seconds = asNumber(j?.duration) ?? (asNumber(j?.frames) && asNumber(j?.fps) ? asNumber(j?.frames)! / asNumber(j?.fps)! : undefined);
  if (!j || !seconds || seconds <= 0) return undefined;
  const list = Array.isArray(j.shots) ? j.shots : Array.isArray(j.shot_plan) ? j.shot_plan : [];
  const shots: PrevizTake['shots'] = [];
  for (const v of list) {
    const s = asRecord(v);
    const t0 = asNumber(s?.t0), t1 = asNumber(s?.t1);
    if (!s || t0 === undefined || t1 === undefined || !(t1 > t0)) continue;
    const id = asString(s.id) ?? asString(s.label) ?? (asNumber(s.id) !== undefined ? String(s.id) : undefined);
    shots.push({ ...(id ? { id } : {}), t0, t1 });
  }
  return { json, seconds, shots, ...(asNumber(j.take) !== undefined ? { take: asNumber(j.take) } : {}) };
}

/** A storyboard's panels.json, each panel's picture made relative to the film folder. */
export function parsePanels(raw: unknown, board: string): BoardPanel[] {
  const dir = board.replace(/\/+$/, '');
  const out: BoardPanel[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const p = asRecord(v);
    const n = asNumber(p?.n), file = asString(p?.file);
    if (!p || n === undefined || !file || !safe(file)) continue;
    const shot = asString(p.shot) ?? (asNumber(p.shot) !== undefined ? String(p.shot) : undefined);
    out.push({ n, file: `${dir}/${file}`, ...(shot ? { shot } : {}) });
  }
  return out.sort((a, b) => a.n - b.n);
}

/** The previz take at `rel` (its record, or its clip: the record beside it is read). */
export async function readPrevizTake(ctx: FilmCtx, rel: string): Promise<PrevizTake | undefined> {
  if (!previzPathOk(rel)) return undefined;
  const json = rel.replace(/\.mp4$/, '.json');
  const raw = await readJson(ctx, json);
  const t = raw === undefined ? undefined : parsePrevizTake(raw, json);
  const clip = json.replace(/\.json$/, '.mp4');
  const has = await exists(abs(ctx, clip));
  if (!t) return has ? { json, clip, seconds: 0, shots: [] } : undefined;
  return { ...t, ...(has ? { clip } : {}) };
}

export async function readPanels(ctx: FilmCtx, board: string): Promise<BoardPanel[] | undefined> {
  if (!boardPathOk(board)) return undefined;
  const raw = await readJson(ctx, `${board.replace(/\/+$/, '')}/panels.json`);
  return raw === undefined ? undefined : parsePanels(raw, board);
}
