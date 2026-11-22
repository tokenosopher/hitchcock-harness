'use client';
// The QC chip in every page title row ("QC · <target> · not run" dashed, or "QC · <target> · 7.4 · round 2 of 3")
// and the full QC panel it opens as a 520px popover over the page (never pushing content). With several
// targets (the Scenes page: one prompt QC per scene) the popover starts with a row of them.
import { useEffect, useRef, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUI } from '@/components/data/ui';
import { openOf, passes, type QCSpec } from '@/components/lib/qc';
import { QCPanel, targetStatus, type QCTarget } from '@/components/qc/QCPanel';
import { IconChevronDown } from './icons';
import { cn } from '@/lib/utils';
import { usePresence } from '@/components/shell/Reveal';

export function QCChip({ spec, targets, chipLabel, note, lockWord, phoneTall }: {
  spec: QCSpec;
  /** One target, or several (the popover then lets the user switch between them). */
  targets: QCTarget | QCTarget[];
  /** The chip's target word when there are several ("prompts"). */
  chipLabel?: string;
  note?: string;
  lockWord?: string;
  /** On the phone the button takes a 44 px press, the chip drawn as before inside it (the Story page). */
  phoneTall?: boolean;
}) {
  const list = Array.isArray(targets) ? targets : [targets];
  const [open, setOpen] = useState(false);
  const pop = usePresence(open);
  const [pick, setPick] = useState<string>();
  // the popover opens leftwards from the chip, unless that would cross the page's left edge (the chip wrapped under the title)
  const [side, setSide] = useState<'right' | 'left'>('right');
  const ui = useUI();
  const box = useRef<HTMLDivElement>(null);

  const many = list.length > 1;
  const run = list.filter((t) => t.entry && !t.source);
  const worst = [...run].sort((a, b) => (a.entry!.latest.score ?? -1) - (b.entry!.latest.score ?? -1))[0];
  const status = !many
    ? (list[0] ? targetStatus(list[0]) : 'not run')
    : run.length ? `${run.length} of ${list.length} run · lowest ${worst.label} ${targetStatus(worst)}` : 'not run';
  const hasRun = many ? run.length > 0 : !!list[0]?.entry;
  // on a film that went out, a check that never ran is history, not something left to do: the pill goes quiet
  const settled = useFilm().state?.film.status === 'delivered' && !hasRun;
  const label = `QC · ${many ? chipLabel ?? spec.name : list[0]?.label ?? spec.name} · ${settled ? 'none on record' : status}`;
  const lead = many ? worst : list[0];
  const good = !!lead?.entry && !lead.source && passes(lead.entry.latest) && !openOf(lead.entry.latest).length;
  const current = list.find((t) => t.target === pick) ?? (many ? worst ?? list[0] : list[0]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // a finished film with no check on record for this page: there is nothing to open, so nothing is drawn
  if (!list.length || settled) return null;
  return (
    <div ref={box} className={cn('relative flex flex-none flex-col gap-1.5', side === 'right' ? 'items-end' : 'items-start')}>
      <button type="button" aria-expanded={open} aria-label={`${label}. Open the QC panel`}
        onClick={() => { const r = box.current?.getBoundingClientRect(); const host = box.current?.closest('main')?.getBoundingClientRect().left ?? 0; if (r) setSide(r.right - 520 < host + 8 ? 'left' : 'right'); setOpen(!open); if (!open) ui.addChip({ id: `qc:${spec.stage}:${many ? 'all' : list[0].target}`, label: `QC · ${many ? chipLabel ?? spec.name : list[0].label}` }); }}
        className={cn('inline-flex max-w-[min(520px,calc(100vw-32px))] cursor-pointer items-center rounded-[14px]', phoneTall && 'max-[760px]:-my-2 max-[760px]:h-11')}>
        <span className={cn('inline-flex h-7 min-w-0 max-w-full items-center gap-[7px] whitespace-nowrap rounded-[14px] border px-2.5 text-[12px] font-medium tabular-nums text-ink', hasRun ? 'border-faint bg-panel' : settled ? 'border-transparent px-1 font-normal text-mute hover:text-sub' : 'border-dashed border-edge-strong', open && 'bg-raised')}>
          {!settled && <span className={cn('size-1.5 flex-none rounded-full', !hasRun ? 'border border-mute' : good ? 'bg-ok' : 'bg-ink')} />}
          <span className="truncate">{label}</span>
          <IconChevronDown size={12} className={cn('flex-none text-sub transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {note && <span className="max-w-[300px] text-right text-[11.5px] leading-[1.4] text-mute">{note}</span>}
      {pop.mounted && current && (
        <div role="dialog" aria-label={`QC · ${current.label}`} onTransitionEnd={(e) => { if (e.target === e.currentTarget) pop.done(); }}
          className={cn('absolute top-9 z-30 origin-top transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none', pop.shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0', side === 'right' ? 'right-0' : 'left-0', ' flex w-[520px] max-w-[calc(100vw-32px)] flex-col gap-2 max-[760px]:fixed max-[760px]:inset-x-4 max-[760px]:top-[64px] max-[760px]:w-auto')}>
          {many && (
            <div role="tablist" aria-label="QC targets" className="flex flex-wrap gap-1.5 rounded-[10px] border border-edge bg-panel p-2 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
              {list.map((t) => (
                <button key={t.target} role="tab" type="button" aria-selected={t.target === current.target} onClick={() => setPick(t.target)}
                  className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2 text-[12px] tabular-nums', t.target === current.target ? 'border-faint bg-raised text-ink' : 'border-line text-sub hover:text-ink')}>
                  <span className="font-mono text-[11.5px]">{t.target}</span>
                  <span className="text-mute">{t.entry && !t.source ? (t.entry.latest.score === null ? '–' : t.entry.latest.score.toFixed(1)) : '·'}</span>
                </button>
              ))}
            </div>
          )}
          <QCPanel spec={spec} t={current} compact onClose={() => setOpen(false)} lockWord={lockWord} />
        </div>
      )}
    </div>
  );
}
