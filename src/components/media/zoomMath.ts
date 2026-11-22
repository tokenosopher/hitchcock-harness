// The full-screen view's zoom. The picture keeps its place in the view (fitted, centred) and is drawn
// moved by (x, y) and scaled by s about its own centre. Every point here is measured from that centre at fit, in CSS
// pixels. Pure: tested in scripts/zoom-math-test.ts; Lightbox.tsx does the gestures.

export interface ZoomView { s: number; x: number; y: number }
/** The picture's size at fit, and the box it is seen through, as edges measured from the picture's centre at fit. */
export interface ZoomFrame { w: number; h: number; left: number; right: number; top: number; bottom: number }

export const FIT: ZoomView = { s: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;
export const TAP_ZOOM = 2.5;

export const isFit = (v: ZoomView): boolean => v.s <= 1.001;
const clampScale = (s: number): number => Math.min(MAX_ZOOM, Math.max(1, s));

/** One axis: the picture may not leave a gap at an edge when it is wider than the box, nor leave the box when narrower. */
function clampAxis(t: number, s: number, size: number, lo: number, hi: number): number {
  const a = lo + (s * size) / 2; // its near edge on the box's near edge
  const b = hi - (s * size) / 2; // its far edge on the box's far edge
  return Math.min(Math.max(a, b), Math.max(Math.min(a, b), t));
}

/** The view kept inside the frame: scale in 1..MAX_ZOOM, no empty band beside a picture larger than the box. */
export function clampView(v: ZoomView, f: ZoomFrame): ZoomView {
  const s = clampScale(v.s);
  if (s <= 1.001) return { ...FIT };
  return { s, x: clampAxis(v.x, s, f.w, f.left, f.right), y: clampAxis(v.y, s, f.h, f.top, f.bottom) };
}

/** Scaled to `s` about the point (px, py): the bit of picture under that point stays under it. */
export function zoomAt(v: ZoomView, s: number, px: number, py: number, f: ZoomFrame): ZoomView {
  const n = clampScale(s);
  const k = n / v.s;
  return clampView({ s: n, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, f);
}

/** A two-finger pinch: from the view at its start, the fingers' midpoint then (m0) and now (m), and how far their
 *  spread has grown (ratio). It zooms about the pinch and follows the midpoint as it moves. */
export function pinch(start: ZoomView, m0: { x: number; y: number }, m: { x: number; y: number }, ratio: number, f: ZoomFrame): ZoomView {
  const n = clampScale(start.s * ratio);
  const k = n / start.s;
  return clampView({ s: n, x: m.x - (m0.x - start.x) * k, y: m.y - (m0.y - start.y) * k }, f);
}

/** A drag by (dx, dy) from the view at its start. */
export const pan = (start: ZoomView, dx: number, dy: number, f: ZoomFrame): ZoomView => clampView({ ...start, x: start.x + dx, y: start.y + dy }, f);

/** A double-tap or double-click: at fit it zooms to TAP_ZOOM at that point; zoomed, it goes back to fit. */
export const toggleAt = (v: ZoomView, px: number, py: number, f: ZoomFrame): ZoomView => (isFit(v) ? zoomAt(v, TAP_ZOOM, px, py, f) : { ...FIT });

/** The wheel (a trackpad pinch arrives as a wheel with ctrlKey): a notch of 100 px is about 1.25x. */
export const wheelScale = (s: number, deltaY: number, ctrl: boolean): number => s * Math.exp(-deltaY * (ctrl ? 0.01 : 0.0022));

/** The `+`, `-` and `0` keys: the next step in or out, or fit; undefined for any other key. */
export function keyScale(s: number, key: string): number | undefined {
  if (key === '+' || key === '=') return s * 1.5;
  if (key === '-' || key === '_') return s / 1.5;
  if (key === '0') return 1;
  return undefined;
}

/** Whether the picture as drawn (its fitted CSS width × scale × device pixels) asks for more pixels than the file
 *  shown has: then a larger file is worth loading. */
export const needsSharper = (s: number, fitWidth: number, dpr: number, naturalWidth: number): boolean =>
  naturalWidth > 0 && s * fitWidth * dpr > naturalWidth * 1.1;

/** The address of a larger file of the same picture: a media-route thumbnail (`&w=`) becomes the original, or, for
 *  a PDF page (it has no original picture), the largest thumbnail; undefined when it already is the largest. */
export function sharperSrc(src: string, maxThumb = 960): string | undefined {
  const [base, query] = src.split('?');
  if (!query || !base.endsWith('/api/media')) return undefined;
  const q = new URLSearchParams(query);
  const w = Number(q.get('w') || 0);
  if (!w) return undefined;
  if (/\.pdf$/i.test(q.get('p') ?? '')) {
    if (w >= maxThumb) return undefined;
    q.set('w', String(maxThumb));
  } else {
    q.delete('w');
    q.delete('t');
  }
  return `${base}?${q.toString()}`;
}
