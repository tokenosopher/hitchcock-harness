// What the Shot details page reads out of a take's record of what was sent (SentRecord): the prompt cut into its parts
// (the scene's, one a shot, the ones after the shots), every name in it of an input the take sent ([LANTERN], IMAGE
// REFERENCE 6, a run "IMAGE REFERENCES 12 TO 18", storyboard panels "PANELS 13 AND 14" by the pages they are on), which
// inputs each part names, and the part of the previz a shot was drawn from. Pure, no React; the Scene page's "what was
// sent" panel counts and marks its names with namedCounts and promptParts.
//
// What the data cannot say: the model got one prompt and every input for the whole take, so "a shot's inputs" means
// the inputs named in that shot's part of the prompt; and the take's shots are matched to the prompt's shot parts by
// count only (the 7th shot found in the clip is the 7th SHOT part).

export type RefKind = 'VIDEO' | 'IMAGE' | 'AUDIO';
/** What this file needs of a sent reference (SentRef has it). */
export interface RefLite { order: number; kind: RefKind; n: number; label: string; tag?: string; page?: number; frame?: 'START' | 'END' }

export interface PromptSection {
  /** "p0", "p1" … in the prompt's order. */
  id: string;
  /** The heading line as sent ("SHOT 7: THE LIFT AND THE FIRST LIGHT (CAM FACING: S) (PANELS 13 AND 14)"). */
  head: string;
  /** Its other lines as sent, empty ones left out. */
  lines: string[];
  /** Before the shots, a shot's own part, or after the shots. */
  kind: 'scene' | 'shot' | 'after';
  /** A shot part's own id as the prompt writes it: "7", "4a". */
  shot?: string;
  /** The heading's words without its notes ("THE LIFT AND THE FIRST LIGHT"; "" when a shot has no name). */
  title: string;
  /** The notes in brackets after the heading ("CAM FACING: S", "PANELS 13 AND 14", "0.0 to 3.4 s"). */
  notes: string[];
}

const BARE_HEAD = /^[A-Z][A-Z0-9 ,'’\-:.&/?!]*$/;
const SHOT_LINE = /^\s*SHOT\s+(\d+[a-zA-Z]?)\b\s*(:?)\s*(.*)$/;

/** A heading: after an empty line (or first), short, in capitals once its notes in brackets are taken out; not a tag
 *  line ("[BOTTLE]: …") nor a spoken line ("TOBIAS: "Rope!""). */
function isHead(line: string): boolean {
  if (!line.trim() || line.length > 120 || line.trimStart().startsWith('[')) return false;
  if (/^[A-Z][A-Z .'’-]*:\s*["“]/.test(line)) return false;
  const bare = line.replace(/\([^)]*\)/g, '').trim();
  return bare.length > 1 && BARE_HEAD.test(bare);
}

/** The prompt in its parts. A line "SHOT <n>…" always starts a shot's part (the samples write a whole shot on one line:
 *  "SHOT 1 (0.0 to 3.4 s), wide, … HARD CUT."); any other heading starts the next part. */
export function promptSections(text: string): PromptSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: PromptSection[] = [];
  let cur: PromptSection | undefined;
  let after = false;
  const start = (head: string, s: Omit<PromptSection, 'id' | 'head' | 'lines'>) => {
    cur = { id: `p${out.length}`, head, lines: [], ...s };
    out.push(cur);
  };
  lines.forEach((ln, i) => {
    const sm = SHOT_LINE.exec(ln);
    const afterBlank = i === 0 || !lines[i - 1].trim();
    if (sm && (afterBlank || sm[2] || /^\s*\(/.test(sm[3]) || !sm[3].trim())) {
      let rest = sm[3];
      let title = '';
      if (sm[2]) { const t = /^([^(]*)(.*)$/.exec(rest)!; title = t[1].trim(); rest = t[2]; }
      const notes: string[] = [];
      for (let p = /^\s*\(([^)]*)\)\s*/.exec(rest); p; p = /^\s*\(([^)]*)\)\s*/.exec(rest)) { notes.push(p[1].trim()); rest = rest.slice(p[0].length); }
      rest = rest.replace(/^[,.;:]\s*/, '').trim();
      const head = rest ? ln.slice(0, ln.lastIndexOf(rest)).replace(/[\s,.;:]+$/, '') : ln;
      start(head, { kind: 'shot', shot: sm[1].toLowerCase(), title, notes });
      if (rest) cur!.lines.push(rest.charAt(0).toUpperCase() + rest.slice(1));
      return;
    }
    if (afterBlank && isHead(ln)) {
      if (out.some((s) => s.kind === 'shot')) after = true;
      const notes = [...ln.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
      start(ln, { kind: after ? 'after' : 'scene', title: ln.replace(/\([^)]*\)/g, '').trim(), notes });
      return;
    }
    if (!ln.trim()) return;
    if (!cur) start('', { kind: 'scene', title: '', notes: [] });
    cur!.lines.push(ln);
  });
  return out;
}

export const shotSections = (secs: PromptSection[]): PromptSection[] => secs.filter((s) => s.kind === 'shot');

// ---- names in the prompt

export interface Mention {
  at: number; len: number; text: string;
  /** 'ref' one input; 'range' a run of inputs; 'panels' storyboard panels (the pages they are on are the inputs);
   *  'word' a [TAG] that names no input (a thing described in words only). */
  kind: 'ref' | 'range' | 'panels' | 'word';
  /** The inputs it names, by their place in the order sent. */
  orders: number[];
  tag?: string;
  panels?: number[];
}

const NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const normTag = (s: string) => s.trim().replace(/[\s_]+/g, ' ').toUpperCase();

/** How many storyboard panels a page holds: the prompt says so ("21 numbered panels, three a page"); else the most
 *  panels it names spread over the pages sent; else three. */
export function panelsPerPage(text: string, refs: RefLite[]): number {
  const m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:panels?\s+)?(?:a|per|to a|on each)\s+page\b/i.exec(text);
  if (m) { const n = NUMS[m[1].toLowerCase()] ?? Number(m[1]); if (n > 0) return n; }
  const pages = refs.filter((r) => r.page !== undefined).length;
  let most = 0;
  for (const x of text.matchAll(/\bpanels?\s+(\d+)((?:(?:,|,?\s+and|,?\s+to|\s*[-–])\s*\d+)*)/gi)) for (const k of panelList(x[1], x[2])) most = Math.max(most, k);
  return pages && most ? Math.max(1, Math.ceil(most / pages)) : 3;
}

/** "13", " AND 14" → [13, 14]; "1", " TO 3" → [1, 2, 3]; "5", ", 6 and 8" → [5, 6, 8]. */
function panelList(first: string, rest: string): number[] {
  const nums = [Number(first)];
  for (const m of (rest || '').matchAll(/(,?\s*and|,?\s*to|,|\s*[-–])\s*(\d+)/gi)) {
    const k = Number(m[2]);
    if (/to|[-–]/i.test(m[1])) { const a = nums[nums.length - 1]; for (let j = a + 1; j <= k && j - a < 200; j++) nums.push(j); } else nums.push(k);
  }
  return nums;
}

export interface MentionCtx { refs: RefLite[]; perPage: number }
export const mentionCtx = (text: string, refs: RefLite[]): MentionCtx => ({ refs, perPage: panelsPerPage(text, refs) });

/** A name of the start or end image: "START IMAGE", "the END IMAGE", "the first frame", "LAST FRAME" (any case). */
const FRAME_SRC = String.raw`\b(START|END|FIRST|LAST)\s+(?:IMAGE|FRAME)\b`;
/** The frame a FRAME_SRC word names: START or FIRST the start image, END or LAST the end image. */
const frameOf = (w: string): 'START' | 'END' => (/^(START|FIRST)$/i.test(w) ? 'START' : 'END');

const RX = new RegExp(String.raw`\[([^\]\n]{1,60})\]|\b(VIDEO|IMAGE|AUDIO)\s+REFERENCES\s+(\d+)((?:(?:,|,?\s+AND|\s+TO|\s*[-–])\s*\d+)+)|\b(VIDEO|IMAGE|AUDIO)\s+REFERENCE\s+(\d+)\b|\b(panels?)\s+(\d+)((?:(?:,|,?\s+and|,?\s+to|\s*[-–])\s*\d+)*)|${FRAME_SRC}`, 'gi');

/** The page a panel is on, as the input that page went as. */
export function pageOrder(ctx: MentionCtx, panel: number): number | undefined {
  const p = Math.ceil(panel / ctx.perPage);
  return (ctx.refs.find((r) => r.page === p) ?? ctx.refs.find((r) => r.tag && normTag(r.tag) === `PAGE ${p}`))?.order;
}

/** Every name of an input in a piece of the prompt, in order. */
export function mentionsIn(s: string, ctx: MentionCtx): Mention[] {
  const out: Mention[] = [];
  for (const m of s.matchAll(RX)) {
    const base = { at: m.index, len: m[0].length, text: m[0] };
    if (m[1] !== undefined) {
      const r = ctx.refs.find((x) => x.tag && normTag(x.tag) === normTag(m[1]));
      out.push(r ? { ...base, kind: 'ref', orders: [r.order], tag: m[1] } : { ...base, kind: 'word', orders: [], tag: m[1] });
    } else if (m[2]) {
      const kind = m[2].toUpperCase();
      const ns = panelList(m[3], m[4].replace(/\bAND\b/gi, 'and').replace(/\bTO\b/gi, 'to'));
      const orders = ctx.refs.filter((r) => r.kind === kind && !r.frame && ns.includes(r.n)).map((r) => r.order);
      out.push({ ...base, kind: 'range', orders });
    } else if (m[5]) {
      const kind = m[5].toUpperCase();
      const r = ctx.refs.find((x) => x.kind === kind && !x.frame && x.n === Number(m[6]));
      out.push(r ? { ...base, kind: 'ref', orders: [r.order] } : { ...base, kind: 'word', orders: [], tag: m[0] });
    } else if (m[7]) {
      const panels = panelList(m[8], m[9]);
      const orders = [...new Set(panels.map((p) => pageOrder(ctx, p)).filter((o): o is number => o !== undefined))];
      out.push({ ...base, kind: 'panels', orders, panels });
    } else if (m[10]) {
      // "the END IMAGE", "the first frame": the input sent as that frame; plain words when none was
      const r = ctx.refs.find((x) => x.frame === frameOf(m[10]));
      if (r) out.push({ ...base, kind: 'ref', orders: [r.order] });
    }
  }
  return out;
}

/** How many times the prompt names each input, by its place in the order sent: by its tag, its number, a run of
 *  numbers ("IMAGE REFERENCES 12 TO 18" names each of them), a panel on its page, or as the start or end image
 *  ("the END IMAGE", "the first frame"). */
export function namedCounts(text: string, refs: RefLite[]): Map<number, number> {
  const ctx = mentionCtx(text, refs);
  const n = new Map<number, number>(refs.map((r) => [r.order, 0]));
  for (const m of mentionsIn(text, ctx)) for (const o of m.orders) n.set(o, (n.get(o) ?? 0) + 1);
  return n;
}

const MENTION = new RegExp(String.raw`\b(VIDEO|IMAGE|AUDIO)\s+REFERENCE\s+(\d+)\b|${FRAME_SRC}`, 'gi');

/** The Scene page's "what was sent" panel: the prompt cut into text and names of one input, each name with the label
 *  of the input it names ("IMAGE REFERENCE 1"; "END IMAGE" for "the last frame"). */
export function promptParts(text: string): { text: string; label?: string }[] {
  const out: { text: string; label?: string }[] = [];
  let at = 0;
  for (const m of text.matchAll(MENTION)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[0], label: m[3] ? `${frameOf(m[3])} IMAGE` : `${m[1].toUpperCase()} REFERENCE ${m[2]}` });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Each part's inputs (the set of their orders), and for each input the shot parts that name it (their place among
 *  the shot parts, 1-based). */
export function namedBySection(secs: PromptSection[], ctx: MentionCtx): { bySec: Map<string, Set<number>>; byRef: Map<number, number[]> } {
  const bySec = new Map<string, Set<number>>();
  const byRef = new Map<number, number[]>(ctx.refs.map((r) => [r.order, []]));
  let place = 0;
  for (const s of secs) {
    if (s.kind === 'shot') place++;
    const set = new Set<number>();
    for (const l of [s.head, ...s.lines]) for (const m of mentionsIn(l, ctx)) for (const o of m.orders) set.add(o);
    bySec.set(s.id, set);
    if (s.kind === 'shot') for (const o of set) { const l = byRef.get(o); if (l && !l.includes(place)) l.push(place); }
  }
  return { bySec, byRef };
}

// ---- the prompt for reading

const DIRS: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west', NE: 'north-east', NW: 'north-west', SE: 'south-east', SW: 'south-west', NNE: 'north-north-east', ENE: 'east-north-east', ESE: 'east-south-east', SSE: 'south-south-east', SSW: 'south-south-west', WSW: 'west-south-west', WNW: 'west-north-west', NNW: 'north-north-west' };

/** A heading note in plain words: "CAM FACING: S" → "Camera faces south"; panels stay as they are (the page draws
 *  them); others as written, in sentence case when in capitals. */
export function noteWords(note: string): { panels?: string; text: string } {
  const cam = /^CAM(?:ERA)?\s+FACING:?\s*([NSEW]{1,3})$/i.exec(note);
  if (cam) return { text: `Camera faces ${DIRS[cam[1].toUpperCase()] ?? cam[1]}` };
  if (/^panels?\s+\d/i.test(note)) return { panels: note, text: note };
  return { text: note === note.toUpperCase() ? sentence(note) : note };
}

/** "THE LIFT AND THE FIRST LIGHT" → "The draw and the first light"; words in `keep` ("MAREN") keep a capital. */
export function sentence(s: string, keep?: Set<string>): string {
  const low = s.toLowerCase().replace(/\b[a-z][a-z'’]*\b/g, (w) => (keep?.has(w.toUpperCase()) ? w.charAt(0).toUpperCase() + w.slice(1) : w));
  return low.charAt(0).toUpperCase() + low.slice(1);
}

/** The names that keep a capital in sentence case: every one-word tag of the prompt ([MAREN], [TOBIAS]). */
export function properNames(text: string): Set<string> {
  return new Set([...text.matchAll(/\[([A-Z][A-Z'’-]+)\]/g)].map((m) => m[1]));
}

export type LineKind =
  | { kind: 'kv'; key: string; text: string }          // "Size: full shot, as framed there."
  | { kind: 'say'; who: string; how?: string; text: string } // MAREN: "Not tonight."
  | { kind: 'sub'; text: string }                      // "In shot:"
  | { kind: 'cut'; text: string }                      // "HARD CUT."
  | { kind: 'lab'; label: string; how?: string; text: string } // "BOTTLE: …", "ENDS LOCKED: …"
  | { kind: 'plain'; text: string };

/** How a line of a part reads: a camera note, a spoken line, a sub-heading, the cut, a label in capitals, or words. */
export function lineKind(l: string): LineKind {
  const kv = /^(Size|Placement|Angle|Lens|Mount|Focus|Move|Movement|Camera|Framing|Frame|Light|Lighting)\s*:\s*(.*)$/.exec(l);
  if (kv) return { kind: 'kv', key: kv[1], text: kv[2] };
  const say = /^([A-Z][A-Z .'’-]*[A-Z])(?:\s*\(([^)]*)\))?:\s*(["“].*)$/.exec(l);
  if (say) return { kind: 'say', who: say[1], ...(say[2] ? { how: say[2] } : {}), text: say[3] };
  if (/^(In shot|In frame|Action|Beats?):?$/i.test(l.trim())) return { kind: 'sub', text: l.trim().replace(/:$/, '') };
  if (/^(HARD CUT|CUT|DISSOLVE|END)\b[^a-z]*$/.test(l.trim())) return { kind: 'cut', text: l.trim() };
  const lab = /^([A-Z][A-Z0-9 '’-]*[A-Z0-9])(?:\s*\(([^)]*)\))?:\s?(.*)$/.exec(l);
  if (lab && lab[1].length > 2 && !l.startsWith('[')) return { kind: 'lab', label: lab[1], ...(lab[2] ? { how: lab[2] } : {}), text: lab[3] };
  return { kind: 'plain', text: l };
}

// ---- the previz a shot was drawn from

export interface PrevizShot { id?: string; t0: number; t1: number }
export interface PrevizWindow {
  t0: number; t1: number;
  /** false: the shot's place in the previz is not known, so the whole previz plays. */
  known: boolean;
}

/** The part of the previz the take's `place`-th shot was drawn from (no place: the whole take, so all of it): by
 *  count when the previz has as many shots as the take; else the previz shot whose id is the shot's own (`shotId`,
 *  "6" for a pick-up that redoes shot 6); else not known, and the whole previz. */
export function previzWindow(pv: { seconds: number; shots: PrevizShot[] } | undefined, takeShots: number, place?: number, shotId?: string): PrevizWindow | undefined {
  if (!pv || !(pv.seconds > 0)) return undefined;
  const whole = { t0: 0, t1: pv.seconds };
  if (place === undefined) return { ...whole, known: true };
  const ok = (s?: PrevizShot) => !!s && Number.isFinite(s.t0) && Number.isFinite(s.t1) && s.t1 > s.t0 && s.t0 >= 0 && s.t1 <= pv.seconds + 0.05;
  if (pv.shots.length === takeShots && takeShots > 0) {
    const s = pv.shots[place - 1];
    if (ok(s)) return { t0: s.t0, t1: Math.min(s.t1, pv.seconds), known: true };
  }
  if (shotId !== undefined) {
    const s = pv.shots.find((x) => x.id !== undefined && x.id.toLowerCase() === shotId.toLowerCase());
    if (ok(s)) return { t0: s!.t0, t1: Math.min(s!.t1, pv.seconds), known: true };
  }
  return { ...whole, known: false };
}

/** The shots a list names, in runs: [1, 3, 4, 6, 8, 9, 10] → "1, 3, 4, 6, 8–10". */
export function runsOf(ns: number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const k of [...ns].sort((a, b) => a - b)) { const r = runs[runs.length - 1]; if (r && k === r[1] + 1) r[1] = k; else runs.push([k, k]); }
  return runs;
}

/** How many video inputs carry a voice: the prompt's line for that video says VOICE. */
export function voicedVideos(text: string, refs: RefLite[]): number {
  return refs.filter((r) => r.kind === 'VIDEO' && text.split('\n').some((l) => new RegExp(`\\b${r.label}\\b`).test(l) && /\bVOICE\b/.test(l))).length;
}
