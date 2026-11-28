'use client';
// What's next opens with what waits for the user: every card of "Waiting for you", one row each,
// before the film's steps. A row says the question, its quote when it has one, and where it belongs; "Answer" opens the
// very card of "Waiting for you" under it (the same AskCard, PickCard or GoCard, answered the same way), "Open" goes to
// the page it belongs to. A card that asks to choose between sounds plays each one in the row.
// The list is read from the flow as "Waiting for you" reads it (waitList.ts); this component reads Alma's thread for
// it (the picks being made), so the page around it is not drawn again when the thread changes.
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import type { FilmState } from '@/server/types';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { useUIActions } from '@/components/data/ui';
import { flowOf, type Flow } from '@/components/lib/flow';
import { repoPath } from '@/components/lib/format';
import { AskCard } from '@/components/feed/Feed';
import { PlayButton } from '@/components/media/Sound';
import { Reveal } from '@/components/shell/Reveal';
import { IconChevronRight } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { GoCard, PickCard, ReleaseWaitCard, StoryWaitCard } from './GatePage';
import { itemHref, soundsOf, waitItemsOf, type WaitItem } from './waitList';
import { useKept } from './useKept';
import { refData } from '@/components/lib/refPick';
import { waitRefOf } from '@/components/shell/refItems';

/** The flow and what waits in it, for the film on screen; undefined until the film is read. */
export function useWaitingNow(): { s: FilmState; flow: Flow; items: WaitItem[] } | undefined {
  const { state } = useFilm();
  const { tasks } = useThread();
  return useMemo(() => {
    if (!state) return undefined;
    const flow = flowOf(state, tasks);
    return { s: state, flow, items: waitItemsOf(flow) };
  }, [state, tasks]);
}

/** Hands up how many things What's next lists as waiting for the user, only when it changes: the Edit page shows it on
 *  the What's next tab without reading Alma's thread itself. */
export function WaitingCount({ onCount }: { onCount: (n: number) => void }) {
  const w = useWaitingNow();
  const n = w?.items.length;
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (n === undefined || n === last.current) return;
    last.current = n;
    onCount(n);
  }, [n, onCount]);
  return null;
}

export function WaitingNow({ w, here, from, open, onOpen }: {
  w: { s: FilmState; flow: Flow; items: WaitItem[] };
  /** The page this list is on (its address after the film's, "/edit"): no "Open" for what belongs here. */
  here?: string;
  /** Where an answer was given, said to Alma. */
  from: string;
  /** The row opened from outside (a step's line pressed), and the way to open one. */
  open?: string;
  onOpen: (key?: string) => void;
}) {
  const rows = useKept(w.items);
  const n = w.items.length;
  if (!rows.length) return null;
  return (
    <section data-waiting-now aria-label="Waiting for you" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span key={n} className="lbl duration-200 animate-in fade-in-0">{n ? `Waiting for you · ${n}` : 'Nothing waits for you'}</span>
        <span className="text-[12px] text-mute">from “Waiting for you”, each question once · answer here, or open its page</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0" aria-label="Waiting for you">
        {rows.map(({ it, here: there }) => (
          // min-w-0: the folded card under a row must not widen the list
          <Reveal key={it.key} open={there} className="min-w-0">
            <Row it={it} w={w} here={here} from={from} open={open === it.key} onOpen={onOpen} />
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

function Row({ it, w, here, from, open, onOpen }: { it: WaitItem; w: { s: FilmState; flow: Flow }; here?: string; from: string; open: boolean; onOpen: (key?: string) => void }) {
  const ui = useUIActions();
  const { s, flow } = w;
  const base = `/films/${s.film.slug}`;
  const href = itemHref(it, flow);
  const where = flow.nodes[it.place]?.name;
  const sounds = soundsOf(it, s);
  // the step it belongs to, unless the question already names it ("Voices")
  const place = where && where !== it.title ? where : undefined;
  const toRepo = (rel: string) => repoPath(s.film.folder, s.film.repo, rel);
  const li = useRef<HTMLLIElement>(null);
  // opened from a step's line: brought into view
  useEffect(() => { if (open) li.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open]);
  const chip = (id: string, label: string) => ui.addChip({ id, label });
  const prefill = (t: string, id: string, label: string) => ui.command({ id, label }, t);
  const g = it.gate;
  return (
    <li ref={li} data-wait={it.key} data-wait-ready={it.ready || undefined} {...refData(waitRefOf(it))}
      className={cn('mb-1.5 min-w-0 rounded-[10px] border transition-[border-color,background-color] duration-200 animate-in fade-in-0', it.ready ? 'border-line' : 'border-dashed border-line')}>
      <div className="flex min-h-[52px] items-center gap-3 px-2.5 py-1.5 max-[760px]:flex-wrap max-[760px]:gap-y-1.5">
        <span className="w-4 flex-none max-[760px]:hidden" />
        {/* on the phone the word goes on its own line above the question, so the question has the width */}
        <span data-wait-word className={cn('flex w-[124px] flex-none items-center gap-1.5 text-[12px] max-[760px]:w-auto max-[760px]:basis-full', it.ready ? 'text-warn' : 'text-mute')}>
          <span aria-hidden="true" className="flex size-[13px] flex-none items-center justify-center">
            <span className={cn('box-border size-[8px] rounded-full border-[1.5px]', it.ready ? 'border-warn' : 'border-mute')} />
          </span>
          {it.word}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink" title={it.title}>{it.title}</span>
          <span className="line-clamp-2 text-[12px] leading-snug text-sub" title={[place, it.cost ?? it.line].filter(Boolean).join(' · ')}>
            {place}{place && (it.cost || it.line) ? ' · ' : ''}{it.cost ? <span data-wait-cost className="text-ink-3">{it.cost}</span> : it.line ?? ''}
          </span>
          {/* the sounds to choose between, each heard right here */}
          {sounds.length > 0 && (
            <span data-wait-sounds className="mt-1 flex flex-wrap items-center gap-1.5">
              {sounds.map((x) => (
                <span key={x.key} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-[12px] text-sub">
                  <PlayButton path={toRepo(x.path)} label={`${it.title}, option ${x.label}`} className="size-7" />{x.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="flex flex-none items-center gap-1 max-[760px]:basis-full">
          {/* posting the film has nothing to answer here: its one button opens the Release page */}
          {it.release ? (href !== here && (
            <Link href={`${base}${href}`} data-wait-open data-wait-release
              className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-edge-strong px-3 text-[12.5px] text-ink no-underline transition-colors duration-150 hover:bg-raised max-[760px]:h-11">Open Release</Link>
          )) : it.ready && (
            <button type="button" data-wait-answer aria-expanded={open} onClick={() => onOpen(open ? undefined : it.key)}
              className="inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-lg border border-edge-strong px-3 text-[12.5px] text-ink transition-colors duration-150 hover:bg-raised max-[760px]:h-11">
              {open ? 'Fold' : 'Answer'}
            </button>
          )}
          {!it.release && href !== here && (
            <Link href={`${base}${href}`} data-wait-open title={`Open ${where ?? 'its page'}`}
              className="group/open inline-flex h-8 items-center gap-0.5 whitespace-nowrap rounded-lg px-2 text-[12.5px] text-sub no-underline transition-colors duration-150 hover:text-ink max-[760px]:h-11">
              Open<IconChevronRight size={13} className="text-mute transition-colors duration-150 group-hover/open:text-ink" />
            </Link>
          )}
        </span>
      </div>
      {/* the very card of "Waiting for you", answered here the same way */}
      <Reveal open={open} className="min-w-0 px-2.5 pb-2.5">
        <div className="flex flex-col gap-3 pt-0.5">
          {it.story ? <StoryWaitCard w={it.story} base={base} onChip={chip} />
            : it.release ? <ReleaseWaitCard w={it.release} base={base} onChip={chip} />
            : it.card ? <AskCard film={s.film.slug} card={it.card} toRepo={toRepo} from={from} where={<span>{where}</span>} />
            : g?.kind === 'go' ? <GoCard p={g} base={base} onChip={chip} />
            : g ? <PickCard p={g} onChip={chip} onPrefill={prefill} from={from} voices={it.voiceIds} /> : null}
        </div>
      </Reveal>
    </li>
  );
}
