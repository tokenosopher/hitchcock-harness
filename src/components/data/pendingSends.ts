// Messages sent from the box that the thread shows before the server has them.
// A tap puts the message in the thread at once as the user's own, marked as sending; when the thread's own copy of it
// arrives (the POST's answer, the stream or a poll), that copy takes its place under the same key, so nothing is drawn
// twice and nothing flickers. A send that failed stays, marked "Not sent", with its words, until it is tried again.
// Pure: no React, no fetch (scripts/pending-sends-test.ts).
import type { HarnessContext, ThreadEvent } from '@/server/types';
import { defuse } from '@/lib/defuse';

export interface PendingSend {
  /** The key the bubble is drawn under, kept by the thread's own copy once it arrives. */
  key: string;
  /** The words as sent to the server. */
  text: string;
  context: HarnessContext;
  /** When it was tapped (ms, this device's clock). */
  at: number;
  /** sending: the POST is out; sent: the server took it, its copy not on the thread yet; failed: it did not go. */
  state: 'sending' | 'sent' | 'failed';
  /** Why it did not go (the server's words), for a failed one. */
  why?: string;
  /** The id the server gave it, once its answer said. */
  serverId?: string;
  /** The user messages the thread already had when it was tapped: none of them can be its copy. */
  before: ReadonlySet<string>;
}

let n = 0;
export const pendingKey = (): string => `p-${Date.now().toString(36)}-${(++n).toString(36)}`;

/** What the server keeps of the words: trimmed, a typed harness tag defused (the thread route). */
export const asStored = (text: string): string => defuse(text.trim());

/** The ids of the user messages in `events`. */
export function userIds(events: readonly ThreadEvent[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) if (e.kind === 'user') s.add(e.id);
  return s;
}

/**
 * Which pending sends have their copy in `events`, oldest first: by the id the server answered with, else the first
 * user message with the same words that the thread did not have when it was tapped and no other pending send took.
 * A failed send is never matched (its words were not stored). Returns the matches (event id →
 * pending key) and the sends still waiting.
 */
export function settle(pending: readonly PendingSend[], events: readonly ThreadEvent[], claimed: ReadonlySet<string> = new Set()):
  { matched: Map<string, string>; rest: PendingSend[] } {
  const matched = new Map<string, string>();
  if (!pending.length) return { matched, rest: [] };
  const rest: PendingSend[] = [];
  const users = events.filter((e): e is Extract<ThreadEvent, { kind: 'user' }> => e.kind === 'user');
  const ids = new Set(users.map((e) => e.id));
  const taken = new Set(claimed);
  for (const p of [...pending].sort((a, b) => a.at - b.at)) {
    let hit: string | undefined;
    if (p.serverId && ids.has(p.serverId) && !taken.has(p.serverId)) hit = p.serverId;
    else if (p.state !== 'failed') {
      const want = asStored(p.text);
      hit = users.find((e) => !p.before.has(e.id) && !taken.has(e.id) && e.text === want)?.id;
    }
    if (hit) { matched.set(hit, p.key); taken.add(hit); } else rest.push(p);
  }
  return { matched, rest };
}
