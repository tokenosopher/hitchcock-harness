'use client';
// "Pick any frame": scroll through the video to choose the cover frame, not only Alma's suggestions. The final itself, the same file the page shows, in a player with
// no controls of its own; a scrubber the user drags through the whole length, one frame per step; a frame back and a
// frame forward (and the arrow keys, Shift for a second); the timecode; Alma's offered frames as small marks on the
// scrubber; "Use this frame". The picture is the video element's own frame at each step, so nothing is rendered up
// front: a drag asks the element to seek and the next seek waits until the last one has landed. Works by touch (the
// scrubber's whole row is the target) and on desktop.
import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { Btn } from '@/components/shell/atoms';
import { IconChevronLeft, IconChevronRight } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import type { ThumbOption } from './file';
import { frameAt, frameCount, frameOf, timecode } from './frames';

/** When the final's own rate is not known (finalFacts could not read it): steps of a thirtieth of a second. */
const FALLBACK_FPS = 30;

export function FramePicker({ media, fps: knownFps, seconds, startAt, marks, word, phone, onUse, onCancel }: {
  media: string; fps?: number; seconds?: number; startAt: number; marks: ThumbOption[]; word: string; phone?: boolean;
  onUse: (at: number, frame: number, fps: number) => Promise<string | undefined>; onCancel: () => void;
}) {
  const fps = knownFps && knownFps > 0 ? knownFps : FALLBACK_FPS;
  const video = useRef<HTMLVideoElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const pending = useRef<number | undefined>(undefined);
  const [dur, setDur] = useState<number | undefined>(seconds);
  const [n, setN] = useState(() => frameOf(startAt, fps));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(9 / 16);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string>();
  const count = frameCount(dur ?? Math.max(startAt + 1, 1), fps);
  const last = count - 1;

  const seek = useCallback((k: number) => {
    const v = video.current;
    if (!v) return;
    const t = frameAt(k, fps);
    if (v.seeking) { pending.current = t; return; }
    v.currentTime = t;
  }, [fps]);
  const go = useCallback((k: number) => {
    const c = Math.min(Math.max(0, Math.round(k)), last);
    setN(c);
    setSaid(undefined);
    seek(c);
  }, [last, seek]);

  // the scrubber has the keys as soon as the picker opens (desktop), without scrolling the page to it
  useEffect(() => { if (!phone) range.current?.focus({ preventScroll: true }); }, [phone]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('button')) { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; }
    const step = e.shiftKey ? Math.round(fps) : 1;
    let to: number | undefined;
    if (e.key === 'ArrowLeft') to = n - step;
    else if (e.key === 'ArrowRight') to = n + step;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = last;
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
    if (to === undefined) return;
    // the page's own arrow keys move between platforms: not while the picker has them
    e.preventDefault();
    e.stopPropagation();
    go(to);
  };

  const use = async () => {
    if (busy) return;
    setBusy(true);
    const err = await onUse(frameAt(n, fps), n, fps);
    setBusy(false);
    setSaid(err);
  };

  const at = frameAt(n, fps);
  const pct = last > 0 ? (n / last) * 100 : 0;
  return (
    <div data-frame-picker role="group" aria-label={`Pick any frame as the ${word}`} onKeyDown={onKey}
      className={cn('flex flex-col gap-3 rounded-[10px] border border-edge p-3', phone ? 'items-stretch' : 'items-start')}>
      <div className={cn('flex w-full gap-4', phone ? 'flex-col items-center' : 'items-start')}>
        <div data-frame-view className={cn('relative flex-none overflow-hidden rounded-[9px] border border-edge-strong bg-[#111]', phone ? 'max-h-[52vh] w-[min(100%,230px)]' : 'h-[340px]')}
          style={{ aspectRatio: String(ratio) }}>
          {!failed && (
            <video ref={video} src={mediaUrl(media)} muted playsInline preload="auto" disablePictureInPicture
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (Number.isFinite(v.duration) && v.duration > 0) setDur(v.duration);
                if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
                v.currentTime = frameAt(Math.min(frameOf(startAt, fps), frameCount(v.duration || startAt + 1, fps) - 1), fps);
              }}
              onSeeked={(e) => {
                setReady(true);
                const t = pending.current;
                if (t !== undefined) { pending.current = undefined; e.currentTarget.currentTime = t; }
              }}
              onError={() => setFailed(true)}
              className={cn('absolute inset-0 size-full object-contain transition-opacity duration-200', ready ? 'opacity-100' : 'opacity-0')} />
          )}
          <span aria-live="polite" className={cn('absolute inset-0 grid place-items-center px-3 text-center text-[12px] text-sub transition-opacity duration-200', ready && !failed ? 'pointer-events-none opacity-0' : 'opacity-100')}>
            {failed ? 'The final could not be loaded here.' : 'Loading the final…'}
          </span>
        </div>

        <div className={cn('flex min-w-0 flex-col gap-3', phone ? 'w-full' : 'w-[260px] flex-none pt-1')}>
          <p className="m-0 text-[12px] leading-[1.45] text-sub">
            Drag through the final and stop on the frame you want. {phone ? 'Tap the arrows for one frame at a time.' : 'The arrow keys move one frame, with Shift one second.'}
          </p>
          <div className="flex items-center gap-2">
            <StepBtn label="One frame back" disabled={n <= 0} onClick={() => go(n - 1)} phone={phone}><IconChevronLeft size={13} /></StepBtn>
            <span data-frame-time className="flex min-w-0 flex-1 flex-col items-center leading-tight">
              <span className="text-[15px] font-medium tabular-nums text-ink">{timecode(at, knownFps)}</span>
              <span className="text-[11px] tabular-nums text-sub">frame {n + 1} of {count}{dur ? ` · ${timecode(dur, undefined).replace(/\.\d+$/, '')} long` : ''}</span>
            </span>
            <StepBtn label="One frame forward" disabled={n >= last} onClick={() => go(n + 1)} phone={phone}><IconChevronRight size={13} /></StepBtn>
          </div>
        </div>
      </div>

      {/* the scrubber: its whole row is the target; Alma's offered frames are the small marks above the line */}
      <div className="relative w-full">
        <div aria-hidden className="pointer-events-none absolute inset-x-[9px] top-[3px] h-2">
          {dur ? marks.map((m) => (
            <span key={m.id} title={m.does} className="absolute top-0 h-2 w-px bg-sub" style={{ left: `${Math.min(100, (m.at / dur) * 100)}%` }} />
          )) : null}
        </div>
        <input ref={range} type="range" data-frame-scrub min={0} max={last} step={1} value={Math.min(n, last)} aria-label="Where in the final"
          aria-valuetext={`${timecode(at, knownFps)}, frame ${n + 1} of ${count}`}
          onChange={(e) => go(Number(e.currentTarget.value))}
          style={{ ['--pct' as string]: `${pct}%` }}
          className={cn('frame-scrub block w-full cursor-pointer appearance-none bg-transparent', phone ? 'h-11' : 'h-8')} />
      </div>

      <div className={cn('flex w-full items-center gap-2', phone && 'flex-col-reverse items-stretch')}>
        <Btn ghost data-frame-cancel onClick={onCancel} className={cn('font-normal', phone && 'h-11 justify-center')}>Cancel</Btn>
        <Btn primary data-frame-use disabled={busy || failed || !ready} onClick={() => void use()} className={cn(phone ? 'h-11 justify-center' : 'ml-auto')}>
          {busy ? 'Saving…' : 'Use this frame'}
        </Btn>
      </div>
      {said && <p role="alert" className="m-0 text-[11.5px] leading-[1.45] text-warn duration-200 animate-in fade-in-0">{said}</p>}
    </div>
  );
}

function StepBtn({ label, disabled, onClick, phone, children }: { label: string; disabled: boolean; onClick: () => void; phone?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} data-frame-step={label.endsWith('back') ? 'back' : 'forward'}
      className={cn('grid flex-none cursor-pointer place-items-center rounded-lg border border-edge-strong bg-transparent text-ink-3 transition-[background-color,opacity] duration-150 hover:bg-raised active:bg-raised disabled:cursor-default disabled:opacity-40', phone ? 'size-11' : 'size-8')}>
      {children}
    </button>
  );
}
