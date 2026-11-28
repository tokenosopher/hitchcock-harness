// harness/removed.json: what the user removed from "Waiting for you" with "Remove" and "Done picking",
// { "<film>": { "<entry key>": { title, mark?, at } } }. Kept beside harness/answers.json, never in the film folder:
// it is no answer, and the film's own record (review/cards.json) stays Alma's, who closes her card on reading it.
// Laid on the film's state as `removed` (films/state.ts); lib/remove.ts says what it hides and for how long.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';
import type { Removal } from '../../components/lib/remove';

type Store = Record<string, Record<string, { title: string; mark?: string; at: string }>>;

export const removedFile = (): string => path.join(claudeConfig().harnessDir, 'removed.json');

async function readStore(): Promise<Store> {
  try {
    const j: unknown = JSON.parse(await fs.readFile(removedFile(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Store) : {};
  } catch {
    return {};
  }
}

export async function readRemoved(film: string): Promise<Removal[]> {
  const mine = (await readStore())[film] ?? {};
  return Object.entries(mine).flatMap(([key, v]) => (v && typeof v === 'object' ? [{ key, title: String(v.title ?? key), ...(v.mark ? { mark: String(v.mark) } : {}), at: String(v.at ?? '') }] : []));
}

let chain: Promise<unknown> = Promise.resolve();

/** Adds the removals (a later one of the same entry takes its place); `stale` names the film's entries no longer
 *  needed (a card Alma has closed), dropped on the same write. Writes go one at a time and replace the file whole (temp
 *  file, then rename). */
export function saveRemoved(film: string, rs: Removal[], stale: (key: string) => boolean = () => false, at = new Date().toISOString()): Promise<void> {
  const run = chain.then(async () => {
    const store = await readStore();
    const mine = (store[film] ??= {});
    for (const k of Object.keys(mine)) if (stale(k)) delete mine[k];
    for (const r of rs) mine[r.key] = { title: r.title, ...(r.mark ? { mark: r.mark } : {}), at };
    const file = removedFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n');
    await fs.rename(tmp, file);
  });
  chain = run.catch(() => undefined);
  return run;
}
