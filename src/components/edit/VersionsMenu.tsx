'use client';
// The Versions menu on the header's version control (15 Nov 2026, stage 5 of "saving apart from history"; the screen
// SaveVersions): saved versions only, newest first, no silent gaps ("12 older versions, v218 to v229 · Show them");
// each row its number, its name or a grey "No name", when, who, what was made from it, and one line "Compared with now:
// …" in words (sameCut.ts). The whole row opens the version as one step (POST …/cut/restore); "Name it" and a pencil
// open the name field (kept exactly as typed in harness/version-names.json). The comparison reads only the rows on
// screen, each version once (kept by its name: a version file never changes what the cut holds), and the line keeps
// its height while it is worked out. The menu stays inside the page's column at any width.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Timeline } from '@/server/types';
import { cn } from '@/lib/utils';
import { IconCheck, IconChevronDown, IconChevronRight } from '@/components/shell/icons';
import type { VersionInfo, VersionNames } from './useCut';
import { changeList, cutChanges, renderPart, sameCut, type RenderPart } from './sameCut';
import { foldVersions, marksOf, plainProblem, savedWho, whenWords, whyOf, type VersionRow } from './historyList';
import type { HistoryMarks } from './HistoryPanel';

const vnum = (v: string): number => Number(/\d+/.exec(v)?.[0] ?? 0);
/** How many versions show before the fold (SaveVersions shows seven). */
const SHOWN = 7;

// what the render reads of each version, by film and version name, for the page's life (a version's content never
// changes; its file's one write in place, `renders`, is not part of it)
const parts = new Map<string, RenderPart | null>();
const partSubs = new Set<() => void>();
let partSeq = 0;
const partSubscribe = (fn: () => void) => { partSubs.add(fn); return () => { partSubs.delete(fn); }; };
const partSnap = () => partSeq;
const asking = new Set<string>();
function askPart(key: string, read: () => Promise<Timeline | undefined>) {
  if (parts.has(key) || asking.has(key)) return;
  asking.add(key);
  // the browser tests count the versions read (35-versions: only the rows on screen, each once)
  if (process.env.NODE_ENV !== 'production') ((window as unknown as { __hhPartsAsked?: string[] }).__hhPartsAsked ??= []).push(key);
  void read().then((t) => { parts.set(key, t ? renderPart(t) : null); }, () => { parts.set(key, null); })
    .finally(() => { asking.delete(key); partSeq++; for (const f of partSubs) f(); });
}

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" /></svg>
);

interface Props {
  film: string;
  versions: VersionInfo[]; unreadable: Record<string, string[]>; names: VersionNames;
  /** The version the cut equals now, the newest, and whether the cut has edits since the newest. */
  equals?: string; newest?: string; edited: boolean;
  /** The label on the control (the version the cut is shown as), and a version viewed read only. */
  shown: string; viewing: boolean; busy: boolean;
  /** Each version's own step in the history that saved it (why it was saved). */
  savedWhy: Map<string, VersionRow['why']>;
  marks: HistoryMarks;
  /** The cut now, to compare each row with. */
  now: Timeline | undefined;
  view: (v: string) => Promise<Timeline | undefined>;
  onOpen: (v: string) => void;
  onName: (v: string, name: string) => void;
}

export function VersionsMenu(p: Props) {
  const [open, setOpen] = useState(false);
  // drawn for its fade out (150 ms) after it closes, so it never vanishes in one frame (QC round two)
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);
  useEffect(() => { if (open || !shown) return; const t = setTimeout(() => setShown(false), 160); return () => clearTimeout(t); }, [open, shown]);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; width: number; arrow: number }>();
  const [naming, setNaming] = useState<{ version: string; text: string }>();
  const [more, setMore] = useState(false);
  // the time "today" and "yesterday" are read against: the clock when the menu opened
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    // Escape closes it (the page's own Escape waits while it is open) and gives the keyboard back to its button
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { if (box.current?.contains(document.activeElement)) btn.current?.focus(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  // inside the page's column (main), 12 px from its edges, at most 560 px wide; measured before it shows
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      const colEl = box.current?.closest('main') ?? document.body;
      const col = colEl.getBoundingClientRect();
      const width = Math.max(240, Math.min(560, col.width - 24));
      const left = Math.max(col.left + 12, Math.min(b.left - 8, col.right - 12 - width));
      setPlace((was) => (was && was.left === left - b.left && was.width === width ? was : { left: left - b.left, width, arrow: Math.max(12, Math.min(width - 24, b.left - left + 14)) }));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  const rows = useMemo<VersionRow[]>(() => {
    const readable = new Set(p.versions.map((v) => v.version));
    return [
      ...p.versions.map((v): VersionRow => ({ version: v.version, at: v.at, by: v.by, note: v.note, ...(v.made ? { made: v.made } : {}), why: p.savedWhy.get(v.version) ?? whyOf(v), now: false })),
      ...Object.entries(p.unreadable).filter(([v]) => !readable.has(v)).map(([v, ps]): VersionRow => ({ version: v, bad: ps[0] ?? 'invalid', now: false })),
    ].sort((a, b) => vnum(b.version) - vnum(a.version));
  }, [p.versions, p.unreadable, p.savedWhy]);
  const fold = foldVersions(rows, SHOWN);
  const list = more ? rows : fold.head;

  // the comparison: the rows on screen ask for their version's part, once; the line shows when it is known
  const seq = useSyncExternalStore(partSubscribe, partSnap, partSnap);
  const nowPart = useMemo(() => (p.now ? renderPart(p.now) : undefined), [p.now]);
  const { film, view } = p;
  const want = useCallback((v: string) => askPart(`${film}/${v}`, () => view(v)), [film, view]);
  const listEl = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const root = listEl.current;
    if (!open || !root) return;
    const io = new IntersectionObserver((es) => {
      const add = es.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.versionRow!).filter(Boolean);
      if (add.length) setSeen((s) => { if (add.every((v) => s.has(v))) return s; const n = new Set(s); for (const v of add) n.add(v); return n; });
    }, { root });
    for (const el of root.querySelectorAll('[data-version-row]')) io.observe(el);
    return () => io.disconnect();
  }, [open, more, rows]);
  useEffect(() => { if (open) for (const v of seen) want(v); }, [open, seen, want]);
  const words = useMemo(() => {
    const out = new Map<string, string>();
    if (!nowPart || seq < 0) return out;
    for (const v of seen) {
      const part = parts.get(`${film}/${v}`);
      if (part === undefined) continue;
      out.set(v, part === null ? 'could not be read' : sameCut(part, nowPart) ? 'same as now' : changeList(cutChanges(part, nowPart)));
    }
    return out;
  }, [seen, nowPart, seq, film]);

  const keepName = (how: 'enter' | 'esc' | 'away', value?: string) => {
    const n = naming;
    if (!n) return;
    setNaming(undefined);
    if (how === 'esc') return;
    const text = value ?? n.text;
    if (text !== (p.names[n.version]?.name ?? '')) p.onName(n.version, text);
  };

  const row = (r: VersionRow) => {
    const when = whenWords(r.at, openedAt);
    if (r.bad !== undefined) return (
      <div key={r.version} data-version-unreadable={r.version} title={r.bad}
        className="grid min-h-[30px] grid-cols-[44px_1fr_auto] items-center gap-x-2.5 rounded-[8px] border border-transparent px-2.5 py-1 text-[12px]">
        <span className="text-[13px] text-sub">{r.version}</span>
        <span className="min-w-0 truncate text-sub">Cannot be opened: {plainProblem(r.bad)}. Alma can repair it.</span>
        <span className="text-[11.5px] text-sub">{when}</span>
      </div>
    );
    const name = p.names[r.version]?.name;
    const isNow = r.version === p.equals && !p.viewing;
    const shownHere = r.version === p.shown;
    const mk = marksOf(r, p.marks);
    const w = words.get(r.version);
    const nm = naming?.version === r.version ? naming : undefined;
    return (
      <div key={r.version} role="option" aria-selected={shownHere} tabIndex={0} data-version-row={r.version} data-now={isNow ? '' : undefined}
        onClick={() => { if (nm) return; if (!isNow && !p.busy) p.onOpen(r.version); setOpen(false); }}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!isNow && !p.busy) p.onOpen(r.version); setOpen(false); } }}
        title={isNow ? `The cut is ${r.version}, as saved` : `Open ${r.version} as one step. Undo brings back what you had.`}
        className={cn('group/ver grid min-h-[46px] cursor-pointer grid-cols-[44px_1fr_auto] items-center gap-x-2.5 gap-y-0.5 rounded-[8px] border px-2.5 py-[5px] text-left outline-none transition-colors duration-150 focus-visible:border-edge-strong',
          shownHere ? 'border-edge bg-[#151517]' : 'border-transparent hover:border-[#45454d] hover:bg-[#151517]')}>
        <span className="flex items-center gap-1 text-[13px] font-medium text-ink">{r.version}{shownHere && <IconCheck size={11} className="text-sub" />}</span>
        <span className="flex min-w-0 items-center gap-[7px] whitespace-nowrap text-[12.5px]">
          {nm ? (
            <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
              <input autoFocus data-version-name-field={r.version} aria-label={`A name for ${r.version}`} value={nm.text} maxLength={120}
                onChange={(e) => setNaming({ version: r.version, text: e.target.value })}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); keepName('enter', e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); keepName('esc'); } }}
                onBlur={(e) => keepName('away', e.currentTarget.value)}
                className="h-[22px] w-[170px] rounded-md border border-ink bg-bg px-1.5 text-[12px] text-ink shadow-[0_0_0_3px_rgba(250,250,250,0.1)] outline-none duration-150 animate-in fade-in-0" />
            </span>
          ) : name ? (
            <>
              <span data-version-name className="min-w-0 truncate font-medium text-ink" title={name}>{name}</span>
              <button type="button" data-version-rename={r.version} aria-label={`Rename ${r.version}`} title="Rename it"
                onClick={(e) => { e.stopPropagation(); setNaming({ version: r.version, text: name }); }}
                className="-m-0.5 flex size-6 flex-none cursor-pointer items-center justify-center rounded-[5px] text-sub opacity-0 transition-opacity duration-150 hover:text-ink focus-visible:opacity-100 group-hover/ver:opacity-100"><PencilIcon /></button>
            </>
          ) : (
            <span className="relative inline-grid flex-none">
              <span aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 text-sub transition-opacity duration-150 group-hover/ver:opacity-0 group-has-[:focus-visible]/ver:opacity-0">No name</span>
              <button type="button" data-version-name-it={r.version} onClick={(e) => { e.stopPropagation(); setNaming({ version: r.version, text: '' }); }}
                className="col-start-1 row-start-1 -my-1 cursor-pointer py-1 text-left text-ink-3 underline decoration-edge-strong underline-offset-2 opacity-0 transition-opacity duration-150 hover:text-ink focus-visible:opacity-100 group-hover/ver:opacity-100">Name it</button>
            </span>
          )}
          {mk.map((m) => <span key={m} data-version-mark={m} className="inline-flex h-[18px] flex-none items-center rounded-[5px] border border-edge px-1.5 text-[11px] text-ink-3">{m}</span>)}
        </span>
        <span className="inline-flex items-center gap-2.5 whitespace-nowrap text-[11.5px] text-sub">
          <span>{[when, savedWho(r)].filter(Boolean).join(' · ')}</span>
          {!isNow && <span data-version-open className="inline-flex h-[22px] items-center rounded-[6px] border border-edge-strong px-2 text-ink opacity-0 transition-opacity duration-150 group-hover/ver:opacity-100 group-focus-visible/ver:opacity-100">Open</span>}
        </span>
        <span data-version-compare={r.version} className="col-span-2 col-start-2 h-4 min-w-0 truncate text-[11.5px] leading-4 text-sub" title={w ? `Compared with now: ${w}` : undefined}>
          {w !== undefined ? <span key="w" className="duration-200 animate-in fade-in-0">Compared with now: {w}</span> : <span className="text-faint">Compared with now: …</span>}
        </span>
      </div>
    );
  };

  /** The up and down arrows move from version to version (the fold's "Show them" too), Home and End to the ends. */
  const arrows = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || (e.target as HTMLElement).tagName === 'INPUT') return;
    const items = [...(listEl.current?.querySelectorAll<HTMLElement>('[data-version-row], [data-versions-more]') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i < 0 ? 0 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items[to]?.focus();
  };
  return (
    <>
      <span className="text-faint">·</span>
      <span ref={box} className="relative inline-flex">
        <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpenedAt(Date.now()); setOpen((o) => !o); }} title={`${p.versions.length} saved version${p.versions.length === 1 ? '' : 's'}`}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-edge bg-panel pl-2 pr-1.5 font-mono text-[12px] font-medium text-ink hover:bg-raised">
          {p.shown}{p.viewing && <span className="font-sans text-[11px] font-normal text-sub">viewing</span>}<IconChevronDown size={12} className="text-sub" />
        </button>
        {shown && (
          <div ref={pop} role="listbox" aria-label="Versions" data-versions-menu aria-hidden={!open || undefined} inert={!open || undefined} onKeyDown={arrows}
            style={place ? { left: place.left, width: place.width } : { left: 0, width: 360 }}
            className={cn('absolute top-[30px] z-40 flex max-h-[min(560px,calc(100dvh-120px))] flex-col whitespace-normal rounded-[12px] border border-[#3a3a41] bg-[#0c0c0e] shadow-[0_18px_48px_rgba(0,0,0,0.75),0_2px_8px_rgba(0,0,0,0.6)] transition-opacity duration-150',
              !open ? 'pointer-events-none opacity-100 duration-150 animate-out fade-out-0 fill-mode-forwards' : place ? 'opacity-100 duration-150 animate-in fade-in-0 slide-in-from-top-1' : 'opacity-0')}>
            <div className="flex h-10 flex-none items-center gap-2 border-b border-line px-3.5 text-[12px] text-sub">
              <b className="text-[13px] font-medium text-ink">Versions</b>only the ones saved · newest first
            </div>
            <div ref={listEl} className="scroll flex min-h-0 flex-col gap-px overflow-y-auto p-1.5">
              {list.map(row)}
              {!more && fold.words && (
                <button type="button" data-versions-more onClick={() => setMore(true)}
                  className="grid min-h-[32px] cursor-pointer grid-cols-[44px_1fr_auto] items-center gap-x-2.5 rounded-[8px] border border-transparent px-2.5 text-left text-[12.5px] transition-colors duration-150 hover:border-[#45454d] hover:bg-[#151517]">
                  <span />
                  <span className="text-ink-3">{fold.words}</span>
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-sub">Show them<IconChevronRight size={11} /></span>
                </button>
              )}
              {!rows.length && <span className="px-2.5 py-2 text-[12.5px] text-sub">No version saved yet.</span>}
            </div>
            <p className="m-0 flex-none border-t border-line px-3.5 pb-[11px] pt-[9px] text-[11.5px] leading-[1.45] text-sub">
              Opening a version is one step. Undo brings back what you had.{p.edited && p.shown ? ` Your edits since ${p.shown} stay in the history.` : ''}
            </p>
          </div>
        )}
      </span>
    </>
  );
}
