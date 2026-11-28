'use client';
// The take beside the shot in the cut: two players on one clock, one play button, one scrub bar. The left
// (on the phone, the top) is the take that came back, whole; the right is what the cut plays at the place it stands for
// now, piece after piece (a shot the take would replace can be two clips). Only this pair loads; nothing else plays.
// The sound is one side's at a time ("Hear: New take · The cut"), the new take's first. A side that has run out holds
// its last frame while the other plays on.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { zoomItems } from '@/components/media/Lightbox';
import { IconPlay } from '@/components/shell/icons';
import { cn } from '@/lib/utils';

/** A stretch of a file: `from`..`to` seconds of `src` (repo-relative). */
export interface Seg { src: string; from: number; to: number }
export interface PairHandle { toggle: () => void; stop: () => void }

const lenOf = (segs: Seg[]) => segs.reduce((n, s) => n + Math.max(0, s.to - s.from), 0);
/** Where clock `t` falls in a chain: the piece and the time in its file; `end` past its end. */
function at(segs: Seg[], t: number): { k: number; time: number; end: boolean } {
  let start = 0;
  for (let k = 0; k < segs.length; k++) {
    const len = Math.max(0, segs[k].to - segs[k].from);
    if (t < start + len - 1e-3) return { k, time: segs[k].from + Math.max(0, t - start), end: false };
    start += len;
  }
  const k = Math.max(0, segs.length - 1);
  return { k, time: segs[k] ? Math.max(segs[k].from, segs[k].to - 0.04) : 0, end: true };
}
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

function Side({ segs, label, sub, muted, vref, boxStyle, empty }: { segs: Seg[]; label: string; sub?: string; muted: boolean; vref: React.RefObject<HTMLVideoElement | null>; boxStyle: React.CSSProperties; empty?: string }) {
  const first = segs[0];
  const poster = first ? mediaUrl(first.src, { w: 640, t: Math.max(0.05, first.from + 0.05) }) : undefined;
  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div className="relative max-w-full overflow-hidden rounded-[10px] border border-edge bg-well" style={boxStyle}>
        {first ? (
          <video ref={vref} src={mediaUrl(first.src)} poster={poster} muted={muted} playsInline preload="metadata" className="absolute inset-0 size-full object-contain"
            onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.currentTime < first.from) v.currentTime = first.from; }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[12.5px] leading-normal text-sub">{empty ?? 'Nothing here'}</div>
        )}
        <span className="pointer-events-none absolute left-2 top-2 rounded-[5px] bg-[rgba(9,9,11,0.78)] px-1.5 py-0.5 text-[11px] font-medium text-ink">{label}</span>
        {!muted && first && <span className="pointer-events-none absolute right-2 top-2 rounded-[5px] bg-[rgba(9,9,11,0.78)] px-1.5 py-0.5 text-[10.5px] text-ink-3 duration-200 animate-in fade-in-0">sound</span>}
      </div>
      {sub && <figcaption className="max-w-full truncate self-stretch text-center text-[11.5px] text-sub" title={sub}>{sub}</figcaption>}
    </figure>
  );
}

export const PairPlayer = forwardRef<PairHandle, {
  a: Seg[]; b: Seg[]; labelA: string; labelB: string; subA?: string; subB?: string; emptyB?: string;
  /** The film's frame as CSS aspect-ratio ("16 / 9"); `stacked`: one above the other (the phone). */
  ratio: string; stacked?: boolean; tall?: boolean; onPlayed?: () => void;
}>(function PairPlayer({ a, b, labelA, labelB, subA, subB, emptyB, ratio, stacked, tall, onPlayed }, ref) {
  const va = useRef<HTMLVideoElement>(null);
  const vb = useRef<HTMLVideoElement>(null);
  const lenA = lenOf(a), lenB = lenOf(b);
  const total = Math.max(lenA, lenB, 0.1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hear, setHear] = useState<'a' | 'b'>('a');
  const tRef = useRef(0);
  const run = useRef<{ start: number; t0: number; raf: number } | undefined>(undefined);

  /** Puts each side where clock `t` says; `play`: and lets it run (a side past its end pauses on its last frame). */
  const place = useCallback((time: number, play: boolean, force = false) => {
    for (const [v, segs] of [[va.current, a], [vb.current, b]] as const) {
      if (!v || !segs.length) continue;
      const p = at(segs, time);
      const want = mediaUrl(segs[p.k].src);
      if (!v.src.endsWith(want)) { v.src = want; v.currentTime = p.time; }
      else if (force || Math.abs(v.currentTime - p.time) > 0.25) v.currentTime = p.time;
      if (play && !p.end) { if (v.paused) void v.play().catch(() => undefined); } else if (!v.paused) v.pause();
    }
  }, [a, b]);

  const stop = useCallback(() => {
    if (run.current) cancelAnimationFrame(run.current.raf);
    run.current = undefined;
    va.current?.pause(); vb.current?.pause();
    setPlaying(false);
  }, []);
  const start = useCallback(() => {
    if (run.current) return;
    let from = tRef.current >= total - 0.05 ? 0 : tRef.current;
    place(from, true, true);
    setPlaying(true);
    onPlayed?.();
    let last = performance.now();
    const tick = (now: number) => {
      if (!run.current) return;
      // the clock holds while a side that should be playing is still loading, so the two stay together
      const waiting = [[va.current, a], [vb.current, b]].some(([v, segs]) => {
        const vv = v as HTMLVideoElement | null, ss = segs as Seg[];
        return vv && ss.length && !at(ss, from).end && vv.readyState < 3;
      });
      if (!waiting) from += (now - last) / 1000;
      last = now;
      if (from >= total) { tRef.current = total; setT(total); place(total, false); stop(); return; }
      tRef.current = from;
      setT(from);
      place(from, true);
      run.current.raf = requestAnimationFrame(tick);
    };
    run.current = { start: performance.now(), t0: from, raf: requestAnimationFrame(tick) };
  }, [a, b, total, place, stop, onPlayed]);
  const toggle = useCallback(() => { if (run.current) stop(); else start(); }, [start, stop]);
  useImperativeHandle(ref, () => ({ toggle, stop }), [toggle, stop]);

  // another take is another player (the page keys it by the take): it starts at 0, stopped
  useEffect(() => () => { if (run.current) cancelAnimationFrame(run.current.raf); }, []);

  const seek = (x: number) => { tRef.current = x; setT(x); place(x, !!run.current, true); };
  const full = () => {
    stop();
    const items = [
      ...a.map((s) => ({ src: mediaUrl(s.src), alt: labelA, video: true, from: s.from, to: s.to })),
      ...b.map((s, i) => ({ src: mediaUrl(s.src), alt: `${labelB}${b.length > 1 ? ` · ${i + 1} of ${b.length}` : ''}`, video: true, from: s.from, to: s.to })),
    ];
    zoomItems(items, 0);
  };
  // a tall film (9:16): each picture as high as the view allows, its width from the frame; a wide one fills its half
  // (the width is what is set: a height with a ratio could be squeezed by a narrow column and lose its shape)
  const [rw, rh] = ratio.split('/').map((x) => Number(x.trim()));
  const r = rw > 0 && rh > 0 ? rw / rh : 9 / 16;
  const high = stacked ? 'min(36vh, 360px)' : 'min(56vh, 560px)';
  const boxStyle: React.CSSProperties = tall ? { aspectRatio: ratio, width: `min(100%, calc(${high} * ${r.toFixed(4)}))` } : { aspectRatio: ratio, width: '100%' };

  return (
    <div data-pair className="flex flex-col gap-2.5">
      <div className={cn('flex gap-2.5', stacked ? 'flex-col' : 'flex-row items-start')}>
        <Side segs={a} label={labelA} sub={subA} muted={hear !== 'a'} vref={va} boxStyle={boxStyle} />
        <Side segs={b} label={labelB} sub={subB} muted={hear !== 'b'} vref={vb} boxStyle={boxStyle} empty={emptyB} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={toggle} data-play-both aria-pressed={playing}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-bg transition-opacity duration-200 hover:opacity-90 max-[760px]:h-11">
          {playing ? <span aria-hidden="true" className="flex gap-[3px]"><span className="h-3 w-[3px] rounded-sm bg-bg" /><span className="h-3 w-[3px] rounded-sm bg-bg" /></span> : <IconPlay size={11} />}
          {playing ? 'Pause' : 'Play both'}<kbd className="ml-0.5 font-sans text-[11px] font-normal opacity-60 max-[760px]:hidden">Enter</kbd>
        </button>
        <input type="range" min={0} max={total} step={0.04} value={Math.min(t, total)} onChange={(e) => seek(Number(e.currentTarget.value))} aria-label="Where both play from"
          data-scrub className="h-9 min-w-[96px] flex-1 cursor-pointer accent-[#fafafa]" />
        <span data-clock className="flex-none whitespace-nowrap text-right font-mono text-[11.5px] tabular-nums text-sub">{clock(Math.min(t, total))} / {clock(total)}</span>
        <div role="radiogroup" aria-label="Hear" className="inline-flex h-8 flex-none items-center rounded-lg border border-edge p-0.5 text-[12px] max-[760px]:h-10">
          <span className="px-1.5 text-mute">Hear</span>
          {(['a', 'b'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={hear === k} onClick={() => setHear(k)} disabled={k === 'b' && !b.length}
              className={cn('h-full cursor-pointer rounded-md px-2 transition-colors duration-200 disabled:cursor-default disabled:opacity-40', hear === k ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>
              {k === 'a' ? 'New take' : 'The cut'}
            </button>
          ))}
        </div>
        <button type="button" onClick={full} className="inline-flex h-8 flex-none cursor-pointer items-center rounded-lg border border-edge px-2.5 text-[12px] text-ink-3 transition-colors duration-200 hover:bg-raised hover:text-ink max-[760px]:h-10">Full screen</button>
      </div>
    </div>
  );
});
