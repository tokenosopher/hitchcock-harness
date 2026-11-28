// A sound pick card's sounds, heard on the card and in the film. Read-only towards the film: a clip made here
// is kept under harness/hear/ (server/edit/hear.ts), never in the film folder.
//   GET ?card=<key>                                  → { peaks, seconds, moments: { [id]: { inCut, window } }, picture }
//       each option file's shape (for its waveform) and length, which option the cut has at each moment, and the 480p used
//   GET ?card=<key>&moment=<id>&option=<id>          → the clip (video/mp4, byte ranges): that moment of the cut with
//       that option laid in; option "" (or absent): the moment without any of them. Made on the first ask; an <video>
//       may point straight here, the answer waits for it
//   … &warm=1                                         → { ok, inCut }: the clip made (or already there), not sent
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { connection } from 'next/server';
import type { FeedCard, TimelineTrack } from '@/server/types';
import { isMock } from '@/fixtures/mock';
import { soundCardsFeed, soundCardsFile, SOUND_CARDS, SOUND_CARDS_PROXY } from '@/fixtures/soundcards';
import { soundSampleFeed, soundMedia } from '@/fixtures/soundpick';
import { mockMedia } from '@/fixtures/masters';
import { getFilmState } from '@/server/films/state';
import { readFeed } from '@/server/films/read/feed';
import { Warnings } from '@/server/films/util';
import { NO_STORE, routeFilm } from '@/server/edit/http';
import { storeFor } from '@/server/edit/working-http';
import { peekWorking } from '@/server/edit/working';
import { RENDERS_DIR, resolveSrc, timelineLength } from '@/server/edit/timeline';
import { renderProxies } from '@/server/edit/render-files';
import { hearClip } from '@/server/edit/hear';
import { peaksOf } from '@/server/edit/options';
import { probe } from '@/server/edit/probe';
import { piecesFor, windowOf } from '@/components/feed/hearIt';

type Ctx = { params: Promise<{ film: string }> };
const bad = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });

async function cardOf(slug: string, key: string): Promise<FeedCard | undefined> {
  if (isMock()) return (soundCardsFeed(slug) ?? soundSampleFeed(slug))?.find((c) => c.key === key);
  const state = await getFilmState(slug);
  if (!state) return undefined;
  return (await readFeed({ dir: state.film.folder, warn: new Warnings() }, state.film.slug)).cards.find((c) => c.key === key);
}

/** The cut as it is now (the working cut, else the newest version), its 480p (the version's own, else the newest one
 *  made), and how a path of it is found on disk. */
interface Cut { tracks: TimelineTrack[]; version?: string; picture?: { file: string; version: string; stale: boolean }; resolve: (src: string) => Promise<string | undefined> }
async function cutOf(slug: string): Promise<Cut | undefined> {
  const s = await storeFor(slug).catch(() => undefined);
  if (!s) return undefined;
  const w = (await peekWorking(s).catch(() => undefined))?.working;
  const t = w ?? (await s.newestReadable());
  if (!t) return undefined;
  const version = w ? w.version : (t as { version?: string }).version;
  const edited = !!w?.edited;
  if (isMock()) {
    const mockFile = async (src: string) => { const p = src.startsWith('assets/') ? src : `assets/films/${slug}/${src}`; return soundCardsFile(p)?.real ?? (await soundMedia(p))?.real ?? (await mockMedia(p))?.real; };
    const pic = slug === SOUND_CARDS ? soundCardsFile(SOUND_CARDS_PROXY)?.real : path.join(process.cwd(), 'src/fixtures/media/sample-render.mp4');
    return { tracks: t.tracks, version, picture: pic ? { file: pic, version: version ?? 'v1', stale: edited } : undefined, resolve: mockFile };
  }
  const film = await routeFilm(slug);
  const proxies = await renderProxies(film).catch(() => []);
  const own = version ? proxies.find((p) => p.version === version) : undefined;
  const newest = own ?? [...proxies].sort((a, b) => Number(b.version.slice(1)) - Number(a.version.slice(1)))[0];
  const picture = newest ? { file: path.join(film.dir, RENDERS_DIR, `${newest.version}-proxy.mp4`), version: newest.version, stale: edited || newest.version !== version } : undefined;
  return { tracks: t.tracks, version, picture, resolve: async (src) => resolveSrc(film, src) };
}

/** The file with byte ranges (an iPhone asks for the first two bytes first, then the rest in pieces). */
async function send(req: Request, file: string): Promise<Response> {
  const st = await fs.stat(file);
  const size = st.size;
  const base: Record<string, string> = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-cache', etag: `"${size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` };
  let start = 0, end = size - 1, partial = false;
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('range') ?? '').trim());
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; } else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
    partial = true;
  }
  const fh = await fs.open(file, 'r');
  const stream = fh.createReadStream({ start, end, autoClose: true });
  req.signal.addEventListener('abort', () => stream.destroy());
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: partial ? 206 : 200, headers: { ...base, 'content-length': String(end - start + 1), ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) },
  });
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const q = new URL(req.url).searchParams;
  const key = q.get('card');
  if (!key) return bad(400, 'card is required');
  const card = await cardOf(slug, key).catch(() => undefined);
  if (!card) return bad(404, `no card "${key}" in ${slug}`);
  const moments = card.hear?.moments ?? [];
  const cut = moments.length ? await cutOf(slug).catch(() => undefined) : undefined;
  const filmEnd = cut ? timelineLength({ tracks: cut.tracks }) : undefined;

  const mid = q.get('moment');
  if (!mid) {
    // the shapes of the option files, for their waveforms, and which option the cut has at each moment
    const files = [...new Set([...card.media.filter((m) => m.kind === 'audio').map((m) => m.path), ...moments.flatMap((m) => Object.values(m.places).map((p) => p.file)), ...(card.sounds ?? []).flatMap((s) => s.tries.map((t) => t.file).filter((f): f is string => !!f))])];
    const repoForm = (p: string) => (p.startsWith('assets/') ? p : `assets/films/${slug}/${p}`);
    const resolve = cut?.resolve ?? (isMock() ? async (p: string) => soundCardsFile(repoForm(p))?.real ?? (await soundMedia(repoForm(p)))?.real : async (p: string) => { const f = await routeFilm(slug).catch(() => undefined); return f ? resolveSrc(f, p) : undefined; });
    const peaks: Record<string, number[]> = {}, seconds: Record<string, number> = {};
    for (const f of files.slice(0, 60)) {
      const file = await resolve(f);
      if (!file) continue;
      const [pk, pr] = await Promise.all([peaksOf(file), probe(file)]);
      if (pk) peaks[f] = pk;
      if (pr?.duration) seconds[f] = pr.duration;
    }
    const at: Record<string, { inCut?: string; start: number; end: number; capped?: true }> = {};
    for (const m of moments) {
      const w = windowOf(m, filmEnd);
      at[m.id] = { start: w.start, end: w.end, ...(w.capped ? { capped: true } : {}), ...(cut ? { inCut: piecesFor(cut.tracks, m, undefined, w).inCut } : {}) };
    }
    return Response.json({ peaks, seconds, moments: at, cut: cut ? { version: cut.version, picture: cut.picture ? { version: cut.picture.version, stale: cut.picture.stale } : null } : null }, { headers: NO_STORE });
  }

  const moment = moments.find((m) => m.id === mid);
  if (!moment) return bad(404, `the card does not place a sound at "${mid}"`);
  const option = q.get('option') || undefined;
  if (option && !moment.places[option]) return bad(404, `option ${option} is not laid at ${mid}`);
  if (!cut) return bad(404, 'the film has no cut to hear it in');
  try {
    const clip = await hearClip({ film: slug, tracks: cut.tracks, moment, option, picture: cut.picture?.file, filmEnd, resolve: cut.resolve });
    if (q.get('warm') === '1') return Response.json({ ok: true, ...(clip.inCut ? { inCut: clip.inCut } : {}), pieces: clip.pieces, skipped: clip.skipped }, { headers: NO_STORE });
    return await send(req, clip.file);
  } catch (e) {
    return bad(500, e instanceof Error ? e.message : String(e));
  }
}
