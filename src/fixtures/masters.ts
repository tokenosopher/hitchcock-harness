// MOCK=boards: sample films for the film's master, so the Finish page's player, the board's
// link to it, the Edit page's 480p · 1080p switch and the release wording can be seen and tested without a real film.
//   the-lighthouse            its master is of v1, the version the Edit page shows
//   sample-master-older       its master is of v1; the cut is now v2 with a picture clip moved; a copy in final cuts,
//                             nothing released; a card at Finish asks for the yes
//   sample-master-unchanged   its master is of v1; v2 only renamed a track and changed a level (the picture is the same)
//   sample-no-master          no master yet
// and three 16:9 films, their pictures and master the 1920x1080 test clip in src/fixtures/media/wide/:
//   sample-wide               a 16:9 cut (1920x1080) with its pictures, and a master
//   sample-wide-new           a 16:9 brief, a cut still 1080x1920 with no picture yet: it takes 1920x1080 at its next write
//   sample-wide-portrait      a 16:9 brief, a 1080x1920 cut with portrait pictures: the Edit page asks to switch
// The master's file is one video for every sample (MOCK_MASTER_FILE, made with ffmpeg for the browser tests); without
// it the player shows no picture. Server-only; nothing is written.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Resolved } from '@/server/media';
import type { CutInfo, FeedCard, FilmMaster, FilmRef, FilmState, Timeline } from '@/server/types';
import boardFilm from './boards/the-lighthouse.json';
import cutFilm from './boards/cut-the-lighthouse.json';
import { masterNo } from '@/components/edit/masters';
import { mockNewestMaster } from './renders';
import { leftSampleFull } from './left';

const lighthouse = boardFilm as unknown as FilmState;
const base = cutFilm.current as unknown as Timeline;
const repo = lighthouse.film.repo;
const folderOf = (slug: string) => `${repo}/assets/films/${slug}`;
const masterPath = 'video/1080/cut-v1-1080.mp4';
const WIDE = 'sample-wide';

const askCard = (slug: string): FeedCard => ({
  key: 'YES-master-v1-1080', id: 'YES-master-v1-1080', title: 'Is this 1080p version the one? (cut v1 at 1080p)',
  date: '2026-11-13T07:46:34Z', section: 'Finish', place: 'finish', ids: [], placed: 'card', media: [],
  text: [`Your yes makes ${masterPath} the master that the effects, the music and the mix go on (${slug}).`],
  ask: { kind: 'yes', prediction: 'yes', options: [{ id: 'yes', label: 'Yes, this is the 1080p master' }, { id: 'no', label: 'No, something needs fixing' }] },
});
const videoCard: FeedCard = {
  key: 'MASTER-v1-1080', id: 'MASTER-v1-1080', title: 'Cut v1 at 1080p (dialogue only)', sub: '1:09 · 1080x1920',
  text: ['The approved cut v1, frame for frame. The sound is the Dialogue tracks only: the effects and the music go on at the sound stage.'],
  date: '2026-11-13T07:46:34Z', section: 'Finish', place: 'finish', ids: [], placed: 'card',
  media: [{ kind: 'video', path: masterPath, label: 'cut v1 at 1080p' }],
};
const master = (asks: boolean): FilmMaster => ({
  path: masterPath, version: 'v1', date: '2026-11-13T07:45:48.000Z', bytes: 59_640_112, from: 'card', sound: 'dialogue only',
  card: { key: videoCard.key, id: videoCard.id, title: videoCard.title },
  ask: asks ? { key: 'YES-master-v1-1080', id: 'YES-master-v1-1080', title: 'Is this 1080p version the one? (cut v1 at 1080p)' } : undefined,
});

interface Sample { ref: FilmRef; master?: FilmMaster; asks: boolean; v2?: (t: Timeline) => Timeline; frame?: { width: number; height: number }; noPicture?: boolean }
const copyOf = (t: Timeline): Timeline => JSON.parse(JSON.stringify(t)) as Timeline;
const SAMPLES: Record<string, Sample> = {
  'sample-master-older': {
    ref: { slug: 'sample-master-older', title: 'Sample · master of an older cut', folder: folderOf('sample-master-older'), repo, flow: 'video-driven', status: 'in-progress', stage: 10, aspect: '9:16',
      copies: [{ date: '2026-11-13', folder: 'assets/final-cuts/2026-11-13 Sample · master of an older cut' }] },
    master: master(true), asks: true,
    // the second picture clip starts a second later (still full size: the same material moved), and the eighth plays
    // 2.3 s of its take the base never used (480p only for that stretch)
    v2: (t) => { const n = copyOf(t); const v1 = n.tracks.find((x) => x.id === 'V1')!; v1.clips[1].at += 1; v1.clips[7].in = 18; v1.clips[7].out = 23.833; return { ...n, version: 'v2', basedOn: 'v1', note: 'S1 · FIX-bottle moved 1 s later', at: '2026-11-13T09:00:00.000Z' }; },
  },
  'sample-master-unchanged': {
    ref: { slug: 'sample-master-unchanged', title: 'Sample · picture unchanged since the master', folder: folderOf('sample-master-unchanged'), repo, flow: 'video-driven', status: 'in-progress', stage: 10, aspect: '9:16' },
    master: master(false), asks: false,
    // a track renamed and a level changed: the same picture, frame for frame
    v2: (t) => { const n = copyOf(t); n.tracks.find((x) => x.id === 'A2')!.name = 'Score'; n.tracks.find((x) => x.id === 'A1')!.clips[0].gain = -3; return { ...n, version: 'v2', basedOn: 'v1', note: 'A2 renamed Score; first line −3 dB', at: '2026-11-13T09:00:00.000Z' }; },
  },
  'sample-no-master': {
    ref: { slug: 'sample-no-master', title: 'Sample · no master yet', folder: folderOf('sample-no-master'), repo, flow: 'video-driven', status: 'in-progress', stage: 9, aspect: '9:16' },
    asks: false,
  },
  [WIDE]: {
    ref: { slug: WIDE, title: 'Sample · a 16:9 film', folder: folderOf(WIDE), repo, flow: 'video-driven', status: 'in-progress', stage: 10, aspect: '16:9' },
    master: master(false), asks: false, frame: { width: 1920, height: 1080 },
  },
  'sample-wide-new': {
    ref: { slug: 'sample-wide-new', title: 'Sample · 16:9 brief, cut not yet', folder: folderOf('sample-wide-new'), repo, flow: 'video-driven', status: 'in-progress', stage: 9, aspect: '16:9' },
    asks: false, noPicture: true,
  },
  'sample-wide-portrait': {
    ref: { slug: 'sample-wide-portrait', title: 'Sample · 16:9 brief, 9:16 cut', folder: folderOf('sample-wide-portrait'), repo, flow: 'video-driven', status: 'in-progress', stage: 9, aspect: '16:9' },
    asks: false,
  },
};
/** The 16:9 samples: their media is the 1920x1080 test clip. */
export const isWideSample = (slug: string): boolean => SAMPLES[slug]?.ref.aspect === '16:9';
const WIDE_CLIP = () => path.join(process.cwd(), 'src/fixtures/media/wide/wide-1080.mp4');

export const sampleFilms = (): FilmRef[] => Object.values(SAMPLES).map((s) => s.ref);

/** The sample film's state, or the-lighthouse's with its master added. */
export function sampleState(slug: string, filmState: FilmState | undefined): FilmState | undefined {
  if (slug === 'the-lighthouse' && filmState) {
    // a master of v1 made again from the Edit page (renders.ts) is newer than the card's file: it is the film's master
    // then, as readMaster reads a real film (the newest the record vouches for). The seeded first master of v1 is
    // treated as older than the card's file here.
    const again = mockNewestMaster(slug, 'v1');
    const n = again?.path ? masterNo(again.path)?.n ?? 1 : 1;
    const m: FilmMaster = again?.path && n > 1
      ? { path: again.path, version: 'v1', date: again.finishedAt, bytes: 200_000_000, from: 'render', sound: 'the mix of the tracks of v1' }
      : master(false);
    return { ...filmState, master: m, post: { cuts: [], masters: [masterPath], captions: [] } };
  }
  const s = SAMPLES[slug];
  if (!s) return undefined;
  const asks = s.asks ? [askCard(slug)] : [];
  const c = sampleCut(slug)!;
  const cur = c.current as Timeline;
  return {
    ...lighthouse, film: s.ref, master: s.master,
    cut: { name: `cut ${cur.version}`, fps: cur.fps, source: { cut: `cut ${cur.version}`, from: [`cut/${cur.version}.json`], date: '2026-11-13', label: `from cut/${cur.version}.json` },
      versions: c.versions as CutInfo['versions'], current: cur },
    post: s.master ? { cuts: [], masters: [s.master.path], captions: [] } : undefined,
    feed: s.master ? { counts: { finish: asks.length + 1 }, asks } : undefined,
  };
}

/** The feed cards of a sample film (GET …/feed). */
export function sampleFeed(slug: string): FeedCard[] | undefined {
  const s = SAMPLES[slug];
  if (!s) return undefined;
  return s.master ? [...(s.asks ? [askCard(slug)] : []), videoCard] : [];
}

/** The sample film's cut fixture: v1 as the-lighthouse's, and v2 after it where the sample has one. */
export function sampleCut(slug: string): { current: unknown; versions: unknown[]; timelines?: unknown[]; sourceSeconds?: Record<string, number> } | undefined {
  const s = SAMPLES[slug];
  if (!s) return undefined;
  const own = (t: Timeline): Timeline => (isWideSample(slug) ? JSON.parse(JSON.stringify(t).split('assets/films/the-lighthouse/').join(`assets/films/${slug}/`)) as Timeline : t);
  const v1 = { ...own(copyOf(base)), renders: undefined, ...(s.frame ?? {}) } as Timeline;
  if (s.noPicture) v1.tracks = v1.tracks.map((x) => (x.kind === 'video' ? { ...x, clips: [] } : x));
  const ref = (t: Timeline) => ({ version: t.version, at: t.at, note: t.note, by: t.by ?? 'user', basedOn: t.basedOn });
  if (!s.v2) return { current: v1, versions: [ref(v1)], sourceSeconds: cutFilm.sourceSeconds };
  const v2 = s.v2(v1);
  return { current: v2, versions: [ref(v1), ref(v2)], timelines: [v1], sourceSeconds: cutFilm.sourceSeconds };
}

/** The Finish page's facts for a sample film (GET …/finish): the master as ffprobe would read the sample file. */
export function sampleFinish(slug: string, st: FilmState | undefined): unknown {
  if (!SAMPLES[slug]) return undefined;
  const m = st?.master;
  return {
    film: slug, fps: 24, cut: { name: 'cut v1', version: slug === 'sample-no-master' ? 'v1' : 'v2' },
    upscale: { state: m ? 'joined' : 'none', segments: [], checks: [], notes: [] },
    master: m ? { path: m.path, bytes: m.bytes, date: m.date, frames: 1655, width: SAMPLES[slug].frame?.width ?? 1080, height: SAMPLES[slug].frame?.height ?? 1920, fps: 24, seconds: 69 } : undefined,
    variants: [], music: { stems: [] }, captions: { srts: [], captioned: [], flags: [] }, checks: [], warnings: [],
  };
}

/** /api/media for the sample master: the video made for the tests, under the master's own path. */
export async function mockMedia(p: string | null): Promise<Resolved | undefined> {
  // a sample render (the Renders tab, 14 Nov): every file in cut/renders/ plays the small test video kept beside the
  // fixtures (a sound file too: the player shows no picture for it), or MOCK_RENDER_FILE
  const render = !!p && /^assets\/films\/[^/]+\/cut\/renders\/[^/]+\.(mp4|wav)$/.test(p);
  // MOCK_MEDIA_DIR (16 Nov, the playback tests on a slow link): the sample film's own files, takes and sounds, from a
  // folder of made-up media at the same paths under it (`<dir>/blocks/S3/takes/…`); without it they do not exist
  const own = process.env.MOCK_MEDIA_DIR && p && !render ? /^assets\/films\/the-lighthouse\/((?:blocks|audio)\/[^\0]+)$/.exec(p)?.[1]
    // …and the sample of a take cut into its shots (trim.ts): <dir>/generations/…, <dir>/title-card.mp4
    ?? /^assets\/films\/sample-trim-shots\/((?:generations\/|audio\/|title-card\.mp4$)[^\0]*)$/.exec(p)?.[1] : undefined;
  // the sample master (the base of the 1080p view) plays the same small test video unless MOCK_MASTER_FILE names a
  // heavier one (MOCK_TAKE_FILE for a take's full-size file): a 1080p view whose picture cannot be shown drops to 480p,
  // so without a file here the sample's 1080p view and its Upscale tab never showed
  const sample = path.join(process.cwd(), 'src/fixtures/media/sample-render.mp4');
  // so does a sample take's own full-size file (the FIX-bottle take's 1080p, on every sample film that lists it)
  const take1080 = p === SAMPLE_TAKE_1080 || (!!p && /^assets\/films\/sample-[a-z0-9-]+\/blocks\/[^/]+\/takes\/[^/]+-1080p\.mp4$/.test(p));
  const file = take1080 ? process.env.MOCK_TAKE_FILE ?? sample : p?.endsWith(`/${masterPath}`) ? process.env.MOCK_MASTER_FILE ?? sample
    : render ? process.env.MOCK_RENDER_FILE ?? sample
    : own && !own.split('/').includes('..') ? path.join(process.env.MOCK_MEDIA_DIR!, own) : undefined;
  // the 16:9 samples: every picture of theirs, the master too, is the 1920x1080 test clip
  const wideSlug = p ? /^assets\/films\/(sample-wide[a-z-]*)\/(?:blocks|generations|video)\/[^\0]+\.mp4$/.exec(p)?.[1] : undefined;
  if (wideSlug && SAMPLES[wideSlug]?.frame) {
    const real = WIDE_CLIP();
    try { return { abs: p!, real, stat: await fs.stat(real), type: 'video/mp4' }; } catch { return undefined; }
  }
  if (!file || !p) return undefined;
  try {
    const stat = await fs.stat(file);
    return { abs: p, real: file, stat, type: /\.wav$/i.test(file) ? 'audio/wav' : 'video/mp4' };
  } catch {
    return undefined;
  }
}

/** GET …/full for the sample films: the base of v1 (the test video, as many frames as the cut) and one take with its
 *  own full-size file (the FIX-bottle take, a second test video). */
export const SAMPLE_TAKE_1080 = 'assets/films/the-lighthouse/blocks/FIX-bottle/takes/FIX-bottle-seedance-take2-1080p.mp4';
export function sampleFull(slug: string): unknown {
  const left = leftSampleFull(slug);
  if (left) return left;
  if (!(slug in SAMPLES) && slug !== 'the-lighthouse') return { bases: [], takes: {}, label: 'upscaled' };
  if (slug === 'sample-no-master') return { bases: [], takes: {}, label: 'upscaled' };
  return {
    bases: [{ version: 'v1', path: `assets/films/${slug}/${masterPath}`, frames: 1655, label: 'Higgsfield' }],
    takes: { [SAMPLE_TAKE_1080.replace('-1080p.', '-480p.')]: SAMPLE_TAKE_1080 },
    label: 'Higgsfield',
  };
}
