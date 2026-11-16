import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { connection } from 'next/server';
import { etagOf, isImage, isPdf, isVideo, limited, MediaError, resolveMedia, thumbnail, THUMB_WIDTHS } from '@/server/media';
import { isMock } from '@/fixtures/mock';
import { mockMedia } from '@/fixtures/masters';
import { castMedia } from '@/fixtures/cast';
import { day1Media } from '@/fixtures/day1';

// GET /api/media?p=<path relative to the film repo, "assets/films/<slug>/…"> → the file, from the film
// folders, the library or the final cuts only. Video answers HTTP Range so <video> can seek.
// &w=160|320|640|960 → a WebP thumbnail (for a video, the frame at &t=, default 0.5 s), cached under
// harness/thumbs/. X-Media-Size carries the source's picture size ("1080x1920") on thumbnails.
// A file a cloud drive is still syncing answers 503 with Retry-After. &download=1 → the same file as an attachment, under
// its own name (the Finish page's Download, 13 Nov).
const CACHE = 'private, max-age=3600';

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  try {
    const r = (isMock() ? (await mockMedia(url.searchParams.get('p'))) ?? (await castMedia(url.searchParams.get('p'))) ?? (await day1Media(url.searchParams.get('p'))) : undefined) ?? await resolveMedia(url.searchParams.get('p'));
    const w = Number(url.searchParams.get('w') || 0);
    if (w) {
      if (!isImage(r.real) && !isVideo(r.real) && !isPdf(r.real)) throw new MediaError(415, 'no thumbnail for this kind of file');
      const width = THUMB_WIDTHS.find((x) => x >= w) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
      const t = Math.max(0, Number(url.searchParams.get('t') ?? 0.5) || 0);
      const etag = etagOf(r, `-w${width}${isVideo(r.real) ? `-t${t}` : ''}`);
      if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': CACHE } });
      const th = await thumbnail(r, width, t);
      const body = await fs.readFile(th.file);
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': 'image/webp', 'content-length': String(body.length), etag, 'cache-control': CACHE,
          'x-media-size': `${th.srcWidth}x${th.srcHeight}`, 'access-control-expose-headers': 'x-media-size',
        },
      });
    }

    const etag = etagOf(r, url.searchParams.get('download') ? '-dl' : '');
    const base: Record<string, string> = { 'content-type': r.type, etag, 'cache-control': CACHE, 'accept-ranges': 'bytes', 'last-modified': r.stat.mtime.toUTCString() };
    if (url.searchParams.get('download')) base['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(r.abs.split('/').pop() ?? 'video.mp4')}`;
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: base });
    const size = r.stat.size;
    let start = 0;
    let end = size - 1;
    let partial = false;
    const range = req.headers.get('range');
    if (range && (!req.headers.get('if-range') || req.headers.get('if-range') === etag)) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (!m[1] && !m[2])) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      } else {
        start = Math.max(0, size - Number(m[2]));
      }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
      partial = true;
    }
    // open and read the first bytes under a time limit: a cloud-drive file still syncing refuses here, not mid-stream
    const fh = await limited(fs.open(r.real, 'r'));
    try {
      const probe = Buffer.alloc(Math.min(64 * 1024, end - start + 1));
      if (probe.length) await limited(fh.read(probe, 0, probe.length, start));
    } catch (e) {
      await fh.close().catch(() => undefined);
      throw e;
    }
    const stream = fh.createReadStream({ start, end, autoClose: true });
    req.signal.addEventListener('abort', () => stream.destroy());
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    const headers = { ...base, 'content-length': String(end - start + 1), ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) };
    return new Response(body, { status: partial ? 206 : 200, headers });
  } catch (e) {
    const err = e instanceof MediaError ? e : new MediaError(500, 'the file could not be read');
    const headers: Record<string, string> = { 'cache-control': 'no-store' };
    if (err.status === 503) headers['retry-after'] = '5';
    return Response.json({ error: err.message, ...(err.status === 503 ? { retry: 'try again in a few seconds' } : {}) }, { status: err.status, headers });
  }
}
