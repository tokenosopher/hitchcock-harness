// The user's own cover frame, any frame of the final: the frame arithmetic the page, the operations and the cover's
// offset share. A frame is named by its start, rounded UP to the millisecond, so the time in seconds, the still the
// media route makes at it and the offset in whole milliseconds (what an app that takes a cover time asks for) all land
// inside that frame,
// never on the one before. Pure.
import type { Platform, ThumbOption } from './file';

/** The id of the user's own frame among a platform's options ("mine", or "mine-2" when Alma used the name). */
export const USER_FRAME = 'mine';
/** Its `does`: the page draws "Your frame" and the timecode beside it. */
export const USER_DOES = 'your own frame';

const EPS = 1e-6;

/** The time, in seconds, that names frame `n` (counted from 0) of a video at `fps`. */
export const frameAt = (n: number, fps: number): number => Math.ceil(n * 1000 / fps - EPS) / 1000;
/** The frame a time falls in. */
export const frameOf = (at: number, fps: number): number => Math.max(0, Math.floor(at * fps + EPS));
/** How many frames a video of `seconds` holds at `fps` (at least one). */
export const frameCount = (seconds: number, fps: number): number => Math.max(1, Math.floor(seconds * fps + EPS));
/** A time in seconds as whole milliseconds (the cover's offset). */
export const offsetMs = (at: number): number => Math.round(at * 1000);
/** A time kept to the millisecond, as the file holds it. */
export const toMs = (at: number): number => offsetMs(at) / 1000;

/** "0:41.12": minutes, seconds and the frame within that second (two digits); "0:41.500" when the rate is not known. */
export function timecode(at: number, fps?: number): string {
  const s = Math.max(0, at);
  const m = Math.floor(s / 60);
  const whole = Math.floor(s - m * 60 + EPS);
  const ss = String(whole).padStart(2, '0');
  if (!fps) return `${m}:${ss}.${String(Math.round((s - m * 60 - whole) * 1000)).padStart(3, '0').slice(0, 3)}`;
  const ff = frameOf(s, fps) - Math.round((m * 60 + whole) * fps);
  return `${m}:${ss}.${String(Math.max(0, ff)).padStart(2, '0')}`;
}

/** The option in use on a platform, Alma's or the user's. */
export const pickedFrame = (p: Platform): ThumbOption | undefined => p.thumbnail?.options.find((o) => o.id === p.thumbnail?.pick);
/** The user's own frame on a platform, picked or not. */
export const userFrame = (p: Platform): ThumbOption | undefined => p.thumbnail?.options.find((o) => o.by === 'user');
/** The cover's offset for a platform, in milliseconds: the frame in use, whoever picked it. */
export const thumbOffset = (p: Platform): number | undefined => { const o = pickedFrame(p); return o ? offsetMs(o.at) : undefined; };
