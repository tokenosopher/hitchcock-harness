'use client';
// The go for the video (/films/[film]/go): the one hard spend gate (SPEC principle 7). Every scene the go would
// start, as a card: its shots, the newest prompt in full, every reference at its number, the check, the prompt QC
// and the credits; a sticky footer with the total, the last balance the record or the thread mentions, and the
// one white button, which only puts the go in the composer: Alma submits nothing until the user sends it.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePage } from '@/components/data/ui';
import { fmtDate } from '@/components/lib/format';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import { Header } from '@/components/shell/Header';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { Btn } from '@/components/shell/atoms';
import { useFilmPage, filmMeta } from '@/components/pages/common';
import { Reveal } from '@/components/shell/Reveal';
import { takesReady } from '@/components/edit/takesReady';
import { GoSceneCard } from './GoScene';
import { fmtCr, goList, goMessage, threadBalance, totalCredits, totalSeconds, useGo } from './lib';
import { cn } from '@/lib/utils';

/** On the phone the thread is a panel fixed at the bottom of the screen: the footer sits right above it. The page's
 *  scroll box (main) already keeps a bottom padding for the panel, and a sticky footer stops at that padding, so the
 *  offset is the panel's height less the padding (negative when the padding is the taller). */
function useThreadPanelHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('aside[aria-label="Thread with Alma"]');
    if (!el) return;
    const read = () => {
      const on = window.innerWidth <= 760 && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().top > 0;
      const main = el.parentElement?.querySelector('main');
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setH(on ? el.getBoundingClientRect().height - pad : 0);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener('resize', read);
    return () => { ro.disconnect(); window.removeEventListener('resize', read); };
  }, []);
  return h;
}

export function GoPage() {
  const { film, state, error, ui, base, events } = useFilmPage();
  const { review, error: goError } = useGo(film);
  const [withTakes, setWithTakes] = useState(false);
  const [selected, setSelected] = useState<string>();
  const panel = useThreadPanelHeight();
  const shown = goList(review, withTakes);
  const ready = shown.filter((s) => s.ready);
  const left = shown.filter((s) => !s.ready);
  const total = totalCredits(ready);
  // the same test as the go in What's next: a scene's own prompt passing is not enough; its boards, their yes
  // and every reference must be ready too. Scenes that already have a take (shown with the switch) are not held by it.
  const first = state ? ready.filter((x) => !state.scenes.find((sc) => sc.id === x.id)?.takes.some((t) => t.kind === 'take')).map((x) => x.id) : [];
  const whole = state && first.length ? takesReady(state, first) : undefined;
  const held = !!whole && !whole.ready;
  const taken = (review?.scenes ?? []).filter((s) => s.takes > 0).length;
  usePage(state && review ? (shown.length ? `Go for the video · ${ready.length} ${ready.length === 1 ? 'generation' : 'generations'} · ≈ ${fmtCr(total)}` : 'Go for the video · every scene has a take') : undefined,
    'Say go, or tell Alma what to change first…', ready.length ? [`Quote the go exactly`, 'What changed since the last prompts?'] : []);
  if (!state) return <Loading error={error} />;
  if (!review) return <Loading error={goError ?? 'Reading the prompts, media lists and checks…'} />;

  const balance = review.balance ?? threadBalance(events);
  const after = balance ? Math.round((balance.credits - total) * 100) / 100 : undefined;
  const go = () => {
    ui.prefill(goMessage(ready), { id: 'go:video', label: `Go · ${ready.map((s) => s.id).join(' ')} · ≈ ${fmtCr(total)}` });
    ui.setThreadOpen(true);
  };
  const sel = review.scenes.find((s) => s.id === selected);
  const change = () => {
    if (sel) ui.prefill(`Before the go, change ${sel.id}: `, { id: `scene:${sel.id}`, label: `${sel.id} · ${sel.title}${sel.prompt ? ` · prompt ${sel.prompt.version}` : ''}` });
    else ui.prefill('Before the go, change: ');
    ui.setThreadOpen(true);
  };

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Scenes', href: `${base}/scenes` }, { label: 'Go for the video' }]}
        meta={filmMeta(state, `${review.scenes.length} scenes`)} phoneSub={`${ready.length} generations · ≈ ${fmtCr(total)}`} />
      <PageBody wide>
        <StageTitle kicker="Stage 7 · the one hard spend gate" title="Go for the video"
          sub={<>Every scene the go starts: its shots, the newest prompt in full, every reference at the number the prompt cites it by, the check and the credits. Nothing runs until you send the go to Alma.{review.rate ? <> Credits at <span title={review.rate.basis} className="cursor-help underline decoration-faint decoration-dotted underline-offset-2">{review.rate.crPerSec} cr/s ({review.rate.resolution})</span>, from spend.md.</> : ' spend.md has no seedance_2_5 rate yet, so there is no quote.'}</>}
          right={shown.length ? <QCChip spec={qcSpec('prompt')} chipLabel="prompts"
            targets={shown.map((s) => ({ target: s.id, label: `${s.id} prompt${s.prompt ? ` ${s.prompt.version}` : ''}`, entry: qcEntry(state, 'prompt', s.id), ready: !!s.prompt, waitsFor: s.prompt ? `${s.id} prompt ${s.prompt.version}` : `${s.id}'s first prompt` }))} /> : undefined} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-3">
            <button type="button" role="switch" aria-checked={withTakes} onClick={() => setWithTakes(!withTakes)}
              className={cn('relative h-[18px] w-8 flex-none cursor-pointer rounded-full border transition-colors', withTakes ? 'border-ink bg-ink' : 'border-edge-strong bg-panel')}>
              <span className={cn('absolute top-[2px] size-3 rounded-full transition-all', withTakes ? 'left-[16px] bg-bg' : 'left-[2px] bg-sub')} />
            </button>
            Include scenes that already have takes<span className="text-sub">{taken}</span>
          </label>
          <span className="flex flex-wrap gap-1.5">
            {shown.map((s) => (
              <a key={s.id} href={`#go-${s.id}`} onClick={() => setSelected(s.id)}
                className={cn('inline-flex h-7 items-center gap-1.5 rounded-[14px] border px-2.5 font-mono text-[11.5px] no-underline', s.ready ? 'border-edge text-ink' : 'border-dashed border-edge-strong text-sub', selected === s.id && 'border-sub bg-raised')}>
                <span className={cn('size-1.5 rounded-full', s.ready ? 'bg-ink' : 'border border-warn')} />{s.id}
              </a>
            ))}
          </span>
        </div>

        {review.warnings.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">{review.warnings.map((w) => <li key={w} className="text-[12.5px] text-warn">{w}</li>)}</ul>
        )}

        {shown.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-dashed border-edge-strong px-5 py-6">
            <span className="text-[15px] font-medium">{review.scenes.length ? 'Every scene already has a take' : 'No scenes yet'}</span>
            <span className="text-[13px] leading-normal text-sub">
              {review.scenes.length
                ? <>The first go is behind this film. For a re-run, turn on “Include scenes that already have takes”: each scene shows its newest prompt and media list. Redos and pick-ups keep their own quote and go on the <Link href={`${base}/scenes`} className="text-ink">Scene pages</Link>.</>
                : 'The scenes come from the script; the prompts from the previz.'}
            </span>
          </div>
        ) : shown.map((s) => (
          <GoSceneCard key={s.id} scene={s} s={state} review={review} selected={selected === s.id} onSelect={() => setSelected(s.id)} base={base} />
        ))}
      </PageBody>

      {shown.length > 0 && (
        <div className="sticky bottom-0 z-10 mt-auto border-t border-edge bg-hdr/95 backdrop-blur" style={panel ? { bottom: Math.round(panel) } : undefined}>
          <div className="flex max-w-[1080px] flex-wrap items-center justify-between gap-x-5 gap-y-2.5 px-6 py-3 max-[760px]:px-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="text-[22px] font-semibold tracking-[-0.02em]">≈ {fmtCr(total)}</span>
                <span className="text-[12.5px] text-sub">{ready.length} {ready.length === 1 ? 'generation' : 'generations'} · {totalSeconds(ready)} s{review.rate ? ` at ${review.rate.crPerSec} cr/s` : ''}</span>
              </span>
              <span className="truncate text-[12px] text-sub">
                {balance ? <span title={`from ${balance.source}`}>Balance {fmtCr(balance.credits)}{balance.date ? ` (${fmtDate(balance.date)})` : ''}{after !== undefined ? ` · ≈ ${fmtCr(after)} after the go` : ''}</span> : null}
                {balance && left.length ? ' · ' : ''}
                {left.length ? <span className="text-warn">{left.map((x) => x.id).join(' ')} not in the go ({left[0].blockers[0]}{left.length > 1 ? ', …' : ''})</span> : null}
              </span>
            </div>
            <div className="flex flex-none flex-wrap gap-2 max-[760px]:w-full max-[760px]:flex-nowrap">
              <Btn onClick={change} className="h-9 max-[760px]:flex-1 max-[760px]:justify-center">Change{sel ? ` ${sel.id}` : ''}<span className="max-[760px]:hidden">{sel ? '' : ' something'}</span></Btn>
              <Btn primary disabled={!ready.length || held} title={held ? whole?.full : undefined} onClick={go} className="h-9 px-4 max-[760px]:flex-[2] max-[760px]:justify-center">
                Go for the video<span className="font-normal text-faint tabular-nums max-[760px]:hidden">· {ready.length} {ready.length === 1 ? 'generation' : 'generations'} · ≈ {fmtCr(total)}</span>
              </Btn>
            </div>
          </div>
          <Reveal open={held}><p className="m-0 pt-2 text-[12.5px] text-warn" title={whole?.full} data-go-held>{whole?.line}</p></Reveal>
        </div>
      )}
    </>
  );
}
