// npm run layouts:test
// A scene's layouts (components/edit/layouts.ts): which layouts a scene has, which shots are safe
// swaps (the same framing and the same line), the warnings of any other swap (never a refusal), the layout the cut uses,
// choosing a layout as one edit that nothing is lost by, a shot of one layout's take put into a place of another
// (putShot's `into`), "Update the timeline" leaving a chosen layout alone, and the layouts sample.
import assert from 'node:assert/strict';
import type { Timeline } from '../src/server/types';
import { chooseLayout, framingKey, layoutContent, layoutInCut, layoutOfTake, layoutShotOfTake, safeSwaps, sameLayout, sceneLayouts, swapCheck, type BoardsIn, type PrevizIn, type TakeLayoutIn } from '../src/components/edit/layouts';
import { bringUp, buildScene, type PlanScene } from '../src/components/edit/planned';
import { inFilm, ownShot, putShot, shotNo, shotsOf, withPicks, type BySrc, type TakeShots } from '../src/components/edit/shots';
import { sentLayout } from '../src/server/edit/layouts';
import { mockLayoutPut, mockLayouts, mockPlanSource, day1SampleCut } from '../src/fixtures/day1';

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

// ---- a scene with three previz takes: 1 and 2 laid out the same, 3 restaged (a lens shot put in as shot 3)
const cam = (x: number, y: number, yaw: number, lens = 35) => ({ cam: [x, y, 1.5] as [number, number, number], yaw, pitch: 0, lens });
const A = { id: '1', name: '1 The switch', ...cam(1, 2, 90) }, B = { id: '2', name: '2 She looks', ...cam(0, 0, 180) }, C = { id: '3', name: '3 The sea', ...cam(0.5, -1, 200, 28) };
const P = { id: '3', name: '3 The lens', ...cam(-1, 2, 120, 50) };
const LINES1 = [{ who: 'MAREN', text: 'When the lamp goes out, you count to ten.', t: [2.6, 6] as [number, number] }, { who: 'MAREN', text: 'Then you light it again.', t: [7.5, 11] as [number, number] }];
const p1: PrevizIn = { n: 1, written: 1000, shots: [{ ...A, t0: 0, t1: 2.4 }, { ...B, t0: 2.4, t1: 7.2 }, { ...C, t0: 7.2, t1: 13 }], lines: LINES1 };
const p2: PrevizIn = { ...p1, n: 2, written: 2000 };
const p3: PrevizIn = { n: 3, written: 3000, shots: [{ ...A, t0: 0, t1: 2.4 }, { ...B, t0: 2.4, t1: 7.2 }, { ...P, t0: 7.2, t1: 9.6 }, { ...C, id: '4', name: '4 The sea', t0: 9.6, t1: 13 }],
  lines: [LINES1[0], { who: 'MAREN', text: 'Then you light it again.', t: [9.8, 12.8] }] };
const F = 'assets/films/x/generations/S3/takes';
const boards: BoardsIn[] = [
  { version: 'v1', take: 1, shots: [1, 2, 3].map((k) => ({ shot: String(k), src: `assets/films/x/previz/S3/storyboard/v1/panels/0${k}-shot${k}.png` })) },
  { version: 'v2', take: 3, shots: [1, 2, 3, 4].map((k) => ({ shot: String(k), src: `assets/films/x/previz/S3/storyboard/v2/panels/0${k}-shot${k}.png` })), shown: true },
];
const takesIn: TakeLayoutIn[] = [
  { src: `${F}/take1/S3-take1-480p.mp4`, name: 'take 1', previzTake: 2, storyboard: 'v1', seconds: 13, landed: true },
  // no record: by its date, after previz take 2 and before 3
  { src: `${F}/take2/S3-take2-480p.mp4`, name: 'take 2', made: 2500, seconds: 13.4, landed: true },
];
const L = sceneLayouts([p3, p2, p1], boards, takesIn);

ok('framing: the camera to 5 cm, a degree and a mm; else the board line, else the name without its number', () => {
  assert.equal(framingKey(A), framingKey({ ...A, cam: [1.02, 2.01, 1.49] }));
  assert.notEqual(framingKey(A), framingKey({ ...A, cam: [1.1, 2, 1.5] }));
  assert.notEqual(framingKey(B), framingKey({ ...B, lens: 50 }));
  assert.equal(framingKey({ name: '2 She looks' }), framingKey({ name: '5 she looks.' }));
  assert.equal(framingKey({}), '');
});

ok('previz takes laid out the same are one layout; a restaged one is the next', () => {
  assert.ok(sameLayout(p1, p2));
  assert.ok(!sameLayout(p2, p3));
  assert.ok(!sameLayout(p1, { ...p1, lines: [LINES1[0], { ...LINES1[1], t: [8, 11] }] }), 'a line moved half a second');
  assert.ok(sameLayout(p1, { ...p1, lines: [LINES1[0], { ...LINES1[1], t: [7.52, 11.02] }] }), 'within a frame');
  assert.deepEqual(L.map((l) => [l.n, l.key, l.previz, l.storyboard, l.current]), [[1, 2, [1, 2], 'v1', false], [2, 3, [3], 'v2', true]]);
});

ok('every take belongs to a layout: by its record, else by its date', () => {
  assert.deepEqual(L[0].takes.map((t) => [t.name, t.how]), [['take 1', 'record'], ['take 2', 'time']]);
  assert.equal(L[1].takes.length, 0);
  assert.equal(layoutOfTake(L, `${F}/take2/S3-take2-480p.mp4`)?.n, 1);
  // a take made after previz take 3 and with no record belongs to Layout 2
  const late = sceneLayouts([p1, p3], boards, [{ src: 'x.mp4', name: 'take 3', made: 9999, landed: true }]);
  assert.equal(layoutOfTake(late, 'x.mp4')?.key, 3);
});

ok('a scene with no previz take has no layouts; one with videos of one layout only has one', () => {
  assert.deepEqual(sceneLayouts([], boards, takesIn), []);
  assert.equal(sceneLayouts([p1, p2], [boards[0]], [takesIn[0]]).length, 1);
});

ok('each layout shot knows its line and its board', () => {
  assert.deepEqual(L[0].shots.map((s) => s.line), ['', 'when the lamp goes out you count to ten', 'then you light it again']);
  assert.deepEqual(L[1].shots.map((s) => s.line), ['', 'when the lamp goes out you count to ten', '', 'then you light it again']);
  assert.match(L[1].shots[3].board ?? '', /storyboard\/v2\/panels\/04-shot4\.png$/);
});

ok('safe swaps: the same framing and the same line, both ways', () => {
  assert.deepEqual([...safeSwaps(L[0], L[1])], [[1, 1], [2, 2], [3, 4]]);
  assert.deepEqual([...safeSwaps(L[1], L[0])], [[1, 1], [2, 2], [4, 3]], 'the lens shot has no counterpart');
  // the same framing with another line is not safe
  const moved: PrevizIn = { ...p3, n: 4, lines: [LINES1[0]] };
  const L4 = sceneLayouts([p1, moved], [{ ...boards[1], take: 4 }], [takesIn[0]].map((t) => ({ ...t, previzTake: 1 })));
  assert.ok(!safeSwaps(L4[0], L4[1]).has(3), 'the sea without the line');
  // a shot whose framing the previz does not give is never safe
  const bare: PrevizIn = { ...p1, n: 5, shots: p1.shots.map(({ id, t0, t1 }) => ({ id, t0, t1 })) };
  const L5 = sceneLayouts([bare, p3], boards.map((b) => (b.take === 1 ? { ...b, take: 5 } : b)), [{ ...takesIn[0], previzTake: 5 }]);
  assert.equal(safeSwaps(L5[0], L5[1]).size, 0);
});

ok('the warnings of a swap, in plain words, never a refusal', () => {
  const safe = swapCheck(L[0].shots[2], L[1].shots[3], 5.8, L[1], L[0]);
  assert.ok(safe.safe);
  assert.deepEqual(safe.short, ['2.4 s longer'], 'a safe swap still says it is longer than its place');
  assert.match(safe.warnings[0], /^It is 2\.4 s longer than shot 4 of Layout 2: what follows moves later by as much\.$/);
  const bad = swapCheck(L[0].shots[2], L[1].shots[2], 2.4, L[1], L[0]);
  assert.ok(!bad.safe);
  assert.deepEqual(bad.short, ['the line differs', 'framed for another place']);
  assert.equal(bad.warnings[0], 'The line no longer matches the picture: this shot has “MAREN: Then you light it again.”, shot 3 of Layout 2 has no line.');
  assert.equal(bad.warnings[1], 'It was framed for another place: “The sea” in place of “The lens”.');
  assert.deepEqual(swapCheck(L[0].shots[0], L[1].shots[0], 2.5, L[1], L[0]).warnings, [], 'within a quarter second: it fits');
  assert.deepEqual(swapCheck(undefined, L[1].shots[0], 2.4, L[1], L[0]).short, ['which shot is not known']);
  assert.deepEqual(swapCheck(L[0].shots[0], undefined, 2.4, L[1], L[0]).short, ['no such place']);
});

ok('a take\'s shot is its layout\'s shot: by place when the counts agree, else by time', () => {
  const ts = [{ i: 1, in: 0, out: 2.5 }, { i: 2, in: 2.5, out: 7.4 }, { i: 3, in: 7.4, out: 13.4 }];
  assert.equal(layoutShotOfTake(L[0], ts, 3)?.n, 3);
  const two = [{ i: 1, in: 0, out: 7.3 }, { i: 2, in: 7.3, out: 13.4 }];
  assert.equal(layoutShotOfTake(L[0], two, 1)?.n, 2, 'its middle (3.65 s) is in shot 2');
  assert.equal(layoutShotOfTake(L[0], two, 2)?.n, 3);
});

ok('what a layout puts in its place: its first take that landed, else its boards', () => {
  assert.deepEqual(layoutContent(L[0]), { take: L[0].takes[0] });
  assert.deepEqual(layoutContent(L[1]), { boards: true });
});

// ---- the cut: S2 (a take), S3 (Layout 1's take 1), S4 (a take); a music track and a marker after S3
const T1 = `${F}/take1/S3-take1-480p.mp4`;
const cut = (): Timeline => ({
  version: 'v5', fps: 24, width: 1080, height: 1920, at: '2026-11-19T00:00:00Z', markers: [{ at: 20, text: 'after S3' }],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [
      { id: 's2', src: 'S2.mp4', in: 0, out: 5, at: 0, takeRef: { scene: 'S2', take: 'take 1' } },
      { id: 's3', src: T1, in: 0, out: 13, at: 5, takeRef: { scene: 'S3', take: 'take 1' } },
      { id: 's4', src: 'S4.mp4', in: 0, out: 4, at: 18, takeRef: { scene: 'S4', take: 'take 1' } }] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [
      { id: 's2a', src: 'S2.mp4', in: 0, out: 5, at: 0, takeRef: { scene: 'S2', take: 'take 1' } },
      { id: 's3a', src: T1, in: 0, out: 13, at: 5, takeRef: { scene: 'S3', take: 'take 1' } },
      { id: 's4a', src: 'S4.mp4', in: 0, out: 4, at: 18, takeRef: { scene: 'S4', take: 'take 1' } }] },
    { id: 'A3', kind: 'audio', name: 'Music', clips: [{ id: 'm', src: 'm.wav', in: 0, out: 3, at: 19 }] },
  ],
});
const S3: PlanScene = { id: 'S3', title: 'The lamp', items: [{ who: 'MAREN', text: 'When the lamp goes out, you count to ten. Then you light it again.' }], previz: { take: 3, lines: p3.lines },
  shots: p3.shots.map((s, i) => ({ n: i + 1, id: s.id, t0: s.t0, t1: s.t1, text: s.name, board: boards[1].shots[i].src })) };
const pace = { wps: 2.9, gap: 0.5 };

ok('the layout the cut uses: from its take, then from its boards, then from the clips a choice put in', () => {
  assert.equal(layoutInCut(cut(), 'S3', L)?.n, 1);
  const e = chooseLayout(cut(), 'S3', L[1], { scene: S3, pace }, L[0]);
  assert.ok(typeof e !== 'string');
  assert.equal(layoutInCut(e.tl, 'S3', L)?.n, 2);
  const noMark = { ...e.tl, tracks: e.tl.tracks.map((t) => ({ ...t, clips: t.clips.map(({ layout: _l, ...c }) => c) })) };
  assert.equal(layoutInCut(noMark, 'S3', L)?.n, 2, 'its boards say so too');
  assert.equal(layoutInCut(cut(), 'S9', L), undefined);
});

ok('choosing a layout is one edit: the scene\'s clips go, the layout\'s come in, what follows moves; Layout 1 again gives the cut it was', () => {
  const before = cut();
  const e = chooseLayout(before, 'S3', L[1], { scene: S3, pace }, L[0]);
  assert.ok(typeof e !== 'string');
  assert.equal(e.words, 'S3: Layout 2 in the film (previz take 3, boards v2), its boards and lines, in place of Layout 1');
  const v = e.tl.tracks[0].clips, a = e.tl.tracks[1].clips;
  assert.deepEqual(v.filter((c) => c.scene === 'S3').map((c) => [c.plan, c.shot, c.layout]), [['board', 1, 3], ['board', 2, 3], ['board', 3, 3], ['board', 4, 3]]);
  assert.ok(a.filter((c) => c.scene === 'S3').every((c) => c.plan === 'line' && c.layout === 3));
  assert.ok(!v.some((c) => c.src === T1) && !a.some((c) => c.src === T1), 'the take is out');
  assert.equal(JSON.stringify(before), JSON.stringify(cut()), 'the cut given is not changed');
  const back = chooseLayout(e.tl, 'S3', L[0], { take: { src: T1, name: 'take 1', seconds: 13 } }, L[1]);
  assert.ok(typeof back !== 'string');
  assert.equal(back.words, 'S3: Layout 1 in the film (previz take 2, boards v1), take 1, in place of Layout 2');
  const plays = (tl: Timeline) => JSON.stringify(tl.tracks.map((t) => t.clips.map((c) => [c.src, c.in, c.out, c.at])), null, 0);
  assert.equal(plays(back.tl), plays(before), 'every clip plays where it did');
  assert.deepEqual(back.tl.markers, before.markers);
  assert.equal(back.tl.tracks[2].clips[0].at, 19, 'the music came back too');
  // a scene longer by 1 s moves what follows by 1 s
  const longer = chooseLayout(cut(), 'S3', L[0], { take: { src: T1, name: 'take 1', seconds: 14 } });
  assert.ok(typeof longer !== 'string');
  assert.equal(longer.tl.tracks[0].clips.find((c) => c.id === 's4')!.at, 19);
  assert.equal(longer.tl.markers[0].at, 21);
});

ok('choosing a layout is refused only when it cannot be done', () => {
  const locked = cut(); locked.tracks[0].locked = true;
  assert.match(String(chooseLayout(locked, 'S3', L[1], { scene: S3, pace })), /V1 is locked/);
  assert.match(String(chooseLayout(cut(), 'S9', L[1], { scene: S3, pace })), /S9 is not in the film/);
});

ok('"Update the timeline" leaves a scene whose layout was chosen as it is', () => {
  const e = chooseLayout(cut(), 'S3', L[1], { scene: S3, pace });
  assert.ok(typeof e !== 'string');
  // the files now give S3 as a later storyboard: nothing changes, since the user chose the layout
  const src = { locked: { version: 'v2' }, pace, scenes: [{ ...S3, shots: S3.shots!.map((s) => ({ ...s, t1: s.t1 + 0.5 })) }] };
  const b = bringUp(e.tl, src);
  assert.ok(!b || JSON.stringify(b.tl.tracks[0].clips.filter((c) => c.scene === 'S3')) === JSON.stringify(e.tl.tracks[0].clips.filter((c) => c.scene === 'S3')));
});

// ---- a shot of Layout 1's take into a place of Layout 2's boards
const take1: TakeShots = { src: T1, scene: 'S3', name: 'take 1', seconds: 13, cuts: [2.4, 7.2], state: 'ready' };
const by: BySrc = new Map([[T1, take1]]);

ok('a shot of another layout\'s take into a place of the layout in use: the boards and the lines under it give way, the rest moves by the difference', () => {
  const e = chooseLayout(cut(), 'S3', L[1], { scene: S3, pace });
  assert.ok(typeof e !== 'string');
  // take 1's shot 3 (the sea, 5.8 s) into Layout 2's shot 4 (3.4 s): a safe swap, 2.4 s longer
  const sh = shotsOf(take1)[2];
  const ls = layoutShotOfTake(L[0], shotsOf(take1), sh.i)!;
  assert.equal(ls.n, 3);
  const put = putShot(e.tl, 'S3', 3, take1, 'take 1', by, 'x1', undefined, { to: 4, layout: 3 })!;
  assert.equal(put.note, 'S3 shot 4: take 1 shot 3 in place of its boards, 57 f longer');
  const v = put.tl.tracks[0].clips, a = put.tl.tracks[1].clips;
  const c = v.find((x) => x.id === 'x1')!;
  assert.deepEqual([c.shot, c.layout, c.in, c.out], [4, 3, 7.2, 13]);
  assert.equal(shotNo(c, by), 4, 'it fills place 4');
  assert.equal(ownShot(c, by), 3, 'it shows its take\'s shot 3');
  assert.ok(inFilm(put.tl, by).has(`${T1}#3`), 'the Takes view rings the shot it shows');
  assert.ok(!v.some((x) => x.plan === 'board' && x.shot === 4), 'the board of place 4 is gone');
  assert.deepEqual(v.filter((x) => x.plan === 'board').map((x) => x.shot), [1, 2, 3], 'the others stay');
  assert.ok(!a.some((x) => x.plan === 'line' && x.at >= c.at - 1e-6 && x.at < c.at + 5.8 - 1e-6), 'no planned line under it');
  assert.ok(a.some((x) => x.id === 'x1a' && x.src === T1), 'its own sound is in');
  assert.equal(layoutInCut(put.tl, 'S3', L)?.n, 2, 'the scene still uses Layout 2');
  // the track check's own rule: no two clips on a track overlap by half a frame or more
  for (const t of put.tl.tracks) {
    const cs = [...t.clips].sort((x, y) => x.at - y.at);
    for (let i = 1; i < cs.length; i++) assert.ok(cs[i].at >= cs[i - 1].at + (cs[i - 1].out - cs[i - 1].in) - 0.5 / 24, `${t.id}: ${cs[i - 1].id} and ${cs[i].id} overlap`);
  }
  assert.equal(put.tl.tracks[0].clips.find((x) => x.id === 's4')!.at, e.tl.tracks[0].clips.find((x) => x.id === 's4')!.at + 57 / 24);
  // withPicks carries `into` the same way, and says the place in its words
  const w = withPicks(e.tl, [{ scene: 'S3', n: 3, src: T1, into: { to: 4, layout: 3 } }, { scene: 'S3', n: 1, src: T1, into: { to: 1, layout: 3 } }], by, new Map())!;
  assert.match(w.note, /^2 shots from other takes put in the film: S3 shots 1 and 4$/);
});

ok('a line running past a place keeps the part outside it', () => {
  const e = chooseLayout(cut(), 'S3', L[1], { scene: { ...S3, previz: undefined }, pace });
  assert.ok(typeof e !== 'string');
  const before = e.tl.tracks[1].clips.filter((c) => c.plan === 'line');
  assert.equal(before.length, 1, 'at reading pace: one line over the whole scene');
  const put = putShot(e.tl, 'S3', 1, take1, 'take 1', by, 'x2', undefined, { to: 2, layout: 3 })!;
  const lines = put.tl.tracks[1].clips.filter((c) => c.plan === 'line');
  assert.equal(lines.length, 2, 'the part before and the part after');
  assert.ok(lines.every((l) => l.text === before[0].text));
});

ok('the record of what was sent: its layout', () => {
  assert.deepEqual(sentLayout({ layout: { previz_take: 'previz/S3/S3-previz-take-9.json', previz_take_number: 9, storyboard: 'previz/S3/storyboard/v6', storyboard_version: 'v6' } }), { previzTake: 9, storyboard: 'v6' });
  assert.deepEqual(sentLayout({ layout: { previz_take: 'previz/S3/S3-previz-take-4.mp4' } }), { previzTake: 4 });
  assert.deepEqual(sentLayout({ layout: null }), {});
  assert.deepEqual(sentLayout(undefined), {});
  // a pick-up's record names its own previz take, not the scene's: not read as one (placed by its date)
  const egg = { layout: { previz_take: 'previz/FIX-egg-S2/FIX-egg-S2-previz-take-3.json', previz_take_number: 3, storyboard_version: 'v3' } };
  assert.deepEqual(sentLayout(egg, 'S2'), {});
  assert.deepEqual(sentLayout({ layout: { previz_take: 'previz/S2/S2-previz-take-5.json', previz_take_number: 5, storyboard_version: 'v6' } }, 'S2'), { previzTake: 5, storyboard: 'v6' });
  assert.deepEqual(sentLayout({ layout: { previz_take: 'previz/S20/S20-previz-take-1.json', previz_take_number: 1 } }, 'S2'), {});
  // such a pick-up, made after the scene's newest previz take, is under the newest layout with the scene's own take
  const pv = (n: number, written: number) => ({ n, shots: [{ id: '1', t0: 0, t1: 4 }, { id: '2', t0: 4, t1: 9 + n }], lines: [], written });
  const lays = sceneLayouts([pv(3, 10), pv(5, 20)], [], [
    { src: 'S2/take1.mp4', name: 'take 1', previzTake: 5, landed: true },
    { src: 'FIX-egg-S2/take1.mp4', name: 'FIX egg S2 · take 1', ...sentLayout(egg, 'S2'), made: 30, landed: true },
  ]);
  assert.deepEqual(lays.map((l) => [l.key, l.takes.map((t) => t.src)]), [[5, ['S2/take1.mp4', 'FIX-egg-S2/take1.mp4']]]);
});

ok('the layouts sample: two layouts of S3, four safe swaps, the cut on Layout 1, both choices build', () => {
  const [s3] = mockLayouts('sample-day1-layouts')!;
  assert.equal(s3.scene, 'S3');
  const [l1, l2] = s3.layouts;
  assert.deepEqual([l1.n, l1.storyboard, l1.takes.length, l2.n, l2.storyboard, l2.takes.length, l2.current], [1, 'v1', 2, 2, 'v2', 0, true]);
  assert.deepEqual([...safeSwaps(l1, l2)], [[1, 1], [3, 4], [4, 5], [5, 6]]);
  const c = day1SampleCut('sample-day1-layouts')!.current!;
  assert.equal(layoutInCut(c, 'S3', s3.layouts)?.n, 1);
  for (const l of s3.layouts) {
    const put = mockLayoutPut('sample-day1-layouts', 'S3', l)!;
    const e = chooseLayout(c, 'S3', l, put, l1);
    if (l.n === 1) { assert.ok(typeof e !== 'string'); continue; }
    assert.ok(typeof e !== 'string');
    assert.equal(layoutInCut(e.tl, 'S3', s3.layouts)?.n, 2);
  }
  // the plan source of the sample is S3's Layout 2 now, and "Update the timeline" brings nothing for S3 (its take is in)
  const src = mockPlanSource('sample-day1-layouts')!;
  assert.equal(src.scenes.find((x) => x.id === 'S3')!.shots!.length, 6);
  assert.equal(buildScene(src.scenes.find((x) => x.id === 'S3')!, src.pace, 24).timing.by, 'previz');
  assert.deepEqual(mockLayouts('sample-day1-takes'), []);
});

console.log(`ok · ${n} checks`);
