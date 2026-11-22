// POST → {ok: true} once Finder was asked to show the film's folder on this Mac (the header's "…" menu).
// The folder comes from the registry by the slug in the address (src/server/films/folder.ts); the body is not read.
// Refused (403) unless the request was made on this Mac. In sample-data mode it answers ok and opens nothing.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { fromThisMac, openFilmFolder } from '@/server/films/folder';
import { NO_STORE } from '@/server/edit/http';

type Ctx = { params: Promise<{ film: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  if (!fromThisMac(req.headers)) return Response.json({ error: 'Only on the Mac the harness runs on' }, { status: 403, headers: NO_STORE });
  if (isMock()) return Response.json({ ok: true, mock: true }, { headers: NO_STORE });
  const r = await openFilmFolder(slug);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status, headers: NO_STORE });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
