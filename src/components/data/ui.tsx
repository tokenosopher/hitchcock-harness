'use client';
// "Alma sees": the pinned chip (where the user is) and the removable chips (what they clicked),
// the composer draft and the open task card. Persisted per film in localStorage (step 1).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Chip } from '@/server/types';
import { useFilm } from './film';

interface UIValue {
  pinned: string;
  setPinned: (s: string) => void;
  chips: Chip[];
  addChip: (c: Chip) => void;
  removeChip: (id: string) => void;
  /** Drops the chips that went out with a message (chips added while it was sending stay). */
  removeChips: (ids: string[]) => void;
  hasChip: (id: string) => boolean;
  clearChips: () => void;
  setDraft: (s: string) => void;
  /** Put a message in the composer instead of acting (buttons that would spend credits do this). */
  prefill: (text: string, chip?: Chip) => void;
  /** Brings Alma's column out and puts the cursor in her box, leaving its words as they are. */
  focusBox: () => void;
  /** The text a button replaced, when the box still holds exactly what the button wrote: Command-Z in the box
   *  brings it back (the user, 13 Nov 2026). `redoDraft` is the way forward again. Undefined = nothing of ours. */
  undoDraft: (current: string) => string | undefined;
  redoDraft: (current: string) => string | undefined;
  openTask?: string;
  setOpenTask: (id?: string) => void;
  playhead?: string;
  setPlayhead: (s?: string) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  threadOpen: boolean;
  setThreadOpen: (b: boolean) => void;
  hint: ComposerHint;
  setHint: (h: ComposerHint) => void;
}

/** What the open page suggests in the composer: its placeholder and up to two quick messages. */
export interface ComposerHint { placeholder?: string; quick?: string[] }

const Ctx = createContext<UIValue | null>(null);
const key = (film: string) => `hh:ui:${film}`;

interface Saved { chips: Chip[]; draft: string }

function load(film: string): Saved {
  try {
    const raw = localStorage.getItem(key(film));
    if (raw) {
      const v = JSON.parse(raw) as Partial<Saved>;
      // a chip a page keeps ("keep:…") is that page's to add again once it has read what it shows
      return { chips: Array.isArray(v.chips) ? v.chips.filter((c) => !c.id.startsWith('keep:')) : [], draft: typeof v.draft === 'string' ? v.draft : '' };
    }
  } catch { /* storage blocked */ }
  return { chips: [], draft: '' };
}

export function UIProvider({ film, children }: { film: string; children: React.ReactNode }) {
  const [pinned, setPinned] = useState('');
  const [chips, setChips] = useState<Chip[]>([]);
  const [draft, setDraft] = useState('');
  const [openTask, setOpenTask] = useState<string>();
  const [playhead, setPlayhead] = useState<string>();
  const [threadOpen, setThreadOpen] = useState(false);
  const [hint, setHint] = useState<ComposerHint>({});
  const [loadedFor, setLoadedFor] = useState<string>();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // What the user had typed each time a button wrote over it (prefill), newest last; kept for this tab's visit
  // in sessionStorage so a reload does not lose it. `fwd` is what an undo took away again.
  const draftNow = useRef('');
  useEffect(() => { draftNow.current = draft; }, [draft]);
  const backKey = `hh:draft-back:${film}`;
  const back = useRef<{ prev: string; next: string }[]>([]);
  const fwd = useRef<{ prev: string; next: string }[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(sessionStorage.getItem(backKey) ?? '[]') as { prev: string; next: string }[]; back.current = Array.isArray(v) ? v : []; } catch { back.current = []; }
    fwd.current = [];
  }, [backKey]);
  const keepBack = useCallback(() => { try { sessionStorage.setItem(backKey, JSON.stringify(back.current.slice(-8))); } catch { /* this visit only */ } }, [backKey]);
  const undoDraft = useCallback((current: string) => {
    const top = back.current[back.current.length - 1];
    if (!top || top.next !== current) return undefined;
    back.current.pop(); fwd.current.push(top); keepBack();
    return top.prev;
  }, [keepBack]);
  const redoDraft = useCallback((current: string) => {
    const top = fwd.current[fwd.current.length - 1];
    if (!top || top.prev !== current) return undefined;
    fwd.current.pop(); back.current.push(top); keepBack();
    return top.next;
  }, [keepBack]);

  // Restore after mount (localStorage is not there during the server render), before the frame is painted, so
  // the composer does not grow a moment after the page appears.
  useLayoutEffect(() => {
    const s = load(film);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring per-film UI state from storage after mount
    setChips(s.chips);
    setDraft(s.draft);
    setLoadedFor(film);
  }, [film]);

  useEffect(() => {
    if (loadedFor !== film) return;
    try { localStorage.setItem(key(film), JSON.stringify({ chips, draft })); } catch { /* storage blocked */ }
  }, [film, loadedFor, chips, draft]);

  // the same thing clicked twice is one chip; a node chip (one id, new label) takes the new label in place
  const addChip = useCallback((c: Chip) => setChips((l) => {
    const i = l.findIndex((x) => x.id === c.id);
    if (i < 0) return [...l, c];
    if (l[i].label === c.label && l[i].ref === c.ref) return l;
    const next = l.slice();
    next[i] = c;
    return next;
  }), []);
  const removeChip = useCallback((id: string) => setChips((l) => l.filter((x) => x.id !== id)), []);
  const removeChips = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setChips((l) => l.filter((x) => !gone.has(x.id)));
  }, []);
  const clearChips = useCallback(() => setChips([]), []);
  const hasChip = useCallback((id: string) => chips.some((c) => c.id === id), [chips]);
  const prefill = useCallback((text: string, chip?: Chip) => {
    if (chip) addChip(chip);
    // a button writes over what is in the box: what was there is kept, so Command-Z in the box brings it back
    const had = draftNow.current;
    if (had.trim() && had !== text) { back.current.push({ prev: had, next: text }); fwd.current = []; keepBack(); }
    setDraft(text);
    // Alma's column may be folded away (13 Nov): words put in her box bring it back
    window.dispatchEvent(new Event('hh:alma-show'));
    setTimeout(() => composerRef.current?.focus(), 80);
  }, [addChip, keepBack]);
  const focusBox = useCallback(() => {
    window.dispatchEvent(new Event('hh:alma-show'));
    setTimeout(() => composerRef.current?.focus(), 80);
  }, []);

  // The draft is not in this value: it changes on every key press, and everything that reads the UI state
  // (the whole thread, every page) would re-render with it. It has its own context, read by the message box only.
  const value = useMemo<UIValue>(() => ({
    pinned, setPinned, chips, addChip, removeChip, removeChips, hasChip, clearChips, setDraft, prefill, focusBox, undoDraft, redoDraft,
    openTask, setOpenTask, playhead, setPlayhead, composerRef, threadOpen, setThreadOpen, hint, setHint,
  }), [pinned, chips, addChip, removeChip, removeChips, hasChip, clearChips, prefill, focusBox, undoDraft, redoDraft, openTask, playhead, threadOpen, hint]);
  // The setters and actions alone, which never change: a page that only writes (the pinned chip, the playhead, a
  // prefill) reads these, so it does not draw itself again each time the pinned chip or the playhead it set changes.
  const actions = useMemo<UIActions>(() => ({ setPinned, setHint, setPlayhead, addChip, removeChip, prefill, focusBox }), [addChip, removeChip, prefill, focusBox]);
  return <Ctx.Provider value={value}><ActionsCtx.Provider value={actions}><DraftCtx.Provider value={draft}>{children}</DraftCtx.Provider></ActionsCtx.Provider></Ctx.Provider>;
}

/** The parts of the UI state a page writes and never reads: stable for the film. */
export type UIActions = Pick<UIValue, 'setPinned' | 'setHint' | 'setPlayhead' | 'addChip' | 'removeChip' | 'prefill' | 'focusBox'>;
const ActionsCtx = createContext<UIActions | null>(null);
export function useUIActions(): UIActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useUIActions outside a film');
  return v;
}

const DraftCtx = createContext('');
/** The words in the message box. Only the box itself should read this. */
export const useDraft = (): string => useContext(DraftCtx);

export function useUI(): UIValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside a film');
  return v;
}

/** The film's name as the pinned chip starts: "Maren" (Maren and the Sea); a title that starts
 *  with an article is a name as a whole ("The Ferry"). */
export function filmShort(title: string): string {
  const words = title.trim().split(/\s+/);
  return /^(the|a|an)$/i.test(words[0] ?? '') ? title.trim() : words[0] ?? title;
}

/** A page states where the user is and what the composer suggests there. The pinned chip reads
 *  "<Film> · <where>": `pinned` is the page's part ("stage 9 · 1 cut", "C01 Maren · element done"). */
export function usePage(pinned: string | undefined, placeholder?: string, quick?: string[], record?: string[]) {
  const { setPinned, setHint } = useUIActions();
  const film = useFilm().state?.film;
  const title = film?.title;
  const full = pinned && title ? `${filmShort(title)} · ${pinned}` : pinned;
  // a film that went out is a record: the composer asks about it and offers `record`, the questions that
  // still make sense, in place of the page's working suggestions
  const done = film?.status === 'delivered';
  const hint = done ? 'Ask Alma about this film…' : placeholder;
  const q = ((done ? record : quick) ?? []).join('\u0000');
  // layout effects: the pinned chip and the quick messages land in the same frame as the page, not one later
  // (the composer grew by a line of buttons a moment after each page appeared)
  useLayoutEffect(() => { if (full) setPinned(full); }, [full, setPinned]);
  useLayoutEffect(() => { setHint({ placeholder: hint, quick: q ? q.split('\u0000') : [] }); }, [hint, q, setHint]);
}
