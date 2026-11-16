// <film>/harness/upscale-marks.json: the takes the user marked to redo in Seedance (src/components/edit/marks.ts has the
// shape). Written only by the user's own toggle on the Edit page, a temp file then a rename, as shots.json is. Alma reads
// it and may change it when the user asks (recipes/edit.md); the page picks that up from the film's change feed.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { cleanMarks, MARKS_NOTE, type MarksFile, type SeedanceMark } from '@/components/edit/marks';

const file = (film: FilmTarget) => path.join(film.dir, 'harness', 'upscale-marks.json');

export async function readMarks(film: FilmTarget): Promise<MarksFile> {
  let raw: unknown;
  try { raw = JSON.parse(await fs.readFile(file(film), 'utf8')); } catch { /* none yet, or not readable as JSON */ }
  return { note: MARKS_NOTE, seedance: cleanMarks(raw, film.slug) ?? [] };
}

export async function writeMarks(film: FilmTarget, seedance: SeedanceMark[]): Promise<MarksFile> {
  const f = file(film);
  const body: MarksFile = { note: MARKS_NOTE, seedance };
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(body, null, 1)}\n`);
  await fs.rename(tmp, f);
  return body;
}

// sample-data mode: kept in memory for the server's life (a reload of the page still finds them), never on disk
const g = globalThis as unknown as { __mockMarks?: Map<string, SeedanceMark[]> };
export const mockMarks = (g.__mockMarks ??= new Map());
