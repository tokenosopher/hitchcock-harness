// MOCK=boards: sample films for the Edit page's "What's next" tab (14 Nov 2026, ASKS 47), one for each moment of the
// seven steps. Each is the-lighthouse's cut (its files renamed into the sample's own folder), with its own record, ticks,
// full-size pictures, masters and release file, all in memory. Server-only; nothing is written.
//   sample-left-start     nothing done: no yes in the record, nothing full size, no subtitle lines, no master, no
//                         release file; a version newer than the cut could not be read (the header's orange line)
//   sample-left-1080      at the 1080p: the record's yes for cut v1, the cut now v3 with one shot re-trimmed past the
//                         upscaled cut, two takes marked to redo in Seedance; v2 could not be read (quiet, in the menu)
//   sample-left-remaster  the master is of v1 and the cut is v2 with a level changed: out of date, said in words
//                         ("1 sound level changed since the master"); the final is that master (the amber note, in
//                         words); the sound listened through at v1
//   sample-left-same      the master is of v1 and the cut is v3, where v2 moved a subtitle line and v3 undid it: the
//                         same content, so the master is current and the final has no amber note (ASKS 49)
//   sample-left-posting   everything up to the final, which is the master of the cut; Reddit and YouTube posted of six
//   sample-left-done      everything done: every platform posted
import type { FeedCard, FilmRef, FilmState, Timeline } from '@/server/types';
import type { SeedanceMark } from '@/components/edit/marks';
import type { LeftFile } from '@/components/edit/left';
import type { ReleaseFile } from '@/components/release/file';
import boardFilm from './boards/the-lighthouse.json';
import cutFilm from './boards/cut-the-lighthouse.json';
import { at, boardRelease } from './release';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
const FROM = 'assets/films/the-lighthouse/';

type Id = 'sample-left-start' | 'sample-left-1080' | 'sample-left-remaster' | 'sample-left-same' | 'sample-left-posting' | 'sample-left-done';
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const LEFT_SAMPLES: Record<Id, FilmRef> = {
  'sample-left-start': ref('sample-left-start', "Sample · what's next: nothing done", 9),
  'sample-left-1080': ref('sample-left-1080', "Sample · what's next: the 1080p", 9),
  'sample-left-remaster': ref('sample-left-remaster', "Sample · what's next: the master again", 10),
  'sample-left-same': ref('sample-left-same', "Sample · what's next: a move and its undo", 10),
  'sample-left-posting': ref('sample-left-posting', "Sample · what's next: posting", 12),
  'sample-left-done': ref('sample-left-done', "Sample · what's next: done", 12),
};
const isLeft = (slug: string): slug is Id => slug in LEFT_SAMPLES;
export const leftSampleFilms = (): FilmRef[] => Object.values(LEFT_SAMPLES);

/** the-lighthouse's cut with its files moved into the sample's folder (a mark or a full-size file names the film's own). */
const own = <T>(x: T, slug: string): T => JSON.parse(JSON.stringify(x).split(FROM).join(`assets/films/${slug}/`)) as T;
const v1Of = (slug: string): Timeline => ({ ...own(cutFilm.current as unknown as Timeline, slug), renders: undefined });
const refOf = (t: Timeline) => ({ version: t.version, at: t.at, note: t.note, by: t.by ?? 'user', basedOn: t.basedOn });

interface Cut { current: Timeline; versions: ReturnType<typeof refOf>[]; timelines?: Timeline[]; sourceSeconds?: Record<string, number>; problems?: Record<string, string[]> }
const cuts = new Map<string, Cut>();
export function leftSampleCut(slug: string): Cut | undefined {
  if (!isLeft(slug)) return undefined;
  const had = cuts.get(slug);
  if (had) return had;
  const v1 = v1Of(slug);
  const seconds = own(cutFilm.sourceSeconds as Record<string, number>, slug);
  let c: Cut;
  if (slug === 'sample-left-start') {
    // no subtitle lines yet, and a newer version that could not be read
    const t = { ...v1, tracks: v1.tracks.map((x) => (x.kind === 'captions' ? { ...x, clips: [] } : x)) };
    c = { current: t, versions: [refOf(t)], sourceSeconds: seconds, problems: { v2: ['track C1 clip s1: id used twice'] } };
  } else if (slug === 'sample-left-1080') {
    // the eighth picture clip plays 2.3 s of its take the upscaled cut never used: that shot is at 480p
    const v3: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    const p = v3.tracks.find((x) => x.id === 'V1')!;
    p.clips[7].in = 18; p.clips[7].out = 23.833;
    const a = v3.tracks.find((x) => x.id === 'A1')!;
    a.clips[7].in = 18; a.clips[7].out = 23.833;
    Object.assign(v3, { version: 'v3', basedOn: 'v1', note: 'S2 shot 4 re-trimmed', at: '2026-11-14T09:00:00.000Z' });
    c = { current: v3, versions: [refOf(v1), refOf(v3)], timelines: [v1], sourceSeconds: seconds, problems: { v2: ['track C1 clip s1: id used twice'] } };
  } else if (slug === 'sample-left-remaster') {
    // a level changed: the same picture, so still all full size from the upscaled v1
    const v2: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    v2.tracks.find((x) => x.id === 'A1')!.clips[0].gain = -3;
    Object.assign(v2, { version: 'v2', basedOn: 'v1', note: 'first line −3 dB', at: '2026-11-14T09:00:00.000Z' });
    c = { current: v2, versions: [refOf(v1), refOf(v2)], timelines: [v1], sourceSeconds: seconds };
  } else if (slug === 'sample-left-same') {
    // the first subtitle line moved 28 frames earlier, then the move undone: v3 is v1 clip for clip
    const v2: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    const line = v2.tracks.find((x) => x.kind === 'captions')!.clips[0];
    line.at = Math.round((line.at - 28 / v1.fps) * 1000) / 1000;
    Object.assign(v2, { version: 'v2', basedOn: 'v1', note: 'moved the first line −28 f', at: '2026-11-14T09:00:00.000Z' });
    const v3: Timeline = { ...(JSON.parse(JSON.stringify(v1)) as Timeline), version: 'v3', basedOn: 'v2', note: 'undo: back to v1', at: '2026-11-14T09:01:00.000Z' };
    c = { current: v3, versions: [refOf(v1), refOf(v2), refOf(v3)], timelines: [v1, v2], sourceSeconds: seconds };
  } else {
    c = { current: v1, versions: [refOf(v1)], sourceSeconds: seconds };
  }
  cuts.set(slug, c);
  return c;
}

/** The sample film's state: the-lighthouse's, with the film and its cut its own. */
export function leftSampleState(slug: string): FilmState | undefined {
  if (!isLeft(slug)) return undefined;
  const c = leftSampleCut(slug)!;
  const cur = c.current;
  return {
    ...lighthouse, film: LEFT_SAMPLES[slug], master: undefined,
    cut: { name: `cut ${cur.version}`, fps: cur.fps, source: { cut: `cut ${cur.version}`, from: [`cut/${cur.version}.json`], date: '2026-11-14', label: `from cut/${cur.version}.json` },
      versions: c.versions, current: cur },
    post: { cuts: [], masters: [], captions: [] },
    feed: { counts: slug === 'sample-left-start' ? {} : { edit: 1 }, asks: [] },
  };
}

/** The record's yes for cut v1 (a card at the edit stage, answered). */
export function leftSampleFeed(slug: string): FeedCard[] | undefined {
  if (!isLeft(slug)) return undefined;
  if (slug === 'sample-left-start') return [];
  return [{
    key: 'YES-cut-v1-480p', id: 'YES-cut-v1-480p', title: 'Is cut v1 the one at 480p?', date: '2026-11-13T21:10:00Z', section: 'Edit', place: 'edit', ids: [], placed: 'card', media: [],
    text: ['The whole cut at 480p, before the 1080p.'],
    ask: { kind: 'yes', options: [{ id: 'yes', label: 'Yes, this is the cut' }, { id: 'no', label: 'No, something needs changing' }], answer: { at: '2026-11-13T21:14:00Z', by: 'card', note: 'Yes, in chat.' } },
  }];
}

/** GET …/full: the upscaled cut of v1 and the FIX-bottle take with its own full-size file; nothing for the first sample. */
export function leftSampleFull(slug: string): unknown {
  if (!isLeft(slug)) return undefined;
  if (slug === 'sample-left-start') return { bases: [], takes: {}, label: 'upscaled' };
  const take = `assets/films/${slug}/blocks/FIX-bottle/takes/FIX-bottle-seedance-take2-480p.mp4`;
  return { bases: [{ version: 'v1', path: `assets/films/${slug}/video/1080/cut-v1-1080.mp4`, frames: 1655, label: 'Higgsfield' }], takes: { [take]: take.replace('-480p.', '-1080p.') }, label: 'Higgsfield' };
}

/** The takes marked to redo in Seedance the sample starts with. */
export function leftMarksSeed(slug: string): SeedanceMark[] | undefined {
  if (slug !== 'sample-left-1080') return undefined;
  const mark = (scene: string, take: string): SeedanceMark => ({ src: `assets/films/${slug}/blocks/${scene}/takes/${scene}-${take}-480p.mp4`, take: `${scene} ${take}`, scene, markedAt: '2026-11-14T08:40:00Z', cut: 'v3', shots: [] });
  return [mark('S2', 'grey-take1'), mark('S3', 'take4')];
}

/** The user's ticks the sample starts with. */
export function leftTicksSeed(slug: string): LeftFile | undefined {
  if (!isLeft(slug)) return undefined;
  if (slug === 'sample-left-start' || slug === 'sample-left-1080') return { ticks: {} };
  return { ticks: { sound: { at: '2026-11-14T08:30:00.000Z', cut: 'v1' } } };
}

/** The masters the sample starts with: a master of v1 with the record of its picture (renders.ts seeds it). */
export function leftMasterSeed(slug: string): { version: string } | undefined {
  return slug === 'sample-left-remaster' || slug === 'sample-left-same' || slug === 'sample-left-posting' || slug === 'sample-left-done' ? { version: 'v1' } : undefined;
}

/** The release file the sample starts with: the board's six platforms, the final the master of v1. */
export function leftReleaseSeed(slug: string): ReleaseFile | undefined {
  if (slug !== 'sample-left-remaster' && slug !== 'sample-left-same' && slug !== 'sample-left-posting' && slug !== 'sample-left-done') return undefined;
  const f = boardRelease();
  const final = { path: 'cut/renders/v1-master.mp4', version: 'v1', namedAt: at('17:02'), name: `${LEFT_SAMPLES[slug].title} - FINAL.mp4`, companions: {} };
  if (slug === 'sample-left-remaster' || slug === 'sample-left-same') return { ...f, final, platforms: f.platforms.map((p) => ({ ...p, send: {} })) };
  if (slug === 'sample-left-posting') return { ...f, final };
  return { ...f, final, platforms: f.platforms.map((p, k) => ({ ...p, send: { posted: p.send.posted ?? { at: at(`18:${String(10 + k * 5).padStart(2, '0')}`) } } })) };
}
