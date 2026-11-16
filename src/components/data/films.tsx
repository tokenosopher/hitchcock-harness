'use client';
// The films registry and the library counts: live on every page (the sidebar is never a snapshot).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { FilmRef } from '@/server/types';

export interface LibraryCounts { faces: number; voices: number; characters: number; locations: number; note?: string }
/** drive: the x-harness-drive header of GET /api/films ("connected" | "not connected"). */
interface FilmsState { films: FilmRef[]; library?: LibraryCounts; drive?: 'connected' | 'not connected'; error?: string; loaded: boolean }
interface FilmsValue extends FilmsState {
  /** Films started in this window, newest first: the sidebar puts them at the top of "In progress". */
  started: string[];
  /** A film just made on the Idea page: listed at once, then the registry is read again. */
  add: (film: FilmRef) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<FilmsValue>({ films: [], loaded: false, started: [], add: () => {}, reload: async () => {} });

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
  const add = useCallback((film: FilmRef) => {
    setStarted((l) => [film.slug, ...l.filter((s) => s !== film.slug)]);
    setV((cur) => ({ ...cur, films: [film, ...cur.films.filter((f) => f.slug !== film.slug)] }));
  }, []);
  return <Ctx.Provider value={{ ...v, started, add, reload }}>{children}</Ctx.Provider>;
}

export const useFilms = () => useContext(Ctx);
