// POST { rev, step } → { film, working, history }: the pointer on the step whose rev is `step` (a row of the history
// list); no version written (src/server/edit/working.ts). 409 code "stale" or "no-step".
import { goTo, WorkingError } from '@/server/edit/working';
import { post, revOf, type Ctx } from '@/server/edit/working-http';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => {
    if (typeof b.step !== 'number' || !Number.isInteger(b.step)) throw new WorkingError('bad-request', 'step must be the rev of a step (a whole number)', 400);
    return { body: await goTo(s, revOf(b), b.step) };
  });
}
