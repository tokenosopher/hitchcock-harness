'use client';
// The go for the video, on the client: the review from GET /api/films/[film]/go (re-read whenever the film's
// files change), which scenes the go starts, the message it puts in the composer, and the last balance the
// thread mentions. Nothing here spends: the go is the user's own message to Alma (SPEC principle 7).
import { useEffect, useState } from 'react';
import { useFilm } from '@/components/data/film';
import type { GoReview, GoScene, ThreadEvent } from '@/server/types';

export interface GoData { review?: GoReview; error?: string; loading: boolean }

/** The review, for every scene or one (`scene`, optionally at an older prompt `version`). */
export function useGo(film: string, opts: { scene?: string; version?: string } = {}): GoData {
  const stamp = useFilm().state?.updatedAt;
  const { scene, version } = opts;
  const [data, setData] = useState<GoData>({ loading: true });
  useEffect(() => {
    const q = new URLSearchParams();
    if (scene) q.set('scene', scene);
    if (scene && version) q.set('version', version);
    const ctl = new AbortController();
    fetch(`/api/films/${encodeURIComponent(film)}/go${q.size ? `?${q}` : ''}`, { signal: ctl.signal, cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as GoReview & { error?: string };
        if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData({ review: j, loading: false });
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setData((d) => ({ review: d.review, error: (e as Error).message, loading: false }));
      });
    return () => ctl.abort();
  }, [film, scene, version, stamp]);
  return data;
}

/** The scenes on the page: every scene still without a take, or every scene (a re-run). */
export function goList(r: GoReview | undefined, includeTaken: boolean): GoScene[] {
  return (r?.scenes ?? []).filter((s) => includeTaken || s.takes === 0);
}

export const fmtCr = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)} cr`;
export const totalCredits = (scenes: GoScene[]): number => Math.round(scenes.reduce((a, s) => a + (s.credits ?? 0), 0) * 100) / 100;
export const totalSeconds = (scenes: GoScene[]): number => scenes.reduce((a, s) => a + (s.duration ?? 0), 0);

/** "Go for the video: S1, S2, S3 (prompt v7, v11, v6). Total ≈ 171 cr." */
export function goMessage(scenes: GoScene[]): string {
  const ids = scenes.map((s) => s.id).join(', ');
  const vs = scenes.map((s) => s.prompt?.version ?? '?').join(', ');
  const total = totalCredits(scenes);
  return `Go for the video: ${ids} (prompt ${vs}). Total ≈ ${fmtCr(total)}.`;
}

/** The credits basis for a hover: "25 s × 3 cr/s · 3 cr/s at 480p draft: …". */
export function creditsBasis(s: GoScene, r?: GoReview): string {
  if (s.credits === undefined || !r?.rate) return r?.rate ? 'no length to quote from' : 'no seedance_2_5 rate in spend.md yet';
  const from = s.prompt?.media?.settings.duration !== undefined ? 'the media list' : 'the shots file';
  return `${s.duration} s (${from}) × ${r.rate.crPerSec} cr/s = ${fmtCr(s.credits)}. Rate: ${r.rate.basis}. Alma quotes the exact price with get_cost before submitting.`;
}

const BALANCE = /\bbalance\b[^\n.]{0,40}?\b(\d[\d,]*(?:\.\d+)?)\s*(?:cr|credits)\b|\b(\d[\d,]*(?:\.\d+)?)\s*(?:cr|credits)\s+(?:left|remaining|in the balance)\b/i;

/** The last Higgsfield balance the thread mentions (Alma's text or a tool line), with its date. */
export function threadBalance(events: ThreadEvent[]): { credits: number; date?: string; source: string } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const text = e.kind === 'assistant_text' && !e.partial ? e.text : e.kind === 'tool_result' || e.kind === 'system' ? ('summary' in e ? e.summary : e.text) : '';
    const m = text ? BALANCE.exec(text) : null;
    if (m) return { credits: Number((m[1] ?? m[2]).replace(/,/g, '')), date: e.at, source: 'the thread' };
  }
  return undefined;
}
