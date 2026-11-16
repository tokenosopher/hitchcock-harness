'use client';
// The text being typed on a platform page, before it is saved (Release, stage 2). The box keeps its own words; it
// also puts them here, so the two things that follow the typing (the count at the top of the text column and the
// preview) draw again per key press, and nothing else on the page does.
import { useSyncExternalStore } from 'react';

/** `clear`: the other fields of a box typed whole (they post as empty while it is typed). */
export interface Draft { field: string; text: string; clear?: string[] }

export class Drafts {
  private cur: Draft | undefined;
  private subs = new Set<() => void>();
  set(d: Draft | undefined) {
    if (d === this.cur || (d && this.cur && d.field === this.cur.field && d.text === this.cur.text && (d.clear ?? []).join() === (this.cur.clear ?? []).join())) return;
    this.cur = d;
    for (const s of this.subs) s();
  }
  /** Clears the draft of this field only (another may have started since). */
  clear(field: string) { if (this.cur?.field === field) this.set(undefined); }
  get = (): Draft | undefined => this.cur;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
}

const stores = new Map<string, Drafts>();
/** The store of one platform page ("film/tiktok"): the text column writes it, the preview and the count read it. */
export function draftsOf(film: string, pid: string): Drafts {
  const k = `${film}/${pid}`;
  let d = stores.get(k);
  if (!d) { d = new Drafts(); stores.set(k, d); }
  return d;
}
/** The field being typed and its words, or undefined. */
export const useDraftOf = (d: Drafts): Draft | undefined => useSyncExternalStore(d.subscribe, d.get, () => undefined);
