'use client';
// The Edit page's shot views (13 Nov 2026, ASKS 16; the design is the "Harness Timeline" canvas): the whole
// film as a strip of scenes, and under the timeline every take of the open scene cut into its shots, where a
// click tries a shot in its place.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SceneRef, ShotView, Timeline } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { shortViewNames, ViewThumb } from '@/components/media/ViewThumb';
import { cn } from '@/lib/utils';
import { inFilm, shotClips, shotKey, shotsOf, subTag, type BySrc, type SceneRun, type Shot, type TakeShots } from './shots';
import { cellLabel, cellsOf, columnBox, columnsOf, columnWeights, gridColumns } from './shotCols';
import { useNoSwipeBack } from './swipe';
import type { TakeDrag } from './dragTake';
import { isPickup, otherKey, pickupView, withAliases } from './pickupRows';
import { genOf } from '@/components/shots/places';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const secs = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} s`;

/** The film's takes with their shots; asks again while the server is still cutting some. */
export function useShots(film: string): { takes: TakeShots[]; all: TakeShots[]; by: BySrc; waiting: number; loaded: boolean } {
  const [data, setData] = useState<{ takes: TakeShots[]; waiting: number; loaded?: boolean }>({ takes: [], waiting: 0 });
  useEffect(() => {
    let live = true;
    let last = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/shots`, { cache: 'no-store' });
        if (!r.ok) return;
        const text = await r.text();
        if (!live) return;
        const j = JSON.parse(text) as { takes?: TakeShots[]; waiting?: number };
        // the same answer draws nothing (the page is idle between looks)
        if (text !== last) { last = text; setData({ takes: j.takes ?? [], waiting: j.waiting ?? 0, loaded: true }); }
        // a take that just landed is cut within seconds; a variation being made is looked for every 15 s (ASKS 51);
        // an idle page looks again every minute
        const making = (j.takes ?? []).some((t) => t.state === 'making' && !t.variation?.failed);
        timer = setTimeout(() => void load(), (j.waiting ?? 0) > 0 ? 2500 : making ? 15000 : 60000);
      } catch { /* the page works without the shots */ }
    };
    void load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [film]);
  // a copy of a listed take (its variation.json's copyOf) is left out of the takes, so nothing counts it twice;
  // `by` keeps it, numbered as the take it copies, for a clip of it in the cut. `all`: every take, copies too.
  const view = useMemo(() => pickupView({ takes: data.takes, scenes: [] }), [data.takes]);
  return { takes: view.takes, all: data.takes, by: view.by, waiting: data.waiting, loaded: !!data.loaded };
}

/** The whole film: one segment per scene, a notch at each cut inside it. Click a scene to open it. */
export function FilmStrip({ runs, total, frame, open, shots, absent = [], fresh, onPick, onPickAbsent, onZoom, empty }: {
  runs: SceneRun[]; total: number; frame: number; open?: string; shots: number;
  /** The scenes holding a take not looked at yet (seenTakes.ts): a small quiet dot on each, so the user knows which to open. */
  fresh?: Set<string>;
  /** No cut yet (no script): the strip says so (15 Nov). */
  empty?: boolean;
  /** The film's scenes with no clip in the cut (taken out): a slim hatched mark where each would be. */
  absent?: { scene: string; title?: string; at: number }[];
  onPick: (r: SceneRun) => void; onPickAbsent?: (scene: string, at: number) => void; onZoom: (dir: 1 | -1 | 0) => void;
}) {
  const pct = (f: number) => `${(f / Math.max(1, total)) * 100}%`;
  const scenes = new Set(runs.map((r) => r.scene).filter(Boolean)).size;
  const seen = new Map<string, number>();
  const keyOf = (r: SceneRun) => { const k = r.scene ?? r.label; const i = seen.get(k) ?? 0; seen.set(k, i + 1); return `${k}@${i}`; };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11.5px] text-sub">
        <span><span className="font-medium text-ink">The whole film</span> · {empty ? 'no scenes yet' : <>{scenes} {scenes === 1 ? 'scene' : 'scenes'}, {shots} shots{absent.length > 0 && <span className="line-in text-mute"> · {absent.length} {absent.length === 1 ? 'scene' : 'scenes'} out</span>}</>}</span>
        <span className="flex items-center gap-1">
          {/* each press is 24 px tall around the 22 px box drawn (a target a finger or a mouse finds); the row does not move */}
          <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => onZoom(-1)} className="-my-px flex h-6 w-[26px] cursor-pointer items-center justify-center text-sub hover:text-ink"><span className="flex h-[22px] w-full items-center justify-center rounded-md border border-edge-strong">−</span></button>
          <button type="button" title="Show the whole film" onClick={() => onZoom(0)} className="-my-px flex h-6 cursor-pointer items-center text-[11.5px] text-sub hover:text-ink"><span className="flex h-[22px] items-center rounded-md border border-edge-strong px-2">Whole film</span></button>
          <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onZoom(1)} className="-my-px flex h-6 w-[26px] cursor-pointer items-center justify-center text-sub hover:text-ink"><span className="flex h-[22px] w-full items-center justify-center rounded-md border border-edge-strong">+</span></button>
        </span>
      </div>
      <div className="relative h-[26px]">
        {empty && <span data-strip-empty className="absolute inset-0 flex items-center rounded-[5px] border border-dashed border-edge-strong pl-2 text-[11px] text-mute duration-200 animate-in fade-in-0">No scenes yet</span>}
        {runs.map((r) => (
          <button key={keyOf(r)} type="button" onClick={() => onPick(r)} title={r.scene ? `Open ${r.scene}${fresh?.has(r.scene) ? ' · it has a new take' : ''}` : r.label} data-scene={r.scene}
            className={cn('absolute top-0 flex h-[26px] cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-[5px] border pl-1.5 text-[11px] transition-[left,width,background-color,border-color,box-shadow] duration-200 ease-out',
              r.scene ? 'bg-panel' : 'bg-[repeating-linear-gradient(135deg,#19191c_0_3px,#2c2c31_3px_6px)]',
              r.scene && r.scene === open ? 'border-ink text-ink shadow-[0_0_0_1px_#FAFAFA]' : 'border-edge-strong text-sub hover:border-sub hover:text-ink')}
            style={{ left: pct(r.from), width: `calc(${pct(r.to - r.from)} - 2px)` }}>
            {r.scene ?? ''}
            {r.scene && <i aria-hidden="true" data-scene-new={fresh?.has(r.scene) ? '' : undefined} className={cn('pointer-events-none absolute right-[4px] top-[4px] size-[5px] rounded-full bg-ink-3 transition-opacity duration-300 ease-out', fresh?.has(r.scene) ? 'opacity-100' : 'opacity-0')} />}
            {r.cuts.map((c) => <i key={c} aria-hidden="true" className="absolute bottom-0 h-[7px] w-px bg-[#55555e]" style={{ left: `${((c - r.from) / Math.max(1, r.to - r.from)) * 100}%` }} />)}
          </button>
        ))}
        {/* a scene taken out of the film: a slim hatched mark where it would be, between its neighbours */}
        {absent.map((a) => (
          <button key={`out:${a.scene}`} type="button" data-absent={a.scene} onClick={() => onPickAbsent?.(a.scene, a.at)}
            title={`${a.scene}${a.title ? ` · ${a.title}` : ''} · not in the film · click to bring shots back`} aria-label={`${a.scene}, not in the film: open its takes`}
            className={cn('line-in absolute top-0 z-[2] h-[26px] w-[12px] -translate-x-1/2 cursor-pointer rounded-[4px] border border-dashed bg-[repeating-linear-gradient(135deg,#19191c_0_3px,#2c2c31_3px_6px)] transition-[left,opacity,border-color,box-shadow] duration-200 ease-out',
              a.scene === open ? 'border-ink opacity-100 shadow-[0_0_0_1px_#FAFAFA]' : 'border-sub opacity-60 hover:opacity-100')}
            style={{ left: pct(Math.min(a.at, total)) }} />
        ))}
        <span aria-hidden="true" className="pointer-events-none absolute -top-0.5 h-[30px] w-[1.5px] bg-ink transition-[left] duration-150 ease-out" style={{ left: pct(Math.min(frame, total)) }} />
      </div>
    </div>
  );
}

/** A shot of a take being watched or chosen: `tag` tells it from another shot of its take with the same number ("7b"). */
export interface Trying { scene: string; n: number; src: string; k?: number; into?: { to: number; layout: number }; tag?: string }

/** One shot of one take, played from the take's own file: the player jumps to where the shot starts, plays it
 *  and stops at its end. The take's whole length stays under the controls. A second click plays it again. */
export function SourceShot({ src, from, to, k, onTime }: { src: string; from: number; to: number; k?: number; onTime?: (t: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const tell = useRef(onTime);
  useEffect(() => { tell.current = onTime; });
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    done.current = false;
    let told = -1;
    const go = () => { v.currentTime = from; void v.play().catch(() => undefined); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    // stop on the shot's last frame: the player's own time events come only a few times a second
    let raf = 0;
    const watch = () => {
      if (!done.current && !v.paused && v.currentTime >= to - 0.05) { done.current = true; v.pause(); v.currentTime = Math.max(from, to - 0.05); }
      if (Math.abs(v.currentTime - told) > 0.02) { told = v.currentTime; tell.current?.(told); }
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    // the user dragged the player's own bar out of the shot: play on from there, no stop
    const seeked = () => { if (v.currentTime > to + 0.02 || v.currentTime < from - 0.1) done.current = true; };
    // Space (the page sends it): pause; play on; or, stopped at the shot's end, play the shot again
    const toggle = () => {
      if (!v.paused) { v.pause(); return; }
      if (Math.abs(v.currentTime - (to - 0.05)) < 0.12) { done.current = false; v.currentTime = from; }
      void v.play().catch(() => undefined);
    };
    v.addEventListener('seeked', seeked);
    v.addEventListener('shot-toggle', toggle);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('loadedmetadata', go); v.removeEventListener('seeked', seeked); v.removeEventListener('shot-toggle', toggle); };
  }, [src, from, to, k]);
  return (
    <video ref={ref} data-source-shot src={mediaUrl(src)} controls playsInline preload="auto" tabIndex={-1} onFocus={(e) => e.currentTarget.blur()}
      className="absolute inset-0 size-full bg-black object-contain" />
  );
}

/** A take's place in the Takes view: a take of the scene, or a variation of one under it (ASKS 51). */
interface Row { t: TakeShots; source?: TakeShots; n?: number; depth: number }

/** Is `from` (a variation's source, as the chip gave it) this take: its file, or its folder. */
const isSource = (t: TakeShots, from: string) => {
  const f = from.replace(/\/+$/, '');
  return t.src === f || t.src.slice(0, t.src.lastIndexOf('/')) === f;
};
/** "10:58": when a variation was started, in the Mac's own time. */
const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};
/** The takes of a scene in the view's order: the takes as today (those in the film first), each variation right under
 *  the take it came from, oldest first, numbered per source. A variation whose source is not here goes last. */
function rowsOf(all: TakeShots[], used: Set<string>, names: Map<string, string>): Row[] {
  const sourceOf = (t: TakeShots) => (t.variation ? all.find((s) => s !== t && isSource(s, t.variation!.from)) : undefined);
  const inUse = (t: TakeShots) => shotsOf(t).some((s) => used.has(shotKey(t.src, s)));
  const name = (t: TakeShots) => names.get(t.src) ?? t.name;
  // the scene's own takes first, as before (those in the film first); then each pick-up's takes together, the
  // pick-ups in the order they were made, their takes by number
  const gen = (t: TakeShots) => (isPickup(t) ? genOf(t.src) : '');
  const firstMade = new Map<string, number>();
  for (const t of all) { const g = gen(t); if (g) firstMade.set(g, Math.min(firstMade.get(g) ?? Infinity, t.made ?? Infinity)); }
  const roots = all.filter((t) => !sourceOf(t) && t.state !== 'making')
    .sort((a, b) => {
      const ga = gen(a), gb = gen(b);
      if (ga !== gb) return !ga ? -1 : !gb ? 1 : (firstMade.get(ga)! - firstMade.get(gb)!) || ga.localeCompare(gb, undefined, { numeric: true });
      if (ga) return name(a).localeCompare(name(b), undefined, { numeric: true });
      return Number(inUse(b)) - Number(inUse(a)) || name(a).localeCompare(name(b), undefined, { numeric: true });
    });
  const out: Row[] = [];
  const seen = new Set<TakeShots>();
  const put = (t: TakeShots, depth: number, source?: TakeShots, n?: number) => {
    if (seen.has(t) || depth > 4) return;
    seen.add(t);
    out.push({ t, source, n, depth });
    const kids = all.filter((k) => k.variation && sourceOf(k) === t).sort((a, b) => (a.variation!.startedAt).localeCompare(b.variation!.startedAt));
    kids.forEach((k, i) => put(k, depth + 1, t, i + 1));
  };
  for (const t of roots) put(t, 0);
  // a variation of a take not listed here (its source gone): last, numbered among its own
  const orphans = all.filter((t) => !seen.has(t) && t.variation).sort((a, b) => (a.variation!.startedAt).localeCompare(b.variation!.startedAt));
  orphans.forEach((t, i) => put(t, 0, undefined, i + 1));
  return out;
}

/** A take's "new" tag (seenTakes.ts): it fades in when the take is new and fades out once the take is looked at. */
function NewTag({ on }: { on: boolean }) {
  const [shown, setShown] = useState(on);
  if (on && !shown) setShown(true);
  useEffect(() => { if (on) return; const k = setTimeout(() => setShown(false), 320); return () => clearTimeout(k); }, [on]);
  if (!shown) return null;
  return <> <span data-new={on ? '' : undefined} title={on ? 'Not looked at yet: play it or try one of its shots' : undefined}
    className={cn('line-in inline-block rounded-[4px] border border-edge-strong px-1 align-[1px] text-[10px] font-normal leading-[13px] text-ink-3 transition-opacity duration-300 ease-out', on ? 'opacity-100' : 'opacity-0')}>new</span></>;
}

/** Every take of the scene, cut into its shots: one row a take, one column a shot. The shot the film uses is
 *  ringed; a click watches another and selects it (ASKS 52). A take with no clip is one slim row; a variation sits
 *  under the take it came from (ASKS 51). The line across the takes is the film's playhead: drag it, or click the row
 *  of shot names (ASKS 53). */
export function ShotGrid({ scene, takes, by, names, tl, watching, picks, selecting, selShot, base, isNew, onShot, onUnpick, head, onBring, onTakeOut, onSceneOut, onMenu, onSeek, onSeekEdge, foreign, markOf, views, viewSrc, onDragTake, other, alias }: {
  scene: SceneRef | { id: string; title?: string; takes?: SceneRef['takes'] }; takes: TakeShots[]; by: BySrc; names: Map<string, string>; tl: Timeline;
  /** Where the video is: the shot, and how far through it (0 to 1). The line crosses a long shot slowly, a short one fast. */
  head?: { n: number; p: number };
  watching?: Trying; selShot?: number; base: string;
  /** A shot of a take clicked: its take, the scene's shot number (its column) and, for a shot with a letter, its id
   *  ("7b"), which tells it from the take's other shot of that number. The same for the calls below. */
  onShot: (t: TakeShots, n: number, tag?: string) => void;
  /** The shots selected to watch the film with ("<src>#<n>", "<src>#7b"), in any scene; `selecting` while there is any. */
  picks?: Set<string>; selecting?: boolean; onUnpick?: (t: TakeShots, n: number, tag?: string) => void;
  /** A take not looked at yet (seenTakes.ts): "new" beside its name. */
  isNew?: (t: TakeShots) => boolean;
  /** A shot (or a scene) can be out of the film (13 Nov). Without these the grid only watches; a column with
   *  nothing in the film still shows switched off. `onBring`: a click on a cell of such a column puts that shot
   *  back; `onTakeOut`: the × on the ringed cell takes the column's shot out; `onSceneOut`: the whole scene. */
  onBring?: (t: TakeShots, n: number, tag?: string) => void; onTakeOut?: (t: TakeShots, n: number, tag?: string) => void; onSceneOut?: () => void;
  /** A right-click (or the menu key) on a cell (`n`) or on a take's name (no `n`). */
  onMenu?: (at: { x: number; y: number }, t: TakeShots, n?: number, tag?: string) => void;
  /** The line dragged, or the names row clicked: shot `n`, `p` of the way through. `onSeekEdge`: past the scene's
   *  left (-1) or right (1) edge; true when the playhead went on into the scene there. */
  onSeek?: (n: number, p: number) => void; onSeekEdge?: (dir: -1 | 1) => boolean;
  /** The takes shown are of a layout the film does not use: `from` their layout's number, `into` the one the
   *  film uses. Their columns are their own layout's shots; nothing of theirs is "out", a click selects a shot to try in
   *  a place of the film's layout. */
  foreign?: { from: number; into: number };
  /** A shot of another layout's take: the place it goes in the film's layout, whether that is a safe swap, and the
   *  warnings of the swap (never a reason to refuse it). */
  markOf?: (t: TakeShots, n: number, tag?: string) => { to: number; safe: boolean; warnings: string[] } | undefined;
  /** The painted view behind each shot of the scene, and how to reach a view's file from the film folder. */
  views?: ShotView[]; viewSrc?: (rel: string) => string;
  /** A shot's cell, or a take's name (the whole take), is being dragged onto the timeline; undefined: the
   *  drag ended. Without it nothing drags. */
  onDragTake?: (d: TakeDrag | undefined) => void;
  /** Shots of pick-ups whose place in the scene is not known (pickupRows.ts otherKey): in an "Other shots" column at the
   *  end, not under a shot. */
  other?: Set<string>;
  /** A copy's file → the take it copies: the copy in the film marks that take's shot as in the film. */
  alias?: Map<string, string>;
}) {
  const used = useMemo(() => withAliases(inFilm(tl, by), alias), [tl, by, alias]);
  const isOther = (t: TakeShots, s: Shot) => !!other?.has(otherKey(t.src, s.i));
  const sceneIn = useMemo(() => shotClips(tl, by, scene.id).length > 0, [tl, by, scene.id]);
  const rows = useMemo(() => rowsOf(takes.filter((t) => t.scene === scene.id), used, names), [takes, scene.id, used, names]);
  const mine = useMemo(() => rows.map((r) => r.t).filter((t) => t.state !== 'making'), [rows]);
  // a column a shot of the scene: a pick-up that redoes shot 5 sits in column 5, the cells before it empty;
  // its shots "7a" and "7b" both sit in column 7, side by side, the column as wide as they need
  const lists = useMemo(() => mine.map((t) => shotsOf(t).filter((s) => !other?.has(otherKey(t.src, s.i)))), [mine, other]);
  const cols = columnsOf(lists);
  // the "Other shots" column at the end: as wide as the most such shots of one take, up to three cells' room
  const others = useMemo(() => Math.min(3, Math.max(0, ...mine.map((t) => shotsOf(t).filter((s) => other?.has(otherKey(t.src, s.i))).length))), [mine, other]);
  const weights = useMemo(() => { const w = columnWeights(lists, cols); return others ? [...w, others] : w; }, [lists, cols, others]);
  const allCols = cols + (others ? 1 : 0);
  // a column none of whose takes is in the film: that shot is out, the film goes from the shot before to the one after
  const out = useMemo(() => (foreign ? new Set<number>() : new Set(Array.from({ length: cols }, (_, i) => i + 1).filter((n) => !mine.some((t, k) => lists[k].some((s) => s.n === n && used.has(shotKey(t.src, s))))))), [cols, mine, lists, used, foreign]);
  const anyShot = mine.some((t) => shotsOf(t).length > 0);
  const hot = selShot;
  const stopped = (scene.takes ?? []).filter((t) => t.stopped && !t.path);
  const grid = { gridTemplateColumns: gridColumns(weights) };
  // a take whose shots moved to other columns since it was last drawn (its shots file was written after it landed): its
  // cells fade in where they now are, nothing jumps
  const placeOf = (t: TakeShots) => shotsOf(t).map((x) => x.tag ?? x.n).join(',');
  const placeSig = JSON.stringify(rows.map((r) => [r.t.src, placeOf(r.t)]));
  const [placed, setPlaced] = useState({ sig: placeSig, moved: new Set<string>() });
  if (placed.sig !== placeSig) {
    const was = new Map(JSON.parse(placed.sig) as [string, string][]);
    setPlaced({ sig: placeSig, moved: new Set(rows.filter((r) => was.has(r.t.src) && was.get(r.t.src) !== placeOf(r.t)).map((r) => r.t.src)) });
  }
  const box = useRef<HTMLDivElement>(null);
  // a sideways swipe over the takes is never the browser's back (swipe.ts)
  const outer = useRef<HTMLDivElement>(null);
  useNoSwipeBack(outer);
  // "from Take 1" under a variation: the source row lights for a moment once scrolled to
  const [flash, setFlash] = useState<string>();
  useEffect(() => { if (!flash) return; const k = setTimeout(() => setFlash(undefined), 1100); return () => clearTimeout(k); }, [flash]);
  const showSource = (src: string) => {
    const el = outer.current?.querySelector<HTMLElement>(`[data-take-row="${CSS.escape(src)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setFlash(src);
  };

  // ---- the playhead from the takes (ASKS 53): the line's handle, the line, the names row
  const seekRef = useRef({ cols, weights, onSeek, onSeekEdge });
  useEffect(() => { seekRef.current = { cols, weights, onSeek, onSeekEdge }; });
  const drag = useRef<{ id: number; shift: number; x0: number; moved: boolean; line: boolean } | null>(null);
  /** The pointer's place in the grid: a shot and how far through it, or past an edge. */
  const placeAt = (clientX: number, shift: number): { n: number; p: number } | { edge: -1 | 1 } | undefined => {
    const el = box.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + shift;
    const { cols: c, weights: ws } = seekRef.current;
    if (x < 104 - 14) return { edge: -1 };
    if (x > r.width + 14) return { edge: 1 };
    // the column under the pointer (each as wide as its shares), and how far across its cell
    let k = 0;
    while (k < c - 1 && x >= columnBox(ws, k + 2, r.width).left) k++;
    const b = columnBox(ws, k + 1, r.width);
    const p = (x - b.left - 2) / Math.max(1, b.width - 4);
    return { n: k + 1, p: Math.max(0, Math.min(1, p)) };
  };
  const seekTo = (clientX: number) => {
    const d = drag.current;
    if (!d) return;
    const at = placeAt(clientX, d.shift);
    if (!at) return;
    if ('edge' in at) {
      // on into the scene before or after: the pointer now stands at that scene's near edge, so the drag goes on
      // through it from there
      if (!seekRef.current.onSeekEdge?.(at.edge)) { seekRef.current.onSeek?.(at.edge < 0 ? 1 : seekRef.current.cols, at.edge < 0 ? 0 : 1); return; }
      const r = box.current!.getBoundingClientRect();
      d.shift = (at.edge < 0 ? r.width - 3 : 109) - (clientX - r.left);
      return;
    }
    seekRef.current.onSeek?.(at.n, at.p);
  };
  const seekStart = (e: React.PointerEvent<HTMLElement>, line: boolean) => {
    if (e.button !== 0 || !onSeek) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, shift: 0, x0: e.clientX, moved: false, line };
    // the names row moves the playhead at once; the line only once it is dragged (a click on it is the cell's)
    if (!line) seekTo(e.clientX);
  };
  const lineDown = (e: React.PointerEvent<HTMLElement>) => seekStart(e, true);
  const namesDown = (e: React.PointerEvent<HTMLElement>) => seekStart(e, false);
  const seekMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    seekTo(e.clientX);
  };
  const seekUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.line && !d.moved) {
      // a click on the line, not a drag: it is a click on the cell under it
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x !== e.currentTarget && !e.currentTarget.contains(x) && (x as HTMLElement).closest?.('[data-shot], [data-unpick], [data-take-out]'));
      const target = (under as HTMLElement | undefined)?.closest<HTMLElement>('[data-unpick], [data-take-out], [data-shot]');
      target?.click();
    }
  };
  const lineMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const under = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('[data-shot]')).find(Boolean) as HTMLElement | undefined;
    under?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
  };
  const menuAt = (e: React.MouseEvent<HTMLElement>, t: TakeShots, n?: number, tag?: string) => {
    if (!onMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    // the menu key's own event has no pointer: under the cell then
    const kb = e.clientX === 0 && e.clientY === 0;
    onMenu(kb ? { x: r.left + 8, y: r.bottom + 4 } : { x: e.clientX, y: e.clientY }, t, n, tag);
  };
  const menuKey = (e: React.KeyboardEvent<HTMLElement>, t: TakeShots, n?: number, tag?: string) => {
    if (!onMenu || !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({ x: r.left + 8, y: r.bottom + 4 }, t, n, tag);
  };

  if (!rows.length && !stopped.length) return <p className="text-[12.5px] text-sub">{scene.id} has no take with a clip yet. When one lands it is cut into its shots and shows here.</p>;
  // the line across the takes: column `n`, `p` of the way across its cell (each column as wide as its shares)
  const shares = weights.reduce((a, b) => a + b, 0);
  const left = (n: number, p: number) => {
    const before = weights.slice(0, n - 1).reduce((a, b) => a + b, 0), own = weights[n - 1] ?? 1;
    return `calc(104px + 6px + (100% - 104px - ${allCols * 4}px) / ${shares} * ${before} + ${(n - 1) * 4}px + ((100% - 104px - ${allCols * 4}px) / ${shares} * ${own} - 4px) * ${Math.max(0, Math.min(1, p))})`;
  };
  return (
    <div ref={outer} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-[12px] text-sub">
        {foreign ? (
          <span key="foreign" data-takes-foreign={foreign.from} className="line-in min-w-0"><span className="font-medium text-ink">Layout {foreign.from}’s takes</span> · click a shot to try it in Layout {foreign.into}.</span>
        ) : sceneIn || !anyShot ? (
          <span key="in" className="min-w-0"><span className="font-medium text-ink">{scene.id}{scene.title ? ` · ${scene.title}` : ''}</span> · every take, already cut into its shots. Click any shot to watch it.</span>
        ) : (
          <span key="out" data-scene-out className="line-in min-w-0"><span className="font-medium text-ink">{scene.id}{scene.title ? ` · ${scene.title}` : ''}</span> · not in the film now. Click any shot to bring it back in its place.</span>
        )}
        <span className="flex flex-none items-center gap-3 whitespace-nowrap">
          {sceneIn && onSceneOut && !foreign && (
            <button type="button" data-scene-take-out onClick={onSceneOut} title={`Take every shot of ${scene.id} out of the film. The scene before runs straight into the one after. ⌘Z brings it back.`}
              className="line-in group/out -my-px flex h-6 cursor-pointer items-center text-[11.5px] text-sub transition-colors duration-150 hover:text-ink"><span className="flex h-[22px] items-center rounded-md border border-edge-strong px-2 transition-colors duration-150 group-hover/out:border-sub">Take the scene out</span></button>
          )}
          {foreign && <span className="line-in flex items-center gap-1.5" title={`The same framing and line as a shot of Layout ${foreign.into}: it can go in that shot's place as it is.`}><i aria-hidden="true" className="rounded-[4px] bg-black/80 px-1 text-[10px] not-italic leading-[14px] text-ink">safe</i>safe swap</span>}
          <span className="flex items-center gap-1.5"><i aria-hidden="true" className="inline-block h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-ink" />in the film now</span>
          <span aria-hidden={out.size === 0} title="A shot with no take in the film: the film goes from the shot before to the shot after. Click any of its takes to put it back."
            className={cn('flex items-center gap-1.5 transition-opacity duration-200', out.size ? 'opacity-100' : 'opacity-0')}>
            <i aria-hidden="true" className="inline-block h-2.5 w-3.5 rounded-[3px] border border-dashed border-sub opacity-60" />out of the film
          </span>
        </span>
      </div>
      <div ref={box} className="relative flex flex-col gap-1">
        {head && head.n >= 1 && head.n <= cols && (
          // the film's playhead across the takes: a handle at its top; dragged, it moves the playhead (ASKS 53)
          <span data-takes-head="" role={onSeek ? 'slider' : undefined} aria-label={onSeek ? 'The playhead: drag to move through the film' : undefined} aria-valuenow={onSeek ? Math.round(head.p * 100) : undefined}
            onPointerDown={lineDown} onPointerMove={seekMove} onPointerUp={seekUp} onPointerCancel={() => { drag.current = null; }} onContextMenu={lineMenu}
            className={cn('absolute bottom-0 top-[19px] z-[3] w-[11px] -translate-x-[4.75px] touch-none', onSeek ? 'cursor-ew-resize' : 'pointer-events-none')}
            style={{ left: left(head.n, head.p) }}>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[4.75px] top-[7px] w-[1.5px] rounded-full bg-ink shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />
            {onSeek && <span aria-hidden="true" data-takes-handle="" className="pointer-events-none absolute left-0 top-0 h-[9px] w-[11px] rounded-[2.5px_2.5px_5px_5px] bg-ink shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />}
          </span>
        )}
        <div data-shot-names="" className={cn('grid items-end gap-1', onSeek && 'cursor-ew-resize select-none')} style={grid}
          onPointerDown={namesDown} onPointerMove={seekMove} onPointerUp={seekUp} onPointerCancel={() => { drag.current = null; }}
          title={onSeek ? 'Click or drag to move the playhead' : undefined}>
          <span />
          {Array.from({ length: cols }, (_, i) => (
            <span key={i} data-col={i + 1} data-out={out.has(i + 1) ? '' : undefined} title={out.has(i + 1) ? `Shot ${i + 1} is not in the film: the film goes from the shot before to the shot after. Click one of its takes to put it back.` : undefined}
              className={cn('truncate rounded-t-[7px] px-1.5 pb-0.5 pt-1 text-[11.5px] font-medium transition-colors duration-200', hot === i + 1 ? 'bg-[#141417] text-ink' : out.has(i + 1) ? 'text-mute' : 'text-sub')}>
              Shot {i + 1}{out.has(i + 1) && <span className="line-in font-normal"> · out</span>}
            </span>
          ))}
          {others > 0 && (
            <span data-col-other="" title="Shots of pick-ups whose place in the scene is not known: their shot lists do not say which place each stands for. A click still tries one in the film."
              className="line-in truncate px-1.5 pb-0.5 pt-1 text-[11.5px] font-medium text-mute">Other shots</span>
          )}
        </div>
        {rows.map(({ t, source, n: vn, depth }) => {
          const shots = shotsOf(t);
          const place = placeOf(t);
          const moved = placed.moved.has(t.src);
          const v = t.variation;
          const srcName = source ? cap(names.get(source.src) ?? source.name) : undefined;
          const name = v && vn ? `${srcName ?? cap(names.get(t.src) ?? t.name)}, variation ${vn}` : cap(names.get(t.src) ?? t.name);
          const fresh = !!isNew?.(t);
          // the take's name is the handle that drags the whole take onto the timeline
          const dragsWhole = !!onDragTake && t.state !== 'making' && t.state !== 'failed' && (shots.length > 0 || !!t.seconds);
          const nameCell = (
            <span data-take-name={t.src} onContextMenu={(e) => menuAt(e, t)} draggable={dragsWhole || undefined}
              onDragStart={dragsWhole ? (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', name); onDragTake!({ t }); } : undefined}
              onDragEnd={dragsWhole ? () => onDragTake!(undefined) : undefined}
              className={cn('relative flex min-w-0 flex-col justify-center pr-1.5 text-[12.5px] font-medium leading-tight text-ink', depth > 0 && 'pl-3', dragsWhole && 'cursor-grab active:cursor-grabbing')}
              title={`${t.src.replace(/^assets\/films\/[^/]+\//, '')}${dragsWhole ? '\nDrag onto the timeline to place the whole take' : ''}`}>
              {depth > 0 && <i aria-hidden="true" className="absolute left-0.5 top-[-6px] bottom-1/2 w-1.5 rounded-bl-[4px] border-b border-l border-[#45454d]" />}
              <span className="line-clamp-2">{name}<NewTag on={fresh} /></span>
              {source && t.state !== 'making' && (
                <button type="button" data-from={source.src} onClick={() => showSource(source.src)} title={`Show ${srcName}, the take this was made from`}
                  className="max-w-full cursor-pointer truncate text-left text-[11px] font-normal text-ink-3 underline decoration-[#55555e] underline-offset-2 transition-colors duration-150 hover:text-ink">from {srcName}</button>
              )}
              {t.state === 'waiting' && <span className="text-[11px] font-normal text-sub">being cut…</span>}
              {t.state === 'failed' && <span className="text-[11px] font-normal text-warn">could not be read</span>}
            </span>
          );
          // a variation Alma has started and that has no video yet: being made, or it could not be made
          if (t.state === 'making') {
            return (
              <div key={t.src} data-take-row={t.src} data-making={v?.failed ? undefined : ''} data-failed-variation={v?.failed ? '' : undefined} className="line-in grid items-stretch gap-1" style={grid}>
                {nameCell}
                {v?.failed ? (
                  <span className="col-span-full col-start-2 flex h-7 min-w-0 items-center self-center rounded-[7px] border border-dashed border-edge-strong px-3 text-[12px] text-sub" title={v.failed}>
                    <span className="truncate">Could not be made · {v.failed}</span>
                  </span>
                ) : (
                  <span className="relative col-span-full col-start-2 grid gap-1" style={{ gridTemplateColumns: gridColumns(weights).replace(/^104px /, '') }} title={v?.note ? `“${v.note}”` : undefined}>
                    {Array.from({ length: allCols }, (_, i) => (
                      <span key={i} className="h-[68px] p-0.5"><i aria-hidden="true" className="node-live sheen-calm block h-[64px] rounded-[7px] border border-dashed border-[#45454d] bg-[#0d0d0f]" /></span>
                    ))}
                    <b className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[6px] border border-[#303036] bg-black/85 px-2.5 py-[3px] text-[11.5px] font-normal text-ink-3">
                      Being made{v?.startedAt && clock(v.startedAt) ? ` · started ${clock(v.startedAt)}` : ''}
                    </b>
                  </span>
                )}
              </div>
            );
          }
          return (
            <div key={t.src} className="flex flex-col gap-1">
            <div data-take-row={t.src} className={cn('grid items-stretch gap-1 rounded-[9px] transition-colors duration-500', flash === t.src && 'bg-[#1c1c20]')} style={grid}>
              {nameCell}
              {[...cellsOf(shots.filter((s) => !isOther(t, s)), cols), ...(others ? [shots.filter((s) => isOther(t, s))] : [])].map((cell, i) => {
                // a cell's key carries where the take's shots are: moved to other columns, they are drawn anew and fade in
                const ck = `${i}:${place}`;
                // the "Other shots" column: its shots side by side, each named by its place in its take
                const otherCol = i === cols;
                if (!cell.length) return <span key={ck} className={cn('h-[68px] rounded-[9px] transition-colors duration-200', !otherCol && hot === i + 1 && 'bg-[#141417]')} />;
                // one shot of the take: drawn alone in its cell, as before; two or more of one number ("7a", "7b"):
                // side by side in the column's cell, each named
                const shotCell = (s: Shot, share: boolean) => {
                const tag = subTag(s);
                const label = otherCol ? `#${s.i}` : cellLabel(s, share);
                const said = otherCol ? (subTag(s) ?? String(s.n)) : label ?? String(s.n);
                const key = shotKey(t.src, s);
                const isIn = used.has(key);
                const isPick = !!picks?.has(key);
                const isWatch = isPick || (watching?.src === t.src && watching.n === s.n && (watching.tag ?? undefined) === tag);
                const isOut = !otherCol && out.has(s.n);
                const bring = isOut && !!onBring && t.state === 'ready';
                const canOut = isIn && !!onTakeOut && !selecting;
                const mark = markOf?.(t, s.n, tag);
                const drags = !!onDragTake && t.state === 'ready';
                return (
                  <div key={share ? key : ck} data-col={share || otherCol ? undefined : s.n} data-other={otherCol ? '' : undefined} className={cn('group/cell relative rounded-[9px] p-0.5 transition-[background-color,opacity] duration-200', !share && hot === i + 1 && 'bg-[#141417]', !share && moved && 'line-in', isOut && !isWatch && 'opacity-45 hover:opacity-90 has-[:focus-visible]:opacity-90')}>
                    <button type="button" aria-pressed={isWatch} onClick={() => { if (bring) onBring!(t, s.n, tag); else onShot(t, s.n, tag); }} data-shot={key} data-in={isIn ? '' : undefined} data-pick={isPick ? '' : undefined}
                      draggable={drags || undefined} onDragStart={drags ? (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', `${name} · shot ${said}`); onDragTake!({ t, n: s.n, ...(tag ? { tag } : {}) }); } : undefined}
                      onDragEnd={drags ? () => onDragTake!(undefined) : undefined}
                      onContextMenu={(e) => menuAt(e, t, s.n, tag)} onKeyDown={(e) => menuKey(e, t, s.n, tag)}
                      data-safe={mark?.safe ? mark.to : undefined} data-warn={mark && !mark.safe ? mark.warnings.length : undefined}
                      title={`${name} · shot ${otherCol ? `${s.i} of the take (its place in ${scene.id} is not known)` : said} · ${secs(s.out - s.in)}${isIn ? ' · in the film now · click to watch it' : bring ? ' · not in the film · click to put it back in its place (⌘Z takes it out again)' : isPick ? ' · selected · click to unselect it' : ' · click to watch it and select it'}${drags ? ' · or drag it onto the timeline to place it' : ''}${mark ? `\n${mark.safe ? `A safe swap for shot ${mark.to}${foreign ? ` of Layout ${foreign.into}` : ''}: the same framing and line.` : `Goes in place of shot ${mark.to}${foreign ? ` of Layout ${foreign.into}` : ''}.`}${mark.warnings.length ? `\n${mark.warnings.join('\n')}` : ''}` : ''}`}
                      className={cn('group @container relative block h-[64px] w-full overflow-hidden rounded-[7px] border bg-panel text-left transition-[border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:cursor-default', drags ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                        isWatch ? 'border-dashed border-ink shadow-[0_0_0_1px_#FAFAFA]' : isIn ? 'border-ink shadow-[0_0_0_1px_#FAFAFA]' : isOut ? 'border-dashed border-edge-strong hover:border-sub' : 'border-edge hover:border-sub')}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a poster frame from /api/media, cached on disk */}
                      <img alt="" draggable={false} loading="lazy" src={mediaUrl(t.src, { w: 160, t: Math.round(((s.in + s.out) / 2) * 100) / 100 })}
                        className="absolute inset-y-0 left-0 h-full w-full object-cover object-[50%_28%] transition-opacity duration-200 group-hover:opacity-100 @[84px]:w-[36px] @[84px]:object-center [[data-frame=wide]_&]:w-full [[data-frame=wide]_&]:bg-black [[data-frame=wide]_&]:object-contain" style={{ opacity: isIn || isWatch ? 1 : 0.72 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      {/* a wide cell: the whole frame at the left, the length beside it; a narrow one: the length over the frame */}
                      <span className="absolute bottom-1 left-1 rounded-[4px] bg-black/75 px-1.5 text-[11px] leading-4 text-ink [font-variant-numeric:tabular-nums] @[84px]:bottom-auto @[84px]:left-[44px] @[84px]:top-1/2 @[84px]:-translate-y-1/2 @[84px]:bg-transparent @[84px]:px-0 @[84px]:text-[13px] [[data-frame=wide]_&]:bottom-1 [[data-frame=wide]_&]:left-1 [[data-frame=wide]_&]:top-auto [[data-frame=wide]_&]:translate-y-0 [[data-frame=wide]_&]:bg-black/75 [[data-frame=wide]_&]:px-1.5 [[data-frame=wide]_&]:text-[11px]">{secs(s.out - s.in)}</span>
                      {/* the shot's own name when its column alone does not say it ("7a"); another layout's shot:
                          "safe" with the place it is the same as, else the place it would go, in amber */}
                      {(label || mark) && (
                        <span className="absolute left-1 top-1 flex max-w-[calc(100%-8px)] items-center gap-0.5">
                          {label && <span data-shot-tag={label} className="rounded-[4px] bg-black/80 px-1 text-[10px] font-medium leading-[14px] text-ink [font-variant-numeric:tabular-nums]">{label}</span>}
                          {mark && (
                            <span data-mark={mark.safe ? 'safe' : 'warn'} className={cn('line-in truncate rounded-[4px] bg-black/80 px-1 text-[10px] leading-[14px] [font-variant-numeric:tabular-nums]', mark.safe ? 'text-ink' : 'text-warn')}>
                              {mark.safe ? `safe → ${mark.to}` : `→ ${mark.to}`}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    {/* take the shot out: on the ringed cell, shown on hover and keyboard focus (always on a touch screen);
                        hidden while shots are selected */}
                    {onTakeOut && (
                      <button type="button" data-take-out={key} tabIndex={canOut ? 0 : -1} aria-hidden={!canOut} disabled={!canOut}
                        onClick={(e) => { e.stopPropagation(); if (canOut) onTakeOut(t, s.n, tag); }}
                        aria-label={`Take ${scene.id} shot ${said} out of the film`} title="Take this shot out of the film. What follows closes up. ⌘Z brings it back."
                        className={cn('absolute right-1.5 top-1.5 z-[2] flex size-[18px] items-center justify-center rounded-full border border-edge-strong bg-black/85 text-ink transition-[opacity,background-color,border-color] duration-150 ease-out hover:border-ink hover:bg-[#1c1c20] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink',
                          canOut ? 'cursor-pointer opacity-0 group-hover/cell:opacity-100 group-has-[:focus-visible]/cell:opacity-100 [@media(hover:none)]:opacity-90' : 'pointer-events-none opacity-0')}>
                        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l6 6M7 1 1 7" /></svg>
                      </button>
                    )}
                    {/* a selected shot: a small × to unselect it */}
                    {onUnpick && (
                      <button type="button" data-unpick={key} tabIndex={isPick ? 0 : -1} aria-hidden={!isPick} disabled={!isPick}
                        onClick={(e) => { e.stopPropagation(); if (isPick) onUnpick(t, s.n, tag); }}
                        aria-label={`Unselect ${name} shot ${said}`} title="Unselect this shot"
                        className={cn('absolute right-1.5 top-1.5 z-[2] flex size-4 items-center justify-center rounded-full bg-ink text-bg transition-[opacity,transform] duration-150 ease-out hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
                          isPick ? 'cursor-pointer opacity-100' : 'pointer-events-none scale-75 opacity-0')}>
                        <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l6 6M7 1 1 7" /></svg>
                      </button>
                    )}
                  </div>
                );
                };
                if (cell.length === 1 && !otherCol) return shotCell(cell[0], false);
                return (
                  <div key={ck} data-col={otherCol ? undefined : i + 1} data-col-other={otherCol ? cell.length : undefined} data-cell-shots={cell.length} className={cn('grid min-w-0 rounded-[9px] transition-colors duration-200', !otherCol && hot === i + 1 && 'bg-[#141417]', moved && 'line-in')}
                    style={{ gridTemplateColumns: `repeat(${cell.length}, minmax(0, 1fr))` }}>
                    {cell.map((s) => shotCell(s, true))}
                  </div>
                );
              })}
            </div>
            {/* the user's words the variation was made from */}
            {v?.note && (
              <div className="grid gap-1" style={grid} data-variation-note={t.src}>
                <span />
                <p className="col-span-full col-start-2 m-0 -mt-0.5 truncate px-1 text-[11.5px] leading-[15px] text-ink-3" title={`“${v.note}”`}>“{v.note}”</p>
              </div>
            )}
            </div>
          );
        })}
        {stopped.map((t) => (
          <div key={t.id} className="grid items-center gap-1" style={grid}>
            <span className="truncate pr-1.5 text-[12.5px] font-medium text-ink">{cap(t.id.replace(/^take(\d+)$/i, 'take $1'))}</span>
            <a href={`${base}/scenes/${scene.id}?take=${encodeURIComponent(t.id)}`} title={t.stoppedWhy}
              className="col-span-full col-start-2 flex h-7 items-center justify-between rounded-[7px] border border-dashed border-edge-strong px-3 text-[12px] text-sub no-underline transition-colors duration-200 hover:border-sub hover:text-ink">
              <span>{t.stopped === 'blocked' ? 'Refused' : 'Failed'} · nothing spent</span><span aria-hidden="true">›</span>
            </a>
          </div>
        ))}
      </div>
      {/* the painted view behind each shot, under its column; a shot that names none shows nothing. Not for
          another layout's takes: their columns are not the shots the views were named for. */}
      {views && views.length > 0 && !foreign && (() => { const labels = shortViewNames(views); return (
        <div data-shot-views="" className="grid items-center gap-1" style={grid}>
          <span className="pr-1.5 text-[12px] leading-tight text-sub" title="The painted view of the location each shot stands in front of, from the scene's prompt">Views</span>
          {Array.from({ length: cols }, (_, i) => {
            const vw = views.find((x) => x.shot === i + 1);
            return (
              <span key={i} className={cn('rounded-[9px] p-0.5 transition-colors duration-200', hot === i + 1 && 'bg-[#141417]')}>
                {vw && viewSrc ? <ViewThumb view={vw} src={viewSrc(vw.path)} scene={scene.id} label={labels.get(vw.tag)} className="h-[44px] w-full" /> : <span aria-hidden="true" className="block h-[44px]" />}
              </span>
            );
          })}
        </div>
      ); })()}
    </div>
  );
}

/** The shots selected (ASKS 52): a small box that floats over the bottom of the Takes view and takes no room ("4 shots
 *  selected in 3 scenes", "Back to the film", "Use in the film", and a chevron that folds it to a chip "4 selected" at
 *  the same place). It hangs under the end of the grid, so it never covers the grid's first row; when the grid runs
 *  past the window it stays in sight at the window's bottom. It fades and slides in and out. */
export function PicksBox({ count, hover, open, folded, onFold, disabled, onBack, onUse }: {
  count: string; hover: string; open: boolean; folded: boolean; onFold: (f: boolean) => void; disabled?: boolean;
  onBack: () => void; onUse: () => void;
}) {
  // the words stay while the box fades away
  const [kept, setKept] = useState({ count, hover });
  if (open && (kept.count !== count || kept.hover !== hover)) setKept({ count, hover });
  const short = `${kept.count.split(' ')[0]} selected`;
  return (
    // the box fades in place (its content grows in as it opens): closed, it used to sit 8 px lower, which made the page
    // 8 px taller, so a page scrolled to its end jumped by 8 px when the first shot was selected (15 Nov)
    <div data-picks-anchor="" className="pointer-events-none sticky bottom-[60px] z-[8] h-0">
      <div data-picks-box={open ? (folded ? 'folded' : 'open') : 'closed'} inert={!open} aria-hidden={!open}
        className={cn('absolute left-1/2 top-2 max-w-full -translate-x-1/2 transition-opacity duration-200 ease-out motion-reduce:transition-none', open ? 'opacity-100' : 'opacity-0')}>
        {folded ? (
          <button key="chip" type="button" data-picks-chip="" onClick={() => onFold(false)} title={kept.hover} aria-label={`${kept.count}: open`}
            className="pointer-events-auto flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#3f3f46] bg-[#101012] px-3 text-[12px] font-medium text-ink shadow-[0_10px_30px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.6)] duration-200 animate-in fade-in-0 zoom-in-95 hover:border-sub">
            {short}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-sub"><path d="M3 7.5 6 4.5l3 3" /></svg>
          </button>
        ) : (
          <div key="box" role="group" aria-label="Shots selected"
            className="pointer-events-auto flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-[#3f3f46] bg-[#101012] pl-3.5 pr-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.6)] duration-200 animate-in fade-in-0 zoom-in-95">
            <b data-picks-count="" title={kept.hover} className="mr-1.5 min-w-0 cursor-default truncate text-[12.5px] font-medium text-ink">{kept.count}</b>
            <button type="button" data-back-film="box" onClick={onBack} title="Unselect them all (Esc). The film was never changed."
              className="h-7 flex-none cursor-pointer rounded-[7px] px-2.5 text-[12.5px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink">Back to the film</button>
            <button type="button" data-picks-use="" onClick={onUse} disabled={disabled} title="Put every selected shot in the film, as one step. One Undo takes them all out."
              className="h-7 flex-none cursor-pointer rounded-[7px] border border-ink bg-ink px-2.5 text-[12.5px] font-medium text-bg transition-colors duration-150 hover:bg-ink/90 disabled:cursor-default disabled:opacity-50">Use in the film</button>
            <button type="button" data-picks-fold="" onClick={() => onFold(true)} aria-label="Fold this box" title="Fold this box to a chip"
              className="flex h-7 w-[26px] flex-none cursor-pointer items-center justify-center rounded-[7px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
