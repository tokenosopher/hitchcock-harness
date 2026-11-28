// GET → what the Shots page reads besides the takes and the cut: each generation's shot list, its prompt's SHOT
// numbers and storyboard panels, the takes' planned cuts, and the newest previz of the whole film
// (server/films/read/shotlist.ts). Read only.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockShotList } from '@/fixtures/shotlist';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { readShotList } from '@/server/films/read/shotlist';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (isMock()) return Response.json(mockShotList((await ctx.params).film), { headers: NO_STORE });
  try {
    const film = await routeFilm((await ctx.params).film);
    return Response.json(await readShotList(film), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
