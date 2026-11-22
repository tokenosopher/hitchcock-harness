'use client';
// The "…" at the right of the page header (desktop) and of the phone's top bar (22 Nov 2026; it was drawn, never
// wired: "That button doesn't do anything"). On a film's pages: open the film's folder in Finder (on this Mac only:
// from a phone through the tunnel the window would open on the Mac) and copy its path. The film's spend has no page or
// panel of its own (the header's meta line shows the total, spend.md holds the rows), so there is no Spend item.
// Pages that are not a film have none of these, and no button. The look and the fade are the flow's step menu's
// (flow/StepMenu.tsx); Escape and a click outside close it, and the keyboard goes back to the button.
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFilm } from '@/components/data/film';
import { cn } from '@/lib/utils';
import { IconFile, IconMore } from './icons';

const noSub = () => () => {};
const onThisMac = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

export function MoreMenu({ phone }: { phone?: boolean }) {
  const film = useParams<{ film?: string }>()?.film;
  const folder = useFilm().state?.film.folder;
  const [open, setOpen] = useState(false);
  // stays drawn for its fade out (150 ms) after it closes
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);
  useEffect(() => { if (open || !shown) return; const t = setTimeout(() => setShown(false), 160); return () => clearTimeout(t); }, [open, shown]);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  const [note, setNote] = useState<string>();
  const local = useSyncExternalStore(noSub, onThisMac, () => false);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => { if (refocus) btn.current?.focus(); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) { if (box.current.contains(document.activeElement)) btn.current?.focus(); setOpen(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); btn.current?.focus(); setOpen(false); } };
    // pointerdown, in the capture phase: the timeline cancels its pointerdowns, and then no mousedown follows
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
  }, [open]);
  if (!film || !folder) return null;
  const openFolder = async () => {
    setNote(undefined);
    try {
      const r = await fetch(`/api/films/${encodeURIComponent(film)}/folder`, { method: 'POST' });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setNote(j.error ?? `Not opened (${r.status})`); return; }
      close(true);
    } catch { setNote('The harness server is not answering'); }
  };
  const copy = () => { void navigator.clipboard?.writeText(folder).then(() => setCopied(true), () => setNote('The browser did not allow the copy')); };
  const arrows = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!items.length) { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } return; }
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[to]?.focus();
  };
  const item = 'flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[12.5px] text-ink transition-colors duration-150 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none';
  return (
    <span ref={box} className="relative flex flex-none" onKeyDown={arrows}>
      <button ref={btn} type="button" aria-label="More: the film's folder" aria-haspopup="menu" aria-expanded={open} data-more-menu
        onClick={() => { setNote(undefined); setOpen((x) => !x); }}
        className={phone
          ? 'flex size-11 flex-none cursor-pointer items-center justify-center rounded-[10px] text-ink'
          : 'flex size-8 cursor-pointer items-center justify-center rounded-lg border border-edge text-ink transition-colors duration-150 hover:bg-raised'}>
        <IconMore size={phone ? 16 : undefined} />
      </button>
      {shown && (
        <span role="menu" aria-label="More" aria-hidden={!open || undefined} inert={!open || undefined}
          className={cn('absolute right-0 top-[calc(100%+6px)] z-30 flex w-[240px] flex-col gap-0.5 rounded-[10px] border border-edge bg-panel p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.5)] duration-150',
            open ? 'animate-in fade-in-0 slide-in-from-top-1' : 'pointer-events-none animate-out fade-out-0 fill-mode-forwards')}>
          {local && (
            <button type="button" role="menuitem" data-more-open onClick={() => void openFolder()} className={item}>
              <IconFile size={13} />Open the film&rsquo;s folder
            </button>
          )}
          <button type="button" role="menuitem" data-more-copy title={folder} onClick={copy} className={item}>
            <IconFile size={13} /><span key={copied ? 'y' : 'n'} className="duration-200 animate-in fade-in-0">{copied ? 'Copied' : 'Copy the folder’s path'}</span>
          </button>
          {note && <span role="alert" className="px-2 pb-1 pt-0.5 text-[12px] leading-snug text-bad">{note}</span>}
        </span>
      )}
    </span>
  );
}
