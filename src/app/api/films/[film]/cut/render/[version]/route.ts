// GET → the version's render states: {proxy: {state, percent, path, log, seconds, error}, master: {…}, variants?: […]}.
// state: none | queued | running (percent from ffmpeg's out_time) | done | failed. Poll it while a render runs.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockRenderStates } from '@/fixtures/renders';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { renderStates } from '@/server/edit/render';
import { CutError, isVersion } from '@/server/edit/timeline';

type Ctx = { params: Promise<{ film: string; version: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  try {
    const { film: slug, version } = await ctx.params;
    if (isMock()) {
      // MOCK=boards: the 480p, the master and the renders with options played in memory (src/fixtures/renders.ts)
      if (!isVersion(version)) throw new CutError('version must be "v<n>"');
      return Response.json({ version, ...mockRenderStates(slug, version) }, { headers: NO_STORE });
    }
    const film = await routeFilm(slug);
    if (!isVersion(version)) throw new CutError('version must be "v<n>"');
    return Response.json({ version, ...(await renderStates(film, version)) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
