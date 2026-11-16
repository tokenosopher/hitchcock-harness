'use client';
// The pill at the top of the Edit page: "480p of v231 · rendered 3 h ago in 74 s", or, the normal state since the 480p
// is made only when asked for (14 Nov, ASKS 44), "480p of v234 not rendered" in the quiet style. Since stage 2 of "saving
// apart from history" it follows the version the cut is (the one it equals, else the newest, named as of it: "480p of
// v235" stays true while the cut has edits since); with edits and no 480p, "480p not rendered". It keeps its own clock,
// so the "ago" moves on every second without drawing the page and its timeline again (before 14 Nov the page held the
// clock and redrew everything once a second for this one line).
import { useEffect, useState } from 'react';
import type { RenderInfo, RenderState } from '@/server/types';
import { fmtDate } from '@/components/lib/format';
import { Dot } from '@/components/shell/atoms';
import { useRendersLive, type RendersStore } from './useCut';

export const ago = (iso: string | undefined, now: number) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s >= 3600 * 24) return fmtDate(iso);
  if (s >= 3600) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ago`;
};

export function proxyLabel(r: RenderState | undefined, version: string, now: number, done?: { at: string; seconds?: number }, edited = false): string {
  // a cut with edits since its newest version (stage 2): no 480p is of it until it is saved for one
  if (!r || r.state === 'none' || (r.state === 'done' && !r.path)) return edited ? '480p not rendered' : `480p of ${version} not rendered`;
  if (r.state === 'queued') return `480p of ${r.version} queued`;
  if (r.state === 'running') return `Rendering the 480p of ${r.version} · ${Math.round(r.percent ?? 0)}%`;
  if (r.state === 'failed') return `480p of ${r.version} failed${r.error ? `: ${r.error.slice(0, 80)}` : ''}`;
  // the live job's times, else what the version file recorded when the render landed (renders.proxy)
  const at = r.finishedAt ?? done?.at;
  const secs = r.seconds ?? done?.seconds;
  const took = secs ? ` in ${secs < 60 ? `${Math.round(secs * 10) / 10} s` : `${Math.round(secs / 60)} min`}` : '';
  return `480p of ${r.version}${at ? ` · rendered ${ago(at, now)}${took}` : ''}`;
}

/** A clock that ticks once a second, for the one component that shows it. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** A click opens the Renders tab under the timeline, where every rendered file is listed (14 Nov) and the 480p of the
 *  version on screen is asked for ("Render it"). It follows the 480p's percent itself (useCut.ts RendersStore): the
 *  page is not drawn again for it. Not rendered is the normal state: a hollow dot, the quiet colour, never a warning. */
export function ProxyPill({ store, version, done, edited, onOpen, planned }: { store: RendersStore; version: string; done?: RenderInfo; edited?: boolean; onOpen?: () => void; /** Why there is no 480p yet: the cut still holds boards or planned shots (15 Nov). */ planned?: string }) {
  const now = useNow();
  const r0 = useRendersLive(store).proxy;
  const r = planned ? undefined : r0;
  const none = !r || r.state === 'none' || (r.state === 'done' && !r.path);
  const label = planned ? 'No 480p yet' : proxyLabel(r, version, now, done, edited);
  return (
    <button type="button" onClick={onOpen} title={planned ?? (none ? 'The 480p is made when you ask for it: Renders, under the timeline' : 'Every rendered file is under the timeline, in Renders')} data-proxy-pill data-proxy-state={none ? 'none' : r!.state}
      className={`inline-flex h-7 cursor-pointer items-center gap-2 rounded-[14px] border border-edge px-2.5 text-[12px] transition-colors duration-150 hover:border-edge-strong hover:bg-raised ${none ? 'text-sub hover:text-ink' : 'text-ink'}`} aria-live="polite">
      <Dot state={r?.state === 'running' || r?.state === 'queued' ? 'running' : r?.state === 'failed' ? 'failed' : none ? 'waiting' : 'done'} />
      {/* the words fade when they change from one kind to another (not on every percent) */}
      <span key={r?.state === 'running' ? 'running' : label} className="duration-200 animate-in fade-in-0">{label}</span>
    </button>
  );
}
