'use client';
// "The text" (Release, stage 2; boards 16 to 18; ASKS 57): the middle part of a platform page. At the top, the posted
// parts' counts against the platform's limits (they follow the typing), the one quiet line of a locked platform, and
// the one row that says what Alma has not read. Then one box per thing the platform itself has, in its order, and a
// Tags box (TextBox.tsx, derive.ts boxesOf), and the thumbnail to pick when the platform has one, with the one quiet
// line that says whether a pick here is the pick on the other platforms too (ASKS 55). Writes only through operations.
import { useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { filmPath } from '@/components/pages/common';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import type { FilmState } from '@/server/types';
import { boxesOf, coverLine, partWords, type Status } from './derive';
import type { Platform, ReleaseFile } from './file';
import { coverWord } from './platforms';
import { draftsOf, useDraftOf } from './drafts';
import { LinkIcon, TextBox, type BoxCtx } from './TextBox';
import { SinceRead } from './AskAlma';
import type { useRelease } from './ui';
import type { Layout } from './layout';

type Run = ReturnType<typeof useRelease>['run'];

/** `layout`: in one column (and on the phone) the part does not scroll on its own, the page does. `look`: "How it will
 *  look" folded at the top, when it has no column of its own. `phone`: 44 px targets. */
export function PlatformText({ film, state, file, p, st, now, run, base, layout = 'three', look, phone }: { film: string; state: FilmState; file: ReleaseFile; p: Platform; st: Status; now: Date; run: Run; base: string; layout?: Layout; look?: React.ReactNode; phone?: boolean }) {
  const qs = typeof window === 'undefined' ? '' : window.location.search;
  const locked = st.locked;
  const ctx: BoxCtx = { film, file, p, now, run, base, qs, locked, phone };
  const flow = phone || layout === 'one';
  return (
    <section aria-label="The text" data-text-column={locked ? 'locked' : 'open'}
      className={cn('@container/text flex min-w-0 flex-col gap-[18px]', flow ? 'w-full pb-6 pt-3.5' : 'flex-1 overflow-y-auto pb-10 pt-3.5', phone ? 'px-4' : 'px-5', phone && 'touch-targets')}>
      {look}
      <div className="flex min-h-[30px] flex-none flex-wrap items-baseline gap-x-2"><h2 className="m-0 text-[14px] font-medium">The text</h2><Counts film={film} file={file} pid={p.id} /></div>
      {locked && st.lockWhy && <p data-lock-line className="-mt-2 m-0 text-[12.5px] leading-[1.45] text-sub duration-200 animate-in fade-in-0">{st.lockWhy}</p>}
      <SinceRead film={film} p={p} />
      {boxesOf(p).map((b) => <TextBox key={b.key} ctx={ctx} b={b} />)}
      {p.thumbnail && <Thumbs media={filmPath(state, file.final?.path ?? '')} file={file} p={p} now={now} run={run} locked={locked} />}
    </section>
  );
}

/** "one caption, 166 of 2,200": follows the field being typed (drafts.ts), red over a hard limit. */
function Counts({ film, file, pid }: { film: string; file: ReleaseFile; pid: string }) {
  const draft = useDraftOf(draftsOf(film, pid));
  const ws = partWords(file, pid, draft);
  return (
    <span data-part-counts className="text-[12px] tabular-nums text-sub">
      {ws.map((w, i) => <span key={i} data-over={w.over ? '' : undefined} data-past={w.past ? '' : undefined} className={cn('transition-colors duration-200', w.over ? 'text-bad' : w.past && 'text-warn')}>{i ? ' · ' : ''}{w.text}</span>)}
    </span>
  );
}

/** The thumbnail: the frames Alma offers, each with what it shows, the one in use marked; under them, when other
 *  platforms have one too, whether a pick here picks it there ("Only here" / "Same as the others again"). */
function Thumbs({ media, file, p, now, run, locked }: { media: string; file: ReleaseFile; p: Platform; now: Date; run: Run; locked: boolean }) {
  const t = p.thumbnail!;
  const [said, setSaid] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [owning, setOwning] = useState(false);
  const on = pending ?? t.pick;
  const line = coverLine(file, p.id, now);
  const rows = line ? [coverLine(file, p.id, now, false)!, coverLine(file, p.id, now, true)!] : [];
  const word = coverWord(p.kind);
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  const pick = async (id: string) => {
    if (locked || id === t.pick) return;
    setPending(id);
    const r = await run({ op: 'pickThumbnail', platform: p.id, option: id });
    setPending(undefined);
    setSaid(r.ok ? undefined : r.error);
  };
  const own = async () => {
    if (owning) return;
    setOwning(true);
    const r = await run({ op: 'thumbnailOwn', platform: p.id, own: line?.state !== 'own' });
    setOwning(false);
    setSaid(r.ok ? undefined : r.error);
  };
  const shown = locked ? t.options.filter((o) => o.id === t.pick) : t.options;
  return (
    <div data-thumbs className="flex flex-col gap-1.5">
      <div className="flex min-h-[22px] flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-sub"><b className="text-[12.5px] font-medium text-ink">{label}</b>{t.where && <span className="min-w-0">{t.where}</span>}</div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] items-start gap-x-2.5 gap-y-3">
        {shown.map((o) => {
          const sel = o.id === on;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={sel} data-thumb={o.id} disabled={locked} onClick={() => void pick(o.id)}
              title={o.does} className={cn('relative flex min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left transition-colors duration-200 disabled:cursor-default', sel ? 'text-ink' : 'text-sub')}>
              <span className={cn('relative block aspect-[9/16] w-full max-w-[76px] overflow-hidden rounded-[7px] border bg-tile transition-[border-color,box-shadow] duration-200', sel ? 'border-ink shadow-[inset_0_0_0_1px_#fafafa]' : 'border-edge-strong')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the media route serves sized frames */}
                <img src={mediaUrl(media, { w: 160, t: o.at })} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 size-full object-cover" />
                <span aria-hidden className={cn('absolute left-[5px] top-[5px] size-3.5 rounded-full transition-[border-width,background-color] duration-200', sel ? 'border-[4.5px] border-ink bg-black' : 'border-[1.5px] border-ink bg-black/50')} />
              </span>
              <span className="line-clamp-3 text-[11px] leading-[1.3]">{o.does}</span>
            </button>
          );
        })}
      </div>
      {line && (
        // both wordings in one cell, the one not in use faded out, so the line keeps its height when it changes
        <div data-cover-line={line.state} className="grid duration-200 animate-in fade-in-0 [grid-template-areas:'line']">
          {rows.map((r) => {
            const on = r.state === 'own' ? line.state === 'own' : line.state !== 'own';
            return (
              <p key={r.state === 'own' ? 'own' : 'not'} data-cover-row={r.state} data-on={on ? '' : undefined} aria-hidden={!on}
                className={cn('m-0 flex min-h-7 items-center gap-2 text-[11.5px] leading-[1.4] text-sub transition-[opacity,visibility] duration-200 [grid-area:line]', on ? 'visible opacity-100' : 'invisible opacity-0')}>
                <span key={r.text} className="flex min-w-0 items-start gap-2 duration-200 animate-in fade-in-0">
                  {r.state === 'shared' && <LinkIcon className="mt-[2px]" />}<span>{r.text}</span>
                </span>
                <button type="button" data-cover-own disabled={owning || !on} tabIndex={on ? 0 : -1} onClick={() => void own()}
                  className="ml-auto inline-flex h-7 flex-none cursor-pointer items-center whitespace-nowrap border-l border-edge-strong pl-[7px] text-[11.5px] text-ink underline decoration-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink disabled:cursor-default">{r.button}</button>
              </p>
            );
          })}
        </div>
      )}
      <Reveal open={!!said}><p role="alert" className="m-0 text-[11.5px] text-warn">{said}</p></Reveal>
    </div>
  );
}
