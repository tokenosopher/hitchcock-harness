'use client';
// Alma's word at the top of a step: what the person does here and why the step sits where it does (texts in
// intros.ts; a step may say something else on the phone, or nothing there). It reads as one of her messages: her "A"
// mark and plain words in the page subtitle's grey, as wide as the page's subtitle box (`width`), no box of its own.
// "Hide", and "More" where it folds, follow the last word as one unbreakable unit; when it does not fit there it drops
// to the next line by itself, at the text's left edge (a lone "Hide" without its dot). On the phone the text wraps the
// plain way and a long intro shows its lead sentence, then
// "More"; New film never folds; the desktop Edit intro is one line. A hidden intro leaves "A Show intro" in its place,
// the A the same size at the same spot; for a few seconds after a Hide it reads "I'll stay quiet here. · Undo" (on the
// desktop also "· Turn all off in Settings", smaller), at the settled row's height. Every change slides or fades.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Reveal } from '@/components/shell/Reveal';
import { useIsPhone } from '@/components/shell/useIsPhone';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { INTROS, type IntroKey } from './intros';
import { introActions, useIntroShows } from './useIntros';




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

/** Alma's mark, as the thread draws it beside her messages: 22 px on the desktop, 18 px on the phone, the same in
 *  every state of the intro, in a box one text line tall so the words beside it always start at the same x. `dim`
 *  quietens it by tone only. */
function Mark({ dim }: { dim?: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-[21px] flex-none items-center">
      <span className={cn('flex size-[22px] items-center justify-center rounded-full border text-[10.5px] font-semibold transition-colors duration-150 max-[760px]:size-[18px] max-[760px]:text-[9.5px]',
        dim ? 'border-line text-mute group-hover:border-edge group-hover:text-ink-3' : 'border-edge text-ink-3')}>A</span>
    </span>
  );
}

const LINE = 21; // the body's line height in px (13px at 1.6)
const PHONE_LINES = 2;
const FEW_WORDS = 6; // a fold that would hide no more than this many words shows everything
/** Hide, More and Less: quiet links after a "·", one step dimmer than her words (#7a7a82, zinc-500 lifted just enough
 *  to pass 4.5:1 on black: about 4.7:1). No padding and no minimum height of their own (a button is an inline block:
 *  either would make the line taller, and a page's touch-targets rule would set 44 px); an invisible layer around each
 *  gives the tap target instead. */
const link = '!min-h-0 relative cursor-pointer whitespace-nowrap rounded-[3px] px-0.5 py-0 text-[12.5px] leading-[inherit] text-[#7a7a82] underline decoration-transparent underline-offset-[3px] outline-none transition-colors duration-150 after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-[""] max-[760px]:after:-inset-x-[9px] max-[760px]:after:-inset-y-3 hover:text-ink hover:decoration-edge-strong focus-visible:text-ink focus-visible:decoration-edge-strong focus-visible:ring-2 focus-visible:ring-ring/60';
/** The hidden row's Undo: the same quiet control as Hide (same grey, same size), so no control in any state is louder
 *  than Alma's own words; white and underlined on hover and focus, like every control. */
const UNDO = link.replace('max-[760px]:after:-inset-y-3', 'max-[760px]:after:-inset-y-[13px]');
/** "Turn all off in Settings": after Undo, in the same quiet control grey and size, so the row is one calm line of one
 *  type size; like every control here it is underlined only on hover and focus. */
const SETTINGS = link.replace('max-[760px]:after:-inset-y-3', 'max-[760px]:after:-inset-y-[14px]');

/** The text cut after each sentence: ["A.", "A. B.", …]. A sentence ends at . ! ? (or after a closing quote or
 *  bracket) followed by a space; a link's label is never cut. */
function sentencePrefixes(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?][”’")\]]?(?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const before = text.slice(0, end);
    // inside a [label](url) link: not a sentence end
    if ((before.match(/\[/g)?.length ?? 0) !== (before.match(/\]/g)?.length ?? 0) || /\]\([^)]*$/.test(before)) continue;
    out.push(before);
  }
  out.push(text);
  return out;
}
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function StepIntro({ step, className, lines, width }: { step: IntroKey; className?: string;
  /** the right edge of the intro (mark and words) is the right edge of the page's subtitle box: 'full' where the
   *  subtitle runs the whole column; else the subtitle's max width, 600 px (also where a page has none) */
  width?: 'full' | number; /** on the desktop, fold the text to whole sentences within this many lines (1 for the Edit page's work
 *  surface); 0 never folds it, on any screen (the New film intro: the Higgsfield line and the link are always there). */ lines?: number }) {
  const shows = useIntroShows(step);
  const phone = useIsPhone();
  const intro = INTROS[step];
  const text = (phone && intro.phone) || intro.text;
  const id = `step-intro-${step}`;
  const back = useRef<HTMLButtonElement>(null);
  const hideBtn = useRef<HTMLButtonElement>(null);
  // known at the first draw: drawn as it is; known only after the server answers: it slides in
  const [ready, setReady] = useState(shows !== undefined);
  useEffect(() => { if (shows !== undefined && !ready) { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); } }, [shows, ready]);
  // for a few seconds after a Hide the row offers Undo (and, on the desktop, the way to Settings); then it settles
  const [after, setAfter] = useState<'hid' | undefined>();
  useEffect(() => { if (!after) return; const t = setTimeout(() => setAfter(undefined), 8000); return () => clearTimeout(t); }, [after]);
  // the fold. Phone: whole sentences, read off hidden twins of each sentence prefix. Desktop: the same, within `lines`.
  const never = lines === 0;
  const prefixes = useMemo(() => sentencePrefixes(text), [text]);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const twins = useRef<(HTMLParagraphElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  useLayoutEffect(() => {
    const els = twins.current.filter(Boolean) as HTMLParagraphElement[];
    if (!els.length) return;
    const measure = () => setHeights((h) => { const n = els.map((e) => e.offsetHeight); return n.join() === h.join() ? h : n; });
    measure();
    const ro = new ResizeObserver(measure);
    els.forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  }, [shows, ready, text, phone]);
  // does the controls unit sit on a line by itself? Read off an unseen twin of the shown words that always carries
  // the dot and the first control's padding, so dropping them on the real line can never move the unit back up
  // (no flicker, no loop). Measured after every render and whenever the column changes width.
  const ctlTwin = useRef<HTMLSpanElement>(null);
  const endTwin = useRef<HTMLSpanElement>(null);
  const [ownLine, setOwnLine] = useState(false);
  const measureOwn = useCallback(() => {
    const c = ctlTwin.current, e = endTwin.current;
    if (!c || !e) return;
    const v = c.getBoundingClientRect().top > e.getBoundingClientRect().top + 4;
    setOwnLine((o) => (o === v ? o : v));
  }, []);
  useLayoutEffect(() => { measureOwn(); });
  useLayoutEffect(() => {
    const el = ctlTwin.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(measureOwn);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shows, ready, measureOwn]);
  // nothing on the phone where the page says it itself (the Edit page's view-only note)
  if (shows === undefined || (phone && intro.phone === '')) return null;
  const full = heights[prefixes.length - 1] ?? 0;
  let shortText: string | undefined; // the folded words: whole sentences from the start
  let cap: number | undefined; // the folded height
  const most = phone ? PHONE_LINES : lines; // the lines a folded intro may fill, its links included
  if (!never && full && most) {
    let k = 0;
    // phone: the lead sentence, and the second with it only when both fit in two lines; desktop: whole sentences
    // within `lines`
    if (phone) k = 0; // the phone shows exactly the lead sentence
    else for (let i = 0; i < prefixes.length - 1; i++) if ((heights[i] ?? Infinity) <= most * LINE + 2) k = i;
    const hidden = words(text) - words(prefixes[k]);
    // fold only when it saves at least two lines
    if (full - (heights[k] ?? full) >= 2 * LINE - 2 && hidden > FEW_WORDS) { shortText = prefixes[k]; cap = heights[k]; }
  }
  const folds = cap !== undefined;
  const shut = folds && !open;
  const shown = shut && !closing && shortText !== undefined ? shortText : text;
  // a page that sets its own top room (Edit, a scene, a platform) keeps it; elsewhere the intro takes a little more
  // room under the page's title and subtitle, so the two read as two voices: the page, then Alma
  const tucked = !/(^|\s)(pt|py|mt|my)-/.test(className ?? '');
  const focusSoon = (r: React.RefObject<HTMLButtonElement | null>) => requestAnimationFrame(() => r.current?.focus({ preventScroll: true }));
  // one separator everywhere, the same room on both sides; wider on the phone, so neighbouring tap areas never overlap
  const dot = <span aria-hidden="true" className="mx-1.5 text-[12px] text-faint max-[760px]:mx-2">·</span>;
  // before the controls: "· Hide" alone; with "More" a plain gap, so two dots never stand in a row
  // the room before the controls is a widened space, not a box: when the controls drop to the next line the space
  // goes with the line break and they start at the text's left edge. With "More" a plain gap; with "Hide" alone a "·".
  const gap = <span className={folds ? '[word-spacing:8px] max-[760px]:[word-spacing:3px]' : '[word-spacing:2px] max-[760px]:[word-spacing:3px]'}>{' '}</span>;
  const leadDot = <span aria-hidden="true" className="mr-1.5 text-[12px] text-faint max-[760px]:mr-2">·</span>;
  // on a line by itself (decided by the twin, with the dot): a hard break puts it there, so the narrower unit cannot
  // slip back up; no leading dot ("Hide", not "· Hide"), and the first control's own padding pulled back so its word
  // starts at the text's left edge (its tap area stays as it is)
  const own = ownLine;
  const lead = folds || own ? null : leadDot;
  const toggle = () => { if (open) { setClosing(!!shortText); setOpen(false); } else { setClosing(false); setOpen(true); } };
  const showLabel = `Show Alma’s intro to ${intro.name}`;
  const controls = (
    <span className={cn('whitespace-nowrap', own && '-ml-0.5')}>
          {lead}
          {folds && (
            <>
              <button type="button" className={link} aria-expanded={open} aria-controls={id} onClick={toggle}>{open ? 'Less' : 'More'}</button>
              {dot}
            </>
          )}
          <button ref={hideBtn} type="button" className={link} aria-controls={id} title="Hide Alma’s word on this step; Show intro, left in its place, brings it back"
            onClick={() => { void introActions.hide(step); setAfter('hid'); focusSoon(back); }}>
            Hide
          </button>
        </span>
  );
  // the Edit page's one-line intro keeps the editor's full row
  const box = width === 'full' || lines === 1 ? 'max-w-none' : undefined;
  const boxStyle = width === 'full' || lines === 1 ? undefined : { maxWidth: typeof width === 'number' ? width : 600 };
  return (
    <div data-step-intro={step} className={cn('flex flex-col', tucked && 'mt-2 max-[760px]:mt-0.5 [&+*]:!mt-0', className, lines === 1 && 'min-[761px]:pb-1 min-[761px]:pt-4')}>
      <Reveal open={ready && shows}>
        <section id={id} aria-label={`Alma on ${intro.name}`} style={boxStyle} className={cn('flex gap-2.5 max-[760px]:max-w-none max-[760px]:gap-2', box)}>
          <Mark />
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* the shown words with the controls as they would be after the last word (dot and padding kept): only
                measured, to tell whether the controls sit on a line by themselves */}
            <p aria-hidden="true" className="invisible pointer-events-none absolute inset-x-0 top-0 m-0 text-[13px] leading-[1.6] [text-wrap:pretty] max-[760px]:[text-wrap:wrap]">
              <Words text={shown} /><span ref={endTwin} />{gap}<span ref={ctlTwin} className="whitespace-nowrap">{folds ? <><span className={link}>{open ? 'Less' : 'More'}</span>{dot}</> : leadDot}<span className={link}>Hide</span></span>
            </p>
            {/* unfolded twins, one per sentence prefix, each with the links' room: never seen, only measured */}
            {prefixes.map((t, i) => (
              <p key={i} ref={(el) => { twins.current[i] = el; }} aria-hidden="true"
                className="invisible pointer-events-none absolute inset-x-0 top-0 m-0 text-[13px] leading-[1.6] [text-wrap:pretty] max-[760px]:[text-wrap:wrap]">
                <Words text={t} /><span className="[word-spacing:8px] max-[760px]:[word-spacing:3px]">{' '}</span><span className="whitespace-nowrap text-[12.5px]"><span className="px-0.5">More</span><span className="mx-1.5 text-[12px] max-[760px]:mx-2">·</span><span className="px-0.5">Hide</span></span>
              </p>
            ))}
            <p className="m-0 min-w-0 overflow-hidden text-[13px] leading-[1.6] text-sub transition-[max-height] duration-200 ease-out [text-wrap:pretty] motion-reduce:transition-none max-[760px]:[text-wrap:wrap]"
              style={folds ? { maxHeight: open ? full || undefined : cap } : undefined}
              onTransitionEnd={(e) => { if (e.propertyName === 'max-height' && closing) setClosing(false); }}>
              {/* the controls are one unit: they follow the last word when they fit, else drop to the next line together;
                  on the phone the text wraps the plain way and fills the column */}
              <Words text={shown} />{own ? <br /> : gap}{controls}
            </p>
          </div>
        </section>
      </Reveal>
      <Reveal open={ready && !shows}>
        {/* the same mark at the same place as the intro's, the words at the same x. For a few seconds after a Hide, Alma
            says she'll keep quiet, with Undo; the Settings link is second (smaller, dimmer; its own line on the phone,
            which slides away when the row settles). Settled: "A Show intro", quieter by tone only. The links' invisible
            layer keeps the phone's 44 px tap target. */}
        {after === 'hid' ? (
          <div className="flex gap-2.5 max-[760px]:gap-2">
            <Mark />
            <div className="h-[21px] min-w-0 whitespace-nowrap text-[13px] leading-[21px] text-sub">{/* one line of text, so the smaller controls sit on her sentence's baseline */}
              I’ll stay quiet here.{dot}
              <button ref={back} type="button" data-step-intro-show onClick={() => { setAfter(undefined); void introActions.show(step); focusSoon(hideBtn); }}
                title={showLabel} className={UNDO}>
                Undo
              </button>
              <span className="contents max-[760px]:hidden">
                {dot}
                <Link href="/settings#step-intros" title="The Step intros switch in Settings turns every intro off, and on again" className={SETTINGS}>
                  Turn all off in Settings
                </Link>
              </span>
            </div>
          </div>
        ) : (
          <button ref={back} type="button" data-step-intro-show aria-label={showLabel} title={showLabel}
            onClick={() => { setAfter(undefined); void introActions.show(step); focusSoon(hideBtn); }}
            className="group relative flex !min-h-0 cursor-pointer items-center gap-2.5 self-start rounded-full pr-1 text-[12.5px] text-[#7a7a82] outline-none transition-colors duration-150 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-ring/60 max-[760px]:gap-2 max-[760px]:after:-inset-y-[12px]">
            <Mark dim /><span className="leading-[21px]">Show intro</span>
          </button>
        )}
      </Reveal>
    </div>
  );
}
