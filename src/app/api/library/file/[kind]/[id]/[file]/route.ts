// GET one file of a library entry (thumbnails, images, the voice previews) with byte ranges for the players.
// Only names an entry's meta.json lists are served.
import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { connection } from 'next/server';
import { entryFile, LIBRARY_KINDS, type LibraryKind } from '@/server/library/store';
import { isMock } from '@/fixtures/mock';
import { mockLibraryFile } from '@/fixtures/library';

type Ctx = { params: Promise<{ kind: string; id: string; file: string }> };

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', md: 'text/markdown; charset=utf-8' };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { kind, id, file } = await ctx.params;
  if (!LIBRARY_KINDS.includes(kind as LibraryKind)) return new Response('not found', { status: 404 });
  const p = isMock() ? mockLibraryFile(kind, id, decodeURIComponent(file)) : await entryFile(kind as LibraryKind, id, decodeURIComponent(file));
  if (!p) return new Response('not found', { status: 404 });
  const st = await fs.stat(p).catch(() => undefined);
  if (!st) return new Response('not found', { status: 404 });
  const type = TYPES[p.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${st.size}` } });
    const body = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { ...headers, 'content-length': String(st.size) } });
}
