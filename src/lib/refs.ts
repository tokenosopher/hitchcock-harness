// References put into the message as it is written: a chip in the line that
// names one thing (a clip, a take, a shot, a storyboard panel, a card, a character, a view, a moment of the cut).
// Used by the browser (the message box, the thread) and the server (what Alma receives), so it imports nothing.
//
// In the box the draft is a string in which each chip is a token, "\uE000<key>\uE001", and the chips themselves sit
// in a map by key. The box shows the draft with each token written as its chip's label; the label's spaces and
// hyphens are the no-break kinds and a narrow space stands at each end, so a chip never wraps inside and its pill
// has room without touching the words beside it. What Alma receives is the same text with each chip written as a
// <harness-ref …/> tag in its place.

export type RefKind = 'moment' | 'clip' | 'panel' | 'scene' | 'shot' | 'take' | 'card' | 'character' | 'view' | 'location';

/** One thing put into the message. Frozen when it is put in: it keeps the cut version, the step and the file of that
 *  moment, so it means the same thing later. */
export interface InlineRef {
  kind: RefKind;
  /** The chip's words: "S6 · take 1 · shot 3", "00:01:52:10 · v33". */
  label: string;
  scene?: string;
  shot?: number;
  take?: string;
  track?: string;
  clip?: string;
  card?: string;
  /** A card's place in the app (the flow board step it shows on: "edit", "scenes", "loc" …). */
  place?: string;
  character?: string;
  location?: string;
  view?: string;
  /** Timeline things and moments: the cut version ("v33"), whether the working cut had edits since it, its step. */
  cut?: string;
  edited?: boolean;
  rev?: number;
  /** A place on the cut (a moment, a clip's start) as a timecode, and the same in seconds. */
  at?: string;
  sec?: number;
  /** A moment's frame on the cut. */
  frame?: number;
  /** Seconds. */
  length?: number;
  /** The file (relative to the film repo): the take, the clip's source, the panel's picture, the view. */
  file?: string;
  /** Where in that file the clip or the moment is, seconds. */
  from?: number;
  to?: number;
  /** A longer name: a card's question, a character's name, a shot's description. */
  title?: string;
}

const KINDS: RefKind[] = ['moment', 'clip', 'panel', 'scene', 'shot', 'take', 'card', 'character', 'view', 'location'];
export const isRefKind = (k: unknown): k is RefKind => typeof k === 'string' && (KINDS as string[]).includes(k);

// ---- the tag Alma reads

export const REF_TAG = 'harness-ref';
const ORDER: (keyof InlineRef)[] = ['kind', 'label', 'scene', 'shot', 'take', 'track', 'clip', 'card', 'place', 'character', 'location', 'view', 'cut', 'edited', 'rev', 'at', 'sec', 'frame', 'length', 'from', 'to', 'file', 'title'];
const NUMS = new Set<keyof InlineRef>(['shot', 'rev', 'sec', 'frame', 'length', 'from', 'to']);

function attr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s+/g, ' ');
}
function unattr(v: string): string {
  return v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
const round = (n: number) => Math.round(n * 1000) / 1000;

/** `<harness-ref kind="clip" label="S6 · take 1 · shot 3" scene="S6" … file="…"/>`, the attributes in a fixed order. */
export function refTag(r: InlineRef): string {
  const parts: string[] = [];
  for (const k of ORDER) {
    const v = r[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    const s = typeof v === 'number' ? String(round(v)) : v === true ? 'yes' : String(v);
    parts.push(`${k}="${attr(s)}"`);
  }
  return `<${REF_TAG} ${parts.join(' ')}/>`;
}

const TAG_RE = new RegExp(`<${REF_TAG}\\s([^>]*?)\\/>`, 'g');
const ATTR_RE = /([a-z]+)="([^"]*)"/g;

/** Reads one tag's attributes back into a reference; undefined when it names no kind or label. */
function readTag(body: string): InlineRef | undefined {
  const o: Record<string, unknown> = {};
  for (const m of body.matchAll(ATTR_RE)) {
    const k = m[1] as keyof InlineRef;
    if (!ORDER.includes(k)) continue;
    const v = unattr(m[2]);
    if (NUMS.has(k)) { const n = Number(v); if (Number.isFinite(n)) o[k] = n; }
    else if (k === 'edited') o[k] = v === 'yes';
    else o[k] = v;
  }
  if (!isRefKind(o.kind) || typeof o.label !== 'string' || !o.label) return undefined;
  return o as unknown as InlineRef;
}

/** The user's words split at their tags: text and references, in order (the thread draws the references as chips). */
export function splitRefTags(text: string): (string | InlineRef)[] {
  const out: (string | InlineRef)[] = [];
  let at = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const r = readTag(m[1]);
    if (!r) continue;
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(r);
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export const hasRefTags = (text: string): boolean => text.includes(`<${REF_TAG} `);

/** The words with each tag as its label, for a line of plain text (a notification, a title). */
export function refTagsAsWords(text: string): string {
  return splitRefTags(text).map((p) => (typeof p === 'string' ? p : p.label)).join('');
}

// ---- the draft in the box

export const TOKEN_OPEN = '\uE000';
export const TOKEN_CLOSE = '\uE001';
const TOKEN_RE = /\uE000([^\uE000\uE001]*)\uE001/g;
export const tokenOf = (key: string) => `${TOKEN_OPEN}${key}${TOKEN_CLOSE}`;

export type DraftPart = { text: string } | { key: string; ref: InlineRef };
export const isRefPart = (p: DraftPart): p is { key: string; ref: InlineRef } => 'key' in p;

/** A chip's label as the box shows it: one unbreakable word with a narrow space at each end. */
export function shownLabel(label: string): string {
  return `\u202F${label.replace(/ /g, '\u00A0').replace(/-/g, '\u2011')}\u202F`;
}

/** The draft as parts; a token whose chip is unknown is dropped. */
export function draftParts(draft: string, refs: Record<string, InlineRef>): DraftPart[] {
  const out: DraftPart[] = [];
  let at = 0;
  const push = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !isRefPart(last)) out[out.length - 1] = { text: last.text + text };
    else out.push({ text });
  };
  for (const m of draft.matchAll(TOKEN_RE)) {
    push(draft.slice(at, m.index));
    const ref = refs[m[1]];
    if (ref) out.push({ key: m[1], ref });
    at = m.index! + m[0].length;
  }
  push(draft.slice(at));
  return out;
}

export const partText = (p: DraftPart): string => (isRefPart(p) ? shownLabel(p.ref.label) : p.text);
/** What the box shows. */
export const draftPlain = (parts: DraftPart[]): string => parts.map(partText).join('');
/** The draft string again. */
export const draftMarkup = (parts: DraftPart[]): string => parts.map((p) => (isRefPart(p) ? tokenOf(p.key) : p.text)).join('');
/** What Alma receives: the words with each chip as its tag. */
export const draftForAlma = (parts: DraftPart[]): string => parts.map((p) => (isRefPart(p) ? refTag(p.ref) : p.text)).join('');
export const draftHasRefs = (parts: DraftPart[]): boolean => parts.some(isRefPart);

/** Each chip's place in the shown text: [start, end). */
export function chipSpans(parts: DraftPart[]): { key: string; ref: InlineRef; start: number; end: number }[] {
  const out: { key: string; ref: InlineRef; start: number; end: number }[] = [];
  let at = 0;
  for (const p of parts) {
    const n = partText(p).length;
    if (isRefPart(p)) out.push({ key: p.key, ref: p.ref, start: at, end: at + n });
    at += n;
  }
  return out;
}

/** The parts within the shown text's [a, b): text cut at the edges, a chip kept only when it lies wholly inside. */
function sliceParts(parts: DraftPart[], a: number, b: number): DraftPart[] {
  const out: DraftPart[] = [];
  let at = 0;
  for (const p of parts) {
    const s = at, e = at + partText(p).length;
    at = e;
    if (e <= a || s >= b) continue;
    if (isRefPart(p)) { if (s >= a && e <= b) out.push(p); continue; }
    out.push({ text: p.text.slice(Math.max(0, a - s), Math.min(p.text.length, b - s)) });
  }
  return out;
}
/** Parts joined, neighbouring text merged and empty text dropped. */
function joinParts(...lists: (DraftPart[] | string)[]): DraftPart[] {
  const out: DraftPart[] = [];
  for (const l of lists) {
    for (const p of typeof l === 'string' ? [{ text: l }] : l) {
      if (!isRefPart(p) && !p.text) continue;
      const last = out[out.length - 1];
      if (!isRefPart(p) && last && !isRefPart(last)) out[out.length - 1] = { text: last.text + p.text };
      else out.push(p);
    }
  }
  return out;
}

/**
 * The box's words changed (typing, a paste, a deletion, dictation): the new draft, with every chip the change
 * touched taken out whole, and where the cursor goes. `caret` is the cursor after the change, in the new text.
 * The changed stretch is found from the text before and after, anchored at the cursor, so a letter typed against a
 * chip that repeats the chip's own letter is still put beside it, not inside it.
 */
export function editParts(parts: DraftPart[], next: string, caret: number): { parts: DraftPart[]; caret: number } {
  const prev = draftPlain(parts);
  if (prev === next) return { parts, caret };
  const min = Math.min(prev.length, next.length);
  let pre = 0;
  while (pre < min && prev[pre] === next[pre]) pre++;
  let suf = 0;
  while (suf < min && prev[prev.length - 1 - suf] === next[next.length - 1 - suf]) suf++;
  // the cursor ends the inserted words: what follows it is unchanged
  suf = Math.min(suf, next.length - Math.max(0, Math.min(caret, next.length)));
  pre = Math.min(pre, next.length - suf, prev.length - suf);
  let from = pre, to = prev.length - suf;               // the changed stretch of the old text
  const inserted = next.slice(pre, next.length - suf);
  // a chip the change reaches into, or a pure insertion strictly inside it, goes out whole
  for (const sp of chipSpans(parts)) {
    const touched = from < to ? sp.start < to && sp.end > from : sp.start < from && from < sp.end;
    if (touched) { from = Math.min(from, sp.start); to = Math.max(to, sp.end); }
  }
  const head = sliceParts(parts, 0, from);
  const out = joinParts(head, inserted, sliceParts(parts, to, prev.length));
  return { parts: out, caret: draftPlain(joinParts(head, inserted)).length };
}

/** A chip put in over the shown text's [start, end), with a space before and after it when the words beside it
 *  would otherwise touch it; the cursor goes after the space that follows. */
export function insertRef(parts: DraftPart[], start: number, end: number, key: string, ref: InlineRef): { parts: DraftPart[]; caret: number } {
  const plain = draftPlain(parts);
  // never inside a chip: an edge that falls inside one moves to that chip's end
  const fix = (n: number) => { for (const sp of chipSpans(parts)) if (n > sp.start && n < sp.end) return sp.end; return n; };
  const s = fix(Math.max(0, Math.min(start, plain.length)));
  const e = Math.max(s, fix(Math.max(0, Math.min(end, plain.length))));
  const before = plain.slice(0, s), after = plain.slice(e);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = /^\s/.test(after) ? '' : ' ';
  const head = joinParts(sliceParts(parts, 0, s), lead, [{ key, ref }], trail);
  return { parts: joinParts(head, sliceParts(parts, e, plain.length)), caret: draftPlain(head).length };
}

/** Where a cursor at `n` may stand: never inside a chip. Moving forward lands after the chip, back before it. */
export function snapCaret(parts: DraftPart[], n: number, forward: boolean): number {
  for (const sp of chipSpans(parts)) if (n > sp.start && n < sp.end) return forward ? sp.end : sp.start;
  return n;
}

/** A new key for a chip in the draft. */
export function newRefKey(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ---- words

/** "00:01:52:10" for seconds on a cut at fps (the app's timecode). */
export function refTimecode(sec: number, fps: number): string {
  const total = Math.max(0, Math.round(sec * fps));
  const f = total % fps, s = Math.floor(total / fps);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

/** What kind of thing a chip names, in words for its card. */
export function refKindWords(r: InlineRef): string {
  switch (r.kind) {
    case 'moment': return 'A moment of the cut';
    case 'clip': return 'A clip on the timeline';
    case 'panel': return 'A storyboard panel';
    case 'scene': return 'A scene';
    case 'shot': return r.take ? 'A shot of a take' : 'A shot';
    case 'take': return 'A take';
    case 'card': return 'A card';
    case 'character': return 'A character';
    case 'view': return 'A painted view';
    case 'location': return 'A place';
  }
}
