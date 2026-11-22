'use client';
// The choices the user has made and not yet sent: a pick on a card, a yes, a go, a face or a voice picked on its
// page. Each press only sets the choice aside; "Done picking" (ChoicesTray, at the foot of every page of the film)
// sends them all to Alma as one message. One choice per card or per thing picked: a new one takes the old one's place.
// Kept in this browser, so moving between pages or a reload does not lose them.
import { useSyncExternalStore } from 'react';
import type { PickBody } from '@/components/library/data';
import type { Sent } from '@/components/lib/sent';

// the rule of what a batch takes out of "Waiting for you", shared with the server's count (lib/sent.ts)
export { SENT_ALMA_MS, SENT_MS, sentItems, type Sent } from '@/components/lib/sent';

export interface Choice {
  id: string;                                   // "card:<key>" or "pick:<kind>:<target>"
  label: string;                                // "C02 Tobias: which voice · Option 2"
  answer?: { card: string; option?: string; kind: 'pick' | 'yes' | 'go' | 'why'; cost?: string; note?: string };
  pick?: PickBody;
}

const EMPTY: Choice[] = [];
const cache = new Map<string, Choice[]>();
const listeners = new Set<() => void>();
const key = (film: string) => `hh-choices:${film}`;

function read(film: string): Choice[] {
  const hit = cache.get(film);
  if (hit) return hit;
  let v: Choice[] = EMPTY;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(key(film)) ?? '[]');
    if (Array.isArray(raw)) v = raw.filter((c): c is Choice => !!c && typeof c === 'object' && typeof (c as Choice).id === 'string');
  } catch { /* a private window: the choices last for the visit */ }
  cache.set(film, v.length ? v : EMPTY);
  return cache.get(film)!;
}
function write(film: string, v: Choice[]): void {
  cache.set(film, v.length ? v : EMPTY);
  try { window.localStorage.setItem(key(film), JSON.stringify(v)); } catch { /* as above */ }
  for (const l of listeners) l();
}

export const choose = (film: string, c: Choice): void => write(film, [...read(film).filter((x) => x.id !== c.id), c]);
export const unchoose = (film: string, ids: string | string[]): void => { const drop = new Set(Array.isArray(ids) ? ids : [ids]); write(film, read(film).filter((x) => !drop.has(x.id))); };

export function useChoices(film: string): Choice[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => read(film), () => EMPTY);
}
export const useChoice = (film: string, id: string): Choice | undefined => useChoices(film).find((c) => c.id === id);

// ---- Sent: what "Done picking" has sent and the film's state does not show answered yet
// A pick already chosen must leave "Waiting for you" at once. The pick was written, but the card waited for the state stream to bring the change (through the tunnel, seconds or
// more). Now each card and pick of the batch leaves "Waiting for you" the moment "Done picking" is pressed and stays
// gone until the film's state shows it answered (film.tsx drops it then), or for a while at most; a send that fails
// brings them back with the error. Kept in this browser, so a reload in between does not bring them back either.

const NO_SENT: Sent[] = [];
const sentCache = new Map<string, Sent[]>();
const sentKey = (film: string) => `hh-sent:${film}`;
let sentTimer: ReturnType<typeof setTimeout> | undefined;

function readSent(film: string): Sent[] {
  const hit = sentCache.get(film);
  if (hit) return hit;
  let v: Sent[] = NO_SENT;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(sentKey(film)) ?? '[]');
    const now = Date.now();
    if (Array.isArray(raw)) v = raw.filter((x): x is Sent => !!x && typeof x === 'object' && typeof (x as Sent).key === 'string' && typeof (x as Sent).until === 'number' && (x as Sent).until > now);
  } catch { /* as above */ }
  sentCache.set(film, v.length ? v : NO_SENT);
  schedule();
  return sentCache.get(film)!;
}
/** The next one to run out is dropped on time (and the pages told), with nothing else changing. */
function schedule(): void {
  clearTimeout(sentTimer);
  const next = Math.min(...[...sentCache.values()].flat().map((x) => x.until));
  if (!Number.isFinite(next)) return;
  sentTimer = setTimeout(() => {
    const now = Date.now();
    for (const [f, v] of sentCache) if (v.some((x) => x.until <= now)) writeSent(f, v.filter((x) => x.until > now));
  }, Math.max(0, next - Date.now()) + 50);
}
function writeSent(film: string, v: Sent[]): void {
  sentCache.set(film, v.length ? v : NO_SENT);
  try { window.localStorage.setItem(sentKey(film), JSON.stringify(v)); } catch { /* as above */ }
  schedule();
  for (const l of listeners) l();
}

export const markSent = (film: string, items: Sent[]): void => {
  const keys = new Set(items.map((x) => x.key));
  writeSent(film, [...readSent(film).filter((x) => !keys.has(x.key)), ...items]);
};
export const unsend = (film: string, keys: string[]): void => {
  const drop = new Set(keys);
  const v = readSent(film);
  if (v.some((x) => drop.has(x.key))) writeSent(film, v.filter((x) => !drop.has(x.key)));
};

export function useSent(film: string): Sent[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => readSent(film), () => NO_SENT);
}
