// npm run places:test
// Where a shot stands in its scene, the one rule (docs/places.md; components/shots/places.ts shotPlaces with
// stands.ts), on the numbers of a made-up film's pick-ups as the Takes view shows them
// (pickupRows.ts pickupView, which asks shotPlaces): every kind of pick-up docs/places.md lists, each with Alma's stopgap
// shots file, with a stands record, and with neither; a record the cut disagrees with; a pick-up's two-shot file that
// must not become a version of its scene.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import type { GenPlan } from '../src/components/shots/places';
import { shotPlaces } from '../src/components/shots/places';
import { matchShots, placesLabel, readStands } from '../src/components/shots/stands';
import { otherKey, pickupView } from '../src/components/edit/pickupRows';
import { shotsOf, type TakeShots } from '../src/components/edit/shots';

let n = 0;
const ok = async (what: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`ok · ${what}`); };

const F = 'assets/films/sample-pickups/generations';
const src = (g: string, k = 1) => `${F}/${g}/takes/take${k}/${g}-take${k}-480p.mp4`;
const own = (scene: string, seconds: number, cuts: number[]): TakeShots => ({ src: src(scene), scene, name: 'take 1', seconds, cuts, state: 'ready', made: 1 });
const pick = (scene: string, g: string, k: number, seconds: number, cuts: number[] = []): TakeShots =>
  ({ src: src(g, k), scene, name: `${g.replace(/-/g, ' ')} · take ${k}`, seconds, cuts, state: 'ready', made: 10 + k });
const ids = (k: number) => Array.from({ length: k }, (_, i) => ({ id: String(i + 1) }));
const base = (scene: string, k: number): GenPlan => ({ name: scene, scene, plan: ids(k) });
let at = 0;
const clip = (s: string, a: number, b: number, scene: string, label = ''): TimelineClip => {
  const c: TimelineClip = { id: `c${at}`, src: s, in: a, out: b, at, label, takeRef: { scene, take: label } };
  at += b - a;
  return c;
};
const cutOf = (clips: TimelineClip[]): Timeline => ({ version: 'v30', fps: 24, width: 1920, height: 1080, at: '', markers: [], tracks: [{ id: 'V1', kind: 'video', name: 'V1', clips } as never] });

/** What the Takes view shows for each shot of a take: "Shot 5", "Shot 5–6", "Other shots". */
function columns(takes: TakeShots[], gens: GenPlan[], cut: Timeline | undefined, scene: string, places: number) {
  const v = pickupView({ takes, scenes: [{ id: scene, shots: places }], gens, cut });
  return (s: string): string[] => {
    const t = v.takes.find((x) => x.src === s)!;
    return shotsOf(t).map((sh) => (v.other.has(otherKey(t.src, sh.i)) ? 'Other' : `${v.stands.get(otherKey(t.src, sh.i))?.label ?? sh.tag ?? sh.n}`));
  };
}
const noteOf = (takes: TakeShots[], gens: GenPlan[], cut: Timeline | undefined, scene: string, s: string, i = 1) =>
  pickupView({ takes, scenes: [{ id: scene }], gens, cut }).stands.get(otherKey(s, i));

// ---- the takes (harness/shots.json and cuts.json). S4's take was cut in 5 for
// its 6 places and its check plans 5 cuts for 4 found, so its shots are placed as the cut names them ("shot 2")
const S1 = own('S1', 18, [4, 7.04, 10.72, 14, 15.84]);
const boat1 = pick('S1', 'FIX-boat-S1', 1, 6.05), boat2 = pick('S1', 'FIX-boat-S1', 2, 6.041667);
const S4 = own('S4', 30.16, [5.875, 11.625, 16.833333, 26.041667]);
const wallet = pick('S4', 'FIX-door-S4', 1, 7.041667);
const S10 = own('S10', 13.041667, [2.791667, 6.083333, 8.541667, 10.208333]);
const snatch = pick('S10', 'FIX-rope-S10', 1, 6.041667, [2.958333]);
const S11 = own('S11', 12.04, [2.167, 2.833, 4.042, 6.917, 8.833]);
const face = pick('S11', 'FIX-face-S11', 1, 4.041667);
const S16 = own('S16', 18, [5.6, 9.52, 13.2]);
const open = pick('S16', 'FIX-open-S16', 1, 8.041667);
const S18 = own('S18', 21.2, [6.56, 10.64, 14.84]);
const close = pick('S18', 'FIX-close-S18', 1, 5.041667);
// Alma's stopgap files, as she wrote them (ids with times from 0)
const stop = (g: string, scene: string, ...shots: [string, number, number][]): GenPlan => ({ name: g, scene, plan: shots.map(([id, t0, t1]) => ({ id, t0, t1 })) });
const rec = (g: string, scene: string, raw: unknown): GenPlan => ({ name: g, scene, stands: readStands(raw)! });

(async () => {
  await ok('the record: read leniently, versioned, one place, several, inside a place, a take of its own', () => {
    assert.deepEqual(readStands({ schema: 1, scene: 'S1', shots: [{ stands_for: ['5', '6'] }] })?.shots, [{ places: ['5', '6'] }]);
    assert.deepEqual(readStands({ shots: [{ stands_for: '1', inside: { from: 4.75 } }] })?.shots, [{ places: ['1'], inside: { place: '1', from: 4.75 } }]);
    assert.deepEqual(readStands({ shots: [{ stands_for: 2, t0: 0, t1: 2.96 }, { stands_for: '3', t0: 2.96, t1: 6.04 }] })?.shots.map((s) => s.places), [['2'], ['3']]);
    assert.deepEqual(readStands({ shots: [{ stands_for: '5' }], takes: { take2: [{ stands_for: ['5', '6'] }] } })?.takes, { take2: [{ places: ['5', '6'] }] });
    assert.equal(readStands({ schema: 2, shots: [{ stands_for: '1' }] }), undefined, 'a schema not known');
    assert.equal(readStands({ shots: [{ note: 'no place' }] }), undefined);
    assert.equal(readStands({ shots: [] }), undefined);
    assert.equal(placesLabel(['5', '6']), '5–6');
    assert.equal(placesLabel(['2', '4']), '2, 4');
  });

  // ---- kind 1: one shot for one place
  await ok('kind 1 · FIX-door-S4 stands for S4 place 1: by the record, by the stopgap file, by the cut alone', () => {
    const takes = [S4, wallet];
    assert.deepEqual(columns(takes, [base('S4', 6), rec('FIX-door-S4', 'S4', { shots: [{ stands_for: '1' }] })], undefined, 'S4', 6)(wallet.src), ['1']);
    assert.deepEqual(columns(takes, [base('S4', 6), stop('FIX-door-S4', 'S4', ['1', 0, 7.04])], undefined, 'S4', 6)(wallet.src), ['1']);
    at = 0;
    const cut = cutOf([clip(wallet.src, 0, 5.612, 'S4', 'S4 · FIX-door-S4 · take 1'), clip(S4.src, 5.875, 11.625, 'S4', 'S4 · take 1 · shot 2'), clip(S4.src, 11.625, 16.833, 'S4', 'S4 · take 1 · shot 3'), clip(S4.src, 16.833, 19.375, 'S4', 'S4 · take 1 · shot 4'), clip(S4.src, 19.375, 25.446, 'S4', 'S4 · take 1 · shot 4'), clip(S4.src, 26.75, 30.16, 'S4', 'S4 · take 1 · shot 5')]);
    assert.deepEqual(columns(takes, [base('S4', 6)], cut, 'S4', 6)(wallet.src), ['1'], 'no file: where the cut has it, before place 2');
    assert.match(noteOf(takes, [base('S4', 6)], cut, 'S4', wallet.src)!.note!, /in the cut it sits before place 2/);
  });

  // ---- kind 2: one take for several places
  const yearCut = () => { at = 0; return cutOf([clip(S1.src, 0, 4, 'S1'), clip(S1.src, 4, 7.04, 'S1'), clip(S1.src, 7.04, 10.75, 'S1'), clip(S1.src, 10.75, 14, 'S1'), clip(boat2.src, 0.375, 6, 'S1', 'S1 · FIX-boat-S1 · take 2')]); };
  await ok('kind 2 · FIX-boat-S1 take 2 replaced places 5 and 6 as one clip: both takes under Shot 5, named "5–6", with no file', () => {
    const c = columns([S1, boat1, boat2], [base('S1', 6)], yearCut(), 'S1', 6);
    assert.deepEqual(c(boat2.src), ['5–6'], 'in the film after place 4, places 5 and 6 out');
    assert.deepEqual(c(boat1.src), ['5–6'], 'take 1 stands where take 2 does');
    const v = pickupView({ takes: [S1, boat1, boat2], scenes: [{ id: 'S1', shots: 6 }], gens: [base('S1', 6)], cut: yearCut() });
    assert.equal(shotsOf(v.takes.find((t) => t.src === boat1.src))[0].n, 5, 'its column is Shot 5');
    assert.equal(v.other.size, 0);
  });
  await ok('kind 2 · with the stopgap file ("5") or a record of 5 and 6: the same, "5–6"', () => {
    assert.deepEqual(columns([S1, boat1, boat2], [base('S1', 6), stop('FIX-boat-S1', 'S1', ['5', 0, 6.04])], yearCut(), 'S1', 6)(boat2.src), ['5–6']);
    const r = rec('FIX-boat-S1', 'S1', { shots: [{ stands_for: ['5', '6'] }] });
    const c = columns([S1, boat1, boat2], [base('S1', 6), r], undefined, 'S1', 6);
    assert.deepEqual([c(boat1.src), c(boat2.src)], [['5–6'], ['5–6']], 'the record alone, nothing in the cut');
  });
  await ok('kind 2 · the old failure: no file, take 2 in the cut, never under its own number "1"', () => {
    const c = columns([S1, boat1, boat2], [base('S1', 6)], yearCut(), 'S1', 6);
    assert.notDeepEqual(c(boat2.src), ['1']);
  });

  // ---- kind 3: an insert inside a place
  await ok('kind 3 · FIX-close-S18 inside S18 place 1 from 4.75 s: under Shot 1, the cut agrees, no disagreement', () => {
    const r = rec('FIX-close-S18', 'S18', { shots: [{ stands_for: '1', inside: { place: '1', from: 4.75 } }] });
    at = 0;
    const cut = cutOf([clip(S18.src, 0, 4.75, 'S18'), clip(close.src, 0, 1.83, 'S18', 'S18 · FIX-close-S18 · take 1'), clip(S18.src, 7.75, 10.667, 'S18'), clip(S18.src, 10.667, 14.875, 'S18'), clip(S18.src, 15.875, 20.708, 'S18')]);
    assert.deepEqual(columns([S18, close], [base('S18', 4), r], cut, 'S18', 4)(close.src), ['1']);
    assert.equal(noteOf([S18, close], [base('S18', 4), r], cut, 'S18', close.src)?.conflict, undefined);
    const list = shotPlaces({ scenes: [{ id: 'S18', title: 'S18', shots: 4 }], gens: [base('S18', 4), r], takes: [S18, close], cut });
    const m = list.scenes[0].versions[0].places[0].versions.find((x) => x.src === close.src);
    assert.deepEqual(m?.inside, { place: '1', from: 4.75 });
  });

  // ---- kind 4: a place split later
  await ok('kind 4 · S4 shot 4 split in two clips (v30): both pieces are place 4; a pick-up of 4 between them fits', () => {
    at = 0;
    const cut = cutOf([clip(wallet.src, 0, 5.612, 'S4'), clip(S4.src, 5.875, 11.625, 'S4', 'S4 · take 1 · shot 2'), clip(S4.src, 11.625, 16.833, 'S4', 'S4 · take 1 · shot 3'), clip(S4.src, 16.833, 19.375, 'S4', 'S4 · take 1 · shot 4'), clip(src('FIX-x-S4'), 0, 2, 'S4'), clip(S4.src, 19.375, 25.446, 'S4', 'S4 · take 1 · shot 4'), clip(S4.src, 26.75, 30.16, 'S4', 'S4 · take 1 · shot 5')]);
    const x = pick('S4', 'FIX-x-S4', 1, 2);
    const r = rec('FIX-x-S4', 'S4', { shots: [{ stands_for: '4' }] });
    const list = shotPlaces({ scenes: [{ id: 'S4', title: 'S4', shots: 6 }], gens: [base('S4', 6), r], takes: [S4, x], cut });
    const p4 = list.scenes[0].versions[0].places[3];
    assert.deepEqual(p4.versions.map((m) => [m.src === S4.src ? 'S4' : 'x', m.inFilm]).sort(), [['S4', true], ['S4', true], ['x', true]], 'the two pieces of the scene\'s shot 4, and the pick-up');
    assert.equal(p4.versions.find((m) => m.src === x.src)?.conflict, undefined, 'between the two pieces of place 4: it fits');
  });

  // ---- kind 5: planned for a place, not in the cut yet (the main case: how the user meets every pick-up)
  await ok('kind 5 · FIX-face-S11, not in the cut: the record or the stopgap file put it under Shot 1; with neither, Other, with why', () => {
    const takes = [S11, face];
    assert.deepEqual(columns(takes, [base('S11', 6), rec('FIX-face-S11', 'S11', { shots: [{ stands_for: ['1'] }] })], undefined, 'S11', 6)(face.src), ['1']);
    assert.deepEqual(columns(takes, [base('S11', 6), stop('FIX-face-S11', 'S11', ['1', 0, 4.04])], undefined, 'S11', 6)(face.src), ['1']);
    assert.deepEqual(columns(takes, [base('S11', 6), { name: 'FIX-face-S11', scene: 'S11', plan: [{ id: '1' }] }], undefined, 'S11', 6)(face.src), ['1'], 'ids only, no times');
    assert.deepEqual(columns(takes, [base('S11', 6)], undefined, 'S11', 6)(face.src), ['Other']);
    assert.match(noteOf(takes, [base('S11', 6)], undefined, 'S11', face.src)!.note!, /could not be matched to places: it has no shots file or prompt/);
  });

  // ---- kind 6: a full re-take of the scene
  await ok('kind 6 · a normal take 2 of the scene: its six shots under Shots 1 to 6', () => {
    const t2: TakeShots = { ...own('S6', 17, [2.6, 6, 7.8, 13.4, 15.6]), src: `${F}/S6/takes/take2/S6-take2-480p.mp4`, name: 'take 2' };
    const list = shotPlaces({ scenes: [{ id: 'S6', title: 'S6', shots: 6 }], gens: [base('S6', 6)], takes: [own('S6', 17, [2.6, 6, 7.8, 13.4, 15.6]), t2] });
    assert.deepEqual(list.scenes[0].versions[0].places.map((p) => p.versions.length), [2, 2, 2, 2, 2, 2]);
    assert.equal(list.scenes[0].other.length, 0);
  });

  // ---- kind 7: starts from one take and cuts back into another mid-shot
  await ok('kind 7 · FIX-open-S16 to 4.5 s, then take 1 from 4.0 s: under Shot 1, inside place 1 to 4.5 s', () => {
    const r = rec('FIX-open-S16', 'S16', { shots: [{ stands_for: '1', inside: { place: '1', to: 4.5 } }] });
    at = 0;
    const cut = cutOf([clip(open.src, 0, 4.5, 'S16'), clip(S16.src, 4.0, 5.625, 'S16'), clip(S16.src, 5.625, 9.542, 'S16'), clip(S16.src, 9.542, 13.208, 'S16'), clip(S16.src, 13.208, 18, 'S16')]);
    assert.deepEqual(columns([S16, open], [base('S16', 4), r], cut, 'S16', 4)(open.src), ['1']);
    assert.equal(noteOf([S16, open], [base('S16', 4), r], cut, 'S16', open.src)?.conflict, undefined);
  });

  // ---- kind 8: the record's count is not the take's (FIX-rope-S10)
  await ok('kind 8 · FIX-rope-S10 cut in 2, Alma\'s old one-shot file ("2", 0 to 6.04 s): both pieces under Shot 2, none under Other, said plainly', () => {
    const g = stop('FIX-rope-S10', 'S10', ['2', 0, 6.04]);
    const c = columns([S10, snatch], [base('S10', 5), g], undefined, 'S10', 5);
    assert.deepEqual(c(snatch.src), ['2 · 1/2', '2 · 2/2']);
    assert.match(noteOf([S10, snatch], [base('S10', 5), g], undefined, 'S10', snatch.src)!.note!, /^Its shots file says 1 shot, the take was cut into 2/);
    const v = pickupView({ takes: [S10, snatch], scenes: [{ id: 'S10', shots: 5 }], gens: [base('S10', 5), g] });
    assert.deepEqual(shotsOf(v.takes.find((t) => t.src === snatch.src)).map((s) => [s.n, s.tag]), [[2, '2a'], [2, '2b']], 'one cell, side by side');
  });
  await ok('kind 8 · the same with a record of one shot for places 2 and 3 (no times): one piece each', () => {
    const r = rec('FIX-rope-S10', 'S10', { shots: [{ stands_for: ['2', '3'] }] });
    assert.deepEqual(columns([S10, snatch], [base('S10', 5), r], undefined, 'S10', 5)(snatch.src), ['2', '3']);
  });
  await ok('kind 8 · Alma\'s corrected file (2: 0 to 2.958, 3: 2.958 to 6.04): 2 and 3, out of the cut and in it', () => {
    const g = stop('FIX-rope-S10', 'S10', ['2', 0, 2.958333], ['3', 2.958333, 6.04]);
    assert.deepEqual(columns([S10, snatch], [base('S10', 5), g], undefined, 'S10', 5)(snatch.src), ['2', '3']);
    at = 0;
    const cut = cutOf([clip(snatch.src, 0, 2.958, 'S10', 'S10 · FIX-rope-S10 · take 1 · shot 1'), clip(snatch.src, 2.958, 6.042, 'S10', 'S10 · FIX-rope-S10 · take 1 · shot 2'), clip(S10.src, 6.083, 8.542, 'S10'), clip(S10.src, 8.542, 10.208, 'S10'), clip(S10.src, 10.208, 11.75, 'S10')]);
    assert.deepEqual(columns([S10, snatch], [base('S10', 5), g], cut, 'S10', 5)(snatch.src), ['2', '3'], 'before place 3 in the cut: 2 and 3 fit there');
  });
  await ok('kind 8 · matchShots: a missed cut holds two listed shots; a listed shot outside the times says so', () => {
    const fixS6 = [['1', 0, 3], ['2', 3, 6], ['3', 6, 7.5], ['4', 7.5, 13.8], ['5', 13.8, 15.3], ['6', 15.3, 19]].map(([id, t0, t1]) => ({ places: [id as string], t0: t0 as number, t1: t1 as number }));
    const segs = [[0, 2.13], [2.13, 6.5], [6.5, 14.04], [14.04, 16.46], [16.46, 19.04]].map(([from, to], k) => ({ i: k + 1, from, to }));
    assert.deepEqual(matchShots(fixS6, segs, 'its shots file').map((c) => c.places.join('+')), ['1', '2', '3+4', '5', '6']);
    assert.deepEqual(matchShots([{ places: ['1', '2'] }, { places: ['3'] }], segs.slice(0, 3)).map((c) => c.places.length), [0, 0, 0], 'two listed with no times, three found: nothing matched');
  });

  // ---- a record the cut disagrees with
  await ok('a record says 5, the cut has FIX-door-S4 at the start before place 2 with place 1 out: shown at 1, both said', () => {
    const r = rec('FIX-door-S4', 'S4', { shots: [{ stands_for: '5' }] });
    at = 0;
    const cut = cutOf([clip(wallet.src, 0, 5.612, 'S4'), clip(S4.src, 5.875, 11.625, 'S4', 'S4 · take 1 · shot 2'), clip(S4.src, 11.625, 16.833, 'S4', 'S4 · take 1 · shot 3'), clip(S4.src, 16.833, 25.446, 'S4', 'S4 · take 1 · shot 4'), clip(S4.src, 26.75, 30.16, 'S4', 'S4 · take 1 · shot 5')]);
    assert.deepEqual(columns([S4, wallet], [base('S4', 6), r], cut, 'S4', 6)(wallet.src), ['1']);
    assert.equal(noteOf([S4, wallet], [base('S4', 6), r], cut, 'S4', wallet.src)?.conflict, 'Its stands record says place 5; in the cut it sits before place 2, so it is shown at 1.');
  });
  await ok('a record the cut cannot place otherwise (no place open there): the record stands, the disagreement said', () => {
    const r = rec('FIX-door-S4', 'S4', { shots: [{ stands_for: '5' }] });
    at = 0;
    const cut = cutOf([clip(S4.src, 0, 5.875, 'S4', 'S4 · take 1 · shot 1'), clip(wallet.src, 0, 5.612, 'S4'), clip(S4.src, 5.875, 11.625, 'S4', 'S4 · take 1 · shot 2'), clip(S4.src, 11.625, 16.833, 'S4', 'S4 · take 1 · shot 3'), clip(S4.src, 16.833, 25.446, 'S4', 'S4 · take 1 · shot 4'), clip(S4.src, 26.75, 30.16, 'S4', 'S4 · take 1 · shot 5')]);
    assert.deepEqual(columns([S4, wallet], [base('S4', 6), r], cut, 'S4', 6)(wallet.src), ['5']);
    assert.match(noteOf([S4, wallet], [base('S4', 6), r], cut, 'S4', wallet.src)!.conflict!, /says place 5; in the cut it sits after place 1 and before place 2/);
  });

  // ---- a pick-up's plan is never a version of its scene
  await ok('a pick-up\'s shots file of 1 and 2 with times from 0 (FIX-hands-S14 written so) is not a version of S14: under Shots 1 and 2', () => {
    const S14 = own('S14', 22.04, [3.333, 6.542, 10.708, 15.125, 19.333]);
    const hands = pick('S14', 'FIX-hands-S14', 1, 5.041667, [2.5]);
    const gens = [base('S14', 6), stop('FIX-hands-S14', 'S14', ['1', 0, 2.5], ['2', 2.5, 5.04])];
    const list = shotPlaces({ scenes: [{ id: 'S14', title: 'S14', shots: 6 }], gens, takes: [S14, hands] });
    assert.equal(list.scenes[0].versions.length, 1);
    assert.deepEqual(columns([S14, hands], gens, undefined, 'S14', 6)(hands.src), ['1', '2']);
    const recd = shotPlaces({ scenes: [{ id: 'S14', title: 'S14', shots: 6 }], gens: [base('S14', 6), rec('FIX-hands-S14', 'S14', { shots: [{ stands_for: '1' }, { stands_for: '2' }] })], takes: [S14, hands] });
    assert.equal(recd.scenes[0].versions.length, 1, 'a record: never a version');
  });

  // ---- a film with no record (made before the record existed): what the pick-ups' lists say, as before
  await ok('no record: a pick-up\'s own shots file of its place counts as before (FIX-egg-S2 "1", FIX-storm-S6 by its prompt "5")', () => {
    const S2 = own('S2', 18, [4.9, 9, 11.6]);
    const egg = pick('S2', 'FIX-egg-S2', 1, 5.04);
    assert.deepEqual(columns([S2, egg], [base('S2', 4), { name: 'FIX-egg-S2', scene: 'S2', plan: [{ id: '1' }] }], undefined, 'S2', 4)(egg.src), ['1']);
    const S6 = own('S6', 17, [2.6, 6, 7.8, 13.4, 15.6]);
    const storm = pick('S6', 'FIX-storm-S6', 1, 7);
    assert.deepEqual(columns([S6, storm], [base('S6', 6), { name: 'FIX-storm-S6', scene: 'S6', prompt: ['5'] }], undefined, 'S6', 6)(storm.src), ['5']);
  });

  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
