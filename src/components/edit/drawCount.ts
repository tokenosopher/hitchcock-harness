// How often a component is drawn, for the browser tests (tests/edit/27-renders.mjs, 40-timing): each commit of the
// component adds one to window.__hhDraws[name]. Outside production only; it changes nothing on the page.
import { useEffect } from 'react';

export function useDrawCount(name: string): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __hhDraws?: Record<string, number> };
    // a test once put a number under this name: counting must never be able to break the page
    if (typeof w.__hhDraws !== 'object' || w.__hhDraws === null) w.__hhDraws = {};
    const d = w.__hhDraws;
    d[name] = (d[name] ?? 0) + 1;
  });
}
