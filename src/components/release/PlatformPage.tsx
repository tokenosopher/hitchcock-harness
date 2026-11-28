'use client';
// A platform's page, /films/<film>/release/<platform> (14 Nov 2026; boards 16 to 19): the tabs in posting order (left
// and right arrow keys move between them, not while typing), the state line, and the three parts, "How it will look",
// "The text" and "Sending it". Laid out by the page's own width (layout.tsx: three columns, two, or one with Sending
// it's main button in a dock at the foot), so opening Alma's column or the films list changes it; the phone has its
// own one-column page (PhoneRelease.tsx).
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';
import { usePage } from '@/components/data/ui';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { IconChevronLeft, IconChevronRight } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { filmMeta, useFilmPage } from '@/components/pages/common';
import { platformStatus, postedCount, waveAt, dayWords } from './derive';
import { LookFold, PlatformLook } from './PlatformLook';
import { PlatformText } from './PlatformText';
import { useMinute } from './clock';
import { Glyph, Pill, StateWords, useRelease } from './ui';
import { useIsPhone } from '@/components/shell/useIsPhone';
import { SendBar, SendingIt } from './PlatformSend';
import { PhonePlatform } from './PhoneRelease';
import { DockProvider, layoutFor, useFadeOn, useTyping, useWidth } from './layout';
import type { Platform, ReleaseFile } from './file';
import type { FilmState } from '@/server/types';
import { StepIntro } from '@/components/intro/StepIntro';
import { refData } from '@/components/lib/refPick';
import { platformRef } from './refs';

export function PlatformPage() {
  const { film, state, error, base } = useFilmPage();
  const { platform: pid } = useParams<{ platform: string }>();
  const rel = useRelease(film);
  const now = useMinute();
  const router = useRouter();
  const phone = useIsPhone();
  const file = rel.view?.file;
  const p = file?.platforms.find((x) => x.id === pid);
  usePage(p ? `Release · ${p.name}` : 'Release', 'Tell Alma what to change in the text…');
  const ids = file?.platforms.map((x) => x.id) ?? [];
  const i = ids.indexOf(pid);
  const prev = i > 0 ? ids[i - 1] : undefined, next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : undefined;
  // left and right arrows move between the platforms, unless the user is typing
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : undefined;
      if (to) { e.preventDefault(); router.push(`${base}/release/${to}${window.location.search}`); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [prev, next, base, router]);

  if (!state || !rel.view) return <Loading error={error ?? rel.error} />;
  if (!file?.final) return <Loading error="No final yet: name the final on the Release page first." />;
  if (!p) return <Loading error={`No platform "${pid}" in this release.`} />;
  if (phone) return <PhonePlatform rel={rel} file={file} p={p} now={now} state={state} base={base} />;
  return <DesktopPlatform rel={rel} file={file} p={p} now={now} state={state} base={base} film={film} prev={prev} next={next} />;
}

/** The desktop page: its layout chosen by its own width (layout.tsx). */
function DesktopPlatform({ rel, file, p, now, state, base, film, prev, next }: { rel: ReturnType<typeof useRelease>; file: ReleaseFile; p: Platform; now: Date; state: FilmState; base: string; film: string; prev?: string; next?: string }) {
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const w = useWidth(wrap);
  const layout = layoutFor(w ?? 1200);
  useFadeOn(body, layout);
  const typing = useTyping();
  const st = platformStatus(file, p.id, now);
  const posted = postedCount(file);
  const at = waveAt(file, p);
  const day = dayWords(at, now);
  const where = `by hand from ${p.account}`;
  const qs = typeof window === 'undefined' ? '' : window.location.search;
  const one = layout === 'one';
  return (
    <div ref={setWrap} data-layout={layout} className={cn('@container/page flex w-full flex-1 flex-col', !one && 'min-h-0')}>
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Release', href: `${base}/release${qs}` }, { label: p.name }]}
        back={{ label: 'Back to Release', href: `${base}/release${qs}`, soft: true }} meta={filmMeta(state)} phoneSub={`Release · ${p.name}`}
        crumbExtra={<Pill className="ml-1 @max-[820px]/page:hidden">final: master of {file.final!.version}</Pill>} actions={<Pill className="h-8">{posted.words}</Pill>} />
      <StepIntro step="platform" className="px-5 py-3" />
      <Tabs file={file} p={p} now={now} base={base} qs={qs} prev={prev} next={next} sticky={one} />
      <div data-state-line {...refData(platformRef(p))} className="flex min-h-[42px] flex-none flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-5 py-2 text-[12.5px] text-sub">
        <StateWords st={st} big className="flex-wrap whitespace-normal" />
        <span className="text-faint">·</span><span>{where}</span>
        {st.state !== 'posted' && st.state !== 'sending' && <><span className="text-faint">·</span><span>planned for about {p.wave.about}{day === 'today' ? '' : ` ${day}`}</span></>}
      </div>
      <SendBar file={file} p={p} now={now} base={base} />
      <DockProvider value={one ? dock : null}>
        <div ref={setBody} data-platform-page={p.id} className={cn(one ? 'flex flex-col' : 'flex min-h-0 flex-1')}>
          {layout === 'three' && <PlatformLook film={film} state={state} file={file} p={p} />}
          <PlatformText film={film} state={state} file={file} p={p} st={st} now={now} run={rel.run} base={base} layout={layout} finalFile={rel.view?.finalFile}
            look={layout !== 'three' ? <LookFold film={film} state={state} file={file} p={p} /> : undefined} />
          <SendingIt rel={rel} file={file} p={p} now={now} base={base} layout={layout} />
        </div>
      </DockProvider>
      {one && (
        <div data-send-dock className={cn('sticky bottom-0 z-10 mt-auto flex flex-col gap-2 border-t border-line bg-bg px-5 pb-3 pt-2.5 transition-[opacity,translate] duration-200 ease-out',
          typing ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100')}>
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-sub"><span className="flex-none font-medium text-ink">Sending it</span><span className="text-faint">·</span><StateWords st={st} tags={false} className="min-w-0" /></span>
          <div ref={setDock} className="flex flex-col gap-2" />
        </div>
      )}
    </div>
  );
}

/** The platforms in posting order. The row scrolls sideways when it has to, the current one brought into view and a
 *  fade at each cut edge; the arrows stay outside it. */
function Tabs({ file, p, now, base, qs, prev, next, sticky }: { file: ReleaseFile; p: Platform; now: Date; base: string; qs: string; prev?: string; next?: string; sticky?: boolean }) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ l: false, r: false });
  useLayoutEffect(() => {
    if (!row) return;
    // the current platform brought into view: on arrival, and again when the row narrows
    const center = () => {
      const cur = row.querySelector<HTMLElement>('[aria-current="page"]');
      if (!cur) return;
      const a = cur.getBoundingClientRect(), b = row.getBoundingClientRect();
      if (a.left < b.left || a.right > b.right) row.scrollTo({ left: Math.max(0, row.scrollLeft + a.left - b.left - (b.width - a.width) / 2) });
    };
    const look = () => setEdges({ l: row.scrollLeft > 2, r: row.scrollLeft + row.clientWidth < row.scrollWidth - 2 });
    center();
    look();
    row.addEventListener('scroll', look, { passive: true });
    const ro = new ResizeObserver(() => { center(); look(); });
    ro.observe(row);
    // a tab's width changes too ("1 left", "2 notes")
    for (const c of row.children) ro.observe(c);
    return () => { row.removeEventListener('scroll', look); ro.disconnect(); };
  }, [row, p.id]);
  const mask = edges.l && edges.r ? '[mask-image:linear-gradient(to_right,transparent,#000_28px,#000_calc(100%-28px),transparent)]'
    : edges.l ? '[mask-image:linear-gradient(to_right,transparent,#000_28px)]' : edges.r ? '[mask-image:linear-gradient(to_left,transparent,#000_28px)]' : '';
  return (
    <nav aria-label="Platforms" data-tabs-bar className={cn('flex h-11 flex-none items-stretch border-b border-line bg-bg', sticky && 'sticky top-14 z-10 [@media(max-height:520px)]:static')}>
      <div ref={setRow} data-tabs className={cn('no-scrollbar flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-3', mask)}>
        {file.platforms.map((q) => {
          const s = platformStatus(file, q.id, now);
          const notes = q.fields.reduce((a, f) => a + (f.notes ?? []).filter((n) => !n.answered).length, 0);
          const on = q.id === p.id;
          return (
            <Link key={q.id} href={`${base}/release/${q.id}${qs}`} data-tab={q.id} {...refData(platformRef(q))} aria-current={on ? 'page' : undefined}
              className={cn('relative inline-flex flex-none items-center gap-[7px] whitespace-nowrap px-2.5 text-[12.5px] no-underline transition-colors duration-150', on ? 'text-ink' : 'text-sub hover:text-ink')}>
              <Glyph state={s.state} />{q.name}
              {s.state === 'posted' && s.tags.some((t) => t.tone === 'amber' && /left in/.test(t.text)) && <span className="text-[11px] text-warn">{s.tags.find((t) => /left in/.test(t.text))!.text.replace(/ thing(s)? left in .*/, ' left')}</span>}
              {notes > 0 && <span className="inline-flex h-[17px] items-center rounded-[5px] border border-edge-strong px-1.5 text-[11px] text-sub">{notes} {notes === 1 ? 'note' : 'notes'}</span>}
              <span className={cn('absolute inset-x-2 bottom-0 h-[1.5px] bg-ink transition-opacity duration-200', on ? 'opacity-100' : 'opacity-0')} />
            </Link>
          );
        })}
      </div>
      <span className="flex flex-none items-center gap-1.5 border-l border-line px-3">
        <ArrowLink to={prev && `${base}/release/${prev}${qs}`} label="The platform before"><IconChevronLeft size={12} /></ArrowLink>
        <ArrowLink to={next && `${base}/release/${next}${qs}`} label="The next platform"><IconChevronRight size={12} /></ArrowLink>
      </span>
    </nav>
  );
}

function ArrowLink({ to, label, children }: { to?: string; label: string; children: React.ReactNode }) {
  const cls = 'grid size-7 place-items-center rounded-[6px] border border-edge-strong text-ink-3 transition-colors duration-150';
  return to ? <Link href={to} aria-label={label} className={cn(cls, 'hover:bg-raised')}>{children}</Link> : <span aria-hidden="true" className={cn(cls, 'opacity-40')}>{children}</span>;
}
