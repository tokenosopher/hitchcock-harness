'use client';
// The waiting items as they come and go, shared by "Waiting for you" (GatePage) and What's next (WaitingNow).
import { useState } from 'react';
import type { WaitItem } from './waitList';

/** The items as they come and go: one that stops waiting (answered) folds away instead of vanishing. */
export function useKept(items: WaitItem[]): { it: WaitItem; here: boolean }[] {
  const [prev, setPrev] = useState(items);
  const [kept, setKept] = useState<WaitItem[]>(items);
  if (prev !== items) {
    setPrev(items);
    const now = new Set(items.map((x) => x.key));
    const merged = [...items];
    // a gone item stays where it was, closed
    kept.forEach((x, i) => { if (!now.has(x.key)) merged.splice(Math.min(i, merged.length), 0, x); });
    setKept(merged);
  }
  const now = new Set(items.map((x) => x.key));
  return kept.map((it) => ({ it, here: now.has(it.key) }));
}

