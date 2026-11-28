'use client';
// The Edit page's data (stage 2 of "saving apart from history", 14 Nov 2026): the working cut, its history, the saved
// versions and the render states. The user: "Every edit that I make creates a new version, which is completely unlike
// other applications … If I want to save a version, I just click Command-S". An edit is now one step of the history,
// kept at once and never numbered; a version is written only when a state is meant to be kept (Save, a render, an
// export). The routes (src/app/api/films/[film]/cut*, src/server/edit/working.ts):
//   GET  …/cut/working            → { film, mock?, working (WorkingCut, with its tracks), history } (seeded on first use)
//   POST …/cut/working { rev, words, by: 'user', tracks, markers } → 201 { working, history } (one step) · 200 same: true
//   POST …/cut/undo|redo { rev } · …/cut/restore { rev, version } → { working, history }
//   POST …/cut/save { rev, name?, why } → { version, made, working, history } · POST …/cut/name { version, name }
//   A stale `rev` is 409 code "stale" with the current working and history; 422 { error, problems }: it does not validate.
//   GET  …/cut                    → { versions, current (the newest version), renders, sourceSeconds, problems?, working
//                                     (in brief, its rev), history, names } (polled every 10 s; never makes anything)
//   GET  …/cut?version=v3         → { timeline } (an older version, viewed read only)
//   POST …/cut/render { version, kind, options?, retry?, again? } → 202 RenderState · GET …/cut/render/<version>
// Every render goes through `ensureSaved(why)`: a working cut with edits since the newest version is saved as a version
// first (the status line says so), and the render is of that version. Under MOCK=boards the same routes keep a sample
// film's working cut, history and saved versions in the server's memory (working.ts memoryStore); nothing is written.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CutRenders, RenderOptions, RenderState, Timeline, TimelineMarker, TimelineTrack, TimelineVersionRef } from '@/server/types';
import { addStep, goToOf, PENDING_STATE, redoOf, summaryOf, undoOf, workingOf, type CutHistory, type HistorySummary, type SaveWhy, type WorkingCut } from './history';
import { outsideStepWords, staleWords } from './controls';
import { askBody } from './renderAsk';

export type VersionInfo = TimelineVersionRef;
export type { RenderState };
export type Renders = CutRenders;
export type CutMode = 'loading' | 'live' | 'fixture' | 'none' | 'error';
/** A version saved by this page: which, why, and the edits it kept (for the status line). Shown while `rev` is the
 *  working cut's rev (the next step, undo or redo ends it). */
export interface SaveNote { rev: number; version: string; why: SaveWhy; made: boolean; edits: number; since?: string }
/** Names given to versions (harness/version-names.json). */
export type VersionNames = Record<string, { name: string; at: string }>;

/** The current version's 480p and master, kept outside React state (14 Nov): a running render reports its percent
 *  every second, and only what shows the percent (the pill, the master button, the Renders tab's row) subscribes to
 *  it. The page reads `useCut().renders`, which changes only when a state or a file changes, never with the percent. */
export interface RendersStore { get: () => Renders; coarse: () => Renders; set: (f: (p: Renders) => Renders) => void; subscribe: (fn: () => void) => () => void }
function makeStore(): RendersStore {
  let cur: Renders = {};
  let coarse: { key: string; val: Renders } = { key: '{}', val: {} };
  const subs = new Set<() => void>();
  const strip = (x?: RenderState) => (x ? { ...x, percent: undefined } : undefined);
  return {
    get: () => cur,
    coarse: () => coarse.val,
    set: (f) => {
      const next = f(cur);
      if (next === cur) return;
      cur = next;
      const val: Renders = { ...(cur.proxy ? { proxy: strip(cur.proxy) } : {}), ...(cur.master ? { master: strip(cur.master) } : {}) };
      const key = JSON.stringify(val);
      if (key !== coarse.key) coarse = { key, val };
      for (const s of subs) s();
    },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
/** Everything, the percent included: for the components that show it. */
export function useRendersLive(store: RendersStore): Renders {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const isTimeline = (x: unknown): x is Timeline => !!x && typeof x === 'object' && Array.isArray((x as Timeline).tracks) && typeof (x as Timeline).version === 'string';
const isWorking = (x: unknown): x is WorkingCut => !!x && typeof x === 'object' && typeof (x as WorkingCut).rev === 'number' && Array.isArray((x as WorkingCut).tracks);
const busy = (s?: RenderState['state']) => s === 'queued' || s === 'running';
/** The page's identity for a state of the working cut: "w" and its rev. Never a version name, and never given to
 *  anything that reads version numbers (vnum, unreadableSplit, renderList, the pill): those get `ref`, `newest`, `equals`. */
export const stateId = (rev: number) => `w${rev}`;
const sameContent = (a: Pick<Timeline, 'tracks' | 'markers' | 'fps' | 'width' | 'height'>, b: Pick<Timeline, 'tracks' | 'markers' | 'fps' | 'width' | 'height'>) =>
  a.fps === b.fps && a.width === b.width && a.height === b.height && JSON.stringify(a.tracks) === JSON.stringify(b.tracks) && JSON.stringify(a.markers ?? []) === JSON.stringify(b.markers ?? []);

/** The working cut as the page's Timeline: its identity `w<rev>`, the step's words as its note (no renders: those are
 *  of a saved version, `refRenders`). */
function timelineOf(w: Pick<WorkingCut, 'fps' | 'width' | 'height' | 'tracks' | 'markers' | 'note' | 'by' | 'at' | 'version'>, id: string): Timeline {
  return { version: id, fps: w.fps, width: w.width, height: w.height, ...(w.version ? { basedOn: w.version } : {}), note: w.note, by: w.by === 'alma' ? 'alma' : 'user', at: w.at, tracks: w.tracks, markers: w.markers ?? [] };
}

interface CutGet { film?: string; mock?: boolean; versions?: VersionInfo[]; current?: unknown; timelines?: unknown[]; renders?: Record<string, Renders>; problems?: Record<string, string[]>; sourceSeconds?: Record<string, number>; auto480p?: boolean; error?: string; working?: { rev: number } | null; names?: VersionNames }
interface WorkingAnswerJ { working?: unknown; history?: HistorySummary; error?: string; code?: string; problems?: string[]; same?: boolean; version?: string; made?: boolean; render?: RenderState; name?: string }

/** The hash a predicted step carries until the server's answer gives the real one. */
const PENDING = PENDING_STATE;
const asHistory = (h: HistorySummary): CutHistory => ({ format: 1, rev: h.rev, at: h.at, steps: h.steps });
/** What the page shows of a working cut and history: a prediction that matches the server's answer is not drawn again. */
const shownKey = (w: WorkingCut, h: HistorySummary) => JSON.stringify([w.rev, w.version, w.equals, w.edited, w.note, w.by, w.fps, w.width, w.height, w.tracks, w.markers,
  h.rev, h.at, h.since, h.steps.map((x) => [x.words, x.by, x.saved, x.version])]);

export const STALE_WORDS = staleWords([], 0);

export function useCut(film: string) {
  const [mode, setMode] = useState<CutMode>('loading');
  // the working cut as the page shows it (`w<rev>`), the server's working cut and history
  const [current, setCurrent] = useState<Timeline>();
  const [working, setWorking] = useState<WorkingCut>();
  const [history, setHistory] = useState<HistorySummary>();
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [names, setNames] = useState<VersionNames>({});
  // the newest version as GET …/cut gave it (its renders record)
  const [newestTl, setNewestTl] = useState<Timeline>();
  const [store] = useState(makeStore);
  // the same without the percent: one object until a state, a path or an error changes. Kept as the page's own state
  // (not useSyncExternalStore, whose updates draw apart): a change of state lands in the same draw as the step that
  // caused it, so a ⌘Z stays one draw of the page (F15)
  const [coarse, setCoarse] = useState<Renders>(store.coarse);
  useEffect(() => store.subscribe(() => setCoarse(store.coarse())), [store]);
  const setRenders = store.set;
  const [saving, setSaving] = useState<string>();
  const [error, setErrorRaw] = useState<string>();
  const [problems, setProblems] = useState<string[]>([]);
  const [unreadable, setUnreadable] = useState<Record<string, string[]>>({});
  // the length of each file the cut plays (GET …/cut, kept across loads)
  const [lengths, setLengths] = useState<Record<string, number>>({});
  // the server renders the 480p of every saved version by itself (HARNESS_AUTO_480P=1): sample mode then asks for it after a save
  const auto = useRef(false);
  const [auto480p, setAuto480p] = useState(false);
  // the last save this page made, and words for the status line after a refused step (each shown while its rev is the cut's)
  const [lastSave, setLastSave] = useState<SaveNote>();
  const [notice, setNotice] = useState<{ rev: number; text: string }>();
  // the changes this page landed (steps, undos, redos, restores): the browser tests' "an edit landed". A ref, as is the
  // flag of a change in flight: neither draws the page (a delete and a ⌘Z stay one draw each, F15)
  const stepsRef = useRef(0);
  const busyRef = useRef<string | undefined>(undefined);
  // the key of what the page shows now when it was predicted (a step, an undo, a redo before the server answered)
  const predicted = useRef<string | undefined>(undefined);
  // names given by this page since a GET …/cut was sent: that GET's older names never undo them
  const namesSeq = useRef(0);
  const seen = useRef(new Map<string, Timeline>());
  // the content of each state the page has had, by its hash (an undo or a redo shows at once when it is known)
  const contents = useRef(new Map<string, Timeline>());
  const modeRef = useRef(mode);
  const savingRef = useRef(saving);
  const revRef = useRef(-1);
  const workingRef = useRef<WorkingCut | undefined>(undefined);
  const historyRef = useRef<HistorySummary | undefined>(undefined);
  const refRef = useRef<string | undefined>(undefined);
  // every POST runs after the one before (an edit, then a render asked for at once, never race)
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inChain = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.current.then(fn, fn);
    chain.current = run.catch(() => undefined);
    return run;
  }, []);
  useEffect(() => { modeRef.current = mode; savingRef.current = saving; }, [mode, saving]);

  const setError = useCallback((e: string | undefined, p: string[] = []) => { setErrorRaw(e); setProblems(p); }, []);
  const remember = (tl: Timeline) => { seen.current.set(tl.version, tl); };

  // the version the cut is (the one it equals), else the version it stands on (the last one at or before the history's
  // pointer: "1 edit since v40" after undoing past v41), else the newest; its renders are this cut's, named as of it.
  // QC round two: after an undo past the newest save the header named v41 while the cut was v40 with one edit
  const newest = working?.version ?? versions[versions.length - 1]?.version;
  const equals = working?.equals;
  const edited = !!working?.edited;
  const ref = equals ?? history?.since?.version ?? newest;
  useEffect(() => { refRef.current = ref; }, [ref]);
  const newestRef = useRef<Timeline | undefined>(undefined);
  useEffect(() => { newestRef.current = newestTl; }, [newestTl]);

  /** A working cut and history from the server, taken when they are not older than what the page has (a 10 s poll or
   *  a late answer never brings back an older rev over a newer one). True when taken. */
  const show = useCallback((w: WorkingCut, h: HistorySummary) => {
    setWorking(w);
    setHistory(h);
    const id = stateId(w.rev);
    const tl = timelineOf(w, id);
    // the same object when nothing differs: no draw of the timeline for nothing
    setCurrent((prev) => (prev && prev.version === id && sameContent(prev, tl) && prev.note === tl.note && prev.by === tl.by ? prev : tl));
  }, []);
  const adopt = useCallback((w: unknown, h: HistorySummary | undefined): boolean => {
    if (!isWorking(w) || !h || w.rev < revRef.current) return false;
    revRef.current = w.rev;
    workingRef.current = w;
    historyRef.current = h;
    // the version the cut is shown as, at once (a render asked for right after a save follows the new version)
    refRef.current = w.equals ?? h.since?.version ?? w.version ?? refRef.current;
    const here = h.steps[h.at];
    if (here) contents.current.set(here.state, timelineOf(w, stateId(w.rev)));
    // the answer is what the page predicted and shows already: nothing to draw (the refs hold the server's own)
    const p = predicted.current;
    predicted.current = undefined;
    if (p && p === shownKey(w, h)) return true;
    const id = stateId(w.rev);
    const tl = timelineOf(w, id);
    setWorking(w);
    setHistory(h);
    // the same object when nothing differs (the optimistic state of an undo, say): no draw of the timeline for nothing
    setCurrent((prev) => (prev && prev.version === id && sameContent(prev, tl) && prev.note === tl.note && prev.by === tl.by ? prev : tl));
    return true;
  }, []);
  /** The newest version and its content hash as the history knows them (to predict `edited` and `equals`). */
  const newestInfo = (h: HistorySummary, w: WorkingCut) => {
    const v = w.version;
    if (!v) return undefined;
    for (let i = h.steps.length - 1; i >= 0; i--) if (h.steps[i].saved === v || h.steps[i].version === v) return { version: v, state: h.steps[i].state };
    return undefined;
  };
  /** Shows a predicted working cut and history at once (the server's answer then draws nothing when it agrees). */
  const predict = useCallback((h: CutHistory, content: Pick<WorkingCut, 'fps' | 'width' | 'height' | 'tracks' | 'markers'>) => {
    const w0 = workingRef.current, h0 = historyRef.current;
    if (!w0 || !h0) return;
    const w = workingOf(h, content, newestInfo(h0, w0));
    const sum = summaryOf(h);
    predicted.current = shownKey(w, sum);
    show(w, sum);
  }, [show]);

  /** GET …/cut/working: the working cut and its history (made the first time from the newest version). */
  const loadWorking = useCallback(async (): Promise<'ok' | 'none' | 'error'> => {
    try {
      const r = await fetch(`/api/films/${film}/cut/working`, { cache: 'no-store' });
      const j = (await r.json().catch(() => ({}))) as WorkingAnswerJ;
      if (r.status === 404) return 'none';
      if (!r.ok) { setErrorRaw(j.error ?? `GET …/cut/working answered ${r.status}`); return 'error'; }
      adopt(j.working, j.history);
      return 'ok';
    } catch {
      return 'error';
    }
  }, [film, adopt]);

  /** GET …/cut: the saved versions, the newest one's renders, the files' lengths, the names; and, when the server's
   *  working cut is ahead of the page's (Alma, another tab, a version file that appeared on disk), the working cut again
   *  (`followServer`, the hook for changes made outside this page). */
  const load = useCallback(async (): Promise<void> => {
    let r: Response;
    const seq = namesSeq.current;
    try {
      r = await fetch(`/api/films/${film}/cut`, { cache: 'no-store' });
    } catch {
      if (modeRef.current === 'loading') { setMode('error'); setErrorRaw('The harness server is not answering'); }
      return;
    }
    const j = (await r.json().catch(() => ({}))) as CutGet;
    if (!r.ok) {
      // a film with no cut folder is a 404; the drive missing is a 503: both leave what the page has
      if (modeRef.current === 'loading') { setMode(r.status === 404 ? 'none' : 'error'); setErrorRaw(j.error ?? `GET …/cut answered ${r.status}`); }
      return;
    }
    auto.current = !!j.auto480p;
    setAuto480p(!!j.auto480p);
    const un = j.problems ?? {};
    setUnreadable((was) => (JSON.stringify(was) === JSON.stringify(un) ? was : un));
    const got = j.sourceSeconds ?? {};
    setLengths((was) => (Object.entries(got).every(([k, v]) => was[k] === v) ? was : { ...was, ...got }));
    const nm = j.names ?? {};
    if (seq === namesSeq.current) setNames((was) => (JSON.stringify(was) === JSON.stringify(nm) ? was : nm));
    const vs = Array.isArray(j.versions) ? j.versions : [];
    setVersions((was) => (JSON.stringify(was) === JSON.stringify(vs) ? was : vs));
    for (const t of (j.timelines ?? []).filter(isTimeline)) remember(t);
    if (!isTimeline(j.current)) { if (modeRef.current === 'loading') setMode('none'); return; }
    const tl = j.current;
    remember(tl);
    newestRef.current = tl;
    setNewestTl((was) => (was && JSON.stringify(was) === JSON.stringify(tl) ? was : tl));
    if (!j.mock && j.renders?.[tl.version] && refRef.current === tl.version) setRenders((p) => { const n = j.renders![tl.version]; return JSON.stringify(n) === JSON.stringify(p) ? p : n; });
    // the server's working cut moved on without this page (another tab, Alma, a version file written by hand): read it
    if (busyRef.current) return;
    const had = !!workingRef.current;
    const behind = !had || (j.working && j.working.rev > revRef.current);
    if (behind) {
      // the newest step the page knew: only a step made after it is news (15 Nov: another tab's undo or save that
      // left the pointer on an older step of Alma's said "Alma changed the cut" though she did nothing)
      const knew = (historyRef.current?.steps ?? []).reduce((m, x) => Math.max(m, x.rev), -1);
      const w = await loadWorking();
      // a step of Alma's (a drop), or a version written by hand, taken in while the page is open: said in the status
      // line, in plain words (it fades in)
      const h = historyRef.current, here = h?.steps[h.at];
      const said = had && w === 'ok' && here && here.rev > knew ? outsideStepWords(here) : undefined;
      if (said) setNotice({ rev: revRef.current, text: said });
      if (w === 'none') { if (modeRef.current === 'loading') setMode('none'); return; }
      if (w === 'error' && !workingRef.current) { if (modeRef.current === 'loading') setMode('error'); return; }
    }
    if (modeRef.current === 'loading') setMode(j.mock ? 'fixture' : 'live');
  }, [film, setRenders, loadWorking]);
  /** The hook for a change made outside this page (a version file that appeared on disk, Alma's step, another tab):
   *  reads the working cut and history again when the server's rev is ahead of the page's. */
  const followServer = load;
  /** Reads the cut afresh as on the page's first load: after the first cut of a film was made (the timeline from day
   *  one: a film with a locked script and no cut gets v1 on the page's first read). */
  const reload = useCallback(async () => { modeRef.current = 'loading'; setMode('loading'); await load(); }, [load]);

  // first load, then every 10 s (Alma's versions, a render the watcher queued, another tab's steps); never while a
  // change is being written
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set when the fetch answers, not synchronously
    void load();
    const t = setInterval(() => { if ((modeRef.current === 'live' || modeRef.current === 'fixture') && !savingRef.current && !busyRef.current) void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  // the renders of the version the cut is (or of the newest when it has edits since): read when that version changes
  const renders = useMemo<Renders>(() => (coarse.master && ref && coarse.master.version !== ref ? { ...coarse, master: undefined } : coarse), [coarse, ref]);
  const proxyState = renders.proxy?.state;
  const masterState = renders.master?.state;
  const readRenders = useCallback(async (v: string, all = true) => {
    try {
      const r = await fetch(`/api/films/${film}/cut/render/${encodeURIComponent(v)}`, { cache: 'no-store' });
      if (!r.ok) return undefined;
      const j = (await r.json()) as { version: string } & Renders;
      if (j.version !== v || refRef.current !== v) return j;
      setRenders((p) => {
        // a render this page has just asked for is never taken back to "none" by an answer read before the ask landed
        const asked = (x?: RenderState, got?: RenderState) => !!x && x.version === v && busy(x.state) && (!got || got.state === 'none');
        const proxy = asked(p.proxy, j.proxy) ? p.proxy : j.proxy ?? (p.proxy?.version === v ? p.proxy : undefined);
        const master = asked(p.master, j.master) ? p.master : all ? j.master : p.master;
        return JSON.stringify([p.master ?? null, p.proxy ?? null]) === JSON.stringify([master ?? null, proxy ?? null]) ? p : { ...p, master, proxy };
      });
      return j;
    } catch { return undefined; }
  }, [film, setRenders]);
  useEffect(() => {
    if (!ref || (mode !== 'live' && mode !== 'fixture')) return;
    // a different version: what the store held was another version's
    setRenders((p) => ((p.proxy && p.proxy.version !== ref) || (p.master && p.master.version !== ref) ? {} : p));
    void readRenders(ref);
  }, [ref, mode, readRenders, setRenders]);
  // while a render of that version is queued or running, follow it
  useEffect(() => {
    if (!ref || (mode !== 'live' && mode !== 'fixture') || (!busy(proxyState) && !busy(masterState))) return;
    const t = setInterval(async () => {
      const j = await readRenders(ref);
      // a proxy or a master that landed is recorded in the version file (renders.proxy, renders.master): read it again
      if (j && ((busy(proxyState) && j.proxy?.state === 'done') || (busy(masterState) && j.master?.state === 'done'))) void load();
    }, 1000);
    return () => clearInterval(t);
  }, [mode, ref, proxyState, masterState, load, readRenders]);

  /** A version's Timeline: from what this page has seen, else GET …/cut?version=<v>. */
  const view = useCallback(async (v: string): Promise<Timeline | undefined> => {
    const have = seen.current.get(v);
    if (have) return have;
    try {
      const r = await fetch(`/api/films/${film}/cut?version=${encodeURIComponent(v)}`, { cache: 'no-store' });
      if (!r.ok) return undefined;
      const j = (await r.json()) as { timeline?: unknown };
      if (isTimeline(j.timeline) && j.timeline.version === v) { remember(j.timeline); return j.timeline; }
    } catch { /* not served */ }
    return undefined;
  }, [film]);

  // the timeline of the version the cut is shown as (its renders record: the 480p and master on file)
  const [refTl, setRefTl] = useState<Timeline>();
  useEffect(() => {
    if (!ref || ref === newestTl?.version) return;
    let live = true;
    void view(ref).then((t) => { if (live && t) setRefTl(t); });
    return () => { live = false; };
  }, [ref, newestTl, view]);
  const refRenders = ref && ref === newestTl?.version ? newestTl.renders : refTl && refTl.version === ref ? refTl.renders : undefined;

  // the 480p the version file records (a sample's v1, a file made before this page opened) is this cut's while the
  // store knows nothing newer of it, as GET …/cut answers it for the newest version
  const recordedProxy = refRenders?.proxy?.path && ref ? { version: ref, path: refRenders.proxy.path, at: refRenders.proxy.at } : undefined;
  useEffect(() => {
    if (!recordedProxy) return;
    const { version, path, at } = recordedProxy;
    setRenders((p) => (p.proxy && p.proxy.version === version && p.proxy.state !== 'none' ? p : { ...p, proxy: { version, kind: 'proxy', state: 'done', path, finishedAt: at } }));
  }, [recordedProxy?.version, recordedProxy?.path, recordedProxy?.at, setRenders]); // eslint-disable-line react-hooks/exhaustive-deps


  /** One POST of the working cut's routes, with the page's rev. A stale rev takes the server's working cut and history
   *  (sent with the refusal) and says so in the status line, in plain words. */
  const send = useCallback(async (route: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; j: WorkingAnswerJ }> => {
    let r: Response;
    try {
      r = await fetch(`/api/films/${film}/cut/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev: revRef.current, ...body }) });
    } catch {
      return { ok: false, status: 0, j: { error: 'The harness server is not answering' } };
    }
    const j = (await r.json().catch(() => ({}))) as WorkingAnswerJ;
    if (r.status === 409 && j.code === 'stale') {
      const was = revRef.current;
      if (!adopt(j.working, j.history)) await loadWorking();
      // "Alma's change came in first" when a step of hers is among those since the page's rev
      setNotice({ rev: revRef.current, text: staleWords(historyRef.current?.steps ?? [], was) });
    }
    return { ok: r.ok, status: r.status, j };
  }, [film, adopt, loadWorking]);

  const failed = useCallback((status: number, j: WorkingAnswerJ, what: string) => {
    if (status === 409 && j.code === 'stale') return;
    if (status === 0) setError(`The harness server is not answering; ${what} was not kept`);
    else if (status === 422) setError(`Not kept: ${j.error ?? 'the cut does not validate'}`, j.problems ?? []);
    else setError(`Not kept (${status}): ${j.error ?? 'the server refused it'}`, j.problems ?? []);
  }, [setError]);

  /** One finished gesture = one step of the history (no version is written). The page shows it at once, predicted
  *  with history.ts's own moves; the server's answer draws nothing more when it agrees. `saved` runs with the step, in
  *  the same draw (a line for the status bar, say). */
  const commit = useCallback(async (edit: { tracks: TimelineTrack[]; markers: TimelineMarker[]; base?: string }, note: string, saved?: () => void): Promise<boolean> => {
    const w0 = workingRef.current, h0 = historyRef.current;
    if (!current || busyRef.current || savingRef.current || !w0 || !h0) return false;
    const before = current;
    busyRef.current = 'step';
    const words = note.trim().slice(0, 300);
    predict(addStep(asHistory(h0), { by: 'user', words, at: new Date().toISOString(), state: PENDING }).history,
      { fps: w0.fps, width: w0.width, height: w0.height, tracks: edit.tracks, markers: edit.markers });
    if (error) setError(undefined);
    saved?.();
    return inChain(async () => {
      try {
        // the step is sent with the rev of the cut the edit was made on: a drop of Alma's taken in while
        // the gesture was under way moved the page's rev on before the timeline it was made on was drawn again, so the
        // edit, made on the cut from before the drop, went in as the newer rev and the drop's change was lost without a
        // word. Made on an older rev, it is refused as stale, as a late drop is, and the page says the cut changed.
        const made = /^w(\d+)$/.exec(edit.base ?? '');
        const { ok, status, j } = await send('working', { words: note, by: 'user', tracks: edit.tracks, markers: edit.markers, ...(made ? { rev: Number(made[1]) } : {}) });
        if (!ok) {
          predicted.current = undefined;
          if (!(status === 409 && j.code === 'stale')) { show(workingRef.current ?? w0, historyRef.current ?? h0); setCurrent(before); }
          failed(status, j, 'the change');
          return false;
        }
        adopt(j.working, j.history);
        if (!j.same) stepsRef.current++;
        return true;
      } finally {
        busyRef.current = undefined;
      }
    });
  }, [current, error, setError, inChain, send, adopt, failed, predict, show]);

  /** Undo or redo: the pointer one step back or on; nothing is written but the history. Shown at once when the page has
   *  had that state (predicted; the answer then draws nothing). `done` runs with it, in the same draw. */
  const move = useCallback(async (kind: 'undo' | 'redo' | 'goto', done?: () => void, stepRev?: number): Promise<boolean> => {
    const h0 = historyRef.current, w0 = workingRef.current;
    if (!h0 || !w0 || busyRef.current || savingRef.current) return false;
    if (kind === 'goto' ? !h0.steps.some((x) => x.rev === stepRev) || h0.steps[h0.at]?.rev === stepRev : !(kind === 'undo' ? h0.undo : h0.redo)) return false;
    busyRef.current = kind;
    const target = kind === 'goto' ? h0.steps.find((x) => x.rev === stepRev) : h0.steps[h0.at + (kind === 'undo' ? -1 : 1)];
    const known = target ? contents.current.get(target.state) : undefined;
    const next = kind === 'goto' ? goToOf(asHistory(h0), stepRev!) : (kind === 'undo' ? undoOf : redoOf)(asHistory(h0));
    if (known && next) {
      predict(next, { fps: known.fps, width: known.width, height: known.height, tracks: known.tracks, markers: known.markers });
      if (error) setError(undefined);
      done?.();
    }
    return inChain(async () => {
      try {
        const { ok, status, j } = await send(kind, kind === 'goto' ? { step: stepRev } : {});
        if (!ok) {
          predicted.current = undefined;
          if (!(status === 409 && j.code === 'stale')) show(workingRef.current ?? w0, historyRef.current ?? h0);
          failed(status, j, kind === 'goto' ? 'going to that step' : `the ${kind}`);
          return false;
        }
        adopt(j.working, j.history);
        stepsRef.current++;
        if (!(known && next)) { if (error) setError(undefined); done?.(); }
        return true;
      } finally {
        busyRef.current = undefined;
      }
    });
  }, [error, setError, inChain, send, adopt, failed, predict, show]);
  const undo = useCallback((done?: () => void) => move('undo', done), [move]);
  const redo = useCallback((done?: () => void) => move('redo', done), [move]);
  /** The pointer on a step of the history (a press on the History tab's row): nothing is written but the history. */
  const goTo = useCallback((stepRev: number, done?: () => void) => move('goto', done, stepRev), [move]);

  /** An older version into the working cut, as one step that undo takes back (POST …/cut/restore). */
  const restore = useCallback(async (version: string, done?: () => void): Promise<boolean> => {
    if (savingRef.current || busyRef.current) return false;
    busyRef.current = 'restore';
    setError(undefined);
    return inChain(async () => {
      try {
        const { ok, status, j } = await send('restore', { version });
        if (!ok) { failed(status, j, `opening ${version}`); return false; }
        adopt(j.working, j.history);
        if (!j.same) stepsRef.current++;
        done?.();
        return true;
      } finally {
        busyRef.current = undefined;
      }
    });
  }, [setError, inChain, send, adopt, failed]);

  /** The cut's frame set to another size (the brief says 16:9 and the cut is 9:16), as one step that can be
   *  undone; the tracks and markers stay as they are. */
  const setFrameSize = useCallback(async (width: number, height: number, words: string): Promise<boolean> => {
    const w0 = workingRef.current;
    if (!w0 || savingRef.current || busyRef.current) return false;
    busyRef.current = 'frame';
    setError(undefined);
    return inChain(async () => {
      try {
        const { ok, status, j } = await send('working', { words, by: 'user', tracks: w0.tracks, markers: w0.markers ?? [], width, height });
        if (!ok) { failed(status, j, 'the frame size'); return false; }
        adopt(j.working, j.history);
        if (!j.same) stepsRef.current++;
        return true;
      } finally {
        busyRef.current = undefined;
      }
    });
  }, [setError, inChain, send, adopt, failed]);

  /** Keeps the working cut as the next version (⌘S, Save, a render, an export): asks nothing. When nothing changed since
   *  the newest version no file is written (`made: false`). The status line says what happened (`lastSave`). */
  const saveNow = useCallback(async (why: SaveWhy, name?: string): Promise<{ version?: string; made?: boolean; error?: string }> => {
    const h = historyRef.current;
    const since = h?.since;
    setSaving('save');
    try {
      const { ok, status, j } = await send('save', { why, ...(name ? { name } : {}) });
      if (!ok || !j.version) { failed(status, j, 'the save'); return { error: j.error ?? `The server answered ${status}` }; }
      adopt(j.working, j.history);
      if (j.made) setLastSave({ rev: revRef.current, version: j.version, why, made: true, edits: since?.count ?? 0, since: since?.version });
      else if (why === 'you') setLastSave({ rev: revRef.current, version: j.version, why, made: false, edits: 0, since: since?.version });
      // the new version in the list (and its content, so it can be viewed without asking)
      if (j.made) {
        const w = workingRef.current;
        const ver = j.version;
        if (w) {
          const t: Timeline = { ...timelineOf(w, ver), version: ver, basedOn: newestRef.current?.version };
          remember(t);
          newestRef.current = t;
          setNewestTl(t);
        }
        setVersions((vs) => (vs.some((v) => v.version === ver) ? vs : [...vs, { version: ver, at: new Date().toISOString(), note: w?.note, by: why === 'alma' ? 'alma' : 'user', basedOn: vs[vs.length - 1]?.version }]));
        void load();
      }
      if (name) { namesSeq.current++; setNames((n) => ({ ...n, [j.version!]: { name, at: new Date().toISOString() } })); }
      return { version: j.version, made: !!j.made };
    } finally {
      setSaving(undefined);
    }
  }, [send, adopt, failed, load]);
  const save = useCallback((o: { why?: SaveWhy; name?: string } = {}) => inChain(() => saveNow(o.why ?? 'you', o.name)), [inChain, saveNow]);

  /** The version every render, export and final is made of: the version the cut equals, else a version saved now (the
   *  status line says "Saved as v237 for this render, with your 2 edits since v236."). */
  const ensureSaved = useCallback((why: SaveWhy = 'render'): Promise<{ version?: string; made?: boolean; error?: string }> => inChain(async () => {
    const w = workingRef.current;
    if (!w) return { error: 'The cut is not read yet' };
    if (w.equals) return { version: w.equals, made: false };
    return saveNow(why);
  }), [inChain, saveNow]);

  /** A name for a saved version, exactly as typed (POST …/cut/name); an empty one takes the name away. */
  const nameVersion = useCallback(async (version: string, name: string): Promise<boolean> => {
    namesSeq.current++;
    try {
      const r = await fetch(`/api/films/${film}/cut/name`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version, name }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!r.ok) { setError(`The name was not kept: ${j.error ?? r.status}`); return false; }
      setNames((n) => { const x = { ...n }; if (j.name) x[version] = { name: j.name, at: new Date().toISOString() }; else delete x[version]; return x; });
      return true;
    } catch {
      setError('The harness server is not answering; the name was not kept');
      return false;
    }
  }, [film, setError]);

  /** Which version a render asked "of this cut" is made of: `v` itself when it names another version (one viewed read
   *  only), else the version ensureSaved gives (`saved` when it was written now). */
  const target = useCallback(async (v: string | undefined): Promise<{ version?: string; error?: string; own: boolean }> => {
    if (v !== undefined && v !== refRef.current) return { version: v, own: false };
    const s = await ensureSaved('render');
    return { version: s.version, error: s.error, own: true };
  }, [ensureSaved]);

  /** The 480p of a version, asked for (the Renders tab's "Render it", QC of the cut, the phone): of this cut when `v`
   *  is undefined or the version the cut is shown as (saved first when it has edits). The cut's own is followed in the
   *  store; the answer is the render's state and its version, or the server's refusal in its own words. */
  const renderProxy = useCallback(async (v?: string, o: { retry?: boolean; follow?: boolean } = {}): Promise<{ state?: RenderState; error?: string; version?: string }> => {
    const t = await target(v);
    if (!t.version) return { error: t.error ?? 'Nothing to render' };
    const ver = t.version;
    const follow = o.follow ?? (t.own || ver === refRef.current);
    // this cut's own render is always followed; another version's only while the store holds nothing of this cut's
    const put = (x: RenderState) => setRenders((p) => (t.own || !p.proxy || p.proxy.version === ver || p.proxy.version !== refRef.current ? { ...p, proxy: x } : p));
    if (follow) put({ version: ver, kind: 'proxy', state: 'queued' });
    try {
      const r = await fetch(`/api/films/${film}/cut/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: ver, kind: 'proxy', ...(o.retry ? { retry: true } : {}) }) });
      const j = (await r.json().catch(() => ({}))) as RenderState & { error?: string };
      if (!r.ok) {
        if (follow) put({ version: ver, kind: 'proxy', state: 'failed', error: j.error });
        return { error: j.error ?? `The server answered ${r.status}`, version: ver };
      }
      if (follow) put(j);
      return { state: j, version: ver };
    } catch {
      if (follow) put({ version: ver, kind: 'proxy', state: 'failed', error: 'The harness server is not answering' });
      return { error: 'The harness server is not answering; nothing was asked', version: ver };
    }
  }, [film, setRenders, target]);

  /** Resolves when the 480p of `v` followed in the store is done or failed (its state), or with nothing when the store
   *  moves on to another version (a change made meanwhile). For QC of the cut, which waits for it. */
  const proxyLanded = useCallback((v: string) => new Promise<RenderState | undefined>((resolve) => {
    let off = () => {};
    let over = false;
    const look = () => {
      if (over) return;
      const p = store.get().proxy;
      if (p && p.version !== v) { over = true; off(); resolve(undefined); }
      else if (p && (p.state === 'done' || p.state === 'failed')) { over = true; off(); resolve(p); }
    };
    off = store.subscribe(look);
    look();
  }), [store]);

  /** "Render master" (and "Try again" on a master that failed: `retry`; "Render master again" on one out of date:
   *  `again`, a new master beside it, masters.ts): of this cut, saved first when it has edits. */
  const renderMaster = useCallback(async (retry = false, again = false) => {
    const t = await target(undefined);
    if (!t.version) { if (t.error) setError(`Master not queued: ${t.error}`); return; }
    const v = t.version;
    setRenders((p) => ({ ...p, master: { version: v, kind: 'master', state: 'queued' } }));
    try {
      const r = await fetch(`/api/films/${film}/cut/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: v, kind: 'master', ...(retry ? { retry: true } : {}), ...(again ? { again: true } : {}) }) });
      const j = (await r.json().catch(() => ({}))) as RenderState & { error?: string };
      if (!r.ok) { setRenders((p) => ({ ...p, master: { version: v, kind: 'master', state: 'failed', error: j.error } })); setError(`Master not queued: ${j.error ?? r.status}`); return; }
      setRenders((p) => ({ ...p, master: j }));
    } catch {
      setRenders((p) => ({ ...p, master: { version: v, kind: 'master', state: 'failed' } }));
    }
  }, [film, setError, setRenders, target]);

  /** A render with options (Renders.tsx, renderAsk.ts): POST …/cut/render {version, kind, options, retry?}; of this cut
   *  (saved first when it has edits) when `v` is the version the cut is shown as. It answers the render's state (done at
   *  once when those files are already there), or the server's refusal in its own words. */
  const renderWith = useCallback(async (v: string, kind: RenderState['kind'], options: RenderOptions, retry = false): Promise<{ state?: RenderState; error?: string }> => {
    const t = await target(v);
    if (!t.version) return { error: t.error ?? 'Nothing to render' };
    try {
      const r = await fetch(`/api/films/${film}/cut/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(askBody(t.version, kind, options, retry)) });
      const j = (await r.json().catch(() => ({}))) as RenderState & { error?: string };
      if (!r.ok) return { error: j.error ?? `The server answered ${r.status}` };
      return { state: j };
    } catch {
      return { error: 'The harness server is not answering; nothing was asked' };
    }
  }, [film, target]);

  /** The FCPXML of this cut: saved first when it has edits (a version is what an editor opens). Live films only. */
  const exportCut = useCallback(async (): Promise<{ url?: string; error?: string }> => {
    if (modeRef.current !== 'live') return { error: 'Sample data is not exported' };
    const s = await ensureSaved('export');
    if (!s.version) return { error: s.error };
    return { url: `/api/films/${film}/cut/export?version=${encodeURIComponent(s.version)}&format=fcpxml` };
  }, [film, ensureSaved]);
  const canExport = mode === 'live' && !!current;

  // a version saved for a render, with HARNESS_AUTO_480P=1 in sample mode, asks for its 480p as the server does
  const lastAsked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (mode !== 'fixture' || !auto.current || !lastSave?.made || lastAsked.current === lastSave.version) return;
    lastAsked.current = lastSave.version;
    void renderProxy(lastSave.version, { follow: true });
  }, [mode, lastSave, renderProxy]);

  /** The step the cut is at as the server answered it (its rev and its content's hash): the page may still show its own
   *  prediction of it, whose hash is not known (a tick records the real one, 3b). Undefined while a change is in flight. */
  const hereNow = useCallback((): { rev: number; state: string } | undefined => {
    const h = historyRef.current, s = h?.steps[h.at];
    return s && !busyRef.current && s.state !== PENDING ? { rev: s.rev, state: s.state } : undefined;
  }, []);
  const sourceSeconds = useCallback((src: string): number | undefined => lengths[src], [lengths]);
  const saveShown = lastSave && working && lastSave.rev === working.rev ? lastSave : undefined;
  const noticeShown = notice && working && notice.rev === working.rev ? notice.text : undefined;

  return {
    mode, current, working, history, versions, names, newest, equals, edited, ref, refRenders, renders, rendersStore: store, auto480p, saving, error, problems, unreadable,
    /** The changes this page landed, and what is in flight (refs: they never draw the page; the browser tests read them). */
    landed: () => stepsRef.current, busy: () => busyRef.current ?? savingRef.current,
    lastSave: saveShown, notice: noticeShown, hereNow, setError, view, commit, undo, redo, goTo, restore, setFrameSize, save, ensureSaved, nameVersion, followServer, reload,
    renderMaster, renderProxy, proxyLanded, renderWith, exportCut, canExport, sourceSeconds,
  };
}

/** The renders with options of one version (GET …/cut/render/<version> `variants`), shared by everything on the page
 *  that shows them (the "More renders" button and the Renders tab, 14 Nov), so a render one of them started is seen
 *  by the other at once and the route is asked once. Asked while any of them is `on`, every second while one is
 *  queued or running (also when none is on: the button then shows a running dot), else every 10 s. `put` shows a
 *  state the POST answered at once, before the next ask. */
interface Shared { film: string; version: string; snap: { variants?: RenderState[]; error?: string }; subs: Set<() => void>; wants: number; timer?: ReturnType<typeof setTimeout>; asking?: boolean }
const sharedVariants = new Map<string, Shared>();
const NO_VARIANTS: Shared['snap'] = {};
function sharedOf(film: string, version: string): Shared {
  const k = `${film}/${version}`;
  let e = sharedVariants.get(k);
  if (!e) { e = { film, version, snap: {}, subs: new Set(), wants: 0 }; sharedVariants.set(k, e); }
  return e;
}
const emitShared = (e: Shared, snap: Shared['snap']) => { e.snap = snap; for (const f of e.subs) f(); };
function nextAsk(e: Shared): void {
  if (e.timer) clearTimeout(e.timer);
  e.timer = undefined;
  const running = (e.snap.variants ?? []).some((s) => busy(s.state));
  if (!e.subs.size || (!e.wants && !running)) return;
  e.timer = setTimeout(() => void askShared(e), running ? 1000 : 10_000);
}
async function askShared(e: Shared): Promise<void> {
  if (e.asking) return;
  e.asking = true;
  try {
    const r = await fetch(`/api/films/${e.film}/cut/render/${encodeURIComponent(e.version)}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { variants?: RenderState[]; error?: string };
    if (!r.ok) emitShared(e, { ...e.snap, error: j.error ?? `The server answered ${r.status}` });
    else {
      const variants = j.variants ?? [];
      if (e.snap.error || JSON.stringify(e.snap.variants) !== JSON.stringify(variants)) emitShared(e, { variants });
    }
  } catch {
    emitShared(e, { ...e.snap, error: 'The harness server is not answering' });
  } finally {
    e.asking = false;
    nextAsk(e);
  }
}
/** Something on the page wants the list now: asked at once, then followed; the returned function lets go. */
function wantShared(e: Shared): () => void {
  e.wants++;
  void askShared(e);
  return () => { e.wants--; nextAsk(e); };
}
export function useRenderVariants(film: string, version: string | undefined, on: boolean): { variants?: RenderState[]; error?: string; put: (s: RenderState) => void; refresh: () => void } {
  const e = version ? sharedOf(film, version) : undefined;
  const subscribe = useCallback((fn: () => void) => {
    if (!e) return () => {};
    e.subs.add(fn);
    nextAsk(e);
    return () => { e.subs.delete(fn); nextAsk(e); };
  }, [e]);
  const get = useCallback(() => e?.snap ?? NO_VARIANTS, [e]);
  const snap = useSyncExternalStore(subscribe, get, () => NO_VARIANTS);
  useEffect(() => {
    if (!e || !on) return;
    return wantShared(e);
  }, [e, on]);
  const put = useCallback((s: RenderState) => {
    if (!e || s.version !== e.version) return;
    const was = e.snap.variants ?? [];
    const i = was.findIndex((x) => x.kind === s.kind && x.tag === s.tag);
    emitShared(e, { variants: i < 0 ? [...was, s] : was.map((x, k) => (k === i ? s : x)) });
    nextAsk(e);
  }, [e]);
  const refresh = useCallback(() => { if (e) void askShared(e); }, [e]);
  return { variants: snap.variants, error: snap.error, put, refresh };
}
