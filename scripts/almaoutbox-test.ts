// npm run almaoutbox:test
// Every message to Alma shows on the folded phone bar (src/components/data/almaOutbox.ts): a POST through almaFetch counts as on its way
// until answered, whoever sends it; a user message the thread had not seen, not yet answered, opens her turn.
import { almaFetch, arrived, onPosted, outbound, subscribeOutbox } from '../src/components/data/almaOutbox';
import { barState } from '../src/components/shell/phoneBar';
import type { ThreadEvent } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const T0 = Date.parse('2026-11-21T10:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const u = (id: string, s: number): ThreadEvent => ({ kind: 'user', id, at: at(s), text: `<harness-action kind="answer"/> ${id}` });
const r = (id: string, s: number): ThreadEvent => ({ kind: 'result', id, at: at(s), ok: true, sessionId: 's' });
const err = (id: string, s: number): ThreadEvent => ({ kind: 'error', id, at: at(s), text: 'Alma stopped' });
const W = 5 * 60_000;
const ids = (l: ThreadEvent[]) => l.map((e) => e.id).join(',');

// arrived: what opens a turn
{
  const seen = new Set<string>();
  ok('history: answered messages open nothing', arrived([u('a', 0), r('ra', 5)], seen, T0 + 10_000, W).length === 0);
  ok('they are seen', seen.has('a'));
  const got = arrived([u('a', 0), r('ra', 5), u('b', 20)], seen, T0 + 21_000, W);
  ok('a message from a card or a page opens her turn', ids(got) === 'b', ids(got));
  ok('the same message again opens nothing more', arrived([u('a', 0), r('ra', 5), u('b', 20)], seen, T0 + 22_000, W).length === 0);
  const q = arrived([u('a', 0), r('ra', 5), u('b', 20), u('c', 25)], seen, T0 + 26_000, W);
  ok('a second one queues behind it', ids(q) === 'c', ids(q));
}
{
  const seen = new Set<string>();
  const got = arrived([u('a', 0), u('b', 1), r('ra', 5)], seen, T0 + 6_000, W);
  ok('in one batch: her turns take messages in order, the second still waits', ids(got) === 'b', ids(got));
  ok('an error ends them all', arrived([u('c', 0), u('d', 1), err('e', 2)], new Set(), T0 + 3_000, W).length === 0);
  ok('an old unanswered message (a turn lost long ago) is not her working', arrived([u('old', 0)], new Set(), T0 + W + 1000, W).length === 0);
  ok('one found on load, moments old (the Idea page first message)', ids(arrived([u('a', 0), r('ra', 5), u('new', 30)], new Set(), T0 + 40_000, W)) === 'new');
}

// the outbox: Sending at once, for any sender
(async () => {
  let calls = 0;
  let release!: () => void;
  (globalThis as { fetch: typeof fetch }).fetch = (() => new Promise<Response>((res) => { release = () => res(new Response('{}')); })) as typeof fetch;
  const off = subscribeOutbox(() => { calls++; });
  const done: string[] = [];
  const offP = onPosted((f) => done.push(f));
  ok('nothing on its way', outbound('film-a') === 0);
  const p = almaFetch('film-a', '/api/films/film-a/done', { method: 'POST' });
  ok('Done picking: on its way at once', outbound('film-a') === 1 && calls === 1, { out: outbound('film-a'), calls });
  ok('only for its film', outbound('film-b') === 0);
  ok('the bar says Sending before anything is back', barState([], [], { sending: outbound('film-a') > 0 }).kind === 'sending');
  release();
  await p;
  ok('answered: no longer on its way', outbound('film-a') === 0 && calls === 2, { out: outbound('film-a'), calls });
  ok('the thread hears it was answered (polls fast for her)', done.join() === 'film-a', done);
  (globalThis as { fetch: typeof fetch }).fetch = (() => Promise.reject(new Error('down'))) as typeof fetch;
  await almaFetch('film-a', '/x').catch(() => undefined);
  ok('a failed POST is not left on its way', outbound('film-a') === 0);
  off(); offP();
  // the bar once her turn opened from the message that arrived
  const w = barState([u('b', 20)], [], { sending: false, workingSince: T0 + 20_000 });
  ok('then "Alma is working"', w.kind === 'working', w);
  ok('then done', barState([u('b', 20), r('rb', 30)], [], { sending: false }).kind === 'done');
  console.log(`${n - bad}/${n} ok`);
  if (bad) process.exit(1);
})();
