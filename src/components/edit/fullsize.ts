// Where the full-size picture of each stretch of the cut comes from (13 Nov 2026, ASKS 37; the owner: "The 480p finished
// … The view goes to the 1080, with everything in the timeline, and I can do what I need to do there"). Pure: the Edit
// page's 1080p view plays these pieces, and the master render (render.ts, 14 Nov) is built from the very same pieces,
// so the two never disagree.
//
// In order, for each picture clip:
//   1. the take's own full-size file, "…-1080p.mp4" beside its "…-480p.mp4" (the take redone in Seedance), else
//      "…-1080p-up.mp4" (the whole take upscaled on Higgsfield): every clip of the cut that plays from that take uses
//      it, at the clip's own in and out, at the clip's speed;
//   2. else a made piece's own full-size original (a title card: "…-480x854.mp4" beside "…-1080x1920.mp4", or a file
//      already at the cut's size), cut the same way;
//   3. else the full-size picture of the cut (a file frame-aligned with one version of the cut, the base): the clip maps
//      into it where the base version shows the same file over the same stretch of source; the frame is the base clip's
//      place on the base timeline plus the offset, speed counted. So shots trimmed, moved, reordered or deleted since the
//      base still play full size;
//   4. else nothing full-size covers it (a stretch the base did not use, a new shot): the clip's own 480p file.
//
// What is drawn on top, and what the base already has (the rule the master keeps, 14 Nov). The base is the base
// version's picture as its render drew it: every mirror, picture fade, dissolve and upper-track picture of that version
// is in its frames (subtitles are not: the render draws the current cut's over everything). So:
//   - a piece from a file of the clip's own (1, 2, 4) is drawn as the 480p render draws it: mirror, fades, dissolves;
//   - a base piece never draws the mirror (a clip whose mirror differs from the base clip's is not mapped at all);
//   - a base frame is used only where the current cut draws the same thing there as the base version did ("looks"
//     below: the same fade at the same point, the same dissolve with the same other picture, the same pictures under a
//     see-through one), and then nothing is drawn over it, so nothing comes out twice;
//   - one exception: a plain base frame under a fade to black the current cut adds (a fade with nothing under it) is
//     used, and the clip's fade is drawn over it (`fades`);
//   - any other frame of a mapped clip whose look differs (a fade or dissolve the base has and the cut no longer has, or
//     the other way round) is not taken from the base: it comes from the clip's own file, as in 4.
import type { PictureMade, PictureSource, Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { pictureSegments, speedOf } from './model';

/** One full-size picture of a whole version of the cut, as served by GET /api/films/<film>/full. */
export interface FullBase { version: string; path: string; frames?: number; label: string }
/** GET /api/films/<film>/full: the bases on disk, each take's own full-size file (by the clip's src), each made
 *  piece's full-size original (by src; the src itself when it is already full size) and the name of the cheap pass
 *  ("Higgsfield" when the film's folder shows an upscale run, else "upscaled"), and each file's time. Paths in the form the
 *  clips' src use. */
export interface FullInfo {
  bases: FullBase[]; takes: Record<string, string>; upscaled?: Record<string, string>; originals?: Record<string, string>; label: string;
  /** When each of those files was written (ISO), by the same paths: a master older than a file it would use now is
   *  out of date (masters.ts masterAge). */
  times?: Record<string, string>;
}

/** Any full-size picture at all: an upscaled base of a version, a take's own 1080p file, a whole take upscaled, or a
 *  piece's full-size original. The 1080p view and its switch show when this is true (also when the only full-size
 *  files are upscaled takes, with no base and no take's own 1080p). */
export function hasFull(info: FullInfo | undefined): boolean {
  if (!info) return false;
  return info.bases.length > 0 || [info.takes, info.upscaled, info.originals].some((m) => !!m && Object.keys(m).length > 0);
}

export type PieceKind = 'take' | 'upscaled' | 'original' | 'base' | 'small';
/** A stretch of the timeline [from, to) in frames, played from `src` starting at `t0` seconds, `rate` seconds of file
 *  per second of film. `drawn`: the player and the master draw the clip's mirror and fades over it (a file of the
 *  clip's own). `fades`: a base piece over which the clip's fades are drawn (a fade the base does not have). */
export interface Piece { from: number; to: number; src: string; t0: number; rate: number; kind: PieceKind; clip: TimelineClip; drawn: boolean; fades?: boolean; label: string }

const vn = (v: string) => Number(/\d+/.exec(v)?.[0] ?? 0);

/** The base to use for a version: the newest whose version is not after it (a cut-v<n>-1080 file before a render),
 *  else the newest of all. */
export function baseFor(info: FullInfo | undefined, version: string): FullBase | undefined {
  const bs = [...(info?.bases ?? [])].sort((a, b) => vn(b.version) - vn(a.version));
  return bs.find((b) => vn(b.version) <= vn(version)) ?? bs[0];
}

// ---- the picture as the render lays it (render.ts builds its graph from this)

const frameOf = (s: number, fps: number) => Math.round(s * fps);
const secLen = (c: TimelineClip) => (c.out - c.in) / speedOf(c);
/** A clip of a track as the render lays it: its frame on the timeline and its length in frames. */
export interface Placed { c: TimelineClip; k: number; start: number; n: number }
/** A dissolve at a join: D frames, h1 of them before the join and h2 after (the middle of the stretch on the join). */
export interface Join { D: number; h1: number; h2: number }
export const placeClip = (c: TimelineClip, k: number, fps: number): Placed => {
  const start = frameOf(c.at, fps);
  return { c, k, start, n: Math.max(1, frameOf(c.at + secLen(c), fps) - start) };
};

/** The dissolves of one track's clips (in time order): entry i is the join before clip i, when clip i asks for
 *  one (`dissolve`) and the clip before it ends on the frame it starts. Each is cut to fit both clips: the two
 *  halves of a clip's dissolves never take more than the clip. A dissolve with no clip ending at its start is
 *  left out (`dropped`, by clip id). */
export function dissolveJoins(clips: Placed[], fps: number): { joins: (Join | undefined)[]; dropped: string[] } {
  const out: (Join | undefined)[] = clips.map(() => undefined);
  const dropped: string[] = [];
  for (const [i, e] of clips.entries()) {
    if (!(e.c.dissolve && e.c.dissolve > 0)) continue;
    const p = clips[i - 1];
    if (!p || p.start + p.n !== e.start) { dropped.push(e.c.id); continue; }
    const room = Math.min(p.n - (out[i - 1]?.h2 ?? 0), e.n);   // the outgoing clip may already give frames to its own incoming dissolve
    const D = Math.max(1, Math.round(e.c.dissolve * fps));
    const h1 = Math.min(Math.floor(D / 2), room), h2 = Math.min(D - Math.floor(D / 2), e.n);
    if (h1 + h2 > 0) out[i] = { D: h1 + h2, h1, h2 };
  }
  return { joins: out, dropped };
}

const trackNo = (t: TimelineTrack) => Number(/\d+/.exec(t.id)?.[0] ?? 0);
/** The picture tracks the render draws, lowest first (muted ones left out), each with its clips as laid and its
 *  dissolves. The lowest track skips a clip that starts inside the one before it; the upper ones stack. */
export function videoLayout(tl: Timeline): { track: TimelineTrack; clips: Placed[]; joins: (Join | undefined)[]; dropped: string[] }[] {
  const fps = tl.fps;
  const tracks = tl.tracks.filter((t) => t.kind === 'video' && !t.muted).sort((a, b) => (trackNo(a) - trackNo(b)) || a.id.localeCompare(b.id));
  return tracks.map((track, ti) => {
    const clips: Placed[] = [];
    let cursor = 0;
    for (const [k, c] of track.clips.filter((x) => !x.muted).entries()) {
      const e = placeClip(c, k, fps);
      if (ti === 0) {
        if (e.start < cursor) continue;     // validated away; a stray overlap is skipped, not stacked
        cursor = e.start + e.n;
      }
      clips.push(e);
    }
    return { track, clips, ...dissolveJoins(clips, fps) };
  });
}

/** What the render draws at each frame [0, total), in words that are equal exactly when the frames are equal (the
 *  same files at the same source frames, mirrored the same, at the same fade level, mixed the same). A plain frame of
 *  one picture reads "<src>@<frame>[~h]"; a fade adds "*<level>" (to black, or over what is under it); a dissolve is
 *  "mix(<a>|<b>|<share of b>)"; pictures seen through one another are listed lowest first with " / "; "black". */
export function pictureLooks(tl: Timeline, total: number): string[] {
  const fps = tl.fps;
  const layers: string[][] = Array.from({ length: Math.max(0, total) }, () => []);
  const sample = (e: Placed, f: number): string => {
    const c = e.c, j = f - e.start;
    const t = Math.max(0, c.in + (j * speedOf(c)) / fps);
    // the fades as ffmpeg's fade filter computes them, by the frame's time in the clip (black before a fade in starts)
    let k = 1;
    if (c.fadeIn) k *= j < 0 ? 0 : Math.min(1, j / fps / c.fadeIn);
    if (c.fadeOut) { const st = Math.max(0, e.n / fps - c.fadeOut); k *= Math.max(0, Math.min(1, 1 - (j / fps - st) / c.fadeOut)); }
    return `${c.src ?? ''}@${Math.round(t * fps)}${c.flip === 'h' ? '~h' : ''}${k < 1 ? `*${k.toFixed(3)}` : ''}`;
  };
  videoLayout(tl).forEach((L, ti) => {
    const here: string[][] = Array.from({ length: layers.length }, () => []);
    const put = (f: number, s: string) => { if (f >= 0 && f < here.length) here[f].push(s); };
    L.clips.forEach((e, i) => {
      const jin = L.joins[i], jout = L.joins[i + 1];
      for (let f = e.start + (jin?.h2 ?? 0); f < e.start + e.n - (jout?.h1 ?? 0); f++) put(f, sample(e, f));
      if (jin) {
        const p = L.clips[i - 1], a = e.start - jin.h1;
        for (let f = a; f < e.start + jin.h2; f++) put(f, `mix(${sample(p, f)}|${sample(e, f)}|${((f - a + 1) / (jin.D + 1)).toFixed(4)})`);
      }
    });
    here.forEach((h, f) => { if (ti === 0 && !h.length) layers[f].push('black'); else layers[f].push(...h); });
  });
  const opaque = (s: string) => s !== 'black' && !s.includes('*');
  return layers.map((ls) => {
    let i = ls.length - 1;
    while (i > 0 && !opaque(ls[i])) i--;
    let kept = ls.slice(Math.max(0, i));
    // a see-through picture over black is that picture faded to black
    if (kept[0] === 'black' && kept.length === 2 && !kept[1].startsWith('mix(')) kept = [kept[1]];
    return kept.join(' / ') || 'black';
  });
}
const isPlain = (s: string) => s !== 'black' && !s.includes(' / ') && !s.startsWith('mix(') && !s.includes('*');
const isFadeOnly = (s: string) => s !== 'black' && !s.includes(' / ') && !s.startsWith('mix(') && s.includes('*');

/** The picture of `tl` as pieces from full-size sources; `base` with its own version's timeline. Without info, every
 *  piece is the clip's own file (the 480p view). */
export function picturePieces(tl: Timeline, info?: FullInfo, base?: { b: FullBase; tl: Timeline }): Piece[] {
  const fps = tl.fps;
  const out: Piece[] = [];
  const push = (p: Piece) => {
    const l = out[out.length - 1];
    if (l && l.kind === 'small' && p.kind === 'small' && l.clip === p.clip && l.to === p.from) { l.to = p.to; return; }
    out.push(p);
  };
  const segs = pictureSegments(tl);
  const bsegs = base ? pictureSegments(base.tl) : [];
  const bfps = base?.tl.fps ?? fps;
  const bFrames = base?.b.frames ?? Infinity;
  const looks = base ? pictureLooks(tl, Math.max(0, ...segs.map((s) => s.to))) : [];
  const bLooks = base ? pictureLooks(base.tl, Math.max(0, ...bsegs.map((s) => s.to))) : [];
  for (const seg of segs) {
    const c = seg.clip, sp = speedOf(c), src = c.src ?? '';
    const sAt = (f: number) => c.in + ((f - frameOf(c.at, fps)) * sp) / fps;
    const small = (from: number, to: number): Piece => ({ from, to, src, t0: sAt(from), rate: sp, kind: 'small', clip: c, drawn: true, label: 'not upscaled' });
    const own = (kind: PieceKind, file: string, label: string): Piece => ({ from: seg.from, to: seg.to, src: file, t0: sAt(seg.from), rate: sp, kind, clip: c, drawn: true, label });
    if (info?.takes[src]) { push(own('take', info.takes[src], 'Seedance')); continue; }
    if (info?.upscaled?.[src]) { push(own('upscaled', info.upscaled[src], 'upscaled take')); continue; }
    if (info?.originals?.[src]) { push(own('original', info.originals[src], 'original')); continue; }
    if (!base) { push(small(seg.from, seg.to)); continue; }
    // the stretches of this clip's source the base shows, mapped back to this timeline
    const s0 = sAt(seg.from), s1 = sAt(seg.to);
    const cover: { a: number; b: number; t0: number; rate: number }[] = [];
    for (const bs of bsegs) {
      const bc = bs.clip;
      if (bc.src !== c.src || (bc.flip ?? '') !== (c.flip ?? '')) continue;
      const bsp = speedOf(bc);
      const b0 = bc.in + ((bs.from - frameOf(bc.at, bfps)) * bsp) / bfps, b1 = b0 + ((bs.to - bs.from) * bsp) / bfps;
      const lo = Math.max(s0, b0), hi = Math.min(s1, b1);
      if (hi - lo < 0.5 / fps) continue;
      const a = Math.round(seg.from + ((lo - s0) * fps) / sp), b = Math.round(seg.from + ((hi - s0) * fps) / sp);
      if (b <= a) continue;
      cover.push({ a, b, t0: (bs.from + ((lo - b0) * bfps) / bsp) / bfps, rate: sp / bsp });
    }
    cover.sort((x, y) => x.a - y.a);
    let at = seg.from;
    for (const k of cover) {
      if (k.b <= at) continue;
      const a = Math.max(k.a, at);
      if (a > at) push(small(at, a));
      // frame by frame: is the base frame there the very frame the cut draws (see the rule at the top)?
      const state = (f: number): 'base' | 'fade' | 'none' => {
        const g = Math.round((k.t0 + ((f - k.a) / fps) * k.rate) * bfps);
        if (g < 0 || g >= bFrames || g >= bLooks.length) return 'none';
        const lc = looks[f] ?? '', lb = bLooks[g];
        if ((isPlain(lc) && isPlain(lb)) || lc === lb) return 'base';
        if (isPlain(lb) && isFadeOnly(lc)) return 'fade';
        return 'none';
      };
      for (let r0 = a; r0 < k.b;) {
        const st = state(r0);
        let r1 = r0 + 1;
        while (r1 < k.b && state(r1) === st) r1++;
        if (st === 'none') push(small(r0, r1));
        else push({ from: r0, to: r1, src: base.b.path, t0: k.t0 + ((r0 - k.a) / fps) * k.rate, rate: k.rate, kind: 'base', clip: c, drawn: false, ...(st === 'fade' ? { fades: true } : {}), label: base.b.label });
        r0 = r1;
      }
      at = k.b;
    }
    if (at < seg.to) push(small(at, seg.to));
  }
  return out;
}
/** Each picture clip's mark: where its full-size picture comes from; "small" when any part of it has none. */
export function clipMarks(pieces: Piece[]): Map<string, { kind: PieceKind; label: string }> {
  const m = new Map<string, { kind: PieceKind; label: string }>();
  for (const p of pieces) {
    const had = m.get(p.clip.id);
    if (!had || p.kind === 'small') m.set(p.clip.id, { kind: p.kind, label: p.label });
  }
  return m;
}

// ---- what a master is made from, counted and said in plain words

const ORDER: PieceKind[] = ['take', 'upscaled', 'original', 'base', 'small'];
/** Shots and frames per source. A shot (a picture clip) with any frame scaled up from 480p counts as scaled up;
 *  else it counts under the source that gives most of its frames. */
export function pictureMade(pieces: Piece[], base?: FullBase): PictureMade {
  const frames = new Map<PieceKind, number>();
  const perClip = new Map<string, Map<PieceKind, number>>();
  for (const p of pieces) {
    const n = p.to - p.from;
    frames.set(p.kind, (frames.get(p.kind) ?? 0) + n);
    const m = perClip.get(p.clip.id) ?? new Map<PieceKind, number>();
    m.set(p.kind, (m.get(p.kind) ?? 0) + n);
    perClip.set(p.clip.id, m);
  }
  const shots = new Map<PieceKind, number>();
  for (const m of perClip.values()) {
    const k = m.get('small') ? 'small' : [...m.entries()].sort((x, y) => y[1] - x[1] || ORDER.indexOf(x[0]) - ORDER.indexOf(y[0]))[0][0];
    shots.set(k, (shots.get(k) ?? 0) + 1);
  }
  const sources: PictureSource[] = ORDER.filter((k) => frames.get(k)).map((kind) => ({ kind, shots: shots.get(kind) ?? 0, frames: frames.get(kind) ?? 0 }));
  return {
    sources, shots: perClip.size, frames: [...frames.values()].reduce((a, b) => a + b, 0),
    ...(base && frames.get('base') ? { base: { version: base.version, path: base.path, label: base.label } } : {}),
  };
}

const WORDS: Record<PieceKind, (m: PictureMade) => string> = {
  take: () => 'from Seedance',
  upscaled: () => 'from upscaled takes',
  original: () => 'from full-size originals',
  base: (m) => `from the ${m.base?.label === 'Higgsfield' ? 'Higgsfield upscale' : 'upscale'} of ${m.base?.version ?? 'the cut'}`,
  small: () => 'scaled up from 480p',
};
/** "36 shots from the Higgsfield upscale of v230", or "33 shots from the Higgsfield upscale of v230 · 3 scaled up from
 *  480p": the most shots first, the scaled-up part last and marked to show in amber. */
export function madeWords(m: PictureMade): { text: string; warn: boolean }[] {
  const order = (s: PictureSource) => (s.kind === 'small' ? -1 : s.shots);
  return m.sources.filter((s) => s.shots > 0).sort((x, y) => order(y) - order(x)).map((s, i) => ({
    text: `${s.shots}${i === 0 ? ` ${s.shots === 1 ? 'shot' : 'shots'}` : ''} ${WORDS[s.kind](m)}`,
    warn: s.kind === 'small',
  }));
}
/** Before a master: "3 shots have no full-size picture and will be scaled up from 480p", else nothing. */
export function scaledUpWords(m: PictureMade | undefined): string | undefined {
  const n = m?.sources.find((s) => s.kind === 'small')?.shots ?? 0;
  return n ? `${n} ${n === 1 ? 'shot has' : 'shots have'} no full-size picture and will be scaled up from 480p` : undefined;
}
