// A sound clip's fade from or to a level: the user splits the music, gives each piece its own
// level, and wants the change at the split to rise (or fall) smoothly instead of jumping. A fade in may start from a
// level (`fadeInFrom`, dB, the same scale as `gain`) and a fade out may end at one (`fadeOutTo`); unset, they start
// from and end at silence, as before. A fade from a level is straight in dB (the clock of the timeline), as level
// points are; a fade from silence keeps ffmpeg's afade (straight in amplitude), unchanged.
//
// One set of pure functions for everything that hears or draws a clip: the render's filters (server/edit/render.ts,
// server/edit/hear.ts), the player's live levels (Viewer.tsx), the clip's drawing (Tracks.tsx) and the Inspector.
//
// Before this existed Alma made the same rise with two level points at the clip's head: (the level before − this
// clip's level) dB at its first source second, then 0 dB a little later.
// Such a pair is read as a fade from that level (`asFades`): drawn and edited as one; the file keeps its points until
// the fade is edited, and then the edit writes the fields. Both sound the same.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';

const speedOf = (c: Pick<TimelineClip, 'speed'>) => (c.speed && c.speed > 0 ? c.speed : 1);
/** A clip's length on the timeline, seconds. */
const lenOf = (c: Pick<TimelineClip, 'in' | 'out' | 'speed'>) => (c.out - c.in) / speedOf(c);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Levels a fade may start from or end at, dB (the level points' range). */
export const FADE_DB_MIN = -96, FADE_DB_MAX = 24;
/** The length "Smooth the change" gives a fade, seconds. */
export const SMOOTH_S = 2;

type FadeClip = Pick<TimelineClip, 'in' | 'out' | 'speed' | 'gain' | 'fadeIn' | 'fadeOut' | 'fadeInFrom' | 'fadeOutTo' | 'gainPoints'>;

// ---- what is heard

/** The dB the fades from or to a level add at `pos`, timeline seconds from the clip's start: (from − gain) at the
 *  start, straight to 0 at the fade's end; mirrored for the fade out. 0 outside them and for fades from silence. */
export function fadeDb(c: FadeClip, pos: number): number {
  const g = c.gain ?? 0, len = lenOf(c);
  let d = 0;
  if (c.fadeIn && c.fadeIn > 0 && c.fadeInFrom !== undefined) d += (c.fadeInFrom - g) * (1 - clamp01(pos / c.fadeIn));
  if (c.fadeOut && c.fadeOut > 0 && c.fadeOutTo !== undefined) d += (c.fadeOutTo - g) * clamp01((pos - (len - c.fadeOut)) / c.fadeOut);
  return d;
}

/** The amplitude of the fades from or to silence at `pos` (afade: straight in amplitude, silent before a fade in
 *  starts and after a fade out ends). 1 for fades from a level. */
export function silenceFade(c: FadeClip, pos: number): number {
  const len = lenOf(c);
  const fi = c.fadeIn && c.fadeIn > 0 && c.fadeInFrom === undefined ? c.fadeIn : 0;
  const fo = c.fadeOut && c.fadeOut > 0 && c.fadeOutTo === undefined ? c.fadeOut : 0;
  return clamp01(Math.min(fi > 0 ? pos / fi : 1, fo > 0 ? (len - pos) / fo : 1));
}

/** All of a clip's fades as one amplitude factor at `pos` (timeline seconds from its start). */
export const fadeFactor = (c: FadeClip, pos: number): number => silenceFade(c, pos) * Math.pow(10, fadeDb(c, pos) / 20);

const n6 = (n: number): string => r6(n).toString();
/** The fades from or to a level as ffmpeg filters on the clip's stream, after its gain: one volume expression,
 *  evaluated in 10 ms blocks at the middle of each (as `levels` does for level points). `st` is the stream second the
 *  clip starts at. Nothing when neither fade is from or to a level (afade does fades from silence, as it always did). */
export function fadeFilters(c: FadeClip, st: number): string[] {
  const g = c.gain ?? 0, len = lenOf(c);
  const terms: string[] = [];
  const t = '(t+0.005)';
  if (c.fadeIn && c.fadeIn > 0 && c.fadeInFrom !== undefined && c.fadeInFrom !== g)
    terms.push(`${n6(c.fadeInFrom - g)}*(1-clip((${t}-${n6(st)})/${n6(c.fadeIn)},0,1))`);
  if (c.fadeOut && c.fadeOut > 0 && c.fadeOutTo !== undefined && c.fadeOutTo !== g)
    terms.push(`${n6(c.fadeOutTo - g)}*clip((${t}-${n6(st + Math.max(0, len - c.fadeOut))})/${n6(c.fadeOut)},0,1)`);
  if (!terms.length) return [];
  return ['asetnsamples=n=480:p=0', `volume=volume='pow(10,(${terms.join('+')})/20)':eval=frame`];
}

// ---- Alma's head pair (and its mirror at the tail), read as a fade

/** Two level points at the clip's head that make a fade from a level: the first at the clip's first source second
 *  with a level other than 0 dB, the second at 0 dB later, inside the clip, on a clip with no fade in of its own.
 *  Answers the fade's length (timeline seconds) and the level it starts at. */
export function headPair(c: FadeClip): { len: number; from: number } | undefined {
  const p = c.gainPoints;
  if (!p || p.length < 2 || (c.fadeIn ?? 0) > 0) return undefined;
  if (Math.abs(p[0].t - c.in) > 1e-3 || p[0].db === 0 || p[1].db !== 0 || p[1].t <= p[0].t) return undefined;
  const len = (p[1].t - c.in) / speedOf(c);
  if (len > lenOf(c) - (c.fadeOut ?? 0) + 1e-6) return undefined;
  return { len: r6(len), from: r1((c.gain ?? 0) + p[0].db) };
}
/** The mirror of headPair at the clip's tail: 0 dB, then another level at the clip's last source second. */
export function tailPair(c: FadeClip): { len: number; to: number } | undefined {
  const p = c.gainPoints;
  if (!p || p.length < 2 || (c.fadeOut ?? 0) > 0) return undefined;
  const a = p[p.length - 2], b = p[p.length - 1];
  if (Math.abs(b.t - c.out) > 1e-3 || b.db === 0 || a.db !== 0 || b.t <= a.t) return undefined;
  const len = (c.out - a.t) / speedOf(c);
  if (len > lenOf(c) - (c.fadeIn ?? 0) + 1e-6) return undefined;
  return { len: r6(len), to: r1((c.gain ?? 0) + b.db) };
}

/** The clip with a head or tail pair of level points written as the fade they make (the same sound): the first
 *  point goes, and the second too unless more points follow (it then holds the line at 0 dB). `skip`: how many points
 *  went from the front, so a drawn point's number finds the file's. The clip itself when there is no pair. */
export function asFades<C extends FadeClip>(c: C): { clip: C; skip: number } {
  const h = headPair(c);
  let out = c, skip = 0;
  if (h) {
    const pts = c.gainPoints!.slice(c.gainPoints!.length === 2 ? 2 : 1);
    out = { ...out, fadeIn: h.len, fadeInFrom: h.from, gainPoints: pts.length ? pts : undefined };
    skip = c.gainPoints!.length - pts.length;
  }
  const t = tailPair(out);
  if (t) {
    const all = out.gainPoints!;
    const pts = all.slice(0, all.length === 2 ? 0 : all.length - 1);
    out = { ...out, fadeOut: t.len, fadeOutTo: t.to, gainPoints: pts.length ? pts : undefined };
  }
  if (out !== c && !out.gainPoints) delete (out as Partial<C>).gainPoints;
  return { clip: out, skip };
}

// ---- the neighbours (a split: a clip that starts where the one before it on its track ends)

const findIn = (tl: Timeline, trackId: string) => tl.tracks.find((t) => t.id === trackId);
/** The clip on the same track that ends where `c` starts (within half a frame), not muted. */
export function clipBefore(track: TimelineTrack, c: TimelineClip, fps: number): TimelineClip | undefined {
  return track.clips.find((o) => o !== c && o.id !== c.id && !o.muted && !o.plan && Math.abs(o.at + lenOf(o) - c.at) < 0.5 / fps);
}
/** The clip on the same track that starts where `c` ends. */
export function clipAfter(track: TimelineTrack, c: TimelineClip, fps: number): TimelineClip | undefined {
  return track.clips.find((o) => o !== c && o.id !== c.id && !o.muted && !o.plan && Math.abs(c.at + lenOf(c) - o.at) < 0.5 / fps);
}
const ptsDb = (p: TimelineClip['gainPoints'], t: number): number => {
  if (!p?.length) return 0;
  if (t <= p[0].t) return p[0].db;
  const last = p[p.length - 1];
  if (t >= last.t) return last.db;
  for (let i = 1; i < p.length; i++) if (t <= p[i].t) { const a = p[i - 1], b = p[i]; return b.t === a.t ? b.db : a.db + ((t - a.t) / (b.t - a.t)) * (b.db - a.db); }
  return last.db;
};
/** The level the clip before plays at its very end (its gain, points and a fade to a level), or undefined when it
 *  fades to silence there. */
export function levelAtEnd(c: TimelineClip): number | undefined {
  const f = asFades(c).clip;
  if ((f.fadeOut ?? 0) > 0) return f.fadeOutTo;
  return r1((f.gain ?? 0) + ptsDb(f.gainPoints, f.out));
}
/** The level the clip after plays at its very start, or undefined when it fades in from silence there. */
export function levelAtStart(c: TimelineClip): number | undefined {
  const f = asFades(c).clip;
  if ((f.fadeIn ?? 0) > 0) return f.fadeInFrom;
  return r1((f.gain ?? 0) + ptsDb(f.gainPoints, f.in));
}

/** Where a new fade on a sound clip starts or ends by default: at a split (the clip before ends where this one
 *  starts, or the next starts where this one ends, with no cross-fade between them), at that neighbour's level there,
 *  so the fade is a smooth change between the two; with no neighbour, or one at the same level, silence (undefined). */
export function defaultFadeLevel(tl: Timeline, trackId: string, c: TimelineClip, kind: 'fadeIn' | 'fadeOut'): number | undefined {
  const t = findIn(tl, trackId);
  if (!t || t.kind !== 'audio') return undefined;
  const o = kind === 'fadeIn' ? clipBefore(t, c, tl.fps) : clipAfter(t, c, tl.fps);
  if (!o) return undefined;
  if (kind === 'fadeIn' ? c.dissolve : o.dissolve) return undefined;
  const lv = kind === 'fadeIn' ? levelAtEnd(o) : levelAtStart(o);
  if (lv === undefined) return undefined;
  const f = asFades(c).clip;
  const own = r1((f.gain ?? 0) + ptsDb(f.gainPoints, kind === 'fadeIn' ? f.in : f.out));
  return Math.abs(lv - own) < 0.05 ? undefined : lv;
}

/** "Smooth the change": what the selected sound clip offers when it follows another at a different level (and its
 *  head is not already a fade from that level): the level before and the fade's length. */
export function smoothOffer(tl: Timeline, trackId: string, c: TimelineClip): { from: number; len: number } | undefined {
  const t = findIn(tl, trackId);
  if (!t || t.kind !== 'audio' || t.locked || c.plan) return undefined;
  const from = defaultFadeLevel(tl, trackId, c, 'fadeIn');
  if (from === undefined) return undefined;
  const f = asFades(c).clip;
  if ((f.fadeIn ?? 0) > 0 && f.fadeInFrom !== undefined && Math.abs(f.fadeInFrom - from) < 0.05) return undefined;
  const len = r6(Math.min(SMOOTH_S, lenOf(c) - (f.fadeOut ?? 0)));
  return len > 0 ? { from, len } : undefined;
}

export const fmtLevel = (db: number | undefined): string => db === undefined ? 'silence' : `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(r1(db))} dB`;
