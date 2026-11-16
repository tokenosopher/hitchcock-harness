'use client';
// The Release pages' layout by the width the PAGE has (14 Nov 2026, the Release QC), not the window's: the films list
// and Alma's column both open and close, so a 1440 window gives the page anywhere from 808 to 1336 px. The platform
// page measures its own width (one tree, so typing and open boxes survive a change of layout) and picks:
//   three  ≥ 1000 px: How it will look | The text | Sending it, side by side, each scrolling on its own
//   two    ≥ 640 px:  The text (with "How it will look" folded at its top) | Sending it
//   one    below:     one column; Sending it after the text, and its main button and state in a dock at the foot
//                     that stays in view while the page scrolls
// The phone (under 760 px of window) has its own page (PhoneRelease.tsx) built from the same parts, the dock in the
// phone bar. A change of layout fades the page in (200 ms) instead of jumping. The Release page itself uses container
// queries (ReleaseOpen.tsx): the film beside the list from 760 px, stacked below.
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export type Layout = 'three' | 'two' | 'one';
/** The page widths the layouts start at. */
export const LAYOUT_AT = { three: 1000, two: 640 } as const;
export const layoutFor = (w: number): Layout => (w >= LAYOUT_AT.three ? 'three' : w >= LAYOUT_AT.two ? 'two' : 'one');

/** The element's width, measured before the first paint and followed as it changes. */
export function useWidth(el: HTMLElement | null): number | undefined {
  const [w, setW] = useState<number>();
  useLayoutEffect(() => {
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured before the first paint, so the layout is right at once
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

/** Fades `el` in when `key` changes (a new layout): the parts move to their new places under a 200 ms fade. */
export function useFadeOn(el: HTMLElement | null, key: string) {
  const [last, setLast] = useState(key);
  useLayoutEffect(() => {
    if (key === last) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remembers the layout this fade was for
    setLast(key);
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }, [key, last, el]);
}

// ---- the dock: Sending it's main button at the foot of a one-column page

const DockCtx = createContext<HTMLElement | null>(null);
export const DockProvider = DockCtx.Provider;
/** Whether the page has a dock (one column, or the phone bar). */
export const useDock = () => useContext(DockCtx);

/** The main action of Sending it. With a dock it is drawn there (a portal, so it is one button, not a copy); in a
 *  column it stays at the column's foot, in view while the column scrolls. `dockOnly`: nothing in a column. */
export function DockSlot({ children, dockOnly, className }: { children: React.ReactNode; dockOnly?: boolean; className?: string }) {
  const dock = useDock();
  if (dock) return createPortal(children, dock);
  if (dockOnly) return null;
  return <div data-send-actions className={cn('sticky bottom-0 z-[1] -mb-4 mt-auto flex flex-col gap-2 bg-bg pb-4 pt-2', className)}>{children}</div>;
}

/** A quiet button in the dock that brings a part of Sending it into view ("Her card"). */
export function JumpTo({ target, children }: { target: string; children: React.ReactNode }) {
  return (
    <button type="button" data-dock-jump onClick={() => [...document.querySelectorAll(target)].find((e) => e.getClientRects().length)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-[9px] border border-edge-strong bg-transparent px-3 text-[13px] text-ink transition-colors duration-150 hover:bg-raised">
      {children}
    </button>
  );
}

/** True while the user types in a field of the page: the dock and the phone bar step aside so the field stays in view
 *  above the keyboard. */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const on = () => {
      const a = document.activeElement as HTMLElement | null;
      setTyping(!!a && !!a.closest('main') && (a.matches('textarea, input:not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]')) && !a.closest('[data-send-dock], [data-phone-bar]'));
    };
    const off = () => setTimeout(on, 0);
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, []);
  return typing;
}
