import { connection } from 'next/server';
import { isMock, mockFilms } from '@/fixtures/mock';
import { getRegistry } from '@/server/films/registry';
import { NewFilmError, parseNewFilm, startFilm } from '@/server/actions/newFilm';

// GET the films registry: FilmRef[] (each with a `more` side channel). When the studio folder is missing the
// list is empty and the header x-harness-drive says "not connected", so the UI can say so.
export async function GET(req: Request) {
  await connection();
  if (isMock()) return Response.json(mockFilms());
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  const reg = await getRegistry(fresh ? 0 : undefined);
  return Response.json(reg.films, { headers: { 'x-harness-drive': reg.drive, 'cache-control': 'no-store' } });
}

// POST {title, idea, ratio, code, budgetCredits, voices?, elements?, upscale?} → 201 {slug, film, cmd, output}:
// new_film.py makes assets/films/<slug>, the registry is rebuilt and the film's Alma gets her first message
// (the Idea page). 400 a bad field · 409 the folder or the code is taken · 503 the studio folder missing.
export async function POST(req: Request) {
  await connection();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON {title, idea, ratio, code, budgetCredits}' }, { status: 400 });
  }
  try {
    const r = await startFilm(parseNewFilm(body ?? {}));
    return Response.json({ slug: r.slug, title: r.title, code: r.code, cmd: r.cmd, output: r.output, film: r.film }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof NewFilmError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
