// Where the Claude Code process layer finds the CLI, the studio folder and its own runtime files.
// Next.js loads .env.local into process.env; the smoke script does not, so read it here when needed.
import { accessSync, constants, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onPath, studioDir } from '../config';

let loaded = false;

function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  try {
    const text = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // no .env.local: defaults below apply
  }
}

export interface ClaudeConfig {
  claudeBin: string;
  filmRepo: string;
  harnessDir: string;
  /** Close an idle Alma process after this long with nothing running (it is resumed on the next message). */
  idleMs: number;
}

/** `claude` on the PATH; else where Anthropic's installer puts it (~/.local/bin/claude), for a server started
 *  from a shell whose PATH lacks that folder; else the bare name. */
function claudeOnPath(): string {
  const found = onPath('claude');
  if (found !== 'claude') return found;
  const local = path.join(/*turbopackIgnore: true*/ os.homedir(), '.local', 'bin', 'claude');
  try {
    accessSync(local, constants.X_OK);
    return local;
  } catch {
    return 'claude';
  }
}

export function claudeConfig(): ClaudeConfig {
  loadEnvLocal();
  return {
    claudeBin: process.env.HARNESS_CLAUDE_BIN || claudeOnPath(),
    filmRepo: studioDir(),
    harnessDir: process.env.HARNESS_DIR || path.join(process.cwd(), 'harness'),
    idleMs: Number(process.env.HARNESS_ALMA_IDLE_MS || 20 * 60 * 1000),
  };
}

/** Claude Code's project folder name for a cwd: every non-alphanumeric character becomes "-". */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

export const FILM_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
