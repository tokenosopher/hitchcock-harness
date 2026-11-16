'use client';
// A sub-agent's card in the thread: `Alma › <job> · <target>`, the live line (its latest tool call),
// the elapsed time ticking while it runs, credits from spend.md, the last five tool lines when open
// (all of them on request), and a result row that opens what it produced.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TaskCard as Task } from '@/server/types';
import { fmtCost, fmtElapsed } from '@/components/lib/format';
import { Dot } from './atoms';
import { IconChevronRight } from './icons';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/shell/Reveal';

export function taskChipLabel(t: Task) {
  return t.title.replace(/^Alma\s*›\s*/, '');
}

const SHOWN_STEPS = 5;

/** "0:42", "12:05", "1:02:05": a running card's clock. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Ticks once a second while the card runs; a finished card shows its total as before ("3 min"). */
function useElapsed(task: Task): string | undefined {
  const running = task.state === 'running' && !task.endedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return fmtElapsed(task.startedAt, task.endedAt);
  const from = Date.parse(task.startedAt);
  return Number.isFinite(from) ? fmtClock(now - from) : undefined;
}

export function TaskCard({ task, film, open, inContext, onToggle, onOpenResult }: {
  task: Task; film: string; open: boolean; inContext: boolean; onToggle: () => void; onOpenResult?: () => void;
}) {
  const [all, setAll] = useState(false);
  const elapsed = useElapsed(task);
  const slot = elapsed ?? (task.state === 'done' ? 'done' : task.state);
  const live = task.liveLine ?? task.state;
  const meta = [task.cost ? fmtCost(task.cost) : '', task.toolUses && task.state === 'running' ? `${task.toolUses} ${task.toolUses === 1 ? 'tool call' : 'tool calls'}` : ''].filter(Boolean).join(' · ');
  const dot = task.state === 'running' ? 'running' : task.state === 'failed' ? 'failed' : task.state === 'queued' ? 'queued' : 'done';
  const href = task.result?.opens ? `/films/${film}${task.result.opens.page ? `/${task.result.opens.page}` : ''}` : undefined;
  const hidden = all ? 0 : Math.max(0, task.steps.length - SHOWN_STEPS);
  const steps = task.steps.slice(hidden);
  return (
    <div id={`task-${task.id}`} data-task-state={task.state} className={cn('flex w-full flex-col overflow-hidden rounded-[9px] border bg-panel text-ink', inContext ? 'border-faint' : 'border-edge')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-[9px] text-left">
        <Dot state={dot} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[12.5px] font-medium">{task.title}</span>
          <span className={cn('truncate text-[11.5px] leading-[1.4]', task.state === 'running' ? 'font-mono text-[11px] text-ink-3' : 'text-sub')} title={live}>{live}</span>
          {meta && <span className="truncate text-[11px] leading-[1.4] text-mute">{meta}</span>}
        </span>
        <span className={cn('flex-none whitespace-nowrap text-[11px] text-sub', elapsed && 'font-mono tabular-nums')} aria-label={task.state === 'running' ? `running for ${slot}` : undefined}>{slot}</span>
        <IconChevronRight size={13} className={cn('flex-none text-sub transition-transform', open && 'rotate-90')} />
      </button>
      {task.steps.length > 0 && <Reveal open={open}>
        <div className="flex flex-col gap-1 border-t border-line py-2 pl-[26px] pr-2.5">
          {hidden > 0 && (
            <button type="button" onClick={() => setAll(true)} className="w-fit cursor-pointer text-left font-mono text-[11px] text-mute hover:text-sub">
              {hidden} earlier {hidden === 1 ? 'step' : 'steps'}
            </button>
          )}
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            const failed = / · failed( · |$)/.test(s.text);
            const c = failed ? '#F87171' : task.state === 'running' && last ? '#FAFAFA' : task.state === 'queued' ? '#3F3F46' : '#A1A1AA';
            return (
              <span key={hidden + i} className={cn('flex items-start gap-2 font-mono text-[11px] leading-[1.45]', failed ? 'text-bad' : task.state === 'running' && last ? 'text-ink-3' : 'text-sub')}>
                <span className="mt-[6px] size-1 flex-none rounded-full" style={{ background: c }} /><span className="min-w-0 break-words">{s.text}</span>
              </span>
            );
          })}
        </div>
      </Reveal>}
      {task.result && (href ? (
        <Link href={href} onClick={onOpenResult} className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-2 text-[12px] font-medium text-ink no-underline hover:bg-raised">
          {task.result.text}<IconChevronRight size={12} className="text-sub" />
        </Link>
      ) : (
        <span className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-2 text-[12px] font-medium text-ink">{task.result.text}</span>
      ))}
    </div>
  );
}
