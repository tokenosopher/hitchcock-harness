'use client';
// "How it will look" (Release, stage 2; boards 16 and 18): a phone-shaped frame with a still of the final and the
// platform's own layer sketched in neutral greys: the account, the caption cut where the feed cuts it (the number
// the line under it states, previewCut in derive.ts), "more", and a hatched band where the platform's buttons cover
// the picture. "In the feed / Opened" shows the whole caption. Kinds whose feed looks different are drawn plainly:
// YouTube Shorts (the title over the frame, the thumbnail tile under it), X, Threads and LinkedIn (the text above the
// video), Reddit (the title above). X's reply (ASKS 58) is drawn under the post as a thread: the same account, a
// thin line joining them, its text, no video. No logos, no copied artwork. It follows the typing (drafts.ts).
import { useState } from 'react';
import { IconChevronRight } from '@/components/shell/icons';
import { Reveal } from '@/components/shell/Reveal';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { appName, postedParts, previewCut } from './derive';
import type { Platform, ReleaseFile } from './file';
import { numWords, type PlatformKind } from './platforms';
import { draftsOf, useDraftOf } from './drafts';
import { filmPath } from '@/components/pages/common';
import type { FilmState } from '@/server/types';

type Shape = 'over' | 'above' | 'title';
const SHAPE: Record<PlatformKind, Shape> = {
  tiktok: 'over', 'instagram-reels': 'over', facebook: 'over', 'youtube-shorts': 'over', x: 'above', threads: 'above', linkedin: 'above', reddit: 'title',
};
/** The still when no thumbnail is picked: a moment into the film, as the Release page's player starts. */
const STILL_AT = 8;

type LookProps = { film: string; state: FilmState; file: ReleaseFile; p: Platform };

/** The part as a column of its own (the three-column page). */
export function PlatformLook(props: LookProps) {
  return (
    <section aria-label="How it will look" data-look={props.p.kind} className="flex w-[268px] flex-none flex-col gap-3 overflow-y-auto border-r border-line p-4">
      <div className="flex min-h-[30px] items-center"><h2 className="m-0 text-[14px] font-medium">How it will look</h2></div>
      <LookBody {...props} />
    </section>
  );
}

const FOLD_KEY = 'hh-release-look-open';
const readFold = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };

/** The part folded to one row at the top of the text (two columns, one column, the phone): "How it will look" and
 *  the feed's cut in words; it opens to the same phone frame. Open or folded is remembered in this browser. */
export function LookFold(props: LookProps & { phone?: boolean }) {
  const [open, setOpen] = useState(readFold);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* this visit only */ } };
  const draft = useDraftOf(draftsOf(props.film, props.p.id));
  const parts = postedParts(props.file, props.p.id, draft);
  const cut = previewCut(props.p.kind, parts[0]?.text ?? '');
  const sum = cut.fold ? `the feed shows ${numWords(cut.fold)} characters` : 'the post as it will show';
  return (
    <section aria-label="How it will look" data-look={props.p.kind} data-look-fold={open ? 'open' : 'closed'} className="flex flex-col rounded-[10px] border border-edge">
      <button type="button" data-look-toggle aria-expanded={open} onClick={toggle}
        className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left transition-colors duration-150 hover:bg-raised/50', props.phone ? 'min-h-[48px]' : 'min-h-[40px]')}>
        <IconChevronRight size={13} className={cn('flex-none text-sub transition-transform duration-200', open && 'rotate-90')} />
        <h2 className="m-0 flex-none text-[13px] font-medium">How it will look</h2>
        <span className="min-w-0 truncate text-[12px] text-sub">{sum}</span>
      </button>
      <Reveal open={open}>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3 px-3 pb-3 pt-1">
          <LookBody {...props} />
        </div>
      </Reveal>
    </section>
  );
}

function LookBody({ film, state, file, p }: LookProps) {
  const [opened, setOpened] = useState(false);
  const draft = useDraftOf(draftsOf(film, p.id));
  const media = filmPath(state, file.final?.path ?? '');
  const parts = postedParts(file, p.id, draft);
  const shape = SHAPE[p.kind];
  const yt = p.kind === 'youtube-shorts';
  const main = parts[0]?.text ?? '';
  const second = parts[1]?.text ?? '';
  // X's reply (ASKS 58): drawn under the post as X shows a thread, the same account, a thin line joining them, no video
  const reply = parts.find((x) => x.part.id === 'reply')?.text ?? '';
  const cut = previewCut(p.kind, main);
  const thumb = p.thumbnail?.options.find((o) => o.id === p.thumbnail?.pick);
  const t = thumb?.at ?? STILL_AT;
  const name = appName(p);
  const shown = opened || !cut.more ? main : cut.shown;
  const line = yt
    ? `The title sits over the bottom of the picture.${second ? ' Opened, the description shows under it.' : ''}`
    : shape === 'title' ? 'The title sits above the video. Opened, the first comment shows under it.'
    : `${cut.fold ? `The feed shows ${numWords(cut.fold)} characters, then ${shape === 'above' ? 'Show more' : 'more'}.` : `The feed shows the whole ${parts[0]?.part.label.toLowerCase() ?? 'text'}.`}${reply ? ' The reply shows under the post, as a thread.' : ''}`;

  return (
    <>
      <div className="flex w-[236px] flex-none flex-col gap-3">
      <div role="img" aria-label={`How the post will look on ${name}`} data-look-phone
        className="relative h-[420px] w-[236px] flex-none overflow-hidden rounded-[18px] border border-edge-strong bg-[#111]">
        {shape === 'over' ? (
          <>
            <Still media={media} t={t} className="absolute inset-0" />
            <span aria-hidden className="absolute bottom-[100px] right-0 top-[190px] w-[46px] border-l border-dashed border-white/35 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.13)_0_3px,transparent_3px_8px)]" />
            <span aria-hidden className={cn('absolute inset-x-0 bottom-0 border-t border-dashed border-white/35 bg-black/40 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.13)_0_3px,transparent_3px_8px)] transition-[height] duration-200 ease-out', opened ? 'h-[210px]' : 'h-[100px]')} />
            <span aria-hidden className="absolute bottom-[112px] right-[9px] flex flex-col items-center gap-[13px]">
              {[0, 1, 2, 3].map((i) => <i key={i} className={cn('block rounded-full', i === 0 && !yt ? 'size-[30px] bg-[rgba(210,210,216,.8)]' : 'size-[26px] bg-[rgba(210,210,216,.55)]')} />)}
            </span>
            <span className="absolute bottom-3 left-2.5 right-[52px] flex max-h-[190px] flex-col gap-[3px] overflow-hidden text-[12px] leading-[1.35] text-ink-2 [text-shadow:0_1px_2px_#000]">
              {yt ? (
                <>
                  <span key={`${opened}`} data-look-shown className="whitespace-pre-line text-[12.5px] font-semibold text-ink duration-200 animate-in fade-in-0">{shown}</span>
                  <span className="flex items-center gap-1.5 text-[11.5px]"><i className="block size-4 rounded-full bg-[rgba(210,210,216,.7)]" />{p.account}<span className="h-[17px] rounded-full bg-[rgba(210,210,216,.75)] px-[7px] text-[11px] font-semibold leading-[17px] text-black [text-shadow:none]">Subscribe</span></span>
                  {opened && second && <span className="line-clamp-4 whitespace-pre-line text-[11.5px] duration-200 animate-in fade-in-0">{second}</span>}
                </>
              ) : (
                <>
                  <b className="font-semibold text-ink">{p.account}</b>
                  <span key={`${opened}`} className="whitespace-pre-line duration-200 animate-in fade-in-0">
                    <span data-look-shown>{shown}</span>{!opened && cut.more && <span className="text-[#b4b4bc]"> more</span>}
                  </span>
                </>
              )}
            </span>
          </>
        ) : (
          <div className="flex h-full flex-col gap-2 p-3">
            <span className="flex items-center gap-2 text-[12px] text-ink-3"><i aria-hidden className="block size-6 flex-none rounded-full bg-[rgba(210,210,216,.45)]" /><b className="truncate font-semibold text-ink">{p.account}</b></span>
            <span key={`${opened}`} className={cn('whitespace-pre-line text-[12.5px] leading-[1.4] text-ink-2 duration-200 animate-in fade-in-0', shape === 'title' && 'font-semibold text-ink', opened ? 'max-h-[170px] overflow-y-auto' : 'max-h-[120px] overflow-hidden')}>
              <span data-look-shown>{shape === 'title' ? main : shown}</span>{!opened && shape === 'above' && cut.more && <span className="text-sub"> Show more</span>}
            </span>
            <Still media={media} t={t} className="relative min-h-0 flex-1 rounded-[10px] border border-edge" />
            {shape === 'title' && opened && second && <span className="line-clamp-3 whitespace-pre-line text-[11.5px] text-sub duration-200 animate-in fade-in-0">{second}</span>}
            <span aria-hidden className="flex h-5 flex-none items-center gap-5 px-1">{[0, 1, 2, 3].map((i) => <i key={i} className="block h-2 w-5 rounded-full bg-[rgba(210,210,216,.3)]" />)}</span>
            {reply && (
              <div data-look-reply className="relative flex flex-none gap-2 pt-2 duration-200 animate-in fade-in-0">
                {/* the thread's line: from the post above down to the reply's own account mark */}
                <span aria-hidden data-look-thread-line className="absolute left-[11.5px] top-[-6px] h-[14px] w-px bg-[rgba(210,210,216,.35)]" />
                <i aria-hidden className="mt-0.5 block size-6 flex-none rounded-full bg-[rgba(210,210,216,.45)]" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <b className="truncate text-[12px] font-semibold text-ink">{p.account}</b>
                  <span key={`${opened}`} data-look-reply-text className={cn('whitespace-pre-line text-[12px] leading-[1.4] text-ink-2 duration-200 animate-in fade-in-0', opened ? 'max-h-[120px] overflow-y-auto' : 'line-clamp-3')}>{reply}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {shape === 'over' && (
        <div data-look-legend className="-mt-1 flex w-[236px] items-start justify-end gap-2 text-[12px] text-sub">
          <span className="pt-1.5">covered by {name}&apos;s buttons</span>
          {/* the swatch sits right under the band on the phone's right edge, joined to it by a dashed line */}
          <span aria-hidden className="flex w-[46px] flex-none flex-col items-center">
            <span className="h-1.5 w-px border-l border-dashed border-white/40" />
            <span className="h-3 w-[46px] rounded-[3px] border border-dashed border-white/40 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.3)_0_2px,transparent_2px_5px)]" />
          </span>
        </div>
      )}
      </div>
      <div className="flex min-w-[160px] flex-1 flex-col gap-3">
      <div role="group" aria-label="Preview" className="inline-flex h-[30px] self-start overflow-hidden rounded-lg border border-edge-strong">
        {(['In the feed', 'Opened'] as const).map((l, i) => {
          const on = (i === 1) === opened;
          return <button key={l} type="button" aria-pressed={on} onClick={() => setOpened(i === 1)} className={cn('cursor-pointer px-[11px] text-[12px] transition-colors duration-150', on ? 'bg-[#232327] text-ink' : 'text-sub hover:text-ink')}>{l}</button>;
        })}
      </div>
      <p data-look-line data-fold={cut.fold?.value} className="m-0 text-[12px] leading-[1.5] text-sub">{line}</p>
      {yt && (
        <div data-look-tile className="flex items-start gap-2.5">
          <Still media={media} t={t} className="relative h-[92px] w-[52px] flex-none rounded-[7px] border border-edge-strong" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="line-clamp-2 text-[12px] font-medium leading-[1.35] text-ink">{main || 'No title yet'}</span>
            <span className="text-[11.5px] text-sub">the tile in the Shorts shelf{thumb ? `: ${thumb.does}` : ''}</span>
          </span>
        </div>
      )}
      </div>
    </>
  );
}

/** A frame of the final, fading in once loaded; a grey tile when there is no picture (sample films). */
function Still({ media, t, className }: { media: string; t: number; className?: string }) {
  const src = mediaUrl(media, { w: 480, t });
  const [loaded, setLoaded] = useState<string>();
  const [failed, setFailed] = useState<string>();
  return (
    <span className={cn('block overflow-hidden bg-tile', className)}>
      {failed !== src && (
        // eslint-disable-next-line @next/next/no-img-element -- the media route serves sized frames
        <img key={src} src={src} alt="" draggable={false} onLoad={() => setLoaded(src)} onError={() => setFailed(src)}
          className={cn('absolute inset-0 size-full object-cover transition-opacity duration-200', loaded === src ? 'opacity-100' : 'opacity-0')} />
      )}
    </span>
  );
}
