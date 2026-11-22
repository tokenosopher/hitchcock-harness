// Every message the app sends Alma, from anywhere. Two shared signals the thread client (thread.tsx) reads, so no button
// needs its own:
// - the outbox: a POST that will message Alma (the message box, a card's answer, Done picking, a pick, the Story
//   page's settle, the debrief) goes through `almaFetch`, which counts it as on its way until the server answers.
//   The folded phone bar reads that as "Sending…" at once.
// - `arrived`: a user message the thread did not know yet, from whichever sender (the ones above, a page that posts
//   with a plain fetch, another tab, the real Alma's queue) opens a turn: "Alma is working" until its result.
import type { ThreadEvent } from '@/server/types';

type Listener = () => void;
const out = new Map<string, number>();
const listeners = new Set<Listener>();
const posted = new Set<(film: string, ok: boolean) => void>();
const tell = () => listeners.forEach((l) => l());

/** How many messages to the film's Alma are on their way (POSTs not answered yet). */
export const outbound = (film: string): number => out.get(film) ?? 0;
export function subscribeOutbox(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
/** Called with the film after each POST of the outbox has been answered (`ok`: the server took it): the thread polls
 *  fast for her answer, and keeps reading "Sending" until her message shows on the thread. */
export function onPosted(fn: (film: string, ok: boolean) => void): () => void {
  posted.add(fn);
  return () => { posted.delete(fn); };
}

/** `fetch` for a request that messages the film's Alma: counted as on its way until the server answers. */
export async function almaFetch(film: string, url: string, init?: RequestInit): Promise<Response> {
  out.set(film, outbound(film) + 1);
  tell();
  let ok = false;
  try {
    const r = await fetch(url, init);
    ok = r.ok;
    return r;
  } finally {
    const n = outbound(film) - 1;
    if (n > 0) out.set(film, n); else out.delete(film);
    posted.forEach((fn) => { try { fn(film, ok); } catch { /* a closed thread */ } });
    tell();
  }
}

const ends = (e: ThreadEvent) => e.kind === 'result' || e.kind === 'error';

/** User messages in `events` the thread had not seen (`seen`), not answered yet, and younger than `windowMs`: each
 *  is a turn of Alma's now running or queued. Old ones (history, a replay of what is answered) are not. Marks every
 *  user message as seen. Answered: her turns take the messages in order, one result each; an error ends them all. */
export function arrived(events: ThreadEvent[], seen: Set<string>, now: number, windowMs: number): ThreadEvent[] {
  let waiting: ThreadEvent[] = [];
  for (const e of events) {
    if (e.kind === 'user') waiting.push(e);
    else if (e.kind === 'error') waiting = [];
    else if (ends(e)) waiting.shift();
  }
  const found = waiting.filter((e) => !seen.has(e.id) && now - Date.parse(e.at) < windowMs);
  for (const e of events) if (e.kind === 'user') seen.add(e.id);
  return found;
}
