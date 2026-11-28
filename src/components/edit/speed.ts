// The speed control's maths. Pure: the clamp, the steps, the dial's
// angle and the length a clip takes at a speed. The change itself is retimeClips (model.ts), as before.

/** The limits the Inspector's speed box always had (retimeClips takes 0.1–10). */
export const SPEED_MIN = 10;
export const SPEED_MAX = 1000;
/** The presets offered under the number: normal, and the small steps worth trying around it. */
export const SPEED_PRESETS = [90, 100, 110, 115, 125, 150] as const;

/** A speed in whole percent, inside the limits (a NaN gives 100). */
export function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 100;
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(p)));
}

/** What a typed text means, or undefined while it is not a speed yet ("", "1", "abc", "5"): "115", "115%", " 115 % ",
 *  "1.15x" (a rate) all mean 115. A number under the limit is not clamped up: it may be the start of a longer one. */
export function parsePct(text: string): number | undefined {
  const t = text.trim().replace(/\s+/g, '').replace(/,/g, '.');
  const x = /^(\d+(?:\.\d+)?)x$/i.exec(t);
  const v = x ? Number(x[1]) * 100 : Number(t.replace(/%$/, ''));
  if (!t || !Number.isFinite(v) || v < SPEED_MIN) return undefined;
  return clampPct(v);
}

/** One nudge: 1%, or 5% with Shift, never past the limits. */
export function stepPct(p: number, dir: number, big = false): number {
  return clampPct(clampPct(p) + Math.sign(dir) * (big ? 5 : 1));
}

/** The percent a drag on the dial reaches: 1% for every 3 px right or up from where it began, five times as much
 *  with Shift. */
export function dragPct(from: number, dx: number, dy: number, big = false): number {
  return clampPct(from + Math.trunc((dx - dy) / 3) * (big ? 5 : 1));
}

/** The dial's needle in degrees from straight up: on a log scale, 100% up, 10% at −135°, 1000% at +135°, so the small
 *  steps around normal turn it as much either way. */
export function pctAngle(p: number): number {
  return Math.max(-135, Math.min(135, Math.log10(clampPct(p) / 100) * 135));
}

/** Frames a clip of `srcSec` seconds of its file lasts at `pct` (lenF's rounding: at least one frame). */
export function lenAtF(srcSec: number, pct: number, fps: number): number {
  return Math.max(1, Math.round((srcSec / (clampPct(pct) / 100)) * fps));
}

/** "2.00 s → 1.74 s · 6 f shorter", for clips of these file lengths, from their frames now to the new speed. */
export function lengthWords(srcs: number[], nowF: number, pct: number, fps: number): string {
  const after = srcs.reduce((n, s) => n + lenAtF(s, pct, fps), 0);
  const d = after - nowF;
  const s = (f: number) => `${(f / fps).toFixed(2)} s`;
  return `${s(nowF)} → ${s(after)}${d ? ` · ${Math.abs(d)} f ${d < 0 ? 'shorter' : 'longer'}` : ''}`;
}
