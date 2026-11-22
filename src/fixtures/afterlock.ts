// MOCK=boards: two sample films for the hour after the script lock, in the shape of a real film's first hour.
// Right after the lock the first thing to choose is the locations' looks, and a step whose round is being made shows it
// filling, not an empty list. Everything in memory; nothing is written.
//   sample-after-lock          the script is just locked and the first round is under way, nothing landed yet: four
//                              looks of the boathouse asked (prompts written, no picture), Tobias's 20 faces asked, a
//                              sub-agent on the assistant's faces with no round on disk yet, one on the props; Maren
//                              taken whole from the library (her voice, element line and video element came with her)
//   sample-after-lock-library  an hour on: the boathouse's four looks landed (the first thing to pick), Tobias's face
//                              picked and his voice round landed (his Voices step now), the assistant's faces landed;
//                              Maren still from the library, her element line playable, no voice step for her
// The pictures are sample-cast's drawings and the sounds day one's three spoken lines (src/fixtures/media/).
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CharacterRef, FilmRef, FilmState, LocationRef, Round, ThreadEvent } from '@/server/types';
import { day1SampleState } from './day1';
import { drawingFor } from './cast';

type Id = 'sample-after-lock' | 'sample-after-lock-library';
const base = day1SampleState('sample-day1-script')!;
const repo = base.film.repo;
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const AFTERLOCK_SAMPLES: Record<Id, FilmRef> = {
  'sample-after-lock': ref('sample-after-lock', 'Sample · just locked, the first round under way', 2),
  'sample-after-lock-library': ref('sample-after-lock-library', 'Sample · after the lock, a character from the library', 2),
};
const isAfterlock = (slug: string): slug is Id => slug in AFTERLOCK_SAMPLES;
export const afterlockSampleFilms = (): FilmRef[] => Object.values(AFTERLOCK_SAMPLES);

const faces = (cid: string, slug: string, n: number, landed: boolean, date = '2026-11-21'): Round => ({
  id: 'r1-faces', date, ...(landed ? { prediction: 'r1-3' } : {}),
  candidates: Array.from({ length: n }, (_, i) => ({ id: `r1-${i + 1}`, ...(landed ? { path: `cast/${cid}-${slug}/r1-faces/${cid}-r1-${i + 1}.png` } : {}) })),
});
const LOOKS = ['a', 'b', 'c', 'd'];
const looks = (landed: boolean): Round => ({
  id: 'r1', date: '2026-11-21', ...(landed ? { prediction: 'cand-c' } : {}),
  candidates: LOOKS.map((k) => ({ id: `cand-${k}`, ...(landed ? { path: `locations/L01-boathouse/L01-boathouse-cand-${k}.png` } : {}) })),
});

/** Maren, taken whole from the library on the reuse card: no rounds, his voice and element with him. */
const MAREN: CharacterRef = {
  id: 'C01', name: 'Maren', folder: 'cast/C01-maren', reused: true, reusedFrom: { title: 'The Lighthouse', slug: 'the-lighthouse', entry: 'the-lighthouse-c01-maren' },
  picks: { face: 'cast/C01-maren/pick-face.png' }, sheet: { path: 'cast/C01-maren/pick.png', approved: true },
  voice: { rounds: [], elementLine: { path: 'cast/C01-maren/element-line-5s.mp3', seconds: 3.85, hz: 89.4 } },
  element: { path: 'cast/C01-maren/E-C01-take1-1080p.mp4', state: 'final' },
};
const STUDENTS: CharacterRef = { id: 'C04-C04', name: 'Students', folder: 'cast/C04-C04-students', extra: true, element: { state: 'none' } };

function characters(slug: Id): CharacterRef[] {
  if (slug === 'sample-after-lock') {
    return [MAREN,
      { id: 'C02', name: 'Tobias', folder: 'cast/C02-tobias', face: { rounds: [faces('C02', 'tobias', 20, false)] }, element: { state: 'none' } },
      { id: 'C03', name: 'the Assistant', folder: 'cast/C03-assistant', element: { state: 'none' } },
      STUDENTS];
  }
  return [MAREN,
    { id: 'C02', name: 'Tobias', folder: 'cast/C02-tobias', face: { rounds: [faces('C02', 'tobias', 20, true)], pick: { candidateId: 'r1-3', date: '2026-11-21' } },
      picks: { face: 'cast/C02-tobias/pick-face.png' }, element: { state: 'none' },
      voice: { rounds: [{ id: 'r1', date: '2026-11-21', prediction: '2', candidates: [
        { id: '1', path: 'voices/options/C02-tobias-r1-1.mp3', note: 'Deep and measured, an old sailor', hz: 98, seconds: 3 },
        { id: '2', path: 'voices/options/C02-tobias-r1-2.mp3', note: 'Dry and precise, a little pompous', hz: 112, seconds: 3 },
        { id: '3', path: 'voices/options/C02-tobias-r1-3.mp3', note: 'Warm and slow, a storyteller', hz: 104, seconds: 3 },
      ] }] } },
    { id: 'C03', name: 'the Assistant', folder: 'cast/C03-assistant', face: { rounds: [faces('C03', 'assistant', 20, true)] }, element: { state: 'none' } },
    STUDENTS];
}

function locations(slug: Id): LocationRef[] {
  const landed = slug === 'sample-after-lock-library';
  return [{ id: 'L01', name: 'Boathouse', folder: 'locations/L01-boathouse', styleImages: [looks(landed)],
    props: [{ id: 'P01', name: 'Nets', ...(landed ? { path: 'props/P01-nets/P01-nets-v1.png' } : {}) }, { id: 'P02', name: 'Table', ...(landed ? { path: 'props/P02-table/P02-table-v1.png' } : {}) }] }];
}

export function afterlockSampleState(slug: string): FilmState | undefined {
  if (!isAfterlock(slug)) return undefined;
  return { ...base, film: AFTERLOCK_SAMPLES[slug], characters: characters(slug), locations: locations(slug), feed: { counts: {}, asks: [] }, updatedAt: '2026-11-21T03:19:00.000Z' };
}
/** The cut on the lock's day: none made yet (the Edit page makes v1 on its first read, as sample-day1-script). */
export const afterlockSampleCut = (slug: string) => (isAfterlock(slug) ? { current: null, versions: [], empty: true } : undefined);

// ---- Alma's thread: the lock, then the sub-agents of the first round, running (the first sample) or done

const at = (m: number) => `2026-11-21T03:${String(m).padStart(2, '0')}:00.000Z`;
const task = (id: string, title: string, running: boolean, m: number): ThreadEvent => ({
  kind: 'task', id, at: at(m), task: { id, title, state: running ? 'running' : 'done', startedAt: at(m), ...(running ? {} : { endedAt: at(m + 4) }), steps: [{ at: at(m), text: 'Bash · List the film folder' }] },
});
function thread(slug: Id): ThreadEvent[] {
  const running = slug === 'sample-after-lock';
  return [
    { kind: 'user', id: 'u-lock', at: at(17), text: 'Script v9: lock' },
    { kind: 'assistant_text', id: 'a-lock', at: at(19), text: 'Script v9 is locked. Your lock is the go for the first round of assets; five background agents are making it now. Each round goes on a card for your pick as it lands. Maren needs nothing new: his face, sheet, voice and element came from the library.' },
    task('t-l01', 'Alma › location · L01 candidates', running, 18),
    task('t-c02', 'Alma › faces · C02 round 1', running, 18),
    task('t-c03', 'Alma › faces · C03 round 1', running, 18),
    task('t-props', 'Alma › prop · P01 nets and P02 table', running, 18),
    task('t-c04', 'Alma › faces · C04 the students group', running, 18),
  ];
}
export const AFTERLOCK_THREADS: Record<string, ThreadEvent[]> = Object.fromEntries((Object.keys(AFTERLOCK_SAMPLES) as Id[]).map((k) => [k, thread(k)]));

// ---- media: the cast's drawings for pictures, day one's spoken lines for sounds

const CAST_DRAWINGS = path.join(process.cwd(), 'src/fixtures/media/cast');
const SOUNDS = path.join(process.cwd(), 'src/fixtures/media/day1');
export async function afterlockMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const m = p ? /^assets\/films\/(sample-after-lock(?:-library)?)\/(.+)$/.exec(p) : null;
  if (!m || !p) return undefined;
  const rel = m[2];
  let real: string | undefined;
  let type = 'image/png';
  if (/\.mp3$/i.test(rel)) { real = path.join(SOUNDS, `voice-${(Number(/-(\d)\.mp3$/.exec(rel)?.[1] ?? 1) % 3) + 1}.mp3`); type = 'audio/mpeg'; }
  else { const d = drawingFor(rel); if (d) real = path.join(CAST_DRAWINGS, d); }
  if (!real) return undefined;
  try { return { abs: p, real, stat: await fs.stat(real), type }; } catch { return undefined; }
}
