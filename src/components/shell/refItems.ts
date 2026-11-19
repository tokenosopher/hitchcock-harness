'use client';
// The @ list: every thing of the film that can be put into the message, narrowed by what is typed after
// "@". "@S6" lists the shots of S6 first, then its takes and its clips. Built from the film's state and from the
// page on screen (the Edit page adds the working cut's clips and panels, with their frames).
import type { FeedCard, FilmState, LocationRef, SceneRef, TakeRef } from '@/server/types';
import type { InlineRef } from '@/lib/refs';
import { mediaUrl } from '@/components/media/Media';
import { repoPath, takeLabel } from '@/components/lib/format';
import { characterRefOf } from '@/components/characters/Cards';
import { momentRef, sourceItems, type RefItem } from '@/components/lib/refPick';

const secs = (s?: number) => (s === undefined ? '' : `${Number.isInteger(s) ? s : s.toFixed(1)} s`);

/** "S6 · take 1", "FIX-chair-S6 · take 1": a take as the references name it (lower case "take" everywhere). */
export function takeRefLabel(scene: string, id: string): string {
  const name = takeLabel(id).replace(/\bTake\b/g, 'take');
  return id.startsWith('FIX-') || name.includes(scene) ? name : `${scene} · ${name}`;
}

// ---- one thing of the film as a reference (the pages mark what they show with these, refData in refPick.ts)

const fileOf = (s: FilmState, rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
export const sceneRefOf = (sc: SceneRef): InlineRef => ({ kind: 'scene', label: sc.id, scene: sc.id, title: sc.title, ...(sc.seconds ? { length: sc.seconds } : {}) });
export const shotRefOf = (sc: SceneRef, n: number): InlineRef => ({ kind: 'shot', label: `${sc.id} · shot ${n}`, scene: sc.id, shot: n });
export function takeRefOf(s: FilmState, sc: SceneRef, t: TakeRef): InlineRef {
  const f = fileOf(s, t.path);
  return { kind: 'take', label: takeRefLabel(sc.id, t.id), scene: sc.id, take: t.id, ...(t.seconds ? { length: t.seconds } : {}), ...(f ? { file: f } : {}) };
}
export function viewRefOf(s: FilmState, l: LocationRef, v: { camera: string; path: string }): InlineRef {
  const f = fileOf(s, v.path);
  return { kind: 'view', label: `${l.id} · ${v.camera}`, location: l.id, view: v.camera, ...(f ? { file: f } : {}) };
}
export const cardRefOf = (c: FeedCard): InlineRef => ({
  kind: 'card', label: c.id ?? (c.title.length > 40 ? `${c.title.slice(0, 39)}…` : c.title), card: c.id ?? c.key, place: c.place, title: c.title,
});

/** The things the film's state names, grouped and in the film's order. */
export function stateItems(s: FilmState | undefined): RefItem[] {
  if (!s) return [];
  const file = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  const out: RefItem[] = [];
  for (const sc of s.scenes) {
    const poster = sc.takes.find((t) => t.path);
    out.push({
      group: 'Scenes', sub: [sc.title, secs(sc.seconds), sc.shots ? `${sc.shots} shots` : ''].filter(Boolean).join(' · '),
      image: poster?.path ? mediaUrl(file(poster.path)!, { w: 80, t: 0.5 }) : undefined,
      ref: sceneRefOf(sc),
    });
  }
  for (const sc of s.scenes) {
    for (let n = 1; n <= (sc.shots ?? 0); n++) {
      out.push({ group: `Shots of ${sc.id}`, sub: sc.title, ref: shotRefOf(sc, n) });
    }
  }
  for (const sc of s.scenes) {
    const inCut = new Set((sc.inCut ?? '').split(' + ').map((x) => x.trim()).filter(Boolean));
    for (const t of sc.takes) {
      const f = file(t.path);
      out.push({
        group: `Takes of ${sc.id}`,
        sub: [secs(t.seconds), t.kind === 'pickup' ? 'pick-up' : '', inCut.has(t.id) ? 'in the cut' : ''].filter(Boolean).join(' · '),
        image: f ? mediaUrl(f, { w: 80, t: 0.5 }) : undefined,
        ref: takeRefOf(s, sc, t),
      });
    }
  }
  for (const c of s.characters) {
    const r = characterRefOf(s, c);
    out.push({ group: 'Characters', sub: c.role, image: r.file ? mediaUrl(r.file, { w: 80 }) : undefined, ref: r });
  }
  for (const l of s.locations) {
    out.push({ group: 'Places and views', sub: l.name, ref: { kind: 'location', label: `${l.id} · ${l.name}`, location: l.id, title: l.name } });
    for (const v of l.views ?? []) {
      const r = viewRefOf(s, l, v);
      out.push({ group: 'Places and views', sub: l.name, image: r.file ? mediaUrl(r.file, { w: 80 }) : undefined, ref: r });
    }
  }
  for (const c of [...(s.feed?.asks ?? []), ...(s.feed?.working ?? [])]) {
    out.push({ group: 'Cards', sub: c.id ? c.title : undefined, ref: cardRefOf(c) });
  }
  return out;
}

/** Every item for the list now: the playhead's moment first, then the page's own, then the film's. */
export function allItems(s: FilmState | undefined): RefItem[] {
  const m = momentRef();
  return [...(m ? [{ group: 'The playhead', sub: m.title, ref: m }] : []), ...sourceItems(), ...stateItems(s)];
}

const word = (hay: string, w: string) => {
  const i = hay.indexOf(w);
  if (i < 0) return -1;
  // at the start of a word: "s6" finds "S6 · shot 1" and "FIX-chair-S6", not "S16"
  for (let k = i; k >= 0; k = hay.indexOf(w, k + 1)) if (k === 0 || !/[a-z0-9]/.test(hay[k - 1])) return k;
  return -1;
};

const GROUP_RANK = (g: string, sceneQuery: boolean) => {
  const order = sceneQuery
    ? ['Shots of', 'Takes of', 'Clips on', 'Storyboard', 'Scenes', 'The playhead', 'Characters', 'Places', 'Cards']
    : ['The playhead', 'Scenes', 'Shots of', 'Takes of', 'Clips on', 'Storyboard', 'Characters', 'Places', 'Cards'];
  const i = order.findIndex((o) => g.startsWith(o));
  return i < 0 ? order.length : i;
};

/** The items that match what was typed after "@", in their groups; a few of each when nothing is typed yet. The
 *  groups whose names match come first ("@grey" puts the clips named grey before the playhead that is on one). */
export function filterItems(items: RefItem[], query: string): RefItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sceneQuery = words.length === 1 && /^s\d+$/.test(words[0]);
  // 2: every word is in the chip's name; 1: some only in the words beside it
  const score = (it: RefItem) => {
    if (!words.length) return 2;
    const label = it.ref.label.toLowerCase();
    if (words.every((w) => word(label, w) >= 0)) return 2;
    const hay = `${label} ${it.sub ?? ''} ${it.ref.title ?? ''}`.toLowerCase();
    return words.every((w) => word(hay, w) >= 0) ? 1 : 0;
  };
  const groups = new Map<string, { best: number; list: { it: RefItem; s: number }[] }>();
  for (const it of items) {
    const sc = score(it);
    if (!sc) continue;
    const g = groups.get(it.group) ?? { best: 0, list: [] };
    g.best = Math.max(g.best, sc);
    g.list.push({ it, s: sc });
    groups.set(it.group, g);
  }
  const per = words.length ? 12 : 4;
  return [...groups.entries()]
    .sort((a, b) => b[1].best - a[1].best || GROUP_RANK(a[0], sceneQuery) - GROUP_RANK(b[0], sceneQuery))
    .flatMap(([, g]) => g.list.sort((x, y) => y.s - x.s).slice(0, per).map((x) => x.it))
    .slice(0, 40);
}

/** Where the first typed word sits in a label, to draw it in bold. */
export function matchIn(label: string, query: string): [number, number] | undefined {
  const w = query.toLowerCase().split(/\s+/).filter(Boolean)[0];
  if (!w) return undefined;
  const i = word(label.toLowerCase(), w);
  return i < 0 ? undefined : [i, i + w.length];
}

export type { RefItem, InlineRef };
