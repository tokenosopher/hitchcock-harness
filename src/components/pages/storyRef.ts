// Pointing Alma at a paragraph of the story, or at words in it. Pure: the paragraphs of the text with where each starts and ends, the one the
// caret is in, and the chip that goes into Alma's box with the exact words she reads. StoryEditor draws the button.
import type { Chip } from '@/server/types';

/** A paragraph of the story: its number (1 = the first), where it starts and ends in the text, and its words. */
export interface Para { n: number; start: number; end: number; text: string }

/** The story's paragraphs, separated by blank lines; each without the spaces around it. */
export function storyParas(text: string): Para[] {
  const out: Para[] = [];
  const re = /\n[ \t]*\n\s*/g;
  let at = 0;
  const take = (a: number, b: number) => {
    const raw = text.slice(a, b);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ n: out.length + 1, start: a + lead, end: a + lead + t.length, text: t });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) { take(at, m.index); at = m.index + m[0].length; }
  take(at, text.length);
  return out;
}

/** The paragraph the caret at `pos` is in (at its very end counts); on a blank line between two, none. */
export function paraAt(paras: Para[], pos: number): Para | undefined {
  return paras.find((p) => pos >= p.start && pos <= p.end);
}

/** The paragraphs a selection from `a` to `b` touches. */
export function parasIn(paras: Para[], a: number, b: number): Para[] {
  return paras.filter((p) => p.end > a && p.start < b);
}

/** The first words of `t`, cut at a word and marked with … when there is more: what a chip shows. */
export function firstWords(t: string, max = 32): string {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max / 2 ? cut.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:.—–-]+$/, '')}…`;
}

/** How much of the words Alma reads with the chip, at most: a long paragraph keeps its start and ends in …. */
export const ABOUT_MAX = 1200;
const capped = (t: string) => (t.length <= ABOUT_MAX ? t : `${t.slice(0, ABOUT_MAX).replace(/\s+\S*$/, '')}…`);

export interface StoryRef { chip: Chip; about: string; placeholder: string }

/** The chip for a paragraph, or for the words selected from `sel[0]` to `sel[1]` when they touch it. `source` names
 *  what the text is ("story/v3.md", "the user's unsaved edit of story/v3.md"). */
export function storyRef(text: string, para: Para, source: string, sel?: [number, number]): StoryRef {
  const paras = storyParas(text);
  if (sel && sel[1] > sel[0]) {
    const words = text.slice(sel[0], sel[1]).trim();
    const hit = parasIn(paras, sel[0], sel[1]);
    if (words && hit.some((p) => p.n === para.n)) {
      const where = hit.length > 1 ? `paragraphs ${hit[0].n} to ${hit[hit.length - 1].n}` : `paragraph ${hit[0].n}`;
      return {
        chip: { id: `story:sel:${sel[0]}-${sel[1]}`, label: `Story · “${firstWords(words, 28)}”` },
        about: `these words from ${where} of the story (${source}), word for word: “${capped(words)}”`,
        placeholder: 'Say something about these words…',
      };
    }
  }
  return {
    chip: { id: `story:p${para.n}`, label: `Story · ¶${para.n} · ${firstWords(para.text, 28)}` },
    about: `paragraph ${para.n} of the story (${source}), word for word: “${capped(para.text)}”`,
    placeholder: 'Say something about this paragraph…',
  };
}
