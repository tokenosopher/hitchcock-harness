'use client';
// A chip's card: what a reference in the message points at, opened by hovering the chip (a tap on the
// phone), in the box or in a sent message. The frame or the panel, the clip's place and length, the cut, the file,
// and "Go to it". Drawn over everything, beside the chip or along the box.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { refKindWords, splitRefTags, type InlineRef } from '@/lib/refs';
import { mediaUrl } from '@/components/media/Media';
import { goOnPage, refHref } from '@/components/lib/refPick';
import { cn } from '@/lib/utils';

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const base = (p: string) => p.split('/').pop() ?? p;
const secs = (s?: number) => (s === undefined ? undefined : `${Math.round(s * 10) / 10} s`);

/** The picture for a reference: the frame under it, the panel, the face, the view. */
export function refImage(r: InlineRef): string | undefined {
  if (!r.file) return undefined;
  if (!VIDEO.test(r.file)) return /\.(png|jpe?g|webp)$/i.test(r.file) ? mediaUrl(r.file, { w: 160 }) : undefined;
  const t = r.kind === 'moment' ? r.from : r.from !== undefined && r.to !== undefined ? (r.from + r.to) / 2 : r.from ?? 0.5;
  return mediaUrl(r.file, { w: 160, t: Math.round((t ?? 0.5) * 100) / 100 });
}

function rows(r: InlineRef): [string, ReactNode][] {
  const cut = r.cut ? `${r.cut}${r.edited ? ' with edits' : ''}` : undefined;
  const file = r.file ? <span className="font-mono text-[10.5px] text-sub" title={r.file}>{base(r.file)}</span> : undefined;
  const span = r.from !== undefined && r.to !== undefined ? `${Math.round(r.from * 10) / 10} to ${Math.round(r.to * 10) / 10} s` : undefined;
  const list: [string, ReactNode | undefined][] = (() => {
    switch (r.kind) {
      case 'moment': return [['At', r.at], ['Under it', r.title], ['Cut', cut], ['File', file]];
      case 'clip': case 'panel': return [['Where', [r.track, r.at].filter(Boolean).join(' · ') || undefined], ['Length', secs(r.length)], ['Cut', cut], ['File', file]];
      case 'take': return [['Scene', r.scene], ['Length', secs(r.length)], ['File', file]];
      case 'shot': return [['Take', r.take], ['In the take', span], ['Length', secs(r.length)], ['File', file]];
      case 'scene': return [['Title', r.title], ['Length', secs(r.length)]];
      case 'character': return [['Name', r.title]];
      case 'view': return [['Place', r.location], ['File', file]];
      case 'location': return [['Name', r.title]];
      case 'card': return [['Asks', r.title], ['Card', r.card]];
    }
  })();
  return list.filter((x): x is [string, ReactNode] => x[1] !== undefined && x[1] !== '');
}

/** Goes to the thing: the page on screen when it shows it, else its page. */
export function useGoToRef(film: string) {
  const router = useRouter();
  return (r: InlineRef) => { if (!goOnPage(r)) router.push(refHref(film, r)); };
}

export interface CardPlace { anchor: DOMRect; along?: DOMRect }

/** The card, fixed over the page: along a box (its width, 8 px above it), or beside a chip. */
export function RefCard({ r, place, film, onEnter, onLeave, onGo }: { r: InlineRef; place: CardPlace; film: string; onEnter?: () => void; onLeave?: () => void; onGo?: () => void }) {
  const go = useGoToRef(film);
  const img = refImage(r);
  const [h, setH] = useState(0);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => { if (el.current) setH(el.current.offsetHeight); }, [r]);
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth, vh = typeof window === 'undefined' ? 768 : window.innerHeight;
  let style: React.CSSProperties;
  if (place.along) {
    const a = place.along;
    style = { left: a.left, width: a.width, bottom: vh - a.top + 8 };
  } else {
    const a = place.anchor, w = Math.min(296, vw - 16);
    const left = Math.max(8, Math.min(a.left, vw - w - 8));
    const above = a.top - 8 > (h || 150);
    style = above ? { left, width: w, bottom: vh - a.top + 6 } : { left, width: w, top: a.bottom + 6 };
  }
  const list = rows(r);
  return createPortal(
    <div ref={el} role="dialog" aria-label={`${r.label}: what it points at`} data-ref-card="" onMouseEnter={onEnter} onMouseLeave={onLeave} style={style}
      className="fixed z-[70] flex gap-[11px] rounded-xl border border-edge bg-panel p-2.5 text-left shadow-[0_12px_40px_rgba(0,0,0,0.7)] duration-150 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element -- a frame or a picture from /api/media
        <img src={img} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="max-h-[121px] w-[68px] flex-none self-start rounded-[6px] border border-line bg-raised object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-medium text-ink">{r.label}</span>
        <span className="text-[11px] text-mute">{refKindWords(r)}</span>
        {list.length > 0 && (
          <dl className="m-0 mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-[3px] text-[11.5px]">
            {list.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-mute">{k}</dt>
                <dd className="m-0 min-w-0 truncate text-ink-3">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <button type="button" onClick={() => { onGo?.(); go(r); }}
          className="mt-2 inline-flex h-6 w-max cursor-pointer items-center rounded-[6px] border border-edge bg-transparent px-2 text-[11.5px] text-ink transition-colors hover:bg-raised">
          Go to it
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Hover with a short wait before opening and before closing, so the pointer can cross from the chip to the card. */
export function useHoverCard<T>() {
  const [open, setOpen] = useState<T>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (v: T, wait = 120) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(v), wait); };
  const hide = (wait = 160) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(undefined), wait); };
  const keep = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { open, setOpen, show, hide, keep };
}

/** A chip in a sent message: hover for its card, click to go to it; on a touch screen a tap opens the card. */
function SentChip({ r, film, open, onOpen, onClose, onKeep }: { r: InlineRef; film: string; open?: DOMRect; onOpen: (rect: DOMRect, now?: boolean) => void; onClose: () => void; onKeep: () => void }) {
  const go = useGoToRef(film);
  const touch = useRef(false);
  return (
    <>
      <button type="button" data-sent-ref="" aria-label={`${r.label}, ${refKindWords(r).toLowerCase()}`}
        onPointerDown={(e) => { touch.current = e.pointerType !== 'mouse'; }}
        onMouseEnter={(e) => onOpen(e.currentTarget.getBoundingClientRect())} onMouseLeave={onClose}
        onClick={(e) => { if (touch.current) { if (open) onClose(); else onOpen(e.currentTarget.getBoundingClientRect(), true); } else go(r); }}
        className={cn('mx-px inline cursor-pointer whitespace-nowrap rounded-[5px] border-0 bg-edge px-[3px] py-0 align-baseline text-[13.5px] leading-[inherit] text-ink shadow-[inset_0_0_0_1px_#3f3f46] transition-colors hover:bg-edge-strong', open && 'bg-edge-strong shadow-[inset_0_0_0_1px_#a1a1aa]')}>
        {r.label}
      </button>
      {open && <RefCard r={r} film={film} place={{ anchor: open }} onEnter={onKeep} onLeave={onClose} />}
    </>
  );
}

/** The user's words in the thread, with each reference drawn as its chip. */
export function UserWords({ text, film }: { text: string; film: string }) {
  const parts = splitRefTags(text);
  const card = useHoverCard<{ i: number; rect: DOMRect }>();
  if (parts.length === 1 && typeof parts[0] === 'string') return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : (
        <SentChip key={i} r={p} film={film} open={card.open?.i === i ? card.open.rect : undefined}
          onOpen={(rect, now) => (now ? card.setOpen({ i, rect }) : card.show({ i, rect }))} onClose={() => card.hide()} onKeep={card.keep} />
      )))}
    </>
  );
}
