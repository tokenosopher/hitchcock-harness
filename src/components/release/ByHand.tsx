'use client';
// By hand (Release, stage 3 of 3; boards Phone and Platform): Reddit always, any platform the user moved off Buffer.
// Alma's steps (`upload.hand`) as a numbered column, each read as one of the mechanics the page knows (sendflow.ts
// `handSteps`): save the final (the full-size file, a download, never the 480p preview), copy a posted part (the
// exact text shown), open the app (a plain web link), a check worded as an action, paste the post's link (checked to
// be a link to that platform) or "I posted it, link later". The step to do now is the only filled button; done steps
// are ticked and can be done again. Every tick is written to the file (`tick`), so it survives a reload. On the phone
// each step is a big row, pressable as a whole, and the bar at the foot holds the current step's button.
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUIActions } from '@/components/data/ui';
import { mediaUrl } from '@/components/media/Media';
import { repoPath } from '@/components/lib/format';
import { IconCheck } from '@/components/shell/icons';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import { appName, hm } from './derive';
import { factsOf } from './platforms';
import { outWords } from './outfile';
import { appHome, copyWhat, currentHand, fileWords, handSteps, maybeAlive, type HandStep } from './sendflow';
import { LinkField, routeChip, type SendProps } from './PlatformSend';
import { phoneMain } from './PhoneBar';
import { DockSlot } from './layout';

export function ByHand({ rel, file, p, final, phone, base }: SendProps) {
  const { state } = useFilm();
  const { addChip } = useUIActions();
  const steps = handSteps(file, p);
  const posted = !!p.send.posted;
  const cur = currentHand(steps, posted);
  const done = steps.filter((s) => s.done || (posted && s.kind === 'link')).length;
  const linkRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string>();
  const download = state ? mediaUrl(repoPath(state.film.folder, state.film.repo, final.path)) : undefined;
  const open = appHome(p);
  const tick = async (s: HandStep, value = true) => {
    if (!!s.done === value) return;
    const r = await rel.run({ op: 'tick', platform: p.id, list: 'hand', step: s.id, done: value });
    setErr(r.ok ? undefined : r.error);
  };
  const copy = (s: HandStep) => {
    // nothing picked yet: nothing to copy, and the step is not done
    if (!s.part?.text.trim()) { setErr(`Pick the ${s.part?.part.label.toLowerCase() ?? 'text'} first, in The text.`); return; }
    void navigator.clipboard?.writeText(s.part.text).then(() => tick(s), () => setErr('The browser did not allow copying. Select the text and copy it.'));
  };
  const back = async () => {
    const r = await rel.run({ op: 'setRoute', platform: p.id, route: 'buffer' });
    if (!r.ok) { setErr(r.error); return; }
    addChip(routeChip(p, 'buffer'));
  };
  const channel = factsOf(p.kind).buffer.channel;
  const movedBy = p.routeBy?.by === 'user' ? 'You' : p.routeBy?.by === 'alma' ? 'Alma' : undefined;
  const qs = typeof window === 'undefined' ? '' : window.location.search;
  // the step to do now, in the dock at the foot of a one-column page or the phone's bar
  const bar = !cur ? <Link href={`${base}/release${qs}`} data-bar-back className={cn(phoneMain, 'border border-edge-strong bg-transparent text-ink')}>Back to Release</Link> : <StepBar s={cur} download={download} name={final.name} openHref={open.href} onCopy={copy} onTick={tick} toLink={() => linkRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })} />;
  return (
    <div data-by-hand className="flex flex-col gap-3">
      {channel && !posted && (
        <p data-moved className="m-0 rounded-[10px] border border-edge-strong px-3 py-2.5 text-[12.5px] leading-[1.5] text-ink-3">
          {movedBy && p.routeBy ? `${movedBy} moved ${appName(p)} to by hand at ${hm(p.routeBy.at)}.` : `${appName(p)} goes by hand.`} Buffer will not post it.{' '}
          {!maybeAlive(p) && <button type="button" data-move-back onClick={() => void back()} className="inline-flex min-h-7 cursor-pointer items-center border-0 bg-transparent p-0 text-[12.5px] text-ink underline underline-offset-2">Move it back</button>}
        </p>
      )}
      {!channel && <p data-always-hand className="m-0 text-[12.5px] text-sub">Always by hand. Buffer has no {appName(p)} channel. From {p.account}.</p>}
      <span data-hand-progress className="text-[12px] text-sub">{posted ? 'By hand, done' : `By hand, step ${Math.min(done + 1, steps.length)} of ${steps.length}`}</span>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s) => {
          const isDone = !!s.done || (posted && s.kind === 'link');
          const now = cur?.id === s.id;
          return (
            <li key={s.id} data-hand-step={s.id} data-hand-kind={s.kind} data-hand-state={isDone ? 'done' : now ? 'current' : 'to-come'}
              className={cn('rounded-[12px] border transition-colors duration-200', now ? 'border-ink' : 'border-edge', !isDone && !now && 'opacity-60')}>
              <StepRow s={s} isDone={isDone} now={now} phone={phone} download={download} name={final.name} size={fileWords(final)} which={final.out?.small ? 'The smaller file of the final, for posting.' : final.out?.making || final.out?.why ? `The final, full size: ${outWords(final.out).note?.replace(/\.$/, '').replace(/^\w/, (c) => c.toLowerCase())}.` : undefined} openHref={open.href} openLabel={open.label}
                what={s.part ? copyWhat(file, p, s.part) : ''} onCopy={copy} onTick={tick}>
                {s.kind === 'link' && (
                  <div ref={linkRef} className="pl-9 pr-3 pb-3">
                    {posted && p.send.posted?.link
                      ? <span data-hand-link className="block truncate rounded-lg border border-edge-strong px-2.5 py-2 text-[12.5px]">{p.send.posted.link.replace(/^https?:\/\/(www\.)?/, '')}</span>
                      : <LinkField rel={rel} p={p} later big={phone} />}
                  </div>
                )}
              </StepRow>
            </li>
          );
        })}
      </ol>
      <Reveal open={posted}>
        <p data-hand-posted className="m-0 flex items-center gap-2 text-[12.5px] text-ok"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>Posted <span className="tabular-nums text-sub">{p.send.posted ? hm(p.send.posted.at) : ''}</span>{posted && !p.send.posted?.link && <span className="text-warn">, link to add</span>}</p>
      </Reveal>
      {err && <p role="alert" className="m-0 text-[12px] text-warn duration-200 animate-in fade-in-0">{err}</p>}
      {/* in a column it stays at the column's foot, so the step to do now is never below the fold */}
      <DockSlot>{bar}</DockSlot>
    </div>
  );
}

const btn = 'inline-flex flex-none items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-medium transition-colors duration-150';

/** One step: the whole row is its one control (a download, a copy, a link out, a check), never nested. */
function StepRow({ s, isDone, now, phone, download, name, size, which = 'The final, full size.', openHref, openLabel, what, onCopy, onTick, children }: {
  s: HandStep; isDone: boolean; now: boolean; phone?: boolean; download?: string; name: string; size: string; which?: string; openHref: string; openLabel: string; what: string;
  onCopy: (s: HandStep) => void; onTick: (s: HandStep, v?: boolean) => void; children?: React.ReactNode;
}) {
  const mark = (
    <span aria-hidden="true" className={cn('grid flex-none place-items-center rounded-full text-[11px]', phone ? 'size-7' : 'size-6', isDone ? 'bg-ink text-bg' : now ? 'border-[1.5px] border-ink text-ink' : 'border border-edge-strong text-sub')}>
      {isDone ? <IconCheck size={phone ? 14 : 12} /> : s.n}
    </span>
  );
  const verb = s.kind === 'save' ? 'Save' : s.kind === 'copy' ? 'Copy' : s.kind === 'open' ? 'Open' : '';
  const action = verb && <span className={cn(btn, phone ? 'h-9' : 'h-7', now && !isDone ? 'bg-ink text-bg' : 'border border-edge-strong text-ink')}>{isDone ? `${verb} again` : verb}</span>;
  const sub = s.kind === 'save' ? `${size}. ${which}`
    : s.kind === 'open' ? openHref.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')
      : s.kind === 'copy' ? what : '';
  const body = (
    <span className="flex w-full flex-col gap-2">
      <span className="flex w-full items-start gap-3">
        {mark}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <span className={cn('text-[13.5px] leading-[1.35]', isDone ? 'text-ink-3' : 'text-ink')}>{s.kind === 'open' && /^open/i.test(s.text) ? s.text : s.kind === 'open' ? `${s.text} (${openLabel})` : s.text}</span>
          {sub && <span className="text-[12px] text-sub">{sub}</span>}
        </span>
        {action}
        {s.kind === 'check' && <span aria-hidden="true" className={cn('grid flex-none place-items-center rounded-[5px] border', phone ? 'size-6' : 'size-5', isDone ? 'border-ink bg-ink text-bg' : now ? 'border-ink' : 'border-edge-strong')}>{isDone && <IconCheck size={12} />}</span>}
      </span>
      {s.kind === 'copy' && s.part && <span data-copy-text className={cn('line-clamp-4 whitespace-pre-wrap break-words rounded-lg bg-raised px-2.5 py-1.5 text-[12px] leading-[1.45] text-ink-3', phone ? 'ml-10' : 'ml-9')}>{s.part.text.trim() ? s.part.text : <span className="text-sub">Nothing picked yet.</span>}</span>}
    </span>
  );
  const cls = cn('flex w-full cursor-pointer rounded-[12px] border-0 bg-transparent px-3 text-left text-ink no-underline', phone ? 'min-h-[56px] py-3' : 'min-h-[44px] py-2.5');
  const row = s.kind === 'save' && download
    ? <a href={download} download={name} data-hand-do onClick={() => onTick(s)} className={cls}>{body}</a>
    : s.kind === 'open'
      ? <a href={openHref} target="_blank" rel="noreferrer" data-hand-do onClick={() => onTick(s)} className={cls}>{body}</a>
      : s.kind === 'copy'
        ? <button type="button" data-hand-do onClick={() => onCopy(s)} className={cls}>{body}</button>
        : s.kind === 'check'
          ? <button type="button" role="checkbox" aria-checked={isDone} data-hand-do onClick={() => onTick(s, !isDone)} className={cls}>{body}</button>
          : <div className={cn(cls, 'cursor-default')}>{body}</div>;
  return <>{row}{children}</>;
}

/** The phone bar's button: the step to do now. */
function StepBar({ s, download, name, openHref, onCopy, onTick, toLink }: { s: HandStep; download?: string; name: string; openHref: string; onCopy: (s: HandStep) => void; onTick: (s: HandStep, v?: boolean) => void; toLink: () => void }) {
  if (s.kind === 'save' && download) return <a href={download} download={name} data-bar-do onClick={() => onTick(s)} className={phoneMain}>Save the video</a>;
  if (s.kind === 'open') return <a href={openHref} target="_blank" rel="noreferrer" data-bar-do onClick={() => onTick(s)} className={phoneMain}>{s.text}</a>;
  if (s.kind === 'copy') return <button type="button" data-bar-do onClick={() => onCopy(s)} className={phoneMain}>{s.text}</button>;
  if (s.kind === 'check') return <button type="button" data-bar-do onClick={() => onTick(s)} className={phoneMain}>Done: step {s.n}</button>;
  return <button type="button" data-bar-do onClick={toLink} className={phoneMain}>Next: paste the link</button>;
}
