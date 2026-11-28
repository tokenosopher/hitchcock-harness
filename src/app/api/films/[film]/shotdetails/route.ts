// GET ?previz=<previz take, its .json or .mp4>&from=take|scene&board=<storyboard folder> → what the Shot details page
// shows beside what was sent (ShotDetailsExtra; src/server/films/read/previzTake.ts): the previz take the storyboard
// was drawn from, with its shots' times, and the storyboard's panels. Paths are relative to the film folder, under
// previz/. Read-only; nothing of this was sent to the model.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockShotDetails } from '@/fixtures/sent';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { boardPathOk, previzPathOk, readPanels, readPrevizTake, type ShotDetailsExtra } from '@/server/films/read/previzTake';
import { Warnings } from '@/server/films/util';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const q = new URL(req.url).searchParams;
  const previz = q.get('previz') ?? '';
  const board = q.get('board') ?? '';
  const from = q.get('from') === 'scene' ? 'scene' : 'take';
  if ((previz && !previzPathOk(previz)) || (board && !boardPathOk(board))) return Response.json({ error: 'not a previz take or a storyboard' }, { status: 400, headers: NO_STORE });
  const film = (await ctx.params).film;
  if (isMock()) return Response.json(mockShotDetails(film, previz, board, from) ?? {}, { headers: NO_STORE });
  try {
    const f = await routeFilm(film);
    const c = { dir: f.dir, warn: new Warnings() };
    const pv = previz ? await readPrevizTake(c, previz) : undefined;
    const panels = board ? await readPanels(c, board) : undefined;
    const out: ShotDetailsExtra = { ...(pv ? { previz: { ...pv, from } } : {}), ...(panels?.length ? { panels } : {}) };
    return Response.json(out, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
