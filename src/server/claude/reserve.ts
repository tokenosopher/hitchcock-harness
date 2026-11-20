// The reserve switch: when it is on, every film's Alma runs on the API key saved in .env.local as
// HARNESS_RESERVE_API_KEY, so her work is paid from the monthly API credits instead of the plan's weekly limits.
// Off (the default), she runs on the plan sign-in, as before. The setting is one file for all films,
// harness/alma-reserve.json: { on, since, spent: { "YYYY-MM": dollars } }. The key's value never leaves this
// file's functions except into Alma's own environment: the browser, the logs and the thread only learn hasKey.
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { claudeConfig } from './config';

export const RESERVE_KEY_NAME = 'HARNESS_RESERVE_API_KEY';

export interface ReserveSetting {
  on: boolean;
  since?: string;
  /** Dollars by month ("2026-11"), by Claude Code's own count of each turn run on the key. */
  spent: Record<string, number>;
}

/** What the Settings page is told: never the key, only whether one is saved. */
export interface ReserveView {
  on: boolean;
  since?: string;
  hasKey: boolean;
  month: string;
  spentThisMonth: number;
}

const file = () => path.join(claudeConfig().harnessDir, 'alma-reserve.json');

/** The key, read from .env.local each time (adding it needs no restart), else from the server's environment. */
export function readReserveKey(): string | undefined {
  try {
    const text = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of text.split('\n')) {
      const m = /^\s*(?:export\s+)?HARNESS_RESERVE_API_KEY\s*=(.*)$/.exec(raw);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) return v;
    }
  } catch {
    // no .env.local: the environment below
  }
  return process.env[RESERVE_KEY_NAME]?.trim() || undefined;
}

export function hasReserveKey(): boolean {
  return !!readReserveKey();
}

function parse(text: string): ReserveSetting {
  const j = JSON.parse(text) as Partial<ReserveSetting>;
  const spent: Record<string, number> = {};
  if (j.spent && typeof j.spent === 'object') for (const [k, v] of Object.entries(j.spent)) if (/^\d{4}-\d{2}$/.test(k) && typeof v === 'number' && isFinite(v)) spent[k] = v;
  return { on: j.on === true, since: typeof j.since === 'string' ? j.since : undefined, spent };
}

/** The saved setting; off when there is no file or it cannot be read. Read in full each time (it is tiny), so
 *  every module copy in a dev server sees the same answer. */
export function readReserve(): ReserveSetting {
  try {
    return parse(readFileSync(file(), 'utf8'));
  } catch {
    return { on: false, spent: {} };
  }
}

/** True when a new Alma process should start on the key: the reserve is on and a key is saved. */
export function reserveKeyForStart(): string | undefined {
  return readReserve().on ? readReserveKey() : undefined;
}

let writeChain: Promise<unknown> = Promise.resolve();
function write(change: (s: ReserveSetting) => ReserveSetting): Promise<ReserveSetting> {
  const next = writeChain.then(async () => {
    const s = change(readReserve());
    await mkdir(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(s, null, 2) + '\n');
    await rename(tmp, file());
    return s;
  });
  writeChain = next.catch(() => undefined);
  return next;
}

/** "2026-11" for a date, in this Mac's time. */
export function monthOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function reserveView(s: ReserveSetting = readReserve()): ReserveView {
  const month = monthOf();
  return { on: s.on, since: s.on ? s.since : undefined, hasKey: hasReserveKey(), month, spentThisMonth: s.spent[month] ?? 0 };
}

export const NO_KEY_WORDS = 'No key saved yet. Add HARNESS_RESERVE_API_KEY to .env.local in the harness folder, with an API key from your Claude Console organization.';

/** Turns the reserve on or off. Turning it on without a saved key is refused (status 409). The caller then tells
 *  the running Almas (reserveChanged in process.ts). */
export async function setReserveOn(on: boolean): Promise<{ ok: true; view: ReserveView } | { ok: false; status: number; error: string }> {
  if (on && !hasReserveKey()) return { ok: false, status: 409, error: NO_KEY_WORDS };
  try {
    const s = await write((cur) => (cur.on === on ? cur : { ...cur, on, since: on ? new Date().toISOString() : undefined }));
    return { ok: true, view: reserveView(s) };
  } catch (e) {
    return { ok: false, status: 500, error: `The setting could not be saved: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Adds one turn's cost to the month's total. Only called for turns of an Alma process started on the key. */
export async function addReserveSpend(usd: number, at: Date = new Date()): Promise<void> {
  if (!(usd > 0) || !isFinite(usd)) return;
  const month = monthOf(at);
  await write((s) => ({ ...s, spent: { ...s.spent, [month]: Math.round(((s.spent[month] ?? 0) + usd) * 10000) / 10000 } })).catch(() => undefined);
}

/** Alma's environment: the server's, without any API key or login token, without the remote-access key
 *  (HARNESS_TUNNEL_TOKEN) and without the parent Claude Code
 *  session's variables; with ANTHROPIC_API_KEY only when a reserve key is given. The reserve key's own name
 *  never passes through. */
export function almaEnv(base: NodeJS.ProcessEnv, reserveKey?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const k of Object.keys(env)) {
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN' || k === RESERVE_KEY_NAME || k === 'HARNESS_TUNNEL_TOKEN' || k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || (k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS')) delete env[k];
  }
  if (reserveKey) env.ANTHROPIC_API_KEY = reserveKey;
  env.PYTHONDONTWRITEBYTECODE = '1';
  return env;
}

