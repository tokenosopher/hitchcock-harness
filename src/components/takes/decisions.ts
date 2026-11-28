// What the user decided about a take that came back, on the New takes page. Pure, shared by the server's
// store (server/edit/takeDecisions.ts) and the page.
export type Decision = 'used' | 'later' | 'rejected';
export const DECISIONS: Decision[] = ['used', 'later', 'rejected'];
export interface Decided { d: Decision; at: number }
/** By the take's file (TakeShots.src). */
export type DecidedMap = Record<string, Decided>;
/** One change: a decision on a take, or `null` to take it back. */
export interface DecisionPost { src: string; d: Decision | null }

/** A request body checked: undefined when it is not one decision on one take. */
export function cleanDecision(body: unknown): DecisionPost | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as { src?: unknown; d?: unknown };
  const src = typeof b.src === 'string' ? b.src.trim() : '';
  if (!src || src.length > 600 || src.includes('\0')) return undefined;
  if (b.d === null) return { src, d: null };
  return typeof b.d === 'string' && (DECISIONS as string[]).includes(b.d) ? { src, d: b.d as Decision } : undefined;
}

/** A store's entry read leniently (the file is the harness's own, but a hand edit must not break the page). */
export function readDecidedMap(v: unknown): DecidedMap {
  const out: DecidedMap = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const e = x as { d?: unknown; at?: unknown } | undefined;
    if (e && typeof e.d === 'string' && (DECISIONS as string[]).includes(e.d)) out[k] = { d: e.d as Decision, at: typeof e.at === 'number' ? e.at : 0 };
  }
  return out;
}
