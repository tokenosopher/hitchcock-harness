// GET → SoundInfo: the film's sound work by folder (src/server/films/read/sound.ts). Read-only.
import { connection } from 'next/server';
import { getFilmState } from '@/server/films/state';
import { readSound } from '@/server/films/read/sound';
import { isMock } from '@/fixtures/mock';
import { soundSampleSound } from '@/fixtures/soundpick';

export async function GET(_req: Request, { params }: RouteContext<'/api/films/[film]/sound'>) {
  await connection();
  const { film } = await params;
  const sample = isMock() ? soundSampleSound(film) : undefined;
  if (sample) return Response.json(sample, { headers: { 'cache-control': 'no-store' } });
  const state = await getFilmState(film);
  if (!state) return Response.json({ error: `No film "${film}" in the registry (or the studio folder is missing)` }, { status: 404 });
  return Response.json(await readSound(state.film.folder), { headers: { 'cache-control': 'no-store' } });
}
