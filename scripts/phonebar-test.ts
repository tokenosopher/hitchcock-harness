// npm run phonebar:test
// The phone's folded thread bar and Enter key (src/components/shell/phoneBar.ts): the bar reads Alma's
// state from the thread's events and tasks (sending, working with her step, done with the time, failed); Enter is a
// new line on a touch-first device and Send elsewhere.
import { barState, clockWords, enterAction, stepOf } from '../src/components/shell/phoneBar';
import type { TaskCard, ThreadEvent } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const T0 = Date.parse('2026-11-21T10:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const user: ThreadEvent = { kind: 'user', id: 'u1', at: at(0), text: 'make it shorter' };
const tool: ThreadEvent = { kind: 'tool_use', id: 't1', at: at(2), name: 'Read', summary: 'Read story.md' };
const agent: ThreadEvent = { kind: 'tool_use', id: 't2', at: at(3), name: 'Agent', summary: 'Agent · write prompts' };
const said: ThreadEvent = { kind: 'assistant_text', id: 'a1', at: at(4), text: 'On it.' };
const done: ThreadEvent = { kind: 'result', id: 'r1', at: at(9), ok: true, sessionId: 's' };
const failed: ThreadEvent = { kind: 'result', id: 'r2', at: at(9), ok: false, sessionId: 's' };
const err: ThreadEvent = { kind: 'error', id: 'e1', at: at(9), text: 'Alma stopped' };
const task = (id: string, state: TaskCard['state'], title = 'Alma › Scene 3 prompts'): TaskCard => ({ id, state, title, startedAt: at(3) } as TaskCard);

ok('idle: nothing yet', barState([], [], { sending: false }).kind === 'idle');
ok('sending: the POST is out, the message not back', barState([], [], { sending: true, workingSince: T0 }).kind === 'sending');
const got = barState([user], [], { sending: false, workingSince: T0 });
ok('working: the message reached her', got.kind === 'working' && got.step === 'got your message', got);
ok('working: the message is back while the POST still closes', barState([user], [], { sending: true, workingSince: T0 }).kind === 'working');
const step = barState([user, tool], [], { sending: false, workingSince: T0 });
ok('working: her newest step', step.kind === 'working' && step.step === 'Read story.md', step);
ok('working: a step not starting with its tool name gets it', stepOf([user, { ...tool, summary: 'story.md' } as ThreadEvent], []) === 'Read · story.md');
ok('working: an Agent spawn is not a step (its card is)', stepOf([user, agent], []) === 'got your message');
ok('working: writing', stepOf([user, tool, said], []) === 'writing to you');
ok('working: one sub-agent, its title without "Alma ›"', stepOf([user, tool], [task('k1', 'running')]) === 'Scene 3 prompts');
ok('working: two sub-agents', stepOf([user], [task('k1', 'running'), task('k2', 'running')]) === '2 sub-agents running');
const sub = barState([user, done], [task('k1', 'running')], { sending: false });
ok('working: sub-agents still run after her turn ended', sub.kind === 'working' && sub.step === 'Scene 3 prompts', sub);
const q = barState([user, done], [task('k1', 'queued')], { sending: false });
ok('working: a queued sub-agent', q.kind === 'working' && q.step === '1 queued', q);
ok('working: a finished sub-agent is not', barState([user, done], [task('k1', 'done')], { sending: false }).kind === 'done');
const d = barState([user, tool, said, done], [], { sending: false });
ok('done, with the time of the result', d.kind === 'done' && d.at === at(9), d);
ok('failed: a failed result', barState([user, failed], [], { sending: false }).kind === 'failed');
ok('failed: an error', barState([user, err], [], { sending: false }).kind === 'failed');
ok('a new message after the last result is not "done"', barState([user, done, { ...user, id: 'u2', at: at(20) }], [], { sending: false }).kind === 'idle');
ok('a long step is cut short', stepOf([user, { ...tool, summary: `Read ${'x'.repeat(80)}` } as ThreadEvent], []).length <= 48);

const noon = new Date(2026, 10, 21, 14, 32).toISOString();
ok('clock: today is the time', clockWords(noon, new Date(2026, 10, 21, 18, 0).getTime()) === '14:32', clockWords(noon));
ok('clock: another day has the date', clockWords(noon, new Date(2026, 10, 22, 9, 0).getTime()) === '21 Nov 14:32', clockWords(noon, new Date(2026, 10, 22, 9, 0).getTime()));

const key = (k: string, shiftKey = false, isComposing = false) => ({ key: k, shiftKey, isComposing });
ok('desktop: Enter sends', enterAction(key('Enter'), false) === 'send');
ok('desktop: Shift+Enter is a new line', enterAction(key('Enter', true), false) === 'newline');
ok('phone: Enter is a new line', enterAction(key('Enter'), true) === 'newline');
ok('phone: Shift+Enter is a new line', enterAction(key('Enter', true), true) === 'newline');
ok('composing: never a send', enterAction(key('Enter', false, true), false) === 'newline');
ok('another key', enterAction(key('a'), true) === 'other');

console.log(`${n - bad}/${n} ok`);
if (bad) process.exit(1);
