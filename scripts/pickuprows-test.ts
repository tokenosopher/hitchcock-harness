// npm run pickuprows:test
// The pick-ups as rows of their scene in the Edit page's Takes view (components/edit/pickupRows.ts), on the shapes of
// a made-up film with many pick-ups: FIX-egg-S2's two takes of S2's shot 1 (the
// second 1080x1920 under a -480p name), FIX-close-S6 calling its shot "10" and standing in place 1 (its take 2 beside
// it), FIX-S6 whose five shots nothing places ("Other shots"), FIX-struggle-S4's 4a, 4b, 4c, and the copies of pick-up
// takes kept by hand as variations of a scene's take 1 (variation.json "copyOf"): left out, their clip in the cut marking
// the pick-up's own shot as in the film. And the sample's S1 (fixtures/shots.ts).
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import type { GenPlan } from '../src/components/shots/places';
import { copiesOf, isPickup, otherKey, pickupView, withAliases } from '../src/components/edit/pickupRows';
import { inFilm, putShot, shotTimeline, shotsOf, type TakeShots } from '../src/components/edit/shots';
import { mockShots } from '../src/fixtures/shots';
import { mockShotList } from '../src/fixtures/shotlist';
import { readVariation } from '../src/server/edit/shots';

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

const F = 'assets/films/sample-pickups/generations';
const src = (g: string, k = 1, v = '') => `${F}/${g}/takes/take${k}${v}/${g}-take${k}${v}-480p.mp4`;
const own = (scene: string, seconds: number, cuts: number[]): TakeShots => ({ src: src(scene), scene, name: 'take 1', seconds, cuts, state: 'ready', made: 1 });
const pick = (scene: string, g: string, k: number, seconds: number, cuts: number[] = [], more: Partial<TakeShots> = {}): TakeShots =>
  ({ src: src(g, k), scene, name: `${g.replace(/-/g, ' ')} · take ${k}`, seconds, cuts, state: 'ready', made: 10 + k, ...more });
const copy = (scene: string, k: number, of: string, seconds: number): TakeShots =>
  ({ src: src(scene, 1, `-variation${k}`), scene, name: `take1 variation${k}`, seconds, cuts: [], state: 'ready', made: 50,
    variation: { from: src(scene), note: 'a copy', startedAt: '2026-11-25T18:10:00Z', copyOf: of } });
const plan = (...ids: string[]) => ids.map((id) => ({ id }));
let at = 0;
const clip = (label: string, s: string, a: number, b: number, scene: string): TimelineClip => {
  const c: TimelineClip = { id: `c${at}`, src: s, in: a, out: b, at, label, takeRef: { scene, take: label.split(' · ').slice(1, -1).join(' · ') } };
  at += b - a;
  return c;
};
const cutOf = (clips: TimelineClip[]): Timeline => ({ version: 'v50', fps: 24, width: 1080, height: 1920, at: '', markers: [], tracks: [{ id: 'V1', kind: 'video', name: 'V1', clips } as never] });
const shape = (t?: TakeShots) => shotsOf(t).map((s) => s.tag ?? String(s.n)).join(',');

// ---- S2: the scene's take (4 shots); FIX-egg-S2 two takes of shot 1; the copies of them under take 1, the first in the cut
const S2 = own('S2', 18, [4.9, 9, 11.6]);
const egg1 = pick('S2', 'FIX-egg-S2', 1, 5.04), egg2 = pick('S2', 'FIX-egg-S2', 2, 5.2);
const copy1 = copy('S2', 1, egg1.src, 5.04), copy2 = copy('S2', 2, egg2.src, 5.2);
// ---- S6: FIX-close-S6 "10" (take 1 in the cut, take 2 not), FIX-storm-S6 two takes of 5, FIX-S6 unplaceable, a copy of storm 2
const S6 = own('S6', 17, [2.6, 6, 7.8, 13.4, 15.6]);
const close1 = pick('S6', 'FIX-close-S6', 1, 5.04, [], { ids: [10] }), close2 = pick('S6', 'FIX-close-S6', 2, 5.2, [], { ids: [10] });
const storm1 = pick('S6', 'FIX-storm-S6', 1, 7), storm2 = pick('S6', 'FIX-storm-S6', 2, 7.12);
const fixS6 = pick('S6', 'FIX-S6', 1, 19, [2.1, 6.5, 14, 16.5]);
const copyStorm = copy('S6', 1, storm2.src, 7.12);
// ---- S4: FIX-struggle-S4 4a, 4b, 4c
const S4 = own('S4', 24, [3.4, 6, 8, 10.6, 16.7]);
const struggle = pick('S4', 'FIX-struggle-S4', 1, 8, [2.46, 4.88], { ids: [4, 4, 4], tags: ['4a', '4b', '4c'] });

const gens: GenPlan[] = [
  { name: 'S2', scene: 'S2', plan: plan('1', '2', '3', '4') },
  { name: 'FIX-egg-S2', scene: 'S2', plan: plan('1'), written: 5 },
  { name: 'S6', scene: 'S6', plan: plan('1', '2', '3', '4', '5', '6') },
  { name: 'FIX-close-S6', scene: 'S6', plan: plan('10'), prompt: ['10'], written: 6 },
  { name: 'FIX-storm-S6', scene: 'S6', plan: plan('1', '2', '3', '4', '5', '6'), prompt: ['5'], written: 5 },
  { name: 'FIX-S6', scene: 'S6', plan: plan('1', '2', '3', '4', '5', '6'), prompt: ['1', '2', '3', '4', '5', '6'], written: 4 },
  { name: 'S4', scene: 'S4', plan: plan('1', '2', '3', '4', '5', '6') },
  { name: 'FIX-struggle-S4', scene: 'S4', plan: plan('4a', '4b', '4c'), prompt: ['4A', '4B', '4C'], written: 5 },
];
const takes = [S2, egg1, egg2, copy1, copy2, S6, close1, close2, storm1, storm2, fixS6, copyStorm, S4, struggle];
const cut = cutOf([
  clip('S2 · take1 variation1 · shot 1', copy1.src, 0, 5.04, 'S2'),
  clip('S2 · take 1 · shot 2', S2.src, 4.9, 9, 'S2'),
  clip('S6 · FIX-close-S6 · take 1 · shot 10', close1.src, 0, 5.04, 'S6'),
  clip('S6 · take 1 · shot 2', S6.src, 2.6, 6, 'S6'),
  clip('S6 · take 1 · shot 3', S6.src, 6, 7.8, 'S6'),
  clip('S6 · take 1 · shot 4', S6.src, 7.8, 13.4, 'S6'),
  clip('S6 · take1 variation1 · shot 1', copyStorm.src, 0, 7.12, 'S6'),
  clip('S6 · take 1 · shot 6', S6.src, 15.6, 17, 'S6'),
  clip('S4 · FIX-struggle-S4 · take 1 · shot 4b', struggle.src, 2.46, 4.88, 'S4'),
]);
const scenes = [{ id: 'S2' }, { id: 'S4' }, { id: 'S6' }];
const v = pickupView({ takes, scenes, gens, cut });
const get = (s: string) => v.takes.find((t) => t.src === s);

ok('the copies: a variation whose copyOf names a listed take, and only then', () => {
  assert.deepEqual([...copiesOf(takes)], [[copy1.src, egg1.src], [copy2.src, egg2.src], [copyStorm.src, storm2.src]]);
  // its original not listed: an ordinary variation, kept
  assert.equal(copiesOf([S2, copy('S2', 1, src('FIX-gone-S2'), 5)]).size, 0);
  // the server reads copyOf from variation.json, and nothing else changes
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't', copyOf: 'assets/films/x/generations/FIX-egg-S2/takes/take1/FIX-egg-S2-take1-480p.mp4' }),
    { from: 'a.mp4', note: 'n', startedAt: 't', copyOf: 'assets/films/x/generations/FIX-egg-S2/takes/take1/FIX-egg-S2-take1-480p.mp4' });
  assert.deepEqual(readVariation({ from: 'a.mp4', note: 'n', startedAt: 't' }), { from: 'a.mp4', note: 'n', startedAt: 't' });
});

ok('the rows: every pick-up take is listed, the copies are not (nothing counts them: "new", the strip\'s dots)', () => {
  assert.deepEqual(v.takes.map((t) => t.src), takes.filter((t) => !t.variation).map((t) => t.src));
  // named as the cut names a pick-up's take, not with the folder's dashes turned to spaces
  assert.equal(get(close2.src)!.name, 'FIX-close-S6 · take 2');
  assert.equal(get(S2.src)!.name, 'take 1');
  assert.ok(isPickup(egg1) && isPickup(close2) && !isPickup(S2) && !isPickup(copy1));
  // the copies stay playable for a clip of them in the cut, numbered as the take they copy
  assert.equal(shape(v.by.get(copy1.src)), '1');
  assert.equal(shape(v.by.get(copyStorm.src)), '5');
});

ok('each pick-up shot under the place it stands for', () => {
  assert.equal(shape(get(egg1.src)), '1');
  assert.equal(shape(get(egg2.src)), '1');
  assert.equal(shape(get(storm1.src)), '5');
  assert.equal(shape(get(storm2.src)), '5');
  // FIX-close-S6 calls its shot "10"; the cut leaves place 1 open where it is, and its take 2 stands there too
  assert.equal(shape(get(close1.src)), '1');
  assert.equal(shape(get(close2.src)), '1');
  // added places keep their letter, side by side under Shot 4
  assert.equal(shape(get(struggle.src)), '4a,4b,4c');
  // the scene's own takes as before
  assert.equal(shape(get(S6.src)), '1,2,3,4,5,6');
});

ok('a pick-up shot nothing places, not in the film: "Other shots"; one in the film stays where it is', () => {
  assert.deepEqual([...v.other].sort(), [1, 2, 3, 4, 5].map((i) => otherKey(fixS6.src, i)).sort());
  assert.equal(shape(get(fixS6.src)), '1,2,3,4,5');
  assert.ok(![...v.other].some((k) => k.startsWith(close1.src) || k.startsWith(egg1.src)));
});

ok('in the film: FIX-egg-S2 take 1 through its copy, FIX-storm-S6 take 2 through its copy, FIX-close-S6 take 1 at shot 1', () => {
  const tl = shotTimeline(cut, v.by);
  const used = withAliases(inFilm(tl, v.by), v.alias);
  assert.ok(used.has(`${egg1.src}#1`), [...used].join(' '));
  assert.ok(!used.has(`${egg2.src}#1`));
  assert.ok(used.has(`${storm2.src}#5`));
  assert.ok(used.has(`${close1.src}#1`));
  assert.ok(used.has(`${struggle.src}#4b`));
});

ok('a click tries a pick-up\'s shot in its place: FIX-egg-S2 take 2 in place of the copy at shot 1, FIX-close-S6 take 2 at 1', () => {
  const tl = shotTimeline(cut, v.by);
  const a = putShot(tl, 'S2', 1, get(egg2.src)!, 'FIX egg S2 · take 2', v.by);
  assert.ok(a, 'put');
  const v1 = a!.tl.tracks[0].clips;
  assert.equal(v1.filter((c) => c.src === copy1.src).length, 0, 'the copy goes');
  assert.equal(v1.find((c) => c.src === egg2.src)?.at, 0, 'where it was');
  const b = putShot(tl, 'S6', 1, get(close2.src)!, 'FIX close S6 · take 2', v.by);
  assert.ok(b && b.tl.tracks[0].clips.some((c) => c.src === close2.src) && !b.tl.tracks[0].clips.some((c) => c.src === close1.src));
});

ok('a place the cut gave stays when the cut no longer says it (keep)', () => {
  const bare = pickupView({ takes, scenes, gens, cut: cutOf([]) });
  assert.equal(shape(bare.takes.find((t) => t.src === close1.src)), '10', 'nothing says where "10" stands');
  const kept = pickupView({ takes, scenes, gens, cut: cutOf([]), keep: v.placed });
  assert.equal(shape(kept.takes.find((t) => t.src === close1.src)), '1');
  assert.equal(shape(kept.takes.find((t) => t.src === close2.src)), '1');
});

ok('without the shot lists (not read yet): the takes as the server numbered them, the copies still left out', () => {
  const raw = pickupView({ takes, scenes });
  assert.equal(raw.takes.length, takes.length - 3);
  assert.equal(shape(raw.takes.find((t) => t.src === close1.src)), '10');
  assert.equal(raw.other.size, 0);
});

ok('the sample\'s S1: two pick-ups, their shots under 2, 3 and 4, take 2 of FIX-hall-S1 in "Other shots"', () => {
  const { takes: st } = mockShots('the-lighthouse');
  const sl = mockShotList('the-lighthouse');
  const sv = pickupView({ takes: st, scenes: [{ id: 'S1' }], gens: sl.gens, checks: sl.checks });
  const s1 = sv.takes.filter((t) => t.scene === 'S1');
  const by = (g: string, k: number) => s1.find((t) => t.src.includes(`/${g}/takes/take${k}/`));
  assert.equal(shape(by('FIX-rock-S1', 1)), '2');
  assert.equal(shape(by('FIX-rock-S1', 2)), '2');
  assert.equal(shape(by('FIX-hall-S1', 1)), '3,4');
  const hall2 = by('FIX-hall-S1', 2)!;
  assert.deepEqual([...sv.other].filter((k) => k.startsWith(hall2.src)).length, 3);
  assert.ok(!s1.some((t) => t.variation?.copyOf), 'the copy is left out');
  // the sample's S2 pick-up stays under Shot 2, as before
  const s2 = pickupView({ takes: st, scenes: [{ id: 'S2' }], gens: sl.gens, checks: sl.checks }).takes.find((t) => t.name.startsWith('FIX-cork-S2'));
  assert.equal(shape(s2), '2');
});

console.log(`\n${n} checks passed`);
