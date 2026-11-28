// npx tsx scripts/frame-gaps-test.ts
// Shots of a 25 fps take on a 24 fps cut: a shot that could not be joined to the one before it, a black space no bar
// could be moved to fill. Takes from a 25 fps model have their shot cuts found in them (S2 17.6 and 20.24 s, S3 14.24 and 17.44 s) are off the cut's frame grid; the page drew a
// one-frame hole (and once an overlap) between two shots of one take, and no trim could close it: each piece already sat
// on its shot's last frame. With a real film's numbers (harness/shots.json, and Alma's cuts.json with every cut moved up
// to the next 24 fps frame): every shot boundary is a whole frame of the cut, the frame where the render first
// shows the new shot (measured with ffmpeg's fps filter); consecutive shots meet exactly, drawn and
// split, and after a blade, a shot tried in place, a trim, a dragged-in take; a cut saved before the fix with pieces off
// the grid shows no hole either, and its joins can be moved.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { endF, findClip, lenF, splitClip, startF, touching, trimClip, trimLimit, type ClipRef } from '../src/components/edit/model';
import { clipFrames, mainTracks, onGrid, putShot, shotEdge, shotsOf, shotTimeline, type BySrc, type TakeShots } from '../src/components/edit/shots';
import { takePieces } from '../src/components/edit/dragTake';

const FPS = 24;
let n = 0;
const ok = (c: boolean, what: string) => { assert.ok(c, what); n++; };

// a film's takes: harness/shots.json (25 fps files), the cut's lengths, and the frames where the render first shows
// each new shot (ffmpeg, trim=start=0,fps=24,select='gt(scene,0.3)')
const REAL: { scene: string; seconds: number; out: number; cuts: number[]; alma: number[]; rendered?: number[] }[] = [
  { scene: 'S2', seconds: 28.24, out: 28.25, cuts: [5.04, 9.04, 12.08, 17.6, 20.24], alma: [5.041667, 9.041667, 12.083333, 17.625, 20.25], rendered: [121, 217, 290, 422, 486] },
  { scene: 'S3', seconds: 23.12, out: 23.125, cuts: [3.92, 9.52, 14.24, 17.44], alma: [3.958333, 9.541667, 14.25, 17.458333], rendered: [94, 228, 342, 419] },
  { scene: 'S7', seconds: 27.28, out: 27.291667, cuts: [3.6, 7.84, 12.4, 16.8, 22.56], alma: [3.625, 7.875, 12.416667, 16.833333, 22.583333], rendered: [86, 188, 298, 403, 541] },
  // a Seedance take, already 24 fps: unchanged
  { scene: 'S10', seconds: 13.041667, out: 13.041667, cuts: [2.791667, 6.083333, 8.541667, 10.208333], alma: [2.791667, 6.083333, 8.541667, 10.208333] },
];
const srcOf = (scene: string) => `assets/films/x/generations/${scene}/takes/take1/${scene}-take1-480p.mp4`;
const takesWith = (which: 'cuts' | 'alma'): TakeShots[] => REAL.map((r) => ({ src: srcOf(r.scene), scene: r.scene, name: 'take 1', seconds: r.seconds, cuts: r[which], state: 'ready' }));
const byOf = (ts: TakeShots[]): BySrc => new Map(ts.map((t) => [t.src, t]));

/** The cut as the film has it: each take whole, one clip, back to back, its sound under it. */
function wholeCut(): Timeline {
  let at = 0;
  const pic: TimelineClip[] = REAL.map((r) => { const c = { id: `${r.scene}-take`, src: srcOf(r.scene), in: 0, out: r.out, at, label: `${r.scene} · take 1`, takeRef: { scene: r.scene, take: 'take 1' } }; at = Math.round((at + r.out) * FPS) / FPS; return c; });
  return { version: 'v1', fps: FPS, width: 1920, height: 1080, markers: [], tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: pic },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pic.map((c) => ({ ...c, id: `${c.id}a` })) },
  ] } as unknown as Timeline;
}

/** Every clip on V1 and A1 meets the one after it on the very frame, no hole and no overlap; the whole runs as long. */
function meets(tl: Timeline, what: string, total?: number) {
  for (const t of [mainTracks(tl).v!, mainTracks(tl).a!]) {
    const cs = [...t.clips].sort((a, b) => a.at - b.at);
    for (let i = 1; i < cs.length; i++) ok(endF(cs[i - 1], FPS) === startF(cs[i], FPS), `${what}: ${t.id} ${cs[i - 1].label} ends on frame ${endF(cs[i - 1], FPS)}, ${cs[i].label} starts on ${startF(cs[i], FPS)}`);
    if (total !== undefined && cs.length) ok(endF(cs[cs.length - 1], FPS) === total, `${what}: ${t.id} ends on frame ${total}`);
  }
}

// 1. the shot boundaries: whole frames, the render's own, shot N's end the start of shot N+1, from shots.json and from
//    a cuts.json alike
for (const which of ['cuts', 'alma'] as const) {
  for (const t of takesWith(which)) {
    const r = REAL.find((x) => t.src === srcOf(x.scene))!;
    const s = shotsOf(t, FPS);
    ok(s.length === r.cuts.length + 1, `${which} ${r.scene}: as many shots`);
    for (const x of s) ok(Math.abs(x.in * FPS - Math.round(x.in * FPS)) < 1e-4 && Math.abs(x.out * FPS - Math.round(x.out * FPS)) < 1e-4, `${which} ${r.scene} shot ${x.n}: on the frame grid (${x.in}→${x.out})`);
    for (let i = 1; i < s.length; i++) ok(s[i].in === s[i - 1].out, `${which} ${r.scene}: shot ${i} ends where shot ${i + 1} starts`);
    if (which === 'cuts' && r.rendered) ok(JSON.stringify(s.slice(1).map((x) => Math.round(x.in * FPS))) === JSON.stringify(r.rendered), `${r.scene}: each shot starts on the frame the render first shows it (${r.rendered.join(', ')})`);
    ok(JSON.stringify(onGrid(onGrid(t, FPS), FPS)) === JSON.stringify(onGrid(t, FPS)), `${which} ${r.scene}: on the grid twice is the same`);
  }
}
ok(shotEdge(17.6, FPS) === 17.583333 && shotEdge(20.24, FPS) === 20.25 && shotEdge(14.24, FPS) === 14.25 && shotEdge(17.44, FPS) === 17.458333, 'the user\'s four cuts land on frames 422, 486, 342, 419');

// 2. the cut on the page: each take split at its shots, every piece meeting the next (the holes the user saw were at S2
//    shot 5→6 and S3 shot 3→4; S7 had a hole and an overlap)
const raw = wholeCut();
const total = endF(raw.tracks[0].clips[raw.tracks[0].clips.length - 1], FPS);
for (const which of ['cuts', 'alma'] as const) {
  const by = byOf(takesWith(which));
  const tl = shotTimeline(raw, by);
  ok(mainTracks(tl).v!.clips.length === REAL.reduce((k, r) => k + r.cuts.length + 1, 0), `${which}: every take split at its shots`);
  meets(tl, `${which}: the page's split`, total);
}

const by = byOf(takesWith('cuts'));
const shown = shotTimeline(raw, by);
const v = (tl: Timeline) => mainTracks(tl).v!;
const pieceOf = (tl: Timeline, scene: string, k: number) => v(tl).clips.find((c) => c.label === `${scene} · take 1 · shot ${k}`)!;
const R = (c: TimelineClip): ClipRef => ({ trackId: 'V1', clipId: c.id });
const s2s5 = pieceOf(shown, 'S2', 5), s2s6 = pieceOf(shown, 'S2', 6);
ok(touching(shown, R(s2s5), R(s2s6)), 'S2 shot 5 and shot 6 touch: their join can be moved');

// 3. the blade on a shot's join, and inside a shot: the two pieces meet
const at6 = startF(s2s6, FPS);
const b1 = splitClip(shown, R(s2s6), at6 + 10);
ok(!!b1, 'a blade inside S2 shot 6 cuts it');
meets(shotTimeline(b1!.tl, by), 'after the blade', total);

// 4. a shot tried in place: S7's shot 6 put where S2's shot 6 is, and S2's own shot 6 back (the same, nothing changes)
const s7 = by.get(srcOf('S7'))!;
const p1 = putShot(shown, 'S2', 6, { ...s7, scene: 'S2' }, 'take 1', by);
ok(!!p1, 'a shot of another take goes in S2 shot 6\'s place');
meets(shotTimeline(p1!.tl, by), 'after a shot tried in place');
ok(putShot(shown, 'S2', 6, by.get(srcOf('S2'))!, 'take 1', by) === undefined, 'S2\'s own shot 6 in its own place changes nothing');
const p2 = putShot(p1!.tl, 'S2', 6, by.get(srcOf('S2'))!, 'take 1', by);
ok(!!p2, 'S2 shot 6 put back');
meets(shotTimeline(p2!.tl, by), 'after the shot put back', total);

// 5. a trim: S2 shot 5's tail already on its shot's last frame (it cannot grow into shot 6); shortened by 3 and grown
//    back, it reaches its neighbour exactly, the drag's stop names it
const fr5 = clipFrames(s2s5, by, 28.24, FPS);
ok(trimLimit(shown, R(s2s5), 'tail', 2, false, fr5).d === 0, 'S2 shot 5\'s tail is on its last frame: no room to grow');
const t1 = trimClip(shown, R(s2s5), 'tail', -3, false, fr5)!;
ok(endF(findClip(t1.tl, R(s2s5))!.clip, FPS) === at6 - 3, 'shortened by 3, a 3-frame gap');
const t1s = shotTimeline(t1.tl, by);
const c5 = findClip(t1s, R(s2s5))!.clip;
const lim = trimLimit(t1s, R(s2s5), 'tail', 10, false, clipFrames(c5, by, 28.24, FPS));
ok(lim.d === 3, `grown back, it stops after 3 frames (${lim.d}, ${lim.why})`);
const t2 = trimClip(t1s, R(s2s5), 'tail', lim.d, false, clipFrames(c5, by, 28.24, FPS))!;
meets(shotTimeline(t2.tl, by), 'after the trim grown back', total);
// S3 shot 4's head, the user's second place: no room to grow back into shot 3, shortened and grown back it meets shot 3
const s3s4 = pieceOf(shown, 'S3', 4);
const h1 = trimClip(shown, R(s3s4), 'head', 2, false, clipFrames(s3s4, by, 23.12, FPS))!;
const h1s = shotTimeline(h1.tl, by);
const h4 = findClip(h1s, R(s3s4))!.clip;
const hl = trimLimit(h1s, R(s3s4), 'head', -10, false, clipFrames(h4, by, 23.12, FPS));
ok(hl.d === -2, `S3 shot 4's head grown back stops after 2 frames (${hl.d}, ${hl.why})`);
meets(shotTimeline(trimClip(h1s, R(s3s4), 'head', hl.d, false, clipFrames(h4, by, 23.12, FPS))!.tl, by), 'after S3 shot 4\'s head grown back', total);

// 6. a whole take dragged in from the Takes view: its pieces meet
const tp = takePieces({ t: by.get(srcOf('S2'))! }, 'take 1', FPS);
assert.ok(!('error' in tp));
const f0 = 0;
const dropped = { ...raw, tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: tp.clips.map((c) => ({ ...c, at: (f0 + c.f) / FPS })) }, { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] }] } as unknown as Timeline;
meets(dropped, 'a whole take dragged in', tp.frames);

// 7. a cut saved before the fix, its pieces split at the raw cuts (off the grid): no hole drawn, its joins can be moved,
//    and it is the render's own count (frameOf(at + length) − frameOf(at))
const legacy = JSON.parse(JSON.stringify(shown)) as Timeline;
for (const c of v(legacy).clips) {
  const r = REAL.find((x) => c.src === srcOf(x.scene))!;
  const b = [0, ...r.cuts, r.out];
  const k = Number(/shot (\d+)/.exec(c.label ?? '')?.[1] ?? 1);
  const base = raw.tracks[0].clips.find((x) => x.src === c.src)!.at;
  Object.assign(c, { in: b[k - 1], out: b[k], at: Math.round((base + b[k - 1]) * 1e6) / 1e6 });
}
ok(v(legacy).clips.some((c) => Math.abs(c.at * FPS - Math.round(c.at * FPS)) > 1e-3), 'the old cut has pieces off the grid (S2 shot 6 at 38.24 s)');
for (let i = 1; i < v(legacy).clips.length; i++) {
  const a = v(legacy).clips[i - 1], b = v(legacy).clips[i];
  ok(Math.round((a.at + a.out - a.in) * FPS) - Math.round(a.at * FPS) === lenF(a, FPS), `${a.label}: the page counts its frames as the render does`);
  ok(endF(a, FPS) === startF(b, FPS), `the old cut: ${a.label} meets ${b.label}`);
}

console.log(`frame-gaps: ${n} checks passed`);
