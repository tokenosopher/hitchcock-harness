// The New takes page: going through the takes that came back. Pure: the page (TakesInboxPage.tsx), the film page's
// count (MainPage.tsx), the Edit page's Takes tab link and scripts/takesinbox-test.ts use it.
//
// Which takes: a take "came back" when it is ready and landed after the film's list of takes looked at began
// (seenTakes.ts: its `since`, or kept new then). The list ("To look at") holds the ones that came back and are new (not
// looked at: not played here or on the Edit page, not put in the film) or kept for later; a take used or rejected here
// leaves it, and so does one the cut already plays (Alma put it in: a scene's first take, a pick-up she cut in), which
// "All takes that came back" shows as in the film. Newest first; the ones kept for later after the rest, newest first again. "All takes that came back" shows
// every one, the decided too. A take looked at while the page is open stays listed until the page is left (`hold`), so
// stepping back to it works; the count is the list as the page opens it.
//
// What a Use does is the Takes view's "Use in the film": each shot of the take, at the place it stands for (places.ts,
// as pickupRows.ts numbers a pick-up's shots), through shots.ts withPicks, as one step of the cut. `replaceOf` reads
// what that step takes out of the picture and what it puts in, from the two cuts themselves.
import type { Timeline, TimelineClip } from '@/server/types';
import { isNewTake, type Looked } from '@/components/edit/seenTakes';
import { endF, startF, totalF } from '@/components/edit/model';
import { mainTracks, shotsOf, withPicks, type BySrc, type Pick, type TakeShots } from '@/components/edit/shots';
import { genOf, takeFolder, takeLabel } from '@/components/shots/places';
import { placesLabel } from '@/components/shots/stands';
import type { Decided, DecidedMap } from './decisions';

/** Ready, and landed after the film's list of takes looked at began (or kept new when it began). */
export function cameBack(t: TakeShots, l: Looked): boolean {
  if (!l.ready || l.since === null || t.state !== 'ready') return false;
  return l.keep.has(t.src) || (t.made !== undefined && t.made > l.since);
}

export interface InboxRow {
  take: TakeShots;
  /** Not looked at yet: the "new" dot. */
  isNew: boolean;
  decided?: Decided;
}

/** The files the cut's picture plays (unmuted): a take among them is in the film. */
export function cutSrcs(tl: Timeline | undefined): Set<string> | undefined {
  return tl ? new Set((mainTracks(tl).v?.clips ?? []).filter((c) => !c.muted && c.src).map((c) => c.src!)) : undefined;
}

/** The takes the page lists. `all`: every take that came back, the decided too (greyed by the page); else the ones to
 *  look at. `hold`: takes the page showed in this visit, kept listed though looked at since. `inCut`: the files the cut
 *  plays (cutSrcs); a take in it is not one to look at, unless kept for later. */
export function inboxRows(takes: TakeShots[], l: Looked, decided: DecidedMap, o: { all?: boolean; hold?: Set<string>; inCut?: Set<string> } = {}): InboxRow[] {
  const rows: InboxRow[] = [];
  for (const t of takes) {
    if (!cameBack(t, l)) continue;
    const d = decided[t.src];
    const isNew = isNewTake(t, l) && !o.inCut?.has(t.src);
    const open = d ? d.d === 'later' : isNew || !!o.hold?.has(t.src);
    if (o.all || open) rows.push({ take: t, isNew: isNew && !d, ...(d ? { decided: d } : {}) });
  }
  const later = (r: InboxRow) => (!o.all && r.decided?.d === 'later' ? 1 : 0);
  return rows.sort((a, b) => later(a) - later(b) || (b.take.made ?? 0) - (a.take.made ?? 0) || a.take.src.localeCompare(b.take.src));
}
/** The count the film page and the Edit page's Takes tab show: the list as the page opens it. */
export const inboxCount = (takes: TakeShots[], l: Looked, decided: DecidedMap, inCut?: Set<string>): number => inboxRows(takes, l, decided, { inCut }).length;
/** "5 new takes", "1 new take"; kept-for-later ones are counted too, said apart: "5 takes to look at, 2 kept for later". */
export function countWords(takes: TakeShots[], l: Looked, decided: DecidedMap, inCut?: Set<string>): string {
  const rows = inboxRows(takes, l, decided, { inCut });
  const later = rows.filter((r) => r.decided?.d === 'later').length;
  const n = rows.length;
  if (!n) return '';
  if (!later) return `${n} new ${n === 1 ? 'take' : 'takes'}`;
  return `${n} ${n === 1 ? 'take' : 'takes'} to look at, ${later} kept for later`;
}

/** "FIX-year-S1 · take 2"; a scene's own take "S19 · take 2"; a test's "prompt length C · take 1". */
export function takeTitle(t: TakeShots): string {
  const g = genOf(t.src);
  if (g && g !== t.scene && /^FIX-/i.test(g)) return `${g} · ${takeLabel(t.name, g).toLowerCase()}`;
  return t.name.toLowerCase().startsWith(t.scene.toLowerCase()) ? t.name : `${t.scene} · ${t.name}`;
}
/** The take's folder name, the key of its entry in Alma's findings record: "take2". */
export const takeKey = (t: TakeShots): string => takeFolder(t.src).split('/').pop() ?? '';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** "10:42" today, "yesterday 18:10", else "25 Nov, 18:10". */
export function landedWords(ms: number | undefined, now = Date.now()): string {
  if (!ms) return '';
  const d = new Date(ms), n = new Date(now);
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(n)) return hm(d);
  const y = new Date(now - 86400000);
  if (day(d) === day(y)) return `yesterday ${hm(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm(d)}`;
}

/** Where each of a take's shots stands, by its place in the take (1, 2, 3 …), as places.ts says it. */
export interface ShotStand { place?: string; label?: string; note?: string; conflict?: string }

/** "S1 · places 5–6", "S4 · place 4", "S8 · places 3, 4", "S2 · place not known". */
export function placesLine(scene: string, stands: ShotStand[]): string {
  const known = stands.filter((s) => s.place);
  if (!known.length) return `${scene} · place not known`;
  // a run of plain places reads as one ("1–4", a whole scene's retake); a shot that stands for several keeps its own label
  const words = known.some((s) => s.label) ? [...new Set(known.map((s) => s.label ?? s.place!))] : [placesLabel([...new Set(known.map((s) => s.place!))])];
  const many = known.length > 1 || words.some((w) => /[–,]/.test(w));
  return `${scene} · ${many ? 'places' : 'place'} ${words.join(', ')}`;
}

/** The picks a Use puts in: each shot of the take whose place is known, at that place (the Takes view's numbers: `by`
 *  carries them, pickupRows.ts). `skipped`: the shots whose place nothing knows (they would go nowhere sure). */
export function picksOf(t: TakeShots, other: Set<number>): { picks: Pick[]; skipped: number[] } {
  const picks: Pick[] = [];
  const skipped: number[] = [];
  for (const s of shotsOf(t)) {
    if (other.has(s.i)) { skipped.push(s.i); continue; }
    picks.push({ scene: t.scene, n: s.n, src: t.src, ...(s.tag && s.tag !== String(s.n) ? { tag: s.tag } : {}) });
  }
  return { picks, skipped };
}

/** One piece of the picture a Use takes out or puts in. */
export interface Piece { id: string; src: string; label: string; in: number; out: number; at: number; frames: number }
export interface UseReading {
  /** The cut after the Use, undefined when nothing would change (the take is the film's already) or a lock refuses. */
  after?: Timeline;
  note?: string;
  /** The picture clips it takes out, in the film's order. */
  out: Piece[];
  /** The ones it puts in. */
  in: Piece[];
  /** How many frames longer (+) or shorter (−) the film gets. */
  delta: number;
  skipped: number[];
}
const pieceOf = (c: TimelineClip, fps: number): Piece => ({ id: c.id, src: c.src ?? '', label: c.label ?? c.takeRef?.take ?? (c.src ?? '').split('/').pop() ?? c.id, in: c.in, out: c.out, at: startF(c, fps), frames: endF(c, fps) - startF(c, fps) });
const sameClip = (a: TimelineClip, b: TimelineClip) => a.src === b.src && a.in === b.in && a.out === b.out;

/** What "Use in the film" would do to the cut `tl` (the shot timeline, as the Edit page has it): the cut after, and the
 *  picture clips it takes out and puts in, read from the two cuts (a clip only moved by the change is neither). */
export function replaceOf(tl: Timeline, t: TakeShots, by: BySrc, names: Map<string, string>, order: string[] | undefined, other: Set<number>): UseReading {
  const { picks, skipped } = picksOf(t, other);
  const e = picks.length ? withPicks(tl, picks, by, names, undefined, order) : undefined;
  if (!e) return { out: [], in: [], delta: 0, skipped };
  const fps = tl.fps;
  const was = mainTracks(tl).v?.clips ?? [];
  const now = mainTracks(e.tl).v?.clips ?? [];
  const out = was.filter((c) => !now.some((x) => x.id === c.id && sameClip(x, c))).map((c) => pieceOf(c, fps));
  const put = now.filter((c) => !was.some((x) => x.id === c.id && sameClip(x, c))).map((c) => pieceOf(c, fps));
  return { after: e.tl, note: e.note, out, in: put, delta: totalF(e.tl) - totalF(tl), skipped };
}

/** "1.2 s shorter", "0.5 s longer", "the same length". */
export function deltaWords(frames: number, fps: number): string {
  if (!frames) return 'the same length';
  const s = Math.abs(frames) / fps;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s ${frames > 0 ? 'longer' : 'shorter'}`;
}

/** Where the take sits now: every shot of it in the film (by its own file) → 'in'; some → 'part'; none → undefined. */
export function inFilmOf(tl: Timeline | undefined, t: TakeShots): 'in' | 'part' | undefined {
  if (!tl) return undefined;
  const clips = (mainTracks(tl).v?.clips ?? []).filter((c) => c.src === t.src && !c.muted);
  if (!clips.length) return undefined;
  const shots = shotsOf(t);
  if (!shots.length) return 'in';
  const used = shots.filter((s) => clips.some((c) => (c.in + c.out) / 2 >= s.in && (c.in + c.out) / 2 < s.out));
  return used.length === shots.length ? 'in' : 'part';
}
