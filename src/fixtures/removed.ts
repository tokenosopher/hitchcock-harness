// MOCK=boards: "Remove" in "Waiting for you" on the sample films. What the user removed is kept in memory,
// as harness/removed.json keeps it for a real film, and laid on the sample's state (mock.ts mockState); the send answers
// the message the real one would give Alma. Nothing is written. Server-only.
import type { FilmState } from '@/server/types';
import { choicesHead, removalBlock, type Removal } from '@/components/lib/remove';
import { mockState } from './mock';

const g = globalThis as unknown as { __hhMockRemoved?: Map<string, Removal[]> };
const store: Map<string, Removal[]> = (g.__hhMockRemoved ??= new Map());

/** The sample's state with what was removed on it. */
export function withMockRemoved<T extends FilmState | undefined>(slug: string, s: T): T {
  const rs = store.get(slug);
  return s && rs?.length ? { ...s, removed: rs } : s;
}
/** A sample's removals forgotten (a test's fresh start). */
export const resetMockRemoved = (slug: string): void => { store.delete(slug); };

/** POST …/done on a sample film with removals: kept in memory; when they are all that was sent, the message the real
 *  send would give Alma (other choices go on to their own sample handlers). Nothing removed: undefined. */
export function removeMockDone(slug: string, answers: unknown[], picks: unknown[], approvals: unknown[], removals: Removal[], state?: FilmState): Response | undefined {
  if (!removals.length) return undefined;
  const s = state ?? mockState(slug);
  if (!s) return Response.json({ error: `No film "${slug}"` }, { status: 404 });
  const at = new Date().toISOString();
  const named = removals.flatMap((r): (Removal & { card?: string })[] => {
    if (!r.key.startsWith('card:')) return [r];
    const c = s.feed?.asks.find((x) => x.key === r.key.slice(5));
    return c ? [{ key: r.key, title: c.title, card: c.id ?? c.key }] : [];
  });
  const keys = new Set(named.map((r) => r.key));
  store.set(slug, [...(store.get(slug) ?? []).filter((x) => !keys.has(x.key)), ...named.map(({ card: _card, ...r }) => ({ ...r, at }))]);
  if (answers.length || picks.length || approvals.length) return undefined;
  if (!named.length) return Response.json({ error: 'nothing left to remove: those cards no longer ask' }, { status: 409 });
  const message = [choicesHead(named.length, false, true), ...removalBlock(named)].join('\n');
  return Response.json({ ok: true, dryRun: true, film: slug, answers: [], picks: [], approvals: [], removals: named, message, notified: false });
}
