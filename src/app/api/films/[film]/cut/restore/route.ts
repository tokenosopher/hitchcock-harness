// POST { rev, version } → 201 { film, working, history }: that version's content as one step ("restored v3", by
// "restore"), undoable; no version written (src/server/edit/working.ts). 200 with `same: true` when the working cut
// is that content already. 409 code "stale" · 404 the version does not exist · 422 it does not validate.
import { isVersion } from '@/server/edit/timeline';
import { restore, WorkingError } from '@/server/edit/working';
import { post, revOf, type Ctx } from '@/server/edit/working-http';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => {
    if (!isVersion(b.version)) throw new WorkingError('bad-request', 'version must be "v<n>"', 400);
    const a = await restore(s, revOf(b), b.version);
    return { body: a, status: a.same ? 200 : 201 };
  });
}
