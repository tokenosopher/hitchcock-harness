// Sample-data mode only (MOCK=boards; refused in production): Alma's part of the release, played by the tests
// (Release, stage 3 of 3). Every post is made by hand in this copy, so her part is recording the post the user
// made: the test hook (POST /api/films/[film]/release/alma) writes `send.posted` the way the recipe tells her to.
// Her cards live in memory as review/cards.json would hold them, read through the feed's own parser; an answer to
// one is recorded on it and goes to the mock thread as the harness would send it.
// Each write pokes the sample film's state stream, as the folder watcher does for a real film. Nothing on disk.
import { isMock, mockPoke, mockPost } from '@/fixtures/mock';
import { releaseSeed } from '@/fixtures/release';
import { cardsOf } from '@/server/films/read/feed';
import type { FeedCard } from '@/server/types';
import { validateRelease, type ReleaseFile } from '@/components/release/file';
import { platformOf } from '@/components/release/derive';
import { mockReleases } from './file';

/** On in sample-data mode outside production only. */
export const almaHookOn = (): boolean => isMock() && process.env.NODE_ENV !== 'production';

type Card = Record<string, unknown>;
const g = globalThis as unknown as { __hhMockReleaseCards?: Map<string, Card[]> };
const store = (g.__hhMockReleaseCards ??= new Map());

const fileOf = (slug: string): ReleaseFile | undefined => (mockReleases.has(slug) ? mockReleases.get(slug) ?? undefined : releaseSeed(slug));

const cardsJson = (slug: string): Card[] => { if (!store.has(slug)) store.set(slug, []); return store.get(slug)!; };
export const resetMockCards = (slug: string): void => { store.delete(slug); };

/** The sample film's cards as the feed reads them, or undefined for a film that is not a release sample. */
export function mockReleaseCards(slug: string): FeedCard[] | undefined {
  if (!releaseSeed(slug)) return undefined;
  return cardsOf({ sections: [{ heading: 'Release', cards: [...cardsJson(slug)].reverse() }] });
}

/** An answer to one of the sample's cards: recorded on the card, and the harness's line to Alma in the mock thread. */
export function mockAnswer(slug: string, body: { card?: string; option?: string; from?: string }): Response | undefined {
  const cards = mockReleaseCards(slug);
  if (!cards) return undefined;
  const card = cards.find((c) => c.key === body.card);
  if (!card) return Response.json({ error: `no card "${body.card}" in review/cards.json` }, { status: 404 });
  if (!card.ask || card.ask.answer) return Response.json({ error: `the card "${card.title}" is already answered` }, { status: 409 });
  const no = body.option === 'no' && !!card.ask.noLabel;
  const raw = cardsJson(slug).find((c) => c.id === card.id)!;
  raw.answer = { option: no ? 'no' : undefined, at: new Date().toISOString() };
  mockPost(slug, `<harness-action kind="answer" ask="${card.ask.kind}" card="${card.id}"${no ? ' option="no"' : ''}/> The user pressed “${no ? card.ask.noLabel : card.ask.yesLabel ?? 'Go'}” on the card “${card.title}”, on ${body.from ?? 'Hitchcock Harness'}.`);
  mockPoke(slug);
  return Response.json({ ok: true, dryRun: false, film: slug, card: card.key, kind: card.ask.kind, option: no ? 'no' : undefined, writes: [], message: '', notified: true });
}

export type AlmaStep = 'posted';
export const ALMA_STEPS: AlmaStep[] = ['posted'];

/** One step of Alma's part on a platform, written into the sample's file as she would: the post the user made by
 *  hand, with its link. */
export function almaStep(slug: string, pid: string, step: AlmaStep, now: Date, opts: { link?: string; note?: string } = {}): { ok: true; file: ReleaseFile } | { ok: false; error: string } {
  const cur = fileOf(slug);
  if (!cur) return { ok: false, error: `No release for "${slug}".` };
  const f = JSON.parse(JSON.stringify(cur)) as ReleaseFile;
  const p = platformOf(f, pid);
  if (!p) return { ok: false, error: `No platform "${pid}".` };
  const at = now.toISOString();
  if (step === 'posted') p.send.posted = { at: p.send.posted?.at ?? at, link: opts.link ?? `https://www.tiktok.com/@sample_studio/video/${Date.parse(at)}` };
  const v = validateRelease(f);
  if (!v.file) return { ok: false, error: v.problems.join(' ') };
  mockReleases.set(slug, f);
  mockPoke(slug);
  return { ok: true, file: f };
}
