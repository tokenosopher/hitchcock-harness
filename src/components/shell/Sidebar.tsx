'use client';
// Films (in progress, delivered), the library with counts, Settings pinned at the bottom, studio folder and Alma status.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useFilms } from '@/components/data/films';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { filmSubtitle, STAGE_SHORT } from '@/components/lib/derive';
import { fmtDate } from '@/components/lib/format';
import { IconLogo, IconPanel, IconPlus, IconSearch, IconSettings } from './icons';
import { cn } from '@/lib/utils';
import { UnreadBadge } from '@/components/notify/UnreadBadge';

export function Sidebar({ current, onNavigate, onCollapse }: { current?: string; onNavigate?: () => void; onCollapse?: () => void }) {
  const { films, library, drive: driveState, loaded, started } = useFilms();
  const onNew = usePathname() === '/films/new';
  const { state } = useFilm();
  const thread = useThread();
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);
  // the lists fade in only when they arrive after the sidebar is drawn (the frame is drawn anew on each film)
  const [arrived] = useState(!loaded);
  const libTab = useSearchParams().get('tab') ?? 'faces';
  const drive = driveState !== 'not connected';

  const match = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase());
  // a draft folder another film carried on stays in the registry (for Alma) but not in the list
  // films started in this window go first, newest first; the rest keep the registry's order (latest start first)
  const rank = (slug: string) => { const i = started.indexOf(slug); return i < 0 ? started.length : i; };
  const live = films.filter((f) => f.status === 'in-progress' && !f.supersededBy && match(f.title))
    .map((f, i) => ({ f, i })).sort((a, b) => rank(a.f.slug) - rank(b.f.slug) || a.i - b.i).map((x) => x.f);
  const done = films.filter((f) => f.status === 'delivered' && match(f.title))
    .sort((a, b) => (b.delivered?.[0]?.date ?? '').localeCompare(a.delivered?.[0]?.date ?? ''));

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
        <div className={cn('flex flex-col', arrived && 'duration-200 animate-in fade-in motion-reduce:animate-none')}>
          <div className="lbl px-2.5 pb-1.5">In progress</div>
          <div className="flex flex-col gap-0.5">
            {live.map((f) => {
              const on = f.slug === current;
              const sub = on && state ? filmSubtitle(state, thread.tasks) : f.stage ? STAGE_SHORT[f.stage] : '';
              const waiting = on && /picks waiting/.test(sub);
              return (
                <Link key={f.slug} href={`/films/${f.slug}`} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                  className={cn('flex min-h-11 flex-col gap-[5px] rounded-lg px-2.5 py-[9px] text-ink no-underline', on ? 'bg-raised' : 'hover:bg-panel')}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium" title={f.title}>{f.title}</span>
                    {waiting ? <span aria-label="Waiting on you" className="size-1.5 flex-none rounded-full bg-ink shadow-[0_0_0_3px_#27272A]" /> : <UnreadBadge film={f.slug} />}
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
                <Link key={f.slug} href={`/films/${f.slug}`} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                  className={cn('flex flex-col justify-center rounded-lg px-2.5 text-[#D4D4D8] no-underline', on ? 'bg-raised py-2 text-ink' : 'h-10 hover:bg-panel')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-[13.5px]', on && 'font-medium')} title={f.title}>{f.title}</span>
                    <span className="flex-none text-[12px] text-mute">{fmtDate(f.delivered?.[0]?.date)}</span>
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
