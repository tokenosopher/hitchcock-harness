// Where a shot of a take stands in its scene (docs/places.md). Pure. The one rule is in
// places.ts shotPlaces, which every page asks (the Shots page, the Takes view through pickupRows.ts, Shot details); this
// file holds its parts that are not about the scene as a whole:
//   - the record a film's tool writes when a pick-up lands, `<G>/<G>-stands.json` (readStands): which place or places of
//     its scene each of its shots stands for, and, for an insert, which part of a place;
//   - matching a list of shots (the record's, or a shots file's) to the shots a take was really cut into, by count, else
//     by time, else one shot over all of them (matchShots): a list of 1 for a take cut in 2 places both pieces, never
//     neither (docs/places.md's eighth kind);
//   - where the cut has a clip among its scene's clips (gapOf): the places open between the placed clips before and
//     after it, and whether a place said elsewhere fits there (fitsGap).
// Nothing here guesses: what cannot be known comes back empty, with why.
import { parseShotId } from '@/components/edit/shotCols';

/** A place id as the scene names it: "4", "4a"; anything else as written, lowercased. */
export const placeTag = (raw: string): string => parseShotId(raw)?.tag ?? String(raw).trim().toLowerCase();
/** Places in order: by number, then letter ("4" before "4a" before "5"). */
export function placeCmp(a: string, b: string): number {
  const x = parseShotId(a), y = parseShotId(b);
  if (!x || !y) return x ? -1 : y ? 1 : a.localeCompare(b);
  return x.n - y.n || x.tag.localeCompare(y.tag);
}
/** "5", "5–6", "2, 4": the places a shot stands for, as the page shows them (a run of neighbours with a dash). */
export function placesLabel(places: string[], all?: string[]): string {
  if (places.length < 2) return places[0] ?? '';
  const run = all && places.every((p, k) => k === 0 || all.indexOf(p) === all.indexOf(places[k - 1]) + 1);
  return run || (!all && places.every((p, k) => k === 0 || parseShotId(p)!.n === parseShotId(places[k - 1])!.n + 1))
    ? `${places[0]}–${places[places.length - 1]}` : places.join(', ');
}

// ---------------------------------------------------------------------------------------------------- the record

/** Which part of a place a shot is, in seconds of that place as the scene's take plays it: an insert (FIX-close-S18 from
 *  4.75 s of place 1), or the start of a place that cuts back to another take (FIX-open-S16 to 4.5 s). */
export interface Inside { place: string; from?: number; to?: number }
/** One shot of a record: the places it stands for, in order (one, or several it replaces as one clip); where it lies in
 *  the take (seconds, optional); the part of a place it is (optional). */
export interface StandShot { places: string[]; t0?: number; t1?: number; inside?: Inside; note?: string }
/** `<G>/<G>-stands.json`, schema 1 (docs/places.md): the shots of every take of the pick-up, and a take's own list where
 *  one take differs (`takes`, by its folder name, "take2"). `scene` is the scene it is a pick-up of. */
export interface StandsRecord { schema: 1; scene?: string; shots: StandShot[]; takes?: Record<string, StandShot[]>; by?: string; at?: string }

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'number' ? String(v) : typeof v === 'string' && v.trim() ? v.trim() : undefined);

function readShot(v: unknown): StandShot | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const raw = r.stands_for ?? r.standsFor ?? r.places ?? r.place;
  const places = (Array.isArray(raw) ? raw.map(str) : [str(raw)]).filter((x): x is string => !!x).map(placeTag);
  const ins = r.inside && typeof r.inside === 'object' ? (r.inside as Record<string, unknown>) : undefined;
  const inPlace = ins ? str(ins.place) ?? places[0] : undefined;
  const inside: Inside | undefined = ins && inPlace ? { place: placeTag(inPlace), ...(num(ins.from) !== undefined ? { from: num(ins.from) } : {}), ...(num(ins.to) !== undefined ? { to: num(ins.to) } : {}) } : undefined;
  if (inside && !places.length) places.push(inside.place);
  if (!places.length || new Set(places).size !== places.length) return undefined;
  const t0 = num(r.t0), t1 = num(r.t1);
  return { places, ...(t0 !== undefined && t1 !== undefined && t1 > t0 ? { t0, t1 } : {}), ...(inside ? { inside } : {}), ...(str(r.note) ? { note: str(r.note) } : {}) };
}
const readShots = (v: unknown): StandShot[] | undefined => {
  if (!Array.isArray(v) || !v.length) return undefined;
  const out = v.map(readShot);
  return out.every(Boolean) ? (out as StandShot[]) : undefined;
};

/** A stands record read leniently: undefined when it is not one (no shots, a shot with no place, a schema not known). */
export function readStands(v: unknown): StandsRecord | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  if (r.schema !== undefined && r.schema !== 1 && r.schema !== '1') return undefined;
  const shots = readShots(r.shots);
  if (!shots) return undefined;
  const takes: Record<string, StandShot[]> = {};
  if (r.takes && typeof r.takes === 'object') for (const [k, x] of Object.entries(r.takes as Record<string, unknown>)) { const s = readShots(Array.isArray(x) ? x : (x as { shots?: unknown })?.shots); if (s) takes[k] = s; }
  return { schema: 1, ...(str(r.scene) ? { scene: str(r.scene) } : {}), shots, ...(Object.keys(takes).length ? { takes } : {}), ...(str(r.by) ? { by: str(r.by) } : {}), ...(str(r.at) ? { at: str(r.at) } : {}) };
}
/** The record's list for one take: its own when it has one (by the take's folder name), else the pick-up's. */
export const standsOfTake = (r: StandsRecord, takeDir: string): StandShot[] => r.takes?.[takeDir] ?? r.shots;

// ---------------------------------------------------------------------------------------------------- matching

export interface Seg { i: number; from: number; to: number }
/** What a list says of one shot of the take: the places it stands for (empty: none), the part of a place, and a note. */
export interface Claim { places: string[]; inside?: Inside; note?: string; piece?: { k: number; of: number } }

/** A list of shots (a record's, or a shots file's as one place each) matched to the shots the take was cut into:
 *  - as many: one each, in order;
 *  - else, when the list gives times in the take: each shot found goes with the listed shot it overlaps most; a listed
 *    shot that was cut in pieces gives one place to each when it stands for as many, else its places to all of them;
 *  - else one listed shot: it covers the whole take, so every piece stands where it does (one place each when it stands
 *    for as many as there are pieces);
 *  - else nothing is matched, and every shot says why.
 *  Every answer that does not come from equal counts says so: "the record says 1 shot, the take was cut into 2". */
export function matchShots(list: StandShot[], segs: Seg[], what = 'the record'): Claim[] {
  const n = list.length, m = segs.length;
  const said = `${what} says ${n} ${n === 1 ? 'shot' : 'shots'}, the take was cut into ${m}`;
  const of = (s: StandShot): Claim => ({ places: s.places, ...(s.inside ? { inside: s.inside } : {}), ...(s.note ? { note: s.note } : {}) });
  if (n === m) return list.map(of);
  const spread = (s: StandShot, pieces: number[]): Claim[] => pieces.length === 1
    ? [{ ...of(s), note: `${cap(said)}: matched by time.` }]
    : pieces.map((_, k) => (s.places.length === pieces.length
      ? { places: [s.places[k]], note: `${cap(said)}: piece ${k + 1} stands for place ${s.places[k]}.` }
      : { places: s.places, ...(s.inside ? { inside: s.inside } : {}), piece: { k: k + 1, of: pieces.length }, note: `${cap(said)}: piece ${k + 1} of ${pieces.length} of its shot ${placesLabel(s.places)}.` }));
  if (list.every((s) => s.t1 !== undefined)) {
    const over = (g: Seg, s: StandShot) => Math.max(0, Math.min(g.to, s.t1!) - Math.max(g.from, s.t0 ?? 0));
    // each shot found: the listed shots it holds more than half of (a cut the detector missed holds two), else the one
    // it overlaps most (a listed shot cut in pieces)
    const holds = segs.map((g) => {
      const many = list.flatMap((s, j) => (over(g, s) > 0.5 * (s.t1! - (s.t0 ?? 0)) ? [j] : []));
      if (many.length) return many;
      let k = -1, most = 0;
      list.forEach((s, j) => { const o = over(g, s); if (o > most + 1e-6) { most = o; k = j; } });
      return k < 0 ? [] : [k];
    });
    const out: Claim[] = segs.map(() => ({ places: [], note: `${cap(said)}, and this one lies outside the times it gives.` }));
    holds.forEach((h, x) => {
      if (h.length > 1) out[x] = { places: h.flatMap((j) => list[j].places), note: `${cap(said)}: this one holds its shots ${placesLabel(h.flatMap((j) => list[j].places))}.` };
    });
    list.forEach((s, j) => {
      const pieces = holds.flatMap((h, x) => (h.length === 1 && h[0] === j ? [x] : []));
      if (pieces.length) spread(s, pieces).forEach((c, k) => { out[pieces[k]] = c; });
    });
    return out;
  }
  if (n === 1) return spread(list[0], segs.map((_, x) => x));
  return segs.map(() => ({ places: [], note: `${cap(said)}, and gives no times to tell which is which.` }));
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------------- the cut

/** Where a clip sits among its scene's placed clips in the cut: the place of the placed clip before it and after it
 *  (undefined at the scene's start or end), and the places of the scene strictly between them that no other clip in the
 *  film fills. */
export interface Gap { after?: string; before?: string; open: string[] }

/** The gap a clip (`k`, its index among the scene's clips in film order) sits in. `placeOf` gives the places a clip
 *  stands for, or none (a clip that stands for 5 and 6 is "after 6" for the next and "before 5" for the one before);
 *  clips for which `skip` is true (the take's own others) are looked past. */
export function gapOf<C>(clips: C[], k: number, placeOf: (c: C) => string[] | undefined, skip: (c: C) => boolean, places: string[], filled: Set<string>): Gap {
  let after: string | undefined, before: string | undefined;
  for (let j = k - 1; j >= 0 && after === undefined; j--) if (!skip(clips[j])) after = placeOf(clips[j])?.at(-1);
  for (let j = k + 1; j < clips.length && before === undefined; j++) if (!skip(clips[j])) before = placeOf(clips[j])?.[0];
  const lo = after !== undefined ? places.indexOf(after) : -1;
  const hi = before !== undefined ? places.indexOf(before) : places.length;
  const open = lo < 0 && after !== undefined || hi < 0 ? [] : places.slice(lo + 1, hi).filter((p) => !filled.has(p));
  return { ...(after !== undefined ? { after } : {}), ...(before !== undefined ? { before } : {}), open };
}
/** A place said elsewhere fits where the cut has the clip: between the placed clips before and after it, either of them
 *  included (an insert inside a place, a place split in two, a pick-up that keeps the scene's own shot after it). */
export const fitsGap = (g: Gap, places: string[]): boolean =>
  places.every((p) => (g.after === undefined || placeCmp(p, g.after) >= 0) && (g.before === undefined || placeCmp(p, g.before) <= 0));
/** "after place 4", "before place 3", "after place 1 and before place 3", "the only clip of its scene". */
export const gapWords = (g: Gap): string =>
  [g.after !== undefined ? `after place ${g.after}` : '', g.before !== undefined ? `before place ${g.before}` : ''].filter(Boolean).join(' and ') || 'with no placed clip of its scene beside it';
