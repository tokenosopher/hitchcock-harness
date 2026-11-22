// npm run folder:test
// The header's "Open the film's folder" (src/server/films/folder.ts): the folder comes from the registry by the slug,
// an unknown or odd slug opens nothing, the request never names the path, and only a request made on this Mac counts.
// `open` is stubbed: nothing is opened.
import { filmFolder, fromThisMac, openFilmFolder, type FindFilm } from '../src/server/films/folder';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const FOLDER = '/path/to/hitchcock-harness/studio/assets/films/the-lighthouse';
const asked: string[] = [];
const find: FindFilm = async (slug) => { asked.push(slug); return slug === 'the-lighthouse' ? { slug, folder: FOLDER } : undefined; };
const opened: string[] = [];
const open = async (f: string) => { opened.push(f); };
const dir = async () => true;

async function main() {
  ok('a known slug: the registry\'s folder', (await filmFolder('the-lighthouse', find)) === FOLDER);
  ok('an unknown slug: nothing', (await filmFolder('no-such-film', find)) === undefined);
  for (const s of ['../etc', '/etc', 'the-lighthouse/../../x', 'The-Lighthouse', '', ' the-lighthouse', 'the lighthouse', '-x', 'x'.repeat(90)]) {
    ok(`an odd slug never reaches the registry: ${JSON.stringify(s)}`, (await filmFolder(s, find)) === undefined && !asked.includes(s), asked);
  }
  ok('not a string: nothing', (await filmFolder({ folder: '/etc' }, find)) === undefined && (await filmFolder(undefined, find)) === undefined);
  // a registry row that is not the slug asked for, or a relative folder, is not trusted
  ok('a row for another slug is refused', (await filmFolder('the-lighthouse', async () => ({ slug: 'other', folder: FOLDER }))) === undefined);
  ok('a relative folder is refused', (await filmFolder('the-lighthouse', async (slug) => ({ slug, folder: 'assets/films/the-lighthouse' }))) === undefined);

  // the open: only ever the registry's folder
  const r1 = await openFilmFolder('the-lighthouse', { find, open, dir });
  ok('open: ok, with the registry\'s folder as the one argument', r1.ok && opened.length === 1 && opened[0] === FOLDER, { r1, opened });
  const r2 = await openFilmFolder('/tmp/elsewhere/secret', { find, open, dir });
  ok('open: a path for a slug is a 404 and opens nothing', !r2.ok && r2.status === 404 && opened.length === 1, { r2, opened });
  const r3 = await openFilmFolder('no-such-film', { find, open, dir });
  ok('open: an unknown film is a 404', !r3.ok && r3.status === 404 && opened.length === 1, r3);
  const r4 = await openFilmFolder('the-lighthouse', { find, open, dir: async () => false });
  ok('open: a folder that is not there is a 404', !r4.ok && r4.status === 404 && opened.length === 1, r4);
  const r5 = await openFilmFolder('the-lighthouse', { find, open: async () => { throw new Error('x'); }, dir });
  ok('open: a failed open is a 500', !r5.ok && r5.status === 500, r5);

  // on this Mac only
  const h = (o: Record<string, string>) => new Headers(o);
  ok('localhost', fromThisMac(h({ host: 'localhost:8800' })));
  ok('127.0.0.1 with Next\'s own forwarded-for', fromThisMac(h({ host: '127.0.0.1:8800', 'x-forwarded-for': '::1' })));
  ok('a tunnel host is refused', !fromThisMac(h({ host: 'abc.trycloudflare.com' })));
  ok('localhost through cloudflared is refused', !fromThisMac(h({ host: 'localhost:8800', 'cf-connecting-ip': '1.2.3.4' })));
  ok('localhost from another address is refused', !fromThisMac(h({ host: 'localhost:8800', 'x-forwarded-for': '10.0.0.5' })));
  ok('tailscale serve is refused', !fromThisMac(h({ host: 'localhost:8800', 'tailscale-user-login': 'me@x' })));

  console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
  process.exit(bad ? 1 : 0);
}
void main();
