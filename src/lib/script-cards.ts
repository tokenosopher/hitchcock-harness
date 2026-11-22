// The parts of a script version that are not scenes ("a change to the title card does not show on the
// Script page"): the title card, a card between scenes, an end card. Pure text, read from the "## Script" section the
// way scriptRows reads the lines, so an earlier version (earlierAsScript) reads the same way. Nothing here writes.
//
// The shapes the films use:
//   **Title card** (3 s, after S1, …): **Where Maren finds the letter** · then: *The point, about 1890*.
//   **Opening title card** (3 s, …): **The point, about 1890** · subtitle line: *The lighthouse on the point*.
//   **Title card, before S1** (the house card, about 3 s, …): THE POINT, NORTH COAST · 1890, and under it the line *The lighthouse keeper*.
//   **Title card, here** (…): NORTH COAST · 1890, and under it the line *…*.      (inside a scene, after the row above it)
//   *Title card: ALEXANDRIA · 41 BC, and under it "The palace of Queen Maren". A hard cut in and out, with the boom.*
//   *Card: THE NEXT NIGHT. The same house style, with the boom.*
//   **Card** / **End card** in any of the same shapes.
import { ACTION_RE, ROW_LINE_RE, sectionSpan } from './script-edit';

export type CardKind = 'title' | 'card' | 'end';
export interface ScriptCard {
  kind: CardKind;
  /** "Title card", "Card", "End card" (an "Opening title card" is a title card). */
  label: string;
  /** The card's words: its first line and, when it has one, the line under it. */
  lines: string[];
  seconds?: number;
  /** Where it sits in the film. `in` + `afterRow`: inside a scene, after that row (the index scriptRows gives it). */
  place: { before?: string; after?: string; in?: string; afterRow?: number };
  /** The place in words: "before S1", "after S1", "in S1, after line 1". */
  where: string;
  /** Its line in the whole file, from 0. */
  at: number;
}

const BOLD_RE = /^\*\*((?:opening\s+)?(?:title\s+|end\s+)?card)(?:,\s*([^*]*))?:?\*\*\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/i;
const ITALIC_RE = /^\*((?:opening\s+)?(?:title\s+|end\s+)?card)(?:,\s*([^*:]*))?:\s*(.*?)\*\.?$/i;

const kindOf = (label: string): CardKind => (/title/i.test(label) ? 'title' : /end/i.test(label) ? 'end' : 'card');
const labelOf = (k: CardKind): string => (k === 'title' ? 'Title card' : k === 'end' ? 'End card' : 'Card');
const unwrap = (t: string): string => t.trim().replace(/[.,;]+$/, '').replace(/^\*\*([\s\S]*)\*\*$/, '$1').replace(/^\*([\s\S]*)\*$/, '$1').replace(/^["“]([\s\S]*)["”]$/, '$1').trim();

/** The card's words from what follows its label: one line, or two ("· then:", ", and under it …"). */
function wordsOf(text: string, italic: boolean): string[] {
  let t = text.trim();
  // ", and under it the line *…*" / ', and under it "…"'
  const under = /^([\s\S]*?),?\s+and under it(?:\s+the line)?\s*:?\s*(\*[^*]+\*|["“][^"”]+["”]|[^.]+)/i.exec(t);
  if (under) return [unwrap(under[1]), unwrap(under[2])].filter(Boolean);
  // "**first** · then: *second*" / "**first** · subtitle line: *second*" / "**first** · *second*"
  const bold = /^\*\*([^*]+)\*\*\s*(?:·\s*(?:[a-z][a-z ]*:\s*)?(\*[^*]+\*|\*\*[^*]+\*\*|["“][^"”]+["”]))?/i.exec(t);
  if (bold) return [bold[1].trim(), ...(bold[2] ? [unwrap(bold[2])] : [])];
  // an italic card's words end at its first sentence; the rest is a note for the edit ("A hard cut in and out")
  if (italic) t = /^(.*?)\.(?:\s|$)/.exec(t)?.[1] ?? t;
  return [unwrap(t)].filter(Boolean);
}

const secondsOf = (t: string): number | undefined => {
  const m = /(\d+(?:\.\d+)?)\s*s\b/.exec(t);
  return m ? Number(m[1]) : undefined;
};

/** The cards of the current script ("## Script"), in file order, each with its place in the film. */
export function scriptCards(markdown: string): ScriptCard[] {
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, /^##\s+Script\s*$/);
  if (!span) return [];
  const out: ScriptCard[] = [];
  const firstScene = lines.slice(span.head + 1, span.end).map((l) => /^###\s+(S\d+)\b/.exec(l.trim())?.[1]).find(Boolean);
  let scene: string | undefined;
  let last: string | undefined; // the last scene heading seen, for a card after the timing section
  let index = 0;
  let pending: number[] = []; // the cards of this scene, until we know whether a row follows them
  const timing = new Map<string, number>(); // the whole-film timing table's "title card" / "card: …" rows, ≈ s
  let col = 4; // the "≈ s" column of the table read last
  for (let i = span.head + 1; i < span.end; i++) {
    const t = lines[i].trim();
    const h = /^###\s+(S\d+)\b/.exec(t);
    if (h || /^###\s/.test(t)) {
      pending = [];
      scene = h?.[1];
      if (h) last = h[1];
      index = 0;
      continue;
    }
    if (ACTION_RE.test(t) || ROW_LINE_RE.test(t)) {
      if (scene) {
        // a card with a row after it in the same scene sits inside the scene
        for (const c of pending) { const r = out[c].place.afterRow ?? -1; out[c].place = r < 0 ? { before: scene } : { in: scene, afterRow: r }; }
        pending = [];
        index++;
      }
      continue;
    }
    if (t.startsWith('|')) {
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells.findIndex((c) => /^≈\s*s$/.test(c));
      if (head >= 0) col = head;
      if (/^(title |end )?card\b/i.test(cells[0] ?? '')) {
        const n = Number(/^(\d+(?:\.\d+)?)/.exec(cells[col] ?? '')?.[1] ?? /(\d+(?:\.\d+)?)\s*s\b/.exec(cells[0])?.[1]);
        if (Number.isFinite(n)) timing.set(cells[0].toLowerCase(), n);
      }
      // a scene's row that counts the card in ("0:25 (with the title card, 1.5 s)")
      const within = /\b(title|end) card,?\s*(\d+(?:\.\d+)?)\s*s\b/i.exec(t);
      if (within && !timing.has(`${within[1].toLowerCase()} card`)) timing.set(`${within[1].toLowerCase()} card`, Number(within[2]));
      continue;
    }
    const b = BOLD_RE.exec(t);
    const it = b ? undefined : ITALIC_RE.exec(t);
    if (!b && !it) continue;
    const kind = kindOf((b ?? it)![1]);
    const where = ((b ?? it)![2] ?? '').trim();   // "here", "before S1"
    const paren = b?.[3] ?? '';
    const body = b ? b[4] : it![3];
    const seconds = secondsOf(paren) ?? (it ? secondsOf(/\(([^)]*)\)/.exec(body)?.[1] ?? '') : undefined);
    const words = wordsOf(body, !!it);
    if (!words.length) continue;
    // its place: what it says ("after S1", "before S2"), else where it stands in the file
    const said = /\b(before|after)\s+(S\d+)\b/i.exec(`${where} ${paren}`);
    let place: ScriptCard['place'];
    if (said) place = said[1].toLowerCase() === 'before' ? { before: said[2] } : { after: said[2] };
    else if (scene) place = { after: scene, afterRow: index - 1 };   // made "in" if a row of the scene follows
    else if (!last) place = { before: firstScene ?? 'S1' };
    else place = { after: last };
    const card: ScriptCard = { kind, label: labelOf(kind), lines: words, seconds, place, where: '', at: i };
    out.push(card);
    if (!said && scene) pending.push(out.length - 1);
  }
  // a card without its own length takes the whole-film timing table's row for it
  for (const c of out) {
    if (c.seconds !== undefined) continue;
    const key = [...timing.keys()].find((k) => (c.kind === 'title' ? /^title card/.test(k) : c.kind === 'end' ? /^end card/.test(k) : /^card\b/.test(k) && k.includes((c.lines[0] ?? '').toLowerCase())))
      ?? [...timing.keys()].find((k) => kindOf(k) === c.kind);
    if (key) c.seconds = timing.get(key);
  }
  for (const c of out) {
    if (c.place.in === undefined) delete c.place.afterRow;
    c.where = placeWords(c, markdown);
  }
  return out;
}

/** "before S1", "after S1", "in S1, after line 1" / "in S1, after direction 2". */
function placeWords(c: ScriptCard, markdown: string): string {
  if (c.place.before) return `before ${c.place.before}`;
  if (c.place.after) return `after ${c.place.after}`;
  if (c.place.in === undefined) return '';
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, /^##\s+Script\s*$/)!;
  let scene: string | undefined, index = 0, nl = 0, na = 0;
  for (let i = span.head + 1; i < span.end; i++) {
    const t = lines[i].trim();
    const h = /^###\s+(S\d+)\b/.exec(t);
    if (h || /^###\s/.test(t)) { scene = h?.[1]; index = 0; nl = 0; na = 0; continue; }
    if (scene !== c.place.in) continue;
    const isA = ACTION_RE.test(t), isL = !isA && ROW_LINE_RE.test(t);
    if (!isA && !isL) continue;
    if (isA) na++; else nl++;
    if (index++ === c.place.afterRow) return `in ${scene}, after ${isA ? `direction ${na}` : `line ${nl}`}`;
  }
  return `in ${c.place.in}`;
}

/** What changed in a card from one version to the next: its words, its length, its place. Cards are matched by kind
 *  and their order among the cards of that kind; a card with nothing to match is new. */
export interface CardChange { words: boolean; seconds: boolean; place: boolean; was?: ScriptCard; isNew: boolean }
export function cardChanges(now: ScriptCard[], before: ScriptCard[]): (CardChange | undefined)[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return now.map((c) => {
    const n = now.filter((x) => x.kind === c.kind).indexOf(c);
    const was = before.filter((x) => x.kind === c.kind)[n];
    if (!was) return { words: true, seconds: false, place: false, isNew: true };
    const ch: CardChange = {
      words: c.lines.map(norm).join('|') !== was.lines.map(norm).join('|'),
      seconds: c.seconds !== was.seconds,
      place: c.where !== was.where,
      was, isNew: false,
    };
    return ch.words || ch.seconds || ch.place ? ch : undefined;
  });
}

/** "Title card (after S1)", "Title card, second line (after S1)": a card's line, named for the version note, the save
 *  bar and Alma. */
export const cardLineLabel = (c: Pick<ScriptCard, 'label' | 'where'>, part: number): string => `${c.label}${part ? ', second line' : ''}${c.where ? ` (${c.where})` : ''}`;

/** Where each of the card's lines sits in its line of the file (`[start, end)` in `raw`), so its words can be swapped
 *  and nothing else on the line moves: the label, the length, the place, the "· then:" and the note after it stay. */
export function cardWordSpans(raw: string, card: Pick<ScriptCard, 'lines'>): [number, number][] | undefined {
  const lead = raw.length - raw.trimStart().length;
  const t = raw.trim();
  const b = BOLD_RE.exec(t);
  const it = b ? undefined : ITALIC_RE.exec(t);
  if (!b && !it) return undefined;
  // the body is what follows the label: to the end of a bold card's line, to the closing * of an italic one
  const body = b ? b[4] : it![3];
  let from = lead + (b ? t.length - body.length : t.length - (t.endsWith('*.') ? 2 : 1) - body.length);
  const out: [number, number][] = [];
  for (const words of card.lines) {
    const at = raw.indexOf(words, from);
    if (at < 0) return undefined;
    out.push([at, at + words.length]);
    from = at + words.length;
  }
  return out;
}
