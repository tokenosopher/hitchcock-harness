// npm run recent:test
// The sidebar (src/components/shell/recent.ts): the order, the film that moved last first, films that never moved after, in their own order; a press in the list holds the order
// it began with. Each row's one mark: the white dot when something needs the user, else the orb while Alma works.
// And the server's record (src/server/films/recent.ts): only the user's writing and what needs them move a film.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { byRecent, holdOrder, rowMark } from '../src/components/shell/recent';

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

ok('idle and seen: no mark', rowMark({ unread: 0, waiting: false, working: false }) === undefined);
ok('Alma at work: the orb', rowMark({ unread: 0, waiting: false, working: true }) === 'working');
ok('a notice not seen: the white dot', rowMark({ unread: 2, waiting: false, working: false }) === 'attention');
ok('picks waiting in the open film: the white dot', rowMark({ unread: 0, waiting: true, working: false }) === 'attention');
ok('at work and something waits: the white dot wins', rowMark({ unread: 1, waiting: false, working: true }) === 'attention' && rowMark({ unread: 0, waiting: true, working: true }) === 'attention');

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

void server().catch((e: unknown) => ok('the server record', false, String(e))).finally(() => {
  console.log(bad ? `recent: ${bad} of ${n} failed` : `recent: ${n} checks passed`);
  process.exit(bad ? 1 : 0);
});
