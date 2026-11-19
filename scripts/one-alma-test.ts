// npm run one-alma:test
// One Alma per film across a restart (src/server/claude/procs.ts, process.ts). A stand-in for
// the claude CLI (a tiny node script that stays alive and answers each stdin line with a result) in a temp harness
// folder (deleted after): a recorded live earlier Alma is ended before the new one starts, the thread gets one quiet
// line and Alma's next message carries the note (stripped from the thread's history); a recorded pid that is some
// other program is left alone; a dead pid is ignored; a stand-in that ignores SIGTERM is forced after the wait; a
// failure to end it stops the start and reports the pid; the sweep at server start; the server's own Alma is never
// ended; at shutdown the server's Almas are stopped. Never touches a real Alma or a real film.
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AlmaProcRecord } from '../src/server/claude/procs';

const root = mkdtempSync(path.join(os.tmpdir(), 'one-alma-test-'));
const repo = path.join(root, 'repo');
const bin = path.join(root, 'claude-standin.mjs');
const log = path.join(root, 'standin.log');
mkdirSync(repo, { recursive: true });
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_CLAUDE_BIN = bin;
process.env.HARNESS_ALMA_STOP_WAIT_MS = '600';
process.env.STANDIN_LOG = log;
delete process.env.HARNESS_ALMA_DRYRUN;
delete process.env.HARNESS_ALMA_ADD_DIRS;

writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
if (process.env.STANDIN_IGNORE_TERM === '1') process.on('SIGTERM', () => {});
const sid = 'sid-' + process.pid;
createInterface({ input: process.stdin }).on('line', (l) => {
  appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ pid: process.pid, line: l }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, session_id: sid, total_cost_usd: 0 }) + '\\n');
});
setInterval(() => {}, 60000);
`);
chmodSync(bin, 0o755);

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 600)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(50); }
  return ok();
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const started: ChildProcess[] = [];

async function main(): Promise<void> {
  const procs = await import('../src/server/claude/procs');
  const { getAlma, stopOwnAlmas, onServerStart } = await import('../src/server/claude/process');
  const { prefixContext, parseContextBlock } = await import('../src/server/context');
  const harness = process.env.HARNESS_DIR!;
  const procsFile = path.join(harness, 'alma-procs.json');
  const readRecs = () => (existsSync(procsFile) ? JSON.parse(readFileSync(procsFile, 'utf8')) as Record<string, AlmaProcRecord> : {});
  const writeRecs = (r: Record<string, AlmaProcRecord>) => { mkdirSync(harness, { recursive: true }); writeFileSync(procsFile, JSON.stringify(r, null, 2)); };
  const deadPid = await new Promise<number>((r) => { const c = spawn('/usr/bin/true'); c.on('exit', () => r(c.pid!)); });

  /** An Alma left by an earlier server: a stand-in with the harness's prompt and --resume on its command line. */
  async function earlier(film: string, opts: { ignoreTerm?: boolean; record?: Partial<AlmaProcRecord> } = {}): Promise<ChildProcess> {
    const sid = `old-${film}`;
    const c = spawn(bin, ['-p', '--input-format', 'stream-json', '--append-system-prompt', `You are Alma, the agent of ${procs.MARKER}.`, '--resume', sid], { cwd: repo, env: { ...process.env, STANDIN_IGNORE_TERM: opts.ignoreTerm ? '1' : '0' }, stdio: ['pipe', 'ignore', 'ignore'] });
    started.push(c);
    await until(() => !!c.pid);
    let ps = await procs.procOps.ps(c.pid!);
    await until(() => false, 200);
    ps = await procs.procOps.ps(c.pid!); // after node has replaced the exec, the command line is final
    const rec: AlmaProcRecord = { pid: c.pid!, startedAt: ps!.startedAt, sessionId: sid, bin, cwd: repo, owner: 'an-earlier-server', serverPid: deadPid, serverStartedAt: 'x', recordedAt: new Date().toISOString(), ...opts.record };
    writeRecs({ ...readRecs(), [film]: rec });
    return c;
  }
  const lines = (pid: number) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { pid: number; line: string }).filter((x) => x.pid === pid) : []);
  const sentText = (l: string) => (JSON.parse(l) as { message: { content: { text: string }[] } }).message.content[0].text;
  const thread = (film: string) => getAlma(film).liveEvents().filter((e) => e.kind === 'system' || e.kind === 'error').map((e) => `${e.kind}: ${(e as { text: string }).text}`);

  // 0. the note rides between the context block and the words, and the thread's history shows the words only
  const ctx = { film: 'f', page: 'story', pinned: '', selected: [] };
  check('the note is in what Alma receives', prefixContext('hello', ctx, procs.EARLIER_NOTE).includes(`<harness-note>${procs.EARLIER_NOTE}</harness-note>\n\nhello`));
  check('the history shows the words only, with a context block', parseContextBlock(prefixContext('hello', ctx, procs.EARLIER_NOTE)).text === 'hello');
  check('the history shows the words only, without one', parseContextBlock(prefixContext('hello', undefined, procs.EARLIER_NOTE)).text === 'hello');

  // 1. a recorded live earlier Alma is ended before a new one starts
  {
    const old = await earlier('film-a');
    const a = getAlma('film-a');
    await a.send('first message');
    await until(() => a.pid !== undefined && lines(a.pid).length > 0);
    check('the earlier Alma is ended', !alive(old.pid!));
    check('a new Alma started, another process', a.pid !== undefined && a.pid !== old.pid);
    check('the thread has the one quiet line', JSON.stringify(thread('film-a')) === JSON.stringify([`system: ${procs.EARLIER_STOPPED}`]), thread('film-a'));
    check('Alma\'s next message carries the note', sentText(lines(a.pid!)[0].line).startsWith(`<harness-note>${procs.EARLIER_NOTE}</harness-note>\n\nfirst message`), lines(a.pid!)[0]);
    await until(() => !a.busy);
    await a.send('second message');
    await until(() => lines(a.pid!).length > 1);
    check('only that next message carries it', sentText(lines(a.pid!)[1].line) === 'second message');
    await until(() => readRecs()['film-a']?.pid === a.pid && !!readRecs()['film-a']?.startedAt);
    const rec = readRecs()['film-a'];
    check('the new Alma is recorded: pid, start time, owner', rec?.pid === a.pid && !!rec.startedAt && rec.owner === procs.bootId && rec.serverPid === process.pid, rec);
    await onServerStart();
    check('the server\'s own Alma is never ended (sweep and next start)', alive(a.pid!) && (await procs.endEarlier('film-a', () => false)).kind === 'none' && alive(a.pid!));
  }

  // 2. a recorded pid that is some other program is left alone
  {
    const other = spawn('/bin/sleep', ['30']);
    started.push(other);
    await until(() => !!other.pid);
    const ps = await procs.procOps.ps(other.pid!);
    writeRecs({ ...readRecs(), 'film-b': { pid: other.pid!, startedAt: ps!.startedAt, sessionId: 'old-film-b', bin, cwd: repo, owner: 'an-earlier-server', serverPid: deadPid, serverStartedAt: 'x', recordedAt: new Date().toISOString() } });
    const b = getAlma('film-b');
    await b.send('hi');
    await until(() => b.pid !== undefined && lines(b.pid).length > 0);
    check('another program on the recorded pid is left alone', alive(other.pid!));
    check('the new Alma starts, nothing said', b.pid !== undefined && thread('film-b').length === 0, thread('film-b'));
    // a real earlier Alma whose recorded start time differs (the pid was reused) is not proven either
    const reused = await earlier('film-b2', { record: { startedAt: 'Mon Jan  1 00:00:00 2024' } });
    check('a pid with another start time is left alone', (await procs.endEarlier('film-b2', () => false)).kind === 'none' && alive(reused.pid!));
  }

  // 3. a recorded pid that is dead is ignored
  {
    writeRecs({ ...readRecs(), 'film-c': { pid: deadPid, startedAt: 'x', sessionId: 'old-film-c', bin, cwd: repo, owner: 'an-earlier-server', serverPid: deadPid, serverStartedAt: 'x', recordedAt: new Date().toISOString() } });
    const c = getAlma('film-c');
    await c.send('hi');
    await until(() => c.pid !== undefined && lines(c.pid).length > 0);
    check('a dead pid is ignored and the new Alma starts', c.pid !== undefined && thread('film-c').length === 0 && sentText(lines(c.pid!)[0].line) === 'hi');
  }

  // 4. a stand-in that ignores SIGTERM is forced after the wait
  {
    const old = await earlier('film-d', { ignoreTerm: true });
    await sleep(300); // its SIGTERM handler is in place
    const t0 = Date.now();
    const r = await procs.endEarlier('film-d', () => false);
    check('ignored SIGTERM, forced after the wait', r.kind === 'stopped' && r.forced && !alive(old.pid!) && Date.now() - t0 >= 600, r);
    check('its record is gone', !readRecs()['film-d']);
  }

  // 5. a failure to end it stops the start and reports the pid
  {
    const old = await earlier('film-e');
    const realKill = procs.procOps.kill;
    procs.procOps.kill = (pid, sig) => { if (pid === old.pid && sig !== 0) throw Object.assign(new Error('not permitted'), { code: 'EPERM' }); realKill(pid, sig); };
    const e = getAlma('film-e');
    await e.send('hi');
    await until(() => thread('film-e').length > 0);
    procs.procOps.kill = realKill;
    await sleep(200);
    check('no second Alma started', e.pid === undefined && !e.busy && alive(old.pid!));
    check('the thread says so with the pid', thread('film-e').length === 1 && thread('film-e')[0].startsWith('error: ') && thread('film-e')[0].includes(`pid ${old.pid}`), thread('film-e'));
  }

  // 6. the sweep at server start ends an earlier Alma and tells that film's thread and Alma
  {
    const old = await earlier('film-f');
    const flag = globalThis as unknown as { __almaLifecycle?: boolean };
    flag.__almaLifecycle = false;
    await onServerStart();
    check('the sweep ended it', !alive(old.pid!));
    check('the sweep told the thread', JSON.stringify(thread('film-f')) === JSON.stringify([`system: ${procs.EARLIER_STOPPED}`]), thread('film-f'));
    const f = getAlma('film-f');
    await f.send('after the restart');
    await until(() => f.pid !== undefined && lines(f.pid).length > 0);
    check('Alma\'s first message after the sweep carries the note', sentText(lines(f.pid!)[0].line).startsWith('<harness-note>'));
  }

  // 7. an earlier Alma still the child of its live server is not ended, and no second one starts
  {
    const old = await earlier('film-g', { record: { serverPid: process.pid } });
    const r = await procs.endEarlier('film-g', () => false);
    check('another live server\'s Alma is left alone', r.kind === 'other-server' && alive(old.pid!), r);
  }

  // 8. at shutdown the server's own Almas are stopped
  {
    const pids = ['film-a', 'film-b', 'film-c', 'film-f'].map((f) => getAlma(f).pid!).filter(Boolean);
    stopOwnAlmas();
    check(`at shutdown the server's ${pids.length} Almas are stopped`, pids.length === 4 && (await until(() => pids.every((p) => !alive(p)), 5000)));
  }
}

main()
  .then(() => { console.log(`\n${checks} checks passed`); })
  .catch((e: unknown) => { console.log(String(e)); process.exitCode = 1; })
  .finally(() => {
    for (const c of started) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
    // stand-ins the Almas under test started (a failed run): only pids that wrote to this run's own log
    try { for (const l of readFileSync(log, 'utf8').trim().split('\n')) { try { process.kill((JSON.parse(l) as { pid: number }).pid, 'SIGKILL'); } catch { /* gone */ } } } catch { /* no log */ }
    rmSync(root, { recursive: true, force: true });
    setTimeout(() => process.exit(), 300);
  });
