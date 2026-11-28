// harness/takes-seen.json: the takes the user has looked at on the Edit page, per film, so a take's "new"
// tag in the Takes view (and the clip's "1 new take" mark, What's next's "new takes to check") is the same on the phone
// and the Mac. Kept in the harness's own folder, never in the film's.
//   since: when this film's list began (ms). A take that landed before it counts as seen, except the ones in `keep`:
//          the takes the page still showed as new then (its clip marks and unclicked variations), which stay new.
//   seen:  the takes looked at since (their files, `src`): played, a shot of them tried, or put in the film.
// In sample-data mode it lives in this server's memory, begun at the sample takes' landing day; nothing is written.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessConfig } from '../config';

export interface SeenTakes { since: number | null; seen: string[]; keep: string[] }
type Store = Record<string, { since: number; seen: string[]; keep?: string[] }>;

const MAX = 4000;
const file = () => path.join(harnessConfig().harnessDir, 'takes-seen.json');
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

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 600) : []);
const shape = (e: Store[string] | undefined): SeenTakes => (e ? { since: e.since, seen: e.seen ?? [], keep: e.keep ?? [] } : { since: null, seen: [], keep: [] });

/** What the page sends: `seen`, takes looked at; `begin` (once, the first page to load after the change), the takes it
 *  still shows as new, which stay new though they landed before the list began. */
export interface SeenPost { seen: string[]; begin?: { keep: string[] } }
export function cleanPost(body: unknown): SeenPost | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as { seen?: unknown; begin?: unknown };
  const begin = b.begin && typeof b.begin === 'object' ? { keep: strs((b.begin as { keep?: unknown }).keep) } : undefined;
  return { seen: strs(b.seen), ...(begin ? { begin } : {}) };
}

/** One change to one film's list: the first `begin` sets when it began, later ones change nothing; seen takes add. */
function apply(cur: Store[string] | undefined, p: SeenPost, now: number): Store[string] | undefined {
  if (!cur && !p.begin) return cur;
  const e = cur ?? { since: now, seen: [], keep: p.begin!.keep.slice(0, MAX) };
  const add = p.seen.filter((s) => !e.seen.includes(s));
  if (cur && !add.length) return cur;
  return { ...e, seen: [...e.seen, ...add].slice(-MAX) };
}

export async function readSeen(film: string): Promise<SeenTakes> {
  return shape((await readAll())[film]);
}

export function addSeen(film: string, p: SeenPost): Promise<SeenTakes> {
  const run = chain.then(async () => {
    const all = await readAll();
    const next = apply(all[film], p, Date.now());
    if (next && next !== all[film]) { all[film] = next; await writeAll(all); }
    return shape(next);
  });
  chain = run.catch(() => undefined);
  return run;
}

// ---- sample-data mode: in this server's memory, begun at the day the sample takes landed (fixtures/shots.ts), so the
// samples' later takes and landed variations are new and the rest are not
const SAMPLE_SINCE = Date.UTC(2026, 10, 10, 12);
const g = globalThis as unknown as { __sampleSeen?: Map<string, Store[string]> };
const mem = (g.__sampleSeen ??= new Map());
export const mockSeen = (film: string): SeenTakes => shape(mem.get(film) ?? { since: SAMPLE_SINCE, seen: [] });
export function mockAddSeen(film: string, p: SeenPost): SeenTakes {
  const next = apply(mem.get(film) ?? { since: SAMPLE_SINCE, seen: [] }, { seen: p.seen }, Date.now());
  if (next) mem.set(film, next);
  return shape(next);
}
/** Sample mode only (the browser tests): the film's list as it began. */
export const mockForget = (film: string): void => { mem.delete(film); };
