// The last `init` event any Alma process printed: which MCP servers it saw and in what state, the model and
// the permission mode. Kept in harness/last-init.json (names and states only, never a credential) so the
// Settings page can say whether the Higgsfield connector answered, without starting a session to ask.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { claudeConfig } from './config';
import type { StreamSignals } from './stream';

export interface LastInit {
  at: string;
  thread: string;               // the film slug, "library" or "settings"
  model?: string;
  permissionMode?: string;
  mcp: { name: string; status: string }[];
}

const file = () => path.join(claudeConfig().harnessDir, 'last-init.json');
let last = '';

/** Records the init event (only when the servers or their states changed, so a turn costs no write). */
export function recordInit(thread: string, init: NonNullable<StreamSignals['init']>): void {
  const rec: LastInit = { at: new Date().toISOString(), thread, model: init.model, permissionMode: init.permissionMode, mcp: init.mcp };
  const key = JSON.stringify([thread, rec.model, rec.permissionMode, rec.mcp]);
  if (key === last) return;
  last = key;
  void (async () => {
    try {
      await mkdir(path.dirname(file()), { recursive: true });
      const tmp = `${file()}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(rec, null, 2) + '\n');
      await rename(tmp, file());
    } catch {
      // the Settings page then says "not seen yet"
    }
  })();
}

export async function readLastInit(): Promise<LastInit | undefined> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as LastInit;
  } catch {
    return undefined;
  }
}
