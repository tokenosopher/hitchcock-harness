// The working cut (14 Nov 2026, stage 1 of "saving apart from history"; src/server/edit/working.ts):
//   GET  → { film, working: WorkingCut, history: HistorySummary } (made the first time from the newest readable
//          version and the version notes; 404 code "no-cut" for a film with no readable version)
//   POST { rev, words, by?: 'user'|'alma', tracks, markers?, fps?, width?, height? } → 201 { film, working, history }:
//          one step, no version written; 200 with `same: true` when the content is the pointer's already.
//          409 code "stale" (with the current working and history) · 422 { error, problems }: the cut does not validate.
// Under MOCK=boards everything is kept in memory (`mock: true`); nothing is written.
//   DELETE (MOCK=boards only, the browser tests' fresh page) → { film, forgot }: the sample film's working cut, history
//          and saved versions forgotten, so the next use starts again from the fixture. 403 on a real film.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { NO_STORE } from '@/server/edit/http';
import { ensureWorking, forgetMock, step, WorkingError, type CutStore } from '@/server/edit/working';
import { post, refusal, revOf, storeFor, type Ctx } from '@/server/edit/working-http';
import type { Timeline } from '@/server/types';

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  let s: CutStore | undefined;
  try {
    const slug = (await ctx.params).film;
    s = await storeFor(slug);
    const a = await ensureWorking(s);
    if (!a) throw new WorkingError('no-cut', 'this film has no readable cut version yet', 404);
    return Response.json({ film: slug, ...(isMock() ? { mock: true } : {}), ...a }, { headers: NO_STORE });
  } catch (e) {
    return refusal(e, s);
  }
}

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => {
    if (!Array.isArray(b.tracks)) throw new WorkingError('bad-request', 'tracks must be a list', 400);
    if (b.markers !== undefined && !Array.isArray(b.markers)) throw new WorkingError('bad-request', 'markers must be a list', 400);
    const a = await step(s, {
      rev: revOf(b),
      words: typeof b.words === 'string' ? b.words.slice(0, 300) : '',
      by: b.by === 'alma' ? 'alma' : 'user',
      tracks: b.tracks as Timeline['tracks'],
      markers: b.markers as Timeline['markers'] | undefined,
      fps: typeof b.fps === 'number' ? (b.fps as Timeline['fps']) : undefined,
      width: typeof b.width === 'number' ? b.width : undefined,
      height: typeof b.height === 'number' ? b.height : undefined,
    });
    return { body: a, status: a.same ? 200 : 201 };
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (!isMock()) return Response.json({ error: 'only under MOCK=boards: a real film\'s history is never forgotten' }, { status: 403, headers: NO_STORE });
  return Response.json({ film: slug, mock: true, forgot: forgetMock(slug) }, { headers: NO_STORE });
}
