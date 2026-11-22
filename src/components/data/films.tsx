'use client';
// The films registry and the library counts: live on every page (the sidebar is never a snapshot).
// `recent`: when each film last moved up the sidebar, newest first: the user wrote in it (a message, a card's answer,
// Done picking), or something new needs them (Alma's reply landed, a new card came in). Never Alma working in the
// background, the app's writes, or opening the film. The server keeps the record (GET
// /api/films/recent, so the phone and the Mac agree) and the page reads it again on focus and every 15 s while it is
// shown; its own sends (almaOutbox's onPosted) and the notices it hears (useNotify's `moved`) move a film at once.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FilmRef } from '@/server/types';
import { onPosted } from './almaOutbox';
import { useNotify } from '@/components/notify/NotifyProvider';

export interface LibraryCounts { faces: number; voices: number; characters: number; locations: number; note?: string }
/** drive: the x-harness-drive header of GET /api/films ("connected" | "not connected"). */
interface FilmsState { films: FilmRef[]; library?: LibraryCounts; drive?: 'connected' | 'not connected'; error?: string; loaded: boolean }
interface FilmsValue extends FilmsState {
  /** Films started in this window, newest first: the sidebar puts them at the top of "In progress". */
  started: string[];
  /** A film just made on the Idea page: listed at once, then the registry is read again. */
  add: (film: FilmRef) => void;
  reload: () => Promise<void>;
  /** When each film last moved up (ISO): the user wrote in it, or something new needs them. */
  recent: Record<string, string>;
}

const Ctx = createContext<FilmsValue>({ films: [], loaded: false, started: [], add: () => {}, reload: async () => {}, recent: {} });

async function load(): Promise<FilmsState> {
  const [f, l] = await Promise.all([fetch('/api/films', { cache: 'no-store' }).catch(() => undefined), fetch('/api/library').catch(() => undefined)]);
  const films = f?.ok ? ((await f.json()) as FilmRef[]) : [];
  const error = f?.ok ? undefined : f ? ((await f.json().catch(() => ({}))) as { error?: string }).error ?? `films: ${f.status}` : 'The harness server is not answering';
  const library = l?.ok ? ((await l.json()) as LibraryCounts) : undefined;
  const h = f?.headers.get('x-harness-drive');
  const drive = h === 'not connected' ? 'not connected' : h === 'connected' || f?.ok ? 'connected' : undefined;
  return { films, library, drive, error, loaded: true };
}

export function FilmsProvider({ children }: { children: React.ReactNode }) {
  const [v, setV] = useState<FilmsState>({ films: [], loaded: false });
  const [started, setStarted] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void load().then((s) => { if (live) setV(s); });
    return () => { live = false; };
  }, []);
  const reload = useCallback(async () => {
    const s = await load();
    // a just-made film the registry has not caught up with stays listed
    setV((cur) => ({ ...s, films: [...cur.films.filter((f) => started.includes(f.slug) && !s.films.some((x) => x.slug === f.slug)), ...s.films] }));
  }, [started]);
  const [recent, setRecent] = useState<Record<string, string>>({});
  /** Moves a film up here at once; the server notes the same itself. */
  const bump = useCallback((slug: string) => {
    const now = new Date().toISOString();
    setRecent((r) => ({ ...r, [slug]: now }));
  }, []);
  // the server's record, merged so a move made here a moment ago is not undone by an older reading
  const readRecent = useCallback(async () => {
    const r = await fetch('/api/films/recent', { cache: 'no-store' }).catch(() => undefined);
    if (!r?.ok) return;
    const got = (await r.json().catch(() => ({}))) as Record<string, string>;
    setRecent((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const [k, v] of Object.entries(got)) if (typeof v === 'string' && (!next[k] || v > next[k])) { next[k] = v; changed = true; }
      return changed ? next : cur;
    });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the server's record once it answers
    void readRecent();
    const again = () => { if (document.visibilityState === 'visible') void readRecent(); };
    const t = setInterval(again, 15000);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { clearInterval(t); window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [readRecent]);
  // a message, an answer or Done picking sent from this page moves its film at once (sendToAlma notes it on the server)
  useEffect(() => onPosted((film, ok) => { if (ok) bump(film); }), [bump]);
  // her reply or a new card, heard on the notices' stream
  const { moved } = useNotify();
  const order = useMemo(() => {
    let out = recent;
    for (const [k, at] of Object.entries(moved)) if (!out[k] || at > out[k]) out = { ...out, [k]: at };
    return out;
  }, [recent, moved]);

  const add = useCallback((film: FilmRef) => {
    // a film just made goes first (its first message to Alma follows at once)
    bump(film.slug);
    setStarted((l) => [film.slug, ...l.filter((s) => s !== film.slug)]);
    setV((cur) => ({ ...cur, films: [film, ...cur.films.filter((f) => f.slug !== film.slug)] }));
  }, [bump]);
  return <Ctx.Provider value={{ ...v, started, add, reload, recent: order }}>{children}</Ctx.Provider>;
}

export const useFilms = () => useContext(Ctx);
