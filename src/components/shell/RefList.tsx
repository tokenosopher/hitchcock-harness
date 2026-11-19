'use client';
// The @ list: opened by typing "@" in the message box, narrowed by what follows it, keyboard first (the
// arrows move, Enter or Tab puts the thing in, Escape closes). It sits 8 px above the box at the box's width; the
// keys stay in the box, so the cursor never leaves it.
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { matchIn, type RefItem } from './refItems';

const KEY = 'rounded-[4px] border border-edge px-1 font-mono text-[10.5px] leading-4 text-sub';

function Label({ text, query }: { text: string; query: string }) {
  const m = matchIn(text, query);
  if (!m) return <>{text}</>;
  return <>{text.slice(0, m[0])}<span className="font-semibold text-ink">{text.slice(m[0], m[1])}</span>{text.slice(m[1])}</>;
}

export function RefList({ items, query, active, onActive, onChoose }: { items: RefItem[]; query: string; active: number; onActive: (i: number) => void; onChoose: (it: RefItem) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-ref-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <div data-ref-list="" data-ref-skip="" role="listbox" aria-label="Things to put in the message" id="ref-list"
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-[60] flex flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.6)] duration-150 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
      <div ref={list} className="scroll flex max-h-[300px] flex-col gap-px overflow-y-auto p-1.5">
        {!items.length && <span className="px-2 py-2 text-[12.5px] text-sub">Nothing named “{query}”.</span>}
        {items.map((it, i) => {
          const head = i === 0 || items[i - 1].group !== it.group ? it.group : undefined;
          return (
            <div key={`${it.group}:${it.ref.label}:${i}`} className="contents">
              {head && <span className="px-2 pb-1 pt-2 text-[11px] tracking-[0.02em] text-mute">{head}</span>}
              <button type="button" role="option" aria-selected={i === active} data-ref-row={i} id={`ref-row-${i}`} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onMouseMove={() => { if (i !== active) onActive(i); }} onClick={() => onChoose(it)}
                className={cn('flex min-h-[34px] w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-0 px-2 py-[5px] text-left text-[13px] transition-colors duration-100', i === active ? 'bg-edge text-ink' : 'bg-transparent text-ink-3')}>
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element -- a frame or a face from /api/media
                  ? <img src={it.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="h-[26px] w-[15px] flex-none rounded-[3px] bg-edge object-cover" />
                  : <span className="w-[15px] flex-none" />}
                <span className="flex-none whitespace-nowrap"><Label text={it.ref.label} query={query} /></span>
                {it.sub && <span className="min-w-0 flex-1 truncate text-[11.5px] text-mute">{it.sub}</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-none items-center gap-3 border-t border-line px-3.5 py-[7px] text-[11px] text-mute">
        <span className="inline-flex items-center gap-1"><span className={KEY}>↑↓</span>move</span>
        <span className="inline-flex items-center gap-1"><span className={KEY}>⏎</span>put in</span>
        <span className="inline-flex items-center gap-1"><span className={KEY}>esc</span>close</span>
      </div>
    </div>
  );
}
