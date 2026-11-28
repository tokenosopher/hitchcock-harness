'use client';
// "Clear choice" on a card: the choice made for a card taken back from the card itself. One quiet text button beside the chosen line; it fades in with
// the chosen state and out when the choice is cleared. Nothing else comes back: no per-card send or confirm.
import { Btn } from './atoms';
import { usePresence } from './Reveal';
import { cn } from '@/lib/utils';

export function ClearChoice({ shown, onClear, label = 'Clear choice' }: { shown: boolean; onClear: () => void; label?: string }) {
  const p = usePresence(shown);
  if (!p.mounted) return null;
  return (
    <Btn ghost data-clear-choice tabIndex={shown ? undefined : -1} aria-hidden={shown ? undefined : true} onClick={onClear}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'opacity') p.done(); }}
      className={cn('transition-opacity duration-200 ease-out motion-reduce:transition-none', p.shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>
      {label}
    </Btn>
  );
}
