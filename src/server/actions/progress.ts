// harness/progress.json: cards that ask which the user wrote to Alma about instead of answering (12 Nov 2026).
// Such a card is "in progress": it leaves "Waiting for you", its options lock, and it comes back as a question
// only when Alma rewrites it (a newer "updated") or the user unlocks it. { "<film>": { "<card key>": { at } } }.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';

export interface StoredProgress { at: string }
type Store = Record<string, Record<string, StoredProgress>>;

export const progressFile = (): string => path.join(claudeConfig().harnessDir, 'progress.json');

async function readStore(): Promise<Store> {
  try {
    const j: unknown = JSON.parse(await fs.readFile(progressFile(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Store) : {};
  } catch {
    return {};
  }
}

export async function readProgress(film: string): Promise<Record<string, StoredProgress>> {
  return (await readStore())[film] ?? {};
}

export async function progressStamp(): Promise<number> {
  try {
    return (await fs.stat(progressFile())).mtimeMs;
  } catch {
    return 0;
  }
}

let chain: Promise<unknown> = Promise.resolve();

/** Marks cards as in progress (on: true) or takes the mark off; one write at a time, the file replaced whole. */
export function setProgress(film: string, keys: string[], on: boolean): Promise<void> {
  const run = chain.then(async () => {
    if (!keys.length) return;
    // names that would reach every object's shared template are never keys here
    if (['__proto__', 'constructor', 'prototype'].includes(film)) return;
    keys = keys.filter((k) => !['__proto__', 'constructor', 'prototype'].includes(k));
    const store = await readStore();
    const mine = (store[film] ??= {});
    const at = new Date().toISOString();
    for (const k of keys) {
      if (on) mine[k] = { at };
      else delete mine[k];
    }
    const file = progressFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n');
    await fs.rename(tmp, file);
  });
  chain = run.catch(() => undefined);
  return run;
}
