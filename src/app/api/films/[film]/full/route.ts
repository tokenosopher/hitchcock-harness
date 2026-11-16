// GET → FullInfo: the full-size pictures on disk for the Edit page's 1080p view (src/server/edit/fullsize.ts). Read-only.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { sampleFull } from '@/fixtures/masters';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { readFullSize } from '@/server/edit/fullsize';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json(sampleFull(slug), { headers: NO_STORE });
  try {
    return Response.json(await readFullSize(await routeFilm(slug)), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
