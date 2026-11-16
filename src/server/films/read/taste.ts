// taste.md (the film repo's root): every pick the user made between candidates, with the prediction
// made before it. Filtered to one film by its title or working title.
import path from 'node:path';
import type { TastePick } from '../../types';
import { readText, stripMd, tables, type Warnings } from '../util';

export interface TastePickX extends TastePick {
  film: string;
  candidates?: string;
  words?: string;
  says?: string;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function readTasteAll(repo: string, warn: Warnings): Promise<TastePickX[]> {
  const text = await readText(path.join(repo, 'taste.md'));
  if (text === undefined) return [];
  const out: TastePickX[] = [];
  for (const t of tables(text)) {
    const h = t.header;
    const iFilm = h.indexOf('film');
    const iPick = h.findIndex((x) => /pick/.test(x));
    if (iFilm < 0 || iPick < 0) continue;
    const iDate = h.indexOf('date');
    const iChoice = h.findIndex((x) => /choice/.test(x));
    const iCands = h.findIndex((x) => /candidates/.test(x));
    const iWords = h.findIndex((x) => /words/.test(x));
    const iPred = h.findIndex((x) => /predict/.test(x));
    const iRight = h.findIndex((x) => /right/.test(x));
    const iSays = h.findIndex((x) => /says/.test(x));
    t.rows.forEach((r, k) => {
      if (r.length !== h.length) warn.add('taste.md', `line ${t.line + 2 + k}: ${r.length} cells for ${h.length} columns`);
      const g = (i: number): string | undefined => (i >= 0 && r[i] && r[i] !== '–' && r[i] !== '-' ? r[i] : undefined);
      const right = g(iRight);
      out.push({
        film: r[iFilm] ?? '',
        date: g(iDate) ?? '',
        what: g(iChoice) ?? '',
        prediction: g(iPred),
        pick: stripMd(g(iPick) ?? ''),
        right: right ? (/^yes/i.test(right) ? true : /^no/i.test(right) ? false : undefined) : undefined,
        candidates: g(iCands),
        words: g(iWords),
        says: g(iSays),
      });
    });
  }
  return out;
}

export function tasteFor(all: TastePickX[], titles: (string | undefined)[]): TastePickX[] {
  const want = new Set(titles.filter(Boolean).map((t) => norm(t!)));
  return all.filter((p) => want.has(norm(p.film)));
}
