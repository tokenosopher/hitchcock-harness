'use client';
// What's next (14 Nov 2026, ASKS 47; first named "What is left", renamed and made the second tab on the user's word
// of 14 Nov: "'What's next' only relates to everything"). The user, pointing at the tabs under the timeline: "I was
// thinking of also having the What's Left view … so that I don't have to move the pages". The second tab under the
// timeline, after Takes: the seven steps of left.ts in the user's order, one row each, and a quiet "5 steps left". The
// current step (the first not done) has the tab's one filled button; every row is pressable. Steps 2, 5 and 6 switch
// the tab, 3 and 4 act on the timeline above, only 7 leaves the page.
//
// The data the page does not have already (the ticks, the record's yes for a cut, the newest master of any version, the
// release file in brief) comes from GET /api/films/<film>/left: once, and again when the film's watcher reports a change.
// It is set only when it changed, so an edit, an undo or ten idle seconds draw the page no more than before.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline, TimelineClip } from '@/server/types';
import { cn } from '@/lib/utils';
import { IconCheck, IconChevronRight } from '@/components/shell/icons';
import { NEXT_TAB, STEP_SHORT, subsCounts, whatIsLeft, type LeftAnswer, type LeftDo, type LeftInput, type LeftStep, type TickOp } from './left';
import { EARLY_IDS, type EarlyId } from './early';
import { parseSrt } from './subs';
import { fetchSrt } from './Subtitles';
import { useWaitingNow, WaitingNow } from '@/components/flow/WaitingNow';
import { waitsByStep, waitsLine, type WaitItem } from '@/components/flow/waitList';

/** The route's answer, read once and on each change of the film's folder (`changed`, the state's time); a tick shows at
 *  once and is saved, and goes back with a line saying why when the save fails. `also`: a version whose render part
 *  the page wants besides the newest master's and the final's (the record's master, ASKS 49). */
export function useLeft(film: string, changed?: string, also?: string) {
  const [data, setData] = useState<LeftAnswer>();
  const [error, setError] = useState<string>();
  const last = useRef('');
  const busy = useRef(0);
  const put = useCallback((j: LeftAnswer) => {
    const s = JSON.stringify(j);
    if (s === last.current) return;
    last.current = s;
    setData(j);
  }, []);
  useEffect(() => {
    let live = true;
    void fetch(`/api/films/${film}/left${also ? `?v=${encodeURIComponent(also)}` : ''}`, { cache: 'no-store' }).then(async (r) => {
      if (!r.ok || !live || busy.current) return;
      put((await r.json()) as LeftAnswer);
    }, () => undefined);
    return () => { live = false; };
  }, [film, changed, also, put]);
  const tick = useCallback(async (op: TickOp) => {
    const was = data;
    if (was) {
      const ticks = { ...was.ticks };
      if ('tick' in op) ticks[op.tick] = { at: new Date().toISOString(), cut: op.cut }; else delete ticks[op.untick];
      put({ ...was, ticks });
    }
    setError(undefined);
    busy.current++;
    try {
      const r = await fetch(`/api/films/${film}/left`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
      const j = (await r.json().catch(() => ({}))) as { ticks?: LeftAnswer['ticks']; error?: string };
      if (!r.ok || !j.ticks) throw new Error(j.error ?? `the server answered ${r.status}`);
      const ticks = j.ticks;
      setData((d) => { const n = d ? { ...d, ticks } : d; if (n) last.current = JSON.stringify(n); return n; });
    } catch (e) {
      if (was) put(was);
      setError(`The tick was not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy.current--;
    }
  }, [film, data, put]);
  return useMemo(() => ({ data, error, tick }), [data, error, tick]);
}

/** The cues of the .srt clips on the subtitles tracks, counted inside each clip's in and out (read once each). */
function useSrtCues(film: string, tl: Timeline): (c: TimelineClip) => number | undefined {
  const srts = useMemo(() => tl.tracks.filter((t) => t.kind === 'captions').flatMap((t) => t.clips.filter((c) => !!c.src && /\.srt$/i.test(c.src))), [tl]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const want = srts.map((c) => c.src!).filter((s) => texts[s] === undefined).join('\n');
  useEffect(() => {
    if (!want) return;
    let live = true;
    for (const src of want.split('\n')) void fetchSrt(film, src).then((t) => { if (live) setTexts((x) => ({ ...x, [src]: t })); }, () => { if (live) setTexts((x) => ({ ...x, [src]: '' })); });
    return () => { live = false; };
  }, [film, want]);
  return useCallback((c: TimelineClip) => {
    const t = c.src ? texts[c.src] : undefined;
    if (t === undefined) return undefined;
    return parseSrt(t).filter((q) => q.b > c.in && q.a < c.out).length;
  }, [texts]);
}

const STATE = {
  done: { word: 'done', cls: 'text-ok' },
  current: { word: 'yours to look at', cls: 'text-warn' },
  later: { word: 'not yet', cls: 'text-mute' },
} as const;

function Glyph({ s }: { s: keyof typeof STATE }) {
  if (s === 'done') return <IconCheck size={13} className="flex-none text-ok" />;
  if (s === 'current') return <span aria-hidden="true" className="flex size-[13px] flex-none items-center justify-center"><span className="size-[7px] rounded-full bg-warn" /></span>;
  return <span aria-hidden="true" className="flex size-[13px] flex-none items-center justify-center"><span className="size-[8px] rounded-full border border-mute" /></span>;
}

export function LeftTab({ film, tl, input, onDo, onUntick, error, here, from }: {
  film: string;
  /** The cut on screen (for the cues of an .srt clip). */
  tl: Timeline;
  input: LeftInput;
  onDo: (d: LeftDo) => void;
  onUntick: (s: LeftStep) => void;
  error?: string;
  /** The page the list is on, after the film's address ("/edit"), and its name said to Alma with an answer given here. */
  here?: string;
  from: string;
}) {
  const cues = useSrtCues(film, tl);
  const view = useMemo(() => whatIsLeft({ ...input, subs: subsCounts(tl, cues) }), [input, tl, cues]);
  // what waits for the user, first: the list of "Waiting for you", and on each step what of it holds it up
  const w = useWaitingNow();
  const [openWait, setOpenWait] = useState<string>();
  const waits = useMemo(() => (w ? waitsByStep(w.items, view.steps) : new Map<string, WaitItem[]>()), [w, view.steps]);
  // the early steps from the script on (15 Nov): the ones done before the step to look at fold into one row (two or
  // more), so the step to do is near the top, and a film with its takes in reads as it did, its seven under one line
  const [unfold, setUnfold] = useState(false);
  const isEarly = (id: string) => EARLY_IDS.includes(id as EarlyId);
  const lead = view.early ? view.steps.findIndex((s) => !isEarly(s.id) || !s.done) : 0;
  const foldable = lead >= 2;
  const folded = foldable && !unfold;
  const shown = folded ? view.steps.slice(lead) : view.steps;
  const earlyNames = view.steps.slice(0, Math.max(0, lead)).map((s) => STEP_SHORT[s.id]).join(', ');
  return (
    <section aria-label={NEXT_TAB} data-left-tab className="flex min-w-0 flex-col gap-3">
      {w && <WaitingNow w={w} here={here} from={from} open={openWait} onOpen={setOpenWait} />}
      <span className="text-[12.5px] leading-normal text-sub">
        {view.early && !view.early.done ? 'Every step from the script to the film going out.' : `The steps before cut ${input.cut} goes out.`} The first step not done is yours to look at.
        {view.count && <span key={view.count} data-left-count className="ml-1.5 text-mute duration-200 animate-in fade-in-0">{view.count}</span>}
      </span>
      {error && <span role="status" className="text-[12px] text-warn duration-200 animate-in fade-in-0">{error}</span>}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="The steps">
        {foldable && (
          <li data-left-fold className="rounded-[10px] border border-line">
            <button type="button" onClick={() => setUnfold((x) => !x)} aria-expanded={!folded}
              className="group/row flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-raised/60 focus-visible:bg-raised/60">
              <span className="w-4 flex-none" />
              <span className="flex w-[124px] flex-none items-center gap-1.5 text-[12px] text-ok"><IconCheck size={13} className="flex-none text-ok" />done</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium text-ink">{lead} earlier steps</span>
                <span className="truncate text-[12px] text-sub" title={earlyNames.charAt(0).toUpperCase() + earlyNames.slice(1)}>{earlyNames.charAt(0).toUpperCase() + earlyNames.slice(1)}</span>
              </span>
              <span className="flex-none text-[12px] text-sub transition-colors duration-150 group-hover/row:text-ink">{folded ? 'Show them' : 'Fold them'}</span>
            </button>
          </li>
        )}
        {shown.map((s) => (
          <Row key={s.id} s={s} onDo={onDo} onUntick={onUntick} waits={waits.get(s.id)} onWait={setOpenWait}
            cls={foldable && view.steps.indexOf(s) < lead ? 'duration-200 animate-in fade-in-0 slide-in-from-top-1' : undefined} />
        ))}
      </ol>
      <p key={view.footer} data-left-footer className="m-0 text-[12.5px] text-sub duration-200 animate-in fade-in-0">{view.footer}</p>
    </section>
  );
}

function Row({ s, onDo, onUntick, cls, waits, onWait }: {
  s: LeftStep; onDo: (d: LeftDo) => void; onUntick: (s: LeftStep) => void; cls?: string;
  /** What waits for the user and holds this step up; a press opens the first of it in the list above. */
  waits?: WaitItem[]; onWait: (key: string) => void;
}) {
  const st: keyof typeof STATE = s.done ? 'done' : s.current ? 'current' : 'later';
  const press = () => onDo(s.row);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <li data-step={s.id} data-step-state={st}
      className={cn('rounded-[10px] border transition-[border-color,background-color] duration-200', s.current ? 'border-warn/40 bg-warn/[0.04]' : 'border-line', cls)}>
      <div role="button" tabIndex={0} onClick={press} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } }}
        data-step-row className="group/row flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] max-[760px]:flex-wrap px-2.5 py-1.5 outline-none transition-colors duration-150 hover:bg-raised/60 focus-visible:bg-raised/60">
        <span className="w-4 flex-none text-right font-mono text-[11.5px] text-mute">{s.n}</span>
        <span key={st} data-step-word className={cn('flex w-[124px] flex-none items-center gap-1.5 text-[12px] duration-200 animate-in fade-in-0', STATE[st].cls)}>
          <Glyph s={st} />{STATE[st].word}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span title={s.name} className={cn('truncate text-[13px] font-medium max-[760px]:whitespace-normal', s.done || s.current ? 'text-ink' : 'text-ink-3')}>
            {s.name}
            {/* the version names behind the words, quietly, for the person who wants them (ASKS 49) */}
            {s.versions && <span key={s.versions} data-step-versions className="ml-2 font-mono text-[11px] font-normal text-mute duration-200 animate-in fade-in-0">{s.versions}</span>}
          </span>
          <span key={s.facts} data-step-facts className="line-clamp-2 text-[12px] leading-snug text-sub duration-200 animate-in fade-in-0" title={s.versions ? `${s.facts} (${s.versions})` : s.facts}>{s.facts}</span>
          {waits && (
            <button type="button" key={waitsLine(waits)} data-step-waits onClick={(e) => { stop(e); onWait(waits[0].key); }} onKeyDown={stop} title={waits.map((x) => x.title).join('\n')}
              className="line-clamp-2 cursor-pointer border-0 bg-transparent p-0 text-left text-[12px] leading-snug text-warn underline decoration-warn/40 underline-offset-4 transition-colors duration-150 hover:decoration-warn duration-200 animate-in fade-in-0">{waitsLine(waits)}</button>
          )}
          {s.note && <span key={s.note} data-step-note className="truncate text-[12px] text-warn duration-200 animate-in fade-in-0">{s.note}</span>}
          {/* the button cannot start what it starts yet: no button, and quietly what is missing in its place */}
          {s.wait && <span key={s.wait} data-step-wait title={s.waitFull ?? s.wait} className="line-clamp-2 text-[12px] leading-snug text-mute duration-200 animate-in fade-in-0 slide-in-from-top-1">{s.wait}</span>}
        </span>
        {s.ticked && (
          <button type="button" data-step-untick onClick={(e) => { stop(e); onUntick(s); }} onKeyDown={stop} title="Take the tick back"
            className="flex-none cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-sub underline decoration-edge-strong underline-offset-4 transition-colors duration-150 hover:text-ink">Take back</button>
        )}
        {s.also && (
          <button type="button" data-step-also onClick={(e) => { stop(e); onDo(s.also!.do); }} onKeyDown={stop}
            className="flex-none cursor-pointer whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] text-sub underline decoration-edge-strong underline-offset-4 transition-colors duration-150 hover:text-ink duration-200 animate-in fade-in-0">{s.also.label}</button>
        )}
        {s.action ? (
          <button type="button" data-step-action onClick={(e) => { stop(e); onDo(s.action!.do); }} onKeyDown={stop}
            className="inline-flex h-8 flex-none cursor-pointer items-center whitespace-nowrap rounded-lg bg-ink px-3 text-[12.5px] font-medium text-bg max-[760px]:h-11 max-[760px]:basis-full max-[760px]:justify-center transition-colors duration-150 hover:bg-ink-3 duration-200 animate-in fade-in-0">{s.action.label}</button>
        ) : (
          <IconChevronRight size={14} className="flex-none text-mute transition-colors duration-150 group-hover/row:text-ink" />
        )}
      </div>
    </li>
  );
}
