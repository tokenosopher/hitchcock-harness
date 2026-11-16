// <film>/harness/left.json: the user's own ticks on the Edit page's "What's next" tab (src/components/edit/left.ts has
// the shape). Written only by the user's tick on the page, a temp file then a rename, as the Seedance marks are. Alma
// reads it and never sets a tick (recipes/edit.md). In sample-data mode the ticks are kept in memory only.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { applyTick, cleanLeft, LEFT_NOTE, LEFT_REL, type LeftFile, type TickOp } from '@/components/edit/left';

const file = (film: FilmTarget) => path.join(film.dir, LEFT_REL);

export async function readLeft(film: FilmTarget): Promise<LeftFile> {
  let raw: unknown;
  try { raw = JSON.parse(await fs.readFile(file(film), 'utf8')); } catch { /* none yet, or not readable as JSON */ }
  return { note: LEFT_NOTE, ticks: cleanLeft(raw)?.ticks ?? {} };
}

// one change at a time per film: read fresh, change, write
const queues = new Map<string, Promise<unknown>>();
export function writeTick(film: FilmTarget, op: TickOp, now: string): Promise<LeftFile> {
  const run = (queues.get(film.slug) ?? Promise.resolve()).then(async () => {
    const next = applyTick(await readLeft(film), op, now);
    const f = file(film);
    await fs.mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(next, null, 1)}\n`);
    await fs.rename(tmp, f);
    return next;
  });
  queues.set(film.slug, run.catch(() => undefined));
  return run;
}

// sample-data mode: kept in memory for the server's life (a reload of the page still finds them), never on disk
const g = globalThis as unknown as { __mockLeft?: Map<string, LeftFile> };
export const mockLeft = (g.__mockLeft ??= new Map());
