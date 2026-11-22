// GET ?p=<record path, relative to the film folder> → the record of what was sent to the video model for one take
// (SentRecord; src/server/films/read/sent.ts): the prompt as sent, the model and its settings, every reference in the
// order sent. The path is a take's `sent` from the film state, a "-sent.json" under generations/, blocks/ or
// elements/. Read-only.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockSent } from '@/fixtures/sent';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { readSent, sentPathOk } from '@/server/films/read/sent';
import { Warnings } from '@/server/films/util';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const p = new URL(req.url).searchParams.get('p') ?? '';
  if (!sentPathOk(p)) return Response.json({ error: 'not a record of what was sent' }, { status: 400, headers: NO_STORE });
  const none = () => Response.json({ error: 'No record of what was sent at that place' }, { status: 404, headers: NO_STORE });
  // sample-data mode: the sample takes' records (src/fixtures/sent.ts)
  if (isMock()) { const r = mockSent((await ctx.params).film, p); return r ? Response.json(r, { headers: NO_STORE }) : none(); }
  try {
    const film = await routeFilm((await ctx.params).film);
    const rec = await readSent({ dir: film.dir, warn: new Warnings() }, p);
    return rec ? Response.json(rec, { headers: NO_STORE }) : none();
  } catch (e) {
    return errorResponse(e);
  }
}
