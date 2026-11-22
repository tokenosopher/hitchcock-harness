// The phone's keyboard and Alma's bar: the pure maths, checked by scripts/keyboard-test.ts.

/** How far the phone's bar (fixed to the bottom of the layout viewport) must rise to sit on the keyboard (after the
 *  story's "Alma" button her box must not sit behind the keyboard). iOS Safari shrinks only the visual
 *  viewport for the keyboard (and its accessory row, the arrows and ✓, which `height` already leaves out), so the bar
 *  rises by the layout viewport's height less the visual viewport's bottom: `innerHeight - (offsetTop + height)`.
 *  Under a pixel is no keyboard, and it never goes down. */
export function keyboardLift(layoutH: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv || !(layoutH > 0)) return 0;
  const lift = layoutH - vv.height - vv.offsetTop;
  return lift >= 1 ? Math.round(lift) : 0;
}

/** Where a paragraph's top should go after the story's "Alma" button hands the focus to her box: where it was (`was`),
 *  unless its first lines (`need`: its height, at most what fits) would fall under the bar or the keyboard (`bottom`)
 *  or above the page's top (`top`); then just inside, `margin` clear. All in the same screen coordinates. */
export function keepParaAt(was: number, need: number, top: number, bottom: number, margin = 12): number {
  const room = Math.max(0, bottom - top - 2 * margin);
  const h = Math.min(Math.max(0, need), room);
  if (was + h > bottom - margin) return Math.max(top + margin, bottom - margin - h);
  if (was < top + margin) return top + margin;
  return was;
}
