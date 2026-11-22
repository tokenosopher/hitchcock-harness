// The Takes view's columns: the shots of every take one under the other, with nothing to ask each time new takes
// land. Every take's shot sits under the column of the scene's shot it is, by the id its shots
// file gives it: "4" under Shot 4; "7a" and "7b" (shots added to shot 7, a letter after the number) both under Shot 7,
// side by side in the one cell. Read from the files each time the takes are asked for, so a take that lands is placed
// with nothing done by anyone. A take whose ids do not fit its shots keeps its shots left to right, as before.
import type { Shot } from './shots';

/** A shot's id as a shots file writes it: its scene's shot number `n`, and the id itself, "7" or "7a". */
export interface ShotTag { n: number; tag: string }

/** "7" → 7; "7a" → 7, "7a" (one letter after a whole number from 1, any case, spaces around it). Anything else: none. */
export function parseShotId(raw: unknown): ShotTag | undefined {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 1 ? { n: raw, tag: String(raw) } : undefined;
  if (typeof raw !== 'string') return undefined;
  const m = /^\s*0*(\d+)\s*([a-z])?\s*$/i.exec(raw);
  const n = m ? Number(m[1]) : NaN;
  if (!m || !Number.isInteger(n) || n < 1) return undefined;
  return { n, tag: m[2] ? `${n}${m[2].toLowerCase()}` : String(n) };
}

/** The ids of a shots file, in its order: `{shots: [{id}, …]}` (a generation's `<G>-shots.json`, a previz take's json)
 *  or the list alone. Undefined when there is none, one is not such an id, or one comes twice. */
export function readShotTags(v: unknown): string[] | undefined {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? (v as { shots?: unknown }).shots : undefined;
  if (!Array.isArray(list) || !list.length) return undefined;
  const tags: string[] = [];
  for (const x of list) {
    const p = parseShotId(x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined);
    if (!p || tags.includes(p.tag)) return undefined;
    tags.push(p.tag);
  }
  return tags;
}

/** Does a file's list name the take's shots: one id a shot the take was cut into, each one an id. */
const fits = (file: string[] | undefined, cuts: number[] | undefined): file is string[] =>
  !!file && !!cuts && file.length === cuts.length + 1 && file.every((x) => !!parseShotId(x));

/** What a take carries: `ids`, the scene's shot number of each of its shots, and `tags`, each shot's own id when one
 *  has a letter. From the first of `files` (the generation's shots file, then what the take's sent record points to)
 *  that lists as many shots as the take was cut into; nothing when none does, or when its ids are simply 1, 2, 3 …
 *  (the take as before: its shots left to right). */
export function shotTagsFor(files: (string[] | undefined)[], cuts: number[] | undefined): { ids: number[]; tags?: string[] } | undefined {
  const file = files.find((f) => fits(f, cuts));
  if (!file) return undefined;
  const p = file.map((x) => parseShotId(x)!);
  if (new Set(p.map((x) => x.tag)).size !== p.length) return undefined;
  const ids = p.map((x) => x.n);
  const lettered = p.some((x) => x.tag !== String(x.n));
  if (!lettered && ids.every((n, i) => n === i + 1)) return undefined;
  return lettered ? { ids, tags: p.map((x) => x.tag) } : { ids };
}

/** The number of columns of a scene's Takes view: Shot 1 to the highest shot number any of its takes has (the scene's
 *  own shots; a pick-up's number past them adds its column at the end). */
export const columnsOf = (shotLists: Shot[][]): number => Math.max(1, ...shotLists.flatMap((l) => l.map((s) => s.n)));

/** How wide each column is, in shares (index 0 is Shot 1): as many as the most shots any one take has in it, so two
 *  shots sharing a cell ("7a", "7b") each get a cell's room and every other shot stays in its own column. All 1 for
 *  ordinary takes: the columns as before, all the same width. */
export function columnWeights(shotLists: Shot[][], cols: number): number[] {
  const w = Array.from({ length: Math.max(cols, 0) }, () => 1);
  for (const l of shotLists) cellsOf(l, cols).forEach((c, i) => { if (c.length > w[i]) w[i] = c.length; });
  return w;
}

/** The grid's columns for CSS: the take names' column, then each shot column by its shares. */
export const gridColumns = (weights: number[], first = '104px'): string =>
  weights.every((k) => k === 1) ? `${first} repeat(${weights.length}, minmax(0, 1fr))` : `${first} ${weights.map((k) => `minmax(0, ${k}fr)`).join(' ')}`;

/** Where column `n` starts and how wide it is, in a row `width` px wide whose first column is `first` px and whose
 *  columns are `gap` px apart (px, from the row's left). */
export function columnBox(weights: number[], n: number, width: number, first = 104, gap = 4): { left: number; width: number } {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const unit = (width - first - weights.length * gap) / total;
  const before = weights.slice(0, Math.max(0, n - 1)).reduce((a, b) => a + b, 0);
  return { left: first + gap + before * unit + (n - 1) * gap, width: (weights[n - 1] ?? 1) * unit };
}

/** A take's shots by column (index 0 is Shot 1): each under its own number; shots that share one share the cell, in
 *  the take's order. A cell with none is empty. */
export function cellsOf(shots: Shot[], cols: number): Shot[][] {
  const out: Shot[][] = Array.from({ length: Math.max(cols, 0) }, () => []);
  for (const s of shots) if (s.n >= 1 && s.n <= out.length) out[s.n - 1].push(s);
  return out;
}

/** Where a point `p` of the way through shot `s` stands in its cell, 0 to 1: shots that share a cell share it equally,
 *  side by side in order (the line across the takes stands over the right one). */
export function cellP(shots: Shot[], s: Shot, p: number): number {
  const same = shots.filter((x) => x.n === s.n);
  const j = same.findIndex((x) => x.i === s.i);
  const q = Math.max(0, Math.min(1, p));
  return same.length > 1 && j >= 0 ? (j + q) / same.length : q;
}

/** The other way: `p` of the way across its cell → how far through shot `s` that is, 0 before it, 1 after it. */
export function fromCellP(shots: Shot[], s: Shot, p: number): number {
  const same = shots.filter((x) => x.n === s.n);
  const j = same.findIndex((x) => x.i === s.i);
  const q = Math.max(0, Math.min(1, p));
  return same.length > 1 && j >= 0 ? Math.max(0, Math.min(1, q * same.length - j)) : q;
}

/** The little name a thumbnail carries ("7a"), when its column alone does not say which shot it is: a shot whose id
 *  has a letter, or one sharing its cell. Undefined for every shot of an ordinary take. */
export const cellLabel = (s: Shot, shareCell: boolean): string | undefined =>
  s.tag && (shareCell || s.tag !== String(s.n)) ? s.tag : undefined;
