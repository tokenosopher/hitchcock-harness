// brief.md (or story.md for the audio-first films): the title line, the working title, the start date.
import { abs, firstDate, readText, type FilmCtx } from '../util';

export interface BriefInfo {
  path: string;
  markdown: string;
  title?: string;
  workingTitle?: string;
  started?: string;
  aspect?: '9:16' | '16:9';
}

/** "# <Title> (named by the user …; working title was …)" → title and working title. */
export function parseTitleLine(line: string): { title: string; workingTitle?: string } {
  const h = line.replace(/^#+\s*/, '').trim();
  const paren = h.indexOf(' (');
  const title = (paren > 0 ? h.slice(0, paren) : h).replace(/[:\s—-]+(script|story)$/i, '').trim();
  const inside = paren > 0 ? h.slice(paren + 2, h.lastIndexOf(')') > paren ? h.lastIndexOf(')') : undefined) : '';
  const wt = /working title (?:was|is)\s+([^;,()]+)/i.exec(inside);
  if (wt) return { title, workingTitle: wt[1].trim() };
  if (/^working title$/i.test(inside.trim())) return { title, workingTitle: title };
  return { title };
}

export async function readBrief(ctx: FilmCtx): Promise<BriefInfo | undefined> {
  for (const rel of ['brief.md', 'story.md', 'README.md']) {
    const markdown = await readText(abs(ctx, rel));
    if (markdown === undefined) continue;
    const head = markdown.split('\n').find((l) => /^#\s/.test(l));
    if (!head) {
      ctx.warn.add(rel, 'no "# Title" heading');
      continue;
    }
    if (rel === 'README.md' && /^#\s*New film: start here/i.test(head)) continue; // the scaffold's README, not a title
    const { title, workingTitle } = parseTitleLine(head);
    const top = markdown.split('\n').slice(0, 12).join('\n');
    const started = firstDate(/Started ([^.]+)\./.exec(top)?.[1]) ?? firstDate(top);
    const aspectM = /\b(9:16|16:9)\b/.exec(markdown);
    return { path: rel, markdown, title, workingTitle, started, aspect: aspectM?.[1] as BriefInfo['aspect'] };
  }
  return undefined;
}
