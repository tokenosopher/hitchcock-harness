// A card's place on the cut: its "cut" in review/cards.json, read by the server (feed.ts) and turned into the
// Edit page's address by the card's "See it in the cut" or "Hear it in the cut" button. The page reads the address in
// openAt.ts. Pure and small, so the server's reading of the cards does not pull in the timeline's code.
import type { FeedCut } from '@/server/types';

/** The address keys of a place on the cut (openAt.ts); the page takes them out of the address once read, so a reload does not apply them again. */
export const OPEN_KEYS = ['clip', 't', 'at', 'take', 'shot', 'sound', 'try'] as const;

/** A card's "cut" read loosely (feed.ts): the keys of FeedCut with the right kind of value; undefined when none is. */
export function cutOf(v: unknown): FeedCut | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' && Number.isFinite(x) ? String(x) : undefined);
  const n = (x: unknown) => { const k = typeof x === 'string' && x.trim() ? Number(x) : x; return typeof k === 'number' && Number.isFinite(k) && k >= 0 ? k : undefined; };
  const c: FeedCut = {};
  const clip = s(o.clip), take = s(o.take), shot = s(o.shot), sound = s(o.sound) ?? s(o.sfx), t = n(o.t), at = n(o.at), tr = n(o.try);
  if (clip) c.clip = clip;
  if (take) c.take = take;
  if (shot) c.shot = shot;
  if (t !== undefined) c.t = t;
  if (at !== undefined && Number.isInteger(at)) c.at = at;
  if (sound) c.sound = sound;
  if (tr !== undefined && Number.isInteger(tr) && tr >= 1) c.try = tr;
  return c.clip || c.take || c.sound || c.t !== undefined || c.at !== undefined ? c : undefined;
}

/** The Edit page's address for a card's "cut". */
export function cutHref(film: string, c: FeedCut): string {
  const q = new URLSearchParams();
  for (const k of OPEN_KEYS) { const v = c[k]; if (v !== undefined) q.set(k, String(v)); }
  return `/films/${film}/edit?${q.toString()}`;
}

/** The button's words: a sound is heard, anything else is seen. */
export const cutWords = (c: FeedCut): string => (c.sound ? 'Hear it in the cut' : 'See it in the cut');

/** A card's option that is a take of a scene (its file under a generation's takes/): the "cut" that tries it in place. */
export function takeCutOf(path: string | undefined): FeedCut | undefined {
  if (!path || !/\.(mp4|mov|webm|m4v)$/i.test(path) || !/(^|\/)takes\//.test(path)) return undefined;
  return { take: path };
}

