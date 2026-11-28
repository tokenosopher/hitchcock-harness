// GET → {since, seen, keep}: the takes the user has looked at on the Edit page (src/server/edit/seenTakes.ts), the same
// on every device. POST {seen: [src…], begin?: {keep: [src…]}} adds to it. DELETE, sample mode only: the list as it began.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { addSeen, cleanPost, mockAddSeen, mockForget, mockSeen, readSeen } from '@/server/edit/seenTakes';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (isMock()) return Response.json(mockSeen(slug), { headers: NO_STORE });
  try {
    await routeFilm(slug);
    return Response.json(await readSeen(slug), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const p = cleanPost(await req.json().catch(() => undefined));
  if (!p) return Response.json({ error: 'Not a list of takes' }, { status: 400, headers: NO_STORE });
  if (isMock()) return Response.json(mockAddSeen(slug, p), { headers: NO_STORE });
  try {
    await routeFilm(slug);
    return Response.json(await addSeen(slug, p), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (!isMock()) return Response.json({ error: 'sample mode only' }, { status: 403, headers: NO_STORE });
  const slug = (await ctx.params).film;
  mockForget(slug);
  return Response.json(mockSeen(slug), { headers: NO_STORE });
}
