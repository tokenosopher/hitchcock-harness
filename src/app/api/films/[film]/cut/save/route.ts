// POST { rev, name?, why: 'you'|'render'|'final'|'alma'|'export' } → { film, version, made, render?, working, history }
// (src/server/edit/working.ts save): the working cut kept as cut/v<n+1>.json through writeNextVersion (201, made: true,
// then afterNewVersion as the old POST …/cut did; `render` is its answer), or, when its content equals the newest
// version, no file (200, made: false, version: that version). A name goes to harness/version-names.json either way.
// 409 code "stale" (with the current working and history), or the old route's 409 when a version file was written
// meanwhile · 422 { error, problems }: the cut does not validate as a version.
import { isMock } from '@/fixtures/mock';
import { afterNewVersion } from '@/server/edit/render';
import { save, WorkingError } from '@/server/edit/working';
import { post, revOf, type Ctx } from '@/server/edit/working-http';
import { SAVE_WHYS, type SaveWhy } from '@/components/edit/history';

export function POST(req: Request, ctx: Ctx): Promise<Response> {
  return post(req, ctx, async (s, b) => {
    if (!SAVE_WHYS.includes(b.why as SaveWhy)) throw new WorkingError('bad-request', 'why must be you, render, final, alma or export', 400);
    if (b.name !== undefined && typeof b.name !== 'string') throw new WorkingError('bad-request', 'name must be a string', 400);
    const a = await save(s, { rev: revOf(b), name: b.name as string | undefined, why: b.why as SaveWhy });
    const render = a.made && !isMock() ? await afterNewVersion(s.film.slug, a.version, 'page') : undefined;
    return { body: { ...a, ...(render ? { render } : {}) }, status: a.made ? 201 : 200 };
  });
}
