// MOCK=boards: sample films for the timeline from day one, one for each day of a film before its cut is made of
// takes. The script is the sample film's v2 as locked (7 lines, three scenes), with its shot lists; the cast and places
// are sample-cast's. The boards are six plain placeholders beside the fixtures (src/fixtures/media/day1/), served for
// every board path; the takes of the last sample are the-lighthouse's files (they play when MOCK_MEDIA_DIR has them).
// Everything in memory; nothing is written.
//   sample-day1-idea    no script yet: no cut, no scenes
//   sample-day1-script  the script is locked and the cut not made yet: the Edit page makes v1 on its first read
//   sample-day1-shots   the shot lists are written: v1 the script, v2 the planned shots
//   sample-day1-boards  the boards are in: v3 every shot's board; the go for the first takes waits
//   sample-day1-takes   takes land: S1 and S2 took their boards' place (v4, v5), S3 being made
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { FilmRef, FilmState, SceneRef, Timeline, TimelineVersionRef } from '@/server/types';
import { bringUp, takeForBoards, type PlanScene, type PlanSource } from '@/components/edit/planned';
import type { TakeShots } from '@/components/edit/shots';
import { castSampleState } from './cast';

type Id = 'sample-day1-idea' | 'sample-day1-script' | 'sample-day1-shots' | 'sample-day1-boards' | 'sample-day1-takes';
const cast = castSampleState('sample-cast')!;
const repo = cast.film.repo;
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const DAY1_SAMPLES: Record<Id, FilmRef> = {
  'sample-day1-idea': ref('sample-day1-idea', 'Sample · day one: no script yet', 1),
  'sample-day1-script': ref('sample-day1-script', 'Sample · day one: the script is locked', 2),
  'sample-day1-shots': ref('sample-day1-shots', 'Sample · day one: the shot lists', 5),
  'sample-day1-boards': ref('sample-day1-boards', 'Sample · day one: the boards', 5),
  'sample-day1-takes': ref('sample-day1-takes', 'Sample · day one: takes land', 6),
};
const isDay1 = (slug: string): slug is Id => slug in DAY1_SAMPLES;
export const day1SampleFilms = (): FilmRef[] => Object.values(DAY1_SAMPLES);

// ---- the script, the shot lists and the boards

const A = (secs: number, text: string) => ({ text, secs });
const L = (who: string, text: string) => ({ who, text });
const SCRIPT: [string, string, number, PlanScene['items']][] = [
  ['S1', 'The bottle', 15, [A(4, 'Early morning, low tide. Maren walks the shore and stops at a green bottle in the weed.'), A(2, 'Tobias jumps from the post boat onto the rocks with the bag.'), L('TOBIAS', 'Post, Miss Holt! Nothing but bills again.'), L('MAREN', 'Keep them. I found my own.'), A(2, 'She holds up the bottle: a rolled letter inside.'), L('TOBIAS', 'Who writes to a lighthouse?')]],
  ['S2', 'The letter', 18, [A(4, 'The lamp room. Maren works the cork out and unrolls the letter on the desk.'), L('EDDA', 'To whoever keeps the light on the point. I see it every night from the island. If someone is there, flash it twice.'), L('TOBIAS', 'It could be years old.'), L('MAREN', 'Then she has been waiting years.')]],
  ['S3', 'Twice', 14, [A(6, 'Night. Maren turns the lamp off and on, twice. They look out at the dark.'), A(4, 'Far out on the water, a small light blinks back. Twice.'), L('TOBIAS', 'Someone’s there.'), A(3, 'Maren smiles and leaves the lamp burning.')]],
];
const SHOTS: Record<string, [number, number][]> = {
  S1: [[0, 4], [4, 6.5], [6.5, 11.2], [11.2, 15]],
  S2: [[0, 4], [4, 12.5], [12.5, 15.3], [15.3, 18]],
  S3: [[0, 3.2], [3.2, 6], [6, 10], [10, 11.5], [11.5, 14]],
};
const WHAT: Record<string, string[]> = {
  S1: ['Wide, low: the shore at low tide, Maren stopping at the bottle in the weed', 'Medium: Tobias jumps from the boat onto the rocks', 'Two-shot: the post and the bottle', 'Close: Tobias, who writes to a lighthouse'],
  S2: ['Close: the cork comes out', 'Medium over her shoulder: the letter on the desk, Edda’s voice', 'Close: Tobias, it could be years old', 'Close: Maren, then she has been waiting years'],
  S3: ['Close: her hand on the switch, the lamp off and on', 'Medium: the two of them at the window', 'Wide, from behind them: the dark sea', 'Extreme wide: a small light blinks twice', 'Close: Maren smiles'],
};
const IN_FRAME: Record<string, string> = {
  S1: 'Maren, Tobias, the post boat', S2: 'Maren, Tobias, the letter', S3: 'Maren, Tobias, the lamp',
};
function sourceFor(slug: string, shots: boolean, boards: boolean): PlanSource {
  return {
    locked: { version: 'v2', date: '2026-11-11' }, pace: { wps: 2.9, gap: 0.5 },
    scenes: SCRIPT.map(([id, title, seconds, items]) => ({
      id, title, seconds, items,
      ...(shots ? { shots: SHOTS[id].map(([t0, t1], i) => ({ n: i + 1, id: String(i + 1), t0, t1, text: WHAT[id][i], inFrame: IN_FRAME[id],
        ...(boards ? { board: `assets/films/${slug}/previz/${id}/storyboard/v1/panels/${String(i + 1).padStart(2, '0')}-shot${i + 1}.png` } : {}) })) } : {}),
    })),
  };
}
/** What each sample's plan is built from (the server reads files; the samples hold it here). */
export function mockPlanSource(slug: string): PlanSource | undefined {
  if (!isDay1(slug) || slug === 'sample-day1-idea') return undefined;
  return sourceFor(slug, slug !== 'sample-day1-script', slug === 'sample-day1-boards' || slug === 'sample-day1-takes');
}

// ---- the takes of the last sample: the-lighthouse's files of S1 and S2

const BLOCKS = 'assets/films/the-lighthouse/blocks';
const TAKES: { scene: string; src: string; seconds: number }[] = [
  { scene: 'S1', src: `${BLOCKS}/S1/takes/S1-grey-take1-480p.mp4`, seconds: 24 },
  { scene: 'S2', src: `${BLOCKS}/S2/takes/S2-grey-take1-480p.mp4`, seconds: 26.125 },
];
export function mockPlanTakes(slug: string): { scene: string; src: string; name: string; seconds: number }[] {
  return slug === 'sample-day1-takes' ? TAKES.map((t) => ({ ...t, name: 'take 1' })) : [];
}
/** GET …/shots for the samples: the takes of S1 and S2, cut where the-lighthouse's cut cuts them. */
export function day1Shots(slug: string, filmShots: () => { takes: TakeShots[] }): { takes: TakeShots[]; waiting: number } | undefined {
  if (!isDay1(slug)) return undefined;
  if (slug !== 'sample-day1-takes') return { takes: [], waiting: 0 };
  const all = filmShots().takes;
  return { takes: TAKES.map((t) => { const x = all.find((y) => y.src === t.src); return { src: t.src, scene: t.scene, name: 'take 1', seconds: x?.seconds ?? t.seconds, cuts: x?.cuts ?? [], state: 'ready' as const }; }), waiting: 0 };
}

// ---- the cuts

interface Cut { current: Timeline | null; versions: TimelineVersionRef[]; timelines?: Timeline[]; empty?: boolean }
const cuts = new Map<string, Cut>();
const at = (k: number) => new Date(Date.UTC(2026, 10, 12 + Math.floor(k / 3), 9 + (k % 3) * 3)).toISOString();
function chain(slug: Id): Cut {
  const steps: { tl: Timeline; words: string }[] = [];
  const push = (t: Timeline, words: string) => {
    const v = `v${steps.length + 1}`;
    steps.push({ tl: { ...t, version: v, at: at(steps.length), note: words, by: 'alma', ...(steps.length ? { basedOn: `v${steps.length}` } : {}) }, words });
  };
  const b1 = bringUp(undefined, sourceFor(slug, false, false))!;
  push(b1.tl, b1.words);
  const b2 = bringUp(steps[0].tl, sourceFor(slug, true, false))!;
  push(b2.tl, b2.words);
  if (slug === 'sample-day1-boards' || slug === 'sample-day1-takes') {
    const b3 = bringUp(steps[1].tl, sourceFor(slug, true, true))!;
    push(b3.tl, b3.words);
  }
  if (slug === 'sample-day1-takes') {
    for (const t of mockPlanTakes(slug)) {
      const r = takeForBoards(steps[steps.length - 1].tl, t.scene, { src: t.src, name: t.name, seconds: t.seconds, sound: true });
      if (typeof r !== 'string') push(r.tl, r.words);
    }
  }
  const tls = steps.map((x) => x.tl);
  const current = tls[tls.length - 1];
  return { current, timelines: tls.slice(0, -1), versions: tls.map((t) => ({ version: t.version, at: t.at, note: t.note, by: t.by, basedOn: t.basedOn })) };
}
export function day1SampleCut(slug: string): Cut | undefined {
  if (!isDay1(slug)) return undefined;
  // no script, no cut: GET …/cut answers that there is none (the page opens on its empty timeline)
  if (slug === 'sample-day1-idea') return { current: null, versions: [] };
  const had = cuts.get(slug);
  if (had) return had;
  const c: Cut = slug === 'sample-day1-script' ? { current: null, versions: [], empty: true } : chain(slug);
  cuts.set(slug, c);
  return c;
}

// ---- the film states

function scenesOf(slug: Id): SceneRef[] {
  const shots = slug !== 'sample-day1-idea' && slug !== 'sample-day1-script';
  return SCRIPT.map(([id, title, seconds], i) => {
    const take = slug === 'sample-day1-takes' ? TAKES.find((t) => t.scene === id) : undefined;
    const making = slug === 'sample-day1-takes' && !take;
    return {
      id, title, folder: `generations/${id}`, seconds, location: i < 1 ? 'L01 the shore' : 'L02 the lamp room',
      ...(shots ? { shots: SHOTS[id].length, sceneFile: `generations/${id}/${id}-scene.md` } : {}),
      promptVersions: [],
      takes: take ? [{ id: 'take1', path: take.src.replace(/^assets\/films\/the-lighthouse\//, ''), seconds: take.seconds, kind: 'take' as const, date: '2026-11-14' }]
        : making ? [{ id: 'take1', jobId: `job-${id}`, kind: 'take' as const, date: '2026-11-14' }] : [],
    };
  });
}
export function day1SampleState(slug: string): FilmState | undefined {
  if (!isDay1(slug)) return undefined;
  const film = DAY1_SAMPLES[slug];
  const base: FilmState = { ...cast, film, cut: undefined, master: undefined, post: { cuts: [], masters: [], captions: [] }, feed: { counts: {}, asks: [] }, qc: {}, warnings: [], updatedAt: '2026-11-15T09:00:00.000Z' };
  if (slug === 'sample-day1-idea') return { ...base, script: undefined, story: undefined, characters: [], locations: [], scenes: [], research: [] };
  const lines = SCRIPT.flatMap(([id, , , items]) => items.filter((x) => 'who' in x).map((x) => ({ sceneId: id, speaker: (x as { who: string }).who, text: x.text })))
    .map((x, i) => ({ id: `L${String(i + 1).padStart(2, '0')}`, ...x }));
  const script = { versions: [{ version: 'v2', date: '2026-11-11', locked: true, path: 'script.md' }, { version: 'v1', date: '2026-11-11', locked: false, path: 'script.md' }], current: 'v2', lines };
  // on the script's day one face still waits; from the shot lists on every pick is made
  const characters = slug === 'sample-day1-script' ? cast.characters
    : cast.characters.map((c) => (c.id === 'C08' ? { ...c, face: { rounds: c.face!.rounds, pick: { candidateId: 'neighbour-r1-2', date: '2026-11-12' } }, sheet: { path: 'cast/C08-neighbour/pick.png', approved: true } } : c));
  return { ...base, script, characters, scenes: scenesOf(slug) };
}

/** The boards' pictures: every board path of a sample is one of the six placeholders, by its scene and shot. */
const DRAWINGS = path.join(process.cwd(), 'src/fixtures/media/day1');
export async function day1Media(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const m = p ? /^assets\/films\/sample-day1-[a-z]+\/previz\/S(\d+)\/storyboard\/v\d+\/panels\/(\d+)-shot\d+\.png$/.exec(p) : null;
  if (!m || !p) return undefined;
  const real = path.join(DRAWINGS, `board-${((Number(m[1]) * 3 + Number(m[2])) % 6) + 1}.png`);
  try { return { abs: p, real, stat: await fs.stat(real), type: 'image/png' }; } catch { return undefined; }
}
