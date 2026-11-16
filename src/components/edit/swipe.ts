// A sideways two-finger swipe that runs past the start (or end) of a sideways scroller is the browser's "back"
// (or "forward") on a Mac trackpad. Over the timeline and the takes it is always an accident (the user, 13 Nov:
// "I can't go back on the page just by flicking two fingers to the left if I get to the beginning").
// `overscroll-behavior-x: contain` on the scroller stops it in Chrome; this wheel check backs that up (Safari, and
// elements that do not scroll at all). Only a mostly sideways wheel is ever stopped, so the page still scrolls
// up and down under the pointer.
import { useEffect, type RefObject } from 'react';

/** True when this wheel is mostly sideways and the element has no room left that way. */
export function wheelPastEdge(e: WheelEvent, el: HTMLElement): boolean {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return false;
  const max = el.scrollWidth - el.clientWidth;
  return e.deltaX < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= max - 1;
}

/** Stops the swipe-back over an element (registered non-passive: React's onWheel cannot prevent). */
export function useNoSwipeBack(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: WheelEvent) => { if (!e.ctrlKey && wheelPastEdge(e, el)) e.preventDefault(); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  });
}
