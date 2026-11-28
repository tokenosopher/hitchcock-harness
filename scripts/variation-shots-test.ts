// A variation of only some shots of a take: variation.json's `shots` read leniently, matched to the take's
// shots as the Takes view names them, and the words the row says. Run: npx tsx scripts/variation-shots-test.ts
import assert from 'node:assert/strict';
import { readVariation } from '../src/server/edit/shots';
import { shotsOf, type TakeShots } from '../src/components/edit/shots';
import { changedPlaces, readVariedShots, shotsWords, variedOf } from '../src/components/edit/variedShots';
import { mockShots } from '../src/fixtures/shots';

let n = 0, bad = 0;
const ok = (name: string, f: () => void) => { n++; try { f(); } catch (e) { bad++; console.log(`FAIL ${name}: ${(e as Error).message}`); } };

// a real S1 take 3: eight shots, its shots file names them 1 2 3 4A 4B 5 6 7
const take3: TakeShots = { src: 'assets/films/x/generations/S1/takes/take3/S1-take3-480p.mp4', scene: 'S1', name: 'take 3', seconds: 27.04,
  cuts: [2.21, 7.13, 9.88, 11.67, 14.79, 17.42, 22.42], ids: [1, 2, 3, 4, 4, 5, 6, 7], tags: ['1', '2', '3', '4a', '4b', '5', '6', '7'], state: 'ready' };
const shots = shotsOf(take3);

ok('readVariedShots: lenient, normalized, once each', () => {
  assert.deepEqual(readVariedShots(['3']), ['3']);
  assert.deepEqual(readVariedShots(['4A', ' 4a ', 'shot 4a', 3, 'Shot 3']), ['4a', '3']);
  assert.deepEqual(readVariedShots(['03', 'shots 5']), ['3', '5']);
  assert.equal(readVariedShots([]), undefined);
  assert.equal(readVariedShots(['nonsense', '', 0, null, {}]), undefined);
  assert.equal(readVariedShots('3'), undefined);
  assert.equal(readVariedShots(undefined), undefined);
});

ok('readVariation keeps shots, and leaves it out when absent or empty', () => {
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't', shots: ['3'] }), { from: 'a.mp4', note: 'n', startedAt: 't', shots: ['3'] });
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't', shots: ['4A'] })!.shots, ['4a']);
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't', shots: [] }), { from: 'a.mp4', note: 'n', startedAt: 't' });
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't' }), { from: 'a.mp4', note: 'n', startedAt: 't' });
});

ok('the two real variations: shot 3 and shot 4a of take 3', () => {
  const one = variedOf(shots, ['3'])!;
  assert.equal(one.words, 'shot 3 only');
  assert.deepEqual([...one.changed!], [3]);
  const two = variedOf(shots, readVariedShots(['4a']))!;
  assert.equal(two.words, 'shot 4a only');
  assert.deepEqual([...two.changed!], [4], 'only 4a, not 4b');
  const both = variedOf(shots, ['4a', '3'])!;
  assert.equal(both.words, 'shots 3 and 4a', 'in the take\'s order');
});

ok('a bare number names every shot under its column; a name that matches nothing is ignored', () => {
  assert.deepEqual([...changedPlaces(shots, ['4'])!], [4, 5]);
  assert.equal(variedOf(shots, ['4'])!.words, 'shots 4a and 4b');
  assert.deepEqual([...changedPlaces(shots, ['9', '3'])!], [3]);
  assert.equal(changedPlaces(shots, ['9']), undefined);
  assert.equal(variedOf(shots, ['9']), undefined, 'nothing matches: the whole take, as today');
  assert.equal(variedOf(shots, ['3a']), undefined, 'a letter the take does not have');
  assert.equal(variedOf(shots, undefined), undefined);
  assert.equal(variedOf(shots, []), undefined);
});

ok('an ordinary take (shots 1, 2, 3 …) and a take with no shots yet', () => {
  const plain: TakeShots = { src: 's', scene: 'S2', name: 'take 1', seconds: 6, cuts: [2, 4], state: 'ready' };
  assert.deepEqual([...variedOf(shotsOf(plain), ['2'])!.changed!], [2]);
  assert.deepEqual(variedOf([], ['3', '4a']), { words: 'shots 3 and 4a' }, 'being made: the ids as written');
});

ok('words', () => {
  assert.equal(shotsWords(['3']), 'shot 3 only');
  assert.equal(shotsWords(['3', '4a']), 'shots 3 and 4a');
  assert.equal(shotsWords(['2', '3', '5']), 'shots 2, 3 and 5');
});

ok('the sample film: S3 sample take A variation 1 changed only shot 2', () => {
  const v1 = mockShots('the-lighthouse').takes.find((t) => t.scene === 'S3' && t.name === 'sample take A variation 1')!;
  assert.deepEqual(v1.variation?.shots, ['2']);
  const vs = variedOf(shotsOf(v1), v1.variation!.shots)!;
  assert.equal(vs.words, 'shot 2 only');
  assert.deepEqual([...vs.changed!], [2]);
});

console.log(`${n - bad}/${n} passed`);
if (bad) process.exit(1);
