// npm run shots:test
// Shots and scenes out of the film and back (shots.ts: takeOutShot, takeOutScene, sceneAnchor, putShot), on a
// hand-made cut: a shot taken out and put back gives the cut it was; a scene taken out and one of its shots put
// back lands between its neighbouring scenes, not at the end; the other tracks and the markers close up and come
// back. Also checks the sample film's takes (src/fixtures/shots.ts) against its cut.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { idsFor, inFilm, picksWords, putShot, readShotIds, sceneAnchor, sceneOrder, shotClips, shotNo, shotOf, shotsOf, shotTimeline, takeOutScene, takeOutShot, withPicks, type BySrc, type TakeShots } from '../src/components/edit/shots';
import { readVariation } from '../src/server/edit/shots';
import { landSample } from '../src/fixtures/shots';
import { splitClip, totalF } from '../src/components/edit/model';
import { mockShots } from '../src/fixtures/shots';
import cutFixture from '../src/fixtures/boards/cut-the-lighthouse.json';

const F = 'assets/films/x';
const takes: TakeShots[] = [
  { src: `${F}/S1.mp4`, scene: 'S1', name: 'take 1', seconds: 8, cuts: [2, 5], state: 'ready' },
  { src: `${F}/S2.mp4`, scene: 'S2', name: 'take 1', seconds: 6, cuts: [3], state: 'ready' },
  { src: `${F}/S2b.mp4`, scene: 'S2', name: 'take 2', seconds: 7, cuts: [3.5], state: 'ready' },
  { src: `${F}/S10.mp4`, scene: 'S10', name: 'take 1', seconds: 6, cuts: [4], state: 'ready' },
];
const by: BySrc = new Map(takes.map((t) => [t.src, t]));
const shot = (scene: string, src: string, from: number, to: number, at: number, n: number): TimelineClip => ({ id: `${scene}-${n}`, src, in: from, out: to, at, label: `${scene} · take 1 · shot ${n}`, takeRef: { scene, take: 'take 1' } });
const pic: TimelineClip[] = [
  shot('S1', `${F}/S1.mp4`, 0, 2, 0, 1), shot('S1', `${F}/S1.mp4`, 2, 5, 2, 2), shot('S1', `${F}/S1.mp4`, 5, 8, 5, 3),
  shot('S2', `${F}/S2.mp4`, 0, 3, 8, 1), shot('S2', `${F}/S2.mp4`, 3, 6, 11, 2),
  shot('S10', `${F}/S10.mp4`, 0, 4, 14, 1), shot('S10', `${F}/S10.mp4`, 4, 6, 18, 2),
];
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z',
  markers: [{ at: 1, text: 'early' }, { at: 12, text: 'in S2 shot 2' }, { at: 17, text: 'in S10' }],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: pic.map((c) => ({ ...c })) },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pic.map((c) => ({ ...c, id: `${c.id}a` })) },
    { id: 'A2', kind: 'audio', name: 'Effects', clips: [{ id: 'fx1', src: `${F}/fx1.wav`, in: 0, out: 1, at: 1 }, { id: 'fx2', src: `${F}/fx2.wav`, in: 0, out: 1, at: 15 }] },
    { id: 'A3', kind: 'audio', name: 'Music', clips: [{ id: 'm1', src: `${F}/music.wav`, in: 0, out: 10, at: 0 }] },
  ],
} as Timeline);

/** What plays: every clip's file, stretch and place, by track, without the ids and labels a put-back renews. */
const plays = (tl: Timeline) => JSON.stringify({
  tracks: tl.tracks.map((t) => [t.id, t.clips.map((c) => [c.src, c.in, c.out, c.at, c.takeRef?.scene ?? '']).sort((a, b) => Number(a[3]) - Number(b[3]))]),
  markers: tl.markers.map((m) => [m.at, m.text]),
});
const atOf = (tl: Timeline, track: string, src: string, from: number) => tl.tracks.find((t) => t.id === track)!.clips.find((c) => c.src === src && c.in === from)?.at;
let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

const tl = base();
const frozen = JSON.stringify(tl);

ok('scene order is natural (S2 before S10)', () => assert.deepEqual(sceneOrder(['S10', 'S2', 'S3', 'S2']), ['S2', 'S3', 'S10']));

ok('a shot taken out: its picture and sound go, what follows closes up on every track, markers too', () => {
  const e = takeOutShot(tl, by, 'S2', 1, 'Take 1')!;
  assert.equal(e.note, 'S2 shot 1 taken out of the film (Take 1)');
  assert.equal(totalF(e.tl), totalF(tl) - 3 * 24);
  assert.ok(!inFilm(e.tl, by).has(`${F}/S2.mp4#1`));
  assert.equal(e.tl.tracks[0].clips.length, 6);
  assert.equal(e.tl.tracks[1].clips.length, 6);
  assert.equal(atOf(e.tl, 'V1', `${F}/S2.mp4`, 3), 8);
  assert.equal(atOf(e.tl, 'A1', `${F}/S2.mp4`, 3), 8);
  assert.equal(atOf(e.tl, 'V1', `${F}/S10.mp4`, 0), 11);
  assert.equal(atOf(e.tl, 'A2', `${F}/fx2.wav`, 0), 12);
  assert.equal(atOf(e.tl, 'A2', `${F}/fx1.wav`, 0), 1);
  assert.deepEqual(e.tl.markers.map((m) => m.at), [1, 9, 14]);
  assert.equal(JSON.stringify(tl), frozen, 'the cut given is not changed');
});

ok('…and put back: the cut is what it was (clips, times on every track, markers)', () => {
  const out = takeOutShot(tl, by, 'S2', 1)!;
  const back = putShot(out.tl, 'S2', 1, by.get(`${F}/S2.mp4`)!, 'take 1', by, 'b1')!;
  assert.equal(back.at, 8 * 24);
  assert.equal(plays(back.tl), plays(tl));
});

ok('every shot taken out and put back, one at a time, gives the cut it was', () => {
  // (a shot inside which a clip of another track or a marker starts is the exception below)
  const starts = [...tl.tracks.slice(2).flatMap((t) => t.clips.map((x) => x.at)), ...tl.markers.map((m) => m.at)];
  const clean = pic.filter((c) => !starts.some((s) => s >= c.at && s < c.at + c.out - c.in));
  assert.equal(clean.length, 4);
  for (const c of clean) {
    const k = shotNo(c, by)!;
    const scene = c.takeRef!.scene;
    const out = takeOutShot(tl, by, scene, k)!;
    const back = putShot(out.tl, scene, k, by.get((c.src ?? ''))!, 'take 1', by)!;
    assert.equal(plays(back.tl), plays(tl), `${scene} shot ${k}`);
  }
});

ok('the one exception: what starts on another track inside the shot taken out stays put, and moves along when it comes back', () => {
  // S1 shot 1 (0 to 2 s) has the effect at 1 s, the music at 0 s and a marker at 1 s starting inside it. Taken
  // out, they stay (nothing before them closed up); put back, the shot is inserted before them and they move
  // along. Command-Z on the page goes back to the version itself, so there the cut is exactly what it was.
  const out = takeOutShot(tl, by, 'S1', 1)!;
  assert.equal(atOf(out.tl, 'A2', `${F}/fx1.wav`, 0), 1);
  const back = putShot(out.tl, 'S1', 1, by.get(`${F}/S1.mp4`)!, 'take 1', by)!;
  assert.equal(atOf(back.tl, 'A2', `${F}/fx1.wav`, 0), 3);
  assert.equal(atOf(back.tl, 'V1', `${F}/S1.mp4`, 0), 0);
  assert.equal(atOf(back.tl, 'V1', `${F}/S2.mp4`, 0), 8);
});

ok('a shot cut in two with the blade goes out whole', () => {
  const cut = splitClip(tl, { trackId: 'V1', clipId: 'S1-2' }, 3 * 24)!.tl;
  assert.equal(cut.tracks[0].clips.length, 8);
  const e = takeOutShot(cut, by, 'S1', 2)!;
  assert.equal(plays(e.tl), plays(takeOutShot(tl, by, 'S1', 2)!.tl));
});

ok('a whole scene taken out: every shot goes, the next scene follows straight on', () => {
  const e = takeOutScene(tl, by, 'S2')!;
  assert.equal(e.note, 'S2 taken out of the film (2 shots)');
  assert.equal(totalF(e.tl), totalF(tl) - 6 * 24);
  assert.equal(atOf(e.tl, 'V1', `${F}/S10.mp4`, 0), 8);
  assert.equal(atOf(e.tl, 'A2', `${F}/fx2.wav`, 0), 9);
  assert.equal(e.tl.markers.find((m) => m.text === 'in S10')!.at, 11);
  assert.ok(![...inFilm(e.tl, by)].some((k) => k.includes('/S2.mp4')));
});

ok('a scene out of the film sits after the nearest earlier scene in the film', () => {
  const e = takeOutScene(tl, by, 'S2')!;
  assert.equal(sceneAnchor(e.tl, by, 'S2'), 8 * 24);
  assert.equal(sceneAnchor(e.tl, by, 'S2', ['S1', 'S2', 'S10']), 8 * 24);
  // S1 out too: nothing before S2 is in the film, so it would start the film
  const both = takeOutScene(e.tl, by, 'S1')!;
  assert.equal(sceneAnchor(both.tl, by, 'S2'), 0);
  // the film's own order wins over the ids' (here S10 comes first)
  assert.equal(sceneAnchor(e.tl, by, 'S2', ['S10', 'S1', 'S2']), 8 * 24);
  assert.equal(sceneAnchor(e.tl, by, 'S2', ['S1', 'S10', 'S2']), totalF(e.tl));
});

ok('a scene before which the earlier scene is in pieces sits after the piece before the later scenes', () => {
  // S1's last shot moved after S10 (a pick-up placed late): S2, taken out, belongs after S1's other shots
  const moved = base();
  const v = moved.tracks[0];
  const s13 = v.clips.find((c) => c.id === 'S1-3')!;
  v.clips = v.clips.filter((c) => c !== s13);
  v.clips.push({ ...s13, at: 20 });
  const e = takeOutScene(moved, by, 'S2')!;
  assert.equal(sceneAnchor(e.tl, by, 'S2'), 5 * 24);
});

ok('one shot of a scene out of the film comes back between its neighbours, not at the end', () => {
  const out = takeOutScene(tl, by, 'S2')!;
  const back = putShot(out.tl, 'S2', 2, by.get(`${F}/S2b.mp4`)!, 'take 2', by, 'b2', ['S1', 'S2', 'S10'])!;
  assert.equal(back.at, 8 * 24);
  assert.equal(atOf(back.tl, 'V1', `${F}/S2b.mp4`, 3.5), 8);
  assert.equal(atOf(back.tl, 'A1', `${F}/S2b.mp4`, 3.5), 8);
  assert.equal(atOf(back.tl, 'V1', `${F}/S10.mp4`, 0), 11.5);
  assert.equal(atOf(back.tl, 'A2', `${F}/fx2.wav`, 0), 12.5);
  assert.equal(back.tl.markers.find((m) => m.text === 'in S10')!.at, 14.5);
  // without the film's list, the ids' natural order gives the same place (S2 before S10)
  assert.equal(putShot(out.tl, 'S2', 2, by.get(`${F}/S2b.mp4`)!, 'take 2', by)!.at, 8 * 24);
});

ok('a scene out and its shots put back in order gives the cut it was', () => {
  // (without the marker inside S2, the exception above)
  const tl2 = base();
  tl2.markers = tl2.markers.filter((m) => m.text !== 'in S2 shot 2');
  const out = takeOutScene(tl2, by, 'S2')!;
  const one = putShot(out.tl, 'S2', 1, by.get(`${F}/S2.mp4`)!, 'take 1', by)!;
  const two = putShot(one.tl, 'S2', 2, by.get(`${F}/S2.mp4`)!, 'take 1', by)!;
  assert.equal(plays(two.tl), plays(tl2));
  // and in the other order: shot 2 first, then shot 1 goes before it
  const two2 = putShot(out.tl, 'S2', 2, by.get(`${F}/S2.mp4`)!, 'take 1', by)!;
  const one2 = putShot(two2.tl, 'S2', 1, by.get(`${F}/S2.mp4`)!, 'take 1', by)!;
  assert.equal(plays(one2.tl), plays(tl2));
});

ok('nothing to take out: no edit', () => {
  assert.equal(takeOutShot(tl, by, 'S2', 5), undefined);
  assert.equal(takeOutScene(tl, by, 'S7'), undefined);
});

// ---- the sample film's takes (sample-data mode), against its cut
ok('sample film: every picture clip of a take is one whole shot of it, ringed, and nothing is split', () => {
  const { takes: mock } = mockShots('the-lighthouse');
  const byM: BySrc = new Map(mock.filter((t) => t.state === 'ready').map((t) => [t.src, t]));
  const cut = (cutFixture as unknown as { current: Timeline }).current;
  assert.equal(shotTimeline(cut, byM), cut, 'no clip runs across a cut');
  const v = cut.tracks.find((t) => t.id === 'V1')!;
  for (const c of v.clips) {
    const k = shotNo(c, byM);
    assert.ok(k, `${c.id} has a shot`);
    assert.ok(inFilm(cut, byM).has(`${c.src}#${k}`));
  }
  const scenes = new Set(v.clips.map((c) => c.takeRef!.scene));
  for (const s of scenes) assert.equal(mock.filter((t) => t.scene === s && /^sample take [AB]$/.test(t.name)).length, 2, s);
  assert.equal(mock.filter((t) => t.state === 'failed').length, 1);
  assert.deepEqual(mockShots('the-lighthouse').takes, mock, 'the same every time');
  assert.deepEqual(mockShots('no-such-film'), { takes: [], waiting: 0 });
});


// ---- several shots selected at once (ASKS 52): one step that is the shots put in one after the other
ok('withPicks: two shots of two scenes, one note, the same cut as putShot twice; a shot the film has is left out', () => {
  const tl = base();
  const names = new Map(takes.map((t) => [t.src, t.name]));
  const e = withPicks(tl, [{ scene: 'S2', n: 2, src: `${F}/S2b.mp4` }, { scene: 'S2', n: 1, src: `${F}/S2b.mp4` }, { scene: 'S1', n: 2, src: `${F}/S1.mp4` }], by, names);
  assert.ok(e);
  assert.equal(e.placed.length, 2, 'S1 shot 2 is the film\'s own already');
  assert.equal(e.note, '2 shots from other takes put in the film: S2 shots 1 and 2');
  const a = putShot(tl, 'S2', 2, by.get(`${F}/S2b.mp4`)!, 'take 2', by)!;
  const b = putShot(a.tl, 'S2', 1, by.get(`${F}/S2b.mp4`)!, 'take 2', by)!;
  assert.equal(plays(e.tl), plays(b.tl));
  const one = withPicks(tl, [{ scene: 'S2', n: 2, src: `${F}/S2b.mp4` }], by, names)!;
  assert.match(one.note, /^S2 shot 2: take 2 in place of take 1/);
  const tried = withPicks(tl, [{ scene: 'S2', n: 2, src: `${F}/S2b.mp4` }], by, names, 'try')!;
  assert.deepEqual(tried.ids, ['try0']);
  assert.ok(tried.tl.tracks.find((t) => t.id === 'A1')!.clips.some((c) => c.id === 'try0a'));
  assert.equal(withPicks(tl, [{ scene: 'S1', n: 1, src: `${F}/S1.mp4` }], by, names), undefined, 'nothing changes');
  assert.equal(picksWords([{ scene: 'S7', n: 3 }, { scene: 'S5', n: 3 }, { scene: 'S2', n: 2 }, { scene: 'S5', n: 1 }]), 'S2 shot 2, S5 shots 1 and 3, S7 shot 3');
  assert.equal(picksWords([{ scene: 'S5', n: 1 }, { scene: 'S5', n: 2 }, { scene: 'S5', n: 4 }]), 'S5 shots 1, 2 and 4');
});

// ---- variations (ASKS 51): variation.json read leniently; the sample film shows one landed, one being made, one failed
ok('readVariation and the sample variations', () => {
  assert.deepEqual(readVariation({ from: ' a/b.mp4 ', note: 'x', startedAt: '2026-11-14T10:58:00Z' }), { from: 'a/b.mp4', note: 'x', startedAt: '2026-11-14T10:58:00Z' });
  assert.equal(readVariation({ note: 'no source' }), undefined);
  assert.equal(readVariation('nonsense'), undefined);
  assert.equal(readVariation({ from: 'a', failed: 'refused' })!.failed, 'refused');
  const s3 = mockShots('the-lighthouse').takes.filter((t) => t.scene === 'S3' && t.variation);
  assert.equal(s3.length, 3);
  assert.equal(s3.filter((t) => t.state === 'making' && !t.variation!.failed).length, 1, 'one being made');
  assert.equal(s3.filter((t) => t.variation!.failed).length, 1, 'one failed');
  assert.equal(s3.filter((t) => t.state === 'ready').length, 1, 'one landed');
  landSample('the-lighthouse', true);
  assert.equal(mockShots('the-lighthouse').takes.filter((t) => t.scene === 'S3' && t.variation && t.state === 'ready').length, 2, 'landed');
  landSample('the-lighthouse', false);
  assert.equal(mockShots('the-lighthouse').takes.filter((t) => t.scene === 'S3' && t.state === 'making').length, 2);
});

// ---- a pick-up that redoes a later shot of its scene (ASKS 60): its shots are the scene's numbers, from the shots file
ok('readShotIds and idsFor: the shots file read leniently; the ids only when they match the take\'s shots', () => {
  assert.deepEqual(readShotIds({ duration: 6, shots: [{ id: '5', t0: 0, t1: 6 }] }), [5]);
  assert.deepEqual(readShotIds([{ id: 3 }, { id: '4' }]), [3, 4]);
  assert.equal(readShotIds({ shots: [{ id: '2a' }] }), undefined, 'not a whole number');
  assert.equal(readShotIds({ shots: [{ id: '4' }, { id: '4' }] }), undefined, 'a repeat');
  assert.equal(readShotIds({ shots: [{ id: '4' }, { id: '2' }] }), undefined, 'out of order');
  assert.equal(readShotIds({ shots: [] }), undefined);
  assert.equal(readShotIds('nonsense'), undefined);
  assert.deepEqual(idsFor([5], []), [5]);
  assert.deepEqual(idsFor([3, 4], [2.5]), [3, 4]);
  assert.equal(idsFor([1, 2, 3], [2, 5]), undefined, '1, 2, 3 already');
  assert.equal(idsFor([5], [3]), undefined, 'the detector found a cut the file does not list');
  assert.equal(idsFor([4, 5], []), undefined, 'the file lists a shot the detector did not find');
  assert.equal(idsFor(undefined, []), undefined, 'no file');
});

const PU = `${F}/FIX-S1/takes/take1/FIX-S1-take1.mp4`;
const pickUp: TakeShots = { src: PU, scene: 'S1', name: 'FIX-S1 · take 1', seconds: 4, cuts: [], ids: [3], state: 'ready' };
const byP: BySrc = new Map([...by, [PU, pickUp]]);
ok('a pick-up of shot 3: its one shot is the scene\'s shot 3; its take\'s own place stays 1', () => {
  assert.deepEqual(shotsOf(pickUp), [{ n: 3, i: 1, in: 0, out: 4 }]);
  assert.equal(shotOf(pickUp, 1), undefined);
  assert.deepEqual(shotOf(pickUp, 3), { n: 3, i: 1, in: 0, out: 4 });
  assert.deepEqual(shotsOf({ ...pickUp, cuts: [2] }).map((s) => s.n), [1, 2], 'ids that do not match the shots are not used');
  assert.deepEqual(shotsOf(by.get(`${F}/S1.mp4`)).map((s) => s.n), [1, 2, 3], 'a take without ids as before');
});
ok('a pick-up of shot 3 goes in shot 3\'s place, is shot 3 of the cut, comes out as shot 3, and back', () => {
  const e = putShot(tl, 'S1', 3, pickUp, 'FIX-S1 · take 1', byP, 'p1')!;
  assert.match(e.note, /^S1 shot 3: FIX-S1 · take 1 in place of take 1, 24 f longer$/);
  const v = e.tl.tracks.find((t) => t.id === 'V1')!;
  assert.deepEqual(v.clips.filter((c) => c.takeRef?.scene === 'S1').map((c) => [c.src, c.in, c.out, c.at]), [[`${F}/S1.mp4`, 0, 2, 0], [`${F}/S1.mp4`, 2, 5, 2], [PU, 0, 4, 5]], 'shots 1 and 2 stay, shot 3 is the pick-up');
  assert.equal(v.clips.find((c) => c.id === 'p1')!.label, 'S1 · FIX-S1 · take 1 · shot 3');
  assert.equal(atOf(e.tl, 'V1', `${F}/S2.mp4`, 0), 9, 'what follows moves by the second it is longer');
  assert.equal(shotNo(v.clips.find((c) => c.id === 'p1')!, byP), 3);
  assert.ok(inFilm(e.tl, byP).has(`${PU}#3`) && !inFilm(e.tl, byP).has(`${PU}#1`) && !inFilm(e.tl, byP).has(`${F}/S1.mp4#3`));
  assert.deepEqual(shotClips(e.tl, byP, 'S1', 3).map((c) => c.id), ['p1']);
  assert.equal(shotClips(e.tl, byP, 'S1', 1).length, 1, 'shot 1 is still the main take\'s only');
  const out = takeOutShot(e.tl, byP, 'S1', 3, 'FIX-S1 · take 1')!;
  assert.equal(out.note, 'S1 shot 3 taken out of the film (FIX-S1 · take 1)');
  assert.deepEqual(out.tl.tracks.find((t) => t.id === 'V1')!.clips.filter((c) => c.takeRef?.scene === 'S1').map((c) => c.src), [`${F}/S1.mp4`, `${F}/S1.mp4`], 'the main take\'s shots 1 and 2 stay');
  const back = putShot(out.tl, 'S1', 3, pickUp, 'FIX-S1 · take 1', byP, 'p1')!;
  assert.equal(plays(back.tl), plays(e.tl), 'put back where it was');
  const w = withPicks(tl, [{ scene: 'S1', n: 3, src: PU }], byP, new Map())!;
  assert.equal(plays(w.tl), plays(e.tl), 'withPicks: the same');
  assert.equal(shotTimeline(e.tl, byP), e.tl, 'nothing to split');
});

console.log(`ok · ${n} checks`);
