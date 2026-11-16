// npm run alma-drop:test
// Alma's drop (14 Nov 2026, stage 4 of "saving apart from history": src/server/edit/alma-drop.ts, watch.ts), on
// synthetic films in a temp folder (deleted after). A good drop is one step, one version with her note and one answer;
// a stale drop is refused with the steps since and writes nothing to the cut; a cut that does not check out is refused
// with the problems the page's step would get; a drop that changes nothing; a half-written, non-JSON, wrongly shaped or
// wrongly named file; the same drop seen twice, and after a crash before its answer; drops waiting at start taken
// oldest first, and a live drop through the real watcher; a page step and a drop fired together; the fallback (a
// cut/v<n>.json written by hand becomes one step marked saved, the unsaved edits one undo away), also at start and
// through the watcher; a version written by the old route is not taken for one written by hand and brings the working
// cut along. No file the app did not write itself is ever deleted or changed. Never touches a real film.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline, TimelineTrack } from '../src/server/types';

const root = mkdtempSync(path.join(os.tmpdir(), 'alma-drop-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';
delete process.env.HARNESS_AUTO_480P;

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 600)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(100); }
  return ok();
}

/** A cut whose content is `n`: one subtitle line saying it (no media file needed), an empty picture track. */
const tracksOf = (n: number | string): TimelineTrack[] => [
  { id: 'V1', kind: 'video', name: 'Picture', clips: [] },
  { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: `line ${n}`, in: 0, out: 2, at: 0 }] },
];
const versionText = (v: string, content: number | string, note: string, basedOn?: string, by: Timeline['by'] = 'user') => JSON.stringify({
  version: v, fps: 24, width: 1080, height: 1920, ...(basedOn ? { basedOn } : {}), note, by, at: new Date().toISOString(), markers: [], tracks: tracksOf(content),
}, null, 1) + '\n';

let films = 0;
function makeFilm(n = 2): { slug: string; dir: string } {
  const slug = `d${++films}`;
  const dir = path.join(repo, 'assets', 'films', slug);
  mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
  for (let i = 1; i <= n; i++) writeFileSync(path.join(dir, 'cut', `v${i}.json`), versionText(`v${i}`, i, `change ${i}`, i > 1 ? `v${i - 1}` : undefined));
  return { slug, dir };
}

const hash = (f: string) => createHash('sha1').update(readFileSync(f)).digest('hex');
/** Every file under a folder with a hash of its bytes. */
function tree(dir: string, skip: (rel: string) => boolean = () => false): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      const rel = path.relative(dir, p);
      if (skip(rel)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else out[rel] = hash(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
const versionFiles = (dir: string) => readdirSync(path.join(dir, 'cut')).filter((n) => /^v\d+\.json$/.test(n)).sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));
const readJson = <X = Record<string, unknown>>(f: string): X => JSON.parse(readFileSync(f, 'utf8')) as X;

/** Every file the app must never delete or change once it is there: versions, drops and answers. */
const kept: Record<string, string> = {};
function keep(dir: string): void {
  for (const [rel, h] of Object.entries(tree(path.join(dir, 'cut'), (r) => r.startsWith('renders') || r === 'working.json'))) kept[path.join(dir, 'cut', rel)] = h;
}

let stamps = 0;
/** A drop written the way the recipe says: a temp name in cut/alma/, then a rename. Returns its path. */
function drop(dir: string, body: unknown, name?: string): string {
  const d = path.join(dir, 'cut', 'alma');
  mkdirSync(d, { recursive: true });
  const stem = name ?? `20261114-10${String(Math.floor(stamps / 60)).padStart(2, '0')}${String(stamps++ % 60).padStart(2, '0')}`;
  const file = path.join(d, `${stem}.json`);
  writeFileSync(`${file}.tmp`, typeof body === 'string' ? body : JSON.stringify(body, null, 1));
  renameSync(`${file}.tmp`, file);
  return file;
}
const answerOf = (file: string) => readJson<Record<string, unknown>>(file.replace(/\.json$/, '.answer.json'));

async function main(): Promise<void> {
  const W = await import('../src/server/edit/working');
  const T = await import('../src/server/edit/timeline');
  const A = await import('../src/server/edit/alma-drop');
  const target = (f: { slug: string; dir: string }) => T.filmTargetOf(f.slug, f.dir, repo);
  const store = (f: { slug: string; dir: string }) => W.diskStore(target(f));
  const textOf = async (f: { slug: string; dir: string }) => (await W.peekWorking(store(f)))!.working.tracks[1].clips[0].text;
  const historyOf = (f: { dir: string }) => readJson<{ rev: number; at: number; steps: { rev: number; by: string; words: string; saved?: string; drop?: string; why?: string }[] }>(path.join(f.dir, 'harness', 'cut-history.json'));

  // ---- 1. a good drop
  console.log('\n== a good drop');
  const f1 = makeFilm();
  const a1 = (await W.ensureWorking(store(f1)))!;
  const steps0 = a1.history.steps.length;
  const d1 = drop(f1.dir, { basedOnRev: a1.working.rev, note: 'S3 line retimed at 00:00:04:00', tracks: tracksOf('alma 1'), markers: [] });
  const dropBytes = hash(d1);
  const r1 = await A.takeIn(target(f1), d1);
  const ans1 = answerOf(d1);
  const h1 = historyOf(f1);
  check('the answer is {taken: true, rev, version}', ans1.taken === true && ans1.version === 'v3' && ans1.rev === h1.rev && r1.answer?.taken === true, ans1);
  check('one step, by Alma, her note as its words, marked saved v3 and with the drop\'s name', h1.steps.length === steps0 + 1 && h1.steps[h1.at].by === 'alma' && h1.steps[h1.at].words === 'S3 line retimed at 00:00:04:00' && h1.steps[h1.at].saved === 'v3' && h1.steps[h1.at].why === 'alma' && h1.steps[h1.at].drop === path.basename(d1, '.json'), h1.steps[h1.at]);
  const v3 = readJson<Timeline>(path.join(f1.dir, 'cut', 'v3.json'));
  check('one version, with her note, by alma, of her content', versionFiles(f1.dir).join() === 'v1.json,v2.json,v3.json' && v3.note === 'S3 line retimed at 00:00:04:00' && v3.by === 'alma' && v3.tracks[1].clips[0].text === 'line alma 1', v3);
  check('the working cut is her change, saved', (await textOf(f1)) === 'line alma 1' && (await W.peekWorking(store(f1)))!.working.edited === false);
  check('the drop itself is untouched', hash(d1) === dropBytes);
  check('no temp file is left in cut/alma', readdirSync(path.join(f1.dir, 'cut', 'alma')).every((n) => !n.endsWith('.tmp')), readdirSync(path.join(f1.dir, 'cut', 'alma')));
  const u1 = await W.undo(store(f1), h1.rev);
  check('the user can undo it: back to v2\'s content', u1.working.tracks[1].clips[0].text === 'line 2');
  await W.redo(store(f1), u1.working.rev);
  keep(f1.dir);

  // ---- 2. the same drop twice, and after a crash before its answer
  console.log('\n== the same drop seen twice');
  const before2 = tree(f1.dir, (r) => r.startsWith('renders'));
  const again = await A.takeIn(target(f1), d1);
  check('a drop already answered is left alone: nothing is written', again.already === true && JSON.stringify(tree(f1.dir, (r) => r.startsWith('renders'))) === JSON.stringify(before2));
  const cur1 = (await W.peekWorking(store(f1)))!.working;
  const d1b = drop(f1.dir, { basedOnRev: cur1.rev, note: 'second piece', tracks: tracksOf('alma 2') });
  const r1b = await A.takeIn(target(f1), d1b);
  check('a second drop on the new rev is taken as v4', r1b.answer?.taken === true && (r1b.answer as { version?: string }).version === 'v4', r1b.answer);
  const afterB = historyOf(f1);
  unlinkSync(d1b.replace(/\.json$/, '.answer.json'));   // the test plays a crash between the version and the answer
  const r1c = await A.takeIn(target(f1), d1b);
  check('after a crash before its answer, the drop is answered as it was taken, not taken twice', r1c.answer?.taken === true && (r1c.answer as { version?: string }).version === 'v4' && historyOf(f1).steps.length === afterB.steps.length && versionFiles(f1.dir).length === 4, r1c.answer);
  keep(f1.dir);

  // ---- 3. a stale drop
  console.log('\n== a stale drop');
  const w3 = (await W.peekWorking(store(f1)))!.working;
  const p3 = await W.step(store(f1), { rev: w3.rev, words: 'moved line 1 +6 f', tracks: tracksOf('user 3') });
  const before3 = tree(f1.dir, (r) => r.startsWith('cut/alma') || r.startsWith('cut/renders'));
  const d3 = drop(f1.dir, { basedOnRev: w3.rev, note: 'from a stale read', tracks: tracksOf('alma 3') });
  const r3 = await A.takeIn(target(f1), d3);
  const ans3 = answerOf(d3) as { taken: boolean; why: string; rev: number; since: string[] };
  check('refused: taken false, the rev now and the words of the steps since', ans3.taken === false && ans3.rev === p3.working.rev && ans3.since.join('|') === 'moved line 1 +6 f' && /changed after you read it/.test(ans3.why) && /Read cut\/working\.json again/.test(ans3.why), ans3);
  check('its words are plain: no dash as punctuation', !/ [-–—] /.test(ans3.why), ans3.why);
  check('nothing is written to the cut', JSON.stringify(tree(f1.dir, (r) => r.startsWith('cut/alma') || r.startsWith('cut/renders'))) === JSON.stringify(before3) && r3.answer?.taken === false);
  keep(f1.dir);

  // ---- 4. a cut that does not check out
  console.log('\n== a drop whose cut does not check out');
  const w4 = (await W.peekWorking(store(f1)))!.working;
  const bad: TimelineTrack[] = [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src: 'media/missing.mp4', in: 0, out: 2, at: 0 }] },
    { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: 'one\ntwo\nthree', in: 0, out: 2, at: 0 }] },
  ];
  const before4 = tree(f1.dir, (r) => r.startsWith('cut/alma') || r.startsWith('cut/renders'));
  const d4 = drop(f1.dir, { basedOnRev: w4.rev, note: 'a broken cut', tracks: bad });
  await A.takeIn(target(f1), d4);
  const ans4 = answerOf(d4) as { taken: boolean; why: string; problems: string[] };
  let pageProblems: string[] = [];
  try { await W.step(store(f1), { rev: w4.rev, words: 'the page', tracks: bad }); } catch (e) { pageProblems = (e as { problems: string[] }).problems; }
  check('refused with the problems', ans4.taken === false && ans4.problems.length > 0 && /does not check out/.test(ans4.why), ans4);
  check('the same problems the page\'s step gets', JSON.stringify(ans4.problems) === JSON.stringify(pageProblems) && pageProblems.length > 0, { drop: ans4.problems, page: pageProblems });
  check('nothing written to the cut', JSON.stringify(tree(f1.dir, (r) => r.startsWith('cut/alma') || r.startsWith('cut/renders'))) === JSON.stringify(before4));

  // ---- 5. a drop that changes nothing
  console.log('\n== a drop that changes nothing');
  const f5 = makeFilm();
  const w5 = (await W.ensureWorking(store(f5)))!.working;
  const h5 = historyOf(f5);
  const d5 = drop(f5.dir, { basedOnRev: w5.rev, note: 'nothing really', tracks: tracksOf(2), markers: [] });
  await A.takeIn(target(f5), d5);
  const ans5 = answerOf(d5);
  check('{taken: true, same: true, rev, version}: the version with that content', ans5.taken === true && ans5.same === true && ans5.version === 'v2' && ans5.rev === w5.rev, ans5);
  check('no step, no version', historyOf(f5).steps.length === h5.steps.length && historyOf(f5).rev === h5.rev && versionFiles(f5.dir).length === 2);
  const s5 = await W.step(store(f5), { rev: w5.rev, words: 'an unsaved edit', tracks: tracksOf('unsaved') });
  const d5b = drop(f5.dir, { basedOnRev: s5.working.rev, note: 'nothing again', tracks: tracksOf('unsaved') });
  await A.takeIn(target(f5), d5b);
  const ans5b = answerOf(d5b);
  check('on unsaved edits: same, no version name, "unsaved" and words saying so', ans5b.taken === true && ans5b.same === true && ans5b.version === undefined && ans5b.unsaved === true && /not saved as a version/.test(String(ans5b.why)), ans5b);
  check('and no version is written for the user\'s edits', versionFiles(f5.dir).length === 2);
  keep(f5.dir);

  // ---- 6. files that are not drops
  console.log('\n== half-written, not JSON, wrong shape, wrong name');
  const w6 = (await W.peekWorking(store(f5)))!.working;
  const before6 = tree(f5.dir, (r) => r.startsWith('cut/alma') || r.startsWith('cut/renders'));
  const half = path.join(f5.dir, 'cut', 'alma', '20261114-110000.json');
  writeFileSync(half, '{"basedOnRev": 3, "note": "half', 'utf8');    // written in place, never finished
  const t6 = Date.now();
  const r6 = await A.takeIn(target(f5), half);
  check('a half-written file is read again for about two seconds, then refused in plain words', r6.answer?.taken === false && /not complete JSON/.test((r6.answer as { why: string }).why) && /temp name/.test((r6.answer as { why: string }).why) && Date.now() - t6 >= 2000, r6.answer);
  const late = path.join(f5.dir, 'cut', 'alma', '20261114-110001.json');
  writeFileSync(late, '{"basedOnRev": ', 'utf8');
  setTimeout(() => writeFileSync(late, JSON.stringify({ basedOnRev: w6.rev, note: 'finished late', tracks: tracksOf('late') })), 500);
  const r6b = await A.takeIn(target(f5), late);
  check('one that is finished while it is read again is taken', r6b.answer?.taken === true, r6b.answer);
  const after6 = (await W.peekWorking(store(f5)))!.working;
  const notJson = drop(f5.dir, 'hello, this is not JSON');
  check('not JSON: refused', (await A.takeIn(target(f5), notJson)).answer?.taken === false);
  const shape = drop(f5.dir, { basedOnRev: 'x', tracks: [] });
  const r6c = await A.takeIn(target(f5), shape);
  check('the wrong shape: refused, each problem said', r6c.answer?.taken === false && ((r6c.answer as { problems?: string[] }).problems ?? []).length === 3, r6c.answer);
  const named = drop(f5.dir, { basedOnRev: after6.rev, note: 'x', tracks: tracksOf(9) }, 'my-change');
  const r6d = await A.takeIn(target(f5), named);
  check('a wrong name: refused, the right form said', r6d.answer?.taken === false && /YYYYMMDD-HHMMSS\.json/.test((r6d.answer as { why: string }).why), r6d.answer);
  check('none of them wrote to the cut but the one finished late', versionFiles(f5.dir).join() === 'v1.json,v2.json,v3.json' && Object.keys(before6).filter((k) => /^cut\/v\d+\.json$/.test(k)).length === 2);
  check('answers, an answer file, a temp name and a hidden file are not drops', !A.isDropFile('20261114-110000.answer.json') && !A.isDropFile('20261114-110000.json.tmp') && !A.isDropFile('.20261114-110000.json') && A.isDropFile('20261114-110000.json'));
  keep(f5.dir);

  // ---- 7. a page step and a drop fired together
  console.log('\n== a page step and a drop fired together');
  for (const first of ['step', 'drop'] as const) {
    const f7 = makeFilm();
    const w7 = (await W.ensureWorking(store(f7)))!.working;
    const n7 = historyOf(f7).steps.length;
    const d7 = drop(f7.dir, { basedOnRev: w7.rev, note: 'Alma at the same time', tracks: tracksOf('alma 7') });
    const pageStep = () => W.step(store(f7), { rev: w7.rev, words: 'the user at the same time', tracks: tracksOf('user 7') }).then(() => 'landed', (e) => `refused: ${(e as { code?: string }).code}`);
    // both are called in the same tick, without waiting: the queue alone decides which lands
    let pp: Promise<string>, dp: ReturnType<typeof A.takeIn>;
    if (first === 'step') { pp = pageStep(); dp = A.takeIn(target(f7), d7); } else { dp = A.takeIn(target(f7), d7); pp = pageStep(); }
    const [pg, dr] = await Promise.all([pp, dp]);
    const hh = historyOf(f7);
    const landed = [pg === 'landed', dr.answer?.taken === true].filter(Boolean).length;
    check(`${first} first: exactly one lands, the other is refused (page: ${pg}; drop: ${dr.answer?.taken ? 'taken' : 'refused'})`, landed === 1 && hh.steps.length === n7 + 1 && (first === 'step' ? pg === 'landed' && dr.answer?.taken === false : pg === 'refused: stale' && dr.answer?.taken === true), { pg, dr: dr.answer });
    check(`${first} first: the working cut is the one that landed, whole`, (await textOf(f7)) === (first === 'step' ? 'line user 7' : 'line alma 7') && versionFiles(f7.dir).length === (first === 'step' ? 2 : 3));
    keep(f7.dir);
  }

  // ---- 8. the fallback: a version written by hand
  console.log('\n== a version written by hand (Alma on the old recipe)');
  const f8 = makeFilm();
  const w8 = (await W.ensureWorking(store(f8)))!.working;
  let s8 = await W.step(store(f8), { rev: w8.rev, words: 'user edit 1', tracks: tracksOf('u1') });
  s8 = await W.step(store(f8), { rev: s8.working.rev, words: 'user edit 2', tracks: tracksOf('u2') });
  await W.step(store(f8), { rev: s8.working.rev, words: 'user edit 3', tracks: tracksOf('u3') });
  const n8 = historyOf(f8).steps.length;
  writeFileSync(path.join(f8.dir, 'cut', 'v3.json'), versionText('v3', 'hand', 'S3 swapped take 2 for take 3', 'v2', 'alma'));
  const v3hand = hash(path.join(f8.dir, 'cut', 'v3.json'));
  const r8 = await A.takeInVersion(target(f8), 'v3');
  const h8 = historyOf(f8);
  const top = h8.steps[h8.at];
  check('one step on top, by Alma, "Alma: <note>", marked saved v3', r8.took === 'step' && h8.steps.length === n8 + 1 && top.by === 'alma' && top.saved === 'v3' && top.words.startsWith('Alma: S3 swapped take 2 for take 3'), top);
  check('its words say it went over the unsaved edits and that Undo brings them back', top.words === 'Alma: S3 swapped take 2 for take 3, over 3 edits not saved as a version; Undo brings them back', top.words);
  const wk8 = (await W.peekWorking(store(f8)))!.working;
  check('the working cut is the version, saved', wk8.tracks[1].clips[0].text === 'line hand' && wk8.edited === false && wk8.version === 'v3');
  const u8 = await W.undo(store(f8), wk8.rev);
  check('one undo brings the user\'s unsaved edits back', u8.working.tracks[1].clips[0].text === 'line u3' && u8.working.edited === true);
  await W.redo(store(f8), u8.working.rev);
  check('the version file is untouched', hash(path.join(f8.dir, 'cut', 'v3.json')) === v3hand);
  const r8b = await A.takeInVersion(target(f8), 'v3');
  check('seen again (a second file event), it is not taken twice', !!r8b.skipped && historyOf(f8).steps.length === n8 + 1, r8b);
  const r8c = await A.takeInVersion(target(f8), 'v1');
  check('an older version is never taken as one written by hand', !!r8c.skipped, r8c);
  writeFileSync(path.join(f8.dir, 'cut', 'v4.json'), versionText('v4', 'hand', 'the same again', 'v3', 'alma'));
  const r8d = await A.takeInVersion(target(f8), 'v4');
  check('a hand-written version equal to the cut adds no step, only marks it', r8d.took === 'mark' && historyOf(f8).steps.length === n8 + 1, r8d);
  writeFileSync(path.join(f8.dir, 'cut', 'v5.json'), versionText('v5', 'by user', 'a user wrote this file', 'v4', 'user'));
  const r8e = await A.takeInVersion(target(f8), 'v5');
  check('a version file that says it is the user\'s keeps `by: user`, its words say it was written on disk', r8e.took === 'step' && historyOf(f8).steps.at(-1)!.by === 'user' && r8e.words === 'v5 written on disk: a user wrote this file', r8e);
  const broken = { ...JSON.parse(versionText('v6', 'x', 'broken', 'v5', 'alma')), tracks: [{ id: 'V1', kind: 'video', clips: [{ id: 'c1', src: 'media/missing.mp4', in: 0, out: 2, at: 0 }] }] };
  writeFileSync(path.join(f8.dir, 'cut', 'v6.json'), JSON.stringify(broken));
  const r8f = await A.takeInVersion(target(f8), 'v6');
  check('one that does not check out is not taken in (its refusal stays the check\'s log)', !!r8f.skipped && /check out/.test(r8f.skipped) && historyOf(f8).steps.length === n8 + 2, r8f);
  const f8b = makeFilm();
  writeFileSync(path.join(f8b.dir, 'cut', 'v3.json'), versionText('v3', 'hand', 'no working cut yet', 'v2', 'alma'));
  check('a film with no working cut yet: nothing (the history is seeded from the newest version when made)', !!(await A.takeInVersion(target(f8b), 'v3')).skipped && !existsSync(path.join(f8b.dir, 'harness')));
  keep(f8.dir);

  // ---- 9. the old route: server-written, and the working cut comes along
  console.log('\n== a version written by the old POST …/cut');
  const f9 = makeFilm();
  const w9 = (await W.ensureWorking(store(f9)))!.working;
  const s9 = await W.step(store(f9), { rev: w9.rev, words: 'an edit through the new route', tracks: tracksOf('new') });
  const n9 = historyOf(f9).steps.length;
  const t9 = await A.writePageVersion(target(f9), { basedOn: 'v2', note: 'moved S2 +12 f', by: 'user', tracks: tracksOf('old route') });
  const h9 = historyOf(f9);
  check('the version is written as before (v3, the page\'s note)', t9.version === 'v3' && readJson<Timeline>(path.join(f9.dir, 'cut', 'v3.json')).note === 'moved S2 +12 f');
  check('the working cut comes along: one step by the user, the version\'s note, marked saved', h9.steps.length === n9 + 1 && h9.steps[h9.at].by === 'user' && h9.steps[h9.at].words === 'moved S2 +12 f' && h9.steps[h9.at].saved === 'v3' && h9.rev > s9.working.rev, h9.steps[h9.at]);
  const wk9 = (await W.peekWorking(store(f9)))!.working;
  check('the working cut is that version, not edited', wk9.tracks[1].clips[0].text === 'line old route' && wk9.edited === false && wk9.version === 'v3');
  check('the server knows it wrote it', T.writtenByServer(target(f9), 'v3') && !T.writtenByServer(target(f8), 'v3'));
  const r9 = await A.takeInVersion(target(f9), 'v3');
  check('so its file event is not taken as a version written by hand', !!r9.skipped && historyOf(f9).steps.length === n9 + 1, r9);
  const t9b = await A.writePageVersion(target(f9), { basedOn: 'v3', note: 'nothing new', by: 'user', tracks: tracksOf('old route') }).catch((e: Error) => e);
  check('the old route\'s own checks stay (the same content still writes; a stale basedOn is refused)', !(t9b instanceof Error) && (await A.writePageVersion(target(f9), { basedOn: 'v2', note: 'stale', tracks: tracksOf(1) }).then(() => false, (e: { status?: number }) => e.status === 409)));
  check('a version equal to the cut marks its step, no new step', historyOf(f9).steps.length === n9 + 1 && historyOf(f9).steps.at(-1)!.saved === 'v4');
  const f9b = makeFilm();
  await A.writePageVersion(target(f9b), { basedOn: 'v2', note: 'no working cut', tracks: tracksOf(3) });
  check('with no working cut, the old route makes none', !existsSync(path.join(f9b.dir, 'harness')) && versionFiles(f9b.dir).length === 3);
  // a restart: the memory of what the server wrote is gone; the history's saved marks say the same
  const gsw = globalThis as unknown as { __serverVersions?: Set<string> };
  const remembered = new Set(gsw.__serverVersions);
  gsw.__serverVersions!.clear();
  const saved9 = await W.save(store(f9), { rev: (await W.step(store(f9), { rev: historyOf(f9).rev, words: 'saved by the user', tracks: tracksOf('saved') })).working.rev, why: 'you' });
  gsw.__serverVersions!.clear();
  writeFileSync(path.join(f9.dir, 'cut', 'v6.json'), versionText('v6', 'down', 'written while the server was down', 'v5', 'alma'));
  const n9b = historyOf(f9).steps.length;
  const waited = await A.takeInWaiting(target(f9));
  check('after a restart, the server\'s own versions are known from the history; only the hand-written one is taken', saved9.version === 'v5' && waited.length === 1 && (waited[0] as { took?: string }).took === 'step' && historyOf(f9).steps.length === n9b + 1 && historyOf(f9).steps.at(-1)!.saved === 'v6', waited);
  for (const x of remembered) gsw.__serverVersions!.add(x);
  keep(f9.dir);

  // ---- 10. at start, oldest first, and live through the real watcher
  console.log('\n== drops waiting at start, oldest first; then live, through the watcher');
  const f10 = makeFilm();
  const w10 = (await W.ensureWorking(store(f10)))!.working;
  const older = drop(f10.dir, { basedOnRev: w10.rev, note: 'the older drop', tracks: tracksOf('first') }, '20261114-090000');
  const newer = drop(f10.dir, { basedOnRev: w10.rev + 2, note: 'the newer drop', tracks: tracksOf('second') }, '20261114-090500');
  const stale = drop(f10.dir, { basedOnRev: w10.rev, note: 'a stale one', tracks: tracksOf('third') }, '20261114-091000');
  const t0 = Date.now() / 1000;
  utimesSync(older, t0 - 300, t0 - 300);
  utimesSync(newer, t0 - 200, t0 - 200);
  utimesSync(stale, t0 - 100, t0 - 100);
  delete process.env.HARNESS_NO_CUT_WATCH;
  const Wt = await import('../src/server/edit/watch');
  const film10 = await T.cutFilm(f10.slug);
  Wt.ensureCutWatch(film10);
  check('all three are answered at start', await until(() => [older, newer, stale].every((f) => existsSync(f.replace(/\.json$/, '.answer.json')))));
  check('oldest first: the older is v3, the newer (based on its rev) v4, the stale one refused with both since', answerOf(older).version === 'v3' && answerOf(newer).version === 'v4' && answerOf(stale).taken === false && JSON.stringify(answerOf(stale).since) === JSON.stringify(['Alma: the older drop', 'Alma: the newer drop']), [answerOf(older), answerOf(newer), answerOf(stale)]);
  check('the versions carry their notes in that order', readJson<Timeline>(path.join(f10.dir, 'cut', 'v3.json')).note === 'the older drop' && readJson<Timeline>(path.join(f10.dir, 'cut', 'v4.json')).note === 'the newer drop');
  const w10b = (await W.peekWorking(store(f10)))!.working;
  const live = drop(f10.dir, { basedOnRev: w10b.rev, note: 'a live drop', tracks: tracksOf('live') });
  check('a live drop is answered through the watcher', await until(() => existsSync(live.replace(/\.json$/, '.answer.json'))) && answerOf(live).version === 'v5', existsSync(live.replace(/\.json$/, '.answer.json')) ? answerOf(live) : 'no answer');
  await sleep(1200);   // the watcher sees v5 (server-written) and the answer: neither may start anything
  const n10 = historyOf(f10).steps.length;
  writeFileSync(path.join(f10.dir, 'cut', 'v6.json'), versionText('v6', 'live hand', 'written by hand, live', 'v5', 'alma'));
  check('a version written by hand is taken in through the watcher', await until(() => historyOf(f10).steps.length === n10 + 1) && historyOf(f10).steps.at(-1)!.words === 'Alma: written by hand, live' && historyOf(f10).steps.at(-1)!.saved === 'v6', historyOf(f10).steps.at(-1));
  await sleep(1200);
  check('the server\'s own versions brought no extra step through the watcher', historyOf(f10).steps.filter((s) => s.saved === 'v5').length === 1 && historyOf(f10).steps.length === n10 + 1);
  keep(f10.dir);

  // ---- 11. nothing deleted or changed
  console.log('\n== nothing deleted, nothing written over');
  const changed = Object.entries(kept).filter(([f, h]) => !existsSync(f) || hash(f) !== h).map(([f]) => path.relative(repo, f));
  // a crash was played in 2 by removing one answer: the app wrote it again, the same
  check(`every version, drop and answer seen (${Object.keys(kept).length}) is still there, byte for byte`, changed.length === 0, changed);
  check('no temp file left in any cut/alma', readdirSync(path.join(repo, 'assets', 'films')).every((s) => !existsSync(path.join(repo, 'assets', 'films', s, 'cut', 'alma')) || readdirSync(path.join(repo, 'assets', 'films', s, 'cut', 'alma')).every((n) => !n.endsWith('.tmp'))));

  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, (e) => {
  console.error(e);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
