// GET → every take of the film that has a video file, cut into its shots ({takes, waiting}). Takes not read
// yet are queued (one ffmpeg at a time) and come back as "waiting"; the Edit page asks again until none wait.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { landSample, mockShots } from '@/fixtures/shots';
import { day1Shots } from '@/fixtures/day1';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { filmShots } from '@/server/edit/shots';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  // sample-data mode: the sample film's takes, derived from its hand-written cut (src/fixtures/shots.ts)
  if (isMock()) { const f = (await ctx.params).film; return Response.json(day1Shots(f, () => mockShots('the-lighthouse')) ?? mockShots(f), { headers: NO_STORE }); }
  try {
    const film = await routeFilm((await ctx.params).film);
    return Response.json(await filmShots(film), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Sample mode only (the browser tests): `{land: true}` lands the sample variation being made, `{land: false}` puts it
 *  back to being made. In this server's memory; nothing is written. Refused on a real film. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (!isMock()) return Response.json({ error: 'sample mode only' }, { status: 403, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { land?: unknown };
  const film = (await ctx.params).film;
  landSample(film, body.land === true);
  return Response.json(mockShots(film), { headers: NO_STORE });
}
