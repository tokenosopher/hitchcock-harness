// MOCK=boards: what the Shots page reads besides the takes (server/films/read/shotlist.ts), for the sample films that
// have takes (fixtures/shots.ts). Derived, deterministic, nothing read from disk:
//   - each scene's own shot list: 1 … N, N the most shots any take of the scene's own folder was cut into;
//   - the sample pick-up FIX-cork-S2 (one shot, "2"), as fixtures/shots.ts writes it;
//   - S3 replanned whole (FIX-S3-again: three shots, timed on S3's previz take 2), with no take yet: S3's newest version
//     shows three places "not made yet", each a frame of that previz take, and the film keeps version 1;
//   - the whole film's previz: the-lighthouse's v3 with its scenes' times.
// The other pick-ups of the sample (FIX-bottle, FIX-window) have no shot list: their shots go under "other takes".
import type { GenPlan } from '@/components/shots/places';
import { genOf } from '@/components/shots/places';
import type { ShotList } from '@/server/films/read/shotlist';
import { mockShots, PICKUP_FILE, PICKUP_ROWS_FILM } from './shots';

/** The sample pick-ups of the-lighthouse's S1 (shots.ts): FIX-rock-S1 redoes shot 2, FIX-hall-S1 shots 3 and 4. */
export const PICKUP_ROWS_GENS: GenPlan[] = [
  { name: 'FIX-rock-S1', scene: 'S1', plan: [{ id: '2', t0: 0, t1: 4.5 }], prompt: ['2'], written: Date.UTC(2026, 10, 9, 12) },
  { name: 'FIX-hall-S1', scene: 'S1', plan: [{ id: '3', t0: 0, t1: 3.5 }, { id: '4', t0: 3.5, t1: 8 }], prompt: ['3', '4'], written: Date.UTC(2026, 10, 9, 13) },
];

const LATER = Date.UTC(2026, 10, 20, 12);
const PV = 'assets/films/the-lighthouse/previz';

export function mockShotList(film: string): ShotList {
  const { takes } = mockShots(film);
  if (!takes.length) return { gens: [], checks: {} };
  const gens: GenPlan[] = [];
  for (const scene of [...new Set(takes.map((t) => t.scene))]) {
    const own = takes.filter((t) => t.scene === scene && genOf(t.src) === scene && t.state === 'ready');
    const n = Math.max(0, ...own.map((t) => (t.cuts?.length ?? 0) + 1));
    if (n) gens.push({ name: scene, scene, plan: Array.from({ length: n }, (_, i) => ({ id: String(i + 1) })) });
  }
  gens.push({ name: 'FIX-cork-S2', scene: 'S2', plan: PICKUP_FILE.shots.map((s) => ({ id: s.id, t0: s.t0, t1: s.t1 })), written: LATER });
  if (film === PICKUP_ROWS_FILM) gens.push(...PICKUP_ROWS_GENS);
  if (gens.some((g) => g.name === 'S3')) {
    const times = [[0, 5.2], [5.2, 10.6], [10.6, 16]];
    gens.push({ name: 'FIX-S3-again', scene: 'S3', written: LATER + 3600000, previz: `${PV}/S3/S3-previz-take-2.mp4`,
      plan: times.map(([t0, t1], i) => ({ id: String(i + 1), t0, t1 })), prompt: times.map((_, i) => String(i + 1)) });
  }
  const blocks: [string, number, number][] = [['S1', 0, 24], ['S2', 24, 50], ['S3', 50, 66]];
  return {
    gens, checks: {},
    previz: { path: `${PV}/film/the-lighthouse-previz-film-v3.mp4`, version: 'v3', seconds: 66, scenes: blocks.map(([scene, from, to]) => ({ scene, from, to })) },
  };
}
