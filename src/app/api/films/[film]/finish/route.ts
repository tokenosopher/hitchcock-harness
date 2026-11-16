// GET → FinishInfo: stages 10 and 11 from the film's files (src/server/films/read/finish.ts). Read-only.
import { connection } from 'next/server';
import { getFilmState } from '@/server/films/state';
import { readFinish } from '@/server/films/read/finish';
import { isMock, mockState } from '@/fixtures/mock';
import { sampleFinish } from '@/fixtures/masters';

export async function GET(_req: Request, { params }: RouteContext<'/api/films/[film]/finish'>) {
  await connection();
  const { film } = await params;
  const sample = isMock() ? sampleFinish(film, mockState(film)) : undefined;
  if (sample) return Response.json(sample, { headers: { 'cache-control': 'no-store' } });
  const state = await getFilmState(film);
  if (!state) return Response.json({ error: `No film "${film}" in the registry (or the studio folder is missing)` }, { status: 404 });
  return Response.json(await readFinish(state), { headers: { 'cache-control': 'no-store' } });
}
