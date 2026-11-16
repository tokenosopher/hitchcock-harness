'use client';
// The bar that holds unsaved edits on the Story page (the story, the script; ASKS 64, design/boards/Story-2.dc.html).
// It sits at the bottom of the panel it belongs to, as wide as it, and stays in view while the panel scrolls (sticky):
// being in the page's flow, it never covers the panel's last lines, and 16 px stay free under them. On a phone it rides
// above Alma's bar (or on the keyboard while she has stepped aside). It slides up and fades in, and out the same way.
import { usePresence } from '@/components/shell/Reveal';
import { Btn, Dot } from '@/components/shell/atoms';
import { cn } from '@/lib/utils';

export function SaveBar({ open, text, sub, error, busy, saveLabel, onSave, onDiscard, saveDisabled, saveTitle, name }: {
  open: boolean; text: React.ReactNode; sub?: React.ReactNode; error?: string; busy?: boolean; saveLabel: string;
  onSave: () => void; onDiscard: () => void; saveDisabled?: boolean; saveTitle?: string; name: string;
}) {
  const { mounted, shown, done } = usePresence(open);
  if (!mounted) return null;
  return (
    <div data-save-bar={name} role="region" aria-label={name === 'script' ? 'Your script edits' : 'Your story edit'}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget) done(); }}
      className={cn('sticky bottom-4 z-10 mt-4 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none max-[760px]:bottom-[calc(var(--hh-phone-bar,0px)+12px)]',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[12px] border border-edge bg-panel py-2.5 pl-4 pr-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
        <div aria-live="polite" className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5 max-[760px]:flex-[1_1_120px]">
          {error ? (
            <>
              <span className="flex items-center gap-2 text-[13px] text-ink-3"><Dot state="failed" />Couldn’t save</span>
              <span className="text-[12px] leading-normal text-sub">{error}</span>
            </>
          ) : (
            <>
              <span className="text-[13px] text-ink-3">{text}</span>
              {/* on a phone the bar stays one row: the longer words are on the page and in the thread */}
              {sub && <span className="text-[12px] leading-normal text-sub max-[760px]:hidden">{sub}</span>}
            </>
          )}
        </div>
        <Btn ghost onClick={onDiscard} disabled={busy} className="max-[760px]:h-11">Discard</Btn>
        <Btn primary onClick={onSave} disabled={busy || saveDisabled} title={saveTitle} className="max-[760px]:h-11" data-save>
          {busy && <Dot state="running" />}{error && !busy ? 'Try again' : saveLabel}
        </Btn>
      </div>
    </div>
  );
}

/** ⌘S / Ctrl+S on a field: saves instead of the browser's "save the page". */
export const isSaveKey = (e: React.KeyboardEvent | KeyboardEvent): boolean => (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's';
