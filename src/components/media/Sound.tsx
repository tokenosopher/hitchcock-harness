'use client';
// Sound in the pages: one player for the whole app, so only one thing plays at a time. A row shows a round
// play button and, while it is the one playing, a thin line that fills and takes a click to seek. Nothing
// loads until the button is pressed (the media route streams with byte ranges).
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { mediaUrl } from './Media';

interface Now { src: string; playing: boolean; t: number; d: number; failed?: boolean }
const IDLE: Now = { src: '', playing: false, t: 0, d: 0 };
let now: Now = IDLE;
let audio: HTMLAudioElement | undefined;
const subs = new Set<() => void>();
const set = (p: Partial<Now>) => { now = { ...now, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function player(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'none';
  a.addEventListener('timeupdate', () => set({ t: a.currentTime }));
  a.addEventListener('durationchange', () => set({ d: Number.isFinite(a.duration) ? a.duration : 0 }));
  a.addEventListener('play', () => set({ playing: true, failed: false }));
  a.addEventListener('pause', () => set({ playing: false }));
  a.addEventListener('ended', () => set({ playing: false, t: 0 }));
  a.addEventListener('error', () => set({ playing: false, failed: true }));
  audio = a;
  return a;
}

// Other players of the page (a sound card's clip of the film): told to stop when a sound starts, so only one
// thing plays at a time; pauseSound stops the sound when one of them starts.
const others = new Set<() => void>();
export function onSoundStart(stop: () => void): () => void { others.add(stop); return () => { others.delete(stop); }; }
export function pauseSound(): void { if (audio && !audio.paused) audio.pause(); }

function toggle(src: string, at?: number) {
  const a = player();
  others.forEach((f) => f());
  if (now.src !== src) {
    a.src = src;
    set({ src, t: 0, d: 0, failed: false });
    if (at) { const go = () => { if (a.duration) a.currentTime = at * a.duration; }; a.addEventListener('loadedmetadata', go, { once: true }); }
    void a.play().catch(() => set({ playing: false }));
  } else if (at !== undefined && a.duration) { a.currentTime = at * a.duration; if (a.paused) void a.play().catch(() => set({ playing: false })); }
  else if (a.paused) void a.play().catch(() => set({ playing: false }));
  else a.pause();
}

/** Plays this file (from `at`, a fraction of it, when given), or pauses it when it plays and no place is given. */
export const playSound = (path: string, at?: number): void => toggle(mediaUrl(path), at);

// The play buttons drawn now, per file. When the last button of the file that plays goes (the page was left, the
// card was folded away), the sound stops: it played on with no control anywhere on screen to stop it.
const drawn = new Map<string, number>();
function useDrawn(src: string): void {
  useEffect(() => {
    drawn.set(src, (drawn.get(src) ?? 0) + 1);
    return () => {
      const n = (drawn.get(src) ?? 1) - 1;
      if (n > 0) { drawn.set(src, n); return; }
      drawn.delete(src);
      // a moment later, so a button drawn again at once (a list re-sorting) keeps it playing
      setTimeout(() => { if (!drawn.has(src) && now.src === src && audio && !audio.paused) audio.pause(); }, 100);
    };
  }, [src]);
}

/** This file's player state, or the idle one while something else (or nothing) plays. */
export function useSound(src: string): Now {
  return useSyncExternalStore(subscribe, () => (now.src === src ? now : IDLE), () => IDLE);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The round play button for one sound file; `path` is relative to the film repo (as for Media). */
export function PlayButton({ path, label, className }: { path: string; label: string; className?: string }) {
  const src = mediaUrl(path);
  const s = useSound(src);
  useDrawn(src);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); toggle(src); }} aria-label={`${s.playing ? 'Pause' : 'Play'} ${label}`} aria-pressed={s.playing}
      className={cn('flex size-8 flex-none cursor-pointer items-center justify-center rounded-full border bg-transparent p-0 text-ink hover:bg-raised', s.src ? 'border-ink' : 'border-edge-strong', className)}>
      {s.playing
        ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1" width="2.5" height="8" rx="0.5" /><rect x="6" y="1" width="2.5" height="8" rx="0.5" /></svg>
        : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className="ml-px"><path d="M2 1l7 4-7 4z" /></svg>}
    </button>
  );
}

/** The line that fills while this file plays, with the time; nothing while it does not. Click to seek. */
/** `idle`: while another file (or none) plays, a quiet line in its place, with the file's length when known (as drawn). */
export function PlayLine({ path, className, idle, seconds }: { path: string; className?: string; idle?: boolean; seconds?: number }) {
  const s = useSound(mediaUrl(path));
  if (!s.src) return !idle ? null : (
    <span className={cn('flex items-center gap-2', className)} aria-hidden="true">
      <span className="h-0.5 min-w-0 flex-1 rounded-full bg-edge-strong" />
      {seconds !== undefined && <span className="flex-none font-mono text-[10.5px] tabular-nums text-sub">{clock(seconds)}</span>}
    </span>
  );
  if (s.failed) return <span role="alert" className={cn('text-[11.5px] text-bad', className)}>This file did not play</span>;
  const frac = s.d ? Math.min(1, s.t / s.d) : 0;
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span role="slider" tabIndex={0} aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(s.d)} aria-valuenow={Math.round(s.t)}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (audio && s.d) audio.currentTime = ((e.clientX - r.left) / r.width) * s.d; }}
        onKeyDown={(e) => { if (!audio) return; if (e.key === 'ArrowRight') audio.currentTime = Math.min(s.d, audio.currentTime + 5); if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5); }}
        className="relative block h-3 min-w-0 flex-1 cursor-pointer">
        <span className="absolute inset-x-0 top-[5px] h-0.5 rounded-full bg-edge-strong" />
        <span className="absolute left-0 top-[5px] h-0.5 rounded-full bg-ink" style={{ width: `${frac * 100}%` }} />
      </span>
      <span className="flex-none font-mono text-[10.5px] tabular-nums text-sub">{clock(s.t)}{s.d ? ` / ${clock(s.d)}` : ''}</span>
    </span>
  );
}
