// POST {version, kind: 'proxy'|'master', retry?, again?, options?} → queues a render of that version (one at a time,
// server-wide). The 480p ('proxy') is made only this way or by Alma's marker (watch.ts) since 14 Nov (ASKS 44). A rendered version answers "done" at once (renders never overwrite); a failed one is retried only with
// retry: true. again: true on a master: when the master there is out of date (masters.ts), a new one is made beside it
// (v<n>-master-2.mp4, then -3), and the newest is the master of the version; when it is not, the answer is "done".
// options (RenderOptions in types.ts: loudness, stems, leaveOut, small) make a separate render whose files sit beside the
// plain one, cut/renders/<version>-<kind>-<tag>…; it is listed in the version's renders as one of `variants`. small is
// for the master only, not with stems (refused in words, 400).
// DELETE {version, kind, options?} → cancels that render, named as the POST names it: a queued one
// never runs, a running one's own ffmpeg is stopped and nothing is written into cut/renders/; its state becomes
// 'cancelled' and a POST asks for it again. Answers 200 {cancelled, state, said}; one done, failed or not there answers
// cancelled: false with why, never an error. Local requests only, as every writing route (src/proxy.ts).
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockCancelRender, mockQueueRender } from '@/fixtures/renders';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { cancelRender, queueRender } from '@/server/edit/render';
import { kindProblems, parseRenderOptions } from '@/server/edit/render-options';
import { CutError, isVersion } from '@/server/edit/timeline';
import { mockVersions } from '@/server/edit/working';
import { hasPlanned, PLANNED_RENDER_WHY } from '@/components/edit/planned';

type Ctx = { params: Promise<{ film: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  try {
    if (isMock()) {
      // MOCK=boards: a render with options, the plain 480p or the master plays a made-up life in memory (src/fixtures/renders.ts)
      if (!isVersion(body.version)) throw new CutError('version must be "v<n>"');
      // a version that still holds boards, planned shots or script lines is refused, as on a real film (render.ts)
      const held = mockVersions((await ctx.params).film)?.timelines.find((t) => t.version === body.version);
      if (held && hasPlanned(held)) throw new CutError(`${body.version} still holds boards, planned shots or script lines. ${PLANNED_RENDER_WHY}`, 409);
      const kind = body.kind === 'master' ? 'master' : body.kind === 'proxy' || body.kind === undefined ? 'proxy' : undefined;
      if (!kind) throw new CutError("kind must be 'proxy' or 'master'");
      const { options, problems } = parseRenderOptions(body.options);
      if (problems.length) throw new CutError(`the render options do not check out: ${problems.join('; ')}`, 400, problems);
      const wrong = kindProblems(kind, options);
      if (wrong.length) throw new CutError(`the render options do not check out: ${wrong.join('; ')}`, 400, wrong);
      // the plain 480p and master are played too (the Renders tab, 14 Nov), each only when asked for
      return Response.json(mockQueueRender((await ctx.params).film, body.version, kind, options, body.retry === true, body.again === true), { status: 202, headers: NO_STORE });
    }
    const film = await routeFilm((await ctx.params).film);
    if (!isVersion(body.version)) throw new CutError('version must be "v<n>"');
    const kind = body.kind === 'master' ? 'master' : body.kind === 'proxy' || body.kind === undefined ? 'proxy' : undefined;
    if (!kind) throw new CutError("kind must be 'proxy' or 'master'");
    const { options, problems } = parseRenderOptions(body.options);
    if (problems.length) throw new CutError(`the render options do not check out: ${problems.join('; ')}`, 400, problems);
    const render = await queueRender(film.slug, body.version, kind, { force: body.retry === true, again: body.again === true, options });
    return Response.json(render, { status: 202, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  try {
    if (!isVersion(body.version)) throw new CutError('version must be "v<n>"');
    const kind = body.kind === 'master' ? 'master' : body.kind === 'proxy' || body.kind === undefined ? 'proxy' : undefined;
    if (!kind) throw new CutError("kind must be 'proxy' or 'master'");
    const { options, problems } = parseRenderOptions(body.options);
    if (problems.length) throw new CutError(`the render options do not check out: ${problems.join('; ')}`, 400, problems);
    // MOCK=boards: the made-up render life stops where it is (src/fixtures/renders.ts)
    if (isMock()) return Response.json(mockCancelRender((await ctx.params).film, body.version, kind, options), { headers: NO_STORE });
    const film = await routeFilm((await ctx.params).film);
    return Response.json(await cancelRender(film.slug, body.version, kind, { options }), { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
