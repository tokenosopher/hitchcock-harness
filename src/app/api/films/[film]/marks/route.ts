// GET → {note, seedance}: the takes the user marked on the Edit page to redo in Seedance (<film>/harness/upscale-marks.json).
// POST {seedance: [...]} → the film's whole list, saved as it is (the page sends it on every toggle). In sample-data mode
// the list is kept in memory and nothing is written.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { leftMarksSeed } from '@/fixtures/left';
import { cleanMarks, MARKS_NOTE } from '@/components/edit/marks';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { mockMarks, readMarks, writeMarks } from '@/server/edit/marks';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json({ note: MARKS_NOTE, seedance: mockMarks.get(slug) ?? leftMarksSeed(slug) ?? [] }, { headers: NO_STORE });
  try {
    return Response.json(await readMarks(await routeFilm(slug)), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'The marks were not JSON' }, { status: 400, headers: NO_STORE }); }
  const list = cleanMarks(body, slug);
  if (!list) return Response.json({ error: `The marks are not a list of this film's takes` }, { status: 400, headers: NO_STORE });
  if (isMock()) {
    mockMarks.set(slug, list);
    return Response.json({ note: MARKS_NOTE, seedance: list }, { headers: NO_STORE });
  }
  try {
    return Response.json(await writeMarks(await routeFilm(slug), list), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
