'use client';
// The Shots page. The flow's Shots step opens it. The scenes in the order
// the film runs; each scene's places in order (1, 2, 3, 4, 4a …), each a picture of the version in the film, else the
// newest; "N versions" unfolds every time that shot was made, newest first. A whole-scene replan is the scene now, its
// earlier versions folded under it. Every card and version opens its Shot details. In the header, the previz of the
// whole film, opened full screen on a tap, so the page stays light.
// Which shot is which place: components/shots/places.ts.
import Link from 'next/link';
import { StepIntro } from '@/components/intro/StepIntro';
import { useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isWide } from '@/lib/frame';
import type { ShotList } from '@/server/films/read/shotlist';
import { usePage } from '@/components/data/ui';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { IconChevronDown, IconChevronRight } from '@/components/shell/icons';
import { Reveal } from '@/components/shell/Reveal';
import { Media, mediaUrl } from '@/components/media/Media';
import { zoomVideo } from '@/components/media/Lightbox';
import { useShots } from '@/components/edit/ShotViews';
import { parseShotId } from '@/components/edit/shotCols';
import { useFilmPage } from '@/components/pages/common';
import { shotDetailsHref } from '@/components/lib/shotHref';
import { refData } from '@/components/lib/refPick';
import { cn } from '@/lib/utils';
import { useShotPlaces } from './useShotPlaces';
import { shownVersion, takeFolder, versionCounts, type Made, type Place, type SceneShots, type SceneVersion } from './places';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (ms?: number) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const when = (ms?: number) => { if (!ms) return ''; const d = new Date(ms); return `${day(ms)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const secs = (v: Made) => `${(v.to - v.from).toFixed(1)} s`;
const clock = (s: number) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const midT = (v: Made) => Math.max(0.05, (v.from + v.to) / 2);

/** The phone's layout (the app's 760 px line). */
function usePhone(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(max-width: 760px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(max-width: 760px)').matches,
    () => false,
  );
}
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------------------------------- small parts

function Dot({ size = 10 }: { size?: number }) {
  return <span aria-hidden="true" className="block flex-none rounded-full bg-ink shadow-[0_0_0_2px_rgba(9,9,11,0.85)]" style={{ width: size, height: size }} />;
}
function NotUsed({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded border border-dashed border-mute bg-[rgba(9,9,11,0.85)] px-1 text-[9.5px] font-medium text-ink-3', className)}>Not in the film</span>;
}
function Status({ v }: { v: Made }) {
  return v.inFilm
    ? <span className="inline-flex items-center gap-1.5 text-[12px] text-ink"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />In the film</span>
    : <span className="inline-flex items-center gap-1.5 text-[12px] text-sub"><span aria-hidden="true" className="box-border size-1.5 rounded-full border border-mute" />Not in the film</span>;
}
const Chev = ({ open }: { open?: boolean }) => <IconChevronDown size={10} className={cn('flex-none transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />;

/** The key at the top, as drawn. */
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-sub">
      <span className="inline-flex items-center gap-1.5"><Dot />in the film</span>
      <span className="inline-flex items-center gap-1.5"><NotUsed />made, not used</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3.5 rounded-[3px] border border-dashed border-faint" />not made yet</span>
      <span className="max-[760px]:hidden">Scenes keep the numbers they were written with and are listed as the film runs.</span>
    </div>
  );
}

/** The whole film's previz, as one small tile: a tap opens it full screen and plays it. Nothing plays here. */
function PrevizTile({ pv, titles, phone }: { pv: NonNullable<ShotList['previz']>; titles: Map<string, string>; phone?: boolean }) {
  const box = useBox();
  const open = () => zoomVideo(mediaUrl(pv.path), `Previz of the whole film · ${pv.version}`,
    pv.scenes.map((s) => ({ from: s.from, to: s.to, label: titles.has(s.scene) ? `${s.scene} · ${titles.get(s.scene)}` : s.scene })));
  return (
    <button type="button" data-previz-film onClick={open} aria-label={`Play the previz of the whole film, ${pv.version}${pv.seconds ? `, ${clock(pv.seconds)}` : ''}, full screen`}
      className={cn('group/pv flex flex-none cursor-pointer items-center gap-2.5 rounded-[10px] border border-edge bg-panel p-1 pr-3 text-left text-ink transition-colors duration-150 hover:border-edge-strong hover:bg-raised',
        phone ? 'h-11 w-full' : 'h-10')}>
      <Media path={pv.path} w={160} t={Math.min(8, (pv.seconds ?? 16) / 2)} missingLabel="" className={cn('flex-none rounded-md', box(phone ? 'h-9 w-[22px]' : 'h-8 w-5'))} />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">Previz of the whole film{pv.seconds ? <span className="text-sub"> · {clock(pv.seconds)}</span> : null}</span>
      <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full border border-edge-strong transition-colors duration-150 group-hover/pv:border-sub">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="#FAFAFA"><path d="M7 4.5v15l12-7.5z" /></svg>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------- desktop

const CARD = 92;
// A landscape film: each picture's box turned on its side, the cards as wide as their pictures. Written out
// in full so Tailwind sees every class; a 9:16 film keeps the boxes as drawn.
const WideFilm = createContext(false);
const SIDEWAYS: Record<string, string> = {
  'h-[142px] w-20': 'h-20 w-[142px]', 'h-24 w-[54px]': 'h-[54px] w-24', 'h-[39px] w-[22px]': 'h-[22px] w-[39px]',
  'h-[92px] w-[50px]': 'h-[50px] w-[92px]', 'h-[110px] w-[62px]': 'h-[62px] w-[110px]', 'h-[103px] w-[58px]': 'h-[58px] w-[103px]',
  'h-16 w-9': 'h-9 w-16', 'h-[86px] w-12': 'h-12 w-[86px]', 'h-9 w-[22px]': 'h-[22px] w-9', 'h-8 w-5': 'h-5 w-8',
  'w-[60px]': 'w-[102px]', 'w-[72px]': 'w-[120px]', 'w-[68px]': 'w-[113px]', 'w-[52px]': 'w-[92px]', 'h-[92px] w-[52px]': 'h-[52px] w-[92px]',
};
/** The box of a picture: as written for a 9:16 film, on its side for a landscape one. */
function useBox(): (c: string) => string {
  const wide = useContext(WideFilm);
  return (c) => (wide ? SIDEWAYS[c] ?? c : c);
}
const useCardW = (): number => (useContext(WideFilm) ? 154 : CARD);

function PlaceCard({ film, scene, p, open, onToggle }: { film: string; scene: string; p: Place; open: boolean; onToggle: () => void }) {
  const box = useBox();
  const cardW = useCardW();
  const v = shownVersion(p);
  const n = parseShotId(p.id)?.n;
  if (!v) {
    return (
      <div data-place={p.id} data-unmade="" className="box-border flex flex-col gap-1.5 rounded-[10px] border border-dashed border-edge-strong p-1.5" style={{ width: cardW }}>
        <b className="h-4 font-mono text-[13px] font-medium text-ink">{p.id}</b>
        <span className="relative block">
          {p.board ? <Media path={p.board.src} t={p.board.t} w={160} missingLabel="" className={box('h-[142px] w-20') + ' rounded-md opacity-85'} />
            : <span className={'block ' + box('h-[142px] w-20') + ' rounded-md bg-tile'} />}
          {p.board && <span className="absolute inset-x-1 bottom-1 rounded-[5px] bg-[rgba(9,9,11,0.82)] py-0.5 text-center text-[10.5px] text-ink">{/\.(png|jpe?g|webp)$/i.test(p.board.src) ? 'Storyboard' : 'Previz'}</span>}
        </span>
        <span className="text-[12px] leading-tight text-sub">Not made yet</span>
      </div>
    );
  }
  const href = shotDetailsHref(film, v.src, v.i);
  return (
    <div data-place={p.id} className={cn('box-border flex flex-col gap-1.5 rounded-[10px] border bg-panel p-1.5 transition-colors duration-200', open ? 'border-ink' : 'border-edge')} style={{ width: cardW }}
      {...refData({ kind: 'shot', label: `${scene} · place ${p.id} · ${v.take} of ${v.gen}`, scene, ...(n ? { shot: n } : {}) })}>
      <b className="h-4 font-mono text-[13px] font-medium text-ink">{p.id}</b>
      <Link href={href} aria-label={`Place ${p.id}, ${v.take} of ${v.gen}: open its Shot details`} className="relative block rounded-md">
        <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={box('h-[142px] w-20') + ' rounded-md'} />
        {v.inFilm ? <span aria-label="In the film" title="In the film" className="absolute bottom-[5px] left-[5px]"><Dot /></span> : <NotUsed className="absolute bottom-1 left-1" />}
      </Link>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="text-[12px] text-ink-2">{v.take}</span>
        <span title={v.gen} className="truncate font-mono text-[10px] leading-tight text-sub">{v.gen}</span>
      </span>
      <Link href={href} className="flex h-[26px] items-center justify-between whitespace-nowrap rounded-[7px] border border-edge px-[7px] text-[11.5px] text-ink-3 no-underline transition-colors duration-150 hover:border-edge-strong hover:text-ink">
        Shot details<IconChevronRight size={10} />
      </Link>
      {p.versions.length > 1 && (
        <button type="button" aria-expanded={open} onClick={onToggle} data-versions-of={p.id}
          className={cn('flex h-[26px] cursor-pointer items-center justify-between whitespace-nowrap rounded-[7px] border px-[7px] text-[11.5px] text-ink transition-colors duration-200',
            open ? 'border-ink bg-raised' : 'border-edge-strong bg-raised/60 hover:border-sub')}>
          {p.versions.length} versions<Chev open={open} />
        </button>
      )}
    </div>
  );
}

function VersionCard({ film, v, n }: { film: string; v: Made; n: number }) {
  const box = useBox();
  return (
    <Link href={shotDetailsHref(film, v.src, v.i)} data-version={n}
      className={cn('flex gap-[11px] rounded-[10px] border bg-panel p-[7px] text-ink no-underline transition-colors duration-150 hover:bg-raised', v.inFilm ? 'border-ink' : 'border-edge hover:border-edge-strong')}>
      <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={box('h-24 w-[54px]') + ' flex-none rounded-md'} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <b className="text-[13px] font-semibold">Version {n}</b>
        <span className="truncate font-mono text-[10.5px] text-sub">{v.take.toLowerCase()} of {v.gen}</span>
        <span className="text-[12px] text-sub">{[when(v.made), secs(v)].filter(Boolean).join(' · ')}</span>
        <Status v={v} />
        {v.note && v.note !== 'named in the cut' && <span className="text-[11px] leading-snug text-mute">{v.note}</span>}
        <span className="mt-auto inline-flex items-center gap-1 text-[12px] text-ink-3">Shot details<IconChevronRight size={10} /></span>
      </span>
    </Link>
  );
}

function VersionsPanel({ film, scene, p, caret, onClose }: { film: string; scene: string; p: Place; caret: number; onClose: () => void }) {
  return (
    <div role="region" aria-label={`${scene} place ${p.id}, its versions`} data-versions-panel={p.id}
      className="relative mt-2.5 flex flex-col gap-2.5 rounded-xl border border-ink bg-well p-3">
      <span aria-hidden="true" className="absolute -top-[7px] size-3 rotate-45 border-l border-t border-ink bg-well transition-[left] duration-200 ease-out motion-reduce:transition-none" style={{ left: caret }} />
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <b className="text-[13.5px] font-semibold">Place <span className="font-mono">{p.id}</span> · {p.versions.length} versions</b>
        <span className="text-[12px] text-sub">every time this shot was made, newest first · tap one to open its Shot details</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="h-[26px] cursor-pointer rounded-[7px] border border-edge bg-transparent px-[9px] text-[12px] text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink">Close</button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-2">
        {p.versions.map((v, k) => <VersionCard key={v.key} film={film} v={v} n={p.versions.length - k} />)}
      </div>
    </div>
  );
}

/** A version's places as cards, one of them unfolded to its versions. */
function PlaceRow({ film, scene, ver, openId, onOpen }: { film: string; scene: string; ver: SceneVersion; openId?: string; onOpen: (id?: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [shown, setShown] = useState<Place | undefined>(undefined);
  const open = ver.places.find((p) => p.id === openId);
  // the panel keeps the place it showed while it folds away
  if (open && open !== shown) setShown(open);
  useLayoutEffect(() => {
    const el = open && row.current?.querySelector<HTMLElement>(`[data-place="${CSS.escape(open.id)}"]`);
    if (el) setCaret(el.offsetLeft + el.offsetWidth / 2 - 6);
  }, [open]);
  return (
    <>
      <div ref={row} className="relative flex flex-wrap gap-2">
        {ver.places.map((p) => <PlaceCard key={p.id} film={film} scene={scene} p={p} open={p.id === openId} onToggle={() => onOpen(p.id === openId ? undefined : p.id)} />)}
      </div>
      <Reveal open={!!open}>
        {shown && <VersionsPanel film={film} scene={scene} p={open ?? shown} caret={caret} onClose={() => onOpen(undefined)} />}
      </Reveal>
    </>
  );
}

/** A cut a take made that its prompt did not ask for: a quiet strip under the scene, as drawn. */
function ExtraStrip({ film, scene, x }: { film: string; scene: string; x: SceneShots['extras'][number] }) {
  const box = useBox();
  const between = x.after && x.before ? `between places ${x.after} and ${x.before}` : x.after ? `after place ${x.after}` : x.before ? `before place ${x.before}` : '';
  return (
    <Link href={shotDetailsHref(film, x.v.src, x.v.i)} data-extra-cut className="mt-2 flex items-center gap-2.5 rounded-[9px] border border-dashed border-edge-strong py-[5px] pl-[5px] pr-2.5 text-[12px] text-sub no-underline transition-colors duration-150 hover:border-sub">
      <Media path={x.v.src} t={midT(x.v)} w={160} missingLabel="" className={box('h-[39px] w-[22px]') + ' flex-none rounded-[3px] opacity-70'} />
      <span className="whitespace-nowrap rounded border border-faint px-[5px] text-[10px] font-medium text-ink-3">Not asked for</span>
      <span>{x.v.take} of {x.v.gen === scene ? scene : x.v.gen} also cut once {between} ({(x.v.to - x.v.from).toFixed(1)} s), which its prompt did not ask for. It is not a place.</span>
    </Link>
  );
}

/** Shots whose place is not known, by take, with why: never placed by a guess. */
function OtherTakes({ film, other, phone }: { film: string; other: Made[]; phone?: boolean }) {
  const box = useBox();
  const byTake = new Map<string, Made[]>();
  for (const v of other) byTake.set(takeFolder(v.src) + v.gen, [...(byTake.get(takeFolder(v.src) + v.gen) ?? []), v]);
  return (
    <div data-other-takes className="mt-2.5 flex flex-col gap-2 rounded-[10px] border border-edge bg-well px-3 py-2.5">
      <span className="text-[13px] text-ink">Other takes of this scene <span className="text-[12px] text-sub">· where these shots go in the scene is not known</span></span>
      {[...byTake.values()].map((vs) => (
        <div key={vs[0].key} className="flex flex-col gap-1.5 border-t border-line pt-2">
          <span className="text-[12px] text-sub"><span className="text-ink-2">{vs[0].take}</span> <span className="font-mono text-[10.5px]">{vs[0].gen}</span>{vs[0].note ? ` · ${vs[0].note}` : ''}</span>
          <div className="flex flex-wrap gap-2">
            {[...vs].sort((a, b) => a.from - b.from).map((v) => (
              <Link key={v.key} href={shotDetailsHref(film, v.src, v.i)} title={`Shot ${v.i} of ${v.take.toLowerCase()} of ${v.gen}: open its Shot details`}
                className={cn('box-border flex flex-col gap-1 rounded-lg border bg-panel p-1 text-ink no-underline transition-colors duration-150 hover:bg-raised', v.inFilm ? 'border-mute' : 'border-edge', box(phone ? 'w-[60px]' : 'w-[72px]'))}>
                <span className="font-mono text-[11px] text-sub">shot {v.i}</span>
                <span className="relative block">
                  <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={cn('rounded-[5px]', box(phone ? 'h-[92px] w-[50px]' : 'h-[110px] w-[62px]'))} />
                  {v.inFilm && <span className="absolute bottom-1 left-1"><Dot size={8} /></span>}
                </span>
                <span className="text-[10px] text-sub">{secs(v)}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const versionName = (v: SceneVersion) => `Version ${v.n} · ${plural(v.places.length, 'shot')}`;

/** The scene's earlier versions, folded under it. */
function Earlier({ film, scene, older, open, onToggle }: { film: string; scene: string; older: SceneVersion[]; open: boolean; onToggle: () => void }) {
  const box = useBox();
  const summary = older.map((o) => { const c = versionCounts(o); return `${versionName(o)}, ${c.inFilm ? `${c.inFilm} in the film` : 'none in the film'}`; }).join(' · ');
  return (
    <div id={`earlier-${scene}`} data-earlier={scene} className="mt-2.5 rounded-[10px] border border-edge bg-well px-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent py-2.5 text-left text-ink-3">
        <IconChevronRight size={11} className={cn('flex-none transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} />
        <span className="text-[13px] text-ink">Earlier versions of this scene</span>
        <span key={open ? 'o' : 'c'} className="min-w-0 truncate text-[12px] text-sub duration-200 animate-in fade-in-0 motion-reduce:animate-none">{open ? 'tap a shot to open its Shot details' : summary}</span>
      </button>
      <Reveal open={open}>
        <div className="pb-1.5">
          {older.map((o) => {
            const c = versionCounts(o);
            return (
              <div key={o.n} data-earlier-version={o.n} className="flex flex-col gap-2 border-t border-line py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="text-[13px] font-medium text-ink">{versionName(o)}</span>
                  <span className="text-[12px] text-sub">{[o.written ? `made ${day(o.written)}` : '', `${plural(c.made, 'shot')} made`, c.inFilm ? `${c.inFilm} in the film` : 'none in the film'].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {o.places.map((p) => {
                    const v = shownVersion(p);
                    if (!v) return (
                      <div key={p.id} className={cn('flex flex-col gap-[3px]', box('w-[52px]'))}><b className="font-mono text-[11.5px] font-medium">{p.id}</b><span className={cn('box-border block rounded-[5px] border border-dashed border-edge-strong', box('h-[92px] w-[52px]'))} /><span className="text-[10px] text-sub">not made</span></div>
                    );
                    return (
                      <Link key={p.id} href={shotDetailsHref(film, v.src, v.i)} title={`${v.take} of ${v.gen}: open its Shot details`}
                        className={cn('box-border flex flex-col gap-1 rounded-lg border bg-panel p-1', box('w-[68px]'), ' text-ink no-underline transition-colors duration-150 hover:bg-raised', v.inFilm ? 'border-mute' : 'border-edge')}>
                        <span className="flex items-center justify-between gap-1"><b className="font-mono text-[11.5px] font-medium">{p.id}</b>{p.versions.length > 1 && <span className="truncate text-[9px] text-sub">{p.versions.length} versions</span>}</span>
                        <span className="relative block">
                          <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={box('h-[103px] w-[58px]') + ' rounded-[5px]'} />
                          {v.inFilm && <span className="absolute bottom-1 left-1"><Dot size={8} /></span>}
                        </span>
                        <span className="text-[10.5px] text-ink-2">{v.take}</span>
                        <span className="truncate font-mono text-[9.5px] text-sub">{v.gen}</span>
                        <span className={cn('text-[10px]', v.inFilm ? 'text-ink' : 'text-sub')}>{v.inFilm ? 'in the film' : 'not in the film'}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}

function sceneMeta(s: SceneShots): React.ReactNode {
  const cur = s.versions[0];
  const c = versionCounts(cur);
  const label = s.versions.length > 1 ? `Version ${cur.n}` : '';
  if (cur.unmade) {
    const fv = s.versions.find((v) => v.n === s.filmVersion);
    return <>{plural(c.places, 'place')} · not made yet{label ? ` · ${label}${cur.written ? `, planned ${day(cur.written)}` : ''}` : ''}{fv && <> · <span className="text-ink">in the film: version {fv.n} ({versionCounts(fv).inFilm} of its shots), until version {cur.n} has takes</span></>}</>;
  }
  return [plural(c.places, 'place'), `${c.made} made`, `${c.inFilm} in the film`, label].filter(Boolean).join(' · ');
}

function SceneSection({ film, s, openPlace, onOpenPlace }: { film: string; s: SceneShots; openPlace?: string; onOpenPlace: (scene: string, id?: string) => void }) {
  const [earlier, setEarlier] = useState(false);
  const cur = s.versions[0];
  const older = s.versions.slice(1);
  return (
    <section id={`scene-${s.id}`} data-scene-section={s.id} aria-label={`${s.id} · ${s.title}`} className="mb-6 scroll-mt-[72px]">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 border-b border-line pb-2">
        <h2 className="m-0 text-[15px] font-semibold">{s.id} · {s.title}</h2>
        <span className="text-[12px] text-sub">{sceneMeta(s)}{cur.unmade && older.length > 0 && <> · <button type="button" onClick={() => setEarlier(true)} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink">show it</button></>}</span>
      </div>
      <PlaceRow film={film} scene={s.id} ver={cur} openId={openPlace} onOpen={(id) => onOpenPlace(s.id, id)} />
      {s.extras.map((x) => <ExtraStrip key={x.v.key} film={film} scene={s.id} x={x} />)}
      {s.other.length > 0 && <OtherTakes film={film} other={s.other} />}
      {older.length > 0 && <Earlier film={film} scene={s.id} older={older} open={earlier} onToggle={() => setEarlier((x) => !x)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------- phone

function PhoneRow({ p, onOpen }: { p: Place; onOpen: () => void }) {
  const box = useBox();
  const v = shownVersion(p);
  if (!v) {
    return (
      <div data-place={p.id} data-unmade="" className="flex items-center gap-3 rounded-[14px] border border-dashed border-edge-strong px-3 py-2">
        <b className="w-6 flex-none text-center font-mono text-[15px] font-medium">{p.id}</b>
        {p.board ? <Media path={p.board.src} t={p.board.t} w={160} missingLabel="" className={box('h-16 w-9') + ' flex-none rounded-md opacity-85'} /> : <span className={box('h-16 w-9') + ' flex-none rounded-md bg-tile'} />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[14px] text-sub">Not made yet</span><span className="text-[12px] text-mute">{p.board ? (/\.(png|jpe?g|webp)$/i.test(p.board.src) ? 'storyboard panel' : 'previz frame') : 'no panel yet'}</span></span>
      </div>
    );
  }
  return (
    <button type="button" data-place={p.id} onClick={onOpen} aria-label={`Place ${p.id}, ${v.take} of ${v.gen}, ${v.inFilm ? 'in the film' : 'not in the film'}: its versions and Shot details`}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-edge bg-panel px-3 py-2 text-left text-ink transition-colors duration-150 active:bg-raised">
      <b className="w-6 flex-none text-center font-mono text-[15px] font-medium">{p.id}</b>
      <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={box('h-16 w-9') + ' flex-none rounded-md'} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{v.take}</span>
        <span className="truncate font-mono text-[11px] text-sub">{v.gen}</span>
        <Status v={v} />
      </span>
      <span className="flex flex-none items-center gap-1 text-[12.5px] text-ink-3">{plural(p.versions.length, 'version')}<IconChevronRight size={12} /></span>
    </button>
  );
}

function PhonePlace({ film, s, p }: { film: string; s: SceneShots; p: Place }) {
  const box = useBox();
  // it opens at its top, whatever the list was scrolled to
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (let el = top.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);
  return (
    <div ref={top} data-phone-place={`${s.id}:${p.id}`} className="flex flex-col gap-3 px-4 pb-24 pt-3 duration-200 animate-in fade-in-0 slide-in-from-right-4 motion-reduce:animate-none">
      <p className="m-0 text-[13px] leading-normal text-sub">{s.id} · {s.title}. Every time place {p.id} was made, newest first. Tap one to open its Shot details.</p>
      {p.versions.map((v, k) => (
        <Link key={v.key} href={shotDetailsHref(film, v.src, v.i)} data-version={p.versions.length - k}
          className={cn('flex items-center gap-3 rounded-[14px] border bg-panel p-2 text-ink no-underline', v.inFilm ? 'border-ink' : 'border-edge')}>
          <Media path={v.src} t={midT(v)} w={160} missingLabel="" className={box('h-[86px] w-12') + ' flex-none rounded-md'} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="text-[15px] font-semibold">Version {p.versions.length - k}</b>
            <span className="truncate font-mono text-[11px] text-sub">{v.take.toLowerCase()} of {v.gen}</span>
            <span className="text-[12px] text-sub">{[when(v.made), secs(v)].filter(Boolean).join(' · ')}</span>
            <Status v={v} />
          </span>
          <span className="flex flex-none items-center gap-1 text-[12.5px] text-ink-3">Shot details<IconChevronRight size={12} /></span>
        </Link>
      ))}
    </div>
  );
}

function PhoneScene({ film, s, onPlace }: { film: string; s: SceneShots; onPlace: (id: string) => void }) {
  const [earlier, setEarlier] = useState(false);
  const cur = s.versions[0];
  const older = s.versions.slice(1);
  return (
    <section id={`scene-${s.id}`} data-scene-section={s.id} aria-label={`${s.id} · ${s.title}`} className="flex scroll-mt-3 flex-col gap-2">
      <div className="flex flex-col gap-0.5 border-b border-line pb-2">
        <h2 className="m-0 text-[16px] font-semibold">{s.id} · {s.title}</h2>
        <span className="text-[12.5px] text-sub">{sceneMeta(s)}</span>
      </div>
      {cur.places.map((p) => <PhoneRow key={p.id} p={p} onOpen={() => onPlace(p.id)} />)}
      {s.extras.map((x) => <ExtraStrip key={x.v.key} film={film} scene={s.id} x={x} />)}
      {s.other.length > 0 && <OtherTakes film={film} other={s.other} phone />}
      {older.length > 0 && <Earlier film={film} scene={s.id} older={older} open={earlier} onToggle={() => setEarlier((x) => !x)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------- the page

function SceneChips({ scenes, active, phone, onGo }: { scenes: SceneShots[]; active?: string; phone?: boolean; onGo: (id: string) => void }) {
  return (
    <nav aria-label="Scenes in story order" className={cn('flex items-center gap-1', phone ? '-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]' : 'flex-wrap')}>
      {!phone && <span className="lbl mr-1.5">Story order</span>}
      {scenes.map((s) => (
        <button key={s.id} type="button" aria-current={s.id === active ? 'true' : undefined} onClick={() => onGo(s.id)} data-scene-chip={s.id}
          className={cn('inline-flex flex-none cursor-pointer items-center whitespace-nowrap rounded-[7px] border transition-colors duration-200',
            phone ? 'h-11 px-3.5 text-[13px]' : 'h-7 px-[9px] text-[12px]',
            s.id === active ? 'border-ink bg-raised text-ink' : 'border-edge bg-transparent text-ink-3 hover:border-edge-strong hover:text-ink')}>
          {phone && s.id !== active ? s.id : `${s.id} · ${s.title}`}
        </button>
      ))}
    </nav>
  );
}

export function ShotsPage() {
  const { state } = useFilmPage();
  return <WideFilm.Provider value={isWide(state?.film.aspect)}><ShotsPageIn /></WideFilm.Provider>;
}

function ShotsPageIn() {
  const { film, state, error, base } = useFilmPage();
  const shots = useShots(film);
  const phone = usePhone();
  const router = useRouter();
  const params = useSearchParams();
  // where every shot stands: the one rule (places.ts), the same call Shot details makes
  const { list, shotList: extra } = useShotPlaces(film, state, shots.takes, shots.all);
  const titles = useMemo(() => new Map((state?.scenes ?? []).map((s) => [s.id, s.title])), [state]);
  const counts = !list ? '' : list.made ? `${plural(list.scenes.length, 'scene')} planned · ${list.made} made · ${list.inFilm} in the film` : `${plural(list.scenes.length, 'scene')} planned · nothing made yet`;
  usePage(list ? `Shots · ${counts}` : undefined, 'Ask about a shot, or tell Alma what to remake…', ['Which shots are not in the film yet?'], ['What was redone, and why?']);

  // one place's versions open at a time (desktop); on the phone a place is its own view (?place=S7:4), so Back returns
  const [open, setOpen] = useState<{ scene: string; id: string }>();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(undefined); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const placeParam = params.get('place');
  const [pScene, pId] = placeParam ? placeParam.split(':') : [];
  const phoneScene = phone ? list?.scenes.find((s) => s.id === pScene) : undefined;
  const phonePlace = phoneScene?.versions[0].places.find((p) => p.id === pId);

  // the scene chip that is lit follows the scroll
  const [active, setActive] = useState<string>();
  const ids = list?.scenes.map((s) => s.id).join(',') ?? '';
  useEffect(() => {
    if (!ids || phonePlace) return;
    const els = ids.split(',').map((id) => document.getElementById(`scene-${id}`)).filter((x): x is HTMLElement => !!x);
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((es) => {
      for (const e of es) seen.set(e.target.id.slice(6), e.isIntersecting ? e.boundingClientRect.top : Infinity);
      const top = [...seen].filter(([, t]) => t !== Infinity).sort((a, b) => a[1] - b[1])[0];
      if (top) setActive(top[0]);
    }, { rootMargin: '-80px 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids, phonePlace]);
  const go = useCallback((id: string) => {
    setActive(id);
    document.getElementById(`scene-${id}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  if (!state) return <Loading error={error} />;
  const loading = !list || !shots.loaded;
  // a place on the phone is a page of its own: "Back to Shots" returns to the list where it was
  if (phonePlace && phoneScene) {
    return (
      <>
        <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Shots', href: `${base}/shots` }, { label: `${phoneScene.id} · place ${phonePlace.id}` }]}
          back={{ label: 'Back to Shots', href: `${base}/shots`, soft: true }} />
        <PhonePlace film={film} s={phoneScene} p={phonePlace} />
      </>
    );
  }
  const header = <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Shots' }]} back={{ label: 'Back to the film', href: base, soft: true }} />;
  const pv = extra.data?.previz;
  return (
    <>
      {header}
      <div data-shots-page className="flex w-full max-w-[1080px] flex-col gap-0 px-6 pb-12 pt-6 max-[760px]:px-4 max-[760px]:pt-4">
        <div className="flex flex-col gap-3 border-b border-line pb-4">
          {phone ? (
            <>
              <p className="m-0 text-[13px] leading-normal text-sub">{counts ? `${counts}. ` : ''}Scenes in story order; tap a shot for its versions and Shot details.</p>
              <StepIntro step="shotlist" />
              {pv && <PrevizTile pv={pv} titles={titles} phone />}
            </>
          ) : (
            <div className="flex items-start gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">Shots</h1>
                <p className="m-0 max-w-[680px] text-[13px] leading-normal text-sub">Each scene in story order, each place in the scene in order. A place keeps every version made of it, newest first. Tap a picture to open its Shot details.</p>
                <StepIntro step="shotlist" />
              </div>
              <div className="flex flex-none flex-col items-end gap-2">
                {pv && <PrevizTile pv={pv} titles={titles} />}
                {counts && <span data-shots-counts className="whitespace-nowrap text-[12px] text-sub duration-200 animate-in fade-in-0">{counts}</span>}
              </div>
            </div>
          )}
          {list && <SceneChips scenes={list.scenes} active={active ?? list.scenes[0]?.id} phone={phone} onGo={go} />}
          <Key />
        </div>
        {loading ? (
          <p className="m-0 py-6 text-[13px] text-sub duration-200 animate-in fade-in-0">{extra.error ? `The shots could not be read: ${extra.error}` : shots.waiting ? `Cutting ${plural(shots.waiting, 'take')} into their shots…` : 'Reading the shots…'}</p>
        ) : !list.scenes.length ? (
          <p data-no-scenes className="m-0 py-6 text-[13px] text-sub">No scenes yet. They come with the locked script.</p>
        ) : (
          <div className={cn('flex flex-col pt-4 duration-200 animate-in fade-in-0 motion-reduce:animate-none', phone && 'gap-5 pb-20')}>
            {list.scenes.map((s) => phone
              ? <PhoneScene key={s.id} film={film} s={s} onPlace={(id) => router.push(`${base}/shots?place=${encodeURIComponent(`${s.id}:${id}`)}`)} />
              : <SceneSection key={s.id} film={film} s={s} openPlace={open?.scene === s.id ? open.id : undefined} onOpenPlace={(scene, id) => setOpen(id ? { scene, id } : undefined)} />)}
          </div>
        )}
      </div>
    </>
  );
}
