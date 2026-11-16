// <film>/social/release.json on disk (the shape and the check: src/components/release/file.ts). Read fresh for every
// operation; written as a temp file renamed over it (as the Seedance marks are), one write at a time per film, each
// a line of harness/writes.log. In sample-data mode a map in memory, seeded from src/fixtures/release.ts; nothing on
// disk. Alma writes the same file (recipes/release.md); the film's watcher sees her change and the page reads again.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { logWrite } from '../edit/timeline';
import { RELEASE_REL, validateRelease, type ReleaseFile } from '@/components/release/file';
import { applyOp, type OpResult, type ReleaseOp } from '@/components/release/ops';

export const releasePath = (film: FilmTarget): string => path.join(film.dir, RELEASE_REL);

export interface ReadRelease { file?: ReleaseFile; problems: string[]; exists: boolean }

export async function readReleaseFile(film: FilmTarget): Promise<ReadRelease> {
  let text: string;
  try { text = await fs.readFile(releasePath(film), 'utf8'); } catch { return { problems: [], exists: false }; }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { problems: [`The file is not JSON: ${(e as Error).message}`], exists: true }; }
  const v = validateRelease(raw);
  return { ...v, exists: true };
}

export async function writeReleaseFile(film: FilmTarget, file: ReleaseFile, said: string): Promise<void> {
  const f = releasePath(film);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(file, null, 1)}\n`);
  await fs.rename(tmp, f);
  await logWrite('release', 'write', film.show(f), said).catch(() => undefined);
}

// one operation at a time per film: read, apply, check, write
const queues = ((globalThis as unknown as { __hhReleaseQ?: Map<string, Promise<unknown>> }).__hhReleaseQ ??= new Map());
function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(key, next.catch(() => undefined));
  return next;
}

/** Reads the file fresh, applies one operation, checks and writes it. A refusal writes nothing. */
export function operate(film: FilmTarget, op: ReleaseOp, now: Date): Promise<OpResult> {
  return serial(film.dir, async () => {
    const cur = await readReleaseFile(film);
    if (cur.exists && !cur.file) return { ok: false, refused: `The release file does not check out, so nothing was changed: ${cur.problems.slice(0, 3).join(' ')}` };
    return commit(cur.file, op, now, (file, said) => writeReleaseFile(film, file, said));
  });
}

async function commit(file: ReleaseFile | undefined, op: ReleaseOp, now: Date, write: (f: ReleaseFile, said: string) => Promise<void>): Promise<OpResult> {
  const r = applyOp(file, op, now);
  if (!r.ok) return r;
  const v = validateRelease(r.file);
  if (!v.file) return { ok: false, refused: `That would leave the file not checking out: ${v.problems.slice(0, 3).join(' ')}` };
  await write(r.file, r.said);
  return r;
}

// ---- sample-data mode: in memory only

const g = globalThis as unknown as { __hhMockRelease?: Map<string, ReleaseFile | null> };
export const mockReleases = (g.__hhMockRelease ??= new Map());

export function mockOperate(slug: string, seed: () => ReleaseFile | undefined, op: ReleaseOp, now: Date): Promise<OpResult> {
  return serial(`mock:${slug}`, () => {
    const file = mockReleases.has(slug) ? mockReleases.get(slug) ?? undefined : seed();
    return commit(file, op, now, async (f) => { mockReleases.set(slug, f); });
  });
}
