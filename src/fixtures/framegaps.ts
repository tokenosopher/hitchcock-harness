// MOCK=boards: a sample film whose takes were made at 25 fps and cut on a 24 fps timeline, where a one-frame black
// gap used to show between two shots of a take that no trim could fill. Its S2 and S3: each take whole in the cut, one
// clip, its shot cuts where the shot detector found them in the 25 fps file, off the 24 fps frame grid (S2 17.6 and 20.24 s, S3 14.24 and
// 17.44 s). The page splits each take at its shots; before the fix the pieces were drawn with a one-frame hole between
// them that no trim could close. No pictures: the files do not exist and simply do not load. Pure: nothing is written.
import type { CutInfo, FilmRef, FilmState, Timeline, TimelineClip } from '@/server/types';
import type { TakeShots } from '@/server/edit/shots';
import boardFilm from './boards/the-lighthouse.json';

export const GAPS_FILM = 'sample-frame-gaps';
const D = `assets/films/${GAPS_FILM}`;
export const GAPS_S2 = `${D}/generations/S2/takes/take1/S2-take1-480p.mp4`;
export const GAPS_S3 = `${D}/generations/S3/takes/take1/S3-take1-480p.mp4`;
/** A second take of S2, not in the cut, its cuts off the grid too: a shot of it tried in the place of S2's shot 5. */
export const GAPS_S2B = `${D}/generations/S2/takes/take2/S2-take2-480p.mp4`;
/** The takes' shot cuts as harness/shots.json has them (times in the 25 fps files). */
export const GAPS_CUTS: Record<string, number[]> = { [GAPS_S2]: [5.04, 9.04, 12.08, 17.6, 20.24], [GAPS_S3]: [3.92, 9.52, 14.24, 17.44], [GAPS_S2B]: [4.12, 8.36, 13.72, 18.04, 21.32] };
export const GAPS_SECONDS: Record<string, number> = { [GAPS_S2]: 28.24, [GAPS_S3]: 23.12, [GAPS_S2B]: 26.92 };

const lighthouse = boardFilm as unknown as FilmState;
const ref: FilmRef = { slug: GAPS_FILM, title: 'Sample · 25 fps takes on a 24 fps cut', folder: `${lighthouse.film.repo}/assets/films/${GAPS_FILM}`, repo: lighthouse.film.repo, flow: 'video-driven', status: 'in-progress', stage: 9, aspect: '16:9' };

const take = (id: string, src: string, scene: string, out: number, at: number): TimelineClip =>
  ({ id, src, in: 0, out, at, label: `${scene} · take 1`, takeRef: { scene, take: 'take 1' } });

/** The sample cut (v1): S2 and S3 whole, back to back, as a real cut has them (moved to start at 0). */
export function gapsCut(): Timeline {
  const pic = [take('s2-take', GAPS_S2, 'S2', 28.25, 0), take('s3-take', GAPS_S3, 'S3', 23.125, 28.25)];
  return {
    version: 'v1', fps: 24, width: 1920, height: 1080, at: '2026-11-26T07:00:00.000Z', by: 'user', note: 'S2 and S3, 25 fps takes',
    markers: [],
    tracks: [
      { id: 'V1', kind: 'video', name: 'Picture', clips: pic },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pic.map((c) => ({ ...c, id: `${c.id}a` })) },
    ],
  } as Timeline;
}

/** The takes as GET …/shots answers them. */
export const gapsShots = (): TakeShots[] => [GAPS_S2, GAPS_S2B, GAPS_S3].map((src, i) =>
  ({ src, scene: i === 2 ? 'S3' : 'S2', name: i === 1 ? 'take 2' : 'take 1', seconds: GAPS_SECONDS[src], cuts: GAPS_CUTS[src], state: 'ready' }));

export const gapsSampleFilms = (): FilmRef[] => [ref];
export const isGapsSample = (slug: string) => slug === GAPS_FILM;

export function gapsSampleCut(slug: string): { current: Timeline; versions: unknown[]; sourceSeconds: Record<string, number> } | undefined {
  if (!isGapsSample(slug)) return undefined;
  const cur = gapsCut();
  return { current: cur, versions: [{ version: cur.version, at: cur.at, note: cur.note, by: 'user' }], sourceSeconds: GAPS_SECONDS };
}

export function gapsSampleState(slug: string): FilmState | undefined {
  const c = gapsSampleCut(slug);
  if (!c) return undefined;
  const cur = c.current;
  return {
    ...lighthouse, film: ref, master: undefined, post: undefined, feed: undefined,
    cut: { name: `cut ${cur.version}`, fps: cur.fps, source: { cut: `cut ${cur.version}`, from: [`cut/${cur.version}.json`], date: '2026-11-26', label: `from cut/${cur.version}.json` },
      versions: c.versions as CutInfo['versions'], current: cur },
  };
}

export const gapsSampleShots = (slug: string): { takes: TakeShots[]; waiting: number } | undefined => (isGapsSample(slug) ? { takes: gapsShots(), waiting: 0 } : undefined);
