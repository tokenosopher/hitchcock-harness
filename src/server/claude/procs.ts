// One Alma per film across a restart or a crash of the server. Every Alma process the app
// starts is recorded in harness/alma-procs.json (pid, its start time as ps reports it, the session id, which server
// started it). Before a film's Alma starts, and once when the server starts, a recorded process this server does not
// own is ended, but only once it is proven to be that Alma: alive, the claude binary, the harness's own prompt on its
// command line, and the same start time (or, while the start time was not yet recorded, `--resume <the same session>`
// on its command line). A bare pid is never trusted. A process whose parent is still the server that started it
// belongs to that other live server and is left alone (and no second Alma is started).
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { claudeConfig } from './config';
import { helperEnv } from '../env';

export interface AlmaProcRecord {
  pid: number;
  /** ps's `lstart` of the process, whitespace collapsed ("Mon Nov 16 10:00:00 2026"); empty until read. */
  startedAt: string;
  sessionId?: string;
  bin: string;
  cwd: string;
  /** The server that started it: its boot id (new each server start), pid and start time. */
  owner: string;
  serverPid: number;
  serverStartedAt: string;
  recordedAt: string;
}
type ProcsFile = Record<string, AlmaProcRecord>;

/** Text the user sees in the thread, and the note Alma gets on her next message. */
export const EARLIER_STOPPED = 'An earlier Alma session from before a restart was still running and was stopped.';
export const EARLIER_NOTE = `${EARLIER_STOPPED} Work it started (sub-agents, generations, file writes, commits) may be half done: check what landed before you carry on.`;
export const MARKER = 'Hitchcock Harness';

// a boot id per server process; it survives dev hot reloads (globalThis), not a restart
const g = globalThis as unknown as { __harnessBoot?: string };
export const bootId: string = (g.__harnessBoot ??= randomUUID());

/** The operations that touch other processes, replaceable by the test. */
export const procOps = {
  kill: (pid: number, sig: NodeJS.Signals | 0): void => { process.kill(pid, sig); },
  ps: (pid: number): Promise<{ ppid: number; startedAt: string; command: string } | null> => new Promise((resolve) => {
    execFile('/bin/ps', ['-ww', '-o', 'ppid=,lstart=,command=', '-p', String(pid)], { env: helperEnv({ LC_ALL: 'C' }), timeout: 5000, maxBuffer: 4 << 20 }, (err, out) => {
      const line = err ? '' : out.split('\n').find((l) => l.trim()) ?? '';
      const m = /^\s*(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line);
      resolve(m ? { ppid: Number(m[1]), startedAt: m[2].replace(/\s+/g, ' '), command: m[3] } : null);
    });
  }),
};

function file(): string {
  return path.join(claudeConfig().harnessDir, 'alma-procs.json');
}

export async function readProcs(): Promise<ProcsFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as ProcsFile) : {};
  } catch {
    return {};
  }
}

let writeChain: Promise<void> = Promise.resolve();
function change(fn: (all: ProcsFile) => void): Promise<void> {
  writeChain = writeChain.then(async () => {
    const all = await readProcs();
    fn(all);
    await mkdir(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 2) + '\n');
    await rename(tmp, file());
  }).catch(() => undefined);
  return writeChain;
}

let serverStart: Promise<string> | null = null;
function serverStartedAt(): Promise<string> {
  serverStart ??= procOps.ps(process.pid).then((p) => p?.startedAt ?? '');
  return serverStart;
}

/** Records a process this server just started for `film`, then fills in its start time. */
export async function recordStart(film: string, pid: number, bin: string, cwd: string, sessionId?: string): Promise<void> {
  const rec: AlmaProcRecord = { pid, startedAt: '', bin, cwd, owner: bootId, serverPid: process.pid, serverStartedAt: '', recordedAt: new Date().toISOString(), ...(sessionId ? { sessionId } : {}) };
  await change((all) => { all[film] = rec; });
  const [me, server] = await Promise.all([procOps.ps(pid), serverStartedAt()]);
  await change((all) => {
    const r = all[film];
    if (r?.pid !== pid || r.owner !== bootId) return;
    r.serverStartedAt = server;
    if (me) r.startedAt = me.startedAt;
  });
}

export function recordSession(film: string, pid: number, sessionId: string): Promise<void> {
  return change((all) => { const r = all[film]; if (r?.pid === pid && r.owner === bootId) r.sessionId = sessionId; });
}

export function recordExit(film: string, pid: number): Promise<void> {
  return change((all) => { if (all[film]?.pid === pid && all[film].owner === bootId) delete all[film]; });
}

function alive(pid: number): boolean {
  try { procOps.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Is `pid` still the process `rec` describes? Every part must hold. */
async function proven(rec: AlmaProcRecord): Promise<{ ok: boolean; why: string; ppid?: number }> {
  if (!Number.isInteger(rec.pid) || rec.pid <= 1 || rec.pid === process.pid) return { ok: false, why: 'not a usable pid' };
  const p = await procOps.ps(rec.pid);
  if (!p) return { ok: false, why: 'not running' };
  if (!rec.bin || !p.command.includes(rec.bin)) return { ok: false, why: 'not the claude binary' };
  if (!p.command.includes(MARKER)) return { ok: false, why: 'not started by the harness' };
  if (rec.startedAt) {
    if (p.startedAt !== rec.startedAt) return { ok: false, why: 'another process now has that pid' };
  } else if (!rec.sessionId || !p.command.includes(`--resume ${rec.sessionId}`)) {
    return { ok: false, why: 'no start time or session id to prove it' };
  }
  return { ok: true, why: '', ppid: p.ppid };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gone(pid: number, ms: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!alive(pid)) return true; await sleep(100); }
  return !alive(pid);
}

export type EarlierResult =
  | { kind: 'none' }                                // nothing recorded, dead, ours, or not provably that Alma
  | { kind: 'other-server'; pid: number; serverPid: number }  // still the child of a live server: not ours to end
  | { kind: 'stopped'; pid: number; forced: boolean }
  | { kind: 'failed'; pid: number; error: string };

/** Finds a recorded Alma of `film` this server does not own and ends it (SIGTERM, wait, SIGKILL). `isOwn` says
 *  whether a pid is a live child of this server (dev hot reloads keep those). */
export async function endEarlier(film: string, isOwn: (pid: number) => boolean, waitMs = Number(process.env.HARNESS_ALMA_STOP_WAIT_MS || 10000)): Promise<EarlierResult> {
  const rec = (await readProcs())[film];
  if (!rec || isOwn(rec.pid) || (rec.owner === bootId && rec.serverPid === process.pid)) return { kind: 'none' };
  const check = await proven(rec);
  if (!check.ok) {
    // dead or someone else's pid: the record is stale, drop it (only if it has not changed meanwhile)
    await change((all) => { if (all[film]?.pid === rec.pid && all[film].recordedAt === rec.recordedAt) delete all[film]; });
    return { kind: 'none' };
  }
  // its parent is still the server that started it (an orphan's parent is launchd): another live server owns it
  if (check.ppid === rec.serverPid) return { kind: 'other-server', pid: rec.pid, serverPid: rec.serverPid };
  try {
    procOps.kill(rec.pid, 'SIGTERM');
    let forced = false;
    if (!(await gone(rec.pid, waitMs))) {
      if (!(await proven(rec)).ok) return finish(film, rec, false); // it ended right at the wait's end
      forced = true;
      procOps.kill(rec.pid, 'SIGKILL');
      if (!(await gone(rec.pid, 3000))) return { kind: 'failed', pid: rec.pid, error: 'it was still running after SIGKILL' };
    }
    return finish(film, rec, forced);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') return finish(film, rec, false);
    return { kind: 'failed', pid: rec.pid, error: err.code ?? err.message };
  }
}

async function finish(film: string, rec: AlmaProcRecord, forced: boolean): Promise<EarlierResult> {
  await change((all) => { if (all[film]?.pid === rec.pid) delete all[film]; });
  return { kind: 'stopped', pid: rec.pid, forced };
}

/** The films that have a recorded Alma (for the sweep at server start). */
export async function recordedFilms(): Promise<string[]> {
  return Object.keys(await readProcs());
}
