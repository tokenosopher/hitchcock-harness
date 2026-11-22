'use client';
// One film's FilmState: fetched once, then replaced on every SSE frame from the state stream.
// The stream can go quiet without an error (a tunnel that buffers it), so while it has delivered
// nothing for 20 s the state is fetched again every 15 s.
// What "Done picking" sent and the state does not show answered yet (choices.ts, Sent; the rule in lib/sent.ts, which the
// server's count of "Waiting for you" uses too) is laid over the state every
// page reads: its cards leave feed.asks and its picks are named in `sentKeys`, so "Waiting for you", its counts and
// the board drop them at once. `raw` is the state as the server sent it; `refresh` reads it again now.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FilmState } from '@/server/types';
import { listedKeys, withSent } from '@/components/lib/sent';
import { unsend, useSent } from './choices';

interface FilmValue { state?: FilmState; raw?: FilmState; error?: string; refresh?: () => void }
const Ctx = createContext<FilmValue>({});

const SILENT_AFTER_MS = 20_000;
const POLL_MS = 15_000;

export function FilmProvider({ film, children }: { film: string; children: React.ReactNode }) {
  const [v, setV] = useState<{ state?: FilmState; error?: string }>({});
  const reload = useRef<() => void>(() => undefined);
  useEffect(() => {
    let live = true;
    let lastHeard = Date.now();
    let lastPoll = Date.now();
    // the state as last read, word for word: the same state again (a poll, a reconnect) is not a new state, so the
    // whole app does not render again and the pages do not fetch their own data again
    let lastRaw = '';
    const take = (raw: string): void => {
      if (!live || raw === lastRaw) return;
      try { const state = JSON.parse(raw) as FilmState; lastRaw = raw; setV({ state }); } catch { /* a partial frame */ }
    };
    const load = (initial: boolean) =>
      fetch(`/api/films/${film}/state`, { cache: 'no-store' })
        .then(async (r) => {
          if (r.ok) { take(await r.text()); return; }
          const error = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `state: ${r.status}`;
          if (live && initial) setV({ error });
        })
        .catch(() => { if (live && initial) setV({ error: 'The harness server is not answering' }); });
    void load(true);
    reload.current = () => { void load(false); };
    const es = new EventSource(`/api/films/${film}/state?stream=1`);
    es.onopen = () => { lastHeard = Date.now(); };
    es.addEventListener('ping', () => { lastHeard = Date.now(); });
    es.onmessage = (m) => {
      lastHeard = Date.now();
      take(m.data);
    };
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastHeard > SILENT_AFTER_MS && now - lastPoll >= POLL_MS) {
        lastPoll = now;
        void load(false);
      }
    }, 1000);
    return () => { live = false; es.close(); clearInterval(timer); };
  }, [film]);
  const sent = useSent(film);
  const raw = v.state;
  // a sent item the server's state no longer lists is answered there: it is no longer kept aside
  useEffect(() => {
    if (!raw || !sent.length) return;
    const still = listedKeys(raw);
    const done = sent.filter((x) => !still.has(x.key)).map((x) => x.key);
    if (done.length) unsend(film, done);
  }, [film, raw, sent]);
  const refresh = useCallback(() => reload.current(), []);
  const value = useMemo<FilmValue>(() => ({ ...v, state: raw ? withSent(raw, sent) : raw, raw, refresh }), [v, raw, sent, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFilm = () => useContext(Ctx);
