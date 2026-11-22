// harness/alma-model.json: which model each film's Alma runs on, chosen in the thread header.
// No entry means Claude Code's own setting (the `model` line of the account's settings.json, ~/.claude's) decides.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ALMA_MODELS, type AlmaModel } from '../types';
import { accountHomes } from './accounts';
import { claudeConfig } from './config';

const file = () => path.join(claudeConfig().harnessDir, 'alma-model.json');
let writeChain: Promise<void> = Promise.resolve();

export function isAlmaModel(v: unknown): v is AlmaModel {
  return typeof v === 'string' && ALMA_MODELS.some((m) => m.id === v);
}

async function readAll(): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The film's choice; '' when none was made (or the saved one is no longer offered). */
export async function getAlmaModel(film: string): Promise<AlmaModel> {
  const v = (await readAll())[film];
  return isAlmaModel(v) ? v : '';
}

export function setAlmaModel(film: string, model: AlmaModel): Promise<void> {
  writeChain = writeChain.then(async () => {
    const all = await readAll();
    if (model) all[film] = model;
    else delete all[film];
    await mkdir(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 2) + '\n');
    await rename(tmp, file());
  }).catch(() => undefined);
  return writeChain;
}

/** What "Default" resolves to: the model line of the user's own Claude Code settings (of the account `home`, the
 *  first account by default), if there is one. */
export async function claudeCodeDefaultModel(home: string = accountHomes()[0]): Promise<string | undefined> {
  try {
    const s = JSON.parse(await readFile(path.join(home, 'settings.json'), 'utf8')) as { model?: unknown };
    return typeof s.model === 'string' ? s.model : undefined;
  } catch {
    return undefined;
  }
}
