'use client';
// One generation as the go shows it: the scene, its shots, the prompt text (with its diff to the version before),
// every reference of the media list at the number the prompt cites it by, the check's verdict, the prompt QC and
// the credits. Used for every scene on /films/[film]/go and for one scene in the Scene page's prompt panel.
// Every click adds a chip to "Alma sees"; nothing here spends. design/boards/Scene-S9.dc.html "prompt → quote → go".
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FilmState, GoMediaItem, GoReview, GoScene, GoShot } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { fmtDate, fmtSecs, repoPath, takeLabel } from '@/components/lib/format';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import { withPickupCheck } from '@/components/lib/pickupCheck';
import { QCChip } from '@/components/shell/QCChip';
import { Badge, Btn } from '@/components/shell/atoms';
import { IconChevronDown, IconFile } from '@/components/shell/icons';
import { Media, isVideoPath, mediaUrl } from '@/components/media/Media';
import { creditsBasis, fmtCr } from './lib';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/shell/Reveal';

const CLAMP = 12;

/** The shot strip: one block per shot, as wide as its seconds, with its number, name and length. */
export function ShotStrip({ scene }: { scene: GoScene }) {
  const ui = useUI();
  const shots = scene.shots;
  if (!shots.length) return <span className="text-[12.5px] text-mute">No shots file yet.</span>;
  const len = (s: GoShot) => (s.t0 !== undefined && s.t1 !== undefined ? Math.max(0.2, s.t1 - s.t0) : undefined);
  const timed = shots.every((s) => len(s) !== undefined);
  return (
    <div className="scroll flex gap-1 overflow-x-auto pb-0.5">
      {shots.map((s) => {
        const sec = len(s);
        const id = `shot:${scene.id}-${s.id}`;
        const label = `${scene.id} · shot ${s.id}${s.name ? ` ${s.name.toLowerCase()}` : ''}`;
        return (
          <button key={s.id} type="button" onClick={() => ui.addChip({ id, label })} title={[`Shot ${s.id}`, s.name, s.facing ? `camera facing ${s.facing}` : '', sec !== undefined ? fmtSecs(Math.round(sec * 10) / 10) : ''].filter(Boolean).join(' · ')}
            className={cn('flex h-[46px] min-w-[58px] cursor-pointer flex-col items-start justify-between overflow-hidden rounded-[6px] border px-2 py-1.5 text-left', ui.hasChip(id) ? 'border-sub bg-raised' : 'border-edge bg-panel hover:border-sub')}
            style={{ flex: timed ? `${sec} 1 0` : '1 1 0' }}>
            <span className="flex w-full items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="flex-none font-mono text-[11px] text-ink">{s.id}</span>
              <span className="truncate text-[11.5px] text-ink-3">{s.name ? s.name.charAt(0) + s.name.slice(1).toLowerCase() : ''}</span>
            </span>
            <span className="w-full truncate whitespace-nowrap font-mono text-[10.5px] text-mute">{sec !== undefined ? `${(Math.round(sec * 10) / 10).toFixed(1)} s` : ''}{s.facing ? ` · ${s.facing}` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

type Row = { op: '=' | '+' | '-'; text: string; n?: number };

/** The prompt in monospace: 12 lines, then "Show all"; or its line diff to the version before (changed lines with
 *  two lines of context, the unchanged runs folded). */
export function PromptText({ scene }: { scene: GoScene }) {
  const p = scene.prompt;
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState(false);
  const lines = useMemo(() => (p?.text ?? '').replace(/\s+$/, '').split('\n'), [p?.text]);
  const rows = useMemo<Row[]>(() => {
    if (!p?.previous) return [];
    const out: Row[] = [];
    let at = 0;
    for (const d of p.previous.diff) {
      if (d.op === '-') for (const l of d.lines) out.push({ op: '-', text: l });
      else for (let k = 0; k < d.count; k++, at++) out.push({ op: d.op, text: lines[at] ?? '', n: at + 1 });
    }
    return out;
  }, [p?.previous, lines]);
  if (!p) return null;
  const hunks = (() => {
    // keep changed rows and two rows around them; fold the rest into "… n unchanged lines"
    const keep = rows.map((r) => r.op !== '=');
    const near = rows.map((_, i) => keep.slice(Math.max(0, i - 2), i + 3).some(Boolean));
    const out: (Row | { fold: number })[] = [];
    let fold = 0;
    rows.forEach((r, i) => {
      if (near[i]) {
        if (fold) out.push({ fold });
        fold = 0;
        out.push(r);
      } else fold++;
    });
    if (fold) out.push({ fold });
    return out;
  })();
  // folded, the box shows 12 lines of text (wrapped lines count), then a fade and "Show all"
  const long = lines.length > CLAMP || p.chars > 1400;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <span className="lbl">Prompt</span>
          <span className="font-mono text-[12px] text-ink">{p.version}</span>
          <span className="text-[12px] text-mute">{p.chars.toLocaleString('en-GB')} chars · {lines.length} lines</span>
        </span>
        {p.previous && (
          <span className="inline-flex gap-0.5 rounded-lg border border-edge bg-panel p-0.5" role="group" aria-label="Prompt view">
            <button type="button" aria-pressed={!diff} onClick={() => setDiff(false)} className={cn('cursor-pointer rounded-md px-2.5 py-0.5 text-[12px] font-medium', !diff ? 'bg-edge text-ink' : 'text-sub')}>Text</button>
            <button type="button" aria-pressed={diff} onClick={() => setDiff(true)} className={cn('cursor-pointer rounded-md px-2.5 py-0.5 text-[12px] font-medium', diff ? 'bg-edge text-ink' : 'text-sub')}>
              Diff to {p.previous.version} <span className="font-mono text-[11px] text-ok">+{p.previous.added}</span> <span className="font-mono text-[11px] text-bad">−{p.previous.removed}</span>
            </button>
          </span>
        )}
      </div>
      {diff && p.previous ? (
        <div className="scroll max-h-[520px] overflow-auto rounded-[9px] border border-edge bg-well py-2 font-mono text-[11.5px] leading-[1.6]">
          {hunks.length ? hunks.map((h, i) => ('fold' in h
            ? <div key={i} className="px-3 py-0.5 text-[11px] text-mute">… {h.fold} unchanged {h.fold === 1 ? 'line' : 'lines'}</div>
            : (
              <div key={i} className={cn('grid grid-cols-[18px_minmax(0,1fr)] gap-1 px-3', h.op === '+' && 'bg-[#22c55e14] text-ink', h.op === '-' && 'bg-[#f8717114] text-sub line-through decoration-[#f8717180]', h.op === '=' && 'text-mute')}>
                <span className={cn('select-none text-center', h.op === '+' ? 'text-ok' : h.op === '-' ? 'text-bad' : 'text-faint')}>{h.op === '=' ? '' : h.op === '+' ? '+' : '−'}</span>
                <span className="whitespace-pre-wrap break-words">{h.text || ' '}</span>
              </div>
            ))) : <div className="px-3 text-sub">Same text as {p.previous.version}.</div>}
        </div>
      ) : (
        <div className="relative">
          <pre className={cn('scroll m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-[9px] border border-edge bg-well px-3.5 py-3 font-mono text-[11.5px] leading-[1.6] text-ink-3', long && !open && 'max-h-[245px] overflow-hidden')}>{lines.join('\n')}</pre>
          {long && !open && <span aria-hidden="true" className="pointer-events-none absolute inset-x-px bottom-px h-12 rounded-b-[9px] bg-gradient-to-t from-well to-transparent" />}
        </div>
      )}
      {!diff && long && (
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex w-max cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-sub hover:text-ink">
          <IconChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />{open ? `Fold to ${CLAMP} lines` : `Show the whole prompt · ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

/** One reference: the picture (clips play in place, voice lines as audio) with its number, tag and what it is. */
function MediaTile({ m, s, scene }: { m: GoMediaItem; s: FilmState; scene: GoScene }) {
  const ui = useUI();
  const path = repoPath(s.film.folder, s.film.repo, m.file);
  const id = `ref:${scene.id}:${scene.prompt?.version}:${m.ref}`;
  const chip = () => ui.addChip({ id, label: `${scene.id} · ${m.ref} ${m.tag.toLowerCase()} · ${m.what}`, ref: path });
  const audio = m.kind === 'AUDIO';
  return (
    <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-[8px] border bg-panel', ui.hasChip(id) ? 'border-sub' : 'border-edge', m.missing && 'border-dashed border-bad/60')}>
      {audio ? (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-tile px-2">
          <span className="font-mono text-[10.5px] text-mute">{m.file.split('/').pop()}</span>
          {!m.missing && <audio controls preload="none" src={mediaUrl(path)} className="h-8 w-full" />}
        </div>
      ) : (
        <Media path={path} w={320} t={1} fit="contain" play={isVideoPath(m.file)} className="aspect-[4/3] w-full bg-black" missingLabel={m.missing ? 'missing' : undefined} />
      )}
      <button type="button" onClick={chip} title={m.desc ? `${m.ref} · ${m.tag}\n${m.desc}` : `${m.ref} · ${m.tag}`} aria-label={`Add ${m.ref} ${m.tag} to what Alma sees`}
        className="flex min-w-0 cursor-pointer flex-col gap-0.5 border-t border-line px-2 py-1.5 text-left hover:bg-raised">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="flex-none font-mono text-[11px] text-ink">{m.ref}</span>
          <span className="truncate text-[12px] font-medium text-ink-2">{m.tag.charAt(0) + m.tag.slice(1).toLowerCase()}</span>
        </span>
        <span className={cn('truncate text-[11px]', m.missing ? 'text-bad' : 'text-sub')}>{m.missing ? `missing · ${m.file}` : m.what}</span>
      </button>
    </div>
  );
}

/** The media list as sent: the references in order, video first, then images (sheets, props, views, board pages), then audio. */
export function MediaList({ scene, s }: { scene: GoScene; s: FilmState }) {
  const media = scene.prompt?.media;
  if (!media) return <span className="text-[12.5px] text-warn">No media list for {scene.prompt?.version ?? 'this prompt'}: the go cannot send it.</span>;
  const set = media.settings;
  const counts = (['VIDEO', 'IMAGE', 'AUDIO'] as const).map((k) => [k, media.items.filter((m) => m.kind === k).length] as const).filter(([, n]) => n);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-2">
          <span className="lbl">References · in the order sent</span>
          <span className="text-[12px] text-mute">{counts.map(([k, n]) => `${n} ${k === 'VIDEO' ? (n === 1 ? 'video' : 'videos') : k === 'IMAGE' ? (n === 1 ? 'image' : 'images') : 'audio'}`).join(' · ')}</span>
        </span>
        <span className="font-mono text-[11px] text-mute" title={media.path}>{media.path.split('/').pop()}{scene.prompt?.takeMediasPath ? ' · uploaded' : ''}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2 max-[760px]:grid-cols-3 max-[420px]:grid-cols-2">
        {media.items.map((m) => <MediaTile key={`${m.kind}${m.n}:${m.order}`} m={m} s={s} scene={scene} />)}
      </div>
      <span className="text-[12px] leading-normal text-mute">
        {[set.model, set.mode, set.duration !== undefined ? `${set.duration} s` : '', set.aspect, set.resolution ? `${set.resolution}${set.draft ? ' draft' : ''}` : '', set.audio ? 'audio' : '']
          .filter(Boolean).join(' · ')}
        {media.previzTake ? ` · previz ${media.previzTake.split('/').pop()?.replace(/\.json$/, '').replace(/^S\d+-/, '')}` : ''}
        {media.storyboard ? ` · boards ${media.storyboard.split('/').pop()}` : ''}
      </span>
    </div>
  );
}

/** The check's verdict, its summary line, and every line on demand. */
export function CheckLine({ scene }: { scene: GoScene }) {
  const [open, setOpen] = useState(false);
  const c = scene.prompt?.check;
  if (!scene.prompt) return null;
  if (!c) return <span className="inline-flex items-center gap-2 text-[12.5px] text-warn"><span className="size-1.5 rounded-full border border-warn" />No check for {scene.prompt.version} yet</span>;
  const pass = c.verdict === 'pass';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 cursor-pointer items-center gap-2 text-left text-[12.5px]">
        <span className={cn('inline-flex h-5 flex-none items-center gap-1.5 rounded-[6px] border px-1.5 text-[11px] font-medium', pass ? 'border-ok/50 text-ok' : 'border-bad/60 text-bad')}>
          <span className={cn('size-1.5 rounded-full', pass ? 'bg-ok' : 'bg-bad')} />check {pass ? 'PASS' : c.verdict === 'fail' ? 'STOP' : 'no verdict'}
        </span>
        <span className="truncate font-mono text-[11px] text-sub">{c.summary}</span>
        <IconChevronDown size={12} className={cn('flex-none text-mute transition-transform', open && 'rotate-180')} />
      </button>
      <Reveal open={open}><pre className="scroll m-0 overflow-x-auto whitespace-pre-wrap rounded-[8px] border border-line bg-well px-3 py-2 font-mono text-[11px] leading-[1.55] text-sub">{c.lines.join('\n')}</pre></Reveal>
    </div>
  );
}

/** The scene's prompt QC (qc/prompt-<S>-r<n>.json), the shared chip and popover; a pick-up's own prompt check
 *  (qc/prompt-FIX-<name>-r<n>.json) when it has one, the scene's kept as the earlier one. */
export function PromptQC({ scene, s }: { scene: GoScene; s: FilmState }) {
  const v = scene.prompt?.version;
  return <QCChip spec={qcSpec('prompt')} targets={withPickupCheck(s, 'prompt', { target: scene.id, label: `${scene.id} prompt${v ? ` ${v}` : ''}`, entry: qcEntry(s, 'prompt', scene.id), ready: !!v, waitsFor: v ? `${scene.id} prompt ${v}` : `${scene.id}'s first prompt` })} />;
}

/** "≈ 75 cr", the basis on hover. */
export function Credits({ scene, review, big }: { scene: GoScene; review?: GoReview; big?: boolean }) {
  if (scene.credits === undefined) return <span className="text-[12px] text-mute" title={creditsBasis(scene, review)}>no quote</span>;
  return (
    <span title={creditsBasis(scene, review)} className={cn('cursor-help whitespace-nowrap tabular-nums', big ? 'text-[15px] font-semibold' : 'text-[13px] font-medium')}>
      ≈ {fmtCr(scene.credits)}
    </span>
  );
}

export function GoSceneCard({ scene, s, review, selected, onSelect, base }: {
  scene: GoScene; s: FilmState; review?: GoReview; selected: boolean; onSelect: () => void; base: string;
}) {
  const ui = useUI();
  const p = scene.prompt;
  const chip = { id: `scene:${scene.id}`, label: `${scene.id} · ${scene.title}${p ? ` · prompt ${p.version}` : ''}`, ref: p ? repoPath(s.film.folder, s.film.repo, p.path) : undefined };
  const state = scene.ready ? 'Ready' : 'Not ready';
  return (
    <article id={`go-${scene.id}`} aria-label={`${scene.id} ${scene.title}`}
      className={cn('flex min-w-0 scroll-mt-4 flex-col rounded-[12px] border bg-well', selected ? 'border-sub' : 'border-edge', !scene.ready && 'border-dashed')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-3.5">
        <button type="button" onClick={() => { onSelect(); ui.addChip(chip); }} aria-pressed={selected} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-[12.5px] text-sub">{scene.id}</span>
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{scene.title}</span>
            <Badge dashed={!scene.ready} dim={!scene.ready}>{state}</Badge>
            {scene.takes > 0 && <Badge dim>{scene.takes} {scene.takes === 1 ? 'take' : 'takes'} already</Badge>}
          </span>
          <span className="text-[12.5px] leading-normal text-sub">
            {[scene.duration !== undefined ? `${scene.duration} s generation` : '', scene.shots.length ? `${scene.shots.length} shots` : '',
              p ? `prompt ${p.version}${scene.versions.length > 1 ? ` of ${scene.versions.length}` : ''}` : 'no prompt',
              p?.media ? `${p.media.items.length} references` : '',
              scene.lastTake ? `${takeLabel(scene.lastTake.id)}${scene.lastTake.version ? ` from ${scene.lastTake.version}` : ''}${scene.lastTake.date ? ` (${fmtDate(scene.lastTake.date)})` : ''}` : '']
              .filter(Boolean).join(' · ')}
          </span>
        </button>
        <span className="flex flex-none flex-col items-end gap-1.5">
          <Credits scene={scene} review={review} big />
          <PromptQC scene={scene} s={s} />
        </span>
      </div>

      {(scene.blockers.length > 0 || scene.warnings.length > 0) && (
        <ul className="m-0 flex list-none flex-col gap-1 border-b border-line px-4 py-2.5">
          {scene.blockers.map((b) => <li key={b} className="flex items-baseline gap-2 text-[12.5px] text-warn"><span className="size-1.5 flex-none translate-y-[-1px] rounded-full bg-warn" />Not in the go: {b}</li>)}
          {scene.warnings.map((w) => <li key={w} className="flex items-baseline gap-2 text-[12.5px] text-ink-3"><span className="size-1.5 flex-none translate-y-[-1px] rounded-full border border-warn" />{w}</li>)}
        </ul>
      )}

      <div className="flex min-w-0 flex-col gap-4 px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="lbl">Shots</span>
          <ShotStrip scene={scene} />
        </div>
        <PromptText scene={scene} />
        <MediaList scene={scene} s={s} />
        <CheckLine scene={scene} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-mute">{p ? repoPath(s.film.folder, s.film.repo, p.path) : repoPath(s.film.folder, s.film.repo, scene.folder)}</span>
        <span className="flex flex-none gap-2">
          <Link href={`${base}/scenes/${scene.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-sub no-underline hover:text-ink"><IconFile size={13} />Open {scene.id}</Link>
          <Btn onClick={() => { onSelect(); ui.about(chip, `${scene.id} ${scene.title}${p ? ` (prompt ${p.version})` : ''}`, `Ask Alma about ${scene.id}…`); }}>Ask Alma about {scene.id}</Btn>
        </span>
      </div>
    </article>
  );
}
