'use client';
// A shelf of film files from one folder: the cuts on disk, the finished films. A plain list; choosing a file
// opens it beside the list in a player that keeps the film's shape, and hands it to Alma as a chip, so
// "use this one" needs no path typed. Read-only; nothing loads until a file is chosen.
import { useState } from 'react';
import type { FilmState } from '@/server/types';
import { fmtDate, plural, repoPath } from '@/components/lib/format';
import { Media } from '@/components/media/Media';
import { cn } from '@/lib/utils';

const FIRST = 6;

export function VideoShelf({ s, title, note, files, onChip, tag }: {
  s: FilmState; title: string; note?: string;
  /** Paths relative to the film folder, in the order to list them. */
  files: string[];
  onChip: (id: string, label: string, ref: string) => void;
  /** A small word after a file's name: "in the cut", "as posted". */
  tag?: (file: string) => string | undefined;
}) {
  const [sel, setSel] = useState<string>();
  const [all, setAll] = useState(false);
  if (!files.length) return null;
  const open = sel && files.includes(sel) ? sel : undefined;
  const shown = all ? files : files.slice(0, FIRST);
  const nine = (s.film.aspect ?? '9:16') === '9:16';
  const rel = (f: string) => repoPath(s.film.folder, s.film.repo, f);
  const name = (f: string) => f.split('/').pop()!;
  // Every file starts with the film's name, so a clipped row would read the same as its neighbours: leave it out.
  const short = (f: string) => {
    const n = name(f);
    const cut = [`${s.film.slug}-`, `${s.film.title} - `, `${s.film.title}-`].find((pre) => n.toLowerCase().startsWith(pre.toLowerCase()) && n.length > pre.length + 4);
    return cut ? n.slice(cut.length) : n;
  };
  return (
    <section aria-label={title} className="overflow-hidden rounded-[10px] border border-edge">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-well px-4 py-3">
        <span className="lbl">{title}</span>
        <span className="text-[12px] text-sub">{[plural(files.length, 'file'), note].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="flex items-start max-[760px]:flex-col-reverse">
        <ul className="m-0 min-w-0 flex-1 list-none p-0 max-[760px]:w-full">
          {shown.map((f) => {
            const on = f === open;
            const t = tag?.(f);
            return (
              <li key={f} className="border-b border-line last:border-b-0">
                <button type="button" aria-pressed={on} title={`${f} · play it here and hand it to Alma`}
                  onClick={() => { setSel(f); onChip(`file:${f}`, short(f).length > 34 ? `${short(f).slice(0, 33)}…` : short(f), rel(f)); }}
                  className={cn('box-border flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 px-4 py-2 text-left text-ink hover:bg-tile', on ? 'bg-raised' : 'bg-transparent')}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={cn('flex-none', on ? 'text-ink' : 'text-mute')}><path d="M2 1l7 4-7 4z" /></svg>
                  <span className="min-w-0 flex-1 font-mono text-[12px] leading-snug [overflow-wrap:anywhere]">{short(f)}</span>
                  {t && <span className="flex-none text-[11.5px] text-sub">{t}</span>}
                </button>
              </li>
            );
          })}
          {files.length > shown.length && (
            <li className="px-4 py-2.5">
              <button type="button" onClick={() => setAll(true)} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-sub hover:text-ink">Show all {files.length}</button>
            </li>
          )}
        </ul>
        {open && (
          <div className="flex flex-none flex-col gap-1.5 border-l border-line p-4 max-[760px]:w-full max-[760px]:border-b max-[760px]:border-l-0">
            <Media key={open} path={rel(open)} w={640} t={1} play autoPlay fit="contain"
              className={cn('rounded-[8px] border border-edge bg-black', nine ? 'aspect-[9/16] w-[200px]' : 'aspect-[16/9] w-[340px] max-w-full')} />
            <span className={cn('truncate font-mono text-[10.5px] text-mute', nine ? 'max-w-[200px]' : 'max-w-[340px]')} title={open}>{name(open)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export const newestFirst = (files: string[], written?: Record<string, string>): string[] =>
  [...files].reverse().sort((a, b) => (written?.[b] ?? '').localeCompare(written?.[a] ?? ''));
export const day = (iso?: string): string | undefined => (iso ? fmtDate(iso.slice(0, 10)) : undefined);

/** The finished films with the plain names first (the ones that went out), then the variants kept beside them. */
export const finalsFirst = (files: string[]): string[] => {
  const rank = (f: string) => (/as-posted/i.test(f) ? 0 : /final-(clean|captioned)(-480p)?\.[a-z0-9]+$/i.test(f) ? 1 : 2);
  return [...files].sort((a, b) => rank(a) - rank(b));
};
/** What a finished file is for, from its name. */
export const finalTag = (f: string): string | undefined =>
  /as-posted/i.test(f) ? 'as posted' : /captioned-480p/i.test(f) ? 'captioned · phone size' : /captioned/i.test(f) ? 'captioned' : /clean/i.test(f) ? 'clean, no captions' : undefined;
