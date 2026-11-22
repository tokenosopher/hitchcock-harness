// SSE of HarnessNotice for every film at once: Alma finished a turn, a sub-agent finished, picks are waiting.
// On connect: `event: hello` with {seq}; then, with ?after=<seq> (the last notice the page saw, kept in
// localStorage) or Last-Event-ID, the notices that came after it; then each new one, `id:` = its seq.
// Through a Cloudflare tunnel the stream is short, like the thread stream (src/server/sse.ts).
// `event: running` with the films whose Alma is at work, sorted (the sidebar's glowing orb): once on connect, then
// each time that set changes. No `id:`, so it never moves the notices' Last-Event-ID. Sample films (MOCK=boards):
// a sample's turn is open from a message until its result or Stop (src/fixtures/mock.ts).
import { connection } from 'next/server';
import { isMock, mockRunning, mockSubscribeRunning } from '@/fixtures/mock';
import { notifyHub } from '@/server/claude/notify';
import type { HarnessNotice } from '@/server/types';
import { lastEventId, shortStream, TUNNEL_RETRY_MS, viaTunnel } from '@/server/sse';

export async function GET(req: Request): Promise<Response> {
  await connection();
  const hub = notifyHub();
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
      const send = (n: HarnessNotice): void => write(`id: ${n.seq}\ndata: ${JSON.stringify(n)}\n\n`);

      if (short) write(`retry: ${TUNNEL_RETRY_MS}\n\n`);
      write(`event: hello\ndata: ${JSON.stringify({ seq: hub.currentSeq() })}\n\n`);
      const after = lastEventId(req);
      const missed = after !== undefined ? hub.since(after) : undefined;
      if (missed?.length) { for (const n of missed) send(n); ender.news(); }
      else write(`id: ${hub.currentSeq()}\n\n`);
      const unsubscribe = hub.subscribe((n) => { send(n); ender.news(); });
      const sendRunning = (films: string[]): void => write(`event: running\ndata: ${JSON.stringify(films)}\n\n`);
      const now = isMock() ? mockRunning() : hub.runningNow();
      sendRunning(now);
      // through a tunnel a page's first stream delivers it at once when something runs (a reconnect already has it)
      if (now.length && !req.headers.has('last-event-id')) ender.news();
      const offRunning = (isMock() ? mockSubscribeRunning : hub.subscribeRunning.bind(hub))((films) => { sendRunning(films); ender.news(); });
      const ping = setInterval(() => write(': ping\n\n'), 15000);
      cleanup = () => {
        if (done) return;
        done = true;
        open = false;
        clearInterval(ping);
        ender.stop();
        unsubscribe();
        offRunning();
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
