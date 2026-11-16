'use client';
// The Release pages' clock (14 Nov 2026). It moves once a minute (the pages show minutes; nothing on them redraws every
// second). Outside production a test sets it with ?now=2026-11-14T18:52 in the page's address (local time): the clock
// starts there and runs on from it. The server takes the same parameter on GET and POST (src/server/release/clock.ts).
import { useEffect, useMemo, useState } from 'react';

/** The offset from the real clock that ?now= asks for, read once per page load; 0 in production. */
function offsetFromUrl(): number {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return 0;
  const raw = new URLSearchParams(window.location.search).get('now');
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t - Date.now();
}
let offset: number | undefined;
export const clockOffset = (): number => (offset ??= offsetFromUrl());
/** ?now= to pass on to the server with each request ('' when the clock is real). */
export const nowParam = (): string => (clockOffset() ? `now=${encodeURIComponent(new Date(Date.now() + clockOffset()).toISOString())}` : '');

const minuteOf = (ms: number) => Math.floor(ms / 60_000) * 60_000;

/** The time, to the minute; a component that reads it draws again once a minute. */
export function useMinute(): Date {
  const [t, setT] = useState(() => minuteOf(Date.now() + clockOffset()));
  useEffect(() => {
    const wait = () => 60_000 - ((Date.now() + clockOffset()) % 60_000) + 20;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setT(minuteOf(Date.now() + clockOffset()));
      id = setTimeout(tick, wait());
    };
    id = setTimeout(tick, wait());
    return () => clearTimeout(id);
  }, []);
  return useMemo(() => new Date(t), [t]);
}
