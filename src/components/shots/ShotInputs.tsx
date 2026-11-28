'use client';
// Every input the take sent, on the Shot details page. At a shot: the ones its part of the prompt names first, the rest
// folded under "N more went with the take but aren't named in shot 7"; on the whole take: all of them, videos then
// pictures, in the order sent. Storyboard pages show the shot's own panels on them. Beside the pages, the previz the
// storyboard was drawn from, in a dashed, dimmer frame: never sent to the model, never counted. Sounds come last.
// On the phone the inputs are a row to swipe. A click or tap on a picture, clip, page or the previz opens it in the
// app's full-screen viewer, which steps through every input of the page in its order; sounds
// play where they are. The chevron at a card's right edge unfolds its whole description, file and count, in place.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { SentRef } from '@/server/types';
import type { BoardPanel, ShotDetailsExtra } from '@/server/films/read/previzTake';
import { mediaUrl } from '@/components/media/Media';
import { PlayButton } from '@/components/media/Sound';
import { zoomItems, type ZoomItem } from '@/components/media/Lightbox';
import { runsOf, voicedVideos } from '@/components/lib/shotDetails';
import { cn } from '@/lib/utils';
import { word } from '@/components/lib/format';
import { fullName, panelsOn, tagName, type Model, type PageShot } from './model';
import { PICK, pickProps } from './tell';

export interface InputsHandle { go: (orders: number[]) => void }

const EXPAND = (
  <span aria-hidden="true" className="pointer-events-none absolute right-[3px] top-[3px] grid size-[17px] place-items-center rounded-[5px] bg-bg/75 text-ink opacity-0 transition-opacity duration-200 group-hover/in:opacity-100">
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
  </span>
);
const PLAY = <svg width="7" height="7" viewBox="0 0 16 16" fill="#fafafa" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>;

/** The media list's words for an input, short: up to its first sentence when long (never cut mid-word with "…"). */
export function shortDesc(d: string | undefined): string {
  if (!d) return '';
  if (d.length <= 140) return d;
  const m = /^(.{40,180}?[.;:])\s/.exec(d);
  return m ? m[1].replace(/[;:]$/, '.') : d;
}

export const ShotInputs = forwardRef<InputsHandle, {
  m: Model; sel?: PageShot; matched: boolean; shots: PageShot[]; extra?: ShotDetailsExtra; panelsKnown: BoardPanel[] | undefined;
  phone: boolean; touch: boolean; hot: Set<number>; lit: Set<number>;
  pathOf: (rel?: string) => string | undefined;
  onHot: (orders: number[], on: boolean) => void; onShot: (i: number) => void;
  tell: (r: SentRef) => void; tellPreviz: () => void;
  previz?: { t0: number; t1: number; known: boolean };
}>(function ShotInputs({ m, sel, matched, shots, extra, panelsKnown, phone, touch, hot, lit, pathOf, onHot, onShot, tell, tellPreviz, previz }, ref) {
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<number>();
  const list = useRef<HTMLDivElement>(null);
  const atShot = !!sel && matched && !!sel.sec;
  const named = atShot ? m.bySec.get(sel!.sec!.id) ?? new Set<number>() : undefined;
  const inn = named ? m.refs.filter((r) => named.has(r.order)) : m.refs;
  const out = named ? m.refs.filter((r) => !named.has(r.order)) : [];

  // another shot: the fold closes, the unfolded card folds
  const [shown, setShown] = useState(sel?.i);
  if (shown !== sel?.i) { setShown(sel?.i); setMore(false); setOpen(undefined); }

  useImperativeHandle(ref, () => ({
    go: (orders) => {
      if (!orders.length) return;
      const folded = orders.every((o) => out.some((r) => r.order === o));
      if (folded) setMore(true);
      const scroll = () => {
        const el = list.current?.querySelector<HTMLElement>(`[data-input="${orders[0]}"]`);
        if (!el) return;
        if (phone) { el.scrollIntoView({ inline: 'center', block: 'center', behavior: 'smooth' }); return; }
        list.current?.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
      };
      setTimeout(scroll, folded ? 320 : 0);
    },
  }), [out, phone]);

  const pv = extra?.previz;
  // the cards in the order the page draws them; 'pv' is the previz card, beside the storyboard pages
  const seqOf = (rs: SentRef[], quiet?: boolean): (SentRef | 'pv')[] => {
    const at = rs.findIndex((r) => r.page !== undefined);
    const xs = rs.flatMap((r, i): (SentRef | 'pv')[] => (i === at && !quiet ? ['pv', r] : [r]));
    return at < 0 && !quiet ? [...xs, 'pv'] : xs;
  };
  const viewable = (r: SentRef) => r.kind !== 'AUDIO' && !r.missing && !!pathOf(r.file);
  const view = (key: number | 'pv') => {
    const vids = m.refs.filter((r) => r.kind === 'VIDEO'), pics = m.refs.filter((r) => r.kind === 'IMAGE');
    const seq = atShot ? [...(inn.length ? seqOf(inn) : []), ...out]
      : [...vids, ...(pics.length ? seqOf(pics) : ['pv' as const])];
    const items: (ZoomItem & { key: number | 'pv' })[] = [];
    for (const x of seq) {
      if (x === 'pv') {
        if (!pv?.clip) continue;
        const nm = /([^/]+)-previz-take-(\d+)\.json$/.exec(pv.json);
        const at = previz && previz.t1 > previz.t0 ? previz.t0 : undefined;
        items.push({ key: 'pv', src: mediaUrl(pathOf(pv.clip)!), alt: `Previz${nm ? ` · ${nm[1]} previz take ${nm[2]}` : ''}${at !== undefined && sel ? ` · from shot ${sel.label}` : ''}`, video: true, ...(at ? { from: at } : {}) });
      } else if (viewable(x)) {
        items.push({ key: x.order, src: mediaUrl(pathOf(x.file)!), alt: x.tag ? `${x.name} · ${tagName(x, m)}` : x.name, video: x.kind === 'VIDEO' });
      }
    }
    zoomItems(items, Math.max(0, items.findIndex((it) => it.key === key)));
  };

  const pageShotId = sel?.sec?.shot ?? sel?.label;
  const shotsLine = (r: SentRef) => {
    const places = m.byRef.get(r.order) ?? [];
    const here = sel ? places.includes(sel.i) : false;
    const rest = places.filter((p) => !sel || p !== sel.i);
    if (!rest.length) return here ? 'Only in this shot' : m.counts.get(r.order) ? 'Named outside the shots only' : '';
    const L = (p: number) => {
      const s = shots[p - 1];
      return <button key={p} type="button" onClick={(e) => { e.stopPropagation(); if (!e.altKey) onShot(p); }} title={`Go to shot ${s?.label ?? p}`}
        className="cursor-pointer text-sub underline decoration-edge-strong underline-offset-2 hover:text-ink hover:decoration-ink">{s?.label ?? p}</button>;
    };
    const runs = runsOf(rest);
    return <>{here ? 'Also in shot' : 'In shot'}{rest.length > 1 ? 's' : ''} {runs.map(([a, b], j) => <span key={a}>{j > 0 && ', '}{a === b ? L(a) : b === a + 1 ? <>{L(a)}, {L(b)}</> : <>{L(a)}–{L(b)}</>}</span>)}</>;
  };

  const card = (r: SentRef, quiet?: boolean) => {
    const path = pathOf(r.file);
    const pp = atShot && r.page !== undefined ? panelsOn(panelsKnown, m.ctx, pageShotId, r.page) : [];
    const cnt = m.counts.get(r.order) ?? 0;
    const words = pp.length ? `Panel${pp.length > 1 ? 's' : ''} ${pp.map((p) => p.n).join(' and ')} of shot ${sel!.label} ${pp.length > 1 ? 'are' : 'is'} on this page` : r.page !== undefined ? `Storyboard page ${r.page}` : shortDesc(r.desc);
    const can = viewable(r);
    const isOpen = open === r.order;
    return (
      <div key={r.order} data-input={r.order} {...pickProps(() => tell(r))}
        onMouseEnter={() => onHot([r.order], true)} onMouseLeave={() => onHot([r.order], false)}
        onClick={(e) => { if (e.altKey || !can) return; view(r.order); }}
        className={cn('group/in relative grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 rounded-[10px] border bg-panel p-[7px] transition-[opacity,border-color,background-color,box-shadow] duration-300',
          hot.has(r.order) ? 'border-faint' : 'border-edge hover:border-faint', quiet && !hot.has(r.order) && 'opacity-55 hover:opacity-100',
          lit.has(r.order) && 'border-ink bg-raised', can ? 'cursor-pointer' : 'cursor-default',
          phone && 'w-[108px] flex-none snap-start self-start grid-cols-1 gap-y-1.5 p-1.5', PICK)}>
        <div className={cn('relative size-[52px] overflow-hidden rounded-[7px] bg-black', phone && 'h-[88px] w-full', r.page !== undefined && !pp.length && 'bg-white', pp.length > 0 && 'flex gap-0.5 bg-tile')}>
          {r.kind === 'AUDIO' ? (
            <span className="flex size-full items-center justify-center bg-tile">{path && !r.missing ? <PlayButton path={path} label={fullName(r, m)} /> : <span className="text-[10px] text-mute">sound</span>}</span>
          ) : pp.length ? pp.map((p) => <img key={p.n} alt={`Panel ${p.n}`} src={mediaUrl(pathOf(p.file)!, { w: 160 })} className="h-full min-w-0 flex-1 object-cover" />)
            : path && !r.missing ? <HoverClip r={r} path={path} contain={r.page !== undefined} />
              : <span className="flex size-full items-center justify-center bg-tile px-1 text-center text-[9.5px] text-mute">{r.missing ? 'file missing' : 'no file'}</span>}
          {r.kind === 'VIDEO' && <span className="absolute bottom-[3px] right-[3px] grid size-[15px] place-items-center rounded-full bg-bg/75">{PLAY}</span>}
          {can && !phone && EXPAND}
        </div>
        <div className={cn('flex min-w-0 flex-col gap-[3px]', phone ? 'pr-5' : 'pr-6')}>
          <div className="text-[13px] leading-[1.3] text-ink-2 max-[760px]:text-[12.5px]"><b className="font-semibold text-ink max-[760px]:block">{r.name}</b> {r.tag ? tagName(r, m) : ''}</div>
          {!phone && !isOpen && words && <div className="text-[12px] leading-[1.4] text-sub">{words}</div>}
          {r.missing ? <span className="text-[11px] text-bad">The file is missing</span> : !cnt ? <span className="text-[11px] text-warn">Not named in the prompt</span> : null}
          {!phone && <div className="text-[11.5px] leading-[1.45] text-mute">{shotsLine(r)}</div>}
          {touch && (
            <button type="button" onClick={(e) => { e.stopPropagation(); tell(r); }} className="mt-0.5 w-max cursor-pointer rounded-[6px] border border-edge px-1.5 py-0.5 text-[11.5px] text-sub hover:text-ink">Tell Alma</button>
          )}
        </div>
        <button type="button" data-input-more aria-expanded={isOpen} aria-label={isOpen ? 'Fold the details' : 'Show the details'} title={isOpen ? 'Fold the details' : 'Show the details'}
          onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? undefined : r.order); }}
          className={cn('absolute right-0.5 grid size-7 cursor-pointer place-items-center rounded-[7px] text-mute transition-colors hover:bg-raised hover:text-ink', phone ? 'top-[94px]' : 'top-[5px]')}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={cn('transition-transform duration-300', isOpen && 'rotate-180')}><path d="M3 6l5 5 5-5" /></svg>
        </button>
        <div className={cn('col-span-full grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
          <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
            <p className="m-0 mt-2 border-t border-line pt-1.5 text-[12px] leading-normal text-sub">{r.desc ?? (r.page !== undefined ? `Page ${r.page} of the storyboard.` : 'The media list has no words for it.')}</p>
            <p className="m-0 mb-0.5 break-all font-mono text-[10.5px] text-mute">{r.what} · {r.file?.split('/').pop() ?? 'no file'} · named {cnt}×</p>
          </div>
        </div>
      </div>
    );
  };

  const previzCard = (pagesFollow: boolean) => pv?.clip ? <PrevizCard key="previz" pv={pv} win={previz} sel={sel} phone={phone} pathOf={pathOf} pagesFollow={pagesFollow} tell={tellPreviz} onOpen={() => view('pv')} /> : null;
  const withPreviz = (rs: SentRef[], quiet?: boolean) => {
    const follows = rs.some((r) => r.page !== undefined);
    return seqOf(rs, quiet).map((x) => (x === 'pv' ? previzCard(follows) : card(x, quiet)));
  };
  const audio = m.refs.filter((r) => r.kind === 'AUDIO');
  const voiced = voicedVideos(m.rec.prompt.text, m.refs);
  const head = (t: string, n: number, p?: string, top?: boolean) => (
    <div className={cn('mb-2 flex flex-col gap-1', !top && 'mt-[18px]')}>
      <span className="text-[13.5px] font-semibold text-ink">{t} <span className="font-medium text-mute">({n})</span></span>
      {p && <p className="m-0 text-[12px] leading-[1.45] text-mute">{p}</p>}
    </div>
  );
  const row = cn('flex flex-col gap-1.5 p-[3px]', phone && 'flex-row snap-x snap-proximity gap-2 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden');

  return (
    <aside aria-label="Inputs" className="flex min-h-0 flex-col">
      <div ref={list} className={cn('scroll relative min-h-0 flex-1 overflow-auto pb-10 pr-0.5', phone && 'overflow-visible p-0')}>
        {atShot ? (
          <>
            {head('Named in this shot', inn.length, `All ${m.refs.length} were sent with the whole take; ${inn.length === 1 ? 'this one is' : `these ${inn.length} are`} named in shot ${sel!.label}.`, true)}
            {inn.length ? <div className={row}>{withPreviz(inn)}</div>
              : <p className="m-0 rounded-[10px] border border-dashed border-edge px-2.5 py-2 text-[12px] leading-[1.45] text-mute">Shot {sel!.label}&apos;s part of the prompt names none of the inputs by name.</p>}
            {out.length > 0 && (
              <>
                <button type="button" aria-expanded={more} onClick={(e) => { if (!e.altKey) setMore(!more); }}
                  className="mt-3 flex w-full cursor-pointer items-start gap-2 rounded-[10px] border border-dashed border-edge-strong px-2.5 py-[9px] text-left text-[12.5px] leading-[1.4] text-sub transition-colors hover:border-sub hover:text-ink">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={cn('mt-[3px] flex-none transition-transform duration-300', more && 'rotate-90')}><path d="M6 3l5 5-5 5" /></svg>
                  <span>{out.length} more went with the take but {out.length === 1 ? "isn't" : "aren't"} named in shot {sel!.label}</span>
                </button>
                <div className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none', more ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                  <div className="min-h-0 overflow-hidden"><div className={cn(row, 'pt-2')}>{more || !phone ? out.map((r) => card(r, true)) : null}</div></div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {!matched && sel && <p className="m-0 mb-3 rounded-[10px] border border-dashed border-edge px-2.5 py-2 text-[12px] leading-[1.45] text-sub">The prompt has {m.shotSecs.length} shot {m.shotSecs.length === 1 ? 'part' : 'parts'} and the clip was cut into {shots.length} shots, so shot {sel.label} cannot be matched to its part. Every input is shown.</p>}
            {(['VIDEO', 'IMAGE'] as const).map((k, j) => {
              const rs = m.refs.filter((r) => r.kind === k);
              if (!rs.length) return null;
              return <div key={k}>{head(k === 'VIDEO' ? 'Videos' : 'Pictures', rs.length, j === 0 || !m.refs.some((r) => r.kind === 'VIDEO') ? `All ${m.refs.length} inputs, in the order sent.` : undefined, j === 0 || !m.refs.some((r) => r.kind === 'VIDEO'))}<div className={row}>{k === 'IMAGE' ? withPreviz(rs) : rs.map((r) => card(r))}</div></div>;
            })}
            {!m.refs.some((r) => r.kind === 'IMAGE') && pv?.clip && <div className={row}>{previzCard(false)}</div>}
          </>
        )}
        {head('Sounds', audio.length)}
        {audio.length ? (!atShot ? <div className={row}>{audio.map((r) => card(r))}</div> : <p className="m-0 text-[12px] leading-[1.45] text-mute">{audio.filter((r) => named?.has(r.order)).length ? 'Shown above with the inputs this shot names.' : `${audio.length === 1 ? 'The sound' : 'The sounds'} sent with the take ${audio.length === 1 ? 'is' : 'are'} under the fold above.`}</p>)
          : <div className="rounded-[10px] border border-dashed border-edge px-2.5 py-2 text-[12px] leading-[1.45] text-mute">No sound files were sent{voiced ? `; the voices come from the ${voiced === 1 ? 'video input' : `${word(voiced)} video inputs`}` : ''}.</div>}
      </div>
    </aside>
  );
});

/** A picture, or a clip that plays muted while pointed at. */
function HoverClip({ r, path, contain }: { r: SentRef; path: string; contain?: boolean }) {
  const [on, setOn] = useState(false);
  const cls = cn('absolute inset-0 size-full', contain ? 'object-contain' : 'object-cover');
  return (
    <span className="absolute inset-0" onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      <img alt="" src={mediaUrl(path, { w: 160, t: 1 })} className={cn(cls, contain && 'bg-white')} />
      {r.kind === 'VIDEO' && on && <video src={mediaUrl(path)} autoPlay muted loop playsInline className={cn(cls, 'duration-200 animate-in fade-in-0')} />}
    </span>
  );
}

/** The previz the storyboard was drawn from: a click opens it full screen from the shot's part; never counted as an input. */
function PrevizCard({ pv, win, sel, phone, pathOf, pagesFollow, tell, onOpen }: {
  pv: NonNullable<ShotDetailsExtra['previz']>; win?: { t0: number; t1: number; known: boolean }; sel?: PageShot; phone: boolean;
  pathOf: (rel?: string) => string | undefined; pagesFollow: boolean; tell: () => void; onOpen: () => void;
}) {
  const clip = pathOf(pv.clip)!;
  const timed = !!win && win.t1 > win.t0;
  const t0 = timed ? win!.t0 : 0, t1 = timed ? win!.t1 : undefined;
  const len = t1 !== undefined ? `${(t1 - t0).toFixed(1)} s` : pv.seconds ? `${pv.seconds.toFixed(1)} s` : '';
  const name = /([^/]+)-previz-take-(\d+)\.json$/.exec(pv.json);
  const words = !sel ? `The whole previz${pv.seconds ? `, ${pv.seconds.toFixed(1)} s` : ''}.`
    : timed && win!.known ? `Cued to shot ${sel.label}: ${win!.t0.toFixed(1)}–${win!.t1.toFixed(1)} s of ${pv.seconds.toFixed(1)} s.`
      : `Where shot ${sel.label} falls in it is not known, so the whole previz plays${pv.seconds ? ` (${pv.seconds.toFixed(1)} s)` : ''}.`;
  const NOTE = 'what the storyboard was drawn from · not sent to the model';
  return (
    <div className={cn('my-1.5 flex flex-col gap-1.5', phone && 'my-0 w-[108px] flex-none snap-start self-start')}>
      {!phone && <div className="flex flex-col gap-0.5"><b className="text-[12.5px] font-semibold text-ink-3">Previz</b><span className="text-[11.5px] leading-[1.4] text-sub">{NOTE}</span></div>}
      <div role="button" tabIndex={0} aria-label={`Play the previz, ${len}`} {...pickProps(tell)}
        onClick={(e) => { if (!e.altKey) onOpen(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        className={cn('group/in grid cursor-pointer grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 rounded-[10px] border border-dashed border-edge-strong bg-transparent p-[7px] transition-colors hover:border-sub', phone && 'grid-cols-1 gap-y-1.5 p-1.5', PICK)}>
        <div className={cn('relative size-[52px] overflow-hidden rounded-[7px] bg-tile', phone && 'h-[88px] w-full')}>
          <img alt="" src={mediaUrl(clip, { w: 160, t: t0 + Math.min(0.5, ((t1 ?? pv.seconds) - t0) / 2 || 0.5) })} className="absolute inset-0 size-full object-cover opacity-70" />
          {len && <span className="absolute bottom-[3px] left-[3px] rounded-[4px] bg-bg/80 px-[3px] py-0.5 font-mono text-[9.5px] leading-none text-ink-2">{len}</span>}
          <span className="absolute bottom-[3px] right-[3px] grid size-[15px] place-items-center rounded-full bg-bg/75">{PLAY}</span>
          {!phone && EXPAND}
        </div>
        {phone ? (
          <div className="text-[12px] leading-[1.3] text-sub"><b className="block text-[12.5px] font-semibold text-ink-3">Previz</b>not sent to the model</div>
        ) : (
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="text-[13px] leading-[1.3] text-sub"><b className="font-semibold text-ink-3">{name ? `${name[1]} previz` : 'Previz'}</b>{name ? ` take ${name[2]}` : ''}</div>
            <div className="text-[12px] leading-[1.4] text-sub">{words}{pv.from === 'scene' ? " The take's record names no previz; this is its scene's newest." : ''}</div>
            <div className="flex items-center gap-[5px] text-[11.5px] leading-[1.45] text-sub">↓ {pagesFollow ? 'The storyboard pages below were drawn from it.' : 'The storyboard was drawn from it.'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
