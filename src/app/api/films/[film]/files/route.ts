// GET → the film's files that can go on the timeline by hand ({files, waiting, truncated?}; src/server/edit/files.ts):
//   sounds and made pictures in the film's folder, and the files attached in the chat for it. Read-only. `waiting`
//   counts files whose length is still being measured: the page asks again.
// GET ?srt=<src> → {text}: the words of one .srt file of the film, for "Split into lines to edit" (14 Nov). Read-only.
// POST {upload: "<file name in harness/uploads/<film>/>"} → {src, name, reused}: copies a file attached in the chat
//   into the film's folder (audio/added/ or edits/added/), never over a file, so a clip can play it. Only on the
//   owner's click on the Edit page.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockAdopt, mockFiles, mockSrt } from '@/fixtures/files';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { adoptUpload, filmFiles, readSrt } from '@/server/edit/files';
import { invalidateFilmState } from '@/server/films/state';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const srt = new URL(req.url).searchParams.get('srt');
  // sample-data mode: a hand-written list (src/fixtures/files.ts)
  if (isMock()) {
    if (srt === null) return Response.json(mockFiles((await ctx.params).film), { headers: NO_STORE });
    const text = mockSrt(srt);
    return text === undefined ? Response.json({ error: `${srt} is not an .srt of this film` }, { status: 404, headers: NO_STORE }) : Response.json({ text }, { headers: NO_STORE });
  }
  try {
    const film = await routeFilm((await ctx.params).film);
    if (srt !== null) return Response.json({ text: await readSrt(film, srt) }, { headers: NO_STORE });
    return Response.json(await filmFiles(film), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  let body: { upload?: unknown };
  try {
    body = (await req.json()) as { upload?: unknown };
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400, headers: NO_STORE });
  }
  const upload = typeof body.upload === 'string' ? body.upload : '';
  if (isMock()) {
    // sample-data mode: the place it would get, nothing written
    const r = mockAdopt((await ctx.params).film, upload);
    return r ? Response.json(r, { headers: NO_STORE }) : Response.json({ error: 'that attached file is not there' }, { status: 404, headers: NO_STORE });
  }
  try {
    const film = await routeFilm((await ctx.params).film);
    const r = await adoptUpload(film, upload);
    // the Sound page lists audio/: let it see the new file
    if (!r.reused) invalidateFilmState(film.slug);
    return Response.json(r, { status: r.reused ? 200 : 201, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
