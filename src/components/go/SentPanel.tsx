'use client';
// What was sent to the video model for one take (Flow v3.3 - 7 Takes, step 8), on the take's place on its
// Scene page: the model and its settings in one line, every reference in the order sent (a picture as a picture, a
// clip that plays, a sound with a play button), each with its number as the prompt names it ("Image 1"), and the
// prompt exactly as sent, its references marked. Pointing at a reference marks it in the prompt, and the other way
// round. Read from the take's <G>-take<N>-sent.json (GET /api/films/[film]/sent); a take without one says so.
import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FilmState, SentRecord, SentRef, TakeRef } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { fmtDate, repoPath } from '@/components/lib/format';
import { IconChevronDown } from '@/components/shell/icons';
import { Media, isVideoPath, mediaUrl } from '@/components/media/Media';
import { useJson } from '@/components/pages/postCommon';
import { namedCounts, promptParts } from '@/components/lib/shotDetails';
import { shotDetailsHref } from '@/components/lib/shotHref';
import { cn } from '@/lib/utils';

const FOLDED = 245;

/** The settings in one line: "seedance_2_5 · omni_reference · 13 s · 9:16 · 480p draft · audio on · no seed". */
export function settingsLine(r: SentRecord): string {
  const s = r.settings;
  return [r.model, s.mode, s.duration !== undefined ? `${s.duration} s` : '', s.aspect, s.resolution ? `${s.resolution}${s.draft ? ' draft' : ''}` : '',
    s.audio === undefined ? '' : `audio ${s.audio ? 'on' : 'off'}`, s.seed === null || s.seed === undefined ? 'no seed' : `seed ${s.seed}`].filter(Boolean).join(' · ');
}

export function SentPanel({ state, take }: { state: FilmState; take: TakeRef }) {
  const url = take.sent ? `/api/films/${state.film.slug}/sent?p=${encodeURIComponent(take.sent)}` : undefined;
  const { data, error, loading } = useJson<SentRecord>(url, state.updatedAt);
  if (!take.sent) {
    return (
      <section aria-label="What was sent to the model" className="flex flex-col gap-1.5">
        <span className="lbl">Sent to the model</span>
        <p className="m-0 text-[12.5px] text-sub">No record of what was sent to the model for this take.</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section aria-label="What was sent to the model" className="flex flex-col gap-1.5">
        <span className="lbl">Sent to the model</span>
        <p className="m-0 text-[12.5px] text-sub">{loading ? 'Reading what was sent…' : `Could not read what was sent: ${error}`}</p>
      </section>
    );
  }
  return <SentRecordView key={data.path} rec={data} state={state} take={take} />;
}

function SentRecordView({ rec, state, take }: { rec: SentRecord; state: FilmState; take: TakeRef }) {
  const [hot, setHot] = useState<string>();
  const parts = useMemo(() => promptParts(rec.prompt.text), [rec.prompt.text]);
  // how often the prompt names each reference: by its number, its [TAG], a run ("IMAGE REFERENCES 12 TO 18" names
  // each storyboard page in it) or a panel on its page (lib/shotDetails.ts)
  const named = useMemo(() => namedCounts(rec.prompt.text, rec.refs), [rec.prompt.text, rec.refs]);
  const s = rec.settings;
  const allSettings = [
    ['model', rec.model], ['mode', s.mode], ['aspect_ratio', s.aspect], ['resolution', s.resolution], ['duration', s.duration], ['draft', s.draft],
    ['generate_audio', s.audio], ['seed', s.seed === null ? 'none' : s.seed], ['count', s.count], ['use_unlim', s.unlim], ...s.more,
  ].filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n');
  const at = rec.submitted ? `${fmtDate(rec.submitted)} ${/T(\d\d:\d\d)/.exec(rec.submitted)?.[1] ?? ''}`.trim() : '';
  const counts = (['VIDEO', 'IMAGE', 'AUDIO'] as const).map((k) => [k, rec.refs.filter((r) => r.kind === k).length] as const).filter(([, n]) => n)
    .map(([k, n]) => `${n} ${k === 'VIDEO' ? (n === 1 ? 'video' : 'videos') : k === 'IMAGE' ? (n === 1 ? 'image' : 'images') : 'audio'}`).join(' · ');
  const lay = rec.layout;
  const madeFrom = [lay?.previzTakeNumber !== undefined ? `previz take ${lay.previzTakeNumber}` : '', lay?.storyboardVersion ? `storyboard ${lay.storyboardVersion}` : ''].filter(Boolean).join(' and ');

  return (
    <section aria-label="What was sent to the model" className="line-in flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-2">
          <span className="lbl">Sent to the model</span>
          <span className="text-[12px] text-mute">{[at, rec.jobId ? `job ${rec.jobId.slice(0, 8)}` : ''].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-mono text-[11px] text-mute" title={rec.path}>{rec.path.split('/').pop()}</span>
          {/* the whole page of it, at the take's first shot */}
          {take.path && <Link href={shotDetailsHref(state.film.slug, take.path, 1)} className="flex-none whitespace-nowrap rounded-[7px] border border-edge-strong bg-raised px-2 py-[3px] text-[12.5px] text-ink no-underline transition-colors hover:border-sub">Shot details ›</Link>}
        </span>
      </div>
      <p className="m-0 font-mono text-[12px] leading-normal text-ink-2" title={`${allSettings}${rec.settingsFrom ? `\n\nfrom ${rec.settingsFrom}` : ''}`} data-sent="settings">{settingsLine(rec)}</p>
      {rec.differences.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {rec.differences.map((d) => <li key={d} className="flex items-baseline gap-2 text-[12.5px] text-warn"><span className="size-1.5 flex-none rounded-full border border-warn" />{d}</li>)}
        </ul>
      )}

      {rec.refs.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="flex items-baseline gap-2"><span className="lbl">References · in the order sent</span><span className="text-[12px] text-mute">{counts}</span></span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2 max-[760px]:grid-cols-3 max-[420px]:grid-cols-2">
            {rec.refs.map((r) => <SentTile key={r.order} r={r} rec={rec} state={state} hot={hot === r.label} named={named.get(r.order) ?? 0} onHot={setHot} />)}
          </div>
        </div>
      )}

      <PromptAsSent rec={rec} parts={parts} hot={hot} onHot={setHot} known={new Set(rec.refs.map((r) => r.label))} />

      <span className="text-[12px] leading-normal text-mute">
        {[madeFrom ? `Made from ${madeFrom}` : '', rec.spend?.row ? `spend.md: ${rec.spend.cost ?? 'logged'}` : '', rec.settingsFrom ? `settings from ${rec.settingsFrom}` : ''].filter(Boolean).join(' · ')}
      </span>
    </section>
  );
}

/** One reference as it went: the picture, the clip or the sound, its number as the prompt names it, its tag and what it is. */
function SentTile({ r, rec, state, hot, named, onHot }: { r: SentRef; rec: SentRecord; state: FilmState; hot: boolean; named: number; onHot: (l?: string) => void }) {
  const ui = useUI();
  const path = r.file ? repoPath(state.film.folder, state.film.repo, r.file) : undefined;
  const id = `sent:${rec.take}:${r.label}`;
  const tag = r.tag ? r.tag.charAt(0) + r.tag.slice(1).toLowerCase() : '';
  return (
    <div data-sent-ref={r.name} onMouseEnter={() => onHot(r.label)} onMouseLeave={() => onHot(undefined)}
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-[8px] border bg-panel transition-colors duration-150', hot || ui.hasChip(id) ? 'border-sub' : 'border-edge', r.missing && 'border-dashed border-bad/60')}>
      {r.kind === 'AUDIO' ? (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-tile px-2">
          <span className="max-w-full truncate font-mono text-[10.5px] text-mute">{r.file?.split('/').pop() ?? 'no file'}</span>
          {path && !r.missing && <audio controls preload="none" src={mediaUrl(path)} className="h-8 w-full" aria-label={`Play ${r.name}`} />}
        </div>
      ) : (
        <Media path={path} w={320} t={1} fit="contain" play={isVideoPath(r.file)} className="aspect-[4/3] w-full bg-black" missingLabel={r.missing || !path ? 'missing' : undefined} />
      )}
      <button type="button" onClick={() => ui.addChip({ id, label: `${rec.take} · sent ${r.name}${tag ? ` ${tag}` : ''}`, ref: path })}
        title={[`${r.name} (${r.label})${r.tag ? ` · ${r.tag}` : ''}`, r.desc, r.file, r.uploaded ? `uploaded ${fmtDate(r.uploaded)}` : ''].filter(Boolean).join('\n')}
        aria-label={`Add ${r.name}${tag ? ` ${tag}` : ''} to what Alma sees`}
        className="flex min-w-0 cursor-pointer flex-col gap-0.5 border-t border-line px-2 py-1.5 text-left hover:bg-raised">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="flex-none font-mono text-[11px] text-ink">{r.name}</span>
          {tag && <span className="truncate text-[12px] font-medium text-ink-2">{tag}</span>}
        </span>
        <span className={cn('truncate text-[11px]', r.missing ? 'text-bad' : named ? 'text-sub' : 'text-warn')}>
          {r.missing ? `missing · ${r.file}` : named ? `${r.what}${named > 1 ? ` · named ${named}×` : ''}` : `${r.what} · not named in the prompt`}
        </span>
      </button>
    </div>
  );
}

/** The prompt exactly as sent, its references marked; folded to about 12 lines, opening smoothly. */
function PromptAsSent({ rec, parts, hot, onHot, known }: { rec: SentRecord; parts: { text: string; label?: string }[]; hot?: string; onHot: (l?: string) => void; known: Set<string> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const [full, setFull] = useState<number>();
  const lines = rec.prompt.text.split('\n').length;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setFull(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rec.prompt.text]);
  const long = full !== undefined ? full > FOLDED + 24 : lines > 12;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="lbl">Prompt as sent</span>
        {rec.prompt.version && <span className="font-mono text-[12px] text-ink">{rec.prompt.version}</span>}
        <span className="text-[12px] text-mute">{rec.prompt.chars.toLocaleString('en-GB')} chars · {lines} lines{rec.prompt.sameAsFile === false ? '' : rec.prompt.file ? ` · the same as ${rec.prompt.file.split('/').pop()}` : ''}</span>
        {rec.prompt.sameAsFile === false && <span className="text-[12px] text-warn">differs from {rec.prompt.file?.split('/').pop() ?? 'the prompt file'}</span>}
      </span>
      <div className="relative">
        <div className="overflow-hidden rounded-[9px] border border-edge bg-well transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
          style={{ maxHeight: !long ? undefined : open ? (full ?? 4000) + 2 : FOLDED }}>
          <pre ref={box} data-sent="prompt" className="m-0 whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[11.5px] leading-[1.6] text-ink-3">
            {parts.map((p, i) => (p.label && known.has(p.label)
              ? <span key={i} onMouseEnter={() => onHot(p.label)} onMouseLeave={() => onHot(undefined)}
                className={cn('rounded-[3px] px-0.5 text-ink transition-colors [box-decoration-break:clone] duration-150', hot === p.label ? 'bg-edge-strong' : 'bg-raised')}>{p.text}</span>
              : <span key={i}>{p.text}</span>))}
          </pre>
        </div>
        <span aria-hidden="true" className={cn('pointer-events-none absolute inset-x-px bottom-px h-12 rounded-b-[9px] bg-gradient-to-t from-well to-transparent transition-opacity duration-300', long && !open ? 'opacity-100' : 'opacity-0')} />
      </div>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex w-max cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-sub hover:text-ink">
          <IconChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />{open ? 'Fold the prompt' : `Show the whole prompt · ${lines} lines`}
        </button>
      )}
    </div>
  );
}
