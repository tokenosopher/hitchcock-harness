// A variation of only some shots of a take: often only one shot is varied and the others are exactly as they were, and
// the Takes view should show that. Alma writes the shots she changed in the variation's `variation.json` as `shots` (["3"], ["4a"]), named
// as the Takes view names the take's shots: the column's number, with the letter a shot added to that one carries
// ("4a"). The Takes view then marks those shots and shows the rest as the same as the source take. No `shots`, or none
// that names a shot of the take: the whole take is varied, as before.
import { parseShotId } from './shotCols';
import { subTag, type Shot } from './shots';

/** `variation.json`'s `shots`, read leniently: each a shot's id ("3", "4a", 3, "Shot 4A", "shot 3"), as the view names
 *  it ("4a"), once each, in the order written. Anything else is left out; undefined when none is left. */
export function readVariedShots(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    const raw = typeof x === 'string' ? x.replace(/^\s*shots?\b\s*/i, '') : x;
    const p = parseShotId(raw);
    if (p && !out.includes(p.tag)) out.push(p.tag);
  }
  return out.length ? out : undefined;
}

/** A shot's name in the view: its own id when it has a letter ("4a"), else its column's number ("3"). */
export const shotName = (s: Shot): string => subTag(s) ?? String(s.n);

/** Does `id` ("4", "4a") name shot `s`: "4a" only the shot of that id; "4" every shot under Shot 4 (4, or 4a and 4b). */
const names = (id: string, s: Shot): boolean => {
  const p = parseShotId(id);
  if (!p) return false;
  return p.tag === String(p.n) ? s.n === p.n : subTag(s) === p.tag;
};

/** The places in the take (`Shot.i`) of the shots a variation changed; undefined when `varied` is absent or names none
 *  of the take's shots (the whole take is varied). */
export function changedPlaces(shots: Shot[], varied: string[] | undefined): Set<number> | undefined {
  if (!varied?.length) return undefined;
  const hit = new Set(shots.filter((s) => varied.some((id) => names(id, s))).map((s) => s.i));
  return hit.size ? hit : undefined;
}

/** "shot 3 only", "shots 3 and 4a", "shots 2, 3 and 5". */
export function shotsWords(ids: string[]): string {
  if (ids.length === 1) return `shot ${ids[0]} only`;
  return `shots ${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

/** What a variation row says of its shots: the words ("shot 3 only") and the places of the changed shots, or nothing
 *  when the whole take is varied. A take with no shots yet (being made, could not be made) says the ids as written. */
export function variedOf(shots: Shot[], varied: string[] | undefined): { words: string; changed?: Set<number> } | undefined {
  if (!varied?.length) return undefined;
  if (!shots.length) return { words: shotsWords(varied) };
  const changed = changedPlaces(shots, varied);
  if (!changed) return undefined;
  const ids = [...new Set(shots.filter((s) => changed.has(s.i)).map(shotName))];
  return { words: shotsWords(ids), changed };
}
