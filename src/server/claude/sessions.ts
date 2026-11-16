// harness/sessions.json: which Claude Code session is each film's thread. Holds ids and totals, never a credential.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { claudeConfig } from './config';

export interface SessionRecord {
  sessionId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  /** The CLI's running total for the session (an estimate on the Max plan), to work out each turn's share. */
  lastTotalCostUsd?: number;
}
export type SessionsFile = Record<string, SessionRecord>;

function file(): string {
  return path.join(claudeConfig().harnessDir, 'sessions.json');
}

let writeChain: Promise<void> = Promise.resolve();

export async function readSessions(): Promise<SessionsFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as SessionsFile) : {};
  } catch {
    return {};
  }
}

export async function getSession(film: string): Promise<SessionRecord | undefined> {
  return (await readSessions())[film];
}

/** Merges a change into one film's record; writes are serialised and atomic (tmp + rename). */
export function updateSession(film: string, patch: Partial<SessionRecord> & { sessionId: string; cwd: string }): Promise<void> {
  writeChain = writeChain.then(async () => {
    const all = await readSessions();
    const now = new Date().toISOString();
    const prev = all[film];
    const sameSession = prev && prev.sessionId === patch.sessionId;
    all[film] = {
      ...(sameSession ? prev : {}),
      ...patch,
      createdAt: sameSession ? prev.createdAt : now,
      updatedAt: now,
    } as SessionRecord;
    await mkdir(path.dirname(file()), { recursive: true });
    const tmp = file() + '.tmp';
    await writeFile(tmp, JSON.stringify(all, null, 2) + '\n');
    await rename(tmp, file());
  }).catch(() => undefined);
  return writeChain;
}
