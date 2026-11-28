'use client';
// "The text" (Release, stage 2; boards 16 to 18; ASKS 57): the middle part of a platform page. At the top, the posted
// parts' counts against the platform's limits (they follow the typing), the one quiet line of a locked platform, and
// the one row that says what Alma has not read. Then one box per thing the platform itself has, in its order, and a
// Tags box (TextBox.tsx, derive.ts boxesOf), and the thumbnail to pick when the platform has one, with the one quiet
// line that says whether a pick here is the pick on the other platforms too (ASKS 55). Writes only through operations.
import { useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { useUIActions } from '@/components/data/ui';
import { filmPath } from '@/components/pages/common';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import type { FilmState } from '@/server/types';
import { appName, boxesOf, coverLine, nameList, partWords, platformStatus, type Status } from './derive';
import type { Platform, ReleaseFile } from './file';
import { FramePicker } from './FramePicker';
import { offsetMs, pickedFrame, timecode, userFrame } from './frames';
import type { ReleaseView } from './view';
import { coverWord } from './platforms';
import { draftsOf, useDraftOf } from './drafts';
import { LinkIcon, TextBox, type BoxCtx } from './TextBox';
import { SinceRead } from './AskAlma';
import type { useRelease } from './ui';
import type { Layout } from './layout';

type Run = ReturnType<typeof useRelease>['run'];

/** `layout`: in one column (and on the phone) the part does not scroll on its own, the page does. `look`: "How it will
 *  look" folded at the top, when it has no column of its own. `phone`: 44 px targets. `finalFile`: the final's length
 *  and frame rate (GET …/release), for "Pick any frame". */
export function PlatformText({ film, state, file, p, st, now, run, base, layout = 'three', look, phone, finalFile }: { film: string; state: FilmState; file: ReleaseFile; p: Platform; st: Status; now: Date; run: Run; base: string; layout?: Layout; look?: React.ReactNode; phone?: boolean; finalFile?: ReleaseView['finalFile'] }) {
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
      {p.thumbnail && <Thumbs media={filmPath(state, file.final?.path ?? '')} file={file} p={p} now={now} run={run} locked={locked} phone={phone} final={finalFile} />}
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

/** The thumbnail: the frames Alma offers, each with what it shows, the one in use marked; the user's own frame beside
 *  them once there is one ("Your frame" and its timecode), and "Pick any frame", which opens the final to scrub
 *  through (FramePicker.tsx); under them, when other platforms have one too, whether a pick here picks it
 *  there ("Only here" / "Same as the others again"), and, while the user's frame is in use here and another platform
 *  that can still change has a different one, "Use for the other platforms too". */
function Thumbs({ media, file, p, now, run, locked, phone, final }: { media: string; file: ReleaseFile; p: Platform; now: Date; run: Run; locked: boolean; phone?: boolean; final?: ReleaseView['finalFile'] }) {
  const t = p.thumbnail!;
  const { addChip } = useUIActions();
  const [said, setSaid] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [owning, setOwning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [spreading, setSpreading] = useState(false);
  const on = pending ?? t.pick;
  const line = coverLine(file, p.id, now);
  const rows = line ? [coverLine(file, p.id, now, false)!, coverLine(file, p.id, now, true)!] : [];
  const word = coverWord(p.kind);
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  const mine = userFrame(p);
  const inUse = pickedFrame(p);
  const fps = final?.fps;
  const pick = async (id: string) => {
    if (locked || id === t.pick) return;
    setPending(id);
    setDone(undefined);
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
  // the user's frame: saved like a pick (one operation), then Alma is told in "Alma sees"
  const useFrame = async (at: number, frame: number, rate: number): Promise<string | undefined> => {
    const r = await run({ op: 'pickFrame', platform: p.id, at });
    if (!r.ok) return r.error;
    const took = r.file.platforms.filter((q) => { const o = q.thumbnail && pickedFrame(q); return o?.by === 'user' && o.at === pickedFrame(r.file.platforms.find((x) => x.id === p.id)!)?.at; });
    const saved = pickedFrame(r.file.platforms.find((x) => x.id === p.id)!)!;
    const tc = timecode(saved.at, fps);
    addChip({
      id: `release:thumb:${p.id}`,
      label: `${appName(p)} ${word}: the user's own frame, ${tc}`,
      ref: `The user scrolled through the final and picked their own ${word} for ${nameList(took.map((q) => q.name))}: ${saved.at} s into the final (${tc}, frame ${frame + 1} at ${Math.round(rate * 1000) / 1000} fps). Recorded in social/release.json as the thumbnail option "${saved.id}" with by: "user", now thumbnail.pick${took.length > 1 ? ' on each' : ''}. Your offered frames stay as suggestions; leave the user's frame as it is. Buffer's thumbnailOffset for it: ${offsetMs(saved.at)} ms.`,
    });
    setPicking(false);
    setSaid(undefined);
    setDone(undefined);
    return undefined;
  };
  // the platforms that can still change and do not show the frame in use here
  const others = file.platforms.filter((q) => q.id !== p.id && q.thumbnail);
  const differ = (q: Platform) => pickedFrame(q)?.at !== inUse?.at;
  const canTake = others.filter((q) => !platformStatus(file, q.id, now).locked && differ(q));
  const spreadable = !locked && inUse?.by === 'user' && canTake.length > 0;
  const spread = async () => {
    if (spreading) return;
    setSpreading(true);
    const r = await run({ op: 'frameToOthers', platform: p.id });
    setSpreading(false);
    if (!r.ok) { setSaid(r.error); return; }
    setSaid(undefined);
    setDone(r.said);
    addChip({ id: 'release:thumb:all', label: 'The user\'s frame on the other platforms', ref: `The user applied ${p.name}'s cover frame to the other platforms: ${r.said}. In social/release.json each of them now has the same thumbnail option (by: "user", the same "at") as its pick, and none keeps its own ("own" removed).` });
  };
  const almas = t.options.filter((o) => o.by !== 'user');
  const shown = locked ? t.options.filter((o) => o.id === t.pick) : [...almas, ...(mine ? [mine] : [])];
  return (
    <div data-thumbs className="flex flex-col gap-1.5">
      <div className="flex min-h-[22px] flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-sub"><b className="text-[12.5px] font-medium text-ink">{label}</b>{t.where && <span className="min-w-0">{t.where}</span>}</div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] items-start gap-x-2.5 gap-y-3">
        {shown.map((o) => {
          const sel = o.id === on;
          const yours = o.by === 'user';
          return (
            <button key={o.id} type="button" role="radio" aria-checked={sel} data-thumb={o.id} data-thumb-yours={yours ? '' : undefined} disabled={locked} onClick={() => void pick(o.id)}
              title={yours ? `Your frame, ${timecode(o.at, fps)}` : o.does} className={cn('relative flex min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left transition-colors duration-200 disabled:cursor-default', yours && 'duration-200 animate-in fade-in-0', sel ? 'text-ink' : 'text-sub')}>
              <span className={cn('relative block aspect-[9/16] w-full max-w-[76px] overflow-hidden rounded-[7px] border bg-tile transition-[border-color,box-shadow] duration-200', sel ? 'border-ink shadow-[inset_0_0_0_1px_#fafafa]' : 'border-edge-strong')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the media route serves sized frames */}
                <img key={o.at} src={mediaUrl(media, { w: 160, t: o.at })} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 size-full object-cover duration-200 animate-in fade-in-0" />
                <span aria-hidden className={cn('absolute left-[5px] top-[5px] size-3.5 rounded-full transition-[border-width,background-color] duration-200', sel ? 'border-[4.5px] border-ink bg-black' : 'border-[1.5px] border-ink bg-black/50')} />
              </span>
              {yours
                ? <span className="flex flex-col text-[11px] leading-[1.3]"><span className={sel ? 'text-ink' : 'text-ink-3'}>Your frame</span><span className="tabular-nums">{timecode(o.at, fps)}</span></span>
                : <span className="line-clamp-3 text-[11px] leading-[1.3]">{o.does}</span>}
            </button>
          );
        })}
        {!locked && (
          <button type="button" data-frame-open aria-expanded={picking} onClick={() => { setPicking((v) => !v); setDone(undefined); }}
            className={cn('flex min-w-0 cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-0 text-left transition-colors duration-200', picking ? 'text-ink' : 'text-sub hover:text-ink')}>
            <span className={cn('grid aspect-[9/16] w-full max-w-[76px] place-items-center rounded-[7px] border border-dashed transition-[border-color,background-color] duration-200', picking ? 'border-sub bg-raised' : 'border-edge-strong hover:border-sub')}>
              <ScrubIcon />
            </span>
            <span className="text-[11px] leading-[1.3]">{picking ? 'Picking…' : 'Pick any frame'}</span>
          </button>
        )}
      </div>
      <Reveal open={picking && !locked}>
        <div className="pt-2">
          {picking && (
            <FramePicker media={media} fps={fps} seconds={final?.seconds} startAt={inUse?.at ?? 0} marks={almas} word={word} phone={phone}
              onUse={useFrame} onCancel={() => setPicking(false)} />
          )}
        </div>
      </Reveal>
      <Reveal open={!picking && (spreadable || !!done)}>
        <div data-frame-others className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[11.5px] leading-[1.4] text-sub">
          <span key={done ?? 'ask'} className="min-w-0 flex-1 duration-200 animate-in fade-in-0">
            {done ?? `${nameList(canTake.map((q) => q.name))} ${canTake.length > 1 ? 'have' : 'has'} a different ${canTake.length > 1 ? 'cover frame' : coverWord(canTake[0]?.kind ?? p.kind)}.`}
          </span>
          {spreadable && !done && (
            <button type="button" data-frame-spread disabled={spreading} onClick={() => void spread()}
              className="ml-auto inline-flex h-7 flex-none cursor-pointer items-center whitespace-nowrap border-l border-edge-strong pl-[7px] text-[11.5px] text-ink underline decoration-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink disabled:cursor-default">Use for the other platforms too</button>
          )}
        </div>
      </Reveal>
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

/** A film strip with a play-head: "scrub through the video". */
function ScrubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 13h15" opacity=".55" />
      <path d="M11 11.2v3.6" />
      <circle cx="11" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
