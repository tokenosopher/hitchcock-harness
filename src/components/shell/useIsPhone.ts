'use client';
import { useSyncExternalStore } from 'react';

const Q = '(max-width: 760px)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(Q);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** The boards' phone breakpoint (760px). False during the server render. */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(Q).matches, () => false);
}
