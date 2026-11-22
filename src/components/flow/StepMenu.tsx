'use client';
// The step in a deeper page's trail ("The Lighthouse / ✓ Characters ⌄ / Tobias", as drawn): its
// mark and name, and a press opens the flow's steps as a short menu, each opening that step on the film's board (or
// its own page, for a step that is one: Release).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PEOPLE, PLACES, stepHref, type Flow } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import { IconChevronDown } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { StepGlyph, glyphOf, type Glyph } from './FlowBoard';

const ROWS: [string, FlowKey[]][] = [['Places', PLACES], ['People', PEOPLE], ['Then', ['gate', 'edit', 'release']]];

export function StepMenu({ flow, base, label, g }: { flow: Flow; base: string; label: string; g: Glyph }) {
  const [open, setOpen] = useState(false);
  // the menu stays drawn for its fade out (150 ms) after it closes, so it never vanishes in one frame
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);
  useEffect(() => { if (open || !shown) return; const t = setTimeout(() => setShown(false), 160); return () => clearTimeout(t); }, [open, shown]);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    // Escape closes the menu and gives the keyboard back to its button (when it was inside the menu)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (box.current?.contains(document.activeElement)) btn.current?.focus(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  /** The up and down arrows move through the steps (from the button too), Home and End to the first and the last. */
  const arrows = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!items.length) { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } return; }
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[to]?.focus();
  };
  return (
    <span ref={box} className="relative flex-none" onKeyDown={arrows}>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)} title="The flow" data-step-menu
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border border-edge-strong bg-transparent px-2 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-raised">
        <StepGlyph g={g} />{label}<IconChevronDown size={13} className={cn('text-sub transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {shown && (
        <span role="menu" aria-hidden={!open || undefined} inert={!open || undefined}
          className={cn('absolute left-0 top-[calc(100%+6px)] z-30 flex w-[220px] flex-col gap-0.5 rounded-[10px] border border-edge bg-panel p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.5)] duration-150',
            open ? 'animate-in fade-in-0 slide-in-from-top-1' : 'pointer-events-none animate-out fade-out-0 fill-mode-forwards')}>
          {ROWS.map(([row, keys]) => (
            <span key={row} className="flex flex-col">
              <span className="px-2 pb-0.5 pt-1.5 text-[11px] uppercase tracking-[0.08em] text-mute">{row}</span>
              {keys.map((k) => {
                const n = flow.nodes[k];
                return (
                  <Link key={k} role="menuitem" href={stepHref(base, k)} onClick={() => setOpen(false)}
                    className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-ink no-underline transition-colors duration-150 hover:bg-raised">
                    <StepGlyph g={k === 'gate' ? (flow.waiting ? 'now' : 'done') : glyphOf(n.state)} />{k === 'gate' ? 'Your picks' : n.name}
                  </Link>
                );
              })}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
