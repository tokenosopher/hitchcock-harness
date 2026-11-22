'use client';
// The choices the user has made and not yet sent: a pick on a card, a yes, a go, a face or a voice picked on its
// page. Each press only sets the choice aside; "Done picking" (ChoicesTray, at the foot of every page of the film)
// sends them all to Alma as one message. One choice per card or per thing picked: a new one takes the old one's place.
// Kept in this browser, so moving between pages or a reload does not lose them.
import { useSyncExternalStore } from 'react';
import type { PickBody } from '@/components/library/data';

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

export interface Sent {
  /** The item of "Waiting for you" it answers: "card:<card key>" or "gate:<gate item key>" (waitList.ts). */
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

/** The keys of "Waiting for you" a set of choices answers. A card's answer is its card; a pick is its gate item (C04's
 *  clothing is "gate:pick:C04:clothing"); a card of sounds goes once every sound still open on it is in the batch. */
export function sentItems(choices: Choice[], openSounds: (card: string) => string[] | undefined, now = Date.now()): Sent[] {
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
