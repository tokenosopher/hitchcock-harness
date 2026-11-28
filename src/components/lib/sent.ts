// What "Done picking" has sent and the film's state does not show answered yet, as a rule both sides use: the browser
// (data/choices.ts keeps the list, data/film.tsx lays it over the state every page reads) and the server's notify hub
// (src/server/claude/notify.ts), which counts each film's "Waiting for you" for the sidebar's white dot. Pure, no React.
// Each card and pick of the batch leaves "Waiting for you" the moment "Done picking" is pressed and stays gone until the
// film's state shows it answered, or for a while at most (a location's master is made by Alma from the pick).
import type { FilmState } from '@/server/types';
import { gateItems, releaseWait, storyWait } from './derive';

export interface Sent {
  /** The item of "Waiting for you" it answers: "card:<card key>", "gate:<gate item key>" or "story:<script|story>-<version>"
   *  (waitList.ts). */
  key: string;
  label: string;
  /** Sent at, and kept at most until (ms). */
  at: number;
  until: number;
  /** Alma writes it, not "Done picking" itself (a location's master is made by her from the pick). */
  alma?: boolean;
}

/** How long a sent item stays hidden at most while the state does not show it answered: a pick the harness writes
 *  itself shows within seconds; one Alma makes from the pick (a location's master) takes her a turn or more. */
export const SENT_MS = 2 * 60_000;
export const SENT_ALMA_MS = 30 * 60_000;

/** What sentItems needs of a choice: choices.ts's Choice has it, and so do the answers and picks POST …/done gets. */
export interface SentSource { label: string; answer?: { card: string }; pick?: { kind: string; target: string; card?: string } }

/** The keys of "Waiting for you" a set of choices answers. A card's answer is its card; a pick is its gate item (C04's
 *  clothing is "gate:pick:C04:clothing"); a card of sounds goes once every sound still open on it is in the batch. */
export function sentItems(choices: SentSource[], openSounds: (card: string) => string[] | undefined, now = Date.now()): Sent[] {
  const out: Sent[] = [];
  const add = (key: string, label: string, alma?: boolean) => out.push({ key, label, at: now, until: now + (alma ? SENT_ALMA_MS : SENT_MS), ...(alma ? { alma } : {}) });
  for (const c of choices) {
    if (c.answer) { add(`card:${c.answer.card}`, c.label); continue; }
    const p = c.pick;
    if (!p) continue;
    const t = p.target;
    if (p.kind === 'face' || p.kind === 'prop') add(`gate:pick:${t}`, c.label);
    else if (p.kind === 'location') add(`gate:pick:${t}`, c.label, true);
    else if (p.kind === 'wardrobe') add(`gate:pick:${t}:clothing`, c.label);
    else if (p.kind === 'sheet') add(`gate:pick:${t}:sheet`, c.label);
    else if (p.kind === 'voice') add(`gate:pick:${t}:voice`, c.label);
  }
  // sounds: a card leaves once all its open sounds are picked in this batch
  const byCard = new Map<string, Set<string>>();
  for (const c of choices) if (c.pick?.kind === 'sfx' && c.pick.card) (byCard.get(c.pick.card) ?? byCard.set(c.pick.card, new Set()).get(c.pick.card)!).add(c.pick.target);
  for (const [card, names] of byCard) {
    const open = openSounds(card);
    if (open && open.every((n) => names.has(n))) add(`card:${card}`, `${names.size} ${names.size === 1 ? 'sound' : 'sounds'}`);
  }
  return out;
}

/** "Lock vN" on the Story page (Alma records the lock: kept aside as long as her work from a pick), or "Settle vN"
 *  (the harness writes story/settled.json itself): the script's or the story's item leaves "Waiting for you" at once
 *  and stays out until the state shows it locked or settled (derive.ts storyWait). */
export function storySent(kind: 'script' | 'story', version: string, now = Date.now()): Sent {
  const alma = kind === 'script';
  return { key: `story:${kind}-${version}`, label: kind === 'script' ? `Lock ${version}` : `Settle ${version}`, at: now, until: now + (alma ? SENT_ALMA_MS : SENT_MS), ...(alma ? { alma } : {}) };
}

/** The keys of "Waiting for you" the server's state still lists: the story or the script waiting, its cards that ask,
 *  its gate's picks. A sent item not among them is answered there and no longer kept aside. */
export function listedKeys(s: FilmState): Set<string> {
  const story = storyWait(s, []);
  const release = releaseWait(s);
  return new Set([...(story ? [story.key] : []), ...(s.feed?.asks ?? []).map((c) => `card:${c.key}`), ...gateItems(s, []).map((g) => `gate:${g.key}`), ...(release ? [release.key] : [])]);
}

/** The sent items still kept aside: not run out, and still listed by the state. */
export function stillSent(s: FilmState, sent: Sent[], now = Date.now()): Sent[] {
  if (!sent.length) return sent;
  const listed = listedKeys(s);
  return sent.filter((x) => x.until > now && listed.has(x.key));
}

/** The state with what was sent laid over it: its cards leave feed.asks, its picks are named in `sentKeys` (which
 *  gateItems leaves out), and so is a lock or a settle, by its whole key ("story:script-v3", which storyWait marks
 *  sent). */
export function withSent(s: FilmState, sent: Sent[]): FilmState {
  if (!sent.length) return s;
  const keys = new Set(sent.map((x) => x.key));
  return {
    ...s,
    ...(s.feed ? { feed: { ...s.feed, asks: s.feed.asks.filter((c) => !keys.has(`card:${c.key}`)) } } : {}),
    sentKeys: sent.flatMap((x) => (x.key.startsWith('gate:') ? [x.key.slice(5)] : x.key.startsWith('story:') ? [x.key] : [])),
  };
}
