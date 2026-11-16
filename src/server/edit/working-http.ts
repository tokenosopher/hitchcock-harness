// Shared by the working-cut routes (src/app/api/films/[film]/cut/{working,undo,redo,goto,restore,save}): the store of
// a film (on disk, or in memory under MOCK=boards), the JSON body, and the answers. A refusal is JSON
// { error, code?, rev?, problems?, working?, history? }: a stale rev (409, code "stale") brings the current working cut
// and history with it, so the page can show them without another GET.
import { connection } from 'next/server';
import { isMock, mockCut } from '@/fixtures/mock';
import { filmTargetOf } from './timeline';
import { errorResponse, NO_STORE, routeFilm } from './http';
import { diskStore, memoryStore, peekWorking, WorkingError, type CutStore } from './working';

export type Ctx = { params: Promise<{ film: string }> };

/** The film's store; a sample film without a cut is a 404 WorkingError. */
export async function storeFor(slug: string): Promise<CutStore> {
  if (isMock()) {
    const s = memoryStore(filmTargetOf(slug, '/nonexistent-sample-film', '/nonexistent-sample-film'), mockCut(slug));
    if (!s) throw new WorkingError('no-cut', `no cut fixture for "${slug}" under MOCK=boards`, 404);
    return s;
  }
  return diskStore(await routeFilm(slug));
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = (await req.json()) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
  } catch { /* below */ }
  throw new WorkingError('bad-request', 'body must be a JSON object', 400);
}

export const revOf = (b: Record<string, unknown>): number => {
  if (typeof b.rev !== 'number' || !Number.isInteger(b.rev)) throw new WorkingError('bad-request', 'rev must be the working cut\'s rev (a whole number)', 400);
  return b.rev;
};

export async function refusal(e: unknown, s?: CutStore): Promise<Response> {
  if (e instanceof WorkingError) {
    const now = e.code === 'stale' && s ? await peekWorking(s).catch(() => undefined) : undefined;
    return Response.json({ error: e.message, code: e.code, ...(e.rev !== undefined ? { rev: e.rev } : {}), ...(e.problems.length ? { problems: e.problems } : {}), ...(now ?? {}) }, { status: e.status, headers: NO_STORE });
  }
  return errorResponse(e);
}

/** Runs one POST: the film's store, the body, the change; its answer as JSON (`status` on success). */
export async function post(req: Request, ctx: Ctx, run: (s: CutStore, b: Record<string, unknown>) => Promise<{ body: object; status?: number }>): Promise<Response> {
  await connection();
  let s: CutStore | undefined;
  try {
    const slug = (await ctx.params).film;
    s = await storeFor(slug);
    const b = await bodyOf(req);
    const { body, status } = await run(s, b);
    return Response.json({ film: slug, ...(isMock() ? { mock: true } : {}), ...body }, { status: status ?? 200, headers: NO_STORE });
  } catch (e) {
    return refusal(e, s);
  }
}
