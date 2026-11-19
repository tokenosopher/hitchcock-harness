'use client';
// The intro choice in the browser: read once from /api/intros, shared by every intro on the page and the Settings
// switch, changed at once on a press and written to the server (which answers with the truth). Nothing is drawn
// until the first answer, so an intro never shows and then vanishes.
import { useSyncExternalStore } from 'react';
import { introShows, type IntroPrefs } from './prefs';

let prefs: IntroPrefs | undefined;
let loading: Promise<void> | undefined;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

function load(): void {
  if (loading || typeof window === 'undefined') return;
  loading = fetch('/api/intros', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<IntroPrefs>) : undefined))
    .then((p) => { prefs = p ?? { off: false, hidden: [], shown: [] }; tell(); })
    .catch(() => { prefs = { off: false, hidden: [], shown: [] }; tell(); });
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  load();
  return () => { subs.delete(f); };
}

async function change(c: { off?: boolean; hide?: string; show?: string }, guess: (p: IntroPrefs) => IntroPrefs): Promise<void> {
  const before = prefs;
  if (prefs) { prefs = guess(prefs); tell(); }
  try {
    const r = await fetch('/api/intros', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    if (!r.ok) throw new Error(String(r.status));
    prefs = (await r.json()) as IntroPrefs;
  } catch {
    prefs = before;
  }
  tell();
}

const add = (a: string[], k: string) => (a.includes(k) ? a : [...a, k]);

export const introActions = {
  hide: (step: string) => change({ hide: step }, (p) => (p.off ? { ...p, shown: p.shown.filter((k) => k !== step) } : { ...p, hidden: add(p.hidden, step) })),
  show: (step: string) => change({ show: step }, (p) => (p.off ? { ...p, shown: add(p.shown, step) } : { ...p, hidden: p.hidden.filter((k) => k !== step) })),
  setAll: (on: boolean) => change({ off: !on }, () => ({ off: !on, hidden: [], shown: [] })),
};

/** The choice, or undefined until the server has answered. */
export function useIntroPrefs(): IntroPrefs | undefined {
  return useSyncExternalStore(subscribe, () => prefs, () => undefined);
}

/** Whether this step's intro shows; undefined until the server has answered. */
export function useIntroShows(step: string): boolean | undefined {
  const p = useIntroPrefs();
  return p ? introShows(p, step) : undefined;
}
