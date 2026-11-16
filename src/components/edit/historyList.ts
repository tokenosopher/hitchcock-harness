// The History tab and the Versions menu (15 Nov 2026, stage 5 of "saving apart from history"; the screens SaveHistory,
// SaveUndone and SaveVersions). Pure: what the two lists hold, read from the history the server keeps (history.ts
// HistorySummary: every step with its words, who, when, its content's hash and the version it saved or equals) and
// the saved versions GET …/cut lists. Nothing here reads a version's content; the menu's "Compared with now" line is
// worked out on the page, for the rows on screen only (VersionsMenu.tsx). scripts/history-list-test.ts checks it.
import type { TimelineVersionRef } from '@/server/types';
import type { HistoryStep, SaveWhy } from './history';

const vnum = (v: string): number => Number(/\d+/.exec(v)?.[0] ?? 0);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A step as the list shows it: its index in the history, undone (after the pointer), the cut now (the pointer's). */
export interface StepRow { i: number; step: HistoryStep; undone: boolean; now: boolean }
/** The steps between two saved versions (or before the oldest one the history still holds), folded by default. */
export interface Stretch { key: string; words: string; steps: StepRow[]; hasNow: boolean }
/** A saved version's row: readable or not, the cut now when the cut equals it. */
export interface VersionRow {
  version: string; at?: string; by?: TimelineVersionRef['by']; note?: string; made?: TimelineVersionRef['made'];
  /** Why it was saved (the step that saved it, else its note's own words "(saved for a render)"). */
  why?: SaveWhy;
  /** The reason it cannot be opened (an unreadable version file), in the problem's own words. */
  bad?: string;
  now: boolean;
  /** Below it: the steps between it and the next older version the history holds. */
  stretch?: Stretch;
}
export interface HistoryModel {
  /** The newest version the history holds a step of, and the steps after it (newest first; undone ones first). */
  since: { version?: string; steps: StepRow[] };
  /** Every saved version, newest first, readable or not. */
  versions: VersionRow[];
  /** The steps before the oldest version the history holds (none on a seeded history: its first step is a version). */
  before?: Stretch;
  /** The number of steps the history holds. */
  total: number;
}

/** Where each version stands in the history: the step that saved it, else the first step seeded from it (a restore
 *  or a step whose content equals it later is not where it was made). */
export function anchorsOf(steps: Pick<HistoryStep, 'saved' | 'version' | 'by'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) { const s = steps[i].saved; if (s) out.set(s, i); }
  for (let i = 0; i < steps.length; i++) {
    const v = steps[i].version;
    if (v && !out.has(v) && steps[i].by !== 'restore' && !steps[i].saved) out.set(v, i);
  }
  return out;
}

const WHY_RE: [RegExp, SaveWhy][] = [[/\(saved for a render\)\s*$/, 'render'], [/\(saved as the final\)\s*$/, 'final'], [/\(saved for an export\)\s*$/, 'export']];
/** Why a version was saved, from the step that saved it, else its note's own ending. */
export function whyOf(v: Pick<TimelineVersionRef, 'note' | 'by'>, step?: Pick<HistoryStep, 'why'>): SaveWhy | undefined {
  if (step?.why) return step.why;
  for (const [re, w] of WHY_RE) if (re.test(v.note ?? '')) return w;
  return v.by === 'alma' ? 'alma' : undefined;
}
/** A version's note without the save's own ending ("(saved for a render)"), which the row says as "who". */
export const noteOf = (note?: string): string => (note ?? '').replace(/\s*\(saved (for a render|as the final|for an export)\)\s*$/, '').trim();

/** The two lists' model: the history's steps grouped between the saved versions, newest first. `equals`: the version
 *  the cut equals now (that row carries "The cut now"; else the pointer's step does). */
export function historyModel(h: { at: number; steps: HistoryStep[] }, versions: TimelineVersionRef[], unreadable: Record<string, string[]>, equals?: string): HistoryModel {
  const steps = h.steps;
  const anchors = anchorsOf(steps);
  const readable = new Set(versions.map((v) => v.version));
  const nowVersion = equals && (readable.has(equals) || unreadable[equals]) ? equals : undefined;
  const row = (i: number): StepRow => ({ i, step: steps[i], undone: i > h.at, now: !nowVersion && i === h.at });
  // the anchors in the order of the history: each stretch is the steps between two of them
  const byIndex = [...anchors.entries()].filter(([v]) => readable.has(v) || unreadable[v]).sort((a, b) => a[1] - b[1]);
  const top = byIndex[byIndex.length - 1];
  const since: StepRow[] = [];
  for (let i = steps.length - 1; i > (top ? top[1] : -1); i--) since.push(row(i));
  const stretchOf = (from: number, to: number, key: string, words: string): Stretch | undefined => {
    if (to - from <= 1) return undefined;
    const rows: StepRow[] = [];
    for (let i = to - 1; i > from; i--) rows.push(row(i));
    return { key, words: words.replace('{n}', plural(rows.length, 'step')), steps: rows, hasNow: rows.some((r) => r.now) };
  };
  const stretchFor = new Map<string, Stretch>();
  for (let k = byIndex.length - 1; k >= 0; k--) {
    const [v, a] = byIndex[k];
    const below = byIndex[k - 1];
    const s = below ? stretchOf(below[1], a, `${below[0]}-${v}`, `{n} between ${below[0]} and ${v}`) : undefined;
    if (s) stretchFor.set(v, s);
  }
  const first = byIndex[0];
  const before = first ? stretchOf(-1, first[1], `before-${first[0]}`, `{n} before ${first[0]}`) : undefined;
  const savedBy = new Map<string, HistoryStep>();
  for (const s of steps) if (s.saved) savedBy.set(s.saved, s);
  const all: VersionRow[] = [
    ...versions.map((v): VersionRow => ({ version: v.version, at: v.at, by: v.by, note: v.note, ...(v.made ? { made: v.made } : {}), why: whyOf(v, savedBy.get(v.version)), now: v.version === nowVersion })),
    ...Object.entries(unreadable).filter(([v]) => !readable.has(v)).map(([v, ps]): VersionRow => ({ version: v, bad: ps[0] ?? 'invalid', now: false })),
  ].sort((a, b) => vnum(b.version) - vnum(a.version));
  for (const r of all) { const s = stretchFor.get(r.version); if (s) r.stretch = s; }
  return { since: { version: top?.[0], steps: since }, versions: all, before, total: steps.length };
}

/** The title of the group of steps at the top. */
export const sinceTitle = (version?: string): string => (version ? `Since ${version}, not saved as a version` : 'Not saved as a version');

/** "today 10:44", "yesterday 18:40", "12 Nov 18:40" (the time of day, in the page's own clock). */
export function whenWords(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const n = new Date(now);
  const diff = Math.round((day(n) - day(d)) / 86_400_000);
  if (diff === 0) return `today ${hm}`;
  if (diff === 1) return `yesterday ${hm}`;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${M[d.getMonth()]} ${hm}`;
}
/** A step's time: the time of day when it is today, else the day too. */
export const stepWhen = (iso: string | undefined, now: number): string => whenWords(iso, now).replace(/^today /, '');

/** Who made a step: "you" or "Alma" (a start or a restore is the user's). */
export const stepWho = (s: Pick<HistoryStep, 'by'>): string => (s.by === 'alma' ? 'Alma' : 'you');
/** A step's words as a row says them: Alma's start with her name. */
export function stepText(s: Pick<HistoryStep, 'by' | 'words'>): string {
  const w = s.words.trim() || 'a change';
  const c = w.charAt(0).toUpperCase() + w.slice(1);
  return s.by === 'alma' && !/^Alma[:,]/.test(c) ? `Alma: ${w}` : c;
}

/** Who saved a version, in the menu's words: you, Alma, saved for a render, saved as the final. */
export function savedWho(r: Pick<VersionRow, 'by' | 'why'>): string {
  if (r.why === 'render') return 'saved for a render';
  if (r.why === 'final') return 'saved as the final';
  if (r.why === 'export') return 'saved for an export';
  return r.by === 'alma' || r.why === 'alma' ? 'Alma' : r.by === 'migration' ? 'migration' : 'you';
}

/** What was made from a version, as the menu's marks: "480p", "480p, approved", "Master", "Final". */
export function marksOf(r: Pick<VersionRow, 'version' | 'made'>, o: { approved?: string; masters?: Set<string>; final?: string }): string[] {
  const out: string[] = [];
  const approved = o.approved === r.version;
  if (r.made?.proxy || approved) out.push(approved ? (r.made?.proxy ? '480p, approved' : 'Approved') : '480p');
  if (r.made?.master || o.masters?.has(r.version)) out.push('Master');
  if (o.final === r.version) out.push('Final');
  return out;
}
/** The same marks as the History tab says them after "saved": "the master was made from it". */
export function marksWords(marks: string[]): string {
  const m = new Set(marks.map((x) => x.split(',')[0]));
  const made = [m.has('480p') ? 'the 480p' : '', m.has('Master') ? 'the master' : ''].filter(Boolean);
  const parts = [made.length ? `${made.join(' and ')} ${made.length === 1 ? 'was' : 'were'} made from it` : '', marks.some((x) => /approved|Approved/.test(x)) ? 'approved' : '', m.has('Final') ? 'the final' : ''];
  return parts.filter(Boolean).join(' · ');
}

/** Why a version cannot be opened, in plain words (the check's own words, made plain where they are known). */
export function plainProblem(p: string): string {
  const s = p.split(': ').pop() ?? p;
  if (/id used twice/.test(p)) return /clip/.test(p) ? 'one clip is in it twice' : 'one track is in it twice';
  if (/not JSON|Unexpected token|JSON/.test(p)) return 'the file is not readable';
  if (/overlaps/.test(p)) return 'two clips lie over each other on one track';
  if (/past the end of/.test(p)) return 'a clip runs past the end of its file';
  if (/does not exist/.test(p)) return 'a file it plays is missing';
  if (/not in time order/.test(p)) return 'its clips are out of order';
  if (/tracks must be/.test(p)) return 'it has no tracks';
  return s.replace(/\s*\(.*\)$/, '');
}

/** The Versions menu's rows, newest first: the first `shown`, then one fold that says exactly what it holds. */
export function foldVersions<T extends { version: string }>(rows: T[], shown: number): { head: T[]; rest: T[]; words?: string } {
  if (rows.length <= shown + 1) return { head: rows, rest: [] };
  const head = rows.slice(0, shown), rest = rows.slice(shown);
  const lo = rest[rest.length - 1].version, hi = rest[0].version;
  return { head, rest, words: `${plural(rest.length, 'older version')}, ${lo} to ${hi}` };
}
