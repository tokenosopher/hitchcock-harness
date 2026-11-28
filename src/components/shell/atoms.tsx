// Small shared pieces: status dots, badges, chips, cards. Values copied from the boards.
import { cn } from '@/lib/utils';
import { Media } from '@/components/media/Media';
import { refData } from '@/components/lib/refPick';
import type { InlineRef } from '@/lib/refs';

export type DotState = 'done' | 'running' | 'queued' | 'waiting' | 'failed' | 'ready' | 'picked' | 'locked';

/** Running = grey dot with ring and pulse; done = white dot; queued/waiting = hollow; failed = red. */
export function Dot({ state, size = 6, className }: { state: DotState; size?: number; className?: string }) {
  const style: React.CSSProperties = { width: size, height: size, borderRadius: size / 2, boxSizing: 'border-box', flex: 'none' };
  if (state === 'running') Object.assign(style, { background: '#A1A1AA', boxShadow: '0 0 0 2px #3F3F46' });
  else if (state === 'failed') Object.assign(style, { background: '#F87171' });
  else if (state === 'queued') Object.assign(style, { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px #71717A' });
  else if (state === 'waiting') Object.assign(style, { background: 'transparent', border: '1px solid #71717A' });
  else Object.assign(style, { background: '#FAFAFA' });
  return <span aria-hidden="true" className={cn(state === 'running' && 'dot-run', 'inline-block', className)} style={style} />;
}

export function Badge({ children, dashed, dim, className }: { children: React.ReactNode; dashed?: boolean; dim?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 flex-none items-center rounded-[10px] border border-edge-strong px-[7px] text-[11px] font-medium', dashed && 'border-dashed', dim ? 'text-sub' : 'text-ink', className)}>
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12px]', className)}>{children}</span>;
}

export function Card({ children, className, dashed, as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; dashed?: boolean; as?: 'section' | 'article' | 'div' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('min-w-0 rounded-[9px] border border-edge bg-panel', dashed && 'border-dashed border-edge-strong bg-bg', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHead({ label, right, className }: { label: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <span className="lbl">{label}</span>
      {right !== undefined && <span className="font-mono text-[11px] text-mute">{right}</span>}
    </div>
  );
}

export function Btn({ children, primary, ghost, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; ghost?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
        primary ? 'bg-ink text-bg hover:bg-ink-3' : ghost ? 'px-2.5 text-sub hover:text-ink' : 'border border-edge-strong text-ink hover:bg-raised',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A candidate tile: the picture itself when `src` (a path relative to the film repo) is given, else a grey tile with the id. */
export function Tile({ label, selected, alma, kept, onClick, className, ariaLabel, faded, src, w = 320, choose, mark }: { label: string; selected?: boolean; alma?: boolean; kept?: boolean; onClick?: () => void; className?: string; ariaLabel?: string; faded?: boolean; src?: string; w?: number; /** a click chooses it: the full-screen view offers the same choice (Lightbox) */ choose?: boolean; /** what Option-click puts into Alma's message box (refPick.ts) */ mark?: InlineRef }) {
  return (
    <button
      type="button"
      {...(mark ? refData(mark) : {})}
      onClick={onClick}
      aria-label={`${ariaLabel ?? `Candidate ${label}`}${kept ? ', in the library' : ''}`}
      aria-pressed={selected}
      data-zoom-choose={choose ? '' : undefined}
      className={cn(
        'relative flex cursor-pointer items-end justify-center rounded-[6px] border bg-tile pb-1.5 font-mono text-[10.5px]',
        selected ? 'border-sub text-ink outline outline-1 outline-offset-2 outline-ink' : 'border-line text-mute hover:border-edge-strong',
        faded && 'border-dashed opacity-60',
        className,
      )}
    >
      {src && <Media path={src} w={w} missingLabel="" className="absolute inset-0 rounded-[5px]" />}
      {alma && <span className="absolute left-1.5 top-1.5 z-[1] rounded-[4px] bg-ink px-1.5 py-px font-sans text-[10px] font-semibold text-bg">Alma</span>}
      {/* in the library: a small filled bookmark in the corner */}
      {kept && <span title="In the library" className="absolute right-1.5 top-1.5 z-[1] flex size-[18px] items-center justify-center rounded-[4px] bg-black/60 text-ink duration-200 animate-in fade-in-0"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg></span>}
      {src ? <span className="relative z-[1] rounded-[4px] bg-black/60 px-1.5 py-px text-ink-3">{label}</span> : label}
    </button>
  );
}

/** What the readers could not make sense of in the film's files. Closed by default: it is for whoever mends the
 *  record, not part of the page. */
export function ReadingNotes({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null;
  return (
    <details className="text-[12px] leading-normal text-mute">
      <summary className="cursor-pointer select-none list-none hover:text-sub [&::-webkit-details-marker]:hidden">{notes.length === 1 ? '1 note' : `${notes.length} notes`} from reading the files</summary>
      <div className="mt-1.5 flex flex-col gap-1">{notes.map((w) => <span key={w} className="[overflow-wrap:anywhere]">{w}</span>)}</div>
    </details>
  );
}
