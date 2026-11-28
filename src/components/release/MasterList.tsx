'use client';
import { aspectStyle } from '@/lib/frame';
// Naming the final (board 14): the masters on offer, newest first, each with the same four rows; "Make this the
// final" on the newest, "Use this one instead" on the others; a master out of date says why and offers the Renders
// tab instead of the button. Used by the closed Release page and by "Change…" on the open one.
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Media } from '@/components/media/Media';
import { Btn } from '@/components/shell/atoms';
import { dayWords, hm } from './derive';
import type { MasterOption } from './masters';
import { useMinute } from './clock';

/** "made today 16:40, the newest". */
function madeWords(m: MasterOption, now: Date, newest: boolean): string {
  if (!m.at) return newest ? 'the newest' : '';
  const d = new Date(m.at);
  return `made ${dayWords(d, now)} ${hm(d)}${newest ? ', the newest' : ''}`;
}

export function MasterList({ masters, media, goesOutAs, editHref, onName, current, locked, aspect }: {
  masters: MasterOption[];
  /** The film's aspect: each master's still takes it. */
  aspect?: string;
  /** /api/media path of a film-relative file. */
  media: (rel: string) => string;
  goesOutAs: string;
  editHref: string;
  onName: (m: MasterOption) => Promise<string | undefined>;
  /** The final now, on the open page's "Change…". */
  current?: string;
  /** Why the final cannot change (something is posted). */
  locked?: string;
}) {
  const now = useMinute();
  const [busy, setBusy] = useState<string>();
  const [said, setSaid] = useState<{ path: string; text: string }>();
  const name = async (m: MasterOption) => {
    setBusy(m.path);
    const err = await onName(m);
    setBusy(undefined);
    setSaid(err ? { path: m.path, text: err } : undefined);
  };
  const first = masters.find((m) => !m.stale && m.path !== current);
  return (
    <div className="flex flex-col gap-3">
      {masters.map((m, i) => {
        const newest = i === 0;
        const isFinal = m.path === current;
        const main = !current && first?.path === m.path && newest;
        return (
          <article key={m.path} data-master={m.path} data-stale={m.stale ? '' : undefined}
            className={cn('grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-4 rounded-[10px] border p-3 transition-colors duration-200 max-[760px]:grid-cols-[56px_minmax(0,1fr)]',
              main ? 'border-edge-strong bg-panel' : 'border-edge')}>
            <Media path={media(m.still ?? m.path)} w={160} t={2} play fit="cover" style={aspectStyle(aspect)} className="aspect-[9/16] w-full rounded-[6px] border border-line" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <b className="text-[13.5px] font-semibold">{m.title}</b>
                <span className="text-[12px] text-sub">{madeWords(m, now, newest)}</span>
              </div>
              <dl className="m-0 grid grid-cols-[86px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12.5px] leading-[1.45]">
                {m.rows.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-sub">{r.label}</dt>
                    <dd data-row={r.label} data-warn={r.warn ? '' : undefined} className={cn('m-0', r.warn ? 'text-warn' : 'text-ink-2')}>{r.text}</dd>
                  </div>
                ))}
              </dl>
              {m.stale && <p data-master-stale className="m-0 text-[12px] leading-[1.45] text-warn">{m.stale.replace(/^\w/, (c) => c.toUpperCase())}.</p>}
            </div>
            <div className="flex w-[180px] flex-col items-stretch gap-2 max-[760px]:col-span-2 max-[760px]:w-auto">
              {isFinal ? (
                <span data-is-final className="text-[12.5px] text-ink-3">The final now</span>
              ) : m.stale ? (
                <Link href={editHref} className="inline-flex h-8 items-center justify-center rounded-lg border border-edge-strong px-3 text-[12.5px] text-ink no-underline transition-colors duration-150 hover:bg-raised">Open the Renders tab</Link>
              ) : (
                <Btn primary={main} ghost={!main} disabled={!!busy || !!locked} title={locked} onClick={() => void name(m)} data-name-final={m.path}
                  className={cn('justify-center', !main && 'border border-transparent text-ink-3 hover:border-edge')}>
                  <span key={busy === m.path ? 'b' : 'n'} className="duration-200 animate-in fade-in-0">{busy === m.path ? 'Naming it…' : main ? 'Make this the final' : 'Use this one instead'}</span>
                </Btn>
              )}
              {main && (
                <>
                  <span className="text-[12px] leading-[1.45] text-sub">Every platform gets this file.</span>
                  <span className="text-[12px] leading-[1.45] text-sub">It goes out as: <span className="text-ink-3">{goesOutAs}</span></span>
                </>
              )}
              {said?.path === m.path && <span role="alert" className="text-[12px] leading-[1.45] text-warn duration-200 animate-in fade-in-0">{said.text}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
