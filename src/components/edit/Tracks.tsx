'use client';
// The track view (design/boards/Edit.dc.html, the lower half): the tool bar, the SMPTE ruler with markers,
// the track headers (mute / solo / lock, add track) and the lanes. Clicks select (V1 and A1 of a block
// together), a drag moves a clip within its track, the edges trim, the blade splits, A2's level line drags
// the gain. A finished gesture hands one Edit to the page, which writes it as one version.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { smpte } from '@/components/lib/format';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { StepGlyph } from '@/components/flow/FlowBoard';
import { useDrawCount } from './drawCount';
import {
  addTrack, clampAlone, clampRoll, clampTrim, clipName, cutPoints, endF, lenF, moveClip, groupDelta, moveClips, withPartners, canMoveToTrack, moveToTrack, moveClipsToTracks, planTrackMove, partnerOf, pastEnd, pastShot, patchClip, patchTrack, rollEdit, rollPairs, shotFrames, snapDelta, splitClip, startF,
  refuse, speedOf, superseded, toConfirm, toF, totalF, trimAlone, trimClip, type ClipFrames, type ClipRef, type Edit, type NameOf,
} from './model';
import { wheelPastEdge } from './swipe';
import { trimStop } from './trimStop';
import { addGainPoint, maxDissolveF, moveGainPoint, pointRange, pointsDb, setDissolve, setFade } from './controls';
import { asFades, fadeDb, fmtLevel } from './fades';
import { isLine, oneRow } from './subs';
import { retypeLine } from './subsEdit';
import { LineField } from './Subtitles';
import { flagPlaces, markerName } from './bookmarks';

export type Tool = 'select' | 'blade';
/** What a selection box does: replace the selection, add to it, or take out of it (Option-Command). */
export type BoxMode = 'replace' | 'add' | 'remove';
/** The keys that pick it, read from every pointer and key event while the box is drawn (Control is never one
 *  of them for taking out: on a Mac, Control-click is a right-click). */
const boxMode = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): BoxMode =>
  e.metaKey && e.altKey ? 'remove' : e.metaKey || e.ctrlKey || e.shiftKey ? 'add' : 'replace';

interface Props {
  tl: Timeline;
  frame: number;
  setFrame: (f: number) => void;
  sel?: ClipRef;
  /** `how`: Command-click adds or removes the clip ('toggle'), Shift-click selects up to it ('range'),
   *  Option-Command-click takes it out ('remove'). */
  onSelect: (r: ClipRef | undefined, clip?: TimelineClip, track?: TimelineTrack, how?: 'toggle' | 'range' | 'remove') => void;
  /** Every selected clip, the first being `sel`; with more than one, a drag on any moves them all. */
  group?: ClipRef[];
  /** A box dragged over empty timeline: the clips it touched; 'add' when Command or Shift was held at the
   *  end, 'remove' when Option and Command were. */
  onBox?: (refs: ClipRef[], mode: BoxMode) => void;
  /** The selection shown moved by this many frames while the comma and period keys are still being pressed. */
  nudge?: { ids: Set<string>; d: number };
  onEdit: (e: Edit | undefined) => void;
  tool: Tool;
  ripple: boolean;
  snap: boolean;
  readOnly?: boolean;
  srcSeconds: (src: string) => number | undefined;
  /** What a clip may use of its file (shots.ts clipFrames): with its take's shots known, a trim, a moved join and a
   *  picture trimmed alone stop at its shot's own first and last frame. Without it, the file's ends. */
  framesOf?: (c: TimelineClip) => ClipFrames;
  toolbar: React.ReactNode;
  notice?: React.ReactNode;
  zoomCmd?: { n: number; dir: 1 | -1 | 0 };
  /** Zoom so these frames fill the lane (the film strip's "open a scene"). */
  focus?: { n: number; from: number; to: number };
  /** The scenes the picture runs through, drawn as a band under the ruler (frames). */
  /** `making`: the scene waits for its take (the timeline from day one): a spinner at any zoom, its words on hover. */
  scenes?: { scene?: string; label: string; title?: string; from: number; to: number; making?: boolean }[];
  openScene?: string;
  /** Two lines for a picture clip ("Shot 2" over "Short C"); the clip's label when it gives nothing. */
  clipText?: (c: TimelineClip, t: TimelineTrack) => { title: string; sub?: string } | undefined;
  /** Clips shown as tried in place, not in the film yet. */
  tryIds?: Set<string>;
  /** The 1080p view (ASKS 37): where a picture clip's full-size picture comes from, quiet for the normal case and loud for
   *  the exception: an upscaled take a thin light line along the top, Seedance the line in blue and a tiny label, no full-size
   *  picture an amber dashed top and an amber "480p". `marked`: its take is marked to redo in Seedance (dashed amber). */
  clipMark?: (c: TimelineClip, t: TimelineTrack) => { kind: 'upscaled' | 'seedance' | 'full' | 'small'; marked?: boolean } | undefined;
  /** A quiet mark on a picture clip that can be pressed ("1 new take": a take newer than the cut's). */
  clipNote?: (c: TimelineClip, t: TimelineTrack) => { text: string; title: string; onPress: () => void } | undefined;
  /** The tracks listened to alone, and the S button's click: a way of listening, never saved (13 Nov). */
  solo?: Set<string>;
  onSolo?: (trackId: string) => void;
  /** The tracks a paste goes to, one for picture and one for sound; a click on a track's id marks it. */
  pasteTo?: Set<string>;
  onPasteTo?: (trackId: string) => void;
  /** A right-click on the timeline: where (the window's x and y), the frame, the track and the clip under it. */
  onMenu?: (m: { x: number; y: number; frame: number; trackId?: string; clipId?: string }) => void;
  /** A right-click on a track's name cell (its buttons included): the track menu (rename, move, delete). */
  onHeadMenu?: (m: { x: number; y: number; trackId: string }) => void;
  /** The track whose name is being edited in its cell; `onRenamed` gets the new name, or undefined for Escape. */
  renaming?: string;
  onRenamed?: (trackId: string, name: string | undefined) => void;
  /** While a join on a picture track is moved: the frame that would come right after it (the later clip's
   *  file and time), for the player to show; undefined when the drag ends. */
  onPeek?: (p: { src: string; t: number } | undefined) => void;
  /** The name a version's note gives a shot ("S2 shot 3"), for an edge trimmed alone. */
  nameOf?: NameOf;
  /** The M and lock buttons: pressed here, saved by the page once the presses rest (13 Nov). Without it they save at once. */
  onPress?: (trackId: string, k: 'muted' | 'locked') => void;
  /** The level point clicked last (Delete removes it), and the click that picks one or none. */
  point?: { trackId: string; clipId: string; i: number };
  onPoint?: (p: { trackId: string; clipId: string; i: number } | undefined) => void;
  /** A file of the film being dragged from the file list (Files.tsx), or a shot or a whole take from the Takes view
   *  (ShotViews.tsx): a lane of its kind lights under the pointer and takes it; `frames` is its length, for
   *  snapping its end too (14 Nov). */
  fileDrag?: { kind: 'video' | 'audio' | 'captions'; frames: number };
  onDropFile?: (trackId: string, frame: number) => void;
  /** Retype this subtitle line (Enter on the page with one line selected): its field opens over the block. */
  retype?: { n: number; ref: ClipRef };
  /** Words in an empty lane, by track id (the timeline from day one: "No shots yet. They come with the shot lists."). */
  laneNote?: Record<string, string>;
  /** Bookmarks: the flag selected on the ruler (an index in tl.markers), and its click; a drag hands the
   *  frame it was let go at, the field opened on it (a double-click, or `markerRename` from the page's Enter and menu)
   *  hands its new words (undefined for Escape), a right-click opens the flag's menu. */
  markerSel?: number;
  onMarkerSelect?: (i: number | undefined) => void;
  onMarkerMove?: (i: number, f: number) => void;
  markerRename?: { n: number; i: number };
  onMarkerRenamed?: (i: number, text: string | undefined) => void;
  onMarkerMenu?: (m: { x: number; y: number; i: number }) => void;
}

const HEAD = 150;               // track header width (the board's --th)
// A clip is drawn exactly from its start to its end (the user, 13 Nov: zoomed out, "I don't see that the line is not
// at the end of the video"): it used to be at least 24 px wide, so short clips ran over their neighbours and the
// last one past the end of the film. Only a 2 px floor keeps a very short clip from vanishing; what is inside a
// clip hides as it narrows (thumbnail under 20 px, fade ramps under 16, the level line under 24, tags and trim handles under 30).
const MIN_CLIP = 2;
const TRIM_MIN = 30;            // narrower clips get no trim handles: zoom in to trim them
// Where two clips touch (both wide enough for trim handles), the 6 px centred on the join move the join
// (JOIN_HALF each side, cursor col-resize) and each trim handle beside it is 9 px wide, so 6 px of it stays a
// trim outside that zone, as on a clip with no neighbour (DaVinci: on the cut it rolls, beside it it trims).
const JOIN_HALF = 3;
const TRIM_W = 6, TRIM_W_JOIN = TRIM_W + JOIN_HALF;
const SNAP_PX = 8;
const RULER = 32;               // the sticky ruler's height (h-8): the top edge of the lanes when scrolling up
const EDGE = 40;                // a drag this close to an edge of the timeline, or past it, scrolls it
/** Pixels per frame scrolled at `d` px into the edge zone (more past the edge): faster the further out. */
const edgeSpeed = (d: number) => Math.round(Math.min(40, 2 + d * 0.25));
const edgeV = (p: number, lo: number, hi: number) => (p < lo + EDGE ? -edgeSpeed(lo + EDGE - p) : p > hi - EDGE ? edgeSpeed(p - (hi - EDGE)) : 0);
/** What a drag reads from a pointer event; the edge scrolling replays the last one as the content moves. */
type Pt = { clientX: number; clientY: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
const ptOf = (e: Pt): Pt => ({ clientX: e.clientX, clientY: e.clientY, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey });
const MAX_Z = 24;                // px a frame, zoomed all the way in
const DB_TOP = 6, DB_BOTTOM = -36;

const rowH = (t: TimelineTrack, tl: Timeline) => (t.kind === 'captions' ? 34 : t.kind === 'video' ? (t.id === firstVideo(tl) ? 64 : 46) : t.id === firstAudio(tl) ? 52 : 50);
const firstVideo = (tl: Timeline) => (tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'))?.id;
const firstAudio = (tl: Timeline) => (tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio'))?.id;
/** Audio tracks other than the dialogue under V1 show the level line (A2). */
const hasLevel = (t: TimelineTrack, tl: Timeline) => t.kind === 'audio' && t.id !== firstAudio(tl);
const dbToY = (db: number, h: number) => ((DB_TOP - Math.max(DB_BOTTOM, Math.min(DB_TOP, db))) / (DB_TOP - DB_BOTTOM)) * (h - 8) + 4;
const yToDb = (y: number, h: number) => Math.round((DB_TOP - ((y - 4) / (h - 8)) * (DB_TOP - DB_BOTTOM)) * 2) / 2;
const fmtDb = (db: number) => `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db)} dB`;

/** Ruler steps: frames, then seconds, so labels sit at least ~90px apart. */
function rulerStep(zoom: number, fps: number): number {
  const steps = [1, 2, 6, 12, fps, 2 * fps, 5 * fps, 10 * fps, 15 * fps, 30 * fps, 60 * fps, 120 * fps, 300 * fps];
  return steps.find((s) => s * zoom >= 90) ?? steps[steps.length - 1];
}

type Drag =
  | { kind: 'move'; ref: ClipRef; ids: Set<string>; x0: number; d: number; moved: boolean; y0?: number; to?: string; dy?: number; group?: boolean; shuffle?: boolean;
      // several selected clips dragged onto other tracks: how far down each one goes (px, by clip id), the
      // link mates that go along in time on their own tracks, and, when the move is refused, why
      tos?: Record<string, number>; toRows?: string[]; along?: Set<string>; why?: string }
  // x and y in the timeline's content (scrolled) coordinates, so the box stays anchored where it began while the
  // timeline scrolls under it
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; mode: BoxMode; moved: boolean; hit: string[] }
  // `alone` (Option held at the press): that clip is trimmed by itself, its picture or sound left as it is, nothing
  // closing up; a sound may grow over its neighbour. `why`: why it stops, at a limit
  | { kind: 'head' | 'tail'; ref: ClipRef; ids: Set<string>; x0: number; d: number; moved: boolean; alone?: boolean; why?: string; say?: string }
  | { kind: 'gain'; ref: ClipRef; y0: number; h: number; db0: number; db: number; moved: boolean }
  | { kind: 'fadeIn'; ref: ClipRef; x0: number; f0: number; f: number; max: number; moved: boolean }
  | { kind: 'fadeOut'; ref: ClipRef; x0: number; f0: number; f: number; max: number; moved: boolean }
  // the join between two touching clips moved (and the linked picture or sound's join with it): `lefts` get
  // longer by d frames at their ends, `rights` start d frames later; `j` is the join's frame before the drag
  | { kind: 'roll'; left: ClipRef; right: ClipRef; lefts: Set<string>; rights: Set<string>; j: number; x0: number; d: number; why?: string; moved: boolean }
  // a dissolve's edge dragged: wider or narrower by twice the pointer's frames (it stays centred on the join)
  | { kind: 'dissolve'; ref: ClipRef; x0: number; f0: number; f: number; max: number; side: -1 | 1; moved: boolean }
  // a level point dragged: `t` in seconds of the source file (between its neighbours), `db` added to the clip's level
  | { kind: 'point'; ref: ClipRef; i: number; x0: number; y0: number; t0: number; db0: number; t: number; db: number; h: number; gain: number; lo: number; hi: number; sp: number; moved: boolean }
  | { kind: 'scrub' };

type MoveDrag = Extract<Drag, { ids: Set<string> }>;
const isMove = (d?: Drag): d is MoveDrag => !!d && (d.kind === 'move' || d.kind === 'head' || d.kind === 'tail');
/** The ramp drawn over a faded end: the line from full sound to none, the lost part darkened. */
const ramp = (dir: 'in' | 'out') => `linear-gradient(to top ${dir === 'in' ? 'left' : 'right'}, transparent calc(50% - 1px), #fafafa calc(50% - 1px), #fafafa calc(50% + .5px), rgba(0,0,0,.72) calc(50% + .5px))`;

export function Tracks({ tl, frame, setFrame, sel, onSelect, onEdit, tool, ripple, snap, readOnly, srcSeconds, framesOf, toolbar, notice, zoomCmd, focus, scenes, openScene, clipText, tryIds, clipMark, clipNote, solo, onSolo, pasteTo, onPasteTo, group, onBox, nudge, onMenu, onHeadMenu, renaming, onRenamed, onPeek, nameOf, onPress, point, onPoint, fileDrag, onDropFile, retype, laneNote, markerSel, onMarkerSelect, onMarkerMove, markerRename, onMarkerRenamed, onMarkerMenu }: Props) {
  const fps = tl.fps;
  const total = Math.max(totalF(tl), fps * 10);
  const scroller = useRef<HTMLDivElement>(null);
  useDrawCount('Tracks');
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState<number>();
  const [drag, setDrag] = useState<Drag>();
  const dragRef = useRef<Drag | undefined>(undefined);
  // the subtitle line whose words are being retyped in the field over its block (double-click, or Enter on the page)
  const [editing, setEditing] = useState<ClipRef>();
  const lastRetype = useRef(0);
  useEffect(() => {
    if (!retype || retype.n === lastRetype.current) return;
    lastRetype.current = retype.n;
    // the page's Enter is a command, like its zoom keys
    setEditing(retype.ref);
  }, [retype]);

  // ---- bookmarks on the ruler: a flag pressed goes to its frame and is selected; dragged, it moves (the
  // playhead going along, so the picture shows where it lands) and is handed over once, at the release, as one step
  const [flagDrag, setFlagDrag] = useState<{ i: number; x0: number; f0: number; f: number; moved: boolean }>();
  const [flagName, setFlagName] = useState<{ i: number; text: string }>();
  const naming = useRef(false);
  const lastRename = useRef(0);
  useEffect(() => {
    if (!markerRename || markerRename.n === lastRename.current) return;
    lastRename.current = markerRename.n;
    const m = tl.markers[markerRename.i];
    if (m) { naming.current = true; setFlagName({ i: markerRename.i, text: m.text }); }
  }, [markerRename, tl.markers]);
  const openName = (i: number) => { const m = tl.markers[i]; if (!m || readOnly || !onMarkerRenamed) return; naming.current = true; setFlagName({ i, text: m.text }); };
  /** The name field closes once: Enter or a click elsewhere keeps the words, Escape keeps the old ones. */
  const closeName = (keep: boolean) => {
    if (!naming.current || !flagName) return;
    naming.current = false;
    const v = flagName;
    setFlagName(undefined);
    onMarkerRenamed?.(v.i, keep ? v.text : undefined);
  };
  const flagDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const m = tl.markers[i];
    if (!m) return;
    const f0 = toF(m.at, fps);
    onMarkerSelect?.(i);
    setFrame(f0);
    if (readOnly || !onMarkerMove) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFlagDrag({ i, x0: e.clientX, f0, f: f0, moved: false });
  };
  const flagMove = (e: React.PointerEvent) => {
    const d = flagDrag;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 3) return;
    const f = Math.max(0, Math.min(totalF(tl), Math.round(d.f0 + dx / live.current.z)));
    if (f !== d.f || !d.moved) { setFlagDrag({ ...d, f, moved: true }); setFrame(f); }
  };
  const flagUp = () => {
    const d = flagDrag;
    setFlagDrag(undefined);
    if (d?.moved && d.f !== d.f0) onMarkerMove?.(d.i, d.f);
  };
  const fit = Math.max(0.02, (width - HEAD - 24) / total);
  const z = zoom ?? fit;
  // what the zoom's own listeners and animation frames read (they outlive a render)
  const live = useRef({ z, fit, frame, sel, tl });
  useLayoutEffect(() => { live.current = { z, fit, frame, sel, tl }; });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // The lane's width in whole pixels, rounded down from the box as laid out. clientWidth rounds, so with
    // the viewer at its widest (a width in fractions of a pixel) the fit came out up to half a pixel wider than the
    // lane: a horizontal scrollbar, and the vertical one it brings, in a browser that counts that half pixel. The
    // vertical scrollbar's room is kept whether it shows or not (scrollbar-gutter below), so it never moves the fit.
    const ro = new ResizeObserver(([en]) => setWidth(Math.min(el.clientWidth, Math.floor(en.contentRect.width))));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Rows that change place, arrive or leave move instead of snapping (the track menu, 13 Nov; undo; Alma's
  // versions). Only when the list of track ids changes: a row that moved slides from where it was (FLIP), a new
  // row fades in, and a row that went is put back as an inert copy that folds away while the rows under it
  // close up. The copy has no data-track or data-clip, so the drag code and the selection box never see it.
  const rowsWere = useRef<{ key: string; tops: Map<string, number>; els: Map<string, HTMLElement>; order: string[] } | undefined>(undefined);
  const trackKey = tl.tracks.map((t) => t.id).join(',');
  useLayoutEffect(() => {
    const box = content.current;
    if (!box) return;
    const rowsNow = () => [...box.querySelectorAll<HTMLElement>(':scope > [data-track]')];
    const prev = rowsWere.current;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prev && prev.key !== trackKey && !still) {
      const now = new Map(rowsNow().map((el) => [el.dataset.track!, el]));
      const ghosts: HTMLElement[] = [];
      // the rows that went, put back where they were
      prev.order.forEach((id, i) => {
        const old = prev.els.get(id);
        if (now.has(id) || !old) return;
        const after = prev.order.slice(i + 1).map((x) => now.get(x)).find(Boolean);
        const before = prev.order.slice(0, i).reverse().map((x) => now.get(x)).find(Boolean);
        old.removeAttribute('data-track');
        old.querySelectorAll('[data-clip]').forEach((c) => c.removeAttribute('data-clip'));
        old.setAttribute('aria-hidden', 'true');
        old.inert = true;
        old.style.pointerEvents = 'none';
        old.style.overflow = 'hidden';
        if (after) box.insertBefore(old, after); else if (before) before.after(old); else return;
        ghosts.push(old);
        const h = old.getBoundingClientRect().height;
        const a = old.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        a.onfinish = () => old.remove();
        a.oncancel = () => old.remove();
      });
      // tops measured from the first row, so a band appearing above the rows since (the scenes) moves nothing
      const top0 = Math.min(...[...now.values(), ...ghosts].map((el) => el.offsetTop));
      for (const [id, el] of now) {
        const was = prev.tops.get(id);
        if (was === undefined) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); continue; }
        const d = was - (el.offsetTop - top0);
        if (d) el.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    const rows = rowsNow();
    const first = Math.min(...rows.map((el) => el.offsetTop));
    rowsWere.current = { key: trackKey, tops: new Map(rows.map((el) => [el.dataset.track!, el.offsetTop - first])), els: new Map(rows.map((el) => [el.dataset.track!, el])), order: rows.map((el) => el.dataset.track!) };
  }, [trackKey]);

  const selected = useMemo(() => {
    const s = new Set<string>();
    if (!sel) return s;
    s.add(sel.clipId);
    const p = partnerOf(tl, sel);
    if (p) s.add(p.clipId);
    for (const r of withPartners(tl, group ?? [])) s.add(r.clipId);
    return s;
  }, [tl, sel, group]);

  // Zooming (the user, 13 Nov: "zooming in takes a while for the view to readjust"). The zoom is applied once per
  // animation frame, rendered at once (flushSync) and the scroll set in the same frame, so the clips, the ruler
  // and the scroll move together; the clips' 200 ms slide (kept for edits) is switched off while it happens.
  // Wheel and pinch keep the frame under the pointer where it is; + and - keep the selection (else the playhead)
  // and ease over 120 ms; the film strip's scene eases over 220 ms. Limits: the whole film fits the lane, and
  // 24 px a frame.
  const unhold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tween = useRef(0);
  const clampZ = (v: number) => Math.max(live.current.fit, Math.min(MAX_Z, v));
  /** Set the zoom now, keeping frame `f` at `x` px from the scroller's left edge. */
  const applyZoom = (nz: number, f: number, x: number) => {
    const el = scroller.current;
    const v = clampZ(nz);
    if (!el) { setZoom(v); return; }
    el.dataset.zooming = '';
    clearTimeout(unhold.current);
    unhold.current = setTimeout(() => { delete el.dataset.zooming; }, 160);
    // at the fit the zoom follows the window's width again
    flushSync(() => setZoom(v <= live.current.fit * 1.0001 ? undefined : v));
    live.current.z = v;
    el.scrollLeft = Math.max(0, HEAD + f * v - x);
  };
  /** Ease to `to` over `ms`, frame `f` going from `x0` to `x1` on screen. */
  const animate = (to: number, f: number, x0: number, x1: number, ms: number) => {
    cancelAnimationFrame(tween.current);
    const from = live.current.z, end = clampZ(to), t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
      applyZoom(from * (end / from) ** e, f, x0 + (x1 - x0) * e);       // even steps in scale, not in pixels
      if (k < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { cancelAnimationFrame(tween.current); clearTimeout(unhold.current); }, []);

  /** + and -: keep the selection's middle (else the playhead) where it is on screen; centred when off screen. */
  const zoomBy = (factor: number) => {
    const el = scroller.current;
    const { z: cz, frame: pf, sel: s, tl: t } = live.current;
    if (!el) { setZoom(clampZ(cz * factor)); return; }
    let f = pf;
    if (s) {
      const c = t.tracks.find((x) => x.id === s.trackId)?.clips.find((x) => x.id === s.clipId);
      if (c) f = (startF(c, fps) + endF(c, fps)) / 2;
    }
    let x = HEAD + f * cz - el.scrollLeft;
    if (x < HEAD || x > el.clientWidth) x = HEAD + (el.clientWidth - HEAD) / 2;
    animate(cz * factor, f, x, x, 120);
  };

  // the page's zoom buttons and keys
  const lastCmd = useRef(0);
  useEffect(() => {
    if (!zoomCmd || zoomCmd.n === lastCmd.current) return;
    lastCmd.current = zoomCmd.n;
    const el = scroller.current;
    if (zoomCmd.dir !== 0) zoomBy(zoomCmd.dir > 0 ? 1.5 : 1 / 1.5);
    else if (el) animate(live.current.fit, 0, HEAD - el.scrollLeft, HEAD, 160);    // fit: the film's start eases to the left edge
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per command; zoomBy reads the current zoom
  }, [zoomCmd]);

  // the film strip opens a scene: its frames fill the lane
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current) return;
    lastFocus.current = focus.n;
    const el = scroller.current;
    const span = Math.max(fps, focus.to - focus.from);
    const nz = ((el?.clientWidth ?? width) - HEAD - 40) / span;
    if (!el) { setZoom(clampZ(nz)); return; }
    animate(nz, focus.from, HEAD + focus.from * live.current.z - el.scrollLeft, HEAD + 16, 220);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per command
  }, [focus]);

  // The wheel, registered once and non-passive so it can stop the browser's own handling. A pinch (a wheel with
  // Control), Command-scroll and Option-scroll (DaVinci's) zoom at the pointer; the plain wheel scrolls, except a
  // sideways one past either end, which would be the browser's back or forward (swipe.ts).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let acc = 1, px = 0, raf = 0;
    let hold: { f: number; px: number; t: number } | undefined;      // the frame a running gesture zooms around
    const flush = () => {
      raf = 0;
      const cz = live.current.z;
      const x = Math.max(HEAD, px - el.getBoundingClientRect().left - el.clientLeft);      // inside the border
      // the same frame stays under a still pointer for the whole gesture, so nothing creeps from rounding
      const now = performance.now();
      const f = hold && hold.px === px && now - hold.t < 250 ? hold.f : Math.max(0, (el.scrollLeft + x - HEAD) / cz);
      hold = { f, px, t: now };
      applyZoom(cz * acc, f, x);
      acc = 1;
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        cancelAnimationFrame(tween.current);
        let d = e.deltaY || e.deltaX;
        if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= el.clientHeight;
        // a pinch sends small steps (Chrome's own page zoom reads them as exp(-d/100)); a scroll sends bigger ones.
        // One event never zooms more than a + key (1.5x), so a mouse wheel's notch stays a step.
        const k = e.ctrlKey && !e.metaKey ? 0.01 : 0.004, cap = Math.log(1.5) / k;
        acc *= Math.exp(-Math.max(-cap, Math.min(cap, d)) * k);
        px = e.clientX;
        if (!raf) raf = requestAnimationFrame(flush);
        return;
      }
      if (wheelPastEdge(e, el)) e.preventDefault();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('wheel', wheel); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registered once; it reads the zoom from `live`
  }, []);

  // keep the playhead in view while it moves (a zoom alone leaves the view where the zoom put it)
  const lastFrame = useRef(frame);
  useEffect(() => {
    const el = scroller.current;
    if (frame === lastFrame.current) return;
    lastFrame.current = frame;
    if (!el || dragRef.current) return;
    const x = HEAD + frame * z;
    if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - HEAD - 40;
    else if (x < el.scrollLeft + HEAD) el.scrollLeft = Math.max(0, x - HEAD - 40);
  }, [frame, z]);

  /** The frame (fractional) under a point of the window: inside the scroller's border (F5: it used to be measured
   *  from the border box, one pixel right of the pointer, six frames at the opening zoom), at the zoom of now, so a
   *  drag held through a zoom keeps reading the frame under the pointer (F12). */
  const fAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return (clientX - r.left - el.clientLeft + el.scrollLeft - HEAD) / live.current.z;
  };
  const frameAtClient = (clientX: number) => Math.max(0, Math.round(fAt(clientX)));
  /** How far a snap may pull, in frames: 8 px, and never more than a quarter of a second of film (fully out 8 px is
   *  two seconds; the owner's blade cut aimed 2 s from the playhead landed on it). */
  const snapTol = () => Math.min(SNAP_PX / live.current.z, fps / 4);

  /** A point of the window in the timeline's content coordinates (what scrolling moves). */
  const toContent = (clientX: number, clientY: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left - el.clientLeft + el.scrollLeft, y: clientY - r.top - el.clientTop + el.scrollTop };
  };

  // ---- a file dragged in from the file list (14 Nov): the lane of its kind under the pointer lights, a line shows
  // where it would start (snapped to the cuts and the playhead, by its start or its end), and a drop places it there
  const [dropAt, setDropAt] = useState<{ trackId: string; f: number; top: number; h: number }>();
  const fileOver = (e: React.DragEvent) => {
    if (!fileDrag || !onDropFile) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-track]');
    const t = row ? tl.tracks.find((x) => x.id === row.dataset.track) : undefined;
    // an .srt with no subtitles track yet: any lane takes it, and the page makes the track
    const anyLane = fileDrag.kind === 'captions' && !tl.tracks.some((x) => x.kind === 'captions');
    if (!row || !t || readOnly || t.locked || (t.kind !== fileDrag.kind && !anyLane)) { if (dropAt) setDropAt(undefined); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    let f = frameAtClient(e.clientX);
    if (snap) { const sd = snapDelta([f, f + fileDrag.frames], [...cutPoints(tl, new Set()), frame], snapTol()); if (sd !== undefined) f = Math.max(0, f + sd); }
    if (!dropAt || dropAt.trackId !== t.id || dropAt.f !== f || dropAt.top !== row.offsetTop) setDropAt({ trackId: t.id, f, top: row.offsetTop, h: row.offsetHeight });
  };
  // a drag leaving one element for another inside the timeline is not leaving it (Chrome gives no relatedTarget here)
  const fileLeave = (e: React.DragEvent) => {
    const r = scroller.current?.getBoundingClientRect();
    if (dropAt && (!r || e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom)) setDropAt(undefined);
  };
  const fileDrop = (e: React.DragEvent) => {
    if (!fileDrag || !dropAt) return;
    e.preventDefault();
    onDropFile?.(dropAt.trackId, dropAt.f);
    setDropAt(undefined);
  };
  const dropShown = fileDrag && dropAt ? dropAt : undefined;

  const begin = (d: Drag, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = d;
    setDrag(d);
    // the drag is anchored at the frame it was pressed on, and every move reads the frame under the pointer now, at
    // the scroll and the zoom of now: the thing in hand stays under the pointer while the timeline scrolls at its edge
    // (the user, 13 Nov) and through a zoom made with the button held (F12)
    const f0 = fAt(e.clientX);
    let last: Pt = ptOf(e);
    let moves = 0;
    let raf = 0;
    const move = (pe: Pt) => {
      const cur = dragRef.current;
      if (!cur) return;
      last = ptOf(pe);
      moves++;
      const el = scroller.current;
      const df = fAt(last.clientX) - f0;                   // frames moved, fractional
      const dpx = df * live.current.z;                     // …and as pixels at the zoom of now, for the thresholds
      const ev = last;
      if (cur.kind === 'scrub') {
        // held past an edge the playhead stays at the edge of what is shown while the timeline scrolls on
        const r = el?.getBoundingClientRect(), ox = r && el ? r.left + el.clientLeft : 0;
        setFrame(Math.min(total, frameAtClient(el ? Math.max(ox + HEAD, Math.min(ox + el.clientWidth - 1, last.clientX)) : last.clientX)));
        return;
      }
      if (cur.kind === 'box') {
        // a box dragged over the timeline: every clip it touches is selected, as in DaVinci. Worked out in content
        // coordinates, so clips scrolled out of view stay in it; its moving corner stops at the visible edge.
        if (!el) return;
        const r = el.getBoundingClientRect(), ox = r.left + el.clientLeft, oy = r.top + el.clientTop, sx = el.scrollLeft, sy = el.scrollTop;
        const x1 = Math.max(sx + HEAD, Math.min(sx + el.clientWidth, last.clientX - ox + sx));
        const y1 = Math.max(sy + RULER, Math.min(sy + el.clientHeight, last.clientY - oy + sy));
        const moved = cur.moved || Math.abs(x1 - cur.x0) > 4 || Math.abs(y1 - cur.y0) > 4;
        const l = Math.min(cur.x0, x1), rr = Math.max(cur.x0, x1), t = Math.min(cur.y0, y1), b = Math.max(cur.y0, y1);
        const hit = moved ? [...el.querySelectorAll<HTMLElement>('[data-clip]')].filter((c) => {
          const q = c.getBoundingClientRect();
          const ql = q.left - ox + sx, qt = q.top - oy + sy;
          return ql < rr && ql + q.width > l && qt < b && qt + q.height > t;
        }).map((c) => c.dataset.clip!) : [];
        const nd = { ...cur, x1, y1, moved, hit, mode: boxMode(last) };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      if (cur.kind === 'gain') {
        const db = Math.max(DB_BOTTOM, Math.min(DB_TOP, yToDb(dbToY(cur.db0, cur.h) + ev.clientY - cur.y0, cur.h)));
        const nd = { ...cur, db, moved: cur.moved || db !== cur.db0 };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      if (cur.kind === 'roll') {
        const dx = dpx;
        const moved = cur.moved || Math.abs(dx) > 2;
        let v = Math.round(df);
        if (snap && moved) {
          const sd = snapDelta([cur.j + v], [...cutPoints(tl, new Set([...cur.lefts, ...cur.rights])), frame], snapTol());
          if (sd !== undefined) v += sd;
        }
        let r = moved ? clampRoll(tl, cur.left, cur.right, v, framesBy) : { d: 0, why: undefined };
        // held at 0 (a frame not reached yet, or snapped back to the playhead on the join) in a direction where the
        // join cannot move at all: the tag says why from the first pixels on
        if (moved && !r.d && !r.why && Math.round(dx)) { const k = clampRoll(tl, cur.left, cur.right, Math.sign(dx), framesBy); if (!k.d && k.why) r = { d: 0, why: k.why }; }
        if (r.d !== cur.d || r.why !== cur.why || moved !== cur.moved) {
          const nd = { ...cur, d: r.d, why: r.why, moved };
          dragRef.current = nd; setDrag(nd);
          if (moved) peekLater(cur.right, r.d);
        }
        return;
      }
      if (cur.kind === 'dissolve') {
        const f = Math.max(1, Math.min(cur.max, cur.f0 + 2 * cur.side * Math.round(df)));
        const nd = { ...cur, f, moved: cur.moved || Math.abs(dpx) > 2 };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      if (cur.kind === 'point') {
        const dy = ev.clientY - cur.y0;
        const moved = cur.moved || Math.abs(dpx) > 2 || Math.abs(dy) > 2;
        const t = Math.max(cur.lo, Math.min(cur.hi, cur.t0 + (df / fps) * cur.sp));
        const db = Math.max(-96, Math.min(24, yToDb(dbToY(cur.gain + cur.db0, cur.h) + dy, cur.h) - cur.gain));
        const nd = { ...cur, t: moved ? t : cur.t0, db: moved ? db : cur.db0, moved };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      if (cur.kind === 'fadeIn' || cur.kind === 'fadeOut') {
        const f = Math.max(0, Math.min(cur.max, Math.round(cur.f0 + (cur.kind === 'fadeIn' ? df : -df))));
        const nd = { ...cur, f, moved: cur.moved || Math.abs(dpx) > 2 };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      const raw = Math.round(df);
      const up = cur.kind === 'move' && cur.y0 !== undefined ? ev.clientY - cur.y0 : 0;
      const moved = cur.moved || Math.abs(dpx) > 5 || Math.abs(up) > 8;
      let d = moved ? adjust(cur, raw) : 0;
      if (cur.kind === 'move') {
        // dragged onto another track of its kind (the user, 13 Nov): the clip follows the pointer to that row.
        // Its time is kept unless it is clearly dragged sideways too (or Shift is held), so a line of dialogue
        // moved to another track stays in sync.
        let to: string | undefined, dy = 0;
        const rows = moved && Math.abs(up) > 8 ? [...(scroller.current?.querySelectorAll<HTMLElement>('[data-track]') ?? [])] : [];
        const own = rows.find((r) => r.dataset.track === cur.ref.trackId);
        const hit = rows.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; });
        if (cur.group) {
          // several selected: all of them go
          // as many tracks of their kind down or up as the one in hand, at their times, or none does and the row says why
          const kindOf = (id?: string) => tl.tracks.find((x) => x.id === id)?.kind;
          if (own && hit?.dataset.track && hit.dataset.track !== cur.ref.trackId && kindOf(hit.dataset.track) === kindOf(cur.ref.trackId)) {
            const plan = planTrackMove(tl, group ?? [], cur.ref, hit.dataset.track, ev.shiftKey || Math.abs(dpx) < 14 ? 0 : d);
            const top = (id: string) => rows.find((r) => r.dataset.track === id)?.getBoundingClientRect().top ?? 0;
            const tos = plan.why ? undefined : Object.fromEntries(plan.moves.map((m) => [m.ref.clipId, top(m.to) - top(m.ref.trackId)]));
            const nd = { ...cur, d: plan.why ? 0 : plan.d, moved, to: hit.dataset.track, dy: 0, tos, toRows: [...new Set(plan.moves.map((m) => m.to))], along: new Set(plan.mates.map((m) => m.clipId)), why: plan.why };
            dragRef.current = nd; setDrag(nd);
            return;
          }
          // along its own tracks: as far as the group can go (it stops at the film's start and at a clip not in it)
          const nd = { ...cur, d: moved ? groupDelta(tl, group ?? [], d) : 0, moved, to: undefined, dy: 0, tos: undefined, toRows: undefined, along: undefined, why: undefined };
          dragRef.current = nd; setDrag(nd);
          return;
        }
        if (own && hit?.dataset.track && hit.dataset.track !== cur.ref.trackId) {
          const dd = ev.shiftKey || Math.abs(dpx) < 14 ? 0 : d;
          if (canMoveToTrack(tl, cur.ref, hit.dataset.track, dd)) { to = hit.dataset.track; dy = hit.getBoundingClientRect().top - own.getBoundingClientRect().top; d = dd; }
        }
        const nd = { ...cur, d, moved, to, dy };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      if (cur.alone) {
        // at a limit, why; stuck at 0 in a direction it cannot go at all, why too
        const c = clipOf(cur.ref);
        const sign = Math.sign(df);
        const why = !moved ? undefined : aloneLimit(cur, raw).why ?? (!d && sign && c ? clampAlone(tl, cur.ref, cur.kind, sign, lim(c)).why : undefined);
        const nd = { ...cur, d, moved, why };
        dragRef.current = nd; setDrag(nd);
        return;
      }
      // held where it cannot grow on (its shot's first or last frame, its file's, or with ripple off the clip next to it,
      // trimStop.ts): the edge stops there and its tag says why; let go there, the line says more
      const c = clipOf(cur.ref);
      const grow = cur.kind === 'head' ? raw < 0 : raw > 0;
      const lw = moved && grow && c ? trimStop(tl, cur.ref, cur.kind, d === 0 ? Math.sign(raw) : raw, ripple, lim(c), nameOf) : undefined;
      const stops = !!lw?.why && lw.d === d;
      const nd = { ...cur, d, moved, why: stops ? lw!.why : undefined, say: stops ? lw!.say : undefined };
      dragRef.current = nd; setDrag(nd);
    };
    // the edge scrolling: each frame while the pointer is held near an edge or past it, moving or not
    const tick = () => {
      const cur = dragRef.current, el = scroller.current;
      if (!cur || !el) return;
      const live = cur.kind === 'scrub' ? moves > 0 : cur.kind !== 'gain' && cur.moved;      // never on a plain click
      if (live) {
        const r = el.getBoundingClientRect(), ox = r.left + el.clientLeft, oy = r.top + el.clientTop;
        const vx = edgeV(last.clientX, ox + HEAD, ox + el.clientWidth);                        // the names column covers the left
        const vy = cur.kind === 'box' ? edgeV(last.clientY, oy + RULER, oy + el.clientHeight) : 0;
        const bx = el.scrollLeft, by = el.scrollTop;
        if (vx) el.scrollLeft = bx + vx;
        if (vy) el.scrollTop = by + vy;
        if (el.scrollLeft !== bx || el.scrollTop !== by) move(last);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // a modifier pressed or let go mid-box: the box follows the keys held now
    const keys = (ke: KeyboardEvent) => {
      if (dragRef.current?.kind !== 'box') return;
      move({ ...last, metaKey: ke.metaKey, ctrlKey: ke.ctrlKey, shiftKey: ke.shiftKey, altKey: ke.altKey });
    };
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', keys);
      const cur = dragRef.current;
      dragRef.current = undefined;
      setDrag(undefined);
      if (cur?.kind === 'roll') {
        clearTimeout(peekT.current);
        onPeek?.(undefined);
        // a click on the join without a drag puts the playhead on it
        if (!cur.moved) setFrame(cur.j);
        else if (cur.d) onEdit(rollEdit(tl, cur.left, cur.right, cur.d, framesBy));
        return;
      }
      // a plain click on a clip (no drag): the playhead goes to where the click was
      if (cur && cur.kind === 'move' && !cur.moved) setFrame(frameAtClient(cur.x0));
      if (cur?.kind === 'box') {
        if (cur.moved) onBox?.(cur.hit.map((k) => { const i = k.indexOf(':'); return { trackId: k.slice(0, i), clipId: k.slice(i + 1) }; }), cur.mode);
        else { if (cur.mode === 'replace') onSelect(undefined); setFrame(Math.max(0, Math.round((cur.x0 - HEAD) / live.current.z))); }      // a plain click: the playhead goes there
        return;
      }
      if (cur?.kind === 'move' && cur.group) {
        // a click on one of several selected clips, without a drag, leaves that one selected
        if (!cur.moved) { const c = clipOf(cur.ref), t = tl.tracks.find((x) => x.id === cur.ref.trackId); onSelect(cur.ref, c, t); }
        else if (cur.to) {
          // onto other tracks, all at once or none (a refusal says why); one edit, so one undo; the clips stay selected
          const e = moveClipsToTracks(tl, group ?? [], cur.ref, cur.to, cur.d);
          onEdit(e);
          if (e) {
            const at = (r: ClipRef) => { const t = e.tl.tracks.find((x) => x.clips.some((k) => k.id === r.clipId)); return t ? { trackId: t.id, clipId: r.clipId } : undefined; };
            const refs = [cur.ref, ...(group ?? [])].map(at).filter((r): r is ClipRef => !!r);
            onBox?.(refs, 'replace');
          }
        }
        else if (cur.d) onEdit(moveClips(tl, group ?? [], cur.d));
        return;
      }
      if (!cur || cur.kind === 'scrub' || !cur.moved) return;
      if (cur.kind === 'fadeIn' || cur.kind === 'fadeOut') {
        // on this clip alone: a picture's fade fades the picture, a sound's the sound (13 Nov)
        if (cur.f !== cur.f0) onEdit(setFade(tl, cur.ref, cur.kind, Math.round((cur.f / fps) * 1e6) / 1e6, nameOf));
        return;
      }
      if (cur.kind === 'dissolve') {
        if (cur.f !== cur.f0) onEdit(setDissolve(tl, cur.ref, cur.f, nameOf));
        return;
      }
      if (cur.kind === 'point') {
        if (cur.t !== cur.t0 || cur.db !== cur.db0) onEdit(moveGainPoint(tl, cur.ref, cur.i, cur.t, cur.db, nameOf));
        return;
      }
      if (cur.kind === 'gain') {
        const c = clipOf(cur.ref);
        if (c && cur.db !== (c.gain ?? 0)) onEdit(patchClip(tl, cur.ref, { gain: cur.db }, `${cur.ref.trackId} ${clipName(c)} gain ${fmtDb(c.gain ?? 0)} → ${fmtDb(cur.db)}`));
        return;
      }
      if (cur.kind === 'move' && cur.to) {
        const e = moveToTrack(tl, cur.ref, cur.to, cur.d);
        const c = clipOf(cur.ref), t = tl.tracks.find((x) => x.id === cur.to);
        onEdit(e);
        if (e && c && t) onSelect({ trackId: t.id, clipId: c.id }, c, t);
        return;
      }
      // a trim that could not grow at all because the clip next to it is in the way: never nothing in silence
      if (!cur.d && (cur.kind === 'head' || cur.kind === 'tail') && cur.say) { onEdit(refuse(cur.say)); return; }
      if (!cur.d) return;
      if (cur.kind === 'move') onEdit(moveClip(tl, cur.ref, cur.d, !!cur.shuffle));
      else if (cur.alone) {
        // one edge alone: a sound grown over its neighbour lands on the track beside, and stays selected there
        const c = clipOf(cur.ref);
        const e = trimAlone(tl, cur.ref, cur.kind, cur.d, c ? lim(c) : undefined, nameOf);
        onEdit(e);
        const t = e?.tl.tracks.find((x) => x.clips.some((k) => k.id === cur.ref.clipId));
        const k = t?.clips.find((x) => x.id === cur.ref.clipId);
        if (t && k && t.id !== cur.ref.trackId) onSelect({ trackId: t.id, clipId: k.id }, k, t);
      } else { const c = clipOf(cur.ref); onEdit(trimClip(tl, cur.ref, cur.kind, cur.d, ripple, c ? lim(c) : undefined)); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', keys);
  };

  const clipOf = (r: ClipRef) => tl.tracks.find((t) => t.id === r.trackId)?.clips.find((c) => c.id === r.clipId);
  /** What a clip may use of its file: its shot's own frames when the page knows its take's shots, else its file's ends. */
  const lim = (c: TimelineClip): ClipFrames => (framesOf ? framesOf(c) : srcSeconds((c.src ?? '')));
  const framesBy = (src: string, c?: TimelineClip): ClipFrames => (c ? lim(c) : srcSeconds(src));

  // the player shows the frame after a picture join while it moves: asked once the join rests 120 ms
  const peekT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peekLater = (right: ClipRef, d: number) => {
    if (!onPeek || tl.tracks.find((t) => t.id === right.trackId)?.kind !== 'video') return;
    const c = clipOf(right);
    if (!c) return;
    clearTimeout(peekT.current);
    peekT.current = setTimeout(() => {
      if (dragRef.current?.kind === 'roll') onPeek({ src: c.src ?? '', t: Math.max(0, Math.round((c.in + (d * speedOf(c)) / fps + 0.5 / fps) * 1000) / 1000) });
    }, 120);
  };
  useEffect(() => () => clearTimeout(peekT.current), []);

  /** A press on the join between `a` and `b`: the join moves with the pointer, and the linked picture or
   *  sound's join with it when both clips have one and those touch too. */
  const joinDown = (e: React.PointerEvent, t: TimelineTrack, a: TimelineClip, b: TimelineClip) => {
    if (e.button !== 0 || readOnly || t.locked) return;
    const left = { trackId: t.id, clipId: a.id }, right = { trackId: t.id, clipId: b.id };
    const pairs = rollPairs(tl, left, right);
    begin({ kind: 'roll', left, right, lefts: new Set(pairs.map((p) => p[0].clipId)), rights: new Set(pairs.map((p) => p[1].clipId)), j: startF(b, fps), x0: e.clientX, d: 0, moved: false }, e);
  };

  /** The clip and track a level line or point belongs to, from its data attribute (the handlers take no closure: the
   *  React compiler refuses a drag begun from a callback nested in the clip list's own callbacks). */
  const levelOf = (el: Element, attr: string) => {
    const v = el.getAttribute(attr) ?? '';
    const k = v.indexOf(':');
    const t = tl.tracks.find((x) => x.id === v.slice(0, k));
    const c = t?.clips.find((x) => x.id === v.slice(k + 1));
    return t && c && !readOnly && !t.locked ? { t, c, H: rowH(t, tl) - 7, gain: c.gain ?? 0 } : undefined;
  };
  /** The level line pressed: Option-click adds a point there at the level under the pointer (13 Nov); otherwise
   *  the drag moves the clip's whole level, as before. */
  const levelDown = (e: React.PointerEvent<SVGPathElement>) => {
    const f = e.button === 0 ? levelOf(e.currentTarget, 'data-level-line') : undefined;
    if (!f) return;
    const { t, c, H, gain } = f;
    const cref = { trackId: t.id, clipId: c.id };
    onSelect(cref, c, t);
    if (e.altKey) {
      e.preventDefault(); e.stopPropagation();
      const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
      if (!box) return;
      const st = c.in + ((e.clientX - box.left) / z / fps) * speedOf(c);
      const a = addGainPoint(tl, cref, st, yToDb(e.clientY - box.top, H) - gain, nameOf);
      if (a) { onEdit(a); onPoint?.({ ...cref, i: a.index }); }
      return;
    }
    onPoint?.(undefined);
    begin({ kind: 'gain', ref: cref, y0: e.clientY, h: H, db0: gain, db: gain, moved: false }, e);
  };
  /** A level point pressed: it is the one Delete removes, and it drags in level and time. */
  const pointDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const f = e.button === 0 ? levelOf(e.currentTarget, 'data-level-of') : undefined;
    const i = Number(e.currentTarget.dataset.point);
    const p = f?.c.gainPoints?.[i];
    if (!f || !p) return;
    const { t, c, H, gain } = f;
    const cref = { trackId: t.id, clipId: c.id };
    onSelect(cref, c, t);
    onPoint?.({ ...cref, i });
    const { lo, hi } = pointRange(c, i);
    begin({ kind: 'point', ref: cref, i, x0: e.clientX, y0: e.clientY, t0: p.t, db0: p.db, t: p.t, db: p.db, h: H, gain, lo, hi, sp: speedOf(c), moved: false }, e);
  };
  /** A dissolve's edge pressed: the dissolve grows or shrinks on both sides of its join. */
  const edgeDown = (e: React.PointerEvent, t: TimelineTrack, dref: ClipRef, D: number, side: -1 | 1) => {
    if (e.button !== 0 || readOnly || t.locked) return;
    begin({ kind: 'dissolve', ref: dref, x0: e.clientX, f0: D, f: D, max: Math.max(1, maxDissolveF(tl, dref)), side, moved: false }, e);
  };

  /** Snap to the cuts and the playhead (when on), and keep a trim inside what the clip can take. */
  const adjust = (d: Extract<Drag, { ids: Set<string> }>, raw: number): number => {
    const c = clipOf(d.ref);
    if (!c) return 0;
    if (d.kind !== 'move' && d.alone) return aloneLimit(d, raw).d;
    const s = startF(c, fps), e = endF(c, fps);
    let v = raw;
    if (snap) {
      const pts = [...cutPoints(tl, d.ids), frame, ...(d.kind === 'move' ? [] : shotStop(c, d.kind))];
      const edges = d.kind === 'move' ? [s + raw, e + raw] : d.kind === 'head' ? [s + raw] : [e + raw];
      const sd = snapDelta(edges, pts, snapTol());
      if (sd !== undefined) v = raw + sd;
    }
    if (d.kind === 'move') return Math.max(-s, v);
    return clampTrim(tl, d.ref, d.kind, v, ripple, lim(c));
  };
  /** Where the edge would meet its shot's first (head) or last (tail) frame, on the timeline: a snap for a trim, so a
   *  clip that already runs past its shot's frames (an older trim) is brought back to exactly the stop. */
  const shotStop = (c: TimelineClip, edge: 'head' | 'tail'): number[] => {
    const sh = shotFrames(lim(c));
    if (!sh) return [];
    const sp = speedOf(c);
    return [edge === 'head' ? startF(c, fps) + Math.round((toF(sh.from, fps) - toF(c.in, fps)) / sp) : endF(c, fps) + Math.round((toF(sh.to, fps) - toF(c.out, fps)) / sp)];
  };
  const t0 = (r: ClipRef) => tl.tracks.find((t) => t.id === r.trackId);
  /** An edge trimmed alone: snapped as any trim (its own picture's or sound's edge among the cuts), then kept
   *  inside its file; a sound is not stopped by its neighbour. */
  const aloneLimit = (d: Extract<Drag, { kind: 'head' | 'tail' }>, raw: number): { d: number; why?: string } => {
    const c = clipOf(d.ref);
    if (!c) return { d: 0 };
    let v = raw;
    if (snap) {
      const sd = snapDelta([(d.kind === 'head' ? startF(c, fps) : endF(c, fps)) + raw], [...cutPoints(tl, d.ids), frame, ...(t0(d.ref)?.kind === 'video' ? shotStop(c, d.kind) : [])], snapTol());
      if (sd !== undefined) v = raw + sd;
    }
    return clampAlone(tl, d.ref, d.kind, v, lim(c));
  };

  /** A clip too narrow to hit (under 14 px) that the pointer is on or within 6 px of, on this track (13 Nov: drawn
   *  at their true width, a 9-frame sound was 2 px wide and could not be selected, so not deleted either). */
  const nearClip = (t: TimelineTrack, clientX: number, under = 14, reach = 6): TimelineClip | undefined => {
    const el = scroller.current;
    if (!el) return undefined;
    const x = clientX - el.getBoundingClientRect().left - el.clientLeft + el.scrollLeft - HEAD;
    let best: TimelineClip | undefined, bestD = reach + 0.01;
    for (const c of t.clips) {
      const a = startF(c, fps) * z, w = Math.max(MIN_CLIP, lenF(c, fps) * z);
      if (w >= under) continue;
      const d = x < a ? a - x : x > a + w ? x - (a + w) : 0;
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  };
  const clipDown = (e: React.PointerEvent, t: TimelineTrack, c0: TimelineClip, part0: 'body' | 'head' | 'tail') => {
    if (e.button !== 0) return;
    if (point) onPoint?.(undefined);
    // on a packed track a sliver of a clip (under 6 px) sits between two others, and the press lands on one of them:
    // within 3 px of the sliver, the sliver is what was meant, also on a neighbour's trim handle (F10)
    const sliver = nearClip(t, e.clientX, 6, 3);
    // the clip under the pointer is the one in the cut there, not one still drawn there while it slides to its new
    // place (F11: for 200 ms after ⌘B the left piece still covered the new right piece); a nudge shown but not saved
    // draws clips away from their place on purpose, and a sliver is drawn wider than it is
    const fx = fAt(e.clientX);
    const inC0 = startF(c0, fps) - 1 / z <= fx && fx <= endF(c0, fps) + 1 / z;
    const under = !sliver && !nudge && !inC0 ? t.clips.find((k) => startF(k, fps) <= fx && fx < endF(k, fps)) : undefined;
    const c = sliver ?? under ?? c0;
    const part = c.id === c0.id ? part0 : 'body';
    const ref = { trackId: t.id, clipId: c.id };
    // Command-click adds or removes a clip, Shift-click selects up to it (DaVinci's)
    // Command-Shift-drag shuffles a shot past its neighbours (DaVinci's swap); the click itself selects as usual
    const shuffle = (e.metaKey || e.ctrlKey) && e.shiftKey && part === 'body';
    // Option-Command-click takes a clip out of the selection and never adds one
    if (e.metaKey && e.altKey && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); onSelect(ref, c, t, 'remove'); return; }
    if (!shuffle && (e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); e.stopPropagation(); onSelect(ref, c, t, e.shiftKey ? 'range' : 'toggle'); return; }
    const many = !shuffle && !!group && group.length > 1 && selected.has(c.id);
    if (!many) onSelect(ref, c, t);
    if (readOnly || t.locked) { e.stopPropagation(); return; }
    if (many && tool !== 'blade') {
      if (part !== 'body') onSelect(ref, c, t);        // an edge trims that clip alone
      else { begin({ kind: 'move', ref, ids: selected, x0: e.clientX, y0: e.clientY, d: 0, moved: false, group: true }, e); return; }
    }
    if (tool === 'blade' && part === 'body') {
      e.stopPropagation();
      let f = frameAtClient(e.clientX);
      if (snap && Math.abs(f - frame) <= snapTol()) f = frame;
      onEdit(splitClip(tl, ref, f));
      return;
    }
    const p = partnerOf(tl, ref);
    // Option on a trim handle (DaVinci's): that edge alone, its linked picture or sound left where it is
    const alone = part !== 'body' && e.altKey && !e.metaKey && !e.ctrlKey;
    const ids = new Set([c.id, ...(p && !alone ? [p.clipId] : [])]);
    if (part === 'body') begin({ kind: 'move', ref, ids, x0: e.clientX, y0: e.clientY, d: 0, moved: false, shuffle }, e);
    else begin({ kind: part, ref, ids, x0: e.clientX, d: 0, moved: false, alone }, e);
  };

  // a box that takes out: the clips it touches (and their linked picture or sound) are shown unselected already
  const boxOut = drag?.kind === 'box' && drag.mode === 'remove' && drag.moved
    ? new Set(drag.hit.flatMap((k) => { const i = k.indexOf(':'); const r = { trackId: k.slice(0, i), clipId: k.slice(i + 1) }; const p = partnerOf(tl, r); return p ? [r.clipId, p.clipId] : [r.clipId]; }))
    : undefined;
  const step = rulerStep(z, fps);
  const ticks: number[] = [];
  // fully out the whole film fits the lane with nothing to scroll sideways (F8): 24 px of lane after the film's end,
  // the room the fit leaves, and no tick past the lane
  const laneW = Math.max(total * z + 24, width - HEAD);
  for (let f = 0; f * z <= laneW; f += step) ticks.push(f);
  const playX = frame * z;
  const cursor = tool === 'blade' ? 'cursor-crosshair' : 'cursor-grab';

  const offsetOf = (c: TimelineClip): { dx: number; dw: number } => {
    if (!drag && nudge && nudge.ids.has(c.id)) return { dx: nudge.d * z, dw: 0 };
    // a join moved: the clip before it ends later, the one after it starts later, both edges together
    if (drag?.kind === 'roll') return drag.lefts.has(c.id) ? { dx: 0, dw: drag.d * z } : drag.rights.has(c.id) ? { dx: drag.d * z, dw: -drag.d * z } : { dx: 0, dw: 0 };
    if (!isMove(drag) || !drag.ids.has(c.id)) return { dx: 0, dw: 0 };
    // several going to other tracks: the selected ones and the link mates going along in time; refused, none
    if (drag.kind === 'move' && drag.group && drag.to) return drag.tos?.[c.id] !== undefined || drag.along?.has(c.id) ? { dx: drag.d * z, dw: 0 } : { dx: 0, dw: 0 };
    // going to another track: only the clip in hand moves, its picture or sound stays
    if (drag.kind === 'move' && drag.to && c.id !== drag.ref.clipId) return { dx: 0, dw: 0 };
    if (drag.kind === 'move') return { dx: drag.d * z, dw: 0 };
    // dragging the left edge moves the left edge, gaps closing or not (the user, 13 Nov: "it should shrink the left
    // side of the video, not the right side"); with gaps closing the clip then slides back to its place on release
    if (drag.kind === 'head') return { dx: drag.d * z, dw: -drag.d * z };
    return { dx: 0, dw: drag.d * z };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {toolbar}
      {notice}
      <div ref={scroller} className="scroll relative min-h-0 flex-1 overflow-auto overscroll-x-contain [scrollbar-gutter:stable] rounded-[9px] border border-line bg-hdr" aria-label="Timeline"
        onDragOver={fileOver} onDragLeave={fileLeave} onDrop={fileDrop}>
        <div ref={content} className="relative" style={{ width: HEAD + laneW }}>
          {/* ruler */}
          <div className="sticky top-0 z-[8] flex h-8 border-b border-line bg-hdr">
            <div className="sticky left-0 z-[7] flex w-[150px] flex-none items-center border-r border-line bg-hdr px-2.5 font-mono text-[10.5px] text-mute">{fps} fps · {step >= fps ? `every ${step / fps} s` : `every ${step} f`}</div>
            <div className="relative flex-1 cursor-text overflow-hidden" onPointerDown={(e) => { if (e.button === 0) { onMarkerSelect?.(undefined); setFrame(frameAtClient(e.clientX)); begin({ kind: 'scrub' }, e); } }}
              onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY, frame: frameAtClient(e.clientX) }); } }}>
              {ticks.map((f) => (
                <span key={f} className="absolute top-0 h-full border-l border-edge pl-1 pt-1 font-mono text-[10.5px] text-mute" style={{ left: f * z }}>{Math.abs(f * z + 30 - Math.max(playX, 38)) < 70 ? '' : smpte(f / fps, fps)}</span>
              ))}
              {(() => {
                const seen = new Map<string, number>();
                return flagPlaces(tl, z).map((p) => {
                  const m = tl.markers[p.i];
                  const id = `${m.at}|${m.text}`;
                  const k = (seen.get(id) ?? 0) + 1;
                  seen.set(id, k);
                  const dragging = !!flagDrag?.moved && flagDrag.i === p.i;
                  const x = dragging ? flagDrag.f * z : p.x;
                  const on = markerSel === p.i;
                  const at = smpte(dragging ? flagDrag.f / fps : m.at, fps);
                  const name = markerName(m);
                  return (
                    <span key={`${id}|${k}`}>
                      <button type="button" data-flag={p.i} aria-pressed={on}
                        title={`${name} · ${at}${m.by === 'alma' ? ' · Alma' : ''}\nClick: go there · drag: move · double-click: name it · right-click: more`}
                        aria-label={`Bookmark at ${at}: ${name}`}
                        onPointerDown={(e) => flagDown(e, p.i)} onPointerMove={flagMove} onPointerUp={flagUp} onPointerCancel={() => setFlagDrag(undefined)}
                        onDoubleClick={(e) => { e.stopPropagation(); openName(p.i); }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMarkerSelect?.(p.i); onMarkerMenu?.({ x: e.clientX, y: e.clientY, i: p.i }); }}
                        className={cn('group absolute z-[2] flex h-4 -translate-x-1/2 touch-none select-none outline-none items-end justify-center px-[3px] duration-200 animate-in fade-in-0', dragging ? 'cursor-grabbing' : 'cursor-pointer')}
                        style={{ left: x, bottom: p.row ? 13 : 0 }}>
                        <span className={cn('h-3 w-2.5 transition-colors duration-150 [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]', on ? 'bg-ink' : 'bg-warn group-hover:bg-[#fbbf5a]')} />
                      </button>
                      {p.label && !dragging && (
                        <span className={cn('pointer-events-none absolute z-[1] truncate bg-hdr pl-0.5 pr-1 font-sans text-[10px] leading-[12px] transition-colors duration-150', on ? 'text-ink' : 'text-warn')}
                          style={{ left: x + 6, bottom: p.row ? 13 : 0, maxWidth: p.labelW }}>{p.label}</span>
                      )}
                    </span>
                  );
                });
              })()}
              {flagName && tl.markers[flagName.i] && (
                <input autoFocus data-flag-name value={flagName.text} placeholder="Name this bookmark" aria-label="Bookmark name"
                  onChange={(e) => setFlagName({ ...flagName, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); closeName(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeName(false); } }}
                  onBlur={() => closeName(true)} onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-[4px] z-[9] h-6 w-[180px] rounded-[6px] border border-edge-strong bg-bg px-2 font-sans text-[12px] text-ink outline-none duration-150 animate-in fade-in-0 focus:border-sub"
                  style={{ left: Math.max(0, toF(tl.markers[flagName.i].at, fps) * z - 8) }} />
              )}
              <span className="pointer-events-none absolute top-[5px] z-[3] -translate-x-1/2 rounded-[4px] bg-ink px-1.5 py-px font-mono text-[10.5px] font-medium text-bg" style={{ left: Math.max(playX, 38) }}>{smpte(frame / fps, fps)}</span>
            </div>
          </div>

          {scenes && scenes.length > 0 && (
            <div className="flex h-[22px] border-b border-line">
              <div className="sticky left-0 z-[6] flex w-[150px] flex-none items-center border-r border-line bg-hdr px-2.5 text-[11.5px] text-sub">Scene</div>
              {/* names only: a click or a drag here moves the playhead, as on the ruler (the user, 13 Nov) */}
              <div className="relative flex-1 cursor-text" onPointerDown={(e) => { if (e.button === 0) { setFrame(frameAtClient(e.clientX)); begin({ kind: 'scrub' }, e); } }}
                onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY, frame: frameAtClient(e.clientX) }); } }}>
                {scenes.map((s) => (
                  <span key={`${s.label}${s.from}`}
                    className={cn('pointer-events-none absolute top-[2px] flex h-[17px] items-center overflow-hidden whitespace-nowrap rounded-[4px] px-1.5 text-[11px] transition-[left,width,background-color,color] duration-200 ease-out',
                      s.scene && s.scene === openScene ? 'bg-[#26262b] text-ink' : 'bg-[#17171a] text-sub')}
                    style={{ left: s.from * z, width: Math.max(4, (s.to - s.from) * z - 2) }}>
                    {s.making && <span data-take-making={s.scene} role="img" aria-label={`${s.label}: take being made`} title={`${s.label}: take being made`} className="pointer-events-auto mr-1 flex flex-none items-center duration-200 animate-in fade-in-0"><StepGlyph g="run" className="size-[9px]" /></span>}
                    {s.title && (s.to - s.from) * z > 150 ? `${s.label} · ${s.title}` : s.label}</span>
                ))}
              </div>
            </div>
          )}

          {tl.tracks.map((t) => {
            const h = rowH(t, tl);
            // the joins of this track that can be moved: two touching clips, both wide enough for trim handles
            const sorted = [...t.clips].sort((a, b) => startF(a, fps) - startF(b, fps));
            const joins = readOnly || t.locked || tool !== 'select' ? [] : sorted.flatMap((a, i) => {
              const b = sorted[i + 1];
              return b && endF(a, fps) === startF(b, fps) && lenF(a, fps) * z >= TRIM_MIN && lenF(b, fps) * z >= TRIM_MIN ? [{ a, b }] : [];
            });
            const joinTail = new Set(joins.map((x) => x.a.id)), joinHead = new Set(joins.map((x) => x.b.id));
            return (
              <div key={t.id} data-track={t.id} className={cn('flex border-b border-line transition-colors duration-150', drag?.kind === 'move' && (drag.group && drag.to ? !drag.why && drag.toRows?.includes(t.id) : drag.to === t.id) && 'bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(250,250,250,0.35)]', drag?.kind === 'move' && drag.group && drag.why && drag.to === t.id && 'bg-white/[0.025] shadow-[inset_0_0_0_1px_rgba(250,250,250,0.14)]')} style={{ height: h }}>
                <TrackHead t={t} disabled={readOnly} onEdit={onEdit} tl={tl} solo={solo} onSolo={onSolo} pasteHere={!!pasteTo?.has(t.id)} onPasteTo={onPasteTo}
                  onMenu={onHeadMenu} renaming={renaming === t.id} onRenamed={onRenamed} onPress={onPress} />
                {/* isolate: the lane is its own stack, so what is raised inside it (fade dots over the join's zone over the trim
                    handles) stays under the names column and the ruler */}
                <div className={cn('relative isolate flex-1', t.locked && 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.02)_6px_12px)]', editing?.trackId === t.id && 'z-[6]')}
                  onPointerDown={(e) => { if (e.button !== 0) return; const tiny = nearClip(t, e.clientX); if (tiny) { clipDown(e, t, tiny, 'body'); return; } { const o = toContent(e.clientX, e.clientY); begin({ kind: 'box', x0: o.x, y0: o.y, x1: o.x, y1: o.y, mode: boxMode(e), moved: false, hit: [] }, e); } }}
                  onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY, frame: frameAtClient(e.clientX), trackId: t.id, clipId: nearClip(t, e.clientX)?.id }); } }}>
                  {laneNote?.[t.id] && !t.clips.length && (
                    // kept in the part of the lane in view, however the timeline is scrolled or zoomed (sticky past the names column)
                    <div className="pointer-events-none absolute inset-y-[6px] left-0 right-0 flex items-stretch">
                      <span data-lane-note={t.id} className="sticky left-[156px] flex items-center whitespace-nowrap rounded-[5px] bg-white/[0.035] px-2 text-[12px] text-mute duration-200 animate-in fade-in-0">{laneNote[t.id]}</span>
                    </div>
                  )}
                  {t.clips.map((c) => {
                    const s = startF(c, fps), len = lenF(c, fps);
                    const { dx, dw } = offsetOf(c);
                    const w = Math.max(MIN_CLIP, len * z + dw);
                    const isSel = boxOut ? selected.has(c.id) && !boxOut.has(c.id) : selected.has(c.id) || (drag?.kind === 'box' && drag.hit.includes(`${t.id}:${c.id}`));
                    const sup = superseded(c);
                    const gain = drag?.kind === 'gain' && drag.ref.clipId === c.id ? drag.db : c.gain ?? 0;
                    const txt = t.kind === 'video' ? clipText?.(c, t) : undefined;
                    const mark = t.kind === 'video' ? clipMark?.(c, t) : undefined;
                    const note = t.kind === 'video' ? clipNote?.(c, t) : undefined;
                    const isTry = !!tryIds?.has(c.id) || !!mark?.marked;
                    const still = !isMove(drag) && drag?.kind !== 'roll';
                    const over = pastEnd(c, srcSeconds((c.src ?? '')), fps);
                    // frames of the shot before or after its own (a shot extended past them before trims stopped
                    // there), less what the edge in hand has taken back so far
                    const fr = t.kind === 'captions' ? undefined : lim(c);
                    const ps = fr ? pastShot(c, fr, fps) : { head: 0, tail: 0 };
                    const held = (drag?.kind === 'head' || drag?.kind === 'tail') && drag.ids.has(c.id) ? drag : undefined;
                    const psHead = Math.max(0, ps.head - (held?.kind === 'head' ? held.d : 0)), psTail = Math.max(0, ps.tail + (held?.kind === 'tail' ? held.d : 0));
                    const psShot = shotFrames(fr);
                    // the edge in hand held at its shot's first or last frame: lit in amber while it is held there
                    const atStop = held && held.why && held.ref.clipId === c.id ? held.kind : undefined;
                    const lenNow = Math.max(1, len + dw / z);
                    // a sound clip's fades as heard: Alma's head (or tail) pair of level points is the fade it makes (fades.ts)
                    const cf = t.kind === 'audio' ? asFades(c) : { clip: c, skip: 0 };
                    const fIn = drag?.kind === 'fadeIn' && drag.ref.clipId === c.id ? drag.f : Math.min(lenNow, toF(cf.clip.fadeIn ?? 0, fps));
                    const fOut = drag?.kind === 'fadeOut' && drag.ref.clipId === c.id ? drag.f : Math.min(lenNow, toF(cf.clip.fadeOut ?? 0, fps));
                    const fromLv = t.kind === 'audio' && fIn > 0 ? cf.clip.fadeInFrom : undefined, toLv = t.kind === 'audio' && fOut > 0 ? cf.clip.fadeOutTo : undefined;
                    // the clip as drawn now, on a clock of its drawn width (x / z / fps seconds), for fadeDb
                    const drawn = { ...cf.clip, in: 0, out: w / z / fps, speed: 1, gain, fadeIn: fIn / fps, fadeOut: fOut / fps };
                    // fade dots on sound and, since 13 Nov, on picture clips: each fades its own clip only
                    const canFade = (t.kind === 'audio' || t.kind === 'video') && !readOnly && !t.locked && w >= 44 && !c.plan;
                    // where the two dots sit (their centres, from the clip's left). A fade out over nearly all the clip
                    // used to put its dot on the fade-in dot, and it took the press. When they come within a dot's width
                    // they part around the point where they meet: the left one is always the fade in, the right one the
                    // fade out. The places move smoothly with the fades, so nothing jumps.
                    const DOT = 14; // the dot, 11 px, with its ring and the clip's border
                    let dotIn = Math.max(8, fIn * z), dotOut = w - Math.max(8, fOut * z);
                    if (dotOut - dotIn < DOT) {
                      const meet = Math.min(w - DOT / 2, Math.max(DOT / 2, (dotIn + dotOut) / 2));
                      dotIn = meet - DOT / 2; dotOut = meet + DOT / 2;
                    }
                    const fadeDown = (e: React.PointerEvent, kind: 'fadeIn' | 'fadeOut') => {
                      if (e.button !== 0) return;
                      const ref = { trackId: t.id, clipId: c.id };
                      onSelect(ref, c, t);
                      begin({ kind, ref, x0: e.clientX, f0: kind === 'fadeIn' ? fIn : fOut, f: kind === 'fadeIn' ? fIn : fOut, max: Math.max(0, len - (kind === 'fadeIn' ? fOut : fIn)), moved: false }, e);
                    };
                    // a planned shot is drawn as a shot (its number and words), not as a line of text (15 Nov)
                    const line = isLine(c) && c.plan !== 'shot';
                    const tip = line ? `${c.who ? `${c.who}: ` : ''}${c.text}\n${smpte(s / fps, fps)} → ${smpte((s + len) / fps, fps)} · ${len} f (${(len / fps).toFixed(2)} s)${c.muted ? '\nmuted' : ''}${!readOnly && !t.locked ? '\ndouble-click or Enter to retype' : ''}` : `${clipName(c)}\n${smpte(s / fps, fps)} → ${smpte((s + len) / fps, fps)} · ${len} f (${(len / fps).toFixed(2)} s)\nsource ${smpte(c.in, fps)} → ${smpte(c.out, fps)} (${c.in.toFixed(2)}–${c.out.toFixed(2)} s)${speedOf(c) !== 1 ? `\nspeed ${Math.round(speedOf(c) * 100)}%` : ''}${c.gain !== undefined ? `\ngain ${fmtDb(c.gain)}` : ''}${c.flip ? '\nmirrored left to right' : ''}${cf.clip.fadeIn ? `\n${t.kind === 'video' ? 'picture' : 'sound'} fades in over ${toF(cf.clip.fadeIn, fps)} f${cf.clip.fadeInFrom !== undefined ? ` from ${fmtLevel(cf.clip.fadeInFrom)}` : ''}` : ''}${cf.clip.fadeOut ? `\n${t.kind === 'video' ? 'picture' : 'sound'} fades out over ${toF(cf.clip.fadeOut, fps)} f${cf.clip.fadeOutTo !== undefined ? ` to ${fmtLevel(cf.clip.fadeOutTo)}` : ''}` : ''}${c.dissolve ? `\n${t.kind === 'audio' ? 'cross-fades' : 'dissolves'} from the clip before over ${toF(c.dissolve, fps)} f` : ''}${c.gainPoints?.length ? `\n${c.gainPoints.length} level point${c.gainPoints.length === 1 ? '' : 's'}` : ''}${toConfirm(c) ? '\nto confirm' : ''}${sup ? `\n${sup}` : ''}${over ? `\nruns ${over} f (${(over / fps).toFixed(2)} s) past the end of its file: that part has no picture or sound of its own; drag its end in to fix` : ''}${psShot && ps.head ? `\nstarts ${ps.head} f (${(ps.head / fps).toFixed(2)} s) before shot ${psShot.first}'s own frames: those are the shot before's; drag its start in to fix` : ''}${psShot && ps.tail ? `\nruns ${ps.tail} f (${(ps.tail / fps).toFixed(2)} s) past shot ${psShot.last}'s own frames: those are the next shot's; drag its end in to fix` : ''}`;
                    return (
                      <div key={c.id} title={tip} role="button" tabIndex={-1} aria-pressed={isSel} aria-label={`${t.id} ${clipName(c)} at ${smpte(s / fps, fps)}`}
                        onPointerDown={(e) => clipDown(e, t, c, 'body')}
                        onDoubleClick={line && !readOnly && !t.locked ? () => setEditing({ trackId: t.id, clipId: c.id }) : undefined}
                        onContextMenu={(e) => { if (onMenu) { e.preventDefault(); e.stopPropagation(); onMenu({ x: e.clientX, y: e.clientY, frame: frameAtClient(e.clientX), trackId: t.id, clipId: (nearClip(t, e.clientX, 6, 3) ?? c).id }); } }}
                        className={cn('absolute top-[3px] box-border overflow-hidden border text-[11.5px]', w >= 12 ? 'rounded-[5px]' : 'rounded-[2px]', t.locked || readOnly ? 'cursor-default' : cursor,
                          still && 'transition-[left,width,border-color,box-shadow] duration-200 ease-out',
                          c.plan === 'shot' ? 'border-dashed bg-[#131316]' : t.kind === 'video' ? 'bg-raised' : line ? 'bg-[#26262b]' : 'bg-panel', w < 6 && 'z-[2]', isTry ? 'z-[3] border-dashed border-warn shadow-[0_0_0_1px_#FBBF24]' : isSel ? 'border-ink shadow-[inset_0_0_0_1px_#FAFAFA]' : 'border-edge-strong hover:border-sub',
                          (c.muted || t.muted || sup) && 'opacity-45', 'group/clip', ((isMove(drag) && drag.ids.has(c.id)) || (drag?.kind === 'roll' && (drag.lefts.has(c.id) || drag.rights.has(c.id)))) && 'z-[4] opacity-90')}
                        data-clip={`${t.id}:${c.id}`} data-clip-src={c.src} data-seedance={mark?.marked ? 'marked' : undefined}
                        style={{ left: s * z + dx, width: w, height: h - 7, transform: drag?.kind === 'move' && drag.to && drag.group ? (drag.tos?.[c.id] ? `translateY(${drag.tos[c.id]}px)` : undefined) : drag?.kind === 'move' && drag.to && drag.ref.clipId === c.id && drag.ref.trackId === t.id ? `translateY(${drag.dy ?? 0}px)` : undefined }}>
                        {t.kind === 'video' && !!c.src && (w >= 70 || (txt && w >= 20)) && (
                          // eslint-disable-next-line @next/next/no-img-element -- a WebP poster from /api/media, sized by the clip
                          <img alt="" draggable={false} src={mediaUrl((c.src ?? ''), { w: 160, t: txt ? Math.round(((c.in + c.out) / 2) * 100) / 100 : Math.max(0.05, c.in + 0.2) })}
                            className={cn('pointer-events-none absolute inset-y-0 left-0 h-full object-cover', txt ? (w >= 96 ? 'w-[34px] opacity-95' : 'w-full opacity-90') : 'w-auto max-w-[40%] opacity-50')} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                        {t.kind === 'audio' && !c.plan && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-[60%] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#3F3F46_0_1px,transparent_1px_4px)] opacity-60" />}
                        {line ? (
                          // a subtitle line: its words on one row, cut short; all of them in the title
                          w >= 16 && <span data-line-words="" className={cn('pointer-events-none relative block truncate px-1.5 pt-[5px] text-[11.5px] leading-4', sup ? 'text-mute' : 'text-ink-3', c.plan === 'line' && !c.who && 'italic text-sub')}>{c.plan === 'line' && c.who ? <><b className="mr-1 font-mono text-[10px] font-medium tracking-[0.04em] text-ink">{c.who}</b>{oneRow(c.text ?? '')}</> : oneRow(c.text ?? '')}</span>
                        ) : txt ? (w >= 96 ? (
                          <span className={cn('pointer-events-none relative flex h-full flex-col justify-between py-1.5 pr-1.5', c.src ? 'pl-[41px]' : 'pl-2')}>
                            <span className={cn('truncate text-[12px] font-medium', sup ? 'text-mute' : 'text-ink')}>{txt.title}</span>
                            {txt.sub && <span className="line-clamp-2 text-[10.5px] leading-[1.15] text-sub">{txt.sub}</span>}
                          </span>
                        ) : w >= 30 ? (
                          <span className="pointer-events-none absolute left-[3px] top-[3px] rounded-[4px] bg-black px-1 text-[10.5px] leading-4 text-ink">{w >= 46 ? txt.title : txt.title.replace(/^\D+/, '')}</span>
                        ) : null) : (
                          <span className={cn('pointer-events-none relative flex items-center gap-1.5 truncate px-1.5 pt-1 font-medium', t.kind === 'video' && w >= 70 && 'pl-[calc(min(40%,56px)+6px)]', sup ? 'text-mute' : 'text-ink')}>
                            {w >= 70 ? <span className="truncate">{clipName(c)}</span> : t.kind === 'video' && c.takeRef && w >= 20 ? <span className="truncate font-mono text-[10.5px]">{c.takeRef.scene}</span> : null}
                          </span>
                        )}
                        {speedOf(c) !== 1 && w >= 34 && <span title={`plays at ${Math.round(speedOf(c) * 100)}% speed`} className="pointer-events-none absolute right-1.5 top-1 inline-flex h-4 items-center rounded-[4px] bg-black/55 px-1 font-mono text-[10px] text-ink-3">{Math.round(speedOf(c) * 100)}%</span>}
                        {c.unlinked && w >= 30 && (
                          <span title={t.kind === 'video' ? 'Its sound is unlinked: edits here leave the sound alone' : 'Unlinked from its picture: edits here leave the picture alone'} className="pointer-events-none absolute bottom-1 right-1 z-[2] flex size-[18px] items-center justify-center rounded-[5px] bg-black text-warn">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M6.5 11.5l-1 1A2.5 2.5 0 012 9l1-1M5 5l6 6" /></svg>
                          </span>
                        )}
                        {c.flip && w >= 30 && (
                          // mirrored (the render's flip): a mark at a glance, beside the unlinked one when both are on
                          <span data-mirror="" title="Mirrored left to right (right-click: Stop mirroring)" className={cn('pointer-events-none absolute bottom-1 z-[2] flex size-[18px] items-center justify-center rounded-[5px] bg-black text-ink-3 animate-in fade-in-0 duration-200', c.unlinked ? 'right-[23px]' : 'right-1')}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.5v13" strokeDasharray="1.6 1.6" /><path d="M5.5 4.5 1.5 12h4z" /><path d="M10.5 4.5l4 7.5h-4z" fill="currentColor" /></svg>
                          </span>
                        )}
                        {note && w >= 18 && (
                          // pressed without selecting or dragging the clip under it
                          <button type="button" data-new-take="" title={note.title} aria-label={note.text} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); note.onPress(); }}
                            className={cn('absolute top-1 z-[3] inline-flex h-4 cursor-pointer items-center gap-1 rounded-[4px] border border-white/15 bg-black/75 text-[10px] leading-none text-ink-3 transition-colors duration-200 animate-in fade-in-0 hover:border-warn/60 hover:text-ink', speedOf(c) !== 1 && w >= 34 ? 'right-12' : 'right-1', w >= 76 ? 'px-1' : 'w-4 justify-center')}>
                            <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-warn" />{w >= 76 && note.text}
                          </button>
                        )}
                        {mark && <span data-mark={mark.kind} aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-0 z-[2] duration-200 animate-in fade-in-0', mark.kind === 'small' ? 'border-t-2 border-dashed border-warn' : mark.kind === 'seedance' ? 'h-[2px] bg-sky-400' : 'h-px bg-white/40')} />}
                        {mark && mark.kind !== 'upscaled' && w >= 40 && <span className={cn('pointer-events-none absolute bottom-1 right-1 z-[2] inline-flex h-4 items-center rounded-[4px] bg-black/80 px-1 font-mono text-[9.5px] duration-200 animate-in fade-in-0', mark.kind === 'small' ? 'text-warn' : 'text-sky-300')}>{mark.kind === 'small' ? '480p' : mark.kind === 'full' ? '1080p' : 'Seedance'}</span>}
                        {toConfirm(c) && w >= 70 && <span className="pointer-events-none absolute bottom-1 right-1.5 inline-flex h-4 items-center rounded-[8px] border border-dashed border-warn px-1.5 text-[10px] text-warn">to confirm</span>}
                        {toConfirm(c) && w < 70 && w >= 10 && <span className="pointer-events-none absolute right-1 top-1 size-1.5 rounded-full bg-warn" />}
                        {sup && w >= 90 && <span className="pointer-events-none absolute bottom-1 left-1.5 truncate text-[10px] text-mute">{sup}</span>}
                        {!c.plan && hasLevel(t, tl) && w >= 24 && (() => {
                          // the level line (the clip's gain) and its points (gainPoints, 13 Nov): straight between points, flat
                          // before the first and after the last. Dragging the line moves the whole level; Option-click on it adds
                          // a point; a point drags up and down (level) and sideways (time), and Delete removes the one clicked
                          const H = h - 7, sp = speedOf(c);
                          const pd = drag?.kind === 'point' && drag.ref.clipId === c.id && drag.ref.trackId === t.id ? drag : undefined;
                          // the points as drawn (a head pair read as a fade is drawn as the fade); `ix` is each one's number in the file
                          const pts = (cf.clip.gainPoints ?? []).map((p, k) => { const ix = k + cf.skip; return { ...(pd && pd.i === ix ? { t: pd.t, db: pd.db } : p), ix }; });
                          // where a source second sits in the clip as drawn now (a head trimmed or a join moved shifts the start)
                          const shift = dw !== 0 && dw === -dx ? dx : 0;
                          const xOf = (st: number) => ((st - c.in) / sp) * fps * z - shift;
                          const yOf = (db: number) => dbToY(gain + db, H);
                          // with a fade from or to a level the line is drawn as heard: points and the fade's ramp added
                          // (both straight in dB, so straight between the corners of either)
                          const ramps = fromLv !== undefined || toLv !== undefined;
                          const dbX = (x: number) => pointsDb(pts, c.in + ((x + shift) / z / fps) * sp) + fadeDb(drawn, x / z / fps);
                          const xs = ramps ? [...new Set([0, fIn * z, w - fOut * z, w, ...pts.map((p) => xOf(p.t))].filter((x) => x >= 0 && x <= w).map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b) : [];
                          const line = ramps
                            ? xs.map((x, k) => `${k ? 'L' : 'M'}${x} ${yOf(dbX(x)).toFixed(1)}`).join(' ')
                            : pts.length
                            ? `M0 ${yOf(pts[0].db)} ${pts.map((p) => `L${xOf(p.t).toFixed(1)} ${yOf(p.db).toFixed(1)}`).join(' ')} L${w} ${yOf(pts[pts.length - 1].db)}`
                            : `M0 ${yOf(0)} L${w} ${yOf(0)}`;
                          const live = !readOnly && !t.locked;
                          const heard = pts.length ? `${fmtDb(gain + pts[0].db)}${pts.length > 1 ? ` … ${fmtDb(gain + pts[pts.length - 1].db)}` : ''}` : fmtDb(gain);
                          return (
                            <>
                              <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible" width={w} height={H}>
                                <path d={line} fill="none" stroke="#fafafa" strokeWidth={1} />
                              </svg>
                              <svg className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible" width={w} height={H}>
                                <path d={line} fill="none" stroke="transparent" strokeWidth={10} role="slider" aria-label={`${clipName(c)} gain`} aria-valuenow={gain} aria-valuemin={DB_BOTTOM} aria-valuemax={DB_TOP}
                                  data-level-line={`${t.id}:${c.id}`} onPointerDown={levelDown} style={{ pointerEvents: live ? 'stroke' : 'none', cursor: 'ns-resize' }}>
                                  <title>{`level ${heard} · drag to change${pts.length ? ' (the points move with it)' : ''} · ⌥-click to add a point`}</title>
                                </path>
                              </svg>
                              {w >= 90 && <span className="pointer-events-none absolute right-1.5 z-[2] font-mono text-[10px] text-ink-3" style={{ top: Math.max(0, yOf(pts.length ? pts[pts.length - 1].db : 0) - 15) }}>{fmtDb(gain + (pts.length ? pts[pts.length - 1].db : 0))}</span>}
                              {w >= 40 && pts.map((p) => {
                                const x = xOf(p.t), i = p.ix;
                                if (x < -6 || x > w + 6) return null;
                                const on = point && point.trackId === t.id && point.clipId === c.id && point.i === i;
                                return (
                                  <span key={i} role="slider" tabIndex={-1} aria-label={`Level point ${i + 1} on ${clipName(c)}`} aria-valuenow={gain + p.db} data-point={i} data-point-on={on ? '' : undefined}
                                    title={`${fmtDb(gain + p.db)} at ${smpte(c.at + (p.t - c.in) / sp, fps)} · drag to move · click, then Delete to remove`}
                                    data-level-of={`${t.id}:${c.id}`} onPointerDown={pointDown}
                                    className={cn('absolute z-[4] flex size-[17px] -translate-x-1/2 -translate-y-1/2 items-center justify-center', live ? 'cursor-move' : 'cursor-default')} style={{ left: x, top: yOf(p.db) }}>
                                    <span className={cn('size-[9px] rounded-full bg-ink transition-shadow duration-150', on ? 'shadow-[0_0_0_1.5px_#000,0_0_0_3px_#FBBF24]' : 'shadow-[0_0_0_1.5px_#000]')} />
                                  </span>
                                );
                              })}
                              {pd && pd.moved && (
                                // beside the point, above it when it is low in the clip and under it when high, never on it
                                <span className="pointer-events-none absolute z-[5] -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg"
                                  style={{ left: Math.max(48, Math.min(w - 48, xOf(pd.t))), top: yOf(pd.db) > H / 2 ? Math.max(0, yOf(pd.db) - 24) : Math.min(H - 16, yOf(pd.db) + 8) }}>{fmtDb(gain + pd.db)} · {smpte(c.at + (pd.t - c.in) / sp, fps)}</span>
                              )}
                            </>
                          );
                        })()}
                        {/* fades (ASKS 16, "like it is in DaVinci"): the ramp over each faded end, and on a sound clip a dot at
                            each top corner; drag a dot inward to fade in or out, back to the corner for none */}
                        {t.kind !== 'captions' && fIn > 0 && fromLv === undefined && w >= 16 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-[1]" style={{ width: fIn * z, background: ramp('in') }} />}
                        {t.kind !== 'captions' && fOut > 0 && toLv === undefined && w >= 16 && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[1]" style={{ width: fOut * z, background: ramp('out') }} />}
                        {(fromLv !== undefined || toLv !== undefined) && w >= 16 && (() => {
                          // a fade from or to a level: the ramp from the level it starts at to the clip's
                          // own, and the wedge between it and the clip's level shaded (dark where quieter, light where louder);
                          // on a track with no level line the ramp is drawn here too
                          const H = h - 7, own = dbToY(gain, H);
                          const ends: [number, number, number][] = [];   // [x of the outer end, x of the inner end, y of the outer end]
                          if (fromLv !== undefined) ends.push([0, fIn * z, dbToY(fromLv, H)]);
                          if (toLv !== undefined) ends.push([w, w - fOut * z, dbToY(toLv, H)]);
                          return (
                            <svg aria-hidden="true" data-level-fade={`${fromLv ?? ''}|${toLv ?? ''}`} className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible" width={w} height={H}>
                              {ends.map(([xo, xi, yo], k) => (
                                <g key={k}>
                                  <path d={`M${xo} ${yo.toFixed(1)} L${xi.toFixed(1)} ${own.toFixed(1)} L${xo} ${own.toFixed(1)} Z`} fill={yo > own ? 'rgba(0,0,0,.72)' : 'rgba(250,250,250,.14)'} className="transition-[d] duration-150" />
                                  {!hasLevel(t, tl) && <path d={`M${xo} ${yo.toFixed(1)} L${xi.toFixed(1)} ${own.toFixed(1)}`} fill="none" stroke="#fafafa" strokeWidth={1} />}
                                </g>
                              ))}
                            </svg>
                          );
                        })()}
                        {canFade && (
                          <>
                            <span role="slider" tabIndex={-1} aria-label={`Fade in on ${clipName(c)}`} aria-valuenow={fIn} aria-valuemin={0} aria-valuemax={len} title={`${fIn ? `The ${t.kind === 'video' ? 'picture' : 'sound'} fades in over ${fIn} f · drag to change` : `Drag inward to fade the ${t.kind === 'video' ? 'picture in from black' : 'sound in'}`}${t.kind === 'video' ? ' (the picture only; its sound has its own)' : ''}`}
                              onPointerDown={(e) => fadeDown(e, 'fadeIn')}
                              className={cn('absolute top-[2px] z-[6] size-[11px] -translate-x-1/2 cursor-ew-resize rounded-full shadow-[0_0_0_1.5px_#000] transition-opacity duration-150', fIn > 0 ? 'bg-ink' : 'bg-sub hover:bg-ink', fIn > 0 || isSel || drag?.kind === 'fadeIn' ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/clip:pointer-events-auto group-hover/clip:opacity-100')}
                              style={{ left: dotIn }} />
                            <span role="slider" tabIndex={-1} aria-label={`Fade out on ${clipName(c)}`} aria-valuenow={fOut} aria-valuemin={0} aria-valuemax={len} title={`${fOut ? `The ${t.kind === 'video' ? 'picture' : 'sound'} fades out over ${fOut} f · drag to change` : `Drag inward to fade the ${t.kind === 'video' ? 'picture out to black' : 'sound out'}`}${t.kind === 'video' ? ' (the picture only; its sound has its own)' : ''}`}
                              onPointerDown={(e) => fadeDown(e, 'fadeOut')}
                              className={cn('absolute top-[2px] z-[6] size-[11px] translate-x-1/2 cursor-ew-resize rounded-full shadow-[0_0_0_1.5px_#000] transition-opacity duration-150', fOut > 0 ? 'bg-ink' : 'bg-sub hover:bg-ink', fOut > 0 || isSel || drag?.kind === 'fadeOut' ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/clip:pointer-events-auto group-hover/clip:opacity-100')}
                              style={{ right: w - dotOut }} />
                            {drag && (drag.kind === 'fadeIn' || drag.kind === 'fadeOut') && drag.ref.clipId === c.id && (
                              <span className={cn('pointer-events-none absolute bottom-1 z-[5] rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg', drag.kind === 'fadeIn' ? 'left-1' : 'right-1')}>{drag.kind === 'fadeIn' ? 'in' : 'out'} {(drag.f / fps).toFixed(1)} s</span>
                            )}
                          </>
                        )}
                        {/* a clip that runs past the end of its file (an older version's, or a file that changed): the part
                            past the end is underlined in amber; the clip's title says by how much */}
                        {over > 0 && w >= 4 && <span aria-hidden="true" data-past-end={over} className="pointer-events-none absolute bottom-0 right-0 z-[2] h-[3px] bg-warn" style={{ width: Math.max(3, Math.min(w, over * z)) }} />}
                        {/* a clip that shows frames of the shot before or after its own (extended past them before trims
                            stopped at a shot's ends): those frames underlined in amber, shrinking as the edge is dragged in */}
                        {(ps.head > 0 || ps.tail > 0) && w >= 4 && (
                          <>
                            <span aria-hidden="true" data-past-shot="head" className="pointer-events-none absolute bottom-0 left-0 z-[2] h-[3px] bg-warn transition-[width,opacity] duration-150 ease-out" style={{ width: Math.min(w, psHead * z), opacity: psHead ? 1 : 0 }} />
                            <span aria-hidden="true" data-past-shot="tail" className="pointer-events-none absolute bottom-0 right-0 z-[2] h-[3px] bg-warn transition-[width,opacity] duration-150 ease-out" style={{ width: Math.min(w, psTail * z), opacity: psTail ? 1 : 0 }} />
                          </>
                        )}
                        {atStop && <span aria-hidden="true" data-shot-stop={atStop} className={cn('pointer-events-none absolute inset-y-0 z-[4] w-[2px] bg-warn duration-150 animate-in fade-in-0', atStop === 'head' ? 'left-0' : 'right-0')} />}
                        {/* trim handles only on clips wide enough to keep a body to click (at "fit" a short clip is all handle);
                            beside a join they are 9 px, 3 of them under the join's own zone */}
                        {!readOnly && !t.locked && w >= TRIM_MIN && (
                          <>
                            {/* a trim handle lights only its own clip's edge (a join lights both): the press is told apart
                                before it is made (14 Nov) */}
                            <span aria-hidden="true" data-trim="head" onPointerDown={(e) => clipDown(e, t, c, 'head')} className="group/trim absolute inset-y-0 left-0 z-[3] cursor-w-resize" style={{ width: joinHead.has(c.id) ? TRIM_W_JOIN : TRIM_W }}>
                              <span className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-ink opacity-0 transition-opacity duration-150 group-hover/trim:opacity-100" />
                            </span>
                            <span aria-hidden="true" data-trim="tail" onPointerDown={(e) => clipDown(e, t, c, 'tail')} className="group/trim absolute inset-y-0 right-0 z-[3] cursor-e-resize" style={{ width: joinTail.has(c.id) ? TRIM_W_JOIN : TRIM_W }}>
                              <span className="pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-ink opacity-0 transition-opacity duration-150 group-hover/trim:opacity-100" />
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {t.kind === 'video' && (() => {
                    // a shot made of its storyboard panels: each panel is a board clip of its own, and a
                    // thin line over them, from the shot's first panel to its last, says they are one shot
                    const groups = new Map<string, { a: number; b: number; n: number }>();
                    for (const c of t.clips) {
                      if (c.plan !== 'board' || !c.panel || c.panel.of < 2) continue;
                      const k = `${c.scene}:${c.shot}`, a = startF(c, fps), b = a + lenF(c, fps);
                      const g = groups.get(k);
                      if (g) { g.a = Math.min(g.a, a); g.b = Math.max(g.b, b); g.n++; } else groups.set(k, { a, b, n: 1 });
                    }
                    return [...groups.entries()].filter(([, g]) => g.n > 1).map(([k, g]) => (
                      <span key={k} data-shot-group={k} aria-hidden="true" className="pointer-events-none absolute top-0 z-[2] h-[2px] rounded-full bg-white/45 transition-[left,width] duration-200 ease-out"
                        style={{ left: g.a * z + 2, width: Math.max(2, (g.b - g.a) * z - 4) }} />
                    ));
                  })()}
                  {editing && editing.trackId === t.id && (() => {
                    const c = t.clips.find((x) => x.id === editing.clipId);
                    if (!c || !isLine(c)) return null;
                    const ref = editing;
                    return <LineField key={c.id} text={c.text ?? ''} label={`Words of the line at ${smpte(c.at, fps)}`} left={startF(c, fps) * z} width={Math.max(240, lenF(c, fps) * z)}
                      onDone={(words) => { setEditing(undefined); if (words !== undefined) onEdit(retypeLine(tl, ref, words)); }} />;
                  })()}
                  {joins.map(({ a, b }) => {
                    const rolling = drag?.kind === 'roll' && (drag.lefts.has(a.id) && drag.rights.has(b.id));
                    const x = (startF(b, fps) + (rolling ? drag.d : 0)) * z;
                    return (
                      <span key={`j:${a.id}:${b.id}`} role="separator" aria-orientation="vertical" aria-label={`The join of ${clipName(a)} and ${clipName(b)}: drag to move it`}
                        title="Drag to move the join: the clip before it gets longer, the one after it shorter (or the other way)"
                        data-join={`${t.id}:${a.id}:${b.id}`} onPointerDown={(e) => joinDown(e, t, a, b)}
                        className={cn('group/join absolute top-[3px] z-[5] flex cursor-col-resize justify-center', isMove(drag) && 'pointer-events-none')}
                        style={{ left: x - JOIN_HALF, width: 2 * JOIN_HALF, height: h - 7 }}>
                        {/* both clips' edges lit, the earlier one's end and the later one's start (a trim handle lights one) */}
                        <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[2px] bg-ink transition-opacity duration-150', rolling ? 'opacity-100' : 'opacity-0 group-hover/join:opacity-100')} />
                        <span aria-hidden="true" className={cn('absolute inset-y-0 right-0 w-[2px] bg-ink transition-opacity duration-150', rolling ? 'opacity-100' : 'opacity-0 group-hover/join:opacity-100')} />
                      </span>
                    );
                  })}
                  {t.kind !== 'captions' && sorted.map((b, i) => {
                    // a dissolve (on a sound track, a cross-fade) drawn on its join: a bow-tie as wide as it, centred on
                    // the cut (⌊D/2⌋ frames before it, as the render does); its edges drag it wider or narrower
                    const a = sorted[i - 1];
                    if (!b.dissolve || !a || endF(a, fps) !== startF(b, fps)) return null;
                    const dd = drag?.kind === 'dissolve' && drag.ref.trackId === t.id && drag.ref.clipId === b.id ? drag : undefined;
                    const D = dd ? dd.f : toF(b.dissolve, fps);
                    const wd = D * z;
                    if (wd < 3) return null;
                    const left = (startF(b, fps) - Math.floor(D / 2)) * z;
                    const sound = t.kind === 'audio';
                    const what = `${sound ? 'Cross-fade' : 'Dissolve'} ${D} f (${(D / fps).toFixed(2)} s), centred on the cut. Right-click the join to change it or take it off`;
                    const dref = { trackId: t.id, clipId: b.id };
                    const grab = !readOnly && !t.locked && tool === 'select' && wd / 2 >= 14;
                    return (
                      <span key={`d:${b.id}`} data-dissolve={`${t.id}:${b.id}`} data-frames={D} title={what}
                        className={cn('pointer-events-none absolute top-[3px] z-[4] animate-in fade-in-0 duration-200', !dd && 'transition-[left,width] duration-200 ease-out')} style={{ left, width: wd, height: h - 7 }}>
                        <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
                          <path d="M0 0 L50 50 L0 100 Z M100 0 L50 50 L100 100 Z" fill="rgba(250,250,250,0.16)" />
                          <path d="M0 0 L100 100 M0 100 L100 0" stroke="rgba(250,250,250,0.75)" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
                        </svg>
                        {/* (two spans, not a list: the React compiler refuses a drag begun from a callback nested this deep) */}
                        {grab && <span role="slider" tabIndex={-1} aria-label={`${sound ? 'Cross-fade' : 'Dissolve'} length, left edge`} aria-valuenow={D} title={`${what}. Drag to make it longer or shorter`}
                          data-dissolve-edge="left" onPointerDown={(e) => edgeDown(e, t, dref, D, -1)} className="pointer-events-auto absolute inset-y-0 -left-[3px] w-[6px] cursor-ew-resize transition-colors duration-150 hover:bg-ink/40" />}
                        {grab && <span role="slider" tabIndex={-1} aria-label={`${sound ? 'Cross-fade' : 'Dissolve'} length, right edge`} aria-valuenow={D} title={`${what}. Drag to make it longer or shorter`}
                          data-dissolve-edge="right" onPointerDown={(e) => edgeDown(e, t, dref, D, 1)} className="pointer-events-auto absolute inset-y-0 -right-[3px] w-[6px] cursor-ew-resize transition-colors duration-150 hover:bg-ink/40" />}
                        {dd && dd.moved && <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg">{D} f{D >= dd.max ? ' · longest that fits' : ''}</span>}
                      </span>
                    );
                  })}
                  {(drag?.kind === 'head' || drag?.kind === 'tail') && drag.alone && drag.moved && drag.ref.trackId === t.id && (() => {
                    // an edge trimmed alone: what it is doing, in the join's style ("sound alone · → 18 f · end of the file")
                    const c = t.clips.find((x) => x.id === drag.ref.clipId);
                    if (!c) return null;
                    const x = (drag.kind === 'head' ? startF(c, fps) : endF(c, fps)) + drag.d;
                    return (
                      <span data-alone-tag="" className="pointer-events-none absolute bottom-[5px] z-[6] -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg animate-in fade-in-0 duration-150"
                        style={{ left: x * z }}>
                        {t.kind === 'video' ? 'picture' : 'sound'} alone · {drag.d === 0 ? '0 f' : `${drag.d > 0 ? '→' : '←'} ${Math.abs(drag.d)} f`}{drag.why ? ` · ${drag.why}` : ''}
                      </span>
                    );
                  })()}
                  {(drag?.kind === 'head' || drag?.kind === 'tail') && !drag.alone && drag.moved && drag.why && drag.ref.trackId === t.id && (() => {
                    // a trim held at its shot's first or last frame: the edge stops, and says why
                    const c = t.clips.find((x) => x.id === drag.ref.clipId);
                    if (!c) return null;
                    const x = (drag.kind === 'head' ? startF(c, fps) : endF(c, fps)) + drag.d;
                    return (
                      <span data-stop-tag="" className="pointer-events-none absolute bottom-[5px] z-[6] -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg animate-in fade-in-0 duration-150"
                        style={{ left: x * z }}>
                        {drag.d === 0 ? '0 f' : `${drag.d > 0 ? '→' : '←'} ${Math.abs(drag.d)} f`} · {drag.why}
                      </span>
                    );
                  })()}
                  {drag?.kind === 'move' && drag.group && drag.why && drag.to === t.id && (() => {
                    // several clips dragged onto a track where they cannot all go: none moves, and the row says why
                    const c = clipOf(drag.ref);
                    if (!c) return null;
                    return (
                      <span data-move-tag="" className="pointer-events-none absolute bottom-[5px] z-[6] whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg animate-in fade-in-0 duration-150"
                        style={{ left: startF(c, fps) * z }}>
                        {drag.why}
                      </span>
                    );
                  })()}
                  {drag?.kind === 'roll' && drag.moved && drag.left.trackId === t.id && (
                    // how far the join has moved and, at a limit, why it stops there (matches the fade tag)
                    <span data-join-tag="" className="pointer-events-none absolute bottom-[5px] z-[6] -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 text-[10.5px] font-medium leading-4 text-bg animate-in fade-in-0 duration-150"
                      style={{ left: (drag.j + drag.d) * z }}>
                      {drag.d === 0 ? '0 f' : `${drag.d > 0 ? '→' : '←'} ${Math.abs(drag.d)} f`}{drag.why ? ` · ${drag.why}` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <AddTrack tl={tl} disabled={readOnly} onEdit={onEdit} />
          {drag?.kind === 'box' && drag.moved && (
            // in the content, under the names column and the ruler, so it slides under them as the timeline scrolls;
            // its tag says what letting go does (+ adds, − takes out), the colours fading as the keys change
            <span aria-hidden="true" data-box={drag.mode}
              className={cn('pointer-events-none absolute z-[5] rounded-[3px] border transition-[border-color,background-color] duration-150 ease-out',
                drag.mode === 'remove' ? 'border-bad/80 bg-bad/[0.12]' : 'border-ink/70 bg-white/[0.07]')}
              style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }}>
              <span className={cn('absolute -top-px left-[-1px] flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-ink px-1 font-mono text-[11px] font-medium leading-none text-bg transition-opacity duration-150 ease-out', drag.mode === 'add' ? 'opacity-100' : 'opacity-0')}>+</span>
              <span className={cn('absolute -top-px left-[-1px] flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-bad px-1 font-mono text-[11px] font-medium leading-none text-bg transition-opacity duration-150 ease-out', drag.mode === 'remove' ? 'opacity-100' : 'opacity-0')}>−</span>
            </span>
          )}
          {/* the playhead: under the names column (z 6) and the ruler (z 8), so it slides behind them when the lanes scroll */}
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 top-8 z-[5] w-px bg-ink" style={{ left: HEAD + playX }} />
          {dropShown && (
            // the lane a dragged file would land on, and where it would start (fading in)
            <span aria-hidden="true" data-drop={`${dropShown.trackId}:${dropShown.f}`} className="pointer-events-none absolute z-[4] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(250,250,250,0.35)] transition-[top] duration-150 ease-out animate-in fade-in-0"
              style={{ left: HEAD, top: dropShown.top, height: dropShown.h, width: laneW }}>
              <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: dropShown.f * z }} />
              <span className="absolute top-0.5 ml-1 rounded-[4px] bg-ink px-1 font-mono text-[10.5px] text-bg" style={{ left: dropShown.f * z }}>{smpte(dropShown.f / fps, fps)}</span>
            </span>
          )}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">{drag?.kind === 'roll' && drag.moved ? `join moved ${drag.d} frames${drag.why ? `, ${drag.why}` : ''}` : isMove(drag) && drag.moved ? `${drag.kind} ${drag.d} frames` : drag && (drag.kind === 'fadeIn' || drag.kind === 'fadeOut') && drag.moved ? `${drag.kind === 'fadeIn' ? 'fade in' : 'fade out'} ${drag.f} frames` : ''}</span>
    </div>
  );
}


function TrackHead({ t, tl, onEdit, disabled, solo, onSolo, pasteHere, onPasteTo, onMenu, renaming, onRenamed, onPress }: { t: TimelineTrack; tl: Timeline; onEdit: (e: Edit | undefined) => void; disabled?: boolean; solo?: Set<string>; onSolo?: (trackId: string) => void; pasteHere?: boolean; onPasteTo?: (trackId: string) => void;
  onMenu?: (m: { x: number; y: number; trackId: string }) => void; renaming?: boolean; onRenamed?: (trackId: string, name: string | undefined) => void; onPress?: (trackId: string, k: 'muted' | 'locked') => void }) {
  // M and the lock take effect at once and are saved by the page as one version when the presses rest (13 Nov)
  const toggle = (k: 'muted' | 'solo' | 'locked', word: string) =>
    k !== 'solo' && onPress ? onPress(t.id, k) : onEdit(patchTrack(tl, t.id, { [k]: !t[k] }, `${t[k] ? 'un' : ''}${word} ${t.id}`));
  const btn = (k: 'muted' | 'solo' | 'locked', letter: React.ReactNode, word: string, label: string) => (
    <button type="button" disabled={disabled} aria-pressed={!!t[k]} aria-label={`${label} ${t.id}`} title={`${label} ${t.id}`} onClick={() => toggle(k, word)}
      className={cn('flex size-4 flex-none cursor-pointer items-center justify-center rounded-[4px] border font-mono text-[9px] font-medium transition-colors duration-150 disabled:cursor-default', t[k] ? 'border-ink bg-ink text-bg' : 'border-edge-strong text-sub hover:text-ink')}>
      {letter}
    </button>
  );
  return (
    // a right-click anywhere in the cell, its buttons included, opens the track menu (the user, 13 Nov)
    <div className="sticky left-0 z-[6] box-border flex w-[150px] flex-none items-center gap-1 border-r border-line bg-hdr pl-2.5 pr-1.5"
      onContextMenu={(e) => { if (!onMenu) return; e.preventDefault(); e.stopPropagation(); onMenu({ x: e.clientX, y: e.clientY, trackId: t.id }); }}>
      {onPasteTo && t.kind !== 'captions' ? (
        // the paste track (the user, 13 Nov): the marked one takes what Command-V pastes, one for picture, one for sound
        <button type="button" aria-pressed={!!pasteHere} aria-label={`Paste goes to ${t.id} ${t.name}`} onClick={() => onPasteTo(t.id)}
          title={pasteHere ? `Paste goes here: a copied ${t.kind === 'video' ? 'picture' : 'sound'} lands on ${t.id} ${t.name} at the playhead (⌘V)` : `Make ${t.id} ${t.name} the track a copied ${t.kind === 'video' ? 'picture' : 'sound'} is pasted on`}
          className={cn('-ml-1 flex h-[18px] w-[24px] flex-none cursor-pointer items-center justify-center rounded-[5px] border font-mono text-[11px] font-medium transition-colors duration-150', pasteHere ? 'border-ink bg-ink text-bg' : 'border-transparent text-ink hover:border-edge-strong')}>
          {t.id}
        </button>
      ) : <span className="w-[20px] flex-none font-mono text-[11px] font-medium text-ink">{t.id}</span>}
      {renaming ? <RenameField name={t.name} id={t.id} onDone={(name) => onRenamed?.(t.id, name)} />
        : <span title={t.name} className={cn('min-w-0 flex-1 truncate text-[12px]', t.muted ? 'text-mute' : 'text-ink-3')}>{t.name}</span>}
      {btn('muted', 'M', 'muted', 'Mute')}
      {onSolo && t.kind === 'audio' ? (
        // heard alone while the page is open; a solo saved in the cut (an older version's) is cleared by the same button
        <button type="button" aria-pressed={!!solo?.has(t.id) || !!t.solo} aria-label={`Hear only ${t.name}`} title={`Hear only ${t.name}. A way of listening: nothing is saved.`}
          onClick={() => { if (t.solo) toggle('solo', 'soloed'); else onSolo(t.id); }}
          className={cn('flex size-4 flex-none cursor-pointer items-center justify-center rounded-[4px] border font-mono text-[9px] font-medium transition-colors duration-150', solo?.has(t.id) || t.solo ? 'border-ink bg-ink text-bg' : 'border-edge-strong text-sub hover:text-ink')}>
          S
        </button>
      ) : btn('solo', 'S', 'soloed', 'Solo')}
      {btn('locked', <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>, 'locked', 'Lock')}
    </div>
  );
}

/** The name cell's text field for a new name: Enter or a click elsewhere saves, Escape leaves the name as it was. */
function RenameField({ name, id, onDone }: { name: string; id: string; onDone: (name: string | undefined) => void }) {
  const [v, setV] = useState(name);
  const done = useRef(false);
  const finish = (n: string | undefined) => { if (done.current) return; done.current = true; onDone(n); };
  return (
    <input autoFocus value={v} maxLength={40} aria-label={`New name for ${id}`} spellCheck={false}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(v); } else if (e.key === 'Escape') { e.preventDefault(); finish(undefined); } }}
      onBlur={() => finish(v)}
      className="h-[20px] w-0 min-w-0 line-in flex-1 rounded-[4px] border border-sub bg-bg px-1 text-[12px] text-ink outline-none" />
  );
}

function AddTrack({ tl, onEdit, disabled }: { tl: Timeline; onEdit: (e: Edit | undefined) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-10">
      <div className="sticky left-0 z-[6] flex w-[150px] flex-none items-center gap-1 border-r border-line bg-hdr px-2.5">
        {!open ? (
          <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-sub hover:text-ink disabled:cursor-default disabled:opacity-50">
            <span aria-hidden="true">+</span> Add track
          </button>
        ) : (
          <>
            <button type="button" onClick={() => { setOpen(false); onEdit(addTrack(tl, 'video')); }} className="h-6 cursor-pointer rounded-[5px] border border-edge-strong px-2 text-[11.5px] text-ink hover:bg-raised">Video</button>
            <button type="button" onClick={() => { setOpen(false); onEdit(addTrack(tl, 'audio')); }} className="h-6 cursor-pointer rounded-[5px] border border-edge-strong px-2 text-[11.5px] text-ink hover:bg-raised">Audio</button>
            <button type="button" aria-label="Cancel" onClick={() => setOpen(false)} className="h-6 cursor-pointer px-1 text-[11.5px] text-mute hover:text-ink">×</button>
          </>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}
