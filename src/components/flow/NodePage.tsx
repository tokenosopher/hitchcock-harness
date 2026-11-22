'use client';
// What a step other than the gate shows under the flow board: its content straight under the tab row (ASKS 46, as
// drawn: no stage label, title or paragraph above it). Its QC chips sit at the right of the tab row (NodeRight).
// Previz shows the shot plan with each scene's previz. The steps that are their own page (Story, Scenes, Finish,
// Sound, Release; lib/flow.ts PAGE_STEPS) open that page from the flow and never show here.
import Link from 'next/link';
import type { FlowNode } from '@/components/lib/flow';
import type { Part } from '@/components/lib/derive';
import { fmtClock, repoPath } from '@/components/lib/format';
import { Media, mediaUrl } from '@/components/media/Media';
import { Dot, type DotState } from '@/components/shell/atoms';
import { QCChip } from '@/components/shell/QCChip';
import { qcSpecsFor, qcStatus, type QCSpec } from '@/components/lib/qc';
import { QCPanel, targetStatus } from '@/components/qc/QCPanel';
import { qcTargets } from '@/components/qc/targets';
import { useState } from 'react';
import { IconChevronRight } from '@/components/shell/icons';
import type { FilmState } from '@/server/types';
import { cn } from '@/lib/utils';
import { Feed } from '@/components/feed/Feed';
import { VideoShelf, day, newestFirst } from '@/components/media/Shelf';
import type { FlowKey } from '@/components/lib/derive';
import { LocationsStep, PlaceDeep, ViewsStep } from './Places';
import { EditNext, ShotsStep } from './CutSteps';
import { CharacterCards, type CastPart } from '@/components/characters/Cards';
import { RunningLines } from './RunningNow';
import { rememberBack } from '@/components/shell/BackLink';

/** The flow's people steps: each shows the same Characters cards with its own part to the fore. */
const CAST_STEP: Partial<Record<FlowKey, CastPart>> = { faces: 'faces', clothing: 'clothing', sheet: 'sheet', voices: 'voices', elements: 'elements' };

const partDot = (p: Part): DotState => (p.state === 'done' ? 'done' : p.state === 'running' ? 'running' : p.state === 'queued' ? 'queued' : p.state === 'ready' ? 'ready' : 'waiting');

function Rows({ parts, onChip }: { parts: Part[]; onChip: (id: string, label: string) => void }) {
  if (!parts.length) return null;
  return (
    <div className="overflow-hidden rounded-[10px] border border-edge">
      {parts.map((p, i) => (
        <button key={`${p.id}:${p.name}:${i}`} type="button" onClick={() => onChip(`part:${p.id || p.name}`, [p.id, p.name].filter(Boolean).join(' · '))}
          className={cn('box-border flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-2 text-left text-ink hover:bg-tile', i > 0 && 'border-t border-line')}>
          <Dot state={partDot(p)} className={p.state === 'ready' ? 'outline outline-1 outline-offset-1 outline-ink' : undefined} />
          {p.id && <span className="w-14 flex-none font-mono text-[12px] text-sub">{p.id}</span>}
          <span className="min-w-0 flex-[0_1_220px] truncate text-[13.5px]">{p.name}</span>
          <span className="ml-auto min-w-0 truncate text-right text-[12.5px] text-sub">{p.line}</span>
          {p.aims.filter((a) => a.task.state === 'running').slice(0, 1).map((a) => <span key={a.task.id} className="hidden flex-none text-[11.5px] text-ink-3 min-[900px]:inline">{a.task.title}</span>)}
        </button>
      ))}
    </div>
  );
}

const MANY: Record<string, string> = { sheet: 'sheets', views: 'views', previz: 'previz & boards', prompt: 'prompts', take: 'take checks' };

/** The node's QC chips, the same specs and targets as its stage page (src/components/lib/qc.ts). */
function NodeQC({ s, n }: { s: FilmState; n: FlowNode }) {
  const specs = qcSpecsFor(n.key);
  if (!specs.length) return null;
  return <>{specs.map((spec: QCSpec) => <QCChip key={spec.stage} spec={spec} targets={qcTargets(s, spec.stage)} chipLabel={MANY[spec.stage]} />)}</>;
}

/** Previz and storyboards: the QC panel is the page's main content (design/boards/Previz.dc.html), one scene
 *  at a time; the title row's chip scrolls to it. */
function PrevizQC({ s, onChip }: { s: FilmState; onChip: (id: string, label: string) => void }) {
  const targets = qcTargets(s, 'previz');
  // the scene graded last, else the first scene with a previz
  const graded = targets.filter((t) => t.entry).sort((a, b) => (b.entry!.latest.at || '').localeCompare(a.entry!.latest.at || ''));
  const [sel, setSel] = useState<string>();
  const t = targets.find((x) => x.target === sel) ?? graded[0] ?? targets.find((x) => x.ready) ?? targets[0];
  if (!t) return null;
  const spec = qcSpecsFor('previz')[0];
  const goQc = () => { onChip(`qc:previz:${t.pickup ?? t.target}`, `QC · ${t.label}`); document.getElementById('qc')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  return (
    <>
      <div role="tablist" aria-label="Scenes" className="flex flex-nowrap gap-1.5 overflow-x-auto">
        {targets.map((x) => {
          const sc = s.scenes.find((y) => y.id === x.target);
          const on = x.target === t.target;
          return (
            <button key={x.target} role="tab" type="button" aria-selected={on} title={`QC · ${x.label} · ${targetStatus(x)}`}
              onClick={() => { setSel(x.target); onChip('scene', `${x.target} · previz`); }}
              className={cn('inline-flex h-[30px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2.5 text-[12px]', on ? 'border-faint bg-raised text-ink' : 'border-line bg-transparent text-sub hover:text-ink')}>
              <span className="font-mono text-[11.5px]">{x.target}</span>
              <span className="tabular-nums text-mute">{x.entry ? (x.entry.latest.score === null ? '–' : x.entry.latest.score.toFixed(1)) : sc?.shots ?? ''}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">{s.scenes.find((y) => y.id === t.target)?.title ?? t.target}</span>
        <button type="button" onClick={goQc} aria-label={`QC · ${t.label} · ${qcStatus(t.entry)}`}
          className={cn('inline-flex h-7 flex-none cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-[14px] border px-[11px] text-[12px] font-medium tabular-nums text-ink', t.entry ? 'border-faint bg-panel' : 'border-dashed border-edge-strong')}>
          <span className={cn('size-1.5 rounded-full', t.entry ? 'bg-ink' : 'border border-mute')} />QC · {t.label} · {qcStatus(t.entry)}
        </button>
      </div>
      <div id="qc" className="scroll-mt-4">
        <QCPanel key={t.target} spec={spec} t={t} lockWord="Lock previz" />
      </div>
    </>
  );
}

function PrevizPage({ s, onChip }: { s: FilmState; onChip: (id: string, label: string) => void }) {
  const pv = s.previz?.film[s.previz.film.length - 1];
  const pb = s.previz?.storyboards[s.previz.storyboards.length - 1];
  const total = s.scenes.reduce((a, sc) => a + (sc.seconds ?? 0), 0);
  const locked = s.script?.versions.find((v) => v.locked);
  return (
    <>
      <PrevizQC s={s} onChip={onChip} />
      {(pv || pb) && (
        <div className="flex flex-wrap items-start gap-4">
          {pv && (
            <div className="flex flex-col gap-1.5">
              <Media path={repoPath(s.film.folder, s.film.repo, pv.path)} w={640} t={1} play fit="contain" onPlay={() => onChip(`previz:${pv.version}`, `previz ${pv.version}`)}
                className={cn('rounded-[9px] border border-edge bg-black', (s.film.aspect ?? '9:16') === '9:16' ? 'aspect-[9/16] w-[200px]' : 'aspect-[16/9] w-[360px]')} />
              <span className="text-[12px] text-sub">Previz film {pv.version}</span>
            </div>
          )}
          {pb && (
            <div className="flex flex-col gap-1.5">
              <a href={mediaUrl(repoPath(s.film.folder, s.film.repo, pb.path))} target="_blank" rel="noreferrer" aria-label={`Open storyboards ${pb.version}`} className="block rounded-[9px] hover:opacity-90">
                <Media path={repoPath(s.film.folder, s.film.repo, pb.path)} w={640} fit="contain" className="aspect-[11/8.5] w-[460px] max-w-full rounded-[9px] border border-edge" />
              </a>
              <span className="text-[12px] text-sub">Storyboards {pb.version} · page 1 · opens the PDF</span>
            </div>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-[10px] border border-edge">
        <div className="flex items-center justify-between border-b border-line bg-well px-4 py-3">
          <span className="lbl">Shot plan · script {locked?.version ?? s.script?.current ?? ''}</span>
          <span className="text-[12px] text-sub">{s.scenes.length} scenes{total ? <> · <span className="font-mono">{fmtClock(total)}</span></> : null}</span>
        </div>
        <div className="grid grid-cols-[52px_minmax(0,1fr)_64px_120px] items-center gap-x-3 border-b border-line px-4 py-2 text-[11.5px] text-sub max-[760px]:grid-cols-[40px_minmax(0,1fr)_52px]">
          <span>Scene</span><span>Name</span><span className="text-right">Length</span><span className="max-[760px]:hidden">Previz · boards</span>
        </div>
        {s.scenes.map((sc) => (
          <button key={sc.id} type="button" onClick={() => onChip(`scene:${sc.id}`, `${sc.id} · ${sc.title}`)}
            className="box-border grid h-11 w-full cursor-pointer grid-cols-[52px_minmax(0,1fr)_64px_120px] items-center gap-x-3 border-0 border-b border-line bg-transparent px-4 text-left text-[13.5px] text-ink last:border-b-0 hover:bg-tile max-[760px]:grid-cols-[40px_minmax(0,1fr)_52px]">
            <span className="font-mono text-[12px] text-sub">{sc.id}</span>
            <span className="flex min-w-0 items-center gap-2.5">
              {sc.previzPath && <Media path={repoPath(s.film.folder, s.film.repo, sc.previzPath)} w={160} t={1} missingLabel="" className="aspect-[9/16] h-9 flex-none rounded-[3px] border border-line" />}
              <span className="truncate">{sc.title}</span>
            </span>
            <span className="text-right text-[13px] tabular-nums text-ink-3">{sc.seconds ? `${sc.seconds} s` : '—'}</span>
            <span className="text-[12px] text-mute max-[760px]:hidden">{pv ? `${pv.version} · ${pb?.version ?? '—'}` : sc.previzPath ? (/take-(\d+)/.exec(sc.previzPath)?.[1] ? `take ${/take-(\d+)/.exec(sc.previzPath)![1]}` : 'made') : 'not started'}</span>
          </button>
        ))}
      </div>
      <Feed query="place=previz" note="previz and board versions" from="the Previz node on Main" />
    </>
  );
}

/** The first letter up, except a version: "v4 locked" stays "v4 locked". */
const capitalFirst = (t: string) => (/^v\d/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1));

/** At the right of the tab row: the step's QC chips, and on Edit "Open the timeline", which opens the Edit page. */
export function NodeRight({ s, n, base }: { s: FilmState; n: FlowNode; base: string }) {
  const qc = qcSpecsFor(n.key).length > 0;
  if (!qc && n.key !== 'edit') return null;
  const link = 'inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-lg border border-edge-strong px-3 text-[12.5px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-raised max-[760px]:h-11';
  return (
    <>
      <NodeQC s={s} n={n} />
      {n.key === 'edit' && <Link href={`${base}/edit?tab=next`} onClick={() => rememberBack(`${base}/edit`, 'Back to Edit')} data-open-timeline className={link}>Open the timeline<IconChevronRight size={13} /></Link>}
    </>
  );
}


export function NodePage({ s, n, base, onChip, at, onAt }: {
  s: FilmState; n: FlowNode; base: string; onChip: (id: string, label: string, ref?: string) => void;
  /** A place opened inside the Locations or Views step. */
  at?: string;
  onAt?: (id: string) => void;
}) {
  // before the script is locked there are no scenes: the step says so instead of showing nothing (QC round two)
  if ((n.key === 'previz' || n.key === 'shots') && !s.scenes.length) return <p data-no-scenes className="m-0 text-[13px] leading-normal text-sub">No scenes yet. They come with the locked script.</p>;
  if (n.key === 'previz') return <PrevizPage s={s} onChip={onChip} />;
  const place = at && (n.key === 'loc' || n.key === 'views') ? s.locations.find((l) => l.id === at) : undefined;
  if (place) return <PlaceDeep s={s} l={place} base={base} onChip={onChip} />;
  const open = (id: string) => onAt?.(id);
  return (
    <>
      <RunningLines aims={n.aims} />
      {n.key === 'edit' && <EditNext s={s} base={base} />}
      {n.key === 'edit' && <CutPlayer s={s} onChip={onChip} />}
      {n.key === 'edit' && <VideoShelf s={s} title="Cuts on disk" note="cut/, newest first" files={newestFirst(s.post?.cuts ?? [], s.post?.written)} onChip={onChip}
        tag={(f) => day(s.post?.written?.[f])} />}
      {n.key === 'edit' && <VideoShelf s={s} title="Title cards and made pieces" note="cut/cards/ and edits/" files={s.post?.pieces ?? []} onChip={onChip} />}
      {n.key === 'loc' ? <LocationsStep s={s} onAt={open} onChip={onChip} />
        : n.key === 'views' ? <ViewsStep s={s} onAt={open} onChip={onChip} />
        : n.key === 'shots' ? <ShotsStep s={s} base={base} fallback={<Rows parts={n.parts} onChip={onChip} />} />
        : n.key === 'edit' ? null
        : CAST_STEP[n.key] ? <CharacterCards s={s} part={CAST_STEP[n.key]!} base={base} onChip={onChip} parts={n.key === 'elements' ? n.parts : undefined} />
        : n.parts.length ? <Rows parts={n.parts} onChip={onChip} /> : null}
      <Feed query={`place=${n.key}`} from={`the ${n.name} node on Main`} />
    </>
  );
}

/** The film itself on the Edit step: the current cut's render; the native controls play it, 9:16 kept. (Finish and
 *  Release play the master on their own pages.) */
function CutPlayer({ s, onChip }: { s: FilmState; onChip: (id: string, label: string) => void }) {
  const cut = s.cut;
  // Edit: the current timeline version's 480p when it has one, else the render the record names
  const tl = cut?.current;
  const tlProxy = tl ? cut?.renders?.[tl.version]?.proxy : undefined;
  const proxy = tlProxy?.state === 'done' ? tlProxy.path : tl?.renders?.proxy?.path;
  const file = proxy ?? cut?.video ?? s.post?.cuts[s.post.cuts.length - 1];
  if (!file) return null;
  const repoRel = repoPath(s.film.folder, s.film.repo, file);
  const nine = (s.film.aspect ?? '9:16') === '9:16';
  const what = proxy && tl ? `${tl.version} 480p · ${tl.note ?? 'the current cut'}` : cut?.render ? `${cut.render} · ${cut.name}` : cut?.name ?? 'the cut';
  return (
    <div className="flex flex-wrap items-start gap-5">
      <Media path={repoRel} w={640} t={1} play fit="contain" onPlay={() => onChip(`cut:${file}`, `cut · ${file.split('/').pop()}`)}
        className={cn('flex-none rounded-[9px] border border-edge bg-black', nine ? 'aspect-[9/16] w-[300px] max-[760px]:w-full max-[760px]:max-w-[320px]' : 'aspect-[16/9] w-[560px] max-w-full')} />
      <div className="flex min-w-0 flex-col gap-1.5 pt-1 text-[13px]">
        <span className="lbl">The cut</span>
        <span className="font-medium">{capitalFirst(what)}</span>
        {cut && <span className="text-sub">{[cut.name, cut.frames ? `${cut.frames} frames · ${smpteOf(cut.frames, cut.fps)}` : '', `${cut.fps} fps`].filter(Boolean).join(' · ')}</span>}
        <span className="break-all font-mono text-[11.5px] text-mute">{repoRel}</span>
        {cut && <span className="text-[12px] text-mute" title={cut.source.note ?? cut.source.from.join(', ')}>Cut read {cut.source.label}</span>}
      </div>
    </div>
  );
}

/** 4303 frames at 24 → "00:02:59:07". */
const smpteOf = (frames: number, fps: number): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  const sec = Math.floor(frames / fps);
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}:${p(frames % fps)}`;
};
