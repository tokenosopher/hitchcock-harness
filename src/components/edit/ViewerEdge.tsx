'use client';
// The edge between the Edit page's viewer and the timeline's column, dragged to make the picture larger or smaller
//. While it moves it writes one CSS variable on the viewer's
// column, once an animation frame, and nothing else: the page is not drawn again by React. When the drag ends the
// width is kept in this browser and comes back on the next visit, before the first paint (the column mounts with the
// page, after its data). Double click or double tap puts it back, easing; the arrow keys move it, Home and End go to
// either end. A press of the mouse does not focus it, so after a drag the arrow keys still move the playhead; Tab does. It looks and lights like the films list's and Alma's edges (shell/Edge.tsx).
import { memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { clampWidth, isDoubleTap, keyWidth, maxWidth, parseWidth, TAP_SLOP, VIEWER_W } from './viewerWidth';

const LABEL = 'The width of the viewer';
const EASE = 'cubic-bezier(.2,.8,.2,1)';

const readStored = (): number | undefined => { try { return parseWidth(window.localStorage.getItem(VIEWER_W.key)); } catch { return undefined; } };
const store = (w: number | undefined): void => {
  try {
    if (w === undefined) window.localStorage.removeItem(VIEWER_W.key);
    else window.localStorage.setItem(VIEWER_W.key, String(w));
  } catch { /* a private window: the width lasts for the visit */ }
};

type Drag = { id: number; x0: number; w0: number; max: number; x: number; moved: boolean; raf: number };

// memo: the page draws itself again on every frame while it plays; the edge has nothing new to show then
export const ViewerEdge = memo(function ViewerEdge({ colRef, aspect, className }: { colRef: React.RefObject<HTMLElement | null>; aspect: number; className?: string }) {
  const self = useRef<HTMLDivElement>(null);
  // the width asked for; the column shows it within the limits of the moment (the CSS clamp, viewerWidth.ts)
  const want = useRef<number>(VIEWER_W.initial);
  const drag = useRef<Drag | undefined>(undefined);
  const tap = useRef<{ t: number; x: number } | undefined>(undefined);
  const easing = useRef(0);

  const max = (): number => maxWidth(colRef.current?.parentElement?.clientWidth ?? window.innerWidth, window.innerHeight, aspect);
  const say = (m = max()): void => {
    const h = self.current;
    if (!h) return;
    h.setAttribute('aria-valuenow', String(clampWidth(want.current, m)));
    h.setAttribute('aria-valuemax', String(Math.round(m)));
  };
  const put = (w: number, m?: number): void => {
    want.current = w;
    colRef.current?.style.setProperty('--viewer-w', `${w}px`);
    say(m);
  };
  // the keys and the double click slide it; a drag follows the pointer with no transition
  const still = (): void => {
    window.clearTimeout(easing.current);
    if (colRef.current) colRef.current.style.transition = '';
  };
  const ease = (ms: number): void => {
    const el = colRef.current;
    if (!el || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    window.clearTimeout(easing.current);
    el.style.transition = `width ${ms}ms ${EASE}`;
    easing.current = window.setTimeout(() => { el.style.transition = ''; }, ms + 50);
  };

  // the remembered width, before the column is first painted
  useLayoutEffect(() => {
    const w = readStored();
    if (w !== undefined) put(w); else say();
    return () => {
      window.clearTimeout(easing.current);
      // gone in the middle of a drag (the page left): the pointer is the page's again
      if (drag.current) { cancelAnimationFrame(drag.current.raf); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the column mounts
  }, []);

  const back = (): void => {
    ease(240);
    put(VIEWER_W.initial);
    store(undefined);
  };

  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !colRef.current) return;
    e.preventDefault();
    still();
    const m = max();
    drag.current = { id: e.pointerId, x0: e.clientX, w0: clampWidth(want.current, m), max: m, x: e.clientX, moved: false, raf: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute('data-dragging', '');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX;
    if (Math.abs(d.x - d.x0) > TAP_SLOP) d.moved = true;
    if (d.moved && !d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; put(clampWidth(d.w0 + d.x - d.x0, d.max), d.max); });
  };
  const end = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = undefined;
    cancelAnimationFrame(d.raf);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.removeAttribute('data-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (d.moved) {
      const w = clampWidth(d.w0 + d.x - d.x0, d.max);
      put(w, d.max);
      store(w);
      tap.current = undefined;
      return;
    }
    if (e.type !== 'pointerup') return;
    // two clicks or taps close together: the width it always had
    const t = performance.now();
    if (isDoubleTap(tap.current, t, e.clientX)) { tap.current = undefined; back(); } else tap.current = { t, x: e.clientX };
  };
  const key = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const m = max();
    const w = keyWidth(e.key, e.shiftKey, clampWidth(want.current, m), m);
    if (w === undefined) return;
    // the page's own arrow keys (the playhead) must not take it too
    e.preventDefault();
    e.stopPropagation();
    ease(140);
    put(w, m);
    store(w);
  };

  return (
    <div className={cn('relative w-0 flex-none self-stretch', className)}>
      <div ref={self} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={LABEL} aria-valuemin={VIEWER_W.min} data-viewer-edge=""
        title={`${LABEL}. Drag to resize, double click to put it back.`}
        onPointerDown={down} onMouseDown={(e) => e.preventDefault()} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={key} onFocus={() => say()}
        className="group sticky top-14 z-20 -ml-px h-[calc(100dvh-56px)] w-3 cursor-col-resize touch-none outline-none">
        {/* over the timeline column's own border, beside the picture as it stays put: unseen until hovered, white while
            dragged or focused by the keyboard */}
        <span aria-hidden="true" className="absolute inset-y-0 left-px w-px bg-transparent transition-[background-color,width,left] duration-150 ease-out group-hover:left-0 group-hover:w-[3px] group-hover:bg-edge-strong group-focus-visible:left-0 group-focus-visible:w-[3px] group-focus-visible:bg-ink group-data-[dragging]:left-0 group-data-[dragging]:w-[3px] group-data-[dragging]:bg-ink" />
      </div>
    </div>
  );
});
