'use client';
// The timeline's right-click menu (13 Nov 2026, the user: "right-click on an effect, or … where there's empty
// space, and have a list of options"). It opens at the pointer with a short fade and grow, stays inside the
// window, and closes on a click elsewhere, Escape, a scroll or a pick. Arrow keys move, Enter picks.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem { label: string; hint?: string; onPick?: () => void; danger?: boolean; sepBefore?: boolean; disabled?: boolean;
  /** A choice that is on now (a check mark before it); entries of a list where any has it keep the mark's room. */
  checked?: boolean;
  /** Choices that take this entry's place when it is clicked (the speeds, for one). */
  sub?: MenuItem[] }

export function ContextMenu({ x, y, title, items, onClose }: { x: number; y: number; title?: string; items: MenuItem[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState<MenuItem>();
  const list = open?.sub ?? items;
  useEffect(() => { box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, [open]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // measured once it is on the page, then kept inside the window
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    const t = requestAnimationFrame(() => setOn(true));
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(t);
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      // while a menu is open the keys are the menu's (F14): none reaches the page behind it (Backspace deleted the
      // shot under the menu). Enter, Space and Tab keep their own work on the focused entry; the rest do nothing
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        e.stopPropagation();
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') e.preventDefault();
        return;
      }
      e.preventDefault(); e.stopPropagation();
      const btns = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    };
    // the right-click itself can scroll the timeline (it moves the playhead and selects): only a later scroll closes
    const born = performance.now();
    // …and never a scroll in Alma's column, which moves by itself when a chip or a message lands
    const scroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('aside')) return;
      if (performance.now() - born > 350) onClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  return (
    <div ref={box} role="menu" aria-label={title ?? 'Timeline menu'} onContextMenu={(e) => e.preventDefault()}
      className={cn('fixed z-[70] w-[264px] origin-top-left rounded-[11px] border border-edge-strong bg-[#18181b] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        on ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0')}
      style={pos}>
      {open ? (
        <button type="button" onClick={() => setOpen(undefined)} className="flex w-full cursor-pointer items-center gap-1.5 rounded-[7px] border-0 bg-transparent px-2.5 pb-1 pt-1.5 text-left text-[11.5px] text-sub outline-none hover:text-ink focus-visible:text-ink">
          <span aria-hidden="true">‹</span>{open.label.replace(/…$/, '')}
        </button>
      ) : title && <div className="truncate px-2.5 pb-1 pt-1.5 text-[11.5px] text-sub">{title}</div>}
      {list.map((it) => (
        <div key={it.label}>
          {it.sepBefore && <div className="mx-1.5 my-1 h-px bg-edge" />}
          <button type="button" role="menuitem" data-checked={it.checked === undefined ? undefined : String(it.checked)} disabled={it.disabled} onClick={() => { if (it.sub) { setOpen(it); return; } onClose(); it.onPick?.(); }}
            className={cn('flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-[7px] border-0 bg-transparent px-2.5 py-[7px] text-left text-[13px] outline-none transition-colors duration-100 hover:bg-raised focus-visible:bg-raised disabled:cursor-default disabled:opacity-40',
              it.danger ? 'text-bad' : 'text-ink')}>
            <span className="flex min-w-0 items-baseline gap-1.5">
              {list.some((x) => x.checked !== undefined) && (
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('flex-none self-center transition-opacity duration-150', it.checked ? 'opacity-100' : 'opacity-0')}><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              )}
              <span>{it.label}</span>
            </span>
            {(it.hint || it.sub) && <span className="flex-none text-[11px] text-mute">{it.hint}{it.sub ? `${it.hint ? ' ' : ''}›` : ''}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
