'use client';
// Alma's word at the top of a step: what the person does here and why the step sits where it does (texts in
// intros.ts). It reads as one of her messages in the thread: her "A" mark, her name, plain words, no box. Under the
// words two quiet controls: "Hide" (this step) and "Hide all intros". A hidden intro leaves a small "Alma on <step>"
// mark in its place that brings it back; right after "Hide all intros" that mark offers an undo for a few seconds. Settings
// has the switch for all of them. A long text folds to a few lines on the phone (`lines` folds it on any screen, for
// a page whose work surface sits right under it), with "More" to open it. Every change slides and fades.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/shell/Reveal';
import { IconChevronDown } from '@/components/shell/icons';
import { useIsPhone } from '@/components/shell/useIsPhone';
import { cn } from '@/lib/utils';
import { INTROS, type IntroKey } from './intros';
import { introActions, useIntroPrefs, useIntroShows } from './useIntros';

/** "[label](https://…)" in a text becomes a link that opens in a new tab. */
function Words({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
        return m ? (
          <a key={i} href={m[2]} target="_blank" rel="noopener" className="text-ink underline decoration-edge-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-ink">{m[1]}</a>
        ) : p;
      })}
    </>
  );
}

/** Alma's mark, as the thread draws it beside her messages. */
function Mark({ small }: { small?: boolean }) {
  return (
    <span aria-hidden="true" className={cn('flex flex-none items-center justify-center rounded-full border border-edge font-semibold text-ink-3', small ? 'size-[18px] text-[9.5px]' : 'size-[22px] text-[10.5px]')}>A</span>
  );
}

const LINE = 21; // the body's line height in px (13px at 1.6)
const quiet = 'inline-flex h-7 cursor-pointer items-center rounded-md px-1.5 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:text-ink max-[760px]:h-10 max-[760px]:px-2.5';

export function StepIntro({ step, className, lines }: { step: IntroKey; className?: string; /** fold the text to this many lines on every screen; 0 never folds it (the New film page: the Higgsfield line must be read) */ lines?: number }) {
  const shows = useIntroShows(step);
  const prefs = useIntroPrefs();
  const phone = useIsPhone();
  const intro = INTROS[step];
  const id = `step-intro-${step}`;
  const back = useRef<HTMLButtonElement>(null);
  const hideBtn = useRef<HTMLButtonElement>(null);
  // known at the first draw: drawn as it is; known only after the server answers: it slides in
  const [ready, setReady] = useState(shows !== undefined);
  useEffect(() => { if (shows !== undefined && !ready) { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); } }, [shows, ready]);
  // right after "Hide all intros": the mark offers the undo for a few seconds
  const [undoAll, setUndoAll] = useState(false);
  useEffect(() => { if (!undoAll) return; const t = setTimeout(() => setUndoAll(false), 8000); return () => clearTimeout(t); }, [undoAll]);
  // the fold: how many lines show while it is closed, and whether the text is longer than that
  const fold = lines === 0 ? undefined : lines ?? (phone ? 3 : undefined);
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);
  const [full, setFull] = useState(0);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setFull(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shows, ready, fold]);
  if (shows === undefined) return null;
  const cap = fold ? fold * LINE : undefined;
  const folds = !!cap && full > cap + 2;
  const off = !!prefs?.off;
  // one line, the controls beside it (the Edit page, whose work surface sits right under it)
  const inline = fold === 1;
  // the text and its controls on one row; on the phone only while folded (open, the text takes the width)
  const row = inline && !(phone && open);
  const focusSoon = (r: React.RefObject<HTMLButtonElement | null>) => requestAnimationFrame(() => r.current?.focus({ preventScroll: true }));
  const dot = <span aria-hidden="true" className="text-[12px] text-faint">·</span>;
  const controls = (
    <div className={cn('-ml-1.5 flex flex-wrap items-center gap-x-0.5 max-[760px]:-ml-2.5', row && 'ml-0 flex-none flex-nowrap')}>
      {folds && (
        <>
          <button type="button" className={quiet} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            {open ? 'Less' : 'More'}
            <IconChevronDown size={12} className={cn('ml-0.5 transition-transform duration-200', open && 'rotate-180')} />
          </button>
          {!(inline && phone && !open) && dot}
        </>
      )}
      {!(inline && phone && folds && !open) && (<>
      <button ref={hideBtn} type="button" className={quiet} aria-controls={id} title="Hide Alma’s word on this step; the small A left in its place brings it back"
        onClick={() => { void introActions.hide(step); focusSoon(back); }}>
        Hide
      </button>
      <span aria-hidden="true" className="ml-1.5 text-[12px] text-faint">·</span>
      <button type="button" className={cn(quiet, 'ml-1.5')} title="Hide Alma’s word on every step; Settings brings them all back"
        onClick={() => { void introActions.setAll(false); setUndoAll(true); focusSoon(back); }}>
        Hide all intros
      </button>
      </>)}
    </div>
  );
  return (
    <div data-step-intro={step} className={cn('flex flex-col', className)}>
      <Reveal open={ready && shows}>
        <section id={id} aria-label={`Alma on ${intro.name}`} className={cn('flex max-w-[620px] gap-2.5 max-[760px]:gap-2', inline && 'max-w-[1040px] items-start')}>
          <span className="pt-px max-[760px]:hidden"><Mark /></span>
          <span className={cn('flex h-[21px] flex-none items-center min-[761px]:hidden', row && 'mt-[9px]')}><Mark small /></span>
          <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5 max-[760px]:-mb-1.5', row && 'flex-row items-start gap-4 max-[760px]:items-center max-[760px]:gap-1')}>
            <p ref={body} className={cn('m-0 min-w-0 flex-1 overflow-hidden text-[13px] leading-[1.6] text-ink-3 transition-[max-height] duration-200 ease-out [text-wrap:pretty] motion-reduce:transition-none',
              row && 'pt-[3px] max-[760px]:pt-0',
              folds && !open && (fold === 1 ? '[mask-image:linear-gradient(to_right,black_80%,transparent)]' : '[mask-image:linear-gradient(to_bottom,black_calc(100%-21px),transparent)]'))}
              style={folds || cap ? { maxHeight: open || !folds ? full || undefined : cap } : undefined}>
              <Words text={intro.text} />
            </p>
            {controls}
          </div>
        </section>
      </Reveal>
      <Reveal open={ready && !shows}>
        <div className="-my-2 flex flex-wrap items-center gap-x-1 max-[760px]:-my-1.5">
          <button ref={back} type="button" data-step-intro-show onClick={() => { setUndoAll(false); void introActions.show(step); focusSoon(hideBtn); }}
            title={`Show Alma’s word on ${intro.name} again`}
            className="-ml-1 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full py-0 pl-1 pr-2.5 text-[12px] text-mute transition-colors duration-150 hover:bg-raised hover:text-ink max-[760px]:h-10">
            <Mark small />{undoAll && off ? 'All intros off' : `Alma on ${intro.name}`}
          </button>
          {undoAll && off && (
            <>
              {dot}
              <button type="button" title="Bring every intro back; the Step intros switch in Settings does the same"
                onClick={() => { setUndoAll(false); void introActions.setAll(true); focusSoon(hideBtn); }}
                className={cn(quiet, 'text-sub duration-200 animate-in fade-in-0')}>
                Undo
              </button>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
