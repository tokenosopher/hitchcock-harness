// POST {film, kind: 'face'|'voice'|'character'|'location', ref, target?, candidate?, round?} → copies the files into
// the library with meta.json (status "saved"). ref is a film-relative path ("cast/C01-maren/r2-faces/C01-r2-7.png"),
// or an ID with a candidate ("C01 r2-7", "C01 option 3", "C01", "L01", "L01 u5b-2"). 503 when the studio folder is missing.
import path from 'node:path';
import { connection } from 'next/server';
import { DRIVE_MISSING, driveConnected, filmTarget } from '@/server/actions/film';
import { Writer } from '@/server/actions/writes';
import { characterDraft, faceDraft, findCandidate, idFolder, locationDraft, voiceDraft } from '@/server/library/sources';
import { LIBRARY_KINDS, LibraryUnavailable, saveEntry, type LibraryDraft, type LibraryKind } from '@/server/library/store';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function POST(req: Request): Promise<Response> {
  await connection();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  const kind = s(body.kind) as LibraryKind | undefined;
  if (!kind || !LIBRARY_KINDS.includes(kind)) return Response.json({ error: `kind must be one of ${LIBRARY_KINDS.join(', ')}` }, { status: 400 });
  const ft = await filmTarget(s(body.film) ?? '');
  if (!ft) return Response.json({ error: 'no such film folder' }, { status: 404 });
  const ref = s(body.ref) ?? '';
  const film = { slug: ft.slug, title: ft.title, dir: ft.dir };
  // "C01 r2-7" / "C01 option 3" / "L01 u5b-2" / a path inside the film folder
  const idm = /^([A-Z]\d+[a-z]?)(?:\s+(?:option\s+)?(\S+))?$/.exec(ref);
  const target = s(body.target) ?? idm?.[1] ?? /(?:cast|locations)\/([A-Z]\d+[a-z]?)-/.exec(ref)?.[1];
  const candidate = s(body.candidate) ?? idm?.[2];
  const fileAbs = !idm && ref ? path.join(ft.dir, path.normalize(ref)) : undefined;
  if (fileAbs && !fileAbs.startsWith(ft.dir + path.sep)) return Response.json({ error: 'ref is outside the film folder' }, { status: 400 });
  if (!target) return Response.json({ error: 'ref names no character or location ID' }, { status: 400 });
  let d: LibraryDraft | undefined;
  if (kind === 'face') {
    let abs = fileAbs;
    if (!abs && candidate) {
      const folder = await idFolder(film, 'cast', target);
      abs = folder ? (await findCandidate(folder.dir, target, candidate, s(body.round)))?.abs : undefined;
    }
    d = abs ? await faceDraft(film, target, abs, 'saved', { round: abs.split(path.sep).at(-2) }) : undefined;
  } else if (kind === 'voice') {
    const n = Number(/(\d+)(?:\.mp3)?$/.exec(candidate ?? ref)?.[1]);
    d = await voiceDraft(film, target, Number.isInteger(n) ? n : undefined, 'saved');
  } else if (kind === 'character') {
    d = await characterDraft(film, target, 'saved');
  } else {
    let abs = fileAbs;
    if (!abs && candidate) {
      const folder = await idFolder(film, 'locations', target);
      abs = folder ? (await findCandidate(folder.dir, target, candidate, s(body.round)))?.abs : undefined;
    }
    d = await locationDraft(film, target, 'saved', abs ? { candidateAbs: abs, round: abs.split(path.sep).at(-2) } : {});
  }
  if (!d) return Response.json({ error: `nothing to save for ${kind} ${ref}` }, { status: 404 });
  try {
    const w = new Writer(`library save ${kind} ${ft.slug} ${ref}`, ft.show);
    const r = await saveEntry(d, w);
    return Response.json({ ok: true, id: r.id, kind, created: r.created, meta: r.meta, writes: w.records });
  } catch (e) {
    if (e instanceof LibraryUnavailable) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
