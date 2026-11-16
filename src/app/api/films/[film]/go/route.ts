// GET → GoReview: every scene's newest prompt (text, diff to the version before, check, media list at its
// reference numbers), its shots and the credits at spend.md's seedance_2_5 rate. ?scene=S3 → that scene only;
// &version=v5 → that prompt version of it (the Scene page's version picker).
// Read-only: the go itself is the user's message to Alma (SPEC principle 7); this route never starts anything.
import { connection } from 'next/server';
import { getFilmState } from '@/server/films/state';
import { readGo } from '@/server/films/read/prompts';
import { Warnings } from '@/server/films/util';

export async function GET(req: Request, { params }: RouteContext<'/api/films/[film]/go'>) {
  await connection();
  const { film } = await params;
  const state = await getFilmState(film);
  if (!state) return Response.json({ error: `No film "${film}" in the registry (or the studio folder is missing)` }, { status: 404 });
  const scene = new URL(req.url).searchParams.get('scene') ?? undefined;
  if (scene && !/^S\d+$/.test(scene)) return Response.json({ error: 'scene must be "S<n>"' }, { status: 400 });
  const version = new URL(req.url).searchParams.get('version') ?? undefined;
  if (version && (!scene || !/^v\d+[\w-]*$/.test(version))) return Response.json({ error: 'version needs a scene and must be "v<n>"' }, { status: 400 });
  const warn = new Warnings();
  const review = await readGo({ dir: state.film.folder, warn }, film, state.scenes, state.spend.lines, scene, version);
  review.warnings.push(...warn.list);
  return Response.json(review, { headers: { 'cache-control': 'no-store' } });
}
