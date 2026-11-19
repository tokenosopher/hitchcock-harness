'use client';
// Settings: the switch "Step intros", on by default. Off hides Alma's word at the top of every step; on brings every
// one back, the ones hidden one by one included. Drawn like the page's other sections.
import { useEffect, useRef } from 'react';
import { Card } from '@/components/shell/atoms';
import { cn } from '@/lib/utils';
import { introActions, useIntroPrefs } from './useIntros';

export function IntroSettings() {
  const p = useIntroPrefs();
  // opened from an intro's "All intros: Settings" (/settings#step-intros): the card comes into view once it is drawn
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || window.location.hash !== '#step-intros') return;
    scrolled.current = true;
    document.getElementById('step-intros')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);
  const on = p ? !p.off : true;
  const some = p ? (p.off ? p.shown.length : p.hidden.length) : 0;
  const note = !p ? '' : !p.off
    ? (some ? `On: shown at the top of every step but ${some === 1 ? 'one you hid' : `${some} you hid`}. Switching off and on again brings those back.` : 'On: shown at the top of every step.')
    : (some ? `Off: shown only on the ${some === 1 ? 'step' : `${some} steps`} you brought back. Bring one back with Show intro on its page.` : 'Off: bring one back with Show intro on its page.');
  return (
    <Card id="step-intros" data-intro-settings className="scroll-mt-20">
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="lbl">Alma’s step intros</span>
        <span className="text-[12.5px] leading-normal text-sub">A few words from Alma at the top of every step: what you do there, and why it comes at that point of the film.</span>
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 max-[760px]:grid-cols-[minmax(0,1fr)_auto]">
        <label htmlFor="step-intros-switch" className="cursor-pointer text-[13.5px] font-medium max-[760px]:col-span-1">Step intros</label>
        <span className="min-w-0 text-[13px] leading-normal text-sub max-[760px]:order-3 max-[760px]:col-span-2">{note}</span>
        <button id="step-intros-switch" type="button" role="switch" aria-checked={on} disabled={!p}
          onClick={() => void introActions.setAll(!on)}
          className="group flex h-10 w-12 flex-none cursor-pointer items-center justify-end disabled:cursor-not-allowed disabled:opacity-50 max-[760px]:order-2">
          <span className={cn('relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-200 ease-out motion-reduce:transition-none',
            on ? 'border-ink bg-ink' : 'border-edge-strong bg-raised group-hover:border-sub')}>
            <span className={cn('absolute left-[2px] size-3.5 rounded-full transition-[translate,background-color] duration-200 ease-out motion-reduce:transition-none',
              on ? 'translate-x-4 bg-bg' : 'translate-x-0 bg-sub')} />
          </span>
        </button>
      </div>
    </Card>
  );
}
