// The film in shots (13 Nov 2026, ASKS 16). A take is one generation with hard cuts inside it; the server
// finds them (src/server/edit/shots.ts). Here: the timeline with its picture and dialogue clips split at
// those cuts, the scenes it runs through, and the edit that puts one take's shot in another's place.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { deleteClips, endF, lenF, refuse, speedOf, startF, toF, type Edit } from './model';
import { followFilm, rippleChange } from './subs';

export interface TakeShots {
  src: string; scene: string; name: string; group?: string;
  seconds?: number; cuts?: number[];
  /** The scene's number of each shot (server/edit/shots.ts, ASKS 60: a pick-up that redoes shot 5 is `[5]`); absent: 1, 2, 3 …. */
  ids?: number[];
  /** 'making': a variation being made (ASKS 51); `src` is then its folder and it has no shots yet. */
  state: 'ready' | 'waiting' | 'failed' | 'making';
  /** The take is a variation of another (its folder's `variation.json`, server/edit/shots.ts). */
  variation?: { from: string; note: string; startedAt: string; failed?: string };
}
/** A shot of a take. `n`: the scene's shot it is, the number the page shows and its column in the Takes view (a pick-up
 *  that redoes shot 5 has one shot, `n` 5); `i`: its place in the take, 1, 2, 3 …. Nothing stored in a cut keeps
 *  either: a clip is its take's file and its in and out points, and its shot is found from them each time. */
export interface Shot { n: number; i: number; in: number; out: number }
export type BySrc = Map<string, TakeShots>;

const toS = (f: number, fps: number) => Math.round((f / fps) * 1e6) / 1e6;
const r6 = (s: number) => Math.round(s * 1e6) / 1e6;
const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;

export function shotsOf(t?: TakeShots): Shot[] {
  if (!t || !t.cuts || !t.seconds) return [];
  const b = [0, ...t.cuts, t.seconds];
  const ids = t.ids && t.ids.length === b.length - 1 ? t.ids : undefined;
  return b.slice(0, -1).map((s, i) => ({ n: ids?.[i] ?? i + 1, i: i + 1, in: s, out: b[i + 1] }));
}

/** The shot numbers a generation's shots file gives, in its order: `{shots: [{id: "5"}, …]}` (or the list alone), each a
 *  whole number above the one before. Undefined when there is no file or an id is not such a number ("2a", a repeat). */
export function readShotIds(v: unknown): number[] | undefined {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? (v as { shots?: unknown }).shots : undefined;
  if (!Array.isArray(list) || !list.length) return undefined;
  const ids: number[] = [];
  for (const x of list) {
    const raw = x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || (ids.length && n <= ids[ids.length - 1])) return undefined;
    ids.push(n);
  }
  return ids;
}

/** The ids a take carries: the file's, when they are as many as the take's shots and not 1, 2, 3 … already. */
export function idsFor(file: number[] | undefined, cuts: number[] | undefined): number[] | undefined {
  if (!file || !cuts || file.length !== cuts.length + 1) return undefined;
  return file.every((n, i) => n === i + 1) ? undefined : file;
}

/** The take's shot that is the scene's shot `n`. */
export const shotOf = (t: TakeShots | undefined, n: number): Shot | undefined => shotsOf(t).find((s) => s.n === n);

/** The shot of its take a clip shows: the one its middle falls in. */
export function shotNo(c: TimelineClip, by: BySrc): number | undefined {
  // a planned shot or a board (the timeline from day one) knows its own number
  if (c.plan === 'shot' || c.plan === 'board') return c.shot;
  if (c.plan) return undefined;
  const shots = shotsOf(by.get((c.src ?? '')));
  if (!shots.length) return undefined;
  const mid = (c.in + c.out) / 2;
  return (shots.find((s) => mid >= s.in && mid < s.out) ?? shots[shots.length - 1]).n;
}
export const sceneOf = (c: TimelineClip, by: BySrc): string | undefined => c.takeRef?.scene ?? c.scene ?? by.get((c.src ?? ''))?.scene;

export function mainTracks(tl: Timeline): { v?: TimelineTrack; a?: TimelineTrack } {
  return {
    v: tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'),
    a: tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio'),
  };
}

const baseLabel = (c: TimelineClip) => (c.takeRef ? `${c.takeRef.scene} · ${c.takeRef.take}` : (c.label ?? '').replace(/\s*·\s*(shots?\s.*|whole)$/i, ''));

/** The same cut with its picture and dialogue clips split wherever their take cuts to a new shot. Nothing
 *  plays differently; the pieces keep the clip's id (the first) or take "<id>~<n>". The same object comes
 *  back when there is nothing to split. */
export function shotTimeline(tl: Timeline, by: BySrc): Timeline {
  const { v, a } = mainTracks(tl);
  const m = 2 / tl.fps;
  let changed = false;
  // a piece's id must be new in the whole cut: a clip that was split before and has grown across the same cut again
  // (its end dragged, or its join moved) would otherwise give its new piece the id of the piece that is already there
  const used = new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  const fresh = (base: string): string => {
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}.${k}`;
    used.add(id);
    return id;
  };
  const split = (t: TimelineTrack): TimelineClip[] => t.clips.flatMap((c) => {
    const take = by.get((c.src ?? ''));
    if (!take?.cuts || speedOf(c) !== 1) return [c];
    const inner = take.cuts.filter((b) => b > c.in + m && b < c.out - m);
    if (!inner.length) return [c];
    changed = true;
    const bounds = [c.in, ...inner, c.out];
    return bounds.slice(0, -1).map((from, i) => {
      const piece: TimelineClip = { ...c, id: i === 0 ? c.id : fresh(`${c.id}~${i + 1}`), in: r6(from), out: r6(bounds[i + 1]), at: r6(c.at + (from - c.in)) };
      const n = shotNo(piece, by);
      if (n) piece.label = `${baseLabel(c)} · shot ${n}`;
      if (i > 0) { delete piece.fadeIn; delete piece.dissolve; }
      if (i < bounds.length - 2) delete piece.fadeOut;
      return piece;
    });
  });
  const tracks = tl.tracks.map((t) => (t === v || t === a ? { ...t, clips: split(t) } : t));
  return changed ? { ...tl, tracks } : tl;
}

export interface SceneRun { scene?: string; label: string; from: number; to: number; cuts: number[] }
/** The stretches of the picture, scene by scene, in frames; a title card or an insert is a run of its own. */
export function sceneRuns(tl: Timeline, by: BySrc): SceneRun[] {
  const { v, a } = mainTracks(tl);
  const fps = tl.fps;
  const runs: SceneRun[] = [];
  // a scene with only its lines so far (the script is locked, no shot lists yet: the timeline from day one) runs where
  // its lines are; the pauses between two lines are inside the scene
  const pictured = new Set((v?.clips ?? []).map((c) => sceneOf(c, by)).filter(Boolean));
  const lines = (a?.clips ?? []).filter((c) => c.plan === 'line' && c.scene && !pictured.has(c.scene));
  for (const c of [...(v?.clips ?? []), ...lines].filter((x) => !x.muted).sort((x, y) => x.at - y.at)) {
    const scene = sceneOf(c, by);
    const s = startF(c, fps), e = endF(c, fps);
    const last = runs[runs.length - 1];
    // the panels of one shot (each a board of its own) are one shot: no cut between them
    const samePanelShot = c.plan === 'board' && !!c.panel && c.panel.k > 1;
    if (last && scene && last.scene === scene && (s - last.to <= 1 || c.plan === 'line')) { if (c.plan !== 'line' && !samePanelShot) last.cuts.push(s); last.to = Math.max(last.to, e); continue; }
    runs.push({ scene, label: scene ?? (/title card/i.test(c.label ?? '') ? 'Card' : (c.label ?? '').split('·')[0].trim() || 'Clip'), from: s, to: e, cuts: [] });
  }
  return runs;
}

/** The names the cut already gives the takes ("short C · take 1"), spread to the other takes of the same test. */
export function takeNames(takes: TakeShots[], tl?: Timeline): Map<string, string> {
  const fromCut = new Map<string, string>();
  for (const t of tl?.tracks ?? []) if (t.kind === 'video') for (const c of t.clips) if (c.takeRef) fromCut.set((c.src ?? ''), c.takeRef.take);
  const lead = (g: string) => g.replace(/[-_]+/g, ' ').trim();
  // "prompt length C · take 1" is "short C · take 1" in the cut: the cut's word for the test, learnt per scene
  // (a test can mean something else in another scene: the pick-ups are "opening pick-up" in S2 only)
  const alias = new Map<string, string>();
  for (const t of takes) {
    const n = fromCut.get(t.src);
    if (!n || !t.group || !t.name.startsWith(lead(t.group))) continue;
    const rest = t.name.slice(lead(t.group).length);
    if (rest && n.endsWith(rest)) alias.set(`${t.group}/${t.scene}`, n.slice(0, n.length - rest.length).trim());
  }
  const perGroup = new Map<string, Set<string>>();
  for (const [k, v] of alias) { const g = k.split('/')[0]; perGroup.set(g, (perGroup.get(g) ?? new Set()).add(v)); }
  const out = new Map<string, string>();
  for (const t of takes) {
    const all = t.group ? perGroup.get(t.group) : undefined;
    const a = t.group ? alias.get(`${t.group}/${t.scene}`) ?? (all?.size === 1 ? [...all][0] : undefined) : undefined;
    out.set(t.src, fromCut.get(t.src) ?? (a !== undefined && t.group ? `${a}${t.name.slice(lead(t.group).length)}`.trim() : t.name));
  }
  return out;
}

/** Which shots of which takes the picture uses now: "<src>#<n>". */
export function inFilm(tl: Timeline, by: BySrc): Set<string> {
  const out = new Set<string>();
  for (const c of mainTracks(tl).v?.clips ?? []) { const n = shotNo(c, by); if (n && !c.muted) out.add(`${c.src}#${n}`); }
  return out;
}

// ---- shots and scenes out of the film (13 Nov 2026: "the scenes should be disabled, and then it should jump
// from one scene that I had to another scene"). A shot or a whole scene with no clip in the cut is out of the
// film on purpose; the takes grid shows its column switched off and a click on it puts it back.

/** The natural order of scene ids (S2 before S10), for when the film's own list of scenes is not at hand. */
export const sceneOrder = (ids: Iterable<string>): string[] => [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/** The picture clips of a scene (of its shot `n` when given), each a piece of the film: a shot cut in two with
 *  the blade is two clips. Muted clips count: they are in the cut. */
export function shotClips(tl: Timeline, by: BySrc, scene: string, n?: number): TimelineClip[] {
  return (mainTracks(tl).v?.clips ?? []).filter((c) => sceneOf(c, by) === scene && (n === undefined || shotNo(c, by) === n));
}

/** Where a scene with no clip in the cut would be: the end of the nearest earlier scene that is in the film
 *  (of its last clip before the later scenes begin, when it is in pieces), else the start of the film. `order`
 *  is the film's list of scenes; without it, the natural order of the ids. In frames. */
export function sceneAnchor(tl: Timeline, by: BySrc, scene: string, order?: string[]): number {
  const v = mainTracks(tl).v?.clips ?? [];
  const fps = tl.fps;
  const present = new Set(v.map((c) => sceneOf(c, by)).filter((s): s is string => !!s));
  const list = order?.includes(scene) ? order : sceneOrder([...present, scene]);
  const at = list.indexOf(scene);
  // a cut can hold a scene in pieces with others between them (a pick-up placed later): the earlier scene's
  // last clip that ends before the later scenes begin, so the scene lands between the two
  const later = new Set(list.slice(at + 1));
  const next = Math.min(Infinity, ...v.filter((c) => later.has(sceneOf(c, by) ?? '')).map((c) => startF(c, fps)));
  for (let i = at - 1; i >= 0; i--) {
    const ends = v.filter((c) => sceneOf(c, by) === list[i]).map((c) => endF(c, fps));
    if (ends.length) return Math.max(...(ends.some((e) => e <= next) ? ends.filter((e) => e <= next) : ends));
  }
  return 0;
}

/** Take a scene's shot `n` out of the film: its picture (every piece of it) and the sound linked to it go,
 *  and what follows closes up on every track, markers too, as a delete on the picture does. */
export function takeOutShot(tl: Timeline, by: BySrc, scene: string, n: number, takeName?: string): Edit | undefined {
  const { v } = mainTracks(tl);
  const mine = shotClips(tl, by, scene, n);
  if (!v || !mine.length) return undefined;
  const e = deleteClips(tl, mine.map((c) => ({ trackId: v.id, clipId: c.id })), true);
  return e && { tl: e.tl, note: `${scene} shot ${n} taken out of the film${takeName ? ` (${takeName})` : ''}` };
}

/** Take every shot of a scene out of the film, the gaps closing. */
export function takeOutScene(tl: Timeline, by: BySrc, scene: string): Edit | undefined {
  const { v } = mainTracks(tl);
  const mine = shotClips(tl, by, scene);
  if (!v || !mine.length) return undefined;
  const e = deleteClips(tl, mine.map((c) => ({ trackId: v.id, clipId: c.id })), true);
  const shots = new Set(mine.map((c) => { const k = shotNo(c, by); return k ? `${c.src}#${k}` : c.id; })).size;
  return e && { tl: e.tl, note: `${scene} taken out of the film (${shots} ${shots === 1 ? 'shot' : 'shots'})` };
}

let seq = 0;
/** Put shot `n` of `take` where the scene's shot `n` sits now (or, when the cut has none, after the scene's
 *  earlier shots, else before its later ones; a scene with no clip in the cut at all goes where `sceneAnchor`
 *  puts it). The picture and its sound go in together; when the lengths differ everything after moves by the
 *  difference, on every track, markers too. */
export function putShot(tl0: Timeline, scene: string, n: number, take: TakeShots, takeName: string, by: BySrc, id?: string, order?: string[]): (Edit & { clipId: string; at: number; frames: number }) | undefined {
  const shot = shotOf(take, n);
  const tl = clone(tl0);
  const { v, a } = mainTracks(tl);
  if (!shot || !v) return undefined;
  const fps = tl.fps;
  const mine = v.clips.filter((c) => sceneOf(c, by) === scene);
  const slot = mine.filter((c) => shotNo(c, by) === n);
  let at: number, oldLen: number;
  if (slot.length) {
    at = Math.min(...slot.map((c) => startF(c, fps)));
    oldLen = Math.max(...slot.map((c) => endF(c, fps))) - at;
  } else {
    const before = mine.filter((c) => (shotNo(c, by) ?? 0) < n);
    at = before.length ? Math.max(...before.map((c) => endF(c, fps))) : mine.length ? Math.min(...mine.map((c) => startF(c, fps))) : sceneAnchor(tl, by, scene, order);
    oldLen = 0;
  }
  const newLen = Math.max(1, toF(shot.out - shot.in, fps));
  const gone = new Set(slot.map((c) => c.id));
  const was = slot[0];
  if (was && slot.length === 1 && was.src === take.src && toF(was.in, fps) === toF(shot.in, fps) && lenF(was, fps) === newLen) return undefined;
  if (a) a.clips = a.clips.filter((c) => !slot.some((s) => s.src === c.src && startF(s, fps) === startF(c, fps) && toF(s.in, fps) === toF(c.in, fps)));
  v.clips = v.clips.filter((c) => !gone.has(c.id));
  const d = newLen - oldLen;
  // a locked track is never changed (14 Nov): not the picture or its sound, nor one whose clips after the shot would
  // be left behind while the rest moves by the difference
  const lock = v.locked ? v : a?.locked ? a : d ? tl0.tracks.find((t) => t.locked && t.clips.some((c) => startF(c, fps) >= at + oldLen)) : undefined;
  if (lock) {
    const why = lock === v || lock === a ? `${lock.id} ${lock.name} is locked: unlock it to change this shot.`
      : `${lock.id} ${lock.name} is locked and has clips after this shot: they would stay where they are while everything else moves, out of step with the picture. Unlock it first.`;
    return refuse(why);
  }
  if (d) {
    // subtitle lines follow the film (subs.ts): over a shot that got shorter they go or are shortened
    for (const t of tl.tracks) if (t.kind === 'captions' && !t.locked) followFilm(t, rippleChange(at + oldLen, d), fps);
    for (const t of tl.tracks) if (t.kind !== 'captions') for (const c of t.clips) if (startF(c, fps) >= at + oldLen) c.at = toS(Math.max(0, startF(c, fps) + d), fps);
    for (const mk of tl.markers) if (toF(mk.at, fps) >= at + oldLen) mk.at = toS(toF(mk.at, fps) + d, fps);
  }
  const clipId = id ?? `c${Date.now().toString(36)}${(seq++).toString(36)}`;
  const clip: TimelineClip = { id: clipId, src: take.src, in: r6(shot.in), out: r6(shot.out), at: toS(at, fps), label: `${scene} · ${takeName} · shot ${n}`, takeRef: { scene, take: takeName } };
  v.clips.push(clip);
  v.clips.sort((x, y) => x.at - y.at);
  if (a) { a.clips.push({ ...clip, id: `${clipId}a` }); a.clips.sort((x, y) => x.at - y.at); }
  const wasName = was?.takeRef?.take;
  const diff = d ? `, ${Math.abs(d)} f ${d > 0 ? 'longer' : 'shorter'}` : '';
  return { tl, clipId, at, frames: newLen, note: `${scene} shot ${n}: ${takeName}${wasName && wasName !== takeName ? ` in place of ${wasName}` : slot.length ? '' : ' added'}${diff}` };
}

// ---- several shots of other takes selected at once (ASKS 52, 14 Nov 2026: "select multiple takes to taste check the
// full video with them")

/** A shot of a take, chosen in the Takes view: scene, shot number, the take's file. */
export interface Pick { scene: string; n: number; src: string }

/** "S2 shot 2, S5 shots 1 and 3, S7 shot 3": the shots by scene, in the film's order of scenes. */
export function picksWords(picks: { scene: string; n: number }[], order?: string[]): string {
  const scenes = sceneOrder(picks.map((p) => p.scene));
  const list = order ? [...scenes].sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9) || a.localeCompare(b, undefined, { numeric: true })) : scenes;
  const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return list.map((sc) => {
    const ns = [...new Set(picks.filter((p) => p.scene === sc).map((p) => p.n))].sort((a, b) => a - b);
    return `${sc} ${ns.length === 1 ? 'shot' : 'shots'} ${and(ns.map(String))}`;
  }).join(', ');
}

/** The cut with every chosen shot in its place (putShot, one after the other; a shot that is the film's own already
 *  changes nothing and is left out). `idBase` names the clips put in (`<idBase>0`, `<idBase>1`… and their sounds with
 *  "a"), for a cut that is only shown; without it they get fresh ids. The note: putShot's own for one shot, else
 *  "4 shots from other takes put in the film: S2 shot 2, S5 shots 1 and 3, S7 shot 3". Undefined when nothing changes
 *  or a lock refuses one of them. */
export function withPicks(tl: Timeline, picks: Pick[], by: BySrc, names: Map<string, string>, idBase?: string, order?: string[]): (Edit & { ids: string[]; placed: (Pick & { clipId: string; at: number; frames: number })[] }) | undefined {
  let cur = tl;
  const ids: string[] = [];
  const placed: (Pick & { clipId: string; at: number; frames: number })[] = [];
  let note = '';
  picks.forEach((p, i) => {
    const take = by.get(p.src);
    if (!take) return;
    const e = putShot(cur, p.scene, p.n, take, names.get(p.src) ?? take.name, by, idBase !== undefined ? `${idBase}${i}` : undefined, order);
    if (!e) return;
    cur = e.tl; ids.push(e.clipId); note = e.note;
    placed.push({ ...p, clipId: e.clipId, at: e.at, frames: e.frames });
  });
  if (!placed.length) return undefined;
  // a later shot moved the earlier ones' places: read them from the cut as it ends up
  const v = mainTracks(cur).v;
  for (const x of placed) { const c = v?.clips.find((k) => k.id === x.clipId); if (c) x.at = startF(c, cur.fps); }
  if (placed.length > 1) note = `${placed.length} shots from other takes put in the film: ${picksWords(placed, order)}`;
  return { tl: cur, note, ids, placed };
}
