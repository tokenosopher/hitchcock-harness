'use client';
// A button press the harness sent Alma, drawn in the thread as one quiet line on the user's side ("✓ You settled the
// story · v11 · 14:05") instead of the block of instructions. A click unfolds what Alma
// received, sliding open; a second click folds it. 32 px tall to tap, its time at 11 px (the QC sweep). The words come from src/components/lib/harnessAction.ts.
import { useId, useState } from 'react';
import { actionLabel, actionTime, type HarnessAction } from '@/components/lib/harnessAction';
import { Reveal } from './Reveal';
import { cn } from '@/lib/utils';

export function ActionChip({ action, at }: { action: HarnessAction; at: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = actionLabel(action);
  const time = actionTime(at);
  return (
    <div data-action-chip={action.kind} className="flex w-full max-w-[88%] flex-col items-end self-end duration-200 animate-in fade-in motion-reduce:animate-none">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        title={open ? 'Hide what Alma received' : 'Show what Alma received'}
        className={cn('group inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-1.5 py-0.5 text-right text-[11.5px] leading-normal transition-colors hover:bg-raised hover:text-ink-3', open ? 'text-ink-3' : 'text-sub')}>
        <span aria-hidden="true" className="flex-none text-[10.5px] text-mute">✓</span>
        <span className="min-w-0 truncate">{label}</span>
        {time && <span className="flex-none font-mono text-[11px] text-mute">· {time}</span>}
        <span aria-hidden="true" className={cn('flex-none text-[10px] text-mute transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-180')}>▾</span>
      </button>
      <div id={id} className="w-full">
        <Reveal open={open}>
          <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-line bg-panel px-3 py-2 text-left text-[12px] leading-normal text-sub [overflow-wrap:anywhere]">
            {action.body || '(nothing more was sent with the press)'}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
