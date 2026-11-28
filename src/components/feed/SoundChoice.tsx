'use client';
// A sound pick heard on the card, on the phone too. Each option: a round play button a thumb can hit, a ring that
// fills while it plays, and the sound's shape, lit as it plays and tapped to play from there; the app's one sound player
// plays it, so starting one stops any other. "In the film": the moment of the current cut where the sound sits, picture
// and all, with each option laid in its place (the harness renders the clip, server/edit/hear.ts); tap an option to
// switch at the same instant, so two are heard against each other on the same picture. The choice itself is the row's
// own tap, as on every pick: set aside, sent with Done picking.
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { HearMoment } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { onSoundStart, pauseSound, playSound, useSound } from '@/components/media/Sound';
import { useJson } from '@/components/pages/postCommon';
import { cn } from '@/lib/utils';
import { clock, spanIn } from './hearIt';

/** GET …/hear?card=: the files' shapes and lengths, where each moment's clip starts and ends, the option the cut has there. */
export interface HearData {
  peaks: Record<string, number[]>;
  seconds: Record<string, number>;
  moments: Record<string, { inCut?: string; start: number; end: number; capped?: true }>;
  cut: { version?: string; picture: { version: string; stale: boolean } | null } | null;
}
export const useHearData = (film: string, card: string): HearData | undefined =>
  useJson<HearData>(film && card ? `/api/films/${film}/hear?card=${encodeURIComponent(card)}` : undefined).data;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The round play button of one sound: 44 px, a ring that fills as it plays. `path` is relative to the film repo. */
export function RingPlay({ path, label, className }: { path: string; label: string; className?: string }) {
  const s = useSound(mediaUrl(path));
  const frac = s.d ? Math.min(1, s.t / s.d) : 0;
  const C = 2 * Math.PI * 20;
  return (
    <button type="button" data-ring-play onClick={(e) => { e.stopPropagation(); playSound(path); }} aria-label={`${s.playing ? 'Pause' : 'Play'} ${label}`} aria-pressed={s.playing}
      className={cn('relative flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink transition-colors duration-200 hover:bg-raised active:scale-95 motion-reduce:active:scale-100', s.playing && 'bg-raised', className)}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r="20" fill="none" strokeWidth="1.5" className={cn('transition-colors duration-200', s.src ? 'stroke-sub' : 'stroke-edge-strong')} />
        <circle cx="22" cy="22" r="20" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-ink transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ opacity: s.src ? 1 : 0 }} />
      </svg>
      {s.playing
        ? <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="relative duration-150 animate-in zoom-in-75 motion-reduce:animate-none"><rect x="1.5" y="1" width="2.5" height="8" rx="0.6" /><rect x="6" y="1" width="2.5" height="8" rx="0.6" /></svg>
        : <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="relative ml-0.5 duration-150 animate-in zoom-in-75 motion-reduce:animate-none"><path d="M2 1l7 4-7 4z" /></svg>}
    </button>
  );
}

/** 96 peaks drawn as 48 bars. */
const bars = (peaks?: number[]): number[] => {
  if (!peaks?.length) return Array.from({ length: 48 }, () => 0.12);
  const n = 48, k = peaks.length / n, top = Math.max(0.05, ...peaks);
  return Array.from({ length: n }, (_, i) => Math.max(0.08, Math.max(...peaks.slice(Math.floor(i * k), Math.max(Math.floor(i * k) + 1, Math.floor((i + 1) * k)))) / top));
};

/** The sound's shape: lit up to where it plays, a tap plays it from there. Its length (or the time) at the end. */
export function Wave({ path, peaks, seconds, label, className }: { path: string; peaks?: number[]; seconds?: number; label: string; className?: string }) {
  const s = useSound(mediaUrl(path));
  const frac = s.d ? Math.min(1, s.t / s.d) : 0;
  const bs = bars(peaks);
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span role="slider" tabIndex={0} aria-label={`Play ${label} from a place`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} data-wave
        onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); playSound(path, Math.min(0.98, Math.max(0, (e.clientX - r.left) / r.width))); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playSound(path); } }}
        className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-[2px]">
        {bs.map((h, i) => (
          <span key={i} aria-hidden="true" style={{ height: `${Math.round(h * 100)}%` }}
            className={cn('min-w-px flex-1 rounded-full transition-colors duration-200', s.src && (i + 0.5) / bs.length <= frac ? 'bg-ink' : s.src ? 'bg-sub' : 'bg-edge-strong')} />
        ))}
      </span>
      <span className="w-[76px] flex-none whitespace-nowrap text-right font-mono text-[10.5px] tabular-nums text-sub">
        {s.src && s.d ? `${mmss(s.t)} / ${mmss(s.d)}` : seconds !== undefined ? `${seconds.toFixed(1)} s` : ''}
      </span>
    </span>
  );
}

/** The row's "In the film" button: 40 px, a frame of film; the words beside it on a wide screen. */
export function FilmButton({ label, on, onClick }: { label: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" data-film-button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={`Hear ${label} in the film`} aria-pressed={!!on}
      className={cn('flex h-10 flex-none cursor-pointer items-center gap-1.5 rounded-lg border bg-transparent px-2.5 text-[12px] text-ink-2 transition-colors duration-200 hover:bg-raised hover:text-ink', on ? 'border-sub text-ink' : 'border-edge')}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M5 2.5v11M11 2.5v11M2 6h3M2 10h3M11 6h3M11 10h3" /></svg>
      <span className="max-[560px]:hidden">In the film</span>
    </button>
  );
}

export interface HearHandle { play: (option: string) => void }
interface Opt { id: string; label: string }

/** Three bars that pulse while the film plays (still with reduced motion). */
const Playing = () => (
  <span aria-hidden="true" className="flex h-2.5 items-end gap-[2px]">
    {[60, 100, 75].map((h, i) => <span key={i} className="w-[2px] rounded-full bg-current motion-safe:animate-[hh-pulse_0.9s_ease-in-out_infinite]" style={{ height: `${h}%`, animationDelay: `${i * 0.2}s` }} />)}
  </span>
);

/** Every "In the film" player of the page but `v` stops: one thing plays at a time, across the cards too. */
const stopOtherFilms = (v: HTMLVideoElement): void =>
  document.querySelectorAll<HTMLVideoElement>('video[data-hear-video]').forEach((x) => { if (x !== v && !x.paused) x.pause(); });

type FilmState = { playing: boolean; waiting: boolean; t: number; d: number; err?: string };
const REST: FilmState = { playing: false, waiting: false, t: 0, d: 0 };

/** "In the film": a moment of the cut with each option laid in. One <video> for the card, with its own play button,
 *  a bar to seek by click or drag, and the time.
 *  Tapping an option sets its clip at the same instant, playing on when it played (in the tap, as an iPhone needs);
 *  the play button, a tap on the picture and Space (the panel focused) play and pause it. Full screen shows the whole
 *  picture, fitted on black, with the same controls. */
export function HearInFilm({ film, card, moments, options, data, toRepo, prediction, chosen, ref }: {
  film: string; card: string; moments: HearMoment[]; options: Opt[]; data?: HearData; toRepo: (rel: string) => string;
  prediction?: string; chosen?: string; ref?: Ref<HearHandle>;
}) {
  const [mid, setMid] = useState(moments[0]?.id);
  const m = moments.find((x) => x.id === mid) ?? moments[0];
  const [active, setActive] = useState<string>();     // the option whose clip is loaded ('' = without)
  const [st, setSt] = useState<FilmState>(REST);
  const [fs, setFs] = useState(false);                // the picture is full screen
  const vid = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const here = m ? options.filter((o) => m.places[o.id]) : [];
  const info = m ? data?.moments[m.id] : undefined;
  const win = info ?? (m ? { start: Math.max(0, m.at - 2), end: m.ends + 2, capped: undefined } : { start: 0, end: 1, capped: undefined });
  const D = win.end - win.start;
  // what the play button plays before an option is tapped: the one in the cut, else the first
  const first = (info?.inCut && m?.places[info.inCut] ? info.inCut : here[0]?.id) ?? '';
  const url = (opt: string, moment = m) => `/api/films/${film}/hear?card=${encodeURIComponent(card)}&moment=${encodeURIComponent(moment!.id)}&option=${encodeURIComponent(opt)}`;

  // the other players stop this one, and this one stops them
  useEffect(() => onSoundStart(() => vid.current?.pause()), []);
  useEffect(() => () => vid.current?.pause(), []);
  useEffect(() => {
    const f = () => setFs(!!stage.current && document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  // the clips of this moment made ahead, one after another, so a tap plays at once
  useEffect(() => {
    if (!m) return;
    let live = true;
    void (async () => {
      for (const o of ['', ...here.map((x) => x.id)]) {
        if (!live) return;
        await fetch(`${url(o)}&warm=1`).catch(() => undefined);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film, card, m?.id]);

  const start = useCallback((v: HTMLVideoElement) => {
    pauseSound();
    stopOtherFilms(v);
    void v.play().catch((e: unknown) => setSt((p) => ({ ...p, waiting: false, ...(e instanceof DOMException && e.name === 'AbortError' ? {} : { err: 'The browser did not start it. Press play again.' }) })));
  }, []);

  /** Loads `opt`'s clip of the moment at `at` (seconds into the clip) and plays it, or leaves it paused there. */
  const load = useCallback((opt: string, moment: HearMoment | undefined, o: { at?: number; play: boolean }) => {
    const v = vid.current;
    if (!v || !moment) return;
    const src = `/api/films/${film}/hear?card=${encodeURIComponent(card)}&moment=${encodeURIComponent(moment.id)}&option=${encodeURIComponent(opt)}`;
    setActive(opt);
    if (v.getAttribute('src') === src) {
      if (o.at !== undefined) v.currentTime = o.at;
      if (o.play && v.paused) start(v);
      return;
    }
    setSt((p) => ({ ...p, waiting: true, err: undefined, t: o.at ?? 0 }));
    v.preload = 'auto';
    v.src = src;
    if (o.at) { const at = o.at; v.addEventListener('loadedmetadata', () => { v.currentTime = at; }, { once: true }); }
    if (o.play) start(v);
  }, [film, card, start]);

  /** Play or pause; before any option was tapped, the one in the cut (else the first). */
  const toggle = useCallback(() => {
    const v = vid.current;
    if (!v || !m) return;
    if (!v.getAttribute('src')) { load(active ?? first, m, { play: true }); return; }
    if (v.paused) start(v); else v.pause();
  }, [m, active, first, load, start]);

  /** An option tapped: its clip at the same instant, playing on when it played (and when nothing was heard yet). A tap
   *  on the option heard now plays it when paused; it never pauses (the play button does). */
  const choose = useCallback((opt: string, moment = m) => {
    const v = vid.current;
    if (!v || !moment) return;
    const loaded = !!v.getAttribute('src') && moment.id === m?.id;
    if (loaded && opt === active) { if (v.paused) start(v); return; }
    const mid = loaded && !v.ended && v.currentTime > 0.05;
    load(opt, moment, { at: mid ? v.currentTime : undefined, play: !(mid && v.paused) });
  }, [m, active, load, start]);

  /** The bar: a fraction of the clip. Before anything is loaded, the clip is loaded there, paused. */
  const seek = useCallback((frac: number) => {
    const v = vid.current;
    if (!v || !m) return;
    const len = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : D;
    const at = Math.max(0, Math.min(len - 0.05, frac * len));
    if (!v.getAttribute('src')) load(active ?? first, m, { at, play: false });
    else v.currentTime = at;
    setSt((p) => ({ ...p, t: at }));
  }, [m, D, active, first, load]);

  useImperativeHandle(ref, () => ({
    play: (opt: string) => {
      // the moment shown, when the option is laid there; else the first one it is laid at
      const at = m?.places[opt] ? m : moments.find((x) => x.places[opt]);
      if (!at) return;
      if (at.id !== m?.id) { setMid(at.id); setSt(REST); load(opt, at, { play: true }); }
      else { const v = vid.current; if (v && opt === active && !v.paused) return; choose(opt, at); if (v?.paused && v.getAttribute('src')) start(v); }
      box.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
  }), [m, moments, active, load, choose, start]);

  // a landscape film's picture: its box takes the shape of the cut's 480p, read off a still of it
  const [wideRatio, setWideRatio] = useState<number>();
  const shapeSrc = data?.cut?.picture ? mediaUrl(toRepo(`cut/renders/${data.cut.picture.version}-proxy.mp4`), { w: 320, t: 0 }) : undefined;
  useEffect(() => {
    if (!shapeSrc) return;
    const im = new Image();
    im.onload = () => { const r = im.naturalWidth / im.naturalHeight; setWideRatio(r > 1 ? r : undefined); };
    im.src = shapeSrc;
  }, [shapeSrc]);

  if (!m) return null;
  const full = () => {
    const el = stage.current;
    const v = vid.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el || !v) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => undefined); return; }
    if (!v.getAttribute('src')) load(active ?? first, m, { play: true });
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  };
  const span = spanIn(m, win);
  const len = st.d || D;
  const head = len ? Math.min(1, st.t / len) : 0;
  const pic = data?.cut?.picture;
  const poster = pic ? mediaUrl(toRepo(`cut/renders/${pic.version}-proxy.mp4`), { w: 320, t: Math.max(0, m.at) }) : undefined;
  const pl = active ? m.places[active] : undefined;
  const pills: { id: string; label: string }[] = [...here, { id: '', label: 'Without' }];
  const C = 2 * Math.PI * 20;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== ' ' || e.altKey || e.ctrlKey || e.metaKey) return;
    // a button keeps its own Space, but an option's: Space plays and pauses wherever the panel has focus
    if ((e.target as HTMLElement).closest('button:not([role="radio"])')) return;
    e.preventDefault();
    toggle();
  };
  const bar = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); };

  const chips = (
    <div role="radiogroup" aria-label="Which option plays in the film" className="flex flex-wrap gap-1.5">
      {pills.map((o) => {
        const on = active === o.id;
        const inCut = !!o.id && info?.inCut === o.id;
        return (
          <button key={o.id || 'without'} type="button" role="radio" aria-checked={on} data-hear-option={o.id || 'without'} onClick={() => choose(o.id)}
            className={cn('flex h-10 min-w-[64px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-[12.5px] transition-colors duration-200',
              on ? 'border-ink bg-ink text-bg' : o.id ? 'border-edge bg-transparent text-ink hover:bg-raised' : 'border-dashed border-edge bg-transparent text-ink-2 hover:bg-raised')}>
            {on && st.playing ? <Playing /> : null}
            <span className="whitespace-nowrap">{o.label}</span>
            {o.id && o.id === chosen && <span aria-label="chosen" className={cn('size-1.5 rounded-full', on ? 'bg-bg' : 'bg-ink')} />}
            {inCut && <span className={cn('rounded-[3px] px-1 text-[9.5px] font-semibold uppercase tracking-wide', on ? 'bg-bg/15 text-bg' : 'bg-raised text-sub')}>cut</span>}
            {o.id && o.id === prediction && !inCut && <span className={cn('text-[9.5px] font-semibold', on ? 'text-bg/70' : 'text-sub')}>Alma</span>}
          </button>
        );
      })}
    </div>
  );
  // the play button (the options' ring, filling as the clip plays), the clip as a bar (where the sound comes in and
  // goes, and the playhead; click or drag to go there) and the time
  const transport = (
    <div className="flex min-w-0 items-center gap-2.5">
      <button type="button" data-hear-play onClick={toggle} aria-label={st.waiting ? 'Preparing this moment' : st.playing ? 'Pause the film' : 'Play the film'} aria-pressed={st.playing}
        className={cn('relative flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink transition-colors duration-200 hover:bg-raised active:scale-95 motion-reduce:active:scale-100', st.playing && 'bg-raised')}>
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0 -rotate-90">
          <circle cx="22" cy="22" r="20" fill="none" strokeWidth="1.5" className={cn('transition-colors duration-200', active !== undefined ? 'stroke-sub' : 'stroke-edge-strong')} />
          <circle cx="22" cy="22" r="20" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-ink transition-[stroke-dashoffset,opacity] duration-300 ease-linear motion-reduce:transition-none"
            strokeDasharray={C} strokeDashoffset={C * (1 - head)} style={{ opacity: active !== undefined && !st.waiting ? 1 : 0 }} />
        </svg>
        {st.waiting
          ? <span data-hear-preparing aria-hidden="true" className="relative size-4 rounded-full border-2 border-sub/40 border-t-ink duration-200 animate-in fade-in-0 motion-safe:animate-spin" />
          : st.playing
            ? <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="relative duration-150 animate-in zoom-in-75 motion-reduce:animate-none"><rect x="1.5" y="1" width="2.5" height="8" rx="0.6" /><rect x="6" y="1" width="2.5" height="8" rx="0.6" /></svg>
            : <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="relative ml-0.5 duration-150 animate-in zoom-in-75 motion-reduce:animate-none"><path d="M2 1l7 4-7 4z" /></svg>}
      </button>
      <div role="slider" tabIndex={0} aria-label="Position in the clip" aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(st.t)} aria-valuetext={`${mmss(st.t)} of ${mmss(len)}`} data-hear-strip
        onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); bar(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) bar(e); }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); seek((st.t + (e.key === 'ArrowRight' ? 1 : -1)) / len); } }}
        className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none select-none">
        <span className="absolute inset-x-0 top-[15px] h-0.5 rounded-full bg-edge-strong" />
        <span className="absolute top-[11px] h-2.5 rounded-[3px] bg-sub/45" style={{ left: `${span.left * 100}%`, width: `${span.width * 100}%` }} />
        <span className="absolute top-[15px] h-0.5 rounded-full bg-ink" style={{ width: `${head * 100}%` }} />
        <span className="absolute top-[9px] h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink transition-opacity duration-200" style={{ left: `${head * 100}%`, opacity: active !== undefined ? 1 : 0 }} />
      </div>
      <span data-hear-time className="w-[72px] flex-none whitespace-nowrap text-right font-mono text-[10.5px] tabular-nums text-sub">{mmss(st.t)} / {mmss(len)}</span>
    </div>
  );

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKey} data-hear-film className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-line bg-panel p-3 outline-none duration-300 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-medium text-ink">In the film</span>
        <span className="text-[12px] text-sub">each option laid in its place; tap one, then another, to hear them on the same picture</span>
      </div>
      {moments.length > 1 && (
        <div role="tablist" aria-label="Where in the film" className="-mx-0.5 flex min-w-0 gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none]">
          {moments.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === m.id} data-moment={x.id}
              onClick={() => { if (x.id === m.id) return; vid.current?.pause(); vid.current?.removeAttribute('src'); vid.current?.load(); setActive(undefined); setSt(REST); setMid(x.id); }}
              className={cn('flex h-8 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] transition-colors duration-200', x.id === m.id ? 'border-ink bg-ink text-bg' : 'border-edge bg-transparent text-ink-2 hover:bg-raised')}>
              {x.label}<span className={cn('font-mono text-[10.5px] tabular-nums', x.id === m.id ? 'text-bg/70' : 'text-sub')}>{clock(x.at)}</span>
            </button>
          ))}
        </div>
      )}
      {/* the picture beside the options, the play button and the line; on a phone the play button and the line run the
          panel's whole width under them */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto_1fr] gap-x-3 gap-y-2">
        {/* the picture; full screen, the whole of it fitted on black, the options and the play button over its foot */}
        <div ref={stage} data-hear-stage className={cn('relative row-span-3 self-start max-[560px]:row-span-1', fs ? 'flex h-full w-full items-center justify-center bg-black' : wideRatio ? 'w-[184px] min-[761px]:w-[234px]' : 'w-[104px] min-[761px]:w-[132px]')}>
          <video ref={vid} data-hear-video playsInline preload="none" poster={poster} aria-label={`The film at ${clock(m.at)}`}
            onPlay={(e) => { stopOtherFilms(e.currentTarget); setSt((p) => ({ ...p, playing: true, err: undefined })); }}
            onPause={() => setSt((p) => ({ ...p, playing: false, waiting: false }))}
            onWaiting={() => setSt((p) => ({ ...p, waiting: true }))} onPlaying={() => setSt((p) => ({ ...p, waiting: false, playing: true }))}
            onLoadedData={(e) => { if (e.currentTarget.paused) setSt((p) => ({ ...p, waiting: false })); }}
            onSeeked={(e) => { const v = e.currentTarget; setSt((p) => ({ ...p, t: v.currentTime })); }}
            onDurationChange={(e) => { const v = e.currentTarget; if (Number.isFinite(v.duration)) setSt((p) => ({ ...p, d: v.duration })); }}
            onTimeUpdate={(e) => { const v = e.currentTarget; setSt((p) => ({ ...p, t: v.currentTime, d: Number.isFinite(v.duration) ? v.duration : p.d })); }}
            onEnded={() => setSt((p) => ({ ...p, playing: false }))}
            onError={(e) => {
              const src = e.currentTarget.getAttribute('src');
              if (!src) return;
              setSt((p) => ({ ...p, waiting: false, playing: false, err: 'The clip could not be made.' }));
              // the route's own words, when it says why
              void fetch(`${src}&warm=1`).then((r) => (r.ok ? undefined : r.json())).then((j: { error?: string } | undefined) => {
                if (j?.error && vid.current?.getAttribute('src') === src) setSt((p) => ({ ...p, err: `The clip could not be made: ${j.error}` }));
              }).catch(() => undefined);
            }}
            onClick={toggle}
            className={cn('block cursor-pointer bg-black [&:fullscreen]:object-contain', fs ? 'h-full w-full object-contain' : 'aspect-[9/16] w-full rounded-[6px] border border-edge object-cover')} style={!fs && wideRatio ? { aspectRatio: String(wideRatio) } : undefined} />
          <button type="button" onClick={full} aria-label={fs ? 'Leave full screen' : 'Full screen'} data-hear-full
            className={cn('absolute flex cursor-pointer items-center justify-center rounded-md border-0 bg-black/55 p-0 text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-black/75', fs ? 'right-4 top-4 size-10' : 'right-1 top-1 size-7')}>
            {fs
              ? <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4.5 1.5v3h-3M7.5 1.5v3h3M4.5 10.5v-3h-3M7.5 10.5v-3h3" /></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M1.5 4.5v-3h3M10.5 4.5v-3h-3M1.5 7.5v3h3M10.5 7.5v3h-3" /></svg>}
          </button>
          {st.waiting && !fs && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[6px] bg-black/35 duration-200 animate-in fade-in-0">
              <span className="size-5 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />
            </span>
          )}
          {fs && (
            <div data-hear-fs-controls className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[720px] flex-col gap-2.5 rounded-t-xl bg-black/70 p-4 backdrop-blur-sm duration-300 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
              {chips}
              {transport}
            </div>
          )}
        </div>
        {chips}
        <div className="min-w-0 max-[560px]:col-span-2">{transport}</div>
        <p data-hear-line className="m-0 self-start text-[11.5px] leading-snug tabular-nums text-sub max-[560px]:col-span-2">
            {st.err ? <span role="alert" className="text-bad">{st.err}</span> : st.waiting ? <span className="duration-200 animate-in fade-in-0">Preparing this moment…</span> : <>
              {info?.capped ? 'the first minute of it in the film, ' : ''}{clock(win.start)} to {clock(win.end)}{data?.cut?.version ? ` of ${data.cut.version}` : ''}; the sound at {clock(m.at)}
              {pl?.gainDb !== undefined ? ` · ${pl.gainDb < 0 ? '−' : ''}${Math.abs(pl.gainDb)} dB` : ''}
              {active === '' ? ' · without it, as the cut would be' : ''}
              {pic?.stale ? ` · picture of ${pic.version}, the newest 480p` : ''}
            </>}
        </p>
      </div>
    </div>
  );
}
