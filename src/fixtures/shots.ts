// MOCK=boards: the takes of the sample film cut into their shots, so the Edit page's takes grid can be used and
// tested without a real film. `GET /api/films/<film>/shots` answers this in sample-data mode.
//
// Everything is derived from the hand-written cut (boards/cut-the-lighthouse.json), deterministically:
//   - every take file the cut's picture track uses is one take of its clips' scene (`takeRef.scene`). Its cut
//     points are where its clips start and end, so each clip is exactly one shot and the rings fall where the
//     cut is. A gap of under 1.5 s between two clips (a trimmed head or tail) is folded into a shot instead of
//     being a shot of its own, and a point that falls inside another clip of the same file (footage used twice)
//     is not a cut. Its length is the larger of the cut's `sourceSeconds` and the end of its last clip.
//   - per scene, two made-up takes ("sample take A" and "B") with the shots of the scene's main take (the file
//     with the most clips there), each shot a little longer or shorter. Their files do not exist: the pictures
//     simply do not load.
//   - S2 also has a take whose file could not be read (state 'failed'), and a pick-up: one take of one 13.5 s
//     shot that redoes the scene's shot 2, in its own generation folder whose shots file (`PICKUP_FILE`) lists one shot
//     with id "2"; read as the server reads a real one (readShotTags, shotTagsFor), it carries `ids: [2]`.
//   - S3 has three variations: one of "sample take A" landed, a second of it being made (no video yet), and
//     one of "sample take B" that could not be made. `landSample` lands the one being made, in this server's memory
//     only (the browser tests ask for it through POST …/shots in sample mode); nothing is written to disk.
// Later test work reuses this: keep it pure and free of randomness.
import type { TakeShots } from '@/server/edit/shots';
import { readShotTags, shotTagsFor } from '@/components/edit/shotCols';
import cutFilm from './boards/cut-the-lighthouse.json';
import { trimSampleShots } from './trim';
import { gapsSampleShots } from './framegaps';

interface FixtureClip { id: string; src: string; in: number; out: number; at: number; takeRef?: { scene: string; take: string } }
interface FixtureCut { current: { tracks: { id: string; kind: string; clips: FixtureClip[] }[] }; sourceSeconds?: Record<string, number> }

/** The sample pick-up's `generations/FIX-cork-S2/FIX-cork-S2-shots.json`, the shape of a real film's. */
export const PICKUP_FILE = { duration: 13.5, shots: [{ id: '2', t0: 0, t1: 13.5, in_frame: ['MAREN', 'TOBIAS'] }] };

// the sample pick-up and the landed variations landed after the sample's other takes (which say no day), after the day
// the sample list of takes looked at begins (server/edit/seenTakes.ts): they are new takes, "new" in the Takes view
const LATE = Date.UTC(2026, 10, 12, 12);

const FOLD = 1.5;                       // seconds: a gap shorter than this between two clips is a trim, not a shot
const r3 = (s: number) => Math.round(s * 1000) / 1000;

function derive(film: string, cut: FixtureCut): TakeShots[] {
  const v = cut.current.tracks.find((t) => t.id === 'V1') ?? cut.current.tracks.find((t) => t.kind === 'video');
  const clips = (v?.clips ?? []).filter((c) => c.takeRef);
  const files = new Map<string, { scene: string; take: string; spans: [number, number][] }>();
  for (const c of clips) {
    const f = files.get(c.src) ?? { scene: c.takeRef!.scene, take: c.takeRef!.take, spans: [] };
    f.spans.push([c.in, c.out]);
    files.set(c.src, f);
  }
  const out: TakeShots[] = [];
  const main = new Map<string, { src: string; n: number }>();
  for (const [src, f] of files) {
    const spans = [...f.spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const seconds = r3(Math.max(cut.sourceSeconds?.[src] ?? 0, ...spans.map((s) => s[1])));
    const inside = (t: number) => spans.some(([a, b]) => t > a + 0.1 && t < b - 0.1);
    const points = new Set<number>();
    for (let i = 0; i < spans.length; i++) {
      const [a, b] = spans[i];
      if (i > 0 || a >= FOLD) points.add(a);
      const next = spans.slice(i + 1).find((s) => s[0] >= b - 0.01)?.[0] ?? seconds;
      if (next - b >= FOLD) points.add(b);
    }
    const cuts = [...points].filter((t) => t > 0.2 && t < seconds - 0.2 && !inside(t)).map(r3).sort((a, b) => a - b);
    out.push({ src, scene: f.scene, name: f.take, seconds, cuts, state: 'ready' });
    const best = main.get(f.scene);
    if (!best || spans.length > best.n) main.set(f.scene, { src, n: spans.length });
  }
  // two made-up takes per scene, shaped like the scene's main take, each shot a few percent longer or shorter
  for (const [scene, m] of main) {
    const base = out.find((t) => t.src === m.src)!;
    const bounds = [0, ...(base.cuts ?? []), base.seconds ?? 0];
    ['A', 'B'].forEach((k, j) => {
      let at = 0;
      const cuts: number[] = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        at += (bounds[i + 1] - bounds[i]) * (1 + 0.06 * (((i + j) % 3) - 1));
        cuts.push(r3(at));
      }
      const seconds = cuts.pop()!;
      out.push({ src: `assets/films/${film}/blocks/${scene}/takes/${scene}-sample-take${k}-480p.mp4`, scene, name: `sample take ${k}`, seconds, cuts, state: 'ready' });
    });
    if (scene === 'S1' && film === PICKUP_ROWS_FILM) out.push(...pickupRows(film, base));
    if (scene === 'S2') {
      out.push({ src: `assets/films/${film}/blocks/${scene}/takes/${scene}-sample-takeC-480p.mp4`, scene, name: 'sample take C', state: 'failed' });
      const tg = shotTagsFor([readShotTags(PICKUP_FILE)], []);
      out.push({ src: `assets/films/${film}/generations/FIX-cork-S2/takes/take1/FIX-cork-S2-take1-480p.mp4`, scene, name: 'FIX-cork-S2 · take 1', seconds: 13.5, cuts: [], ...(tg ?? {}), state: 'ready', made: LATE });
    }
  }
  out.sort((a, b) => a.scene.localeCompare(b.scene, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

// The pick-ups as rows of their scene: the-lighthouse's S1 has a one-shot pick-up of its shot 2 with two
// takes (FIX-rock-S1), a pick-up of its shots 3 and 4 (FIX-hall-S1: take 1 cut into those two shots; take 2 cut into
// three, which its shot list does not say, so its shots are "other shots"), and a copy of FIX-rock-S1 take 1 kept by
// hand as a variation of the scene's take (its variation.json's copyOf), which the Takes view leaves out. They landed
// before the sample's list of takes looked at began, so none is "new" (the copy says later: left out, it is not new
// either). Their shot lists are in shotlist.ts (PICKUP_ROWS_GENS).
export const PICKUP_ROWS_FILM = 'the-lighthouse';
export const pickupRowsSrc = (film: string, g: string, k: number) => `assets/films/${film}/generations/${g}/takes/take${k}/${g}-take${k}-480p.mp4`;
function pickupRows(film: string, base: TakeShots): TakeShots[] {
  const copy = `assets/films/${film}/blocks/S1/takes/S1-grey-take1-variation1/S1-grey-take1-variation1-480p.mp4`;
  return [
    { src: pickupRowsSrc(film, 'FIX-rock-S1', 1), scene: 'S1', name: 'FIX-rock-S1 · take 1', seconds: 4.5, cuts: [], state: 'ready' },
    { src: pickupRowsSrc(film, 'FIX-rock-S1', 2), scene: 'S1', name: 'FIX-rock-S1 · take 2', seconds: 5.2, cuts: [], state: 'ready' },
    { src: pickupRowsSrc(film, 'FIX-hall-S1', 1), scene: 'S1', name: 'FIX-hall-S1 · take 1', seconds: 8, cuts: [3.5], state: 'ready' },
    { src: pickupRowsSrc(film, 'FIX-hall-S1', 2), scene: 'S1', name: 'FIX-hall-S1 · take 2', seconds: 9, cuts: [2.5, 5.5], state: 'ready' },
    { src: copy, scene: 'S1', name: 'grey-take1 variation 1', seconds: 4.5, cuts: [], state: 'ready', made: LATE,
      variation: { from: base.src, note: 'A copy of FIX-rock-S1 take 1, to switch it in', startedAt: '2026-11-25T18:10:00Z', copyOf: pickupRowsSrc(film, 'FIX-rock-S1', 1) } },
  ];
}

/** The sample variations of S3 (see the head of this file). `landed`: the second one has its video too. */
function variations(film: string, takes: TakeShots[], landed: boolean): TakeShots[] {
  const a = takes.find((t) => t.scene === 'S3' && t.name === 'sample take A');
  const b = takes.find((t) => t.scene === 'S3' && t.name === 'sample take B');
  if (!a || !b) return [];
  const dir = `assets/films/${film}/blocks/S3/takes`;
  // shaped like their source, each shot a little longer or shorter again
  const like = (t: TakeShots, k: number) => {
    const bounds = [0, ...(t.cuts ?? []), t.seconds ?? 0];
    let at = 0;
    const cuts: number[] = [];
    for (let i = 0; i < bounds.length - 1; i++) { at += (bounds[i + 1] - bounds[i]) * (1 + 0.05 * (((i + k) % 3) - 1)); cuts.push(r3(at)); }
    const seconds = cuts.pop()!;
    return { seconds, cuts };
  };
  const one = { src: `${dir}/S3-sample-takeA-variation1/S3-sample-takeA-variation1-480p.mp4`, scene: 'S3', name: 'sample take A variation 1', ...like(a, 1), state: 'ready' as const, made: LATE,
    variation: { from: a.src, note: 'Maren looks up at the end. Keep the rest as it is.', startedAt: '2026-11-14T09:40:00' } };
  const twoV = { from: a.src, note: 'Slower, and hold on her face a moment longer.', startedAt: '2026-11-14T10:58:00' };
  const two: TakeShots = landed
    ? { src: `${dir}/S3-sample-takeA-variation2/S3-sample-takeA-variation2-480p.mp4`, scene: 'S3', name: 'sample take A variation 2', ...like(a, 2), state: 'ready', made: LATE + 3600000, variation: twoV }
    : { src: `${dir}/S3-sample-takeA-variation2`, scene: 'S3', name: 'sample take A variation 2', state: 'making', variation: twoV };
  const three: TakeShots = { src: `${dir}/S3-sample-takeB-variation1`, scene: 'S3', name: 'sample take B variation 1', state: 'making',
    variation: { from: b.src, note: 'Make the light warmer.', startedAt: '2026-11-14T10:20:00', failed: 'Seedance refused the picture of the lamp twice.' } };
  return [one, two, three];
}

// sample-sound-picks (soundpick.ts) has the-lighthouse's picture, and its takes say when they landed: all on one day,
// S1's "sample take A" ten days later, so its shots show as new takes on the cut
// sample-left-landed (left.ts) the same, its files in its own folder as the left samples' cut has them, and
// "sample take A" of S1, S2 and S3 landed later: three new takes to check
const LANDED_SAMPLE = 'sample-left-landed';
const ownCut = (slug: string): FixtureCut => JSON.parse(JSON.stringify(cutFilm).split('assets/films/the-lighthouse/').join(`assets/films/${slug}/`)) as FixtureCut;
const CUTS: Record<string, FixtureCut> = { 'the-lighthouse': cutFilm as unknown as FixtureCut, 'sample-sound-picks': cutFilm as unknown as FixtureCut, [LANDED_SAMPLE]: ownCut(LANDED_SAMPLE),
  // the 16:9 samples (masters.ts): the same takes, their pictures the 1920x1080 test clip
  'sample-wide': ownCut('sample-wide'), 'sample-wide-portrait': ownCut('sample-wide-portrait') };
const LANDED = Date.UTC(2026, 10, 10, 12);
const LATER: Record<string, (t: TakeShots) => boolean> = {
  'sample-sound-picks': (t) => t.scene === 'S1' && t.name === 'sample take A',
  [LANDED_SAMPLE]: (t) => ['S1', 'S2', 'S3'].includes(t.scene) && t.name === 'sample take A',
};
const madeOf = (film: string, t: TakeShots): TakeShots => (!LATER[film] || t.state === 'making' ? t : { ...t, made: LANDED + (LATER[film](t) ? 10 * 86400000 : 0) });
const memo = new Map<string, TakeShots[]>();
// which sample films have their variation being made landed (this server's memory; survives a dev reload)
const g = globalThis as unknown as { __sampleLanded?: Set<string> };
const landedSet = (g.__sampleLanded ??= new Set());

/** The sample film's takes with their shots ({takes, waiting: 0}); no takes for a film without a fixture cut. */
export function mockShots(film: string): { takes: TakeShots[]; waiting: number } {
  // the sample film of a take cut into its shots (trim.ts): its takes as written there
  const trim = trimSampleShots(film) ?? gapsSampleShots(film);
  if (trim) return trim;
  const cut = CUTS[film];
  if (!cut) return { takes: [], waiting: 0 };
  if (!memo.has(film)) memo.set(film, derive(film, cut));
  const base = memo.get(film)!;
  const takes = [...base, ...variations(film, base, landedSet.has(film))].map((t) => madeOf(film, t));
  takes.sort((x, y) => x.scene.localeCompare(y.scene, undefined, { numeric: true }) || x.name.localeCompare(y.name, undefined, { numeric: true }));
  return { takes, waiting: 0 };
}

/** Sample mode only: the variation being made lands (`true`) or goes back to being made (`false`). */
export function landSample(film: string, on: boolean): void {
  if (on) landedSet.add(film); else landedSet.delete(film);
}
