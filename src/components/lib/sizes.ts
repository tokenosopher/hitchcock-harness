'use client';
// Sizes the user sets by dragging an edge: the width of the films sidebar, the width of the thread, the height of
// Alma's message box. Each is kept in this browser and comes back on the next visit.
import { useCallback, useSyncExternalStore } from 'react';

export const SIZES = {
  sidebar: { key: 'hh-size-sidebar', initial: 248, min: 180, max: 480 },
  thread: { key: 'hh-size-thread', initial: 384, min: 300, max: 760 },
  box: { key: 'hh-size-box', initial: 0, min: 0, max: 560 },      // 0 = as tall as its words need
} as const;
export type SizeName = keyof typeof SIZES;

const listeners = new Set<() => void>();
const cache = new Map<string, number>();

function read(name: SizeName): number {
  const s = SIZES[name];
  const hit = cache.get(s.key);
  if (hit !== undefined) return hit;
  let v: number = s.initial;
  try {
    const raw = window.localStorage.getItem(s.key);
    if (raw !== null && Number.isFinite(Number(raw))) v = Math.min(s.max, Math.max(s.min, Number(raw)));
  } catch { /* a private window: the size lasts for the visit */ }
  cache.set(s.key, v);
  return v;
}

export function setSize(name: SizeName, px: number): void {
  const s = SIZES[name];
  const v = Math.round(Math.min(s.max, Math.max(s.min, px)));
  if (cache.get(s.key) === v) return;
  cache.set(s.key, v);
  try { window.localStorage.setItem(s.key, String(v)); } catch { /* as above */ }
  for (const l of listeners) l();
}

export function useSize(name: SizeName): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => read(name), () => SIZES[name].initial);
}

const never = () => () => undefined;
/** False while React hydrates the server's HTML (the remembered sizes are not read yet), true after. A component
 *  mounted later, on a client navigation, is true at once. Until then the frame uses the CSS variables that
 *  shell/prepaint.ts sets before the first paint. */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}

/** Pointer handlers for an edge that is dragged. `sign` is +1 when moving right or down makes the thing larger. */
export function useDrag(name: SizeName, axis: 'x' | 'y', sign: 1 | -1, current: () => number) {
  return useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const from = current();
    const move = (m: PointerEvent) => setSize(name, from + sign * ((axis === 'x' ? m.clientX : m.clientY) - start));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [name, axis, sign, current]);
}
