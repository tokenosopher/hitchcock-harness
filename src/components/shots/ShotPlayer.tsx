'use client';
// The take's clip on the Shot details page, cued to the shot open: it plays from the shot's first frame and stops at
// its last; the line under it is the take in its shots, the open one raised. Dragging the line seeks; let go in another
// shot and that shot opens. On the whole take it plays through. The full-screen
// button or a double-click opens it in the app's viewer, still only the shot, looping (the whole take when none is open).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { zoomItems } from '@/components/media/Lightbox';
import { cn } from '@/lib/utils';
import { aspectStyle } from '@/lib/frame';
import { PICK, pickProps } from './tell';
import type { PageShot } from './model';

export interface PlayerHandle { cue: (shot: PageShot | undefined, play: boolean) => void; at: () => number }

export const fmtT = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export const ShotPlayer = forwardRef<PlayerHandle, {
  path?: string; shots: PageShot[]; sel?: PageShot; total?: number; phone: boolean; onTell: (at: number) => void;
  onShot: (i: number) => void; badge: string; standing?: string;
  /** The film's aspect: the picture's box takes it; 9:16 when absent. */
  aspect?: string;
}>(function ShotPlayer({ path, shots, sel, total: given, phone, onTell, onShot, badge, standing, aspect }, ref) {
  const vid = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState<number>();
  const total = given ?? dur ?? shots[shots.length - 1]?.t1 ?? 0;
  const timed = shots.filter((s) => s.t0 !== undefined && s.t1 !== undefined);

  const cue = useCallback((shot: PageShot | undefined, play: boolean) => {
    const v = vid.current;
    if (!v) return;
    if (shot && shot.t0 !== undefined && shot.t1 !== undefined) {
      stopAt.current = shot.t1;
      v.currentTime = shot.t0 + (play ? 0.02 : Math.min(0.3, (shot.t1 - shot.t0) / 3));
    } else {
      stopAt.current = null;
      v.currentTime = play ? 0 : Math.min(1, total / 3);
    }
    if (play) void v.play().catch(() => undefined);
    setT(v.currentTime);
  }, [total]);
  useImperativeHandle(ref, () => ({ cue, at: () => vid.current?.currentTime ?? 0 }), [cue]);

  // the first frame of the shot open shows once the clip can seek (the page may open its shot before or after that)
  const latest = useRef(sel);
  const loaded = useRef(false);
  useEffect(() => { latest.current = sel; });
  useEffect(() => { loaded.current = false; }, [path]);
  const ready = () => { if (!loaded.current) { loaded.current = true; cue(latest.current, false); } };

  const tick = () => {
    const v = vid.current;
    if (!v) return;
    setT(v.currentTime);
    if (stopAt.current !== null && v.currentTime >= stopAt.current) { v.pause(); v.currentTime = Math.max(0, stopAt.current - 0.04); }
  };
  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) {
      if (sel?.t0 !== undefined && sel.t1 !== undefined) { stopAt.current = sel.t1; if (v.currentTime >= sel.t1 - 0.06 || v.currentTime < sel.t0) v.currentTime = sel.t0; }
      void v.play().catch(() => undefined);
    } else v.pause();
  };

  const full = () => {
    if (!path) return;
    vid.current?.pause();
    const timedSel = sel?.t0 !== undefined && sel.t1 !== undefined;
    zoomItems([{ src: mediaUrl(path), alt: badge, video: true, ...(timedSel ? { from: sel!.t0, to: sel!.t1 } : {}) }], 0);
  };

  const scrub = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const seekX = (x: number) => {
    const v = vid.current, el = scrub.current;
    if (!v || !el || !total) return;
    const r = el.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * total;
    setT(v.currentTime);
  };
  const shotAt = (x: number) => (timed.find((s) => x >= s.t0! && x < s.t1!) ?? timed[timed.length - 1])?.i;

  return (
    <div className="flex flex-col gap-2.5">
      <div {...pickProps(() => onTell(t))} onClick={(e) => { if (!e.altKey) toggle(); }} onDoubleClick={(e) => { if (!e.altKey) full(); }} role="button" tabIndex={-1} aria-label={playing ? 'Pause' : 'Play'}
        style={aspectStyle(aspect)} className={cn('relative aspect-[9/16] w-full flex-none cursor-pointer overflow-hidden rounded-[10px] border border-edge bg-black', phone && 'max-h-[72vh] rounded-[12px]', PICK)}>
        {path ? (
          <video ref={vid} key={path} src={mediaUrl(path)} playsInline preload="auto" className="size-full object-contain"
            onTimeUpdate={tick} onSeeked={tick} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); ready(); }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12.5px] leading-normal text-sub">{standing ?? 'No clip of this take yet.'}</span>
        )}
        <span className="pointer-events-none absolute left-2 top-2 rounded-[6px] bg-bg/75 px-[7px] py-0.5 text-[11px] text-ink-2">{badge}</span>
      </div>
      {path && (
        <>
          <div className="flex items-center gap-2 max-[760px]:gap-3">
            <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
              className="grid size-7 flex-none cursor-pointer place-items-center rounded-full border border-edge-strong text-ink transition-colors hover:bg-raised max-[760px]:size-10">
              {playing
                ? <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" /></svg>
                : <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>}
            </button>
            <div ref={scrub} role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(t)}
              onPointerDown={(e) => { drag.current = true; stopAt.current = null; e.currentTarget.setPointerCapture(e.pointerId); seekX(e.clientX); }}
              onPointerMove={(e) => { if (drag.current) seekX(e.clientX); }}
              onPointerUp={() => {
                drag.current = false;
                const v = vid.current;
                const n = v ? shotAt(v.currentTime) : undefined;
                if (n !== undefined && sel && n !== sel.i) onShot(n);
                else if (sel?.t1 !== undefined) stopAt.current = sel.t1;
              }}
              onKeyDown={(e) => { const v = vid.current; if (!v) return; if (e.key === 'ArrowRight') v.currentTime = Math.min(total, v.currentTime + 1 / 24); if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 1 / 24); }}
              className="relative flex h-6 flex-1 cursor-pointer touch-none items-center gap-0.5 max-[760px]:h-10">
              {(timed.length ? timed : [{ i: 0, t0: 0, t1: total || 1 } as PageShot]).map((s) => (
                <span key={s.i} style={{ flex: (s.t1! - s.t0!) || 1 }}
                  className={cn('rounded-[2px] transition-[background-color,height] duration-200', sel?.i === s.i ? 'h-1.5 bg-faint max-[760px]:h-2' : 'h-1 bg-edge max-[760px]:h-1.5')} />
              ))}
              <span className="pointer-events-none absolute top-1/2 -ml-1.5 -mt-1.5 size-3 rounded-full bg-ink shadow-[0_0_0_3px_rgba(9,9,11,.8)] max-[760px]:-ml-[9px] max-[760px]:-mt-[9px] max-[760px]:size-[18px]"
                style={{ left: `${total ? Math.min(100, (t / total) * 100) : 0}%` }} />
            </div>
            <button type="button" data-player-full onClick={full} aria-label="Full screen" title="Full screen"
              className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-sub transition-colors hover:bg-raised hover:text-ink max-[760px]:size-10">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
            </button>
          </div>
          <span className="whitespace-nowrap text-[11px] tabular-nums text-mute">
            <span className="text-ink-3">{fmtT(t)}</span>{sel?.t0 !== undefined && sel.t1 !== undefined ? ` · shot ${sel.label} runs ${fmtT(sel.t0)}–${fmtT(sel.t1)}` : total ? ` of ${fmtT(total)}` : ''}
          </span>
        </>
      )}
    </div>
  );
});
