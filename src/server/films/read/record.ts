// The film record as plain text, for the Finish and Release readers: spend.md rows as whole lines and the
// review page's sections (review/cards.json), so a fact can be quoted with the file and date it came from.
// Read-only; nothing here writes. Presigned or query-carrying URLs are taken out of every text returned.
import { promises as fs } from 'node:fs';
import { abs, asRecord, asString, cells, firstDate, readJson, readText, redact, type FilmCtx } from '../util';

/** A sentence from the record and where it came from ("spend.md · 1 Nov", "review/cards.json"); `value` is the
 *  short form a page shows when the sentence is long ("bottom-anchored at 0.79"). */
export interface RecordFact { text: string; from: string; date?: string; value?: string }

/** A record file's text as sentences, with its source label: what findFact searches. */
export interface RecordSource { parts: string[]; from: string; date?: string }

export interface SpendRow { date: string; cells: string[]; text: string; line: number }

/** Every dated row of spend.md's tables, all cells kept (the readers search the whole row). */
export async function spendRows(ctx: FilmCtx): Promise<SpendRow[]> {
  const md = await readText(abs(ctx, 'spend.md'));
  if (!md) return [];
  const out: SpendRow[] = [];
  md.split('\n').forEach((raw, i) => {
    if (!raw.trim().startsWith('|')) return;
    const c = cells(raw);
    const date = /^\d{4}-\d\d-\d\d$/.test(c[0] ?? '') ? c[0] : undefined;
    if (!date) return;
    out.push({ date, cells: c.map(clean), text: clean(c.slice(1).join(' · ')), line: i + 1 });
  });
  return out;
}

export interface ReviewCard { type: string; title?: string; sub?: string; text?: string; file?: string; items: { file?: string; label?: string }[] }
export interface ReviewSection { heading: string; sub: string; date?: string; cards: ReviewCard[] }

/** review/cards.json's sections, newest first as the file keeps them. */
export async function reviewSections(ctx: FilmCtx): Promise<ReviewSection[]> {
  const j = asRecord(await readJson(ctx, 'review/cards.json'));
  const secs = Array.isArray(j?.sections) ? j.sections : [];
  return secs.map((s): ReviewSection => {
    const r = asRecord(s) ?? {};
    const heading = clean(asString(r.heading) ?? '');
    const cards = (Array.isArray(r.cards) ? r.cards : []).map((c): ReviewCard => {
      const k = asRecord(c) ?? {};
      const items = (Array.isArray(k.items) ? k.items : []).map((x) => {
        const it = asRecord(x) ?? {};
        return { file: asString(it.file), label: clean(asString(it.label) ?? '') || undefined };
      });
      return {
        type: asString(k.type) ?? 'card', title: clean(asString(k.title) ?? '') || undefined, sub: clean(asString(k.sub) ?? '') || undefined,
        text: asString(k.text) !== undefined ? redact(asString(k.text)!) : undefined, file: asString(k.file), items,
      };
    });
    return { heading, sub: clean(asString(r.sub) ?? ''), date: dateIn(heading), cards };
  });
}

/** "… · 3 Nov" at the end of a heading → ISO, with the year of the film (the headings carry none). */
function dateIn(heading: string): string | undefined {
  const m = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.exec(heading);
  if (!m) return undefined;
  return firstDate(`${m[1]} ${m[2]} 2026`);
}

/** Sentences of a text: split after . or ! before a capital, a digit or a quote, and at every semicolon,
 *  never inside brackets. */
export function sentences(text: string, semicolons = true): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    cur += ch;
    const next = text.slice(i + 1, i + 3);
    const end = depth === 0 && ((semicolons && ch === ';' && /^\s/.test(next)) || (/[.!?]/.test(ch) && /^\s+[A-Z0-9'"‘“(]/.test(text.slice(i + 1, i + 4))));
    if (end) {
      out.push(cur);
      cur = '';
    }
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/;$/, '')).filter(Boolean);
}

/** The first matching sentence, newest source first, as a fact. */
export function findFact(re: RegExp, sources: RecordSource[]): RecordFact | undefined {
  for (const s of sources) {
    const hit = s.parts.find((x) => re.test(x));
    if (hit) return { text: hit, from: s.from, date: s.date };
  }
  return undefined;
}

/** Every matching sentence, newest source first. */
export function findFacts(re: RegExp, sources: RecordSource[]): RecordFact[] {
  return sources.flatMap((s) => s.parts.filter((x) => re.test(x)).map((text) => ({ text, from: s.from, date: s.date })));
}

/** Bytes and date of a file, or undefined when it is not there. */
export async function fileFact(p: string): Promise<{ bytes: number; date: string } | undefined> {
  try {
    const st = await fs.stat(p);
    return st.isFile() ? { bytes: st.size, date: new Date(st.mtimeMs).toISOString() } : undefined;
  } catch {
    return undefined;
  }
}

/** An SRT's cue count and its longest line, in characters. */
export function srtFacts(text: string): { cues: number; maxChars: number; seconds?: number } {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).filter((b) => /-->/.test(b));
  let maxChars = 0;
  let end = 0;
  for (const b of blocks) {
    const lines = b.split('\n');
    const t = lines.findIndex((l) => l.includes('-->'));
    const m = /-->\s*(\d+):(\d+):(\d+)[,.](\d+)/.exec(lines[t] ?? '');
    if (m) end = Math.max(end, +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000);
    for (const l of lines.slice(t + 1)) maxChars = Math.max(maxChars, l.replace(/<[^>]+>/g, '').trim().length);
  }
  return { cues: blocks.length, maxChars, seconds: end || undefined };
}

/** Backticks and bold dropped, presigned queries removed. */
const clean = (s: string): string => redact(s.replace(/\*\*|`/g, '')).trim();
