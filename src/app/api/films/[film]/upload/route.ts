// POST (the file's bytes as the body; X-File-Name, URI-encoded; Content-Type) → {file, name, path, type, size}:
//   a file pasted, dropped or attached in Alma's message box, kept under harness/uploads/<film>/.
//   With X-Upload-Id, X-Upload-Part (from 0), X-Upload-Parts, X-Upload-Offset, X-Upload-Size and X-Upload-Sha256
//   (optional) the body is one part of a larger file (the page sends 4 MB parts: the request proxy keeps only the
//   first 10 MB of a body); every part but the last answers {received}, the last the kept file.
//   Either way what arrived must be what was sent, or nothing is kept and the answer says so.
// DELETE ?id=<upload id> → drops an unfinished upload in parts.
// GET ?f=<file> → the file back, for its thumbnail in the box and in the thread.
import { promises as fs } from 'node:fs';
import { connection } from 'next/server';
import { validFilm } from '@/server/claude/thread';
import { cutMessage, dropUpload, receivePart, saveUpload, TOO_BIG, UPLOAD_MAX, UploadError, uploadPath, uploadType } from '@/server/uploads';

const int = (v: string | null): number => (v !== null && /^\d{1,12}$/.test(v) ? Number(v) : NaN);

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/upload'>): Promise<Response> {
  await connection();
  const { film } = await params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  const h = req.headers;
  const declared = h.get('content-length');
  const sent = declared === null ? undefined : Number(declared);
  const id = h.get('x-upload-id');
  if (sent !== undefined && sent > UPLOAD_MAX) return Response.json({ error: TOO_BIG }, { status: 413 });
  if (id !== null && int(h.get('x-upload-size')) > UPLOAD_MAX) return Response.json({ error: TOO_BIG }, { status: 413 });
  let name = '';
  try { name = decodeURIComponent(h.get('x-file-name') ?? ''); } catch { /* a name that is not URI-encoded: it gets "pasted" */ }
  const type = h.get('content-type') ?? '';
  const bytes = new Uint8Array(await req.arrayBuffer());
  try {
    if (id !== null) {
      if (sent === undefined) return Response.json({ error: 'a part must say its length' }, { status: 411 });
      const part = { id, index: int(h.get('x-upload-part')), count: int(h.get('x-upload-parts')), offset: int(h.get('x-upload-offset')), size: int(h.get('x-upload-size')), sha256: h.get('x-upload-sha256') ?? undefined, name, type };
      const r = await receivePart(film, part, bytes, sent);
      return Response.json(r, { status: 'file' in r ? 201 : 200 });
    }
    if (!bytes.length) return Response.json({ error: 'the file is empty' }, { status: 400 });
    if (bytes.length > UPLOAD_MAX) return Response.json({ error: TOO_BIG }, { status: 413 });
    // the proxy keeps only the first 10 MB of a body: a file sent whole must have come whole
    if (sent !== undefined && bytes.length !== sent) return Response.json({ error: cutMessage(name, bytes.length, sent) }, { status: 400 });
    return Response.json(await saveUpload(film, name, type, bytes), { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext<'/api/films/[film]/upload'>): Promise<Response> {
  await connection();
  const { film } = await params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  await dropUpload(film, new URL(req.url).searchParams.get('id') ?? '');
  return new Response(null, { status: 204 });
}

export async function GET(req: Request, { params }: RouteContext<'/api/films/[film]/upload'>): Promise<Response> {
  await connection();
  const { film } = await params;
  const file = new URL(req.url).searchParams.get('f') ?? '';
  const p = validFilm(film) ? uploadPath(film, file) : undefined;
  if (!p) return new Response('not found', { status: 404 });
  try {
    const body = await fs.readFile(p);
    // an SVG or HTML file must not run as a page of the harness: everything that is not a plain picture downloads
    const type = uploadType(file);
    const inline = /^image\/(png|jpeg|webp|gif)$/.test(type);
    return new Response(new Uint8Array(body), { headers: { 'content-type': inline ? type : 'application/octet-stream', 'content-length': String(body.length), 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', ...(inline ? {} : { 'content-disposition': 'attachment' }) } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
