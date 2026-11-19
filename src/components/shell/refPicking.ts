'use client';
// Picking a thing on the page for the message. While the message box has the cursor, Option-click (Alt on
// Windows) on a clip, a take, a panel, a card, a character or a view puts it into the words; the pick button by the
// box does the same for the next click or tap (the phone has no Option key). The click is the box's alone: the page
// under it does not also select, seek or drag, and the box keeps the cursor. A click on anything that cannot go in
// is left to the page. While Option is held in the box, or the button is armed, what can go in gets a faint ring.
import { useEffect, useRef } from 'react';
import type { InlineRef } from '@/lib/refs';
import { resolveRefAt } from '@/components/lib/refPick';

const PICKING = 'refPicking';

export function setPickingMark(on: boolean): void {
  const d = document.documentElement.dataset;
  if (on) d[PICKING] = '';
  else delete d[PICKING];
}

/** `box`: the message box; `armed`: the pick button's state, read at each click; `onPick` puts the thing in. */
export function usePickOnPage(box: React.RefObject<HTMLTextAreaElement | null>, armed: () => boolean, onPick: (r: InlineRef, hadBox: boolean) => void, onDisarm: () => void): void {
  const pick = useRef(onPick);
  const disarm = useRef(onDisarm);
  const isArmed = useRef(armed);
  useEffect(() => { pick.current = onPick; disarm.current = onDisarm; isArmed.current = armed; });

  useEffect(() => {
    let pending: InlineRef | undefined;
    let until = 0;
    let hadBox = false;
    const inBox = () => !!box.current && document.activeElement === box.current;
    const live = (e: MouseEvent) => isArmed.current() || (e.altKey && inBox());
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    const down = (e: PointerEvent) => {
      pending = undefined;
      if (e.button !== 0 || !live(e)) return;
      const t = e.target as Element | null;
      // the box, its buttons and an open chip card are never picked
      if (!t || t.closest('[data-ref-skip], [data-ref-card]')) return;
      const r = resolveRefAt(t);
      if (!r) return;
      stop(e);
      pending = r;
      hadBox = inBox();
      until = Date.now() + 2000;
    };
    // the rest of the same click goes nowhere else; mousedown's default would take the cursor out of the box
    const swallow = (e: Event) => { if (pending && Date.now() < until) stop(e); };
    const click = (e: MouseEvent) => {
      if (!pending) return;
      const r = pending;
      pending = undefined;
      if (Date.now() >= until) return;
      stop(e);
      pick.current(r, hadBox);
      if (isArmed.current()) disarm.current();
    };
    const cancel = () => { pending = undefined; };
    // the faint ring while Option is held in the box
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      if (e.type === 'keydown' && inBox()) setPickingMark(true);
      else if (e.type === 'keyup' && !isArmed.current()) setPickingMark(false);
    };
    const away = () => { if (!isArmed.current()) setPickingMark(false); };
    const opts = { capture: true };
    window.addEventListener('pointerdown', down, opts);
    for (const t of ['mousedown', 'pointerup', 'mouseup', 'dblclick', 'auxclick'] as const) window.addEventListener(t, swallow, opts);
    window.addEventListener('click', click, opts);
    window.addEventListener('pointercancel', cancel, opts);
    window.addEventListener('keydown', key, opts);
    window.addEventListener('keyup', key, opts);
    window.addEventListener('blur', away);
    return () => {
      window.removeEventListener('pointerdown', down, opts);
      for (const t of ['mousedown', 'pointerup', 'mouseup', 'dblclick', 'auxclick'] as const) window.removeEventListener(t, swallow, opts);
      window.removeEventListener('click', click, opts);
      window.removeEventListener('pointercancel', cancel, opts);
      window.removeEventListener('keydown', key, opts);
      window.removeEventListener('keyup', key, opts);
      window.removeEventListener('blur', away);
      setPickingMark(false);
    };
  }, [box]);
}
