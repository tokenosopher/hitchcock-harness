// npm run library-save:test
// "Save to the library" for a face candidate (Flow v3.3 - 2 Characters step 11) on a temp root: a film repo
// with two synthetic films and a library folder of its own. Checks that a candidate that was not picked is copied (not
// moved or linked) with its meta.json (the film, the character, the round, the prompt, the date, the user's note); that
// the film's files and pick are untouched; that a second save copies nothing and a new note only replaces the note; that
// a path outside the film is refused; that the film's later pick of the same face turns the entry to "picked"; and that
// a later film uses the saved face from the library as its pick. Nothing reaches Alma, nothing is paid for.
import { mkdtempSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(os.tmpdir(), 'library-save-test-'));
const repo = path.join(root, 'repo');
const library = path.join(root, 'library');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_LIBRARY = library;
process.env.HARNESS_ALMA_DRYRUN = '1';
process.env.HARNESS_ALMA_DRYRUN_FILE = path.join(root, 'alma-dryrun.jsonl');
process.chdir(root); // backups the pick keeps go under <cwd>/harness: here, not in the app's folder

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const put = async (rel: string, body: string | Buffer): Promise<void> => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body);
};
/** Every file under a folder with its bytes, to compare before and after. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out[path.relative(dir, p)] = (await readFile(p)).toString('base64');
    }
  };
  await walk(dir);
  return out;
}

const ONE = 'repo/assets/films/face-one';
const TWO = 'repo/assets/films/face-two';
const PROMPT = 'A studio portrait photograph of a real young woman, head and shoulders (test)';

async function setup(): Promise<void> {
  await put('repo/taste.md', '# Taste\n\n## The record\n\n| Date | Film | Choice | Candidates | Pick | What it says | Words | Predicted | Right |\n|---|---|---|---|---|---|---|---|---|\n');
  await put(`${ONE}/brief.md`, '# Face One\n');
  for (let i = 1; i <= 3; i++) await put(`${ONE}/cast/C01-nia/r1-faces/C01-r1-${i}.png`, `png face ${i}`);
  await put(`${ONE}/cast/C01-nia/r1-faces/prompts.json`, JSON.stringify({ candidates: [1, 2, 3].map((i) => ({ id: `C01 r1-${i}`, prompt: `${PROMPT} ${i}` })) }, null, 1));
  await put(`${TWO}/brief.md`, '# Face Two\n');
  await mkdir(path.join(root, TWO, 'cast', 'C02-tomas'), { recursive: true });
}

async function main(): Promise<void> {
  await setup();
  const { saveToLibrary } = await import('../src/server/library/save');
  const { listLibrary, getEntry } = await import('../src/server/library/store');
  const { makePick } = await import('../src/server/actions/pick');
  const one = path.join(root, ONE);
  const before = await snapshot(one);

  // 1. a candidate that was not picked, saved with a note of the user's
  const r1 = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'cast/C01-nia/r1-faces/C01-r1-2.png', note: '  a good older face,\n for a later film ' });
  ok('the save answers ok and created', r1.ok && r1.created, r1);
  if (!r1.ok) throw new Error('the save failed; the rest cannot run');
  const dir = path.join(library, 'faces', r1.id);
  const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')) as Record<string, unknown> & { film: { slug: string }; character: { id: string; name: string }; files: { role: string; file: string; source: string }[]; dates: Record<string, string> };
  ok('meta.json: the film and the character it was made for', meta.film.slug === 'face-one' && meta.character.id === 'C01' && meta.kind === 'face', meta);
  ok('meta.json: the round and the candidate', meta.round === 'r1-faces' && meta.candidate === 'r1-2', meta);
  ok('meta.json: the prompt that made it', meta.prompt === `${PROMPT} 2`, meta.prompt);
  ok('meta.json: saved today, status "saved"', meta.status === 'saved' && meta.dates.saved === new Date().toISOString().slice(0, 10), meta);
  ok('meta.json: the note, on one line', meta.note === 'a good older face, for a later film', meta.note);
  ok('meta.json: the file and where it came from', meta.files.length === 1 && meta.files[0].role === 'face' && meta.files[0].source === 'assets/films/face-one/cast/C01-nia/r1-faces/C01-r1-2.png', meta.files);
  const copy = path.join(dir, meta.files[0].file);
  const st = await lstat(copy);
  ok('the library holds a copy, not a link', st.isFile() && !st.isSymbolicLink());
  ok('the copy has the candidate\'s bytes', (await readFile(copy, 'utf8')) === 'png face 2');
  ok('the film is untouched: same files, same bytes, no pick', JSON.stringify(await snapshot(one)) === JSON.stringify(before));

  // 2. saved again: nothing copied, the note kept
  const r2 = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'cast/C01-nia/r1-faces/C01-r1-2.png' });
  ok('a second save copies nothing', r2.ok && !r2.created && r2.id === r1.id, r2);
  // 3. a new note only replaces the note
  const r3 = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'cast/C01-nia/r1-faces/C01-r1-2.png', note: 'for a soldier' });
  const meta3 = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')) as Record<string, unknown> & { files: unknown[] };
  ok('a new note replaces the note', r3.ok && !r3.created && r3.noted === true && meta3.note === 'for a soldier', meta3);
  ok('the rest of meta.json is the same', JSON.stringify({ ...meta3, note: undefined }) === JSON.stringify({ ...meta, note: undefined }));
  ok('one entry in the library', (await listLibrary()).counts.faces === 1);

  // 4. refused
  const out = await saveToLibrary({ film: 'face-one', kind: 'face', ref: '../face-two/brief.md' });
  ok('a path outside the film is refused', !out.ok && out.status === 400, out);
  // a symlink inside the film that leads out of it
  await put('secret.txt', 'not the film\'s');
  await symlink(path.join(root, 'secret.txt'), path.join(root, ONE, 'cast', 'C01-nia', 'r1-faces', 'C01-r1-9.png'));
  const linked = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'cast/C01-nia/r1-faces/C01-r1-9.png' });
  ok('a symlink in the film that leads out is refused', !linked.ok && linked.status === 400, linked);
  // a path a film's JSON names (voices/options.json, element-lines-5s.json, elements.json) that leads out of the films
  const { voiceDraft, inFilm } = await import('../src/server/library/sources');
  await put(`${ONE}/voices/options.json`, JSON.stringify({ C01: { options: [{ option: 1, file: path.join(root, 'secret.txt') }, { option: 2, file: '../../../../secret.txt' }, { option: 3, file: 'voices/C01-3.mp3' }, { option: 4, file: 'voices/link.mp3' }] } }));
  await put(`${ONE}/voices/C01-3.mp3`, 'mp3');
  await symlink(path.join(root, 'secret.txt'), path.join(root, ONE, 'voices', 'link.mp3'));
  const filmOne = { slug: 'face-one', title: 'Face One', dir: one };
  ok('an absolute path out of the films is not copied', !(await voiceDraft(filmOne, 'C01', 1, 'saved')));
  ok('a ../ path out of the films is not copied', !(await voiceDraft(filmOne, 'C01', 2, 'saved')));
  ok('a symlink out of the films is not copied', !(await voiceDraft(filmOne, 'C01', 4, 'saved')));
  ok('a path inside the film is copied', (await voiceDraft(filmOne, 'C01', 3, 'saved'))?.files[0]?.abs === path.join(one, 'voices', 'C01-3.mp3'));
  ok('another film\'s file is not copied: only the film\'s own', !inFilm(filmOne, '../face-two/brief.md'));
  ok('the films folder itself is not', !inFilm(filmOne, '..'));
  const none = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'C01 r9-9' });
  ok('a candidate that is not there is a 404', !none.ok && none.status === 404, none);
  const nofilm = await saveToLibrary({ film: 'no-such-film', kind: 'face', ref: 'C01 r1-1' });
  ok('a film that is not there is a 404', !nofilm.ok && nofilm.status === 404, nofilm);
  // the ID form saves the same way: C01 r1-3
  const r4 = await saveToLibrary({ film: 'face-one', kind: 'face', ref: 'C01 r1-3' });
  ok('"C01 r1-3" saves r1-3', r4.ok && r4.created && r4.meta.candidate === 'r1-3', r4);

  // 5. the film picks the face it saved: the entry turns to "picked", its note stays
  await makePick({ kind: 'face', target: 'C01', round: 'r1-faces', candidate: 'r1-2', from: 'the Character page' }, 'face-one', { notify: false });
  const after = await getEntry('face', r1.id);
  ok('the film\'s pick of a saved face turns it to "picked", the note stays', after?.meta.status === 'picked' && after.meta.note === 'for a soldier', after?.meta);

  // 6. a later film uses the saved face from the library
  const p = await makePick({ kind: 'face', target: 'C02', source: 'library', libraryId: r4.ok ? r4.id : '', libraryKind: 'face', from: 'the Character page' }, 'face-two', { notify: false });
  const two = path.join(root, TWO, 'cast', 'C02-tomas');
  const pf = await readFile(path.join(two, 'pick-face.png'), 'utf8').catch(() => '');
  ok('a later film\'s pick from the library: pick-face.png is the saved face', pf === 'png face 3', { pf, writes: p.writes });
  const rounds = (await readdir(two)).filter((x) => /^r\d+-library$/.test(x));
  ok('the library face comes in as a round of its own', rounds.length === 1, await readdir(two));
}

main().then(
  () => {
    console.log(`library-save: ${n - bad} of ${n} checks passed (${root})`);
    process.exit(bad ? 1 : 0);
  },
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
