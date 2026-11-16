// Sample-data mode only (MOCK=boards; refused in production): Alma's part of the release, played by the tests
// (Release, stage 3 of 3). Her go cards live in memory as review/cards.json would hold them, read through the
// feed's own parser; an answer to one is recorded on it and goes to the mock thread as the harness would send it;
// the test hook (POST /api/films/[film]/release/alma) writes the sending record the way the recipe tells her to.
// Each write pokes the sample film's state stream, as the folder watcher does for a real film. Nothing on disk.
import { isMock, mockPoke, mockPost, mockState } from '@/fixtures/mock';
import { releaseSeed, SAMPLE_MASTERS } from '@/fixtures/release';
import { cardsOf } from '@/server/films/read/feed';
import type { FeedCard } from '@/server/types';
import { validateRelease, type ReleaseFile } from '@/components/release/file';
import { appName, platformOf } from '@/components/release/derive';
import { goCardJson, type FinalInfo } from '@/components/release/sendflow';
import { mockReleases } from './file';

/** On in sample-data mode outside production only. */
export const almaHookOn = (): boolean => isMock() && process.env.NODE_ENV !== 'production';

type Card = Record<string, unknown>;
const g = globalThis as unknown as { __hhMockReleaseCards?: Map<string, Card[]> };
const store = (g.__hhMockReleaseCards ??= new Map());

const fileOf = (slug: string): ReleaseFile | undefined => (mockReleases.has(slug) ? mockReleases.get(slug) ?? undefined : releaseSeed(slug));

/** The final of a sample film with its size and length (the sample masters' numbers). */
export function sampleFinalInfo(slug: string, file: ReleaseFile, pid?: string): FinalInfo {
  const m = SAMPLE_MASTERS.find((x) => x.path === file.final!.path);
  const st = mockState(slug);
  // the file its ask kept (ASKS 56): the smaller file has the sample's 60 MB
  const kept = pid ? file.platforms.find((p) => p.id === pid)?.send.asked?.file : undefined;
  const path = kept ?? file.final!.path;
  return { path, abs: st ? `${st.film.folder}/${path}` : undefined, name: file.final!.name, bytes: kept && kept !== file.final!.path ? 60_000_000 : m?.bytes, seconds: m?.seconds };
}

function seedCards(slug: string): Card[] {
  // the go moment starts with the card Alma wrote at 19:01
  if (slug !== 'sample-release-go') return [];
  const f = releaseSeed(slug)!;
  return [goCardJson(f, 'tiktok', sampleFinalInfo(slug, f), new Date(2026, 10, 14, 19, 1), 1, 'The credit line now ends "book 6". It reads fine.')];
}
const cardsJson = (slug: string): Card[] => { if (!store.has(slug)) store.set(slug, seedCards(slug)); return store.get(slug)!; };
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

export type AlmaStep = 'card' | 'go' | 'sending' | 'unsure' | 'handed' | 'posted' | 'failed' | 'dropped' | 'scheduled' | 'unscheduled' | 'stopped' | 'cancelled';
export const ALMA_STEPS: AlmaStep[] = ['card', 'go', 'sending', 'unsure', 'handed', 'posted', 'failed', 'dropped', 'scheduled', 'unscheduled', 'stopped', 'cancelled'];

/** One step of Alma's part on a platform, written into the sample's file (and cards) as she would. */
export function almaStep(slug: string, pid: string, step: AlmaStep, now: Date, opts: { link?: string; note?: string } = {}): { ok: true; file: ReleaseFile } | { ok: false; error: string } {
  const cur = fileOf(slug);
  if (!cur) return { ok: false, error: `No release for "${slug}".` };
  const f = JSON.parse(JSON.stringify(cur)) as ReleaseFile;
  const p = platformOf(f, pid);
  if (!p) return { ok: false, error: `No platform "${pid}".` };
  const s = p.send;
  const at = now.toISOString();
  const cards = cardsJson(slug);
  const open = cards.filter((c) => c.for === pid && !c.answer);
  const close = (why: string) => { for (const c of open) c.answer = { note: why, at }; };
  switch (step) {
    case 'card': {
      if (!s.asked) return { ok: false, error: `${p.name} has no ask.` };
      close('replaced by a newer card');
      cards.push(goCardJson(f, pid, sampleFinalInfo(slug, f, pid), now, cards.filter((c) => c.for === pid).length + 1, opts.note));
      break;
    }
    case 'go': if (!s.asked) return { ok: false, error: 'No ask.' }; s.go ??= { at }; break;
    case 'scheduled': if (!s.go || !s.asked || s.asked.when === 'now') return { ok: false, error: 'No go for a time.' }; s.scheduled = { for: s.asked.when, bufferPostId: 'mock-post-1' }; break;
    case 'sending':
      if (!s.go && !s.scheduled) return { ok: false, error: 'No go.' };
      s.sending = { since: at, steps: [{ label: 'Buffer has the file', at }, { label: `${appName(p)} is processing` }, { label: 'Posted' }], inBuffer: at };
      break;
    // a sending record that says neither whether Buffer holds it nor whether the platform has it
    case 'unsure': if (!s.sending) return { ok: false, error: 'Not sending.' }; delete s.sending.inBuffer; delete s.sending.platformHas; break;
    case 'handed': if (!s.sending) return { ok: false, error: 'Not sending.' }; s.sending.platformHas = at; delete s.sending.inBuffer; break;
    case 'posted':
      s.posted = { at, link: opts.link ?? `https://www.tiktok.com/@sample_studio/video/${Date.parse(at)}` };
      if (s.sending?.steps) s.sending.steps = s.sending.steps.map((x) => ({ ...x, at: x.at ?? at }));
      delete s.requested;
      close('posted');
      break;
    case 'failed':
      s.failed = { at, reason: `${appName(p)} answered with an unknown error.`, checked: { at, text: `Alma checked ${p.account} on ${appName(p)} at ${at.slice(11, 16)}. No new post. The text and file are unchanged.` },
        fix: `Last time this happened, reconnecting ${appName(p)} in Buffer fixed it.`, fixAction: { label: `Reconnect ${appName(p)} in Buffer`, href: 'https://publish.buffer.com/channels' } };
      delete s.requested;
      close('did not go out');
      break;
    case 'dropped': if (!s.failed) return { ok: false, error: 'Nothing failed.' }; s.failed.cleared = at; break;
    case 'unscheduled': delete s.scheduled; delete s.go; delete s.asked; delete s.requested; close('unscheduled'); break;
    case 'stopped': delete s.sending; delete s.go; delete s.asked; delete s.requested; close('stopped before it went out'); break;
    case 'cancelled': close('the ask was cancelled'); break;
  }
  const v = validateRelease(f);
  if (!v.file) return { ok: false, error: v.problems.join(' ') };
  mockReleases.set(slug, f);
  mockPoke(slug);
  return { ok: true, file: f };
}
