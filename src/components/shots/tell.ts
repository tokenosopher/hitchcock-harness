'use client';
// Option-click (Alt-click) on anything on the Shot details page puts it in Alma's box as a chip, with words for what it
// is and a question that fits (ui.about); on touch, each input's "Tell Alma" does the same. The page keeps the click
// for itself (data-ref-skip on its root: the message box's own Option-pick does not take it), so it works whether the
// box has the cursor or not. While Option is held, the thing under the pointer gets a ring.
import { useEffect, useRef } from 'react';
import { rememberFocus } from '@/components/shell/jumpBack';

/** The ring while Option is held: on the page root, `data-sd-picking`; each thing that can go in has PICK. */
export const PICK = '[[data-sd-picking]_&]:cursor-copy [[data-sd-picking]_&:hover]:outline [[data-sd-picking]_&:hover]:outline-1 [[data-sd-picking]_&:hover]:outline-offset-2 [[data-sd-picking]_&:hover]:outline-ink';

/** Props for a thing that goes to Alma on Option-click: the click goes nowhere else. */
export function pickProps(go: () => void): { onClickCapture: (e: React.MouseEvent<HTMLElement>) => void; 'data-sd-pick': '' } {
  return {
    'data-sd-pick': '',
    onClickCapture: (e) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      // the innermost thing clicked goes (a name in a shot's part, not the whole part)
      if ((e.target as Element).closest?.('[data-sd-pick]') !== e.currentTarget) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      // where the cursor was, for after the message; go() puts the cursor in the box
      rememberFocus();
      go();
      el.animate?.([{ boxShadow: '0 0 0 3px rgba(250,250,250,.5)' }, { boxShadow: '0 0 0 0 rgba(250,250,250,0)' }], { duration: 700, easing: 'ease-out' });
    },
  };
}

/** Sets `data-sd-picking` on the root while Option (Alt) is held. */
export function usePickingRing(root: React.RefObject<HTMLElement | null>): void {
  const on = useRef(false);
  useEffect(() => {
    const set = (v: boolean) => {
      if (on.current === v) return;
      on.current = v;
      const el = root.current;
      if (!el) return;
      if (v) el.setAttribute('data-sd-picking', ''); else el.removeAttribute('data-sd-picking');
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Alt') set(e.type === 'keydown'); };
    const off = () => set(false);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', off); };
  }, [root]);
}
