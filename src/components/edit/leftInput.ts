// What's next's input (left.ts LeftInput), built in ONE place for every page that shows the list: the Edit page's
// "What's next" tab and the film board's Edit step (ASKS 46). Pure: each page reads its pieces (the cut on screen,
// the version it is or equals, the left route's answer, the full-size pictures, the Seedance marks, the master's
// render) and hands them here, so the two lists cannot drift apart. Built 15 Nov 2026 after they did: the board kept a
// copy of the Edit page's code from before "saving apart from history".
import type { PictureMade, Timeline } from '@/server/types';
import { picturePieces, pictureMade, type FullBase, type FullInfo } from './fullsize';
import { masterAge } from './masters';
import { changeWords, cutChanges, sameCut, type Change, type CutGap } from './sameCut';
import { fullCounts, soundCounts, subsCounts, vnum, type LeftAnswer, type LeftHistory, type LeftInput } from './left';

/** What a master would be made from now: the cut's picture as pieces from the full-size sources. */
export interface MasterNow { pieces: ReturnType<typeof picturePieces>; made: PictureMade; times?: FullInfo['times'] }
export function masterNowOf(tl: Timeline | undefined, sources: { info: FullInfo; base?: { b: FullBase; tl: Timeline } } | undefined): MasterNow | undefined {
  if (!sources || !tl) return undefined;
  const pieces = picturePieces(tl, sources.info, sources.base);
  return { pieces, made: pictureMade(pieces, sources.base?.b), times: sources.info.times };
}

/** Why the master of the version the cut is would be out of date now (masters.ts masterAge), else undefined. */
export function masterStaleOf(now: MasterNow | undefined, done: { version: string; path?: string; finishedAt?: string; picture?: PictureMade } | undefined,
  rec: { path?: string; at?: string; picture?: PictureMade } | undefined, ref: string | undefined): { path: string; reason: string } | undefined {
  if (!now || !done?.path || done.version !== ref) return undefined;
  const r = done.picture ? { at: done.finishedAt, picture: done.picture } : rec?.path === done.path ? rec : undefined;
  const age = masterAge({ version: done.version, at: r?.at, picture: r?.picture }, now);
  return age.state === 'stale' && age.reason ? { path: done.path, reason: age.reason } : undefined;
}

/** The render parts the left route sent (the newest master's cut, the final's) against the cut on screen, by content
 *  (ASKS 49, sameCut.ts); `gapOf(v)` is undefined for a version the route did not send. */
export function gapsOf(parts: LeftAnswer['cuts'] | undefined, tl: Timeline | undefined): (v: string | undefined, since?: string) => CutGap | undefined {
  const out = new Map<string, Change[]>();
  if (parts && tl) for (const [v, p] of Object.entries(parts)) if (v !== tl.version) out.set(v, sameCut(p, tl) ? [] : cutChanges(p, tl));
  return (v, since) => {
    const ch = parts && tl && v ? out.get(v) : undefined;
    return ch ? (ch.length ? { same: false, words: changeWords(ch, since) } : { same: true }) : undefined;
  };
}

export interface LeftParts {
  /** The cut on screen, split at its shots (shots.ts shotTimeline). */
  tl: Timeline | undefined;
  /** The version the cut is (the one it equals), else the newest (useCut's `ref`). */
  ref: string | undefined;
  /** Edits since the newest version, and not equal to any version. */
  edited: boolean;
  /** Every readable version, oldest first. */
  versions: string[];
  /** The left route's answer (useLeft). */
  data: LeftAnswer | undefined;
  /** The film record's master version (state.master.version). */
  filmMaster: string | undefined;
  masterNow: MasterNow | undefined;
  /** The takes marked to redo in Seedance (useSeedanceMarks().marks). */
  marks: Parameters<typeof fullCounts>[1];
  /** Any full-size picture exists (useFullView().has). */
  hasFull: boolean;
  /** The master render of `ref`, as the page follows it (a cancelled one counts as not made). */
  masterState: LeftInput['master']['state'] | 'cancelled' | undefined;
  /** masterStaleOf(…).reason. */
  masterStale: string | undefined;
  gapOf: (v: string | undefined, since?: string) => CutGap | undefined;
  /** The working cut's history (GET …/cut/working or GET …/cut `history`): "n changes since" counts its steps. */
  history?: LeftHistory | null;
  /** The six early steps from the script on (early.ts earlySteps): the board and the Edit page pass the same ones. */
  early?: LeftInput['early'];
}

export function leftInputOf(p: LeftParts): LeftInput | undefined {
  const { tl, ref, edited, data: d } = p;
  if (!tl || !ref) return undefined;
  const newest = [d?.newestMaster, p.filmMaster].filter((v): v is string => !!v).sort((a, b) => vnum(b) - vnum(a))[0];
  // a master of another version with the same content is current unless its picture is out of date against what the
  // page would use now (masters.ts masterAge, its own record from the route)
  const g = newest && (newest !== ref || edited) ? p.gapOf(newest, 'the master') : undefined;
  const app = !!newest && d?.newestMaster === newest;
  const mf = newest && d?.masterFile?.version === newest ? d.masterFile : undefined;
  const age = g?.same && app && mf && p.masterNow ? masterAge({ version: mf.version, at: mf.at, picture: mf.picture }, p.masterNow) : undefined;
  const gap = g ? { ...g, app, ...(age?.state === 'stale' && age.reason ? { stale: age.reason } : {}) } : undefined;
  const fin = d?.release?.final?.version;
  const finalGap = fin && (fin !== ref || edited) ? p.gapOf(fin, 'the final') : undefined;
  return {
    cut: ref, edited, versions: p.versions, ...(p.history ? { history: p.history } : {}), ready: !!d, approved: d?.approved,
    full: p.masterNow ? { ...fullCounts(p.masterNow.pieces, p.marks), has: p.hasFull } : undefined,
    sound: soundCounts(tl), subs: subsCounts(tl),
    // the master the store follows is of the newest version: not this cut's while it has edits since
    master: { state: edited || p.masterState === 'cancelled' ? 'none' : p.masterState ?? 'none', stale: edited ? undefined : p.masterStale, newest, ...(gap ? { gap } : {}) },
    release: d?.release, ...(finalGap ? { finalGap } : {}), ticks: d?.ticks ?? {},
    ...(p.early?.length ? { early: p.early } : {}),
  };
}

/** What's next before there is a cut (no script yet): the early steps and the seven after them, nothing counted from a
 *  cut. `data`: the left route's answer (the release file), when the page has it. */
export function leftInputBefore(early: NonNullable<LeftInput['early']>, data?: LeftAnswer): LeftInput {
  return {
    cut: '', versions: [], ready: true, sound: { music: 0, effects: 0 }, subs: { lines: 0, srt: 0, unread: 0 }, master: { state: 'none' },
    ...(data?.release ? { release: data.release } : {}), ticks: data?.ticks ?? {}, early,
  };
}
