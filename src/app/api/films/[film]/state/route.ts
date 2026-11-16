import { createHash } from 'node:crypto';
import { connection } from 'next/server';
import { isMock, mockState, mockWatch } from '@/fixtures/mock';
import { getFilmState, type FilmStateX } from '@/server/films/state';
import { subscribeFilm } from '@/server/films/watcher';
import { shortStream, TUNNEL_RETRY_MS, viaTunnel } from '@/server/sse';

// GET FilmState (with `warnings` and an `extra` side channel); ?stream=1 → SSE: the state now,
// then again on every change the watcher sees in the film's folder. Each frame's `id:` is a hash of the
// state, so a reconnect (Last-Event-ID) that already has it gets nothing until the next change. Through
// a Cloudflare tunnel the stream is short (see src/server/sse.ts).
export async function GET(req: Request, { params }: RouteContext<'/api/films/[film]/state'>) {
  await connection();
  const { film } = await params;
  const stream = new URL(req.url).searchParams.get('stream') === '1';
  if (isMock()) {
    const state = mockState(film);
    if (!state) return Response.json({ error: `No film "${film}"` }, { status: 404 });
    // a change in memory (a sample release, stage 3; a sample story or script saved, ASKS 64) sends the state again,
    // read afresh, with a new time, as the watcher would
    return stream ? sse(req, (write) => { write(state); return mockWatch(film, () => write({ ...(mockState(film) ?? state), updatedAt: new Date().toISOString() })); }) : Response.json(state);
  }
  const state = await getFilmState(film);
  if (!state) return Response.json({ error: `No film "${film}" in the registry (or the studio folder is missing)` }, { status: 404 });
  if (!stream) return Response.json(state, { headers: { 'cache-control': 'no-store' } });
  return sse(req, (write) => {
    write(state);
    let stop: (() => void) | undefined;
    let closed = false;
    void subscribeFilm(film, write).then((un) => (closed ? un?.() : (stop = un)));
    return () => {
      closed = true;
      stop?.();
    };
  });
}

/** A text/event-stream response: one `data:` frame per state (skipped when the client has it), a ping event every 15 s. */
function sse(req: Request, start: (write: (s: FilmStateX | unknown) => void) => (() => void) | void): Response {
  const signal = req.signal;
  const enc = new TextEncoder();
  const short = viaTunnel(req);
  let last = req.headers.get('last-event-id') ?? undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (chunk: string): void => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          open = false; // the client went away
        }
      };
      let stop: (() => void) | void = undefined;
      let done = false;
      // a named event the page hears (a comment fires nothing in EventSource): without it a quiet film looked like a
      // dead stream and the page fetched the whole state again every 15 s (1.2 MB for a long film) and re-rendered
      const ping = setInterval(() => send('event: ping\ndata: \n\n'), 15_000);
      const close = (): void => {
        if (done) return;
        done = true;
        open = false;
        clearInterval(ping);
        ender.stop();
        stop?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      const ender = shortStream(short, close);
      if (short) send(`retry: ${TUNNEL_RETRY_MS}\n\n`);
      stop = start((s) => {
        const json = JSON.stringify(s);
        const id = createHash('sha1').update(json).digest('hex').slice(0, 16);
        if (id === last) return;
        last = id;
        send(`id: ${id}\ndata: ${json}\n\n`);
        ender.news();
      });
      signal.addEventListener('abort', close);
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
