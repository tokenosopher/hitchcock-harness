// GET → a scene's layouts (components/edit/layouts.ts): `{film, scenes: [{scene, layouts}]}`, every
// scene with a previz take, its layouts oldest first, each with its previz take, its storyboard version, its shots (their
// framing and line, for the safe swaps) and the takes made from it. `?scene=S3` for one scene. Reads only; which layout
// the cut uses is read from the cut itself (`layoutInCut`). The choice is the plan route's `"action": "layout"`.
// Under MOCK=boards the layouts sample's S3 comes from src/fixtures/day1.ts.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockLayouts } from '@/fixtures/day1';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { readLayouts } from '@/server/edit/layouts';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const q = new URL(req.url).searchParams.get('scene');
  const only = q && /^S\d+[A-Za-z]?$/.test(q) ? q : undefined;
  if (isMock()) {
    const all = mockLayouts(slug) ?? [];
    return Response.json({ film: slug, mock: true, scenes: all.filter((x) => !only || x.scene === only) }, { headers: NO_STORE });
  }
  try {
    return Response.json({ film: slug, scenes: await readLayouts(await routeFilm(slug), only) }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
