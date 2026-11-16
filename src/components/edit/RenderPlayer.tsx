'use client';
// A rendered file played in the Edit page's own player (14 Nov 2026, ASKS 39: "when I click render master, I want
// that to be in the same view"): the file's own picture and its own sound, the thing that would be delivered, not
// the live mix of the tracks. The page still owns the playhead and the rate: forward, the file's clock drives the
// playhead; paused, a click or a drag on the ruler moves the file; backwards (J) the playhead walks and the file
// seeks. A sound file plays with no picture: its name on black.
import { useEffect, useRef, useState } from 'react';

export function RenderPlayer({ url, path, sound, name, fps, frame, rate, onFrame, onEnd, className }: {
  /** The file's /api/media address. */
  url: string;
  /** Its path, for the tests and the title. */
  path: string;
  sound: boolean;
  /** What it is, shown on the blank picture of a sound file. */
  name: string;
  fps: number;
  frame: number;
  rate: number;
  onFrame: (f: number) => void;
  onEnd: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onFrame, onEnd, frame, rate });
  useEffect(() => { cb.current = { onFrame, onEnd, frame, rate }; });
  // until the file has loaded and been moved to the playhead it does not drive the playhead (as the phone's 480p player)
  const ready = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (rate > 0) {
      v.playbackRate = rate;
      if (ready.current) void v.play().catch(() => undefined);
    } else v.pause();
    if (rate === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!ready.current) { raf = requestAnimationFrame(tick); return; }
      const end = Number.isFinite(v.duration) ? v.duration * fps : Infinity;
      let f: number;
      if (rate > 0) f = Math.round(v.currentTime * fps);
      else {
        f = Math.max(0, cb.current.frame + rate * dt * fps);
        v.currentTime = f / fps;
      }
      cb.current.onFrame(f);
      if ((rate > 0 && (v.ended || f >= end)) || (rate < 0 && f <= 0)) { cb.current.onEnd(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate, fps]);

  // paused: the playhead moved by the ruler, a key or a marker; the file follows it (by time)
  useEffect(() => {
    const v = ref.current;
    if (!v || rate !== 0 || !ready.current) return;
    const t = Math.min(frame / fps, Number.isFinite(v.duration) ? v.duration : Infinity);
    if (Math.abs(v.currentTime - t) * fps >= 0.5) v.currentTime = t;
  }, [frame, rate, fps]);

  return (
    <span className={className} style={{ position: 'absolute', inset: 0 }}>
      <video ref={ref} src={url} data-render={path} playsInline preload="auto" title={path.split('/').pop()}
        className={`absolute inset-0 size-full bg-black object-contain transition-opacity duration-200 ${sound ? 'opacity-0' : 'opacity-100'}`}
        onEnded={() => cb.current.onEnd()}
        onError={() => setFailed(true)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          v.currentTime = Math.min(cb.current.frame / fps, Number.isFinite(v.duration) ? v.duration : Infinity);
          ready.current = true;
          setFailed(false);
          if (cb.current.rate > 0) { v.playbackRate = cb.current.rate; void v.play().catch(() => undefined); }
        }} />
      {(sound || failed) && (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center duration-200 animate-in fade-in-0">
          {sound && !failed && <SoundMark className="text-sub" />}
          <span className="text-[12px] leading-snug text-ink-3">{failed ? 'This file could not be played here. Download it to watch it.' : name}</span>
        </span>
      )}
    </span>
  );
}

/** A plain mark for a sound file (no made-up waveform). */
export function SoundMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  );
}
