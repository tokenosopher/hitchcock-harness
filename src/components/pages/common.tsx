'use client';
// What every film page needs: the slug, the state, the tasks, the UI context and the header meta.
import { useParams } from 'next/navigation';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { useUI } from '@/components/data/ui';
import { fmtCost, repoPath } from '@/components/lib/format';
import type { FilmState } from '@/server/types';

export function useFilmPage() {
  const params = useParams<{ film: string }>();
  const film = params.film;
  const { state, error } = useFilm();
  const { tasks, events } = useThread();
  const ui = useUI();
  return { film, state, error, tasks, events, ui, base: `/films/${film}` };
}

/** The film's spend for a header: net of refunds ("1398.53 cr net"), what was charged and refunded on hover. */
export function filmCost(s: FilmState): { text: string; title?: string } {
  const total = fmtCost(s.spend.total);
  const back = s.spend.refunded;
  if (!back || (!back.credits && !back.usd?.length)) return { text: total };
  const refunded = fmtCost(back);
  // "net" on the unit the refunds came back in: "1398.53 cr net · $22.40 · Higgsfield"
  const t = s.spend.total;
  const text = back.credits && t.credits !== undefined
    ? [`${fmtCost({ credits: t.credits })} net`, fmtCost({ usd: t.usd })].filter(Boolean).join(' · ')
    : `${total} net`;
  return { text, title: `${refunded} refunded${s.spend.charged ? ` · ${fmtCost(s.spend.charged)} charged` : ''} · every row of spend.md` };
}

/** "9:16 · assets/films/<slug> · 404.78 cr · $9.30 · Higgsfield" as text (the board's "as of" label is not shown in the app). */
export function filmMetaText(s: FilmState, ...extra: string[]) {
  const parts = [s.film.aspect ?? '', repoPath(s.film.folder, s.film.repo), ...extra, filmCost(s).text];
  return parts.filter(Boolean).join(' · ');
}

/** The header meta: the same line, the cost with the refunds on hover. */
export function filmMeta(s: FilmState, ...extra: string[]) {
  // the folder goes last: it is the longest part and the one a narrow header may cut
  const head = [s.film.aspect ?? '', ...extra].filter(Boolean).join(' · ');
  const where = repoPath(s.film.folder, s.film.repo);
  const cost = filmCost(s);
  if (!cost.text) return [head, where].filter(Boolean).join(' · ');
  return <>{head}{head ? ' · ' : ''}<span title={cost.title} className={cost.title ? 'cursor-help underline decoration-edge-strong decoration-dotted underline-offset-2' : undefined}>{cost.text}</span>{where ? ` · ${where}` : ''}</>;
}

export function filmPath(s: FilmState, rel?: string) {
  return repoPath(s.film.folder, s.film.repo, rel);
}
