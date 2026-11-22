// POST {film, kind: 'face'|'voice'|'character'|'location', ref, target?, candidate?, round?, note?} → copies the files
// into the library with meta.json (status "saved"). ref is a film-relative path ("cast/C01-maren/r2-faces/C01-r2-7.png"),
// or an ID with a candidate ("C01 r2-7", "C01 option 3", "C01", "L01", "L01 u5b-2"). note is a line of the user's own;
// sent again for an entry already saved, it replaces the entry's note and copies nothing. The film is never changed.
// 503 when the studio folder is missing. Under MOCK=boards nothing is written: the sample cast film's saves are kept in
// memory (src/fixtures/library.ts), any other film's are refused.
import { connection } from 'next/server';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { saveToLibrary, type SaveBody } from '@/server/library/save';
import { LibraryUnavailable } from '@/server/library/store';
import { isMock } from '@/fixtures/mock';
import { mockSave } from '@/fixtures/library';

export async function POST(req: Request): Promise<Response> {
  await connection();
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  // the sample server never writes a library: the sample cast film's saves stay in memory, the others are refused
  if (isMock()) return mockSave(body) ?? Response.json({ error: 'the sample server saves only the sample cast film\'s faces, in memory' }, { status: 409 });
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  try {
    const r = await saveToLibrary(body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    if (e instanceof LibraryUnavailable) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
