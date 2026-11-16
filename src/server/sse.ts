// Server-sent events that also work through a cloudflared quick tunnel. The trycloudflare edge holds a
// streamed response until it ends (tested 8 Nov 2026: padding up to 1 MB, other content types, HTTP/1.1,
// Content-Encoding: identity, plain Node without Next: nothing arrives before the end; see
// docs/claude-p.md, "Streams through a tunnel"). So a request that came through Cloudflare gets a short
// stream: it ends soon after it has sent something new, or after IDLE_MS with nothing, and the
// EventSource reconnects (`retry:`) with Last-Event-ID so nothing is sent twice or lost.

/** True when the request reached us through Cloudflare (a quick tunnel), where streams are buffered. */
export function viaTunnel(req: Request): boolean {
  const q = new URL(req.url).searchParams.get('short');
  if (q === '1') return true;
  if (q === '0') return false;
  return req.headers.has('cf-ray') || req.headers.has('cdn-loop');
}

export const TUNNEL_RETRY_MS = 500; // how soon the EventSource reconnects after a short stream ends
export const TUNNEL_SETTLE_MS = 250; // end this long after the last news, so a burst goes in one response
export const TUNNEL_HOLD_MS = 1000; // but never hold news longer than this (partial text streams without pause)
export const TUNNEL_IDLE_MS = 15_000; // end an empty stream: the reconnect tells the client the stream is alive (it polls after 20 s of silence)

/** The client's Last-Event-ID as a number (header on reconnect, or ?after= on a first connect). */
export function lastEventId(req: Request): number | undefined {
  const raw = req.headers.get('last-event-id') ?? new URL(req.url).searchParams.get('after');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Ends a short stream: call `news()` after writing something the client has not seen; the stream closes
 * TUNNEL_SETTLE_MS after the last news (at most TUNNEL_HOLD_MS after the first), or at TUNNEL_IDLE_MS.
 * No-op handles when not short.
 */
export function shortStream(short: boolean, close: () => void): { news: () => void; stop: () => void } {
  if (!short) return { news: () => undefined, stop: () => undefined };
  let settle: ReturnType<typeof setTimeout> | undefined;
  let hold: ReturnType<typeof setTimeout> | undefined;
  const idle = setTimeout(close, TUNNEL_IDLE_MS);
  return {
    news: () => {
      clearTimeout(settle);
      settle = setTimeout(close, TUNNEL_SETTLE_MS);
      hold ??= setTimeout(close, TUNNEL_HOLD_MS);
    },
    stop: () => {
      clearTimeout(settle);
      clearTimeout(hold);
      clearTimeout(idle);
    },
  };
}
