'use client';
// The real picture or clip wherever the step-1 pages had a grey tile. Images and video posters come as
// WebP thumbnails from /api/media (&w=); a video plays in place on click with the native controls when
// `play` is set. The box (size and aspect) is the caller's, so each context keeps the board's look;
// the file only fills it (object-fit). A missing file shows the grey tile with the file's name.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { zoom, zoomVideo } from './Lightbox';

const VIDEO = /\.(mp4|mov|m4v)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif|pdf)$/i;  // a PDF shows its first page

/** The media route's URL for a path relative to the film repo ("assets/films/<slug>/…"). */
export function mediaUrl(path: string, opts: { w?: number; t?: number; retry?: number } = {}): string {
  const q = new URLSearchParams({ p: path });
  if (opts.w) q.set('w', String(opts.w));
  if (opts.w && opts.t !== undefined && VIDEO.test(path)) q.set('t', String(opts.t));
  if (opts.retry) q.set('r', String(opts.retry));
  return `/api/media?${q.toString()}`;
}

export const isVideoPath = (p?: string): boolean => !!p && VIDEO.test(p);
export const isImagePath = (p?: string): boolean => !!p && IMAGE.test(p);

export interface MediaProps {
  /** Path relative to the film repo; undefined or a failed load shows the grey tile. */
  path?: string;
  /** Thumbnail width asked of the route (it rounds up to 160, 320, 640 or 960). 0 = the original file. */
  w?: number;
  /** Poster time for a video, seconds. */
  t?: number;
  fit?: 'cover' | 'contain';
  /** Video only: click swaps the poster for a <video> with the native controls, in the same box. */
  play?: boolean;
  /** Start playing at once (Release's delivered cut, after the user asked for it). */
  autoPlay?: boolean;
  alt?: string;
  /** Text on the grey tile when there is no file; defaults to the file name. */
  missingLabel?: string;
  className?: string;
  /** Overlays drawn above the picture (labels, badges). */
  children?: React.ReactNode;
  onPlay?: () => void;
}

const baseName = (p?: string): string => (p ? p.split('/').pop() ?? p : '');

export function Media({ path, w = 320, t = 0.5, fit = 'cover', play, autoPlay, alt, missingLabel, className, children, onPlay }: MediaProps) {
  const [failed, setFailed] = useState(0);
  const [playing, setPlaying] = useState(!!autoPlay);
  const [retry, setRetry] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string>();
  // a new file starts afresh
  const [shownPath, setShownPath] = useState(path);
  if (shownPath !== path) {
    setShownPath(path);
    setFailed(0);
    setRetry(0);
    setPlaying(!!autoPlay);
  }
  // a file a cloud drive is still syncing answers 503: try twice more, a few seconds apart, then give up
  useEffect(() => {
    if (failed === 0 || failed > 2) return;
    const id = setTimeout(() => setRetry((r) => r + 1), 2500 * failed);
    return () => clearTimeout(id);
  }, [failed]);

  const video = isVideoPath(path);
  const usable = !!path && (video || isImagePath(path)) && failed <= 2;
  const objectFit = fit === 'cover' ? 'object-cover' : 'object-contain';
  const box = cn('relative block overflow-hidden bg-tile', className);

  if (!usable) {
    return (
      <span className={cn(box, 'flex items-end justify-center')} title={path}>
        <span className="max-w-full truncate px-1.5 pb-1.5 font-mono text-[11px] text-mute">{missingLabel ?? (baseName(path) || 'no file')}</span>
        {children}
      </span>
    );
  }

  // a clip in a small box: a corner button opens it full screen (the user, 12 Nov), whether it is playing or not
  const full = video && (
    <span role="button" tabIndex={0} aria-label={`Show ${baseName(path)} full screen`} title="Full screen"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlaying(false); zoomVideo(mediaUrl(path!, { retry }), alt ?? baseName(path)); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPlaying(false); zoomVideo(mediaUrl(path!, { retry }), alt ?? baseName(path)); } }}
      className="absolute right-1.5 top-1.5 z-[2] flex size-7 cursor-pointer items-center justify-center rounded-md border border-white/25 bg-black/65 text-white hover:bg-black/85">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
    </span>
  );

  if (video && playing) {
    return (
      <span className={box}>
        <video
          src={mediaUrl(path!, { retry })}
          poster={mediaUrl(path!, { w: Math.max(w, 640), t, retry })}
          controls
          autoPlay
          playsInline
          preload="auto"
          className={cn('absolute inset-0 size-full bg-black', 'object-contain')}
          onError={() => setFailed((f) => f + 1)}
        />
        {full}
      </span>
    );
  }

  // the picture fades in once it has loaded; until then (and while a failed load waits for its retry) the grey tile
  // shows, never the browser's broken-image mark with the file name over it
  const src = mediaUrl(path!, { w, t, retry });
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- the media route already serves sized WebP; next/image would resize twice
    <img
      key={`${path}:${retry}`}
      ref={(el) => { if (el?.complete && el.naturalWidth > 0 && loadedSrc !== el.getAttribute('src')) setLoadedSrc(el.getAttribute('src') ?? undefined); }}
      onLoad={(e) => setLoadedSrc(e.currentTarget.getAttribute('src') ?? undefined)}
      src={src}
      alt={alt ?? baseName(path)}
      loading="lazy"
      decoding="async"
      draggable={false}
      // a still picture opens full screen on a click (Lightbox); a PDF shows its first page there
      {...(!video ? { 'data-zoom': /\.pdf$/i.test(path!) ? mediaUrl(path!, { w: 960, retry }) : mediaUrl(path!, { retry }), 'data-zoom-alt': alt ?? baseName(path) } : {})}
      className={cn('absolute inset-0 size-full transition-opacity duration-200 ease-out motion-reduce:transition-none', objectFit, !video && 'cursor-zoom-in', loadedSrc === src ? 'opacity-100' : 'opacity-0')}
      onError={() => setFailed((f) => f + 1)}
    />
  );
  // inside a link a click follows the link, so the picture gets its own small button there
  const expand = !video && (
    <span role="button" tabIndex={0} aria-label={`Show ${baseName(path)} full screen`} title="Full screen"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); const el = e.currentTarget.parentElement?.querySelector('[data-zoom]'); if (el) zoom(el); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const el = e.currentTarget.parentElement?.querySelector('[data-zoom]'); if (el) zoom(el); } }}
      className="absolute right-1 top-1 z-[1] hidden size-6 cursor-zoom-in items-center justify-center rounded-md border border-white/25 bg-black/65 text-white [a:not([target])_&]:flex">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
    </span>
  );

  if (video && play) {
    return (
      <span className={box}>
        {img}
        <span
          role="button"
          tabIndex={0}
          aria-label={`Play ${baseName(path)}`}
          onClick={(e) => { e.stopPropagation(); setPlaying(true); onPlay?.(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPlaying(true); onPlay?.(); } }}
          // on the phone's Release pages the full-screen mark grows to a 44 px target over the corner: the play mark then
          // sits at the foot of the picture, so the two never lie on each other (QC round two; the desktop is unchanged)
          className="absolute inset-0 flex cursor-pointer items-center justify-center [.touch-targets_&]:items-end [.touch-targets_&]:pb-1.5"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-black/55 backdrop-blur-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FAFAFA" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
          </span>
        </span>
        {full}
        {children}
      </span>
    );
  }

  return (
    <span className={box}>
      {img}
      {expand}
      {children}
    </span>
  );
}
