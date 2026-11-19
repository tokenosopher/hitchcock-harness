'use client';
// What can be put into the message as a chip, and where it is on the page.
// A page marks a thing with `data-ref` (the reference as JSON, built by refData), or registers a source that knows
// its own things (the Edit page: a clip on the timeline, a shot in the Takes view, the playhead's moment, the
// working cut's clips for the @ list). The message box asks the sources first, then the marks, walking up from
// what was clicked.
import { useSyncExternalStore } from 'react';
import { isRefKind, type InlineRef } from '@/lib/refs';

export interface RefItem {
  ref: InlineRef;
  /** The list's group: "Shots of S6", "Takes", "Clips on the timeline · v33". */
  group: string;
  sub?: string;
  /** A small picture (a frame, a panel, a face) from /api/media. */
  image?: string;
}

export interface RefSource {
  /** The reference for this element when the page knows it (asked for each element from the one clicked upward). */
  resolve?: (el: Element) => InlineRef | undefined;
  /** The playhead's moment, frozen now. */
  moment?: () => InlineRef | undefined;
  /** What the @ list can offer from this page. */
  items?: () => RefItem[];
  /** Goes to the thing on this page; true when it did. */
  go?: (r: InlineRef) => boolean;
}

const sources = new Set<RefSource>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** A page's source of references while it is on screen; the return takes it away. */
export function registerRefSource(s: RefSource): () => void {
  sources.add(s);
  emit();
  return () => { sources.delete(s); emit(); };
}

/** Whether the page on screen has a playhead whose moment can go into the message. */
export function useHasMoment(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => [...sources].some((s) => !!s.moment), () => false);
}
export const refSources = (): RefSource[] => [...sources];

/** The mark for a thing a page shows: spread it on the element (`<button {...refData(r)}>`). */
export function refData(r: InlineRef): { 'data-ref': string } {
  return { 'data-ref': JSON.stringify(r) };
}

function readMark(el: Element): InlineRef | undefined {
  const raw = el.getAttribute('data-ref');
  if (!raw) return undefined;
  try {
    const r = JSON.parse(raw) as InlineRef;
    return r && isRefKind(r.kind) && typeof r.label === 'string' && r.label ? r : undefined;
  } catch {
    return undefined;
  }
}

/** The thing under a click: the nearest element, from the one clicked upward, that a source or a mark names. */
export function resolveRefAt(target: EventTarget | null): InlineRef | undefined {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    for (const s of sources) {
      const r = s.resolve?.(el);
      if (r) return r;
    }
    const r = readMark(el);
    if (r) return r;
    el = el.parentElement;
  }
  return undefined;
}

/** The playhead's moment from the page that has one. */
export function momentRef(): InlineRef | undefined {
  for (const s of sources) {
    const r = s.moment?.();
    if (r) return r;
  }
  return undefined;
}

export function sourceItems(): RefItem[] {
  return [...sources].flatMap((s) => s.items?.() ?? []);
}

/** Lets the page that shows the thing go to it; false when none did. */
export function goOnPage(r: InlineRef): boolean {
  for (const s of sources) if (s.go?.(r)) return true;
  return false;
}

/** Where a reference lives in the app, under /films/<film>. */
export function refHref(film: string, r: InlineRef): string {
  const root = `/films/${film}`;
  switch (r.kind) {
    case 'moment': case 'clip': case 'panel':
      return `${root}/edit${r.frame !== undefined ? `?at=${Math.round(r.frame)}` : ''}`;
    case 'take':
      return r.scene ? `${root}/scenes/${encodeURIComponent(r.scene)}${r.take ? `?take=${encodeURIComponent(r.take)}` : ''}` : `${root}/scenes`;
    case 'shot': case 'scene':
      return r.scene ? `${root}/scenes/${encodeURIComponent(r.scene)}` : `${root}/scenes`;
    case 'character':
      return r.character ? `${root}/character/${encodeURIComponent(r.character)}` : `${root}/character`;
    case 'view': case 'location':
      return `${root}/locations`;
    case 'card': {
      const p = r.place ?? '';
      const to: Record<string, string> = { story: 'story', loc: 'locations', views: 'locations', previz: '?open=previz', faces: 'character', clothing: 'character', sheet: 'character', voices: 'character/voices', elements: 'character/elements', scenes: 'scenes', edit: 'edit', finish: 'finish', sound: 'sound', release: 'release' };
      const t = to[p];
      return t === undefined ? `${root}?open=gate` : t.startsWith('?') ? `${root}${t}` : `${root}/${t}`;
    }
  }
}
