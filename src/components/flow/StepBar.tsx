'use client';
// The row under the flow board (ASKS 46, board 1 and 8): "Waiting for you" with its count, and, once a step on the
// flow is pressed, that step's name beside it, then one line about what shows below; the step's content follows
// straight under it (no title block, as drawn). Pressing "Waiting for you" brings it back. A deeper view (one place,
// one character) says "Waiting for you in this film"; its way back sits in the page's header, and in this row on
// the phone.
import { cn } from '@/lib/utils';
import { IconChevronLeft } from '@/components/shell/icons';

export function StepBar({ waiting, step, line, back, backPhoneOnly, deep, right, onWaiting, onBack }: {
  /** Everything waiting for the user (the flow's own count). */
  waiting: number;
  /** The open step's name; undefined while "Waiting for you" is open. */
  step?: string;
  /** One line after the chips. */
  line?: string;
  /** Inside a deeper view: the words of the way back ("Back to Locations"). */
  back?: string;
  /** The page's header carries the way back on the desktop; the row keeps it on the phone. */
  backPhoneOnly?: boolean;
  /** A deeper view: "Waiting for you in this film". */
  deep?: boolean;
  /** At the row's right: the step's own quiet things (the way to its page, its QC chip, a key). */
  right?: React.ReactNode;
  onWaiting: () => void;
  onBack?: () => void;
}) {
  const on = !step;
  return (
    <div data-step-bar className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2">
      {back && onBack && (
        <button type="button" onClick={onBack} data-step-back
          className={cn('inline-flex h-[30px] flex-none cursor-pointer items-center gap-1 rounded-lg border border-edge px-2.5 text-[12.5px] font-medium text-ink transition-colors duration-150 hover:bg-raised max-[760px]:h-11', backPhoneOnly && 'min-[761px]:hidden')}>
          <IconChevronLeft size={13} />{back}
        </button>
      )}
      <div role="tablist" aria-label="Under the flow" className="inline-flex flex-none items-center gap-0.5 rounded-lg border border-edge bg-well p-0.5">
        <button type="button" role="tab" aria-selected={on} onClick={onWaiting} data-step-chip="waiting"
          className={cn('inline-flex h-[26px] cursor-pointer items-center gap-2 max-[760px]:h-11 whitespace-nowrap rounded-md px-2.5 text-[12.5px] transition-colors duration-200', on ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>
          Waiting for you{deep ? ' in this film' : ''}
          <span data-waiting-count className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums', waiting ? 'bg-warn/20 text-warn' : 'bg-edge text-mute')}>{waiting}</span>
        </button>
        {step && (
          <span key={step} role="tab" aria-selected="true" data-step-chip="step"
            className="inline-flex h-[26px] items-center whitespace-nowrap rounded-md bg-raised max-[760px]:h-11 px-2.5 text-[12.5px] text-ink duration-200 animate-in fade-in-0">
            {step}
          </span>
        )}
      </div>
      {line && <span key={line} data-step-line className="min-w-0 text-[12.5px] leading-normal text-sub duration-200 animate-in fade-in-0">{line}</span>}
      {right && <span data-step-right className="ml-auto flex flex-none flex-wrap items-center gap-2 duration-200 animate-in fade-in-0">{right}</span>}
    </div>
  );
}
