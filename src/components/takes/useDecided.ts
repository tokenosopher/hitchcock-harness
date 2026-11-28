'use client';
// The decisions made on the New takes page, the server's list (harness/takes-decided.json,
// server/edit/takeDecisions.ts), so the phone and the Mac agree; asked again when the page comes back into view.
import { useCallback, useEffect, useRef, useState } from 'react';
import { readDecidedMap, type DecidedMap, type Decision } from './decisions';

export function useDecided(film: string): { decided: DecidedMap; ready: boolean; decide: (src: string, d: Decision | null) => Promise<boolean> } {
  const [state, setState] = useState<{ film: string; decided: DecidedMap; ready: boolean }>({ film, decided: {}, ready: false });
  const now = useRef(state);
  useEffect(() => { now.current = state; });
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/decided`, { cache: 'no-store' });
        if (!r.ok || !live) return;
        const j = await r.json() as { decided?: unknown };
        if (live) setState({ film, decided: readDecidedMap(j.decided), ready: true });
      } catch { /* the page works without it: nothing decided */ }
    };
    void load();
    const back = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { live = false; document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [film]);
  const decide = useCallback(async (src: string, d: Decision | null): Promise<boolean> => {
    // shown at once; the server's answer then stands
    setState((cur) => {
      const next = { ...cur.decided };
      if (d === null) delete next[src]; else next[src] = { d, at: Date.now() };
      return { ...cur, decided: next };
    });
    try {
      const r = await fetch(`/api/films/${encodeURIComponent(film)}/decided`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ src, d }) });
      if (!r.ok) return false;
      const j = await r.json() as { decided?: unknown };
      setState((cur) => ({ ...cur, decided: readDecidedMap(j.decided), ready: true }));
      return true;
    } catch { return false; }
  }, [film]);
  return { decided: state.film === film ? state.decided : {}, ready: state.film === film && state.ready, decide };
}
