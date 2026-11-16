// taste.md (the film repo's root): one new row per pick, in the record table's own columns:
// | Date | Film | Choice | The candidates | The pick | The user's words | Predicted | Right? | What it says |
// The last cell ("What it says") and the score at the bottom are Alma's to write after the pick.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Writer } from './writes';

export interface TasteRow {
  date: string;          // 2026-11-08
  film: string;          // the film's title
  choice: string;        // "C01 Maren face"
  candidates: string;    // "r2-faces: r2-1 to r2-15 (15)"
  pick: string;          // "r2-7" (written bold)
  pickNote?: string;     // ": stern, tanned" after the bold id, from the candidate's note
  words: string;         // the user's words, or how the pick was made
  predicted?: string;
  right?: boolean;
  says?: string;
}

const cell = (s: string): string => s.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim() || '–';

export function formatRow(r: TasteRow): string {
  const cells = [
    r.date, r.film, r.choice, r.candidates,
    `**${r.pick}**${r.pickNote ? `: ${r.pickNote}` : ''}`,
    r.words,
    r.predicted ?? 'no prediction made',
    r.predicted === undefined ? '–' : r.right ? 'yes' : 'no',
    r.says ?? '–',
  ].map(cell);
  return `| ${cells.join(' | ')} |`;
}

/** "r2-1, r2-2 … r2-15 (15)" for a round's candidate ids. */
export function candidatesCell(round: string | undefined, ids: string[]): string {
  if (!ids.length) return round ?? '–';
  const shown = ids.length > 8 ? `${ids.slice(0, 3).join(', ')} … ${ids[ids.length - 1]}` : ids.join(', ');
  return `${round ? `${round}: ` : ''}${shown} (${ids.length})`;
}

/** Puts the row after the last row of the table under "## The record" (else the last table, else the end). */
export async function appendTasteRow(repo: string, row: TasteRow, w: Writer): Promise<{ file: string; line: string }> {
  const file = path.join(repo, 'taste.md');
  const line = formatRow(row);
  const text = await fs.readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) throw new Error(`${w.show(file)} not found`);
  const lines = text.split('\n');
  let start = lines.findIndex((l) => /^##\s+The record/i.test(l));
  if (start < 0) start = 0;
  let last = -1;
  for (let i = start; i < lines.length; i++) {
    if (i > start && /^##\s/.test(lines[i]) && last >= 0) break;
    if (lines[i].trim().startsWith('|')) last = i;
  }
  let before: string;
  let after: string;
  if (last < 0) {
    before = text.endsWith('\n') ? text : text + '\n';
    after = '';
  } else {
    before = lines.slice(0, last + 1).join('\n') + '\n';
    after = lines.slice(last + 1).join('\n');
  }
  // keep before + after equal to the file as read (insertInto checks it)
  if (last < 0 && !text.endsWith('\n')) {
    await w.insertInto(file, text, `\n${line}\n`, '', `row: ${row.choice} → ${row.pick}`);
  } else {
    await w.insertInto(file, before, `${line}\n`, after, `row: ${row.choice} → ${row.pick}`);
  }
  return { file, line };
}
