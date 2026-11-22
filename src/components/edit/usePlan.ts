'use client';
// The timeline from day one on the page (15 Nov 2026, ASKS 47): GET /api/films/<film>/cut/plan, read once and on each
// change of the film's folder (whether the script is locked, whether the film has no cut yet, and the words of what an
// update would bring in), and the page's presses: "Update the timeline", "Put the boards back" and "Use Layout n in the
// film", each a step by
// the user (no version). Set only when the answer changed, so an idle page draws nothing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** `boards`: per scene, the storyboard version its boards come from and why. */
export interface PlanState { locked: boolean; first?: boolean; pending?: string; boards?: { scene: string; version: string; why: string; panels: number; newer?: string; take?: number; newestTake?: number; lines?: string }[] }

export function usePlan(film: string, changed?: string) {
  const [data, setData] = useState<PlanState>();
  const last = useRef('');
  const [bump, setBump] = useState(0);
  useEffect(() => {
    let live = true;
    void fetch(`/api/films/${film}/cut/plan`, { cache: 'no-store' }).then(async (r) => {
      if (!r.ok || !live) return;
      const j = (await r.json()) as PlanState;
      const d: PlanState = { locked: !!j.locked, ...(j.first ? { first: true } : {}), ...(j.pending ? { pending: j.pending } : {}), ...(Array.isArray(j.boards) && j.boards.length ? { boards: j.boards } : {}) };
      const s = JSON.stringify(d);
      if (s === last.current) return;
      last.current = s;
      setData(d);
    }, () => undefined);
    return () => { live = false; };
  }, [film, changed, bump]);
  const post = useCallback(async (body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; words?: string }> => {
    try {
      const r = await fetch(`/api/films/${film}/cut/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ by: 'user', ...body }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; words?: string };
      setBump((n) => n + 1);
      return r.ok ? { ok: true, words: j.words } : { ok: false, error: j.error ?? `the server answered ${r.status}` };
    } catch {
      return { ok: false, error: 'the harness server is not answering' };
    }
  }, [film]);
  const update = useCallback((rev?: number) => post({ action: 'update', ...(rev !== undefined ? { rev } : {}) }), [post]);
  const boardsBack = useCallback((scene: string, rev?: number) => post({ action: 'boards', scene, ...(rev !== undefined ? { rev } : {}) }), [post]);
  /** A scene's layout in its place, named by its previz take. */
  const layout = useCallback((scene: string, previz: number, rev?: number) => post({ action: 'layout', scene, previz, ...(rev !== undefined ? { rev } : {}) }), [post]);
  return useMemo(() => ({ data, update, boardsBack, layout }), [data, update, boardsBack, layout]);
}
