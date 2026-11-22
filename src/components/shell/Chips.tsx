'use client';
// "Alma sees": the pinned chip (dashed, where you are) and the removable chips (what you clicked).
// The row wraps to two lines at most; past that the rest collapses into "+n", which opens the full list
//. "Clear", at the end of the row, drops every removable chip once there are three or more.
// A hidden copy of the row, at the same width, measures where each chip lands and how wide "+n" and "Clear" are.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Chip } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { IconInfo, IconPin, IconX } from './icons';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/components/lib/uploads';

const LINES = 2;
const GAP = 4;
const ROW = 'flex flex-wrap items-center gap-1';
const CLEAR_BTN = 'h-[22px] flex-none cursor-pointer whitespace-nowrap px-1 text-[11.5px] text-sub hover:text-ink';
const SMALL_BTN = 'inline-flex h-[22px] flex-none cursor-pointer items-center whitespace-nowrap rounded-[6px] border border-edge px-[7px] text-[11.5px] text-sub hover:bg-raised hover:text-ink';

function Label() {
  return (
    <span className="mr-0.5 inline-flex h-[22px] flex-none items-center gap-1 whitespace-nowrap text-[11px] text-sub" title="What Alma reads with your next message">
      Alma sees<IconInfo size={12} />
    </span>
  );
}

function Pinned({ text }: { text: string }) {
  return (
    // at most 60% of the row, truncated (the full text on hover), so the chips the user clicked stay visible beside it
    <span className="inline-flex h-[22px] min-w-0 max-w-[60%] flex-none items-center gap-[5px] rounded-[6px] border border-dashed border-edge-strong px-[7px] text-[11.5px] text-sub" title={`Always in context: where you are · ${text}`}>
      <IconPin size={11} /><span className="truncate">{text}</span>
    </span>
  );
}

function Removable({ c, onRemove, leaving }: { c: Chip; onRemove?: () => void; leaving?: boolean }) {
  return (
    <span data-chip={leaving ? undefined : ''} data-leaving={leaving ? '' : undefined} aria-hidden={leaving || undefined}
      className={cn('inline-flex h-[22px] min-w-0 max-w-full flex-none items-center gap-[5px] rounded-[6px] border border-edge-strong bg-raised pl-[7px] pr-1 text-[11.5px] text-ink duration-200',
        leaving ? 'pointer-events-none animate-out fade-out-0 fill-mode-forwards' : 'animate-in fade-in-0')} title={c.command ?? c.ref ?? c.label}>
      {uploadImage(c)
        // eslint-disable-next-line @next/next/no-img-element -- a file the user just attached, served as it is
        ? <img src={uploadImage(c)} alt="" data-zoom={uploadImage(c)} data-zoom-alt={c.label} className="-ml-[3px] size-4 flex-none cursor-zoom-in rounded-[3px] object-cover" />
        : c.image
          // eslint-disable-next-line @next/next/no-img-element -- a poster frame from /api/media (the shot the chip names)
          ? <img src={c.image} alt="" data-chip-image="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="-ml-[4px] h-4 w-[11px] flex-none rounded-[2px] bg-edge object-cover" />
          : <span className="size-[5px] flex-none rounded-full bg-ink" />}<span className="truncate">{c.label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${c.label} from context`} className="flex size-[18px] flex-none cursor-pointer items-center justify-center text-sub hover:text-ink">
        <IconX size={10} />
      </button>
    </span>
  );
}

export function Chips({ className }: { className?: string }) {
  const { pinned, chips, removeChip, clearChips } = useUI();
  const [fit, setFit] = useState(Infinity);   // removable chips that fit in two lines with "+n" after them
  const [open, setOpen] = useState(false);     // "+n" opened: every chip, as many lines as it takes
  const measure = useRef<HTMLDivElement>(null);
  // a chip that goes fades out where it stood, as a new one fades in (nothing snaps)
  const [gone, setGone] = useState<{ c: Chip; i: number }[]>([]);
  const before = useRef<Chip[]>(chips);
  useEffect(() => {
    const now = new Set(chips.map((c) => c.id));
    const left = before.current.map((c, i) => ({ c, i })).filter((x) => !now.has(x.c.id));
    before.current = chips;
    if (!left.length) return;
    setGone((g) => [...g.filter((x) => !now.has(x.c.id) && !left.some((l) => l.c.id === x.c.id)), ...left]);
    setTimeout(() => setGone((g) => g.filter((x) => !left.includes(x))), 200);
  }, [chips]);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const run = () => {
      const all = Array.from(el.children) as HTMLElement[];
      const items = all.filter((k) => k.dataset.phantom === undefined);   // label, pinned, chips
      const plusW = el.querySelector<HTMLElement>('[data-phantom="plus"]')?.offsetWidth ?? 32;
      const clearW = el.querySelector<HTMLElement>('[data-phantom="clear"]')?.offsetWidth ?? 0;
      const W = el.clientWidth;
      const tops = [...new Set(items.map((k) => k.offsetTop))].sort((a, b) => a - b);
      const line = (k: HTMLElement) => tops.indexOf(k.offsetTop);
      const lead = items.length - chips.length;                            // label and pinned
      // does a tail of this width, after item i, still land within the two lines?
      const fits = (i: number, tail: number) => {
        const k = items[i];
        if (line(k) >= LINES) return false;
        if (!tail) return true;
        if (k.offsetLeft + k.offsetWidth + GAP + tail <= W) return true;
        return line(k) + 1 < LINES && tail <= W;
      };
      const clearTail = clearW ? clearW + GAP : 0;
      if (fits(items.length - 1, clearW)) { setFit(Infinity); return; }
      let k = chips.length - 1;
      while (k > 0 && !fits(lead + k - 1, plusW + clearTail)) k--;
      setFit(k);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pinned, chips]);

  const over = fit < chips.length;
  const showing = over && !open ? chips.slice(0, fit) : chips;
  const hidden = chips.length - showing.length;
  const drawn: { c: Chip; leaving?: boolean }[] = showing.map((c) => ({ c }));
  if (!hidden) for (const g of gone) if (!chips.some((c) => c.id === g.c.id)) drawn.splice(Math.min(g.i, drawn.length), 0, { c: g.c, leaving: true });

  return (
    <div className={cn('flex min-h-[22px] items-start', className)}>
      <div className="relative min-w-0 flex-1">
        <div ref={measure} aria-hidden="true" inert className={cn(ROW, 'pointer-events-none invisible absolute inset-x-0 top-0')}>
          <Label />
          {pinned && <Pinned text={pinned} />}
          {chips.map((c) => <Removable key={c.id} c={c} />)}
          <span data-phantom="plus" className={cn(SMALL_BTN, 'absolute')}>+{chips.length}</span>
          {chips.length >= 3 && <span data-phantom="clear" className={cn(CLEAR_BTN, 'absolute')}>Clear</span>}
        </div>
        <div className={ROW}>
          <Label />
          {pinned && <Pinned text={pinned} />}
          {drawn.map(({ c, leaving }) => <Removable key={c.id} c={c} leaving={leaving} onRemove={() => removeChip(c.id)} />)}
          {hidden > 0 && (
            <button type="button" onClick={() => setOpen(true)} aria-label={`Show ${hidden} more in context`} className={SMALL_BTN}>+{hidden}</button>
          )}
          {over && open && (
            <button type="button" onClick={() => setOpen(false)} className={SMALL_BTN}>Fewer</button>
          )}
          {chips.length >= 3 && (
            <button type="button" onClick={() => { clearChips(); setOpen(false); }} aria-label="Clear the chips from context" className={CLEAR_BTN}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
