// harness/progress.json: cards that ask which the user wrote to Alma about instead of answering (12 Nov 2026).
// Such a card is "in progress": it leaves "Waiting for you", its options lock, and it comes back as a question
// only when Alma rewrites it (a newer "updated") or the user unlocks it. { "<film>": { "<card key>": { at } } }.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';

export interface StoredProgress { at: string }
type Store = Record<string, Record<string, StoredProgress>>;

export const progressFile = (): string => path.join(claudeConfig().harnessDir, 'progress.json');

/** Keys that would reach Object.prototype: never a film or a card key here. */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const safeKey = (k: string): boolean => !!k && !BAD_KEYS.has(k);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The store with null-prototype objects throughout, and without any key that is not safe. */
export function cleanStore(j: unknown): Store {
  const store = Object.create(null) as Store;
  if (!isObj(j)) return store;
  for (const [film, cards] of Object.entries(j)) {
    if (!safeKey(film) || !isObj(cards)) continue;
    const mine = Object.create(null) as Record<string, StoredProgress>;
    for (const [k, v] of Object.entries(cards)) if (safeKey(k) && isObj(v) && typeof v.at === 'string') mine[k] = { at: v.at };
    store[film] = mine;
  }
  return store;
}

async function readStore(): Promise<Store> {
  try {
    return cleanStore(JSON.parse(await fs.readFile(progressFile(), 'utf8')));
  } catch {
    return cleanStore(undefined);
  }
}

export async function readProgress(film: string): Promise<Record<string, StoredProgress>> {
  if (!safeKey(film)) return {};
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
    keys = keys.filter(safeKey);
    if (!keys.length || !safeKey(film)) return;
    const store = await readStore();
    const mine = (store[film] ??= Object.create(null) as Record<string, StoredProgress>);
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
