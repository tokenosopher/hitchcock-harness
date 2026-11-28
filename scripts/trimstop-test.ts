// npx tsx scripts/trimstop-test.ts
// A clip that could not be enlarged from the left all the way to its beginning: S1 shot 6, FIX-turn-S1 take 2 from 0.833 s, right after S1 take 1 shot 5, which
// ends at 14.333 s. With ripple off (the R key, no button) the head stops at the clip before and nothing said so; with
// ripple on (the default) it grows to the file's first frame and everything after moves later, its sound with it, as one
// step. components/edit/trimStop.ts says why a trim stops; model.ts trimClip makes the trim. The numbers are a real
// cut's (Alma's swap, same in and out as take 1) and the take's (harness/shots.json: 4.24 s, no cuts).
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { endF, startF, trimClip, type NameOf } from '../src/components/edit/model';
import { trimStop } from '../src/components/edit/trimStop';

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

const G = 'assets/films/sample-pickups/generations';
const S1 = `${G}/S1/takes/take1/S1-take1-480p.mp4`;
const R2 = `${G}/FIX-turn-S1/takes/take2/FIX-turn-S1-take2-480p.mp4`;
const S2 = `${G}/S2/takes/take1/S2-take1-480p.mp4`;
const c = (id: string, src: string, a: number, b: number, at: number, label: string): TimelineClip =>
  ({ id, src, in: a, out: b, at, label, takeRef: { scene: label.split(' · ')[0], take: label.split(' · ').slice(1, -1).join(' · ') } });
const pics = [
  c('cmwxbl1fsn', S1, 14, 15.625, 12.708333, 'S1 · take 1 · shot 5'),
  c('cmwxbkeral', R2, 0.833333, 2.291667, 14.333333, 'S1 · FIX-turn-S1 · take 2 · shot 6'),
  c('s2-take', S2, 0, 5.041667, 15.791667, 'S2 · take 1 · shot 1'),
];
const cut = (): Timeline => ({ version: 'v35', fps: 24, width: 854, height: 480, at: '', markers: [], tracks: [
  { id: 'V1', kind: 'video', name: 'Picture', clips: pics.map((x) => ({ ...x })) },
  { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pics.map((x) => ({ ...x, id: `${x.id}a` })) },
] });
const R = { trackId: 'V1', clipId: 'cmwxbkeral' };
const FILE = 4.24;                                     // take 2's length; one shot, so no shot stops (clipFrames)
const nameOf: NameOf = (k) => { const m = /^(S\d+) · .* · shot (\d+)$/.exec(k.label ?? ''); return m ? `${m[1]} shot ${m[2]}` : undefined; };
const clip = (tl: Timeline, track: string, id: string) => tl.tracks.find((t) => t.id === track)!.clips.find((x) => x.id === id)!;

ok('ripple off: the head stops at the clip before (14.333 s) and says so, with the way to push the clips along', () => {
  const s = trimStop(cut(), R, 'head', -20, false, FILE, nameOf);
  assert.equal(s.d, 0);
  assert.equal(s.why, 'the clip before');
  assert.match(s.say ?? '', /^Stops at the clip before it \(S1 shot 5\): ripple is off, so it is not written over\. Press R to turn ripple on/);
  // nothing is written over: no edit at all
  assert.equal(trimClip(cut(), R, 'head', -20, false, FILE), undefined);
});

ok('ripple on: the head grows to the file\'s first frame (in 0.833 → 0, 20 f), what follows moves 20 f later, its sound too', () => {
  const tl = cut();
  const s = trimStop(tl, R, 'head', -20, true, FILE, nameOf);
  assert.deepEqual(s, { d: -20 });
  const e = trimClip(tl, R, 'head', -20, true, FILE);
  assert.ok(e);
  const v = clip(e.tl, 'V1', 'cmwxbkeral'), a = clip(e.tl, 'A1', 'cmwxbkerala');
  assert.equal(v.in, 0); assert.equal(a.in, 0);
  // the clip keeps its place after shot 5; shot 5 is not touched
  assert.equal(startF(v, 24), startF(pics[1], 24));
  assert.deepEqual(clip(e.tl, 'V1', 'cmwxbl1fsn'), pics[0]);
  assert.equal(endF(v, 24) - startF(v, 24), 55);
  for (const t of ['V1', 'A1']) assert.equal(startF(clip(e.tl, t, t === 'V1' ? 's2-take' : 's2-takea'), 24), startF(pics[2], 24) + 20);
  assert.match(e.note, /^trimmed head of .* −20 f, what follows moved on$/);
});

ok('ripple on, dragged past the file\'s start: stops at 20 f, "start of the file", no hint about ripple', () => {
  const s = trimStop(cut(), R, 'head', -30, true, FILE, nameOf);
  assert.deepEqual(s, { d: -20, why: 'start of the file' });
});

ok('the tail is the same: ripple off stops at the clip after it and says so; ripple on pushes S2 along', () => {
  const off = trimStop(cut(), R, 'tail', 10, false, FILE, nameOf);
  assert.equal(off.d, 0);
  assert.equal(off.why, 'the next clip');
  assert.match(off.say ?? '', /^Stops at the clip after it \(S2 shot 1\): ripple is off/);
  const e = trimClip(cut(), R, 'tail', 10, true, FILE);
  assert.ok(e);
  assert.equal(startF(clip(e.tl, 'V1', 's2-take'), 24), startF(pics[2], 24) + 10);
  assert.equal(startF(clip(e.tl, 'A1', 's2-takea'), 24), startF(pics[2], 24) + 10);
});

ok('a neighbour on the file\'s last frame: the file is why (ripple would not take it further), no ripple hint', () => {
  const tl = cut();
  const v = clip(tl, 'V1', 'cmwxbkeral'), a = clip(tl, 'A1', 'cmwxbkerala');
  v.out = a.out = 4.25;                                 // the cut since: out on the take's last frame
  for (const t of ['V1', 'A1']) clip(tl, t, t === 'V1' ? 's2-take' : 's2-takea').at = 14.333333 + (4.25 - 0.833333);
  const s = trimStop(tl, R, 'tail', 10, false, FILE, nameOf);
  assert.deepEqual(s, { d: 0, why: 'end of the file' });
});

console.log(`\n${n} checks passed`);
