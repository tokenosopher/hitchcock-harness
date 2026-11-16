'use client';
// While the user types into a field on a page (the story, a script line; ASKS 64), the phone's Alma bar at the
// bottom slides out of the way and comes back when the field is left. A page says so with `useTypingAway(on)`;
// ThreadColumn reads `useTyping()`. On a desktop nothing moves.
import { useEffect, useSyncExternalStore } from 'react';

const on = new Set<string>();
const subs = new Set<() => void>();
const emit = (): void => subs.forEach((f) => f());
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = (): boolean => on.size > 0;

export function useTyping(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** `key` names the field; `typing` is whether it has the focus now. */
export function useTypingAway(key: string, typing: boolean): void {
  useEffect(() => {
    if (!typing) return;
    on.add(key);
    emit();
    return () => { on.delete(key); emit(); };
  }, [key, typing]);
}
