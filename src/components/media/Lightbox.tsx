'use client';
// Any picture on the harness, full screen. A picture carries data-zoom (the address of its full-size file) and
// data-zoom-alt; one listener on the page opens it here on a click. A click also still does what it did before
// (a candidate still goes into "Alma sees"). Inside a link to another page the corner button opens the picture, so the
// link keeps working; nothing here opens a new browser tab. Close with the button, Esc, or a click beside the picture; the arrows step through the
// pictures of the page in the order they are drawn.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePresence } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';

interface Shot { src: string; alt: string; video?: boolean }
let current: { list: Shot[]; i: number } | undefined;
const listeners = new Set<() => void>();
// focus goes back to what opened it when it closes (it fell to the page's top, so the keyboard lost its place)
let opener: HTMLElement | null = null;
const set = (v: typeof current): void => {
  if (v && !current) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closing = !v && !!current;
  current = v;
  for (const l of listeners) l();
  if (closing && opener && document.contains(opener)) opener.focus({ preventScroll: true });
  if (closing) opener = null;
};

/** Opens the picture of this element, with every other picture on the page to step through. */
export function zoom(el: Element): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-zoom]')).filter((e) => e.offsetParent !== null || e === el);
  const list: Shot[] = [];
  let i = 0;
  for (const e of all) {
    const src = e.dataset.zoom!;
    if (e === el) i = list.length;
    else if (list.some((s) => s.src === src)) continue;   // the same file drawn twice on a page is one stop
    list.push({ src, alt: e.dataset.zoomAlt ?? '' });
  }
  if (list.length) set({ list, i });
}

/** Opens one clip full screen, with the player's controls. */
export function zoomVideo(src: string, alt: string): void {
  set({ list: [{ src, alt, video: true }], i: 0 });
}

export function Lightbox() {
  const state = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => undefined);
  const [loaded, setLoaded] = useState<string>();
  // a file that does not load says so (it said "Loading the full picture…" for ever)
  const [failed, setFailed] = useState<string>();
  const step = useCallback((d: number) => { if (current) set({ list: current.list, i: (current.i + d + current.list.length) % current.list.length }); }, []);
  // it fades in and out (it appeared and vanished in one frame); the last picture stays drawn while it fades out
  const fade = usePresence(!!state);
  const [last, setLast] = useState(state);
  if (state && state !== last) setLast(state);

  // a click on any picture of the page
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const t = e.target as Element | null;
      const el = t?.closest?.('[data-zoom]');
      if (!el || t?.closest('[data-no-zoom]')) return;
      const link = t?.closest('a[href]');
      // a link to another page of the harness keeps working (the picture has its corner button there); a link that
      // would only open the picture's file in a new tab opens it here instead (the user, 12 Nov: a new window confuses)
      if (link && link.getAttribute('target') !== '_blank') return;
      if (link) e.preventDefault();
      zoom(el);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); set(undefined); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey, true);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = before; };
  }, [state, step]);

  const view = state ?? last;
  if (!fade.mounted || !view) return null;
  const shot = view.list[view.i];
  const many = view.list.length > 1;
  const btn = 'flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white hover:bg-white/15';
  return (
    <div role="dialog" aria-modal="true" aria-label={shot.alt || 'Picture'} onClick={() => set(undefined)}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget) fade.done(); }}
      className={cn('fixed inset-0 z-[80] flex flex-col bg-black/95 transition-opacity duration-200 ease-out motion-reduce:transition-none', fade.shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>
      <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{shot.alt}</span>
        {many && <span className="flex-none text-[12px] tabular-nums text-white/50">{view.i + 1} of {view.list.length}</span>}
        <button type="button" autoFocus onClick={() => set(undefined)} aria-label="Close" className={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {many && (
          <button type="button" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="The picture before" className={`${btn} absolute left-3 z-10 max-[760px]:left-1.5`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        {!shot.video && loaded !== shot.src && <span className="absolute text-[12px] text-white/40">{failed === shot.src ? 'This picture could not be loaded: the file is missing or still syncing.' : 'Loading the full picture…'}</span>}
        {shot.video
          ? <video key={shot.src} src={shot.src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="relative max-h-full max-w-full bg-black" />
          : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- the full-size file as it is */}
        {!shot.video && <img key={shot.src} src={shot.src} alt={shot.alt} onLoad={() => setLoaded(shot.src)} onError={() => setFailed(shot.src)} onClick={(e) => e.stopPropagation()}
          className={cn("relative max-h-full max-w-full select-none object-contain", failed === shot.src && "invisible")} draggable={false} />}
        {many && (
          <button type="button" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="The next picture" className={`${btn} absolute right-3 z-10 max-[760px]:right-1.5`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
