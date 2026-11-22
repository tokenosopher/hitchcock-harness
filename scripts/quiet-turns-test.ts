// npm run quiet-turns:test
// A turn Alma starts on her own schedule that changed nothing is not shown in the chat
// (src/server/claude/quietTurns.ts, transcript.ts, process.ts, thread.ts). Checks: which tool calls only look (the Bash
// reader included, with the commands of a real film's watchdog turns); the transcript reader over a temp JSONL with quiet and
// busy scheduled turns beside sdk, task_notification and peer turns (left alone), and a scheduled turn that spans two
// reads; then a film's Alma through a stand-in CLI that runs scheduled turns by itself: a quiet one leaves the live events
// with one `hide` event and stays out of GET, a busy one stays, the transcript a moment behind the stream, a turn still
// running shows until its result. In a temp folder (deleted after); never a real Alma, account folder or film.
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ThreadEvent } from '../src/server/types';

const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'quiet-turns-test-')));
const repo = path.join(root, 'repo');
const bin = path.join(root, 'claude-standin.mjs');
mkdirSync(repo, { recursive: true });
process.chdir(root);
process.env.HOME = root; // ~/.claude is root/.claude: no real account folder is ever read
for (const k of ['CLAUDE_CONFIG_DIR', 'HARNESS_CLAUDE_ACCOUNTS', 'HARNESS_ACCOUNT_SWITCH_AT', 'HARNESS_ALMA_DRYRUN', 'HARNESS_ALMA_ADD_DIRS', 'HARNESS_RESERVE_API_KEY', 'MOCK']) delete process.env[k];
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_CLAUDE_BIN = bin;

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

// The stand-in: answers each message (an sdk turn), then runs a turn of its own as the CLI's ScheduleWakeup would, its
// lines written to the transcript as the real CLI writes them. The message's words pick that turn.
writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
const sid = process.argv.includes('--resume') ? process.argv[process.argv.indexOf('--resume') + 1] : 'sid-quiet-live';
const dir = path.join(process.env.HOME, '.claude', 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'));
mkdirSync(dir, { recursive: true });
const file = path.join(dir, sid + '.jsonl');
let n = 0;
const rec = (o) => appendFileSync(file, JSON.stringify({ isSidechain: false, sessionId: sid, uuid: 'L' + (++n), timestamp: new Date().toISOString(), ...o }) + '\\n');
const out = (o) => process.stdout.write(JSON.stringify({ session_id: sid, ...o }) + '\\n');
const init = () => out({ type: 'system', subtype: 'init', model: 'stand-in', tools: [], mcp_servers: [] });
const say = (mid, text, late = 0) => {
  const m = { id: mid, role: 'assistant', content: [{ type: 'text', text }] };
  if (late) setTimeout(() => rec({ type: 'assistant', message: m }), late); else rec({ type: 'assistant', message: m });
  out({ type: 'assistant', parent_tool_use_id: null, message: m });
};
const bash = (id, command) => {
  const m = { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] };
  rec({ type: 'assistant', message: m });
  out({ type: 'assistant', parent_tool_use_id: null, message: m });
  const r = { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'done' }] };
  rec({ type: 'user', message: r });
  out({ type: 'user', parent_tool_use_id: null, message: r });
};
const result = (uuid) => out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, total_cost_usd: 0, uuid });
const own = (origin, text) => rec({ type: 'user', isMeta: origin === 'scheduled' || undefined, turnOrigin: origin, promptSource: 'system', ...(origin === 'scheduled' ? { wakeupSource: 'schedule_wakeup' } : {}), message: { role: 'user', content: text } });
const rl = createInterface({ input: process.stdin });
rl.on('close', () => process.exit(0));
rl.on('line', (l) => {
  const msg = JSON.parse(l);
  const text = msg.message?.content?.[0]?.text ?? '';
  const tag = (/#(\\w+)/.exec(text) || [])[1] || 'x';
  rec({ type: 'user', uuid: msg.uuid, turnOrigin: 'sdk', promptSource: 'sdk', message: { role: 'user', content: text } });
  init();
  say('msg_ans_' + tag, 'On it (' + tag + ').');
  result('res_ans_' + tag);
  setTimeout(() => {
    if (tag === 'note') { own('task_notification', '<task-notification><task-id>t1</task-id><status>completed</status></task-notification>'); init(); say('msg_s_' + tag, 'The job finished; nothing else to do.'); return result('res_s_' + tag); }
    own('scheduled', 'Watchdog for the film (not a message from the user).');
    init();
    if (tag === 'quiet') { say('msg_s_' + tag, 'Still waiting on your cards.'); return result('res_s_' + tag); }
    if (tag === 'look') { bash('toolu_look', 'cd "/films/x" && find generations/S3 -type f -mmin -20 2>/dev/null | wc -l; date'); say('msg_s_' + tag, 'The S3 job is still running; nothing is stuck.'); return result('res_s_' + tag); }
    if (tag === 'busy') { bash('toolu_busy', "echo 'u' > /tmp/dpsc/tap.url"); say('msg_s_' + tag, 'I saved the link.'); return result('res_s_' + tag); }
    if (tag === 'slow') { say('msg_s_' + tag, 'Still waiting (slow transcript).', 700); return result('res_s_' + tag); }
    if (tag === 'silent') { say('msg_s_' + tag, 'No response requested.'); return result('res_s_' + tag); }
    if (tag === 'hold') { say('msg_s_' + tag, 'Still waiting (held).'); return setTimeout(() => result('res_s_' + tag), 900); }
  }, 60);
});
setInterval(() => {}, 60000);
`);
chmodSync(bin, 0o755);

async function main(): Promise<void> {
  const { bashOnlyLooks, changesNothing, codeOnlyLooks } = await import('../src/server/claude/quietTurns');

  // ---- which tool calls only look
  for (const t of ['Read', 'Grep', 'Glob', 'LS', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput', 'ToolSearch']) check(`looks: ${t}`, changesNothing(t, {}));
  for (const t of ['Agent', 'Task', 'Write', 'Edit', 'NotebookEdit', 'mcp__higgsfield__jobs_wait', 'SendMessage', 'CronCreate', 'ScheduleWakeup', 'TaskStop', 'WebFetch', 'Skill']) check(`changes: ${t}`, !changesNothing(t, {}));
  check('changes: a Bash left running in the background', !changesNothing('Bash', { command: 'ls', run_in_background: true }));
  check('changes: a Bash without a command', !changesNothing('Bash', {}));

  const looks = [
    // Maren' watchdog turns, 21 Nov 2026
    'ls -lt "/path/to/hitchcock-harness/studio/assets/films/the-lighthouse/generations/S4/takes/take1/" | head -4; date',
    'cd "/path/to/hitchcock-harness/studio/assets/films/the-lighthouse" && for d in generations/FIX-S1-sit previz/FIX-S1-sit; do printf "%s: " $d; find $d -type f -newermt "-20 minutes" 2>/dev/null | wc -l; done; date',
    'cd "/x" && for n in FIX-S1-sit FIX-S3-bench; do printf "%s: " $n; find generations/$n previz/$n -type f -mmin -20 2>/dev/null | grep -ic "$n\\|fix-s" ; done; date',
    'cd "/x" && find generations/FIX-S3-bench previz/FIX-S3-bench -type f -mmin -20 2>/dev/null | wc -l; date',
    'cd "/x" && find a b -newer qc/r2.json -type f 2>/dev/null | head; ls -l qc/r2.json; date; ls -lt /tmp | head -5',
    'cd "/x/generations" && for g in A B; do echo "$g: $(find $g/takes/take1 -type f -mmin -20 | wc -l) files in 20 min; findings: $(ls $g/takes/take1/*findings* 2>/dev/null)"; done',
    'cd "/x" && ls -la generations/FIX-S4-tap previz/FIX-S4-tap 2>&1 | head; date',
    'cd "/x" && /usr/bin/python3 -c "\nimport json;d=json.load(open(\'review/cards.json\'))\nfor s in d[\'sections\']:\n  for c in s.get(\'cards\',[]):\n    if c.get(\'ask\') and \'answer\' not in c: print(c.get(\'id\'),c.get(\'ask\'))"',
    'cd "/x" && /usr/bin/python3 -c "\nimport json;d=json.load(open(\'review/cards.json\'))\nprint([c.get(\'id\') for s in d[\'sections\'] for c in s.get(\'cards\',[]) if c.get(\'ask\') and \'answer\' not in c])"',
    // more that only look
    'git status --short && git log --oneline -3 && git diff --stat',
    'echo "a > b" | grep ">"',
    "awk '{print $1}' file | sort | uniq -c | sort -rn | head",
    'cat <<\'EOF\'\nhello > world\nEOF',
    "/usr/bin/python3 - <<'EOF'\nimport json\nd = json.load(open('review/cards.json'))\nprint(len(d['sections']))\nEOF",
    "PYTHONDONTWRITEBYTECODE=1 python3 -I -c 'from PIL import Image; print(Image.open(p).size)'",
    "node -e 'const d=JSON.parse(require(\"fs\").readFileSync(\"x.json\",\"utf8\")); console.log(d.a)'",
    "perl -e 'alarm 20; exec @ARGV' ls -la /tmp",
    'ffprobe -v error -show_entries format=duration -of csv=p=0 a.mp4 2>&1',
    'find . -name "*.json" -exec cat {} \\; | head',
    'wc -l < cards.json >&2',
    'sed -n "1,20p" script.md',
  ];
  for (const c of looks) check(`only looks: ${c.replace(/\n/g, '⏎').slice(0, 90)}`, bashOnlyLooks(c));

  const writes = [
    // Maren: the card writes and the landing turns
    "cd \"/x\" && /usr/bin/python3 - <<'EOF'\nimport json,datetime\np=\"review/cards.json\"; d=json.load(open(p))\njson.dump(d,open(p,\"w\"),indent=2)\nEOF",
    "cd \"/x\" && ls previz/ | grep page; /usr/bin/python3 - <<'EOF'\np='locations/views.md'; t=open(p).read()\nopen(p,'w').write(t)\nEOF",
    "cd \"/x\" && echo 'https://example/x.mp4' > /tmp/dpsc/tap-t5.url && PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tools/film/land.py \"$PWD\" --take 5 2>&1 | tail -2",
    'cd /tmp/dpsc && sed -e "s/take4/take5/g" a.txt > b.txt && cat >> b.txt <<\'EOF\'\nmore\nEOF',
    // write signs
    'echo hi >> log.txt', 'ls | tee out.txt', 'rm -rf /tmp/x', 'mv a b', 'cp a b', 'mkdir -p x', 'touch x', 'ln -s a b', 'chmod +x a',
    "sed -i '' 's/a/b/' f", 'sed -i.bak s/a/b/ f', 'curl -s https://x', 'wget x', 'ffmpeg -i a.mp4 b.mp4', 'git commit -m x', 'git checkout main', 'git branch new',
    'python3 tools/x.py', 'node x.js', 'bash x.sh', './run', 'tools/review/build.py', 'find . -name x -delete', 'find . -exec rm {} \\;', 'ls | xargs rm',
    "awk '{print > \"out\"}' f", 'sort -o out.txt in.txt', 'ls > /tmp/list', 'date &> out.log', 'ls 1> out', 'cat a >| b', 'diff a b > >(tee d)',
    'echo "$(rm -rf x)"', 'ls `rm x`', 'cat <<EOF\n$(touch x)\nEOF', "python3 -c \"open('a','w').write('x')\"", "python3 -c \"from pathlib import Path; Path('a').write_text('x')\"",
    "python3 -c \"import os; os.remove('a')\"", "python3 -c \"import shutil; shutil.copy('a','b')\"", "python3 -c \"import subprocess; subprocess.run(['ls'])\"",
    "python3 -c \"f=open('a', mode='a')\"", "python3 -c \"f=open('a', m)\"", "python3 -c \"Image.open(p).save('b.png')\"", 'python3 -m http.server',
    "node -e 'require(\"fs\").writeFileSync(\"a\",\"b\")'", 'echo "unclosed', 'bash -c "rm x"', "perl -e 'unlink q(x)'", 'osascript -e "beep"', 'open x.mp4', 'kill 123',
    'cat x.py | python3', 'X=$(curl -s y) && echo $X', 'npx tsx scripts/x.ts', 'sqlite3 db "delete from t"',
  ];
  for (const c of writes) check(`changes: ${c.replace(/\n/g, '⏎').slice(0, 90)}`, !bashOnlyLooks(c));
  check('python: sys.stdout.write is output, not a file', codeOnlyLooks('import sys; sys.stdout.write("x")', 'python'));
  check('python: json.dumps (to a string) only looks', codeOnlyLooks('import json; print(json.dumps({}))', 'python'));
  check('python: write_bytes is a write', !codeOnlyLooks('p.write_bytes(b"")', 'python'));

  // ---- the transcript reader
  const { readHistory, transcriptPath } = await import('../src/server/claude/transcript');
  const SID = 'sid-quiet-reader';
  const cwd = '/tmp/quiet-turns-test-film-repo';
  const file = transcriptPath(cwd, SID);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
  let n = 0;
  let clock = Date.parse('2026-11-21T20:00:00.000Z');
  const line = (o: Record<string, unknown>) => appendFileSync(file, JSON.stringify({ isSidechain: false, sessionId: SID, uuid: `u${++n}`, timestamp: new Date(clock += 1000).toISOString(), ...o }) + '\n');
  const started = (origin: string, text = 'x') => line({ type: 'user', turnOrigin: origin, promptSource: origin === 'sdk' ? 'sdk' : 'system', isMeta: origin === 'scheduled' || origin === 'peer' ? true : undefined, ...(origin === 'scheduled' ? { wakeupSource: 'schedule_wakeup' } : {}), message: { role: 'user', content: text } });
  const said = (mid: string, text: string) => line({ type: 'assistant', message: { id: mid, role: 'assistant', content: [{ type: 'text', text }] } });
  const used = (id: string, name: string, input: Record<string, unknown>) => {
    line({ type: 'assistant', message: { id: `msg_${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, toolUseResult: {} });
  };
  started('sdk', 'Hello Alma');
  said('m_sdk', 'Hello.');
  started('scheduled');
  said('m_q1', 'Still waiting on your cards.');
  started('scheduled');
  used('t_look', 'Bash', { command: 'cd "/x" && find generations/S3 -type f -mmin -20 2>/dev/null | wc -l; date' });
  used('t_read', 'Read', { file_path: '/x/review/cards.json' });
  said('m_q2', 'The S3 job is still running; nothing is stuck.');
  started('scheduled');
  // a meta line inside the turn (a reminder) is not a new turn
  line({ type: 'user', isMeta: true, message: { role: 'user', content: '<system-reminder>x</system-reminder>' } });
  used('t_card', 'Bash', { command: "cd \"/x\" && /usr/bin/python3 - <<'EOF'\nimport json\nd=json.load(open('review/cards.json'))\njson.dump(d,open('review/cards.json','w'))\nEOF" });
  said('m_b1', "I've added a card for picking one of the four long laughs.");
  started('scheduled');
  used('t_wait', 'mcp__higgsfield__jobs_wait', { jobs: [] });
  said('m_b2', 'Tap take 5 has landed.');
  started('scheduled');
  used('t_agent', 'Agent', { description: 'upload · S1', run_in_background: true, prompt: '…' });
  said('m_b3', "I've started uploading.");
  started('scheduled');
  // the user's message, sent while Alma was busy, delivered into this turn: it shows
  line({ type: 'attachment', attachment: { type: 'queued_command', commandMode: 'prompt', prompt: [{ type: 'text', text: 'what now?' }] } });
  said('m_b4', 'Nothing is stuck; your cards wait.');
  started('task_notification', '<task-notification><task-id>a1</task-id><tool-use-id>t_agent</tool-use-id><status>completed</status><summary>done</summary></task-notification>');
  said('m_tn', 'The upload finished.');
  started('peer', '<cross-session-message from="x">hi</cross-session-message>');
  said('m_peer', 'Noted.');
  started('sdk', 'Thanks');
  said('m_sdk2', 'You are welcome.');
  started('scheduled');
  // a task notification queued while the scheduled turn runs is not a message for her: still quiet
  line({ type: 'attachment', attachment: { type: 'queued_command', commandMode: 'task-notification', prompt: '<task-notification><task-id>a9</task-id><status>completed</status></task-notification>' } });
  said('m_q3', 'Still waiting on your cards.');

  let h = await readHistory(cwd, SID);
  const hidden = [...h.hidden].sort();
  check('reader: the closed quiet scheduled turns are hidden, their tool lines and results too', JSON.stringify(hidden) === JSON.stringify(['m_q1:t1', 'm_q2:t1', 'result:t_look', 'result:t_read', 't_look', 't_read']), hidden);
  check('reader: six scheduled turns closed, two quiet', h.scheduled.length === 6 && h.scheduled.filter((t) => t.quiet).length === 2, h.scheduled.map((t) => [t.quiet, t.last]));
  check('reader: a card written, a job waited on, a sub-agent started, a message delivered: each shows', ['m_b1:t1', 'm_b2:t1', 'm_b3:t1', 'm_b4:t1', 't_card', 't_wait'].every((id) => !h.hidden.has(id)));
  check('reader: sdk, task_notification and peer turns are left alone', ['m_sdk:t1', 'm_tn:t1', 'm_peer:t1', 'm_sdk2:t1'].every((id) => !h.hidden.has(id)));
  check('reader: the events themselves are all still read (only the display drops them)', ['m_q1:t1', 'm_q2:t1', 't_look'].every((id) => h.events.some((e) => e.id === id)));
  check('reader: the user\'s messages and the sub-agent\'s card are never hidden', h.events.filter((e) => e.kind === 'user' || e.kind === 'task').every((e) => !h.hidden.has(e.id)));
  check('reader: the last turn is open, scheduled and quiet so far', h.open?.origin === 'scheduled' && h.open.quiet && JSON.stringify(h.open.ids) === '["m_q3:t1"]', h.open);

  // a scheduled turn that spans two reads: quiet at the first, a write in the second
  started('scheduled');
  said('m_span', 'Checking the cards.');
  h = await readHistory(cwd, SID);
  check('two reads: after the first, the open turn is quiet and the one before it closed as hidden', h.open?.quiet === true && h.hidden.has('m_q3:t1') && !h.hidden.has('m_span:t1'), h.open);
  used('t_span', 'Bash', { command: 'echo done > /tmp/dpsc/flag' });
  h = await readHistory(cwd, SID);
  check('two reads: the write in the second read makes the same turn busy', h.open?.quiet === false && JSON.stringify(h.open.ids) === '["m_span:t1","t_span","result:t_span"]', h.open);
  started('sdk', 'next');
  h = await readHistory(cwd, SID);
  check('two reads: closed busy, it is not hidden', !h.hidden.has('m_span:t1') && !h.hidden.has('t_span') && h.open?.origin === 'sdk', [...h.hidden]);
  // and one quiet across the two reads, its looking tool in the second
  started('scheduled');
  said('m_span2', 'Looking.');
  h = await readHistory(cwd, SID);
  used('t_span2', 'Grep', { pattern: 'x' });
  said('m_span2b', 'Still waiting.');
  started('task_notification', '<task-notification><task-id>a2</task-id><status>completed</status></task-notification>');
  h = await readHistory(cwd, SID);
  check('two reads: a quiet one closed in the second read is hidden whole', ['m_span2:t1', 't_span2', 'result:t_span2', 'm_span2b:t1'].every((id) => h.hidden.has(id)), [...h.hidden]);

  // ---- live: a film's Alma through the stand-in
  const { getAlma, stopOwnAlmas } = await import('../src/server/claude/process');
  const { threadHistory } = await import('../src/server/claude/thread');
  const film = 'quiet-film';
  const alma = getAlma(film, { cwd: repo });
  const live = () => alma.liveEvents();
  const has = (evs: ThreadEvent[], id: string) => evs.some((e) => e.id === id);
  const results = () => live().filter((e) => e.kind === 'result').length;
  try {
    await alma.send('#quiet');
    check('live: the quiet scheduled turn is hidden when it ends (one hide event)', await until(() => live().some((e) => e.kind === 'hide')), live());
    const hide = live().find((e): e is Extract<ThreadEvent, { kind: 'hide' }> => e.kind === 'hide')!;
    check('live: the hide names its reply and its result', hide.ids.includes('msg_s_quiet:t1') && hide.ids.includes('res_s_quiet'), hide);
    check('live: its reply and result are gone from the replay; the answer to the message stays', !has(live(), 'msg_s_quiet:t1') && !has(live(), 'res_s_quiet') && has(live(), 'msg_ans_quiet:t1') && has(live(), 'res_ans_quiet'), live().map((e) => e.id));
    let got = (await threadHistory(film)).events;
    check('GET: the quiet turn is not there; the user\'s message and her answer are', !has(got, 'msg_s_quiet:t1') && !has(got, 'res_s_quiet') && has(got, 'msg_ans_quiet:t1') && got.some((e) => e.kind === 'user'), got.map((e) => e.id));

    await alma.send('#look');
    check('live: a scheduled turn that only looked (find | wc -l) is hidden with its tool lines', await until(() => !has(live(), 'msg_s_look:t1') && results() >= 2 && live().filter((e) => e.kind === 'hide').length === 2), live().map((e) => e.id));
    check('live: its Bash line and result went with it', !has(live(), 'toolu_look') && !has(live(), 'result:toolu_look'));

    await alma.send('#busy');
    await until(() => has(live(), 'res_s_busy'));
    await sleep(1200);
    check('live: a scheduled turn that wrote a file stays, tool lines and all', has(live(), 'msg_s_busy:t1') && has(live(), 'toolu_busy') && has(live(), 'res_s_busy'), live().map((e) => e.id));
    got = (await threadHistory(film)).events;
    check('GET: the busy scheduled turn shows', has(got, 'msg_s_busy:t1') && has(got, 'toolu_busy'));

    await alma.send('#note');
    await until(() => has(live(), 'res_s_note'));
    await sleep(1200);
    check('live: a task_notification turn with no tools is left alone', has(live(), 'msg_s_note:t1') && has(live(), 'res_s_note'));

    await alma.send('#slow');
    check('live: the transcript a moment behind the stream: hidden once it catches up', await until(() => !has(live(), 'msg_s_slow:t1') && has(live(), 'res_ans_slow') && !has(live(), 'res_s_slow')), live().map((e) => e.id));

    await alma.send('#silent');
    check('live: a quiet turn whose reply is the CLI\'s "No response requested." (not in the transcript) is hidden too', await until(() => has(live(), 'res_ans_silent') && !has(live(), 'msg_s_silent:t1') && !has(live(), 'res_s_silent')), live().map((e) => e.id));

    await alma.send('#hold');
    await until(() => has(live(), 'msg_s_hold:t1'));
    check('mid-turn: the stream is inside the scheduled turn', alma.midTurn);
    got = (await threadHistory(film)).events;
    check('GET mid-turn: the running scheduled turn shows until it ends', has(got, 'msg_s_hold:t1'), got.map((e) => e.id));
    check('live: once it ends it is hidden', await until(() => !has(live(), 'msg_s_hold:t1') && !alma.midTurn), live().map((e) => e.id));
    got = (await threadHistory(film)).events;
    check('GET after: it is gone, and never comes back on a later read', !has(got, 'msg_s_hold:t1') && !has(got, 'res_s_hold') && !has((await threadHistory(film)).events, 'msg_s_hold:t1'));
    check('GET: the user\'s messages are all there (seven)', got.filter((e) => e.kind === 'user').length === 7, got.filter((e) => e.kind === 'user').length);
  } finally {
    stopOwnAlmas();
  }
  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, (e: unknown) => {
  console.error(e);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
