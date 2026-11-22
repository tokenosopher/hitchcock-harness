// The sidebar's order and each row's mark. Pure, so scripts/recent-test.ts checks them without a browser.
// Order: the film that moved last goes first, as ChatGPT and Claude list their chats; a film moves only when the user
// writes in it or a new item comes to wait in its "Waiting for you", never for Alma working in
// the background or her reply alone.

/** `items` newest activity first. An item with no activity keeps its place relative to the others without, after
 *  every item that has one; two items with the same time keep their order too (a stable sort). */
export function byRecent<T>(items: readonly T[], keyOf: (t: T) => string, activity: Readonly<Record<string, string | undefined>>): T[] {
  const time = (t: T): number => {
    const v = activity[keyOf(t)];
    const ms = v ? Date.parse(v) : NaN;
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  return items.map((t, i) => ({ t, i, at: time(t) }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : b.at - a.at))
    .map((x) => x.t);
}

/** While the user presses in the list, the rows stay where they were: `held` is the order shown when the press
 *  began. Items that came since go after the held ones (in `items`' order); items gone are left out. */
export function holdOrder<T>(items: readonly T[], keyOf: (t: T) => string, held: readonly string[] | null): T[] {
  if (!held) return [...items];
  const pos = new Map(held.map((k, i) => [k, i]));
  return items.map((t, i) => ({ t, i, p: pos.get(keyOf(t)) ?? held.length + i }))
    .sort((a, b) => a.p - b.p)
    .map((x) => x.t);
}

/** A film row's one mark: white when something needs the user, the orb when Alma only works. `attention`, the white
 *  dot: at least one item in the film's "Waiting for you"; her reply or a sub-agent's end not yet seen does not make
 *  it white (the unread count stays in the tooltip). `working`, the glowing orb: Alma is at work and nothing waits.
 *  When both hold, the white dot alone: what needs the user wins, and a glow behind it would read as the orb. */
export type RowMarkKind = 'attention' | 'working';
export function rowMark(o: { waiting: number; working: boolean }): RowMarkKind | undefined {
  if (o.waiting > 0) return 'attention';
  return o.working ? 'working' : undefined;
}

/** The mark's tooltip and label: "2 waiting for you", "Alma is working", the unread count after it as extra words. */
export function rowMarkLabel(mark: RowMarkKind | undefined, o: { waiting: number; unread?: number; last?: string }): string | undefined {
  if (!mark) return undefined;
  const main = mark === 'attention' ? `${o.waiting} waiting for you` : 'Alma is working';
  return o.unread ? `${main} · ${o.unread} unread${o.last ? `: ${o.last}` : ''}` : main;
}
