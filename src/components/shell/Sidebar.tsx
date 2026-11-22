'use client';
// Films (in progress, delivered), the library with counts, Settings pinned at the bottom, studio folder and Alma status.
// Each group lists the film that moved last first, as ChatGPT and Claude list their chats: a film moves when the user
// writes in it or something new needs them, never for Alma working in the background. The
// rows slide to their new places, and not while a finger or the mouse is pressed in the list.
// Each row carries one mark (RowMark): the white dot when the film's "Waiting for you" lists anything, the glowing orb
// while Alma works and nothing waits.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFilms } from '@/components/data/films';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { filmSubtitle, STAGE_SHORT, waitingCount } from '@/components/lib/derive';
import { fmtDate } from '@/components/lib/format';
import { IconLogo, IconPanel, IconPlus, IconSearch, IconSettings } from './icons';
import { cn } from '@/lib/utils';
import { useNotify } from '@/components/notify/NotifyProvider';
import { byRecent, holdOrder, rowMark, rowMarkLabel } from './recent';
import { RowMark } from './RowMark';

/** Where each row was last drawn, per place the list is shown in ('side', 'drawer'). Kept outside the component: the
 *  sidebar is drawn anew when another film opens, and that is when its row has to slide up from where it was. */
const lastTops = new Map<string, Map<string, number>>();

/** FLIP: rows (`data-flip` = their key) that moved since the last layout start where they were and slide to their
 *  new place; with reduced motion they are simply there. */
function useFlip(list: React.RefObject<HTMLElement | null>, order: string, place: string) {
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || el.offsetParent === null) return;   // not shown (the phone's hidden side list): nothing to measure
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const now = new Map<string, number>();
    const rows = [...el.querySelectorAll<HTMLElement>('[data-flip]')];
    for (const row of rows) now.set(row.dataset.flip!, row.offsetTop);
    for (const row of rows) {
      const from = lastTops.get(place)?.get(row.dataset.flip!);
      const to = now.get(row.dataset.flip!)!;
      if (still || from === undefined || from === to) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${from - to}px)`;
      void row.offsetHeight;
      row.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      row.style.transform = '';
      const done = () => { row.style.transition = ''; row.removeEventListener('transitionend', done); };
      row.addEventListener('transitionend', done);
    }
    lastTops.set(place, now);
  }, [list, order, place]);
}

export function Sidebar({ current, onNavigate, onCollapse }: { current?: string; onNavigate?: () => void; onCollapse?: () => void }) {
  const { films, library, drive: driveState, loaded, recent } = useFilms();
  const onNew = usePathname() === '/films/new';
  const { state } = useFilm();
  const thread = useThread();
  const { unread, running, waiting } = useNotify();
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);
  // the lists fade in only when they arrive after the sidebar is drawn (the frame is drawn anew on each film)
  const [arrived] = useState(!loaded);
  const libTab = useSearchParams().get('tab') ?? 'faces';
  const drive = driveState !== 'not connected';

  const match = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase());
  // a draft folder another film carried on stays in the registry (for Alma) but not in the list
  // in each group the film worked on last goes first (a film started here is worked on now); films with no activity
  // known keep the registry's order (latest start first) and, delivered, the latest delivery first
  const slug = (f: { slug: string }) => f.slug;
  const liveNow = byRecent(films.filter((f) => f.status === 'in-progress' && !f.supersededBy && match(f.title)), slug, recent);
  const doneNow = byRecent(films.filter((f) => f.status === 'delivered' && match(f.title))
    .sort((a, b) => (b.delivered?.[0]?.date ?? '').localeCompare(a.delivered?.[0]?.date ?? '')), slug, recent);
  // a press in the list holds the order it began with; the new order comes in once the press ends
  const [held, setHeld] = useState<{ live: string[]; done: string[] } | null>(null);
  useEffect(() => {
    if (!held) return;
    const end = () => setHeld(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, [held]);
  const live = holdOrder(liveNow, slug, held?.live ?? null);
  const done = holdOrder(doneNow, slug, held?.done ?? null);
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef, `${live.map(slug).join()}|${done.map(slug).join()}`, onNavigate ? 'drawer' : 'side');
  // the film open now: Alma's working state as its page has it (the phone bar's "Alma is working": her turn, her
  // sub-agents), so its orb comes and goes with no wait; every film: the server's word on the notices' stream
  const liveWorking = thread.loaded && (thread.workingSince !== undefined || thread.tasks.some((t) => t.state === 'running' || t.state === 'queued'));
  // what waits for the user: the film open now counts its page's own list (its state with what was just sent left
  // out), so its dot goes the moment the user answers; every film: the server's count on the notices' stream, by the
  // same rule (derive.ts waitingKeys)
  const liveWaiting = state && state.film.slug === current && thread.loaded ? waitingCount(state, thread.tasks) : undefined;
  const markOf = (film: string) => {
    const u = unread[film];
    const n = film === current && liveWaiting !== undefined ? liveWaiting : waiting[film] ?? 0;
    const mark = rowMark({ waiting: n, working: running.has(film) || (film === current && liveWorking) });
    return <RowMark mark={mark} label={rowMarkLabel(mark, { waiting: n, unread: u?.count, last: u?.last })} />;
  };

  return (
    <nav aria-label="Films" className="flex h-full min-w-0 flex-col bg-bg">
      {/* The head stays put while the lists scroll under it (the user, 13 Nov 2026): the name, New film, Search. */}
      <div className="relative z-[1] flex-none px-2.5 pt-3">
      <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1.5">
        <div className="flex size-7 flex-none items-center justify-center rounded-[7px] bg-ink text-bg"><IconLogo /></div>
        <div className="flex min-w-0 flex-col leading-[1.2]">
          <span className="whitespace-nowrap text-[14px] font-semibold tracking-[-0.01em]">Hitchcock Harness</span>
          <span className="text-[12px] text-sub">v{process.env.HARNESS_VERSION}</span>
        </div>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="Hide the films list" title="Hide the films list"
            className="ml-auto flex size-7 flex-none cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-sub hover:bg-raised hover:text-ink">
            <IconPanel size={16} />
          </button>
        )}
      </div>

      <Link href="/films/new" onClick={onNavigate} aria-current={onNew ? 'page' : undefined} aria-keyshortcuts="Meta+N"
        className={cn('mx-0.5 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-edge px-2.5 text-[13px] font-medium text-ink no-underline hover:bg-raised', onNew ? 'bg-raised' : 'bg-bg')}>
        <IconPlus />New film
        <span className="ml-auto rounded-[4px] border border-edge px-[5px] py-px font-mono text-[11px] text-sub">⌘N</span>
      </Link>

      <div className="relative mx-0.5 mb-2.5 mt-2">
        <IconSearch size={14} className="absolute left-2.5 top-[11px] text-mute" />
        <label htmlFor="film-search" className="sr-only">Search films</label>
        <input id="film-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-line bg-panel pl-8 pr-2.5 text-[13px] text-ink placeholder:text-mute" />
      </div>
        {/* a soft edge that fades in once the lists have moved under the head */}
        <div aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-bg to-transparent transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')} />
        <div aria-hidden="true" className={cn('absolute inset-x-0 bottom-0 h-px bg-line transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')} />
      </div>

      <div onScroll={(e) => { const on = e.currentTarget.scrollTop > 2; if (on !== scrolled) setScrolled(on); }} className="scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-3 pt-2">

      {/* nothing until the registry has answered, then the lists fade in whole: drawn empty first, "Delivered" and
          "Library" jumped down as the films arrived */}
      {!loaded ? null : !drive ? (
        <div className="mx-2.5 rounded-lg border border-dashed border-edge-strong p-3 text-[12.5px] text-sub">Studio folder missing</div>
      ) : (
        <div ref={listRef} onPointerDown={() => setHeld({ live: live.map(slug), done: done.map(slug) })}
          className={cn('relative flex flex-col', arrived && 'duration-200 animate-in fade-in motion-reduce:animate-none')}>
          <div className="lbl px-2.5 pb-1.5">In progress</div>
          <div className="flex flex-col gap-0.5">
            {live.map((f) => {
              const on = f.slug === current;
              const sub = on && state ? filmSubtitle(state, thread.tasks) : f.stage ? STAGE_SHORT[f.stage] : '';
              return (
                <Link key={f.slug} data-flip={f.slug} href={`/films/${f.slug}`} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                  className={cn('flex min-h-11 flex-col gap-[5px] rounded-lg px-2.5 py-[9px] text-ink no-underline', on ? 'bg-raised' : 'hover:bg-panel')}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium" title={f.title}>{f.title}</span>
                    {markOf(f.slug)}
                  </span>
                  <span className="w-full truncate text-[12px] text-sub">{sub}</span>
                </Link>
              );
            })}
            {!live.length && <span className="px-2.5 text-[12px] text-mute">{q ? 'No match' : 'None'}</span>}
          </div>

          <div className="lbl px-2.5 pb-1.5 pt-5">Delivered</div>
          <div className="flex flex-col gap-0.5">
            {done.map((f) => {
              const on = f.slug === current;
              return (
                <Link key={f.slug} data-flip={f.slug} href={`/films/${f.slug}`} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                  className={cn('flex flex-col justify-center rounded-lg px-2.5 text-[#D4D4D8] no-underline', on ? 'bg-raised py-2 text-ink' : 'h-10 hover:bg-panel')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-[13.5px]', on && 'font-medium')} title={f.title}>{f.title}</span>
                    <span className="flex flex-none items-center gap-2">{markOf(f.slug)}<span className="text-[12px] text-mute">{fmtDate(f.delivered?.[0]?.date)}</span></span>
                  </span>
                  {on && f.stage && <span className="truncate text-[12px] text-sub">{STAGE_SHORT[f.stage]} · delivered {fmtDate(f.delivered?.[0]?.date)}</span>}
                </Link>
              );
            })}
          </div>

          <div className="lbl px-2.5 pb-0.5 pt-5">Library</div>
          <div className="px-2.5 pb-1.5 text-[12px] text-mute">{library?.note ?? 'across all films'}</div>
          <div className="flex flex-col gap-0.5">
            {(['faces', 'voices', 'characters', 'locations'] as const).map((k) => {
              const on = current === 'library' && libTab === k;
              return (
                <Link key={k} href={`/library?tab=${k}`} onClick={onNavigate} aria-label={`Library, ${k}${library ? `, ${library[k]}` : ''}`} aria-current={on ? 'page' : undefined}
                  className={cn('flex h-9 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 text-left no-underline hover:bg-panel', on ? 'bg-panel text-ink' : 'text-[#D4D4D8]')}>
                  <span className="text-[13.5px] capitalize">{k}</span>
                  <span className="flex-none text-[12px] tabular-nums text-mute">{library ? library[k] : '—'}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* The foot stays put too: Settings and what is connected. */}
      <div className="flex flex-none flex-col gap-2 border-t border-line px-2.5 pb-3 pt-2.5 text-[12px] text-sub">
        <Link href="/settings" onClick={onNavigate} aria-current={current === 'settings' ? 'page' : undefined}
          className={cn('flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13.5px] no-underline hover:bg-panel', current === 'settings' ? 'bg-panel text-ink' : 'text-[#D4D4D8]')}><IconSettings />Settings</Link>
        <div className="flex items-center gap-2 px-2.5"><span className={cn('size-1.5 rounded-full', !loaded ? 'bg-mute' : drive ? 'bg-ok' : 'bg-bad')} />{!loaded ? 'Studio folder…' : drive ? 'Studio folder ready' : 'Studio folder missing'}</div>
        <div className="flex items-center gap-2 px-2.5"><span className={cn('size-1.5 rounded-full', thread.error ? 'bg-bad' : 'bg-ok')} />Alma · this Mac</div>
      </div>
    </nav>
  );
}
