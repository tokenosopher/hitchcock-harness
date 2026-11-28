// GET → {takes: {<take folder>: LandedTake}}: what the app knows of each take that came back besides its shots (ASKS
// 131): the card and README that say what was asked, the spend row of its job, Alma's findings record, findings.md and
// check.json (server/films/read/landed.ts). Read only.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockLanded } from '@/fixtures/takesinbox';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { readLanded } from '@/server/films/read/landed';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json({ takes: mockLanded(slug) }, { headers: NO_STORE });
  try {
    const film = await routeFilm(slug);
    return Response.json({ takes: await readLanded(film) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
