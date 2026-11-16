// GET → {files: RenderFile[], proxies: {version, bytes}[]}: every master and "More renders" file of the cut on disk, for
// the Edit page's Renders tab (src/server/edit/render-files.ts); the 480p of each version is only counted. Read-only.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockRenderFiles, mockRenderProxies } from '@/fixtures/renders';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { renderFiles, renderProxies } from '@/server/edit/render-files';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  try {
    const { film: slug } = await ctx.params;
    // MOCK=boards: the sample renders kept in memory (src/fixtures/renders.ts)
    if (isMock()) return Response.json({ files: mockRenderFiles(slug), proxies: mockRenderProxies(slug) }, { headers: NO_STORE });
    const film = await routeFilm(slug);
    return Response.json({ files: await renderFiles(film), proxies: await renderProxies(film) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
