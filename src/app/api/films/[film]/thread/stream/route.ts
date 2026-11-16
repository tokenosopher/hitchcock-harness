// SSE of ThreadEvent while Alma works. On connect: `event: info` (ThreadInfo), then a replay of this
// server's live events, then every new event as it happens. Plain `data:` lines are ThreadEvents;
// the UI upserts by (kind, id): a partial assistant_text is replaced by later ones and by the final.
// Each ThreadEvent frame carries `id:` (its emission number); a reconnect with Last-Event-ID gets only
// what came after it. Through a Cloudflare tunnel the stream is short (see src/server/sse.ts).
import { connection } from 'next/server';
import { isMock, mockSubscribe, sseResponse } from '@/fixtures/mock';
import { getAlma } from '@/server/claude/process';
import { validFilm } from '@/server/claude/thread';
import type { ThreadEvent, ThreadInfo } from '@/server/types';
import { lastEventId, shortStream, TUNNEL_RETRY_MS, viaTunnel } from '@/server/sse';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  if (isMock()) return sseResponse((write) => mockSubscribe(film, write), req.signal); // fixture shim, removed at integration
  const alma = getAlma(film);
  await alma.currentSessionId();
  const enc = new TextEncoder();
  let cleanup = (): void => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      let done = false;
      const write = (chunk: string): void => {
        if (!open) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { open = false; }
      };
      const short = viaTunnel(req);
      const ender = shortStream(short, () => cleanup());
      const sendEvent = (ev: ThreadEvent): void => {
        const seq = alma.seqFor(ev);
        write(`${seq ? `id: ${seq}\n` : ''}data: ${JSON.stringify(ev)}\n\n`);
      };
      const sendInfo = (info: ThreadInfo): void => write(`event: info\ndata: ${JSON.stringify(info)}\n\n`);

      if (short) write(`retry: ${TUNNEL_RETRY_MS}\n\n`);
      sendInfo(alma.info());
      const after = lastEventId(req);
      const since = after !== undefined ? alma.eventsSince(after) : undefined;
      if (since) {
        // a reconnect: only what it has not seen (partials included, the next one replaces them)
        for (const ev of since) sendEvent(ev);
        if (since.length) ender.news();
      } else {
        const replay = new URL(req.url).searchParams.get('replay') !== '0';
        if (replay) for (const ev of alma.liveEvents().filter((e) => !(e.kind === 'assistant_text' && e.partial)).slice(-500)) sendEvent(ev);
        write(`id: ${alma.currentSeq()}\n\n`); // so the reconnect asks only for what comes next
        ender.news(); // a first connect: the info frame is news
      }
      const unsubscribe = alma.subscribe(
        (ev) => { sendEvent(ev); ender.news(); },
        (info) => { sendInfo(info); ender.news(); },
      );
      // a named event, not a comment: the page hears it and counts the stream as alive, so it does not fall back
      // to fetching the whole thread every 10 s (3.8 MB for a long film) while Alma is quiet
      const ping = setInterval(() => write('event: ping\ndata: \n\n'), 15000);
      cleanup = () => {
        if (done) return;
        done = true;
        open = false;
        clearInterval(ping);
        ender.stop();
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
