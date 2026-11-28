// GET → {decided: {<src>: {d, at}}}: what the user decided on the New takes page (server/edit/takeDecisions.ts),
// the same on every device. POST {src, d: "used" | "later" | "rejected" | null} sets or takes back one. DELETE, sample
// mode only: no decisions.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { addDecision, cleanDecision, mockAddDecision, mockDecided, mockForgetDecided, readDecided } from '@/server/edit/takeDecisions';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json({ decided: mockDecided(slug) }, { headers: NO_STORE });
  try {
    await routeFilm(slug);
    return Response.json({ decided: await readDecided(slug) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const p = cleanDecision(await req.json().catch(() => undefined));
  if (!p) return Response.json({ error: 'Not a decision: {src, d: "used" | "later" | "rejected" | null}' }, { status: 400, headers: NO_STORE });
  if (isMock()) return Response.json({ decided: mockAddDecision(slug, p) }, { headers: NO_STORE });
  try {
    await routeFilm(slug);
    return Response.json({ decided: await addDecision(slug, p) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (!isMock()) return Response.json({ error: 'sample mode only' }, { status: 403, headers: NO_STORE });
  const slug = (await ctx.params).film;
  mockForgetDecided(slug);
  return Response.json({ decided: {} }, { headers: NO_STORE });
}
