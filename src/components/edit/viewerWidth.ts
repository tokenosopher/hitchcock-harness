// How wide the Edit page's viewer column is. The
// edge between the viewer and the timeline's column is dragged (ViewerEdge.tsx); the width is kept in this browser.
// Pure: the limits, the step of a key, the stored value read back, and the CSS that holds the same limits while the
// window changes size. No React, no DOM.

export const VIEWER_W = {
  key: 'hh-size-viewer',
  initial: 252,        // the column as it always was
  min: 236,            // the play controls (204 px) and the column's paddings and scrollbar (32 px) still fit
  rightMin: 480,       // the timeline's column: its tools and tracks, and the Takes header's words beside its key, still read (at 428, the narrowest Edit page, those words stood one to a line)
  step: 16,            // an arrow key
  bigStep: 48,         // Shift and an arrow key (as the films list's and Alma's edges)
} as const;

/** The column around the picture, across: its paddings (16 + 10) and its scrollbar's gutter (6). */
export const COL_CHROME_X = 32;
/** The window's height that is not picture: the header (56) and the line under it (91 when its words take two rows),
 *  the column's paddings, the gap and the play controls under the picture (75), and a little room under them; so the
 *  picture and its controls are in view when the page opens. */
export const PIC_ROOM_Y = 266;
/** The picture is never held smaller than this by the window's height (it was 240 px at most before). */
export const PIC_FLOOR = 240;

/** The widest the picture can usefully be: as tall as the column leaves room for, the play controls still under it. */
export function picMaxWidth(viewportH: number, aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 9 / 16;
  return Math.max(PIC_FLOOR, (viewportH - PIC_ROOM_Y) * a);
}

/** The widest the column can be: the timeline's column keeps its minimum, and the column is never wider than its
 *  picture can grow. Never less than the width it always had. */
export function maxWidth(row: number, viewportH: number, aspect: number): number {
  return Math.max(VIEWER_W.initial, Math.min(row - VIEWER_W.rightMin, picMaxWidth(viewportH, aspect) + COL_CHROME_X));
}

/** A width held between the minimum and `max`, in whole pixels. */
export function clampWidth(w: number, max: number): number {
  const x = Number.isFinite(w) ? w : VIEWER_W.initial;
  return Math.round(Math.min(Math.max(x, VIEWER_W.min), Math.max(VIEWER_W.min, max)));
}

/** The stored width, or undefined when there is none or it is not a usable number (the default is used then). */
export function parseWidth(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const x = Number(raw);
  if (!Number.isFinite(x) || x < 100 || x > 8000) return undefined;
  return Math.round(x);
}

/** The width after a key on the edge, or undefined when the key does nothing there. Right is wider (the picture is
 *  at the left), Left narrower; Home and End go to either end. */
export function keyWidth(key: string, shift: boolean, w: number, max: number): number | undefined {
  const step = shift ? VIEWER_W.bigStep : VIEWER_W.step;
  if (key === 'ArrowRight') return clampWidth(w + step, max);
  if (key === 'ArrowLeft') return clampWidth(w - step, max);
  if (key === 'Home') return VIEWER_W.min;
  if (key === 'End') return clampWidth(max, max);
  return undefined;
}

/** A drag moved this far is a drag; less is a click (two of them close together put the width back). */
export const TAP_SLOP = 3;
export const DOUBLE_TAP_MS = 400;
export function isDoubleTap(prev: { t: number; x: number } | undefined, t: number, x: number): boolean {
  return !!prev && t - prev.t >= 0 && t - prev.t < DOUBLE_TAP_MS && Math.abs(x - prev.x) <= 8;
}

/** The column's width in CSS, the same limits as maxWidth, so a window made smaller later keeps them without a
 *  script. The chosen width comes in as --viewer-w (set by ViewerEdge.tsx). */
export function colWidthCss(w: number, h: number): string {
  const { initial, min, rightMin } = VIEWER_W;
  const most = `max(${initial}px, min(100% - ${rightMin}px, ${picWidthCss(w, h)} + ${COL_CHROME_X}px))`;
  // a landscape film: the picture is as wide as the row allows until a width is chosen
  return `clamp(${min}px, var(--viewer-w, ${isWideFrame(w, h) ? most : `${initial}px`}), ${most})`;
}

/** A frame wider than tall: the viewer opens at its widest, and its chosen width is kept apart from a portrait film's. */
export const isWideFrame = (w: number, h: number): boolean => Number.isFinite(w) && Number.isFinite(h) && w > h;
/** Where the chosen width is kept: one for portrait films (as always), one for landscape ones. */
export const widthKey = (aspect: number): string => (aspect > 1 ? `${VIEWER_W.key}-wide` : VIEWER_W.key);

/** The picture's widest in CSS: as picMaxWidth, from the window's height. */
function picWidthCss(w: number, h: number): string {
  const ok = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  return `max(${PIC_FLOOR}px, (100dvh - ${PIC_ROOM_Y}px) * ${ok ? w : 9} / ${ok ? h : 16})`;
}

/** The picture's width in its column: all of it, up to the widest it can usefully be. */
export function stageWidthCss(w: number, h: number): string {
  return `min(100%, ${picWidthCss(w, h)})`;
}
