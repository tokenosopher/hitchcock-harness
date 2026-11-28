'use client';
// A card's words, never a wall of text. The text keeps its line breaks and paragraphs, "- " or "• " lines are drawn as a list, **bold** stays bold (the chat's
// own inline marks, AlmaText). Past about five lines on the phone (six on a computer) it folds to its first lines
// under a soft fade, with "Show more"; "Show less" folds it back, both sliding by height. Only the words fold: the
// quote of a go, the buttons and the pictures sit outside this block and always show.
import { useLayoutEffect, useRef, useState } from 'react';
import { inline } from '@/components/shell/AlmaText';
import { useIsPhone } from '@/components/shell/useIsPhone';
import { cn } from '@/lib/utils';

type TextBlock = { kind: 'p'; lines: string[] } | { kind: 'list'; items: string[] };

const ITEM = /^\s*[-•*]\s+(.*)$/;

/** A card's paragraphs as blocks: a blank line ends a paragraph, a run of "- " / "• " / "* " lines is a list, and an
 *  indented line under a list item carries on that item. Every other line break is kept as written. */
export function textBlocks(paras: string[]): TextBlock[] {
  const out: TextBlock[] = [];
  for (const para of paras) {
    let cur: TextBlock | undefined;
    for (const l of para.split(/\r?\n/)) {
      if (!l.trim()) { cur = undefined; continue; }
      const m = ITEM.exec(l);
      if (m) {
        if (cur?.kind !== 'list') out.push((cur = { kind: 'list', items: [] }));
        cur.items.push(m[1].trim());
      } else if (cur?.kind === 'list' && /^\s{2,}/.test(l)) {
        cur.items[cur.items.length - 1] += ` ${l.trim()}`;
      } else {
        if (cur?.kind !== 'p') out.push((cur = { kind: 'p', lines: [] }));
        cur.lines.push(l.trim());
      }
    }
  }
  return out;
}

/** A card's line under its title that is more than a line: it has a line break, or runs past about three lines of the
 *  card. It is then drawn as the card's text. */
export const longSub = (sub: string): boolean => /\n/.test(sub.trim()) || sub.trim().length > 320;

const SIZE = 13;
const LEADING = 1.55;
const LINE = SIZE * LEADING;

export function CardText({ text, film }: { text: string[]; film: string }) {
  const phone = useIsPhone();
  const inner = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(0);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setFull(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cap = Math.round(LINE * (phone ? 5 : 6));
  // a fold that would hide a line or less is not worth its button: short text shows whole
  const long = full > cap + LINE * 1.5;
  const blocks = textBlocks(text);
  return (
    <div data-card-text className="flex min-w-0 max-w-[760px] flex-col gap-1.5">
      <div data-card-fold={long ? (open ? 'open' : 'folded') : undefined}
        style={long ? { maxHeight: open ? full : cap } : undefined}
        className={cn('relative min-w-0', long && 'overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none')}>
        <div ref={inner} className="flex min-w-0 flex-col gap-3">
          {blocks.map((b, i) => (b.kind === 'p'
            ? <p key={i} className="m-0 break-words text-[13px] leading-[1.55] text-ink-2">{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, film, `t${i}-${j}`)}</span>)}</p>
            : (
              <ul key={i} className={cn('m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-[1.55] text-ink-2', i > 0 && blocks[i - 1].kind === 'p' && '-mt-1.5')}>
                {b.items.map((it, j) => (
                  <li key={j} className="flex min-w-0 gap-2">
                    <span aria-hidden="true" className="mt-[0.68em] size-[3px] flex-none rounded-full bg-sub" />
                    <span className="min-w-0 break-words">{inline(it, film, `l${i}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            )))}
        </div>
        {long && (
          <div aria-hidden="true"
            className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-panel to-transparent transition-opacity duration-300 ease-out motion-reduce:transition-none', open ? 'opacity-0' : 'opacity-100')} />
        )}
      </div>
      {long && (
        <button type="button" data-card-more aria-expanded={open} onClick={() => setOpen(!open)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12.5px] text-sub transition-colors duration-200 animate-in fade-in-0 hover:text-ink">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
