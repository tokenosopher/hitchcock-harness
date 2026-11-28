// The pick-ups in the Takes view: listed with the takes under the layout, so one can be switched for another. Pure: the Edit page (EditPage.tsx) and
// scripts/pickuprows-test.ts use it.
//
// A pick-up's take is a row of its scene, as the scene's own takes are. Each of its shots sits in the column of the
// place it stands for, as the Shots page places it (components/shots/places.ts, the one mapping, never a second): a
// one-shot pick-up of place 1 in Shot 1's column, FIX-close-S6 (which calls its shot "10") in the column the cut has it
// in. Its numbers are the take's for the whole page, so a click tries it in that place, the cut's clip of it is "in the
// film" there, and a drag puts it there, as with every other take. A shot whose place is not known is shown in an "Other
// shots" column at the end, with why; a click on it still tries it where its own number says. A shot that stands for
// several places (FIX-year-S1 take 2 for 5 and 6) sits under the first and is named "5–6" (`stands`). Where a place
// comes from, and in what order the evidence counts, is places.ts's alone (docs/places.md).
//
// Copies: before this, pick-up takes were copied by hand under their scene's take 1 as variations (their
// variation.json says `copyOf`, the pick-up take's file). Once that take is listed in its own right the copy is left
// out of the rows and of every count of takes ("new" tags, the strip's dots); a clip of the copy in the cut marks the
// pick-up's own shot as in the film. Nothing on disk is changed.
import type { Timeline } from '@/server/types';
import { genOf, shotPlaces, takeFolder, takeLabel, type GenPlan, type Made } from '@/components/shots/places';
import { parseShotId } from './shotCols';
import { shotsOf, type BySrc, type TakeShots } from './shots';

/** A shot shown in the "Other shots" column: its take's file and its place in the take (1, 2, 3 …). */
export const otherKey = (src: string, i: number): string => `${src}|${i}`;

/** How a take's shots are numbered here: `ids`/`tags` as TakeShots carries them, and the shots (by `i`) whose place is
 *  not known. */
export interface Placed { ids: number[]; tags?: string[]; other: number[] }

export interface PickupView {
  /** The takes the page lists: a copy of a listed take left out; each pick-up take numbered by the places it stands for. */
  takes: TakeShots[];
  /** Every ready take by its file, the copies too (the cut may play one), a copy numbered as the take it copies. */
  by: BySrc;
  /** The shots shown under "Other shots" (otherKey). */
  other: Set<string>;
  /** A copy's file → the file of the take it copies, for the takes listed in their own right. */
  alias: Map<string, string>;
  /** Each pick-up take's numbers, for `keep` the next time (a place the cut gave stays when the cut changes). */
  placed: Map<string, Placed>;
  /** What the shots of pick-ups stand for, by otherKey, where the column alone does not say it: `label` "5–6" for a shot
   *  that stands for several places, and `note`, how its place was known or why it has none (places.ts says). */
  stands: Map<string, { label?: string; note?: string; conflict?: string }>;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const norm = (p: string) => p.trim().replace(/\\/g, '/').replace(/^\.\//, '');

/** The copies among the takes: a variation whose `copyOf` names another take listed here (by its file, or by the same
 *  path under the film), → that take's file. */
export function copiesOf(takes: TakeShots[]): Map<string, string> {
  const out = new Map<string, string>();
  const real = takes.filter((t) => !t.variation?.copyOf);
  for (const t of takes) {
    const c = t.variation?.copyOf;
    if (!c) continue;
    const want = norm(c);
    const orig = real.find((x) => x.src === want || x.src.endsWith(`/${want}`) || want.endsWith(`/${x.src}`));
    if (orig && orig.src !== t.src) out.set(t.src, orig.src);
  }
  return out;
}

/** A pick-up take: a take of another generation folder than its scene's own (generations/FIX-egg-S2 for S2). Tests and
 *  blocks keep their own ways (a take with a `group` is a test). */
export const isPickup = (t: TakeShots): boolean => !t.group && !t.variation && genOf(t.src) !== t.scene && /^FIX-/i.test(genOf(t.src));

/** The cut with every clip of a copy played from the take it copies. */
export function unCopied(cut: Timeline | undefined, alias: Map<string, string>): Timeline | undefined {
  if (!cut || !alias.size) return cut;
  return { ...cut, tracks: cut.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.src && alias.has(c.src) ? { ...c, src: alias.get(c.src)! } : c)) })) };
}

/** The numbers a take's shots get from their places, or undefined when they do not make a whole set (two shots of one
 *  number with nothing telling them apart). Unknown places keep the shot's own number. */
function numbersOf(own: { n: number; i: number; tag?: string }[], place: (i: number) => string | undefined): { ids: number[]; tags?: string[] } | undefined {
  const parts = own.map((s) => {
    const p = place(s.i);
    const id = p !== undefined ? parseShotId(p) : undefined;
    return id ?? { n: s.n, tag: s.tag ?? String(s.n) };
  });
  // two shots that stand for one place (a shot the take was cut in two that its list calls one): told apart by
  // a letter in the take's numbers, side by side in the place's cell; the page names them by what they stand for
  if (parts.every((x) => x.tag === String(x.n)) && new Set(parts.map((x) => x.n)).size !== parts.length) {
    const seen = new Map<number, number>();
    const many = (n: number) => parts.filter((x) => x.n === n).length > 1;
    parts.forEach((x, k) => { if (many(x.n)) { const j = seen.get(x.n) ?? 0; seen.set(x.n, j + 1); parts[k] = { n: x.n, tag: `${x.n}${String.fromCharCode(97 + j)}` }; } });
  }
  const lettered = parts.some((x) => x.tag !== String(x.n));
  const keys = parts.map((x) => (lettered ? x.tag : String(x.n)));
  if (new Set(keys).size !== keys.length) return undefined;
  if (lettered && !parts.every((x) => parseShotId(x.tag)?.n === x.n)) return undefined;
  return { ids: parts.map((x) => x.n), ...(lettered ? { tags: parts.map((x) => x.tag) } : {}) };
}

/** The takes as the Takes view lists them (see the head of this file). `gens` and `checks` are the Shots page's
 *  (GET …/shotlist); without them the pick-ups keep the numbers the server gave. `keep`: the last answer's `placed`. */
export function pickupView(input: {
  takes: TakeShots[]; scenes: { id: string; title?: string; shots?: number }[];
  gens?: GenPlan[]; checks?: Record<string, number[]>; cut?: Timeline; keep?: Map<string, Placed>;
}): PickupView {
  const alias = copiesOf(input.takes);
  // a pick-up's take named as the cut names it: "FIX-close-S6 · take 2" (the server says "FIX close S6 · take 2")
  const listed = input.takes.filter((t) => !alias.has(t.src)).map((t) => (isPickup(t) ? { ...t, name: `${genOf(t.src)} · ${lower(takeLabel(t.name, genOf(t.src)))}` } : t));
  const placed = new Map<string, Placed>();
  const other = new Set<string>();
  const stands = new Map<string, { label?: string; note?: string; conflict?: string }>();
  let takes = listed;
  if (input.gens) {
    const checks = input.checks ?? {};
    const list = shotPlaces({
      scenes: input.scenes.map((s) => ({ id: s.id, title: s.title ?? s.id, ...(s.shots ? { shots: s.shots } : {}) })),
      gens: input.gens,
      takes: listed.map((t) => ({ ...t, ...(checks[takeFolder(t.src)] ? { planned: checks[takeFolder(t.src)] } : {}) })),
      cut: unCopied(input.cut, alias),
    });
    // every shot of every take: the place it stands for, or none (with whether the film uses it)
    const where = new Map<string, { place?: string; inFilm: boolean }>();
    const put = (m: Made, place?: string) => {
      const k = otherKey(m.src, m.i);
      if (!where.has(k) || (place && !where.get(k)!.place)) where.set(k, { ...(place ? { place } : {}), inFilm: m.inFilm });
      if (m.label || m.note || m.conflict) stands.set(k, { ...(m.label ? { label: m.label } : {}), ...(m.note ? { note: m.note } : {}), ...(m.conflict ? { conflict: m.conflict } : {}) });
    };
    for (const s of list.scenes) {
      for (const v of s.versions) for (const p of v.places) for (const m of p.versions) put(m, p.id);
      for (const m of s.other) put(m);
      for (const x of s.extras) put(x.v);
    }
    takes = listed.map((t) => {
      if (!isPickup(t) || t.state !== 'ready') return t;
      const own = shotsOf(t);
      if (!own.length) return t;
      const was = input.keep?.get(t.src);
      const kept = was && was.ids.length === own.length ? was : undefined;
      const unknown: number[] = [];
      const place = (i: number): string | undefined => {
        const w = where.get(otherKey(t.src, i));
        if (w?.place) return w.place;
        // a place the cut gave before stays when the cut no longer says (the shot was swapped out)
        if (kept && !kept.other.includes(i)) return kept.tags?.[i - 1] ?? String(kept.ids[i - 1]);
        // nothing says which place it stands for, the cut included: it is one of the other shots, in the film or not
        // (before the one rule, one in the film stayed under its own number)
        unknown.push(i);
        return undefined;
      };
      const nums = numbersOf(own, place);
      const p: Placed = { ...(nums ?? { ids: own.map((s) => s.n), ...(own.some((s) => s.tag) ? { tags: own.map((s) => s.tag ?? String(s.n)) } : {}) }), other: unknown };
      placed.set(t.src, p);
      for (const i of unknown) other.add(otherKey(t.src, i));
      const { ids: _i, tags: _t, ...rest } = t;
      void _i; void _t;
      return { ...rest, ids: p.ids, ...(p.tags ? { tags: p.tags } : {}) };
    });
  }
  // a copy carries the numbers of the take it copies, so its clip in the cut stands in the same place
  const bySrc = new Map(takes.map((t) => [t.src, t]));
  const copies = input.takes.filter((t) => alias.has(t.src)).map((t) => {
    const o = bySrc.get(alias.get(t.src)!);
    if (!o || shotsOf(o).length !== shotsOf(t).length || o.state !== 'ready' || t.state !== 'ready') return t;
    const { ids: _i, tags: _t, ...rest } = t;
    void _i; void _t;
    return { ...rest, ...(o.ids ? { ids: o.ids } : {}), ...(o.tags ? { tags: o.tags } : {}) };
  });
  const by: BySrc = new Map([...takes, ...copies].filter((t) => t.state === 'ready').map((t) => [t.src, t]));
  return { takes, by, other, alias, placed, stands };
}

/** The shots the film uses ("<src>#<n>", components/edit/shots.ts inFilm), each copy's also said as the take it copies. */
export function withAliases(used: Set<string>, alias: Map<string, string> | undefined): Set<string> {
  if (!alias?.size) return used;
  const out = new Set(used);
  for (const k of used) {
    const h = k.lastIndexOf('#');
    const src = k.slice(0, h);
    const o = alias.get(src);
    if (o) out.add(`${o}${k.slice(h)}`);
  }
  return out;
}
