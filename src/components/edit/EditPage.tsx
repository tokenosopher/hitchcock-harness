'use client';
// Edit (stage 9): the harness's own track view, which replaces Resolve for basic editing. The user is the editor here: every change is one step of the
// working cut's history, kept at once and never numbered (14 Nov, stage 2 of "saving apart from history"); ⌘S or Save
// keeps it as a version, and a render saves one by itself first (useCut.ts ensureSaved). Nothing is rendered by itself
// (ASKS 44: the player plays the cut live, the 480p is made when asked for in Renders); nothing is prefilled except
// "Ask Alma" and the phone's note at a timecode.
// The page's identity for a state is the working cut's `w<rev>` (tl.version); a version's name is `cut.newest`,
// `cut.equals` (a version with the same content) or `cut.ref` (equals, else newest): those, never `w<rev>`, go to
// anything that reads version numbers.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FilmState, Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePage, useUIActions } from '@/components/data/ui';
import { useFilm } from '@/components/data/film';
import { fmtDate, repoPath, smpte } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { editRecipePath, qcEntry, qcSpec } from '@/components/lib/qc';
import { Badge, Btn } from '@/components/shell/atoms';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlay } from '@/components/shell/icons';
import { ToConfirm } from '@/components/pages/postCommon';
import { useIsPhone } from '@/components/shell/useIsPhone';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { Inspector } from './Inspector';
import { Tracks, type Tool } from './Tracks';
import { Viewer } from './Viewer';
import { MasterSwitch, useFullView } from './MasterSwitch';
import { clipMarks, picturePieces, pictureMade, scaledUpWords, type FullInfo } from './fullsize';
import { checkTakes, FullBar, SeedanceMarksLink, seedanceAsk, upscaleAsk, UpscaleCheck, useSeedanceMarks, type CheckShot } from './UpscaleCheck';
import { useJson } from '@/components/pages/postCommon';
import { useCut, useRendersLive, type RendersStore, type SaveNote, type VersionInfo, type VersionNames } from './useCut';
import type { SaveWhy } from './history';
import { FilmStrip, PicksBox, ShotGrid, SourceShot, useShots, type Trying } from './ShotViews';
import { EffectOptions, dirOf, isSoundFile, useOptions, type SoundOption } from './Options';
import { ContextMenu, type MenuItem } from './Menu';
import { FilesPanel, adoptUpload, useFilmFiles, type FilmFile } from './Files';
import { RendersButton } from './Renders';
import { ProxyPill } from './ProxyPill';
import { MasterButton, RendersTab } from './RendersTab';
import { gapsOf, leftInputOf, masterStaleOf } from './leftInput';
import { HistoryPanel } from './HistoryPanel';
import { VersionsMenu } from './VersionsMenu';
import { RenderPlayer } from './RenderPlayer';
import { playTag, type RenderRow } from './renderList';
import { useDrawCount } from './drawCount';
import { fileFrames, placeFile, replaceFile, trackForFile } from './placeFile';
import { inFilm, mainTracks, picksWords, putShot, sceneAnchor, sceneOrder, sceneOf, sceneRuns, shotClips, shotNo, shotOf, shotsOf, shotTimeline, takeNames, takeOutScene, takeOutShot, withPicks, type SceneRun, type TakeShots } from './shots';
import {
  addMarker, clipName, deleteClip, deleteTrack, deleteEmptyTracks, emptyTracks, moveTrack, renameTrack, whyNotDeleteTrack, whyNotMoveTrack, deleteClips, groupDelta, moveClips, withPartners, canMoveToTrack, moveToTrack, optionWindow, swapSound, endF, findClip, lenF, partnerOf, pictureAt, retimeClips, sameEdit, setLinked, speedOf, splitClip, startF, tidyOverlaps, toF, totalF, trimClip,
  carryPlan, carrySound, relinkSound, takeRefusal, lockedWhy, pasteClips, type ClipRef, type Copied, type Edit,
} from './model';
import { dissolvePlan, maxDissolveF, pressWords, removeGainPoint, saveStatus, setDissolve, setFlip, setSoundDissolve, soundJoin, stepTitle, stepUndoLine, tidyDissolves, withPresses, type Presses } from './controls';
import { isLine, isSrtClip } from './subs';
import { hasSubtitles, placeSrt, splitSrt } from './subsEdit';
import { downloadSrt, fetchSrt, SubtitleOverlay, subtitlesAsk } from './Subtitles';
import { leftChip, leftWords, NEXT_TAB, soundCounts, subsCounts, unreadableSplit, waitWords, whatIsLeft, type LeftDo, type LeftStep } from './left';
import { WaitingCount } from '@/components/flow/WaitingNow';
import { LeftTab, useLeft } from './LeftTab';
import { hasPlanned, isFirstPart, plannedCounts, retakeWords, sceneOfClip, shotSpan, PLANNED_RENDER_WHY } from './planned';
import { earlySteps, goTakesAsk, makingScenes } from './early';
import { leftInputBefore } from './leftInput';
import { usePlan } from './usePlan';
import { PlannedView } from './PlannedView';
import { BoardsBack, EmptyCard, PlannedTakes } from './PlannedTakes';
import { useSendAsUser } from '@/components/release/AskAlma';
import { usePhoneFull } from './phoneFull';
import { useEditRefSource } from './refSource';

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** The page keeps the source lengths it knows so a trim or a moved join stops at the file's end: each file of
 *  the cut as the server measured it (every kind: takes, music, effects), else the scene takes' seconds. */
function useSourceSeconds(state: FilmState | undefined, cutLengths: (src: string) => number | undefined) {
  const map = useMemo(() => {
    const m = new Map<string, number>();
    if (!state) return m;
    for (const sc of state.scenes) for (const t of sc.takes) if (t.path && t.seconds) m.set(repoPath(state.film.folder, state.film.repo, t.path), t.seconds);
    return m;
  }, [state]);
  return useCallback((src?: string) => (src === undefined ? undefined : cutLengths(src) ?? map.get(src)), [map, cutLengths]);
}

/** The copied clips, each with the track it came from (F4: every selected clip and its linked picture or sound). */
interface Held { items: Copied[] }
/** What the tab kept: today's list, or one clip as an older page kept it. */
const heldOf = (x: unknown): Held | undefined => {
  const h = x as Partial<Held & Copied> | null;
  if (h && Array.isArray(h.items) && h.items.length) return { items: h.items };
  if (h && h.clip && h.kind && h.trackId) return { items: [{ clip: h.clip, kind: h.kind, trackId: h.trackId }] };
  return undefined;
};

/** The tabs under the timeline, and the words `?tab=` takes for each (15 Nov: the film board opens What's next). */
type LowerTab = 'left' | 'takes' | 'upscale' | 'renders' | 'history';
const TAB_OF: Record<string, LowerTab> = { next: 'left', left: 'left', takes: 'takes', upscale: 'upscale', renders: 'renders', history: 'history' };

/** The timeline of a film with no cut yet (no script, or the first cut being made from it): its two tracks, nothing on
 *  them (the timeline from day one, 15 Nov). Read only: nothing can be put on it by hand. */
const EMPTY_TL: Timeline = { version: 'w0', fps: 24, width: 1080, height: 1920, at: '1970-01-01T00:00:00.000Z', markers: [],
  tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: [] }, { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] }] };

/** What a timeline from day one holds, in words: "18 lines", "34 planned shots", "3 scenes from takes, 41 shots, 107
 *  boards" (every storyboard panel is a board of its own, so the shots and the boards are both said, to be
 *  checked against the storyboards). */
function plannedSaid(tl: Timeline): string {
  const pc = plannedCounts(tl);
  const shots = pc.boardShots + pc.shots;
  return [pc.takes ? `${pc.takes} ${pc.takes === 1 ? 'scene' : 'scenes'} from takes` : '',
    pc.boards ? `${shots} ${shots === 1 ? 'shot' : 'shots'}, ${pc.boards} ${pc.boards === 1 ? 'board' : 'boards'}${pc.shots ? ` (${pc.shots} with no board yet)` : ''}` : pc.shots ? `${pc.shots} planned ${pc.shots === 1 ? 'shot' : 'shots'}` : '',
    !pc.shots && !pc.boards ? `${pc.lines} ${pc.lines === 1 ? 'line' : 'lines'}` : ''].filter(Boolean).join(', ');
}

/** A new number for each click that starts a shot from its take again (SourceShot replays when it changes). */
let kSeq = 0;
const nextK = () => ++kSeq;

export function EditPage() {
  // Not useFilmPage: this page only writes to the UI state (the pinned chip, the playhead, a prefill) and does not read
  // Alma's thread, so it reads neither. Each change of the pinned chip (it names the version) used to draw the whole
  // page again, the timeline included, right after every edit and every undo (F15).
  const film = useParams<{ film: string }>().film;
  const { state, error } = useFilm();
  const ui = useUIActions();
  const base = `/films/${film}`;
  const router = useRouter();
  const cut = useCut(film);
  // the timeline from day one (15 Nov): whether the script is locked, the first cut made from it, what the files changed
  const plan = usePlan(film, state?.updatedAt);
  // the go for the first takes, sent as the user's words by a component mounted only while it sends (reading "Alma
  // sees" here would draw the whole page again on every change of the pinned chip, F15)
  const [sending, setSending] = useState<string>();
  const keyName = useKeyName();
  const phone = useIsPhone();
  const params = useSearchParams();
  const [viewing, setViewing] = useState<Timeline>();
  // ?at=<frame> opens the page there (the Scene page's "Open in the edit")
  const [frame, setFrameRaw] = useState(() => Math.max(0, Math.round(Number(params.get('at')) || 0)));
  const [rate, setRate] = useState(0);
  const [sel, setSel] = useState<ClipRef>();
  // the other selected clips (Command-click, Shift-click, a box, Command-A, Y): they hold while `sel`, the one
  // clicked last, is the clip they were gathered around
  const [extra, setExtra] = useState<{ of: string; refs: ClipRef[] }>();
  // the selection moved with the comma and period keys: shown moved at once, saved as one version when the keys rest
  const [nudge, setNudge] = useState<{ d: number; v: string; refs: ClipRef[] }>();
  const [held, setHeld] = useState<Held>();
  // a level point of a sound clip, clicked: Delete removes the point, not the clip (13 Nov)
  const [point, setPoint] = useState<{ trackId: string; clipId: string; i: number }>();
  // the frame after a picture join being moved on the timeline, shown over the player (Tracks onPeek)
  const [peek, setPeek] = useState<{ src: string; t: number }>();
  const [pasteTo, setPasteTo] = useState<{ video?: string; audio?: string }>({});
  // a line in the toolbar that says what just happened ("Copied …") and fades after a few seconds
  // (amber and held longer when it is about a change of Alma's: an undo said whose change it took back, 13 Nov)
  const [said, setSaid] = useState<{ text: string; k: number; amber?: boolean; ms?: number }>();
  const say = useCallback((text: string, o?: { amber?: boolean; ms?: number }) => setSaid({ text, k: Date.now(), ...o }), []);
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(undefined), said.ms ?? 6000); return () => clearTimeout(t); }, [said]);
  useEffect(() => {
    try {
      const h = sessionStorage.getItem(`hh:clipboard:${film}`);
      const p = sessionStorage.getItem(`hh:paste-to:${film}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the tab's storage, which the server render cannot see
      if (h) setHeld(heldOf(JSON.parse(h)));
      if (p) setPasteTo(JSON.parse(p) as { video?: string; audio?: string });
    } catch { /* nothing kept */ }
  }, [film]);
  const markPasteTo = useCallback((trackId: string, kind: 'video' | 'audio') => setPasteTo((cur) => {
    const next = { ...cur, [kind]: cur[kind] === trackId ? undefined : trackId };
    try { sessionStorage.setItem(`hh:paste-to:${film}`, JSON.stringify(next)); } catch { /* this page only */ }
    return next;
  }), [film]);
  const [tool, setTool] = useState<Tool>('select');
  // gaps always close (ASKS 16): a delete or a shorter shot pulls up what follows; R still turns it off
  const [ripple, setRipple] = useState(true);
  const [snap, setSnap] = useState(true);
  const [zoomCmd, setZoomCmd] = useState<{ n: number; dir: 1 | -1 | 0 }>();
  // Enter with one subtitle line selected: its field opens over the block (Tracks)
  const [retypeCmd, setRetypeCmd] = useState<{ n: number; ref: ClipRef }>();

  const [markerText, setMarkerText] = useState<string>();
  // the viewer plays the record's newer cut (FilmState.cut.recordAhead) instead of the timeline
  const [playRecord, setPlayRecord] = useState(false);

  // the film in shots (ASKS 16): every take cut into its shots by the server, the cut's clips split to match
  const shots = useShots(film);
  // the shots of other takes selected in the Takes view (ASKS 52): one a shot column of a scene, in any scenes. While
  // there is any, the film is shown and played with all of them in place (as one shot tried in place used to be);
  // nothing is saved until "Use in the film", which puts them all in as one step
  const [picks, setPicks] = useState<Trying[]>([]);
  // the floating box of the selection folded to a chip
  const [boxFolded, setBoxFolded] = useState(false);
  // the Takes view's right-click menu (ASKS 51): where, and the take and shot (no shot: the take's name)
  const [takeMenu, setTakeMenu] = useState<{ x: number; y: number; src: string; n?: number }>();
  const closeTakeMenu = useCallback(() => setTakeMenu(undefined), []);
  // a shot of a take played from the take's own file (a click in the grid): the film itself is left alone
  const [watching, setWatching] = useState<Trying>();
  const [watchT, setWatchT] = useState(0);
  // the scene the takes grid keeps open while the playhead stays where it was put (or, after a shot was put back,
  // while it plays the lead-in and the shot): after a shot or a scene is taken out (the picture there is now the
  // next one), for a scene with no clip in the cut, and through a ⌘Z of either (13 Nov)
  const [pin, setPin] = useState<{ scene: string; from: number; to: number }>();
  // an option of the selected effect put in its place for listening; the passage stops by itself at `stopAt`
  const [hearing, setHearing] = useState<{ ref: ClipRef; src: string }>();
  const stopAt = useRef<number | undefined>(undefined);
  // the timeline's right-click menu: where it opened and what was under the pointer
  const [menu, setMenu] = useState<{ x: number; y: number; frame: number; trackId?: string; clipId?: string }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  // the track menu: a right-click on a track's name cell (13 Nov: "delete, move up, and move down")
  const [headMenu, setHeadMenu] = useState<{ x: number; y: number; trackId: string }>();
  const closeHeadMenu = useCallback(() => setHeadMenu(undefined), []);
  const [renaming, setRenaming] = useState<string>();
  // the player full screen (13 Nov: "see the video that is composed from all of the bits full screen"): the
  // picture's own box goes full screen, so the same player keeps playing; its controls show while the pointer moves
  const stage = useRef<HTMLDivElement>(null);
  // the 1080p view's shot starts, for the up and down keys (set from the check list below)
  const checkStarts = useRef<number[]>([]);
  const [full, setFull] = useState(false);
  const [ctl, setCtl] = useState(true);
  const ctlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useCallback(() => { setCtl(true); if (ctlTimer.current) clearTimeout(ctlTimer.current); ctlTimer.current = setTimeout(() => setCtl(false), 2400); }, []);
  const toggleFull = useCallback(() => {
    const el = stage.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) { if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined); else doc.webkitExitFullscreen?.(); return; }
    if (!el) return;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined); else el.webkitRequestFullscreen?.();
  }, []);
  useEffect(() => {
    const h = () => { const on = !!(document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement); setFull(on); if (on) wake(); };
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => { document.removeEventListener('fullscreenchange', h); document.removeEventListener('webkitfullscreenchange', h); if (ctlTimer.current) clearTimeout(ctlTimer.current); };
  }, [wake]);
  const [focus, setFocus] = useState<{ n: number; from: number; to: number }>();
  const [details, setDetails] = useState(false);
  // the tracks heard alone (S): a way of listening, never a version; the player then mixes the tracks itself
  const [soloed, setSoloed] = useState<Set<string>>(() => new Set());
  const toggleSolo = useCallback((id: string) => setSoloed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  // the M and lock buttons pressed in a row (the owner once pressed M eight times in a minute: eight versions, eight
  // renders): shown and heard at once, saved as one version when the presses rest, nothing when they cancel out
  const [press, setPress] = useState<{ v: string; p: Presses }>();
  const saved = cut.current;
  const pressOn = press && !viewing && saved && press.v === saved.version ? press : undefined;
  const pressedTl = useMemo(() => (saved ? withPresses(saved, pressOn?.p) : undefined), [saved, pressOn]);
  // no cut yet (no script, or the first cut being made from it): the page's own frame with nothing on its tracks
  const empty = cut.mode === 'none';
  const rawTl = viewing ?? pressedTl ?? (empty ? EMPTY_TL : undefined);
  const tl = useMemo(() => (rawTl ? shotTimeline(rawTl, shots.by) : undefined), [rawTl, shots.by]);
  // the 1080p view (ASKS 37): the full-size pictures on disk, and the switch on the player
  const { data: fullInfo } = useJson<FullInfo>(`/api/films/${film}/full`, state?.updatedAt);
  const sw = useFullView(film, fullInfo, viewing?.version ?? cut.ref, cut.view);
  const seedance = useSeedanceMarks(film, fullInfo, state?.updatedAt);
  // holding C in the 1080p view shows the 480p of the same frame, for as long as it is held (what the upscale changed)
  const [peek480, setPeek480] = useState(false);
  // the lower panel, in the user's order (14 Nov): the takes grid, What's next (ASKS 47; the key stays 'left'), the
  // upscale check (in the 1080p view), the renders, the history (15 Nov, a permanent fifth tab). `?tab=` opens the page
  // on one (the film board's "Open the timeline" asks for What's next): read once, as the first state, so it adds no
  // draw and nothing moves
  const [lowerTab, setLowerTab] = useState<LowerTab>(() => TAB_OF[params.get('tab') ?? ''] ?? 'takes');
  // a rendered file in the player (the Renders tab, 14 Nov): its own picture and sound, the playhead on its time. Any
  // change to the cut goes back to the live timeline first. `follow` brings a render just asked for into view.
  const [renderOn, setRenderOn] = useState<RenderRow>();
  const [follow, setFollow] = useState(0);
  useDrawCount('EditPage');
  const openRenders = useCallback((started?: boolean) => { setLowerTab('renders'); if (started) setFollow((n) => n + 1); }, []);
  // the tab in the address (`?tab=`), so a reload or a link lands on the tab the page was on (QC round two); the
  // first tab, Takes, keeps the address bare
  const tabWas = useRef(lowerTab);
  useEffect(() => {
    if (tabWas.current === lowerTab) return;
    tabWas.current = lowerTab;
    const u = new URL(window.location.href);
    if (lowerTab === 'takes') u.searchParams.delete('tab'); else u.searchParams.set('tab', lowerTab === 'left' ? 'next' : lowerTab);
    if (u.href !== window.location.href) window.history.replaceState(window.history.state, '', u.href);
  }, [lowerTab]);
  useEffect(() => {
    if (!sw.on) return;
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const down = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && !typing(e)) setPeek480(true); };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'c') setPeek480(false); };
    const off = () => setPeek480(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', off); };
  }, [sw.on]);
  // Undo and redo are the history's (stage 2, 14 Nov): the steps before the pointer can be undone, those after it
  // redone; nothing is written but the pointer, and the history survives a reload. Alma's changes are steps like the
  // user's, so they can be undone too. `undo` and `redo` list the steps' words, the next one last (as the stacks did).
  const hist = cut.history;
  const { undo, redo } = useMemo(() => {
    if (!hist) return { undo: [] as string[], redo: [] as string[] };
    return { undo: hist.steps.slice(1, hist.at + 1).map((s) => s.words), redo: hist.steps.slice(hist.at + 1).map((s) => s.words).reverse() };
  }, [hist]);
  const undoStep = hist?.undo, redoStep = hist?.redo;
  // why each version was saved, from the step that saved it (the History tab and the Versions menu say "saved for a
  // render"); the Inspector reads the steps up to the cut now for a clip's own history (stage 3b)
  const savedWhy = useMemo(() => new Map<string, SaveWhy | undefined>((hist?.steps ?? []).filter((x) => x.saved).map((x) => [x.saved!, x.why])), [hist]);
  const inspectorSteps = useMemo(() => (hist ? hist.steps.slice(0, hist.at + 1) : []), [hist]);
  // a film whose script is locked and that has no cut yet: the page's first read makes the first cut from the script (one
  // version, the app's own; never again by itself while the page is open)
  const [seeding, setSeeding] = useState<{ error?: string }>();
  const [planBusy, setPlanBusy] = useState(false);
  const asked = useRef(false);
  const planFirst = !!plan.data?.locked && !!plan.data.first;
  const reloadCut = cut.reload;
  const planUpdate = plan.update;
  useEffect(() => {
    if (!empty || !planFirst || asked.current) return;
    asked.current = true;
    void planUpdate().then((r) => { setSeeding(r.ok ? undefined : { error: r.error }); if (r.ok) void reloadCut(); });
  }, [empty, planFirst, planUpdate, reloadCut]);
  // a cut that still holds planned clips (lines, planned shots, boards) is not rendered (render.ts refuses it)
  const planned = useMemo(() => hasPlanned(tl), [tl]);
  // the version the cut is shown as: the one being viewed, else the one the cut equals, else the newest (with edits)
  const cutName = viewing?.version ?? cut.ref ?? '';
  // the cut as Alma's asks name it: a saved version, or the working cut she reads (cut/working.json)
  const almaCut = viewing?.version ?? cut.equals ?? 'working (cut/working.json)';
  // the same for the asks that say "cut <name>" themselves (the subtitles): a version, else "the cut"
  const almaName = viewing?.version ?? cut.equals ?? 'working';
  // a version's name, in files this page writes to the device (a frame, an .srt)
  const fileTag = viewing?.version ?? cut.equals ?? 'working';
  // the line under the header (the screens SaveEdited, SaveVersion, SaveRender, SaveUndone): where the cut stands
  // against the saved versions, and where the history's pointer is
  const status = useMemo(() => (hist ? saveStatus({
    newest: cut.newest, equals: cut.equals, edited: cut.edited, since: hist.since, redo: hist.steps.length - 1 - hist.at, now: hist.steps[hist.at],
    saved: cut.lastSave, notice: cut.notice,
  }) : undefined), [hist, cut.newest, cut.equals, cut.edited, cut.lastSave, cut.notice]);
  const names = useMemo(() => takeNames(shots.takes, rawTl), [shots.takes, rawTl]);
  /** The cut with every selected shot in its place: the tracks and the viewer show it; nothing is saved. */
  const tryEdit = useMemo(() => (tl && picks.length ? withPicks(tl, picks, shots.by, names, 'try') : undefined), [tl, picks, shots.by, names]);
  // the options of an effect (13 Nov): the other tries kept in the folder of the clip's file. One of them can
  // sit in the effect's place for listening; the film is not changed until it is used.
  const options = useOptions(film, rawTl);
  const selAt = tl && sel ? findClip(tl, sel) : undefined;
  const pointOn = point && sel && sel.trackId === point.trackId && sel.clipId === point.clipId && selAt?.clip.gainPoints?.[point.i] ? point : undefined;
  const selKey = sel ? `${sel.trackId}:${sel.clipId}` : undefined;
  const group = useMemo(() => {
    if (!tl || !sel || !findClip(tl, sel)) return [] as ClipRef[];
    return [sel, ...(extra && extra.of === selKey ? extra.refs.filter((r) => findClip(tl, r)) : [])];
  }, [tl, sel, extra, selKey]);
  const nudgeOn = nudge && tl && nudge.v === tl.version && nudge.d ? nudge : undefined;
  const nudgeIds = useMemo(() => (nudgeOn && tl ? new Set(withPartners(tl, nudgeOn.refs).map((r) => r.clipId)) : undefined), [nudgeOn, tl]);
  const selOptions = selAt && selAt.track.kind === 'audio' && isSoundFile(selAt.clip.src) ? options.get(dirOf(selAt.clip.src)) : undefined;
  const hearingOn = hearing && sel && sel.trackId === hearing.ref.trackId && sel.clipId === hearing.ref.clipId ? hearing : undefined;
  const heardOption = hearingOn ? selOptions?.find((o) => o.src === hearingOn.src) : undefined;
  const filmOption = selAt ? selOptions?.find((o) => o.src === selAt.clip.src || o.files.includes((selAt.clip.src ?? ''))) : undefined;
  const heardSrc = hearingOn?.src, hearTrack = hearingOn?.ref.trackId, hearClip = hearingOn?.ref.clipId;
  /** The cut with the heard option in the effect's place: the tracks and the player use it; nothing is saved. */
  const hearEdit = useMemo(() => {
    if (!tl || !heardSrc || !hearTrack || !hearClip) return undefined;
    const ref = { trackId: hearTrack, clipId: hearClip };
    const f = findClip(tl, ref);
    const opts = f ? options.get(dirOf(f.clip.src)) : undefined;
    const o = opts?.find((x) => x.src === heardSrc);
    return f && o ? swapSound(tl, ref, o, opts?.find((x) => x.src === f.clip.src || x.files.includes((f.clip.src ?? '')))?.name) : undefined;
  }, [tl, options, heardSrc, hearTrack, hearClip]);
  const shown = tryEdit?.tl ?? hearEdit?.tl ?? tl;
  const runs = useMemo(() => (shown ? sceneRuns(shown, shots.by) : []), [shown, shots.by]);
  const tryIds = useMemo(() => (tryEdit ? new Set(tryEdit.ids.flatMap((id) => [id, `${id}a`])) : hearEdit && hearClip ? new Set([hearClip]) : undefined), [tryEdit, hearEdit, hearClip]);
  // the 1080p view (ASKS 37): where each stretch's full-size picture comes from, each shot's mark, the check list
  // (shots selected in the Takes view keep the full-size bar and the Upscale tab where they are, so nothing under them
  // moves (ASKS 52); the player itself plays the takes then, as a try always did)
  const fullFor = !hearEdit ? sw.full : undefined;
  const fullPieces = useMemo(() => (fullFor && tl ? picturePieces(tl, fullFor.info, fullFor.base) : undefined), [fullFor, tl]);
  const fullMarks = useMemo(() => (fullPieces ? clipMarks(fullPieces) : undefined), [fullPieces]);
  const check = useMemo(() => (fullPieces && fullFor && tl ? checkTakes(tl, fullPieces, shots.by, names, fullFor.info) : undefined), [fullPieces, fullFor, tl, shots.by, names]);
  // before a master (14 Nov): it is made from the same pieces, so the page knows what it would scale up from 480p
  const currentVersion = cut.current?.version;
  const masterNow = useMemo(() => {
    const src = sw.sources;
    if (!src || !tl || tl.version !== currentVersion) return undefined;
    const pieces = picturePieces(tl, src.info, src.base);
    return { pieces, made: pictureMade(pieces, src.base?.b), times: src.info.times };
  }, [sw.sources, tl, currentVersion]);
  const masterHint = useMemo(() => (masterNow ? scaledUpWords(masterNow.made) : undefined), [masterNow]);
  // the master there, when it is out of date (14 Nov, masters.ts): what it recorded (the render's own state, else the
  // version file's record of that very file) against what a master would be made from now
  const masterDone = cut.renders.master?.state === 'done' ? cut.renders.master : undefined;
  const masterRec = cut.refRenders?.master;
  const cutRef = cut.ref;
  const masterStale = useMemo(() => masterStaleOf(masterNow, masterDone, masterRec, cutRef), [masterNow, masterDone, masterRec, cutRef]);
  useEffect(() => { checkStarts.current = check?.shots.map((s) => s.from) ?? []; }, [check]);
  // What's next (14 Nov, ASKS 47): read from what the page has, plus the route's ticks, record, masters and release
  // file (read once and on the film watcher's change; set only when it changed, so no draw is added)
  const filmMaster = state?.master?.version;
  const left = useLeft(film, state?.updatedAt, filmMaster);
  // how many things wait for the user ("Waiting for you"'s count), shown on What's next's tab
  const [waitingN, setWaitingN] = useState(0);
  // the film watcher saw a change (Alma's step, a version file written by hand, another tab): read the working cut
  // again when the server's is ahead of the page's (useCut followServer; nothing is drawn when nothing changed)
  const followCut = cut.followServer;
  const updatedAt = state?.updatedAt;
  useEffect(() => { if (updatedAt) void followCut(); }, [updatedAt, followCut]);
  const leftTl = tl && tl.version === currentVersion ? tl : cut.current;
  const versionList = useMemo(() => cut.versions.map((v) => v.version), [cut.versions]);
  const masterState = cut.renders.master?.state;
  // the cut of each render the page judges (the newest master's, the final's) against the cut now, by what the
  // render reads and not by the version number (ASKS 49, sameCut.ts): undefined for a version the route did not send
  const gapOf = useMemo(() => gapsOf(left.data?.cuts, leftTl), [left.data, leftTl]);
  const cutEdited = cut.edited && !cut.equals;
  // What's next's input, built by the same code as the film board's list (leftInput.ts), so the two never drift; the
  // history lets "n changes since" count steps (stage 3b, 15 Nov)
  // the six early steps from the script on (15 Nov), read from the film's state and the cut on screen, as the board does
  const making = useMemo(() => new Set(state ? makingScenes(state) : []), [state]);
  const early = useMemo(() => (state ? earlySteps(state, empty ? undefined : leftTl ?? undefined) : undefined), [state, leftTl, empty]);
  const leftInput = useMemo(() => (empty && early ? leftInputBefore(early, left.data) : leftInputOf({
    tl: leftTl, ref: cutRef, edited: cutEdited, versions: versionList, data: left.data, filmMaster, masterNow, marks: seedance.marks,
    hasFull: sw.has, masterState, masterStale: masterStale?.reason, gapOf, history: hist, early,
  })), [empty, early, leftTl, cutRef, cutEdited, versionList, left.data, filmMaster, masterNow, seedance.marks, sw.has, masterState, masterStale, gapOf, hist]);
  const leftView = useMemo(() => (leftInput ? whatIsLeft(leftInput) : undefined), [leftInput]);
  // what was made from each version, for the Versions menu's marks and the History tab's words
  const ld = left.data;
  const marks = useMemo(() => ({ approved: ld?.approved?.version, masters: new Set([ld?.newestMaster, filmMaster].filter((v): v is string => !!v)), final: ld?.release?.final?.version }), [ld, filmMaster]);
  const fps = tl?.fps ?? state?.cut?.fps ?? 24;
  const total = shown ? totalF(shown) : 0;
  const setFrame = useCallback((f: number) => setFrameRaw(Math.max(0, Math.min(total || Infinity, Math.round(f)))), [total]);
  // the film got shorter (a delete, a trim, a speed-up, a shot taken out, an undo or a redo): the playhead stays inside
  // it, on its end, and never in empty lane after the last frame (F6)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the film's length, which every edit can change
  useEffect(() => { if (total > 0 && frame > total) setFrameRaw(total); }, [total, frame]);
  // the film's files that can go on the timeline by hand (Files.tsx): the list under the timeline's bar, open to
  // add one at the playhead or, from a sound clip's menu, to swap that clip's file; a row dragged onto a lane
  const [files, setFiles] = useState<{ mode: 'add' | 'replace'; lane?: string; ref?: ClipRef; replacing?: string }>();
  // what the list showed last, so it keeps its words while it closes
  const [filesWas, setFilesWas] = useState<{ mode: 'add' | 'replace'; replacing?: string }>({ mode: 'add' });
  const [dragFile, setDragFile] = useState<FilmFile>();
  const [placing, setPlacing] = useState(false);
  const filmFiles = useFilmFiles(film, !!files);
  const srcSeconds0 = useSourceSeconds(state, cut.sourceSeconds);
  // a file placed by hand has its length from the list until the server's own measure of the cut comes back
  const fileSecs = useMemo(() => new Map((filmFiles.files ?? []).filter((f) => f.seconds).map((f) => [f.src, f.seconds!])), [filmFiles.files]);
  const srcSeconds = useCallback((src?: string) => srcSeconds0(src) ?? (src === undefined ? undefined : fileSecs.get(src)), [srcSeconds0, fileSecs]);
  const readOnly = !!viewing || cut.mode === 'none' || !!cut.saving;
  const tc = smpte(frame / fps, fps);

  // the pinned chip and the context's playhead follow the paused playhead (not every frame while playing)
  const [restTc, setRestTc] = useState(tc);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- holds the last paused timecode while playback runs
  useEffect(() => { if (rate === 0) setRestTc(tc); }, [rate, tc]);
  const { setPlayhead } = ui;
  useEffect(() => { setPlayhead(restTc); }, [restTc, setPlayhead]);
  useEffect(() => () => setPlayhead(undefined), [setPlayhead]);

  // the page's things for the message's words: a clip, a panel, a shot in the Takes view, the playhead's moment
  useEditRefSource({
    tl: shown ?? undefined, fps, frame, version: viewing?.version ?? cut.equals ?? cut.ref, edited: !viewing && !!cut.edited && !cut.equals,
    rev: viewing ? undefined : cut.working?.rev, by: shots.by, names, setFrame, select: (r) => { setSel(r); setExtra(undefined); },
  });

  const selFound = tl && sel ? findClip(tl, sel) : undefined;
  // the shots selected in the Takes view (ASKS 52): Alma reads them, and that the film is shown with them, not changed
  const picksSaid = picks.length ? ` · ${picks.length} ${picks.length === 1 ? 'shot' : 'shots'} from other takes shown in place, not in the film: ${picksWords(picks, state?.scenes.map((x) => x.id))}` : '';
  // what Alma reads of the page: the film's own stage (it was always "stage 9", also for a film at stage 1 before its
  // script), the cut, and before the takes what the timeline holds (QC round two)
  const stageSaid = `stage ${state?.film.stage ?? 9}`;
  usePage(empty ? `${stageSaid} · Edit · ${plan.data?.locked ? 'the script is locked, the timeline is being made' : 'no script yet'}${lowerTab === 'left' && leftView ? ` · ${leftChip(leftView, waitingN)}` : ''}` : tl ? `${stageSaid} · Edit ${viewing ? viewing.version : cut.equals ?? `${cutName} with edits`}${planned ? ` · ${plannedSaid(tl)}` : ''}${selFound ? ` · ${selFound.track.id} ${clipName(selFound.clip)}` : ''} · playhead ${restTc}${picksSaid}${lowerTab === 'left' && leftView ? ` · ${leftChip(leftView, waitingN)}` : ''}` : `${stageSaid} · Edit`,
    phone ? 'Note at a timecode…' : empty && !plan.data?.locked ? 'Tell Alma the idea…' : 'Note at a timecode, or tell Alma what to cut…', phone ? ['Note at this timecode'] : ['What changed?', 'Render the 480p of this cut'], ['What changed in the last version?']);

  /** A shot as a version's note names it ("S2 shot 3"), when the shots are known (for the notes made here). */
  const noteNameOf = useCallback((c: TimelineClip) => { const n = shotNo(c, shots.by), sc = sceneOf(c, shots.by); return n && sc ? `${sc} shot ${n}` : undefined; }, [shots.by]);
  /** One finished gesture = one step of the history (stage 2: no version is written; ⌘S keeps one). */
  const apply = useCallback(async (e: Edit | undefined, o?: { presses?: boolean }) => {
    // an edit refused because of a lock says which track and why (14 Nov); read at once, before anything awaits
    const refused = takeRefusal();
    if (!e) { if (refused) say(refused); return; }
    if (!cut.current || viewing) return;
    setRenderOn(undefined);
    const count = (x: Timeline) => x.tracks.reduce((k, t) => k + t.clips.length, 0);
    // the first change after the shots were found also saves the clips split at them
    const split = tl && count(tl) !== count(cut.current) ? ' · clips cut at their shots' : '';
    // two sounds left overlapping on a track (an unlinked sound kept long) go side by side on a track of their own
    const tidy = tidyOverlaps(e.tl);
    const side = tidy.moved.length ? ` · overlapping sound moved to ${tidy.moved.join(', ')}` : '';
    // every dissolve kept valid whatever the edit did to its join (13 Nov): shortened to fit, or dropped with its join
    const dz = tidyDissolves(tidy.tl, noteNameOf);
    const fit = dz.said.length ? ` · ${dz.said.join(', ')}` : '';
    if (tl && !o?.presses) {
      // a locked track is never changed by anything (14 Nov): the last guard, whatever made the edit
      const was = new Map(tl.tracks.map((t) => [t.id, t]));
      const hit = dz.tl.tracks.find((t) => was.get(t.id)?.locked && t.locked && JSON.stringify(t.clips) !== JSON.stringify(was.get(t.id)!.clips));
      const gone = tl.tracks.find((t) => t.locked && !dz.tl.tracks.some((x) => x.id === t.id));
      if (hit ?? gone) { say(`${(hit ?? gone)!.id} ${(hit ?? gone)!.name} is locked: unlock it to change it.`); return; }
      // an edit that changes nothing writes no version (F7)
      if (sameEdit(dz.tl, tl)) return;
    }
    // track buttons pressed and not saved yet go into this version (the edit was made on the pressed cut)
    const pw = o?.presses ? '' : pressWords(cut.current, pressOn?.p);
    const pressed = pw ? ` · ${pw}` : '';
    setPress(undefined);
    await cut.commit({ tracks: dz.tl.tracks, markers: dz.tl.markers, base: e.tl.version }, `${e.note}${split}${side}${fit}${pressed}`,
      dz.said.length ? () => say(`${cap(dz.said.join('; '))}, so the cut stays valid.`) : undefined);
  }, [cut, viewing, tl, noteNameOf, pressOn, say]);

  // the pressed track buttons saved as one version once they rest (700 ms after the last press); none when they cancel out
  const pressSave = useRef<() => void>(() => {});
  useEffect(() => {
    pressSave.current = () => {
      if (!pressOn || !saved || !tl) return;
      const words = pressWords(saved, pressOn.p);
      if (!words) { setPress(undefined); return; }
      void apply({ tl, note: words }, { presses: true });
    };
  });
  useEffect(() => {
    if (!press) return;
    const t = setTimeout(() => pressSave.current(), 700);
    return () => clearTimeout(t);
  }, [press]);
  const pressTrack = useCallback((id: string, k: 'muted' | 'locked') => {
    const cur = saved;
    if (!cur) return;
    setRenderOn(undefined);
    setPress((was) => {
      const p: Presses = was && was.v === cur.version ? { ...was.p } : {};
      const t = cur.tracks.find((x) => x.id === id);
      const now = p[id]?.[k] ?? !!t?.[k];
      p[id] = { ...p[id], [k]: !now };
      return { v: cur.version, p };
    });
  }, [saved]);

  // the nudged selection is saved as one version half a second after the last key; until the new version
  // lands the clips stay shown where the keys put them, and they go back if the save did not take
  const nudgeSave = useRef<() => void>(() => {});
  useEffect(() => {
    nudgeSave.current = () => {
      if (!nudgeOn || !tl) return;
      const v = tl.version;
      void apply(moveClips(tl, nudgeOn.refs, nudgeOn.d)).then(() => setNudge((n) => (n && n.v === v ? undefined : n)));
    };
  });
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => nudgeSave.current(), 500);
    return () => clearTimeout(t);
  }, [nudge]);

  // Undo says what it took back and whose it was (13 Nov: one night the owner's ⌘Z took back Alma's words on a title
  // card, unseen): in the toolbar's line, in amber and for 12 s when the change was Alma's. Nothing is asked.
  const tell = useCallback((l: { text: string; alma: boolean } | undefined) => { if (l) say(l.text, l.alma ? { amber: true, ms: 12000 } : undefined); }, [say]);
  const doUndo = useCallback(() => {
    // track buttons pressed and not saved yet: the undo takes those back first, and nothing is written
    // a nudge waiting to be saved (the , and . keys): the undo takes back that and nothing else (F13)
    if (nudgeOn) { setNudge(undefined); say(`Undid: moved ${nudgeOn.refs.length === 1 ? 'the clip' : `${nudgeOn.refs.length} clips`} ${nudgeOn.d > 0 ? '+' : '−'}${Math.abs(nudgeOn.d)} f (it was not saved yet).`); return; }
    const w = pressOn && saved ? pressWords(saved, pressOn.p) : '';
    if (w) { setPress(undefined); say(`Undid: ${w} (it was not saved yet).`); return; }
    if (!undoStep) return;
    setRenderOn(undefined);
    const line = stepUndoLine('undo', undoStep);
    // the line is said with the step, in the same draw: one draw of the page for a ⌘Z, not two (F15)
    void cut.undo(() => tell(line));
  }, [undoStep, cut, saved, pressOn, nudgeOn, say, tell]);
  const doRedo = useCallback(() => {
    if (!redoStep) return;
    setRenderOn(undefined);
    const line = stepUndoLine('redo', redoStep);
    void cut.redo(() => tell(line));
  }, [redoStep, cut, tell]);

  // "Restore vN": that version's content into the working cut as one step; undo brings back what was there
  const restore = async (v: VersionInfo) => {
    if (!cut.current) return;
    if (v.version === cut.equals) { setViewing(undefined); return; }
    setRenderOn(undefined);
    await cut.restore(v.version, () => { setViewing(undefined); say(`Opened ${v.version}. Undo brings back what you had.`); });
  };
  // a step of the history pressed on the History tab: the cut goes there (nothing is written but the pointer)
  const goToStep = (rev: number) => {
    const h = cut.history;
    const i = h ? h.steps.findIndex((x) => x.rev === rev) : -1;
    if (!h || i < 0 || i === h.at || viewing) return;
    setRenderOn(undefined); setRate(0); setPicks([]); setWatching(undefined);
    const st = h.steps[i];
    const words = (st.words.trim() || 'a change').replace(/\.$/, '');
    void cut.goTo(rev, () => say(i < h.at ? `Went back to: ${words}. Redo brings the rest back.` : `Redid up to: ${words}.`));
  };

  // ⌘S (Ctrl-S elsewhere) and the Save button: keep the working cut as a version at once, nothing asked; then the
  // status line offers a name (optional). Saving with no edits since the newest version writes nothing.
  const [naming, setNaming] = useState<{ version: string; text: string }>();
  const saveCut = useCallback(async () => {
    if (!cut.current || viewing) return;
    // a nudge or an M and lock press still waiting for its batch lands first, as its own step (the save follows it)
    if (nudgeOn) nudgeSave.current();
    if (pressOn) pressSave.current();
    const r = await cut.save({ why: 'you' });
    if (r.version && r.made) setNaming({ version: r.version, text: cut.names[r.version]?.name ?? '' });
  }, [cut, viewing, nudgeOn, pressOn]);

  const selClip = () => (tl && sel ? findClip(tl, sel) : undefined);
  const clipChip = (t: TimelineTrack, c: TimelineClip) => ({ id: `clip:${t.id}:${c.id}`, label: `${t.id} · ${clipName(c)} · ${smpte(c.at, fps)}`, ref: c.src });
  const keyOf = (r: ClipRef) => `${r.trackId}:${r.clipId}`;
  const selectMany = (refs: ClipRef[], first?: ClipRef) => {
    const uniq = refs.filter((r, i) => refs.findIndex((x) => keyOf(x) === keyOf(r)) === i);
    const head = first && uniq.some((r) => keyOf(r) === keyOf(first)) ? first : uniq[0];
    setSel(head);
    setExtra(head ? { of: keyOf(head), refs: uniq.filter((r) => keyOf(r) !== keyOf(head)) } : undefined);
  };
  /** The clips as the timeline outlines them: a picture and its linked sound are one (either selects both). */
  const pairOf = (r: ClipRef) => { const p = tl ? partnerOf(tl, r) : undefined; return new Set([keyOf(r), ...(p ? [keyOf(p)] : [])]); };
  /** The selection without these clips and their linked picture or sound (Option-Command, 13 Nov). */
  const takeOut = (refs: ClipRef[]) => {
    const out = new Set(refs.flatMap((r) => [...pairOf(r)]));
    const cur = group.length ? group : sel ? [sel] : [];
    const left = cur.filter((x) => !out.has(keyOf(x)));
    selectMany(left, sel && !out.has(keyOf(sel)) ? sel : undefined);
  };
  const onSelect = (r: ClipRef | undefined, c?: TimelineClip, t?: TimelineTrack, how?: 'toggle' | 'range' | 'remove') => {
    if (r && how === 'remove') { takeOut([r]); return; }
    if (r && how === 'toggle' && sel) {
      // Command-click: in or out of the selection. A clip outlined because its linked picture or sound is selected
      // counts as selected, and comes out with it (before 13 Nov such a click added it and nothing changed on screen).
      const cur = group.length ? group : [sel];
      const pair = pairOf(r);
      const has = cur.some((x) => pair.has(keyOf(x)));
      if (has) takeOut([r]);
      else selectMany([...cur, r], sel);
      return;
    }
    if (r && how === 'range' && sel && tl) {
      // Shift-click: everything from the selected clip to this one, on the tracks between them
      const a = findClip(tl, sel), b = findClip(tl, r);
      if (a && b) {
        const ia = tl.tracks.indexOf(a.track), ib = tl.tracks.indexOf(b.track);
        const from = Math.min(startF(a.clip, fps), startF(b.clip, fps)), to = Math.max(endF(a.clip, fps), endF(b.clip, fps));
        const refs = tl.tracks.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).filter((x) => x.kind === a.track.kind || x.kind === b.track.kind)
          .flatMap((x) => x.clips.filter((k) => startF(k, fps) >= from && endF(k, fps) <= to).map((k) => ({ trackId: x.id, clipId: k.id })));
        // added to what is selected, so a range continues a selection instead of replacing it (13 Nov)
        selectMany([sel, ...group, ...refs], sel);
        return;
      }
    }
    setSel(r);
    setExtra(undefined);
    if (r && c && t) ui.addChip(clipChip(t, c));
  };
  /** The clips from the playhead on (or back), on one track or on all: DaVinci's Y, Option-Y, Command-Y. */
  const selectFrom = (f: number, forward: boolean, trackId?: string) => {
    if (!tl) return;
    const refs = tl.tracks.filter((t) => !t.locked && (!trackId || t.id === trackId))
      .flatMap((t) => t.clips.filter((c) => (forward ? endF(c, fps) > f : startF(c, fps) < f)).map((c) => ({ trackId: t.id, clipId: c.id })));
    selectMany(refs, sel);
    const on = trackId ? `on ${trackId}` : 'on every track';
    say(refs.length ? `${refs.length} clips selected ${forward ? 'from the playhead on' : 'before the playhead'}, ${on}. The , and . keys move them a frame (Shift: five); drag one to move them all.` : `Nothing ${forward ? 'after' : 'before'} the playhead ${on}.`);
  };
  const nudgeBy = (step: number) => {
    if (!tl || readOnly || !group.length) return;
    setRenderOn(undefined);
    // the moves waiting are added to only while the same clips are selected: a nudge that could not move (d 0) used
    // to stay behind and the next , or . moved those clips, not the ones selected since (found by the chains, 14 Nov)
    const same = (a: ClipRef[], b: ClipRef[]) => a.length === b.length && a.every((x) => b.some((y) => y.trackId === x.trackId && y.clipId === x.clipId));
    const base = nudge && nudge.v === tl.version && same(nudge.refs, group) ? nudge : undefined;
    const refs = base?.refs ?? group;
    // a clip or its linked partner on a locked track: refused at the key, before anything is shown moving (14 Nov)
    const lock = lockedWhy(tl, refs);
    if (lock) { say(lock); return; }
    const d = groupDelta(tl, refs, (base?.d ?? 0) + step);
    setNudge(d ? { d, v: tl.version, refs } : undefined);
    if (d === (base?.d ?? 0)) say(step > 0 ? 'It cannot go further: a clip that is not selected is in the way.' : 'It cannot go further back.');
  };
  // "Ask Alma" names the edit recipe by its absolute path, the one ALMA_APPEND_PROMPT gives her
  const [editRecipe, setEditRecipe] = useState('recipes/edit.md');
  useEffect(() => { let live = true; void editRecipePath().then((p) => { if (live) setEditRecipe(p); }); return () => { live = false; }; }, []);
  const askAlma = () => {
    const lead = `Edit the cut with the recipe at ${editRecipe}. `;
    const f = selClip();
    if (!f) { ui.prefill(`${lead}At ${tc}: `); return; }
    const inside = frame >= startF(f.clip, fps) && frame < endF(f.clip, fps);
    const at = inside ? tc : smpte(f.clip.at, fps);
    const p = tl && sel ? partnerOf(tl, sel) : undefined;
    ui.prefill(`${lead}At ${at} on ${f.track.id}${p ? `+${p.trackId}` : ''}, ${clipName(f.clip)}: `, clipChip(f.track, f.clip));
  };
  const splitHere = () => {
    if (!tl) return;
    const f = selClip();
    if (f) { void apply(splitClip(tl, sel!, frame)); return; }
    const p = pictureAt(tl, frame);
    if (p) void apply(splitClip(tl, { trackId: p.track.id, clipId: p.clip.id }, frame));
  };
  // a delete refused (a lock) keeps the selection, and the status line says why
  const deleteSel = () => { if (tl && sel) { const e = group.length > 1 ? deleteClips(tl, group, ripple) : deleteClip(tl, sel, ripple); void apply(e); if (e) setSel(undefined); } };
  /** The reason the edit just asked for was refused (a lock), on the status line; for the paths that do not go on to `apply`. */
  const sayRefused = () => { const w = takeRefusal(); if (w) say(w); };
  // ---- subtitle lines (14 Nov): retype the selected line in the field over its block; an .srt clip split into lines
  const retypeSel = (ref = sel) => { if (ref) { setSel(ref); setRetypeCmd((c) => ({ n: (c?.n ?? 0) + 1, ref })); } };
  const splitSrtClip = async (ref: ClipRef) => {
    const f = tl ? findClip(tl, ref) : undefined;
    if (!tl || !f?.clip.src || readOnly) return;
    let text: string;
    try { text = await fetchSrt(film, f.clip.src); } catch (e) { say(`The .srt could not be read: ${e instanceof Error ? e.message : String(e)}`); return; }
    const r = splitSrt(tl, ref, text);
    if (!r.edit) { say(r.error ?? 'It could not be split.'); return; }
    await apply(r.edit);
    selectMany(r.edit.refs, r.edit.refs[0]);
    say(`${r.edit.refs.length} lines to edit. Double-click one to retype it; ⌘Z puts the .srt back.`);
  };
  // ---- the options of the selected effect
  const hearOption = (o: SoundOption) => {
    if (!selAt || !sel) return;
    const isFilm = o.src === selAt.clip.src || o.files.includes((selAt.clip.src ?? ''));
    setWatching(undefined); setPicks([]); setRenderOn(undefined);
    setHearing(isFilm ? undefined : { ref: sel, src: o.src });
    // the passage: a second and a half of the film before the effect, the effect, half a second after
    const s0 = startF(selAt.clip, fps);
    const w = optionWindow(selAt.clip, o.seconds);
    const len = Math.max(1, toF((w.out - w.in) / speedOf(selAt.clip), fps));
    stopAt.current = Math.min(total, s0 + len + Math.round(fps / 2));
    setFrameRaw(Math.max(0, s0 - Math.round(fps * 1.5)));
    setRate(1);
  };
  const stepOption = (d: 1 | -1) => {
    if (!selOptions || selOptions.length < 2) return false;
    const cur = selOptions.findIndex((o) => (hearingOn ? o.src === hearingOn.src : o === filmOption));
    hearOption(selOptions[(Math.max(0, cur) + d + selOptions.length) % selOptions.length]);
    return true;
  };
  const stopHearing = () => { stopAt.current = undefined; setRate(0); setHearing(undefined); };
  const putHeard = async () => {
    if (!hearEdit || readOnly) return;
    const e = hearEdit;
    stopAt.current = undefined; setRate(0); setHearing(undefined);
    await apply(e);
  };
  const effectName = (c: TimelineClip) => ((c.label ?? '').includes(' · ') ? (c.label ?? '').replace(/\s*·[^·]*$/, '') : clipName(c));
  const askAnother = (f = selAt, opts = selOptions) => {
    if (!f) return;
    const list = opts ?? [];
    const now = list.find((o) => o.src === f.clip.src || o.files.includes((f.clip.src ?? '')));
    ui.prefill(`Another option for the effect “${effectName(f.clip)}” at ${smpte(f.clip.at, fps)} on ${f.track.id} ${f.track.name} in cut ${almaCut}. ${list.length ? `The options so far: ${list.map((o) => o.name).join(', ')}${now ? ` (${now.name} is in the film)` : ''}. They stay. ` : ''}What should be different: `, clipChip(f.track, f.clip));
  };
  // ---- copy and paste (the user, 13 Nov). The copied clip is kept for the tab, so a reload does not lose it.
  const trackOfKind = (kind: Copied['kind'], prefer?: string) => {
    if (!tl) return undefined;
    const ok = (id?: string) => tl.tracks.find((t) => t.id === id && t.kind === kind && !t.locked);
    return ok(kind === 'captions' ? undefined : pasteTo[kind]) ?? ok(prefer) ?? tl.tracks.find((t) => t.kind === kind && !t.locked);
  };
  const copySel = (thenDelete = false) => {
    if (!tl || !sel || !selClip()) return false;
    // every selected clip with the picture or sound linked to it, once (F4: ⌘X used to delete them all and keep one)
    const seen = new Set<string>();
    const items: Copied[] = [];
    for (const r of (group.length ? group : [sel]).flatMap((x) => { const p = partnerOf(tl, x); return p ? [x, p] : [x]; })) {
      const f = findClip(tl, r);
      if (!f || seen.has(keyOf(r))) continue;
      seen.add(keyOf(r));
      items.push({ clip: f.clip, kind: f.track.kind, trackId: f.track.id });
    }
    if (!items.length) return false;
    const next: Held = { items };
    setHeld(next);
    try { sessionStorage.setItem(`hh:clipboard:${film}`, JSON.stringify(next)); } catch { /* kept for this page only */ }
    const one = items.length === 1 || (items.length === 2 && items[0].kind !== items[1].kind && items[0].clip.src === items[1].clip.src);
    const to = items.length === 1 ? trackOfKind(items[0].kind, items[0].trackId) : undefined;
    say(`${thenDelete ? 'Cut' : 'Copied'} ${one ? `${clipName(items[0].clip)}${items.length === 2 ? ' and its sound' : ''}` : `${items.length} clips`}. ⌘V pastes ${items.length === 1 ? 'it' : 'them'} at the playhead${to ? ` on ${to.id} ${to.name}` : ''}.`);
    if (thenDelete && !readOnly) deleteSel();
    return true;
  };
  const pasteHeld = async (f: number, onTrack?: string) => {
    if (!tl || !held || readOnly) return;
    // the menu's "Paste here" on a lane: a single clip of that lane's kind goes on that lane
    const lane = onTrack ? tl.tracks.find((t) => t.id === onTrack && !t.locked) : undefined;
    const mark = { ...pasteTo, ...(lane && held.items.filter((i) => i.kind === lane.kind).length === 1 ? { [lane.kind]: lane.id } : {}) };
    const r = pasteClips(tl, held.items, f, mark);
    if (!r.edit) { say(r.error ?? 'Could not paste there.'); return; }
    await apply(r.edit);
    selectMany(r.edit.refs, r.edit.refs[0]);
  };
  const setInOut = (edge: 'head' | 'tail') => {
    const f = selClip();
    if (!f || !tl || !sel) return;
    const d = edge === 'head' ? frame - startF(f.clip, fps) : frame - endF(f.clip, fps);
    void apply(trimClip(tl, sel, edge, d, ripple, srcSeconds(f.clip.src)));
  };
  // ---- a file put on the timeline by hand (14 Nov: until now only Alma could lay music, an effect, a title card or
  // a file attached in the chat). The lane the menu was opened on, else the track marked for pasting, else the
  // effects and music tracks for a sound and the insert track for a picture (placeFile.ts). One version each.
  const openFiles = (mode: 'add' | 'replace', lane?: string, ref?: ClipRef) => {
    const c = ref && tl ? findClip(tl, ref) : undefined;
    const replacing = c ? clipName(c.clip) : undefined;
    setFiles({ mode, lane, ref, replacing });
    setFilesWas({ mode, replacing });
  };
  const closeFiles = () => { setFiles(undefined); setDragFile(undefined); };
  const filePrefer = (kind: 'video' | 'audio', lane?: string) => [lane, pasteTo[kind]];
  /** A file attached in the chat is first copied into the film's folder (a clip plays only files of the film). */
  const srcFor = async (e: FilmFile): Promise<string | undefined> => {
    if (!e.upload) return e.src;
    const r = await adoptUpload(film, e.upload);
    if (!r.src) say(`${e.name} could not be copied into the film: ${r.error ?? 'unknown error'}`);
    return r.src;
  };
  const placeEntry = async (e: FilmFile, where?: { trackId: string; f: number }) => {
    if (!tl || readOnly || placing) return;
    setPlacing(true);
    try {
      const src = await srcFor(e);
      if (!src) return;
      // an .srt: its times are the film's, so Add puts it at the start; a drop puts it where it was dropped
      if (e.kind === 'subtitles') {
        const r = placeSrt(tl, { ...e, src }, where?.f ?? 0, where?.trackId);
        if (!r.edit) { say(r.error ?? 'It could not be added there.'); return; }
        await apply(r.edit);
        setSel(r.edit.ref); setExtra(undefined);
        say(`Added ${e.name}.srt on ${r.edit.ref.trackId}. Right-click it to split it into lines to edit. ⌘Z takes it out.`);
        return;
      }
      const at = where?.f ?? frame;
      const r = placeFile(tl, { ...e, src }, at, where ? [where.trackId] : filePrefer(e.kind === 'sound' ? 'audio' : 'video', files?.lane));
      if (!r.edit) { say(r.error ?? 'It could not be added there.'); return; }
      await apply(r.edit);
      setSel(r.edit.ref); setExtra(undefined);
      say(`Added ${e.name} at ${smpte(at / fps, fps)}. ⌘Z takes it out.`);
    } finally { setPlacing(false); }
  };
  const replaceWith = async (e: FilmFile) => {
    const ref = files?.ref;
    if (!tl || !ref || readOnly || placing) return;
    setPlacing(true);
    try {
      const src = await srcFor(e);
      if (!src) return;
      const r = replaceFile(tl, ref, { ...e, src });
      if (!r.edit) { say(r.error ?? 'It could not be put in its place.'); return; }
      stopAt.current = undefined; setHearing(undefined);
      await apply(r.edit);
      setSel(ref); setExtra(undefined);
      closeFiles();
      say(`${e.name} is in the clip’s place. ⌘Z goes back.`);
    } finally { setPlacing(false); }
  };
  /** The picture at frame f as a PNG at its file's full size, downloaded to this device (nothing is written in the film). */
  const saveFrame = async (f: number) => {
    if (!tl) return;
    say(`Saving the frame at ${smpte(f / fps, fps)}…`);
    try {
      // a saved version's frame, else the working cut's as it is now (no version is saved for a frame)
      const r = await fetch(`/api/films/${encodeURIComponent(film)}/frame?version=${encodeURIComponent(viewing?.version ?? cut.equals ?? 'working')}&f=${f}`, { cache: 'no-store' });
      if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; say(`The frame could not be saved: ${j.error ?? r.status}`); return; }
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `${film}-${fileTag}-${f}.png`;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      say(`Saved ${name} to this device.`);
    } catch (e) {
      say(`The frame could not be saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // keyboard (never while typing in the composer or a field)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      // ⌘S (Ctrl-S): save the cut as a version, also while typing in a field; the browser's own save dialog never opens
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) void saveCut();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
        || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/i.test((el as HTMLInputElement).type)));
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      // the Versions menu takes its own keys (Space and Enter open a version, the arrows move in it): the player and
      // the timeline do not take them too (QC round two)
      if (!mod && el?.closest?.('[data-versions-menu]')) return;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        // a shot being watched or shots selected are not saved: undo there means "never mind", back to the film
        if (picks.length || watching) { setRate(0); setPicks([]); setWatching(undefined); return; }
        if (hearingOn) { stopHearing(); return; }
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if (mod && k === 'b') { e.preventDefault(); splitHere(); return; }
      // DaVinci's selection keys: Command-A all; Y from the playhead on, on the selected clip's track;
      // Option-Y on every track; Command-Y and Command-Option-Y the same, backwards
      if (mod && !e.shiftKey && !e.altKey && k === 'a') { e.preventDefault(); if (tl) selectMany(tl.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id }))), sel); return; }
      if (e.code === 'KeyY' && !e.shiftKey) { e.preventDefault(); selectFrom(frame, !mod, e.altKey ? undefined : sel?.trackId); return; }
      // the , and . keys move what is selected a frame back or forward, with Shift five (DaVinci's nudge)
      if (!mod && !e.altKey && (e.code === 'Comma' || e.code === 'Period')) { e.preventDefault(); nudgeBy((e.code === 'Comma' ? -1 : 1) * (e.shiftKey ? 5 : 1)); return; }
      // copy, cut and paste a clip; text selected on the page is still copied as text
      if (mod && !e.shiftKey && (k === 'c' || k === 'x')) { if (!String(window.getSelection() ?? '') && copySel(k === 'x')) e.preventDefault(); return; }
      if (mod && !e.shiftKey && k === 'v') { if (held) { e.preventDefault(); void pasteHeld(frame); } return; }
      if (mod || e.altKey) return;
      if (e.key === ' ' && picks.length) {
        // shots selected (ASKS 52): Space plays the film with them in place, from the playhead, also while one of them
        // was just clicked and plays from its take
        e.preventDefault();
        if (watching) { setWatching(undefined); setRate(frame >= total ? (setFrame(0), 1) : 1); return; }
        setRate((r) => (r === 0 ? (frame >= total ? (setFrame(0), 1) : 1) : 0));
        return;
      }
      if (e.key === ' ') {
        // a take's shot is in the player: Space plays and pauses that, not the film behind it
        const v = watching ? document.querySelector<HTMLVideoElement>('video[data-source-shot]') : null;
        if (v) { e.preventDefault(); v.dispatchEvent(new Event('shot-toggle')); return; }
      }
      if (e.key === ' ') { e.preventDefault(); setRate((r) => (r === 0 ? (frame >= total ? (setFrame(0), 1) : 1) : 0)); return; }
      if (k === 'f') { toggleFull(); return; }
      if (k === 'k') { setRate(0); return; }
      if (k === 'l') { setRate((r) => (r <= 0 ? 1 : Math.min(4, r * 2))); return; }
      if (k === 'j') { setRate((r) => (r >= 0 ? -1 : Math.max(-4, r * 2))); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setRate(0); setFrame(frame + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? fps : 1)); return; }
      if (k === 'i') { setInOut('head'); return; }
      if (k === 'o') { setInOut('tail'); return; }
      if (k === 'b') { setTool((t) => (t === 'blade' ? 'select' : 'blade')); return; }
      if (k === 'a' || k === 'v') { setTool('select'); return; }
      if (k === 'n') { setSnap((s) => !s); return; }
      if (k === 'r') { setRipple((s) => !s); return; }
      // an effect with options is selected: up and down play the next one in the film, Enter uses it
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selOptions && stepOption(e.key === 'ArrowDown' ? 1 : -1)) { e.preventDefault(); return; }
      // the 1080p view: up and down go from shot to shot through the film, to check each at full size
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && checkStarts.current.length) {
        e.preventDefault();
        const xs = checkStarts.current, cur = xs.filter((x) => x <= frame).pop() ?? 0;
        const to = e.key === 'ArrowDown' ? xs.find((x) => x > frame) : [...xs].reverse().find((x) => x < cur);
        if (to !== undefined) setFrame(to);
        return;
      }
      if (e.key === 'Enter' && hearingOn && hearEdit) { e.preventDefault(); void putHeard(); return; }
      if (k === 'escape' && renderOn) { setRate(0); setRenderOn(undefined); return; }
      // Enter with one subtitle line selected: its words open for retyping over its block
      if (e.key === 'Enter' && !e.shiftKey && sel && selAt && group.length <= 1 && isLine(selAt.clip) && !readOnly && !selAt.track.locked) { e.preventDefault(); retypeSel(); return; }
      if (k === 'escape' && files) { closeFiles(); return; }
      if (k === 'escape' && hearingOn) { stopHearing(); return; }
      if (k === 'escape' && pointOn) { setPoint(undefined); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && pointOn && tl) {
        e.preventDefault();
        if (!readOnly) void apply(removeGainPoint(tl, pointOn, pointOn.i, noteNameOf));
        setPoint(undefined);
        return;
      }
      // Escape: an open menu first (it takes the key itself), then the selection; never both with one press (15 Nov)
      if (k === 'escape') { if (document.querySelector('[role="menu"], [data-versions-menu]')) return; setSel(undefined); setWatching(undefined); if (picks.length) { setRate(0); setPicks([]); } return; }

      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
      if (e.key === '=' || e.key === '+') { setZoomCmd((z) => ({ n: (z?.n ?? 0) + 1, dir: 1 })); return; }
      if (e.key === '-') { setZoomCmd((z) => ({ n: (z?.n ?? 0) + 1, dir: -1 })); return; }
    };
  });
  useEffect(() => {
    if (phone) return;
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phone]);

  // the browser tests (tests/edit/) read the page's cut and state here; never in a production build
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __hhEdit?: unknown }).__hhEdit = {
      // stage 2: `steps` counts the changes this page landed (an edit, an undo, a redo, a restore: "an edit landed");
      // `rev` is the working cut's; `versions` the saved versions only; `newest`, `equals`, `edited`, `status` (the line
      // under the header), `history` (its pointer and steps' words), `lastSave`, `names`
      // (`saving` and `steps` are read live: a change in flight and its landing draw nothing on their own)
      mode: cut.mode, auto480p: cut.auto480p, current: cut.current, tl: tl ?? null, versions: cut.versions, get saving() { return cut.busy() ?? null; }, error: cut.error ?? null,
      get steps() { return cut.landed(); }, rev: cut.working?.rev ?? null, newest: cut.newest ?? null, equals: cut.equals ?? null, edited: cut.edited, status: status ?? null,
      history: hist ? { at: hist.at, n: hist.steps.length, since: hist.since, words: hist.steps.map((x) => x.words) } : null, lastSave: cut.lastSave ?? null, names: cut.names,
      frame, rate, sel: sel ?? null, group, tool, ripple, snap, nudge: nudge ?? null, trying: picks.length ? picks : null, picks, tried: tryEdit ? { tl: tryEdit.tl, ids: tryEdit.ids } : null, boxFolded, takeMenu: takeMenu ?? null, watching: watching ?? null,
      hearing: hearing ?? null, viewing: viewing?.version ?? null, total, undo, redo, said: said ?? null, tab: lowerTab, at: performance.now(),
    };
    (window as unknown as { __hhSetFrame?: (f: number) => void }).__hhSetFrame = (f: number) => { setRate(0); setFrame(f); };
  });

  if (!state) return <Loading error={error} />;
  if (cut.mode === 'loading') return <Loading error="Reading the timeline…" />;
  if (!tl || cut.mode === 'error') {
    return (
      <>
        <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Edit' }]} meta="no timeline yet" />
        <Loading error={cut.mode === 'error' || !tl
          ? `The cut could not be read: ${cut.error ?? 'GET …/cut failed'}`
          : `No timeline for ${state.film.title} yet: there is no cut/v<n>.json in its folder. Alma writes the first one.`} />
      </>
    );
  }

  const proxyR = cut.renders.proxy;
  // the version's 480p file when there is one (cut/renders/<version>-proxy.mp4). The desktop player never plays it (14
  // Nov, ASKS 44: the player is always the live cut; a file is watched from the Renders tab); the phone does, as one
  // file decodes far better there than many takes under a live mix.
  // (the 480p of the version the cut equals: one of an older state is never played as this cut)
  const proxyFile = viewing
    ? viewing.renders?.proxy?.path
    : !cut.equals ? undefined : (proxyR?.state === 'done' && proxyR.path && proxyR.version === cut.equals ? proxyR.path : undefined) ?? cut.refRenders?.proxy?.path;
  // the 1080p view plays the full-size pieces (never while trying a take or hearing an edit: those play the takes). The
  // phone never plays them: many full-size files started, stopped and sought in step is what stutters there (16 Nov)
  const fullView = phone || peek480 || tryEdit ? undefined : fullFor;
  // the phone plays one file whenever there is one of this exact cut (16 Nov: the user heard clipping and lag on an
  // iPhone while the takes played live): the 480p first (made for this, light on a mobile link), else the version's
  // master, else (a delivered film) the film's master when it is of this version. A cut with edits since its version has
  // none: it plays live, and PhoneEdit says so in its quiet line.
  const phoneOwn = phone ? phonePick({
    viewing: viewing ? { proxy: viewing.renders?.proxy?.path, master: viewing.renders?.master?.path } : undefined,
    equals: cut.equals, proxy: proxyFile,
    master: cut.equals ? (cut.renders.master?.state === 'done' && cut.renders.master.version === cut.equals ? cut.renders.master.path : undefined) ?? cut.refRenders?.master?.path : undefined,
    delivered: state.master?.version && state.master.version === cut.equals ? state.master.path : undefined,
  }) : undefined;
  const phoneFile = phoneOwn ? repoPath(state.film.folder, state.film.repo, phoneOwn.path) : undefined;
  // the request for Alma's box: the marked takes, their shots and timecodes in the cut, the version; nothing is sent
  const askSeedance = () => {
    const takes = (check?.takes ?? []).filter((t) => seedance.marks.has(t.src));
    if (takes.length) ui.prefill(seedanceAsk(takes, almaCut, (s) => smpte(s, fps), fps), { id: `seedance:${almaCut}`, label: `Seedance · ${takes.length} ${takes.length === 1 ? 'take' : 'takes'}` });
  };
  // the cheap step first: the takes of the shots that play at 480p (or of the one shot asked about), whole, on Higgsfield
  const askUpscale = (src?: string) => {
    const takes = (check?.takes ?? []).filter((t) => (src ? t.src === src : t.shots.some((s) => s.kind === 'small')));
    if (takes.length) ui.prefill(upscaleAsk(takes, almaCut, (s) => smpte(s, fps), fps), { id: `upscaled:${almaCut}`, label: `Upscale · ${takes.length} ${takes.length === 1 ? 'take' : 'takes'}` });
  };
  const playShot = (s: CheckShot) => { setWatching(undefined); setFrameRaw(Math.max(0, s.from - Math.round(fps / 2))); setRate(1); };
  // a rendered file in the player (RendersTab, RenderPlayer), from the playhead's time; a second click plays or pauses.
  // The tag says what it is, in amber when it is of another version than the cut (the playhead then maps by time only).
  const playRender = (r: RenderRow) => {
    if (!r.path) return;
    setWatching(undefined); setPicks([]); setHearing(undefined); setPlayRecord(false); stopAt.current = undefined;
    if (renderOn?.path === r.path) { setRate((x) => (x ? 0 : 1)); return; }
    setRenderOn(r);
    if (frame >= total) setFrameRaw(0);
    setRate(1);
  };
  const leaveRender = () => { setRate(0); setRenderOn(undefined); };
  // the cut as the render buttons and the Renders tab take it: named as the version it is shown as (the one viewed, the
  // one the cut equals, else the newest); a render "of this cut" is saved first when it has edits (useCut ensureSaved)
  const namedTl = { ...(rawTl ?? tl), version: viewing?.version ?? cut.ref ?? (rawTl ?? tl).version };
  const exportFcpxml = async () => {
    const r = await cut.exportCut();
    if (!r.url) { if (r.error) say(`The FCPXML could not be made: ${r.error}`); return; }
    const a = document.createElement('a');
    a.href = r.url; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  };
  const rTag = renderOn ? playTag(renderOn, cut.equals ?? `${cutName} with edits`, gapOf(renderOn.version)) : undefined;
  const renderTag = rTag && (
    <span data-render-tag className={cn('pointer-events-none absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-[5px] border bg-black/75 px-1.5 py-px text-[11px] duration-200 animate-in fade-in-0', rTag.older ? 'border-warn/50 text-warn' : 'border-white/25 text-ink')}>{rTag.text}</span>
  );
  const renderPlayer = (path: string) => (
    <>
      <RenderPlayer key={path} url={mediaUrl(repoPath(state.film.folder, state.film.repo, path))} path={path} sound={!!renderOn?.sound} name={`${renderOn?.title ?? ''}${renderOn?.extra ? `: ${renderOn.extra}` : ''}`}
        fps={fps} frame={frame} rate={rate} onFrame={(f) => setFrameRaw(Math.min(f, total))} onEnd={() => setRate(0)} className="absolute inset-0 size-full bg-black duration-200 animate-in fade-in-0" />
      <button type="button" data-render-back onClick={(e) => { e.stopPropagation(); leaveRender(); }} title="Back to the timeline (Esc)"
        className="absolute bottom-2 left-2 z-[6] inline-flex h-6 cursor-pointer items-center rounded-[6px] border border-white/15 bg-black/70 px-2 text-[11px] text-ink transition-colors duration-200 hover:bg-black/90">Back to the timeline</button>
    </>
  );
  const pic = pictureAt(shown ?? tl, frame);
  // the line of the script under the playhead (the timeline from day one): what "At the playhead" says with no picture
  const mainA = mainTracks(shown ?? tl).a;
  const lineHere = planned ? mainA?.clips.find((c) => c.plan === 'line' && !c.muted && startF(c, fps) <= frame && endF(c, fps) > frame) : undefined;
  // a line the previz take splits over several shots counts once
  const linesIn = (sc?: string) => (mainA?.clips ?? []).filter((c) => isFirstPart(c) && c.scene === sc).length;
  const lineIndex = (c: TimelineClip) => (mainA?.clips ?? []).filter((x) => isFirstPart(x) && x.scene === c.scene && x.at <= c.at + 1e-6).length;
  const plannedScene = (sc: string) => (mainTracks(shown ?? tl).v?.clips ?? []).some((c) => c.plan && c.scene === sc) || !(mainTracks(shown ?? tl).v?.clips ?? []).some((c) => sceneOfClip(c) === sc);
  // a shot counts once however many of its storyboard panels are boards of their own
  const shotsIn = (sc?: string) => new Set((mainTracks(shown ?? tl).v?.clips ?? []).filter((c) => c.plan && c.scene === sc).map((c) => c.shot ?? c.id)).size;
  // the picture under the playhead is one of the shots selected, shown in its place (not in the film)
  const picked = !!(pic && tryEdit && tryEdit.ids.includes(pic.clip.id));
  const scene = pic?.clip.takeRef ? state.scenes.find((s) => s.id === pic.clip.takeRef!.scene) : undefined;
  const clips = tl.tracks.reduce((n, t) => n + t.clips.length, 0);
  const fixture = cut.mode === 'fixture';
  const masterR = cut.renders.master;
  // the terminal workflow rendered a newer cut than the newest timeline version: flag it, offer to play it, ask Alma to catch up
  const ahead = fixture ? undefined : state.cut?.recordAhead;
  // a delivered film: the timeline is a record, nothing here waits or runs
  const settled = !fixture && state.film.status === 'delivered';
  // the record's label without the film's own name in front ("resolve edit 13b voices only")
  const aheadName = ahead ? ahead.label.replace(new RegExp(`^${state.film.slug.replace(/-/g, '[ -]')}[ -]*`, 'i'), '') || ahead.label : '';
  const aheadFigures = ahead ? `timeline ${ahead.timeline}${ahead.timelineDate ? ` · ${fmtDate(ahead.timelineDate)}` : ''} / record: ${ahead.file.split('/').pop()} · ${fmtDate(ahead.date)}` : '';
  const askCatchUp = () => {
    if (!ahead) return;
    ui.prefill(`Bring the timeline up to ${ahead.label} with the recipe at ${editRecipe} ("From the record"): the record has ${ahead.file} (${fmtDate(ahead.date)}), newer than cut/${ahead.timeline}.json${ahead.timelineDate ? ` (${fmtDate(ahead.timelineDate)})` : ''}. The cut to read is cut/working.json. Change the cut with a drop, as recipes/edit.md says, from the list or pieces ${ahead.label} was built from, so the timeline catches up.`,
      { id: `record:${ahead.file}`, label: `record · ${ahead.label}`, ref: ahead.file });
  };
  const recordPath = ahead ? repoPath(state.film.folder, state.film.repo, ahead.file) : undefined;
  // QC of the cut reads the 480p of the version (recipes/qc-critic.md): when it is missing, starting the check asks for
  // it first and waits for it (14 Nov, ASKS 44)
  // (only a saved version has a 480p: a cut with edits since is saved first, by renderProxy's ensureSaved)
  const qcVersion = cut.equals;
  const has480 = !!qcVersion && (!!(proxyR?.version === qcVersion && proxyR.state === 'done' && proxyR.path) || !!cut.refRenders?.proxy?.path);
  const qcTarget = {
    target: 'cut', label: 'cut', entry: qcEntry(state, 'cut', 'cut'), ready: true,
    waitsFor: has480 ? `the 480p of ${qcVersion}` : qcVersion ? `cut ${qcVersion} (its 480p is rendered first)` : 'the cut (saved as a version, and its 480p rendered first)',
    before: has480 ? undefined : {
      words: qcVersion ? `Rendering the 480p of ${qcVersion} for the check` : 'Saving the cut as a version and rendering its 480p for the check',
      run: async (): Promise<string | undefined> => {
        const asked = await cut.renderProxy();
        if (asked.error) return asked.error;
        if (asked.state?.state === 'done') return undefined;
        if (asked.state?.state === 'failed') return asked.state.error ?? 'the 480p failed';
        const got = asked.version ? await cut.proxyLanded(asked.version) : undefined;
        return got?.state === 'done' ? undefined : got ? got.error ?? 'the 480p failed' : 'the cut changed meanwhile: start the check again';
      },
    },
  };
  const transport = (
    <div className="flex items-center justify-center gap-2">
      <button type="button" aria-label="To the start" onClick={() => { setRate(0); setFrame(0); }} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><span className="flex items-center"><span className="h-3 w-[2px] bg-current" /><IconChevronLeft size={13} /></span></button>
      <button type="button" aria-label="Back one frame" onClick={() => { setRate(0); setFrame(frame - 1); }} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><IconChevronLeft size={14} /></button>
      <button type="button" aria-label={rate ? 'Pause' : 'Play'} onClick={() => { if (watching) { setWatching(undefined); setRate(frame >= total ? (setFrame(0), 1) : 1); return; } setRate((r) => (r ? 0 : (frame >= total ? (setFrame(0), 1) : 1))); }} className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-ink text-bg">
        {rate ? <span className="flex gap-[3px]"><span className="h-3 w-[3px] bg-bg" /><span className="h-3 w-[3px] bg-bg" /></span> : <IconPlay size={13} />}
      </button>
      <button type="button" aria-label="Forward one frame" onClick={() => { setRate(0); setFrame(frame + 1); }} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><IconChevronRight size={14} /></button>
      <button type="button" aria-label="To the end" onClick={() => { setRate(0); setFrame(total); }} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-sub hover:text-ink"><span className="flex items-center"><IconChevronRight size={13} /><span className="h-3 w-[2px] bg-current" /></span></button>
    </div>
  );
  const viewer = (
    <>
    <Viewer key={`${tryEdit ? `try:${picks.map((x) => `${x.src}#${x.n}`).join(',')}` : hearEdit ? 'hear' : fullView ? 'full' : soloed.size ? 'solo' : pressOn ? 'cut' : phoneFile ?? 'cut'}`} tl={shown ?? tl} frame={frame} rate={rate} total={total} file={phoneFile} solo={soloed}
      full={fullView} onLoading={sw.setLoading} onFail={fullView ? sw.fail : undefined}
      onFrame={(f) => { setFrameRaw(f); if (stopAt.current !== undefined && f >= stopAt.current) { stopAt.current = undefined; setRate(0); } }} onEnd={() => setRate(0)}
      className={cn('absolute inset-0 size-full bg-black object-contain', phoneFile && 'duration-200 animate-in fade-in-0')} />
    {/* the subtitle line under the playhead, always drawn over the live player; only the phone's 480p file has the lines
        in its picture already */}
    <SubtitleOverlay film={film} tl={shown ?? tl} frame={frame} burnt={!fixture && !!phoneFile} />
    {/* before the takes are in (15 Nov): the line being read, the planned shot, the board; nothing at all yet */}
    {planned && !phoneFile && <PlannedView tl={shown ?? tl} frame={frame} />}
    {empty && <span data-nothing-yet className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-[5px] border border-white/15 px-1.5 py-px text-[11px] text-sub">Nothing to play yet</span></span>}
    {/* while a join on the picture is moved: the first frame after it, as it would be */}
    {peek && (
      // eslint-disable-next-line @next/next/no-img-element -- a poster from /api/media at the frame after the join
      <img key="peek" alt="" data-peek={`${peek.src}@${peek.t}`} src={mediaUrl(peek.src, { w: 480, t: peek.t })} onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        className="pointer-events-none absolute inset-0 size-full bg-black object-contain animate-in fade-in-0 duration-150" />
    )}
    </>
  );
  const crumbs = [{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Edit' }, { label: cutName }];

  if (phone) {
    return (
      <PhoneEdit state={state} tl={tl} name={empty ? '' : viewing?.version ?? cut.equals ?? `${cutName} with edits`} frame={frame} fps={fps} total={total} setFrame={(f) => { setRate(0); setFrame(f); }}
        playing={rate !== 0} onPlay={() => setRate((r) => (r ? 0 : (frame >= total ? (setFrame(0), 1) : 1)))} viewer={viewer} transport={transport} file={phoneOwn?.kind} ahead={ahead && !settled ? aheadFigures : undefined}
        // played live (no file of this cut): the quiet line says so, and asks for the 480p where one can be made. No 480p
        // to ask for before there is a cut, of a cut that still holds planned clips (as on the desktop), of an older
        // version viewed, nor on a delivered film (nothing here runs)
        smoother={phoneFile || empty ? undefined
          : planned ? <PhoneLine words="Played live: planned clips are not rendered yet" />
          : viewing ? <PhoneLine words={`Played live: ${viewing.version} has no 480p or master`} />
          : settled ? <PhoneLine words="Played live: this cut has no 480p or master" />
          : <PhoneSmoother store={cut.rendersStore} version={cut.ref ?? ''} edited={!cut.equals} onAsk={() => void cut.renderProxy()} />}
        crumbs={crumbs} onNote={() => ui.prefill(`At ${tc}${pic ? ` (${clipName(pic.clip)})` : ''}: `, { id: `tc:${tc}`, label: `${pic?.clip.takeRef?.scene ?? 'cut'} · ${tc}` })} />
    );
  }

  // the timeline from day one (15 Nov): what a planned cut holds, in words; the two presses that change it as a step
  const pc = planned ? plannedCounts(tl) : undefined;
  // which storyboard version a scene's boards come from, and why: "Boards v8, the last checked; v10 is being made."
  // and, when they are older than the newest, which previz take the scene's lines follow: "Lines at take 4, the take of boards v4; take 9 is newer."
  const boardsNote = (sc?: string) => { const b = plan.data?.boards?.find((x) => x.scene === sc); return b ? `Boards ${b.version}, ${b.why}${b.newer ? `; ${b.newer}` : ''}.${b.lines ? ` ${b.lines}` : ''}` : ''; };
  const linesNote = (sc?: string) => plan.data?.boards?.find((x) => x.scene === sc)?.lines ?? '';
  const plannedWords = planned ? plannedSaid(tl) : '';
  const lower1 = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const planStep = async (run: () => Promise<{ ok: boolean; error?: string; words?: string }>, what: string) => {
    setPlanBusy(true);
    const r = await run();
    setPlanBusy(false);
    if (!r.ok) { say(`${what}: ${r.error ?? 'refused'}`); return; }
    if (r.words) say(`${r.words}. Undo takes it back.`);
    void cut.followServer();
  };
  const updateTimeline = () => planStep(() => plan.update(cut.working?.rev), 'The timeline was not updated');
  const putBoardsBack = (sc: string) => planStep(() => plan.boardsBack(sc, cut.working?.rev), 'The boards were not put back');
  const notice = viewing ? (
    <div className="flex items-center justify-between gap-3 rounded-[9px] border border-dashed border-edge-strong px-3.5 py-2 text-[12.5px] text-sub">
      <span>Viewing <span className="font-mono text-ink">{viewing.version}</span> · read only · {viewing.note}</span>
      <span className="flex gap-2">
        <Btn className="h-7 text-[12px]" title="Opening a version is one step. Undo brings back what you had." onClick={() => { const v = cut.versions.find((x) => x.version === viewing.version); if (v) void restore(v); }}>Restore {viewing.version}</Btn>
        <Btn ghost className="h-7 text-[12px]" onClick={() => setViewing(undefined)}>Back to the cut</Btn>
      </span>
    </div>
  ) : undefined;

  const kbd = 'ml-1 rounded-[4px] border border-edge-strong px-1 text-[11px] text-sub';
  // "Create subtitles" (ASKS 40): the request goes in Alma's box, named and listed, as the other asks here; not sent
  const askSubtitles = (again = false) => {
    const r = subtitlesAsk({ tl: { ...tl, version: almaName }, recipe: editRecipe, state, again, sceneOf: (c) => sceneOf(c, shots.by),
      takeOf: (c) => { const sc = sceneOf(c, shots.by), n = shotNo(c, shots.by); return `${sc ? `${sc} · ` : ''}${names.get(c.src ?? '') ?? c.takeRef?.take ?? clipName(c)}${n ? ` · shot ${n}` : ''}`; } });
    ui.prefill(r.text, r.chip);
  };
  const noSubs = !hasSubtitles(tl) && !planned && !empty;
  const unread = unreadableSplit(cut.unreadable, versionList, viewing?.version ?? cut.ref ?? '');
  // What's next: what each press does. Steps 2, 5 and 6 switch the tab under the timeline, 3 and 4 act on the timeline
  // above, only 7 leaves the page (14 Nov, ASKS 47)
  const showClip = (first?: { trackId: string; clipId: string; at: number }, frameTo?: number) => {
    if (!first) return;
    setRate(0); setWatching(undefined); setPicks([]); setExtra(undefined);
    setSel({ trackId: first.trackId, clipId: first.clipId });
    setFrame(frameTo ?? Math.round(first.at * fps));
    requestAnimationFrame(() => document.querySelector(`[aria-label="Timeline"] [data-track="${first.trackId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const doLeft = (d: LeftDo) => {
    const now = cut.current;
    switch (d.kind) {
      // the tick records the state it was made on (its content's hash) and, for its words, the version the cut is (the
      // one it equals, else the newest, with `edited` when it has edits since): never refused, nothing saved (3b)
      case 'tick': { const here = cut.hereNow(); if (now && cutRef) void left.tick({ tick: d.tick, cut: cutRef, ...(here ? { state: here.state, step: here.rev } : {}), ...(cutEdited ? { edited: true } : {}) }); return; }
      case 'start': setRate(0); setWatching(undefined); setFrame(0); return;
      case 'upscale': if (sw.res !== '1080') sw.setRes('1080'); setLowerTab('upscale'); return;
      case 'upscaled': {
        // nothing full size yet: the Seedance 2.5 ask for every take, as the bar's first button words it
        const src = sw.sources;
        if (!src || !masterNow) return;
        const takes = checkTakes(tl, masterNow.pieces, shots.by, names, src.info).takes;
        if (takes.length) ui.prefill(seedanceAsk(takes, almaCut, (s) => smpte(s, fps), fps), { id: `upscaled:${almaCut}`, label: `Seedance 2.5 · ${takes.length} ${takes.length === 1 ? 'take' : 'takes'}` });
        return;
      }
      case 'sound': showClip(soundCounts(tl).first, 0); return;
      case 'subs': showClip(subsCounts(tl).first); return;
      case 'subs-ask': askSubtitles(); return;
      case 'master':
        if (d.retry) void cut.renderMaster(true); else void cut.renderMaster(false, !!masterStale);
        openRenders(true);
        return;
      case 'renders': openRenders(); return;
      case 'release': router.push(`${base}/release`); return;
      // the early steps (15 Nov): Alma's box, a page of the film, the planned shots, the takes, the go sent as the user's words
      case 'idea': ui.focusBox(); return;
      case 'page': router.push(d.page === 'story' ? `${base}/story` : `${base}/${d.page}`); return;
      case 'planned': {
        const first = mainTracks(tl).v?.clips.find((c) => c.plan) ?? mainTracks(tl).a?.clips.find((c) => c.plan);
        showClip(first ? { trackId: first.plan === 'line' ? mainTracks(tl).a!.id : mainTracks(tl).v!.id, clipId: first.id, at: first.at } : undefined);
        return;
      }
      case 'takes-tab': setLowerTab('takes'); return;
      case 'go-takes': setSending(goTakesAsk(d.n, d.scenes)); return;
    }
  };
  const untick = (s: LeftStep) => { if (s.ticked) void left.tick({ untick: s.ticked }); };
  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5" role="toolbar" aria-label="Edit tools">
      {/* the pointer and the blade, with DaVinci's keys (the user, 13 Nov): A selects, B cuts where you click */}
      <div className="flex flex-none rounded-lg border border-edge p-0.5">
        {(['select', 'blade'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)} title={t === 'select' ? 'Pointer: select, move, trim (A)' : 'Blade: click a shot or a sound to cut it there (B). Then A, click the piece, Delete.'}
            className={cn('inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] transition-colors duration-150', tool === t ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>
            {t === 'select' ? 'Pointer' : 'Blade'}<span className="rounded-[4px] border border-edge-strong px-1 text-[10.5px] text-sub">{t === 'select' ? 'A' : 'B'}</span>
          </button>
        ))}
      </div>
      {/* enabled exactly when there is a step to take back or bring back; the hover says which (stage 2) */}
      <Btn className="h-7 text-[12px]" disabled={!undoStep || !!viewing} onClick={doUndo} title={stepTitle('undo', undoStep)} data-undo>Undo<span className={kbd}>{keyName('Z')}</span></Btn>
      <Btn ghost className="h-7 text-[12px]" disabled={!redoStep || !!viewing} onClick={doRedo} title={stepTitle('redo', redoStep)} data-redo>Redo<span className={kbd}>{keyName('Z', true)}</span></Btn>
      {/* everything before or after the line, on every track (the user, 13 Nov: "the buttons to select all of the
          items that are to the right of the line or to the left"); the keys are DaVinci's */}
      <div className="flex flex-none items-center rounded-lg border border-edge p-0.5" role="group" aria-label="Select from the line">
        <button type="button" onClick={() => selectFrom(frame, false)} title="Select every clip before the line, on every track (⌥⌘Y). On the selected clip's track only: ⌘Y"
          className="inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11.5 1v9M8 5.5H1.5M4 3 1.5 5.5 4 8" /></svg>
          All before
        </button>
        <span aria-hidden="true" className="h-4 w-px bg-edge" />
        <button type="button" onClick={() => selectFrom(frame, true)} title="Select every clip after the line, on every track (⌥Y). On the selected clip's track only: Y"
          className="inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
          All after
          <svg width="13" height="11" viewBox="0 0 13 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 1v9M5 5.5h6.5M9 3l2.5 2.5L9 8" /></svg>
        </button>
      </div>
      {/* the film's sounds, music, title cards and attached files, to put one at the playhead (14 Nov) */}
      <button type="button" aria-expanded={files?.mode === 'add'} onClick={() => (files?.mode === 'add' ? closeFiles() : openFiles('add'))}
        title="Pick a sound, a music file, a title card or a file attached in the chat, and put it at the playhead"
        className={cn('inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors duration-150', files?.mode === 'add' ? 'border-edge-strong bg-raised text-ink' : 'border-edge text-sub hover:bg-raised hover:text-ink')}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>
        Add a file…
      </button>
      {/* shown while the cut has no subtitle lines; it folds away once Alma's lines are in */}
      <span className={cn('inline-grid flex-none transition-[grid-template-columns,opacity,margin] duration-200 ease-out', noSubs ? 'grid-cols-[1fr] opacity-100' : 'pointer-events-none -ml-2 grid-cols-[0fr] opacity-0')} inert={!noSubs} aria-hidden={!noSubs}>
        {/* the button sits at the right of its fold, so folded it never reaches past the bar */}
        <span className="flex min-w-0 justify-end overflow-hidden">
          <button type="button" onClick={() => askSubtitles()} data-create-subs=""
            title="Puts the request in Alma's box: the cut and its dialogue. She writes the lines into the cut, one step you can undo"
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-edge px-2.5 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
            <svg width="12" height="11" viewBox="0 0 12 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><rect x="0.7" y="0.7" width="10.6" height="9.6" rx="1.8" /><path d="M3 6.3h3.4M3 8h6M7.8 6.3H9" /></svg>
            Create subtitles
          </button>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-[12px] text-mute" aria-live="polite">
        {soloed.size > 0 ? (
          <>
            <span className="truncate text-ink-3">Hearing only {tl.tracks.filter((t) => soloed.has(t.id)).map((t) => t.name).join(' and ')}</span>
            <button type="button" onClick={() => setSoloed(new Set())} className="flex-none cursor-pointer text-[12px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">Hear everything</button>
          </>
        ) : said ? <span key={said.k} data-said={said.amber ? 'alma' : 'user'} className={cn('line-in truncate', said.amber ? 'text-warn' : 'text-ink-3')} title={said.text}>{said.text}</span>
        : tool === 'blade' ? <span className="truncate text-ink-3">Blade: click where to cut. A goes back to the pointer.</span> : shots.waiting ? `Cutting ${shots.waiting} ${shots.waiting === 1 ? 'take' : 'takes'} into shots…` : ''}
      </span>
      <Btn className="h-7 text-[12px]" onClick={askAlma} title="Prefill the composer with the selection as SMPTE">Ask Alma</Btn>
    </div>
  );

  // ---- the film in shots
  const by = shots.by;
  const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const mainV = mainTracks(tl).v?.id;
  const selShotN = selFound ? shotNo(selFound.clip, by) : undefined;
  const selScene = selFound ? sceneOf(selFound.clip, by) : undefined;
  const picShot = pic ? shotNo(pic.clip, by) : undefined;
  const picScene = pic ? sceneOf(pic.clip, by) : undefined;
  const pinned = pin && frame >= pin.from && frame <= pin.to ? pin.scene : undefined;
  const openId = watching?.scene ?? selScene ?? pinned ?? picScene ?? (planned ? runs.find((r) => r.from <= frame && frame < r.to)?.scene : undefined);
  const gridScene = openId ? state.scenes.find((x) => x.id === openId) ?? { id: openId } : undefined;
  const takeLabel = (c: TimelineClip) => cap1(names.get((c.src ?? '')) ?? c.takeRef?.take ?? clipName(c));
  const secsOf = (f: number) => `${(Math.round((f / fps) * 10) / 10).toFixed(1)} s`;
  /** A shot as a version's note names it ("S2 shot 3"), when the shots are known. */
  const noteName = (c: TimelineClip) => { const n = shotNo(c, by), sc = sceneOf(c, by); return n && sc ? `${sc} shot ${n}` : undefined; };
  /** "Link again" on an unlinked clip: where they still line up, as before; else a carried sound pulled back to its picture. */
  const relinkOf = (r: ClipRef) => setLinked(tl, r, true) ?? relinkSound(tl, r, noteName);
  const openRun = (r: SceneRun) => { setRate(0); setSel(undefined); setWatching(undefined); setFrameRaw(r.from); setFocus((f) => ({ n: (f?.n ?? 0) + 1, from: r.from, to: r.to })); };
  const watched = watching ? by.get(watching.src) : undefined;
  const watchedShot = watching ? shotOf(watched, watching.n) : undefined;
  /** The film's own clip of the watched shot, when the film uses exactly that take's shot. */
  const watchedInFilm = watching ? mainTracks(tl).v?.clips.find((x) => x.src === watching.src && shotNo(x, by) === watching.n) : undefined;
  // ---- several shots selected (ASKS 52, the user, 14 Nov: "click through them, press play, and it would play basically
  // the ones that you've selected"). A click on a shot plays it from its take, as before, and selects it: one a shot
  // column of a scene, in any scenes. The film is then shown, scrubbed and played with every one of them in place.
  const order = state.scenes.map((x) => x.id);
  const pickKey = (p: { src: string; n: number }) => `${p.src}#${p.n}`;
  /** A click on a shot of a take: watch it; and, when the film does not use it already, select it (a click on a
   *  selected shot unselects it). The playhead goes to where it plays in the film with the shots selected. */
  const clickShot = (t: TakeShots, n: number) => {
    setRate(0); setSel(undefined); setRenderOn(undefined);
    const key = `${t.src}#${n}`;
    if (picks.some((p) => pickKey(p) === key)) { unpick(t, n); return; }
    setWatching({ scene: t.scene, n, src: t.src, k: nextK() });
    if (inFilm(tl, by).has(key)) return;
    const next = [...picks.filter((p) => !(p.scene === t.scene && p.n === n)), { scene: t.scene, n, src: t.src }];
    setPicks(next);
    const at = withPicks(tl, next, by, names, 'try', order)?.placed.find((x) => x.src === t.src && x.n === n)?.at;
    if (at !== undefined) setFrameRaw(at);
  };
  const unpick = (t: TakeShots, n: number) => {
    setRate(0);
    setPicks((cur) => cur.filter((p) => !(p.src === t.src && p.n === n)));
    if (watching?.src === t.src && watching.n === n) setWatching(undefined);
  };
  const backToFilm = () => { setRate(0); setWatching(undefined); setPicks([]); };
  /** "Use in the film": every selected shot in its place, one step of the history; one Undo takes them all out. */
  const putPicks = async () => {
    if (readOnly || !picks.length) return;
    const e = withPicks(tl, picks, by, names, undefined, order);
    setRate(0); setWatching(undefined); setPicks([]); setBoxFolded(false);
    if (!e) { sayRefused(); return; }
    await apply(e);
    const one = e.placed.length === 1 ? e.placed[0] : undefined;
    if (one && mainV) { setSel({ trackId: mainV, clipId: one.clipId }); setFrameRaw(one.at); }
  };
  /** One shot put in the film at once (the Takes view's menu): one step, as "Use in the film" with that one alone. */
  const putOne = async (t: TakeShots, n: number) => {
    if (readOnly) return;
    const e = withPicks(tl, [{ scene: t.scene, n, src: t.src }], by, names, undefined, order);
    setRate(0); setWatching(undefined);
    setPicks((cur) => cur.filter((p) => !(p.scene === t.scene && p.n === n)));
    if (!e) { sayRefused(); return; }
    await apply(e);
    if (mainV) { setSel({ trackId: mainV, clipId: e.placed[0].clipId }); setFrameRaw(e.placed[0].at); }
  };
  // what the selection says: in the floating box, its hover text, and Alma's pinned chip
  const pickScenes = sceneOrder(picks.map((p) => p.scene));
  const pickSet = new Set(picks.map(pickKey));
  const tryD = tryEdit ? totalF(tryEdit.tl) - totalF(tl) : 0;
  const picksCount = `${picks.length} ${picks.length === 1 ? 'shot' : 'shots'} selected${pickScenes.length > 1 ? ` in ${pickScenes.length} scenes` : ''}`;
  const picksHover = (() => {
    if (!picks.length) return '';
    const n = (sc: string) => picks.filter((p) => p.scene === sc).length;
    const here = openId && pickScenes.includes(openId) ? [`${n(openId)} here in ${openId}`] : [];
    const others = [...pickScenes].filter((sc) => sc !== openId).sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9)).map((sc) => `${n(sc)} in ${sc}`);
    const len = tryD ? ` The film is ${secsOf(Math.abs(tryD))} ${tryD > 0 ? 'longer' : 'shorter'} with them.` : '';
    return `${[...here, ...others].join(', ')}. Play to watch the film with them. The film is untouched.${len}`;
  })();
  // ---- "Edit this video" (ASKS 51): the shot (or the whole take) in front of Alma as one chip; the cursor in her box.
  // Nothing is sent or made until the user sends; a second one replaces the first.
  const editVideo = (t: TakeShots, n?: number) => {
    const sh = n ? shotOf(t, n) : undefined;
    const all = shotsOf(t);
    const take = cap1(names.get(t.src) ?? t.name);
    const mid = sh ? (sh.in + sh.out) / 2 : (t.seconds ?? 0) / 2;
    const ref = [
      'Edit this video: the user wants a variation of it, made as their message says.',
      `Scene: ${t.scene}.`,
      `Take: ${take}, file ${t.src}.`,
      sh ? `Shot ${n}${sh.i !== sh.n ? ` of the scene (the take's shot ${sh.i})` : ' of the take'}: in ${sh.in.toFixed(2)} s, out ${sh.out.toFixed(2)} s (${(sh.out - sh.in).toFixed(1)} s).`
        : `The whole take: ${(t.seconds ?? 0).toFixed(2)} s${all.length ? `, ${all.length} ${all.length === 1 ? 'shot' : 'shots'}` : ''}.`,
      `Where the variation goes and how the Takes view shows it: ${editRecipe}, "A variation of a take".`,
    ].join('\n');
    ui.addChip({ id: 'edit-video', label: `Edit: ${t.scene} · ${take}${n ? ` · shot ${n}` : ''}`, ref, image: mediaUrl(t.src, { w: 160, t: Math.round(mid * 100) / 100 }), placeholder: 'What should change in this video?' });
    ui.focusBox();
    if (t.state === 'ready' && all.length) { setRate(0); setSel(undefined); setRenderOn(undefined); setWatching({ scene: t.scene, n: n ?? all[0].n, src: t.src, k: nextK() }); }
  };
  const copyPath = (t: TakeShots) => {
    const done = () => say(`Copied the path of ${t.scene} · ${cap1(names.get(t.src) ?? t.name)}: ${t.src}`);
    const fail = () => say(`Copy this path: ${t.src}`);
    try { void navigator.clipboard.writeText(t.src).then(done, fail); } catch { fail(); }
  };
  // ---- shots and scenes out of the film (13 Nov: "the scenes should be disabled, and then it should jump from
  // one scene that I had to another scene … press on one of them, and then it reappears. Then I can Command-Z")
  // (only once the picture's clips are known by scene: before the takes are read, a cut without takeRefs has none)
  const absent = !runs.some((r) => r.scene) ? [] : state.scenes.filter((x) => !runs.some((r) => r.scene === x.id))
    .map((x) => ({ scene: x.id, title: x.title, at: sceneAnchor(shown ?? tl, by, x.id, order) }));
  // (the shots selected stay: they belong to the selection, not to what the playhead or the timeline does)
  const leaveTries = () => { setRate(0); setWatching(undefined); setExtra(undefined); };
  const openAbsent = (sc: string, at: number) => { leaveTries(); setSel(undefined); setFrameRaw(at); setPin({ scene: sc, from: at, to: at }); };
  const shotOut = (t: TakeShots, n: number) => {
    if (readOnly) return;
    const pieces = shotClips(tl, by, t.scene, n);
    const e = takeOutShot(tl, by, t.scene, n, cap1(names.get(t.src) ?? t.name));
    if (!e || !pieces.length) { sayRefused(); return; }
    const f = Math.min(...pieces.map((c) => startF(c, fps)));
    leaveTries(); setSel(undefined);
    setFrameRaw(f); setPin({ scene: t.scene, from: f, to: f });
    void apply(e);
    say(`${t.scene} shot ${n} is out of the film; what followed closes up. ⌘Z brings it back.`);
  };
  const sceneOut = (sc: string) => {
    if (readOnly) return;
    const pieces = shotClips(tl, by, sc);
    const e = takeOutScene(tl, by, sc);
    if (!e || !pieces.length) { sayRefused(); return; }
    const f = Math.min(...pieces.map((c) => startF(c, fps)));
    leaveTries(); setSel(undefined);
    setFrameRaw(f); setPin({ scene: sc, from: f, to: f });
    void apply(e);
    say(`${sc} is out of the film; the scene before runs straight into the one after. Click any of its shots to bring it back, or ⌘Z.`);
  };
  /** A click on a shot whose column has nothing in the film: it goes back in its place, and plays from just before. */
  const bringBack = async (t: TakeShots, n: number) => {
    if (readOnly) return;
    const name = names.get(t.src) ?? t.name;
    const e = putShot(tl, t.scene, n, t, name, by, undefined, order);
    if (!e) { sayRefused(); return; }
    leaveTries();
    await apply({ ...e, note: `${t.scene} shot ${n} put back in the film (${cap1(name)})` });
    if (mainV) setSel({ trackId: mainV, clipId: e.clipId });
    setPin({ scene: t.scene, from: Math.max(0, e.at - 2 * fps), to: e.at + e.frames });
    setFrameRaw(Math.max(0, e.at - 2 * fps));
    setRate(1);
    say(`${t.scene} shot ${n} is back in the film (${cap1(name)}), playing from just before it. ⌘Z takes it out again.`);
  };
  // a retake is of the whole shot: on a planned shot (a board panel among its others) the words, length and
  // start are the shot's, whichever panel is selected
  const retakeOf = (t: TimelineTrack, c: TimelineClip, scene: string | undefined, n: number) => {
    const planned = tl ? retakeWords(tl, c, almaCut, (s) => smpte(s, fps)) : undefined;
    const sp = planned && tl ? shotSpan(tl, c) : undefined;
    if (planned && sp) { ui.prefill(planned, { ...clipChip(t, sp.first), label: `${t.id} · ${sp.scene} · shot ${sp.shot} · ${smpte(sp.at, fps)}` }); return; }
    ui.prefill(`Retake ${scene ?? ''} shot ${n} (${takeLabel(c)}, ${secsOf(lenF(c, fps))}, at ${smpte(c.at, fps)} in cut ${almaCut}). What should change: `, clipChip(t, c));
  };
  const askRetake = () => {
    const f = selClip();
    if (!f || !selShotN) return;
    retakeOf(f.track, f.clip, selScene, selShotN);
  };
  // where the video is, for the line across the takes: the take being watched, else the film's own shot
  const gridHead = (() => {
    if (watching && watched) {
      const sh = shotsOf(watched).find((x) => watchT >= x.in && watchT < x.out) ?? watchedShot;
      return sh ? { n: sh.n, p: (watchT - sh.in) / Math.max(0.04, sh.out - sh.in) } : undefined;
    }
    if (!pic || !picShot || picScene !== openId) return undefined;
    const sh = shotOf(by.get((pic.clip.src ?? '')), picShot);
    if (!sh) return undefined;
    const t = pic.clip.in + ((frame - startF(pic.clip, fps)) * (pic.clip.speed && pic.clip.speed > 0 ? pic.clip.speed : 1)) / fps;
    return { n: picShot, p: (t - sh.in) / Math.max(0.04, sh.out - sh.in) };
  })();
  // ---- the playhead moved from the Takes view (ASKS 53): the same playhead as the timeline's, whole frames, nothing
  // written. Shot `n` of the open scene, `p` of the way through it as the line across the takes measures it.
  const seekTakes = (n: number, p: number) => {
    if (!gridScene) return;
    const sh = shown ?? tl;
    const fr = (c: TimelineClip) => ({ a: startF(c, fps), b: endF(c, fps) });
    const here = shotClips(sh, by, gridScene.id, n).filter((c) => !c.muted).sort((x, y) => x.at - y.at);
    let f: number | undefined;
    if (here.length) {
      const s = shotOf(by.get(here[0].src ?? ''), n);
      if (s) {
        const t = s.in + p * (s.out - s.in);
        const c = here.find((x) => t >= x.in && t <= x.out) ?? (t < here[0].in ? here[0] : here[here.length - 1]);
        const { a, b } = fr(c);
        f = Math.max(a, Math.min(b - 1, a + Math.round(((Math.max(c.in, Math.min(c.out, t)) - c.in) * fps) / speedOf(c))));
      } else {
        const a = fr(here[0]).a, b = fr(here[here.length - 1]).b;
        f = Math.round(a + p * Math.max(0, b - 1 - a));
      }
    } else {
      // a column out of the film: the nearest shot of the scene that is in it
      const all = shotClips(sh, by, gridScene.id).filter((c) => !c.muted).sort((x, y) => x.at - y.at);
      const after = all.find((c) => (shotNo(c, by) ?? 0) > n);
      const before = [...all].reverse().find((c) => (shotNo(c, by) ?? 0) < n);
      f = after ? fr(after).a : before ? fr(before).b - 1 : undefined;
    }
    if (f === undefined) return;
    setRate(0); setWatching(undefined); setFrame(f);
  };
  /** Dragged past the scene's left or right edge: on into the scene before or after (the Takes view follows). */
  const seekEdge = (dir: -1 | 1): boolean => {
    if (!gridScene) return false;
    const mine = runs.filter((r) => r.scene === gridScene.id);
    if (!mine.length) return false;
    const to = dir < 0 ? mine[0].from - 1 : mine[mine.length - 1].to;
    if (to < 0 || to >= total) return false;
    setRate(0); setWatching(undefined); setSel(undefined); setPin(undefined); setFrame(to);
    return true;
  };
  // ---- the Takes view's right-click menu (ASKS 51): on a shot, or on a take's name
  const takeItems = (() => {
    const t = takeMenu ? shots.takes.find((x) => x.src === takeMenu.src) : undefined;
    if (!takeMenu || !t) return undefined;
    const take = cap1(names.get(t.src) ?? t.name);
    const canEdit = t.state === 'ready';
    const edit: MenuItem = { label: 'Edit this video…', hint: 'with Alma', disabled: !canEdit, onPick: () => editVideo(t, takeMenu.n) };
    const copy: MenuItem = { label: 'Copy its path', sepBefore: true, onPick: () => copyPath(t) };
    const n = takeMenu.n;
    const sh = n ? shotOf(t, n) : undefined;
    if (!n || !sh) return { title: `${t.scene} · ${take}`, items: [edit, copy] };
    const key = `${t.src}#${n}`;
    const isIn = inFilm(tl, by).has(key);
    const colOut = !shotClips(tl, by, t.scene, n).length;
    const ro = readOnly || !!hearEdit;
    const put: MenuItem = isIn
      ? { label: 'Take it out of the film', hint: picks.length ? 'not while shots are selected' : '⌘Z brings it back', disabled: ro || picks.length > 0, onPick: () => shotOut(t, n) }
      : { label: 'Use in the film', hint: colOut ? 'puts it back' : undefined, disabled: ro, onPick: () => void (colOut ? bringBack(t, n) : putOne(t, n)) };
    return {
      title: `${t.scene} · ${take} · shot ${n} · ${secsOf(Math.round((sh.out - sh.in) * fps))}`,
      items: [edit, { label: 'Watch it', hint: 'click', onPick: () => (picks.some((p) => pickKey(p) === key) || colOut ? (setRate(0), setSel(undefined), setWatching({ scene: t.scene, n, src: t.src, k: nextK() })) : clickShot(t, n)) }, put, copy],
    };
  })();
  // ---- the right-click menu: every entry that goes to Alma carries the point it was opened at
  const describeClip = (c: TimelineClip) => { const n = shotNo(c, by); const sc = sceneOf(c, by); return n && sc ? `${sc} shot ${n} (${takeLabel(c)})` : clipName(c); };
  const openMenu = (m: { x: number; y: number; frame: number; trackId?: string; clipId?: string }) => {
    if (picks.length) return;
    setRate(0);
    setWatching(undefined);
    setFrameRaw(Math.max(0, Math.min(total, m.frame)));
    const f = m.trackId && m.clipId ? findClip(tl, { trackId: m.trackId, clipId: m.clipId }) : undefined;
    const inGroup = !!f && group.length > 1 && group.some((r) => r.trackId === f.track.id && r.clipId === f.clip.id);
    if (f) { if (!inGroup) onSelect({ trackId: f.track.id, clipId: f.clip.id }, f.clip, f.track); } else setSel(undefined);
    setMenu(m);
  };
  // ---- a dissolve at a join of two shots (the render's `dissolve` on the later shot; 13 Nov): 6, 12 or 24 frames or
  // none, a choice that does not fit greyed with why, one the files cannot fully feed still offered (the render holds
  // a frame); and the sound of the two shots cross-fading too, or cutting hard
  const dissolveItem = (L: TimelineClip, R: TimelineClip): MenuItem => {
    const left = { trackId: mainV!, clipId: L.id }, right = { trackId: mainV!, clipId: R.id };
    const nowF = toF(R.dissolve ?? 0, fps);
    const sj = soundJoin(tl, left, right);
    const sNow = sj ? toF(findClip(tl, sj.right)?.clip.dissolve ?? 0, fps) : 0;
    const secs = (n: number) => `${Math.round((n / fps) * 100) / 100} s`;
    const pick = (n: number) => {
      let e = setDissolve(tl, right, n, noteNameOf);
      if (!e) return;
      // a sound that cross-faded as long as the picture dissolved keeps in step with it
      if (n > 0 && sj && sNow && sNow === nowF) { const s2 = setSoundDissolve(e.tl, left, right, n, noteNameOf); if (s2) e = { tl: s2.tl, note: `${e.note}, their sound too` }; }
      void apply(e);
    };
    const choice = (n: number): MenuItem => {
      const p = dissolvePlan(tl, right, n, srcSeconds);
      return { label: n ? `${n} frames` : 'None', checked: nowF === n, hint: !p.fits ? p.why : p.holds ?? (n ? secs(n) : undefined), disabled: readOnly || !p.fits, onPick: () => pick(n) };
    };
    const sizes = [6, 12, 24, ...(nowF && ![6, 12, 24].includes(nowF) ? [nowF] : [])].sort((a, b) => a - b);
    const want = nowF || 12;
    return {
      label: 'Dissolve between these two shots…', hint: nowF ? `${nowF} f` : 'none',
      sub: [
        ...sizes.map(choice), choice(0),
        { label: 'Cross-fade their sound too', sepBefore: true, checked: !!sj && sNow > 0, hint: !sj ? 'no linked sound' : sNow ? `${sNow} f` : `${Math.min(want, maxDissolveF(tl, sj.right))} f`,
          disabled: readOnly || !sj || (sNow > 0 && sNow === Math.min(want, maxDissolveF(tl, sj.right))), onPick: () => void apply(setSoundDissolve(tl, left, right, want, noteNameOf)) },
        { label: 'Cut the sound hard', checked: !!sj && sNow === 0, hint: !sj ? 'no linked sound' : undefined, disabled: readOnly || !sj || sNow === 0, onPick: () => void apply(setSoundDissolve(tl, left, right, 0, noteNameOf)) },
      ],
    };
  };
  const menuItems = ((): { title: string; items: MenuItem[] } | undefined => {
    if (!menu) return undefined;
    const f = menu.frame;
    const at = smpte(f / fps, fps);
    const track = menu.trackId ? tl.tracks.find((t) => t.id === menu.trackId) : undefined;
    const hit = menu.trackId && menu.clipId ? findClip(tl, { trackId: menu.trackId, clipId: menu.clipId }) : undefined;
    const under = pictureAt(tl, f);
    // the nearest join of two picture clips within a second of the pointer
    const v = [...(mainTracks(tl).v?.clips ?? [])].sort((a, b) => a.at - b.at);
    let join: { at: number; left: TimelineClip; right: TimelineClip } | undefined;
    // …and the nearest where the two shots touch, as the drag of a join needs: carrying the sound and the dissolve act
    // on that one (14 Nov: a join a frame apart nearer the pointer used to hide them for a touching one beside it)
    let touch: typeof join;
    for (let i = 1; i < v.length; i++) {
      const cutF = startF(v[i], fps);
      if (Math.abs(cutF - f) > fps) continue;
      const gap = Math.abs(cutF - endF(v[i - 1], fps));
      if (gap <= 1 && (!join || Math.abs(cutF - f) < Math.abs(join.at - f))) join = { at: cutF, left: v[i - 1], right: v[i] };
      if (gap === 0 && (!touch || Math.abs(cutF - f) < Math.abs(touch.at - f))) touch = { at: cutF, left: v[i - 1], right: v[i] };
    }
    const where = `${at} in cut ${almaCut}${under ? `, over ${describeClip(under.clip)}` : ''}${join ? `, ${Math.abs(join.at - f) <= 2 ? 'on' : `${(Math.abs(join.at - f) / fps).toFixed(1)} s ${f < join.at ? 'before' : 'after'}`} the join of ${describeClip(join.left)} and ${describeClip(join.right)}` : ''}`;
    const chip = { id: `at:${almaCut}:${f}`, label: `${under ? sceneOf(under.clip, by) ?? 'cut' : 'cut'} · ${at}` };
    const onTrack = track?.kind === 'audio' && track.id !== mainTracks(tl).a?.id ? `on ${track.id} ${track.name}` : 'on the effects track';
    const ref = hit ? { trackId: hit.track.id, clipId: hit.clip.id } : undefined;
    const hitShot = hit ? shotNo(hit.clip, by) : undefined;
    const items: MenuItem[] = [
      { label: 'Add an effect here…', hint: 'Alma makes it', onPick: () => ui.prefill(`Add an effect at ${where}. Its own clip ${onTrack}, nothing else changed. The effect: `, chip) },
      { label: 'Add a file here…', hint: 'one you have', disabled: readOnly, onPick: () => openFiles('add', track && (track.kind === 'audio' || track.kind === 'video') ? track.id : undefined) },
      ...(join ? [{ label: 'About the sound across this join…', onPick: () => ui.prefill(`About the sound across the join at ${smpte(join.at / fps, fps)} in cut ${almaCut}, where ${describeClip(join.left)} ends and ${describeClip(join.right)} begins. What I hear: `, { id: `join:${almaCut}:${join.at}`, label: `join · ${smpte(join.at / fps, fps)}` }) }] : []),
      // carrying the sound and the dissolve act on the cut: only on a join where the two shots touch, as the drag of a
      // join needs (14 Nov; Alma's entry above also takes two shots a frame apart)
      ...(touch && mainV ? [((join) => {
        // the sound of one shot heard under the other (the user: "make sure that the sound bleeds in from the shot
        // before"): what an Option-drag of its edge does, in one step, with a fade over the new stretch
        const carry = (pic: TimelineClip, edge: 'head' | 'tail', sec: number, first?: boolean): MenuItem => {
          const ref = { trackId: mainV, clipId: pic.id };
          const want = Math.round(sec * fps);
          const p = carryPlan(tl, ref, edge, want, srcSeconds);
          const none = p.reach <= p.now;
          return {
            // short enough for one line in the menu, the sub-list's title giving the rest
            label: edge === 'tail' ? `Earlier sound runs on ${sec} s` : `Later sound starts ${sec} s early`, sepBefore: first,
            hint: none ? ({ 'no more sound in the file': 'no more sound', 'file length unknown': 'length unknown', 'no sound of its own': 'no sound' }[p.why ?? ''] ?? p.why) : p.reach < want ? `only ${p.reach} f` : undefined,
            disabled: readOnly || none, onPick: () => void apply(carrySound(tl, ref, edge, want, srcSeconds, noteName)),
          };
        };
        return { label: 'Carry the sound over this join…', hint: 'both heard',
          sub: [carry(join.left, 'tail', 0.5), carry(join.left, 'tail', 1), carry(join.left, 'tail', 2), carry(join.right, 'head', 0.5, true), carry(join.right, 'head', 1), carry(join.right, 'head', 2)] };
      })(touch)] : []),
      ...(touch && mainV ? [dissolveItem(touch.left, touch.right)] : []),
      { label: 'Tell Alma about this point…', onPick: () => ui.prefill(`At ${where}: `, chip) },
      { label: 'Play from here', hint: 'Space', sepBefore: true, onPick: () => { setFrameRaw(f); setRate(1); } },
      { label: 'Save this frame…', hint: under ? 'PNG' : 'no picture here', disabled: !under, onPick: () => void saveFrame(f) },
      ...(hit && hit.track.kind === 'video' && fullMarks?.get(hit.clip.id)?.kind === 'small' ? [{ label: 'Upscale on Higgsfield…', hint: 'the whole take', onPick: () => askUpscale(hit.clip.src) }] : []),
      ...(hit && hit.track.kind === 'video' && fullMarks && fullMarks.get(hit.clip.id)?.kind !== 'small' && !fullFor?.info.takes[(hit.clip.src ?? '')] ? [{ label: seedance.marks.has((hit.clip.src ?? '')) ? 'Do not redo in Seedance' : 'Redo in Seedance', hint: 'the whole take', onPick: () => seedance.toggle((hit.clip.src ?? '')) }] : []),
      ...(hit && hitShot && hit.track.id === mainV ? [{ label: 'Retake this shot…', disabled: readOnly, onPick: () => retakeOf(hit.track, hit.clip, sceneOf(hit.clip, by), hitShot) }] : []),
      ...(ref && hit && isLine(hit.clip) ? [{ label: 'Retype…', hint: 'Enter', disabled: readOnly || hit.track.locked, onPick: () => retypeSel(ref) }] : []),
      ...(ref && hit && isSrtClip(hit.clip) ? [{ label: 'Split into lines to edit', hint: 'a line a cue', disabled: readOnly || hit.track.locked, onPick: () => void splitSrtClip(ref) }] : []),
      ...(ref && hit && (hit.track.kind === 'video' || hit.track.kind === 'audio') ? (() => {
        // faster or slower, the voice keeping its tone: this shot, or every shot of its scene
        const SPEEDS = [75, 90, 100, 110, 125, 150, 200];
        const nowPct = Math.round(speedOf(hit.clip) * 100);
        const sc = hit.track.id === mainV ? sceneOf(hit.clip, by) : undefined;
        const sceneRefs = sc ? (mainTracks(tl).v?.clips ?? []).filter((c) => sceneOf(c, by) === sc).map((c) => ({ trackId: mainV!, clipId: c.id })) : [];
        const choices = (refs: { trackId: string; clipId: string }[], what?: string): MenuItem[] => SPEEDS.map((p) => ({
          label: `${p}%${p === 100 ? ' · normal' : p < 100 ? ' · slower' : ' · faster'}`, hint: refs.length === 1 && p === nowPct ? 'now' : undefined,
          disabled: readOnly, onPick: () => void apply(retimeClips(tl, refs, p / 100, what)),
        }));
        return [
          { label: hitShot && hit.track.id === mainV ? 'Speed of this shot…' : 'Speed of this clip…', hint: `${nowPct}%`, sub: choices([ref]) },
          ...(sc && sceneRefs.length > 1 ? [{ label: `Speed of all of ${sc}…`, hint: `${sceneRefs.length} shots`, sub: choices(sceneRefs, `scene ${sc}`) }] : []),
        ];
      })() : []),
      ...(ref && hit && hit.track.kind === 'video' ? [{
        // the render's mirror (flip), on the picture alone: its sound is never touched
        label: hit.clip.flip ? 'Stop mirroring' : 'Mirror this shot', hint: hit.clip.flip ? 'mirrored now' : 'left to right', disabled: readOnly || !!hit.track.locked,
        onPick: () => { void apply(setFlip(tl, ref, !hit.clip.flip, noteNameOf)); },
      }] : []),
      ...(ref && hit && (hit.track.id === mainV || hit.track.kind === 'audio') ? (() => {
        const un = hit.track.id === mainV || hit.track.id === mainTracks(tl).a?.id ? setLinked(tl, ref, false) : undefined;
        const lined = setLinked(tl, ref, true), re = relinkOf(ref);
        const sound = hit.track.kind === 'audio';
        if (un) return [{ label: sound ? 'Unlink from the picture' : 'Unlink the sound', disabled: readOnly, onPick: () => void apply(un) }];
        // a sound carried past its picture (on the track beside, say) goes back to its picture's length and place
        if (hit.clip.unlinked || (re && !lined)) return [{ label: sound ? 'Link to the picture again' : 'Link the sound again', hint: re ? (lined ? undefined : 'back to the picture\'s length') : 'not lined up', disabled: readOnly || !re, onPick: () => void apply(re) }];
        return [];
      })() : []),
      ...(ref && hit && hit.track.kind === 'audio' && isSoundFile(hit.clip.src) ? (() => {
        const opts = options.get(dirOf(hit.clip.src));
        return [{ label: 'Another option for this effect…', hint: opts?.length ? `${opts.length} so far` : undefined, sepBefore: true, onPick: () => askAnother(hit, opts) }];
      })() : []),
      ...(ref && hit && hit.track.kind === 'audio' ? [{ label: 'Replace with another file…', hint: 'keeps its place', sepBefore: !isSoundFile(hit.clip.src), disabled: readOnly || hit.track.locked, onPick: () => openFiles('replace', undefined, ref) }] : []),
      ...(ref && hit && tl.tracks.filter((t) => t.kind === hit.track.kind && t.id !== hit.track.id).length ? [{
        label: 'Move to another track…', hint: 'or drag it there', sepBefore: true,
        sub: tl.tracks.filter((t) => t.kind === hit.track.kind && t.id !== hit.track.id).map((t): MenuItem => {
          const ok = canMoveToTrack(tl, ref, t.id);
          return { label: `${t.id} ${t.name}`, hint: ok ? 'same time' : t.locked ? 'locked' : 'no room there', disabled: readOnly || !ok, onPick: () => { void apply(moveToTrack(tl, ref, t.id)); setSel({ trackId: t.id, clipId: ref.clipId }); } };
        }),
      }] : []),
      ...(ref && hit ? [{ label: 'Copy', hint: '⌘C', sepBefore: true, onPick: () => { copySel(); } }] : []),
      ...(held ? (() => {
        const first = held.items[0];
        const lane = track && held.items.some((i) => i.kind === track.kind) && !track.locked ? track : undefined;
        const to = held.items.length === 1 ? lane ?? trackOfKind(first.kind, first.trackId) : undefined;
        const name = held.items.length === 1 || (held.items.length === 2 && held.items[0].kind !== held.items[1].kind && held.items[0].clip.src === held.items[1].clip.src) ? clipName(first.clip) : `${held.items.length} clips`;
        return [{ label: `Paste “${name.length > 24 ? `${name.slice(0, 23).trim()}…` : name}” here`, hint: to ? `${to.id} · ⌘V` : '⌘V', sepBefore: !(ref && hit), disabled: readOnly || (held.items.length === 1 && !to), onPick: () => void pasteHeld(f, lane?.id) }];
      })() : []),
      ...(ref && hit ? [
        { label: 'Split here', hint: '⌘B', disabled: readOnly || f <= startF(hit.clip, fps) || f >= endF(hit.clip, fps), onPick: () => void apply(splitClip(tl, ref, f)) },
        { label: hitShot && hit.track.id === mainV ? 'Delete this shot' : 'Delete this clip', hint: '⌫', danger: true, disabled: readOnly, onPick: () => { const e = deleteClip(tl, ref, ripple); void apply(e); if (e) setSel(undefined); } },
      ] : []),
      { label: 'Select from here on…', sepBefore: true, sub: [
        ...(track ? [{ label: `On ${track.id} ${track.name}`, hint: 'Y', onPick: () => selectFrom(f, true, track.id) }] : []),
        { label: 'On every track', hint: '⌥Y', onPick: () => selectFrom(f, true) },
        ...(track ? [{ label: `Before here, on ${track.id}`, hint: '⌘Y', onPick: () => selectFrom(f, false, track.id) }] : []),
        { label: 'Before here, on every track', hint: '⌥⌘Y', onPick: () => selectFrom(f, false) },
      ] },
      { label: 'Marker here', disabled: readOnly, onPick: () => setMarkerText('') },
    ];
    return { title: `${at}${hit ? ` · ${describeClip(hit.clip)}` : track ? ` · ${track.name}` : ''}`, items };
  })();
  // ---- the track menu. What names a track and would point at nothing once it is gone is let go of with it: the
  // selection, the paste marks, the tracks heard alone, an option being heard, a nudge waiting to be saved.
  const forgetTracks = (ids: string[]) => {
    const gone = new Set(ids);
    if (!gone.size) return;
    if (sel && gone.has(sel.trackId)) { setSel(undefined); setExtra(undefined); }
    else setExtra((x) => (x && x.refs.some((r) => gone.has(r.trackId)) ? { ...x, refs: x.refs.filter((r) => !gone.has(r.trackId)) } : x));
    setSoloed((cur) => ([...cur].some((id) => gone.has(id)) ? new Set([...cur].filter((id) => !gone.has(id))) : cur));
    setPasteTo((cur) => {
      if (!(cur.video && gone.has(cur.video)) && !(cur.audio && gone.has(cur.audio))) return cur;
      const next = { video: cur.video && gone.has(cur.video) ? undefined : cur.video, audio: cur.audio && gone.has(cur.audio) ? undefined : cur.audio };
      try { sessionStorage.setItem(`hh:paste-to:${film}`, JSON.stringify(next)); } catch { /* this page only */ }
      return next;
    });
    setHearing((h) => (h && gone.has(h.ref.trackId) ? undefined : h));
    setNudge((n) => (n && n.refs.some((r) => gone.has(r.trackId)) ? undefined : n));
    setRenaming((r) => (r && gone.has(r) ? undefined : r));
  };
  const headItems = ((): { title: string; items: MenuItem[] } | undefined => {
    const t = headMenu ? tl.tracks.find((x) => x.id === headMenu.trackId) : undefined;
    if (!t) return undefined;
    const ro = readOnly || picks.length > 0 || !!hearEdit;
    const pictures = tl.tracks.filter((x) => x.kind === 'video').length;
    // which picture covers which goes by the number in the id, not by the rows (V2 over V1): said on the moves
    const layering = t.kind === 'video' && pictures > 1 ? 'higher number still covers' : undefined;
    const move = (dir: -1 | 1): MenuItem => {
      const why = whyNotMoveTrack(tl, t.id, dir);
      return { label: dir < 0 ? 'Move up' : 'Move down', hint: why ?? layering, disabled: ro || !!why, onPick: () => void apply(moveTrack(tl, t.id, dir)) };
    };
    const whyNot = whyNotDeleteTrack(tl, t.id);
    const n = t.clips.length;
    const empties = emptyTracks(tl);
    return {
      title: `${t.id} ${t.name}${n ? ` · ${n} clip${n === 1 ? '' : 's'}` : ' · empty'}`,
      items: [
        // a subtitles track (ASKS 40): its lines out as an .srt, or Alma asked to write them again
        ...(t.kind === 'captions' ? ((lines: number): MenuItem[] => [
          { label: 'Save as an .srt file', hint: lines ? `${lines} ${lines === 1 ? 'line' : 'lines'}` : 'no lines', disabled: !lines,
            onPick: () => { const k = downloadSrt(`${film}-${fileTag}-${t.id}.srt`, t, fps); say(`Saved ${k} ${k === 1 ? 'line' : 'lines'} of ${t.id} ${t.name} as ${film}-${fileTag}-${t.id}.srt on this device.`); } },
          { label: 'Create subtitles again…', hint: 'Alma writes them', disabled: ro, onPick: () => askSubtitles(true) },
        ])(t.clips.filter((c) => isLine(c) && !c.muted).length) : []),
        { label: 'Rename…', sepBefore: t.kind === 'captions', disabled: ro, onPick: () => setRenaming(t.id) },
        { ...move(-1), sepBefore: true },
        move(1),
        { label: n ? `Delete track · ${n} clip${n === 1 ? '' : 's'}` : 'Delete track', hint: whyNot ?? '⌘Z undoes', danger: true, sepBefore: true, disabled: ro || !!whyNot,
          onPick: () => { const e = deleteTrack(tl, t.id); if (!e) return; forgetTracks([t.id]); void apply(e); } },
        { label: 'Delete empty tracks', hint: !empties.length ? 'none' : empties.length > 3 ? `${empties.length} tracks` : empties.map((x) => x.id).join(', '), disabled: ro || !empties.length,
          onPick: () => { const e = deleteEmptyTracks(tl); if (!e) return; forgetTracks(empties.map((x) => x.id)); void apply(e); } },
      ],
    };
  })();
  const pasteSet = new Set([pasteTo.video, pasteTo.audio].filter((x): x is string => !!x));
  const barBtn = 'h-8 text-[12.5px]';
  const bar = (
    <div className={cn('flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-2 rounded-[10px] border bg-hdr py-2 pl-3.5 pr-2 transition-colors duration-200 [&_button]:flex-none [&_button]:whitespace-nowrap', hearEdit ? 'border-warn/50' : 'border-line')}>
      {hearEdit && heardOption ? (
        <>
          <span className="flex min-w-[min(100%,240px)] flex-[1_1_240px] flex-col">
            <span className="truncate text-[13px] font-medium">Listening to {heardOption.name} in the film</span>
            <span className="text-[12px] text-sub">In the place of {filmOption?.name ?? 'the one in the film'}, at the same level and fades. Nothing is saved yet.</span>
          </span>
          <Btn ghost className={barBtn} onClick={() => hearOption(heardOption)} title="Play the passage again">Hear it again</Btn>
          <Btn className={cn(barBtn, 'border-ink bg-ink text-bg hover:bg-ink/90')} disabled={readOnly} onClick={() => void putHeard()}>Use in the film</Btn>
          <Btn ghost className={barBtn} onClick={stopHearing}>Cancel</Btn>
        </>
      ) : group.length > 1 ? (
        <>
          <span className="flex min-w-[min(100%,240px)] flex-[1_1_240px] flex-col">
            <span className="truncate text-[13px] font-medium">{group.length} clips selected{nudgeOn ? ` · moved ${nudgeOn.d > 0 ? '+' : '−'}${Math.abs(nudgeOn.d)} f` : ''}</span>
            <span className="text-[12px] text-sub">Drag one to move them all, or press , and . for a frame back or forward (Shift: five). They stop at a clip that is not selected.</span>
            <span className="text-[12px] text-mute">⌘-click adds or removes one · ⇧-click adds up to it · a box with ⌘ or ⇧ adds, with ⌥⌘ takes out</span>
          </span>
          <Btn ghost className={barBtn} onClick={() => setExtra(undefined)} title="Keep only the clip clicked last (Esc clears all)">Just one</Btn>
          <Btn ghost className={cn(barBtn, 'px-2.5')} disabled={readOnly} onClick={deleteSel} title={`Delete these ${group.length} clips (⌫)`} aria-label="Delete the selected clips">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5" /></svg>
          </Btn>
        </>
      ) : selFound && selShotN ? (
        <>
          <span className="flex min-w-[min(100%,240px)] flex-[1_1_240px] flex-col">
            <span className="truncate text-[13px] font-medium">Shot {selShotN} · {takeLabel(selFound.clip)}</span>
            <span className="text-[12px] text-sub">{secsOf(lenF(selFound.clip, fps))}, in the film. Drag either end to trim it; with Option held, its {selFound.track.kind === 'audio' ? 'picture' : 'sound'} stays as it is.</span>
          </span>
          {sel && setLinked(tl, sel, false) && <Btn ghost className={barBtn} disabled={readOnly} onClick={() => void apply(setLinked(tl, sel, false))} title="Then trim, move or delete the picture and its sound apart">Unlink sound</Btn>}
          {sel && selFound.clip.unlinked && <Btn ghost className={cn(barBtn, 'text-warn')} disabled={readOnly || !relinkOf(sel)} onClick={() => void apply(relinkOf(sel))} title={setLinked(tl, sel, true) ? 'Picture and sound move together again' : relinkOf(sel) ? 'The sound goes back under its picture, at its length, and the two move together again' : 'Unlinked. They can be linked again only where the sound can go back under its picture.'}>{relinkOf(sel) ? 'Link sound again' : 'Sound unlinked'}</Btn>}
          {fullMarks && selFound.track.kind === 'video' && (fullMarks.get(selFound.clip.id)?.kind === 'small'
            ? <Btn className={cn(barBtn, 'border-warn/70 text-warn')} onClick={() => askUpscale(selFound.clip.src)} title="Puts its whole take in Alma's box, to upscale on Higgsfield">Upscale on Higgsfield</Btn>
            : !fullFor?.info.takes[(selFound.clip.src ?? '')] && <Btn ghost className={cn(barBtn, seedance.marks.has((selFound.clip.src ?? '')) && 'text-warn')} aria-pressed={seedance.marks.has((selFound.clip.src ?? ''))} onClick={() => seedance.toggle((selFound.clip.src ?? ''))} title="Marks its whole take: every shot from it is replaced">Redo in Seedance</Btn>)}
          <Btn className={barBtn} disabled={readOnly} onClick={askRetake} title="Puts the shot, its take and its place in Alma's box; you add what should change">Retake this shot</Btn>
          <Btn ghost className={barBtn} aria-pressed={details} onClick={() => setDetails((x) => !x)} title="In and out, level, fades, speed">Details</Btn>
          <Btn ghost className={cn(barBtn, 'px-2.5')} disabled={readOnly} onClick={deleteSel} title="Delete this shot; what follows moves back (⌫)" aria-label="Delete this shot">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5" /></svg>
          </Btn>
        </>
      ) : selFound ? (
        <>
          <span className="flex min-w-[min(100%,240px)] flex-[1_1_240px] flex-col">
            <span className="truncate text-[13px] font-medium">{selFound.track.name} · {clipName(selFound.clip)}</span>
            <span className="text-[12px] text-sub">{secsOf(lenF(selFound.clip, fps))}. Drag either end to trim it.</span>
          </span>
          {isLine(selFound.clip) && <Btn ghost className={barBtn} disabled={readOnly || selFound.track.locked} onClick={() => retypeSel()} title="Retype its words (Enter, or double-click the line)">Retype</Btn>}
          {isSrtClip(selFound.clip) && sel && <Btn ghost className={barBtn} disabled={readOnly || selFound.track.locked} onClick={() => void splitSrtClip(sel)} title="One line a cue, at the same times, each to move, trim and retype">Split into lines</Btn>}
          <Btn ghost className={barBtn} aria-pressed={details} onClick={() => setDetails((x) => !x)} title="In and out, level, fades, speed">Details</Btn>
          <Btn ghost className={cn(barBtn, 'px-2.5')} disabled={readOnly} onClick={deleteSel} title="Delete (⌫)" aria-label="Delete this clip">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5" /></svg>
          </Btn>
        </>
      ) : (
        // before the takes are in (the timeline from day one) the line says only what is true; with takes, as it was
        <span className="text-[12.5px] text-sub" data-bar-hint>{pc && !pc.takes ? (pc.shots + pc.boards ? 'Click a shot on the timeline to work on it.' : 'No shots yet. Press play to read the film at reading pace, or click a line on the timeline to work on it.') : 'Click a shot on the timeline to work on it, or any shot of any take below to watch it.'}</span>
      )}
    </div>
  );
  const rowsH = tl.tracks.reduce((h, t) => h + (t.kind === 'captions' ? 34 : t.kind === 'video' ? (t.id === mainV ? 64 : 46) : 52), 0);
  const tracksH = Math.min(400, 32 + 22 + rowsH + 40 + 6) + 40 + (viewing ? 50 : 0);

  // A click on the timeline does not take the keyboard by itself (its drags cancel the browser's own focus
  // change), so the cursor stayed in Alma's box and Space typed a space there (the user, 13 Nov: "when I click on
  // the timeline, I should be able to then press space to play"). A click anywhere on the page outside a text
  // field now lets go of whatever text field had the keyboard.
  const letGo = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) a.blur();
  };

  return (
    <div className="flex min-h-full flex-col" onPointerDownCapture={letGo}>
      <Header crumbs={crumbs.slice(0, -1)}
        crumbExtra={empty ? undefined : <VersionsMenu film={film} versions={cut.versions} unreadable={cut.unreadable} names={cut.names} equals={cut.equals} newest={cut.newest} edited={cutEdited}
          shown={cutName} viewing={!!viewing} busy={!!cut.saving} savedWhy={savedWhy} marks={marks} now={cut.current} view={cut.view}
          onOpen={(v) => { const x = cut.versions.find((y) => y.version === v); if (x) void restore(x); }} onName={(v, n) => void cut.nameVersion(v, n)} />}
        meta={empty ? <>{[state.film.aspect, `${fps} fps`, plan.data?.locked ? 'the script is locked: the timeline is being made' : 'no script yet'].filter(Boolean).join(' · ')}</> : <>{[state.film.aspect, `${fps} fps`, planned ? `planned ${smpte(total / fps, fps)}` : smpte(total / fps, fps), planned ? plannedWords : `${total} f`, planned ? '' : `${clips} clips`].filter(Boolean).join(' · ')}{fixture && state.cut ? <span className="text-mute"> · {state.cut.source.label}</span> : <span className="text-mute"> · cut/{viewing?.version ?? cut.equals ?? 'working'}.json</span>}{ahead && !settled && <ToConfirm title={`${aheadFigures}: the record has a newer cut than the timeline`} />}</>}
        actions={<>
          {!settled && (
            <MasterButton store={cut.rendersStore} version={cut.ref ?? ''} hint={masterHint} stale={masterStale?.reason} blocked={planned || empty ? PLANNED_RENDER_WHY : undefined} onClick={() => { void cut.renderMaster(false, !!masterStale); openRenders(true); }} />
          )}
          <RendersButton film={state.film.slug} tl={namedTl} fixture={fixture} blocked={planned || empty ? PLANNED_RENDER_WHY : undefined} renderWith={cut.renderWith} onStarted={() => openRenders(true)} onShowList={() => openRenders()} />
          {cut.canExport && !planned && !empty && <button type="button" onClick={() => void exportFcpxml()} data-export title={cut.equals ? `The FCPXML of ${cut.equals}` : 'Saves the cut as a version first, then downloads its FCPXML'}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-edge-strong px-3 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-raised">Export FCPXML</button>}
        </>} />

      {/* the line under the header (stage 2): where the cut stands against the saved versions, where the history is,
          the pills, and Save at its right end. Fixed height: nothing below moves when the words change */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-6 py-2" data-save-line>
        {empty ? (
          <span data-empty-line className="flex h-[38px] min-w-0 items-center text-[12.5px] text-sub duration-200 animate-in fade-in-0">
            {seeding?.error ? `The timeline could not be made from the script: ${seeding.error}` : plan.data?.locked ? 'Making the timeline from the locked script…' : 'No versions yet. The first comes with the script.'}
          </span>
        ) : <SaveLine status={status} lastSave={cut.lastSave} names={cut.names} naming={naming} setNaming={setNaming} onName={(v, n) => void cut.nameVersion(v, n)} />}
        <span className="flex flex-none items-center gap-2">
          {fixture && <Badge dashed dim className="text-warn">MOCK=boards · fixture, nothing is written</Badge>}
          {!empty && <ProxyPill store={cut.rendersStore} version={cut.ref ?? ''} edited={!cut.equals} done={cut.refRenders?.proxy} planned={planned ? PLANNED_RENDER_WHY : undefined} onOpen={() => openRenders()} />}
          {masterR?.state === 'failed' && <span className="text-[12px] text-bad" title={masterR.error}>master: failed</span>}
          {masterR?.state === 'done' && masterR.path && <a href={mediaUrl(repoPath(state.film.folder, state.film.repo, masterR.path))} target="_blank" rel="noreferrer" className="text-[12px] text-sub no-underline hover:text-ink">master {masterR.version}</a>}
          {(state.post?.cuts.length ?? 0) > 0 && <a href={`${base}?open=edit`} className="text-[12px] text-sub no-underline hover:text-ink" title="Every render of the cut in cut/, newest first, on the Edit step of Main">Cuts on disk · {state.post!.cuts.length}</a>}
          {!empty && (
            <>
              {/* the check of the cut reads its 480p: none while boards or planned shots are left */}
              {!planned && <QCChip spec={qcSpec('cut')} targets={qcTarget} />}
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-edge" />
              <SaveButton disabled={!cut.edited || !!viewing || cut.mode === 'none'} busy={cut.saving === 'save'} keys={keyName('S')} newest={cut.newest} onSave={() => void saveCut()} />
            </>
          )}
        </span>
      </div>
      {/* the film's files say more than the timeline's planned parts (a shot list, a scene's boards): said quietly, and
          brought in only on a press (never by itself while the page is open) */}
      {!empty && !viewing && plan.data?.pending && (
        <div data-plan-pending className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-6 py-1.5 text-[12.5px] text-sub duration-200 animate-in fade-in-0 slide-in-from-top-1">
          <span className="min-w-0">The film’s files have more than the timeline: {lower1(plan.data.pending)}.</span>
          <Btn className="h-7 flex-none text-[12px]" disabled={!!cut.saving || planBusy} onClick={() => void updateTimeline()}>Update the timeline</Btn>
        </div>
      )}
      {settled && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-6 py-2 text-[12.5px] text-sub">
          <span className="min-w-0">
            The timeline as the harness last held it ({cutName}).{ahead ? ` The final edit (${aheadName}, ${fmtDate(ahead.date)}) was made after it.` : ''} The finished film plays on <a href={`${base}/release`} className="text-ink-3 underline decoration-edge-strong underline-offset-4 hover:text-ink">Release</a>.
          </span>
          {ahead && <Btn className="h-7 flex-none text-[12px]" onClick={() => { setRate(0); setPlayRecord((x) => !x); }}>{playRecord ? 'Back to the timeline' : 'Play the final edit'}</Btn>}
        </div>
      )}
      {/* a film with no cut yet: the read that found none is not an error to show (the page says what is there) */}
      {cut.error && !(empty && cut.mode === 'none') && (
        <div role="alert" className="flex items-start justify-between gap-3 border-b border-line bg-panel px-6 py-2 text-[12.5px] text-bad">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{cut.error}</span>
            {cut.problems.slice(0, 6).map((p) => <span key={p} className="font-mono text-[11.5px] text-ink-3">· {p}</span>)}
            {cut.problems.length > 6 && <span className="text-[11.5px] text-mute">and {cut.problems.length - 6} more</span>}
          </span>
          <button type="button" onClick={() => cut.setError(undefined)} className="flex-none cursor-pointer text-sub hover:text-ink">Dismiss</button>
        </div>
      )}
      {/* a version that could not be read: in orange only when it is newer than the version on screen (Alma's newest
          change did not take); an old one is said quietly on its own row of the versions menu (14 Nov) */}
      {unread.loud.length > 0 && (
        <div data-unreadable className="border-b border-line px-6 py-1.5 text-[12px] text-warn duration-200 animate-in fade-in-0">
          Unreadable versions: {unread.loud.map(([v, p]) => `${v} (${p})`).join(' · ')}
        </div>
      )}

      {ahead && !settled && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-6 py-2 text-[12.5px]">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-3">
            <ToConfirm title="The terminal workflow rendered this cut after the newest timeline version" />
            <span className="truncate font-mono text-[12px]" title={ahead.file}>{aheadFigures}</span>
          </span>
          <span className="flex flex-none gap-1.5">
            <Btn ghost className="h-7 text-[12px]" onClick={() => { setRate(0); setPlayRecord((x) => !x); }}>{playRecord ? 'Back to the timeline' : `Play ${ahead.label}`}</Btn>
            <Btn className="h-7 text-[12px]" onClick={askCatchUp} title="Prefills the composer; Alma changes the cut with a drop, as recipes/edit.md says">Ask Alma to bring the timeline up to {ahead.label}</Btn>
          </span>
        </div>
      )}

      <div className="flex items-start max-[1100px]:flex-col">
        {/* the films are 9:16, so the picture stands tall at the left and stays put while the takes scroll */}
        <section aria-label="Viewer" className="scroll sticky top-14 flex max-h-[calc(100dvh-56px)] w-[252px] flex-none flex-col gap-3 self-start overflow-y-auto py-4 pl-4 pr-2.5 [scrollbar-gutter:stable] max-[1100px]:static max-[1100px]:max-h-none max-[1100px]:w-full max-[1100px]:items-center">
          <div ref={stage} onPointerMove={full ? wake : undefined}
            onClick={full && !watching ? () => { wake(); setRate((r) => (r ? 0 : (frame >= total ? (setFrame(0), 1) : 1))); } : undefined}
            className={cn('group/stage relative w-full max-w-[240px] flex-none overflow-hidden rounded-[10px] border border-edge-strong bg-black [&:fullscreen]:rounded-none [&:fullscreen]:border-0', full && !ctl && 'cursor-none')}
            style={{ aspectRatio: `${tl.width} / ${tl.height}` }}>
            {peek480 && <span className="pointer-events-none absolute bottom-2 left-2 z-[6] rounded-[4px] bg-black/85 px-1.5 py-px font-mono text-[10px] text-ink duration-150 animate-in fade-in-0">480p · while C is held</span>}
            {!(watching && watchedShot) && !playRecord && !renderOn && <MasterSwitch sw={sw} className={cn('absolute right-2 top-2 z-[6] transition-opacity duration-300', full && !ctl ? 'pointer-events-none opacity-0' : 'opacity-100')} />}
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleFull(); }} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (F or Esc)' : 'Full screen (F)'}
              className={cn('absolute z-[6] flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-white/15 bg-black/65 text-ink transition-opacity duration-200 hover:bg-black/85 focus-visible:opacity-100',
                watching ? 'right-2 top-2' : 'bottom-2 right-2', full ? (ctl ? 'opacity-100' : 'opacity-0') : 'opacity-0 group-hover/stage:opacity-100')}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {full ? <path d="M6 3v3H3M13 6h-3V3M10 13v-3h3M3 10h3v3" /> : <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />}
              </svg>
            </button>
            {full && !watching && (
              // full screen: play, where it is, and a bar to move through the film; they fade away while it plays
              <div onClick={(e) => e.stopPropagation()} className={cn('absolute inset-x-0 bottom-0 z-[5] flex items-center gap-4 bg-gradient-to-t from-black/85 to-transparent px-6 pb-5 pr-16 pt-12 transition-opacity duration-300', ctl ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                <button type="button" aria-label={rate ? 'Pause' : 'Play'} onClick={() => setRate((r) => (r ? 0 : (frame >= total ? (setFrame(0), 1) : 1)))} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full bg-ink text-bg">
                  {rate ? <span className="flex gap-[3px]"><span className="h-3 w-[3px] bg-bg" /><span className="h-3 w-[3px] bg-bg" /></span> : <IconPlay size={13} />}
                </button>
                <span className="flex-none font-mono text-[13px] text-ink">{tc}</span>
                <input type="range" aria-label="Where the film is" min={0} max={Math.max(1, total)} value={Math.min(frame, total)} onChange={(e) => { setRate(0); setFrame(Number(e.target.value)); wake(); }}
                  className="h-1 min-w-0 flex-1 cursor-pointer accent-white" />
                <span className="flex-none font-mono text-[13px] text-ink-3">{smpte(total / fps, fps)}</span>
              </div>
            )}
            {watching && watchedShot
              ? <SourceShot src={watching.src} from={watchedShot.in} to={watchedShot.out} k={watching.k} onTime={setWatchT} />
              : playRecord && recordPath
                ? <video key={recordPath} src={mediaUrl(recordPath)} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-black object-contain" />
                : renderOn?.path ? renderPlayer(renderOn.path) : viewer}
            {watching && watchedShot
              ? <span className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-[5px] border border-white/25 bg-black/75 px-1.5 py-px text-[11px] text-ink">{cap1(names.get(watching.src) ?? '')} · shot {watching.n}</span>
              : playRecord && ahead
              ? <span className="pointer-events-none absolute left-2 top-2 rounded-[5px] bg-black/70 px-1.5 py-px font-mono text-[10px] text-warn">record · {ahead.label}</span>
              : renderOn ? renderTag
              : picked && pic
                ? <span className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-[5px] border border-warn/50 bg-black/75 px-1.5 py-px text-[11px] text-warn">{picScene}{picShot ? ` · shot ${picShot}` : ''} · {takeLabel(pic.clip)}</span>
                : pic && picScene && !pic.clip.plan && <span className="pointer-events-none absolute left-2 top-2 rounded-[5px] border border-white/15 bg-black/75 px-1.5 py-px text-[11px] text-ink">{picScene}{picShot ? ` · shot ${picShot}` : ''}</span>}
          </div>
          {/* with shots selected the play controls stay, and "Back to the film" goes under them (the block grows, sliding) */}
          <div className={cn('flex w-full flex-none flex-col justify-center gap-3 overflow-hidden transition-[height] duration-200 ease-out', picks.length ? 'h-[127px]' : 'h-[75px]')}>
          {picks.length > 0 ? (
            <>
              <div className="flex w-full items-baseline justify-between font-mono text-[12.5px]" title={`${(frame / fps).toFixed(2)} s`}>
                <span className="text-ink">{tc}</span>
                {rate !== 0 && rate !== 1 && <span className="text-[11px] text-sub">{rate > 0 ? `${rate}×` : `−${-rate}×`}</span>}
                <span className="text-ink-3">{smpte(total / fps, fps)}</span>
              </div>
              {transport}
              <button type="button" data-back-film="viewer" onClick={backToFilm} className="line-in flex h-10 w-full flex-none cursor-pointer items-center justify-center rounded-[10px] border border-edge-strong text-[12.5px] text-ink transition-colors duration-200 hover:bg-raised">Back to the film</button>
            </>
          ) : watching && watchedShot ? (
            <button type="button" onClick={backToFilm} className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border border-edge-strong text-[12.5px] text-ink transition-colors duration-200 hover:bg-raised">Back to the film</button>
          ) : playRecord && ahead ? (
            <button type="button" onClick={() => setPlayRecord(false)} className="cursor-pointer text-[12.5px] text-sub hover:text-ink">Back to the timeline</button>
          ) : (
            <>
              <div className="flex w-full items-baseline justify-between font-mono text-[12.5px]" title={`${(frame / fps).toFixed(2)} s`}>
                <span className="text-ink">{tc}</span>
                {rate !== 0 && rate !== 1 && <span className="text-[11px] text-sub">{rate > 0 ? `${rate}×` : `−${-rate}×`}</span>}
                <span className="text-ink-3">{smpte(total / fps, fps)}</span>
              </div>
              {transport}
            </>
          )}
          </div>
          {/* one height whatever it says: a title that wraps must not move the picture or the notes */}
          <div className="flex h-[160px] w-full flex-none flex-col gap-1.5 overflow-hidden border-t border-line pt-3">
            <span className="lbl">{watching && watchedShot ? 'Watching a take' : 'At the playhead'}</span>
            {watching && watched && watchedShot ? (
              <>
                <span className="text-[14px] font-medium">{watching.scene} · shot {watching.n}</span>
                <span className="line-clamp-3 text-[12.5px] leading-snug text-sub">From <span className="text-ink">{cap1(names.get(watching.src) ?? watched.name)}</span>, {secsOf(Math.round((watchedShot.out - watchedShot.in) * fps))}. {watchedInFilm ? 'In the film now.' : 'Not in the film.'}</span>
                <span className="truncate font-mono text-[10.5px] text-mute" title={watching.src}>{watching.src.replace(/^assets\/films\/[^/]+\//, '')}</span>
              </>
            ) : picks.length > 0 ? (
              <>
                <span data-with-picks="" className="line-clamp-2 text-[14px] font-medium leading-snug">The film with the {picks.length === 1 ? 'shot' : `${picks.length} shots`} you selected</span>
                {pic ? (
                  <>
                    <span className="line-clamp-3 text-[12.5px] leading-snug text-sub">Now: {picScene ? `${picScene}${picShot ? ` · shot ${picShot}` : ''}, from ` : 'from '}<span className="text-ink">{takeLabel(pic.clip)}</span>, {secsOf(lenF(pic.clip, fps))}.{picked ? ' Not in the film.' : ''}</span>
                    <span className="truncate font-mono text-[10.5px] text-mute" title={pic.clip.src}>{(pic.clip.src ?? '').replace(/^assets\/films\/[^/]+\//, '')}</span>
                  </>
                ) : <span className="text-[13px] text-sub">No picture at {tc}.</span>}
              </>
            ) : empty ? (
              <>
                <span className="text-[14px] font-medium">Nothing yet</span>
                <span className="text-[12.5px] leading-snug text-sub">The timeline starts when the script is locked.</span>
              </>
            ) : pic?.clip.plan || (!pic && lineHere) ? (() => {
              // a planned shot, a board, or the line being read (the timeline from day one, 15 Nov)
              const c = pic?.clip.plan ? pic.clip : lineHere!;
              const sc = state.scenes.find((x) => x.id === c.scene);
              const n = c.plan === 'line' ? lineIndex(c) : undefined;
              return (
                <>
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug">{c.scene} · {c.plan === 'line' ? (c.who ? `line ${n} of ${linesIn(c.scene)}${c.parts ? ` · part ${c.part} of ${c.parts}` : ''}` : 'action') : `shot ${c.shot} of ${shotsIn(c.scene)}${c.plan === 'board' ? (c.panel ? ` · board ${c.panel.k} of ${c.panel.of}` : ' · board') : ''}`}</span>
                  {sc && <span title={sc.title} className="line-clamp-1 text-[12.5px] leading-snug text-sub">{sc.title}</span>}
                  <span className="line-clamp-3 text-[12.5px] leading-snug text-sub">{c.plan === 'line'
                    ? (c.who ? (c.timing?.startsWith('at previz') ? `${c.who.charAt(0) + c.who.slice(1).toLowerCase()}, ${Math.round((c.out - c.in) * 10) / 10} s ${c.timing}.` : `${c.who.charAt(0) + c.who.slice(1).toLowerCase()}, about ${Math.max(1, Math.round(c.out - c.in))} s ${c.timing ?? 'at reading pace'}.`) : `An action, as the script says it${c.timing ? `, ${c.timing}` : ''}.`)
                    : c.panel ? `Storyboard panel ${c.panel.n}, at ${c.panel.s.toFixed(2)} s in the scene; on screen ${Math.round((c.out - c.in) * 100) / 100} s.`
                    : `${c.plan === 'shot' ? 'No board yet, so the shot plays as its description. ' : ''}${Math.round((c.out - c.in) * 10) / 10} s planned.`}</span>
                  {c.plan === 'board' && boardsNote(c.scene) && <span key={boardsNote(c.scene)} data-boards-why className="line-clamp-3 text-[12px] leading-snug text-mute duration-200 animate-in fade-in-0">{boardsNote(c.scene)}</span>}
                  {c.plan === 'line' && c.who && linesNote(c.scene) && <span key={linesNote(c.scene)} data-lines-take className="line-clamp-2 text-[12px] leading-snug text-mute duration-200 animate-in fade-in-0">{linesNote(c.scene)}</span>}
                </>
              );
            })() : pic ? (
              <>
                <span title={scene ? undefined : clipName(pic.clip)} className="line-clamp-2 text-[14px] font-medium leading-snug">{scene ? <>{scene.id}{picShot ? ` · shot ${picShot}` : ''}</> : clipName(pic.clip)}</span>
                {scene && <span title={scene.title} className="line-clamp-2 text-[12.5px] leading-snug text-sub">{scene.title}</span>}
                <span title={`From ${takeLabel(pic.clip)}`} className="line-clamp-2 text-[12.5px] leading-snug text-sub">From <span className="text-ink">{takeLabel(pic.clip)}</span>, {secsOf(lenF(pic.clip, fps))}.</span>
                <span className="truncate font-mono text-[10.5px] text-mute" title={pic.clip.src}>{(pic.clip.src ?? '').replace(/^assets\/films\/[^/]+\//, '')}</span>
              </>
            ) : <span className="text-[13px] text-sub">No picture at {tc}.</span>}
          </div>
          <div className="flex w-full flex-col gap-1.5 border-t border-line pt-3">
            <span className="lbl">Notes</span>
            {tl.markers.length ? (
              <div className="flex max-h-[150px] flex-col gap-1 overflow-y-auto">
                {tl.markers.map((m, i) => (
                  <button key={i} type="button" title={m.text} onClick={() => { setRate(0); setFrame(toF(m.at, fps)); }} className="flex cursor-pointer items-baseline gap-2 text-left text-[12px] hover:text-ink">
                    <span className="mt-[3px] h-2.5 w-2 flex-none bg-warn [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
                    <span className="font-mono text-[11.5px]">{smpte(m.at, fps).slice(3, 8)}</span>
                    <span className="min-w-0 truncate text-ink-3">{m.text}</span>
                  </button>
                ))}
              </div>
            ) : <span className="text-[12px] text-mute">No notes on this cut.</span>}
            {markerText === undefined ? (
              <span className="flex gap-3">
                <button type="button" disabled={readOnly} onClick={() => setMarkerText('')} className="-my-[3px] inline-flex h-6 cursor-pointer items-center self-start whitespace-nowrap text-[12px] text-sub hover:text-ink disabled:opacity-50">+ Marker here</button>
                <button type="button" onClick={() => ui.prefill(`At ${tc}${pic ? ` (${clipName(pic.clip)})` : ''}: `)} className="-my-[3px] inline-flex h-6 cursor-pointer items-center self-start whitespace-nowrap text-[12px] text-sub hover:text-ink">Note to Alma</button>
              </span>
            ) : (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (markerText.trim()) void apply(addMarker(tl, frame, markerText.trim())); setMarkerText(undefined); }}>
                <input autoFocus value={markerText} onChange={(e) => setMarkerText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMarkerText(undefined); }} placeholder={`Marker at ${tc}`} aria-label="Marker text"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-edge bg-bg px-2.5 text-[12.5px] text-ink outline-none focus:border-sub" />
                <Btn type="submit" className="h-8">Add</Btn>
              </form>
            )}
          </div>
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 self-stretch border-l border-line px-4 py-3 max-[1100px]:border-l-0 max-[1100px]:border-t">
          <FilmStrip runs={runs} total={total} frame={frame} open={openId} shots={(mainTracks(shown ?? tl).v?.clips ?? []).filter((c) => shotNo(c, by) && !(c.panel && c.panel.k > 1)).length}
            absent={absent} onPickAbsent={openAbsent} onPick={openRun} onZoom={(dir) => setZoomCmd((z) => ({ n: (z?.n ?? 0) + 1, dir }))} empty={empty} />
          <div className={cn('relative flex flex-none flex-col', empty && '[&_[role=toolbar]]:pointer-events-none [&_[role=toolbar]]:opacity-45')} style={{ height: tracksH }}>
            {/* no script yet: the timeline says when it starts, and the one thing to do now (15 Nov) */}
            {empty && (
              <div data-empty-timeline className="pointer-events-none absolute inset-x-0 bottom-0 top-[86px] z-[5] flex flex-col items-center justify-center gap-2.5 pl-[146px] duration-200 animate-in fade-in-0 max-[700px]:pl-0">
                <p className="m-0 text-[13px] text-ink-3">{plan.data?.locked ? 'Making the timeline from the locked script…' : 'The timeline starts when the script is locked.'}</p>
                {!plan.data?.locked && <Btn className="pointer-events-auto h-8 text-[12.5px]" onClick={() => ui.focusBox()} data-tell-idea>Tell Alma the idea</Btn>}
              </div>
            )}
            <Tracks tl={shown ?? tl} frame={frame} setFrame={(f) => { setRate(0); setWatching(undefined); setFrame(f); }} sel={sel} onSelect={(r, c, t, how) => {
              if (r) setWatching(undefined);
              // shots selected (ASKS 52): editing waits, as during a try; a click on a clip only puts the playhead at it
              if (picks.length) { if (r && c) { setRate(0); setFrame(startF(c, fps)); } return; }
              onSelect(r, c, t, how);
            }} onEdit={(e) => void apply(e)}
              group={group} nudge={nudgeOn && nudgeIds ? { ids: nudgeIds, d: nudgeOn.d } : undefined}
              onBox={(refs, mode) => {
                if (mode === 'remove') { takeOut(refs); return; }
                if (!refs.length && mode === 'replace') { setSel(undefined); return; }
                selectMany(mode === 'add' ? [...group, ...refs] : refs, mode === 'add' ? sel : undefined);
              }}
              pasteTo={pasteSet} onPasteTo={(id) => { const t = tl.tracks.find((x) => x.id === id); if (t && (t.kind === 'video' || t.kind === 'audio')) markPasteTo(id, t.kind); }}
              tool={tool} ripple={ripple} snap={snap} readOnly={readOnly || picks.length > 0 || !!hearEdit} srcSeconds={srcSeconds} toolbar={toolbar} notice={viewing ? notice : undefined} zoomCmd={zoomCmd}
              focus={focus} scenes={runs.map((r) => { const wait = !!r.scene && planned && making.has(r.scene) && plannedScene(r.scene); return { ...r, title: r.scene ? (wait ? 'take being made' : state.scenes.find((x) => x.id === r.scene)?.title) : undefined, ...(wait ? { making: true } : {}) }; })} openScene={openId}
              tryIds={tryIds} solo={soloed} onSolo={toggleSolo} onMenu={openMenu}
              clipMark={fullMarks && !tryEdit ? (c) => { const m = fullMarks.get(c.id); return m ? { kind: m.kind === 'take' ? 'seedance' : m.kind === 'small' ? 'small' : 'upscaled', marked: seedance.marks.has((c.src ?? '')) } : undefined; } : undefined}
              fileDrag={dragFile && dragFile.seconds ? { kind: dragFile.kind === 'sound' ? 'audio' : dragFile.kind === 'subtitles' ? 'captions' : 'video', frames: fileFrames(dragFile.seconds, fps) } : undefined} retype={retypeCmd}
              onDropFile={(trackId, f) => { const e = dragFile; setDragFile(undefined); if (e) void placeEntry(e, { trackId, f }); }}
              onHeadMenu={(m) => { setMenu(undefined); setHeadMenu(m); }} renaming={renaming} onPress={pressTrack} point={pointOn} onPoint={setPoint}
              onRenamed={(id, name) => { setRenaming(undefined); if (name !== undefined && !readOnly) void apply(renameTrack(tl, id, name)); }} onPeek={setPeek}
              laneNote={planned && mainV && !(mainTracks(tl).v?.clips.length) ? { [mainV]: 'No shots yet. They come with the shot lists.' } : undefined}
              nameOf={noteName} clipText={(c, t) => { if (t.id !== mainV) return undefined; const n = shotNo(c, by); return n ? { title: `Shot ${n}${c.panel && c.panel.of > 1 ? ` · ${c.panel.k}/${c.panel.of}` : ''}`, sub: c.plan ? c.text ?? '' : takeLabel(c) } : undefined; }} />
          </div>
          {menu && menuItems && <ContextMenu x={menu.x} y={menu.y} title={menuItems.title} items={menuItems.items} onClose={closeMenu} />}
          {headMenu && headItems && <ContextMenu x={headMenu.x} y={headMenu.y} title={headItems.title} items={headItems.items} onClose={closeHeadMenu} />}
          {!empty && bar}
          <FilesPanel open={!!files} film={film} mode={files?.mode ?? filesWas.mode} data={filmFiles} tl={tl} replacing={files?.replacing ?? filesWas.replacing}
            target={(() => {
              const s = trackForFile(tl, 'audio', filePrefer('audio', files?.lane), frame, frame + 1), p = trackForFile(tl, 'video', filePrefer('video', files?.lane), frame, frame + 1);
              return `at the playhead (${tc}): a sound on ${s ? `${s.id} ${s.name}` : 'a new Effects track'}, a picture on ${p ? `${p.id} ${p.name}` : 'a new Inserts track'}`;
            })()}
            busy={placing || !!cut.saving} readOnly={readOnly || picks.length > 0 || !!hearEdit}
            onAdd={(e) => void placeEntry(e)} onReplace={(e) => void replaceWith(e)} onClose={closeFiles} onDrag={setDragFile} />
          <SeedanceMarksLink film={film} seedance={seedance} takes={check?.takes} version={almaCut} fps={fps} />
          {/* the lower panel's tabs, in the user's order (14 Nov): Takes, What's next, Upscale (in the 1080p view) and Renders */}
          <div className="flex flex-col gap-2">
            {check && fullFor && <FullBar shots={check.shots} takes={check.takes} marks={seedance.marks} onUpscale={() => askUpscale()} onSeedance={askSeedance} />}
            {/* how many things wait for the user, for What's next's tab, read apart so the page is drawn only when it changes */}
            <WaitingCount onCount={setWaitingN} />
            <div role="tablist" aria-label="Under the timeline" className="flex flex-wrap gap-1">
              {(check && fullFor ? ['takes', 'left', 'upscale', 'renders', 'history'] as const : ['takes', 'left', 'renders', 'history'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={lowerTab === k} onClick={() => setLowerTab(k)} data-tab={k}
                  className={cn('h-7 cursor-pointer whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] transition-colors duration-200', lowerTab === k ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>
                  {k === 'left' ? <LeftLabel left={leftView?.left} waiting={waitingN} /> : k === 'takes' ? 'Takes' : k === 'upscale' ? 'Upscale' : k === 'renders' ? 'Renders' : 'History'}
                </button>
              ))}
            </div>
          </div>
          {lowerTab === 'left' && leftInput ? (
            <div key="left" className="duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
              <LeftTab film={film} tl={leftTl ?? tl} input={leftInput} onDo={doLeft} onUntick={untick} error={left.error} here="/edit" from="What's next on the Edit page" />
            </div>
          ) : empty && lowerTab !== 'left' ? (
            <div key={`empty-${lowerTab}`} className="duration-200 animate-in fade-in-0">
              {lowerTab === 'takes' ? <EmptyCard title="No takes yet." text="Takes come after the script, the shot lists and the boards." />
                : lowerTab === 'renders' ? <EmptyCard title="Nothing rendered yet." text="The film renders once every scene’s take is in." />
                : <EmptyCard title="No steps yet." text="Every change to the cut is kept here, from the first version on." />}
            </div>
          ) : lowerTab === 'history' && hist ? (
            <div key="history" className="duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
              <HistoryPanel history={hist} versions={cut.versions} unreadable={cut.unreadable} names={cut.names} equals={viewing ? undefined : cut.equals} marks={marks}
                keys={{ undo: keyName('Z'), redo: keyName('Z', true) }} busy={!!cut.saving || !!viewing} onGo={goToStep}
                onOpen={(v) => { const x = cut.versions.find((y) => y.version === v); if (x) void restore(x); }} />
            </div>
          ) : lowerTab === 'renders' ? (
            <div key="renders" className="duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
              <RendersTab film={state.film.slug} tl={namedTl} current={cut.ref} edited={!cut.equals} seconds={total / fps} store={cut.rendersStore} recorded={viewing ? viewing.renders : cut.refRenders}
                playing={renderOn?.path} follow={follow} fixture={fixture} onPlay={playRender} renderWith={cut.renderWith} onRenderProxy={cut.renderProxy} onRetryMaster={() => { void cut.renderMaster(true); openRenders(true); }}
                onRenderAgain={() => { void cut.renderMaster(false, true); openRenders(true); }} masterHint={masterHint} masterStale={masterStale} mediaOf={(rel, o) => mediaUrl(repoPath(state.film.folder, state.film.repo, rel), o)} absOf={(rel) => `${state.film.folder}/${rel}`} />
            </div>
          ) : selAt && selOptions && selOptions.length > 0 ? (
            <EffectOptions title={effectName(selAt.clip)} options={selOptions} current={selAt.clip.src ?? ''} hearing={hearingOn?.src} playing={rate !== 0}
              windowOf={(o) => optionWindow(selAt.clip, o.seconds)}
              p={(() => { const c = (hearEdit ? findClip(hearEdit.tl, sel!)?.clip : undefined) ?? selAt.clip; const a = startF(c, fps), n = lenF(c, fps); return frame >= a && frame <= a + n ? (frame - a) / n : undefined; })()}
              onHear={hearOption} onAnother={() => askAnother()} />
          ) : check && fullFor && lowerTab === 'upscale' ? (
            <UpscaleCheck tl={tl} takes={check.takes} shots={check.shots} marks={seedance.marks} onToggle={seedance.toggle} frame={frame} fps={fps} label={fullFor.info.label} onPlay={playShot} />
          ) : gridScene && planned && plannedScene(gridScene.id) && !shots.takes.some((t) => t.scene === gridScene.id && t.state !== 'making') ? (
            // a scene with no take yet (the timeline from day one): its planned shots as the columns, no takes
            <div key={`planned-${gridScene.id}`} className="duration-200 animate-in fade-in-0">
              <PlannedTakes scene={gridScene.id} title={'title' in gridScene ? gridScene.title : undefined} making={making.has(gridScene.id)} hot={pic?.clip.plan ? pic.clip.shot : undefined}
                picture={(mainTracks(tl).v?.clips ?? []).filter((c) => c.plan && c.scene === gridScene.id)} lines={(mainTracks(tl).a?.clips ?? []).filter((c) => c.plan === 'line' && c.scene === gridScene.id)}
                onShot={(c) => { setRate(0); setWatching(undefined); setFrame(startF(c, fps)); }} />
            </div>
          ) : gridScene && (
            <div key="takes" className="duration-200 animate-in fade-in-0">
              <ShotGrid scene={gridScene} takes={shots.takes} by={by} names={names} tl={tl} watching={watching} picks={pickSet} selecting={picks.length > 0} seenKey={`hh:takes-seen:${film}`}
                selShot={watching ? gridHead?.n ?? watching.n : selShotN ?? (picScene === openId ? picShot : undefined)} base={base} onShot={clickShot} onUnpick={unpick} head={gridHead}
                onMenu={(at, t, n) => { setMenu(undefined); setHeadMenu(undefined); setTakeMenu({ ...at, src: t.src, n }); }}
                onSeek={seekTakes} onSeekEdge={seekEdge}
                onBring={readOnly ? undefined : (t, n) => void bringBack(t, n)} onTakeOut={readOnly ? undefined : shotOut} onSceneOut={readOnly ? undefined : () => sceneOut(gridScene.id)} />
              <PicksBox count={picksCount} hover={picksHover} open={picks.length > 0} folded={boxFolded} onFold={setBoxFolded} disabled={readOnly}
                onBack={backToFilm} onUse={() => void putPicks()} />
              {plan.data?.locked && !readOnly && (mainTracks(tl).v?.clips ?? []).some((c) => !c.plan && c.takeRef?.scene === gridScene.id && c.id.startsWith(`${gridScene.id.toLowerCase()}-take`)) && (
                <div className="mt-3"><BoardsBack scene={gridScene.id} busy={planBusy} onBack={() => void putBoardsBack(gridScene.id)} /></div>
              )}
            </div>
          )}
          {sending && <SendOnce film={film} text={sending} onDone={(ok) => { setSending(undefined); say(ok ? 'Sent to Alma: the go for the first takes.' : 'The message did not go. Try again.'); }} />}
          {takeMenu && takeItems && <ContextMenu x={takeMenu.x} y={takeMenu.y} title={takeItems.title} items={takeItems.items} onClose={closeTakeMenu} />}
          {details && sel && (
            <aside className="rounded-[10px] border border-line" aria-label="Clip details">
              <Inspector tl={tl} sel={sel} state={state} base={base} steps={inspectorSteps} readOnly={readOnly} srcSeconds={srcSeconds}
                onEdit={(e) => void apply(e)} onClose={() => setDetails(false)} onAsk={askAlma}
                onChip={() => { const f = selClip(); if (f) ui.addChip(clipChip(f.track, f.clip)); }} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

/** The phone (Phone-Edit.dc.html, editing deferred): the viewer, the cut lane read-only, a note at the timecode. */
/** The What's next tab's label: its name, then quietly the number of steps still to do (the user, 14 Nov: "How many
 *  things do we still have to do?"), a small tick when none is left, nothing while it is not known yet. */
/** Sends one message to Alma as the user's own words, once, then says how it went (mounted only while it sends). */
function SendOnce({ film, text, onDone }: { film: string; text: string; onDone: (ok: boolean) => void }) {
  const sendAs = useSendAsUser(film);
  const once = useRef(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void sendAs(text).then((ok) => done.current(ok), () => done.current(false));
  }, [sendAs, text]);
  return null;
}

/** The tab's name and its count: the steps left, and, while anything waits for the user, how many things do:
 *  "What's next 4 for you 8 left". */
function LeftLabel({ left, waiting = 0 }: { left?: number; waiting?: number }) {
  if (left === undefined && !waiting) return <>{NEXT_TAB}</>;
  return (
    <span className="inline-flex items-center" title={[waiting ? waitWords(waiting) : '', left !== undefined ? leftWords(left) : ''].filter(Boolean).join(' · ')}>
      {NEXT_TAB}
      {waiting > 0 && <span key={`w${waiting}`} data-tab-waiting className="ml-1.5 inline-flex h-4 items-center rounded-full bg-warn/20 px-1.5 text-[11px] font-medium tabular-nums text-warn duration-200 animate-in fade-in-0">{waiting} for you</span>}
      {left === undefined ? null : waiting > 0 && left > 0
        ? <span key={`l${left}`} data-tab-left className="ml-1.5 text-[11.5px] tabular-nums text-mute duration-200 animate-in fade-in-0">{left} left</span>
        : left > 0
        ? <>{' '}<span key={left} data-tab-left className="ml-1 font-mono text-[11.5px] tabular-nums text-mute duration-200 animate-in fade-in-0">{left}</span></>
        : <span data-tab-left="0" className="ml-1.5 inline-flex text-mute duration-200 animate-in fade-in-0"><IconCheck size={12} /></span>}
    </span>
  );
}

/** What the phone plays (16 Nov): one file of this exact cut whenever there is one. The 480p first: it is made for this
 *  (about 1 Mbit/s, the phone's player is a few hundred points tall), where the master is the timeline's full size (about
 *  7 Mbit/s over a mobile link). An older version viewed plays its own files; a cut with edits since its version has none. */
function phonePick(p: { viewing?: { proxy?: string; master?: string }; equals?: string; proxy?: string; master?: string; delivered?: string }): { path: string; kind: '480p' | 'master' } | undefined {
  const [proxy, master] = p.viewing ? [p.viewing.proxy, p.viewing.master] : p.equals ? [p.proxy, p.master ?? p.delivered] : [];
  return proxy ? { path: proxy, kind: '480p' } : master ? { path: master, kind: 'master' } : undefined;
}

// the phone page's sizes (px): the picture between these heights, the lane's ruler and rows; below ONE_ROW of picture
// with both rows the lane keeps only the picture row, so nothing is ever cut by Alma's bar
const PIC_MIN = 120, PIC_MAX = 340, ONE_ROW = 240, RULER = 24, ROW = 52;

function PhoneEdit({ state, tl, name, frame, fps, total, setFrame, playing, onPlay, viewer, transport, file, smoother, crumbs, onNote, ahead }: {
  state: FilmState; tl: Timeline; name: string; frame: number; fps: number; total: number; setFrame: (f: number) => void; ahead?: string;
  /** The film plays; `onPlay` plays or pauses it (the full screen's own button). */
  playing: boolean; onPlay: () => void;
  viewer: React.ReactNode; transport: React.ReactNode; crumbs: { label: string; href?: string }[]; onNote: () => void;
  /** The one file the player plays (smooth on a phone): the version's 480p or its master; absent while played live. */
  file?: '480p' | 'master';
  /** The quiet line above the timecodes while played live: why, and the ask for this version's 480p where one can be made. */
  smoother?: React.ReactNode;
}) {
  const lane = useRef<HTMLDivElement>(null);
  const Z = 1.6; // px per frame on the phone lane
  const video = tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video');
  const audio = tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio');
  const tc = smpte(frame / fps, fps);
  // the playhead stays in the middle; the lane scrolls under it
  const auto = useRef(false);
  useEffect(() => {
    const el = lane.current;
    if (!el || Math.abs(el.scrollLeft - frame * Z) < 1) return;
    auto.current = true;
    el.scrollLeft = frame * Z;
  }, [frame]);
  // a scroll by the user's finger moves the playhead; the page's own scrolling does not
  const onScroll = () => {
    const el = lane.current;
    if (!el) return;
    if (auto.current) { auto.current = false; return; }
    setFrame(Math.round(el.scrollLeft / Z));
  };
  const step = 10 * fps;
  // The page fits the part of the screen the browser gives it, above Alma's bar (16 Nov: on an iPhone in Safari the
  // last line sat under the bar and the lane's second row was cut). The picture takes what the rest leaves, between
  // PIC_MIN and PIC_MAX; when that is short the lane keeps one row. Measured from the scroller (main), whose bottom
  // padding is the bar's own height (Shell, ThreadColumn); when even that cannot fit (the keyboard open), the page
  // scrolls and its end clears the bar.
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const laneBox = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number; rows: 1 | 2 }>();
  const ratio = tl.width / tl.height;
  const tracks = audio && video ? 2 : 1;
  // full screen: the picture's own box, so the same player keeps playing; a landscape film turns sideways.
  // While it is full screen the page's sizes are left as they were, so it comes back exactly where it went from.
  const fs = usePhoneFull(box, tl.width > tl.height);
  const isFull = useRef(false);
  useEffect(() => { isFull.current = fs.full; }, [fs.full]);
  useLayoutEffect(() => {
    const el = root.current;
    const main = el?.closest('main');
    if (!el || !main) return;
    const measure = () => {
      if (!box.current || !laneBox.current || isFull.current) return;
      const cs = getComputedStyle(main);
      const room = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // everything but the picture, with the lane at two rows (read from the current sizes, so a size still sliding
      // cancels out)
      const rest = el.offsetHeight - box.current.offsetHeight - laneBox.current.offsetHeight + (RULER + tracks * ROW + 2);
      const free2 = room - rest;
      const rows: 1 | 2 = tracks === 2 && free2 >= ONE_ROW ? 2 : 1;
      let h = Math.max(PIC_MIN, Math.min(PIC_MAX, free2 + (tracks === 2 && rows === 1 ? ROW : 0)));
      let w = h * ratio;
      const across = el.clientWidth - 32;
      if (w > across) { w = across; h = w / ratio; }
      w = Math.round(w); h = Math.round(h);
      setFit((f) => (f && f.w === w && f.h === h && f.rows === rows ? f : { w, h, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, tracks]);
  // the first fit is drawn as it is; a later one (the bar grows, Safari's bars come and go, the keyboard) slides
  const [eased, setEased] = useState(false);
  useEffect(() => { if (fit && !eased) { const t = setTimeout(() => setEased(true), 50); return () => clearTimeout(t); } }, [fit, eased]);
  const rows = fit?.rows ?? tracks;
  // the full screen's controls show while paused and for a moment after a tap while it plays
  const [awake, setAwake] = useState(true);
  const awakeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useCallback(() => { setAwake(true); if (awakeT.current) clearTimeout(awakeT.current); awakeT.current = setTimeout(() => setAwake(false), 2400); }, []);
  useEffect(() => () => { if (awakeT.current) clearTimeout(awakeT.current); }, []);
  const ctl = !playing || awake;
  // the box comes back from full screen with a short fade, as it went
  const [back, setBack] = useState(false);
  const enterFull = () => { wake(); setBack(false); void fs.enter(); };
  const leaveFull = () => { fs.leave(); setBack(true); };
  return (
    <div ref={root} data-phone-edit className="flex flex-none flex-col">
      <Header crumbs={[...crumbs.slice(0, 2)]} meta="" phoneSub={name ? `Edit ${name} · ${file === 'master' ? 'master file' : file ? '480p file' : 'played live'} · ${smpte(total / fps, fps)} · view only` : 'Edit · no cut yet · view only'} />
      <div className="flex flex-col items-center gap-3 px-4 pt-3">
        {ahead && <p className="m-0 flex w-full items-center text-[12px] text-sub"><span className="min-w-0 truncate font-mono text-[11px]">{ahead}</span><ToConfirm title="The record has a newer cut than the timeline; ask Alma on the desktop to bring the timeline up to it" /></p>}
        <div ref={box} data-phone-picture data-full={fs.full ? (fs.real ? 'screen' : 'page') : undefined}
          className={cn('overflow-hidden bg-black [&:fullscreen]:rounded-none [&:fullscreen]:border-0',
            fs.full ? 'fixed inset-0 z-[100] rounded-none border-0 duration-200 animate-in fade-in-0' : 'relative rounded-[14px] border border-edge',
            !fs.full && back && 'duration-200 animate-in fade-in-0',
            !fs.full && !fit && 'h-[min(42dvh,340px)]', !fs.full && eased && 'transition-[width,height] duration-300 ease-out motion-reduce:transition-none')}
          style={fs.full ? undefined : fit ? { width: fit.w, height: fit.h } : { aspectRatio: `${tl.width} / ${tl.height}` }}>
          {/* the picture and what is drawn over it; turned a quarter for a landscape film while the window stands upright */}
          <div data-phone-stage data-sideways={fs.sideways || undefined} onClick={fs.full ? wake : undefined}
            className="absolute inset-0"
            style={fs.sideways ? { inset: 'auto', left: '50%', top: '50%', width: '100dvh', height: '100dvw', transform: 'translate(-50%, -50%) rotate(90deg)' } : undefined}>
            {viewer}
            {fs.full && (
              // full screen: play, where it is, a bar to move through the film, and the way out; they fade while it plays
              <div onClick={(e) => e.stopPropagation()} data-phone-full-bar
                className={cn('absolute inset-x-0 bottom-0 z-[7] flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-12 transition-opacity duration-300', ctl ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { onPlay(); wake(); }} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full bg-ink text-bg">
                  {playing ? <span className="flex gap-[3px]"><span className="h-3 w-[3px] bg-bg" /><span className="h-3 w-[3px] bg-bg" /></span> : <IconPlay size={13} />}
                </button>
                <span className="flex-none font-mono text-[12px] text-ink">{tc.slice(3)}</span>
                <input type="range" aria-label="Where the film is" min={0} max={Math.max(1, total)} value={Math.min(frame, total)} onChange={(e) => { setFrame(Number(e.target.value)); wake(); }}
                  className="h-1 min-w-0 flex-1 cursor-pointer accent-white" />
                <span className="flex-none font-mono text-[12px] text-ink-3">{smpte(total / fps, fps).slice(3)}</span>
              </div>
            )}
            <button type="button" data-phone-full onClick={(e) => { e.stopPropagation(); if (fs.full) leaveFull(); else enterFull(); }}
              aria-label={fs.full ? 'Leave full screen' : 'Full screen'} title={fs.full ? 'Leave full screen' : 'Full screen'}
              className={cn('absolute z-[8] flex size-10 cursor-pointer items-center justify-center rounded-[10px] border border-white/15 bg-black/65 text-ink transition-opacity duration-300 active:bg-black/85',
                fs.full ? 'right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))]' : 'bottom-2 right-2', ctl ? 'opacity-100' : 'pointer-events-none opacity-0')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {fs.full ? <path d="M6 3v3H3M13 6h-3V3M10 13v-3h3M3 10h3v3" /> : <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />}
              </svg>
            </button>
          </div>
        </div>
        {smoother}
        <div className="flex w-full items-center justify-between font-mono text-[13px]"><span>{tc}</span><span className="text-mute">{smpte(total / fps, fps)}</span></div>
        {transport}
        <button type="button" onClick={onNote} className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-ink text-[14px] font-medium text-bg">
          Note at {tc}
        </button>
      </div>
      <div ref={laneBox} data-phone-lane={rows} className={cn('relative mt-3 overflow-hidden border-y border-line', eased && 'transition-[height] duration-300 ease-out motion-reduce:transition-none')}
        style={{ height: RULER + rows * ROW + 2 }}>
        <div ref={lane} tabIndex={0} onScroll={onScroll} aria-label="The cut, view only" className="scroll overflow-x-auto overflow-y-hidden outline-none">
          <div className="relative" style={{ width: total * Z, paddingLeft: '50vw', paddingRight: '50vw', boxSizing: 'content-box' }}>
            <div className="relative h-6">
              {Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => (
                <span key={i} className="absolute top-1 font-mono text-[10px] text-mute" style={{ left: i * step * Z }}>{smpte((i * step) / fps, fps).slice(3, 8)}</span>
              ))}
            </div>
            {[video, audio].filter(Boolean).map((t, i) => (
              <div key={t!.id} data-phone-row={t!.id} aria-hidden={i >= rows || undefined} className={cn('relative h-[52px] transition-opacity duration-300 motion-reduce:transition-none', i >= rows && 'opacity-0')}>
                {t!.clips.map((c) => (
                  <button key={c.id} type="button" data-phone-clip={`${t!.id}:${c.id}`} tabIndex={i >= rows ? -1 : undefined} onClick={() => setFrame(startF(c, fps))} title={`${clipName(c)} · ${smpte(c.at, fps)}`}
                    className={cn('absolute top-1 box-border h-[44px] overflow-hidden rounded-[8px] border border-edge-strong px-2 text-left text-[12px]', t!.kind === 'video' ? 'bg-raised text-ink' : 'bg-panel text-sub')}
                    style={{ left: startF(c, fps) * Z, width: Math.max(24, lenF(c, fps) * Z - 2) }}>
                    {lenF(c, fps) * Z > 40 && <span className="block truncate pt-1">{t!.kind === 'video' ? clipName(c).replace(/ · /, ' · ') : ''}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-ink" />
        <span className="pointer-events-none absolute left-1/2 top-0.5 -translate-x-1/2 rounded-[4px] bg-ink px-1.5 font-mono text-[10.5px] text-bg">{tc.slice(3)}</span>
      </div>
      <p data-phone-desktop-line className="m-0 px-4 pb-4 pt-2 text-[12px] text-mute">Editing is on the desktop. Here: watch, scroll the cut, and leave Alma a note at the timecode.</p>
      <span className="sr-only">{state.film.title}</span>
    </div>
  );
}

/** The phone, played live where nothing can be asked for here (planned clips, an older version, a delivered film): the
 *  same quiet line as PhoneSmoother's, with no button, so a live play is never a silent stutter (16 Nov). */
function PhoneLine({ words }: { words: string }) {
  return (
    <div data-phone-smoother data-phone-live className="flex min-h-[34px] w-full items-center rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] duration-200 animate-in fade-in-0">
      <span className="min-w-0 truncate text-sub" title={words}>{words}</span>
    </div>
  );
}

/** The phone, playing the takes live: one line and a button above the transport that ask for this version's 480p (the
 *  user saw the picture lag behind the sound on an iPhone). It follows the render's percent itself; when the file lands
 *  the player switches to it with a short fade. */
function PhoneSmoother({ store, version, edited, onAsk }: { store: RendersStore; version: string; edited?: boolean; onAsk: () => void }) {
  const r = useRendersLive(store).proxy;
  // a cut with edits since its version: the render is of the version saved for it, which the store then follows
  const mine = r && (r.version === version || (edited && r.version !== version && /^v\d+$/.test(r.version))) && !(edited && r.state === 'done') ? r : undefined;
  const running = mine?.state === 'queued' || mine?.state === 'running';
  const failed = mine?.state === 'failed';
  return (
    <div data-phone-smoother className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] duration-200 animate-in fade-in-0">
      <span key={running ? 'run' : failed ? 'failed' : 'ask'} className={cn('min-w-0 truncate duration-200 animate-in fade-in-0', failed ? 'text-bad' : 'text-sub')} title={failed ? mine?.error : undefined}>
        {running ? `Rendering the 480p · ${Math.round(mine?.percent ?? 0)}%` : failed ? 'The 480p failed: see Renders on the desktop' : 'Smoother on the phone: render this cut'}
      </span>
      {!running && !failed && (
        <button type="button" onClick={onAsk} data-phone-render className="inline-flex h-8 flex-none cursor-pointer items-center rounded-lg border border-edge-strong px-3 text-[12.5px] text-ink transition-colors duration-150 active:bg-raised">Render</button>
      )}
    </div>
  );
}

/** ⌘ on a Mac, Ctrl elsewhere, for the keys the page shows ("⌘S", "Ctrl S"). Read once in the browser. */
const isMacLike = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const noSub = () => () => {};
function useMac(): boolean {
  return useSyncExternalStore(noSub, isMacLike, () => true);
}
/** The shortcut's words for the page: "⌘S", "⇧⌘Z" on a Mac; "Ctrl S", "Ctrl Shift Z" elsewhere. */
function useKeyName(): (k: string, shift?: boolean) => string {
  const mac = useMac();
  return useCallback((k: string, shift = false) => (mac ? `${shift ? '⇧' : ''}⌘${k}` : `Ctrl ${shift ? 'Shift ' : ''}${k}`), [mac]);
}

/** Save, at the right end of the line under the header: outlined (the page's one filled button is elsewhere), with its
 *  shortcut; disabled but readable when there are no edits since the newest version. It asks nothing. */
function SaveButton({ disabled, busy, keys, newest, onSave }: { disabled: boolean; busy: boolean; keys: string; newest?: string; onSave: () => void }) {
  return (
    <button type="button" data-save disabled={disabled || busy} onClick={onSave}
      title={disabled ? `No edits since ${newest ?? 'the last version'}` : `Save this cut as a version (${keys})`}
      className={cn('inline-flex h-7 flex-none items-center gap-2 rounded-lg border pl-2.5 pr-1.5 text-[12.5px] transition-colors duration-200',
        disabled ? 'cursor-default border-edge text-sub' : 'cursor-pointer border-edge-strong text-ink hover:bg-raised')}>
      Save<span className={cn('rounded-[4px] border px-1 text-[11px] leading-4', disabled ? 'border-edge text-mute' : 'border-edge-strong text-sub')}>{keys}</span>
    </button>
  );
}

/** The two lines of the save status (plain grey, no tick, no amber), and the name field after a save: Enter keeps the
 *  name exactly as typed, Esc means no name, clicking away keeps what was typed. After a render's own save, a quiet
 *  "Name it" opens the same field. Two lines of fixed height: the page under it never moves. */
function SaveLine({ status, lastSave, names, naming, setNaming, onName }: {
  status?: { line1: string; line2: string }; lastSave?: SaveNote; names: VersionNames;
  naming?: { version: string; text: string }; setNaming: (n: { version: string; text: string } | undefined) => void; onName: (version: string, name: string) => void;
}) {
  const done = useRef<string | undefined>(undefined);
  const open = naming && lastSave && naming.version === lastSave.version ? naming : undefined;
  // the field takes the keyboard as it opens (⌘S, then type the name)
  const field = useRef<HTMLInputElement>(null);
  const openFor = open?.version;
  useEffect(() => { if (openFor) { done.current = undefined; field.current?.focus(); } }, [openFor]);
  // what was typed is read from the field itself (a key pressed right after typing never meets an older copy)
  const keep = (how: 'enter' | 'esc' | 'away') => {
    if (!open || done.current === open.version) return;
    done.current = open.version;
    const text = field.current?.value ?? open.text;
    if (how !== 'esc' && text.trim()) onName(open.version, text);
    setNaming(undefined);
  };
  const named = lastSave ? names[lastSave.version]?.name : undefined;
  const line1 = status?.line1 ?? '';
  const words1 = named && lastSave?.made ? line1.replace(/\.$/, `, named “${named}”.`) : line1;
  return (
    <div className="flex h-[38px] min-w-[min(100%,280px)] flex-[1_1_320px] flex-col justify-center overflow-hidden text-[12px] leading-4 text-sub" aria-live="polite" data-save-status>
      <span className="flex h-[22px] min-w-0 items-center gap-2 whitespace-nowrap">
        <span key={words1} data-status-line1 className="min-w-0 truncate text-ink-3 duration-200 animate-in fade-in-0" title={words1}>{words1}</span>
        {open && (
          <span className="inline-flex flex-none items-center gap-1.5 duration-200 animate-in fade-in-0 slide-in-from-left-1">
            <span className="text-[11.5px] text-sub">Name it (optional)</span>
            <span className="relative inline-flex">
            <input ref={field} data-name-field aria-label={`A name for ${open.version}`} value={open.text} maxLength={120}
              onFocus={() => { done.current = undefined; }}
              onChange={(e) => setNaming({ version: open.version, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); keep('enter'); } else if (e.key === 'Escape') { e.preventDefault(); keep('esc'); } }}
              onBlur={() => keep('away')}
              className="h-[22px] w-[150px] rounded-md border border-ink bg-bg px-1.5 text-[12px] text-ink shadow-[0_0_0_3px_rgba(250,250,250,0.1)] outline-none" />
            {/* the hint under the field, aligned with it */}
            <span data-name-hint className="pointer-events-none absolute left-0 top-[23px] whitespace-nowrap text-[11.5px] leading-4 text-sub">Enter keeps the name · Esc for no name</span>
            </span>
          </span>
        )}
      </span>
      {open ? (
        <span key="hint" className="h-4" aria-hidden="true" />
      ) : (
        <span key={status?.line2 ?? ''} className="flex h-4 min-w-0 items-center gap-1 whitespace-nowrap text-[11.5px] duration-200 animate-in fade-in-0" data-status-line2>
          {lastSave?.made && lastSave.why !== 'you' && !named && (
            <>
              <button type="button" data-name-it onClick={() => { done.current = undefined; setNaming({ version: lastSave.version, text: '' }); }}
                className="-my-1 inline-flex h-6 cursor-pointer items-center text-[11.5px] text-ink-3 underline decoration-edge-strong underline-offset-2 hover:text-ink">Name it</button>
              <span className="flex-none text-sub">(optional) ·</span>
            </>
          )}
          <span className="min-w-0 truncate" title={status?.line2}>{status?.line2}</span>
        </span>
      )}
    </div>
  );
}
