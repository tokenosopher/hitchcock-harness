// npm run resumed:test
// A resumed sub-agent runs again on its card (src/server/claude/tasks.ts, stream.ts, transcript.ts).
// Alma woke the finished "previz · S1-S2 lamp room" with SendMessage; the app showed NOTHING RUNNING while it worked.
// Fed with the event shapes of a real session transcript (names made up here): the Agent launch and its
// async result, the task_notification, SendMessage's "Resuming agent" result, the notification of the resumed run (its
// tool-use-id is the SendMessage's), a message queued to a running agent, a message to another session. Checks the
// live stream (StreamParser) and the transcript read back (readHistory, in a temp HOME, deleted after) give the same cards.
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(os.tmpdir(), 'resumed-test-'));
process.env.HOME = root; // the transcript reader looks under ~/.claude/projects
// …and nowhere else: not under the caller's own account folder (a Claude Code session on account 2 sets
// CLAUDE_CONFIG_DIR), nor under the accounts a real .env.local lists (it is read from the working folder)
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.HARNESS_CLAUDE_ACCOUNTS;
process.chdir(root);

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 600)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}

const SID = 'sess-resumed-test';
const AGENT = 'a02b0a936578dac5e';
const LAUNCH = 'toolu_01Uidxe11VAZpaes9r3fMwRJ';
const SEND = 'toolu_01KLjtDNerJFDiPQf4od8Xnn';
const QUEUED = 'toolu_01CBwD48F9rpTERoKtUKLNZv';
const TITLE = 'previz · S1-S2 lamp room';

const launchResult = {
  text: `Async agent launched successfully. (This tool result is internal metadata.)\nagentId: ${AGENT} (internal ID - do not mention to user. Use SendMessage with to: '${AGENT}', summary: '<5-10 words>')`,
  tur: { isAsync: true, status: 'async_launched', agentId: AGENT, description: TITLE },
};
const resumeTur = (agent: string) => ({ success: true, message: `Resuming agent ${agent.slice(0, 7)}`, resumedAgentId: agent, revivedAgentId: agent, pin: { id: agent, name: agent, ref: '882943' } });
const queuedTur = { success: true, message: `Message queued for delivery to ${AGENT} at its next tool round. If it finishes first, it is resumed with the message and notifies again, so wait for that notification before resending.`, pin: { id: AGENT, name: AGENT, ref: '882943' } };
const otherSessionTur = { success: true, message: '“S3 QC round 1 relayed” → Alma · the-lighthouse (another Claude session on this machine; in that session\'s inbox, not yet read by its Claude)' };
const notification = (agent: string, toolUseId: string, tools: number, title = TITLE) => `<task-notification>
<task-id>${agent}</task-id>
<tool-use-id>${toolUseId}</tool-use-id>
<output-file>/private/tmp/x/${agent}.output</output-file>
<status>completed</status>
<summary>Agent "${title}" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>the report</result>
<usage><subagent_tokens>251099</subagent_tokens><tool_uses>${tools}</tool_uses><duration_ms>97531</duration_ms></usage>
</task-notification>`;

async function main(): Promise<void> {
  const { StreamParser } = await import('../src/server/claude/stream');
  const { TaskTracker } = await import('../src/server/claude/tasks');
  const { readHistory, transcriptPath } = await import('../src/server/claude/transcript');

  // ---- the live stream ----
  const p = new StreamParser();
  const feed = (m: Record<string, unknown>) => p.message(m);
  const assistantTool = (id: string, name: string, input: Record<string, unknown>, parent: string | null = null) =>
    feed({ type: 'assistant', parent_tool_use_id: parent, message: { id: `msg_${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
  const userResult = (id: string, text: string, tur: unknown, parent: string | null = null) =>
    feed({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: [{ type: 'text', text }] }] }, tool_use_result: tur });
  const send = (id: string, to: string, summary: string | undefined, text: string, tur: unknown) => {
    assistantTool(id, 'SendMessage', { to, ...(summary ? { summary } : {}), message: 'S1 take 7 / boards v9 scored 8.3 …' });
    return userResult(id, text, tur);
  };
  const running = () => p.tasks.running();

  assistantTool(LAUNCH, 'Agent', { description: TITLE, model: 'opus', run_in_background: true, prompt: 'You are a previz builder…' });
  userResult(LAUNCH, launchResult.text, launchResult.tur);
  feed({ type: 'system', subtype: 'task_started', task_id: AGENT, tool_use_id: LAUNCH, description: TITLE });
  check('live: the launched agent runs under its description', running().length === 1 && running()[0].title === `Alma › ${TITLE}`, running());
  feed({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: LAUNCH, status: 'completed', summary: `Agent "${TITLE}" finished`, usage: { tool_uses: 87 } });
  check('live: its first end empties the running list', running().length === 0 && p.tasks.get(LAUNCH)?.liveLine === 'done · 87 tool calls', p.tasks.get(LAUNCH));

  const ev = send(SEND, AGENT, "S1 r5 8.3: courtier's cup, king's hand", JSON.stringify(resumeTur(AGENT)), resumeTur(AGENT));
  check('live: the resume keeps the tool line in the thread', ev.some((e) => e.kind === 'tool_result' && e.id === `result:${SEND}`), ev);
  check('live: the resume confirmed puts the same card back in the running list', running().length === 1 && running()[0].id === LAUNCH && running()[0].title === `Alma › ${TITLE}`, running());
  check('live: the card event for the resume is sent', ev.some((e) => e.kind === 'task' && e.id === LAUNCH && e.task.state === 'running'), ev);
  feed({ type: 'system', subtype: 'task_started', task_id: AGENT, tool_use_id: SEND, description: TITLE });
  check('live: a task_started for the resumed run makes no second card', running().length === 1 && p.tasks.all().length === 1, p.tasks.all());
  assistantTool('toolu_step1', 'Bash', { command: 'ls', description: 'List the boards' }, SEND);
  check('live: the resumed run\'s steps land on the same card', p.tasks.get(LAUNCH)!.steps.length === 1 && /List the boards/.test(p.tasks.get(LAUNCH)!.liveLine ?? ''), p.tasks.get(LAUNCH));
  const q = send(QUEUED, AGENT, 'Then S2 r7 fixes for shot 7', JSON.stringify(queuedTur), queuedTur);
  check('live: a message queued to the running agent changes nothing', running().length === 1 && !q.some((e) => e.kind === 'task'), q);
  feed({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: SEND, status: 'completed', summary: `Agent "${TITLE}" finished`, usage: { tool_uses: 8 } });
  check('live: the resumed run\'s end ends the card as the first time', running().length === 0 && p.tasks.get(LAUNCH)?.state === 'done' && p.tasks.get(LAUNCH)?.liveLine === 'done · 8 tool calls', p.tasks.get(LAUNCH));

  // a resume seen only as task_started (before its SendMessage result)
  feed({ type: 'system', subtype: 'task_started', task_id: AGENT, tool_use_id: 'toolu_send3', description: TITLE });
  check('live: a task_started under a SendMessage id for an ended agent runs its card again', running().length === 1 && running()[0].id === LAUNCH, running());
  feed({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: 'toolu_send3', status: 'completed', summary: 'x', usage: { tool_uses: 2 } });
  check('live: and ends again', running().length === 0, running());

  // an agent the app never saw (started before this tracker existed)
  send('toolu_unknown1', 'a1111111111111111', 'fix the nets', JSON.stringify(resumeTur('a1111111111111111')), resumeTur('a1111111111111111'));
  check('live: an unknown agent resumed shows under the message\'s summary', running().length === 1 && running()[0].title === 'Alma › fix the nets', running());
  send('toolu_unknown2', 'a2222222222222222', undefined, JSON.stringify(resumeTur('a2222222222222222')), resumeTur('a2222222222222222'));
  check('live: without a summary it is a plain sub-agent', running().some((c) => c.title === 'Alma › sub-agent'), running());
  feed({ type: 'system', subtype: 'task_notification', task_id: 'a1111111111111111', tool_use_id: 'toolu_unknown1', status: 'completed', summary: 'x', usage: { tool_uses: 3 } });
  feed({ type: 'system', subtype: 'task_notification', task_id: 'a2222222222222222', tool_use_id: 'toolu_unknown2', status: 'completed', summary: 'x' });
  check('live: both end on their notification', running().length === 0, running());

  const before = p.tasks.all().length;
  const o = send('toolu_other', 'Alma · the-lighthouse [4f2a9c]', 'S3 QC round 1 relayed', JSON.stringify(otherSessionTur), otherSessionTur);
  check('live: a SendMessage to another session starts nothing', running().length === 0 && p.tasks.all().length === before && !o.some((e) => e.kind === 'task'), o);

  // an end read from the transcript before the resume does not end the resumed run
  const live = new StreamParser();
  live.message({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: LAUNCH, name: 'Agent', input: { description: TITLE, run_in_background: true } }] } });
  live.message({ type: 'user', message: { content: [{ tool_use_id: LAUNCH, type: 'tool_result', content: [{ type: 'text', text: launchResult.text }] }] }, tool_use_result: launchResult.tur });
  live.message({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: LAUNCH, status: 'completed', summary: 'x' });
  live.message({ type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', id: SEND, name: 'SendMessage', input: { to: AGENT, summary: 's' } }] } });
  live.message({ type: 'user', message: { content: [{ tool_use_id: SEND, type: 'tool_result', content: [{ type: 'text', text: JSON.stringify(resumeTur(AGENT)) }] }] }, tool_use_result: resumeTur(AGENT) });
  const old = new TaskTracker();
  old.spawn(LAUNCH, { description: TITLE }, '2026-11-17T00:17:14.236Z');
  old.notified(AGENT, LAUNCH, 'completed', 'x', undefined, '2026-11-17T00:48:42.133Z');
  check('live: a transcript\'s end from before the resume is not taken over', !live.tasks.learnEnded(old) && live.tasks.running().length === 1, live.tasks.running());

  // ---- the transcript read back ----
  const cwd = '/tmp/resumed-test-film-repo';
  const file = transcriptPath(cwd, SID);
  mkdirSync(path.dirname(file), { recursive: true });
  let n = 0;
  const line = (o: Record<string, unknown>) => JSON.stringify({ isSidechain: false, sessionId: SID, uuid: `u${++n}`, ...o }) + '\n';
  const tUse = (at: string, id: string, name: string, input: Record<string, unknown>) => line({ type: 'assistant', timestamp: at, message: { id: `msg_${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
  const tRes = (at: string, id: string, text: string, tur: unknown) => line({ type: 'user', timestamp: at, message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: [{ type: 'text', text }] }] }, toolUseResult: tur });
  const tNote = (at: string, text: string) => line({ type: 'queue-operation', operation: 'enqueue', timestamp: at, content: text }) + line({ type: 'user', timestamp: at, message: { role: 'user', content: text } });
  const sendInput = (to: string, summary?: string) => ({ to, ...(summary ? { summary } : {}), message: '…' });
  writeFileSync(file,
    tUse('2026-11-17T00:17:14.236Z', LAUNCH, 'Agent', { description: TITLE, model: 'opus', run_in_background: true, prompt: '…' })
    + tRes('2026-11-17T00:17:14.250Z', LAUNCH, launchResult.text, launchResult.tur)
    + tNote('2026-11-17T00:48:42.133Z', notification(AGENT, LAUNCH, 87))
    + tUse('2026-11-17T00:54:00.592Z', SEND, 'SendMessage', sendInput(AGENT, "S1 r5 8.3: courtier's cup, king's hand"))
    + tRes('2026-11-17T00:54:00.649Z', SEND, JSON.stringify(resumeTur(AGENT)), resumeTur(AGENT))
    + tUse('2026-11-17T00:56:02.865Z', QUEUED, 'SendMessage', sendInput(AGENT, 'Then S2 r7 fixes for shot 7'))
    + tRes('2026-11-17T00:56:02.876Z', QUEUED, JSON.stringify(queuedTur), queuedTur)
    + tUse('2026-11-17T00:57:00.000Z', 'toolu_other', 'SendMessage', sendInput('Alma · the-lighthouse [4f2a9c]', 'S3 QC round 1 relayed'))
    + tRes('2026-11-17T00:57:00.100Z', 'toolu_other', JSON.stringify(otherSessionTur), null));
  let h = await readHistory(cwd, SID);
  const firstEnd = 'done'; // the transcript reader's line for an ended card (it does not read the note's tool count)
  check('transcript: the resumed agent reads as running, one card, same description', h.tasks.running().length === 1 && h.tasks.running()[0].id === LAUNCH && h.tasks.running()[0].title === `Alma › ${TITLE}` && h.tasks.all().length === 1, h.tasks.all());
  const taskEvents = h.events.filter((e) => e.kind === 'task');
  check('transcript: the thread shows the card once, running', taskEvents.length === 1 && taskEvents[0].kind === 'task' && taskEvents[0].task.state === 'running', taskEvents);
  check('transcript: the SendMessage lines stay in the thread', h.events.filter((e) => e.kind === 'tool_result').length === 3, h.events.map((e) => e.kind));

  appendFileSync(file, tNote('2026-11-17T00:55:38.144Z', notification(AGENT, SEND, 8))
    + tUse('2026-11-17T01:00:00.000Z', 'toolu_unknownT', 'SendMessage', sendInput('a3333333333333333', 'fix the nets'))
    + tRes('2026-11-17T01:00:00.050Z', 'toolu_unknownT', JSON.stringify(resumeTur('a3333333333333333')), resumeTur('a3333333333333333')));
  h = await readHistory(cwd, SID);
  const c = h.tasks.get(LAUNCH)!;
  check('transcript: the resumed run\'s end ends the card as the first time', c.state === 'done' && c.liveLine === firstEnd && c.result?.text === 'the report', c);
  check('transcript: an unknown agent resumed shows under the summary', h.tasks.running().length === 1 && h.tasks.running()[0].title === 'Alma › fix the nets', h.tasks.running());
  appendFileSync(file, tNote('2026-11-17T01:05:00.000Z', notification('a3333333333333333', 'toolu_unknownT', 4, 'whatever')));
  h = await readHistory(cwd, SID);
  check('transcript: and it ends on its notification', h.tasks.running().length === 0, h.tasks.running());

  // the same cards as the live stream, for the same events
  const ls = new StreamParser();
  ls.message({ type: 'assistant', message: { id: 'a', content: [{ type: 'tool_use', id: LAUNCH, name: 'Agent', input: { description: TITLE, run_in_background: true } }] } });
  ls.message({ type: 'user', message: { content: [{ tool_use_id: LAUNCH, type: 'tool_result', content: [{ type: 'text', text: launchResult.text }] }] }, tool_use_result: launchResult.tur });
  ls.message({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: LAUNCH, status: 'completed', summary: 'x', usage: { tool_uses: 87 } });
  ls.message({ type: 'assistant', message: { id: 'b', content: [{ type: 'tool_use', id: SEND, name: 'SendMessage', input: sendInput(AGENT, 's') }] } });
  ls.message({ type: 'user', message: { content: [{ tool_use_id: SEND, type: 'tool_result', content: [{ type: 'text', text: JSON.stringify(resumeTur(AGENT)) }] }] }, tool_use_result: resumeTur(AGENT) });
  ls.message({ type: 'system', subtype: 'task_notification', task_id: AGENT, tool_use_id: SEND, status: 'completed', summary: 'x', usage: { tool_uses: 8 } });
  const a = ls.tasks.get(LAUNCH)!;
  check('live and transcript give the same card', a.id === c.id && a.title === c.title && a.state === c.state && a.endedAt !== undefined && c.endedAt !== undefined, { a, c });
}

main()
  .then(() => { console.log(`resumed:test · ${checks} checks passed`); })
  .catch((e: Error) => { console.log(e.message); process.exitCode = 1; })
  .finally(() => rmSync(root, { recursive: true, force: true }));
