// The Release pages' things as references for Alma's message box ("I need to be able to
// select anything from this page with the selection tool that I have for Alma"): a platform, a field with its text in
// use, one option of a field, a note of Alma's, a step of the sending list, the final. Each carries the ids Alma finds
// it by in social/release.json (platform id, field id, candidate id, note id, step id) and the platform's page.
import type { InlineRef } from '@/lib/refs';
import { capWords, firstWords } from '@/components/lib/refBlock';
import type { Candidate, Field, Note, Platform, ReleaseFinal } from './file';

const page = (p: Platform) => `release/${p.id}`;
/** "option b": the option's letter by its place among the field's candidates. */
export const optionLetter = (i: number) => (i < 26 ? String.fromCharCode(97 + i) : String(i + 1));

export const platformRef = (p: Platform): InlineRef => ({ kind: 'platform', label: p.name, platform: p.id, title: `${p.name} from ${p.account}`, page: page(p) });

/** A box of "The text": its field (or its fields, "title + body", for a box of several) with the words it holds now. */
export function fieldRef(p: Platform, fields: Field[], label: string, text: string): InlineRef {
  return { kind: 'field', label: `${p.name} · ${label}`, platform: p.id, field: fields.map((f) => f.id).join(' + '), title: label, page: page(p), ...(text ? { words: capWords(text) } : {}) };
}

/** One option of a field: Alma's candidate, or the user's own words ("own"). */
export function optionRef(p: Platform, f: Field, o: { id: string; does: string; text: string }, cands: Candidate[]): InlineRef {
  const i = cands.findIndex((c) => c.id === o.id);
  const name = i >= 0 ? `option ${optionLetter(i)}` : 'your text';
  return { kind: 'option', label: `${p.name} · ${f.label} · ${name}`, platform: p.id, field: f.id, option: o.id, title: o.does, page: page(p), ...(o.text ? { words: capWords(o.text) } : {}) };
}

export function noteRef(p: Platform, f: Field, n: Note): InlineRef {
  const words = n.proposal ? `${n.text} Proposed: “${n.proposal}”` : n.text;
  return { kind: 'note', label: `${p.name} · ${f.label} · Alma’s note`, platform: p.id, field: f.id, note: n.id, page: page(p), words: capWords(words) };
}

/** A step of the sending list: by hand (`upload.hand`), after it posts (`upload.after`), or the sending steps a
 *  posting service records (`send.sending.steps`, by their place: "sending-2"). `n` counts from 1. */
export function stepRef(p: Platform, id: string, n: number, text: string, list: 'hand' | 'after' | 'sending'): InlineRef {
  const where = list === 'after' ? 'after it posts, ' : list === 'sending' ? 'sending, ' : '';
  return { kind: 'step', label: `${p.name} · ${where}step ${n} ${firstWords(text, 4)}`, platform: p.id, step: id, item: list === 'hand' ? 'upload.hand' : list === 'after' ? 'upload.after' : 'send.sending.steps', page: page(p), words: capWords(text) };
}

/** The final; `file` is its path for the media links (relative to the film repo). */
export const finalRef = (f: ReleaseFinal, file?: string): InlineRef => ({
  kind: 'final', label: `The final · master of ${f.version}`, cut: f.version, title: f.name, page: 'release', ...(file ? { file } : {}),
});
