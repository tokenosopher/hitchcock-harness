// POST { rev } → { film, working, history }: the pointer one step back; no version written (src/server/edit/working.ts).
// 409 code "stale" (with the current working and history) or "no-undo".
import { undo } from '@/server/edit/working';
import { post, revOf, type Ctx } from '@/server/edit/working-http';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => ({ body: await undo(s, revOf(b)) }));
}
