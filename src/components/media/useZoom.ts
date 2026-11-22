'use client';
// The gestures of the full-screen view's zoom: pinch, drag and double-tap on the
// phone; the wheel or a trackpad pinch, a drag, a double-click and the + - 0 keys on a computer. The page itself can
// no longer zoom (its viewport has maximum-scale=1, for the message box), so the picture zooms inside the view. The
// picture is moved with the CSS `translate` and `scale` properties, written straight on the element during a gesture
// so it follows the fingers with no lag; the slide-in of a new picture runs on `transform` and never fights them.
// While zoomed a one-finger swipe pans; at fit it changes the picture. The maths: zoomMath.ts.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { clampView, FIT, isFit, keyScale, needsSharper, pan, pinch, sharperSrc, toggleAt, wheelScale, zoomAt, type ZoomFrame, type ZoomView } from './zoomMath';
import { swipeStep } from './zoomSet';

const EASE = '240ms cubic-bezier(0.2, 0.8, 0.2, 1)';
type Pt = { x: number; y: number };
type Gesture =
  | { kind: 'one'; id: number; from: Pt; start: ZoomView; at: number; moved: boolean; wasFit: boolean }
  | { kind: 'two'; m0: Pt; d0: number; start: ZoomView };

const mid = (a: Touch, b: Touch): Pt => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
const dist = (a: Touch, b: Touch): number => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
const onControl = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.('button, a, video, [data-no-zoom]');

/**
 * stage: the box the picture is seen through; img: the picture. `key` changes with the picture (each new one opens at
 * fit). onSwipe: a swipe at fit (+1 next, -1 before). onSharper: the address of a larger file worth loading now.
 */
export function useZoom(stage: RefObject<HTMLDivElement | null>, img: RefObject<HTMLImageElement | null>, key: string | undefined,
  { onSwipe, onSharper }: { onSwipe: (d: number) => void; onSharper: (src: string) => void }): { zoomed: boolean } {
  const view = useRef<ZoomView>(FIT);
  // zoomed or not, for the picture it was said of (a new picture opens at fit)
  const [said, setSaid] = useState<{ key?: string; zoomed: boolean }>({ zoomed: false });
  const cb = useRef({ onSwipe, onSharper });
  useEffect(() => { cb.current = { onSwipe, onSharper }; });

  useEffect(() => {
    const s = stage.current;
    if (!s || key === undefined) return;
    view.current = { ...FIT };

    // the picture's centre at fit, in the window, and the frame around it
    const frame = (): { c: Pt; f: ZoomFrame } | undefined => {
      const i = img.current;
      if (!i || !i.offsetWidth) return undefined;
      const r = s.getBoundingClientRect();
      const c = { x: r.left + s.clientLeft + i.offsetLeft + i.offsetWidth / 2, y: r.top + s.clientTop + i.offsetTop + i.offsetHeight / 2 };
      return { c, f: { w: i.offsetWidth, h: i.offsetHeight, left: r.left - c.x, right: r.right - c.x, top: r.top - c.y, bottom: r.bottom - c.y } };
    };
    const sharpen = () => {
      const i = img.current;
      if (!i || isFit(view.current)) return;
      const next = sharperSrc(i.getAttribute('src') ?? '');
      if (next && needsSharper(view.current.s, i.offsetWidth, window.devicePixelRatio || 1, i.naturalWidth)) cb.current.onSharper(next);
    };
    const apply = (v: ZoomView, animate = false) => {
      view.current = v;
      const i = img.current;
      if (i) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        i.style.transition = animate && !reduce ? `translate ${EASE}, scale ${EASE}` : 'none';
        i.style.translate = `${v.x}px ${v.y}px`;
        i.style.scale = String(v.s);
        i.style.cursor = isFit(v) ? '' : 'grab';
      }
      const z = !isFit(v);
      setSaid((o) => (o.key === key && o.zoomed === z ? o : { key, zoomed: z }));
    };

    // a larger file swapped in can draw the picture at another size at fit: keep it the same size on screen
    let lastW = img.current?.offsetWidth ?? 0;
    const ro = new ResizeObserver(() => {
      const w = img.current?.offsetWidth ?? 0, was = lastW;
      lastW = w;
      if (!was || !w || was === w || isFit(view.current)) return;
      const fr = frame();
      if (fr) apply(clampView({ ...view.current, s: view.current.s * (was / w) }, fr.f));
    });
    if (img.current) ro.observe(img.current);

    let g: Gesture | undefined;
    let lastTap: { at: number; x: number; y: number } | undefined;
    let drag: { from: Pt; start: ZoomView; moved: boolean } | undefined;
    let dragged = false;

    const startOne = (t: Touch) => {
      g = { kind: 'one', id: t.identifier, from: { x: t.clientX, y: t.clientY }, start: view.current, at: performance.now(), moved: false, wasFit: isFit(view.current) };
    };
    const startTwo = (a: Touch, b: Touch) => {
      const fr = frame();
      if (!fr) return;
      const m = mid(a, b);
      g = { kind: 'two', m0: { x: m.x - fr.c.x, y: m.y - fr.c.y }, d0: dist(a, b), start: view.current };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (onControl(e.target) || !img.current) { g = undefined; return; }
      if (e.touches.length >= 2) startTwo(e.touches[0], e.touches[1]);
      else if (e.touches.length === 1) startOne(e.touches[0]);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!g) return;
      e.preventDefault();
      const fr = frame();
      if (!fr) return;
      if (g.kind === 'two' && e.touches.length >= 2) {
        const m = mid(e.touches[0], e.touches[1]);
        apply(pinch(g.start, g.m0, { x: m.x - fr.c.x, y: m.y - fr.c.y }, dist(e.touches[0], e.touches[1]) / g.d0, fr.f));
      } else if (g.kind === 'one') {
        const id = g.id;
        const t = Array.from(e.touches).find((x) => x.identifier === id) ?? e.touches[0];
        const dx = t.clientX - g.from.x, dy = t.clientY - g.from.y;
        if (Math.hypot(dx, dy) > 10) g.moved = true;
        if (!g.wasFit) apply(pan(g.start, dx, dy, fr.f));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!g) return;
      const was = g;
      if (was.kind === 'two') {
        // one finger lifted: the other drags on from here
        if (e.touches.length === 1) startOne(e.touches[0]);
        else g = undefined;
        if (e.touches.length === 1 && g?.kind === 'one') g.wasFit = isFit(view.current);
        sharpen();
        return;
      }
      if (e.touches.length) return;
      g = undefined;
      const t = Array.from(e.changedTouches).find((x) => x.identifier === was.id) ?? e.changedTouches[0];
      if (!t) return;
      const now = performance.now();
      if (!was.moved && now - was.at < 350) {
        if (lastTap && now - lastTap.at < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40) {
          // the second tap of a double-tap: no click after it (it would close the view beside the picture)
          e.preventDefault();
          lastTap = undefined;
          const fr = frame();
          if (fr) { apply(toggleAt(view.current, t.clientX - fr.c.x, t.clientY - fr.c.y, fr.f), true); sharpen(); }
          return;
        }
        lastTap = { at: now, x: t.clientX, y: t.clientY };
        return;
      }
      lastTap = undefined;
      if (was.wasFit) {
        const d = swipeStep(t.clientX - was.from.x, t.clientY - was.from.y);
        if (d) cb.current.onSwipe(d);
      } else sharpen();
    };
    // Safari's own pinch of the page
    const stop = (e: Event) => e.preventDefault();

    const onWheel = (e: WheelEvent) => {
      if (onControl(e.target)) return;
      e.preventDefault();
      const fr = frame();
      if (!fr) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      apply(zoomAt(view.current, wheelScale(view.current.s, dy, e.ctrlKey), e.clientX - fr.c.x, e.clientY - fr.c.y, fr.f));
      sharpen();
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || onControl(e.target) || isFit(view.current)) return;
      e.preventDefault();
      drag = { from: { x: e.clientX, y: e.clientY }, start: view.current, moved: false };
      if (img.current) img.current.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      const fr = frame();
      if (!fr) return;
      const dx = e.clientX - drag.from.x, dy = e.clientY - drag.from.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      apply(pan(drag.start, dx, dy, fr.f));
    };
    const onUp = () => {
      if (!drag) return;
      dragged = drag.moved;
      drag = undefined;
      if (img.current && !isFit(view.current)) img.current.style.cursor = 'grab';
      setTimeout(() => { dragged = false; }, 0);
    };
    // the click that ends a drag is no click (it would close the view when it ends beside the picture)
    const onClickCapture = (e: MouseEvent) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } };
    const onDbl = (e: MouseEvent) => {
      if (onControl(e.target)) return;
      const fr = frame();
      if (!fr) return;
      e.preventDefault();
      apply(toggleAt(view.current, e.clientX - fr.c.x, e.clientY - fr.c.y, fr.f), true);
      sharpen();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = keyScale(view.current.s, e.key);
      const fr = frame();
      if (n === undefined || !fr) return;
      e.preventDefault();
      apply(zoomAt(view.current, n, (fr.f.left + fr.f.right) / 2, (fr.f.top + fr.f.bottom) / 2, fr.f), true);
      sharpen();
    };

    const opt = { passive: false } as const;
    s.addEventListener('touchstart', onTouchStart, opt);
    s.addEventListener('touchmove', onTouchMove, opt);
    s.addEventListener('touchend', onTouchEnd, opt);
    s.addEventListener('touchcancel', onTouchEnd, opt);
    s.addEventListener('gesturestart', stop, opt);
    s.addEventListener('wheel', onWheel, opt);
    s.addEventListener('mousedown', onDown);
    s.addEventListener('click', onClickCapture, true);
    s.addEventListener('dblclick', onDbl);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      s.removeEventListener('touchstart', onTouchStart);
      s.removeEventListener('touchmove', onTouchMove);
      s.removeEventListener('touchend', onTouchEnd);
      s.removeEventListener('touchcancel', onTouchEnd);
      s.removeEventListener('gesturestart', stop);
      s.removeEventListener('wheel', onWheel);
      s.removeEventListener('mousedown', onDown);
      s.removeEventListener('click', onClickCapture, true);
      s.removeEventListener('dblclick', onDbl);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey, true);
      ro.disconnect();
    };
  }, [key, stage, img]);

  return { zoomed: said.key === key && said.zoomed };
}
