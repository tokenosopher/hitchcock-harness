// POST { rev } → { film, working, history }: the pointer one step on; no version written (src/server/edit/working.ts).
// 409 code "stale" (with the current working and history) or "no-redo".
import { redo } from '@/server/edit/working';
import { post, revOf, type Ctx } from '@/server/edit/working-http';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => ({ body: await redo(s, revOf(b)) }));
}
