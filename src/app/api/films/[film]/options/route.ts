// GET ?dir=<folder>&dir=… → the sound files of each folder as the options of the clips that play from it
// ({groups}; src/server/edit/options.ts). Read-only. The Edit page asks for the folders of its sound clips.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockOptions } from '@/fixtures/options';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { soundOptions } from '@/server/edit/options';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  // sample-data mode: the sample film's effect has three tries (src/fixtures/options.ts)
  if (isMock()) return Response.json({ groups: mockOptions((await ctx.params).film, new URL(req.url).searchParams.getAll('dir')) }, { headers: NO_STORE });
  try {
    const film = await routeFilm((await ctx.params).film);
    return Response.json({ groups: await soundOptions(film, new URL(req.url).searchParams.getAll('dir')) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
