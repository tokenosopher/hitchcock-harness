// The film in shots (13 Nov 2026, ASKS 16). A take is one generation with hard cuts inside it; the server
// finds them (src/server/edit/shots.ts). Here: the timeline with its picture and dialogue clips split at
// those cuts, the scenes it runs through, and the edit that puts one take's shot in another's place.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { deleteClips, endF, lenF, refuse, speedOf, startF, toF, type ClipFrames, type Edit } from './model';
import { followFilm, isLine, rippleChange } from './subs';
import { parseShotId } from './shotCols';

export interface TakeShots {
  src: string; scene: string; name: string; group?: string;
  seconds?: number; cuts?: number[];
  /** The scene's number of each shot (server/edit/shots.ts: a pick-up that redoes shot 5 is `[5]`); absent: 1, 2, 3 ….
   *  Two shots can share one when `tags` names them apart ("7a", "7b"). */
  ids?: number[];
  /** Each shot's own id as its shots file writes it ("1", "7a", "7b"), when one of them has a letter (shotCols.ts). */
  tags?: string[];
  /** 'making': a variation being made (ASKS 51); `src` is then its folder and it has no shots yet. */
  state: 'ready' | 'waiting' | 'failed' | 'making';
  /** The take is a variation of another (its folder's `variation.json`, server/edit/shots.ts). */
  variation?: { from: string; note: string; startedAt: string; failed?: string; copyOf?: string };
  /** When the take's file landed (its modification time, ms): what tells a take newer than the one in the cut. */
  made?: number;
}
/** A shot of a take. `n`: the scene's shot it is, the number the page shows and its column in the Takes view (a pick-up
 *  that redoes shot 5 has one shot, `n` 5); `i`: its place in the take, 1, 2, 3 …; `tag`: its own id when its take's
 *  shots file gives one with a letter ("7a" and "7b" are both `n` 7). Nothing stored in a cut keeps any of
 *  them: a clip is its take's file and its in and out points, and its shot is found from them each time. */
export interface Shot { n: number; i: number; in: number; out: number; tag?: string }
export type BySrc = Map<string, TakeShots>;

const toS = (f: number, fps: number) => Math.round((f / fps) * 1e6) / 1e6;
const r6 = (s: number) => Math.round(s * 1e6) / 1e6;
const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;

/** A shot boundary on the cut's frame grid: the found cuts are times in the take's own frames
 *  (a MAGI-2 take is 25 fps, the cut 24), so the join of two shots is put on the nearest whole frame of the cut. Nearest,
 *  because that is where the render shows the new shot: its fps filter gives each frame of the cut the source frame
 *  nearest in time (S2's cut at 17.6 s first shows at frame 422 = 17.583 s, not 423). The end of a shot and the start
 *  of the next are the same number, so they always meet. The one rule for every shot boundary on the timeline. */
export const shotEdge = (sec: number, fps: number): number => toS(toF(sec, fps), fps);

/** A take's cuts and length on the cut's frame grid (shotEdge): what the server hands the page, and what the page uses
 *  again before it splits a clip, so a cut read before this rule, or a hand-written cuts.json, is put on the grid too.
 *  Cuts that fall on one frame, or on the take's first or last frame, count once or not at all. */
export function onGrid(t: TakeShots, fps: number): TakeShots {
  if (!t.cuts || !(fps > 0)) return t;
  const seconds = t.seconds !== undefined ? shotEdge(t.seconds, fps) : undefined;
  const cuts = [...new Set(t.cuts.map((c) => shotEdge(c, fps)))].filter((c) => c > 0 && (seconds === undefined || c < seconds)).sort((x, y) => x - y);
  // the ids and tags name the shots in order: when two cuts fell on one frame they no longer fit, and are dropped
  const fits = cuts.length === t.cuts.length;
  const { ids, tags, ...rest } = t;
  return { ...rest, cuts, ...(seconds !== undefined ? { seconds } : {}), ...(fits && ids ? { ids } : {}), ...(fits && tags ? { tags } : {}) };
}

export function shotsOf(t?: TakeShots, fps?: number): Shot[] {
  if (t && fps) t = onGrid(t, fps);
  if (!t || !t.cuts || !t.seconds) return [];
  const b = [0, ...t.cuts, t.seconds];
  let ids = t.ids && t.ids.length === b.length - 1 && t.ids.every((n) => Number.isInteger(n) && n >= 1) ? t.ids : undefined;
  // a tag a shot: as many as the shots, each its own and of the shot's number; else none
  const tags = ids && t.tags && t.tags.length === ids.length && new Set(t.tags).size === ids.length && t.tags.every((x, i) => parseShotId(x)?.n === ids![i]) ? t.tags : undefined;
  // two shots of one number with nothing to tell them apart: the take as before, left to right
  if (ids && !tags && new Set(ids).size !== ids.length) ids = undefined;
  return b.slice(0, -1).map((s, i) => ({ n: ids?.[i] ?? i + 1, i: i + 1, in: s, out: b[i + 1], ...(ids && tags ? { tag: tags[i] } : {}) }));
}

/** A shot's id when it has a letter ("7a"), else undefined: what tells two shots of one column apart. */
export const subTag = (s: Shot): string | undefined => (s.tag && s.tag !== String(s.n) ? s.tag : undefined);
/** A shot of a take as the Takes view and the cut's marks name it: "<src>#<n>", or "<src>#7a" for a shot with a letter. */
export const shotKey = (src: string, s: Shot): string => `${src}#${subTag(s) ?? s.n}`;

/** The shot numbers a generation's shots file gives, in its order: `{shots: [{id: "5"}, …]}` (or the list alone), each a
 *  whole number above the one before. Undefined when there is no file or an id is not such a number ("2a", a repeat).
 *  (The server reads ids with letters too: shotCols.ts readShotTags, shotTagsFor.) */
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

/** The take's shot that is the scene's shot `n`; with `tag` ("7b"), the one of that id among the shots of `n`. */
export const shotOf = (t: TakeShots | undefined, n: number, tag?: string, fps?: number): Shot | undefined =>
  shotsOf(t, fps).find((s) => s.n === n && (tag === undefined || subTag(s) === tag || (!subTag(s) && tag === String(n))));

/** The shot of the scene a clip fills: a planned shot's or a board's own number; a take's shot swapped into another
 *  place of its scene's layout (`layout` and `shot` set), that place; else the shot of its take its middle
 *  falls in (`ownShot`). */
export function shotNo(c: TimelineClip, by: BySrc): number | undefined {
  // a planned shot or a board (the timeline from day one) knows its own number
  if (c.plan === 'shot' || c.plan === 'board') return c.shot;
  if (c.plan) return undefined;
  if (c.layout !== undefined && c.shot !== undefined) return c.shot;
  return ownShot(c, by);
}
/** The shot of its take a clip shows: the one its middle falls in, wherever the clip was put. */
export function ownShotOf(c: TimelineClip, by: BySrc): Shot | undefined {
  if (c.plan) return undefined;
  const shots = shotsOf(by.get((c.src ?? '')));
  if (!shots.length) return undefined;
  const mid = (c.in + c.out) / 2;
  return shots.find((s) => mid >= s.in && mid < s.out) ?? shots[shots.length - 1];
}
/** The scene's number of the shot of its take a clip shows (ownShotOf). */
export const ownShot = (c: TimelineClip, by: BySrc): number | undefined => ownShotOf(c, by)?.n;
export const sceneOf = (c: TimelineClip, by: BySrc): string | undefined => c.takeRef?.scene ?? c.scene ?? by.get((c.src ?? ''))?.scene;

export function mainTracks(tl: Timeline): { v?: TimelineTrack; a?: TimelineTrack } {
  return {
    v: tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'),
    a: tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio'),
  };
}

/** The shot a clip's label names, as putShot and the split below name one ("S4 · take 1 · shot 3", "… · shot 3 (to
 *  confirm)", "… · shot 7b"): "3", "7b". Undefined for a whole take ("S4 · take 1") or a run of shots. */
export function labelShot(c: TimelineClip): string | undefined {
  const m = /·\s*shot\s+(\d+[a-z]?)\s*(?:\(|$)/i.exec(c.label ?? '');
  return m ? parseShotId(m[1])?.tag : undefined;
}

/** The shots of its take a clip shows any frame of. The two frames of slack the split allows (a rounded in or out), and
 *  never more than half the clip: a clip of a frame or two still shows the shot it sits in. */
function touched(c: TimelineClip, shots: Shot[], fps: number): Shot[] {
  const m = Math.min(2 / fps, Math.max(0, (c.out - c.in) / 2 - 1e-6));
  return shots.filter((s) => s.out > c.in + m && s.in < c.out - m);
}

/** A clip that is one shot by its name and shows no other shot whole, only some frames of the shot before or after it:
 *  a shot extended past its own frames before trims stopped there. It stays the one clip it is, shown
 *  and edited whole, and is never cut in pieces (the cut is the user's: nothing rewrites it). Its shot, or undefined. */
function namedShot(c: TimelineClip, shots: Shot[], fps: number): Shot | undefined {
  const n = labelShot(c);
  if (n === undefined) return undefined;
  const t = touched(c, shots, fps);
  const own = t.find((s) => (subTag(s) ?? String(s.n)) === n);
  const h = 0.5 / fps;
  return own && t.every((s) => s === own || s.in < c.in - h || s.out > c.out + h) ? own : undefined;
}

/** What a clip may use of its file, for a trim, a moved join or an edge trimmed alone (model.ts ClipFrames): the file's
 *  length and, for a clip of a take cut into shots, its own shot's frames, the one it shows (or the one it is named
 *  for, when it was already extended past them). A clip left whole over several shots (one played at another speed is
 *  not cut at its shots) may use the run of shots it spans. A file with one shot, or none known, has its own ends. */
export function clipFrames(c: TimelineClip, by: BySrc, seconds: number | undefined, fps: number): ClipFrames {
  if (c.plan || isLine(c)) return seconds;
  const shots = shotsOf(by.get((c.src ?? '')), fps);
  if (shots.length < 2) return seconds;
  const own = namedShot(c, shots, fps);
  const t = own ? [own] : touched(c, shots, fps);
  if (!t.length) return seconds;
  const a = t[0], b = t[t.length - 1];
  return { seconds, shot: { from: a.in, to: b.out, first: a.n, last: b.n } };
}

const baseLabel = (c: TimelineClip) => (c.takeRef ? `${c.takeRef.scene} · ${c.takeRef.take}` : (c.label ?? '').replace(/\s*·\s*(shots?\s.*|whole)$/i, ''));

/** The same cut with its picture and dialogue clips split wherever their take cuts to a new shot. Nothing
 *  plays differently; the pieces keep the clip's id (the first) or take "<id>~<n>". The same object comes
 *  back when there is nothing to split. */
export function shotTimeline(tl: Timeline, by: BySrc): Timeline {
  const { v, a } = mainTracks(tl);
  const fps = tl.fps;
  const m = 2 / fps;
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
  // a picture and its sound kept by `link`, split at the same cuts: piece n of each gets the same new link
  // (the first pieces keep the old one), never one another clip has
  const usedLinks = new Set(tl.tracks.flatMap((t) => t.clips.flatMap((c) => (c.link ? [c.link] : []))));
  const links = new Map<string, string>();
  const linkFor = (link: string, i: number): string => {
    const k = `${link}|${i}`;
    let l = links.get(k);
    if (!l) {
      l = `${link}~${i + 1}`;
      for (let n = 2; usedLinks.has(l); n++) l = `${link}~${i + 1}.${n}`;
      usedLinks.add(l); links.set(k, l);
    }
    return l;
  };
  const split = (t: TimelineTrack): TimelineClip[] => t.clips.flatMap((c) => {
    const raw = by.get((c.src ?? ''));
    if (!raw?.cuts || speedOf(c) !== 1) return [c];
    // the cuts on the cut's frame grid (shotEdge): each piece ends on the frame the next one starts on
    const take = onGrid(raw, fps);
    // already one shot (its name says which), only run on past its own frames: kept whole
    if (namedShot(c, shotsOf(take), fps)) return [c];
    const inner = take.cuts!.filter((b) => b > c.in + m && b < c.out - m);
    if (!inner.length) return [c];
    changed = true;
    const bounds = [c.in, ...inner, c.out];
    // where each piece starts on the timeline, in whole frames from the clip's own start: the same number is the end
    // of the piece before, so no hole and no overlap is ever drawn or played between two shots of one take
    const s0 = startF(c, fps);
    const startAt = (i: number) => (i === 0 ? c.at : toS(s0 + toF(bounds[i] - c.in, fps), fps));
    return bounds.slice(0, -1).map((from, i) => {
      const piece: TimelineClip = { ...c, id: i === 0 ? c.id : fresh(`${c.id}~${i + 1}`), in: r6(from), out: r6(bounds[i + 1]), at: startAt(i) };
      const n = shotNo(piece, by);
      // a shot with a letter is named by it ("shot 7b"), as Alma names it
      const own = n ? ownShotOf(piece, by) : undefined;
      if (n) piece.label = `${baseLabel(c)} · shot ${own && own.n === n ? subTag(own) ?? n : n}`;
      if (i > 0) { delete piece.fadeIn; delete piece.fadeInFrom; delete piece.dissolve; if (c.link) piece.link = linkFor(c.link, i); }
      if (i < bounds.length - 2) { delete piece.fadeOut; delete piece.fadeOutTo; }
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

/** Which shots of which takes the picture uses now: "<src>#<n>" (shotKey: "<src>#7a" for a shot with a letter). */
export function inFilm(tl: Timeline, by: BySrc): Set<string> {
  const out = new Set<string>();
  for (const c of mainTracks(tl).v?.clips ?? []) { const s = ownShotOf(c, by); if (s && !c.muted) out.add(shotKey(c.src ?? '', s)); }
  return out;
}
/** The letter id of the shot of its take a clip shows ("7a"), or undefined (an ordinary shot, or no shots known). */
export const clipTag = (c: TimelineClip, by: BySrc): string | undefined => { const s = ownShotOf(c, by); return s ? subTag(s) : undefined; };
/** The picture clips of a scene's shot `n` that show a shot with the letter `tag` ("7a"), of any take: the place in the
 *  film a shot of that id fills. Empty for no tag. */
const sameTag = (clips: TimelineClip[], by: BySrc, tag: string | undefined): TimelineClip[] => (tag ? clips.filter((c) => clipTag(c, by) === tag) : []);

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
 *  and what follows closes up on every track, markers too, as a delete on the picture does. With `tag` ("7b"), only
 *  the pieces that show a shot of that id: the shot of the column it shares with another goes alone. */
export function takeOutShot(tl: Timeline, by: BySrc, scene: string, n: number, takeName?: string, tag?: string): Edit | undefined {
  const { v } = mainTracks(tl);
  const all = shotClips(tl, by, scene, n);
  const mine = tag ? sameTag(all, by, tag) : all;
  if (!v || !mine.length) return undefined;
  const e = deleteClips(tl, mine.map((c) => ({ trackId: v.id, clipId: c.id })), true);
  return e && { tl: e.tl, note: `${scene} shot ${tag ?? n} taken out of the film${takeName ? ` (${takeName})` : ''}` };
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
 *  difference, on every track, markers too. `tag` ("7b"): the take's shot of that id among its shots of `n`; it takes
 *  the place of the shot of the same id when the film has one there, else of the whole shot `n`. */
export function putShot(tl0: Timeline, scene: string, n: number, take: TakeShots, takeName: string, by: BySrc, id?: string, order?: string[], into?: { to: number; layout: number }, tag?: string): (Edit & { clipId: string; at: number; frames: number }) | undefined {
  // the shot's in and out on the cut's frame grid (shotEdge), so it meets the shots beside it in its take exactly
  const shot = shotOf(take, n, tag, tl0.fps);
  const tl = clone(tl0);
  const { v, a } = mainTracks(tl);
  if (!shot || !v) return undefined;
  const fps = tl.fps;
  // the place: the scene's shot `n`, or (a shot of another layout's take, or put in another place) `into.to`
  const to = into?.to ?? n;
  const mine = v.clips.filter((c) => sceneOf(c, by) === scene);
  const whole = mine.filter((c) => shotNo(c, by) === to);
  const same = into ? [] : sameTag(whole, by, subTag(shot));
  const slot = same.length ? same : whole;
  let at: number, oldLen: number;
  if (slot.length) {
    at = Math.min(...slot.map((c) => startF(c, fps)));
    oldLen = Math.max(...slot.map((c) => endF(c, fps))) - at;
  } else {
    const before = mine.filter((c) => (shotNo(c, by) ?? 0) < to);
    at = before.length ? Math.max(...before.map((c) => endF(c, fps))) : mine.length ? Math.min(...mine.map((c) => startF(c, fps))) : sceneAnchor(tl, by, scene, order);
    oldLen = 0;
  }
  const newLen = Math.max(1, toF(shot.out - shot.in, fps));
  const gone = new Set(slot.map((c) => c.id));
  const was = slot[0];
  if (was && slot.length === 1 && was.src === take.src && toF(was.in, fps) === toF(shot.in, fps) && lenF(was, fps) === newLen) return undefined;
  if (a) a.clips = a.clips.filter((c) => !slot.some((s) => s.src === c.src && startF(s, fps) === startF(c, fps) && toF(s.in, fps) === toF(c.in, fps)));
  // a planned place (its boards, or a planned shot): the planned lines under it give way to the shot's own sound; a line
  // that runs on past the place keeps the part outside it (a shot of a take put among a layout's boards)
  if (a && slot.some((c) => c.plan)) {
    const s0 = at, s1 = at + oldLen;
    a.clips = a.clips.flatMap((c) => {
      if (c.plan !== 'line' || c.scene !== scene) return [c];
      const c0 = startF(c, fps), c1 = endF(c, fps);
      if (c1 <= s0 || c0 >= s1) return [c];
      const keep: TimelineClip[] = [];
      if (c0 < s0) keep.push({ ...c, out: r6(c.in + (s0 - c0) / fps) });
      if (c1 > s1) keep.push({ ...c, id: `${c.id}~r`, at: toS(s1, fps), in: 0, out: r6((c1 - s1) / fps) });
      return keep;
    });
  }
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
  const name = subTag(shot) ?? String(n);
  const clip: TimelineClip = { id: clipId, src: take.src, in: r6(shot.in), out: r6(shot.out), at: toS(at, fps), label: `${scene} · ${takeName} · shot ${name}`, takeRef: { scene, take: takeName },
    ...(into ? { shot: to, layout: into.layout } : {}) };
  v.clips.push(clip);
  v.clips.sort((x, y) => x.at - y.at);
  if (a) { a.clips.push({ ...clip, id: `${clipId}a` }); a.clips.sort((x, y) => x.at - y.at); }
  const wasName = was?.takeRef?.take;
  const diff = d ? `, ${Math.abs(d)} f ${d > 0 ? 'longer' : 'shorter'}` : '';
  const moved = to !== n ? `${scene} shot ${to}: ${takeName} shot ${name}` : `${scene} shot ${name}: ${takeName}`;
  return { tl, clipId, at, frames: newLen, note: `${moved}${wasName && wasName !== takeName ? ` in place of ${wasName}` : slot.length ? (slot.some((c) => c.plan) ? ' in place of its boards' : '') : ' added'}${diff}` };
}

// ---- several shots of other takes selected at once (ASKS 52, 14 Nov 2026: "select multiple takes to taste check the
// full video with them")

/** A shot of a take, chosen in the Takes view: scene, shot number, the take's file; `into`, the place it goes when
 *  that is not the scene's shot `n` of the take's own layout (another layout's take, or another place);
 *  `tag`, which of the take's shots of `n` when it has more than one ("7b"). */
export interface Pick { scene: string; n: number; src: string; into?: { to: number; layout: number }; tag?: string }

/** The key of a chosen shot, as the Takes view's cells name theirs: "<src>#<n>", "<src>#7b". */
export const pickKey = (p: { src: string; n: number; tag?: string }): string => `${p.src}#${p.tag ?? p.n}`;
/** Two chosen shots that go in the same place of the film, so only one of them can be chosen: the same scene and
 *  column, unless both have a letter and the letters differ ("7a" and "7b" go side by side). */
export const samePlace = (a: Pick, b: Pick): boolean =>
  a.scene === b.scene && (a.into?.to ?? a.n) === (b.into?.to ?? b.n) && (!!a.into || !!b.into || !a.tag || !b.tag || a.tag === b.tag);

/** "S2 shot 2, S5 shots 1 and 3, S7 shots 7a and 7b": the shots by scene, in the film's order of scenes. */
export function picksWords(picks: { scene: string; n: number; tag?: string }[], order?: string[]): string {
  const scenes = sceneOrder(picks.map((p) => p.scene));
  const list = order ? [...scenes].sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9) || a.localeCompare(b, undefined, { numeric: true })) : scenes;
  const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return list.map((sc) => {
    const ns = [...new Set(picks.filter((p) => p.scene === sc).map((p) => p.tag ?? String(p.n)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return `${sc} ${ns.length === 1 ? 'shot' : 'shots'} ${and(ns)}`;
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
    const e = putShot(cur, p.scene, p.n, take, names.get(p.src) ?? take.name, by, idBase !== undefined ? `${idBase}${i}` : undefined, order, p.into, p.tag);
    if (!e) return;
    cur = e.tl; ids.push(e.clipId); note = e.note;
    placed.push({ ...p, clipId: e.clipId, at: e.at, frames: e.frames });
  });
  if (!placed.length) return undefined;
  // a later shot moved the earlier ones' places: read them from the cut as it ends up
  const v = mainTracks(cur).v;
  for (const x of placed) { const c = v?.clips.find((k) => k.id === x.clipId); if (c) x.at = startF(c, cur.fps); }
  if (placed.length > 1) note = `${placed.length} shots from other takes put in the film: ${picksWords(placed.map((x) => ({ scene: x.scene, n: x.into?.to ?? x.n, tag: x.into ? undefined : x.tag })), order)}`;
  return { tl: cur, note, ids, placed };
}
