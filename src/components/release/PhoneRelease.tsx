'use client';
// The Release pages on the phone (stage 3 of 3, board Phone), chosen under the app's phone breakpoint (useIsPhone, as
// the Edit page chooses PhoneEdit). The Release list: big rows by wave, each a glyph and its word with the clock
// time, the facts to confirm, the next platform in the bar at the foot ("Go to TikTok") with the Alma pill. A
// platform: one column, the state, "How it will look" folded, the text editable as on the Mac (since the Release QC,
// 14 Nov 2026: a platform still to pick could not be picked on the phone), and "Sending it" full width, its main
// button (or the step to do now, by hand) in the bar at the foot. Every target 44 px (.touch-targets).
import Link from 'next/link';
import { Header } from '@/components/shell/Header';
import { IconChevronLeft } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import type { FilmState } from '@/server/types';
import { appName, nextUp, platformStatus, postedCount, threadWords, waves } from './derive';
import type { Platform, ReleaseFile } from './file';
import { clockOf } from './sendflow';
import { PlatformSend, useFinalInfo } from './PlatformSend';
import { PlatformText } from './PlatformText';
import { LookFold } from './PlatformLook';
import { DockProvider } from './layout';
import { Facts } from './ReleaseOpen';
import { NoTexts } from './AskAlma';
import { useState } from 'react';
import { PhoneBar, phoneMain } from './PhoneBar';
import { Mono, StateWords, type useRelease } from './ui';
import { StepIntro } from '@/components/intro/StepIntro';

type Rel = ReturnType<typeof useRelease>;

export function PhoneReleaseList({ rel, file, now, state, base }: { rel: Rel; file: ReleaseFile; now: Date; state: FilmState; base: string }) {
  const n = nextUp(file, now);
  const secs = rel.view?.finalFile?.seconds;
  return (
    <div data-phone-release className="touch-targets flex min-h-full flex-none flex-col">
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Release' }]} meta="" phoneSub={`Release · ${postedCount(file).words}`} />
      <div className="flex flex-col gap-1 px-4 pb-1 pt-4">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">Release</h1>
        <span className="text-[13px] text-sub">{state.film.title}{secs ? `, ${clockOf(secs)}` : ''}</span>
      </div>
      <StepIntro step="release" className="px-4 pt-4" />
      <div className="flex flex-col gap-4 px-4 pt-3">
        {waves(file, now).map((w) => (
          <section key={w.key} className="flex flex-col gap-2">
            <h2 className="m-0 text-[13px] font-normal text-sub">{w.label}</h2>
            {w.ids.map((id) => <PhoneRow key={id} file={file} p={file.platforms.find((x) => x.id === id)!} now={now} href={`${base}/release/${id}`} next={n?.platform.id === id} />)}
          </section>
        ))}
      </div>
      <div className="flex flex-col gap-4 px-4 pb-4 pt-4">
        {!file.platforms.length && <NoTexts film={rel.view?.film ?? ''} final={file.final!} />}
        <Facts file={file} run={rel.run} />
      </div>
      {n && <PhoneBar><Link href={`${base}/release/${n.platform.id}`} data-phone-next className={phoneMain}>Go to {appName(n.platform)}</Link></PhoneBar>}
    </div>
  );
}

function PhoneRow({ file, p, now, href, next }: { file: ReleaseFile; p: Platform; now: Date; href: string; next: boolean }) {
  const st = platformStatus(file, p.id, now);
  const thread = threadWords(file, p.id);
  const sub = [`by hand${thread ? `, ${thread}` : ''}`, ...st.tags.map((t) => t.text)];
  const route = st.tags.find((t) => /^By hand, step/.test(t.text)) ? sub.slice(1) : sub;
  return (
    <Link href={href} data-phone-row={p.id} data-row-state={st.state}
      className={cn('flex min-h-[60px] items-center gap-3 rounded-[12px] border px-3 py-2.5 text-ink no-underline transition-colors duration-150 active:bg-raised', next ? 'border-edge-strong bg-panel' : 'border-edge')}>
      <Mono kind={p.kind} className="size-8" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[15px] font-medium">{p.name}</b>
        {route.map((t, i) => <span key={i} className={cn('truncate text-[12.5px]', /left in|link to add/.test(t) ? 'text-warn' : 'text-sub')}>{t}</span>)}
      </span>
      <StateWords st={st} tags={false} reason={false} className="flex-none text-[13px]" />
    </Link>
  );
}

export function PhonePlatform({ rel, file, p, now, state, base }: { rel: Rel; file: ReleaseFile; p: Platform; now: Date; state: FilmState; base: string }) {
  const st = platformStatus(file, p.id, now);
  const final = useFinalInfo(rel, file, p.id);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const qs = typeof window === 'undefined' ? '' : window.location.search;
  return (
    <div data-phone-platform={p.id} className="touch-targets flex min-h-full flex-none flex-col">
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Release', href: `${base}/release${qs}` }, { label: p.name }]} meta="" phoneSub={`Release · ${p.name}`} />
      <div className="flex flex-col gap-1.5 px-4 pt-3">
        <Link href={`${base}/release${qs}`} data-phone-back className="-ml-1 inline-flex min-h-[44px] w-fit items-center gap-1 text-[13px] text-sub no-underline"><IconChevronLeft size={14} />Release</Link>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">{p.name} by hand</h1>
        <span className="text-[13px] text-sub">from {p.account}</span>
        <div data-state-line className="pt-1"><StateWords st={st} big className="flex-wrap whitespace-normal" /></div>
      </div>
      <StepIntro step="platform" className="px-4 pt-4" />
      <DockProvider value={dock}>
        {/* the whole text, editable as on the Mac: one box per platform part, full width */}
        <PlatformText film={rel.view?.film ?? ''} state={state} file={file} p={p} st={st} now={now} run={rel.run} base={base} layout="one" phone
          look={<LookFold film={rel.view?.film ?? ''} state={state} file={file} p={p} phone />} />
        <PlatformSend rel={rel} file={file} p={p} now={now} final={final} base={base} phone layout="one" />
      </DockProvider>
      <PhoneBar dock={<span className="flex min-w-0 items-center gap-2 text-[12px] text-sub"><span className="flex-none font-medium text-ink">Sending it</span><span className="text-faint">·</span><StateWords st={st} tags={false} className="min-w-0" /></span>}>
        <div ref={setDock} data-phone-dock className="flex flex-col gap-2" />
      </PhoneBar>
    </div>
  );
}
