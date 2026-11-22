'use client';
// Alma's words in the chat, with the pages she names as links that open in this window (the user, 12 Nov 2026).
// Inside a line: [label](page:scenes/S3) or [label](/films/…), written by Alma; a plain "the Story page", linked by
// the harness itself so older messages work too; **bold**, `code` and web addresses. Across lines (13 Nov 2026):
// Markdown tables, # headings and ``` code blocks are drawn as such. Everything else stays as typed.
import Link from 'next/link';
import { Fragment, memo, type ReactNode } from 'react';

/** page:<name> → the path under /films/<film>. Board steps without a page of their own open on the main page. */
const PAGES: Record<string, string> = {
  main: '', board: '', story: 'story', locations: 'locations', location: 'locations', views: 'locations',
  shots: '?open=shots', previz: '?open=previz', storyboards: '?open=previz', picks: '?open=gate', gate: '?open=gate',
  character: 'character', characters: 'character', cast: 'character', faces: 'character', clothing: 'character', sheet: 'character',
  voices: 'character/voices', elements: 'character/elements', scenes: 'scenes', scene: 'scenes', takes: 'scenes',
  go: 'go', edit: 'edit', finish: 'finish', sound: 'sound', release: 'release', debrief: 'debrief',
};
const NAMED = /\b((?:the |The )?(Story|Locations?|Views|Shots|Previz|Storyboards|Characters?|Cast|Voices|Elements|Scenes|Go|Edit|Finish|Sound|Release|Main|Board) page)\b|\b((?:the |The )?"?Your picks"?(?: page)?)/g;
const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|(https?:\/\/[^\s<>"'`]+)/g;
const linkCls = 'text-ink underline decoration-edge-strong underline-offset-2 hover:decoration-ink';

/** Where a link target leads: a path inside the app, an outside address, or nothing we know. */
export function pageHref(film: string, target: string): { href: string; outside?: boolean } | undefined {
  if (/^https?:\/\//.test(target)) return { href: target, outside: true };
  if (target.startsWith('/films/') || target === '/library' || target === '/settings') return { href: target };
  // page:scenes/S2#tests keeps its #part: the place on that page to jump to
  const [t, hash] = target.replace(/^page:/, '').replace(/^\/+/, '').split('#');
  const frag = hash ? `#${hash}` : '';
  const [head, ...rest] = t.split('/');
  const base = PAGES[head.toLowerCase()];
  if (base === undefined) return undefined;
  const root = `/films/${film}`;
  if (rest.length && (base === 'scenes' || base === 'character' || base === 'release')) return { href: `${root}/${base}/${rest.join('/')}${frag}` };
  return { href: (base.startsWith('?') ? `${root}${base}` : base ? `${root}/${base}` : root) + frag };
}

function named(film: string, text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(NAMED)) {
    const word = m[2] ?? 'picks';
    const to = pageHref(film, word);
    if (!to) continue;
    out.push(text.slice(at, m.index), <Link key={`${key}-${m.index}`} href={to.href} className={linkCls}>{m[0]}</Link>);
    at = m.index! + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

/** One run of text with its links, bold and code drawn. */
export function inline(text: string, film: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const k = `${key}-${m.index}`;
    out.push(<Fragment key={`${k}-pre`}>{named(film, text.slice(at, m.index), k)}</Fragment>);
    at = m.index! + m[0].length;
    if (m[1] !== undefined) {
      const to = pageHref(film, m[2]);
      out.push(!to ? m[1]
        : to.outside ? <a key={k} href={to.href} target="_blank" rel="noreferrer" className={linkCls}>{m[1]}</a>
        : <Link key={k} href={to.href} className={linkCls}>{m[1]}</Link>);
    } else if (m[5] !== undefined) {
      // a bare web address: a link in a new tab; the sentence's own full stop or bracket stays outside it
      const url = m[5].replace(/[.,;:!?)\]]+$/, '');
      out.push(<a key={k} href={url} target="_blank" rel="noreferrer" className={`${linkCls} break-all`}>{url}</a>, m[5].slice(url.length));
    } else if (m[3] !== undefined) out.push(<strong key={k} className="font-semibold text-ink">{named(film, m[3], k)}</strong>);
    else out.push(<code key={k} className="rounded-[4px] bg-bubble px-1 font-mono text-[12px]">{m[4]}</code>);
  }
  out.push(<Fragment key={`${key}-end`}>{named(film, text.slice(at), `${key}-end`)}</Fragment>);
  return out;
}

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[]; align: ('left' | 'center' | 'right')[]; rows: string[][] }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string };

const ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** "| a | b \\| c |" → ["a", "b | c"] */
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Cuts a message into what is drawn as a block (a table, a heading, a code block) and the text between. */
export function blocksOf(text: string): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    // blank lines next to a block are the block's own spacing
    while (buf.length && !buf[0].trim()) buf.shift();
    while (buf.length && !buf[buf.length - 1].trim()) buf.pop();
    if (buf.length) out.push({ kind: 'text', text: buf.join('\n') });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      const end = lines.findIndex((x, j) => j > i && /^\s*```\s*$/.test(x));
      if (end > i) { flush(); out.push({ kind: 'code', text: lines.slice(i + 1, end).join('\n') }); i = end; continue; }
    }
    if (ROW.test(l) && RULE.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('-')) {
      const head = cells(l);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : 'left'));
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && ROW.test(lines[j])) rows.push(cells(lines[j++]));
      flush();
      out.push({ kind: 'table', head, align, rows });
      i = j - 1;
      continue;
    }
    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) { flush(); out.push({ kind: 'heading', level: h[1].length, text: h[2] }); continue; }
    buf.push(l);
  }
  flush();
  return out;
}

const textCls = 'whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink-2 [overflow-wrap:anywhere]';

export const AlmaText = memo(function AlmaText({ text, film }: { text: string; film: string }) {
  const blocks = blocksOf(text);
  // the usual message: words only, one span as before
  if (blocks.length === 1 && blocks[0].kind === 'text') return <span className={textCls}>{inline(blocks[0].text, film, 't')}</span>;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.kind === 'text') return <span key={k} className={textCls}>{inline(b.text, film, k)}</span>;
        if (b.kind === 'heading') return <div key={k} role="heading" aria-level={Math.min(b.level + 2, 6)} className={b.level <= 2 ? 'pt-1 text-[14.5px] font-semibold tracking-[-0.01em] text-ink' : 'pt-0.5 text-[13.5px] font-semibold text-ink'}>{inline(b.text, film, k)}</div>;
        if (b.kind === 'code') return <pre key={k} className="scroll m-0 overflow-x-auto rounded-[8px] border border-line bg-well px-3 py-2.5 font-mono text-[12px] leading-[1.5] text-ink-2">{b.text}</pre>;
        return (
          <div key={k} className="scroll min-w-0 overflow-x-auto rounded-[9px] border border-edge">
            <table className="w-full border-collapse text-left text-[12.5px] leading-[1.45]">
              <thead>
                <tr className="bg-raised/70">
                  {b.head.map((c, j) => <th key={j} scope="col" style={{ textAlign: b.align[j] }} className="whitespace-nowrap border-b border-edge px-2.5 py-[7px] text-[12px] font-medium text-ink">{inline(c, film, `${k}h${j}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="transition-colors duration-150 hover:bg-raised/40">
                    {b.head.map((_, j) => <td key={j} style={{ textAlign: b.align[j] }} className={`border-t border-line px-2.5 py-[7px] align-top [overflow-wrap:break-word] ${j === 0 ? 'min-w-[92px] text-ink' : 'min-w-[128px] text-ink-2'}`}>{inline(r[j] ?? '', film, `${k}r${ri}c${j}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
});
