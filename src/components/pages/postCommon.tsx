'use client';
// Shared pieces of the Finish, Release and Settings pages: fetching a page's own read-only route again
// whenever the film's files change, sizes, frame counts as SMPTE, and the small rows the boards use.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// The last answer of each route, so a page opened again draws at once (then reads it again), and one read in
// flight per address and change, so a page and a section of it asking the same route make one request.
const lastAnswer = new Map<string, unknown>();
const inFlight = new Map<string, Promise<{ ok: boolean; status: number; body: unknown }>>();
function getJson(url: string, dep?: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = `${url}\n${dep ?? ''}`;
  let p = inFlight.get(key);
  if (!p) {
    p = fetch(url, { cache: 'no-store' }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));
    inFlight.set(key, p);
    void p.finally(() => { if (inFlight.get(key) === p) inFlight.delete(key); }).catch(() => undefined);
  }
  return p;
}

/** GET a JSON route; again whenever `dep` changes (the film state's updatedAt: the watcher saw a change). */
export function useJson<T>(url: string | undefined, dep?: string): { data?: T; error?: string; loading: boolean } {
  const [v, setV] = useState<{ data?: T; error?: string; url?: string }>(() => (url && lastAnswer.has(url) ? { data: lastAnswer.get(url) as T, url } : {}));
  useEffect(() => {
    if (!url) return;
    let live = true;
    getJson(url, dep)
      .then(({ ok, status, body }) => {
        const j = body as T & { error?: string };
        if (!live) return;
        if (ok) { lastAnswer.set(url, j); setV({ data: j, url }); }
        else setV((p) => ({ data: p.url === url ? p.data : undefined, error: j.error ?? `${status}`, url }));
      })
      .catch(() => { if (live) setV((p) => ({ data: p.url === url ? p.data : undefined, error: 'The harness server is not answering', url })); });
    return () => { live = false; };
  }, [url, dep]);
  // another address (another scene, another film) never shows the answer of the one before
  const data = v.url === undefined || v.url === url ? v.data : url && lastAnswer.has(url) ? (lastAnswer.get(url) as T) : undefined;
  return { data, error: v.url === url ? v.error : undefined, loading: !data && !(v.url === url && v.error) };
}

/** 373942441 → "374 MB"; 3384 → "3.4 KB". */
export function fmtBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

/** 4303 frames at 24 → "00:02:59:07". */
export function smpteFrames(frames: number, fps = 24): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const f = Math.round(fps);
  const sec = Math.floor(frames / f);
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}:${p(frames % f)}`;
}

/** Seconds → SMPTE at the film's fps. */
export const smpteSecs = (s: number, fps = 24) => smpteFrames(Math.round(s * fps), fps);

export const baseName = (p: string) => p.split('/').pop() ?? p;

/** A panel's head on these boards: a 16px title, a muted line under it, something on the right. */
export function PanelHead({ title, sub, right, className }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 border-b border-line px-4 pb-3 pt-3.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {right}
      </div>
      {sub && <p className="m-0 text-[12.5px] leading-normal text-sub">{sub}</p>}
    </div>
  );
}

/** A label row: "Length    00:02:59:07 [to confirm]". */
export function KV({ k, children, mono, className }: { k: React.ReactNode; children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1 text-[13px]', className)}>
      <span className="flex-none text-sub">{k}</span>
      <span className={cn('min-w-0 text-right', mono && 'whitespace-nowrap font-mono text-[12px]')}>{children}</span>
    </div>
  );
}

/** The "to confirm" badge. */
export function ToConfirm({ title }: { title?: string }) {
  return <span title={title} className="ml-1.5 inline-flex h-[18px] flex-none items-center rounded-[9px] border border-dashed border-edge-strong px-1.5 align-middle font-sans text-[10.5px] font-medium text-sub">to confirm</span>;
}

/** Where a fact came from, small and muted: "spend.md · 1 Nov". */
export function From({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[10.5px] text-mute', className)}>{children}</span>;
}

/** A flag the record raised (the peak, the widest caption line): a red dot and the sentence. */
export function Flag({ children, from, action, quiet }: { children: React.ReactNode; from?: string; action?: React.ReactNode; /** a note in the record of a film that went out: no red */ quiet?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge bg-well px-3 py-2.5">
      <div className="flex gap-2 text-[12.5px] leading-normal">
        <span aria-hidden="true" className={cn('mt-[7px] size-1.5 flex-none rounded-full', quiet ? 'border border-mute' : 'bg-bad')} />
        <span>{children}{from && <> <From>{from}</From></>}</span>
      </div>
      {action}
    </div>
  );
}

/** A state word with its dot: ok (white), flag (red), confirm (dashed), waiting (hollow). */
export function StateDot({ state }: { state: 'ok' | 'flag' | 'confirm' | 'unknown' | 'waiting' | 'running' }) {
  if (state === 'flag') return <span aria-hidden="true" className="inline-block size-1.5 flex-none rounded-full bg-bad" />;
  if (state === 'ok') return <span aria-hidden="true" className="inline-block size-1.5 flex-none rounded-full bg-ink" />;
  if (state === 'running') return <span aria-hidden="true" className="dot-run inline-block size-1.5 flex-none rounded-full bg-sub shadow-[0_0_0_2px_#3F3F46]" />;
  return <span aria-hidden="true" className={cn('inline-block size-1.5 flex-none rounded-full border border-mute', state === 'confirm' && 'border-dashed')} />;
}

export function SubLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="lbl">{children}</span>
      {right && <span className="text-[11.5px] text-mute">{right}</span>}
    </div>
  );
}
