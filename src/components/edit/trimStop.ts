// Why a trim handle stops, when a clip cannot be enlarged all the way to its beginning. Pure: Tracks.tsx and scripts/trimstop-test.ts use it.
//
// A clip's head or tail grows until the first or last frame of its file, of its shot (a take cut into shots), or, with
// ripple off (the R key), the clip next to it: gaps stay open then, and nothing is ever written over. With ripple on (the
// page's default) a grown edge pushes what follows along on every track, its linked sound with it, as one step
// (model.ts trimClip). Before this the handle stopped at the clip next to it with no word; now it says why, and the
// way to push the clips along. Only stops for a trim that grows the clip: a trim that shortens it stops at one frame.
import type { Timeline } from '@/server/types';
import { clipName, endF, findClip, startF, trimLimit, type ClipFrames, type ClipRef, type NameOf } from './model';

export interface TrimStop {
  /** The frames the trim goes, as trimLimit says. */
  d: number;
  /** A few words for the tag at the handle ("the clip before"), when it stops short of what was asked. */
  why?: string;
  /** A sentence for the status line when it stops at a neighbour: what is in the way and how to push it along. */
  say?: string;
}

/** How far a trim of `d` frames goes and, when it stops short while growing the clip, why. */
export function trimStop(tl: Timeline, r: ClipRef, edge: 'head' | 'tail', d: number, ripple: boolean, frames?: ClipFrames, nameOf?: NameOf): TrimStop {
  const lw = trimLimit(tl, r, edge, d, ripple, frames);
  const grow = edge === 'head' ? d < 0 : d > 0;
  if (!grow || !lw.why || lw.d === d) return { d: lw.d };
  if (lw.why !== 'the clip before' && lw.why !== 'the next clip') return { d: lw.d, why: lw.why };
  // the neighbour and the file's (or the shot's) end on one frame: ripple would not take it further, so the file says why
  const far = trimLimit(tl, r, edge, d, true, frames);
  if (far.d === lw.d) return { d: lw.d, ...(far.why ? { why: far.why } : {}) };
  // the neighbour in the way: the clip on the same track whose edge the handle reached
  const f = findClip(tl, r);
  const fps = tl.fps;
  const at = f ? (edge === 'head' ? startF(f.clip, fps) : endF(f.clip, fps)) + lw.d : undefined;
  const k = f && at !== undefined ? f.track.clips.find((c) => c.id !== f.clip.id && (edge === 'head' ? endF(c, fps) : startF(c, fps)) === at) : undefined;
  const name = k ? nameOf?.(k) ?? clipName(k) : undefined;
  const where = edge === 'head' ? 'the clip before it' : 'the clip after it';
  return {
    d: lw.d, why: lw.why,
    say: `Stops at ${where}${name ? ` (${name})` : ''}: ripple is off, so it is not written over. Press R to turn ripple on and drag again; the clips after it move along, its sound with it, as one step.`,
  };
}
