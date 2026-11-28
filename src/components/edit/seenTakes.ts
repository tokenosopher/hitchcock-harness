'use client';
// The takes the user has looked at (before, a list in this browser's localStorage):
// a take is looked at once it is played, one of its shots tried, or it is put in the film on the Edit page. The list is
// the server's (harness/takes-seen.json, src/server/edit/seenTakes.ts), so the phone and the Mac agree; it is asked
// again when the page comes back into view. A ready take not looked at, landed after the list began, is new: the "new"
// tag beside its name in the Takes view, the dot on its scene in the strip, the clip's "1 new take" mark, What's next's
// "n new takes to check".
//
// When the list began: the first page to load after this change. The takes that landed before it count as seen, so the
// film's old takes do not all turn new, except those that page still showed as new by the old rule (a clip's "1 new
// take" mark, a variation never clicked, from this browser's old list): they stay new (`keep`). The old list is then
// handed to the server and dropped from this browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Timeline } from '@/server/types';
import { newTakes } from './openAt';
import type { BySrc, TakeShots } from './shots';

const localKey = (film: string) => `hh:takes-seen:${film}`;
/** The take an old entry names: a shot tried was kept as "<src>#<shot>", a variation clicked as its src. */
const srcOfOld = (k: string) => k.replace(/#[0-9]+[a-z]?$/i, '');

export interface Looked {
  /** The server has answered. */
  ready: boolean;
  /** When the film's list began (ms); null: not yet, nothing is new until the first page begins it. */
  since: number | null;
  seen: Set<string>;
  keep: Set<string>;
  /** This browser's old list (pickKeys and srcs), until it is handed to the server. */
  old: Set<string>;
}
const EMPTY: Looked = { ready: false, since: null, seen: new Set(), keep: new Set(), old: new Set() };

/** A take not looked at yet: ready, not in the list, and landed after the list began (or kept new when it began). */
export function isNewTake(t: TakeShots, l: Looked): boolean {
  if (!l.ready || l.since === null || t.state !== 'ready' || l.seen.has(t.src)) return false;
  return l.keep.has(t.src) || (t.made !== undefined && t.made > l.since);
}
/** For openAt's newTakes: the takes that are not new, though landed after the cut's own. */
export const notNew = (l: Looked) => (t: TakeShots) => !isNewTake(t, l);

function readOld(film: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(localKey(film)) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
const dropOld = (film: string) => { try { localStorage.removeItem(localKey(film)); } catch { /* none kept */ } };

export function useSeenTakes(film: string): { looked: Looked; add: (srcs: string[]) => void; begin: (keep: string[]) => void } {
  const [looked, setLooked] = useState<Looked>(EMPTY);
  const began = useRef(false);
  const take = useCallback((j: { since: number | null; seen: string[]; keep: string[] }, old?: Set<string>) => {
    setLooked((cur) => {
      // what this page added while the answer was on its way stays
      const seen = new Set([...j.seen, ...(cur.ready ? cur.seen : [])]);
      return { ready: true, since: j.since, seen, keep: new Set(j.keep), old: old ?? cur.old };
    });
  }, []);
  const post = useCallback(async (body: { seen: string[]; begin?: { keep: string[] } }) => {
    try {
      const r = await fetch(`/api/films/${encodeURIComponent(film)}/seen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) return false;
      take(await r.json() as { since: number | null; seen: string[]; keep: string[] });
      return true;
    } catch { return false; }
  }, [film, take]);

  useEffect(() => {
    let live = true;
    began.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- another film: its own list, asked of the server below
    setLooked(EMPTY);
    const load = async () => {
      try {
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/seen`, { cache: 'no-store' });
        if (!r.ok || !live) return;
        const j = await r.json() as { since: number | null; seen: string[]; keep: string[] };
        const old = readOld(film);
        if (!live) return;
        take(j, old);
        // the list began elsewhere: this browser's old list joins it
        if (j.since !== null && old.size) { if (await post({ seen: [...new Set([...old].map(srcOfOld))] })) { dropOld(film); setLooked((c) => ({ ...c, old: new Set() })); } }
      } catch { /* the page works without it: nothing is new */ }
    };
    void load();
    // looked at on the other device: asked again when this page comes back into view
    const back = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { live = false; document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [film, take, post]);

  const now = useRef(looked);
  useEffect(() => { now.current = looked; });
  const add = useCallback((srcs: string[]) => {
    const fresh = [...new Set(srcs)].filter((s) => !now.current.seen.has(s));
    if (!fresh.length) return;
    now.current = { ...now.current, seen: new Set([...now.current.seen, ...fresh]) };
    setLooked((cur) => ({ ...cur, seen: new Set([...cur.seen, ...fresh]) }));
    void post({ seen: fresh });
  }, [post]);

  const begin = useCallback((keep: string[]) => {
    if (began.current) return;
    began.current = true;
    const old = readOld(film);
    void post({ seen: [...new Set([...old].map(srcOfOld))], begin: { keep } }).then((ok) => { if (ok) dropOld(film); else began.current = false; });
  }, [film, post]);

  return { looked, add, begin };
}

/** The first page to load after the change begins the film's list, once its cut and takes are read: the takes it still
 *  shows as new by the old rule stay new (the clips' "1 new take" marks, from this browser's old list; variations
 *  never clicked here). */
export function useBeginSeen(s: { looked: Looked; begin: (keep: string[]) => void }, tl: Timeline | undefined, shots: { takes: TakeShots[]; by: BySrc; waiting: number; loaded: boolean }): void {
  const { looked, begin } = s;
  const { takes, by, waiting, loaded } = shots;
  useEffect(() => {
    // a film with no take yet begins it too: its first takes, when they land, are new
    if (!looked.ready || looked.since !== null || !tl || !loaded || waiting > 0) return;
    // every take a mark counts (the newest of its shot and the ones behind it), and the variations never clicked
    const marked = [...newTakes(tl, by, takes, looked.old).values()].flatMap((m) => m.srcs);
    const varied = takes.filter((t) => t.variation && t.state === 'ready' && !looked.old.has(t.src)).map((t) => t.src);
    begin([...new Set([...marked, ...varied])]);
  }, [looked, begin, tl, takes, by, waiting, loaded]);
}
