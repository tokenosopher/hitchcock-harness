'use client';
// The History tab (15 Nov 2026, stage 5 of "saving apart from history"; the screens SaveHistory and SaveUndone): the
// steps the history holds, newest first, grouped between the saved versions. A press on a step puts the cut there
// (POST …/cut/goto, nothing written but the history's pointer); a press on a version's row opens it as one step (POST
// …/cut/restore). Only the open groups are drawn: the steps between two versions stay folded until asked for, so a
// history of 1,000 steps opens as fast as one of ten. The model is historyList.ts (pure).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/shell/icons';
import type { HistorySummary } from './history';
import type { VersionInfo, VersionNames } from './useCut';
import { historyModel, marksOf, marksWords, noteOf, sinceTitle, stepText, stepWhen, stepWho, whenWords, type StepRow, type Stretch, type VersionRow } from './historyList';

/** How many versions show before "Older versions and steps", and how many steps of the top group before "Show the
 *  other n". */
const VERSIONS_SHOWN = 4;
const STEPS_SHOWN = 50;

/** Opens and closes with a fade and a height that slides (200 ms); what is closed is not drawn at all. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const [on, setOn] = useState(open);
  if (open && !shown) setShown(true);
  useEffect(() => {
    if (open) { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }
    const t = setTimeout(() => { setOn(false); setShown(false); }, 220);
    return () => clearTimeout(t);
  }, [open]);
  if (!shown && !open) return null;
  const expanded = open && on;
  return (
    <div className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out', expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const Pill = () => <span data-cut-now className="ml-auto inline-flex h-[18px] flex-none items-center rounded-full border border-ink px-[7px] text-[11px] font-medium text-ink duration-200 animate-in fade-in-0">The cut now</span>;

function StepLine({ r, now, busy, onGo }: { r: StepRow; now: number; busy: boolean; onGo: (rev: number) => void }) {
  return (
    <button type="button" data-history-step={r.step.rev} data-undone={r.undone ? '' : undefined} data-now={r.now ? '' : undefined}
      disabled={busy && !r.now} onClick={() => { if (!r.now) onGo(r.step.rev); }}
      title={r.now ? 'The cut is here' : r.undone ? 'Redo up to this step' : 'Go back to this step'}
      className={cn('flex min-h-[22px] w-full flex-none items-center whitespace-nowrap rounded-[7px] border pl-6 pr-2 text-left text-[12.5px] transition-colors duration-200',
        r.now ? 'cursor-default border-edge bg-[#151517] text-ink' : 'cursor-pointer border-transparent hover:bg-raised/60',
        r.undone ? 'text-sub' : !r.now && 'text-ink-3')}>
      <span aria-hidden="true" className={cn('mr-[11px] flex-none rounded-full', r.now ? 'mr-[9px] size-[7px] bg-ink' : 'size-[5px]', r.undone ? 'bg-transparent shadow-[inset_0_0_0_1px_#a1a1aa]' : !r.now && 'bg-sub')} />
      <span className="min-w-0 truncate" title={r.step.words}>{stepText(r.step)}</span>
      {r.undone && <span className="ml-2.5 flex-none text-[11px] text-sub">Undone</span>}
      {r.now ? <Pill /> : null}
      <span className={cn('flex-none pl-2.5 text-[11px] text-sub', !r.now && 'ml-auto')}>{stepWho(r.step)} · {stepWhen(r.step.at, now)}</span>
    </button>
  );
}

function StretchLine({ s, open, onToggle, now, busy, onGo }: { s: Stretch; open: boolean; onToggle: () => void; now: number; busy: boolean; onGo: (rev: number) => void }) {
  return (
    <>
      <button type="button" data-history-stretch={s.key} aria-expanded={open} onClick={onToggle}
        className="flex min-h-[26px] w-full flex-none cursor-pointer items-center whitespace-nowrap rounded-[7px] pl-6 pr-2 text-left text-[12px] text-sub transition-colors duration-150 hover:bg-raised/60 hover:text-ink">
        <span aria-hidden="true" className="mr-[11px] size-[5px] flex-none" />
        <span className="min-w-0 truncate">{s.words}</span>
        <span className="ml-auto inline-flex flex-none items-center gap-1 pl-2.5 text-[11.5px]">{open ? 'Hide them' : 'Show them'}<IconChevronRight size={11} className={cn('transition-transform duration-200', open && 'rotate-90')} /></span>
      </button>
      <Reveal open={open}>
        <div className="flex flex-col gap-px pb-1">{s.steps.map((r) => <StepLine key={r.step.rev} r={r} now={now} busy={busy} onGo={onGo} />)}</div>
      </Reveal>
    </>
  );
}

export interface HistoryMarks { approved?: string; masters?: Set<string>; final?: string }

export function HistoryPanel({ history, versions, unreadable, names, equals, marks, keys, busy, onGo, onOpen }: {
  history: HistorySummary; versions: VersionInfo[]; unreadable: Record<string, string[]>; names: VersionNames; equals?: string;
  marks: HistoryMarks; keys: { undo: string; redo: string }; busy: boolean;
  onGo: (rev: number) => void; onOpen: (version: string) => void;
}) {
  const model = useMemo(() => historyModel(history, versions, unreadable, equals), [history, versions, unreadable, equals]);
  // the time the page reads "today" and "yesterday" against, taken once
  const [now] = useState(() => Date.now());
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [older, setOlder] = useState(false);
  const [allSteps, setAllSteps] = useState(false);
  const toggle = (k: string) => setOpened((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // the stretch that holds the cut now is open (its pill must show), and so is the fold that holds it
  const isOpen = (s: Stretch) => opened.has(s.key) !== s.hasNow;
  const head = model.versions.slice(0, VERSIONS_SHOWN), rest = model.versions.slice(VERSIONS_SHOWN);
  const olderHasNow = rest.some((r) => r.now || r.stretch?.hasNow) || !!model.before?.hasNow;
  const olderOpen = older !== olderHasNow;
  const since = model.since.steps;
  const sinceShown = allSteps || since.length <= STEPS_SHOWN + 1 ? since : since.slice(0, STEPS_SHOWN);
  const sinceNowHidden = sinceShown.length < since.length && since.slice(STEPS_SHOWN).some((r) => r.now);
  const shownSteps = sinceNowHidden ? since : sinceShown;

  const versionLine = (r: VersionRow) => {
    if (r.bad !== undefined) return (
      <div key={r.version} data-history-version={r.version} data-unreadable="" title={r.bad}
        className="mt-px flex min-h-[22px] w-full flex-none items-center gap-2.5 whitespace-nowrap border-t border-line px-2 text-[12px] text-sub">
        <span className="flex-none text-[13px] text-sub">{r.version}</span>
        <span className="min-w-0 truncate">cannot be opened</span>
        {r.at && <span className="ml-auto flex-none pl-2.5 text-[11px]">{whenWords(r.at, now)}</span>}
      </div>
    );
    const name = names[r.version]?.name;
    const mk = marksWords(marksOf(r, marks));
    const what = name ?? (r.why === 'render' ? 'saved for a render' : r.why === 'final' ? 'saved as the final' : r.why === 'export' ? 'saved for an export' : r.by === 'alma' && noteOf(r.note) ? noteOf(r.note) : 'saved');
    return (
      <button key={r.version} type="button" data-history-version={r.version} data-now={r.now ? '' : undefined} disabled={busy && !r.now}
        onClick={() => { if (!r.now) onOpen(r.version); }} title={r.now ? `The cut is ${r.version}, as saved` : `Open ${r.version} as one step (Undo brings back what you had)`}
        className={cn('mt-px flex min-h-[22px] w-full flex-none items-center gap-2.5 whitespace-nowrap border px-2 text-left text-[12px] transition-colors duration-200',
          r.now ? 'cursor-default rounded-[7px] border-edge bg-[#151517]' : 'cursor-pointer rounded-none border-transparent border-t-line hover:bg-raised/60')}>
        <span className="flex-none text-[13px] font-medium text-ink">{r.version}</span>
        <span className="min-w-0 truncate text-ink-3" title={name ? [name, r.note].filter(Boolean).join(' · ') : r.note}><span className={name ? 'text-ink' : undefined}>{what}</span>{mk ? <span className="text-sub"> · {mk}</span> : null}</span>
        {r.now && <Pill />}
        <span className={cn('flex-none pl-2.5 text-[11px] text-sub', !r.now && 'ml-auto')}>{[whenWords(r.at, now), r.by === 'alma' ? 'Alma' : r.by === 'migration' ? '' : 'you'].filter(Boolean).join(' · ')}</span>
      </button>
    );
  };
  const versionBlock = (r: VersionRow) => (
    <div key={r.version} className="flex flex-col">
      {versionLine(r)}
      {r.stretch && <StretchLine s={r.stretch} open={isOpen(r.stretch)} onToggle={() => toggle(r.stretch!.key)} now={now} busy={busy} onGo={onGo} />}
    </div>
  );

  return (
    <div data-history-panel className="flex flex-col rounded-[10px] border border-line duration-200 animate-in fade-in-0">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 pb-1 pt-2">
        <span className="text-[13px] font-medium text-ink">History</span>
        <span className="text-[12px] text-sub">· newest first</span>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-sub">
          <span className="rounded-[4px] border border-edge-strong px-1 text-[11px] leading-[15px] text-ink-3">{keys.undo}</span>back one
          <span className="ml-1.5 rounded-[4px] border border-edge-strong px-1 text-[11px] leading-[15px] text-ink-3">{keys.redo}</span>forward one
        </span>
      </div>
      <div className="flex flex-col px-1 pb-1">
        {since.length > 0 && (
          <>
            <span data-history-since className="px-2 pb-px text-[11px] tracking-[0.02em] text-sub">{sinceTitle(model.since.version)}</span>
            <div className="flex flex-col gap-px">{shownSteps.map((r) => <StepLine key={r.step.rev} r={r} now={now} busy={busy} onGo={onGo} />)}</div>
            {shownSteps.length < since.length && (
              <button type="button" data-history-more onClick={() => setAllSteps(true)}
                className="flex min-h-[26px] w-full cursor-pointer items-center whitespace-nowrap rounded-[7px] pl-6 pr-2 text-left text-[12px] text-sub hover:bg-raised/60 hover:text-ink">
                <span aria-hidden="true" className="mr-[11px] size-[5px] flex-none" />
                {since.length - shownSteps.length} older steps since {model.since.version ?? 'the start'}
                <span className="ml-auto inline-flex items-center gap-1 text-[11.5px]">Show them<IconChevronRight size={11} /></span>
              </button>
            )}
          </>
        )}
        {head.map(versionBlock)}
        {(rest.length > 0 || model.before) && (
          <>
            <button type="button" data-history-older aria-expanded={olderOpen} onClick={() => setOlder((o) => !o)}
              className="mt-px flex min-h-[26px] w-full flex-none cursor-pointer items-center whitespace-nowrap border-t border-line pl-6 pr-2 text-left text-[12px] text-sub transition-colors duration-150 hover:bg-raised/60 hover:text-ink">
              <span aria-hidden="true" className="mr-[11px] size-[5px] flex-none" />
              <span className="min-w-0 truncate">Older versions and steps{rest.length ? <span className="text-mute"> · {rest.length === 1 ? `1 version, ${rest[0].version}` : `${rest.length} versions, ${rest[rest.length - 1].version} to ${rest[0].version}`}</span> : null}</span>
              <span className="ml-auto inline-flex flex-none items-center gap-1 pl-2.5 text-[11.5px]">{olderOpen ? 'Hide them' : 'Show them'}<IconChevronRight size={11} className={cn('transition-transform duration-200', olderOpen && 'rotate-90')} /></span>
            </button>
            <Reveal open={olderOpen}>
              <div className="flex flex-col">
                {rest.map(versionBlock)}
                {model.before && <StretchLine s={model.before} open={isOpen(model.before)} onToggle={() => toggle(model.before!.key)} now={now} busy={busy} onGo={onGo} />}
              </div>
            </Reveal>
          </>
        )}
        {!since.length && !model.versions.length && <span className="px-2 py-2 text-[12.5px] text-sub">No steps yet.</span>}
      </div>
      <p className="m-0 border-t border-line px-2 pb-2 pt-1.5 text-[11.5px] leading-[1.4] text-sub">
        Press a step to go to it. Dimmed steps are undone. Redo brings them back; a new edit clears them. Saved versions are never deleted.
      </p>
    </div>
  );
}
