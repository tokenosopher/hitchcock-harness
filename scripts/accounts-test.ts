// npm run accounts:test
// Automatic account switching for Alma. In a temp folder (deleted after), with made-up account folders and a stand-in for
// the claude CLI (HARNESS_CLAUDE_BIN; the dry run starts no process at all): the path helpers with and without
// HARNESS_CLAUDE_ACCOUNTS; reading the CLI's rate_limit_event (the shape of a real smoke run, 21 Nov) and its limit
// message; the threshold decision (95% no, 96% yes, running sub-agents wait); the target choice; the copy plan (never
// onto newer files, nothing at all when both accounts share the folder); the fallback note; both at the limit. Then a
// film's Alma through an early switch at a pause, the fallback when the limit cuts a turn off, both accounts at their
// limit and the resume at the reset, and the same with the setting unset (nothing changes). Never touches a real
// Alma, a real account folder or a real film.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// the real path: the stand-in (as the CLI) names its project folder after the cwd it sees, /private/var/… on macOS
const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'accounts-test-')));
const repo = path.join(root, 'repo');
const bin = path.join(root, 'claude-standin.mjs');
const log = path.join(root, 'standin.log');
const A = path.join(root, 'acct1');
const B = path.join(root, 'acct2');
mkdirSync(repo, { recursive: true });
process.chdir(root); // .env.local is read from the working folder: this one, not the harness's
process.env.HOME = root; // ~/.claude is root/.claude: no real account folder is ever read
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.HARNESS_CLAUDE_ACCOUNTS;
delete process.env.HARNESS_ACCOUNT_SWITCH_AT;
delete process.env.HARNESS_ALMA_DRYRUN;
delete process.env.HARNESS_ALMA_ADD_DIRS;
delete process.env.HARNESS_RESERVE_API_KEY;
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_CLAUDE_BIN = bin;
process.env.HARNESS_ACCOUNT_RESUME_MARGIN_MS = '0';
process.env.STANDIN_LOG = log;

// The stand-in: one session, its transcript in its own CLAUDE_CONFIG_DIR (else ~/.claude). Words in a message steer it:
// #use:<share> sends a rate_limit_event; #agent starts a background sub-agent that ends 400 ms after the turn;
// #limit:<unix s> starts a sub-agent, then the limit refuses a request (the CLI's own message, event and result).
writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
const argv = process.argv;
const sid = argv.includes('--resume') ? argv[argv.indexOf('--resume') + 1] : 'sid-accounts-test';
const configDir = process.env.CLAUDE_CONFIG_DIR ?? null;
const dir = path.join(configDir || path.join(process.env.HOME, '.claude'), 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'));
const subs = path.join(dir, sid, 'subagents');
mkdirSync(subs, { recursive: true });
const log = (o) => appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ pid: process.pid, configDir, ...o }) + '\\n');
log({ kind: 'start', resume: argv.includes('--resume') ? sid : null });
const out = (o) => process.stdout.write(JSON.stringify({ session_id: sid, ...o }) + '\\n');
const tool = (id, name, input, parent = null) => out({ type: 'assistant', parent_tool_use_id: parent, message: { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const subStep = (agent, name, input) => appendFileSync(path.join(subs, 'agent-' + agent + '.jsonl'), JSON.stringify({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'tool_use', id: 't' + Date.now(), name, input }] } }) + '\\n');
const usage = (u, reset, status = 'allowed') => out({ type: 'rate_limit_event', rate_limit_info: { status, resetsAt: reset, rateLimitType: 'five_hour', isUsingOverage: false, unifiedWindows: { five_hour: { utilization: u, resetsAt: reset, status }, seven_day: { utilization: 0.1, resetsAt: reset + 86400, status: 'allowed' } } } });
const result = (extra = {}) => out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, total_cost_usd: 0, ...extra });
const rl = createInterface({ input: process.stdin });
rl.on('close', () => process.exit(0)); // stdin closed: the CLI finishes and exits
rl.on('line', (l) => {
  const msg = JSON.parse(l);
  const text = msg.message?.content?.[0]?.text ?? '';
  log({ kind: 'line', text });
  appendFileSync(path.join(dir, sid + '.jsonl'), JSON.stringify({ type: 'user', uuid: msg.uuid, sessionId: sid, timestamp: new Date().toISOString(), message: { role: 'user', content: text } }) + '\\n');
  out({ type: 'system', subtype: 'init', model: 'stand-in', tools: [], mcp_servers: [{ name: 'higgsfield', status: configDir && configDir.endsWith('acct2') ? 'needs-auth' : 'connected', source: 'user' }] });
  const in1h = Math.round(Date.now() / 1000) + 3600;
  const u = /#use:([\\d.]+)/.exec(text);
  if (u) usage(Number(u[1]), in1h);
  if (text.includes('#agent')) {
    tool('toolu_bg1', 'Agent', { description: 'faces · C01 round 2', run_in_background: true, prompt: '…' });
    out({ type: 'system', subtype: 'task_started', task_id: 'abg1', tool_use_id: 'toolu_bg1', description: 'faces · C01 round 2', task_type: 'local_agent', is_backgrounded: true });
    out({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'abg1', task_type: 'local_agent' }] });
    subStep('abg1', 'mcp__higgsfield__generate_image_batch', { requests: [{}, {}, {}] });
    setTimeout(() => {
      out({ type: 'system', subtype: 'task_notification', task_id: 'abg1', tool_use_id: 'toolu_bg1', status: 'completed', summary: 'three faces', usage: { tool_uses: 1 } });
      out({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    }, 400);
  }
  const lim = /#limit:(\\d+)/.exec(text);
  if (lim) {
    const reset = Number(lim[1]);
    tool('toolu_cut1', 'Agent', { description: 'previz · S3', run_in_background: true, prompt: '…' });
    out({ type: 'system', subtype: 'task_started', task_id: 'acut1', tool_use_id: 'toolu_cut1', description: 'previz · S3', task_type: 'local_agent', is_backgrounded: true });
    subStep('acut1', 'mcp__higgsfield__jobs_wait', { job_ids: ['j1', 'j2', 'j3'] });
    const words = "You've hit your 5-hour limit · resets 3pm";
    out({ type: 'assistant', parent_tool_use_id: null, error: 'rate_limit', is_api_error_message: true, api_error_status: 429, api_error: 'usage_limit_reached', api_error_params: { rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: reset } }, message: { id: 'msg_lim' + Date.now(), role: 'assistant', content: [{ type: 'text', text: words }] } });
    usage(1, reset, 'rejected');
    result({ is_error: true, result: words, api_error_status: 429 });
    return;
  }
  setTimeout(() => result(), text.includes('#slow') ? 300 : 10);
});
setInterval(() => {}, 60000);
`);
chmodSync(bin, 0o755);

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 700)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(30); }
  return ok();
}
type Rec = { pid: number; configDir: string | null; kind: 'start' | 'line'; resume?: string | null; text?: string };
const recs = (): Rec[] => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Rec) : []);
const starts = () => recs().filter((r) => r.kind === 'start');
const lines = () => recs().filter((r) => r.kind === 'line');
/** Names, sizes and times of every file under a folder: to prove a step wrote nothing. */
function snapshot(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = path.join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(`${path.relative(dir, p)}:${s.size}:${s.mtimeMs}`); } };
  walk(dir);
  return out.join('\n');
}

async function main(): Promise<void> {
  const acc = await import('../src/server/claude/accounts');
  const { isUsageLimitText, lastTurnHitLimit } = await import('../src/server/claude/limit');
  const { lastStepOf } = await import('../src/server/claude/tasks');
  const { readHistory, transcriptPath, mergeEvents } = await import('../src/server/claude/transcript');
  const { getAlma, stopOwnAlmas } = await import('../src/server/claude/process');
  const { projectSlug } = await import('../src/server/claude/config');
  const SID = 'sid-accounts-test';
  const slug = projectSlug(repo);

  // ---- the path helpers, without the setting: nothing changes
  const plain = path.join(root, '.claude');
  check('unset: one account, the one the CLI uses today (~/.claude)', JSON.stringify(acc.accountHomes()) === JSON.stringify([plain]) && acc.claudeHome('any-film') === plain);
  check('unset: the transcript and sub-agent folders under ~/.claude/projects/<slug>', transcriptPath(repo, SID) === path.join(plain, 'projects', slug, `${SID}.jsonl`) && acc.subagentsDir(plain, repo, SID) === path.join(plain, 'projects', slug, SID, 'subagents'));
  check('unset: Alma\'s CLAUDE_CONFIG_DIR is left as the server has it', acc.accountEnv({ CLAUDE_CONFIG_DIR: '/keep' } as unknown as NodeJS.ProcessEnv, plain).CLAUDE_CONFIG_DIR === '/keep' && !('CLAUDE_CONFIG_DIR' in acc.accountEnv({} as NodeJS.ProcessEnv, plain)));
  check('unset: switching is off', !acc.switchingOn());
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'server-dir/');
  check('unset, server started with CLAUDE_CONFIG_DIR: that folder is the one account', acc.accountHomes()[0] === path.join(root, 'server-dir'));
  delete process.env.CLAUDE_CONFIG_DIR;

  // ---- with the setting
  process.env.HARNESS_CLAUDE_ACCOUNTS = `${A}:${B}`;
  check('set: two accounts in order, switching on', JSON.stringify(acc.accountHomes()) === JSON.stringify([A, B]) && acc.switchingOn() && acc.accountLabel(A) === 'account 1' && acc.accountLabel(B) === 'account 2');
  check('set: a film with no record runs on the first', acc.claudeHome('fresh-film') === A);
  await acc.setFilmHome('moved-film', B, 'sid-moved');
  check('set: a film recorded on account 2 runs there; its session is found by id', acc.claudeHome('moved-film') === B && transcriptPath(repo, 'sid-moved') === path.join(B, 'projects', slug, 'sid-moved.jsonl'));
  check('set: CLAUDE_CONFIG_DIR is the account\'s folder', acc.accountEnv({} as NodeJS.ProcessEnv, B).CLAUDE_CONFIG_DIR === B);
  process.env.HARNESS_CLAUDE_ACCOUNTS = `~/.claude, ${B}`;
  check('set: "~/" expands; ~/.claude means CLAUDE_CONFIG_DIR removed, never set to it', acc.accountHomes()[0] === plain && !('CLAUDE_CONFIG_DIR' in acc.accountEnv({ CLAUDE_CONFIG_DIR: '/x' } as unknown as NodeJS.ProcessEnv, plain)));
  writeFileSync(path.join(root, '.env.local'), `OTHER=1\nHARNESS_CLAUDE_ACCOUNTS="${B}:${A}"\nHARNESS_ACCOUNT_SWITCH_AT=0.9\n`);
  check('.env.local is read fresh and wins', acc.accountHomes()[0] === B && acc.switchAt() === 0.9);
  unlinkSync(path.join(root, '.env.local'));
  check('the switch point defaults to 0.96', acc.switchAt() === 0.96);
  process.env.HARNESS_CLAUDE_ACCOUNTS = `${A}`;
  check('a recorded account no longer in the setting: back to the first', acc.claudeHome('moved-film') === A);
  process.env.HARNESS_CLAUDE_ACCOUNTS = `${A}:${B}`;

  // ---- reading the CLI
  // a real rate_limit_event (smoke run, 21 Nov 2026, Claude Code 2.1.330), ids left out
  const real = { status: 'allowed', resetsAt: 1795267800, rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', isUsingOverage: false, unifiedWindows: { five_hour: { utilization: 0.04, resetsAt: 1795267800, status: 'allowed' }, seven_day: { utilization: 0, resetsAt: 1795780800, status: 'allowed' }, seven_day_overage_included: { utilization: 0, resetsAt: 1795780800, status: 'allowed' } } };
  const r = acc.readRateLimit(real)!;
  check('rate_limit_event: every window\'s share, not limited', r.windows.five_hour.utilization === 0.04 && r.windows.five_hour.resetsAt === 1795267800 && r.windows.seven_day.utilization === 0 && !r.limited, r);
  check('rate_limit_event: rejected means refused, with its reset', acc.readRateLimit({ status: 'rejected', resetsAt: 5, rateLimitType: 'seven_day', isUsingOverage: false })?.limited?.resetsAt === 5);
  check('rate_limit_event: rejected but paid from usage credits is not refused', !acc.readRateLimit({ status: 'rejected', resetsAt: 5, isUsingOverage: true })?.limited);
  check('rate_limit_event: an older CLI\'s single number counts', acc.readRateLimit({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.97, resetsAt: 9 })?.windows.seven_day.utilization === 0.97);
  check('rate_limit_event: a reading with every window is complete; an older CLI\'s single number is not', r.complete === true && !acc.readRateLimit({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.97, resetsAt: 9 })?.complete);
  {
    // a plan upgraded to one with no 5-hour cap: the old 5-hour window stops counting at once
    const H = path.join(root, 'upgrade-home');
    await acc.recordUsage(H, { windows: { five_hour: { utilization: 1.01, resetsAt: 4102444800, status: 'rejected' }, seven_day: { utilization: 0.4, resetsAt: 4102444800 } }, status: 'rejected', limited: { resetsAt: 4102444800, window: 'five_hour' }, complete: true });
    await acc.recordUsage(H, { windows: { seven_day: { utilization: 0, resetsAt: 4102444800, status: 'allowed' } }, status: 'allowed', complete: true });
    const u = acc.readAccountsState().accounts[H];
    check('a complete reading replaces the windows: the old 5-hour window is gone and the account is open', !u.windows.five_hour && u.windows.seven_day.utilization === 0 && !u.limited && acc.usageNow(u).utilization === 0, u);
    await acc.recordUsage(H, { windows: { seven_day: { utilization: 0.97, resetsAt: 4102444800 } }, status: 'allowed_warning' });
    await acc.recordUsage(H, { windows: { five_hour: { utilization: 0.2, resetsAt: 4102444800 } }, status: 'allowed' });
    const v = acc.readAccountsState().accounts[H];
    check('a partial reading (older CLI) still adds to the remembered windows', v.windows.seven_day.utilization === 0.97 && v.windows.five_hour.utilization === 0.2, v);
  }
  const words = "You've hit your 5-hour limit · resets 3pm";
  check('the limit words of 2.1.330 ("5-hour limit") are limit words', isUsageLimitText(words) && isUsageLimitText("You've hit your weekly limit · resets Nov 25") && !isUsageLimitText('weekly limit of 3 takes'));
  const hit = acc.limitFromAssistant({ type: 'assistant', error: 'rate_limit', api_error: 'usage_limit_reached', api_error_params: { rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 77 } }, message: { content: [{ type: 'text', text: words }] } });
  check('the CLI\'s limit message is the limit, with its reset', hit?.resetsAt === 77 && hit.window === 'five_hour' && hit.text === words, hit);
  check('a per-minute 429 on an API key is not the plan\'s limit', !acc.limitFromAssistant({ error: 'rate_limit', message: { content: [{ type: 'text', text: 'API Error: Request rejected (429) · This request would exceed your rate limit of 500,000 input tokens per minute' }] } }));
  check('the turn\'s result with the limit words is the limit', !!acc.limitFromResult({ type: 'result', is_error: true, result: words }) && !acc.limitFromResult({ type: 'result', is_error: false, result: words }));
  check('Higgsfield: needs-auth on the account shows', acc.higgsfieldState([{ name: 'higgsfield', status: 'needs-auth' }, { name: 'claude.ai Higgsfield AI', status: 'needs-auth' }]) === 'needs-auth' && acc.higgsfieldState([{ name: 'higgsfield', status: 'connected' }]) === 'connected' && acc.higgsfieldState([]) === undefined);

  // ---- the threshold decision
  const d = (utilization: number, o: Partial<{ turnRunning: boolean; subAgents: number; background: number }> = {}) => acc.earlyDecision({ utilization, threshold: 0.96, turnRunning: false, subAgents: 0, background: 0, ...o });
  check('95%: stay', d(0.95) === 'stay');
  check('96%: switch at the pause', d(0.96) === 'switch' && d(1.02) === 'switch');
  check('96% with a sub-agent running: wait', d(0.96, { subAgents: 1 }) === 'wait');
  check('96% with a background job running: wait', d(0.97, { background: 1 }) === 'wait');
  check('96% mid-turn: wait', d(0.99, { turnRunning: true }) === 'wait');

  // ---- the target choice
  const now = Date.now();
  const sec = (ms: number) => Math.round(ms / 1000);
  const acct = (u: number, resetMs = now + 3_600_000, limitedUntil?: number) => ({ at: new Date(now).toISOString(), windows: { five_hour: { utilization: u, resetsAt: sec(resetMs) } }, ...(limitedUntil ? { limited: { at: new Date(now).toISOString(), resetsAt: sec(limitedUntil) } } : {}) });
  const st = (accounts: Record<string, ReturnType<typeof acct>>) => ({ films: {}, accounts });
  const C = path.join(root, 'acct3');
  const T = (s: ReturnType<typeof st>, mode: 'early' | 'limit', homes = [A, B]) => acc.chooseTarget(A, homes, s, 0.96, now, mode);
  check('early: to account 2 when it is below the switch point', JSON.stringify(T(st({ [A]: acct(0.97), [B]: acct(0.2) }), 'early')) === JSON.stringify({ home: B }));
  check('early: nowhere when account 2 is at the switch point too', T(st({ [A]: acct(0.97), [B]: acct(0.96) }), 'early') === undefined);
  check('early: an account never seen counts as free', JSON.stringify(T(st({ [A]: acct(0.97) }), 'early')) === JSON.stringify({ home: B }));
  check('limit: account 2 at 97% but not refusing is still taken', JSON.stringify(T(st({ [A]: acct(1, now + 3_600_000, now + 3_600_000), [B]: acct(0.97) }), 'limit')) === JSON.stringify({ home: B }));
  check('limit: a refusing account is skipped for a free one', JSON.stringify(T(st({ [A]: acct(1, now + 1e6, now + 1e6), [B]: acct(1, now + 1e6, now + 1e6), [C]: acct(0.5) }), 'limit', [A, B, C])) === JSON.stringify({ home: C }));
  const both = T(st({ [A]: acct(1, now + 3_600_000, now + 3_600_000), [B]: acct(1, now + 600_000, now + 600_000) }), 'limit');
  check('both at the limit: wait for the earliest reset, there', !!both && 'waitUntil' in both && both.home === B && both.waitUntil === sec(now + 600_000) * 1000, both);
  check('a window that has reset since no longer counts', JSON.stringify(T(st({ [A]: acct(0.99), [B]: acct(0.99, now - 1000) }), 'early')) === JSON.stringify({ home: B }));
  check('after a wait: stay on the account once it is open again', JSON.stringify(acc.pickAfterWait(A, [A, B], st({ [A]: acct(1, now - 1000, now - 1000) }), 0.96, now)) === JSON.stringify({ home: A }));

  // ---- the copy plan
  const srcDir = path.join(A, 'projects', slug);
  mkdirSync(path.join(srcDir, 'plan-sid', 'subagents'), { recursive: true });
  writeFileSync(path.join(srcDir, 'plan-sid.jsonl'), 'line 1\n');
  writeFileSync(path.join(srcDir, 'plan-sid', 'subagents', 'agent-x.jsonl'), 'sub 1\n');
  writeFileSync(path.join(srcDir, 'plan-sid', 'subagents', 'agent-x.meta.json'), '{}\n');
  writeFileSync(path.join(srcDir, 'other-session.jsonl'), 'not this one\n');
  const plan1 = await acc.copyPlan(A, B, repo, 'plan-sid');
  check('copy plan: the transcript and its folder (the sub-agents) from account 1 to account 2, nothing else', !plan1.same && plan1.steps.length === 3 && plan1.steps.every((s) => s.action === 'copy' && s.to.startsWith(path.join(B, 'projects', slug))) && !plan1.steps.some((s) => s.from.includes('other-session')), plan1);
  check('copy plan: run, the copies match and keep the source times', await acc.runCopyPlan(plan1) === 3 && readFileSync(path.join(B, 'projects', slug, 'plan-sid', 'subagents', 'agent-x.jsonl'), 'utf8') === 'sub 1\n' && Math.abs(statSync(path.join(B, 'projects', slug, 'plan-sid.jsonl')).mtimeMs - statSync(path.join(srcDir, 'plan-sid.jsonl')).mtimeMs) < 1);
  check('copy plan: never moves or deletes the source', existsSync(path.join(srcDir, 'plan-sid.jsonl')) && existsSync(path.join(srcDir, 'plan-sid', 'subagents', 'agent-x.jsonl')));
  appendFileSync(path.join(B, 'projects', slug, 'plan-sid.jsonl'), 'line 2 on account 2\n');
  utimesSync(path.join(B, 'projects', slug, 'plan-sid.jsonl'), new Date(), new Date(Date.now() + 5000));
  const plan2 = await acc.copyPlan(A, B, repo, 'plan-sid');
  await acc.runCopyPlan(plan2);
  check('copy plan: a newer file on the other account is kept, never overwritten', plan2.steps.find((s) => s.from.endsWith('plan-sid.jsonl'))?.action === 'kept' && readFileSync(path.join(B, 'projects', slug, 'plan-sid.jsonl'), 'utf8').includes('line 2'), plan2);
  const back = await acc.copyPlan(B, A, repo, 'plan-sid');
  check('copy plan: moving back copies the newer transcript over the older one', back.steps.find((s) => s.from.endsWith('plan-sid.jsonl'))?.action === 'copy');
  // the user's layout: account 2's projects is a link to account 1's
  const shared = path.join(root, 'acct-shared');
  mkdirSync(shared, { recursive: true });
  symlinkSync(path.join(A, 'projects'), path.join(shared, 'projects'));
  const before = snapshot(path.join(A, 'projects'));
  const same = await acc.copyPlan(A, shared, repo, 'plan-sid');
  const n = await acc.runCopyPlan(same);
  check('same folder on disk (a linked projects): no copy and no write at all', same.same && same.steps.length === 0 && n === 0 && snapshot(path.join(A, 'projects')) === before, same);
  const linkedFile = path.join(root, 'acct-filelink');
  mkdirSync(path.join(linkedFile, 'projects', slug), { recursive: true });
  symlinkSync(path.join(srcDir, 'plan-sid.jsonl'), path.join(linkedFile, 'projects', slug, 'plan-sid.jsonl'));
  const fl = await acc.copyPlan(A, linkedFile, repo, 'plan-sid');
  await acc.runCopyPlan(fl);
  check('a file linked to the source is never copied onto itself', fl.steps.find((s) => s.from.endsWith('plan-sid.jsonl'))?.action === 'same-file' && readFileSync(path.join(srcDir, 'plan-sid.jsonl'), 'utf8') === 'line 1\n' && snapshot(path.join(A, 'projects')) === before);

  // ---- the notes and lines
  const subFile = path.join(srcDir, 'plan-sid', 'subagents', 'agent-step.jsonl');
  writeFileSync(subFile, `{"cut":"half a line from before the tail\n${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__higgsfield__jobs_wait', input: { job_ids: ['a', 'b', 'c'] } }] } })}\n${JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })}\n`);
  check('a sub-agent\'s last step from its transcript tail', await lastStepOf(subFile) === 'higgsfield · jobs_wait · waiting on 3 jobs', await lastStepOf(subFile));
  const note = acc.fallbackNote({ lines: ['Alma moved to account 2 · account 1 reached its 5-hour limit, resets 3:00 pm'], from: 'account 1', to: 'account 2', hit: { text: words, resetsAt: sec(now + 3_600_000), window: 'five_hour' }, cut: [{ title: 'Alma › previz · S3', agentId: 'acut1', lastStep: 'higgsfield · jobs_wait · waiting on 3 jobs', transcript: '/x/subagents/agent-acut1.jsonl' }] });
  check('fallback note: where she is, what was cut off, each sub-agent\'s name, last step and transcript', note.startsWith('Alma moved to account 2') && note.includes('account 1 reached its 5-hour limit') && note.includes('You now run on account 2') && note.includes('"previz · S3" (agent acut1)') && note.includes('last step "higgsfield · jobs_wait · waiting on 3 jobs"') && note.includes('transcript /x/subagents/agent-acut1.jsonl'), note);
  check('fallback note: continue or restart only what was cut off, never resubmit a paid job already recorded', note.includes('continue or restart only what was cut off') && note.includes('do not resubmit a paid job whose id is already in the film\'s records'));
  check('fallback note: with nothing running it says so', acc.fallbackNote({ lines: [], from: 'account 1', to: 'account 2', hit: {}, cut: [] }).includes('No sub-agent was running.'));
  check('fallback note: background shell jobs stopped with it are named', acc.fallbackNote({ lines: [], from: 'account 1', to: 'account 2', hit: {}, cut: [], background: 1 }).includes('One background job (a shell command such as a render) was stopped too'));
  check('the lines', acc.movedEarlyLine('account 2', 'account 1', 0.96, sec(now + 3_600_000)).startsWith('Alma moved to account 2 · account 1 at 96%, resets ') && acc.bothAtLimitLine(now + 600_000).startsWith('Both accounts are at their limit; Alma resumes at ') && /\d{1,2}:\d{2} [ap]m$/.test(acc.formatReset(sec(now + 600_000))));
  check('the limit offer ends once Alma moved', lastTurnHitLimit([{ kind: 'user', text: 'go' }, { kind: 'assistant_text', text: words }]) && !lastTurnHitLimit([{ kind: 'user', text: 'go' }, { kind: 'assistant_text', text: words }, { kind: 'system', text: 'Alma moved to account 2 · account 1 reached its 5-hour limit' }]) && lastTurnHitLimit([{ kind: 'assistant_text', text: words }, { kind: 'system', text: acc.bothAtLimitLine(now) }]));

  // ---- a film's Alma: the early switch at a pause
  const film = 'acct-film';
  const alma = getAlma(film, { cwd: repo });
  const moved = () => alma.liveEvents().filter((e) => e.kind === 'system' && /^(Alma moved|Alma resumes|Both accounts)/.test(e.text)).map((e) => (e.kind === 'system' ? e.text : ''));
  await alma.send('hello');
  check('first start: on account 1, its folder as CLAUDE_CONFIG_DIR', await until(() => lines().length === 1) && starts()[0].configDir === A && !starts()[0].resume);
  await until(() => !alma.busy);
  await alma.send('#use:0.95');
  await until(() => !alma.busy);
  await sleep(150);
  check('95%: no move, the same process', alma.alive && moved().length === 0 && starts().length === 1);
  await alma.send('#use:0.96 #agent');
  await until(() => !alma.busy);
  await sleep(150);
  check('96% with a sub-agent running: she waits, nothing is cut off', alma.alive && moved().length === 0 && alma.runningTasks().length === 1, { moved: moved(), running: alma.runningTasks().length });
  check('the sub-agent ended: Alma moved at that pause', await until(() => moved().length === 1 && !alma.alive), moved());
  check('the line: "Alma moved to account 2 · account 1 at 96%, resets …"', /^Alma moved to account 2 · account 1 at 96%, resets \S/.test(moved()[0]), moved());
  const ev = alma.liveEvents();
  const doneAt = ev.findIndex((e) => e.kind === 'task' && e.task.state === 'done');
  check('the move came after the sub-agent ended', doneAt >= 0 && doneAt < ev.findIndex((e) => e.kind === 'system' && e.text === moved()[0]));
  check('the film is recorded on account 2 in harness/alma-accounts.json, with account 1 at 96%', await until(() => { try { const j = JSON.parse(readFileSync(path.join(root, 'harness', 'alma-accounts.json'), 'utf8')); return j.films[film]?.home === B && j.accounts[A]?.windows?.five_hour?.utilization === 0.96; } catch { return false; } }));
  check('the transcript and the sub-agent\'s were copied to account 2', readFileSync(path.join(B, 'projects', slug, `${SID}.jsonl`), 'utf8') === readFileSync(path.join(A, 'projects', slug, `${SID}.jsonl`), 'utf8') && existsSync(path.join(B, 'projects', slug, SID, 'subagents', 'agent-abg1.jsonl')));
  await alma.send('after the move');
  check('the next message resumes the same session on account 2', await until(() => starts().length === 2) && starts()[1].configDir === B && starts()[1].resume === SID, starts()[1]);
  check('she is told with that message', await until(() => lines().length === 4) && lines()[3].text!.startsWith('<harness-note>Alma moved to account 2 · account 1 at 96%') && lines()[3].text!.endsWith('after the move'), lines()[3]);
  check('Higgsfield not connected on account 2: the thread says so', await until(() => alma.liveEvents().some((e) => e.kind === 'system' && e.text.startsWith('Higgsfield is not connected on account 2 (needs-auth)'))));
  await until(() => !alma.busy);
  await alma.send('#use:0.97');
  await until(() => !alma.busy);
  await sleep(150);
  check('account 2 at 97%, account 1 known at 96%: no move back', alma.alive && moved().length === 1 && starts().length === 2);

  // ---- the fallback: the limit cuts a turn off mid-way, a message waits behind it
  const resetB = Math.ceil(Date.now() / 1000) + 6;
  await alma.send(`#limit:${resetB}`);
  await alma.send('sent while the limit hits');
  check('the limit hit: Alma moved to account 1 (at 96%, not refusing)', await until(() => moved().length === 2), moved());
  check('the line: "Alma moved to account 1 · account 2 reached its 5-hour limit, resets …"', /^Alma moved to account 1 · account 2 reached its 5-hour limit, resets \S/.test(moved()[1]), moved());
  check('resumed on account 1, same session', await until(() => starts().length === 3) && starts()[2].configDir === A && starts()[2].resume === SID, starts()[2]);
  check('resumed with the note first, then the waiting message (not lost)', await until(() => lines().length === 8), lines().slice(5));
  const resumeText = lines()[6].text!;
  check('the note: cut off, the sub-agent, its last step, its transcript on account 1; no user words', resumeText.startsWith('<harness-note>Alma moved to account 1 · account 2 reached its 5-hour limit') && resumeText.includes('"previz · S3" (agent acut1)') && resumeText.includes('higgsfield · jobs_wait · waiting on 3 jobs') && resumeText.includes(path.join(A, 'projects', slug, SID, 'subagents', 'agent-acut1.jsonl')) && resumeText.trimEnd().endsWith('</harness-note>'), resumeText);
  check('the interrupted sub-agent\'s transcript is on account 1', existsSync(path.join(A, 'projects', slug, SID, 'subagents', 'agent-acut1.jsonl')));
  check('the waiting message went next', lines()[7].text === 'sent while the limit hits' && lines()[7].configDir === A, lines()[7]);
  check('its card says it was cut off', alma.findTask('toolu_cut1')?.card.state === 'failed' && alma.findTask('toolu_cut1')?.card.liveLine === 'cut off by the account limit');
  check('no "Alma stopped" error for the planned stop', !alma.liveEvents().some((e) => e.kind === 'error' && e.text.startsWith('Alma stopped')));
  check('the reserve offer is not shown once she moved', !lastTurnHitLimit(alma.liveEvents()));
  await until(() => !alma.busy);

  // ---- both at the limit: wait for the earliest reset (account 2's), once
  await alma.send(`#limit:${Math.ceil(Date.now() / 1000) + 3600}`);
  check('both at the limit: the line says when she resumes', await until(() => moved().length === 3) && moved()[2].startsWith('Both accounts are at their limit; Alma resumes at '), moved());
  const startsWaiting = starts().length;
  await alma.send('sent while both are at their limit');
  await sleep(400);
  check('while waiting nothing starts and the message waits; she does not read as working', starts().length === startsWaiting && !alma.alive && !alma.busy);
  check('at account 2\'s reset: she resumes there', await until(() => moved().length === 4, 12000) && moved()[3] === 'Alma resumes on account 2 · its limit has reset', moved());
  check('resumed on account 2, same session, once', await until(() => starts().length === startsWaiting + 1) && starts()[startsWaiting].configDir === B && starts()[startsWaiting].resume === SID);
  check('the note holds both lines, then the waiting message', await until(() => lines().length === 11) && lines()[9].text!.startsWith('<harness-note>Both accounts are at their limit; Alma resumes at ') && lines()[9].text!.includes('\nAlma resumes on account 2 · its limit has reset\n') && lines()[10].text === 'sent while both are at their limit', lines().slice(8));
  await sleep(800);
  check('no loop: one start after the wait', starts().length === startsWaiting + 1);
  await until(() => !alma.busy);

  // ---- the history: the account lines come back from the transcript, the harness's own messages are not the user's
  const h = await readHistory(repo, SID, acc.claudeHome(film));
  const sys = h.events.filter((e) => e.kind === 'system').map((e) => (e.kind === 'system' ? e.text : ''));
  check('history: every account line, once', ['Alma moved to account 2', 'Alma moved to account 1', 'Both accounts are at their limit', 'Alma resumes on account 2'].every((p) => sys.filter((t) => t.startsWith(p)).length === 1), sys);
  const users = h.events.filter((e) => e.kind === 'user').map((e) => (e.kind === 'user' ? e.text : ''));
  check('history: the user\'s words only, no note, no empty message', users.includes('after the move') && users.includes('sent while the limit hits') && !users.some((t) => !t.trim() || t.includes('harness-note')), users);
  const merged = mergeEvents(h.events, alma.liveEvents());
  check('history and live lines merge into one each', merged.filter((e) => e.kind === 'system' && e.text.startsWith('Alma moved to account 2')).length === 1);
  stopOwnAlmas();

  // ---- a move that fails (the other account's projects is a file): a line says so, and she does not restart herself
  const A2 = path.join(root, 'acct-fresh');
  const X = path.join(root, 'acct-broken');
  mkdirSync(X, { recursive: true });
  writeFileSync(path.join(X, 'projects'), 'not a folder\n');
  process.env.HARNESS_CLAUDE_ACCOUNTS = `${A2}:${X}`;
  const broken = getAlma('broken-film', { cwd: repo });
  await broken.send('hello');
  await until(() => !broken.busy);
  const startsBroken = starts().length;
  await broken.send(`#limit:${Math.ceil(Date.now() / 1000) + 3600}`);
  check('a failed move: the thread says why and that she stays', await until(() => broken.liveEvents().some((e) => e.kind === 'error' && /^Alma could not move to account 2 \(.+\); she stays on account 1$/.test(e.text))), broken.liveEvents().filter((e) => e.kind === 'error'));
  await sleep(800);
  check('a failed move: no restart by herself, no loop', starts().length === startsBroken && !broken.alive && !broken.liveEvents().some((e) => e.kind === 'system' && /^Alma moved/.test(e.text)));
  stopOwnAlmas();

  // ---- the setting unset: no switch, as before
  delete process.env.HARNESS_CLAUDE_ACCOUNTS;
  const before2 = starts().length;
  const plainAlma = getAlma('plain-film', { cwd: repo });
  await plainAlma.send(`#limit:${Math.ceil(Date.now() / 1000) + 3600}`);
  await until(() => !plainAlma.busy);
  await sleep(300);
  check('unset: no CLAUDE_CONFIG_DIR given, the limit words shown, no move, the process stays', starts()[before2]?.configDir === null && plainAlma.alive && plainAlma.liveEvents().some((e) => e.kind === 'error' && isUsageLimitText(e.text)) && !plainAlma.liveEvents().some((e) => e.kind === 'system' && /^Alma moved/.test(e.text)));
  stopOwnAlmas();
  console.log(`\n${checks} checks passed`);
}

main()
  .catch((e: unknown) => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode = 1; })
  .finally(() => {
    try { (globalThis as unknown as { __almaSessions?: Map<string, { stopNow(): void }> }).__almaSessions?.forEach((a) => a.stopNow()); } catch { /* none */ }
    setTimeout(() => { rmSync(root, { recursive: true, force: true }); process.exit(process.exitCode ?? 0); }, 300);
  });
