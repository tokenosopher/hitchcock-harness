// Would two versions of the cut render the same master? (14 Nov 2026, ASKS 49.) The user, with the cut at v239 and the
// master of v235, where v236 to v239 were two caption moves and their two undos: "Why does it say that the master is
// version 2.35 versus the cut that is version 2.39? I don't remember doing any changes". A render is current when the
// cut it was made from has the same content as the cut now, the way an editor's render bar goes green again after an
// undo: what the render reads is compared, not the version number. And when there is a real gap, it is said in words
// ("1 subtitle line moved since the master"), not as two numbers. Pure: the server (the routes that answer the Edit
// page and the Release pages) and the page both use it; scripts/samecut-test.ts checks it.
//
// What the render reads (src/server/edit/render.ts buildGraph, the master's picture plan in fullsize.ts picturePieces,
// render-options.ts for the options): the film's fps, width and height; each track in order, its id (the video tracks
// are stacked by the number in their id, a leave-out names track ids), its kind, muted, and solo on a sound track
// (solo is read only there); each clip in time order (the order validateTimeline gives them), its src, the words of a
// subtitle line (only when it has no src), in, out, at, speed (1 when absent or not above 0), gain (0 when absent),
// level points, fade in and out, dissolve, muted, and the mirror (`flip: 'h'`).
// Left out because the render never reads them: the version's name, basedOn, note, by, at, markers and renders; a
// track's name (said only in the stems' file names and the leave-out summary, never in the picture or the mix) and
// locked; a clip's id (it names a clip in a log line and in a "More renders" leave-out only), label (read only by the
// "leave out the title cards" option of More renders, never by the plain master), takeRef and unlinked (edit
// behaviour). The files themselves are not read: an .srt or a take whose file changed under the same name is the
// master's own out-of-date check's business (masters.ts), not this one's.
import type { TimelineClip, TimelineTrack } from '@/server/types';

/** Anything with a cut's content: a whole Timeline, or the part of one the render reads (RenderPart). */
export type CutLike = { fps: number; width: number; height: number } & { tracks: (Pick<TimelineTrack, 'id' | 'kind' | 'muted' | 'solo'> & { clips: AnyClip[] })[] };
type AnyClip = Omit<Partial<TimelineClip>, 'flip'> & { flip?: 'h' | boolean };

/** A clip as the render reads it, its defaults filled in as the render fills them. `id` is kept to match clips when
 *  saying what changed; it never makes two cuts different. */
export interface RenderClip {
  id: string;
  src?: string;
  /** A subtitle line's words (a clip with no src). */
  text?: string;
  in: number; out: number; at: number;
  speed: number;
  gain: number;
  gainPoints: { t: number; db: number }[];
  fadeIn: number; fadeOut: number;
  dissolve: number;
  muted: boolean;
  flip: boolean;
}
export interface RenderTrack { id: string; kind: TimelineTrack['kind']; muted: boolean; solo: boolean; clips: RenderClip[] }
/** The part of a version the master render reads (small: the route sends it to the page instead of the whole file). */
export interface RenderPart { fps: number; width: number; height: number; tracks: RenderTrack[] }

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function renderClip(c: AnyClip): RenderClip {
  const speed = num(c.speed, 1);
  return {
    id: String(c.id ?? ''),
    ...(c.src !== undefined ? { src: c.src } : {}),
    ...(c.src === undefined && typeof c.text === 'string' ? { text: c.text } : {}),
    in: num(c.in), out: num(c.out), at: num(c.at),
    speed: speed > 0 ? speed : 1,
    gain: num(c.gain),
    gainPoints: (c.gainPoints ?? []).map((p) => ({ t: num(p.t), db: num(p.db) })),
    fadeIn: num(c.fadeIn), fadeOut: num(c.fadeOut),
    dissolve: num(c.dissolve),
    muted: !!c.muted,
    // a RenderPart's own clip (flip: true) reads the same again: renderPart(renderPart(t)) is renderPart(t)
    flip: c.flip === 'h' || c.flip === true,
  };
}

/** The part of a cut the master render reads. Clips in time order (a stable sort by `at`, as validateTimeline
 *  writes them). */
export function renderPart(t: CutLike): RenderPart {
  return {
    fps: t.fps, width: t.width, height: t.height,
    tracks: t.tracks.map((tr) => ({
      id: tr.id, kind: tr.kind, muted: !!tr.muted, solo: tr.kind === 'audio' && !!tr.solo,
      clips: [...tr.clips].sort((a, b) => num(a.at) - num(b.at)).map(renderClip),
    })),
  };
}

/** The same clip for the render (everything but its id). */
function sameClip(a: RenderClip, b: RenderClip): boolean {
  return a.src === b.src && a.text === b.text && a.in === b.in && a.out === b.out && a.at === b.at && a.speed === b.speed && a.gain === b.gain
    && a.fadeIn === b.fadeIn && a.fadeOut === b.fadeOut && a.dissolve === b.dissolve && a.muted === b.muted && a.flip === b.flip
    && a.gainPoints.length === b.gainPoints.length && a.gainPoints.every((p, i) => p.t === b.gainPoints[i].t && p.db === b.gainPoints[i].db);
}

const partOf = (t: CutLike | RenderPart): RenderPart => renderPart(t);

/** Would these two cuts render the same master? Exact: numbers are compared as they are written (an undo writes back
 *  the very numbers it undoes), and anything the render reads that differs makes them different. */
export function sameCut(x: CutLike | RenderPart, y: CutLike | RenderPart): boolean {
  const a = partOf(x), b = partOf(y);
  if (a.fps !== b.fps || a.width !== b.width || a.height !== b.height || a.tracks.length !== b.tracks.length) return false;
  return a.tracks.every((ta, i) => {
    const tb = b.tracks[i];
    return ta.id === tb.id && ta.kind === tb.kind && ta.muted === tb.muted && ta.solo === tb.solo && ta.clips.length === tb.clips.length
      && ta.clips.every((c, k) => sameClip(c, tb.clips[k]));
  });
}

// ---- what changed, in words

/** The groups a person notices, in the order they are said. */
export type ChangeArea = 'picture' | 'sound' | 'subtitles' | 'fades' | 'dissolves' | 'mutes' | 'tracks' | 'film';
/** One kind of change and how many times it happened: "2 shots trimmed" is { noun: 'shot', verb: 'trimmed', n: 2 }. */
export interface Change { area: ChangeArea; noun: string; nouns: string; verb: string; n: number }

const AREA_ORDER: ChangeArea[] = ['picture', 'sound', 'subtitles', 'fades', 'dissolves', 'mutes', 'tracks', 'film'];
const AREA_WORD: Record<ChangeArea, string> = { picture: 'picture', sound: 'sound', subtitles: 'subtitles', fades: 'fades', dissolves: 'dissolves', mutes: 'mutes', tracks: 'tracks', film: 'the picture size or frame rate' };
const VERB_ORDER = ['added', 'removed', 'swapped', 'reworded', 'trimmed', 'moved', 'sped up or slowed', 'mirrored', 'changed', 'muted', 'unmuted', 'soloed', 'unsoloed', 'reordered'];

/** What a clip is called, by its track. */
function clipNoun(kind: TimelineTrack['kind'], c: RenderClip): { area: ChangeArea; noun: string; nouns: string } {
  if (kind === 'video') return { area: 'picture', noun: 'shot', nouns: 'shots' };
  if (kind === 'audio') return { area: 'sound', noun: 'sound clip', nouns: 'sound clips' };
  return c.src === undefined ? { area: 'subtitles', noun: 'subtitle line', nouns: 'subtitle lines' } : { area: 'subtitles', noun: 'subtitle file', nouns: 'subtitle files' };
}

class Tally {
  private m = new Map<string, Change>();
  add(area: ChangeArea, noun: string, nouns: string, verb: string, n = 1): void {
    const k = `${area}|${noun}|${verb}`;
    const had = this.m.get(k);
    if (had) had.n += n; else this.m.set(k, { area, noun, nouns, verb, n });
  }
  list(): Change[] {
    const vi = (v: string) => { const i = VERB_ORDER.indexOf(v); return i < 0 ? VERB_ORDER.length : i; };
    return [...this.m.values()].sort((a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) || a.noun.localeCompare(b.noun) || vi(a.verb) - vi(b.verb));
  }
}

/** One clip in both cuts: what changed on it. A clip counts once for its main change (swapped or reworded, else
 *  trimmed, else moved), and once more for each of its speed, mirror, level, fades, dissolve and mute. */
function clipChanges(kind: TimelineTrack['kind'], a: RenderClip, b: RenderClip, t: Tally): void {
  const { area, noun, nouns } = clipNoun(kind, b);
  const line = b.src === undefined && kind === 'captions';
  if (a.src !== b.src) t.add(area, noun, nouns, 'swapped');
  else if (a.text !== b.text) t.add(area, noun, nouns, line ? 'reworded' : 'changed');
  else if (a.in !== b.in || a.out !== b.out) t.add(area, noun, nouns, 'trimmed');
  else if (a.at !== b.at) t.add(area, noun, nouns, 'moved');
  if (a.speed !== b.speed) t.add(area, noun, nouns, 'sped up or slowed');
  if (a.flip !== b.flip) t.add(area, noun, nouns, 'mirrored');
  const level = a.gain !== b.gain || a.gainPoints.length !== b.gainPoints.length || a.gainPoints.some((p, i) => p.t !== b.gainPoints[i].t || p.db !== b.gainPoints[i].db);
  if (level) t.add(kind === 'video' ? area : 'sound', 'sound level', 'sound levels', 'changed');
  if (a.fadeIn !== b.fadeIn || a.fadeOut !== b.fadeOut) t.add('fades', 'fade', 'fades', 'changed');
  if (a.dissolve !== b.dissolve) t.add('dissolves', 'dissolve', 'dissolves', 'changed');
  if (a.muted !== b.muted) t.add('mutes', 'clip', 'clips', b.muted ? 'muted' : 'unmuted');
}

/** The clips of one track in both cuts, paired: by id first, then an unchanged clip under a new id, then the same
 *  file (or the same words) in order; what is left was added or removed. */
function trackChanges(kind: TimelineTrack['kind'], A: RenderClip[], B: RenderClip[], t: Tally): void {
  const leftA = new Set(A.map((_, i) => i)), leftB = new Set(B.map((_, i) => i));
  const pairs: [number, number][] = [];
  const byId = new Map<string, number>();
  A.forEach((c, i) => { if (c.id && !byId.has(c.id)) byId.set(c.id, i); });
  B.forEach((c, j) => { const i = c.id ? byId.get(c.id) : undefined; if (i !== undefined && leftA.has(i)) { pairs.push([i, j]); leftA.delete(i); leftB.delete(j); } });
  const pairBy = (match: (a: RenderClip, b: RenderClip) => boolean) => {
    for (const j of [...leftB]) {
      const i = [...leftA].find((x) => match(A[x], B[j]));
      if (i !== undefined) { pairs.push([i, j]); leftA.delete(i); leftB.delete(j); }
    }
  };
  pairBy(sameClip);
  pairBy((a, b) => (a.src ?? '') === (b.src ?? '') && (a.src !== undefined || a.text === b.text));
  pairBy((a, b) => (a.src ?? '') === (b.src ?? ''));
  for (const [i, j] of pairs) clipChanges(kind, A[i], B[j], t);
  for (const i of leftA) { const w = clipNoun(kind, A[i]); t.add(w.area, w.noun, w.nouns, 'removed'); }
  for (const j of leftB) { const w = clipNoun(kind, B[j]); t.add(w.area, w.noun, w.nouns, 'added'); }
}

const TRACK_NOUN: Record<TimelineTrack['kind'], [string, string]> = { video: ['picture track', 'picture tracks'], audio: ['sound track', 'sound tracks'], captions: ['subtitles track', 'subtitles tracks'] };

/** What changed from cut `x` (the one a render was made from) to cut `y` (the cut now), grouped as a person would
 *  notice it. Empty exactly when sameCut(x, y). */
export function cutChanges(x: CutLike | RenderPart, y: CutLike | RenderPart): Change[] {
  const a = partOf(x), b = partOf(y);
  const t = new Tally();
  if (a.width !== b.width || a.height !== b.height) t.add('film', 'picture size', 'picture sizes', 'changed');
  if (a.fps !== b.fps) t.add('film', 'frame rate', 'frame rates', 'changed');
  const key = (tr: RenderTrack) => `${tr.kind}|${tr.id}`;
  const inB = new Map(b.tracks.map((tr) => [key(tr), tr]));
  const inA = new Map(a.tracks.map((tr) => [key(tr), tr]));
  for (const ta of a.tracks) {
    const tb = inB.get(key(ta));
    if (!tb) { const [one, many] = TRACK_NOUN[ta.kind]; t.add('tracks', one, many, 'removed'); continue; }
    if (ta.muted !== tb.muted) t.add('mutes', 'track', 'tracks', tb.muted ? 'muted' : 'unmuted');
    if (ta.solo !== tb.solo) t.add('mutes', 'track', 'tracks', tb.solo ? 'soloed' : 'unsoloed');
    trackChanges(ta.kind, ta.clips, tb.clips, t);
  }
  for (const tb of b.tracks) if (!inA.has(key(tb))) { const [one, many] = TRACK_NOUN[tb.kind]; t.add('tracks', one, many, 'added'); }
  // the tracks both have, in another order
  const both = (p: RenderPart, other: Map<string, RenderTrack>) => p.tracks.filter((tr) => other.has(key(tr))).map(key).join('\n');
  if (both(a, inB) !== both(b, inA)) t.add('tracks', 'track', 'tracks', 'reordered');
  const out = t.list();
  // a difference sameCut sees and the words do not (none is known): still a change, never silence
  if (!out.length && !sameCut(a, b)) out.push({ area: 'film', noun: 'change', nouns: 'changes', verb: '', n: 1 });
  return out;
}

const phrase = (c: Change): string => [c.n === 1 ? `1 ${c.noun}` : `${c.n} ${c.nouns}`, c.verb].filter(Boolean).join(' ');
const and = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

/** The most kinds of change said one by one; beyond it, the count and the areas. */
export const MAX_LISTED = 3;

/** What changed, in a short sentence without the full stop: "1 subtitle line moved since the master", "2 shots
 *  trimmed and 1 sound clip added since the master", and when it is too much to list, "12 changes since the master, in
 *  picture, sound and subtitles". `since`: what it is said against ("the master", "the final"); without it the sentence
 *  ends on "since". Empty when nothing changed. */
export function changeWords(changes: Change[], since?: string): string {
  if (!changes.length) return '';
  const tail = since ? `since ${since}` : 'since';
  if (changes.length <= MAX_LISTED) return `${and(changes.map(phrase))} ${tail}`;
  const n = changes.reduce((s, c) => s + c.n, 0);
  const areas = AREA_ORDER.filter((a) => changes.some((c) => c.area === a)).map((a) => AREA_WORD[a]);
  return `${n} changes ${tail}, in ${and(areas)}`;
}

/** What changed, said without "since" (the Versions menu's "Compared with now: 2 shots trimmed and 1 subtitle line
 *  moved"; 15 Nov): the same sentence as changeWords. Empty when nothing changed. */
export function changeList(changes: Change[]): string {
  if (!changes.length) return '';
  if (changes.length <= MAX_LISTED) return and(changes.map(phrase));
  const n = changes.reduce((s, c) => s + c.n, 0);
  const areas = AREA_ORDER.filter((a) => changes.some((c) => c.area === a)).map((a) => AREA_WORD[a]);
  return `${n} changes, in ${and(areas)}`;
}

/** A render's cut against the cut now: the same, or what changed in words. */
export interface CutGap { same: boolean; words?: string }
export function cutGap(made: CutLike | RenderPart, now: CutLike | RenderPart, since?: string): CutGap {
  if (sameCut(made, now)) return { same: true };
  return { same: false, words: changeWords(cutChanges(made, now), since) };
}
