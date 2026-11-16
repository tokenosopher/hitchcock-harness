'use client';
// One film's FilmState: fetched once, then replaced on every SSE frame from the state stream.
// The stream can go quiet without an error (a tunnel that buffers it), so while it has delivered
// nothing for 20 s the state is fetched again every 15 s.
import { createContext, useContext, useEffect, useState } from 'react';
import type { FilmState } from '@/server/types';

interface FilmValue { state?: FilmState; error?: string }
const Ctx = createContext<FilmValue>({});

const SILENT_AFTER_MS = 20_000;
const POLL_MS = 15_000;

export function FilmProvider({ film, children }: { film: string; children: React.ReactNode }) {
  const [v, setV] = useState<FilmValue>({});
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
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export const useFilm = () => useContext(Ctx);
