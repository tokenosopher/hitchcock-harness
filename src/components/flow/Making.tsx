'use client';
// The loading state of a step: what is being made and has not landed yet, one line each, with the phone
// bar's moving dot and "2 of 4 landed" when the count is known. Read by lib/making.ts from the film's files and Alma's
// thread; a line fades in when the work starts and folds away when it lands. Used by What's next's rows, the Locations
// page, the character view and the Voices page.
import { useMemo } from 'react';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { landedWords, makingOf, type Making } from '@/components/lib/making';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';

/** Everything being made in the film on screen now (lib/making.ts), from its state and Alma's thread. */
export function useMaking(): Making[] {
  const { state } = useFilm();
  const { tasks } = useThread();
  return useMemo(() => (state ? makingOf(state, tasks) : []), [state, tasks]);
}

/** The phone bar's working dot: a dot with a ring that keeps pinging (ThreadColumn.tsx's "Alma is working"). */
export function MakingDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-2 flex-none', className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink opacity-50 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-ink" />
    </span>
  );
}

/** One line per thing being made; nothing when nothing is. `bar`: a thin line that fills as the round lands. */
export function MakingLines({ items, bar, className }: { items: Making[]; bar?: boolean; className?: string }) {
  return (
    <Reveal open={items.length > 0} className="min-w-0">
      <ul data-making role="status" aria-live="polite" className={cn('m-0 flex list-none flex-col gap-1.5 p-0', className)}>
        {items.map((m) => {
          const n = landedWords(m);
          return (
            <li key={`${m.step}:${m.id}:${m.what}`} data-making-item={m.id || m.step} data-making-from={m.from}
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug duration-200 animate-in fade-in-0 slide-in-from-top-1">
              <MakingDot />
              <span className="min-w-0 text-ink-3">{m.what}</span>
              {n && <span key={n} data-making-count className="whitespace-nowrap font-mono text-[11.5px] text-sub duration-200 animate-in fade-in-0">· {n}</span>}
              {bar && m.of ? (
                <span className="h-1 w-28 overflow-hidden rounded-sm bg-edge">
                  <span className="block h-full bg-sub transition-[width] duration-500" style={{ width: `${((m.landed ?? 0) / Math.max(1, m.of)) * 100}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Reveal>
  );
}
