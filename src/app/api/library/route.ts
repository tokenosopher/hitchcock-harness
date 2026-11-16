// GET the library: {counts: {faces, voices, characters, locations}, items: LibraryMeta[], note?}, plus the
// counts at the top level for the sidebar ({faces, voices, characters, locations}). 503-free: a missing drive
// gives zeros with note "Studio folder missing".
import { connection } from 'next/server';
import { isMock, mockLibrary } from '@/fixtures/mock';
import { listLibrary } from '@/server/library/store';

export async function GET() {
  await connection();
  if (isMock()) { const c = mockLibrary(); return Response.json({ ...c, counts: c, items: [] }); } // the same shape as below
  const l = await listLibrary();
  return Response.json({ ...l.counts, counts: l.counts, items: l.items, ...(l.note ? { note: l.note } : {}) }, { headers: { 'cache-control': 'no-store' } });
}
