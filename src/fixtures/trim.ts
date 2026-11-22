// MOCK=boards: a sample film whose cut is one multi-shot take cut into its shots, back to back, for
// trimming them: the shape of a real film's S4, with its numbers (the cut moved to start at 0).
//   S4 take 1        one generation of 26.042 s whose shots are different angles: cuts at 2.333, 4.292, 8.333, 10.583,
//                    13.292, 15.708, 19.917 and 22.708 s. In the cut: its shot 2 (whole), shot 3 (6.625 → 8.333: its
//                    head trimmed), shots 4, 5 and 6 (whole), then after the pick-up shots 8 (its head trimmed) and 9.
//   FIX-S4-reel      a pick-up of 10.042 s with cuts at 3.75 and 6.875: its shot 1 (0 → 3.292) opens the cut, its
//                    shots 2 and 3 sit between S4's shots 6 and 8.
//   title card       a file with no shots (5 s), used from 0.5 to 3.5 s at the end: trimmed to its file's own ends.
// The page (GET …/shots) gets the pick-ups' shots numbered as their shots files number them, like a real film's: FIX-S4-reel's three are "1", "7a" and "7b" (Shot 1, and two shots added to Shot 7), and a second pick-up,
// FIX-S4-tap, of 5.042 s and one shot "7a", not in the cut. The unit test of trimming reads trimShots(), without them.
// An effect on A2, two subtitle lines and two markers sit after the shots, for what a ripple moves.
// Its pictures are made up with ffmpeg (scripts/sample-media.sh does the sample film's; for this one, each shot of the
// take in its own colour, its time burnt in): MOCK_MEDIA_DIR=<dir> with <dir>/generations/…, <dir>/title-card.mp4.
// Without them the pictures simply do not load. Pure: nothing is written.
import type { CutInfo, FilmRef, FilmState, Timeline, TimelineClip } from '@/server/types';
import type { TakeShots } from '@/server/edit/shots';
import { readShotTags, shotTagsFor } from '@/components/edit/shotCols';
import boardFilm from './boards/the-lighthouse.json';

export const TRIM_FILM = 'sample-trim-shots';
const D = `assets/films/${TRIM_FILM}`;
export const TRIM_TAKE = `${D}/generations/S4/takes/take1/S4-take1-480p.mp4`;
export const TRIM_FIX = `${D}/generations/FIX-S4-reel/takes/take1/FIX-S4-reel-take1-480p.mp4`;
export const TRIM_TAP = `${D}/generations/FIX-S4-tap/takes/take1/FIX-S4-tap-take1-480p.mp4`;
export const TRIM_TITLE = `${D}/title-card.mp4`;
export const TRIM_BOOM = `${D}/audio/sfx/boom.wav`;
/** The pick-ups' shots files, as the real film's `generations/FIX-S4-reel/FIX-S4-reel-shots.json` and `…/FIX-S4-tap/…`. */
export const REEL_FILE = { duration: 10, shots: [{ id: '1', t0: 0, t1: 2.4 }, { id: '7a', t0: 2.4, t1: 6.6 }, { id: '7b', t0: 6.6, t1: 10 }] };
export const TAP_FILE = { duration: 5, shots: [{ id: '7a', t0: 0, t1: 5 }] };
/** The take's cuts, as harness/shots.json has them for the real film. */
export const TRIM_CUTS = [2.333333, 4.291667, 8.333333, 10.583333, 13.291667, 15.708333, 19.916667, 22.708333];
export const TRIM_SECONDS: Record<string, number> = { [TRIM_TAKE]: 26.041667, [TRIM_FIX]: 10.041667, [TRIM_TAP]: 5.041667, [TRIM_TITLE]: 5, [TRIM_BOOM]: 2 };

const lighthouse = boardFilm as unknown as FilmState;
const ref: FilmRef = { slug: TRIM_FILM, title: 'Sample · a take cut into its shots', folder: `${lighthouse.film.repo}/assets/films/${TRIM_FILM}`, repo: lighthouse.film.repo, flow: 'video-driven', status: 'in-progress', stage: 9, aspect: '9:16' };

const take = (id: string, src: string, inn: number, out: number, at: number, label: string, t: string): TimelineClip =>
  ({ id, src, in: inn, out, at, label, takeRef: { scene: 'S4', take: t } });
const s4 = (id: string, inn: number, out: number, at: number, n: number) => take(id, TRIM_TAKE, inn, out, at, `S4 · take 1 · shot ${n}`, 'take 1');
const fix = (id: string, inn: number, out: number, at: number, n: number) => take(id, TRIM_FIX, inn, out, at, `S4 · FIX-S4-reel · take 1 · shot ${n}`, 'FIX-S4-reel · take 1');

/** The sample cut (v1): a real film's v20 from S4 on, 52.333 s earlier. */
export function trimCut(): Timeline {
  const pic: TimelineClip[] = [
    fix('c-f4a', 0, 3.291667, 0, 1),
    s4('s4-take', 2.333333, 4.291667, 3.291667, 2),
    s4('s4-take~2', 6.625, 8.333333, 5.25, 3),
    s4('s4-take~3', 8.333333, 10.583333, 6.958333, 4),
    s4('s4-take~4', 10.583333, 13.291667, 9.208333, 5),
    s4('s4-take~5', 13.291667, 15.708333, 11.916667, 6),
    fix('c-f4b', 3.75, 6.875, 14.333333, 2),
    fix('c-f4b~2', 6.875, 10.041667, 17.458333, 3),
    s4('c-s4b', 21.666667, 22.708333, 20.625, 8),
    s4('c-s4b~2', 22.708333, 26.041667, 21.666667, 9),
  ];
  return {
    version: 'v1', fps: 24, width: 480, height: 854, at: '2026-11-21T17:03:13.000Z', by: 'user', note: 'S4 of a longer cut, v20',
    markers: [{ at: 12.5, text: 'shot 6' }, { at: 25.5, text: 'the card' }],
    tracks: [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [...pic, { id: 'card', src: TRIM_TITLE, in: 0.5, out: 3.5, at: 25, label: 'title card' }] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: pic.map((c) => ({ ...c, id: `${c.id.replace(/~/, 'a~')}${c.id.includes('~') ? '' : 'a'}` })) },
      { id: 'A2', kind: 'audio', name: 'Effects', clips: [{ id: 'boom', src: TRIM_BOOM, in: 0, out: 1, at: 22.5, label: 'boom', gain: -6 }] },
      { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [
        { id: 'l1', in: 0, out: 1.5, at: 15, text: 'Who writes to a lighthouse?' },
        { id: 'l2', in: 0, out: 1.5, at: 23, text: 'Someone who sees the light.' },
      ] },
    ],
  } as Timeline;
}

/** The take's shots and the pick-up's, as GET …/shots answers them for the real film; the title card has none. */
export function trimShots(): TakeShots[] {
  return [
    { src: TRIM_FIX, scene: 'S4', name: 'FIX-S4-reel · take 1', group: undefined, seconds: TRIM_SECONDS[TRIM_FIX], cuts: [3.75, 6.875], state: 'ready' },
    { src: TRIM_TAKE, scene: 'S4', name: 'take 1', seconds: TRIM_SECONDS[TRIM_TAKE], cuts: TRIM_CUTS, state: 'ready' },
  ];
}

export const trimSampleFilms = (): FilmRef[] => [ref];
export const isTrimSample = (slug: string) => slug === TRIM_FILM;

export function trimSampleCut(slug: string): { current: Timeline; versions: unknown[]; sourceSeconds: Record<string, number> } | undefined {
  if (!isTrimSample(slug)) return undefined;
  const cur = trimCut();
  return { current: cur, versions: [{ version: cur.version, at: cur.at, note: cur.note, by: 'user' }], sourceSeconds: TRIM_SECONDS };
}

export function trimSampleState(slug: string): FilmState | undefined {
  const c = trimSampleCut(slug);
  if (!c) return undefined;
  const cur = c.current;
  return {
    ...lighthouse, film: ref, master: undefined, post: undefined, feed: undefined,
    cut: { name: `cut ${cur.version}`, fps: cur.fps, source: { cut: `cut ${cur.version}`, from: [`cut/${cur.version}.json`], date: '2026-11-21', label: `from cut/${cur.version}.json` },
      versions: c.versions as CutInfo['versions'], current: cur },
  };
}

/** The takes as GET …/shots answers them for this sample: trimShots() with each pick-up's shots numbered from its shots
 *  file, read as the server reads a real one (readShotTags, shotTagsFor), and FIX-S4-tap beside them. */
export function trimSampleTakes(): TakeShots[] {
  const numbered = (t: TakeShots, file: unknown): TakeShots => ({ ...t, ...(shotTagsFor([readShotTags(file)], t.cuts) ?? {}) });
  const tap: TakeShots = { src: TRIM_TAP, scene: 'S4', name: 'FIX-S4-tap · take 1', seconds: TRIM_SECONDS[TRIM_TAP], cuts: [], state: 'ready' };
  return [...trimShots().map((t) => (t.src === TRIM_FIX ? numbered(t, REEL_FILE) : t)), numbered(tap, TAP_FILE)];
}

export const trimSampleShots = (slug: string): { takes: TakeShots[]; waiting: number } | undefined => (isTrimSample(slug) ? { takes: trimSampleTakes(), waiting: 0 } : undefined);
