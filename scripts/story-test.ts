// npm run story:test [-- <empty test root>]
// Builds a small film of its own under <root> and runs the story reader and the two story writes against it:
// a first save, an unchanged save, a save from a stale version (refused, then forced), a version Alma would
// write, and the settle. Nothing is sent to Alma and no real film is read or written. Without a root it makes one
// in the temp folder (so a runner can run it) and deletes it after.
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const own = !process.argv[2];
const root = own ? mkdtempSync(path.join(os.tmpdir(), 'story-test-')) : path.resolve(process.argv[2]);
if (own) process.on('exit', () => rmSync(root, { recursive: true, force: true }));
process.env.HARNESS_FILM_REPO = path.join(root, 'repo');
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_ALMA_DRYRUN = '1';

const FILM = 'test-film';
let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}`); };

async function main(): Promise<void> {
  if (root.startsWith('/path/to/hitchcock-harness/studio') || root.startsWith('/Volumes/')) throw new Error('refusing: the test root must be a scratch folder');
  await fs.mkdir(root, { recursive: true });
  if ((await fs.readdir(root)).length) throw new Error(`refusing: ${root} is not empty`);
  const dir = path.join(process.env.HARNESS_FILM_REPO!, 'assets', 'films', FILM);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(process.env.HARNESS_DIR!, { recursive: true });
  await fs.writeFile(path.join(dir, 'brief.md'), '# Test Film\n');

  const { readStory } = await import('../src/server/films/read/story');
  const { saveStory, settleStory } = await import('../src/server/actions/story');
  const { Warnings } = await import('../src/server/films/util');
  const read = () => readStory({ dir, warn: new Warnings() });
  const refused = async (p: Promise<unknown>): Promise<number | undefined> => p.then(() => undefined, (e: { status?: number }) => e.status ?? 500);

  check((await read()) === undefined, 'no story folder reads as no story');
  const dry = await saveStory({ text: 'A man kicks a jar.' }, FILM, { dryRun: true });
  check(dry.version === 'v1' && (await read()) === undefined, 'a dry run names v1 and writes nothing');
  check((await refused(saveStory({ text: '   ' }, FILM))) === 400, 'an empty story is refused');

  const a = await saveStory({ text: 'A man kicks a jar.\r\n\r\n"Get up," he says.  \n' }, FILM);
  let s = await read();
  check(a.version === 'v1' && s?.current === 'v1' && s.text === 'A man kicks a jar.\n\n"Get up," he says.\n' && s.versions[0].by === 'you', 'the first save is v1, yours, with line ends tidied');
  const same = await saveStory({ text: 'A man kicks a jar.\n\n"Get up," he says.', base: 'v1' }, FILM);
  check(same.unchanged === true && (await read())?.versions.length === 1, 'the same text again makes no new version');

  // Alma writes a version the way her recipe says: the next file, nothing else
  await fs.writeFile(path.join(dir, 'story', 'v2.md'), 'A townsman kicks a jar.\n\n"Get up," he says.\n');
  s = await read();
  check(s?.current === 'v2' && s.versions[1].by === 'alma', 'a file Alma adds is the newest, marked hers');
  check((await refused(saveStory({ text: 'A man kicks a big jar.', base: 'v1' }, FILM))) === 409, 'a save from v1 is refused once v2 exists');
  const forced = await saveStory({ text: 'A man kicks a big jar.', base: 'v1', force: true }, FILM);
  s = await read();
  check(forced.version === 'v3' && s?.versions.map((v) => `${v.version}:${v.by}`).join(' ') === 'v1:you v2:alma v3:you', 'forced, it becomes v3; v1 and v2 stay');
  check((await fs.readFile(path.join(dir, 'story', 'v2.md'), 'utf8')).startsWith('A townsman'), 'v2 is untouched');

  check((await refused(settleStory('v2', FILM))) === 409, 'settling an older version is refused');
  const dset = await settleStory('v3', FILM, { dryRun: true });
  check(!dset.notified && (await read())?.settled === undefined, 'a dry settle writes and sends nothing');
  const set = await settleStory('v3', FILM, { notify: false });
  s = await read();
  check(s?.settled?.version === 'v3' && /kind="story-settled" version="v3"/.test(set.message) && set.message.includes('assets/films/test-film/story/v3.md'), 'settled at v3; the line for Alma names the action and the file');
  await saveStory({ text: 'A man kicks a very big jar.', base: 'v3' }, FILM);
  s = await read();
  check(s?.current === 'v4' && s.settled?.version === 'v3', 'a save after the settle is v4; the settle still names v3');

  const log = await fs.readFile(path.join(process.env.HARNESS_DIR!, 'writes.log'), 'utf8');
  check(log.includes('assets/films/test-film/story/v1.md') && log.includes('settled.json'), 'every write is in the writes log');
  console.log(bad ? `\n${bad} failed` : '\nok');
  process.exit(bad ? 1 : 0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
