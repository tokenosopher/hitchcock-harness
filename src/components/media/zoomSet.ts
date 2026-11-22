// Which pictures the full-screen view steps through. It used to be every picture on the page; now it is the set the picture was opened from: the
// tile row or grid it sits in, the same tiles in the same order. A container can name its set with data-zoom-set;
// without one, the set is the nearest box around the picture that holds more than one picture, and the search never
// leaves the card (article), section or dialog the picture is in. The pure parts are tested in scripts/zoom-set-test.ts.

export interface ZoomEntry { src: string; alt: string }
/** One box on the way up from the picture: how many pictures it holds, and what kind of box it is. */
export interface ZoomBox { count: number; set?: boolean; edge?: boolean }

/** The index, in `boxes` (the picture's ancestors, nearest first), of the box whose pictures are its set; -1: the
 *  picture alone. A data-zoom-set box is the set; else the first box with more than one picture, never past an edge. */
export function scopeIndex(boxes: ZoomBox[]): number {
  const named = boxes.findIndex((b) => b.set);
  const stop = boxes.findIndex((b) => b.edge);
  const limit = [named, stop].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), boxes.length - 1);
  for (let i = 0; i <= limit; i++) if (boxes[i].set || boxes[i].count > 1) return i;
  return -1;
}

/** The pictures of the set in the order they are drawn, the same file once, and where the opened one is. */
export function zoomList<T extends ZoomEntry>(entries: T[], opened: number): { list: T[]; i: number } {
  const list: T[] = [];
  let i = 0;
  entries.forEach((e, k) => {
    if (k === opened) i = list.length;
    else if (list.some((s) => s.src === e.src) || entries[opened]?.src === e.src) return;
    list.push(e);
  });
  return { list, i };
}

/** The next or previous picture; it goes round from the last to the first. */
export const stepIndex = (i: number, d: number, n: number): number => (n ? (i + d + n) % n : 0);

/** A touch that moved mostly sideways, far enough: +1 (it went left: the next picture), -1, or 0. */
export function swipeStep(dx: number, dy: number, min = 40): number {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

const EDGE = 'article, section, [role="dialog"], main';

/** The picture elements of the set `el` belongs to (`el` included), in page order. */
export function zoomScope(el: Element): HTMLElement[] {
  const boxes: Element[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) boxes.push(p);
  const at = scopeIndex(boxes.map((b) => ({ count: b.querySelectorAll('[data-zoom]').length, set: b.hasAttribute('data-zoom-set'), edge: b.matches(EDGE) })));
  const all = at < 0 ? [el as HTMLElement] : Array.from(boxes[at].querySelectorAll<HTMLElement>('[data-zoom]'));
  return all.filter((e) => e.offsetParent !== null || e === el);
}

/** The control that chooses this picture's tile, as a tap on the tile does: the tile itself when it is the button
 *  (data-zoom-choose around the picture), else the one inside its data-zoom-item. */
export function chooserOf(el: Element | undefined): HTMLElement | null {
  if (!el) return null;
  const own = el.closest<HTMLElement>('[data-zoom-choose]');
  if (own) return own;
  return el.closest('[data-zoom-item]')?.querySelector<HTMLElement>('[data-zoom-choose]') ?? null;
}

/** Whether that control's choice is made: its data-zoom-chosen where it says (a pick card's tile is selected to look
 *  at before it is chosen), else aria-pressed or aria-checked. */
export const isChosen = (c: Element | null): boolean => {
  if (!c) return false;
  const own = c.getAttribute('data-zoom-chosen');
  if (own !== null) return own === 'true';
  return c.getAttribute('aria-pressed') === 'true' || c.getAttribute('aria-checked') === 'true';
};
