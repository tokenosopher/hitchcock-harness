// GET → the film's review record as feed cards (src/server/films/read/feed.ts). Read-only.
//   ?place=sound,finish   the cards placed on those nodes of the flow board
//   ?id=S3                the cards about that scene, character, location or prop, wherever they are placed
//   ?shared=1             with place: leave out cards about exactly one scene or character (shown on its own page)
//   (nothing)             every card
import { connection } from 'next/server';
import { FEED_PLACES, type FeedPlace } from '@/server/types';
import { getFilmState } from '@/server/films/state';
import { feedFor, readFeed } from '@/server/films/read/feed';
import { isMock } from '@/fixtures/mock';
import { sampleFeed } from '@/fixtures/masters';
import { leftSampleFeed } from '@/fixtures/left';
import { elementsSampleFeed } from '@/fixtures/elements';
import { resetSoundSample, soundSampleFeed } from '@/fixtures/soundpick';
import { resetSoundCards, soundCardsFeed } from '@/fixtures/soundcards';
import { Warnings } from '@/server/films/util';
import { mockReleaseCards } from '@/server/release/mockAlma';
import { storySampleFeed } from '@/fixtures/story';

export async function GET(req: Request, { params }: RouteContext<'/api/films/[film]/feed'>) {
  await connection();
  const { film } = await params;
  // MOCK=boards: the sample films' cards at Finish (src/fixtures/masters.ts)
  // MOCK=boards: ?reset=1 puts a sound sample back as the fixtures have it (its picks, answers and reasons)
  if (isMock() && new URL(req.url).searchParams.get('reset') === '1') { resetSoundSample(film); if (film === 'sample-sound-cards') resetSoundCards(); }
  const asked = (new URL(req.url).searchParams.get('place') ?? '').split(',').filter(Boolean);
  const sample = isMock() ? (sampleFeed(film) ?? leftSampleFeed(film) ?? soundSampleFeed(film) ?? soundCardsFeed(film) ?? elementsSampleFeed(film) ?? storySampleFeed(film))?.filter((c) => !asked.length || asked.includes(c.place)) : undefined;
  if (sample) {
    return Response.json({ cards: sample, total: sample.length, warnings: [] }, { headers: { 'cache-control': 'no-store' } });
  }
  // MOCK=boards: a release sample's cards (Alma's go cards, played by the test hook), by place and id like the real ones
  const rel = isMock() ? mockReleaseCards(film) : undefined;
  if (rel) {
    const id = new URL(req.url).searchParams.get('id');
    const cards = rel.filter((c) => (!asked.length || asked.includes(c.place)) && (!id || c.ids.includes(id)));
    return Response.json({ cards, total: rel.length, warnings: [] }, { headers: { 'cache-control': 'no-store' } });
  }
  const state = await getFilmState(film);
  if (!state) return Response.json({ error: `No film "${film}" in the registry (or the studio folder is missing)` }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const feed = await readFeed({ dir: state.film.folder, warn: new Warnings() }, state.film.slug);
  const places = (q.get('place') ?? '').split(',').filter((p): p is FeedPlace => FEED_PLACES.includes(p as FeedPlace));
  const id = q.get('id') ?? undefined;
  const cards = places.length || id ? feedFor(feed, { places, id, shared: q.get('shared') === '1' }) : feed.cards;
  return Response.json({ cards, total: feed.cards.length, warnings: feed.warnings }, { headers: { 'cache-control': 'no-store' } });
}
