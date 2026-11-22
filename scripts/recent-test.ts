// npm run recent:test
// The sidebar (src/components/shell/recent.ts): the order, the film that moved last first, films that never moved after, in their own order; a press in the list holds the order
// it began with. Each row's one mark: the white dot when the film's "Waiting for you" lists anything (never for unread
// notices alone), else the orb while Alma works. And the server's record (src/server/films/recent.ts): only the user's
// writing and a new item waiting move a film. And the notify hub's count of each film's "Waiting for you"
// (src/server/claude/notify.ts) on the sample films: the page's count, answered items left out, news when one comes.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { byRecent, holdOrder, rowMark, rowMarkLabel } from '../src/components/shell/recent';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const k = (x: { slug: string }) => x.slug;
const films = ['a', 'b', 'c', 'd', 'e'].map((slug) => ({ slug }));
const order = (xs: { slug: string }[]) => xs.map(k).join('');

ok('no activity: the given order', order(byRecent(films, k, {})) === 'abcde', order(byRecent(films, k, {})));
ok('c moved: c first, the rest as given', order(byRecent(films, k, { c: '2026-11-21T10:00:00Z' })) === 'cabde');
const act = { c: '2026-11-21T10:00:00Z', b: '2026-11-21T10:05:00Z', e: '2026-11-20T09:00:00Z' };
ok('newest first, then the ones without', order(byRecent(films, k, act)) === 'bcead', order(byRecent(films, k, act)));
ok('equal times keep the given order', order(byRecent(films, k, { d: '2026-11-21T10:00:00Z', b: '2026-11-21T10:00:00Z' })) === 'bdace');
ok('a bad time counts as none', order(byRecent(films, k, { e: 'not a date', c: '2026-01-01T00:00:00Z' })) === 'cabde');
ok('a time for a film not listed is ignored', order(byRecent(films, k, { zz: '2026-11-21T10:00:00Z' })) === 'abcde');
ok('the input is not changed', order(films) === 'abcde');

ok('no press: the new order', order(holdOrder(byRecent(films, k, act), k, null)) === 'bcead');
ok('a press holds the order it began with', order(holdOrder(byRecent(films, k, act), k, ['a', 'b', 'c', 'd', 'e'])) === 'abcde');
ok('a film gone while pressed is left out', order(holdOrder(films.filter((f) => f.slug !== 'c'), k, ['c', 'a', 'b', 'd', 'e'])) === 'abde');
ok('a film new while pressed goes after the held ones', order(holdOrder([{ slug: 'z' }, ...films], k, ['e', 'd', 'c', 'b', 'a'])) === 'edcbaz');

ok('idle: no mark', rowMark({ waiting: 0, working: false }) === undefined);
ok('unread only (her reply, a sub-agent\'s end), nothing waiting, not working: no mark, so no white dot', rowMark({ waiting: 0, working: false }) === undefined && rowMarkLabel(rowMark({ waiting: 0, working: false }), { waiting: 0, unread: 3, last: 'finished' }) === undefined);
ok('unread and working, nothing waiting: the orb, not the white dot', rowMark({ waiting: 0, working: true }) === 'working');
ok('Alma at work, nothing waiting: the orb', rowMark({ waiting: 0, working: true }) === 'working');
ok('something in "Waiting for you": the white dot', rowMark({ waiting: 1, working: false }) === 'attention' && rowMark({ waiting: 4, working: false }) === 'attention');
ok('at work and something waits: the white dot wins', rowMark({ waiting: 2, working: true }) === 'attention');
ok('the white dot\'s label: "N waiting for you", the unread count after it', rowMarkLabel('attention', { waiting: 2 }) === '2 waiting for you' && rowMarkLabel('attention', { waiting: 1, unread: 3, last: 'finished' }) === '1 waiting for you · 3 unread: finished', rowMarkLabel('attention', { waiting: 1, unread: 3, last: 'finished' }));
ok('the orb\'s label', rowMarkLabel('working', { waiting: 0 }) === 'Alma is working');

// the server's record, in a folder of its own: what moves a film and what does not
async function server(): Promise<void> {
  process.chdir(mkdtempSync(path.join(tmpdir(), 'recent-test-')));   // harness/recent.json lands in this folder
  delete process.env.MOCK;
  const rec = await import('../src/server/films/recent');
  ok('nothing else moves a film: no note for opening it or for Alma\'s work', !('noteOpened' in rec) && !('noteActive' in rec));
  rec.noteUserWrote('film-a');
  rec.noteAttention('film-b', '2030-01-01T00:00:00.000Z');
  rec.noteAttention('library', '2030-01-02T00:00:00.000Z');
  const got = await rec.readRecent();
  ok('the user wrote in a: a has a time', typeof got['film-a'] === 'string' && !Number.isNaN(Date.parse(got['film-a'])), got);
  ok('a reply or a card in b: b has its time', got['film-b'] === '2030-01-01T00:00:00.000Z', got);
  ok('the library is not a film row', !('library' in got), got);
  ok('newest first: b, then a', byRecent([{ slug: 'film-a' }, { slug: 'film-b' }], k, got).map(k).join() === 'film-b,film-a');
}

// the notify hub's count of every film's "Waiting for you" (the white dot), on the sample films (MOCK=boards: their
// states are in memory, an answer changes the sample, nothing is written but harness/recent.mock.json in the temp folder)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (cond()) return true;
  return cond();
}
async function hub(): Promise<void> {
  process.env.MOCK = 'boards';
  const { notifyHub } = await import('../src/server/claude/notify');
  const { mockFilms, mockPoke, mockState, mockThread } = await import('../src/fixtures/mock');
  const { soundMockAnswer, resetSoundSample } = await import('../src/fixtures/soundpick');
  const { flowOf } = await import('../src/components/lib/flow');
  const { waitItemsOf } = await import('../src/components/flow/waitList');
  const { latestTasks } = await import('../src/components/lib/derive');
  const rec = await import('../src/server/films/recent');
  const h = notifyHub();
  const told: Record<string, number>[] = [];
  h.subscribeWaiting((c) => told.push(c));
  const films = mockFilms().map((f) => f.slug);
  // what each sample's "Waiting for you" page lists (GatePage: waitItemsOf(flowOf(state, the thread's tasks)))
  const page = (f: string): number => { const st = mockState(f); return st ? waitItemsOf(flowOf(st as never, latestTasks(mockThread(f)))).length : 0; };
  const expected = Object.fromEntries(films.map((f) => [f, page(f)]).filter(([, n]) => (n as number) > 0));
  const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  ok('every sample film counted at the first stream: the counts are what each film\'s "Waiting for you" page lists', await until(() => same(h.waitingNow(), expected), 8000), { hub: h.waitingNow(), page: expected });
  ok('at least two samples have something waiting and one has nothing', Object.keys(expected).length >= 2 && films.some((f) => !expected[f]), expected);
  ok('the counts are told to the stream', told.length > 0 && same(told[told.length - 1], h.waitingNow()), told[told.length - 1]);

  // answered items do not count: the user's answer leaves the count at once and stays out while the state catches up
  const W = 'sample-day1-waiting';
  const before = h.waitingNow()[W];
  h.userAnswered(W, [{ card: 'ASK-boards-S1-S2-v2' }], []);
  ok('an answer sent: that film counts one less at once (as its page does with the sent item)', h.waitingNow()[W] === before - 1, [before, h.waitingNow()[W]]);
  await sleep(600);
  ok('and still after the count again (the sample\'s state still lists the card: kept aside, as on the page)', h.waitingNow()[W] === before - 1, h.waitingNow()[W]);

  // an answer the sample's state shows: the count drops with no sent item at all; a turn notice moves nothing; a new
  // item waiting moves the film up and is news
  const S = 'sample-sound-picks';
  resetSoundSample(S);
  mockPoke(S);
  await sleep(600);
  const s0 = h.waitingNow()[S] ?? 0;
  ok('the sound sample waits on two cards (the sounds and a why)', s0 === 2, s0);
  await h.mockNotice(S, 'turn', 'finished');
  ok('her reply ("turn" notice) does not move the film up the sidebar', !(S in (await rec.readRecent())), await rec.readRecent());
  ok('nor does it change what waits', (h.waitingNow()[S] ?? 0) === s0);
  soundMockAnswer(S, { card: 'WHY-S1-shot2-head', option: 'skip' });  // answered in memory; the sample pokes
  ok('the why card answered: the count drops by one, with no sent item', await until(() => (h.waitingNow()[S] ?? 0) === s0 - 1), h.waitingNow()[S]);
  const wrote = (await rec.readRecent())[S];  // the answer's line went to the thread as the user's (mockPost)
  const notices: string[] = [];
  const off = h.subscribe((n) => { if (n.film === S) notices.push(n.kind); });
  await sleep(5);
  resetSoundSample(S);       // the why card is back: a new item in "Waiting for you"
  mockPoke(S);
  ok('a new item waiting: the count goes up again', await until(() => (h.waitingNow()[S] ?? 0) === s0), h.waitingNow()[S]);
  ok('and it is news (a "pick" notice)', await until(() => notices.includes('pick')), notices);
  const moved = (await rec.readRecent())[S];
  ok('and the film moves up the sidebar', !!moved && (!wrote || moved > wrote), { wrote, moved });
  off();
}

void server().then(hub).catch((e: unknown) => ok('the server record', false, String(e))).finally(() => {
  console.log(bad ? `recent: ${bad} of ${n} failed` : `recent: ${n} checks passed`);
  process.exit(bad ? 1 : 0);
});
