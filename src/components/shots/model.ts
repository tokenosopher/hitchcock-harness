'use client';
// What the Shot details page draws from, worked out once per record: the prompt's parts, the names in them, which
// inputs each part names, and how the take's shots line up with the prompt's shot parts. The rules are in
// components/lib/shotDetails.ts (pure, with its checks); this joins them to the page's data.
import { useMemo } from 'react';
import type { SentRecord, SentRef } from '@/server/types';
import type { BoardPanel, ShotDetailsExtra } from '@/server/films/read/previzTake';
import type { Shot } from '@/components/edit/shots';
import { mentionCtx, namedBySection, namedCounts, previzWindow, promptSections, sentence, shotSections, type MentionCtx, type PrevizWindow, type PromptSection } from '@/components/lib/shotDetails';

export interface Model {
  rec: SentRecord;
  refs: SentRef[];
  byOrder: Map<number, SentRef>;
  secs: PromptSection[];
  shotSecs: PromptSection[];
  ctx: MentionCtx;
  /** The inputs each part names (by their order). */
  bySec: Map<string, Set<number>>;
  /** For each input, the shot parts that name it (their place among the shot parts, 1-based). */
  byRef: Map<number, number[]>;
  counts: Map<number, number>;
  /** Names that keep their capital when a heading is set in sentence case (the people). */
  proper: Set<string>;
}

export function useModel(rec: SentRecord | undefined): Model | undefined {
  return useMemo(() => {
    if (!rec) return undefined;
    const secs = promptSections(rec.prompt.text);
    const ctx = mentionCtx(rec.prompt.text, rec.refs);
    const { bySec, byRef } = namedBySection(secs, ctx);
    // a person's name keeps its capital: the tags of the video inputs (characters) and of a sheet of the cast
    const proper = new Set(rec.refs.filter((r) => r.tag && (r.kind === 'VIDEO' || /^(cast|elements)\//.test(r.file ?? ''))).flatMap((r) => r.tag!.split(/\s+/)));
    return { rec, refs: rec.refs, byOrder: new Map(rec.refs.map((r) => [r.order, r])), secs, shotSecs: shotSections(secs), ctx, bySec, byRef, counts: namedCounts(rec.prompt.text, rec.refs), proper };
  }, [rec]);
}

/** "LANTERN" → "Lantern"; "ROCK SOUTH LOW" → "Rock south low"; a reference without a tag: "Image 6". */
export const tagName = (r: SentRef, m?: Model): string => (r.tag ? sentence(r.tag, m?.proper) : r.name);
/** "Image 6 Lantern" (the chip's and the card's whole name). */
export const fullName = (r: SentRef, m?: Model): string => (r.tag ? `${r.name} ${tagName(r, m)}` : r.name);

/** A shot of the page: its place in the take, how the page names it, and its part of the prompt when they match. */
export interface PageShot {
  i: number;
  /** "7", "4a": the prompt part's own id when the parts match, else the take's own (Shot.tag or n). */
  label: string;
  name: string;
  sec?: PromptSection;
  t0?: number; t1?: number;
}

/** The take's shots, each with its part of the prompt when there are as many parts as shots (matched by count only).
 *  With no clip cut yet, the prompt's shot parts stand for the shots. A shot is named by the place it stands for in its
 *  scene when `placeOf` knows it (places.ts, the one rule: "5–6" for FIX-tide-S1 take 2), else by its prompt part's id,
 *  else by its own number. */
export function pageShots(m: Model | undefined, cut: Shot[], placeOf?: (i: number) => string | undefined): { shots: PageShot[]; matched: boolean } {
  const parts = m?.shotSecs ?? [];
  if (!cut.length) return { shots: parts.map((s, k) => ({ i: k + 1, label: s.shot ?? String(k + 1), name: sentence(s.title, m?.proper), sec: s })), matched: true };
  const matched = parts.length === cut.length;
  return {
    matched,
    shots: cut.map((s) => {
      const sec = matched ? parts[s.i - 1] : undefined;
      return { i: s.i, label: placeOf?.(s.i) ?? sec?.shot ?? s.tag ?? String(s.n), name: sec ? sentence(sec.title, m?.proper) : '', sec, t0: s.in, t1: s.out };
    }),
  };
}

/** The pages of a storyboard a panel list puts a shot's panels on. */
export const pageOfPanel = (ctx: MentionCtx, n: number): number => Math.ceil(n / ctx.perPage);

/** The panels of a shot that sit on a page (when the storyboard's panels file is there). */
export function panelsOn(panels: BoardPanel[] | undefined, ctx: MentionCtx, shotId: string | undefined, page: number | undefined): BoardPanel[] {
  if (!panels || !shotId || page === undefined) return [];
  return panels.filter((p) => p.shot?.toLowerCase() === shotId.toLowerCase() && pageOfPanel(ctx, p.n) === page);
}

/** Where the previz plays for the shot open (or the whole take): its part, whether that part is known. */
export function previzFor(extra: ShotDetailsExtra | undefined, count: number, shot?: PageShot): PrevizWindow | undefined {
  const pv = extra?.previz;
  if (!pv?.clip) return undefined;
  if (!(pv.seconds > 0)) return { t0: 0, t1: 0, known: !shot };
  return previzWindow(pv, count, shot?.i, shot?.sec?.shot ?? shot?.label);
}
