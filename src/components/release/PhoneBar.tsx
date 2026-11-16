'use client';
// The Release pages' bar at the foot of the phone (stage 3, board Phone): the one button of the moment and the Alma
// pill beside it. It sits just above Alma's own panel at the bottom of the phone (her message box), never over the
// page: a spacer of its height ends the page, so the last row can always be scrolled above it.
import { useEffect, useState } from 'react';
import { useUI } from '@/components/data/ui';
import { useTyping } from './layout';

/** The height of Alma's panel at the foot of the phone, followed as it grows. */
function usePanelHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    let ro: ResizeObserver | undefined;
    let id: ReturnType<typeof setInterval> | undefined;
    const attach = () => {
      const el = document.querySelector<HTMLElement>('aside[aria-label="Thread with Alma"]');
      if (!el) return false;
      ro = new ResizeObserver(() => setH(getComputedStyle(el).position === 'fixed' ? el.getBoundingClientRect().height : 0));
      ro.observe(el);
      setH(getComputedStyle(el).position === 'fixed' ? el.getBoundingClientRect().height : 0);
      return true;
    };
    if (!attach()) id = setInterval(() => { if (attach()) clearInterval(id); }, 300);
    return () => { ro?.disconnect(); if (id) clearInterval(id); };
  }, []);
  return h;
}

export function PhoneBar({ children, dock }: { children: React.ReactNode; dock?: React.ReactNode }) {
  const { setThreadOpen, threadOpen } = useUI();
  const h = usePanelHeight();
  // the bar's own height, followed as it grows (a schedule box, a reason under the button)
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const [own, setOwn] = useState(84);
  useEffect(() => {
    if (!bar) return;
    const ro = new ResizeObserver(() => setOwn(Math.ceil(bar.getBoundingClientRect().height)));
    ro.observe(bar);
    return () => ro.disconnect();
  }, [bar]);
  // while a field of the page is typed in, the bar steps aside so the keyboard does not hide the field under it
  const typing = useTyping();
  const away = threadOpen || typing;
  return (
    <>
      {/* the bar's own height and Alma's panel under it (the page's bottom padding is not counted in a flex column) */}
      <div aria-hidden="true" data-phone-spacer className="flex-none" style={{ height: own + h }} />
      <div ref={setBar} data-phone-bar style={{ bottom: h }}
        className={`fixed inset-x-0 z-30 flex flex-col gap-2 border-t border-line bg-bg px-4 py-3 transition-[opacity,bottom,translate] duration-200 ease-out ${away ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100'}`}>
        {dock}
        <div className="flex items-end gap-2.5">
          <div className="min-w-0 flex-1">{children}</div>
          <button type="button" data-alma-pill onClick={() => setThreadOpen(true)}
            className="inline-flex h-12 flex-none cursor-pointer items-center gap-2 rounded-full border border-edge-strong bg-panel px-4 text-[14px] text-ink">
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border border-edge-strong text-[10px] text-sub">A</span>Alma
          </button>
        </div>
      </div>
    </>
  );
}

/** The bar's main button: full height, filled. */
export const phoneMain = 'flex h-12 w-full cursor-pointer items-center justify-center rounded-[12px] bg-ink px-4 text-[15px] font-medium text-bg no-underline transition-colors duration-150 active:bg-ink-3 disabled:cursor-not-allowed disabled:bg-edge-strong disabled:text-sub';
