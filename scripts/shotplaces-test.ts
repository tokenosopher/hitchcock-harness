// npm run shotplaces:test
// The Shots page's list (components/shots/places.ts): which shot of which take is which place of its scene, on the
// numbers of a made-up film with many pick-ups (its shots files, prompts, checks, the cuts the server found and cut
// v50's clips): FIX-close-S6 calls its shot "10" and stands in place 1; S3's take and
// FIX-tie-S3's take of place 4 are both in the cut; FIX-struggle-S4 adds 4a, 4b and 4c after 4; S5 was replanned whole
// twice (8 → 10 → 9 shots, the last with no take yet) and FIX-S5a redoes part of version 2; S7 take 1 cut once where its
// prompt did not; FIX-S6b's three shots are known only from the cut's names; a take nothing places goes under "other
// takes", never placed by a guess.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { alignCuts, genOf, placeCmp, placeTag, shotPlaces, takeFolder, takeLabel, type GenPlan, type TakeIn } from '../src/components/shots/places';
import { promptShots, readPlan } from '../src/server/films/read/shotlist';
import { shotDetailsHref } from '../src/components/lib/shotHref';

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

const F = 'assets/films/sample-pickups';
const src = (g: string, k = 1, extra = '') => `${F}/generations/${g}/takes/take${k}/${g}-take${k}${extra}-480p.mp4`;
const take = (scene: string, g: string, k: number, seconds: number, cuts: number[], made: number, more: Partial<TakeIn> = {}): TakeIn =>
  ({ src: src(g, k), scene, name: g === scene ? `take ${k}` : `${g} · take ${k}`, seconds, cuts, state: 'ready', made, ...more });
const plan = (...xs: (string | [string, number, number])[]) => xs.map((x) => (typeof x === 'string' ? { id: x } : { id: x[0], t0: x[1], t1: x[2] }));
const seq = (k: number) => Array.from({ length: k }, (_, i) => String(i + 1));
let at = 0;
const clip = (label: string, s: string, inS: number, outS: number, scene: string): TimelineClip => {
  const c: TimelineClip = { id: `c${at}`, src: s, in: inS, out: outS, at, label, takeRef: { scene, take: label.split(' · ').slice(1, -1).join(' · ') } };
  at += outS - inS;
  return c;
};
const cutOf = (clips: TimelineClip[]): Timeline => ({ version: 'v50', fps: 24, width: 1080, height: 1920, at: '', markers: [], tracks: [{ id: 'V1', kind: 'video', name: 'V1', clips } as never] });
const D = (d: number, h = 12) => Date.UTC(2026, 10, d, h);

// ---- S6: version 1 (S6, FIX-S6), version 2 (FIX-S6b, FIX-S6c, FIX-storm-S6, FIX-close-S6, FIX-wide-S6)
const s6v2 = plan(['1', 0, 2.5], ['2', 2.5, 5.5], ['3', 5.5, 8.5], ['4', 8.5, 10], ['5', 10, 16.3], ['6', 16.3, 18.3], ['7', 18.3, 23.3]);
const S6: GenPlan[] = [
  { name: 'S6', scene: 'S6', plan: plan(['1', 0, 3], ['2', 3, 6], ['3', 6, 7.5], ['4', 7.5, 12.8], ['5', 12.8, 14.3], ['6', 14.3, 17]), written: D(21) },
  { name: 'FIX-S6', scene: 'S6', plan: plan(['1', 0, 3], ['2', 3, 6], ['3', 6, 7.5], ['4', 7.5, 13.8], ['5', 13.8, 15.3], ['6', 15.3, 19]), prompt: seq(6), written: D(21, 20) },
  { name: 'FIX-S6b', scene: 'S6', plan: s6v2, prompt: seq(4), written: D(22, 9) },
  { name: 'FIX-S6c', scene: 'S6', plan: s6v2, prompt: ['5', '6', '7'], written: D(22, 10) },
  { name: 'FIX-storm-S6', scene: 'S6', plan: s6v2, prompt: ['5'], written: D(22, 14) },
  { name: 'FIX-close-S6', scene: 'S6', plan: plan(['10', 0, 5]), prompt: ['10'], written: D(23, 9) },
  { name: 'FIX-wide-S6', scene: 'S6', plan: plan(['1', 0, 5]), prompt: ['1'], written: D(23, 10) },
];
const S6T: TakeIn[] = [
  take('S6', 'S6', 1, 17, [3, 6, 7.5, 12.8, 14.3], D(21, 13)),
  take('S6', 'FIX-S6', 1, 19, [2.125, 6.5, 14.041667, 16.458333], D(21, 21), { planned: [3, 6, 7.5, 13.8, 15.3] }),
  take('S6', 'FIX-S6b', 1, 10, [2.375, 4.041667], D(22, 10)),
  take('S6', 'FIX-S6c', 1, 14, [7.25, 9.875], D(22, 11)),
  take('S6', 'FIX-storm-S6', 3, 7, [], D(22, 16)),
  take('S6', 'FIX-close-S6', 1, 5, [], D(23, 9)),
  take('S6', 'FIX-wide-S6', 1, 5, [], D(23, 11)),
];
// ---- S3: FIX-tie-S3 redoes 3 and 4; S3's own shot 4 stays in the cut beside it
const S3: GenPlan[] = [
  { name: 'S3', scene: 'S3', plan: plan(...seq(4)), written: D(21) },
  { name: 'FIX-tie-S3', scene: 'S3', plan: plan('3', '4'), prompt: ['3', '4'], written: D(22) },
];
const S3T = [take('S3', 'S3', 1, 12, [2.92, 5.17, 9.21], D(21, 13)), take('S3', 'FIX-tie-S3', 1, 6, [2.3], D(22, 13))];
// ---- S4: 4a, 4b, 4c after 4 (FIX-struggle-S4)
const S4: GenPlan[] = [
  { name: 'S4', scene: 'S4', plan: plan(...seq(6)), written: D(21) },
  { name: 'FIX-struggle-S4', scene: 'S4', plan: plan('4a', '4b', '4c'), prompt: ['4A', '4B', '4C'], written: D(22) },
];
const S4T = [take('S4', 'S4', 1, 24, [3.4, 6, 8, 10.6, 16.7], D(21, 13)), take('S4', 'FIX-struggle-S4', 1, 8, [2.46, 4.88], D(22, 13))];
// ---- S5: version 1 (8 shots), version 2 (FIX-S5, 10 shots; FIX-S5a its shots 1 to 6 again), version 3 (FIX-cut-S5, 9, no take)
const s5 = [[0, 2.5], [2.5, 5], [5, 8.3], [8.3, 13], [13, 16.4], [16.4, 19.2]] as const;
const S5: GenPlan[] = [
  { name: 'S5', scene: 'S5', plan: plan(...s5.map(([a, b], i) => [String(i + 1), a, b] as [string, number, number]), ['7', 19.2, 21.5], ['8', 21.5, 24]), written: D(21) },
  { name: 'FIX-S5', scene: 'S5', plan: plan(...s5.map(([a, b], i) => [String(i + 1), a, b] as [string, number, number]), ['7', 19.2, 21.6], ['8', 21.6, 23.4], ['9', 23.4, 25.8], ['10', 25.8, 28]), written: D(22, 8) },
  // written after FIX-cut-S5, whose first six shots it matches too: it still belongs to version 2, the one with takes
  { name: 'FIX-S5a', scene: 'S5', plan: plan(...s5.map(([a, b], i) => [String(i + 1), a, b] as [string, number, number])), written: D(22, 12) },
  { name: 'FIX-cut-S5', scene: 'S5', plan: plan(...s5.map(([a, b], i) => [String(i + 1), a, b] as [string, number, number]), ['7', 19.2, 20.8], ['8', 20.8, 22.9], ['9', 22.9, 25]), written: D(22, 11),
    board: seq(9).map((s) => ({ shot: s, src: `${F}/previz/FIX-cut-S5/storyboard/v1/panels/p${s}.png` })) },
];
const S5T = [
  take('S5', 'S5', 1, 24, [2.08, 4.88, 8.46, 12.71, 15.96, 19.33, 21.25], D(21, 13)),
  take('S5', 'FIX-S5', 1, 28, [2.17, 4.88, 8.21, 13.33, 16.42, 19.04, 21.58, 23.17, 25.79], D(22, 9)),
  take('S5', 'FIX-S5a', 1, 19, [3, 6.17, 9.58, 13.13, 16.29], D(22, 13)),
];
// ---- S7: take 1 cut once more than its prompt asked (check.json planned 5.45, 10.95, 16.45)
const S7: GenPlan[] = [{ name: 'S7', scene: 'S7', plan: plan(['1', 0, 5.45], ['2', 5.45, 10.95], ['3', 10.95, 16.45], ['4', 16.45, 23]), prompt: seq(4), written: D(21) }];
const S7T = [take('S7', 'S7', 1, 23, [4.708333, 9.125, 14.833333, 16.375], D(21, 13), { planned: [5.45, 10.95, 16.45] })];

const cut = cutOf([
  clip('S3 · take 1 · shot 1', src('S3'), 0, 2.92, 'S3'),
  clip('S7 · take 1 · shot 2', src('S7'), 5.58, 7.5, 'S7'),
  clip('S3 · FIX-tie-S3 · take 1 · shot 3', src('FIX-tie-S3'), 0.21, 2.08, 'S3'),
  clip('S3 · FIX-tie-S3 · take 1 · shot 4', src('FIX-tie-S3'), 2.46, 4.33, 'S3'),
  clip('S3 · take 1 · shot 4', src('S3'), 9.21, 11.08, 'S3'),
  clip('S4 · take 1 · shot 4', src('S4'), 8, 10.6, 'S4'),
  clip('S4 · FIX-struggle-S4 · take 1 · shot 4b', src('FIX-struggle-S4'), 3.04, 4.88, 'S4'),
  clip('S5 · FIX-S5a · take 1 · shot 1', src('FIX-S5a'), 0, 3, 'S5'),
  clip('S5 · FIX-S5 · take 1 · shot 7', src('FIX-S5'), 19.04, 21.58, 'S5'),
  clip('S6 · FIX-close-S6 · take 1 · shot 10', src('FIX-close-S6'), 2.54, 5.04, 'S6'),
  clip('S6 · FIX-S6b · take 1 · shot 2', src('FIX-S6b'), 2.38, 4.04, 'S6'),
  clip('S6 · FIX-S6b · take 1 · shot 3', src('FIX-S6b'), 4.04, 8, 'S6'),
  clip('S6 · FIX-S6b · take 1 · shot 4', src('FIX-S6b'), 8, 10.04, 'S6'),
  clip('S6 · FIX-storm-S6 · take 3 · shot 5', `${F}/generations/FIX-storm-S6/takes/take3/FIX-storm-S6-take3-480p.mp4`, 0, 7.04, 'S6'),
  clip('S6 · FIX-S6c · take 1 · shot 7', src('FIX-S6c', 1, '-nospot'), 9.88, 13, 'S6'),
  clip('S7 · take 1 · shot 4', src('S7'), 16.4, 23, 'S7'),
]);
// the storm take is take 3
S6T[4] = { ...S6T[4], src: `${F}/generations/FIX-storm-S6/takes/take3/FIX-storm-S6-take3-480p.mp4`, name: 'FIX-storm-S6 · take 3' };

const scenes = [{ id: 'S3', title: 'Gordius' }, { id: 'S4', title: "It doesn't give" }, { id: 'S5', title: 'Then it will be' }, { id: 'S6', title: 'By the sword' }, { id: 'S7', title: 'The telling' }];
const list = shotPlaces({ scenes, gens: [...S3, ...S4, ...S5, ...S6, ...S7], takes: [...S3T, ...S4T, ...S5T, ...S6T, ...S7T], cut });
const scene = (id: string) => list.scenes.find((s) => s.id === id)!;
const place = (id: string, p: string, v = 0) => scene(id).versions[v].places.find((x) => x.id === p)!;
const short = (p: { versions: { gen: string; take: string; inFilm: boolean }[] }) => p.versions.map((x) => `${x.gen}/${x.take}${x.inFilm ? '*' : ''}`).join(', ');

ok('small parts: place ids, their order, a take\'s folder and words, the Shot details address', () => {
  assert.equal(placeTag('4A'), '4a');
  assert.equal(placeTag(' 10 '), '10');
  assert.deepEqual(['5', '4b', '10', '4', '4a', '1'].sort(placeCmp), ['1', '4', '4a', '4b', '5', '10']);
  assert.equal(genOf(src('FIX-S6c', 1, '-nospot')), 'FIX-S6c');
  assert.equal(genOf(`${F}/blocks/S1/takes/S1-grey-take1-480p.mp4`), 'S1');
  assert.equal(takeFolder(src('FIX-S6c', 1, '-nospot')), takeFolder(src('FIX-S6c')));
  assert.notEqual(takeFolder(`${F}/blocks/S1/takes/S1-take1-480p.mp4`), takeFolder(`${F}/blocks/S1/takes/S1-take2-480p.mp4`));
  assert.equal(takeLabel('FIX-asia-S7 · take 5', 'FIX-asia-S7'), 'Take 5');
  assert.equal(takeLabel('FIX-burst · seedance take 2', 'FIX-burst'), 'Seedance take 2');
  // a pick-up's shot links by its place in its take, not by the place it fills (FIX-close-S6: shot 1)
  assert.equal(shotDetailsHref('sample-pickups', src('FIX-close-S6'), 1), '/films/sample-pickups/shots/generations~FIX-close-S6~takes~take1~FIX-close-S6-take1-480p.mp4?shot=1');
});

ok('the readers: a shots file and a prompt\'s SHOT headings', () => {
  assert.deepEqual(readPlan({ shots: [{ id: '4A', t0: 0, t1: 2 }, { id: 5 }] }), [{ id: '4A', t0: 0, t1: 2 }, { id: '5' }]);
  assert.equal(readPlan({ shots: [{ t0: 1 }] }), undefined);
  assert.deepEqual(promptShots('INTRO\nSHOT 5: YOU WILL RULE ASIA (CAM FACING: NE)\ntext SHOT 9 here\n  SHOT 6 (PANELS 4)\nSHOT 4A: x\nSHOT 5: again'), ['5', '6', '4A']);
});

ok('the scenes run as the film runs, then the rest in the film\'s order', () => {
  assert.deepEqual(list.scenes.map((s) => s.id), ['S3', 'S7', 'S4', 'S5', 'S6']);
});

ok('FIX-close-S6 calls its shot "10" and stands in place 1 of version 2 (the cut leaves only place 1 open there)', () => {
  const p1 = place('S6', '1');
  assert.equal(short(p1), 'FIX-wide-S6/Take 1, FIX-close-S6/Take 1*');
  assert.match(p1.versions.find((v) => v.gen === 'FIX-close-S6')!.note!, /calls it shot 10; it stands in place 1/);
  assert.equal(scene('S6').versions[0].places.length, 7);
  assert.ok(!scene('S6').versions[0].places.some((p) => p.id === '10'));
  // its take 2 (not in the cut, its shot "10" too) stands where take 1 stands
  const two = { ...S6T[5], src: S6T[5].src.replace(/take1/g, 'take2'), name: 'FIX-close-S6 · take 2', made: D(25, 17) };
  const l2 = shotPlaces({ scenes, gens: [...S3, ...S4, ...S5, ...S6, ...S7], takes: [...S3T, ...S4T, ...S5T, ...S6T, two, ...S7T], cut });
  const q1 = l2.scenes.find((s) => s.id === 'S6')!.versions[0].places.find((p) => p.id === '1')!;
  assert.equal(short(q1), 'FIX-close-S6/Take 2, FIX-wide-S6/Take 1, FIX-close-S6/Take 1*');
  assert.match(q1.versions[0].note!, /another take of FIX-close-S6 stands in place 1/);
});

ok('S3\'s take and FIX-tie-S3\'s take of place 4 are both in the cut, both marked; FIX-tie-S3 places 3 and 4 by its shots file', () => {
  assert.equal(short(place('S3', '4')), 'FIX-tie-S3/Take 1*, S3/Take 1*');
  assert.equal(short(place('S3', '3')), 'FIX-tie-S3/Take 1*, S3/Take 1');
  assert.equal(scene('S3').other.length, 0);
});

ok('FIX-struggle-S4 adds 4a, 4b and 4c after 4, nothing renumbered', () => {
  assert.deepEqual(scene('S4').versions[0].places.map((p) => p.id), ['1', '2', '3', '4', '4a', '4b', '4c', '5', '6']);
  assert.equal(short(place('S4', '4b')), 'FIX-struggle-S4/Take 1*');
  assert.equal(short(place('S4', '4a')), 'FIX-struggle-S4/Take 1');
});

ok('S5 replanned whole twice: version 3 (9, no take) is the scene, the film keeps version 2; FIX-S5a is part of version 2', () => {
  const s = scene('S5');
  assert.deepEqual(s.versions.map((v) => `${v.n}:${v.places.length}:${v.unmade ? 'unmade' : 'made'}:${v.gens.join('+')}`), ['3:9:unmade:FIX-cut-S5', '2:10:made:FIX-S5+FIX-S5a', '1:8:made:S5']);
  assert.equal(s.filmVersion, 2);
  assert.equal(place('S5', '4').board?.src, `${F}/previz/FIX-cut-S5/storyboard/v1/panels/p4.png`);
  assert.equal(short(place('S5', '1', 1)), 'FIX-S5a/Take 1*, FIX-S5/Take 1');
  assert.equal(short(place('S5', '10', 1)), 'FIX-S5/Take 1');
  assert.equal(short(place('S5', '7', 1)), 'FIX-S5/Take 1*');
});

ok('S7 take 1 cut once where its prompt did not: the 1.5 s piece is not a place, noted between places 3 and 4', () => {
  const s = scene('S7');
  assert.equal(s.extras.length, 1);
  assert.equal(s.extras[0].after, '3');
  assert.equal(s.extras[0].before, '4');
  assert.ok(Math.abs(s.extras[0].v.from - 14.833333) < 1e-6 && Math.abs(s.extras[0].v.to - 16.375) < 1e-6);
  assert.deepEqual(s.versions[0].places.map((p) => `${p.id}:${p.versions[0].from.toFixed(2)}`), ['1:0.00', '2:4.71', '3:9.13', '4:16.38']);
  assert.ok(place('S7', '4').versions[0].inFilm && place('S7', '2').versions[0].inFilm && !place('S7', '1').versions[0].inFilm);
  assert.equal(s.other.length, 0);
});

ok('FIX-S6b\'s take was cut into 3 where its prompt has 4 shots: the cut\'s names place 2, 3 and 4; its first piece is unplaced', () => {
  for (const p of ['2', '3', '4']) assert.ok(place('S6', p).versions.some((v) => v.gen === 'FIX-S6b' && v.inFilm), p);
  const other = scene('S6').other.filter((v) => v.gen === 'FIX-S6b');
  assert.equal(other.length, 1);
  assert.equal(other[0].i, 1);
});

ok('FIX-S6c and the storm take find 5, 6, 7 by their prompts; the "-nospot" file in the cut is the same take', () => {
  assert.equal(short(place('S6', '7')), 'FIX-S6c/Take 1*');
  assert.equal(short(place('S6', '5')), 'FIX-storm-S6/Take 3*, FIX-S6c/Take 1');
  assert.equal(short(place('S6', '6')), 'FIX-S6c/Take 1');
});

ok('FIX-S6: 5 shots for a list of 6 with times (no names in the cut) is matched by time, its third piece holding 3 and 4', () => {
  // before the one rule all five went under other takes; the times its shots file gives place them in version 1, the
  // detector's missed cut between 3 and 4 said plainly
  assert.equal(scene('S6').other.filter((v) => v.gen === 'FIX-S6').length, 0);
  const v1 = (p: string) => place('S6', p, 1).versions.find((v) => v.gen === 'FIX-S6');
  assert.deepEqual(['1', '2', '3', '5', '6'].map((p) => v1(p)?.i), [1, 2, 3, 4, 5]);
  assert.equal(v1('3')!.label, '3–4');
  assert.match(v1('3')!.note!, /Its shots file says 6 shots, the take was cut into 5: this one holds its shots 3–4/);
  assert.equal(short(place('S6', '1', 1)), 'FIX-S6/Take 1, S6/Take 1');
});

ok('the counts: shots made and in the film', () => {
  // S3 4+2, S4 6+3, S5 8+10+6, S6 6+5+3+3+1+1+1, S7 5
  assert.equal(list.made, 6 + 9 + 24 + 20 + 5);
  assert.equal(list.inFilm, cut.tracks[0].clips.length);
});

ok('alignCuts: each planned cut to its nearest found cut, in order; none when one is too far or too few were found', () => {
  assert.deepEqual(alignCuts([4.708, 9.125, 14.833, 16.375], [5.45, 10.95, 16.45]), [0, 1, 3]);
  assert.deepEqual(alignCuts([1, 2, 3], [1, 2, 3]), [0, 1, 2]);
  assert.equal(alignCuts([1, 2], [1, 2, 3]), undefined);
  assert.equal(alignCuts([1, 20], [8]), undefined);
});

ok('a film with no takes yet: every place "not made yet" with its storyboard panel, else a previz frame', () => {
  const gens: GenPlan[] = [
    { name: 'S1', scene: 'S1', plan: plan(['1', 0, 2.6], ['2', 2.6, 9.2], ['3', 9.2, 10.8], ['4A', 10.8, 12.4], ['4B', 12.4, 15.2], ['5', 15.2, 16.8]), board: [{ shot: '4A', src: 'b/4a.png' }, { shot: '1', src: 'b/1.png' }] },
    { name: 'S3', scene: 'S3', plan: plan(['1', 0, 4], ['2', 4, 9]), previz: 'pv/S3-previz-take-17.mp4' },
  ];
  const l = shotPlaces({ scenes: [{ id: 'S1', title: 'A' }, { id: 'S2', title: 'B', shots: 2 }, { id: 'S3', title: 'C' }], gens, takes: [] });
  assert.deepEqual(l.scenes[0].versions[0].places.map((p) => `${p.id}:${p.board?.src ?? '-'}`), ['1:b/1.png', '2:-', '3:-', '4a:b/4a.png', '4b:-', '5:-']);
  assert.deepEqual(l.scenes[1].versions[0].places.map((p) => p.id), ['1', '2']);
  assert.deepEqual(l.scenes[2].versions[0].places.map((p) => p.board), [{ src: 'pv/S3-previz-take-17.mp4', t: 2 }, { src: 'pv/S3-previz-take-17.mp4', t: 6.5 }]);
  assert.ok(l.scenes.every((s) => s.versions[0].unmade && s.versions.length === 1 && !s.filmVersion));
  assert.equal(l.made, 0);
});

console.log(`${n} checks passed`);
