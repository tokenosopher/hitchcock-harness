'use client';
// The takes looked at in this browser (the clip's "1 new take" mark, What's next's "Go and check"):
// a shot of a take once put in its place on the Edit page is remembered here (localStorage, by pickKey), so its mark
// goes. The Edit page adds to it; the film page only reads it, to say how many new takes wait to be checked.
import { useCallback, useEffect, useState } from 'react';

const keyOf = (film: string) => `hh:takes-seen:${film}`;

export function useSeenTakes(film: string): [Set<string>, (keys: string[]) => void] {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(keyOf(film)) ?? '[]') as unknown;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this browser's storage, which the server render cannot see
      if (Array.isArray(v)) setSeen(new Set(v.filter((x): x is string => typeof x === 'string')));
    } catch { /* nothing kept */ }
  }, [film]);
  const add = useCallback((keys: string[]) => {
    setSeen((cur) => {
      const add = keys.filter((k) => !cur.has(k));
      if (!add.length) return cur;
      const next = new Set([...cur, ...add]);
      try { localStorage.setItem(keyOf(film), JSON.stringify([...next].slice(-2000))); } catch { /* this tab only */ }
      return next;
    });
  }, [film]);
  return [seen, add];
}

