// The edit operations on a Timeline, done in whole frames at the film's fps and written back as
// seconds. Each returns a new Timeline and the one-line note its version carries ("moved S3 · take 4 +12 f"),
// or undefined when nothing would change. V1 and A1 of a block move together: an A1 clip with the same
// source, in-point and position as a V1 clip is its partner.
import type { Timeline, TimelineClip, TimelineTrack, TrackKind } from '@/server/types';
import { followFilm, isLine, oneRow, rippleChange, splitText, type FilmChange } from './subs';

export interface Edit { tl: Timeline; note: string }
export interface ClipRef { trackId: string; clipId: string }

export const toF = (sec: number, fps: number) => Math.round(sec * fps);

// ---- why an edit was refused (14 Nov, the fixes pass). An edit function that refuses because of a lock leaves its
// reason here for the page's status line; it is cleared at the end of the current task, so the page reads it right
// after the call (`apply` does, when it is handed no edit) and a stale reason can never be shown later.
let refusedWhy: string | undefined;
export function refuse(why: string): undefined {
  refusedWhy = why;
  queueMicrotask(() => { refusedWhy = undefined; });
  return undefined;
}
/** The reason the edit function just called refused, when it was a lock; read once. */
export function takeRefusal(): string | undefined { const w = refusedWhy; refusedWhy = undefined; return w; }

/** A locked track is never changed by anything, and an edit that would have to change one to stay consistent does
 *  not happen at all (14 Nov). Why these clips cannot be edited: one of them, or the picture or sound linked to it,
 *  is on a locked track; or, when the edit closes or opens space from frame `from` on every track, a locked track
 *  holds clips at or after that point, which would be left out of step with the picture. */
export function lockedWhy(tl: Timeline, refs: ClipRef[], from?: number): string | undefined {
  for (const r of refs) {
    const own = findClip(tl, r);
    if (own?.track.locked) return `${own.track.id} ${own.track.name} is locked: unlock it to change this.`;
    const p = partnerOf(tl, r);
    const mate = p ? findClip(tl, p) : undefined;
    if (mate?.track.locked) return `${mate.track.id} ${mate.track.name} is locked and holds the ${mate.track.kind === 'audio' ? 'sound' : 'picture'} linked to this clip: unlock it to change the two.`;
  }
  if (from !== undefined) {
    const fps = tl.fps;
    const t = tl.tracks.find((x) => x.locked && x.clips.some((c) => startF(c, fps) >= from));
    if (t) return `${t.id} ${t.name} is locked and has clips after this point: they would stay where they are while everything else moves, out of step with the picture. Unlock it, or press R so gaps stay open.`;
  }
  return undefined;
}
const toS = (f: number, fps: number) => Math.round((f / fps) * 1e6) / 1e6;

/** A clip's playback rate (TimelineClip.speed, default 1): it lasts (out − in) / speed on the timeline. */
export const speedOf = (c: TimelineClip) => (c.speed && c.speed > 0 ? c.speed : 1);
export const startF = (c: TimelineClip, fps: number) => toF(c.at, fps);
export const lenF = (c: TimelineClip, fps: number) => Math.max(1, toF((c.out - c.in) / speedOf(c), fps));
/** The source point `d` timeline frames after `sec` on this clip: whole source frames at speed 1, else exact. */
const srcPlus = (c: TimelineClip, sec: number, d: number, fps: number) => {
  const sp = speedOf(c);
  return sp === 1 ? toS(toF(sec, fps) + d, fps) : Math.round((sec + (d * sp) / fps) * 1e6) / 1e6;
};
export const endF = (c: TimelineClip, fps: number) => startF(c, fps) + lenF(c, fps);

/** The timeline's length in frames: the last clip end on any track. */
export function totalF(tl: Timeline): number {
  let m = 0;
  for (const t of tl.tracks) for (const c of t.clips) m = Math.max(m, endF(c, tl.fps));
  return m;
}

/** "S3 · take 4" from "S3 · take 4 (to confirm)"; the file name when there is no label; a subtitle line's words
 *  in quotes, cut short. */
export function clipName(c: TimelineClip): string {
  // a line of the script on the Dialogue track (the timeline from day one): who says it and its first words
  if (c.plan === 'line') { const w = oneRow(c.text ?? ''); const q = `“${w.length > 32 ? `${w.slice(0, 31).trim()}…` : w}”`; return c.who ? `${c.who}: ${q}` : q; }
  if (isLine(c) && !c.label) { const w = oneRow(c.text ?? ''); return `“${w.length > 32 ? `${w.slice(0, 31).trim()}…` : w}”`; }
  const l = (c.label ?? (c.src ?? '').split('/').pop() ?? c.id).replace(/\s*\((to confirm|superseded[^)]*)\)\s*/gi, ' ').trim();
  return l;
}
export const toConfirm = (c: TimelineClip) => /\(to confirm\)/i.test(c.label ?? '');
export const superseded = (c: TimelineClip) => /\(superseded[^)]*\)/i.exec(c.label ?? '')?.[0].slice(1, -1);

const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;
const sortClips = (t: TimelineTrack, fps: number) => t.clips.sort((a, b) => startF(a, fps) - startF(b, fps));
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

export function findClip(tl: Timeline, r: ClipRef): { track: TimelineTrack; clip: TimelineClip } | undefined {
  const track = tl.tracks.find((t) => t.id === r.trackId);
  const clip = track?.clips.find((c) => c.id === r.clipId);
  return track && clip ? { track, clip } : undefined;
}

/** The first video track and the first audio track carry a block's picture and dialogue. */
function linkedTracks(tl: Timeline): [string, string] | undefined {
  const v = tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video');
  const a = tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio');
  return v && a ? [v.id, a.id] : undefined;
}

/** Gaps close only on the picture and its dialogue (the user, 13 Nov: "if it's effects, effects are on their
 *  own"). On every other track (inserts, effects, music, a second dialogue track) a clip is trimmed, moved and
 *  deleted by itself: nothing next to it follows. */
export function ripples(tl: Timeline, r: ClipRef): boolean {
  const pair = linkedTracks(tl);
  if (!pair) return false;
  if (r.trackId === pair[0]) return true;
  // a sound on the dialogue track that is not linked to a picture (its picture was replaced by another file, or
  // it was pasted or moved there) is a sound on its own: closing up behind it would drag the whole picture along
  // and leave it over itself (14 Nov: deleting such a sound was refused by the cut's own rules)
  return r.trackId === pair[1] && !!partnerOf(tl, r);
}

/** The other half of a V1/A1 block, when there is one. */
export function partnerOf(tl: Timeline, r: ClipRef): ClipRef | undefined {
  const pair = linkedTracks(tl);
  const found = findClip(tl, r);
  if (!pair || !found || !pair.includes(r.trackId)) return undefined;
  const other = tl.tracks.find((t) => t.id === (r.trackId === pair[0] ? pair[1] : pair[0]));
  const { clip } = found;
  // unlinked (13 Nov): the picture and its sound are edited apart, even while they still line up
  if (clip.unlinked) return undefined;
  const fps = tl.fps;
  const same = other?.clips.filter((c) => !c.unlinked && startF(c, fps) === startF(clip, fps) && lenF(c, fps) === lenF(clip, fps)) ?? [];
  // the same file from the same point; else the one clip that sits exactly under (or over) it for exactly its
  // length: a picture replaced by an edited copy of itself keeps its sound (14 Nov: such a sound was left on its own)
  const p = same.find((c) => c.src === clip.src && toF(c.in, fps) === toF(clip.in, fps)) ?? (same.length === 1 ? same[0] : undefined);
  return p && other ? { trackId: other.id, clipId: p.id } : undefined;
}

/** Unlink a picture clip from its sound, or link the two again (the user, 13 Nov: "unlink the audio from the
 *  video … I decrease the size of that cut, but the audio stays the same size"). Unlinked, a trim, a move or a
 *  delete on one leaves the other alone. Linking again needs the two to line up as they did. */
export function setLinked(tl0: Timeline, r: ClipRef, linked: boolean): Edit | undefined {
  const tl = clone(tl0);
  const fps = tl.fps;
  const me = findClip(tl, r);
  const pair = linkedTracks(tl);
  if (!me || !pair || !pair.includes(r.trackId)) return undefined;
  if (me.track.locked) return refuse(`${me.track.id} ${me.track.name} is locked: unlock it to change this.`);
  if (!linked) {
    const p = partnerOf(tl0, r);
    const mate = p ? findClip(tl, p) : undefined;
    if (!mate) return undefined;
    if (mate.track.locked) return refuse(lockedWhy(tl0, [r])!);
    me.clip.unlinked = true; mate.clip.unlinked = true;
    return { tl, note: `unlinked the sound of ${clipName(me.clip)}` };
  }
  if (!me.clip.unlinked) return undefined;
  const other = tl.tracks.find((t) => t.id === (r.trackId === pair[0] ? pair[1] : pair[0]));
  const mate = other?.clips.find((c) => c.unlinked && c.src === me.clip.src && startF(c, fps) === startF(me.clip, fps) && toF(c.in, fps) === toF(me.clip.in, fps) && lenF(c, fps) === lenF(me.clip, fps));
  if (!mate) return undefined;
  if (other?.locked) return refuse(`${other.id} ${other.name} is locked: unlock it to link the two again.`);
  delete me.clip.unlinked; delete mate.unlinked;
  return { tl, note: `linked the sound of ${clipName(me.clip)} again` };
}

/** Two sounds must not overlap on one track. When an edit leaves them so (an unlinked sound kept long while
 *  the next shot moved under it), the overlapping one goes to a track of its own beside it ("Dialogue 2"),
 *  made when missing. The same timeline comes back when nothing overlaps. */
/** A sound track beside `t` with room from `from` to `to`: "Effects 2", "Effects 3"…, made when missing. */
function sideTrack(tl: Timeline, t: TimelineTrack, from: number, to: number): TimelineTrack | undefined {
  const fps = tl.fps;
  for (let n = 2; n < 9; n++) {
    const name = `${t.name} ${n}`;
    let cand = tl.tracks.find((x) => x.kind === 'audio' && x.name === name);
    if (!cand) {
      const num = Math.max(0, ...tl.tracks.filter((x) => x.id.startsWith('A')).map((x) => Number(x.id.slice(1)) || 0)) + 1;
      cand = { id: `A${num}`, kind: 'audio', name, clips: [] };
      tl.tracks.splice(tl.tracks.indexOf(t) + n - 1, 0, cand);
    }
    // a locked track is never written to (14 Nov): the next one beside is tried
    if (!cand.locked && !cand.clips.some((c) => startF(c, fps) < to && endF(c, fps) > from)) return cand;
  }
  return undefined;
}

// ---- several clips at once (the user, 13 Nov: "select items … with the same keyboard shortcuts and mouse
// shortcuts as DaVinci … select all of the items on the right … of the cursor … move all of the items forward")

/** The clips a selection stands for: each one with the picture or sound linked to it, once, locked tracks left out. */
export function withPartners(tl: Timeline, refs: ClipRef[]): ClipRef[] {
  const seen = new Set<string>();
  const out: ClipRef[] = [];
  for (const r of refs) for (const x of withPartner(tl, r)) {
    const f = findClip(tl, x);
    const k = `${x.trackId}:${x.clipId}`;
    if (!f || f.track.locked || seen.has(k)) continue;
    seen.add(k); out.push(x);
  }
  return out;
}

/** How far a group can go of the `d` frames asked: it stops at the start of the film and where one of its
 *  clips would run into a clip that is not in the group. */
export function groupDelta(tl: Timeline, refs: ClipRef[], d: number): number {
  const fps = tl.fps;
  const all = withPartners(tl, refs);
  let v = d;
  for (const t of tl.tracks) {
    const mine = new Set(all.filter((r) => r.trackId === t.id).map((r) => r.clipId));
    if (!mine.size) continue;
    const others = t.clips.filter((c) => !mine.has(c.id));
    for (const c of t.clips) {
      if (!mine.has(c.id)) continue;
      const s = startF(c, fps), e = endF(c, fps);
      if (v > 0) v = Math.min(v, ...others.filter((o) => startF(o, fps) >= e).map((o) => startF(o, fps) - e));
      else if (v < 0) v = Math.max(v, -s, ...others.filter((o) => endF(o, fps) <= s).map((o) => endF(o, fps) - s));
    }
  }
  return v;
}

/** Move the selected clips together by `d` frames. Nothing closes up and nothing is cut into. The notes
 *  (markers) go along when the group is the whole picture from some point on. */
export function moveClips(tl0: Timeline, refs: ClipRef[], d0: number): Edit | undefined {
  const lock = lockedWhy(tl0, refs);
  if (lock) return refuse(lock);
  const d = groupDelta(tl0, refs, d0);
  const all = withPartners(tl0, refs);
  if (!d || !all.length) return undefined;
  const tl = clone(tl0);
  const fps = tl.fps;
  for (const r of all) { const f = findClip(tl, r); if (f) f.clip.at = toS(startF(f.clip, fps) + d, fps); }
  for (const t of tl.tracks) sortClips(t, fps);
  const pic = linkedTracks(tl0)?.[0];
  const picked = new Set(all.filter((r) => r.trackId === pic).map((r) => r.clipId));
  const v = tl0.tracks.find((t) => t.id === pic);
  if (v && picked.size) {
    const from = Math.min(...v.clips.filter((c) => picked.has(c.id)).map((c) => startF(c, fps)));
    if (v.clips.every((c) => startF(c, fps) < from || picked.has(c.id))) for (const m of tl.markers) if (toF(m.at, fps) >= from) m.at = toS(Math.max(0, toF(m.at, fps) + d), fps);
  }
  const one = all.length === 1 || (refs.length === 1 && all.length === 2) ? findClip(tl0, refs[0]) : undefined;
  return { tl, note: `moved ${one ? clipName(one.clip) : `${refs.length} clips`} ${signed(d)} f` };
}

/** Delete the selected clips; on the picture and its dialogue what follows closes up, as for one. */
export function deleteClips(tl0: Timeline, refs: ClipRef[], ripple: boolean): Edit | undefined {
  const fps = tl0.fps;
  const order = refs.map((r) => ({ r, f: findClip(tl0, r) })).filter((x) => x.f).sort((a, b) => startF(b.f!.clip, fps) - startF(a.f!.clip, fps));
  // all or nothing: one clip that a lock keeps refuses the whole delete
  for (const { r, f } of order) { const lock = lockedWhy(tl0, [r], ripple && ripples(tl0, r) ? endF(f!.clip, fps) : undefined); if (lock) return refuse(lock); }
  let tl = tl0, n = 0, last: Edit | undefined;
  for (const { r } of order) {
    if (!findClip(tl, r)) continue;                  // already gone with the clip it was linked to
    const e = deleteClip(tl, r, ripple);
    if (e) { tl = e.tl; last = e; n++; }
  }
  if (!last) return undefined;
  const closes = ripple && order.some((x) => ripples(tl0, x.r));
  return n === 1 ? last : { tl, note: `deleted ${n} clips${closes ? ', what follows moved back' : ''}` };
}

/** Whether a clip could sit on another track at its time moved by `d` frames: same kind, not locked, free there. */
export function canMoveToTrack(tl: Timeline, r: ClipRef, toId: string, d = 0): boolean {
  const fps = tl.fps;
  const x = findClip(tl, r);
  const to = tl.tracks.find((t) => t.id === toId);
  if (!x || !to || to.id === x.track.id || to.kind !== x.track.kind || to.locked || x.track.locked) return false;
  const s = Math.max(0, startF(x.clip, fps) + d), e = s + lenF(x.clip, fps);
  return !to.clips.some((k) => startF(k, fps) < e && endF(k, fps) > s);
}

/** Move a clip to another track of its kind (the user, 13 Nov: "move one item from the dialogue track into …
 *  A4 … drag and drop"). Only that clip moves: its picture or its sound stays where it is, nothing closes up
 *  behind it and nothing else shifts, so what is in sync stays in sync. Refused where the other track already
 *  has a clip at that time. */
export function moveToTrack(tl0: Timeline, r: ClipRef, toId: string, d = 0): Edit | undefined {
  if (!canMoveToTrack(tl0, r, toId, d)) return undefined;
  const tl = clone(tl0);
  const fps = tl.fps;
  const x = findClip(tl, r)!;
  const to = tl.tracks.find((t) => t.id === toId)!;
  x.track.clips = x.track.clips.filter((c) => c.id !== x.clip.id);
  // `unlinked` goes with the clip, as it does when a sound is carried to "Dialogue 2" (14 Nov: one rule). Only a paste,
  // which makes a new clip, starts linked to nothing
  const c: TimelineClip = { ...x.clip, at: Math.round((Math.max(0, startF(x.clip, fps) + d) / fps) * 1e6) / 1e6 };
  to.clips.push(c);
  sortClips(to, fps);
  return { tl, note: `moved ${clipName(c)} from ${x.track.id} ${x.track.name} to ${to.id} ${to.name}${d ? `, ${signed(d)} f` : ', same time'}` };
}

/** The part of an option's file a clip would play: the clip's own stretch when the file is long enough,
 *  else as much of it as fits. */
export function optionWindow(c: TimelineClip, seconds?: number): { in: number; out: number } {
  const len = c.out - c.in;
  if (!seconds || c.out <= seconds + 1e-3) return { in: c.in, out: c.out };
  const i = Math.max(0, Math.min(c.in, seconds - len));
  return { in: Math.round(i * 1e6) / 1e6, out: Math.round(Math.min(seconds, i + len) * 1e6) / 1e6 };
}

/** Another try of the same effect in the clip's place (the user, 13 Nov: "scroll through the various options").
 *  The clip keeps its id, place, level, fades and speed; only the file and the name change. Nothing else moves. */
export function swapSound(tl0: Timeline, r: ClipRef, opt: { src: string; name: string; seconds?: number }, wasName?: string): Edit | undefined {
  const tl = clone(tl0);
  const x = findClip(tl, r);
  if (!x || x.track.locked || x.clip.src === opt.src) return undefined;
  const c = x.clip;
  const w = optionWindow(c, opt.seconds);
  const base = (c.label ?? '').includes(' · ') ? (c.label ?? '').replace(/\s*·[^·]*$/, '') : c.label ?? clipName(c);
  c.src = opt.src;
  c.in = w.in; c.out = w.out;
  const len = (w.out - w.in) / speedOf(c);
  if (c.fadeIn && c.fadeIn > len / 2) c.fadeIn = Math.round((len / 2) * 1e6) / 1e6;
  if (c.fadeOut && c.fadeOut > len / 2) c.fadeOut = Math.round((len / 2) * 1e6) / 1e6;
  c.label = `${base} · ${opt.name}`;
  return { tl, note: `${base}: ${opt.name} in place of ${wasName ?? 'the one before'}` };
}

/** A picture track above `t` with room from `from` to `to`: a clip there covers the picture under it. The
 *  tracks already there are tried first (V2 Inserts), then one is made. */
function upperTrack(tl: Timeline, t: TimelineTrack, from: number, to: number): TimelineTrack | undefined {
  const fps = tl.fps;
  const num = (x: TimelineTrack) => Number(/\d+/.exec(x.id)?.[0] ?? 0);
  const above = tl.tracks.filter((x) => x.kind === 'video' && num(x) > num(t)).sort((a, b) => num(a) - num(b));
  const free = above.find((x) => !x.locked && !x.clips.some((c) => startF(c, fps) < to && endF(c, fps) > from));
  if (free) return free;
  if (above.length >= 6) return undefined;
  const n = Math.max(0, ...tl.tracks.filter((x) => x.kind === 'video').map(num)) + 1;
  const made: TimelineTrack = { id: `V${n}`, kind: 'video', name: `Over ${n - 1}`, clips: [] };
  const lastV = tl.tracks.reduce((k, x, i) => (x.kind === 'video' ? i : k), -1);
  tl.tracks.splice(lastV + 1, 0, made);
  return made;
}

let pasteSeq = 0;
/** A copy of a clip put at frame `f` on a track of its kind (the user, 13 Nov: "press Ctrl+C … Ctrl+V, it
 *  should paste it there"). Nothing else moves. A sound that would land on another sound goes on the track
 *  beside it ("Effects 2", made when missing), so both are heard; a picture is refused where one already is. */
export function pasteClip(tl0: Timeline, c: TimelineClip, trackId: string, f: number): { edit?: Edit & { ref: ClipRef }; error?: string } {
  const tl = clone(tl0);
  const fps = tl.fps;
  let t = tl.tracks.find((x) => x.id === trackId);
  if (!t) return { error: 'That track is not in this cut.' };
  if (t.locked) return { error: `${t.id} ${t.name} is locked.` };
  const at = Math.max(0, Math.round(f));
  const copy: TimelineClip = { ...c, id: `p${Date.now().toString(36)}${(pasteSeq++).toString(36)}`, at: Math.round((at / fps) * 1e6) / 1e6 };
  delete copy.unlinked;
  // a dissolve belongs to the join the clip was copied from, not to wherever it lands
  delete copy.dissolve;
  const to = at + lenF(copy, fps);
  const taken = (x: TimelineTrack) => x.clips.some((k) => startF(k, fps) < to && endF(k, fps) > at);
  let beside = '';
  if (taken(t)) {
    if (t.kind !== 'audio') return { error: `No room on ${t.id} ${t.name} there: a clip already sits at that point. Move the playhead to a free place, or mark another track for pasting.` };
    const side = sideTrack(tl, t, at, to);
    if (!side) return { error: `No room on ${t.id} ${t.name} or the tracks beside it there.` };
    beside = `, beside ${t.name} where a sound already is`;
    t = side;
  }
  t.clips.push(copy);
  sortClips(t, fps);
  return { edit: { tl, note: `pasted ${clipName(copy)} on ${t.id} ${t.name} at ${at} f${beside}`, ref: { trackId: t.id, clipId: copy.id } } };
}

/** A clip copied for pasting, with the kind and the track it came from. */
export interface Copied { clip: TimelineClip; kind: 'video' | 'audio' | 'captions'; trackId: string }

/** Paste copied clips at frame `f`, keeping their distances from each other (the earliest at `f`) and their kinds
 *  (F4: ⌘C and ⌘X take every selected clip with its linked picture or sound, and ⌘V pastes them all). Each goes back
 *  on its own track when it is free there; a single clip of a kind goes on the track marked for pasting that kind.
 *  The page's rule for a paste then holds clip by clip: a sound that would land on another goes beside it; a picture
 *  is refused where one sits, and then nothing is pasted, with the clip that did not fit named. One version. */
export function pasteClips(tl0: Timeline, items: Copied[], f: number, mark: { video?: string; audio?: string; captions?: string } = {}): { edit?: Edit & { refs: ClipRef[] }; error?: string } {
  if (!items.length) return { error: 'Nothing is copied.' };
  const fps = tl0.fps;
  const base = Math.min(...items.map((i) => startF(i.clip, fps)));
  const count = (k: Copied['kind']) => items.filter((i) => i.kind === k).length;
  // the pictures first: one that cannot land refuses the whole paste before any sound is placed
  const order = [...items].sort((a, b) => (a.kind === b.kind ? startF(a.clip, fps) - startF(b.clip, fps) : a.kind === 'video' ? -1 : 1));
  let tl = tl0;
  const refs: ClipRef[] = [];
  let note = '';
  for (const it of order) {
    const usable = (id?: string) => (id ? tl.tracks.find((t) => t.id === id && t.kind === it.kind && !t.locked) : undefined);
    const to = (count(it.kind) === 1 ? usable(mark[it.kind]) : undefined) ?? usable(it.trackId) ?? tl.tracks.find((t) => t.kind === it.kind && !t.locked);
    if (!to) return { error: `No ${it.kind === 'video' ? 'picture' : it.kind === 'captions' ? 'subtitles' : 'sound'} track to paste ${clipName(it.clip)} on${items.length > 1 ? '; nothing was pasted' : ''}.` };
    const r = pasteClip(tl, it.clip, to.id, Math.max(0, Math.round(f)) + startF(it.clip, fps) - base);
    if (!r.edit) return { error: items.length > 1 ? `${clipName(it.clip)} does not fit, so nothing was pasted. ${r.error ?? ''}`.trim() : r.error };
    tl = r.edit.tl; refs.push(r.edit.ref); note = r.edit.note;
  }
  return { edit: { tl, note: items.length === 1 ? note : `pasted ${items.length} clips at ${Math.max(0, Math.round(f))} f on ${[...new Set(refs.map((r) => r.trackId))].join(', ')}`, refs } };
}

export function tidyOverlaps(tl0: Timeline): { tl: Timeline; moved: string[] } {
  const fps = tl0.fps;
  const clash = (t: TimelineTrack) => { const cs = [...t.clips].sort((a, b) => a.at - b.at); return cs.some((c, i) => i > 0 && startF(c, fps) < endF(cs[i - 1], fps)); };
  if (!tl0.tracks.some((t) => t.kind === 'audio' && clash(t))) return { tl: tl0, moved: [] };
  const tl = clone(tl0);
  const moved: string[] = [];
  const [pic, dlg] = linkedTracks(tl) ?? [];
  const picClips = tl.tracks.find((t) => t.id === pic)?.clips ?? [];
  const underPic = (c: TimelineClip) => picClips.some((v) => startF(v, fps) === startF(c, fps) && lenF(v, fps) === lenF(c, fps));
  for (const t of [...tl.tracks]) {
    // a locked track keeps its clips, even overlapping ones it already had
    if (t.kind !== 'audio' || t.locked) continue;
    for (let guard = 0; guard < 200; guard++) {
      sortClips(t, fps);
      const i = t.clips.findIndex((c, k) => k > 0 && startF(c, fps) < endF(t.clips[k - 1], fps));
      if (i < 0) break;
      const a = t.clips[i - 1], b = t.clips[i];
      // the freed sound moves; else the one that does not sit exactly under a picture (a sound carried over a cut
      // whose neighbour was unlinked too); else the earlier one
      const go = b.unlinked && !a.unlinked ? b : a.unlinked && !b.unlinked ? a : t.id === dlg && underPic(a) && !underPic(b) ? b : a;
      t.clips = t.clips.filter((c) => c.id !== go.id);
      const home = sideTrack(tl, t, startF(go, fps), endF(go, fps));
      if (!home) { t.clips.push(go); break; }
      home.clips.push(go); sortClips(home, fps);
      if (!moved.includes(home.name)) moved.push(home.name);
    }
  }
  return { tl, moved };
}

const withPartner = (tl: Timeline, r: ClipRef): ClipRef[] => {
  const p = partnerOf(tl, r);
  return p ? [r, p] : [r];
};

let seq = 0;
const newId = (base: string) => `${base.split('.')[0]}.${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Shift every clip that starts at or after `from` by `d` frames. */
function shiftFrom(t: TimelineTrack, from: number, d: number, fps: number, except?: string) {
  for (const c of t.clips) if (c.id !== except && startF(c, fps) >= from) c.at = toS(Math.max(0, startF(c, fps) + d), fps);
}

/** A ripple on the picture or its dialogue moves everything after it by the same amount: the other tracks
 *  (inserts, effects, music) and the markers too, as recipes/edit.md says (ASKS 16: "when you delete,
 *  everything kind of goes back"). Locked tracks stay. */
function rippleRest(tl: Timeline, tl0: Timeline, r: ClipRef, from: number, d: number, change: FilmChange = rippleChange(from, d)) {
  const pair = linkedTracks(tl0);
  if (!d || !pair || !pair.includes(r.trackId)) return;
  const touched = new Set(withPartner(tl0, r).map((x) => x.trackId));
  const fps = tl.fps;
  // subtitle lines follow what the picture shows (subs.ts followFilm): a line over what went goes or is shortened
  for (const t of tl.tracks) if (!touched.has(t.id) && !t.locked) { if (t.kind === 'captions') followFilm(t, change, fps); else shiftFrom(t, from, d, fps); sortClips(t, fps); }
  for (const m of tl.markers) if (toF(m.at, fps) >= from) m.at = toS(Math.max(0, toF(m.at, fps) + d), fps);
}

/** Split a clip that straddles frame `f` into two (used before inserting at f). */
function splitIn(t: TimelineTrack, f: number, fps: number) {
  const c = t.clips.find((x) => startF(x, fps) < f && endF(x, fps) > f);
  if (!c) return;
  const cut = f - startF(c, fps);
  if (isLine(c)) {
    // a subtitle line: its words split at the word nearest the cut, by how far into the line it is
    const len = lenF(c, fps);
    const words = splitText(c.text ?? '', cut / len) ?? [c.text ?? '', c.text ?? ''];
    t.clips.push({ ...c, id: newId(c.id), text: words[1], in: 0, out: toS(len - cut, fps), at: toS(f, fps) });
    c.text = words[0]; c.in = 0; c.out = toS(cut, fps);
    return;
  }
  const len = lenF(c, fps);
  const right: TimelineClip = { ...c, id: newId(c.id), in: srcPlus(c, c.in, cut, fps), at: toS(f, fps), fadeIn: undefined, dissolve: undefined };
  c.out = srcPlus(c, c.in, cut, fps);
  c.fadeOut = undefined;
  // each piece keeps its own end's fade, never longer than the piece (the server refuses a fade past the clip: found
  // when sample mode began to check every step on the server, 14 Nov)
  if (right.fadeOut !== undefined) right.fadeOut = Math.min(right.fadeOut, toS(len - cut, fps));
  if (c.fadeIn !== undefined) c.fadeIn = Math.min(c.fadeIn, toS(cut, fps));
  t.clips.push(right);
}

/** Move a clip (and its partner) by `d` frames along its track. Ripple off overwrites what it lands on;
 *  ripple on lifts it out, closes the gap and inserts it at the new place, pushing the rest along. */
export function moveClip(tl0: Timeline, r: ClipRef, d: number, shuffle: boolean): Edit | undefined {
  if (!d) return undefined;
  const lock = lockedWhy(tl0, [r]);
  if (lock) return refuse(lock);
  const ripple = shuffle && ripples(tl0, r);
  const tl = clone(tl0);
  const fps = tl.fps;
  const refs = withPartner(tl0, r);
  const main = findClip(tl, r);
  if (!main) return undefined;
  // shuffling (Command-Shift-drag, DaVinci's swap): the shot lands on the nearest cut of its track, between
  // two shots and never inside one, and the others close up around it
  let drop: number | undefined;
  if (ripple) {
    const s0 = startF(main.clip, fps), len0 = lenF(main.clip, fps);
    const cuts = [0, ...main.track.clips.filter((c) => c.id !== main.clip.id).flatMap((c) => {
      const cs = startF(c, fps), ce = endF(c, fps);
      return cs >= s0 + len0 ? [cs - len0, ce - len0] : [cs, ce];
    })];
    const want = Math.max(0, s0 + d);
    drop = cuts.reduce((b, x) => (Math.abs(x - want) < Math.abs(b - want) ? x : b), cuts[0]);
    if (drop === s0) return undefined;
  }
  const over: string[] = [];
  for (const ref of refs) {
    const f = findClip(tl, ref);
    if (!f || f.track.locked) continue;
    const { track, clip } = f;
    const s = startF(clip, fps), len = lenF(clip, fps);
    const to = drop ?? Math.max(0, s + d);
    if (ripple) {
      track.clips = track.clips.filter((c) => c.id !== clip.id);
      shiftFrom(track, s + len, -len, fps);
      splitIn(track, to, fps);
      shiftFrom(track, to, len, fps);
      clip.at = toS(to, fps);
      track.clips.push(clip);
    } else {
      // a plain move never cuts into what it lands on (the user, 13 Nov: "have it basically go over the shot
      // that's in front of it. Right now … it basically removes part of shot 6"): the moved clip goes on the
      // track above (a picture) or beside (a sound), and the one under it stays whole
      clip.at = toS(to, fps);
      if (track.clips.some((c) => c.id !== clip.id && startF(c, fps) < to + len && endF(c, fps) > to)) {
        // two subtitle lines never overlap: refused, and the status line says why
        if (track.kind === 'captions') return refuse(`No room on ${track.id} ${track.name} there: two lines never overlap. Move or trim the other line first.`);
        const home = track.kind === 'video' ? upperTrack(tl, track, to, to + len) : track.kind === 'audio' ? sideTrack(tl, track, to, to + len) : undefined;
        if (!home) return undefined;
        track.clips = track.clips.filter((c) => c.id !== clip.id);
        home.clips.push(clip);
        sortClips(home, fps);
        over.push(`${home.id} ${home.name}`);
      }
    }
    sortClips(track, fps);
  }
  return { tl, note: `moved ${clipName(main.clip)} ${signed(d)} f${ripple ? ' (shuffled: the others closed up)' : over.length ? `, now over its neighbour on ${over.join(' and ')}` : ''}` };
}

/** Trim the head or the tail by `d` frames (positive = later). Ripple keeps the clip's place and moves
 *  what follows; without it the cut point moves and a gap opens or the neighbour bounds it. */
export function trimClip(tl0: Timeline, r: ClipRef, edge: 'head' | 'tail', d: number, ripple0: boolean, srcSeconds?: number): Edit | undefined {
  const ripple = ripple0 && ripples(tl0, r);
  const tl = clone(tl0);
  const fps = tl.fps;
  const first = findClip(tl, r);
  if (!first || !d) return undefined;
  const lock = lockedWhy(tl0, [r], ripple ? endF(first.clip, fps) : undefined);
  if (lock) return refuse(lock);
  const dd = clampTrim(tl0, r, edge, d, ripple, srcSeconds);
  if (!dd) return undefined;
  for (const ref of withPartner(tl0, r)) {
    const f = findClip(tl, ref);
    if (!f || f.track.locked) continue;
    const { track, clip } = f;
    const s = startF(clip, fps), e = endF(clip, fps);
    if (edge === 'head') {
      clip.in = srcPlus(clip, clip.in, dd, fps);
      if (ripple) shiftFrom(track, e, -dd, fps, clip.id);
      else clip.at = toS(s + dd, fps);
    } else {
      clip.out = srcPlus(clip, clip.out, dd, fps);
      if (ripple) shiftFrom(track, e, dd, fps, clip.id);
    }
    fitFades(clip);
    sortClips(track, fps);
  }
  if (ripple) {
    const was = findClip(tl0, r);
    // what the film lost or gained, for the subtitle lines: a head trimmed takes its first frames out (grown back, puts
    // frames in at its start); a tail, its last
    const s0 = was ? startF(was.clip, fps) : 0;
    const change: FilmChange | undefined = edge === 'head' ? (dd > 0 ? { kind: 'cut', from: s0, to: s0 + dd } : { kind: 'open', at: s0, d: -dd }) : undefined;
    if (was) rippleRest(tl, tl0, r, endF(was.clip, fps), edge === 'head' ? -dd : dd, change);
  }
  return { tl, note: `trimmed ${edge} of ${clipName(first.clip)} ${signed(dd)} f${ripple ? `, what follows moved ${dd * (edge === 'head' ? -1 : 1) < 0 ? 'back' : 'on'}` : ''}` };
}

/** A fade never lasts longer than its clip (the server refuses a version where one does): after a clip got
 *  shorter, each fade is cut to the clip's new length. */
function fitFades(c: TimelineClip) {
  // a subtitle line keeps in 0 and out its length, whichever edge moved
  if (isLine(c)) { c.out = Math.round((c.out - c.in) * 1e6) / 1e6; c.in = 0; }
  const len = Math.round(((c.out - c.in) / speedOf(c)) * 1e6) / 1e6;
  if (c.fadeIn !== undefined && c.fadeIn > len) c.fadeIn = len;
  if (c.fadeOut !== undefined && c.fadeOut > len) c.fadeOut = len;
}

/** How many timeline frames a clip's tail can still grow inside its file of `sec` seconds, at its speed: its out may
 *  land up to half a frame past the length known (stored lengths are rounded; the server's check allows 1.5 frames).
 *  A trim and a moved join both stop here, so they agree (14 Nov: the trim reached the file's end, the join a frame
 *  short of it). Negative when the clip already reads past that. */
export function tailRoom(c: TimelineClip, sec: number, fps: number): number {
  // the room in whole frames of the file (a rounded length gives up to half a frame either way), then in frames of
  // the timeline at the clip's speed: half a frame of rounding never becomes a whole frame of a slowed clip
  const src = Math.floor((sec - c.out) * fps + 0.5 + 1e-6);
  return Math.floor(src / speedOf(c) + 1e-6);
}

/** How many timeline frames a clip runs past the end of its file (0 when it does not, or when the length is
 *  not known). Up to 1.5 frames over is not counted: stored lengths are rounded, and the server allows as much. */
export function pastEnd(c: TimelineClip, srcSeconds: number | undefined, fps: number): number {
  if (srcSeconds === undefined || !(c.out > srcSeconds + 1.5 / fps)) return 0;
  return Math.max(1, Math.round(((c.out - srcSeconds) * fps) / speedOf(c)));
}

/** The trim the clip can take: at least one frame left, the source's own length, the neighbours without ripple.
 *  A tail never goes past the end of its file; when the file's length is not known it does not grow at all
 *  (a captions file has no length: its clip may). A clip already past its file's end comes back to it. */
export function clampTrim(tl: Timeline, r: ClipRef, edge: 'head' | 'tail', d: number, ripple0: boolean, srcSeconds?: number, overNeighbours = false): number {
  // overNeighbours: a sound trimmed alone may grow over the clip next to it (it then goes on the track beside)
  const ripple = ripple0 && ripples(tl, r) && !overNeighbours;
  const fps = tl.fps;
  const f = findClip(tl, r);
  if (!f) return 0;
  const { track, clip } = f;
  const s = startF(clip, fps), e = endF(clip, fps), len = e - s;
  // in timeline frames: a slowed clip spends more timeline frames per source second
  const sp = speedOf(clip);
  // a subtitle line has no file: its head can go back to the start of the film
  const inF = isLine(clip) ? s : Math.floor(toF(clip.in, fps) / sp);
  const others = track.clips.filter((c) => c.id !== clip.id);
  if (edge === 'head') {
    let lo = -inF;                                   // the source's first frame
    if (overNeighbours) lo = Math.max(lo, -s);       // …and the film's
    else if (!ripple) {
      const prevEnd = Math.max(0, ...others.filter((c) => endF(c, fps) <= s).map((c) => endF(c, fps)));
      lo = Math.max(lo, prevEnd - s);
    }
    return Math.max(lo, Math.min(d, len - 1));
  }
  // within the rounding allowed (pastEnd 0) a clip a frame over its stored length is not pulled back
  let hi = srcSeconds ? tailRoom(clip, srcSeconds, fps) : track.kind === 'captions' ? Infinity : 0;
  if (hi < 0 && !pastEnd(clip, srcSeconds, fps)) hi = 0;
  if (!ripple && !overNeighbours) {
    const nextStart = Math.min(Infinity, ...others.filter((c) => startF(c, fps) >= e).map((c) => startF(c, fps)));
    hi = Math.min(hi, nextStart - e);
  }
  return Math.min(hi, Math.max(d, -(len - 1)));
}

// ---- the join between two clips (the user, 13 Nov: "click in the space between two adjacent videos or two
// adjacent pieces of audio and then move it left and right … if the left one has anything hidden, Da Vinci
// Resolve style"). The cut point moves; the clip before it gets longer by what the clip after it loses, so
// nothing else moves and the film keeps its length.

/** Whether `left` ends on the very frame `right` starts, on one track. */
export function touching(tl: Timeline, left: ClipRef, right: ClipRef): boolean {
  if (left.trackId !== right.trackId || left.clipId === right.clipId) return false;
  const l = findClip(tl, left), r = findClip(tl, right);
  return !!l && !!r && endF(l.clip, tl.fps) === startF(r.clip, tl.fps);
}

/** The joins that move together: the one grabbed, and the one between the linked picture or sound of both
 *  clips when both have it and those two touch too. Otherwise the grabbed track's join alone. */
export function rollPairs(tl: Timeline, left: ClipRef, right: ClipRef): [ClipRef, ClipRef][] {
  const pairs: [ClipRef, ClipRef][] = [[left, right]];
  const pl = partnerOf(tl, left), pr = partnerOf(tl, right);
  if (pl && pr && touching(tl, pl, pr)) pairs.push([pl, pr]);
  return pairs;
}

/** How far the join can move of the `d` frames asked (positive = later), and why it stops when it does: the
 *  clip before it can read only to the end of its file ("end of the file"; not at all when the length is not
 *  known), the clip after it only back to the start of its file, and each keeps at least one frame. Speed
 *  counts: a sped-up clip uses its file faster. */
export function clampRoll(tl: Timeline, left: ClipRef, right: ClipRef, d: number, srcSeconds: (src: string) => number | undefined): { d: number; why?: string } {
  const fps = tl.fps;
  if (!touching(tl, left, right)) return { d: 0 };
  let hi = Infinity, lo = -Infinity, hiWhy: string | undefined, loWhy: string | undefined;
  for (const [l, r] of rollPairs(tl, left, right)) {
    const L = findClip(tl, l)!, R = findClip(tl, r)!;
    if (L.track.locked) return { d: 0, why: 'track locked' };
    const sec = L.clip.src ? srcSeconds(L.clip.src) : undefined;
    const grow = sec === undefined ? (L.track.kind === 'captions' ? Infinity : 0)
      : Math.max(0, tailRoom(L.clip, sec, fps));
    if (grow < hi) { hi = grow; hiWhy = sec === undefined ? 'file length unknown' : 'end of the file'; }
    if (lenF(R.clip, fps) - 1 < hi) { hi = lenF(R.clip, fps) - 1; hiWhy = 'one frame left'; }
    // a subtitle line has no file: its start can move back as far as the line before it lets it
    const back = isLine(R.clip) ? Infinity : Math.floor((R.clip.in * fps) / speedOf(R.clip) + 1e-3);
    if (0 - back > lo) { lo = 0 - back; loWhy = 'start of the file'; }
    if (1 - lenF(L.clip, fps) > lo) { lo = 1 - lenF(L.clip, fps); loWhy = 'one frame left'; }
  }
  if (d >= hi && d > 0) return { d: hi, why: hiWhy };
  if (d <= lo && d < 0) return { d: lo, why: loWhy };
  return { d };
}

/** Move the join between `left` and `right` by `d` frames (positive = later): `left`'s out and `right`'s in
 *  and start move together, kept inside both files (`clampRoll`). Linked picture and sound move together. */
export function rollEdit(tl0: Timeline, left: ClipRef, right: ClipRef, d0: number, srcSeconds: (src: string) => number | undefined): Edit | undefined {
  const { d } = clampRoll(tl0, left, right, d0, srcSeconds);
  if (!d) return undefined;
  const tl = clone(tl0);
  const fps = tl.fps;
  // exact seconds, not snapped to the file's frames: each length then changes by exactly d frames
  const plus = (c: TimelineClip, sec: number) => Math.round((sec + (d * speedOf(c)) / fps) * 1e6) / 1e6;
  for (const [l, r] of rollPairs(tl0, left, right)) {
    const L = findClip(tl, l)!.clip, R = findClip(tl, r)!.clip;
    const j = startF(R, fps);
    L.out = plus(L, L.out);
    if (isLine(R)) R.out = toS(lenF(R, fps) - d, fps);
    else R.in = Math.max(0, plus(R, R.in));
    R.at = toS(j + d, fps);
    fitFades(L); fitFades(R);
  }
  const L0 = findClip(tl0, left)!.clip, R0 = findClip(tl0, right)!.clip;
  // a clip of the join that moved without its linked picture or sound (theirs do not touch) is no longer in step
  // with it: the two are marked unlinked in the same version, as an Option-trim does, so the timeline shows it and
  // later edits treat them apart (14 Nov: the chains found the link silently broken by place). Not when that
  // partner is on a locked track: then nothing moves
  const alone: string[] = [];
  if (rollPairs(tl0, left, right).length === 1) {
    for (const ref of [left, right]) {
      const p = partnerOf(tl0, ref);
      if (!p) continue;
      const mate = findClip(tl, p);
      if (!mate) continue;
      if (mate.track.locked) return refuse(lockedWhy(tl0, [ref])!);
      mate.clip.unlinked = true;
      findClip(tl, ref)!.clip.unlinked = true;
      alone.push(clipName(findClip(tl0, ref)!.clip));
    }
  }
  return { tl, note: `moved the join of ${clipName(L0)} and ${clipName(R0)} ${signed(d)} f${alone.length ? `; ${alone.join(' and ')} no longer linked to ${findClip(tl0, left)!.track.kind === 'audio' ? 'its picture' : 'its sound'}` : ''}` };
}

// ---- a shot's sound before or after its picture (the user, 13 Nov: "make sure that the sound bleeds in from the
// shot before … Maybe it can bleed into another scene … which is something that I use from Da Vinci a lot").
// Option-drag on an edge trims that clip alone, as in DaVinci: its picture or sound stays, nothing closes up, the
// two are unlinked. A sound may grow over the next (or the previous) sound; it then goes on the track beside.

/** The frame where a clip's file would start on the timeline: a picture and a sound of one file in sync share it. */
const syncF = (c: TimelineClip, fps: number) => startF(c, fps) - (c.in * fps) / speedOf(c);
const inSync = (a: TimelineClip, b: TimelineClip, fps: number) => a.src === b.src && speedOf(a) === speedOf(b) && Math.abs(syncF(a, fps) - syncF(b, fps)) <= 1;
const overlapF = (a: TimelineClip, b: TimelineClip, fps: number) => Math.min(endF(a, fps), endF(b, fps)) - Math.max(startF(a, fps), startF(b, fps));

/** The picture a sound was cut from: its linked picture, else the picture on the main track from the same file,
 *  in sync with it, touching or under it, and linked to no other sound (a carried sound's picture). */
export function pictureOfSound(tl: Timeline, r: ClipRef): ClipRef | undefined {
  const p = partnerOf(tl, r);
  if (p) return p;
  const f = findClip(tl, r), v = tl.tracks.find((t) => t.id === linkedTracks(tl)?.[0]);
  if (!f || !v || f.track.kind !== 'audio') return undefined;
  const fps = tl.fps;
  const best = v.clips.filter((c) => inSync(c, f.clip, fps) && overlapF(c, f.clip, fps) >= 0 && !partnerOf(tl, { trackId: v.id, clipId: c.id }))
    .sort((a, b) => overlapF(b, f.clip, fps) - overlapF(a, f.clip, fps))[0];
  return best ? { trackId: v.id, clipId: best.id } : undefined;
}

/** A picture's own sound: its linked sound, else a sound from the same file in sync with it on any sound track,
 *  touching or under it and linked to no other picture (the dialogue track first, then the most overlap). */
export function soundOfPicture(tl: Timeline, r: ClipRef): ClipRef | undefined {
  const p = partnerOf(tl, r);
  if (p) return p;
  const f = findClip(tl, r), pair = linkedTracks(tl);
  if (!f || !pair || f.track.id !== pair[0]) return undefined;
  const fps = tl.fps;
  const cands = tl.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips
    .filter((c) => inSync(c, f.clip, fps) && overlapF(c, f.clip, fps) >= 0 && !partnerOf(tl, { trackId: t.id, clipId: c.id }))
    .map((c) => ({ ref: { trackId: t.id, clipId: c.id }, k: (t.id === pair[1] ? 1e9 : 0) + overlapF(c, f.clip, fps) })));
  return cands.sort((a, b) => b.k - a.k)[0]?.ref;
}

/** How far an edge can go trimmed alone (Option-drag), and why it stops when it does. A sound is bound only by
 *  its file, the start of the film and one frame left: it may run over its neighbour. A picture also stops at
 *  its neighbour, as a trim does when gaps do not close. */
export function clampAlone(tl: Timeline, r: ClipRef, edge: 'head' | 'tail', d: number, srcSeconds?: number): { d: number; why?: string } {
  const f = findClip(tl, r);
  if (!f) return { d: 0 };
  if (f.track.locked) return { d: 0, why: 'track locked' };
  // the linked picture or sound is unlinked in the same version: not when its track is locked
  const p = partnerOf(tl, r);
  if (p && findClip(tl, p)?.track.locked) return { d: 0, why: 'track locked' };
  const fps = tl.fps;
  const over = f.track.kind === 'audio';
  const v = clampTrim(tl, r, edge, d, false, srcSeconds, over);
  if (v === d || !d) return { d: v + 0 };
  const s = startF(f.clip, fps), e = endF(f.clip, fps);
  const others = f.track.clips.filter((c) => c.id !== f.clip.id);
  let why: string;
  if (edge === 'tail') {
    if (d < 0) why = 'one frame left';
    else if (!over && others.some((c) => startF(c, fps) === e + v)) why = 'the next clip';
    else why = srcSeconds === undefined ? 'file length unknown' : 'end of the file';
  } else if (d > 0) why = 'one frame left';
  else if (s + v === 0) why = 'start of the film';
  else if (!over && others.some((c) => endF(c, fps) === s + v)) why = 'the clip before';
  else why = 'start of the file';
  return { d: v + 0, why };   // + 0: never −0
}

/** A sound that now runs over another on its track goes on the track beside the dialogue (or beside the track
 *  it is on): "Dialogue 2", the next free one, made when missing. Its track's name, or undefined when it stays. */
function besideIfOver(tl: Timeline, t: TimelineTrack, c: TimelineClip): string | undefined {
  const fps = tl.fps;
  const s = startF(c, fps), e = endF(c, fps);
  if (!t.clips.some((k) => k.id !== c.id && startF(k, fps) < e && endF(k, fps) > s)) return undefined;
  const base = /^(.*) \d+$/.exec(t.name)?.[1];
  const from = (base && tl.tracks.find((x) => x.kind === 'audio' && x.name === base)) || t;
  t.clips = t.clips.filter((k) => k.id !== c.id);
  const home = sideTrack(tl, from, s, e);
  if (!home) { t.clips.push(c); sortClips(t, fps); return undefined; }
  home.clips.push(c); sortClips(home, fps);
  return home.name;
}

/** Where a sound's edge now is against its picture's, in plain words. */
function soundWords(c: TimelineClip, pic: TimelineClip | undefined, edge: 'head' | 'tail', d: number, fps: number): string {
  if (!pic) return `its sound ${edge === 'tail' ? 'ends' : 'starts'} ${Math.abs(d)} f ${d > 0 ? 'later' : 'earlier'}`;
  if (edge === 'tail') {
    const k = endF(c, fps) - endF(pic, fps);
    return k > 0 ? `its sound runs on ${k} f after its picture` : k < 0 ? `its sound ends ${-k} f before its picture` : 'its sound ends with its picture again';
  }
  const k = startF(pic, fps) - startF(c, fps);
  return k > 0 ? `its sound starts ${k} f before its picture` : k < 0 ? `its sound starts ${-k} f after its picture` : 'its sound starts with its picture again';
}

/** The name a note gives a shot: the page's ("S2 shot 3") when it has one, else the clip's. */
export type NameOf = (c: TimelineClip) => string | undefined;

function alone(tl0: Timeline, r: ClipRef, edge: 'head' | 'tail', d0: number, srcSeconds: number | undefined, nameOf?: NameOf) {
  const lock = lockedWhy(tl0, [r]);
  if (lock) return refuse(lock);
  const { d } = clampAlone(tl0, r, edge, d0, srcSeconds);
  if (!d) return undefined;
  const tl = clone(tl0);
  const fps = tl.fps;
  const me = findClip(tl, r)!;
  const sound = me.track.kind === 'audio';
  const p = partnerOf(tl0, r);
  const picRef = sound ? pictureOfSound(tl0, r) : r;
  if (p) { me.clip.unlinked = true; findClip(tl, p)!.clip.unlinked = true; }
  const s = startF(me.clip, fps);
  if (edge === 'head') { me.clip.in = srcPlus(me.clip, me.clip.in, d, fps); me.clip.at = toS(s + d, fps); }
  else me.clip.out = srcPlus(me.clip, me.clip.out, d, fps);
  fitFades(me.clip);
  sortClips(me.track, fps);
  const beside = sound ? besideIfOver(tl, me.track, me.clip) : undefined;
  const pic = picRef ? findClip(tl, picRef)?.clip : undefined;
  const name = nameOf?.(pic ?? me.clip) ?? clipName(pic ?? me.clip);
  const words = sound ? soundWords(me.clip, pic, edge, d, fps)
    : `its picture ${edge === 'tail' ? 'ends' : 'starts'} ${Math.abs(d)} f ${d > 0 ? 'later' : 'earlier'}${p ? ', its sound left as it was' : ''}`;
  return { tl, clip: me.clip, name, words, beside, pic };
}

/** Trim one edge of a clip alone (Option-drag on a trim handle; DaVinci's): its linked picture or sound is left as
 *  it is and the two are unlinked, nothing closes up. A sound may run on under the next shot or start under the
 *  one before, as far as its file has sound; over another sound it goes on the track beside. */
export function trimAlone(tl0: Timeline, r: ClipRef, edge: 'head' | 'tail', d: number, srcSeconds?: number, nameOf?: NameOf): Edit | undefined {
  const a = alone(tl0, r, edge, d, srcSeconds, nameOf);
  return a && { tl: a.tl, note: `${a.name}: ${a.words}${a.beside ? ` (now on ${a.beside})` : ''}` };
}

/** What carrying a picture's sound over its join would do: `frames` past the picture's end ('tail': the earlier
 *  shot's sound runs on) or before its start ('head': the later shot's sound starts early). `now`: how far it
 *  already does; `reach`: how far it would, the file allowing; `why`: why it gives less, or nothing. */
export interface CarryPlan { sound?: ClipRef; now: number; reach: number; why?: string }
export function carryPlan(tl: Timeline, pic: ClipRef, edge: 'head' | 'tail', frames: number, srcSeconds: (src: string) => number | undefined): CarryPlan {
  const fps = tl.fps;
  const P = findClip(tl, pic);
  const sound = P ? soundOfPicture(tl, pic) : undefined;
  const S = sound ? findClip(tl, sound) : undefined;
  if (!P || !sound || !S) return { now: 0, reach: 0, why: 'no sound of its own' };
  const now = edge === 'tail' ? endF(S.clip, fps) - endF(P.clip, fps) : startF(P.clip, fps) - startF(S.clip, fps);
  if (now >= frames) return { sound, now, reach: now, why: now === frames ? 'already so' : 'already longer' };
  const r = clampAlone(tl, sound, edge, edge === 'tail' ? frames - now : now - frames, srcSeconds((S.clip.src ?? '')));
  // a clip already past the end of its file (old damage) would be pulled back by the clamp: it gives nothing
  const gain = edge === 'tail' ? r.d : -r.d;
  const reach = now + Math.max(0, gain);
  if (reach <= 0 || gain <= 0) return { sound, now, reach: Math.max(0, reach), why: r.why === 'end of the file' || r.why === 'start of the file' ? 'no more sound in the file' : r.why ?? 'no more sound in the file' };
  return { sound, now, reach, why: reach < frames ? r.why : undefined };
}

/** Carry a picture's sound over its join (the right-click menu's "Carry the sound over this join"): what an
 *  Option-drag of the sound's edge would do, to `frames` past the picture (less when the file has less), with a
 *  fade over the new stretch as long as it (out on a sound that runs on, in on one that starts early). The
 *  neighbour's sound is left as it is: both are heard. */
export function carrySound(tl0: Timeline, pic: ClipRef, edge: 'head' | 'tail', frames: number, srcSeconds: (src: string) => number | undefined, nameOf?: NameOf): Edit | undefined {
  const plan = carryPlan(tl0, pic, edge, frames, srcSeconds);
  if (!plan.sound || plan.why && plan.reach <= plan.now) return undefined;
  const S = findClip(tl0, plan.sound)!.clip;
  const a = alone(tl0, plan.sound, edge, edge === 'tail' ? plan.reach - plan.now : plan.now - plan.reach, srcSeconds((S.src ?? '')), nameOf);
  if (!a) return undefined;
  const fps = tl0.fps;
  const c = a.clip;
  const len = (c.out - c.in) / speedOf(c);
  const k = edge === 'tail' ? endF(c, fps) - endF(a.pic ?? c, fps) : startF(a.pic ?? c, fps) - startF(c, fps);
  if (k > 0) {
    if (edge === 'tail') c.fadeOut = toS(Math.min(k, Math.round((len - (c.fadeIn ?? 0)) * fps)), fps);
    else c.fadeIn = toS(Math.min(k, Math.round((len - (c.fadeOut ?? 0)) * fps)), fps);
  }
  return { tl: a.tl, note: `${a.name}: ${a.words}, fading ${edge === 'tail' ? 'out' : 'in'}${a.beside ? ` (now on ${a.beside})` : ''}` };
}

/** Put a carried sound back under its picture (the menu's "Link to the picture again" on a sound that runs past
 *  it): the sound takes its picture's place, length and stretch of the file again, on the dialogue track, and
 *  the two are linked. Needs the picture still there (same file, in sync) and the dialogue track free under it. A
 *  fade that covered just the stretch taken off goes with it; the track beside, left empty, goes too. Works from
 *  the picture as well. Undefined when there is nothing to put back. */
export function relinkSound(tl0: Timeline, r: ClipRef, nameOf?: NameOf): Edit | undefined {
  const pair = linkedTracks(tl0);
  const f = findClip(tl0, r);
  if (!pair || !f) return undefined;
  const sRef = f.track.kind === 'audio' ? r : f.track.id === pair[0] ? soundOfPicture(tl0, r) : undefined;
  const pRef = f.track.kind === 'audio' ? pictureOfSound(tl0, r) : f.track.id === pair[0] ? r : undefined;
  if (!sRef || !pRef || partnerOf(tl0, sRef) || partnerOf(tl0, pRef)) return undefined;
  const fps = tl0.fps;
  const P0 = findClip(tl0, pRef)!.clip, S0 = findClip(tl0, sRef)!;
  const dlg0 = tl0.tracks.find((t) => t.id === pair[1])!;
  if (S0.track.locked || dlg0.locked || findClip(tl0, pRef)!.track.locked) return undefined;
  const ps = startF(P0, fps), pe = endF(P0, fps);
  if (dlg0.clips.some((c) => c.id !== S0.clip.id && startF(c, fps) < pe && endF(c, fps) > ps)) return undefined;
  const tl = clone(tl0);
  const S = findClip(tl, sRef)!, P = findClip(tl, pRef)!.clip, dlg = tl.tracks.find((t) => t.id === pair[1])!;
  const c = S.clip;
  const offTail = endF(c, fps) - pe, offHead = ps - startF(c, fps);
  if (offTail > 0 && c.fadeOut !== undefined && Math.abs(toF(c.fadeOut, fps) - offTail) <= 1) delete c.fadeOut;
  if (offHead > 0 && c.fadeIn !== undefined && Math.abs(toF(c.fadeIn, fps) - offHead) <= 1) delete c.fadeIn;
  c.in = P.in; c.out = P.out; c.at = P.at;
  delete c.unlinked; delete P.unlinked;
  fitFades(c);
  if (S.track.id !== dlg.id) {
    S.track.clips = S.track.clips.filter((k) => k.id !== c.id);
    dlg.clips.push(c);
    // the track it was on stays, even empty (14 Nov): a "Dialogue 2" may be one the owner made and named so; "Delete
    // empty tracks" in the track menu takes it away, and ⌘Z gives back the cut before exactly
  }
  sortClips(dlg, fps);
  return { tl, note: `${nameOf?.(P) ?? clipName(P)}: its sound back to its picture's length, linked again` };
}

/** Split the clip (and its partner) at timeline frame `f`. */
export function splitClip(tl0: Timeline, r: ClipRef, f: number): Edit | undefined {
  const tl = clone(tl0);
  const fps = tl.fps;
  const main = findClip(tl, r);
  if (!main || f <= startF(main.clip, fps) || f >= endF(main.clip, fps)) return undefined;
  const lock = lockedWhy(tl0, [r]);
  if (lock) return refuse(lock);
  if (isLine(main.clip) && !splitText(main.clip.text ?? '', 0.5)) return refuse('A line of one word cannot be split: retype it, or trim it.');
  for (const ref of withPartner(tl0, r)) {
    const x = findClip(tl, ref);
    if (!x || x.track.locked) continue;
    splitIn(x.track, f, fps);
    sortClips(x.track, fps);
  }
  // named as it was before the cut (a line's words are halved by it)
  return { tl, note: `split ${clipName(findClip(tl0, r)!.clip)} at ${f} f` };
}

/** Remove the clip (and its partner); ripple closes the gap. */
export function deleteClip(tl0: Timeline, r: ClipRef, ripple0: boolean): Edit | undefined {
  const ripple = ripple0 && ripples(tl0, r);
  const tl = clone(tl0);
  const fps = tl.fps;
  const main = findClip(tl, r);
  if (!main) return undefined;
  const lock = lockedWhy(tl0, [r], ripple ? endF(main.clip, fps) : undefined);
  if (lock) return refuse(lock);
  for (const ref of withPartner(tl0, r)) {
    const x = findClip(tl, ref);
    if (!x) continue;
    const s = startF(x.clip, fps), len = lenF(x.clip, fps);
    x.track.clips = x.track.clips.filter((c) => c.id !== x.clip.id);
    if (ripple) shiftFrom(x.track, s + len, -len, fps);
  }
  if (ripple) { const s = startF(main.clip, fps), len = lenF(main.clip, fps); rippleRest(tl, tl0, r, s + len, -len); }
  return { tl, note: `deleted ${clipName(main.clip)}${ripple ? ', what follows moved back' : ''}` };
}

/** Change fields of one clip; `linked` applies the same change to the partner (source, gain, fades). */
export function patchClip(tl0: Timeline, r: ClipRef, patch: Partial<TimelineClip>, note: string, linked = false): Edit | undefined {
  const tl = clone(tl0);
  const refs = linked ? withPartner(tl0, r) : [r];
  const lock = lockedWhy(tl0, linked ? [r] : []) ?? (findClip(tl0, r)?.track.locked ? lockedWhy(tl0, [r]) : undefined);
  if (lock) return refuse(lock);
  let any = false;
  for (const ref of refs) {
    const x = findClip(tl, ref);
    if (!x) continue;
    Object.assign(x.clip, patch);
    for (const k of Object.keys(patch) as (keyof TimelineClip)[]) if (patch[k] === undefined) delete x.clip[k];
    any = true;
  }
  return any ? { tl, note } : undefined;
}

/** Put another take of the scene in the clip's place: same position and length, the in-point kept when the
 *  new source is long enough, else moved back so the length fits. */
export function replaceTake(tl0: Timeline, r: ClipRef, src: string, take: { scene: string; take: string }, label: string, srcSeconds?: number): Edit | undefined {
  const found = findClip(tl0, r);
  if (!found) return undefined;
  const fps = tl0.fps;
  const { clip } = found;
  const len = lenF(clip, fps);
  const need = Math.round(len * speedOf(clip));   // source frames the clip's length takes at its speed
  let inF = toF(clip.in, fps);
  if (srcSeconds) inF = Math.max(0, Math.min(inF, toF(srcSeconds, fps) - need));
  // a take shorter than the clip: the clip ends with the take (it gets shorter) rather than past it
  const outF = srcSeconds ? Math.min(inF + need, Math.floor(srcSeconds * fps + 1e-3)) : inF + need;
  const patch = { src, in: toS(inF, fps), out: toS(Math.max(inF + 1, outF), fps), takeRef: take, label };
  return patchClip(tl0, r, patch, `replaced ${clipName(clip)} with ${label}`, true);
}

/** Retime a clip (and its partner): the clip keeps its place and length on the timeline and takes more or less
 *  of its source; when the source runs out first, the clip gets shorter. 1 clears the field. */
export function setSpeed(tl0: Timeline, r: ClipRef, speed: number, srcSeconds?: number): Edit | undefined {
  const found = findClip(tl0, r);
  if (!found || !(speed > 0)) return undefined;
  const fps = tl0.fps;
  const { clip } = found;
  const sp = Math.round(speed * 1000) / 1000;
  if (sp === speedOf(clip)) return undefined;
  const len = lenF(clip, fps);
  let out = clip.in + (len * sp) / fps;
  // a faster clip needs more of its file: never past its end, nor past what is known of it
  out = Math.min(out, srcSeconds ?? clip.out);
  out = Math.round(out * 1e6) / 1e6;
  return patchClip(tl0, r, { speed: sp === 1 ? undefined : sp, out }, `${clipName(clip)} speed ${Math.round(speedOf(clip) * 100)}% → ${Math.round(sp * 100)}%`, true);
}

/** Play clips faster or slower and keep what they show (13 Nov 2026: "increase the speed while keeping the
 *  tone … of the voice"). Unlike `setSpeed`, each clip keeps its in and out points, so it gets shorter or longer
 *  on the timeline, and everything after it moves by the difference on every track, markers too. The picture
 *  and its dialogue change together. The render stretches the sound without changing its pitch (atempo), and
 *  so does the page's own playback. */
export function retimeClips(tl0: Timeline, refs: ClipRef[], speed: number, what?: string): Edit | undefined {
  if (!(speed >= 0.1 && speed <= 10)) return undefined;
  const sp = Math.round(speed * 1000) / 1000;
  const tl = clone(tl0);
  const fps = tl.fps;
  // the clips and their partners, found before anything moves (a partner is matched by its place and source)
  const groups = refs.map((r) => ({ r, ids: withPartner(tl0, r), at: (() => { const f = findClip(tl0, r); return f ? startF(f.clip, fps) : -1; })() }))
    .filter((g) => g.at >= 0).sort((a, b) => a.at - b.at);
  // a lock refuses the whole change: a clip or its partner on a locked track, or a locked track with clips after a
  // clip that closes or opens space (14 Nov)
  for (const g of groups) {
    const f = findClip(tl0, g.r)!;
    if (speedOf(f.clip) === sp) continue;
    const lock = lockedWhy(tl0, [g.r], ripples(tl0, g.r) ? endF(f.clip, fps) : undefined);
    if (lock) return refuse(lock);
  }
  let total = 0, changed = 0, was: number | undefined;
  const beside: string[] = [];
  for (const g of groups) {
    const main = findClip(tl, g.r);
    if (!main || speedOf(main.clip) === sp) continue;
    was ??= speedOf(main.clip);
    const oldEnd = endF(main.clip, fps);
    const mine = new Set<string>();
    for (const ref of g.ids) {
      const f = findClip(tl, ref);
      if (!f) continue;
      if (sp === 1) delete f.clip.speed; else f.clip.speed = sp;
      mine.add(f.clip.id);
    }
    const d = endF(main.clip, fps) - oldEnd;
    // only the picture and a sound linked to it close or open space (the user, 13 Nov: "if it's effects, effects are
    // on their own"); an effect, music, an insert or a lone sound changes length alone and nothing else moves (F3)
    if (d && ripples(tl0, g.r)) {
      // subtitle lines inside the shot keep their place in it; the ones after move like everything else
      const s0 = startF(main.clip, fps);
      for (const t of tl.tracks) if (t.kind === 'captions' && !t.locked) followFilm(t, { kind: 'scale', from: s0, to: oldEnd, newTo: oldEnd + d }, fps);
      for (const t of tl.tracks) if (t.kind !== 'captions') for (const c of t.clips) if (!mine.has(c.id) && startF(c, fps) >= oldEnd) c.at = toS(Math.max(0, startF(c, fps) + d), fps);
      for (const m of tl.markers) if (toF(m.at, fps) >= oldEnd) m.at = toS(Math.max(0, toF(m.at, fps) + d), fps);
    } else if (d > 0) {
      // grown alone into the next clip on its track: a sound goes on the track beside, a picture is refused
      const c = main.clip, t = main.track;
      if (t.clips.some((k) => k.id !== c.id && startF(k, fps) < endF(c, fps) && endF(k, fps) > startF(c, fps))) {
        if (t.kind !== 'audio') return refuse(`${clipName(findClip(tl0, g.r)!.clip)} would run ${d} f into the next clip on ${t.id} ${t.name} at that speed. Make room after it first.`);
        const home = besideIfOver(tl, t, c);
        if (!home) return refuse(`No room on ${t.id} ${t.name} or the tracks beside it for ${clipName(c)} at that speed.`);
        beside.push(home);
      }
    }
    total += d; changed++;
  }
  if (!changed) return undefined;
  for (const t of tl.tracks) sortClips(t, fps);
  const first = findClip(tl0, groups[0].r);
  const name = what ?? (changed === 1 && first ? clipName(first.clip) : `${changed} clips`);
  const len = total;
  return { tl, note: `${name} speed ${was !== undefined && changed === 1 ? `${Math.round(was * 100)}% → ` : '→ '}${Math.round(sp * 100)}%${len ? `, ${Math.abs(len)} f ${len < 0 ? 'shorter' : 'longer'}` : ''}${beside.length ? ` (now on ${[...new Set(beside)].join(', ')})` : ''}` };
}

export function patchTrack(tl0: Timeline, id: string, patch: Partial<TimelineTrack>, note: string): Edit {
  const tl = clone(tl0);
  const t = tl.tracks.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  return { tl, note };
}

export function addTrack(tl0: Timeline, kind: TrackKind): Edit {
  const tl = clone(tl0);
  const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'C';
  const n = Math.max(0, ...tl.tracks.filter((t) => t.id.startsWith(prefix)).map((t) => Number(t.id.slice(1)) || 0)) + 1;
  const id = `${prefix}${n}`;
  const track: TimelineTrack = { id, kind, name: kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Subtitles', clips: [] };
  // video tracks stack above (V2 over V1), audio and captions below; a new sound track goes above the subtitles,
  // which stay at the bottom (a captions track is never moved or jumped over)
  const caps = tl.tracks.findIndex((t) => t.kind === 'captions');
  if (kind === 'video') tl.tracks.unshift(track);
  else if (kind === 'audio' && caps >= 0) tl.tracks.splice(caps, 0, track);
  else tl.tracks.push(track);
  return { tl, note: `added track ${id}` };
}

// ---- whole tracks (the user, 13 Nov: "delete if I right-click on the left-hand side of the track timeline …
// delete, move up, and move down, kind of the basics that you have in DaVinci"). A track's id never changes:
// clips, the paste marks, solo and the render refer to it. Which picture covers which goes by the number in the
// id (V2 over V1), so moving a picture track moves only its row.

/** The film's main picture track and its dialogue track (V1, else the first video track; A1, else the first
 *  audio track): never deleted, and never moved so that another track would take their place. */
export function mainTrackIds(tl: Timeline): Set<string> {
  const v = tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video');
  const a = tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio');
  return new Set([v?.id, a?.id].filter((x): x is string => !!x));
}

const trackLabel = (t: TimelineTrack) => `${t.id} ${t.name}`;
const clipCount = (n: number) => `${n} clip${n === 1 ? '' : 's'}`;

/** Why a track cannot be deleted (a few words), or undefined when it can. */
export function whyNotDeleteTrack(tl: Timeline, id: string): string | undefined {
  const t = tl.tracks.find((x) => x.id === id);
  if (!t) return 'not in this cut';
  if (mainTrackIds(tl).has(id)) return t.kind === 'video' ? 'the main picture' : 'the dialogue track';
  if (t.locked) return 'locked';
  return undefined;
}

/** Remove a track and every clip on it. Nothing on the other tracks moves. */
export function deleteTrack(tl0: Timeline, id: string): Edit | undefined {
  if (whyNotDeleteTrack(tl0, id)) return undefined;
  const tl = clone(tl0);
  const t = tl.tracks.find((x) => x.id === id)!;
  tl.tracks = tl.tracks.filter((x) => x.id !== id);
  return { tl, note: t.clips.length ? `deleted track ${trackLabel(t)} (${clipCount(t.clips.length)})` : `deleted empty track ${trackLabel(t)}` };
}

/** The tracks "Delete empty tracks" would remove: no clips, not the main picture or dialogue, not locked. */
export function emptyTracks(tl: Timeline): TimelineTrack[] {
  const keep = mainTrackIds(tl);
  return tl.tracks.filter((t) => !t.clips.length && !keep.has(t.id) && !t.locked);
}

export function deleteEmptyTracks(tl0: Timeline): Edit | undefined {
  const gone = emptyTracks(tl0);
  if (!gone.length) return undefined;
  const ids = new Set(gone.map((t) => t.id));
  const tl = clone(tl0);
  tl.tracks = tl.tracks.filter((t) => !ids.has(t.id));
  return { tl, note: gone.length === 1 ? `deleted empty track ${trackLabel(gone[0])}` : `deleted ${gone.length} empty tracks: ${gone.map(trackLabel).join(', ')}` };
}

/** Why a track cannot move one row up (-1) or down (1), or undefined when it can. It changes place only with
 *  the next track of its own kind; a captions track stays where it is and is never jumped over. */
export function whyNotMoveTrack(tl: Timeline, id: string, dir: -1 | 1): string | undefined {
  const i = tl.tracks.findIndex((x) => x.id === id);
  if (i < 0) return 'not in this cut';
  const t = tl.tracks[i];
  if (t.kind === 'captions') return 'captions stay put';
  const n = tl.tracks[i + dir];
  const kind = t.kind === 'video' ? 'picture' : 'sound';
  if (!n || (n.kind !== t.kind && n.kind !== 'captions')) return `${dir < 0 ? 'top' : 'bottom'} of the ${kind} tracks`;
  if (n.kind === 'captions') return `captions ${dir < 0 ? 'above' : 'below'}`;
  // without a V1 (or an A1) the first track of the kind is the main one: a move must not hand that over
  const before = [...mainTrackIds(tl)].join();
  const tracks = [...tl.tracks];
  [tracks[i], tracks[i + dir]] = [tracks[i + dir], tracks[i]];
  if ([...mainTrackIds({ ...tl, tracks })].join() !== before) return `the main ${kind} stays first`;
  return undefined;
}

/** Swap a track with its neighbour of the same kind. Only the rows change place: ids, clips and what covers
 *  what stay as they were. */
export function moveTrack(tl0: Timeline, id: string, dir: -1 | 1): Edit | undefined {
  if (whyNotMoveTrack(tl0, id, dir)) return undefined;
  const tl = clone(tl0);
  const i = tl.tracks.findIndex((x) => x.id === id);
  const t = tl.tracks[i];
  [tl.tracks[i], tl.tracks[i + dir]] = [tl.tracks[i + dir], tl.tracks[i]];
  return { tl, note: `moved track ${trackLabel(t)} ${dir < 0 ? 'up' : 'down'}` };
}

/** A new name for a track; its id stays. Undefined for an empty name or the same one. */
export function renameTrack(tl0: Timeline, id: string, name: string): Edit | undefined {
  const t0 = tl0.tracks.find((x) => x.id === id);
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!t0 || !n || n === t0.name) return undefined;
  const tl = clone(tl0);
  tl.tracks.find((x) => x.id === id)!.name = n;
  return { tl, note: `renamed track ${id}: ${t0.name} → ${n}` };
}

export function addMarker(tl0: Timeline, f: number, text: string): Edit {
  const tl = clone(tl0);
  tl.markers.push({ at: toS(f, tl.fps), text, by: 'user' });
  tl.markers.sort((a, b) => a.at - b.at);
  return { tl, note: `marker at ${f} f: ${text}` };
}

/** Every cut point (clip edges on every track) except the clips being dragged, for snapping. */
export function cutPoints(tl: Timeline, except: Set<string>): number[] {
  const pts = new Set<number>([0]);
  for (const t of tl.tracks) for (const c of t.clips) {
    if (except.has(c.id)) continue;
    pts.add(startF(c, tl.fps));
    pts.add(endF(c, tl.fps));
  }
  return [...pts];
}

/** The nearest snap for a set of moving edges: the delta correction, when one lands within `tol` frames. */
export function snapDelta(edges: number[], points: number[], tol: number): number | undefined {
  let best: number | undefined;
  for (const e of edges) for (const p of points) {
    const d = p - e;
    if (Math.abs(d) <= tol && (best === undefined || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/** What plays at frame f: the clip of the top video track that is not muted (solo respected). */
export function pictureAt(tl: Timeline, f: number): { track: TimelineTrack; clip: TimelineClip } | undefined {
  const fps = tl.fps;
  const solo = tl.tracks.some((t) => t.kind === 'video' && t.solo);
  // as the render does it: a clip on a higher picture track covers the ones under it
  const num = (t: TimelineTrack) => Number(/\d+/.exec(t.id)?.[0] ?? 0);
  for (const t of tl.tracks.filter((x) => x.kind === 'video').sort((a, b) => num(b) - num(a))) {
    if (t.muted || (solo && !t.solo)) continue;
    const c = t.clips.find((x) => !x.muted && startF(x, fps) <= f && endF(x, fps) > f);
    if (c) return { track: t, clip: c };
  }
  return undefined;
}

/** The picture as a list of stretches (what the two-video fallback plays), gaps left out. */
export function pictureSegments(tl: Timeline): { from: number; to: number; clip: TimelineClip }[] {
  const fps = tl.fps;
  const edges = new Set<number>();
  for (const t of tl.tracks) if (t.kind === 'video') for (const c of t.clips) { edges.add(startF(c, fps)); edges.add(endF(c, fps)); }
  const pts = [...edges].sort((a, b) => a - b);
  const segs: { from: number; to: number; clip: TimelineClip }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pictureAt(tl, pts[i]);
    if (!p) continue;
    const last = segs[segs.length - 1];
    if (last && last.clip.id === p.clip.id && last.to === pts[i]) last.to = pts[i + 1];
    else segs.push({ from: pts[i], to: pts[i + 1], clip: p.clip });
  }
  return segs;
}

/** Whether two timelines hold the same edit (tracks and markers), for restore and undo. */
export function sameEdit(a: Timeline, b: Timeline): boolean {
  return JSON.stringify([a.tracks, a.markers]) === JSON.stringify([b.tracks, b.markers]);
}
