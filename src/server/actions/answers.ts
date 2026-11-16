// harness/answers.json: what the user answered on a card that asks, the moment they clicked, so the gate stops
// showing the round before Alma has marked the card. { "<film>": { "<card key>": { option?, at, note?, kind } } }.
// The film's own record (review/cards.json, taste.md) stays Alma's and the flow's; this file is the harness's.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';

export interface StoredAnswer { option?: string; at: string; note?: string; kind: 'pick' | 'yes' | 'go' }
type Store = Record<string, Record<string, StoredAnswer>>;

export const answersFile = (): string => path.join(claudeConfig().harnessDir, 'answers.json');

async function readStore(): Promise<Store> {
  try {
    const j: unknown = JSON.parse(await fs.readFile(answersFile(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Store) : {};
  } catch {
    return {};
  }
}

export async function readAnswers(film: string): Promise<Record<string, StoredAnswer>> {
  return (await readStore())[film] ?? {};
}

/** The file's change time, for the feed's cache key (0 when there is none yet). */
export async function answersStamp(): Promise<number> {
  try {
    return (await fs.stat(answersFile())).mtimeMs;
  } catch {
    return 0;
  }
}

let chain: Promise<unknown> = Promise.resolve();

/** Adds one answer; writes go one at a time and replace the file whole (temp file, then rename). */
export function saveAnswer(film: string, key: string, a: StoredAnswer): Promise<void> {
  const run = chain.then(async () => {
    const store = await readStore();
    (store[film] ??= {})[key] = a;
    const file = answersFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n');
    await fs.rename(tmp, file);
  });
  chain = run.catch(() => undefined);
  return run;
}
