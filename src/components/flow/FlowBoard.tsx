'use client';
// The flow at the top of the film's page, as drawn in the timeline design (FlowWaiting and the step boards, ASKS 46
// and 47): "The flow" with the Story chip and the key, then three labelled rows: the places (Locations, Views, Shots,
// Previz), the people (Faces, Clothing, Sheet, Voices, Video elements), then the gate, Edit and Release. After the gate
// there is only Edit and Release ("once we've done the takes … there should be basically just the end, which is the
// edit section"); the pages Scenes, Finish and Sound open from Edit's list and by their addresses. Every box is a button
// that shows its step under the board and puts its chip in "Alma sees". A box with a live sub-agent shimmers and
// names the agent in its line. On the phone the flow folds behind a one-line summary and the rows stack; a press on a
// step folds it again (sliding up) as the step opens, so it never has to be closed by hand.
import { useEffect, useState } from 'react';
import { PEOPLE, PLACES, type Flow, type FlowNode, type NodeState } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import { picksWaiting } from '@/components/lib/derive';
import { IconCheck } from '@/components/shell/icons';
import { cn } from '@/lib/utils';

/** The four marks of the drawn key: done, yours to look at, being made, not yet. */
export type Glyph = 'done' | 'now' | 'run' | 'todo';
export const glyphOf = (st: NodeState): Glyph => (st === 'done' || st === 'locked' ? 'done' : st === 'pick' ? 'now' : st === 'running' ? 'run' : 'todo');

export function StepGlyph({ g, className }: { g: Glyph; className?: string }) {
  if (g === 'done') return <IconCheck size={11} aria-hidden="true" className={cn('flex-none text-ok', className)} />;
  if (g === 'now') return <span aria-hidden="true" className={cn('flex size-[11px] flex-none items-center justify-center', className)}><span className="size-[7px] rounded-full bg-warn" /></span>;
  if (g === 'run') return <span aria-hidden="true" className={cn('box-border size-[10px] flex-none animate-spin rounded-full border-[1.5px] border-edge-strong border-t-ink-3 [animation-duration:1.4s] motion-reduce:animate-none', className)} />;
  return <span aria-hidden="true" className={cn('flex size-[11px] flex-none items-center justify-center', className)}><span className="box-border size-[9px] rounded-full border border-dashed border-mute" /></span>;
}

const KEY: [Glyph, string][] = [['done', 'done'], ['now', 'yours to look at'], ['run', 'being made'], ['todo', 'not yet']];

/** A box's second line: its words; while sub-agents run it takes turns with their names. */
function lineOf(n: FlowNode, short: string, tick: number): string {
  const live = n.aims.filter((a) => a.task.state === 'running');
  if (!live.length) return short;
  const lines = [short, ...live.map((a) => `Alma › ${a.target || a.job}`)];
  return lines[tick % lines.length];
}

function aria(n: FlowNode, name: string, line: string) {
  const live = n.aims.filter((a) => a.task.state === 'running').map((a) => a.task.title);
  return `${n.num ? `Stage ${n.num} ` : ''}${name}, ${line || n.status || 'not started'}${live.length ? `; running: ${live.join(', ')}` : ''}`;
}

/** What the board needs besides the flow: the people boxes' words from the Characters cards, and Edit's two lines. */
export interface BoardLines {
  /** A box's line in place of the node's own short words ("5 picked, 1 group"). */
  box?: Partial<Record<FlowKey, string>>;
  /** Edit: "7 of 7 scenes have takes" and its mark. */
  edit?: { line: string; g: Glyph };
  /** Edit's second line: "Next: check the 1080p shots" (What's next's current step), or, while pick-ups are being
   *  made, where each stands ("S1 at boards · S3, S4 at prompts"). */
  next?: string;
  /** That line's mark: yours to look at (the default), or being made. */
  nextG?: Glyph;
  /** Release's line and mark: "0 of 6 posted", dashed until it is reachable. */
  release?: { line: string; g: Glyph };
}

interface BoxProps { n: FlowNode; on: boolean; tick: number; onOpen: (k: FlowKey) => void; name?: string; short?: string; g?: Glyph; gate?: boolean; second?: string; secondG?: Glyph; className?: string }

function Box({ n, on, tick, onOpen, name = n.name, short = n.short, g = glyphOf(n.state), gate, second, secondG = 'now', className }: BoxProps) {
  const line = lineOf(n, short, tick);
  const todo = g === 'todo';
  const liveNow = n.aims.some((a) => a.task.state === 'running');
  return (
    <button type="button" onClick={() => onOpen(n.key)} aria-pressed={on} aria-label={gate ? `Gate, your picks, ${line}` : aria(n, name, second ? `${line}; ${second}` : line)} data-box={n.key}
      title={n.aims.length ? n.aims.map((a) => a.task.title).join('\n') : n.status || undefined}
      className={cn('box-border flex min-h-[42px] min-w-0 cursor-pointer flex-col justify-center gap-px rounded-lg border px-[9px] pb-1.5 pt-[5px] text-left transition-[background-color,border-color,box-shadow] duration-200 max-[760px]:min-h-11',
        on ? 'border-ink bg-[#141416] shadow-[inset_0_0_0_1px_#FAFAFA]' : todo ? 'border-dashed border-edge-strong bg-transparent hover:bg-panel' : 'border-edge bg-panel hover:bg-raised',
        liveNow && 'node-live', className)}>
      <span className={cn("truncate text-[12.5px] font-medium @max-[640px]/flow:whitespace-normal", todo && !on ? 'text-sub' : 'text-ink')}>
        {gate && <span className="font-normal text-mute @max-[640px]/flow:hidden">Gate · </span>}{name}
      </span>
      <span key={line} className={cn('flex min-w-0 items-center gap-[5px] text-[11px]', line.startsWith('Alma ›') ? 'line-in text-ink-3' : cn('duration-200 animate-in fade-in-0 motion-reduce:animate-none', g === 'now' ? 'text-warn' : second ? 'text-ink-3' : 'text-sub'))}>
        <StepGlyph g={g} /><span className="truncate @max-[640px]/flow:whitespace-normal @max-[640px]/flow:[overflow-wrap:anywhere]">{line}</span>
      </span>
      {second && (
        <span key={second} data-box-second className={cn('flex min-w-0 items-center gap-[5px] text-[11px] duration-200 animate-in fade-in-0 motion-reduce:animate-none', secondG === 'now' ? 'text-warn' : 'text-ink-3')}>
          <StepGlyph g={secondG} /><span className="truncate @max-[640px]/flow:whitespace-normal">{second}</span>
        </span>
      )}
    </button>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="self-center text-[11px] uppercase tracking-[0.08em] text-mute max-[760px]:col-span-2 max-[760px]:self-start max-[760px]:pt-1">{children}</span>;
}

export function FlowBoard({ flow, open, onOpen: openStep, lines = {} }: { flow: Flow; open: FlowKey; onOpen: (k: FlowKey) => void; lines?: BoardLines }) {
  const N = flow.nodes;
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // on the phone a press folds the flow and opens the step in the same tap (on the desktop the board stays as it is)
  const onOpen = (k: FlowKey) => { setExpanded(false); openStep(k); };
  const live = Object.values(N).some((n) => n.aims.some((a) => a.task.state === 'running'));
  useEffect(() => {
    if (!live) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setTick((x) => x + 1), 2600);
    return () => clearInterval(t);
  }, [live]);
  const count = flow.waiting;
  const story = N.story;
  const before = [...PLACES, ...PEOPLE].map((k) => N[k]);
  const allBefore = before.every((n) => n.state === 'done' || n.state === 'locked');
  // the gate: the picks waiting, else done once every step before it is done
  const gateG: Glyph = count ? 'now' : allBefore || flow.done ? 'done' : 'todo';
  const gateLine = count ? `${count} waiting` : gateG === 'done' ? 'all made' : 'not yet';
  const edit = lines.edit ?? { line: N.edit.short || 'not yet', g: glyphOf(N.edit.state) };
  const release = lines.release ?? { line: N.release.short || 'not yet', g: N.release.state === 'done' ? 'done' as const : 'todo' as const };
  // Scenes, Finish and Sound are inside Edit now: their live sub-agents make the Edit box shimmer
  const editNode: FlowNode = { ...N.edit, aims: [...N.edit.aims, ...N.scenes.aims, ...N.finish.aims, ...N.sound.aims] };
  const box = (k: FlowKey) => <Box key={k} n={N[k]} on={open === k} tick={tick} onOpen={onOpen} short={lines.box?.[k] ?? N[k].short} />;

  return (
    <section aria-label="Flow" className="@container/flow border-b border-line px-6 pb-3 pt-2.5 max-[760px]:px-4 max-[760px]:pb-4 max-[760px]:pt-3.5">
      <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}
        className="box-border flex h-11 w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border border-edge bg-panel px-3 text-left text-[13px] text-ink-3 min-[761px]:hidden">
        {flow.done && !count ? (
          <><span className="font-semibold text-ink">Delivered{flow.deliveredOn ? ` ${flow.deliveredOn}` : ''}</span><span className="truncate text-sub">· every step done</span></>
        ) : (
          <><span className="font-semibold text-ink">The flow</span><span key={count ? 'n' : flow.work?.headline ?? ''} className="truncate text-sub duration-200 animate-in fade-in-0 motion-reduce:animate-none">· {count ? picksWaiting(count) : flow.work ? flow.work.headline : 'nothing waiting for you'}</span></>
        )}
        <svg className={cn('ml-auto flex-none transition-transform duration-200', expanded && 'rotate-180')} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {/* on the phone it opens and folds by sliding its height and fading, both ways (Reveal's way); folded, it is
          hidden from the keyboard and the screen reader once the slide has run */}
      <div data-flow-fold={expanded ? 'open' : 'folded'}
        className={cn('grid min-[761px]:grid-rows-[1fr] max-[760px]:transition-[grid-template-rows,opacity,visibility] max-[760px]:duration-200 max-[760px]:ease-out motion-reduce:transition-none',
          expanded ? 'max-[760px]:grid-rows-[1fr] max-[760px]:opacity-100' : 'max-[760px]:invisible max-[760px]:grid-rows-[0fr] max-[760px]:opacity-0')}>
      <div className="min-h-0 max-[760px]:overflow-hidden">
      <div data-flow className="flex flex-col gap-2 max-[760px]:pt-3">
        <div className="flex min-h-[22px] flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="lbl">The flow</span>
          {/* the press is 24 px tall around the 22 px chip drawn (QC round two); the row does not move */}
          <button type="button" onClick={() => onOpen('story')} aria-pressed={open === 'story'} aria-label={aria(story, 'Story', story.status)} data-box="story"
            className="group/story -my-px inline-flex h-6 cursor-pointer items-center text-[11.5px] text-ink-3 max-[760px]:my-0 max-[760px]:h-11">
            <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 transition-colors duration-200 max-[760px]:h-11',
              open === 'story' ? 'border-ink bg-[#141416]' : 'border-edge bg-transparent group-hover/story:bg-panel')}>
              <StepGlyph g={glyphOf(story.state)} /><span className="font-medium text-ink">Story</span>{story.short}
            </span>
          </button>
          <span className="ml-auto flex flex-wrap items-center gap-3 text-[11.5px] text-sub max-[760px]:hidden" aria-label="Key">
            {KEY.map(([g, w]) => <span key={g} className="inline-flex items-center gap-[5px] whitespace-nowrap"><StepGlyph g={g} />{w}</span>)}
          </span>
        </div>
        <div className="grid grid-cols-[52px_repeat(5,minmax(0,1fr))] items-stretch gap-x-2 gap-y-1.5 max-[760px]:grid-cols-2">
          <RowLabel>Places</RowLabel>
          {PLACES.map(box)}
          <span aria-hidden="true" className="max-[760px]:hidden" />
          <RowLabel>People</RowLabel>
          {PEOPLE.map(box)}
          <RowLabel>Then</RowLabel>
          <Box n={N.gate} on={open === 'gate'} tick={tick} onOpen={onOpen} name="Your picks" short={gateLine} g={gateG} gate />
          <Box n={editNode} on={open === 'edit' || open === 'scenes' || open === 'finish' || open === 'sound'} tick={tick} onOpen={onOpen} short={edit.line} g={edit.g} second={lines.next} secondG={lines.nextG} className="col-span-2 max-[760px]:col-span-1" />
          <Box n={N.release} on={open === 'release'} tick={tick} onOpen={onOpen} short={release.line} g={release.g} className="max-[760px]:col-span-2" />
        </div>
      </div>
      </div>
      </div>
    </section>
  );
}
