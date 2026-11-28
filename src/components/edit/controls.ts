// The page's controls for what the cut file and its render learned on 13 Nov (render.ts; ARCHITECTURE.md "The
// render: mirror, dissolves, level points…"): a mirrored shot, a fade on the picture alone, a dissolve at a join,
// level points inside a sound, and the line that says what an undo took back. Pure functions on a Timeline, in
// whole frames at the film's fps; each edit returns the next Timeline and the note its version carries.
import type { Timeline, TimelineClip, TimelineTrack, TimelineVersionRef } from '@/server/types';
import { clipName, findClip, partnerOf, speedOf, toF, type ClipRef, type Edit, type NameOf } from './model';
import { asFades, defaultFadeLevel, fmtLevel, FADE_DB_MAX, FADE_DB_MIN, SMOOTH_S, smoothOffer } from './fades';

const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
/** A clip's length in seconds, exactly as the server's check counts it (`clipLength`). */
const secs = (c: TimelineClip) => (c.out - c.in) / speedOf(c);
const endS = (c: TimelineClip) => c.at + secs(c);
const smpte = (sec: number, fps: number) => {
  const f = Math.max(0, Math.round(sec * fps));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (3600 * fps)))}:${p(Math.floor(f / (60 * fps)) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`;
};
const nameFor = (c: TimelineClip, nameOf?: NameOf) => nameOf?.(c) ?? clipName(c);

/** "S4 shot 1 and S5 shot 2"; with the clips' own names when the two would read the same (a pick-up of the scene). */
const pairName = (a: TimelineClip, b: TimelineClip, nameOf?: NameOf) => {
  const x = nameFor(a, nameOf), y = nameFor(b, nameOf);
  return x === y && clipName(a) !== clipName(b) ? `${x} (${clipName(a)}) and ${y} (${clipName(b)})` : `${x} and ${y}`;
};

// ---- mirror (TimelineClip.flip: 'h', picture clips only; its sound is never given the field: the server refuses it)

/** Mirror a picture clip left to right, or stop mirroring it. Only that clip: never its sound. */
export function setFlip(tl0: Timeline, r: ClipRef, on: boolean, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  if (!f || f.track.kind !== 'video' || f.track.locked || !!f.clip.flip === on) return undefined;
  const tl = clone(tl0);
  const c = findClip(tl, r)!.clip;
  if (on) c.flip = 'h'; else delete c.flip;
  return { tl, note: `${on ? 'mirrored' : 'stopped mirroring'} ${nameFor(f.clip, nameOf)}` };
}

// ---- a fade on one clip alone (the picture's on the picture, the sound's on the sound)

/** Set a clip's fade in or out (seconds; 0 clears it), on that clip only, kept inside the clip with its other fade.
 *  A new fade on a sound clip at a split starts from (or ends at) the level of the clip beside it (fades.ts
 *  defaultFadeLevel), so the change between the two is smooth; elsewhere from or to silence, as before. A
 *  head or tail pair of level points that makes a fade is the fade (fades.ts asFades): it is written as the fields. */
export function setFade(tl0: Timeline, r: ClipRef, kind: 'fadeIn' | 'fadeOut', sec: number, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  if (!f || f.track.locked || f.track.kind === 'captions') return undefined;
  const fps = tl0.fps;
  const sound = f.track.kind === 'audio';
  const was = sound ? asFades(f.clip).clip : f.clip;
  const other = (kind === 'fadeIn' ? was.fadeOut : was.fadeIn) ?? 0;
  const v = r6(Math.max(0, Math.min(sec, secs(was) - other)));
  const cur = was[kind] ?? 0;
  if (Math.abs(v - cur) < 1e-6) return undefined;
  const lk = kind === 'fadeIn' ? 'fadeInFrom' : 'fadeOutTo';
  const tl = clone(tl0);
  const c = putClip(tl, r, was);
  if (v > 0) c[kind] = v; else { delete c[kind]; delete c[lk]; }
  if (sound && v > 0 && cur === 0 && c[lk] === undefined) {
    const lv = defaultFadeLevel(tl, r.trackId, c, kind);
    if (lv !== undefined) c[lk] = lv;
  }
  const what = f.track.kind === 'video' ? 'picture' : 'sound';
  const lvl = v > 0 && c[lk] !== undefined ? ` ${kind === 'fadeIn' ? 'from' : 'to'} ${fmtLevel(c[lk])}` : '';
  return { tl, note: `${kind === 'fadeIn' ? 'fade in' : 'fade out'} on the ${what} of ${nameFor(f.clip, nameOf)}: ${v > 0 ? `${toF(v, fps)} f` : 'none'}${lvl}` };
}

/** Puts a copy of `c` in the place of the clip `r` in tl (a clone), and answers it. */
function putClip(tl: Timeline, r: ClipRef, c: TimelineClip): TimelineClip {
  const tr = tl.tracks.find((t) => t.id === r.trackId)!;
  const i = tr.clips.findIndex((x) => x.id === r.clipId);
  tr.clips[i] = JSON.parse(JSON.stringify(c)) as TimelineClip;
  return tr.clips[i];
}

/** Set the level a sound clip's fade in starts from (`fadeIn`) or its fade out ends at: dB, or undefined for
 *  silence. A clip with no such fade gets one of SMOOTH_S seconds (or what fits). */
export function setFadeLevel(tl0: Timeline, r: ClipRef, kind: 'fadeIn' | 'fadeOut', db: number | undefined, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  if (!f || f.track.locked || f.track.kind !== 'audio') return undefined;
  const was = asFades(f.clip).clip;
  const lk = kind === 'fadeIn' ? 'fadeInFrom' : 'fadeOutTo';
  const lv = db === undefined ? undefined : Math.round(Math.max(FADE_DB_MIN, Math.min(FADE_DB_MAX, db)) * 10) / 10;
  const other = (kind === 'fadeIn' ? was.fadeOut : was.fadeIn) ?? 0;
  const len = (was[kind] ?? 0) > 0 ? was[kind]! : r6(Math.min(SMOOTH_S, secs(was) - other));
  if (len <= 0) return undefined;
  if (was[kind] === len && was[lk] === lv && was === f.clip) return undefined;
  const tl = clone(tl0);
  const c = putClip(tl, r, was);
  c[kind] = len;
  if (lv === undefined) delete c[lk]; else c[lk] = lv;
  return { tl, note: `${kind === 'fadeIn' ? 'fade in' : 'fade out'} on the sound of ${nameFor(f.clip, nameOf)} ${kind === 'fadeIn' ? 'from' : 'to'} ${fmtLevel(lv)}: ${toF(len, tl0.fps)} f` };
}

/** "Smooth the change": the selected sound clip follows another at a different level; it fades in from that
 *  level over SMOOTH_S seconds (fades.ts smoothOffer), so the music rises (or falls) at the split instead of jumping. */
export function smoothChange(tl0: Timeline, r: ClipRef, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  if (!f) return undefined;
  const o = smoothOffer(tl0, r.trackId, f.clip);
  if (!o) return undefined;
  const tl = clone(tl0);
  const c = putClip(tl, r, asFades(f.clip).clip);
  c.fadeIn = o.len;
  c.fadeInFrom = o.from;
  return { tl, note: `smoothed the change into ${nameFor(f.clip, nameOf)}: fades in from ${fmtLevel(o.from)} over ${toF(o.len, tl0.fps)} f` };
}

// ---- dissolves (TimelineClip.dissolve, seconds, on the incoming clip; centred on the join; validateTimeline's
// dissolveProblems: half of it plus the clip's other dissolve must fit in each clip, at most 10 s)

/** Whether `a` ends where `b` starts, as the server's check counts it (within half a frame). */
const touchesS = (a: TimelineClip, b: TimelineClip, fps: number) => Math.abs(b.at - endS(a)) < 0.5 / fps;
const sorted = (t: TimelineTrack) => [...t.clips].sort((a, b) => a.at - b.at);

/** The clip that ends where this one starts on its track (the outgoing clip of its join), if any. */
export function clipBefore(tl: Timeline, r: ClipRef): TimelineClip | undefined {
  const f = findClip(tl, r);
  if (!f) return undefined;
  const cs = sorted(f.track);
  const i = cs.findIndex((c) => c.id === r.clipId);
  return i > 0 && touchesS(cs[i - 1], f.clip, tl.fps) ? cs[i - 1] : undefined;
}
const clipAfter = (tl: Timeline, r: ClipRef): TimelineClip | undefined => {
  const f = findClip(tl, r);
  if (!f) return undefined;
  const cs = sorted(f.track);
  const i = cs.findIndex((c) => c.id === r.clipId);
  return i >= 0 && cs[i + 1] && touchesS(f.clip, cs[i + 1], tl.fps) ? cs[i + 1] : undefined;
};

/** The longest dissolve (whole frames) the join before `r` can take: half in each clip with its other dissolve. */
export function maxDissolveF(tl: Timeline, r: ClipRef): number {
  const f = findClip(tl, r);
  const L = clipBefore(tl, r);
  if (!f || !L || f.track.kind === 'captions') return 0;
  const fps = tl.fps;
  const N = clipAfter(tl, r);
  const roomR = secs(f.clip) - (N?.dissolve ?? 0) / 2;
  const roomL = secs(L) - (L.dissolve ?? 0) / 2;
  return Math.max(0, Math.min(10 * fps, Math.floor(2 * Math.min(roomR, roomL) * fps + 1e-6)));
}

export interface DissolvePlan { fits: boolean; why?: string; holds?: string }
/** What a dissolve of `frames` at the join before `r` would do: whether it fits, why not, and whether a file has
 *  no picture past the cut there (the render then holds that clip's last or first frame). */
export function dissolvePlan(tl: Timeline, r: ClipRef, frames: number, srcSeconds?: (src: string) => number | undefined): DissolvePlan {
  const f = findClip(tl, r);
  const L = clipBefore(tl, r);
  if (!f || !L) return { fits: false, why: 'the shots do not touch' };
  if (f.track.locked) return { fits: false, why: 'track locked' };
  if (frames <= 0) return { fits: true };
  const fps = tl.fps;
  if (frames > maxDissolveF(tl, r)) {
    const N = clipAfter(tl, r);
    const roomR = secs(f.clip) - (N?.dissolve ?? 0) / 2, roomL = secs(L) - (L.dissolve ?? 0) / 2;
    return { fits: false, why: frames > 10 * fps ? 'over 10 s' : roomL < roomR ? 'the shot before is too short' : 'the shot after is too short' };
  }
  const h1 = Math.floor(frames / 2), h2 = frames - h1;
  const lenL = srcSeconds?.((L.src ?? ''));
  const shortL = lenL !== undefined && L.out + (h2 * speedOf(L)) / fps > lenL + 0.5 / fps;
  const shortR = f.clip.in - (h1 * speedOf(f.clip)) / fps < -0.5 / fps;
  return { fits: true, holds: shortL && shortR ? 'holds both ends' : shortL ? 'holds the last frame' : shortR ? 'holds the first frame' : undefined };
}

/** A dissolve of `frames` (0: none) at the join before `r`, set on that clip only (the incoming one). */
export function setDissolve(tl0: Timeline, r: ClipRef, frames: number, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  const L = clipBefore(tl0, r);
  if (!f || !L || f.track.locked || f.track.kind === 'captions') return undefined;
  const fps = tl0.fps;
  const now = toF(f.clip.dissolve ?? 0, fps);
  if (frames === now || (frames > 0 && frames > maxDissolveF(tl0, r))) return undefined;
  const tl = clone(tl0);
  const c = findClip(tl, r)!.clip;
  if (frames > 0) c.dissolve = r6(frames / fps); else delete c.dissolve;
  const sound = f.track.kind === 'audio';
  const pair = pairName(L, f.clip, nameOf);
  return { tl, note: frames > 0 ? `${sound ? 'cross-fade' : 'dissolve'} of ${frames} f between ${pair}` : `no ${sound ? 'cross-fade' : 'dissolve'} between ${pair}` };
}

/** The linked sounds of two touching pictures, when both have one and those touch too (the sound side of a join). */
export function soundJoin(tl: Timeline, left: ClipRef, right: ClipRef): { left: ClipRef; right: ClipRef } | undefined {
  const sl = partnerOf(tl, left), sr = partnerOf(tl, right);
  if (!sl || !sr || sl.trackId !== sr.trackId) return undefined;
  const R = findClip(tl, sr);
  const before = R ? clipBefore(tl, sr) : undefined;
  return before && before.id === sl.clipId ? { left: sl, right: sr } : undefined;
}

/** "Cross-fade their sound too" (`frames`, clamped to what the sounds can take) or "Cut the sound hard" (0). */
export function setSoundDissolve(tl0: Timeline, left: ClipRef, right: ClipRef, frames: number, nameOf?: NameOf): Edit | undefined {
  const j = soundJoin(tl0, left, right);
  if (!j) return undefined;
  const n = frames > 0 ? Math.min(frames, maxDissolveF(tl0, j.right)) : 0;
  if (frames > 0 && n <= 0) return undefined;
  const e = setDissolve(tl0, j.right, n);
  if (!e) return undefined;
  const pair = pairName(findClip(tl0, left)!.clip, findClip(tl0, right)!.clip, nameOf);
  return { tl: e.tl, note: n ? `the sound of ${pair} cross-fades over ${n} f` : `the sound of ${pair} cuts hard again` };
}

/** After any edit: every dissolve made to fit again, so the server's check accepts the cut. One whose clip no
 *  longer starts where another ends on its track (moved, deleted, a gap left) is dropped; one that no longer fits
 *  (a clip trimmed, sped up, split, its join moved) is shortened to whole frames that fit, or dropped below one.
 *  The same timeline comes back when nothing had to change. */
export function tidyDissolves(tl0: Timeline, nameOf?: NameOf): { tl: Timeline; said: string[] } {
  const fps = tl0.fps;
  const has = tl0.tracks.some((t) => t.clips.some((c) => c.dissolve !== undefined));
  if (!has) return { tl: tl0, said: [] };
  const tl = clone(tl0);
  const said: string[] = [];
  let changed = false;
  for (const t of tl.tracks) {
    if (t.locked) continue;         // a locked track is never changed (it cannot have been edited either)
    const cs = sorted(t);
    // in time order: a clip's room at its head depends on the clip before having been settled
    for (const [i, c] of cs.entries()) {
      if (c.dissolve === undefined) continue;
      const prev = i > 0 && touchesS(cs[i - 1], c, fps) ? cs[i - 1] : undefined;
      const word = t.kind === 'audio' ? 'cross-fade' : 'dissolve';
      const bad = t.kind === 'captions' || !(typeof c.dissolve === 'number' && Number.isFinite(c.dissolve) && c.dissolve > 0);
      if (bad || !prev) {
        delete c.dissolve; changed = true;
        if (!bad) said.push(`${word} at ${nameFor(c, nameOf)} dropped: its join is gone`);
        continue;
      }
      // half in this clip with the next one's (which is settled after, against this one), half in the clip before with its own
      const roomL = secs(prev) - (prev.dissolve ?? 0) / 2;
      const roomR = secs(c);
      const max = Math.min(10, 2 * Math.min(roomL, roomR));
      if (c.dissolve <= max + 1e-9) continue;
      const nf = Math.floor(max * fps + 1e-6);
      changed = true;
      if (nf < 1) { delete c.dissolve; said.push(`${word} at ${nameFor(c, nameOf)} dropped: no room left`); continue; }
      c.dissolve = r6(nf / fps);
      said.push(`${word} at ${nameFor(c, nameOf)} shortened to ${nf} f`);
    }
  }
  return changed ? { tl, said } : { tl: tl0, said: [] };
}

// ---- level points (TimelineClip.gainPoints: t in seconds of the source file, dB added to gain, linear in dB)

export type GainPoint = { t: number; db: number };
/** The source-file second under timeline second T of a clip. */
export const srcTimeAt = (c: TimelineClip, T: number) => c.in + (T - c.at) * speedOf(c);
/** The timeline second of source-file second t of a clip. */
export const timeOfSrc = (c: TimelineClip, t: number) => c.at + (t - c.in) / speedOf(c);
/** The points' dB at source second t: straight between points, flat before the first and after the last, 0 without. */
export function pointsDb(points: GainPoint[] | undefined, t: number): number {
  if (!points?.length) return 0;
  if (t <= points[0].t) return points[0].db;
  const last = points[points.length - 1];
  if (t >= last.t) return last.db;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (t <= b.t) return b.t === a.t ? b.db : a.db + ((t - a.t) / (b.t - a.t)) * (b.db - a.db);
  }
  return last.db;
}
/** What is heard at source second t, in dB, before the fades: the clip's level and its points. */
export const levelAt = (c: TimelineClip, t: number) => (c.gain ?? 0) + pointsDb(c.gainPoints, t);

const GAP = 0.001;     // two points are at least a millisecond apart (the server wants each later than the one before)
const clampDb = (db: number) => Math.round(Math.max(-96, Math.min(24, db)) * 10) / 10;
const fmtDb = (db: number) => `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(Math.round(db * 10) / 10)} dB`;
const pointNote = (tl: Timeline, c: TimelineClip, p: GainPoint, nameOf?: NameOf) => `level point on ${nameFor(c, nameOf)}: ${fmtDb((c.gain ?? 0) + p.db)} at ${smpte(timeOfSrc(c, p.t), tl.fps)}`;

/** Where a point at source second t may go: inside the clip's stretch of the file and between its neighbours. */
export function pointRange(c: TimelineClip, i: number): { lo: number; hi: number } {
  const pts = c.gainPoints ?? [];
  const lo = Math.max(c.in, i > 0 ? pts[i - 1].t + GAP : -Infinity);
  const hi = Math.min(c.out, i + 1 < pts.length ? pts[i + 1].t - GAP : Infinity);
  return { lo, hi: Math.max(lo, hi) };
}

/** Add a point at source second t with `db` (added to the clip's level). Only on a sound clip. */
export function addGainPoint(tl0: Timeline, r: ClipRef, t: number, db: number, nameOf?: NameOf): (Edit & { index: number }) | undefined {
  const f = findClip(tl0, r);
  if (!f || f.track.kind !== 'audio' || f.track.locked) return undefined;
  const pts = f.clip.gainPoints ?? [];
  if (pts.length >= 500) return undefined;
  const tt = r6(Math.max(f.clip.in, Math.min(f.clip.out, t)));
  if (pts.some((p) => Math.abs(p.t - tt) < GAP)) return undefined;
  const tl = clone(tl0);
  const c = findClip(tl, r)!.clip;
  const p = { t: tt, db: clampDb(db) };
  c.gainPoints = [...pts, p].sort((a, b) => a.t - b.t);
  return { tl, note: pointNote(tl0, f.clip, p, nameOf), index: c.gainPoints.indexOf(c.gainPoints.find((x) => x.t === tt)!) };
}

/** Move point i to source second t (kept between its neighbours and inside the clip) and `db`. */
export function moveGainPoint(tl0: Timeline, r: ClipRef, i: number, t: number, db: number, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  const pts = f?.clip.gainPoints;
  if (!f || !pts?.[i] || f.track.locked) return undefined;
  const { lo, hi } = pointRange(f.clip, i);
  const p = { t: r6(Math.max(lo, Math.min(hi, t))), db: clampDb(db) };
  if (Math.abs(p.t - pts[i].t) < 1e-6 && p.db === pts[i].db) return undefined;
  const tl = clone(tl0);
  findClip(tl, r)!.clip.gainPoints![i] = p;
  return { tl, note: pointNote(tl0, f.clip, p, nameOf) };
}

/** Remove point i; the field goes with the last point. */
export function removeGainPoint(tl0: Timeline, r: ClipRef, i: number, nameOf?: NameOf): Edit | undefined {
  const f = findClip(tl0, r);
  const pts = f?.clip.gainPoints;
  if (!f || !pts?.[i] || f.track.locked) return undefined;
  const tl = clone(tl0);
  const c = findClip(tl, r)!.clip;
  const left = pts.filter((_, k) => k !== i);
  if (left.length) c.gainPoints = left; else delete c.gainPoints;
  return { tl, note: `${pointNote(tl0, f.clip, pts[i], nameOf)} removed` };
}

// ---- what an undo took back, and whose it was (the owner's undo once took back Alma's words on a title card unseen)

export interface UndoLine { text: string; alma: boolean }
/** The version whose change a version stands for: a "redo: v10 again" is v10's change, an undo's own version is
 *  what it went back from; anything else is its own change. */
function changeOf(versions: TimelineVersionRef[], v: TimelineVersionRef | undefined): TimelineVersionRef | undefined {
  for (let k = 0; v && k < 50; k++) {
    const again = /^redo: (v\d+) again/.exec(v.note ?? '')?.[1];
    if (!again) return v;
    v = versions.find((x) => x.version === again);
  }
  return v;
}
const whose = (by?: string) => (by === 'alma' ? "Alma's change" : by === 'migration' ? 'the first version' : undefined);

/** The status line after an undo (`undone`: the version that was current) or a redo (`redone`: the version
 *  brought back): what changed in plain words and, when it was not the owner's, whose. */
export function undoLine(kind: 'undo' | 'redo', versions: TimelineVersionRef[], version: string): UndoLine | undefined {
  const v = changeOf(versions, versions.find((x) => x.version === version));
  if (!v) return undefined;
  const note = (v.note ?? '').trim() || v.version;
  const w = whose(v.by);
  const alma = v.by === 'alma';
  if (kind === 'undo') return { alma, text: `Undid${w ? ` ${w}` : ''}: ${note}. ⇧⌘Z brings it back.` };
  return { alma, text: `Redid${w ? ` ${w}` : ''}: ${note}.` };
}
/** For the Undo button's title: the change it would undo and whose. */
export function undoTitle(versions: TimelineVersionRef[], version: string): string | undefined {
  const v = changeOf(versions, versions.find((x) => x.version === version));
  if (!v) return undefined;
  return `${(v.note ?? v.version).slice(0, 90)}" (${v.by === 'alma' ? "Alma's" : v.by === 'migration' ? 'the migration' : 'yours'})`;
}

// ---- the same words on the steps of the history (stage 2 of "saving apart from history", 14 Nov): an undo or a redo
// moves the pointer and writes no version; the words are the step's own, with whose it was

/** A step as the page knows it from the history (history.ts HistoryStep, in brief). */
export interface StepWords { words: string; by: 'user' | 'alma' | 'start' | 'restore' }
const stepWhose = (by: StepWords['by']) => (by === 'alma' ? "Alma's change" : by === 'start' ? 'the first version' : undefined);
/** The toolbar's line after an undo (the step taken back) or a redo (the step brought back): the very strings
 *  `undoLine` says for a version ("Undid: trimmed tail of S2 shot 3 −6 f. ⇧⌘Z brings it back."). */
export function stepUndoLine(kind: 'undo' | 'redo', s: StepWords | undefined): UndoLine | undefined {
  if (!s) return undefined;
  const note = s.words.trim() || 'a change';
  const w = stepWhose(s.by);
  const alma = s.by === 'alma';
  if (kind === 'undo') return { alma, text: `Undid${w ? ` ${w}` : ''}: ${note}. ⇧⌘Z brings it back.` };
  return { alma, text: `Redid${w ? ` ${w}` : ''}: ${note}.` };
}
/** The Undo and Redo buttons' hover text: what they would do ("Undo: moved subtitle line 12"), or that there is nothing. */
export function stepTitle(kind: 'undo' | 'redo', s: StepWords | undefined): string {
  if (!s) return kind === 'undo' ? 'Nothing to undo' : 'Nothing to redo';
  const note = (s.words.trim() || 'a change').slice(0, 90);
  return `${kind === 'undo' ? 'Undo' : 'Redo'}${s.by === 'alma' ? " Alma's change" : ''}: ${note}`;
}

/** What the line under the header says about saving (the screens SaveEdited, SaveVersion, SaveRender, SaveUndone):
 *  line 1 where the cut stands against the saved versions, line 2 where the history's pointer is. Plain words; never
 *  "autosave", "dirty", "rev". */
export interface SaveStatusInput {
  newest?: string;                       // the newest version
  equals?: string;                       // a version with the same content as the cut now
  edited: boolean;                       // the cut differs from the newest version
  since: { version?: string; count: number };   // the edits since the last version the history knows
  redo: number;                          // steps a redo can bring back
  now?: StepWords;                       // the step the pointer is on
  saved?: { version: string; why: string; made: boolean; edits: number; since?: string };   // a save just made by this page
  notice?: string;                       // words that stand in for line 1 until the next change (a refused step)
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The words for a step that came from outside the page, at the step the page now shows (stage 4): a drop of Alma's
 *  ("Alma changed the cut: <her note>. Undo takes it back."), a version written by hand and taken in as a step
 *  (alma-drop.ts takeInVersion: "Alma: <note>" or "v12 written on disk: <note>", with ", over 3 edits not saved as a
 *  version; Undo brings them back" when it went over edits). Undefined for any other step. */
export function outsideStepWords(s: { by: string; words: string } | undefined): string | undefined {
  if (!s) return undefined;
  const w = s.words.trim().replace(/; Undo brings them back\.?$/, '').replace(/\.$/, '');
  if (s.by === 'alma') return `Alma changed the cut: ${w.replace(/^Alma: /, '') || 'a change'}. Undo takes it back.`;
  if (/^v\d+ written on disk: /.test(w)) return `${w}. Undo takes it back.`;
  return undefined;
}
/** The words for a page step refused as stale (409): Alma's when a step of hers is among those made since the page's
 *  rev, else the general one. */
export function staleWords(steps: { rev: number; by: string }[], since: number): string {
  return steps.some((x) => x.rev > since && x.by === 'alma')
    ? "Alma's change came in first. Your last edit was not kept: do it again."
    : 'The cut changed somewhere else. Your last edit was not kept: do it again.';
}

export function saveStatus(i: SaveStatusInput): { line1: string; line2: string } {
  const at = i.equals ? `Now at: ${i.equals}, as saved` : `Now at: ${(i.now?.words.trim() || 'the cut').replace(/\.$/, '')}`;
  const redo = i.redo ? ` ${plural(i.redo, 'step')} to redo.` : '';
  if (i.notice) return { line1: i.notice, line2: at };
  if (i.saved) {
    const s = i.saved;
    const what = s.why === 'render' ? ' for this render' : s.why === 'export' ? ' for the export' : s.why === 'final' ? ' as the final' : '';
    const kept = s.made && s.why !== 'you' && s.edits > 0 && s.since ? `, with your ${plural(s.edits, 'edit')} since ${s.since}` : '';
    return { line1: s.made ? `Saved as ${s.version}${what}${kept}.` : `No edits since ${s.version}. Nothing new to save.`, line2: at };
  }
  if (!i.newest) return { line1: 'No version saved yet.', line2: at };
  if (!i.edited) return { line1: i.redo ? `Back at ${i.newest}, as saved.${redo}` : `No edits since ${i.newest}.`, line2: at };
  if (i.equals) return { line1: `Back at ${i.equals}, as saved.${redo}`, line2: at };
  const n = Math.max(1, i.since.count);
  const from = i.since.version ?? i.newest;
  return { line1: `${plural(n, 'edit')} since ${from}, ${n === 1 ? 'kept' : 'all kept'}. Not saved as a version.${redo}`, line2: at };
}

// ---- track buttons pressed in a row (M and the lock): shown at once, saved as one version when they rest

export type Presses = Record<string, { muted?: boolean; locked?: boolean }>;
/** The timeline with the pressed buttons' state; the same object when nothing differs. */
export function withPresses(tl: Timeline, p: Presses | undefined): Timeline {
  if (!p || !Object.keys(p).length) return tl;
  let changed = false;
  const tracks = tl.tracks.map((t) => {
    const q = p[t.id];
    if (!q) return t;
    const next = { ...t };
    for (const k of ['muted', 'locked'] as const) if (q[k] !== undefined && !!q[k] !== !!t[k]) { if (q[k]) next[k] = true; else delete next[k]; changed = true; }
    return next;
  });
  return changed ? { ...tl, tracks } : tl;
}
/** The words for what the presses changed against the saved cut ("muted A2, unlocked V2"), empty when they cancel out. */
export function pressWords(saved: Timeline, p: Presses | undefined): string {
  if (!p) return '';
  const out: string[] = [];
  for (const t of saved.tracks) {
    const q = p[t.id];
    if (!q) continue;
    if (q.muted !== undefined && !!q.muted !== !!t.muted) out.push(`${q.muted ? 'muted' : 'unmuted'} ${t.id}`);
    if (q.locked !== undefined && !!q.locked !== !!t.locked) out.push(`${q.locked ? 'locked' : 'unlocked'} ${t.id}`);
  }
  return out.join(', ');
}
