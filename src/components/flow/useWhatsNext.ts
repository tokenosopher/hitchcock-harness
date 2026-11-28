'use client';
// What's next, read for the board's Edit box and the line beside its tab (ASKS 47, the timeline design's FlowWaiting
// and FlowEdit: "7 of 7 scenes have takes", "Next: check the 1080p shots", "What's next · 5 steps left"). The same
// reads and the same leftInputOf / whatIsLeft as the Edit step's list (CutSteps.tsx EditNext) and the Edit page, so the
// box and the list cannot disagree. Read only: nothing here writes, and it reads only on the film's change.
// One place: `useLeftReads` is what both the box and the list under the board (CutSteps.tsx EditNext) read, the six early
// steps from the script on included (15 Nov, the timeline from day one), so they cannot disagree with each other or with
// the Edit page (which builds the same input from the same pieces).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CutRenders, FilmState, Timeline, TimelineVersionRef } from '@/server/types';
import { useJson } from '@/components/pages/postCommon';
import { useShots } from '@/components/edit/ShotViews';
import { shotTimeline } from '@/components/edit/shots';
import { useFullView } from '@/components/edit/MasterSwitch';
import type { FullInfo } from '@/components/edit/fullsize';
import { useSeedanceMarks } from '@/components/edit/UpscaleCheck';
import { subsCounts, whatIsLeft, type LeftView } from '@/components/edit/left';
import { gapsOf, leftInputBefore, leftInputOf, masterNowOf, masterStaleOf } from '@/components/edit/leftInput';
import { earlySteps } from '@/components/edit/early';
import { STEP_SHORT, type LeftInput } from '@/components/edit/left';
import { useLeft } from '@/components/edit/LeftTab';

interface CutGet {
  versions?: TimelineVersionRef[]; current?: Timeline | null; timelines?: Timeline[]; renders?: Record<string, CutRenders>;
  working?: { rev: number; version?: string; edited?: boolean; equals?: string } | null;
  history?: { at: number; steps: { rev?: number; state: string; version?: string; saved?: string; by?: string }[] } | null;
}
interface WorkingGet { working?: { rev: number; version?: string; fps: Timeline['fps']; width: number; height: number; tracks: Timeline['tracks']; markers?: Timeline['markers']; note?: string; at: string } }

/** The current step in the words of the board's Edit box. */
const NEXT_WORDS: Record<string, string> = {
  script: 'the script', characters: 'the characters', places: 'the locations', shots: 'the shot lists', boards: 'the boards', takes: 'the first takes',
  approved: 'approve the cut at 480p', full: 'check the 1080p shots', sound: 'listen to the sound and music', subs: 'the subtitles',
  master: 'render the master', final: 'make the final', posted: 'publish on every platform',
};

export interface WhatsNext {
  view?: LeftView;
  /** "Next: check the 1080p shots", or undefined while nothing is known or nothing is left. */
  next?: string;
  /** "0 of 6 posted", from the release file, once the route answered. */
  posted?: { n: number; of: number };
}

/** Reads What's next and hands it up when it changes; drawn only while the film has a cut to read (MainPage). */
export function WhatsNextReader({ s, onRead }: { s: FilmState; onRead: (w: WhatsNext) => void }) {
  const w = useWhatsNext(s);
  const last = useRef('');
  useEffect(() => {
    const k = JSON.stringify([w.next, w.view?.count, w.view?.left, w.view?.current, w.posted]);
    if (k === last.current) return;
    last.current = k;
    onRead(w);
  }, [w, onRead]);
  return null;
}

/** What the What's next list is built from on the board: the cut (or none yet), the version it is, the left route, the
 *  full-size pictures and the Seedance marks, and the six early steps; `input` is undefined while the cut is read. */
export function useLeftReads(s: FilmState) {
  const film = s.film.slug;
  const changed = s.updatedAt;
  const { data: cut, error: cutError } = useJson<CutGet>(`/api/films/${film}/cut`, changed);
  const shots = useShots(film);
  const newestTl = cut?.current ?? undefined;
  const w = cut?.working ?? undefined;
  const ref = w ? w.equals ?? w.version : newestTl?.version;
  const edited = !!w?.edited && !w.equals;
  const ownTracks = !!w && (edited || (!!w.equals && w.equals !== newestTl?.version));
  const { data: wj } = useJson<WorkingGet>(ownTracks ? `/api/films/${film}/cut/working` : undefined, changed);
  const cur = useMemo<Timeline | undefined>(() => {
    if (!ownTracks) return newestTl;
    const x = wj?.working;
    return x ? { version: `w${x.rev}`, fps: x.fps, width: x.width, height: x.height, ...(x.version ? { basedOn: x.version } : {}), note: x.note, at: x.at, tracks: x.tracks, markers: x.markers ?? [] } : undefined;
  }, [ownTracks, newestTl, wj]);
  const leftTl = useMemo(() => (cur ? shotTimeline(cur, shots.by) : undefined), [cur, shots.by]);
  const view = useCallback(async (v: string): Promise<Timeline | undefined> => {
    const had = cut?.timelines?.find((t) => t.version === v) ?? (newestTl?.version === v ? newestTl : undefined);
    if (had) return had;
    try {
      const r = await fetch(`/api/films/${film}/cut?version=${encodeURIComponent(v)}`, { cache: 'no-store' });
      if (!r.ok) return undefined;
      const j = (await r.json()) as { timeline?: Timeline };
      return j.timeline?.version === v ? j.timeline : undefined;
    } catch { return undefined; }
  }, [film, cut, newestTl]);
  const { data: fullInfo } = useJson<FullInfo>(cur ? `/api/films/${film}/full` : undefined, changed);
  const sw = useFullView(film, fullInfo, ref, view);
  const seedance = useSeedanceMarks(film, fullInfo, changed);
  const masterNow = useMemo(() => masterNowOf(leftTl, sw.sources), [leftTl, sw.sources]);
  const { data: refR } = useJson<CutRenders & { version?: string }>(ref && ref !== newestTl?.version ? `/api/films/${film}/cut/render/${encodeURIComponent(ref)}` : undefined, changed);
  const renders = ref && ref === newestTl?.version ? cut?.renders?.[ref] : refR;
  const { data: refTl } = useJson<{ timeline?: Timeline }>(ref && ref !== newestTl?.version ? `/api/films/${film}/cut?version=${encodeURIComponent(ref)}` : undefined, changed);
  const masterRec = ref === newestTl?.version ? newestTl?.renders?.master : refTl?.timeline?.renders?.master;
  const masterDone = renders?.master?.state === 'done' ? renders.master : undefined;
  const masterStale = useMemo(() => masterStaleOf(masterNow, masterDone, masterRec, ref)?.reason, [masterNow, masterDone, masterRec, ref]);
  const filmMaster = s.master?.version;
  const left = useLeft(film, changed, filmMaster);
  const data = left.data;
  const versionList = useMemo(() => (cut?.versions ?? []).map((v) => v.version), [cut?.versions]);
  const gapOf = useMemo(() => gapsOf(data?.cuts, leftTl), [data, leftTl]);
  // the six early steps from the script on, from the same state and cut the Edit page reads them from
  const early = useMemo(() => earlySteps(s, leftTl), [s, leftTl]);
  const read = !!cut || !!cutError;
  const input = useMemo<LeftInput | undefined>(() => (!read ? undefined : !cur ? leftInputBefore(early, data) : leftInputOf({
    tl: leftTl, ref, edited, versions: versionList, data, filmMaster, masterNow, marks: seedance.marks,
    hasFull: sw.has, masterState: renders?.master?.state, masterStale, gapOf, history: cut?.history, early,
  })), [read, cur, early, leftTl, ref, edited, versionList, data, filmMaster, masterNow, seedance.marks, sw.has, renders, masterStale, gapOf, cut?.history]);
  return { film, cut, cutError, leftTl, input, left, ref, edited, shots };
}

/** A film with no cut yet: nothing on its tracks (the list then reads only the film's state). */
export const NO_CUT: Timeline = { version: 'w0', fps: 24, width: 1080, height: 1920, at: '1970-01-01T00:00:00.000Z', markers: [], tracks: [] };

function useWhatsNext(s: FilmState): WhatsNext {
  const { input, leftTl, left } = useLeftReads(s);
  const data = left.data;
  return useMemo<WhatsNext>(() => {
    if (!input) return { posted: data?.release?.platforms ? { n: data.release.posted, of: data.release.platforms } : undefined };
    const v = whatIsLeft({ ...input, subs: subsCounts(leftTl ?? NO_CUT) });
    const now = v.steps.find((x) => x.current);
    const r = input.release;
    return {
      view: v,
      // only once the left route answered (the ticks, the record's yes): before that the first step reads as not done
      next: now && v.count ? `Next: ${NEXT_WORDS[now.id] ?? STEP_SHORT[now.id] ?? v.next}` : undefined,
      posted: r?.platforms ? { n: r.posted, of: r.platforms } : undefined,
    };
  }, [input, leftTl, data]);
}
