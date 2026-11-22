// MOCK=boards: the Character elements step , the shape of a sample film after
// the picks. The board said "1 of 3" with a spinner while only Tobias's video element was new: the assistant's "silent"
// was not read, and Maren, from the library, was counted. Everything in memory; nothing is written.
//   C01 Maren   taken whole from the library, his 1080p video element with him: done, "from the library"
//   C02 Tobias      the one new video element: sheet approved, voice picked, its line cut. In sample-elements its 480p
//                  draft waits on one go card that carries the sheet, the face and the line; in
//                  sample-elements-making the draft is being made (a sub-agent running), so the step reads "1 of 1"
//   C03 Assistant  silent: image element only, no video element needed
//   C04 Students   a group of extras: image element only
// The pictures are sample-cast's drawings and the sound one of day one's spoken lines (src/fixtures/media/).
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CharacterRef, FeedCard, FilmRef, FilmState, ThreadEvent } from '@/server/types';
import { day1SampleState } from './day1';
import { drawingFor } from './cast';

type Id = 'sample-elements' | 'sample-elements-making';
const base = day1SampleState('sample-day1-script')!;
const repo = base.film.repo;
const ref = (slug: Id, title: string): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage: 3, aspect: '9:16' });
export const ELEMENTS_SAMPLES: Record<Id, FilmRef> = {
  'sample-elements': ref('sample-elements', "Sample · Tobias's video element waits for your go"),
  'sample-elements-making': ref('sample-elements-making', "Sample · Tobias's video element being made"),
};
const isElements = (slug: string): slug is Id => slug in ELEMENTS_SAMPLES;
export const elementsSampleFilms = (): FilmRef[] => Object.values(ELEMENTS_SAMPLES);

const picked = (cid: string, slug: string) => ({
  face: { rounds: [{ id: 'r1-faces', date: '2026-11-21', pick: 'r1-1', candidates: [1, 2, 3].map((k) => ({ id: `r1-${k}`, path: `cast/${cid}-${slug}/r1-faces/${cid}-r1-${k}.png` })) }], pick: { candidateId: 'r1-1', date: '2026-11-21' } },
  wardrobe: { rounds: [], pick: { candidateId: 'r4-2', date: '2026-11-21' } },
  picks: { face: `cast/${cid}-${slug}/pick-face.png`, wardrobe: `cast/${cid}-${slug}/pick-wardrobe.png` },
  sheet: { path: `cast/${cid}-${slug}/pick.png`, approved: true },
});

export function elementsSampleCharacters(): CharacterRef[] {
  return [
    { id: 'C01', name: 'Maren', folder: 'cast/C01-maren', reused: true, imageElement: true, reusedFrom: { title: 'The Lighthouse', slug: 'the-lighthouse' },
      picks: { face: 'cast/C01-maren/pick-face.png' }, sheet: { path: 'cast/C01-maren/pick.png', approved: true },
      voice: { rounds: [], elementLine: { path: 'cast/C01-maren/element-line-5s.mp3', seconds: 3.85, hz: 89.4 } },
      element: { path: 'cast/C01-maren/E-C01-take1-1080p.mp4', state: 'final' } },
    { id: 'C02', name: 'Tobias', folder: 'cast/C02-tobias', imageElement: true, ...picked('C02', 'tobias'),
      voice: { rounds: [{ id: 'r1', date: '2026-11-21', pick: '3', candidates: [{ id: '3', path: 'voices/options/C02-tobias-r1-3.mp3', note: 'Warm and slow, a storyteller', hz: 95, seconds: 3 }] }],
        pick: { candidateId: '3', date: '2026-11-21' }, elementLine: { path: 'cast/C02-tobias/voice/element-line-5s.mp3', seconds: 3.4, hz: 95 } },
      element: { state: 'none' } },
    { id: 'C03', name: 'the Assistant', folder: 'cast/C03-assistant', silent: true, imageElement: true, role: 'silent', ...picked('C03', 'assistant'), element: { state: 'none' } },
    { id: 'C04-C04', name: 'Students', folder: 'cast/C04-C04-students', extra: true, imageElement: true, sheet: { path: 'cast/C04-C04-students/pick.png', approved: true }, element: { state: 'none' } },
  ];
}

/** The one go card for Tobias's element: the sheet, the face and the line, the quote. */
export const ELEMENT_GO: FeedCard = {
  key: 'GO-E-C02-draft', id: 'GO-E-C02-draft', title: 'C02 Tobias video element: 480p draft', section: 'Elements', place: 'elements', ids: ['C02'], placed: 'card',
  date: '2026-11-21T16:00:00.000Z',
  media: [
    { kind: 'image', path: 'cast/C02-tobias/pick.png', label: 'the sheet' },
    { kind: 'image', path: 'cast/C02-tobias/pick-face.png', label: 'the face' },
    { kind: 'audio', path: 'cast/C02-tobias/voice/element-line-5s.mp3', label: 'the line · option 3, warm and slow', sub: '3.4 s · 95 Hz' },
  ],
  ask: { kind: 'go', options: [], cost: '15 credits at 480p draft' },
};

export function elementsSampleState(slug: string): FilmState | undefined {
  if (!isElements(slug)) return undefined;
  const asks = slug === 'sample-elements' ? [ELEMENT_GO] : [];
  return { ...base, film: ELEMENTS_SAMPLES[slug], characters: elementsSampleCharacters(), locations: [], feed: { counts: { elements: asks.length }, asks }, updatedAt: '2026-11-21T16:00:00.000Z' };
}
export const elementsSampleFeed = (slug: string): FeedCard[] | undefined => (isElements(slug) ? elementsSampleState(slug)!.feed!.asks : undefined);

const at = '2026-11-21T16:05:00.000Z';
export const ELEMENTS_THREADS: Record<string, ThreadEvent[]> = {
  'sample-elements-making': [
    { kind: 'user', id: 'u-go', at, text: 'Go · GO-E-C02-draft' },
    { kind: 'task', id: 't-e-c02', at, task: { id: 't-e-c02', title: 'Alma › element · C02 480p draft', state: 'running', startedAt: at, steps: [{ at, text: 'Seedance 2.5 · E-C02 480p' }] } },
  ],
};

const DRAWINGS = path.join(process.cwd(), 'src/fixtures/media/cast');
const SOUND = path.join(process.cwd(), 'src/fixtures/media/day1/voice-2.mp3');
export async function elementsMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const m = p ? /^assets\/films\/(sample-elements(?:-making)?)\/(.+)$/.exec(p) : null;
  if (!m || !p) return undefined;
  const rel = m[2];
  const real = /\.mp3$/i.test(rel) ? SOUND : drawingFor(rel.replace('C04-C04', 'C06-C07')) && path.join(DRAWINGS, drawingFor(rel.replace('C04-C04', 'C06-C07'))!);
  if (!real) return undefined;
  try { return { abs: p, real, stat: await fs.stat(real), type: /\.mp3$/i.test(rel) ? 'audio/mpeg' : 'image/png' }; } catch { return undefined; }
}
