// npm run reserve:test
// The reserve switch (src/server/claude/reserve.ts, limit.ts, process.ts). In a temp folder
// (deleted after) with a stand-in for the claude CLI that records, per process, only whether an API key reached it:
// the setting file round trip; turning on without a key is refused; Alma's environment carries ANTHROPIC_API_KEY
// only when on with a key and never HARNESS_RESERVE_API_KEY; the spend adds up by month; the limit words; and a
// flip applied to a live Alma (closed at once when idle, at the end of the turn when busy, resumed on the same
// session). Never touches a real Alma, a real key or a real film. Key values are never printed.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(os.tmpdir(), 'reserve-test-'));
const repo = path.join(root, 'repo');
const bin = path.join(root, 'claude-standin.mjs');
const log = path.join(root, 'standin.log');
mkdirSync(repo, { recursive: true });
process.chdir(root); // .env.local is read from the working folder: this one, not the harness's
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_CLAUDE_BIN = bin;
process.env.STANDIN_LOG = log;
delete process.env.HARNESS_ALMA_DRYRUN;
delete process.env.HARNESS_ALMA_ADD_DIRS;
delete process.env.HARNESS_RESERVE_API_KEY;
const FAKE = 'sk-ant-api03-test-only';

writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const sid = process.argv.includes('--resume') ? process.argv[process.argv.indexOf('--resume') + 1] : 'sid-' + process.pid;
const onKey = !!process.env.ANTHROPIC_API_KEY;
// each process counts from 0 (as a CLI that does not carry the session's cost over would); the nth process adds n a turn
const step = (existsSync(process.env.STANDIN_LOG) ? readFileSync(process.env.STANDIN_LOG, 'utf8').trim().split('\\n').filter(Boolean).length : 0) + 1;
let total = 0;
appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ pid: process.pid, onKey, passedReserveName: 'HARNESS_RESERVE_API_KEY' in process.env, resumed: process.argv.includes('--resume'), sid }) + '\\n');
createInterface({ input: process.stdin }).on('line', (l) => {
  total += step;
  const t = total;
  setTimeout(() => process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, session_id: sid, total_cost_usd: t }) + '\\n'), l.includes('slow') ? 800 : 10);
});
`);
chmodSync(bin, 0o755);

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 400)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(30); }
  return ok();
}
const starts = (): { pid: number; onKey: boolean; passedReserveName: boolean; resumed: boolean; sid: string }[] =>
  existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

async function main(): Promise<void> {
  const r = await import('../src/server/claude/reserve');
  const { isUsageLimitText } = await import('../src/server/claude/limit');
  const { getAlma, reserveChanged, stopOwnAlmas } = await import('../src/server/claude/process');
  const settingFile = path.join(process.env.HARNESS_DIR!, 'alma-reserve.json');

  // the setting and the key
  check('off by default, no file', !r.readReserve().on && !existsSync(settingFile));
  check('no key saved', !r.hasReserveKey());
  const refused = await r.setReserveOn(true);
  check('turning on without a key is refused with 409 and the words', !refused.ok && refused.status === 409 && refused.error === r.NO_KEY_WORDS, refused);
  check('the refusal wrote nothing', !existsSync(settingFile));
  writeFileSync(path.join(root, '.env.local'), `OTHER=1\nHARNESS_RESERVE_API_KEY="${FAKE}"\n`);
  check('a key added to .env.local is seen without a restart', r.hasReserveKey() && r.readReserveKey() === FAKE);
  const on = await r.setReserveOn(true);
  check('turning on with a key', on.ok && on.view.on && on.view.hasKey && !!on.view.since);
  const saved = JSON.parse(readFileSync(settingFile, 'utf8')) as { on: boolean; since: string; spent: object };
  check('the file holds on, since and spent, never the key', saved.on === true && typeof saved.since === 'string' && typeof saved.spent === 'object' && !readFileSync(settingFile, 'utf8').includes(FAKE));
  check('the view says hasKey and nothing of the key', !JSON.stringify(r.reserveView()).includes(FAKE));
  check('round trip: read back on', r.readReserve().on);
  const off = await r.setReserveOn(false);
  check('turning off', off.ok && !off.view.on && !r.readReserve().on);

  // Alma's environment
  const base = { PATH: '/bin', ANTHROPIC_API_KEY: 'parent-key', ANTHROPIC_AUTH_TOKEN: 't', HARNESS_RESERVE_API_KEY: FAKE, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x', CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '5' } as unknown as NodeJS.ProcessEnv;
  const plan = r.almaEnv(base);
  check('off: no ANTHROPIC_API_KEY, no token, no reserve name, no parent session variables',
    !('ANTHROPIC_API_KEY' in plan) && !('ANTHROPIC_AUTH_TOKEN' in plan) && !('HARNESS_RESERVE_API_KEY' in plan) && !('CLAUDECODE' in plan) && !('CLAUDE_CODE_ENTRYPOINT' in plan) && plan.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS === '5' && plan.PATH === '/bin');
  const keyed = r.almaEnv(base, FAKE);
  check('on: ANTHROPIC_API_KEY is the reserve key, the reserve name still not passed', keyed.ANTHROPIC_API_KEY === FAKE && !('HARNESS_RESERVE_API_KEY' in keyed) && !('ANTHROPIC_AUTH_TOKEN' in keyed));
  check('a start reads the setting: off gives no key', r.reserveKeyForStart() === undefined);

  // spend by month
  await r.addReserveSpend(1.25, new Date(2026, 10, 3));
  await r.addReserveSpend(0.5, new Date(2026, 10, 20));
  await r.addReserveSpend(2, new Date(2026, 11, 1));
  await r.addReserveSpend(-1, new Date(2026, 10, 20));
  const spent = r.readReserve().spent;
  check('the spend adds up by month', spent['2026-11'] === 1.75 && spent['2026-12'] === 2 && Object.keys(spent).length === 2, spent);

  // the limit words
  for (const t of ["You've hit your weekly limit · resets 3pm (Europe/London)", "You've hit your session limit", 'Claude AI usage limit reached|1763380800', "you've hit your Opus limit", "You've hit your usage limit"]) check(`limit words: ${t}`, isUsageLimitText(t));
  for (const t of ['The render hit the time limit', 'weekly limit of 3 takes']) check(`not limit words: ${t}`, !isUsageLimitText(t));

  // a flip applied to a live Alma
  const alma = getAlma('reserve-film');
  await alma.send('one');
  await until(() => !alma.busy && starts().length === 1);
  const first = starts()[0];
  check('off: the first process starts on the plan, without the reserve name', !!first && !first.onKey && !first.passedReserveName);
  check('the thread says plan', alma.info().reserve?.on === false && alma.info().reserve?.onKey === false && alma.info().reserve?.hasKey === true);
  await r.setReserveOn(true);
  reserveChanged();
  check('idle: the plan process is closed at once', await until(() => !alma.alive));
  check('with no process the thread reads as on the key', alma.info().reserve?.onKey === true);
  await alma.send('two');
  await until(() => !alma.busy && starts().length === 2);
  const second = starts()[1];
  check('the next message resumes the same session on the key', !!second && second.onKey && second.resumed && second.sid === first.sid && !second.passedReserveName, second);
  check('the turn on the key is counted for this month', await until(() => (r.readReserve().spent[r.monthOf()] ?? 0) > 1.75), r.readReserve().spent);
  const before = r.readReserve().spent[r.monthOf()];

  // busy: the flip waits for the end of the turn
  void alma.send('slow three');
  await sleep(150);
  await r.setReserveOn(false);
  reserveChanged();
  check('busy: the process stays while the turn runs', alma.alive && alma.busy);
  check('busy: the thread shows the change as pending (on is off, the process is still on the key)', alma.info().reserve?.on === false && alma.info().reserve?.onKey === true);
  check('busy: closed once the turn ended', await until(() => !alma.alive));
  check('the busy turn on the key was counted too', (r.readReserve().spent[r.monthOf()] ?? 0) > before);
  const afterOff = r.readReserve().spent[r.monthOf()];
  await alma.send('four');
  await until(() => !alma.busy && starts().length === 3);
  const third = starts()[2];
  check('back on the plan, same session', !!third && !third.onKey && third.resumed && third.sid === first.sid, third);
  check('a plan turn is not counted', r.readReserve().spent[r.monthOf()] === afterOff);
  check('the thread info never holds the key', !JSON.stringify(alma.info()).includes(FAKE));
  stopOwnAlmas();
  console.log(`\n${checks} checks passed`);
}

main()
  .catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => {
    try { (globalThis as unknown as { __almaSessions?: Map<string, { stopNow(): void }> }).__almaSessions?.forEach((a) => a.stopNow()); } catch { /* none */ }
    setTimeout(() => { rmSync(root, { recursive: true, force: true }); process.exit(process.exitCode ?? 0); }, 300);
  });
