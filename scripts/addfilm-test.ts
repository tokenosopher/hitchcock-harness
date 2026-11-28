// npx tsx scripts/addfilm-test.ts
// "Use in the film" on the Takes view once did nothing: a pick-up's take 2 (FIX-react-S1, 1920x1080, 25 fps, 4.24 s,
// no cuts) in place of take 1 (in 0.833, out 2.292, at 14.333). The page made the swap (67 f longer, everything after
// moved later) and the server refused the step: S20's two shots at 120 % speed are 62.5 f long, so they meet half a
// frame inside each other, exactly the half frame the server allowed. Moved by 67 f the six-decimal seconds came out
// 3e-7 s over the half frame, "s20-take~4 overlaps s20-take~3", and the step was taken back (the server now allows up
// to a frame of overlap). The page now also says why when the shots are not put in (EditPage putPicks, putOne). The
// numbers are a real cut's and its take's (harness/shots.json).
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { withPicks, type TakeShots } from '../src/components/edit/shots';
import { filmTargetOf, validateTimeline } from '../src/server/edit/timeline';

let n = 0;
const ok = async (what: string, f: () => Promise<void> | void) => { await f(); n++; console.log(`ok · ${what}`); };

const G = 'assets/films/sample-pickups/generations';
const S1 = `${G}/S1/takes/take1/S1-take1-480p.mp4`;
const R1 = `${G}/FIX-react-S1/takes/take1/FIX-react-S1-take1-480p.mp4`;
const R2 = `${G}/FIX-react-S1/takes/take2/FIX-react-S1-take2-480p.mp4`;
const S20 = `${G}/S20/takes/take1/S20-take1-480p.mp4`;
const takes: TakeShots[] = [
  { src: S1, scene: 'S1', name: 'take 1', seconds: 18, cuts: [4, 7.041667, 10.75, 14, 15.875], state: 'ready', made: 1 },
  // the pick-up's takes, numbered by the place they stand for (FIX-react-S1-stands.json: place 6)
  { src: R1, scene: 'S1', name: 'FIX-react-S1 · take 1', seconds: 4.041667, cuts: [], ids: [6], state: 'ready', made: 2 },
  { src: R2, scene: 'S1', name: 'FIX-react-S1 · take 2', seconds: 4.24, cuts: [], ids: [6], state: 'ready', made: 3 },
  { src: S20, scene: 'S20', name: 'take 1', seconds: 17.041667, cuts: [4, 8.583333, 12.916667], state: 'ready', made: 1 },
];
const by = new Map(takes.map((t) => [t.src, t]));
const v = (id: string, src: string, a: number, b: number, at: number, label: string, more: Partial<TimelineClip> = {}): TimelineClip =>
  ({ id, src, in: a, out: b, at, label, takeRef: { scene: label.split(' · ')[0], take: label.split(' · ').slice(1, -1).join(' · ') }, ...more });
// the cut at rev 263 around the two places: S1 shot 5 and 6, and S20's last two shots (speed 1.2, a half frame inside each other)
const clips = [
  v('cmwxbl1fsn', S1, 14, 15.625, 12.708333, 'S1 · take 1 · shot 5'),
  v('cmwxbkeral', R1, 0.833333, 2.291667, 14.333333, 'S1 · FIX-react-S1 · take 1 · shot 6'),
  v('s20-take~3', S20, 9.791667, 12.916667, 120.208333, 'S20 · take 1 · shot 3', { speed: 1.2 }),
  v('s20-take~4', S20, 12.916667, 17.041667, 122.791667, 'S20 · take 1 · shot 4', { speed: 1.2 }),
];
const cut: Timeline = { version: 'v35', fps: 24, width: 854, height: 480, at: '2026-11-26T09:26:01.695Z', markers: [], tracks: [
  { id: 'V1', kind: 'video', name: 'Picture', clips: clips.map((c) => ({ ...c })) },
  { id: 'A1', kind: 'audio', name: 'Dialogue', clips: clips.map((c) => ({ ...c, id: `${c.id}a` })) },
] };
// the server's checks without the files (they are on the film's drive, not here)
const film = filmTargetOf('sample-pickups', '/nonexistent/sample-pickups', '/nonexistent');
const check = (tl: Timeline) => validateTimeline({ ...tl, at: new Date().toISOString() }, film, { files: false });

void (async () => {
  await ok('the cut as it was validates (the half frame between S20 shots 3 and 4 is allowed)', async () => {
    const r = await check(cut);
    assert.deepEqual(r.problems, []);
  });

  const e = withPicks(cut, [{ scene: 'S1', n: 6, src: R2 }], by, new Map(), undefined, ['S1', 'S20']);
  await ok('the click makes the swap: take 2 in place 6, 67 f longer, S20 moved later by as much', () => {
    assert.ok(e, 'withPicks made no edit');
    assert.equal(e.placed.length, 1);
    const c = e.tl.tracks[0].clips.find((x) => x.id === e.placed[0].clipId)!;
    assert.equal(c.src, R2);
    assert.equal(c.at, 14.333333);
    assert.equal(Math.round((c.out - c.in) * 24), 102);
    assert.match(e.note, /^S1 shot 6: FIX-react-S1 · take 2 in place of FIX-react-S1 · take 1, 67 f longer$/);
    const s20 = e.tl.tracks[0].clips.find((x) => x.id === 's20-take~3')!;
    assert.equal(Math.round(s20.at * 24), Math.round(120.208333 * 24) + 67);
  });

  await ok('the server keeps the swap (it refused it: "s20-take~4 overlaps s20-take~3", 3e-7 s over the half frame)', async () => {
    const r = await check(e!.tl);
    assert.deepEqual(r.problems, []);
  });

  await ok('a real overlap is still refused (a frame and a half)', async () => {
    const bad: Timeline = JSON.parse(JSON.stringify(cut));
    bad.tracks[0].clips[3].at = Math.round((122.791667 - 1 / 24) * 1e6) / 1e6;
    const r = await check(bad);
    assert.ok(r.problems.some((p) => /s20-take~4: overlaps s20-take~3/.test(p)), r.problems.join(' | '));
  });

  console.log(`\n${n} checks passed`);
})().catch((err) => { console.error(err); process.exit(1); });
