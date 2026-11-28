// A field's options on the platform page: Alma's candidates as radio options under the
// box, each with its whole text. A tap puts the option's text in the box, where it can be edited by hand; the edit
// stays the selected option's (`from`) until it is kept as that option (`saveOption`) or discarded by switching. The
// user's own words that belong to no option are one more option, "Your text". Which option is in use, whether the box
// holds changes to it, and which of Alma's notes only offered candidates (their buttons are not drawn twice: the list
// is the way to choose, and the note's words sit under the option they recommend). Pure.
import type { Field, Note, Platform } from './file';

/** The id of the "Your text" option. */
export const OWN = 'own';

type F = Pick<Field, 'text' | 'own' | 'pick' | 'from' | 'candidates'>;
const has = (f: Pick<Field, 'candidates'>, id?: string): id is string => !!id && f.candidates.some((c) => c.id === id);

/** The option in use: a candidate's id, `own` for the user's words that are no option's, or nothing while the field is
 *  empty. The pick; else the candidate the user's text is an edit of; else the candidate with the field's very text;
 *  else, when there is text, the user's. */
export function chosenOf(f: F): string | undefined {
  if (has(f, f.pick)) return f.pick;
  if (f.own && has(f, f.from)) return f.from;
  const same = f.text ? f.candidates.find((c) => c.text === f.text) : undefined;
  if (same) return same.id;
  return f.text.trim() ? OWN : undefined;
}

/** The field as the box shows it while the user types `text` there (before it is saved): their own text, an edit of
 *  the option in use when that is a candidate. */
export function typedField<T extends F>(f: T, text: string | undefined): T {
  if (text === undefined || text === f.text) return f;
  const was = chosenOf(f);
  const from = was && was !== OWN ? was : undefined;
  return { ...f, text, own: true, pick: undefined, from };
}

/** The box holds changes to the selected option: its text is not that candidate's text. "Your text" never has any. */
export function changedFrom(f: F): string | undefined {
  const id = chosenOf(f);
  const c = id && id !== OWN ? f.candidates.find((k) => k.id === id) : undefined;
  return c && c.text !== f.text ? c.id : undefined;
}

/** The words of the "Your text" option: the field's text while it is no option's, else the user's words a candidate
 *  replaced (`ownWas`) when they are none of the candidates. Nothing: no such option. */
export function ownOption(f: F & Pick<Field, 'ownWas'>): string | undefined {
  if (chosenOf(f) === OWN) return f.text;
  const was = f.ownWas;
  return was && was.trim() && !f.candidates.some((c) => c.text === was) ? was : undefined;
}

/** The platforms a field's text is on: this one and those sharing it. */
const groupOf = (p: Pick<Platform, 'id'>, f: Pick<Field, 'sharedWith'>): string[] => [p.id, ...(f.sharedWith ?? [])].sort();

/** When a note only offers candidates, the candidate of each of its buttons, in its order (the first is the one Alma
 *  recommends); else nothing. A button only offers a candidate when its one effect sets this field to that candidate's
 *  exact text on exactly the platforms the text is on (as a tap on the option does). An answered note keeps its line. */
export function plainNote(p: Pick<Platform, 'id'>, f: Pick<Field, 'id' | 'candidates' | 'sharedWith'>, n: Note): string[] | undefined {
  if (n.answered || !n.actions.length) return undefined;
  const on = groupOf(p, f).join('|');
  const ids: string[] = [];
  for (const a of n.actions) {
    const e = a.effect.length === 1 ? a.effect[0] : undefined;
    if (!e || e.kind !== 'set' || e.field !== f.id || [...e.platforms].sort().join('|') !== on) return undefined;
    const c = f.candidates.find((k) => k.text === e.text);
    if (!c) return undefined;
    ids.push(c.id);
  }
  return ids;
}

/** Alma's words under the options: per candidate, the sentences of the notes that recommend it first (it gets the
 *  "Alma" mark). The notes that only offered candidates are `plain`: the page draws them no more. */
export function noteReasons(p: Pick<Platform, 'id'>, f: Pick<Field, 'id' | 'candidates' | 'sharedWith' | 'notes'>): { reasons: Record<string, string[]>; plain: Set<string> } {
  const reasons: Record<string, string[]> = {};
  const plain = new Set<string>();
  for (const n of f.notes ?? []) {
    const ids = plainNote(p, f, n);
    if (!ids) continue;
    plain.add(n.id);
    (reasons[ids[0]] ??= []).push(n.text);
  }
  return { reasons, plain };
}
