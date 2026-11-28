// harness/takes-decided.json: what the user decided on the New takes page, per film, so the
// list is the same on the phone and the Mac. Kept in the harness's own folder, never in the film's.
//   { "<film>": { "<take src>": { "d": "used" | "later" | "rejected", "at": <ms> } } }
// "used": put in the film from the page (the cut keeps the change; this only says it was decided). "later": kept to look
// at again, stays in the list. "rejected": out of the list, still under "All takes that came back". A take's decision
// can be taken back (`d: null`), as the page's Undo does.
// In sample-data mode it lives in this server's memory; nothing is written.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessConfig } from '../config';
import { cleanDecision, readDecidedMap, type DecidedMap, type DecisionPost } from '@/components/takes/decisions';

type Store = Record<string, DecidedMap>;
const MAX = 2000;
const file = () => path.join(harnessConfig().harnessDir, 'takes-decided.json');
let chain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Store> {
  try {
    const v: unknown = JSON.parse(await readFile(file(), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}
async function writeAll(all: Store): Promise<void> {
  await mkdir(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(all) + '\n');
  await rename(tmp, file());
}

/** One change to one film's decisions; the oldest go first past MAX. */
export function applyDecision(cur: DecidedMap | undefined, p: DecisionPost, now: number): DecidedMap {
  const next: DecidedMap = { ...(cur ?? {}) };
  if (p.d === null) delete next[p.src];
  else next[p.src] = { d: p.d, at: now };
  const keys = Object.keys(next);
  if (keys.length > MAX) for (const k of keys.sort((a, b) => next[a].at - next[b].at).slice(0, keys.length - MAX)) delete next[k];
  return next;
}

export async function readDecided(film: string): Promise<DecidedMap> {
  return readDecidedMap((await readAll())[film]);
}

export function addDecision(film: string, p: DecisionPost): Promise<DecidedMap> {
  const run = chain.then(async () => {
    const all = await readAll();
    all[film] = applyDecision(readDecidedMap(all[film]), p, Date.now());
    await writeAll(all);
    return all[film];
  });
  chain = run.catch(() => undefined);
  return run;
}
export { cleanDecision };

// ---- sample-data mode: in this server's memory
const g = globalThis as unknown as { __sampleDecided?: Map<string, DecidedMap> };
const mem = (g.__sampleDecided ??= new Map());
export const mockDecided = (film: string): DecidedMap => mem.get(film) ?? {};
export function mockAddDecision(film: string, p: DecisionPost): DecidedMap {
  const next = applyDecision(mem.get(film), p, Date.now());
  mem.set(film, next);
  return next;
}
/** Sample mode only (the browser checks): no decisions. */
export const mockForgetDecided = (film: string): void => { mem.delete(film); };
