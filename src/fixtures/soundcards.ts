// MOCK=boards: the sample of sound pick cards heard on the card and in the film.
//   sample-sound-cards  two cards in the shape the sound designer writes (review/cards.json, read by the feed's own
//                       parser): "Which surf wash?" (options "try 1" to "try 3" and "none of these", a plain list
//                       of files, placed by a lay file at two moments of the cut, as audio/sfx/lay-v2.json does)
//                       and "Which gull cry?" (its own "places"); a short cut with a take's sound, the
//                       surf's try 2 in its place at both moments, and its 480p.
// The sounds are the five short noises beside the fixtures (src/fixtures/media/sound/try-N.mp3), the take and the 480p
// the small test video (src/fixtures/media/sample-render.mp4, with sound). Choices and Done picking stay in memory.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FeedCard, FilmRef, FilmState } from '@/server/types';
import { cardsOf } from '@/server/films/read/feed';
import { momentsFromLay } from '@/components/feed/hearIt';
import boardFilm from './boards/the-lighthouse.json';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
export const SOUND_CARDS = 'sample-sound-cards';
const ROOT = `assets/films/${SOUND_CARDS}`;
const REF: FilmRef = { slug: SOUND_CARDS, title: 'Sample · sound cards heard in the film', folder: `${repo}/${ROOT}`, repo, flow: 'video-driven', status: 'in-progress', stage: 11, aspect: '9:16' };
export const soundCardsFilms = (): FilmRef[] => [REF];

const surf = (n: number) => `${ROOT}/audio/sfx/surf-wash/surf-wash-try${n}.wav`;
const gull = (n: number) => `${ROOT}/audio/sfx/gull-cry/gull-cry-try${n}.wav`;
const TAKE = `${ROOT}/blocks/S1/takes/S1-take1-480p.mp4`;
export const SOUND_CARDS_PROXY = `${ROOT}/cut/renders/v3-proxy.mp4`;

/** The record as the sound designer writes it (review/cards.json), in the shape the sound designer writes. */
const RECORD = {
  title: 'Sample', sections: [{
    heading: 'Sound', cards: [
      {
        type: 'card', id: 'ASK-sfx2-surf-wash', title: 'Which surf wash?', at: 'sound', for: 'film', updated: '2026-11-25T01:06:00Z',
        sub: 'the surf used as pre-laps into S2 and S3 (try 2 in the cut); the others are in audio/sfx/surf-wash/',
        ask: 'pick', prediction: '2',
        options: ['try 1', 'try 2', 'try 3', 'none of these'],
        files: [surf(1), surf(2), surf(3)],
      },
      {
        type: 'card', id: 'ASK-sfx2-gull-cry', title: 'Which gull cry?', at: 'sound', for: 'film', updated: '2026-11-25T01:05:00Z',
        sub: 'the gull over the rock in S3', ask: 'pick',
        options: ['try 1', 'try 2', 'none of these'],
        files: [gull(1), gull(2)],
        places: [
          [{ moment: 'the gull in S3', at: 15.0, in: 0.2, out: 2.0, gain_db: -4, fade_in: 0.2, fade_out: 0.5 }],
          [{ moment: 'the gull in S3', at: 15.0, in: 0.0, out: 1.8, gain_db: -6, fade_in: 0.2, fade_out: 0.5 }],
        ],
      },
    ],
  }],
};

/** audio/sfx/lay-v2.json of the sample: the surf laid at two moments, try 3 only at the first. */
export const SOUND_CARDS_LAY = {
  cut: 'v3', fps: 24, film_end: 20,
  sounds: [
    { id: 'V07', name: 'surf-wash-into-s2', kind: 'pre-lap', place: [6.0, 7.5], fade_in_frames: 6, fade_out_frames: 12, recommend: 2,
      variations: [
        { try: 2, file: surf(2), at: 6.0, in: 0.5, out: 2.0, level_db: -3 },
        { try: 1, file: surf(1), at: 6.0, in: 0.25, out: 1.75, level_db: -2 },
        { try: 3, file: surf(3), at: 6.0, in: 0.0, out: 1.5, level_db: -4 },
      ] },
    { id: 'V09', name: 'surf-wash-into-s3', kind: 'pre-lap', place: [11.0, 12.5], fade_in_frames: 6, fade_out_frames: 12, recommend: 2,
      variations: [
        { try: 2, file: surf(2), at: 11.0, in: 0.5, out: 2.0, level_db: -3 },
        { try: 1, file: surf(1), at: 11.0, in: 0.5, out: 2.0, level_db: -2 },
      ] },
  ],
};

// ---- the choices on the sample, in memory

const g = globalThis as unknown as { __hhSoundCards?: Record<string, { option?: string; at: string }> };
const MEM = (g.__hhSoundCards ??= {});
export const resetSoundCards = (): void => { for (const k of Object.keys(MEM)) delete MEM[k]; };

function cards(): FeedCard[] {
  const cs = cardsOf(RECORD);
  for (const c of cs) {
    if (!c.hear && c.ask) c.hear = { moments: momentsFromLay(SOUND_CARDS_LAY, c.ask.options), from: 'audio/sfx/lay-v2.json' };
    const a = MEM[c.key];
    if (a && c.ask) c.ask.answer = { ...a, by: 'harness' };
  }
  return cs;
}
export const soundCardsFeed = (slug: string): FeedCard[] | undefined => (slug === SOUND_CARDS ? cards() : undefined);

export function soundCardsState(slug: string): FilmState | undefined {
  if (slug !== SOUND_CARDS) return undefined;
  const cs = cards();
  const counts: Record<string, number> = {};
  for (const c of cs) counts[c.place] = (counts[c.place] ?? 0) + 1;
  return { ...lighthouse, film: REF, master: undefined, post: { cuts: [], masters: [], captions: [] }, feed: { counts, asks: cs.filter((c) => c.ask && !c.ask.answer) } };
}

/** POST …/done on the sample: the answers kept in memory. */
export function soundCardsDone(slug: string, answers: { card: string; option?: string }[]): Response | undefined {
  if (slug !== SOUND_CARDS) return undefined;
  const at = new Date().toISOString();
  for (const a of answers) MEM[a.card] = { option: a.option, at };
  return Response.json({ ok: true, dryRun: false, film: slug, answers: answers.map((a) => ({ card: a.card, option: a.option })), picks: [], message: '', notified: true });
}

// ---- the sample's cut: a 20 s take with its own sound, the surf's try 2 at both of its moments

const clip = (o: Record<string, unknown>) => o;
export function soundCardsCut(slug: string): { current: unknown; versions: unknown[] } | undefined {
  if (slug !== SOUND_CARDS) return undefined;
  const current = {
    version: 'v3', fps: 24, width: 1080, height: 1920, by: 'alma', at: '2026-11-25T01:00:00Z', note: 'the surf laid in', markers: [],
    renders: { proxy: { path: SOUND_CARDS_PROXY, at: '2026-11-25T01:00:00Z', hash: 'sample', seconds: 20 } },
    tracks: [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [clip({ id: 'v-s1', src: TAKE, in: 0, out: 20, at: 0, label: 'S1 · take 1' })] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [clip({ id: 'a-s1', src: TAKE, in: 0, out: 20, at: 0, gain: -8, label: 'S1 · take 1' })] },
      { id: 'FX3', kind: 'audio', name: 'Effects · sea', clips: [
        clip({ id: 'fx-surf-s2', src: surf(2), in: 0.5, out: 2.0, at: 6.0, gain: -3, fadeIn: 0.25, fadeOut: 0.5, label: 'surf-wash · try 2' }),
        clip({ id: 'fx-surf-s3', src: surf(2), in: 0.5, out: 2.0, at: 11.0, gain: -3, fadeIn: 0.25, fadeOut: 0.5, label: 'surf-wash · try 2' }),
      ] },
    ],
  };
  return { current, versions: [{ version: 'v3', at: current.at, note: current.note, by: 'alma', made: { proxy: true } }] };
}

// ---- the sample's files

const DIR = path.join(process.cwd(), 'src/fixtures/media');
/** The real file behind a path of the sample. */
export function soundCardsFile(p: string | null): { real: string; type: string } | undefined {
  if (!p?.startsWith(`${ROOT}/`)) return undefined;
  const m = /\/audio\/sfx\/(surf-wash|gull-cry)\/\1-try(\d)\.wav$/.exec(p);
  if (m) return { real: path.join(DIR, 'sound', `try-${((Number(m[2]) - 1 + (m[1] === 'gull-cry' ? 3 : 0)) % 5) + 1}.mp3`), type: 'audio/mpeg' };
  if (p === TAKE || p === SOUND_CARDS_PROXY) return { real: path.join(DIR, 'sample-render.mp4'), type: 'video/mp4' };
  return undefined;
}
export async function soundCardsMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const f = soundCardsFile(p);
  if (!f || !p) return undefined;
  try { return { abs: p, real: f.real, stat: await fs.stat(f.real), type: f.type }; } catch { return undefined; }
}
