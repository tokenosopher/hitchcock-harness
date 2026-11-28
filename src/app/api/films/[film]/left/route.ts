// What's next (the Edit page's tab, 14 Nov 2026, named "What is left" until the user's word that day; the shape and
// the rules: src/components/edit/left.ts).
//   GET  → LeftAnswer: the user's ticks (<film>/harness/left.json), the record's yes for a cut (review/cards.json), the
//          newest master of any version (cut/renders/) and the release file in brief (social/release.json). Read once by
//          the page and again when the film's watcher reports a change; nothing here runs on a timer. With them, what
//          the render reads of the newest master's version, the final's and any `?v=` (at most two; the page asks for
//          the record's master), so the page can tell whether that render's cut is the cut now (ASKS 49, sameCut.ts).
//   POST {tick, cut} | {untick} → one tick set on the cut version shown, or taken back; answers the ticks file.
// In sample-data mode everything is read from the samples and the ticks are kept in memory; nothing is written.
import { connection } from 'next/server';
import { isMock, mockCut, mockPoke } from '@/fixtures/mock';
import { sampleFeed } from '@/fixtures/masters';
import { leftReleaseSeed, leftSampleFeed, leftTicksSeed } from '@/fixtures/left';
import { releaseSeed } from '@/fixtures/release';
import { mockRenderFiles } from '@/fixtures/renders';
import { approvalOf, LEFT_NOTE, newestMasterFileOf, parseTickOp, releaseBrief, applyTick, type LeftAnswer } from '@/components/edit/left';
import { renderPart, type RenderPart } from '@/components/edit/sameCut';
import type { Timeline } from '@/server/types';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { mockLeft, readLeft, writeTick } from '@/server/edit/left';
import { isVersion, listVersions, versionPart } from '@/server/edit/timeline';
import { renderFiles } from '@/server/edit/render-files';
import { readFeed } from '@/server/films/read/feed';
import { Warnings } from '@/server/films/util';
import { mockReleases, readReleaseFile } from '@/server/release/file';

type Ctx = { params: Promise<{ film: string }> };

const mockTicks = (slug: string) => mockLeft.get(slug) ?? leftTicksSeed(slug) ?? { ticks: {} };

/** The versions whose render part the page needs: the newest master's, the final's, and at most two it asked for. */
const wanted = (req: Request, ...named: (string | undefined)[]): string[] =>
  [...new Set([...named, ...new URL(req.url).searchParams.getAll('v').slice(0, 2)])].filter(isVersion);
const cutsOf = (parts: [string, RenderPart | undefined][]): LeftAnswer['cuts'] => {
  const ok = parts.filter((x): x is [string, RenderPart] => !!x[1]);
  return ok.length ? Object.fromEntries(ok) : undefined;
};

function mockGet(slug: string, req: Request): LeftAnswer {
  const cut = mockCut(slug);
  const versions = ((cut?.versions ?? []) as { version: string }[]).map((v) => v.version);
  const cards = leftSampleFeed(slug) ?? sampleFeed(slug) ?? [];
  const file = mockReleases.has(slug) ? mockReleases.get(slug) ?? undefined : releaseSeed(slug) ?? leftReleaseSeed(slug);
  const approved = approvalOf(cards, versions);
  const masterFile = newestMasterFileOf(mockRenderFiles(slug));
  const newestMaster = masterFile?.version;
  const release = releaseBrief(file);
  // the sample's versions are in memory: its current one and the older ones it keeps
  const tls = [cut?.current, ...(cut?.timelines ?? [])] as (Timeline | undefined)[];
  const cuts = cutsOf(wanted(req, newestMaster, file?.final?.version).map((v) => { const t = tls.find((x) => x?.version === v); return [v, t ? renderPart(t) : undefined]; }));
  return { note: LEFT_NOTE, ticks: mockTicks(slug).ticks, ...(approved ? { approved } : {}), ...(newestMaster ? { newestMaster, masterFile } : {}), ...(release ? { release } : {}), ...(cuts ? { cuts } : {}) };
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json(mockGet(slug, req), { headers: NO_STORE });
  try {
    const film = await routeFilm(slug);
    const [left, versions, feed, rel, files] = await Promise.all([
      readLeft(film), listVersions(film), readFeed({ dir: film.dir, warn: new Warnings() }, slug).catch(() => ({ cards: [] })),
      readReleaseFile(film), renderFiles(film).catch(() => []),
    ]);
    const approved = approvalOf(feed.cards, versions);
    const masterFile = newestMasterFileOf(files);
    const newestMaster = masterFile?.version;
    const release = releaseBrief(rel.file);
    // only the versions compared with the cut now, each read once and kept by its file's size and time (timeline.ts)
    const cuts = cutsOf(await Promise.all(wanted(req, newestMaster, rel.file?.final?.version).map(async (v) => [v, await versionPart(film, v)] as [string, RenderPart | undefined])));
    return Response.json({ note: left.note ?? LEFT_NOTE, ticks: left.ticks, ...(approved ? { approved } : {}), ...(newestMaster ? { newestMaster, masterFile } : {}), ...(release ? { release } : {}), ...(cuts ? { cuts } : {}) } satisfies LeftAnswer, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'The tick was not JSON' }, { status: 400, headers: NO_STORE }); }
  const op = parseTickOp(body);
  if (!op) return Response.json({ error: 'A tick names a step (approved, sound, subs or posted) and the cut version it is made on' }, { status: 400, headers: NO_STORE });
  const now = new Date().toISOString();
  if (isMock()) {
    const next = applyTick(mockTicks(slug), op, now);
    mockLeft.set(slug, next);
    // the "Done" on publishing is in the sample's state (fixtures/mock.ts): sent again, as the watcher does for a film
    mockPoke(slug);
    return Response.json(next, { headers: NO_STORE });
  }
  try {
    return Response.json(await writeTick(await routeFilm(slug), op, now), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
