'use client';
// Things that open and close slide or fade, both ways (the user's rule: nothing snaps). `usePresence` keeps a
// closing thing drawn until its transition has run; `Reveal` is the common case, a block that opens downwards.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** `mounted`: draw it at all. `shown`: its open look (set a frame after mounting, so the opening transition runs).
 *  `done`: call from onTransitionEnd. Something open from the first render is shown at once, without a transition. */
export function usePresence(open: boolean): { mounted: boolean; shown: boolean; done: () => void } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    // a frame later, so the closed look has been drawn once and the change to the open look is a transition
    const id = requestAnimationFrame(() => setShown(open));
    // with reduced motion there is no transition to end: a closed thing goes at once
    const still = !open && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = still ? setTimeout(() => setMounted(false), 0) : undefined;
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, [open]);
  return { mounted: mounted || open, shown: shown && open, done: () => { if (!open) setMounted(false); } };
}

/** A block that opens by sliding its height from nothing and fading in, and closes the same way. */
export function Reveal({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  const { mounted, shown, done } = usePresence(open);
  const [settled, setSettled] = useState(open);
  if (!mounted) return null;
  return (
    <div
      onTransitionEnd={(e) => { if (e.target !== e.currentTarget || e.propertyName !== 'grid-template-rows') return; setSettled(open); done(); }}
      className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
      {/* clipped only while it moves, so focus rings and wide rows are not cut once it is open */}
      <div className={cn('min-h-0', settled && shown ? 'overflow-visible' : 'overflow-hidden', className)}>{children}</div>
    </div>
  );
}
