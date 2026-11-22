// Automatic account switching for Alma. HARNESS_CLAUDE_ACCOUNTS lists Claude Code config folders
// in order (account 1, account 2, …), read at each use. Each film's Alma runs on one of them; which one, and each
// account's last known usage and reset times (from the CLI's own rate_limit_event), are kept in
// harness/alma-accounts.json, never in the film folder. Nothing here reads, keeps or prints an email, a token or a key.
//
// What the CLI tells the harness (Claude Code 2.1.330):
//   {"type":"rate_limit_event","rate_limit_info":{"status":"allowed"|"allowed_warning"|"rejected","resetsAt":<unix s>,
//    "rateLimitType":"five_hour"|"seven_day"|…,"utilization"?:<0-1, only with allowed_warning>,"isUsingOverage":false,
//    "unifiedWindows":{"five_hour":{"utilization":0.04,"resetsAt":…,"status":"allowed"},"seven_day":{…},…}}}
//   and, when a request is refused, an assistant message {"error":"rate_limit","api_error":"usage_limit_reached",
//   "api_error_params":{"rate_limit_info":{"status":"rejected",…}},"message":{"content":[{"type":"text",
//   "text":"You've hit your 5-hour limit · resets 3pm"}]}} and a result with is_error true and the same words.
import { createHash } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { claudeConfig, projectSlug } from './config';
import { isUsageLimitText } from './limit';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// ---- the setting

/** A value from .env.local, read fresh each time (a change needs no restart), else from the server's environment. */
function setting(name: string): string | undefined {
  try {
    const text = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    let found: string | undefined;
    for (const raw of text.split('\n')) {
      const m = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=(.*)$`).exec(raw);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      found = v;
    }
    if (found !== undefined) return found;
  } catch {
    // no .env.local: the environment below
  }
  return process.env[name];
}

const expandHome = (p: string): string => (p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

/** ~/.claude: the folder the CLI uses with no CLAUDE_CONFIG_DIR. Naming it in the setting means "leave CLAUDE_CONFIG_DIR
 *  unset", never CLAUDE_CONFIG_DIR=~/.claude: the CLI keys its keychain sign-in and picks ~/.claude.json (where the MCP
 *  servers are) by whether the variable is set, so setting it to ~/.claude would sign account 1 out. */
export function plainHome(): string {
  return path.join(os.homedir(), '.claude');
}

/** The folder the CLI uses when the harness says nothing: the server's own CLAUDE_CONFIG_DIR, else ~/.claude. */
export function currentHome(): string {
  const d = process.env.CLAUDE_CONFIG_DIR?.trim();
  return d ? path.resolve(expandHome(d)) : plainHome();
}

/** HARNESS_CLAUDE_ACCOUNTS as absolute folders in order (":" or "," between them), or undefined when it is not set. */
export function accountsSetting(): string[] | undefined {
  const raw = setting('HARNESS_CLAUDE_ACCOUNTS')?.trim();
  if (!raw) return undefined;
  const homes = raw.split(/[:,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(expandHome(s)));
  return homes.length ? [...new Set(homes)] : undefined;
}

/** The accounts Alma may run on. Not set: just the one she runs on today, so nothing changes. */
export function accountHomes(): string[] {
  return accountsSetting() ?? [currentHome()];
}

/** Switching needs somewhere to go: two accounts or more. */
export function switchingOn(homes: string[] = accountHomes()): boolean {
  return homes.length >= 2;
}

/** HARNESS_ACCOUNT_SWITCH_AT: the share of a usage window at which Alma moves at her next pause (default 0.96). */
export function switchAt(): number {
  const v = Number(setting('HARNESS_ACCOUNT_SWITCH_AT'));
  return v > 0 && v <= 1.5 ? v : 0.96;
}

/** How long after a reset Alma resumes when every account was at its limit (a minute, so the reset has landed). */
export function resumeMarginMs(): number {
  const v = Number(setting('HARNESS_ACCOUNT_RESUME_MARGIN_MS'));
  return Number.isFinite(v) && v >= 0 ? v : 60_000;
}

/** "account 1", "account 2" by place in the setting; never an email. */
export function accountLabel(home: string, homes: string[] = accountHomes()): string {
  const i = homes.indexOf(home);
  return i >= 0 ? `account ${i + 1}` : `the account in ${home.replace(os.homedir(), '~')}`;
}

/** Alma's environment for an account: CLAUDE_CONFIG_DIR set to its folder, or removed for ~/.claude. With the setting
 *  not set the server's own value passes through untouched, as before. ANTHROPIC_API_KEY is stripped earlier (almaEnv). */
export function accountEnv(env: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  if (!accountsSetting()) return env;
  if (home === plainHome()) delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = home;
  return env;
}

// ---- where the CLI keeps a session

export const projectsDir = (home: string, cwd: string): string => path.join(home, 'projects', projectSlug(cwd));
export const transcriptFile = (home: string, cwd: string, sessionId: string): string => path.join(projectsDir(home, cwd), `${sessionId}.jsonl`);
export const subagentsDir = (home: string, cwd: string, sessionId: string): string => path.join(projectsDir(home, cwd), sessionId, 'subagents');

// ---- the record: harness/alma-accounts.json

export interface WindowUse { utilization: number; resetsAt?: number; status?: string }
export interface AccountUse {
  at: string;
  windows: Record<string, WindowUse>;
  /** Requests were refused: the account is at its limit until resetsAt (or an hour after `at` when no reset was given). */
  limited?: { at: string; resetsAt?: number; window?: string; text?: string };
  /** The Higgsfield MCP server's state at this account's last Alma start (needs-auth until signed in on that account). */
  higgsfield?: { status: string; at: string };
}
export interface FilmAccount { home: string; since: string; sessionId?: string }
export interface AccountsState { films: Record<string, FilmAccount>; accounts: Record<string, AccountUse> }

const stateFile = () => path.join(claudeConfig().harnessDir, 'alma-accounts.json');
// one copy per server process, shared by every module copy a dev server makes; the file is written behind it
const g = globalThis as unknown as { __almaAccounts?: { file: string; state: AccountsState; chain: Promise<void>; dirty: boolean } };

function parseState(text: string): AccountsState {
  const j = obj(JSON.parse(text));
  const films: Record<string, FilmAccount> = {};
  for (const [k, v] of Object.entries(obj(j.films))) {
    const f = obj(v);
    if (str(f.home)) films[k] = { home: f.home as string, since: str(f.since) ?? '', ...(str(f.sessionId) ? { sessionId: f.sessionId as string } : {}) };
  }
  const accounts: Record<string, AccountUse> = {};
  for (const [k, v] of Object.entries(obj(j.accounts))) {
    const a = obj(v);
    const windows: Record<string, WindowUse> = {};
    for (const [wk, wv] of Object.entries(obj(a.windows))) {
      const w = obj(wv);
      const u = num(w.utilization);
      if (u !== undefined) windows[wk] = { utilization: u, ...(num(w.resetsAt) !== undefined ? { resetsAt: num(w.resetsAt) } : {}), ...(str(w.status) ? { status: str(w.status) } : {}) };
    }
    const l = obj(a.limited);
    const h = obj(a.higgsfield);
    accounts[k] = {
      at: str(a.at) ?? '', windows,
      ...(str(l.at) ? { limited: { at: l.at as string, resetsAt: num(l.resetsAt), window: str(l.window), text: str(l.text) } } : {}),
      ...(str(h.status) ? { higgsfield: { status: h.status as string, at: str(h.at) ?? '' } } : {}),
    };
  }
  return { films, accounts };
}

/** The record (read from the file once per server process, then kept in memory and written behind every change). */
export function readAccountsState(): AccountsState {
  const file = stateFile();
  if (g.__almaAccounts?.file === file) return g.__almaAccounts.state;
  let state: AccountsState = { films: {}, accounts: {} };
  try { state = parseState(readFileSync(file, 'utf8')); } catch { /* no file yet */ }
  g.__almaAccounts = { file, state, chain: Promise.resolve(), dirty: false };
  return state;
}

/** Applies a change at once (the next read sees it) and writes the file behind it, atomically (tmp + rename). */
export function updateAccountsState(change: (s: AccountsState) => AccountsState): Promise<void> {
  const state = change(readAccountsState());
  const box = g.__almaAccounts!;
  box.state = state;
  if (box.dirty) return box.chain;
  box.dirty = true;
  box.chain = box.chain.then(async () => {
    box.dirty = false;
    const file = box.file;
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(box.state, null, 2) + '\n');
    await rename(tmp, file);
  }).catch(() => undefined);
  return box.chain;
}

/** The config folder of the film's Alma: the account recorded for the film if it is still in the setting, else the
 *  first. Every path into the CLI's own folders and Alma's CLAUDE_CONFIG_DIR come from here. */
export function claudeHome(film: string, homes: string[] = accountHomes(), state: AccountsState = readAccountsState()): string {
  const rec = state.films[film]?.home;
  return rec && homes.includes(rec) ? rec : homes[0];
}

/** The config folder that holds a session, for callers that know only the session id (the sidebar's recent order). */
export function homeForSession(sessionId: string): string {
  const homes = accountHomes();
  if (!switchingOn(homes)) return homes[0];
  const st = readAccountsState();
  for (const [film, rec] of Object.entries(st.films)) if (rec.sessionId === sessionId) return claudeHome(film, homes, st);
  return homes[0];
}

export function setFilmHome(film: string, home: string, sessionId?: string): Promise<void> {
  return updateAccountsState((s) => ({ ...s, films: { ...s.films, [film]: { home, since: new Date().toISOString(), ...(sessionId ? { sessionId } : {}) } } }));
}

/** The film's session changed (a new thread): kept beside its account so homeForSession finds it. Only for films
 *  that have a record (they moved once); the others are on the first account. */
export function noteFilmSession(film: string, sessionId: string): void {
  const rec = readAccountsState().films[film];
  if (rec && rec.sessionId !== sessionId) void updateAccountsState((s) => ({ ...s, films: { ...s.films, [film]: { ...rec, sessionId } } }));
}

// ---- reading the CLI's usage signals

export interface RateLimitReading { windows: Record<string, WindowUse>; status?: string; limited?: { resetsAt?: number; window?: string };
  /** The reading listed every window the plan has (unifiedWindows): it replaces the remembered ones, so a window the
   *  plan no longer has (a new tier with no 5-hour cap) stops counting at once. */
  complete?: boolean }

/** A rate_limit_event's rate_limit_info: every window's share used, and whether requests are being refused. */
export function readRateLimit(info: unknown): RateLimitReading | undefined {
  const i = obj(info);
  if (!Object.keys(i).length) return undefined;
  const windows: Record<string, WindowUse> = {};
  for (const [k, v] of Object.entries(obj(i.unifiedWindows))) {
    const w = obj(v);
    const u = num(w.utilization);
    if (u !== undefined) windows[k] = { utilization: u, resetsAt: num(w.resetsAt), status: str(w.status) };
  }
  const complete = Object.keys(windows).length > 0;
  // older CLIs (and the top level) give one number, only once a warning threshold is passed
  const type = str(i.rateLimitType);
  const top = num(i.utilization);
  if (type && top !== undefined && !(windows[type] && windows[type].utilization >= top)) windows[type] = { utilization: top, resetsAt: num(i.resetsAt), status: str(i.status) };
  const overage = i.isUsingOverage === true || i.overageInUse === true;
  const status = str(i.status);
  return { windows, status, ...(complete ? { complete: true } : {}), ...(status === 'rejected' && !overage ? { limited: { resetsAt: num(i.resetsAt), window: type } } : {}) };
}

export interface LimitHit { text?: string; resetsAt?: number; window?: string }

/** The plan's limit refused a request: an assistant message the CLI writes itself (error "rate_limit" with
 *  api_error usage_limit_reached / model_requires_usage_credits, or the limit words). A per-minute 429 on an API key or
 *  an overload is not it. Sub-agents' messages count too: they run on the same account. */
export function limitFromAssistant(msg: unknown): LimitHit | undefined {
  const m = obj(msg);
  const apiError = str(m.api_error);
  if (m.error !== 'rate_limit' && apiError !== 'usage_limit_reached' && apiError !== 'model_requires_usage_credits') return undefined;
  const content = obj(m.message).content;
  const text = (Array.isArray(content) ? content : []).map((b) => str(obj(b).text) ?? '').join(' ').trim();
  if (apiError !== 'usage_limit_reached' && apiError !== 'model_requires_usage_credits' && !isUsageLimitText(text)) return undefined;
  const info = obj(obj(m.api_error_params).rate_limit_info);
  return { text: text || undefined, resetsAt: num(info.resetsAt), window: str(info.rateLimitType) };
}

/** A turn that ended on the limit: result is_error with the limit words (the CLI's last word on it). */
export function limitFromResult(msg: unknown): LimitHit | undefined {
  const m = obj(msg);
  const text = str(m.result) ?? '';
  if (m.is_error !== true || !isUsageLimitText(text)) return undefined;
  return { text };
}

/** Which Higgsfield state an init event shows: connected if any Higgsfield server is, pending while one connects,
 *  else the first one's state (needs-auth, failed), or undefined when none is listed. */
export function higgsfieldState(mcp: { name: string; status: string }[]): string | undefined {
  const hs = mcp.filter((m) => /higgsfield/i.test(m.name));
  if (!hs.length) return undefined;
  if (hs.some((m) => m.status === 'connected')) return 'connected';
  if (hs.some((m) => m.status === 'pending')) return 'pending';
  return hs.find((m) => m.name === 'higgsfield')?.status ?? hs[0].status;
}

// ---- remembering each account's usage

export function recordUsage(home: string, r: RateLimitReading, at = new Date()): Promise<void> {
  return updateAccountsState((s) => {
    const prev = s.accounts[home];
    const windows = r.complete ? { ...r.windows } : { ...(prev?.windows ?? {}), ...r.windows };
    // an answer that let the request through ends a remembered limit
    const limited = r.limited ? { at: at.toISOString(), resetsAt: r.limited.resetsAt, window: r.limited.window, text: prev?.limited?.text }
      : r.status === 'allowed' || r.status === 'allowed_warning' ? undefined : prev?.limited;
    const next: AccountUse = { ...(prev ?? {}), at: at.toISOString(), windows };
    if (limited) next.limited = limited;
    else delete next.limited;
    return { ...s, accounts: { ...s.accounts, [home]: next } };
  });
}

export function recordLimited(home: string, hit: LimitHit, at = new Date()): Promise<void> {
  return updateAccountsState((s) => {
    const prev = s.accounts[home];
    const resetsAt = hit.resetsAt ?? prev?.limited?.resetsAt ?? resetFromWindows(prev, hit.window, at.getTime());
    return { ...s, accounts: { ...s.accounts, [home]: { at: at.toISOString(), windows: prev?.windows ?? {}, ...(prev?.higgsfield ? { higgsfield: prev.higgsfield } : {}), limited: { at: at.toISOString(), resetsAt, window: hit.window ?? prev?.limited?.window, text: hit.text } } } };
  });
}

/** With no reset in the refusal itself: the reset of the named window, else of the fullest window still running. */
function resetFromWindows(u: AccountUse | undefined, window: string | undefined, now: number): number | undefined {
  if (!u) return undefined;
  if (window && u.windows[window]?.resetsAt) return u.windows[window].resetsAt;
  return usageNow(u, now).resetsAt;
}

export function recordHiggsfield(home: string, status: string): void {
  const prev = readAccountsState().accounts[home];
  if (prev?.higgsfield?.status === status) return;
  void updateAccountsState((s) => ({ ...s, accounts: { ...s.accounts, [home]: { ...(s.accounts[home] ?? { at: new Date().toISOString(), windows: {} }), higgsfield: { status, at: new Date().toISOString() } } } }));
}

// ---- the decisions (pure: the tests drive them with made-up records)

/** An account's state now: its fullest window that has not reset since, and until when it refuses requests. */
export function usageNow(u: AccountUse | undefined, now = Date.now()): { utilization: number; window?: string; resetsAt?: number; limitedUntil?: number } {
  let best: { utilization: number; window?: string; resetsAt?: number; limitedUntil?: number } = { utilization: 0 };
  for (const [k, w] of Object.entries(u?.windows ?? {})) {
    if (w.resetsAt !== undefined && w.resetsAt * 1000 <= now) continue; // that window has reset since
    if (w.utilization > best.utilization) best = { utilization: w.utilization, window: k, resetsAt: w.resetsAt };
  }
  const l = u?.limited;
  if (l) {
    const until = l.resetsAt !== undefined ? l.resetsAt * 1000 : (Date.parse(l.at) || now) + 3_600_000;
    if (until > now) best.limitedUntil = until;
  }
  return best;
}

export type EarlyDecision = 'stay' | 'wait' | 'switch';

/** The early switch: below the switch point nothing happens; at or above it Alma moves only at a pause, with no turn
 *  in flight, no sub-agent and no background job running; until then she waits. Nothing running is ever cut off. */
export function earlyDecision(o: { utilization: number; threshold: number; turnRunning: boolean; subAgents: number; background: number }): EarlyDecision {
  if (!(o.utilization >= o.threshold)) return 'stay';
  return o.turnRunning || o.subAgents > 0 || o.background > 0 ? 'wait' : 'switch';
}

/** Where to go. Early: the first other account not itself at or above the switch point (none: stay). At the limit:
 *  the first other account below the switch point, else the first other one not refusing requests; when every
 *  account (this one too) refuses, wait for the earliest reset and resume there. */
export function chooseTarget(current: string, homes: string[], state: AccountsState, threshold: number, now: number, mode: 'early' | 'limit'):
  { home: string } | { home: string; waitUntil: number } | undefined {
  const others = homes.filter((h) => h !== current);
  const usageOf = (h: string) => usageNow(state.accounts[h], now);
  const below = others.find((h) => !usageOf(h).limitedUntil && usageOf(h).utilization < threshold);
  if (below) return { home: below };
  if (mode === 'early') return undefined;
  const open = others.find((h) => !usageOf(h).limitedUntil);
  if (open) return { home: open };
  let best: { home: string; waitUntil: number } | undefined;
  for (const h of [current, ...others]) {
    const until = usageOf(h).limitedUntil ?? now;
    if (!best || until < best.waitUntil) best = { home: h, waitUntil: until };
  }
  return best;
}

/** After a wait for a reset: stay on the account if it is open again, else go where chooseTarget says. */
export function pickAfterWait(current: string, homes: string[], state: AccountsState, threshold: number, now: number): { home: string } | { home: string; waitUntil: number } | undefined {
  if (!usageNow(state.accounts[current], now).limitedUntil) return { home: current };
  return chooseTarget(current, homes, state, threshold, now, 'limit');
}

// ---- the thread's lines and Alma's notes

const LIMIT_NAMES: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'weekly limit', seven_day_opus: 'Opus limit', seven_day_sonnet: 'Sonnet limit', seven_day_overage_included: 'weekly model limit', overage: 'usage credit limit' };

/** "5-hour limit": from the CLI's own words when there are some ("You've hit your Fable limit"), else the window. */
export function limitName(window?: string, text?: string): string {
  const m = text ? /hit your ([\w' -]{1,40}? limit)/i.exec(text) : null;
  return m ? m[1] : (window && LIMIT_NAMES[window]) || 'usage limit';
}

/** "3:40 pm" today, "Tue 3:40 pm" within the week, "25 Nov, 3:40 pm" beyond, in this Mac's time. */
export function formatReset(unixSec: number | undefined, now = Date.now()): string {
  if (unixSec === undefined) return 'an unknown time';
  const d = new Date(unixSec * 1000);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s+/g, ' ');
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return time;
  if (d.getTime() - now < 6 * 86_400_000 && d.getTime() > now) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

const pct = (u: number) => `${Math.round(u * 100)}%`;

export function movedEarlyLine(to: string, from: string, utilization: number, resetsAt?: number): string {
  return `Alma moved to ${to} · ${from} at ${pct(utilization)}${resetsAt !== undefined ? `, resets ${formatReset(resetsAt)}` : ''}`;
}
export function movedLimitLine(to: string, from: string, hit: LimitHit): string {
  return `Alma moved to ${to} · ${from} reached its ${limitName(hit.window, hit.text)}${hit.resetsAt !== undefined ? `, resets ${formatReset(hit.resetsAt)}` : ''}`;
}
export function bothAtLimitLine(untilMs: number): string {
  return `Both accounts are at their limit; Alma resumes at ${formatReset(Math.round(untilMs / 1000))}`;
}
/** Said back when the user's message made her look again and still no account is open (shown to the user only). */
export function stillAtLimitLine(untilMs: number): string {
  return `Looked again: still no account open. Your message waits; Alma resumes at ${formatReset(Math.round(untilMs / 1000))}, or as soon as an account lets a request through`;
}
export function resumedLine(label: string): string {
  return `Alma resumes on ${label} · its limit has reset`;
}

/** The lines above as the thread shows them: one id per line, the same live and from the transcript, so they merge. */
export function accountLineId(line: string): string {
  return `note:${createHash('sha1').update(line).digest('hex').slice(0, 12)}`;
}
const ACCOUNT_LINE = /^(Alma moved to |Alma resumes on |Both accounts are at their limit)/;

/** The account lines a stored prompt's <harness-note> starts with (the thread shows them from the transcript too). */
export function accountLinesFromPrompt(prompt: string): string[] {
  const m = /<harness-note>([\s\S]*?)<\/harness-note>/.exec(prompt);
  if (!m) return [];
  const out: string[] = [];
  for (const line of m[1].replace(/&lt;/g, '<').split('\n')) {
    if (!ACCOUNT_LINE.test(line)) break;
    out.push(line.trim());
  }
  return out;
}

/** Told to Alma with her next message after an early move: nothing was cut off. */
export function earlyNote(line: string): string {
  return `${line}\nThe harness moved you to another Claude account at a pause because the last one was close to its usage limit. It is the same session with the same history; nothing was running and nothing was lost. Carry on as before.`;
}

export interface CutOff { title: string; agentId?: string; lastStep?: string; transcript?: string }

/** The note that resumes Alma after the limit cut a turn off: where she is now, which sub-agents were interrupted
 *  (name, last step, transcript), and what to do: check, then continue or restart only what was cut off. */
export function fallbackNote(o: { lines: string[]; from: string; to: string; hit: LimitHit; cut: CutOff[]; background?: number; onKey?: boolean }): string {
  const name = limitName(o.hit.window, o.hit.text);
  const where = o.onKey ? 'the reserve API key' : o.to;
  const out = [
    ...o.lines,
    `Your last turn was cut off because ${o.from} reached its ${name}${o.hit.resetsAt !== undefined ? ` (it resets ${formatReset(o.hit.resetsAt)})` : ''}. You now run on ${where}, in the same session with the same history.`,
  ];
  if (o.cut.length) {
    out.push(`${o.cut.length === 1 ? 'This sub-agent was' : 'These sub-agents were'} interrupted when the limit hit:`);
    for (const c of o.cut) {
      out.push(`- "${c.title.replace(/^Alma\s*›\s*/, '')}"${c.agentId ? ` (agent ${c.agentId})` : ''}: last step ${c.lastStep ? `"${c.lastStep}"` : 'unknown'}; transcript ${c.transcript ?? 'not found'}`);
    }
    out.push('For each, check what it finished (its transcript, the files it wrote, spend.md, the review cards) and continue or restart only what was cut off. SendMessage to its agent id may resume it from its own transcript; if that fails, dispatch a fresh one for what is left.');
  } else {
    out.push('No sub-agent was running.');
  }
  if (o.background) out.push(`${o.background === 1 ? 'One background job' : `${o.background} background jobs`} (a shell command such as a render) ${o.background === 1 ? 'was' : 'were'} stopped too: check ${o.background === 1 ? 'its' : 'their'} output and run again only what did not finish.`);
  out.push('Do not redo finished work, and do not resubmit a paid job whose id is already in the film\'s records (spend.md, regeneration-log.md, job ids in the transcripts): collect or wait on that job instead. Then finish what the user last asked for.');
  return out.join('\n');
}

// ---- carrying a session to another account

export interface CopyStep { from: string; to: string; action: 'copy' | 'same-file' | 'kept' }
export interface CopyPlan { same: boolean; steps: CopyStep[] }

/** The real path of p, or of its nearest existing parent with the rest joined on (for a folder not made yet). */
export async function realpathLoose(p: string): Promise<string> {
  const rest: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(await realpath(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try { entries = await readdir(dir); } catch { return out; }
  for (const name of entries) {
    const p = path.join(dir, name);
    const st = await lstat(p).catch(() => undefined);
    if (st?.isDirectory()) out.push(...await listFiles(p));
    else if (st?.isFile()) out.push(p);
  }
  return out;
}

/** What a move copies: the session's <id>.jsonl and everything in its <id>/ folder (the sub-agents' transcripts among
 *  it), from the old account's projects/<slug>/ to the new one's. Nothing when both are the same folder on disk (the
 *  user's account 2 links projects to account 1's): a file is never copied onto itself. A file the new account has
 *  as new or newer is kept. */
export async function copyPlan(fromHome: string, toHome: string, cwd: string, sessionId: string): Promise<CopyPlan> {
  const src = projectsDir(fromHome, cwd);
  const dst = projectsDir(toHome, cwd);
  if (await realpathLoose(src) === await realpathLoose(dst)) return { same: true, steps: [] };
  const files = [path.join(src, `${sessionId}.jsonl`), ...await listFiles(path.join(src, sessionId))];
  const steps: CopyStep[] = [];
  for (const from of files) {
    const fst = await stat(from).catch(() => undefined);
    if (!fst?.isFile()) continue;
    const to = path.join(dst, path.relative(src, from));
    const tst = await stat(to).catch(() => undefined);
    if (tst && await realpathLoose(from) === await realpathLoose(to)) steps.push({ from, to, action: 'same-file' });
    // a copy keeps the source's time to the millisecond: within 1 ms it is the same file
    else if (tst && tst.mtimeMs >= fst.mtimeMs - 1) steps.push({ from, to, action: 'kept' });
    else steps.push({ from, to, action: 'copy' });
  }
  return { same: false, steps };
}

/** Copies (never moves, never deletes a file of the CLI's) through a temp file and a rename, keeping the source's
 *  times so a later move compares like with like. Checks again that source and target are not one file. */
export async function runCopyPlan(plan: CopyPlan): Promise<number> {
  let n = 0;
  for (const s of plan.steps) {
    if (s.action !== 'copy') continue;
    if (await realpathLoose(s.from) === await realpathLoose(s.to)) continue;
    await mkdir(path.dirname(s.to), { recursive: true });
    const tmp = `${s.to}.harness-copy-${process.pid}-${Date.now()}`;
    try {
      await copyFile(s.from, tmp, constants.COPYFILE_FICLONE);
      const st = await stat(s.from);
      await utimes(tmp, st.atimeMs / 1000, st.mtimeMs / 1000);
      await rename(tmp, s.to);
      n++;
    } catch (e) {
      await unlink(tmp).catch(() => undefined); // only the harness's own temp file
      throw e;
    }
  }
  return n;
}
