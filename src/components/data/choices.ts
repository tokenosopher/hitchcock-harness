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
