// POST { version, name } → { film, version, name? }: a name for a saved version, kept exactly as typed in
// harness/version-names.json (src/server/edit/working.ts nameVersion; stage 2: the name field after a save). An empty
// name takes the name away. The version file is never touched. 404: no such version.
import { isVersion } from '@/server/edit/timeline';
import { nameVersion, WorkingError } from '@/server/edit/working';
import { post, type Ctx } from '@/server/edit/working-http';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => {
    if (!isVersion(b.version)) throw new WorkingError('bad-request', 'version must be "v<n>"', 400);
    if (typeof b.name !== 'string') throw new WorkingError('bad-request', 'name must be a string', 400);
    return { body: await nameVersion(s, b.version, b.name) };
  });
}
