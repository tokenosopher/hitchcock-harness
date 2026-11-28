'use client';
// The Release pages' small shared pieces (14 Nov 2026): the state glyphs (each state a glyph AND its word, the same
// everywhere), the platform's two-letter tile, the release data (GET once, again when the film's watcher sees a
// change, the answer of each operation kept), the chip that tells Alma about the final, and the clock text.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUIActions } from '@/components/data/ui';
import { cn } from '@/lib/utils';
import type { Chip } from '@/server/types';
import { hm, type StateId, type Status, type Tag } from './derive';
import type { ReleaseFinal } from './file';
import type { ReleaseOp } from './ops';
import { factsOf, type PlatformKind } from './platforms';
import { nowParam, useMinute } from './clock';
import type { ReleaseAnswer, ReleaseView } from './view';
import { useSendAsUser } from './AskAlma';
import { textsChip, wantsTexts } from './alma';

// ---- glyphs

/** The state's glyph: a grey dashed ring, a white dot, amber pause bars, a white clock, a spinner, a green tick, an
 *  amber triangle. */
export function Glyph({ state, size = 12, className }: { state: StateId; size?: number; className?: string }) {
  const c = cn('flex-none', className);
  const p = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, className: c } as const;
  switch (state) {
    case 'to-pick': return <svg {...p} fill="none" stroke="#71717A" strokeWidth="1.5" strokeDasharray="2.4 2"><circle cx="8" cy="8" r="5.5" /></svg>;
    case 'ready': return <svg {...p}><circle cx="8" cy="8" r="4" fill="#FAFAFA" /></svg>;
    case 'waiting': return <svg {...p} fill="#f59e0b"><rect x="4" y="3.5" width="2.6" height="9" rx="0.8" /><rect x="9.4" y="3.5" width="2.6" height="9" rx="0.8" /></svg>;
    case 'scheduled': return <svg {...p} fill="none" stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></svg>;
    case 'sending': return <svg {...p} fill="none" strokeWidth="1.8" className={cn(c, 'animate-spin [animation-duration:1.4s] motion-reduce:animate-none')}><circle cx="8" cy="8" r="5.5" stroke="#3F3F46" /><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" stroke="#FAFAFA" strokeLinecap="round" /></svg>;
    case 'posted': return <svg {...p} fill="none" stroke="#22c55e" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>;
    case 'needs': return <svg {...p} fill="#f59e0b"><path d="M8 1.8l6.6 11.8H1.4z" /><rect x="7.25" y="6" width="1.5" height="4" rx=".7" fill="#09090b" /><circle cx="8" cy="11.8" r=".85" fill="#09090b" /></svg>;
  }
}

const TONE: Record<StateId, string> = { 'to-pick': 'text-sub', ready: 'text-ink', waiting: 'text-warn', scheduled: 'text-ink', sending: 'text-ink', posted: 'text-ok', needs: 'text-warn' };

/** The glyph, the word, its time ("Scheduled 19:10"), the reason of Needs you, and its tags. */
export function StateWords({ st, big, reason = true, tags = true, className }: { st: Status; big?: boolean; reason?: boolean; tags?: boolean; className?: string }) {
  return (
    <span data-state={st.state} className={cn('inline-flex min-w-0 items-center gap-2 whitespace-nowrap', big ? 'text-[13px] font-medium' : 'text-[12.5px]', className)}>
      <span className={cn('inline-flex items-center gap-[7px]', TONE[st.state])}>
        <Glyph state={st.state} size={big ? 13 : 12} />
        <span>{st.word}{st.state === 'needs' && reason && st.reason ? ':' : ''}</span>
      </span>
      {st.time && <span className="text-[12px] font-normal tabular-nums text-sub">{st.time}</span>}
      {st.state === 'needs' && reason && st.reason && <span className="truncate font-normal text-warn">{st.reason}</span>}
      {tags && st.tags.map((t) => <TagPill key={t.text} t={t} />)}
    </span>
  );
}

export function TagPill({ t }: { t: Tag }) {
  return t.tone === 'amber'
    ? <span data-tag className="text-[12px] font-normal text-warn">{t.text}</span>
    : <span data-tag className="inline-flex h-[18px] items-center rounded-[5px] border border-edge-strong px-1.5 text-[11px] font-normal text-sub">{t.text}</span>;
}

/** The platform's tile: "TT". */
export function Mono({ kind, className }: { kind: PlatformKind; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid size-7 flex-none place-items-center rounded-[7px] border border-edge-strong bg-[#121214] text-[10.5px] font-semibold tracking-[0.03em] text-ink-3', className)}>
      {factsOf(kind).short}
    </span>
  );
}

/** "It is 18:52.": the one piece of the page that follows the clock, so nothing else draws again for it. */
export function NowText({ className }: { className?: string }) {
  const now = useMinute();
  return <span data-now className={className}>It is {hm(now)}.</span>;
}

/** A pill in the header ("final: master of v236", "2 of 6 posted"). */
export function Pill({ children, className, ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex h-6 flex-none items-center rounded-full border border-edge-strong px-2.5 text-[11.5px] font-normal text-sub', className)} {...rest}>{children}</span>;
}

/** A plain-text link styled as a quiet button. */
export function QuietLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cn('inline-flex h-7 items-center rounded-md px-2 text-[12px] text-sub no-underline transition-colors duration-150 hover:bg-raised hover:text-ink', className)}>{children}</Link>;
}

// ---- the data

/** GET …/release (with the test clock), again when the film's watcher reports a change (Alma wrote the file), and
 *  every 1.5 s only while a companion of the final is being rendered. `run` posts one operation and keeps the answer. */
export function useRelease(film: string, opts: { light?: boolean; masters?: boolean } = {}) {
  const { state } = useFilm();
  const dep = state?.updatedAt;
  const [view, setView] = useState<ReleaseView>();
  const [error, setError] = useState<string>();
  const [bump, setBump] = useState(0);
  // the test clock (?now=) is added when the request goes, not to the address the effect follows: it moves every
  // millisecond, so in it every answer would ask again, once a frame, for as long as the page was open
  const base = `/api/films/${film}/release`;
  const opt = [opts.light ? 'light=1' : '', opts.masters ? 'masters=1' : ''].filter(Boolean).join('&');
  useEffect(() => {
    let live = true;
    const q = [nowParam(), opt].filter(Boolean).join('&');
    void fetch(`${base}${q ? `?${q}` : ''}`, { cache: 'no-store' }).then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as ReleaseView & { error?: string };
      if (!live) return;
      if (r.ok) { setView(j); setError(undefined); } else setError(j.error ?? `The server answered ${r.status}`);
    }, () => { if (live) setError('The harness server is not answering'); });
    return () => { live = false; };
  }, [base, opt, dep, bump]);
  // a companion still rendering: read again shortly
  const rendering = view?.companions?.some((c) => c.state === 'queued' || c.state === 'running');
  useEffect(() => {
    if (!rendering) return;
    const id = setTimeout(() => setBump((b) => b + 1), 1500);
    return () => clearTimeout(id);
  }, [rendering, view]);
  const send = useCallback(async (op: ReleaseOp | { op: 'nameFinal'; path: string }): Promise<ReleaseAnswer> => {
    const qn = nowParam();
    try {
      const r = await fetch(`/api/films/${film}/release${qn ? `?${qn}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
      const j = (await r.json().catch(() => ({}))) as ReleaseAnswer & { error?: string };
      if (!r.ok || !j.ok) return { ok: false, error: j.error ?? `The server answered ${r.status}` };
      setView((v) => (v ? { ...v, file: j.file, derived: j.derived, companions: j.companions ?? v.companions, ...(j.file.final ? { masters: opts.masters ? v.masters : undefined } : {}) } : v));
      if (op.op === 'nameFinal') setBump((b) => b + 1);
      return j;
    } catch {
      return { ok: false, error: 'The harness server is not answering' };
    }
  }, [film, opts.masters]);
  // one operation at a time, in the order the page sent them: a box saved as it is left, then the tap that left it
  // (the edit is in the file before an option's Save or Discard reads it)
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = useCallback((op: ReleaseOp | { op: 'nameFinal'; path: string }): Promise<ReleaseAnswer> => {
    const next = queue.current.then(() => send(op));
    queue.current = next.catch(() => undefined);
    return next;
  }, [send]);
  return { view, error, run, reload: () => setBump((b) => b + 1) };
}

/** The line Alma's next turn reads after the user names the final: a chip in "Alma sees", gone with that message
 *  (the way a click on a page tells her what the user looked at). */
export function finalChip(final: ReleaseFinal, film: string): Chip {
  const c = final.companions;
  const made = [c.clean && c.clean.path !== final.path ? `the copy without subtitles (${c.clean.path})` : '', c.srt ? `the subtitle file (${c.srt.path})` : '', c.post && c.post.path !== final.path ? `the smaller file that goes out (${c.post.path})` : ''].filter(Boolean);
  return {
    id: 'release:final',
    label: `Named the final: master of ${final.version}`,
    ref: `The user named the master of ${final.version} as the final: ${final.path}, going out as "${final.name}". Recorded in assets/films/${film}/social/release.json.${made.length ? ` The app's render queue is making ${made.join(', ')}; nothing is spent.` : ''}`,
  };
}

/** Names a master as the final from anywhere (the Release page, the Renders tab), and tells Alma. When the release
 *  file has no platforms yet, Alma is asked at once, as the user's own message with the chip "Release texts · cut vN",
 *  to draft the text for every platform (no second press); `texts` says whether that ask went. */
export function useNameFinal(run: ReturnType<typeof useRelease>['run'], film: string) {
  const { addChip } = useUIActions();
  const sendAs = useSendAsUser(film);
  return useCallback(async (path: string): Promise<ReleaseAnswer & { texts?: 'sent' | 'failed' }> => {
    const r = await run({ op: 'nameFinal', path });
    if (!r.ok || !r.file.final) return r;
    const final = r.file.final;
    if (!wantsTexts(r.file, r.said)) { addChip(finalChip(final, film)); return r; }
    // the final's own line goes with the ask, so Alma reads both in one message
    const ok = await sendAs('', [finalChip(final, film), textsChip(film, final)]).catch(() => false);
    if (!ok) addChip(finalChip(final, film));
    return { ...r, texts: ok ? 'sent' : 'failed' };
  }, [run, addChip, film, sendAs]);
}

/** The line that says the texts' ask went (or did not), under the button that named the final. */
export const textsSaid = (t: 'sent' | 'failed' | undefined, version?: string): string | undefined =>
  t === 'sent' ? `Sent to Alma: the text for every platform${version ? ` for the final of ${version}` : ''}. The texts appear on the Release page as she writes them.`
    : t === 'failed' ? 'The final is named. The ask for the texts did not go: use "Ask Alma to draft them" on the Release page.' : undefined;
