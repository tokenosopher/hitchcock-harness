// Hearing a card's sounds in the film, picture and all. Each option of a sound pick
// plays on the card; where the card says where its sounds sit in the film, each option can also be heard in place: the
// moment of the current cut, picture and all, a little before and after, with that option laid in at its placement,
// gain and fades, and the sound the cut has there now taken out. The harness renders that clip (server/edit/hear.ts);
// this file is what it is made from. Pure: scripts/hearit-test.ts.
import type { FeedSound, HearMoment, HearPlace, TimelineClip, TimelineTrack } from '@/server/types';

/** Seconds of the film heard before the sound comes in, and after it ends. */
export const LEAD = 2;
export const TAIL = 2;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const AUDIO = /\.(wav|mp3|m4a|aac|aiff?|flac|ogg)$/i;
export const isAudioPath = (p: string): boolean => AUDIO.test(p);

/** A file's path in the film folder's own terms: "assets/films/<film>/audio/x.wav" and "audio/x.wav" are one file. */
export const filmRel = (p: string): string => p.replace(/^assets\/films\/[^/]+\//, '');
const dirOf = (p: string): string => filmRel(p).replace(/\/[^/]*$/, '');

/** The paths a pick card's plain `files` list pairs with its options, by order: the i-th file is the i-th option's,
 *  when every file is a sound (the card the sound designer writes: options "try 1"…"none of these", files one per try,
 *  the extra options at the end without one). Anything else pairs nothing. */
export function pairFiles(options: number, files: unknown): (string | undefined)[] {
  if (!Array.isArray(files) || !files.length || !files.every((f) => typeof f === 'string' && isAudioPath(f))) return [];
  return Array.from({ length: options }, (_, i) => files[i] as string | undefined);
}

/** "1:06.0": a place in the film, to the tenth of a second. */
export function clock(t: number): string {
  const s = Math.max(0, Math.round(t * 10) / 10);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/** "surf-wash-into-s2" on a card about surf-wash → "into S2": the moment's name without the sound's. */
export function momentWords(name: string, sound?: string): string {
  let w = name;
  if (sound && w.toLowerCase().startsWith(`${sound.toLowerCase()}-`)) w = w.slice(sound.length + 1);
  w = w.replace(/-/g, ' ').replace(/\bs(\d+[a-z]?)\b/gi, (_, x: string) => `S${x}`).trim();
  return w || name;
}

/** The sound's name in a file ("…/surf-wash/surf-wash-try7.wav" → "surf-wash"). */
export const soundOfFile = (p: string): string => filmRel(p).split('/').slice(-2, -1)[0] ?? '';

/** The moments of a lay file (audio/sfx/lay-v2.json, the sound designer's placements: `sounds`, each with its `place`
 *  on the cut, its fades in frames and a variation per try with `file`, `at`, `in`, `out`, `level_db`) where any of
 *  the card's option files is laid. `options`: each option's id and file. */
export function momentsFromLay(lay: unknown, options: { id: string; path?: string }[]): HearMoment[] {
  const L = rec(lay);
  const fps = num(L?.fps) ?? 24;
  const byFile = new Map(options.filter((o) => o.path).map((o) => [filmRel(o.path!), o.id]));
  const out: HearMoment[] = [];
  for (const x of Array.isArray(L?.sounds) ? L!.sounds : []) {
    const s = rec(x);
    if (!s) continue;
    const places: Record<string, HearPlace> = {};
    let recommend: string | undefined;
    for (const y of Array.isArray(s.variations) ? s.variations : []) {
      const v = rec(y);
      const file = typeof v?.file === 'string' ? v.file : undefined;
      const id = file ? byFile.get(filmRel(file)) : undefined;
      const at = num(v?.at), a = num(v?.in), b = num(v?.out);
      if (!v || !id || at === undefined || a === undefined || b === undefined || b <= a || places[id]) continue;
      places[id] = { file: file!, at, in: a, out: b, ...(num(v.level_db) !== undefined ? { gainDb: num(v.level_db) } : {}) };
      if (num(s.recommend) !== undefined && num(v.try) === num(s.recommend)) recommend = id;
    }
    const ps = Object.values(places);
    if (!ps.length) continue;
    const place = Array.isArray(s.place) ? s.place.map(num) : [];
    const at = place[0] ?? Math.min(...ps.map((p) => p.at));
    const ends = place[1] ?? Math.max(...ps.map((p) => p.at + p.out - p.in));
    const name = typeof s.name === 'string' ? s.name : typeof s.id === 'string' ? s.id : `${at}`;
    const fi = num(s.fade_in_frames), fo = num(s.fade_out_frames);
    out.push({
      id: typeof s.id === 'string' ? s.id : name, label: momentWords(name, soundOfFile(ps[0].file)), at, ends,
      ...(fi !== undefined ? { fadeIn: fi / fps } : {}), ...(fo !== undefined ? { fadeOut: fo / fps } : {}),
      places, ...(recommend ? { recommend } : {}),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A card's own `places` (recipes/show.md): one list per option, in the options' order, of where that option is laid:
 *  `{"at": 66.0, "in": 2.25, "out": 3.75, "gain_db": -21.5, "fade_in": 0.75, "fade_out": 0.5, "moment": "into S2"}`
 *  (`moment` names the place, so the options laid at the same one are heard against each other; else `at` does). */
export function momentsFromPlaces(places: unknown, options: { id: string; path?: string }[]): HearMoment[] {
  if (!Array.isArray(places)) return [];
  const by = new Map<string, HearMoment>();
  places.forEach((list, i) => {
    const o = options[i];
    for (const y of Array.isArray(list) ? list : rec(list) ? [list] : []) {
      const p = rec(y);
      const file = typeof p?.file === 'string' ? p.file : o?.path;
      const at = num(p?.at), a = num(p?.in) ?? 0, b = num(p?.out);
      if (!p || !o || !file || at === undefined || b === undefined || b <= a) continue;
      const key = typeof p.moment === 'string' && p.moment.trim() ? p.moment.trim() : clock(at);
      const m = by.get(key) ?? { id: key, label: typeof p.moment === 'string' && p.moment.trim() ? p.moment.trim() : `at ${clock(at)}`, at, ends: at, places: {} };
      m.places[o.id] = { file, at, in: a, out: b, ...(num(p.gain_db) !== undefined ? { gainDb: num(p.gain_db) } : {}), ...(num(p.fade_in) !== undefined ? { fadeIn: num(p.fade_in) } : {}), ...(num(p.fade_out) !== undefined ? { fadeOut: num(p.fade_out) } : {}) };
      m.at = Math.min(m.at, at);
      m.ends = Math.max(m.ends, at + b - a);
      by.set(key, m);
    }
  });
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** A sound of a card of sound picks as one moment: its place in the plan, each try laid there from its start
 *  at the plan's level and fades, keyed by the try's number. */
export function momentOfSound(s: FeedSound): HearMoment | undefined {
  const e = s.effect, fps = s.fps ?? 24;
  if (!e || e.startFrame === undefined) return undefined;
  const at = e.startFrame / fps;
  const len = e.endFrame !== undefined && e.endFrame > e.startFrame ? (e.endFrame - e.startFrame) / fps : e.seconds;
  const places: Record<string, HearPlace> = {};
  for (const t of s.tries) {
    const l = Math.min(len ?? t.seconds ?? 0, t.seconds ?? len ?? 0);
    if (t.file && l > 0) places[String(t.n)] = { file: t.file, at, in: 0, out: l, ...(e.levelDb !== undefined ? { gainDb: e.levelDb } : {}) };
  }
  if (!Object.keys(places).length) return undefined;
  return { id: s.name, label: s.scene ? `in ${s.scene}` : s.name, at, ends: at + (len ?? 0), ...(e.fadeIn !== undefined ? { fadeIn: e.fadeIn / fps } : {}), ...(e.fadeOut !== undefined ? { fadeOut: e.fadeOut / fps } : {}), places };
}

/** The longest clip, in seconds: a song laid across most of the film is heard from its placement for a minute (the
 *  user: "Music is long"), the window marked `capped`. */
export const MAX_CLIP = 60;

/** The stretch of the film the clip plays: from LEAD before the sound to TAIL after it, inside the film, and never
 *  longer than MAX_CLIP (then `capped`: the first minute of the sound in the film). */
export interface HearWindow { start: number; end: number; capped?: true }
export function windowOf(m: Pick<HearMoment, 'at' | 'ends'>, filmEnd?: number): HearWindow {
  const start = Math.max(0, m.at - LEAD);
  const end = Math.max(start + 0.5, filmEnd !== undefined ? Math.min(filmEnd, m.ends + TAIL) : m.ends + TAIL);
  return end - start > MAX_CLIP ? { start, end: start + MAX_CLIP, capped: true } : { start, end };
}

/** One sound of the clip: a stretch of a file, where it starts in the clip (`at`, seconds from the clip's start). */
export interface HearPiece { src: string; in: number; out: number; at: number; gainDb: number; fadeIn: number; fadeOut: number; speed: number; gainPoints?: TimelineClip['gainPoints']; fadeInFrom?: number; fadeOutTo?: number; what: string }

const clipLen = (c: Pick<TimelineClip, 'in' | 'out' | 'speed'>): number => (c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);

/** The sound tracks that play, as the render reads them: not muted; the solo ones only, when any is solo. */
function playing(tracks: TimelineTrack[]): TimelineTrack[] {
  const audio = tracks.filter((t) => t.kind === 'audio' && !t.muted);
  const solo = audio.filter((t) => t.solo);
  return solo.length ? solo : audio;
}

/** A clip cut to the window, or nothing when it does not reach into it. Its fades shorten by what is cut off. */
function crop(c: { src: string; in: number; out: number; at: number; gain?: number; fadeIn?: number; fadeOut?: number; fadeInFrom?: number; fadeOutTo?: number; speed?: number; gainPoints?: TimelineClip['gainPoints'] }, w: HearWindow, what: string): HearPiece | undefined {
  const speed = c.speed && c.speed > 0 ? c.speed : 1;
  const a = c.at, b = c.at + clipLen(c);
  const s0 = Math.max(a, w.start), e0 = Math.min(b, w.end);
  if (e0 - s0 < 0.01) return undefined;
  const g = c.gain ?? 0, fi = c.fadeIn ?? 0, fo = c.fadeOut ?? 0;
  const fadeIn = Math.max(0, fi - (s0 - a)), fadeOut = Math.max(0, fo - (b - e0));
  // a fade from or to a level is straight in dB: cut short, it starts (or ends) at its level where the window cuts it
  const from = c.fadeInFrom !== undefined && fadeIn > 0 ? c.fadeInFrom + (g - c.fadeInFrom) * ((s0 - a) / fi) : undefined;
  const to = c.fadeOutTo !== undefined && fadeOut > 0 ? c.fadeOutTo + (g - c.fadeOutTo) * ((b - e0) / fo) : undefined;
  return {
    src: c.src, in: c.in + (s0 - a) * speed, out: c.in + (e0 - a) * speed, at: s0 - w.start, gainDb: g,
    fadeIn, fadeOut, speed,
    ...(from !== undefined ? { fadeInFrom: from } : {}), ...(to !== undefined ? { fadeOutTo: to } : {}),
    ...(c.gainPoints?.length ? { gainPoints: c.gainPoints } : {}), what,
  };
}

/** What the clip of one option at one moment is made of: every sound of the cut in the window, except the sound laid
 *  at this moment now (a clip of the moment's sounds' folders that plays during it: the try the cut has there), and
 *  the option laid in its place. `option` undefined: the moment without any of them ("Without"). The option the cut
 *  already has there is laid as the cut has it (its own trim, gain and fades), so it is heard exactly as in the cut.
 *  Answers the pieces and the option the cut had at the moment, if any. */
export function piecesFor(tracks: TimelineTrack[], m: HearMoment, option: string | undefined, w: HearWindow): { pieces: HearPiece[]; inCut?: string } {
  const dirs = new Set(Object.values(m.places).map((p) => dirOf(p.file)));
  const byFile = new Map(Object.entries(m.places).map(([id, p]) => [filmRel(p.file), id]));
  const pieces: HearPiece[] = [];
  let inCut: string | undefined;
  let cutClip: TimelineClip | undefined;
  for (const tr of playing(tracks)) {
    for (const c of tr.clips) {
      if (c.muted || !c.src || c.plan) continue;
      const a = c.at, b = c.at + clipLen(c);
      // the sound laid at this moment now: one of the card's folders, playing while the moment plays
      if (dirs.has(dirOf(c.src)) && b > m.at + 0.01 && a < m.ends - 0.01) {
        const id = byFile.get(filmRel(c.src));
        if (id && !inCut) { inCut = id; cutClip = c; }
        continue;
      }
      const p = crop({ ...c, src: c.src }, w, `${tr.id} ${c.label ?? filmRel(c.src).split('/').pop()}`);
      if (p) pieces.push(p);
    }
  }
  if (option !== undefined) {
    const pl = m.places[option];
    const laid = cutClip && inCut === option
      ? { ...cutClip, src: cutClip.src! }
      : pl ? { src: pl.file, in: pl.in, out: pl.out, at: pl.at, gain: pl.gainDb, fadeIn: pl.fadeIn ?? m.fadeIn, fadeOut: pl.fadeOut ?? m.fadeOut } : undefined;
    const p = laid && crop(laid, w, `the option ${option}`);
    if (p) pieces.push(p);
  }
  return { pieces, ...(inCut ? { inCut } : {}) };
}

/** The option ids a moment can be heard with, in the card's order. */
export const momentOptions = (m: HearMoment, order: string[]): string[] => order.filter((id) => m.places[id]);

/** The moments a card's option can be heard at. */
export const momentsOf = (moments: HearMoment[] | undefined, option: string): HearMoment[] => (moments ?? []).filter((m) => m.places[option]);

/** Where the sound sits inside the clip, as fractions of it (the lit part of the clip's strip). */
export function spanIn(m: Pick<HearMoment, 'at' | 'ends'>, w: HearWindow): { left: number; width: number } {
  const d = w.end - w.start;
  const l = Math.min(1, Math.max(0, (m.at - w.start) / d)), r = Math.min(1, Math.max(0, (m.ends - w.start) / d));
  return { left: l, width: Math.max(0.01, r - l) };
}
