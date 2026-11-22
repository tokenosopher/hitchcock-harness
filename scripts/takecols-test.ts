// npm run takecols:test
// The Takes view's columns: the shots of every take one under the other, with nothing to ask each time new takes
// land. Every take's shot
// sits under the column of the scene's shot its id names: "4" under Shot 4, "7a" and "7b" side by side under Shot 7; a
// take whose ids are 1, 2, 3 … or that has none, or whose ids do not fit its shots, keeps its shots left to right. On the
// a real film’s numbers (S4 take 1, FIX-S4-reel, FIX-S4-tap, FIX-S1-sit, FIX-S3-bench), a brand-new
// pick-up "3a"/"3b", broken files, the fallback to the previz take a take's sent record names, the cut's marks, putting a
// shot with a letter in and taking it out; and, through the server's reader on a small film in the temp folder, that a
// shots file written after its take landed places the take the next time the takes are read, with nothing refreshed.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline, TimelineClip } from '../src/server/types';
import { cellLabel, cellP, cellsOf, columnBox, columnsOf, columnWeights, fromCellP, gridColumns, parseShotId, readShotTags, shotTagsFor } from '../src/components/edit/shotCols';
import { inFilm, pickKey, picksWords, putShot, samePlace, shotKey, shotOf, shotsOf, shotTimeline, takeOutShot, type BySrc, type TakeShots } from '../src/components/edit/shots';
import { filmShots } from '../src/server/edit/shots';
import { REEL_FILE, TAP_FILE, TRIM_FIX, TRIM_TAKE, TRIM_TAP, trimSampleTakes } from '../src/fixtures/trim';

let n = 0;
const ok = async (what: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`ok · ${what}`); };

/** A take as the server gives it: its cuts, and what its shots files say (shotTagsFor). */
const take = (src: string, scene: string, seconds: number, cuts: number[], ...files: unknown[]): TakeShots =>
  ({ src, scene, name: src, seconds, cuts, state: 'ready', ...(shotTagsFor(files.map((f) => readShotTags(f)), cuts) ?? {}) });
/** Where a take's shots stand: a column's cell as its ids, '' for an empty one. */
const row = (t: TakeShots, cols: number) => cellsOf(shotsOf(t), cols).map((c) => c.map((s) => s.tag ?? String(s.n)).join('+'));
const file = (...ids: unknown[]) => ({ duration: 10, shots: ids.map((id) => ({ id, t0: 0, t1: 1 })) });

// the real film's numbers (harness/shots.json and the generations' shots files, read on 21 Nov 2026)
const S4 = take('S4', 'S4', 26.041667, [2.333333, 4.291667, 8.333333, 10.583333, 13.291667, 15.708333, 19.916667, 22.708333], file('1', '2', '3', '4', '5', '6', '7', '8', '9'));
const REEL = take('REEL', 'S4', 10.041667, [3.75, 6.875], REEL_FILE);
const TAP = take('TAP', 'S4', 5.041667, [], TAP_FILE);
const S1 = take('S1', 'S1', 15.041667, [5.541667, 9.875, 13.041667], file('1', '2', '3', '4'));
const SIT = take('SIT', 'S1', 8.041667, [4.875], { duration: 15, shots: [{ id: '2', t0: 4, t1: 8 }, { id: '2b', t0: 8, t1: 12 }] });
const BENCH = take('BENCH', 'S3', 7.041667, [], { duration: 7, shots: [{ id: '1', t0: 0, t1: 5 }, { id: '4', t0: 5, t1: 7 }] });

async function main(): Promise<void> {
  await ok('a shot id: a whole number from 1, with at most one letter after it', () => {
    assert.deepEqual(parseShotId('7'), { n: 7, tag: '7' });
    assert.deepEqual(parseShotId('7a'), { n: 7, tag: '7a' });
    assert.deepEqual(parseShotId(' 2B '), { n: 2, tag: '2b' });
    assert.deepEqual(parseShotId(5), { n: 5, tag: '5' });
    for (const bad of ['0', 'a7', '7ab', '7-a', '', ' ', '1.5', null, undefined, 2.5, 0, -1, {}, []]) assert.equal(parseShotId(bad), undefined, JSON.stringify(bad));
  });

  await ok('a shots file read leniently: its ids in order; none when one is not an id or comes twice', () => {
    assert.deepEqual(readShotTags(REEL_FILE), ['1', '7a', '7b']);
    assert.deepEqual(readShotTags(TAP_FILE), ['7a']);
    assert.deepEqual(readShotTags([{ id: 3 }, { id: '4' }]), ['3', '4']);
    assert.equal(readShotTags(file('7a', '7a')), undefined, 'a repeat');
    assert.equal(readShotTags(file('1', 'x')), undefined, 'not an id');
    assert.equal(readShotTags(file('1', undefined)), undefined, 'no id');
    assert.equal(readShotTags({ shots: [] }), undefined);
    assert.equal(readShotTags('nonsense'), undefined);
    assert.equal(readShotTags(null), undefined);
  });

  await ok('S4: take 1 in Shots 1-9 as before; FIX-S4-reel "1" under Shot 1, "7a" and "7b" both under Shot 7; FIX-S4-tap "7a" under Shot 7', () => {
    assert.equal(S4.ids, undefined, 'take 1: 1 to 9, nothing carried');
    const cols = columnsOf([S4, REEL, TAP].map(shotsOf));
    assert.equal(cols, 9);
    assert.deepEqual(row(S4, cols), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    assert.deepEqual(row(REEL, cols), ['1', '', '', '', '', '', '7a+7b', '', '']);
    assert.deepEqual(row(TAP, cols), ['', '', '', '', '', '', '7a', '', '']);
    assert.deepEqual(REEL.ids, [1, 7, 7]);
    assert.deepEqual(REEL.tags, ['1', '7a', '7b']);
    // the shots keep their own times: the reel's second and third shots are its 3.75 → 6.875 and 6.875 → 10.04
    assert.deepEqual(shotsOf(REEL).map((s) => [s.n, s.i, s.in, s.out, s.tag]), [[1, 1, 0, 3.75, '1'], [7, 2, 3.75, 6.875, '7a'], [7, 3, 6.875, 10.041667, '7b']]);
  });

  await ok('S1: FIX-S1-sit "2" and "2b" both under Shot 2 (its shots file times are the scene\'s, not the take\'s: matched in order)', () => {
    const cols = columnsOf([S1, SIT].map(shotsOf));
    assert.deepEqual(row(S1, cols), ['1', '2', '3', '4']);
    assert.deepEqual(row(SIT, cols), ['', '2+2b', '', '']);
  });

  await ok('S3: FIX-S3-bench lists "1" and "4" but was cut into one shot: left to right, under Shot 1 (as before); cut in two, under 1 and 4', () => {
    assert.equal(BENCH.ids, undefined);
    const S3 = take('S3', 'S3', 17.041667, [4.208333, 9.208333, 13.416667], file('1', '2', '3', '4'));
    assert.deepEqual(row(S3, 4), ['1', '2', '3', '4']);
    assert.deepEqual(row(BENCH, 4), ['1', '', '', '']);
    const two = take('BENCH2', 'S3', 7.041667, [5], { shots: [{ id: '1' }, { id: '4' }] });
    assert.deepEqual(two.ids, [1, 4]);
    assert.equal(two.tags, undefined, 'plain numbers: no tags, the take as before');
    assert.deepEqual(row(two, 4), ['1', '', '', '4']);
  });

  await ok('a brand-new pick-up "3a"/"3b" lands under Shot 3, and nothing else changes', () => {
    const T1 = take('T1', 'S9', 12, [2, 4, 7, 9], file('1', '2', '3', '4', '5'));
    const before = { cols: columnsOf([shotsOf(T1)]), row: row(T1, 5), weights: columnWeights([shotsOf(T1)], 5) };
    const NEW = take('NEW', 'S9', 6, [3], { duration: 6, shots: [{ id: '3a', t0: 0, t1: 3 }, { id: '3b', t0: 3, t1: 6 }] });
    const lists = [T1, NEW].map(shotsOf);
    const cols = columnsOf(lists);
    assert.equal(cols, before.cols, 'no column added');
    assert.deepEqual(row(T1, cols), before.row, 'take 1 where it was');
    assert.deepEqual(row(NEW, cols), ['', '', '3a+3b', '', '']);
    assert.deepEqual(before.weights, [1, 1, 1, 1, 1]);
    assert.deepEqual(columnWeights(lists, cols), [1, 1, 2, 1, 1], 'Shot 3 as wide as its two shots side by side');
    assert.deepEqual(shotsOf(NEW).map((s) => cellLabel(s, true)), ['3a', '3b'], 'each named');
  });

  await ok('columns: a pick-up\'s number past the scene\'s shots adds its column at the end; the cells between stay empty', () => {
    const PU = take('PU', 'S4', 4, [2], file('2', '11'));
    const cols = columnsOf([S4, PU].map(shotsOf));
    assert.equal(cols, 11);
    assert.deepEqual(row(PU, cols), ['', '2', '', '', '', '', '', '', '', '', '11']);
    assert.deepEqual(row(S4, cols).slice(9), ['', ''], 'take 1 has nothing in Shots 10 and 11');
  });

  await ok('no ids, ids that do not fit, broken files, odd takes: left to right, never a throw', () => {
    const plain = (t: TakeShots) => assert.deepEqual(shotsOf(t).map((s) => s.n), shotsOf({ ...t, ids: undefined, tags: undefined }).map((s) => s.n));
    plain(take('A', 'S1', 6, [2, 4]));                                          // no shots file
    plain(take('B', 'S1', 6, [2, 4], file('1', '7a')));                         // two ids, three shots
    plain(take('C', 'S1', 6, [2, 4], file('1', 'x', '3')));                     // a broken id
    plain(take('D', 'S1', 6, [2, 4], file('5', '5', '6')));                     // a repeat
    plain(take('E', 'S1', 6, [2, 4], file('1', '2', '3')));                     // 1, 2, 3 already
    // a take handed to the page with ids that do not hold together
    const odd: TakeShots[] = [
      { src: 'o1', scene: 'S1', name: 'o', seconds: 6, cuts: [3], ids: [7, 7], state: 'ready' },                       // a repeat, nothing to tell them apart
      { src: 'o2', scene: 'S1', name: 'o', seconds: 6, cuts: [3], ids: [7, 7], tags: ['7a'], state: 'ready' },         // tags short
      { src: 'o3', scene: 'S1', name: 'o', seconds: 6, cuts: [3], ids: [7, 8], tags: ['7a', '7b'], state: 'ready' },   // a tag of another number
      { src: 'o4', scene: 'S1', name: 'o', seconds: 6, cuts: [3], ids: [0, 2], state: 'ready' },                       // not a shot number
      { src: 'o5', scene: 'S1', name: 'o', seconds: 6, cuts: [3], ids: [1], state: 'ready' },                          // fewer than its shots
    ];
    assert.deepEqual(odd.map((t) => shotsOf(t).map((s) => s.n)), [[1, 2], [1, 2], [7, 8], [1, 2], [1, 2]]);
    assert.ok(odd.every((t) => shotsOf(t).every((s) => !s.tag || s.n === parseShotId(s.tag)!.n)));
    assert.deepEqual(shotsOf({ src: 'w', scene: 'S1', name: 'w', state: 'waiting' }), [], 'a take not cut yet: no shots');
    assert.deepEqual(cellsOf([], 3), [[], [], []]);
    assert.equal(columnsOf([]), 1);
  });

  await ok('the fallback: the previz take a take\'s sent record names, only when the generation\'s shots file does not fit', () => {
    const sent = readShotTags(REEL_FILE);
    assert.deepEqual(shotTagsFor([undefined, sent], [3.75, 6.875]), { ids: [1, 7, 7], tags: ['1', '7a', '7b'] }, 'no shots file');
    assert.deepEqual(shotTagsFor([['1', '2'], sent], [3.75, 6.875]), { ids: [1, 7, 7], tags: ['1', '7a', '7b'] }, 'a shots file of two for three shots');
    assert.deepEqual(shotTagsFor([['2', '5', '6'], sent], [3.75, 6.875]), { ids: [2, 5, 6] }, 'the shots file first');
    assert.equal(shotTagsFor([undefined, ['1']], [3.75, 6.875]), undefined, 'neither fits');
  });

  await ok('the column geometry: weighted columns for CSS and for the pointer; the line\'s place in a shared cell and back', () => {
    assert.equal(gridColumns([1, 1, 1]), '104px repeat(3, minmax(0, 1fr))', 'ordinary takes: the template as before');
    assert.equal(gridColumns([1, 2, 1]), '104px minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)');
    // 104 + 3 gaps of 4 + 4 shares of 100 = 516
    assert.deepEqual(columnBox([1, 2, 1], 1, 516), { left: 108, width: 100 });
    assert.deepEqual(columnBox([1, 2, 1], 2, 516), { left: 212, width: 200 });
    assert.deepEqual(columnBox([1, 2, 1], 3, 516), { left: 416, width: 100 });
    const reel = shotsOf(REEL), [one, a, b] = reel;
    assert.equal(cellP(reel, one, 0.5), 0.5, 'alone in its cell');
    assert.equal(cellP(reel, a, 0.5), 0.25, '7a: the left half');
    assert.equal(cellP(reel, b, 0.5), 0.75, '7b: the right half');
    assert.equal(fromCellP(reel, b, 0.75), 0.5);
    assert.equal(fromCellP(reel, b, 0.2), 0, 'left of 7b: its start');
    assert.equal(fromCellP(reel, a, 0.9), 1, 'right of 7a: its end');
  });

  // ---- the cut: the marks, a shot with a letter put in and taken out
  const by: BySrc = new Map([S4, REEL, TAP].map((t) => [t.src, t]));
  const clip = (id: string, src: string, inn: number, out: number, at: number, label: string): TimelineClip => ({ id, src, in: inn, out, at, label, takeRef: { scene: 'S4', take: src } });
  const cut = (pic: TimelineClip[]): Timeline => ({
    version: 'v1', fps: 24, width: 480, height: 854, at: '2026-11-21T00:00:00Z', markers: [],
    tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: pic }, { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pic.map((c) => ({ ...c, id: `${c.id}a` })) }],
  } as Timeline);
  // the real cut v22's S4, from 0: reel shot 1, take 1 shots 2-6, the tap (7a), reel 7b, take 1 shots 8 and 9
  const v22 = cut([
    clip('f4a', 'REEL', 0, 3.291667, 0, 'S4 · FIX-S4-reel · take 1 · shot 1'),
    clip('s2', 'S4', 2.333333, 4.291667, 3.291667, 'S4 · take 1 · shot 2'),
    clip('tap', 'TAP', 0, 4, 5.25, 'S4 · FIX-S4-tap · take 1'),
    clip('f4b', 'REEL', 6.875, 10.041667, 9.25, 'S4 · FIX-S4-reel · take 1 · shot 3'),
    clip('s8', 'S4', 20.833333, 22.708333, 12.416667, 'S4 · take 1 · shot 8'),
  ]);
  const v1 = (tl: Timeline) => tl.tracks[0].clips;

  await ok('the marks: each shot with a letter is its own ("REEL#7b", "TAP#7a"); a plain shot as before ("S4#2")', () => {
    assert.deepEqual([...inFilm(v22, by)].sort(), ['REEL#1', 'REEL#7b', 'S4#2', 'S4#8', 'TAP#7a']);
    assert.equal(shotKey('REEL', shotsOf(REEL)[1]), 'REEL#7a');
    assert.equal(shotKey('S4', shotsOf(S4)[1]), 'S4#2');
    assert.equal(pickKey({ src: 'REEL', n: 7, tag: '7b' }), 'REEL#7b');
    assert.equal(shotOf(REEL, 7)?.tag, '7a', 'no tag: the first of the number');
    assert.equal(shotOf(REEL, 7, '7b')?.i, 3);
    assert.equal(shotOf(REEL, 7, '7c'), undefined);
    assert.equal(shotOf(REEL, 1, '1')?.i, 1);
  });

  await ok('putting the reel\'s 7a in: it takes the tap\'s place (the same id), the reel\'s 7b stays; take 1\'s shot 7 takes both', () => {
    const e = putShot(v22, 'S4', 7, REEL, 'FIX-S4-reel · take 1', by, 'x', undefined, undefined, '7a')!;
    assert.ok(e, 'put');
    assert.deepEqual(v1(e.tl).map((c) => c.id), ['f4a', 's2', 'x', 'f4b', 's8']);
    const x = v1(e.tl).find((c) => c.id === 'x')!;
    assert.deepEqual([x.in, x.out, x.label], [3.75, 6.875, 'S4 · FIX-S4-reel · take 1 · shot 7a']);
    assert.match(e.note, /^S4 shot 7a: FIX-S4-reel · take 1/);
    const w = putShot(v22, 'S4', 7, S4, 'take 1', by, 'y')!;
    assert.deepEqual(v1(w.tl).map((c) => c.id), ['f4a', 's2', 'y', 's8'], 'the whole of Shot 7: the tap and the reel\'s 7b');
    assert.equal(putShot(v22, 'S4', 7, REEL, 'FIX-S4-reel · take 1', by, 'z', undefined, undefined, '7b'), undefined, 'already in the film');
  });

  await ok('taking the reel\'s 7b out: only it goes; without a letter the whole of Shot 7 goes, as before', () => {
    const e = takeOutShot(v22, by, 'S4', 7, 'FIX-S4-reel · take 1', '7b')!;
    assert.deepEqual(v1(e.tl).map((c) => c.id), ['f4a', 's2', 'tap', 's8']);
    assert.match(e.note, /^S4 shot 7b taken out/);
    assert.deepEqual(v1(takeOutShot(v22, by, 'S4', 7)!.tl).map((c) => c.id), ['f4a', 's2', 's8']);
  });

  await ok('chosen shots: "7a" and "7b" can be chosen together, a plain shot of the column replaces them; the words say the letters', () => {
    const a = { scene: 'S4', n: 7, src: 'REEL', tag: '7a' }, b = { scene: 'S4', n: 7, src: 'REEL', tag: '7b' }, p = { scene: 'S4', n: 7, src: 'S4' };
    assert.equal(samePlace(a, b), false);
    assert.equal(samePlace(a, { ...a, src: 'TAP' }), true);
    assert.equal(samePlace(a, p), true);
    assert.equal(samePlace({ scene: 'S4', n: 2, src: 'S4' }, { scene: 'S4', n: 2, src: 'X' }), true, 'as before');
    assert.equal(picksWords([a, b, { scene: 'S4', n: 2 }]), 'S4 shots 2, 7a and 7b');
    assert.equal(picksWords([{ scene: 'S2', n: 2 }, { scene: 'S5', n: 3 }, { scene: 'S5', n: 1 }]), 'S2 shot 2, S5 shots 1 and 3', 'as before');
  });

  await ok('the cut shown at its shots: a piece of a shot with a letter is named by it ("shot 7b"), the others as before', () => {
    const whole = cut([clip('r', 'REEL', 0, 10.041667, 0, 'S4 · FIX-S4-reel · take 1')]);
    assert.deepEqual(v1(shotTimeline(whole, by)).map((c) => c.label), ['S4 · REEL · shot 1', 'S4 · REEL · shot 7a', 'S4 · REEL · shot 7b']);
  });

  await ok('the sample film of S4 (MOCK=boards) numbers its pick-ups as the real film\'s', () => {
    const t = trimSampleTakes();
    const get = (src: string) => t.find((x) => x.src === src)!;
    assert.deepEqual(row(get(TRIM_FIX), 9), ['1', '', '', '', '', '', '7a+7b', '', '']);
    assert.deepEqual(row(get(TRIM_TAP), 9), ['', '', '', '', '', '', '7a', '', '']);
    assert.equal(get(TRIM_TAKE).ids, undefined);
  });

  // ---- the server, on a small film in the temp folder: nothing kept to refresh
  const root = mkdtempSync(path.join(os.tmpdir(), 'takecols-test-'));
  process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  const film = { slug: `takecols-${process.pid}`, repo: root, dir: root, title: 't', show: (abs: string) => `assets/films/t/${path.relative(root, abs)}` };
  const put = async (rel: string, body: string) => { await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await fs.writeFile(path.join(root, rel), body); };
  await put('generations/FIX-S4-new/takes/take1/FIX-S4-new-take1-480p.mp4', 'not a video');
  await put('generations/FIX-S4-old/takes/take1/FIX-S4-old-take1-480p.mp4', 'not a video either');
  await put('generations/FIX-S4-old/takes/take1/FIX-S4-old-take1-sent.json', JSON.stringify({ layout: { previz_take: 'previz/FIX-S4-old/FIX-S4-old-previz-take-2.json' } }));
  await put('previz/FIX-S4-old/FIX-S4-old-previz-take-2.json', JSON.stringify({ shots: [{ id: '5a', t0: 0, t1: 2 }, { id: '5b', t0: 2, t1: 4 }] }));
  // the cuts already found for both (as harness/shots.json keeps them), so no ffmpeg runs
  const kept: Record<string, unknown> = {};
  for (const rel of ['generations/FIX-S4-new/takes/take1/FIX-S4-new-take1-480p.mp4', 'generations/FIX-S4-old/takes/take1/FIX-S4-old-take1-480p.mp4']) {
    const st = await fs.stat(path.join(root, rel));
    kept[rel] = { size: st.size, mtime: Math.floor(st.mtimeMs), seconds: 6, cuts: [3] };
  }
  await put('harness/shots.json', JSON.stringify(kept));
  const read = async (name: string) => (await filmShots(film)).takes.find((t) => t.name.startsWith(name))!;

  await ok('the server: a take whose shots file is not written yet is left to right; written, the next read places it, nothing refreshed', async () => {
    const a = await read('FIX S4 new');
    assert.equal(a.state, 'ready');
    assert.deepEqual(shotsOf(a).map((s) => s.n), [1, 2], 'no shots file yet');
    await put('generations/FIX-S4-new/FIX-S4-new-shots.json', JSON.stringify({ duration: 6, shots: [{ id: '3a', t0: 0, t1: 3 }, { id: '3b', t0: 3, t1: 6 }] }));
    const b = await read('FIX S4 new');
    assert.deepEqual(shotsOf(b).map((s) => [s.n, s.tag]), [[3, '3a'], [3, '3b']], 'under Shot 3');
    await put('generations/FIX-S4-new/FIX-S4-new-shots.json', JSON.stringify({ shots: [{ id: '3a' }, { id: 'oops' }] }));
    assert.deepEqual(shotsOf(await read('FIX S4 new')).map((s) => s.n), [1, 2], 'a broken file: left to right again, no throw');
  });

  await ok('the server: no shots file, the previz take its sent record names gives the ids ("5a", "5b" under Shot 5)', async () => {
    const t = await read('FIX S4 old');
    assert.deepEqual(shotsOf(t).map((s) => [s.n, s.tag]), [[5, '5a'], [5, '5b']]);
    await put('generations/FIX-S4-old/takes/take1/FIX-S4-old-take1-sent.json', JSON.stringify({ layout: { previz_take: '../outside.json' } }));
    assert.deepEqual(shotsOf(await read('FIX S4 old')).map((s) => s.n), [1, 2], 'a path out of the film is not read');
  });

  console.log(`ok · ${n} checks`);
}
main().catch((e) => { console.error(e); process.exit(1); });
