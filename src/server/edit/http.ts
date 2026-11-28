// Shared by the cut routes: the film lookup with the drive check, and errors as JSON.
import { DRIVE_MISSING, driveConnected, type FilmTarget } from '../actions/film';
import { CutError, cutFilm } from './timeline';
import { ensureCutWatch } from './watch';

export const NO_STORE = { 'cache-control': 'no-store' };

export async function routeFilm(slug: string): Promise<FilmTarget> {
  if (!(await driveConnected())) throw new CutError(DRIVE_MISSING, 503);
  const film = await cutFilm(slug);
  ensureCutWatch(film);
  return film;
}

export function errorResponse(e: unknown): Response {
  // what a refused write said, in the server's log (an edit refused with a 422 and nothing said why is hard to find)
  if (e instanceof CutError && e.status === 422) console.error('[cut refused]', e.message, JSON.stringify(e.problems.slice(0, 6)));
  if (e instanceof CutError) return Response.json({ error: e.message, ...(e.problems.length ? { problems: e.problems } : {}) }, { status: e.status, headers: NO_STORE });
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: NO_STORE });
}
