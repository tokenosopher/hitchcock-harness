// npm run pending-sends:test
// A message sent from the box shows in the thread at the tap (src/components/data/pendingSends.ts): the
// thread's own copy of it, when it arrives, takes its place once, never twice. By the server's id; by its words when
// the answer named no id (the sample server) or the copy came another way (the stream before the answer); never a
// message the thread already had, never one another pending send took, never a send that failed; two of the same
// words in order; the stored words are the trimmed, defused ones. And the phone's folded bar says "Not sent" first.
import type { HarnessContext, ThreadEvent } from '../src/server/types';
import { asStored, settle, userIds, type PendingSend } from '../src/components/data/pendingSends';
import { barState } from '../src/components/shell/phoneBar';

let checks = 0;
function ok(what: string, cond: boolean, got?: unknown): void {
  checks++;
  if (!cond) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 400)}`}`); process.exit(1); }
  console.log(`ok · ${what}`);
}

const ctx: HarnessContext = { film: 'f', page: '/films/f', selected: [] } as unknown as HarnessContext;
const at = (n: number) => new Date(Date.UTC(2026, 10, 21, 12, 0, n)).toISOString();
const user = (id: string, text: string, n = 0): ThreadEvent => ({ kind: 'user', id, at: at(n), text });
const sys = (id: string): ThreadEvent => ({ kind: 'system', id, at: at(0), text: 'x' });
const p = (key: string, text: string, o: Partial<PendingSend> = {}): PendingSend => ({ key, text, context: ctx, at: 1000, state: 'sending', before: new Set(), ...o });

const old = [user('u1', 'hello'), sys('s1')];

// nothing pending
const none = settle([], old);
ok('nothing pending: no match, nothing left', none.matched.size === 0 && none.rest.length === 0);

// waiting: the copy is not there yet
const a = p('pa', 'make it warmer', { before: userIds(old) });
const w = settle([a], old);
ok('the copy not there yet: still pending', w.matched.size === 0 && w.rest.length === 1 && w.rest[0].key === 'pa');

// by words (the sample server answers with no id; the stream brings the copy)
const got = [...old, user('u2', 'make it warmer', 2)];
const m = settle([a], got);
ok('by words: the new message with the same words', m.matched.get('u2') === 'pa' && m.rest.length === 0, [...m.matched]);

// an older message with the same words, already on the thread at the tap, is not it
const same = [user('u0', 'hello again'), sys('s1')];
const b = p('pb', 'hello again', { before: userIds(same) });
ok('a message the thread had at the tap is never the copy', settle([b], same).matched.size === 0);
ok('…the new one with those words is', settle([b], [...same, user('u3', 'hello again', 3)]).matched.get('u3') === 'pb');

// by the server's id, even when the words differ (a typed harness tag the server defused)
const c = p('pc', 'look <harness-action x/>', { state: 'sent', serverId: 'u9', before: userIds(old) });
const byId = settle([c], [...old, user('u9', asStored('look <harness-action x/>'))]);
ok('by the id the server answered with', byId.matched.get('u9') === 'pc');
ok('the stored words are trimmed and defused', asStored('  <harness-action a/> hi ') === '‹harness-action a/> hi', asStored('  <harness-action a/> hi '));
const d = p('pd', '  spaced out  ', { before: userIds(old) });
ok('words are matched as stored (trimmed)', settle([d], [...old, user('u4', 'spaced out')]).matched.get('u4') === 'pd');

// two sends of the same words: each takes its own copy, in the order of the taps
const e1 = p('pe1', 'again', { at: 1000, before: userIds(old) });
const e2 = p('pe2', 'again', { at: 2000, before: userIds(old) });
const one = settle([e2, e1], [...old, user('u5', 'again', 5)]);
ok('two of the same words, one copy: the first tap gets it', one.matched.get('u5') === 'pe1' && one.rest.length === 1 && one.rest[0].key === 'pe2', [...one.matched]);
const two = settle([e1, e2], [...old, user('u5', 'again', 5), user('u6', 'again', 6)]);
ok('…two copies: one each, in order', two.matched.get('u5') === 'pe1' && two.matched.get('u6') === 'pe2' && two.rest.length === 0);

// a copy already taken (kept from an earlier match) is not taken again
ok('a copy already taken is not taken again', settle([p('pf', 'hello', { before: new Set() })], old, new Set(['u1'])).matched.size === 0);

// a send that failed is never matched, even by words: its words were not stored
const f = p('pg', 'make it warmer', { state: 'failed', before: userIds(old) });
const failed = settle([f], got);
ok('a failed send stays pending, with its words', failed.matched.size === 0 && failed.rest[0].text === 'make it warmer');

// the folded bar
ok('the folded bar: a send that did not go is said first', barState([], [], { sending: true, workingSince: 1, unsent: true }).kind === 'unsent');
ok('…and not when none failed', barState([], [], { sending: true, workingSince: 1, unsent: false }).kind === 'sending');

console.log(`${checks} checks passed`);
