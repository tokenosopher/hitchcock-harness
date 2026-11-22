'use client';
// Any picture on the harness, full screen. A picture carries data-zoom (the address of its full-size file) and
// data-zoom-alt; one listener on the page opens it here on a click. A click also still does what it did before
// (a candidate still goes into "Alma sees"). Inside a link to another page the corner button opens the picture, so the
// link keeps working; nothing here opens a new browser tab. Close with the button, Esc, or a click beside the picture; the arrows,
// the arrow keys and a swipe step through the set the picture was opened from (its tile row: zoomSet.ts), not the whole
// page. Where the tile behind can be chosen, "Choose this one" presses that very tile's control.
// The picture zooms inside the view: pinch, drag and double-tap, or the wheel, a drag,
// a double-click and + - 0 (useZoom.ts); the controls stay on top, unscaled. Zoomed, a swipe pans; a new picture opens
// at fit; zoomed past the file shown, a larger file of it is loaded behind the one in place.
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { usePresence } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import { chooserOf, isChosen, stepIndex, zoomList, zoomScope } from './zoomSet';
import { useZoom } from './useZoom';

// choose: the tile's own control, found when it opens (the picture itself can be redrawn while the view is open)
interface Shot { src: string; alt: string; video?: boolean; choose?: HTMLElement | null }
let current: { list: Shot[]; i: number; dir?: number } | undefined;
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

/** Opens the picture of this element, with the other pictures of its set (its tile row) to step through. */
export function zoom(el: Element): void {
  const all = zoomScope(el);
  // the same file drawn twice in a set is one stop
  const { list, i } = zoomList(all.map((e) => ({ src: e.dataset.zoom!, alt: e.dataset.zoomAlt ?? '', choose: chooserOf(e) })), all.indexOf(el as HTMLElement));
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
  const step = useCallback((d: number) => { if (current && current.list.length > 1) set({ list: current.list, i: stepIndex(current.i, d, current.list.length), dir: d }); }, []);
  // the picture it leaves slides and fades out under the next one (it snapped)
  const [leaving, setLeaving] = useState<{ src: string; dir: number; key: number }>();
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state && seen && state.dir && seen.list === state.list && seen.i !== state.i) setLeaving({ src: seen.list[seen.i].src, dir: state.dir, key: (leaving?.key ?? 0) + 1 });
    else if (!state || !seen) setLeaving(undefined);
  }
  // the tile behind can change while the view is open (chosen here or by Alma): read it again on each change
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // it fades in and out (it appeared and vanished in one frame); the last picture stays drawn while it fades out
  const fade = usePresence(!!state);
  const [last, setLast] = useState(state);
  if (state && state !== last) setLast(state);
  const stage = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLImageElement>(null);
  // a larger file of a picture, once loaded (the one shown stays in place until then)
  const [sharp, setSharp] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const live = state ?? last;
  const liveShot = live?.list[live.i];
  const { zoomed } = useZoom(stage, pic, liveShot && !liveShot.video ? liveShot.src : undefined, {
    onSwipe: step,
    onSharper: (url) => {
      const src = liveShot?.src;
      if (!src || asked.current.has(url)) return;
      asked.current.add(url);
      const im = new Image();
      im.onload = () => setSharp((m) => ({ ...m, [src]: url }));
      im.src = url;
    },
  });

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

  const open = !!state;
  useEffect(() => {
    if (!open) return;
    const mo = new MutationObserver(redraw);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-checked', 'data-zoom-chosen'] });
    return () => mo.disconnect();
  }, [open]);

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
  const chooser = shot.choose?.isConnected && !(shot.choose as HTMLButtonElement).disabled ? shot.choose : null;
  const chosen = isChosen(chooser);
  const dir = view.dir ?? 0;
  const btn = 'flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/60 text-white hover:bg-white/15';
  return (
    <div role="dialog" aria-modal="true" aria-label={shot.alt || 'Picture'} onClick={() => set(undefined)}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget) fade.done(); }}
      className={cn('fixed inset-0 z-[80] flex flex-col bg-black/95 transition-opacity duration-200 ease-out motion-reduce:transition-none', fade.shown ? 'opacity-100' : 'pointer-events-none opacity-0')}>
      <div className="flex flex-none items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{shot.alt}</span>
        {many && <span className="flex-none text-[12px] tabular-nums text-white/50">{view.i + 1} of {view.list.length}</span>}
        {chooser && (
          // the very control of the tile behind (its pick, its tray), pressed as a tap on the tile would
          <button type="button" data-lightbox-choose aria-pressed={chosen} disabled={chosen} onClick={() => { chooser.setAttribute('data-zoom-from-view', ''); try { chooser.click(); } finally { chooser.removeAttribute('data-zoom-from-view'); } redraw(); }}
            className={cn('inline-flex h-10 flex-none items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors duration-200',
              chosen ? 'cursor-default border-white/30 bg-transparent text-white/80' : 'cursor-pointer border-white bg-white text-black hover:bg-white/85')}>
            {chosen && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            {chosen ? 'Chosen' : 'Choose this one'}
          </button>
        )}
        <button type="button" autoFocus onClick={() => set(undefined)} aria-label="Close" className={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div ref={stage} data-zoomed={zoomed || undefined} className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {many && (
          <button type="button" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="The picture before" className={`${btn} absolute left-3 z-10 max-[760px]:left-1.5`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        {!shot.video && loaded !== shot.src && <span className="absolute text-[12px] text-white/40">{failed === shot.src ? 'This picture could not be loaded: the file is missing or still syncing.' : 'Loading the full picture…'}</span>}
        {shot.video
          ? <video key={shot.src} src={shot.src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="relative max-h-full max-w-full bg-black" />
          : null}
        {leaving && !shot.video && (
          // eslint-disable-next-line @next/next/no-img-element -- the picture it leaves, fading out
          <img key={`out-${leaving.key}`} src={leaving.src} alt="" aria-hidden="true" draggable={false} onAnimationEnd={() => setLeaving(undefined)}
            className={cn('pointer-events-none absolute max-h-full max-w-full select-none object-contain animate-out fade-out fill-mode-forwards duration-200 ease-out motion-reduce:hidden', leaving.dir > 0 ? 'slide-out-to-left-8' : 'slide-out-to-right-8')} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- the full-size file as it is */}
        {!shot.video && <img ref={pic} key={shot.src} src={sharp[shot.src] ?? shot.src} data-lightbox-picture alt={shot.alt} onLoad={() => setLoaded(shot.src)} onError={() => setFailed(shot.src)} onClick={(e) => e.stopPropagation()}
          className={cn('relative max-h-full max-w-full select-none object-contain', failed === shot.src && 'invisible',
            loaded === shot.src ? cn('animate-in fade-in duration-200 ease-out motion-reduce:animate-none', dir > 0 ? 'slide-in-from-right-8' : dir < 0 ? 'slide-in-from-left-8' : '') : 'opacity-0')} draggable={false} />}
        {many && (
          <button type="button" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="The next picture" className={`${btn} absolute right-3 z-10 max-[760px]:right-1.5`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
