'use client';
// Scene (stages 6 to 8, one scene): the player, the shot ruler, the cut, every take and pick-up,
// the open take with its frames and misses, and the prompt panel (the go's view of one scene). design/boards/Scene-S9.dc.html.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FilmState, QCEntry, SceneRef, TakeRef } from '@/server/types';
import { usePage } from '@/components/data/ui';
import { cutTakeIds, goScenes, openMisses, type Miss, parseMiss, sceneCredits, sceneLocations } from '@/components/lib/derive';
import { fmtCost, fmtCredits, fmtDate, fmtSecs, smpte, takeLabel } from '@/components/lib/format';
import { Header, HeaderLink } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import type { QCTarget } from '@/components/qc/QCPanel';
import { qcCategoryOf } from '@/lib/qc';
import { Badge, Btn } from '@/components/shell/atoms';
import { IconChevronLeft, IconChevronRight, IconFile, IconPlay } from '@/components/shell/icons';
import { useFilmPage, filmPath } from './common';
import { Media, mediaUrl } from '@/components/media/Media';
import { cutSegments, cutSpan, cutToConfirm, outsideCutClips } from '@/components/lib/cut';
import { ScenePromptPanel } from '@/components/go/ScenePromptPanel';
import { useJson } from './postCommon';
import { cn } from '@/lib/utils';
import { Feed, OtherClips } from '@/components/feed/Feed';
import { StepIntro } from '@/components/intro/StepIntro';

const FPS = 24;

/** The Scene page's QC chip is the take check: the critic's report when there is one (qc/take-<scene>-r<n>.json),
 *  else the misses the review cards record on the takes in the cut, shown as an ungraded round. */
function takeCheck(state: FilmState, sc: SceneRef, misses: Miss[]): QCTarget {
  const entry = qcEntry(state, 'take', sc.id);
  const label = `${sc.id} take check`;
  const ready = cutTakeIds(sc, state.cut).length > 0 || sc.takes.length > 0;
  const waitsFor = ready ? `the take in the cut of ${sc.id}` : 'the first take';
  if (entry || !misses.length) return { target: sc.id, label, entry, ready, waitsFor };
  const report = {
    stage: 'take', target: sc.id, round: 1, score: null, model: 'review cards', at: '', inputs: [], next: '',
    misses: misses.map((m, i) => ({ id: `rc${i + 1}`, category: qcCategoryOf(m.category), sub: m.category, finding: m.text, fix: 'The critic writes the exact fix in its first round.', open: true })),
  };
  const synthetic: QCEntry = { key: `take-${sc.id}`, stage: 'take', target: sc.id, latest: report, history: [report] };
  return { target: sc.id, label, entry: synthetic, ready, waitsFor, source: 'the review cards' };
}

function Ruler({ seconds }: { seconds: number }) {
  const step = seconds > 40 ? 10 : 5;
  // a tick in the last eighth has no room for its label before the edge (40 s of 43): leave it out
  const ticks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step).filter((t) => t === seconds || t / seconds < 0.87);
  return (
    <div className="relative h-5 border-b border-line">
      {ticks.map((t, i) => (
        <span key={t} className={cn('absolute top-0 flex h-full items-start border-l border-edge pl-1 font-mono text-[10.5px] text-sub', ticks.length > 4 && i % 2 === 1 && 'max-[760px]:hidden')} style={{ left: `${(t / seconds) * 100}%`, transform: t === seconds ? 'translateX(-100%)' : undefined }}>
          {smpte(t, FPS).slice(3, 8)}
        </span>
      ))}
    </div>
  );
}

/** Where a take stands, in a word and a sentence: used wherever a take has no clip to show (13 Nov 2026: "no video
 *  file yet" said nothing). */
function takeStanding(t: TakeRef): { word: string; tone: 'bad' | 'run' | 'warn' | 'ok' | 'idle'; detail: string } {
  if (t.path) {
    if (t.verdict === 'redo') return { word: 'Needs a redo', tone: 'warn', detail: t.finding ? `${t.finding}.` : 'Its check says it needs a redo.' };
    if (t.verdict === 'usable') return { word: 'Usable', tone: 'ok', detail: t.finding ? `${t.finding}.` : 'Its check says it is usable.' };
    if (t.verdict === 'good') return { word: 'Holds', tone: 'ok', detail: t.finding ? `${t.finding}.` : 'Its check found nothing to redo.' };
    return { word: 'Landed', tone: 'idle', detail: 'The clip is here. It has not been checked yet.' };
  }
  const free = t.cost?.credits === 0 ? ' It cost nothing.' : '';
  if (t.stopped === 'blocked') return { word: 'Blocked', tone: 'bad', detail: `The video service refused this take, so no clip was made.${free}${t.stoppedWhy ? ` Reason given: ${t.stoppedWhy}.` : ''}` };
  if (t.stopped === 'failed') return { word: 'Failed', tone: 'bad', detail: `The video service failed on this take, so no clip was made.${free}${t.stoppedWhy ? ` What it said: ${t.stoppedWhy}.` : ''}` };
  return { word: 'Rendering', tone: 'run', detail: `Sent to the video service${t.date ? ` on ${fmtDate(t.date)}` : ''}. The clip appears here when it lands. If it has been more than a few minutes, ask Alma what became of it.` };
}
const STAND_DOT = { bad: 'bg-bad', run: 'bg-ink animate-pulse', warn: 'bg-warn', ok: 'bg-ok', idle: 'bg-mute' } as const;

function TakeBar({ t, seconds, selected, inCut, onClick }: { t: TakeRef; seconds: number; selected: boolean; inCut: boolean; onClick: () => void }) {
  const w = Math.min(100, ((t.seconds ?? seconds) / seconds) * 100);
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn('relative flex h-8 min-w-[24px] cursor-pointer items-center overflow-hidden rounded-[6px] border px-2.5 text-left text-[12px] transition-colors duration-200', selected ? 'border-warn bg-raised text-ink' : 'border-edge bg-panel text-ink-3 hover:border-sub', !t.path && 'border-dashed', inCut && !selected && 'border-l-2 border-l-sub')}
      style={{ width: `${w}%` }}>
      {inCut && <span className="hatch absolute inset-y-0 right-0 w-1/3 opacity-60" aria-hidden="true" />}
      <span className="relative flex min-w-0 items-center gap-1.5 truncate">
        {!t.path && <span aria-hidden="true" className={cn('size-1.5 flex-none rounded-full', STAND_DOT[takeStanding(t).tone])} />}
        <span className="truncate">{inCut ? 'in the cut' : !t.path ? `${takeStanding(t).word.toLowerCase()} · no clip` : [fmtSecs(t.seconds), t.verdict ? takeStanding(t).word.toLowerCase() : '', t.cost?.credits ? fmtCost(t.cost, 'credits') : ''].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );
}

function sceneNav(scenes: SceneRef[], id: string) {
  const i = scenes.findIndex((s) => s.id === id);
  return { prev: i > 0 ? scenes[i - 1] : undefined, next: i >= 0 && i < scenes.length - 1 ? scenes[i + 1] : undefined, index: i };
}

export function ScenePage() {
  const { state, error, ui, base, tasks } = useFilmPage();
  const params = useParams<{ scene: string }>();
  const sc = state?.scenes.find((s) => s.id === params.scene);
  const inCut = sc ? cutTakeIds(sc, state?.cut) : [];
  const worth = (t: TakeRef): number => (t.verdict === 'good' ? 3 : t.verdict === 'usable' ? 2 : t.verdict === 'redo' ? 0 : 1);
  const landed = sc ? [...sc.takes].filter((t) => t.path).reverse().sort((a, b) => worth(b) - worth(a)) : [];
  // opens on a take with a clip: the cut's, else the best checked, else the newest landed
  const defaultTake = sc ? (sc.takes.filter((t) => inCut.includes(t.id) && t.kind === 'pickup').pop() ?? sc.takes.filter((t) => inCut.includes(t.id)).pop() ?? landed[0] ?? sc.takes[sc.takes.length - 1]) : undefined;
  const asked = useSearchParams().get('take') ?? undefined;
  const [takeId, setTakeId] = useState<string | undefined>(asked);
  const take = sc?.takes.find((t) => t.id === takeId) ?? defaultTake;
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState<{ path?: string; s: number }>();
  const len = (dur && dur.path === take?.path ? dur.s : undefined) ?? take?.seconds ?? sc?.seconds ?? 0;
  const head = smpte(pos, FPS);
  const { setPlayhead } = ui;

  // the context's playhead and the pinned chip follow the paused playhead, as on Edit: set on every frame while a
  // take played, they re-rendered the whole thread and page four times a second
  const [restHead, setRestHead] = useState(head);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- holds the last paused timecode while the take plays
  useEffect(() => { if (!playing) setRestHead(head); }, [playing, head]);
  useEffect(() => { setPlayhead(restHead); }, [restHead, setPlayhead]);
  useEffect(() => () => setPlayhead(undefined), [setPlayhead]);
  const atEnd = pos >= len;
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !!take?.path;
  // without a file the playhead runs on its own, so the ruler and the timecode still move
  useEffect(() => {
    if (hasVideo || !playing || atEnd) return;
    const t = setInterval(() => setPos((p) => Math.min(len, p + 0.25)), 250);
    return () => clearInterval(t);
  }, [hasVideo, playing, atEnd, len]);
  const seek = (t: number) => {
    const v = videoRef.current;
    const to = Math.max(0, Math.min(len || Infinity, t));
    if (v) v.currentTime = to;
    setPos(to);
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (v) {
      if (v.paused) void v.play().catch(() => undefined);
      else v.pause();
      return;
    }
    if (atEnd) setPos(0);
    setPlaying(!(playing && !atEnd));
  };

  usePage(sc ? `${sc.id}${take ? ` · ${takeLabel(take.id)} open` : ''} · playhead ${restHead}` : undefined, 'Say go, or tell Alma what to change…',
    take ? [inCut.includes(take.id) ? 'What changed?' : 'Put in the cut', 'List the misses']
      : state && sc && goScenes(state, tasks).includes(sc.id) ? ['Go for the video', `Show ${sc.id}’s prompt`] : [],
    sc ? [`What was redone in ${sc.id}?`, 'Which take is in the film?'] : []);
  // the scene's cards (its test takes sit above the prompt): the page waits for them, or the prompt and the cards
  // under it were drawn first and pushed far down when the test takes came (the same read as OtherClips and the Feed)
  const cards = useJson<unknown>(state && sc ? `/api/films/${state.film.slug}/feed?id=${sc.id}` : undefined, state?.updatedAt);
  if (!state || (sc && cards.loading)) return <Loading error={error} />;
  if (!sc) return <Loading error={`No scene ${params.scene} in this film`} />;

  const { prev, next, index } = sceneNav(state.scenes, sc.id);
  const loc = sceneLocations(state.script?.markdown, state.scenes)[sc.id];
  const takes = sc.takes.filter((t) => t.kind === 'take');
  const pickups = sc.takes.filter((t) => t.kind === 'pickup');
  // a pick-up shot for two scenes sits under the first; the other scene says where it is
  const shared = (sc as SceneRef & { more?: { sharedPickups?: { name: string; under: string }[] } }).more?.sharedPickups ?? [];
  const misses = openMisses(sc, state.cut);
  const total = sc.seconds ?? Math.max(...sc.takes.map((t) => t.seconds ?? 0), 1);
  const shotN = sc.shots ?? 0;
  const pickIdx = take && take.kind === 'pickup' ? pickups.findIndex((p) => p.id === take.id) : pickups.length - 1;
  const shownPickup = pickups[pickIdx] ?? pickups[pickups.length - 1];
  const select = (t: TakeRef) => { setTakeId(t.id); setPos(0); setPlaying(false); ui.addChip({ id: `take:${t.id}`, label: takeLabel(t.id), ref: t.path }); };
  const frameLen = take?.path ? len : take?.seconds;
  const frames = frameLen ? Array.from({ length: 9 }, (_, i) => Math.round(((i + 0.5) * frameLen) / 9 * 10) / 10) : [];
  const segs = cutSegments(sc, state.cut);
  const span = cutSpan(segs);
  // the timeline (cut/v<n>.json) when the film has one, else the cut the record names
  const tlv = state.cut?.current?.version;
  const aheadV = tlv && state.cut?.recordAhead ? (/\bv\d+\b/.exec(state.cut.recordAhead.label)?.[0] ?? state.cut.recordAhead.label) : undefined;
  const cutName = tlv ? `cut ${tlv}` : state.cut?.name ?? 'the cut';
  const cutNameAhead = !aheadV ? cutName : state.film.status === 'delivered' ? `${cutName}, before the final edit` : `${cutName} (the record is ahead: ${aheadV})`;
  const unsure = cutToConfirm(sc, state.cut);
  const inCutText = inCut.map((id) => `${takeLabel(id)}${unsure.has(id) ? ' (to confirm)' : ''}`).join(' + ');
  const cutFrom = tlv ? <span className="text-mute" title={`the timeline file cut/${tlv}.json`}> · from cut/{tlv}.json</span>
    : sc.cutSource ? <span className="text-mute" title={sc.cutSource.note ?? sc.cutSource.from.join(', ')}> · {sc.cutSource.label}</span> : null;
  const fps = state.cut?.fps ?? FPS;
  const outside = [...new Set(outsideCutClips(sc, state.cut).map((c) => c.src))];

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Scenes', href: `${base}/scenes` }, { label: `${sc.id} · ${sc.title}` }]}
        meta={<>{[fmtSecs(sc.seconds), shotN ? `${shotN} shots` : '', loc ?? '', `${sc.takes.length} takes`, fmtCredits(sceneCredits(sc), 'credits')].filter(Boolean).join(' · ')} · <span className="font-mono">{filmPath(state, sc.folder)}</span></>}
        phoneSub={`${fmtSecs(sc.seconds)} · ${shotN} shots · ${sc.takes.length} takes`}
        actions={<>
          {prev ? <Link href={`${base}/scenes/${prev.id}`} aria-label={`Previous scene, ${prev.id}`} className="flex size-8 items-center justify-center rounded-lg border border-edge text-ink hover:bg-raised"><IconChevronLeft size={14} /></Link> : <span className="flex size-8 items-center justify-center rounded-lg border border-line text-faint"><IconChevronLeft size={14} /></span>}
          {next ? <Link href={`${base}/scenes/${next.id}`} aria-label={`Next scene, ${next.id}`} className="flex size-8 items-center justify-center rounded-lg border border-edge text-ink hover:bg-raised"><IconChevronRight size={14} /></Link> : <span className="flex size-8 items-center justify-center rounded-lg border border-line text-faint"><IconChevronRight size={14} /></span>}
          <HeaderLink icon={<IconFile size={14} />} onClick={() => ui.prefill(`Show the shot plan and previz for ${sc.id}`)}>Shot plan and previz</HeaderLink>
        </>} />

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 pb-5 pt-6 max-[760px]:px-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="lbl">Stages 6 to 8 · {sc.id} {sc.title}</span>
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{sc.id} · {sc.title}</h1>
          <p className="m-0 text-[13px] text-sub">Scene {index + 1} of {state.scenes.length}{inCut.length ? ` · in ${cutNameAhead}: ${inCutText}` : outside.length ? ` · ${cutNameAhead} uses ${outside.length === 1 ? 'a test take' : `${outside.length} test takes`} of this scene, shown under Test takes` : sc.takes.length ? (state.cut ? ` · none of its takes is in ${cutNameAhead}` : ' · no cut yet') : ' · no take yet'}{cutFrom}</p>
          <StepIntro step="scene" className="pt-2.5" />
        </div>
        <QCChip spec={qcSpec('take')} targets={takeCheck(state, sc, misses)} />
      </div>

      <div className="grid grid-cols-[248px_minmax(0,1fr)] max-[1100px]:grid-cols-1">
        {/* Player */}
        <div className="flex flex-col gap-3 border-r border-line p-5 max-[1100px]:border-b max-[1100px]:border-r-0">
          <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[208px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[9px] border border-edge bg-panel">
            {take?.path ? (
              <video key={take.path} ref={videoRef} src={mediaUrl(filmPath(state, take.path))} poster={mediaUrl(filmPath(state, take.path), { w: 640, t: 0.5 })}
                controls playsInline preload="metadata" className="absolute inset-0 size-full bg-black object-contain"
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur({ path: take.path, s: d }); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            ) : (
              take ? (
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium"><span aria-hidden="true" className={cn('size-[7px] rounded-full', STAND_DOT[takeStanding(take).tone])} />{takeLabel(take.id)} · {takeStanding(take).word.toLowerCase()}</span>
                  <span className="text-[12px] leading-[1.5] text-sub">{takeStanding(take).detail}</span>
                </div>
              ) : (
                <span className="px-4 text-center text-[13px] text-sub">No take yet. The prompt and the quote come first; nothing runs until you say go.</span>
              )
            )}
            {take && <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-[4px] bg-black/60 px-1.5 py-px text-[11px] text-ink-3"><span className={cn('size-1.5 rounded-full', take.kind === 'pickup' ? 'bg-warn' : 'bg-sub')} />{take.kind === 'pickup' ? takeLabel(take.id).replace(/^FIX-[^·]+·\s*/, 'FIX ') : takeLabel(take.id)}</span>}
          </div>
          <div className="text-center font-mono text-[13px]"><span className="text-ink">{head}</span><span className="text-mute"> / {smpte(len, FPS)}</span></div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" aria-label="Back one second" onClick={() => seek(pos - 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><IconChevronLeft size={14} /></button>
            <button type="button" aria-label={playing && !atEnd ? 'Pause' : 'Play'} onClick={togglePlay} className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-edge-strong text-ink">
              {playing && !atEnd ? <span className="flex gap-[3px]"><span className="h-3 w-[3px] bg-ink" /><span className="h-3 w-[3px] bg-ink" /></span> : <IconPlay size={12} />}
            </button>
            <button type="button" aria-label="Forward one second" onClick={() => seek(pos + 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><IconChevronRight size={14} /></button>
          </div>
          {take?.path && <p className="m-0 border-t border-line pt-3 text-[12px] leading-normal text-sub"><span className="break-all font-mono text-[11px]">{filmPath(state, take.path)}</span></p>}
        </div>

        <div className="min-w-0">
          {/* Shots, the cut, takes */}
          <div className="flex flex-col gap-2.5 border-b border-line px-6 py-5 max-[760px]:px-4">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-end gap-3">
              <span className="lbl pb-1">Shots</span>
              <div className="flex flex-col gap-1">
                <Ruler seconds={total} />
                <div className="relative">
                  {shotN > 0 && (
                    <div className="flex gap-1">
                      {Array.from({ length: shotN }, (_, i) => (
                        <button key={i} type="button" onClick={() => ui.addChip({ id: `shot:${sc.id}-${i + 1}`, label: `${sc.id} · shot ${i + 1}` })}
                          className={cn('flex h-11 flex-1 cursor-pointer items-start rounded-[6px] border px-2 pt-1.5 font-mono text-[11.5px]', ui.hasChip(`shot:${sc.id}-${i + 1}`) ? 'border-sub bg-raised text-ink' : 'border-edge bg-panel text-ink-3 hover:border-sub')}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="pointer-events-none absolute -top-6 bottom-0 w-px bg-ink" style={{ left: `${Math.min(100, (pos / total) * 100)}%` }} aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[12.5px] text-ink-3">The cut</span>
              {span ? (
                <div className="flex flex-col gap-1">
                  <div className="relative h-8">
                    {segs.filter((g) => !g.over).map((g, i) => {
                      const left = ((g.at - span.from) / Math.max(1, span.to - span.from)) * 100;
                      const width = (g.frames / Math.max(1, span.to - span.from)) * 100;
                      const narrow = width < 22;
                      const fix = /^FIX-(.+?)(?:-S\d+)?\s·\s.*?(\d+[A-Z]?)$/.exec(g.take.id);
                      const full = fix ? `FIX ${fix[1]} ${fix[2]}` : takeLabel(g.take.id);
                      const n = /(\d+[A-Z]?)$/.exec(full)?.[1] ?? '';
                      const name = narrow ? (g.take.kind === 'pickup' ? `FIX ${n}` : `${/grey/i.test(full) ? 'G' : 'T'}${n}`) : full;
                      const sub = narrow ? '' : g.shots ? `shot ${g.shots}` : fmtSecs(Math.round((g.frames / fps) * 10) / 10);
                      const tip = `In ${cutName}: ${takeLabel(g.take.id)}${g.shots ? `, shot ${g.shots}` : ''} · ${smpte(g.at / fps, fps)} → ${smpte((g.at + g.frames) / fps, fps)} · ${g.frames} fr${g.toConfirm ? ' · to confirm' : ''}`;
                      return (
                        <button key={`${g.take.id}:${g.at}:${i}`} type="button" onClick={() => select(g.take)} title={tip} aria-label={tip}
                          className={cn('absolute inset-y-0 flex min-w-[24px] cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap rounded-[6px] border border-t-[3px] px-2 text-left text-[12px] font-medium', take?.id === g.take.id ? 'bg-edge' : 'bg-raised', g.take.kind === 'pickup' ? 'border-edge border-t-warn' : 'border-edge border-t-sub', g.toConfirm && 'border-dashed')}
                          style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}>
                          <span className="truncate">{name}</span><span className="truncate text-[11.5px] font-normal text-sub">{sub}</span>
                          {g.toConfirm && (narrow
                            ? <span aria-hidden="true" title="to confirm" className="absolute right-1 top-1 size-1.5 rounded-full bg-warn" />
                            : <span className="inline-flex h-4 flex-none items-center rounded-[8px] border border-dashed border-warn px-1.5 text-[10px] font-normal text-warn">to confirm</span>)}
                        </button>
                      );
                    })}
                  </div>
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[10.5px] text-mute">
                    <span>
                      {smpte(span.from / fps, fps)} → {smpte(span.to / fps, fps)} in {cutName}
                      {segs.some((g) => g.over) ? ` · over it: ${[...new Set(segs.filter((g) => g.over).map((g) => takeLabel(g.take.id)))].join(', ')}` : ''}
                    </span>
                    {tlv && <Link href={`${base}/edit?at=${span.from}`} className="font-sans text-[12px] text-sub no-underline hover:text-ink">Open in the edit at {smpte(span.from / fps, fps)}</Link>}
                  </span>
                </div>
              ) : inCut.length ? (
                <div className="flex gap-1">
                  {inCut.map((id) => {
                    const t = sc.takes.find((x) => x.id === id);
                    return (
                      <button key={id} type="button" onClick={() => t && select(t)}
                        className={cn('flex h-8 flex-1 cursor-pointer items-center truncate rounded-[6px] border border-t-2 bg-panel px-2.5 text-[12px] font-medium', t?.kind === 'pickup' ? 'border-edge border-t-warn' : 'border-edge border-t-sub')}>
                        {takeLabel(id)}
                      </button>
                    );
                  })}
                </div>
              ) : <span className="text-[12.5px] text-mute">{outside.length ? `${state.cut?.name ?? 'The cut'} uses ${outside.length === 1 ? 'a test take' : 'test takes'}, not one of these` : sc.takes.length ? (state.cut ? `None of these is in ${state.cut.name}` : 'No cut yet') : 'No take yet'}</span>}
            </div>
            {takes.map((t) => (
              <div key={t.id} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                <span className="flex items-center gap-2 text-[12.5px] text-ink-3"><span className="size-1 rounded-full bg-sub" />{takeLabel(t.id)}</span>
                <TakeBar t={t} seconds={total} selected={take?.id === t.id} inCut={inCut.includes(t.id)} onClick={() => select(t)} />
              </div>
            ))}
            {pickups.length > 0 && shownPickup && (
              <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                <span className="flex items-center gap-2 text-[12.5px] text-ink-3"><span className="size-1 rounded-full bg-warn" />Pick-ups</span>
                <div className={cn('flex h-8 w-max max-w-full items-center gap-2 rounded-[6px] border px-2.5 text-[12px]', take?.id === shownPickup.id ? 'border-warn bg-raised' : 'border-edge bg-panel')}>
                  <button type="button" onClick={() => select(shownPickup)} className="flex-none cursor-pointer whitespace-nowrap font-medium">{shownPickup.id.replace(/^FIX-[^·]+·\s*/, 'FIX ')}</button>
                  <span className="min-w-0 truncate text-sub">{[fmtSecs(shownPickup.seconds), state.cut ? (inCut.includes(shownPickup.id) ? `in the cut${shownPickup.placement?.shots ? ` · shot ${shownPickup.placement.shots}` : ''}${unsure.has(shownPickup.id) ? ' (to confirm)' : ''}` : 'landed, not in the cut') : ''].filter(Boolean).join(' · ')}</span>
                  <span className="ml-1 flex items-center gap-1 font-mono text-[11px] text-sub">
                    <button type="button" aria-label="Earlier pick-up" disabled={pickIdx <= 0} onClick={() => select(pickups[pickIdx - 1])} className="cursor-pointer disabled:opacity-30"><IconChevronLeft size={11} /></button>
                    {pickIdx + 1} / {pickups.length}
                    <button type="button" aria-label="Later pick-up" disabled={pickIdx >= pickups.length - 1} onClick={() => select(pickups[pickIdx + 1])} className="cursor-pointer disabled:opacity-30"><IconChevronRight size={11} /></button>
                  </span>
                </div>
              </div>
            )}
            {shared.length > 0 && (
              <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                <span />
                <span className="text-[12px] text-sub">
                  {shared.map((p, i) => (
                    <span key={p.name}>{i > 0 && ' · '}<span className="font-mono text-[11.5px] text-ink-3">{p.name}</span> also covers this scene; it is kept under <Link href={`${base}/scenes/${p.under}`} className="text-ink-3 underline decoration-edge-strong underline-offset-2 hover:text-ink">{p.under}</Link></span>
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* The open take */}
          {take ? (
            <div className="flex flex-col gap-4 px-6 py-5 max-[760px]:px-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={cn('size-2 rounded-full', take.kind === 'pickup' ? 'bg-warn' : 'bg-sub')} />
                <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">{takeLabel(take.id)}</h2>
                {inCut.includes(take.id) && <Badge>In the cut</Badge>}
                {(!take.path || take.verdict) && <span className="inline-flex h-5 items-center gap-1.5 rounded-[10px] border border-edge px-2 text-[11.5px] text-ink-2"><span aria-hidden="true" className={cn('size-1.5 rounded-full', STAND_DOT[takeStanding(take).tone])} />{takeStanding(take).word}</span>}
                {unsure.has(take.id) && <span title={`The cut's clip of this take says "(to confirm)": the record could not settle it. Confirm it on the Edit page.`} className="inline-flex h-5 items-center rounded-[10px] border border-dashed border-warn px-[7px] text-[11px] font-medium text-warn">to confirm</span>}
              </div>
              <p className="-mt-2 m-0 text-[12.5px] text-sub">
                {[fmtDate(take.date), fmtSecs(take.seconds), take.cost ? fmtCost(take.cost, 'credits') : '', take.kind === 'pickup' ? 'pick-up' : 'take', take.jobId ? `job ${take.jobId.slice(0, 8)}` : ''].filter(Boolean).join(' · ')}
              </p>
              {state.film.status !== 'delivered' && (
                <div className="flex gap-2">
                  <Btn onClick={() => ui.prefill(`Duplicate ${takeLabel(take.id)} with one change: `, { id: `take:${take.id}`, label: takeLabel(take.id) })}>Duplicate with one change</Btn>
                </div>
              )}
              {(!take.path || take.finding) && <p className="m-0 max-w-[640px] text-[13px] leading-[1.5] text-ink-2">{takeStanding(take).detail}</p>}
              {frames.length > 0 && take.path && (
                <div className="flex flex-col gap-1.5">
                  <div className="scroll flex gap-1.5 overflow-x-auto pb-1">
                    {frames.map((f) => (
                      <button key={f} type="button" onClick={() => seek(f)} aria-label={`Seek to ${f} s`}
                        className={cn('relative flex aspect-[9/16] w-[60px] flex-none cursor-pointer items-end justify-center overflow-hidden rounded-[6px] border bg-tile pb-1.5 font-mono text-[10.5px]', Math.abs(pos - f) < 0.05 ? 'border-ink text-ink' : 'border-line text-mute hover:border-sub')}>
                        {take.path && <Media path={filmPath(state, take.path)} w={160} t={f} missingLabel="" className="absolute inset-0" />}
                        <span className={cn('relative', take.path && 'rounded-[3px] bg-black/60 px-1 text-ink-3')}>{f.toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                  <span className="text-[12px] text-mute">Nine frames across the take · click one to seek</span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <span className="lbl">Misses</span>
                {(take.misses ?? []).length ? (take.misses ?? []).map(parseMiss).map((m, i) => (
                  <button key={i} type="button" onClick={() => ui.addChip({ id: `miss:${take.id}:${i}`, label: `miss · ${m.category} · ${m.text.split(/[,.;]/)[0].slice(0, 32)}` })}
                    className="grid cursor-pointer grid-cols-[92px_minmax(0,1fr)] items-start gap-3 rounded-lg border border-edge bg-panel px-3 py-2.5 text-left text-[13px] leading-normal hover:border-sub">
                    <span className="inline-flex h-5 w-max items-center gap-1.5 rounded-[6px] border border-edge-strong px-1.5 text-[11px] text-ink-3"><span className="size-1.5 rounded-full bg-[#F472B6]" />{m.category}</span>
                    <span className="text-ink-2">{m.text}</span>
                  </button>
                )) : <span className="text-[12.5px] text-sub">No misses recorded for this take.</span>}
              </div>
            </div>
          ) : (
            <p className="m-0 px-6 py-5 text-[13px] text-sub">No takes yet. The prompt and the quote come first; nothing runs until you say go.</p>
          )}

          <div className="px-6 pb-6 empty:hidden max-[760px]:px-4"><OtherClips scene={sc.id} /></div>

          {/* The prompt panel: the prompt, its references and the quote, as the go shows them */}
          <div id="prompt" className="px-6 pb-6 max-[760px]:px-4">
            <ScenePromptPanel sc={sc} state={state} base={base} />
          </div>
          <div className="px-6 pb-10 max-[760px]:px-4">
            <Feed query={`id=${sc.id}`} title={`Shown to you · ${sc.id}`} note="takes, pick-ups, fixes and tests on this scene" from={`the ${sc.id} page`} />
          </div>
        </div>
      </div>
    </>
  );
}
