// GET ?version=v3&format=fcpxml → FCPXML 1.10 of that version (default: the current one), for Resolve.
// Nothing is written into the film folder: the file is the response.
import { connection } from 'next/server';
import { toFcpxml } from '@/server/edit/fcpxml';
import { errorResponse, routeFilm } from '@/server/edit/http';
import { CutError, isVersion, listVersions, readVersion } from '@/server/edit/timeline';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  try {
    const film = await routeFilm((await ctx.params).film);
    const q = new URL(req.url).searchParams;
    const format = q.get('format') ?? 'fcpxml';
    if (format !== 'fcpxml') throw new CutError('format must be fcpxml');
    const versions = await listVersions(film);
    const version = q.get('version') ?? versions[versions.length - 1];
    if (!version) throw new CutError('this film has no cut version yet', 404);
    if (!isVersion(version)) throw new CutError('version must be "v<n>"');
    const xml = await toFcpxml(film, await readVersion(film, version));
    return new Response(xml, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'content-disposition': `attachment; filename="${film.slug}-${version}.fcpxml"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
