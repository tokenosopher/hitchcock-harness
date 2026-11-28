// "Remove" on an entry of "Waiting for you": the user takes off the list a thing that no longer applies, instead of
// asking Alma to. One tap sets the removal aside like
// every other choice (data/choices.ts), "Done picking" sends it with the rest. It is never an answer: no yes, no go, no
// pick, no approval; Alma gets it in a block of its own and closes her card with the option "removed".
// The harness keeps what was removed in its own harness/removed.json (server/actions/removed.ts), laid on the state as
// `removed`: an asking card of Alma's stays off the list until she closes it; an entry the app makes itself (a sheet
// waiting for a yes, a round landed, the go, the release) stays off while the thing it is about is the same (its
// `mark`: the sheet file, the round and its candidates, the scenes, the final), and comes back for a new one.
// Pure, no React; the browser and the server both use it.
import type { FeedCard, FilmState } from '@/server/types';
import type { GateItem, ReleaseWait } from './derive';

export interface Removal {
  /** The entry of "Waiting for you": "card:<card key>", "gate:pick:C05:sheet", "story:script-v3", "release:post". */
  key: string;
  /** Its title as the list showed it. */
  title: string;
  /** What the entry was about when it was removed (an app entry only): a new one brings the entry back. */
  mark?: string;
  /** When it was sent (ISO), on the server's record. */
  at?: string;
}

/** The option Alma writes on a card she closes because the user removed it: never a yes, a go or a pick. */
export const REMOVED_OPTION = 'removed';
export const isRemovedAnswer = (option?: string): boolean => (option ?? '').trim().toLowerCase() === REMOVED_OPTION;

/** The choice id of a removal: one per entry. */
export const removeChoiceId = (key: string): string => `remove:${key}`;

/** What an app entry is about now, to compare with the removal's mark: the sheet file; the round and how many
 *  candidates it has; the scenes the go starts. */
export function gateMark(g: GateItem, s: Pick<FilmState, 'characters'>): string {
  if (g.kind === 'sheet') return s.characters.find((c) => c.id === g.id)?.sheet?.path ?? '';
  if (g.kind === 'go') return (g.scenes ?? []).join(' ');
  return g.round ? `${g.round.id}:${g.round.candidates.length}` : '';
}
/** The release's mark: the final named and how many platforms it goes to. */
export const releaseMark = (r: ReleaseWait, s: Pick<FilmState, 'post'>): string => `${s.post?.release?.final?.version ?? ''}:${r.platforms}`;

/** The entry was removed and is still the same thing (a card by its key alone, until Alma closes it). */
export function isRemoved(s: Pick<FilmState, 'removed'>, key: string, mark = ''): boolean {
  const r = s.removed?.find((x) => x.key === key);
  return !!r && (r.mark ?? '') === mark;
}
/** Alma's cards that ask, less the ones removed. */
export const asksLeft = (s: Pick<FilmState, 'feed' | 'removed'>): FeedCard[] => (s.feed?.asks ?? []).filter((c) => !isRemoved(s, `card:${c.key}`));
/** The ones removed: an app entry they stand in for stays out too (one question, removed once). */
export const asksRemoved = (s: Pick<FilmState, 'feed' | 'removed'>): FeedCard[] => (s.removed?.length ? (s.feed?.asks ?? []).filter((c) => isRemoved(s, `card:${c.key}`)) : []);

const KEY = /^(?:card:[^\s<>"`]{1,160}|gate:(?:pick:[\w-]{1,40}(?::(?:clothing|sheet|voice))?|go:video)|story:(?:script|story)-[\w.-]{1,20}|release:post)$/;

/** The removals of a request body, checked; a string says what is wrong. */
export function parseRemovals(v: unknown): Removal[] | string {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return 'removals must be a list';
  const out: Removal[] = [];
  for (const x of v) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    if (!KEY.test(key)) return `a removal needs the entry's key, such as card:<card id> or gate:pick:C05:sheet`;
    const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const mark = typeof r.mark === 'string' && r.mark ? r.mark.slice(0, 300) : undefined;
    out.push({ key, title: title || key, ...(mark ? { mark } : {}) });
  }
  if (new Set(out.map((r) => r.key)).size !== out.length) return 'an entry is removed twice';
  return out;
}

/** One line of the block: a card of Alma's by its id, an app entry by its key. */
export function removalLine(r: Removal & { card?: string }): string {
  if (r.key.startsWith('card:')) return `- card="${r.card ?? r.key.slice(5)}" · “${r.title}”`;
  return `- ${r.key} · “${r.title}” (the harness's own entry, no card of yours)`;
}

/** The part of the Done-picking message that lists what was removed: empty when nothing was. */
export function removalBlock(rs: (Removal & { card?: string })[]): string[] {
  if (!rs.length) return [];
  const cards = rs.some((r) => r.key.startsWith('card:'));
  const own = rs.some((r) => !r.key.startsWith('card:'));
  return [
    '',
    'Removed from "Waiting for you" (not answered; close these, start no work from them):',
    ...rs.map(removalLine),
    [
      'The user took these off the list because they no longer apply. None of them is a yes, a go, a pick or an approval: do not record one, spend nothing and start nothing from them. The harness wrote nothing in the film folder for them.',
      cards ? `Yours: on each card of yours above, set "answer" in review/cards.json to {"option": "${REMOVED_OPTION}", "note": "removed by the user from Waiting for you", "at": "<now>"}; ask again later only if the question comes back on its own.` : '',
      own ? 'An entry of the harness\'s own needs nothing from you: it stays off the list until the thing it is about changes (a new file or round).' : '',
    ].filter(Boolean).join(' '),
  ];
}

/** The entries of "Waiting for you" a choice is about, to keep one choice per entry: an answer and a removal of the
 *  same card replace each other (lib/sent.ts sentItems maps the rest the same way). */
export function waitKeysOf(c: { answer?: { card: string }; pick?: { kind: string; target: string; card?: string }; approve?: { id: string }; remove?: Pick<Removal, 'key'> }): string[] {
  if (c.remove) return [c.remove.key];
  if (c.answer) return [`card:${c.answer.card}`];
  if (c.approve) return [`gate:pick:${c.approve.id}:sheet`];
  const p = c.pick;
  if (!p) return [];
  if (p.kind === 'sfx') return p.card ? [`card:${p.card}`] : [];
  if (p.kind === 'wardrobe') return [`gate:pick:${p.target}:clothing`];
  if (p.kind === 'sheet') return [`gate:pick:${p.target}:sheet`];
  if (p.kind === 'voice') return [`gate:pick:${p.target}:voice`, ...(p.card ? [`card:${p.card}`] : [])];
  return [`gate:pick:${p.target}`, ...(p.card ? [`card:${p.card}`] : [])];
}

/** The first line of the Done-picking message: how many items and what kinds the list below holds. */
export function choicesHead(n: number, approvals: boolean, removals: boolean): string {
  const kinds = ['one answer', 'one pick', ...(approvals ? ['one sheet approved'] : []), ...(removals ? ['one entry removed'] : [])];
  return `<harness-action kind="answers" count="${n}"/> The user is done choosing and sent ${n === 1 ? 'one choice' : `${n} choices`} with one button, in Hitchcock Harness. Each item below is ${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}, exactly as it would say by itself. Apply them all in this turn, then continue the flow once.`;
}

/** The mark of an entry of "Waiting for you" as the list has it (waitList.ts WaitItem): what an app entry is about now;
 *  a card of Alma's and the story (whose key names its version) need none. */
export function waitMark(it: { gate?: GateItem; release?: ReleaseWait }, s: Pick<FilmState, 'characters' | 'post'>): string | undefined {
  if (it.gate) return gateMark(it.gate, s) || undefined;
  if (it.release) return releaseMark(it.release, s);
  return undefined;
}
