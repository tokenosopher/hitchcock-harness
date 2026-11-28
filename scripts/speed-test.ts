// npx tsx scripts/speed-test.ts
// The speed control's maths (src/components/edit/speed.ts): the clamp, what a typed text means, the nudges,
// the dial's drag and angle, and the length a clip takes at a speed (lenF's rounding, checked against model.ts).
import assert from 'node:assert/strict';
import type { TimelineClip } from '../src/server/types';
import { lenF } from '../src/components/edit/model';
import { SPEED_MAX, SPEED_MIN, clampPct, dragPct, lenAtF, lengthWords, parsePct, pctAngle, stepPct } from '../src/components/edit/speed';

let n = 0;
const ok = (name: string, f: () => void) => { f(); n++; console.log(`ok  ${name}`); };

ok('clamp: whole percent, inside 10–1000, NaN is 100', () => {
  assert.equal(clampPct(114.6), 115);
  assert.equal(clampPct(3), SPEED_MIN);
  assert.equal(clampPct(5000), SPEED_MAX);
  assert.equal(clampPct(NaN), 100);
});

ok('typed: "115", "115%", " 115 % ", "1.15x" are 115; "", "1", "abc" are not a speed yet', () => {
  for (const t of ['115', '115%', ' 115 % ', '1.15x', '1,15x']) assert.equal(parsePct(t), 115, t);
  for (const t of ['', '1', '5', 'abc', '%']) assert.equal(parsePct(t), undefined, t);
  assert.equal(parsePct('99999'), SPEED_MAX);
});

ok('nudge: 1%, Shift 5%, stopped at the limits', () => {
  assert.equal(stepPct(115, 1), 116);
  assert.equal(stepPct(115, -1, true), 110);
  assert.equal(stepPct(SPEED_MAX, 1), SPEED_MAX);
  assert.equal(stepPct(SPEED_MIN, -1, true), SPEED_MIN);
});

ok('dial drag: 1% per 3 px right or up, Shift five times', () => {
  assert.equal(dragPct(100, 30, 0), 110);
  assert.equal(dragPct(100, 0, 30), 90);
  assert.equal(dragPct(100, 2, 0), 100);
  assert.equal(dragPct(100, 6, 0, true), 110);
});

ok('dial angle: 100% up, 10% −135°, 1000% +135°, symmetric', () => {
  assert.equal(pctAngle(100), 0);
  assert.equal(pctAngle(10), -135);
  assert.equal(pctAngle(1000), 135);
  assert.ok(Math.abs(pctAngle(200) + pctAngle(50)) < 1e-9);
});

ok('length: the same frames as lenF for the clip at that speed', () => {
  const fps = 24;
  for (const [inn, out] of [[0, 2], [1.25, 3.5], [0, 0.04], [2.041667, 7.333333]]) {
    for (const p of [10, 50, 87, 100, 110, 115, 125, 333, 1000]) {
      const c = { id: 'x', src: 'a.mp4', at: 0, in: inn, out, speed: p / 100 } as TimelineClip;
      assert.equal(lenAtF(out - inn, p, fps), lenF(c, fps), `${inn}-${out} at ${p}%`);
    }
  }
});

ok('words: "2.00 s → 1.75 s · 6 f shorter" for 2 s at 115%', () => {
  assert.equal(lengthWords([2], 48, 115, 24), '2.00 s → 1.75 s · 6 f shorter');
  assert.equal(lengthWords([2], 48, 100, 24), '2.00 s → 2.00 s');
  assert.equal(lengthWords([1, 1], 48, 50, 24), '2.00 s → 4.00 s · 48 f longer');
});

console.log(`speed: ${n} checks passed`);
