'use client';
// Option-click from anywhere takes the cursor to Alma's box, so there is no going to the box and back by hand.
// What had the cursor before the jump (the timeline, a field) is remembered here, and the box gives the cursor back to
// it once the message is sent, or on Esc (at once when nothing was typed since the jump; with words typed, on a second
// Esc, the words kept). A click elsewhere by hand forgets it: the user has moved on by themselves.

let from: HTMLElement | null = null;
let pending = false;
let typed = false;
let escOnce = false;

const box = (): HTMLElement | null => document.getElementById('composer');

/** Called as an Option-click puts a thing in the box: remembers what has the cursor, unless that is the box itself
 *  (a second Option-click in a row keeps the first place to go back to). */
export function rememberFocus(): void {
  const b = box();
  const a = document.activeElement;
  if (b && a === b) return;
  from = a instanceof HTMLElement && a !== document.body ? a : null;
  pending = true;
  typed = false;
  escOnce = false;
}

/** Words typed (or pasted) in the box since the jump: Esc then asks twice. */
export function noteTyped(): void { if (pending) { typed = true; escOnce = false; } }

export function forgetJump(): void { pending = false; from = null; typed = false; escOnce = false; }

export const hasJump = (): boolean => pending;

/** Gives the cursor back to where it was before the jump. Only while the box (or nothing) has it: a cursor the user
 *  has put somewhere else by hand is left there. */
export function goBack(): boolean {
  if (!pending) return false;
  const t = from;
  forgetJump();
  const b = box();
  const a = document.activeElement;
  if (a && a !== b && a !== document.body && !a.closest('[data-composer-root]')) return false;
  if (t && t.isConnected && !t.closest('[inert]')) t.focus({ preventScroll: true });
  if (b && document.activeElement === b) b.blur();
  return true;
}

/** Esc in the box: true when the cursor went back. With words typed since the jump the first Esc only arms the
 *  second (`'again'`), so a draft is never left by one stray key. */
export function escBack(empty: boolean): 'back' | 'again' | undefined {
  if (!pending) return undefined;
  if (empty || !typed || escOnce) return goBack() ? 'back' : undefined;
  escOnce = true;
  return 'again';
}
