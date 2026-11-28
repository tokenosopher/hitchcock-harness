'use client';
// New takes: when takes come back, one place to go through them and see what is up with each. One place for every take that came back and is not looked at
// or decided yet, newest first: a list on the left, the take in focus on the right, played beside what the cut has at
// the place it stands for. Step with ← → or J K, Enter plays both, U uses it in the film, L keeps it for later, X
// rejects it. Reached from the film page's "5 new takes" and the Edit page's Takes tab.
//
// Which takes, and what a Use changes: inbox.ts. What is known of each: landed.ts (GET …/landed). Decisions:
// harness/takes-decided.json (GET/POST …/decided), the same on every device. Played here, a take is looked at
// (seenTakes.ts): its "new" tag clears everywhere. "Use in the film" is the Takes view's: every shot of the take at its
// place, one step of the cut, one Undo; Alma is told by a chip in her box ("Used FIX-tide-S1 take 2 in the film"), as
// is a reject; keeping it for later tells her nothing. On the phone (the Edit page is view-only on touch) the Use is
// asked of Alma instead: the box opens with it, the user sends.
import { StepIntro } from '@/components/intro/StepIntro';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Timeline } from '@/server/types';
import type { ShotList } from '@/server/films/read/shotlist';
import { useFilm } from '@/components/data/film';
import { usePage, useUIActions } from '@/components/data/ui';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { IconChevronLeft, IconChevronRight } from '@/components/shell/icons';
import { Media } from '@/components/media/Media';
import { useJson } from '@/components/pages/postCommon';
import { useShots } from '@/components/edit/ShotViews';
import { otherKey, pickupView } from '@/components/edit/pickupRows';
import { shotsOf, shotTimeline, takeNames, type TakeShots } from '@/components/edit/shots';
import { useBeginSeen, useSeenTakes } from '@/components/edit/seenTakes';
import { useFilmCut } from '@/components/shots/useShotPlaces';
import { takeFolder } from '@/components/shots/places';
import { shotDetailsHref } from '@/components/lib/shotHref';
import { cssAspect, isWide } from '@/lib/frame';
import { cn } from '@/lib/utils';
import { cutSrcs, deltaWords, inboxRows, inFilmOf, landedWords, placesLine, replaceOf, takeTitle, type InboxRow, type ShotStand, type UseReading } from './inbox';
import { modelChip, verdictOf, VERDICT_WORDS, type LandedMap, type LandedTake, type Verdict } from './landed';
import type { Decision } from './decisions';
import { useDecided } from './useDecided';
import { PairPlayer, type PairHandle, type Seg } from './PairPlayer';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A frame taller than wide ("9 / 16"): its thumbnail narrower, so a row stays short. */
const tallThumb = (ratio: string) => { const [w, h] = ratio.split('/').map((x) => Number(x.trim())); return w < h; };
const secs = (s?: number) => (s === undefined ? '' : `${(Math.round(s * 10) / 10).toFixed(1)} s`);

function usePhone(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(max-width: 760px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(max-width: 760px)').matches,
    () => false,
  );
}
/** A touch screen: the Edit page is view-only there, so the cut is not changed from here either. */
function useTouch(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(hover: none)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(hover: none)').matches,
    () => false,
  );
}
const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el instanceof HTMLInputElement && el.type === 'range');

interface CutWorking { working?: { rev: number; fps: number; width: number; height: number; tracks: Timeline['tracks']; markers?: Timeline['markers']; version?: string; at: string } }
const tlOfWorking = (w: NonNullable<CutWorking['working']>): Timeline => ({ version: `w${w.rev}`, fps: w.fps as Timeline['fps'], width: w.width, height: w.height, at: w.at, tracks: w.tracks, markers: w.markers ?? [] });

// ---------------------------------------------------------------------------------------------------- small parts

const VERDICT_TONE: Record<Verdict, string> = { use: 'border-[#14532d] text-ok', fix: 'border-[#78350f] text-warn', reject: 'border-[#7f1d1d] text-bad', watch: 'border-edge-strong text-ink-3' };
function Chip({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-flex h-[20px] max-w-full items-center gap-1 truncate whitespace-nowrap rounded-[5px] border border-edge px-1.5 text-[11px] leading-none text-ink-3', className)}>{children}</span>;
}
function VerdictChip({ l }: { l?: LandedTake }) {
  const v = verdictOf(l);
  if (!v) return null;
  return <Chip data-verdict={v.v} className={VERDICT_TONE[v.v]} title={v.words || undefined}>{VERDICT_WORDS[v.v]}</Chip>;
}
function StatusChip({ row, film }: { row: InboxRow; film?: 'in' | 'part' }) {
  const d = row.decided?.d;
  if (d === 'used') return <Chip className="border-ink text-ink">Used</Chip>;
  if (d === 'rejected') return <Chip className="border-dashed text-sub">Rejected</Chip>;
  if (d === 'later') return <Chip className="border-dashed border-edge-strong text-ink-3">Kept for later</Chip>;
  if (film) return <Chip className="text-ink">{film === 'in' ? 'In the film' : 'Partly in the film'}</Chip>;
  return null;
}
function Section({ title, children, right, className }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-panel p-3.5', className)}>
      <div className="flex items-center justify-between gap-2"><h3 className="lbl m-0 text-sub">{title}</h3>{right}</div>
      {children}
    </section>
  );
}
const Quiet = ({ children }: { children: React.ReactNode }) => <p className="m-0 text-[12.5px] leading-normal text-mute">{children}</p>;
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-current px-1 font-sans text-[10.5px] font-normal opacity-50 max-[760px]:hidden">{children}</kbd>;
}

// ---------------------------------------------------------------------------------------------------- the list

function Row({ row, on, title, line, landed, film, ratio, onPick }: { row: InboxRow; on: boolean; title: string; line: string; landed?: LandedTake; film?: 'in' | 'part'; ratio: string; onPick: () => void }) {
  const t = row.take;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (on) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [on]);
  const model = modelChip(landed?.spend);
  const gone = row.decided && row.decided.d !== 'later';
  return (
    <button ref={ref} type="button" onClick={onPick} aria-current={on ? 'true' : undefined} data-inbox-row={t.src} data-decided={row.decided?.d}
      className={cn('group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-2 text-left transition-[background-color,border-color,opacity] duration-200 max-[760px]:p-2.5',
        on ? 'border-ink bg-raised' : 'border-transparent hover:border-edge hover:bg-panel', gone && 'opacity-50')}>
      <span className="relative flex-none overflow-hidden rounded-md bg-well" style={{ width: tallThumb(ratio) ? 44 : 84, aspectRatio: ratio }}>
        <Media path={t.src} t={Math.max(0.1, (t.seconds ?? 2) / 2)} w={160} missingLabel="" className="size-full" />
        {row.isNew && <span data-new aria-label="new" className="absolute right-1 top-1 size-2 rounded-full bg-ink shadow-[0_0_0_2px_rgba(9,9,11,0.85)]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[13.5px] font-semibold text-ink">{line}</b>
          <span className="flex-none text-[11px] tabular-nums text-mute">{landedWords(t.made)}</span>
        </span>
        <span className="truncate font-mono text-[11px] text-sub">{title}</span>
        <span className="flex flex-wrap gap-1">
          {model && <Chip data-model>{model}</Chip>}
          <VerdictChip l={landed} />
          <StatusChip row={row} film={film} />
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------- what is known

function Asked({ l }: { l?: LandedTake }) {
  if (!l?.card && !l?.readme) return <Section title="What was asked"><Quiet>No card and no README for this take.</Quiet></Section>;
  const words = l.card?.text.filter((x) => !/^checks running/i.test(x)) ?? [];
  return (
    <Section title="What was asked">
      {l.card && <p data-asked-card className="m-0 text-[13px] font-medium leading-snug text-ink">{l.card.title}</p>}
      {words.map((p, i) => <p key={i} className="m-0 whitespace-pre-wrap text-[12.5px] leading-normal text-ink-3">{p.replace(/\*\*/g, '')}</p>)}
      {l.readme && (
        <div data-asked-readme className="flex flex-col gap-1 border-t border-line pt-2">
          {l.readme.title && <p className="m-0 text-[12px] font-medium text-ink-3">{l.readme.title}</p>}
          {l.readme.lines.slice(0, 4).map((x, i) => <p key={i} className="m-0 text-[12px] leading-normal text-sub [overflow-wrap:anywhere]">{x}</p>)}
          <span className="font-mono text-[10.5px] text-mute">README.md</span>
        </div>
      )}
    </Section>
  );
}

function Check({ l }: { l?: LandedTake }) {
  const a = l?.alma, c = l?.check, n = l?.note;
  const v = verdictOf(l);
  if (!a && !c && !n && !v) return <Section title="Alma's check"><Quiet>No check of Alma&apos;s yet: no findings record, no findings.md, no check.json.</Quiet></Section>;
  return (
    <Section title="Alma's check" right={v ? <Chip className={VERDICT_TONE[v.v]}>{VERDICT_WORDS[v.v]}</Chip> : undefined}>
      {a?.summary && <p data-alma-summary className="m-0 text-[13px] leading-snug text-ink">{a.summary}</p>}
      {!a && n?.verdict && <p className="m-0 text-[13px] leading-snug text-ink">{n.verdict}</p>}
      {!a && !n && v?.from === 'card' && v.words && <p className="m-0 text-[13px] leading-snug text-ink">{v.words}</p>}
      {a && a.lines.length > 0 && (
        <ul data-alma-lines className="m-0 flex list-none flex-col gap-1.5 p-0">
          {a.lines.map((x, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
              <span aria-hidden="true" className={cn('mt-[5px] size-1.5 flex-none rounded-full', x.ok === false ? 'bg-bad' : x.ok ? 'bg-ok' : 'bg-mute')} />
              <span className="min-w-0">
                <span className="text-ink-3">“{x.said}”</span>
                {x.heard !== undefined && x.heard !== x.said && <span className="block text-sub">heard “{x.heard}”</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!a && c && (
        <div data-check className="flex flex-col gap-1 text-[12.5px] leading-snug">
          {c.heard && <span className="text-ink-3">Heard “{c.heard}”</span>}
          {c.wordsMatch !== undefined && <span className={c.wordsMatch ? 'text-ok' : 'text-warn'}>{c.wordsMatch ? 'The words match the line.' : 'The words do not match the line.'}</span>}
          {c.missing.length > 0 && <span className="text-sub">Missing: {c.missing.map((m) => `“${m}”`).join(', ')}</span>}
          {c.extra.length > 0 && <span className="text-sub">Extra: {c.extra.map((m) => `“${m}”`).join(', ')}</span>}
          <span className="font-mono text-[10.5px] text-mute">check.json</span>
        </div>
      )}
      {(a?.findings.length || (!a && n?.points.length)) ? (
        <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[12px] leading-normal text-sub marker:text-mute">
          {(a?.findings ?? n?.points ?? []).slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : null}
      <span className="font-mono text-[10.5px] text-mute">{a ? `${l!.gen}-findings.json` : n ? 'findings.md' : c ? '' : v?.from === 'card' ? 'the card' : ''}</span>
    </Section>
  );
}

function Model({ l, t }: { l?: LandedTake; t: TakeShots }) {
  const s = l?.spend;
  const rows: [string, string][] = [];
  if (s?.model) rows.push(['Model', s.model]);
  if (s?.res) rows.push(['Resolution', s.res]);
  if (s) rows.push(['Seedance draft', s.draft ? 'yes' : 'no']);
  rows.push(['Length', secs(t.seconds ?? s?.seconds) || '—']);
  if (s?.credits !== undefined) rows.push(['Credits', `${s.credits}${s.costText && /not charged|failed|refused/i.test(s.costText) ? ' (not charged)' : ''}`]);
  if (l?.job) rows.push(['Job', l.job.slice(0, 8)]);
  return (
    <Section title="Model and cost">
      <dl data-model-kv className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-sub">{k}</dt><dd className="m-0 text-ink-3">{v}</dd></div>)}
      </dl>
      {!s && <Quiet>No spend.md row names this take&apos;s job{l?.job ? '' : ' (it has no job file)'}.</Quiet>}
      {s && <span className="font-mono text-[10.5px] text-mute">{s.from === 'spend.md' ? 'spend.md' : 'the card'}</span>}
    </Section>
  );
}

function Replace({ r, fps, film, stands }: { r?: UseReading; fps: number; film?: 'in' | 'part'; stands: ShotStand[] }) {
  const notes = stands.flatMap((s) => [s.conflict, s.note].filter((x): x is string => !!x));
  return (
    <Section title="What it would replace">
      {film === 'in' ? <p className="m-0 text-[12.5px] text-ink">It is in the film already.</p>
        : !r ? <Quiet>Reading the cut…</Quiet>
        : !r.after ? <Quiet>Nothing would change: there is no place in the cut it is known to stand for.</Quiet>
        : (
          <div data-replace className="flex flex-col gap-1.5 text-[12.5px] leading-snug">
            {r.out.length ? r.out.map((p) => (
              <span key={p.id} className="flex items-baseline gap-2"><span className="w-12 flex-none text-sub">Out</span><span className="min-w-0 text-ink-3 [overflow-wrap:anywhere]">{p.label} · {secs(p.frames / fps)}</span></span>
            )) : <span className="flex items-baseline gap-2"><span className="w-12 flex-none text-sub">Out</span><span className="text-mute">nothing: it is added</span></span>}
            {r.in.map((p) => (
              <span key={p.id} className="flex items-baseline gap-2"><span className="w-12 flex-none text-sub">In</span><span className="min-w-0 text-ink [overflow-wrap:anywhere]">{p.label} · {secs(p.frames / fps)}</span></span>
            ))}
            <span data-after className="text-sub">After: the film is {deltaWords(r.delta, fps)}. One step of the cut; Undo takes it back.</span>
            {r.skipped.length > 0 && <span className="text-warn">{plural(r.skipped.length, 'shot')} of it stand nowhere known and stay out.</span>}
          </div>
        )}
      {notes.length > 0 && <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[11.5px] leading-normal text-mute">{notes.slice(0, 3).map((x, i) => <li key={i} className={/says|disagree/i.test(x) ? 'text-warn' : undefined}>{x}</li>)}</ul>}
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------- the page

export function TakesInboxPage() {
  const { film } = useParams<{ film: string }>();
  const { state, error } = useFilm();
  const ui = useUIActions();
  const router = useRouter();
  const params = useSearchParams();
  const phone = usePhone();
  const touch = useTouch();
  const base = `/films/${film}`;

  const shots = useShots(film);
  const { data: shotList } = useJson<ShotList>(state ? `/api/films/${encodeURIComponent(film)}/shotlist` : undefined, state?.updatedAt);
  const fc = useFilmCut(film, state?.updatedAt);
  const { data: landedJ } = useJson<{ takes: LandedMap }>(state ? `/api/films/${encodeURIComponent(film)}/landed` : undefined, state?.updatedAt);
  const landed = landedJ?.takes;
  const seenT = useSeenTakes(film);
  const { looked, add: addSeen } = seenT;
  const { decided, ready: decidedReady, decide } = useDecided(film);

  // the takes as the Takes view numbers them: a pick-up's shots by the places they stand for (places.ts, the one rule)
  const pv = useMemo(() => pickupView({ takes: shots.all, scenes: state?.scenes ?? [], gens: shotList?.gens, checks: shotList?.checks, cut: fc.tl }), [shots.all, state?.scenes, shotList, fc.tl]);
  const tl = useMemo(() => (fc.tl ? shotTimeline(fc.tl, pv.by) : undefined), [fc.tl, pv.by]);
  useBeginSeen(seenT, tl, { takes: pv.takes, by: pv.by, waiting: shots.waiting, loaded: shots.loaded });
  const names = useMemo(() => takeNames(pv.takes, fc.tl), [pv.takes, fc.tl]);
  const order = useMemo(() => state?.scenes.map((s) => s.id), [state?.scenes]);
  const fps = tl?.fps ?? 24;

  // the list: what it held when the page opened stays while the page is open, looked at or not (`hold`)
  const all = params.get('all') === '1';
  const [hold, setHold] = useState<Set<string>>();
  const ready = looked.ready && decidedReady && shots.loaded && fc.read;
  const inCut = useMemo(() => cutSrcs(fc.tl), [fc.tl]);
  useEffect(() => {
    if (!ready || hold) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list as the page first had it, once
    setHold(new Set(inboxRows(pv.takes, looked, decided, { inCut }).map((r) => r.take.src)));
  }, [ready, hold, pv.takes, looked, decided, inCut]);
  const rows = useMemo(() => (ready ? inboxRows(pv.takes, looked, decided, { all, hold, inCut }) : []), [ready, pv.takes, looked, decided, all, hold, inCut]);
  const toLook = useMemo(() => (ready ? inboxRows(pv.takes, looked, decided, { hold, inCut }).length : 0), [ready, pv.takes, looked, decided, hold, inCut]);
  const cameBackN = useMemo(() => (ready ? inboxRows(pv.takes, looked, decided, { all: true }).length : 0), [ready, pv.takes, looked, decided]);

  // where each shot of a take stands, by its place in the take
  const standsOf = useCallback((t: TakeShots): ShotStand[] => shotsOf(t).map((s) => {
    const k = otherKey(t.src, s.i);
    const x = pv.stands.get(k);
    return pv.other.has(k) ? { ...(x?.note ? { note: x.note } : {}) } : { place: s.tag ?? String(s.n), ...(x?.label ? { label: x.label } : {}), ...(x?.note ? { note: x.note } : {}), ...(x?.conflict ? { conflict: x.conflict } : {}) };
  }), [pv]);
  const otherOf = useCallback((t: TakeShots) => new Set(shotsOf(t).filter((s) => pv.other.has(otherKey(t.src, s.i))).map((s) => s.i)), [pv]);

  // the take in focus: ?take=, else the first (on the phone the list shows until one is opened)
  const asked = params.get('take') ?? undefined;
  const [selRaw, setSel] = useState<string | undefined>(asked);
  // the address changed under the page (the phone's Back to the list, a link): it says which take
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) { setLastAsked(asked); setSel(asked); }
  const sel = rows.find((r) => r.take.src === selRaw) ? selRaw : phone ? undefined : rows[0]?.take.src;
  const idx = rows.findIndex((r) => r.take.src === sel);
  const row = idx >= 0 ? rows[idx] : undefined;
  const take = row?.take;
  const go = useCallback((src: string | undefined, push = false) => {
    setSel(src);
    const u = new URL(window.location.href);
    if (src) u.searchParams.set('take', src); else u.searchParams.delete('take');
    if (push) router.push(`${u.pathname}${u.search}`, { scroll: false });
    else window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}`);
  }, [router]);
  const step = useCallback((d: 1 | -1) => { if (!rows.length) return; const k = idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + d)); go(rows[k].take.src); }, [rows, idx, go]);
  const setAll = (on: boolean) => { const u = new URL(window.location.href); if (on) u.searchParams.set('all', '1'); else u.searchParams.delete('all'); router.replace(`${u.pathname}${u.search}`, { scroll: false }); };

  const l = take ? landed?.[takeFolder(take.src)] : undefined;
  const stands = useMemo(() => (take ? standsOf(take) : []), [take, standsOf]);
  const inFilm = useMemo(() => (take ? inFilmOf(tl, take) : undefined), [tl, take]);
  const reading = useMemo(() => (take && tl && inFilm !== 'in' ? replaceOf(tl, take, pv.by, names, order, otherOf(take)) : undefined), [take, tl, inFilm, pv.by, names, order, otherOf]);
  // the cut's side of the pair: what a Use would take out; for a take in the film already, its own clips
  const cutSegs: Seg[] = useMemo(() => {
    if (!take || !tl) return [];
    if (inFilm) return (tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'))?.clips.filter((c) => c.src === take.src && !c.muted).map((c) => ({ src: c.src!, from: c.in, to: c.out })) ?? [];
    return (reading?.out ?? []).filter((p) => p.src).map((p) => ({ src: p.src, from: p.in, to: p.out }));
  }, [take, tl, inFilm, reading]);
  const takeSegs: Seg[] = useMemo(() => (take ? [{ src: take.src, from: 0, to: take.seconds ?? 0.1 }] : []), [take]);

  const title = take ? takeTitle(take) : '';
  const line = take ? placesLine(take.scene, stands) : '';
  usePage(take ? `New takes · ${title}` : 'New takes', 'Ask Alma about this take…', take ? [`What is wrong with ${title}?`] : ['Which new takes are worth using?'], ['What was redone, and why?']);

  // ---- the actions
  const pair = useRef<PairHandle>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => Promise<void>; k: number }>();
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((text: string, undo?: () => Promise<void>) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo, k: Date.now() });
    toastTimer.current = setTimeout(() => setToast(undefined), undo ? 12000 : 5000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  /** After a decision the focus goes on to the take that came after it. */
  const onward = useCallback((src: string) => {
    const k = rows.findIndex((r) => r.take.src === src);
    const next = rows[k + 1]?.take.src ?? rows[k - 1]?.take.src;
    if (!all) go(next);
  }, [rows, all, go]);
  const chipId = (src: string) => `takes:${src}`;

  const decideOn = useCallback(async (d: Decision) => {
    if (!take || busy) return;
    pair.current?.stop();
    const src = take.src, name = title;
    addSeen([src]);
    if (d === 'later') {
      await decide(src, 'later');
      onward(src);
      say(`${name} kept for later: it stays at the bottom of the list.`, async () => { await decide(src, null); go(src); });
      return;
    }
    if (d === 'rejected') {
      await decide(src, 'rejected');
      ui.addChip({ id: chipId(src), label: `Rejected ${name}`, ref: `${src} · rejected on the New takes page; still under "All takes that came back"` });
      onward(src);
      say(`Rejected ${name}. It stays under "All takes that came back".`, async () => { await decide(src, null); ui.removeChip(chipId(src)); go(src); });
      return;
    }
    // used: the Takes view's "Use in the film", on the cut as the server has it now, one step
    if (inFilm === 'in') {
      await decide(src, 'used');
      onward(src);
      say(`${name} is in the film already: marked used.`, async () => { await decide(src, null); go(src); });
      return;
    }
    setBusy(true);
    try {
      const get = async () => (await fetch(`/api/films/${encodeURIComponent(film)}/cut/working`, { cache: 'no-store' }).then((r) => r.json() as Promise<CutWorking>).catch(() => undefined))?.working;
      let w = await get();
      for (let tries = 0; w && tries < 2; tries++) {
        const cur = shotTimeline(tlOfWorking(w), pv.by);
        const r = replaceOf(cur, take, pv.by, names, order, otherOf(take));
        if (!r.after) { say(`${name} was not put in the film: nothing it stands for could be found in the cut, or a locked track refused it.`); return; }
        const res = await fetch(`/api/films/${encodeURIComponent(film)}/cut/working`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rev: w.rev, words: r.note ?? `${name} put in the film`, by: 'user', tracks: r.after.tracks, markers: r.after.markers }) });
        const j = await res.json().catch(() => ({})) as { working?: { rev: number }; error?: string; code?: string };
        if (res.status === 409 && j.code === 'stale') { w = await get(); continue; }
        if (!res.ok || !j.working) { say(`Not put in the film: ${j.error ?? `the server answered ${res.status}`}.`); return; }
        const rev = j.working.rev;
        await decide(src, 'used');
        ui.addChip({ id: chipId(src), label: `Used ${name} in the film`, ref: `${src} · ${r.note ?? ''} (one step of the cut, from the New takes page)` });
        onward(src);
        say(`Used ${name} in the film: ${r.note ?? ''}. The film is ${deltaWords(r.delta, cur.fps)}.`, async () => {
          const u = await fetch(`/api/films/${encodeURIComponent(film)}/cut/undo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rev }) });
          if (!u.ok) { say('Undo was refused: the cut changed since. Undo it on the Edit page.'); return; }
          await decide(src, null);
          ui.removeChip(chipId(src));
          go(src);
          say(`${name} taken out of the film again.`);
        });
        return;
      }
      say(`${name} was not put in the film: the cut could not be read.`);
    } finally {
      setBusy(false);
    }
  }, [take, busy, title, addSeen, decide, onward, say, go, ui, inFilm, film, pv.by, names, order, otherOf]);

  /** On the phone: the Use is asked of Alma (the Edit page is view-only on touch). */
  const askAlma = useCallback(() => {
    if (!take) return;
    addSeen([take.src]);
    const where = reading?.out.length ? ` in place of ${reading.out.map((p) => p.label).join(' and ')}` : '';
    ui.command({ id: `use-take:${take.src}`, label: `Use ${title} in the film` },
      `Put ${title} (${take.src}) in the film${where}, as one step of the cut (${line}).`);
  }, [take, addSeen, reading, ui, title, line]);

  // ---- the keys: ← → or J K step, Enter plays both, U uses, L keeps for later, X rejects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || editable(e.target) || document.querySelector('[data-lightbox-open]')) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowright' || k === 'j') { e.preventDefault(); step(1); }
      else if (k === 'arrowleft' || k === 'k') { e.preventDefault(); step(-1); }
      else if (k === 'enter' || k === ' ') { if (e.target instanceof HTMLButtonElement && k === 'enter') return; e.preventDefault(); pair.current?.toggle(); }
      else if (k === 'u' && !touch) { e.preventDefault(); void decideOn('used'); }
      else if (k === 'l') { e.preventDefault(); void decideOn('later'); }
      else if (k === 'x') { e.preventDefault(); void decideOn('rejected'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, decideOn, touch]);

  if (!state) return <Loading error={error} />;
  const wide = isWide(state.film.aspect);
  const ratio = cssAspect(state.film.aspect);
  const loading = !ready;
  const crumbs = [{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'New takes' }];
  const listHead = (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Which takes" className="inline-flex h-8 w-fit items-center rounded-lg border border-edge p-0.5 text-[12.5px] max-[760px]:h-10">
        {([[false, `To look at · ${toLook}`], [true, `All that came back · ${cameBackN}`]] as const).map(([on, label]) => (
          <button key={String(on)} type="button" role="tab" aria-selected={all === on} onClick={() => setAll(on)} data-filter={on ? 'all' : 'open'}
            className={cn('h-full cursor-pointer whitespace-nowrap rounded-md px-2.5 transition-colors duration-200', all === on ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>{label}</button>
        ))}
      </div>
    </div>
  );
  const list = (
    <div data-inbox-list className="flex flex-col gap-1">
      {rows.map((r) => (
        <Row key={r.take.src} row={r} on={r.take.src === sel} title={takeTitle(r.take)} line={placesLine(r.take.scene, standsOf(r.take))} landed={landed?.[takeFolder(r.take.src)]}
          film={inFilmOf(tl, r.take)} ratio={ratio} onPick={() => { go(r.take.src, phone); }} />
      ))}
    </div>
  );
  const empty = (
    <div data-inbox-empty className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-edge p-5">
      <p className="m-0 text-[14px] font-medium">Nothing new to look at.</p>
      <p className="m-0 text-[12.5px] text-sub">Every take that came back has been looked at or decided.{cameBackN ? '' : ' None has come back since the list began.'}</p>
      {cameBackN > 0 && !all && <button type="button" onClick={() => setAll(true)} className="cursor-pointer text-[12.5px] text-ink underline decoration-edge-strong underline-offset-4 hover:decoration-ink">See all {plural(cameBackN, 'take')} that came back</button>}
    </div>
  );

  const focus = take ? (
    <div key={take.src} data-focus={take.src} className="@container/focus flex min-w-0 flex-col gap-4 duration-200 ease-out animate-in fade-in-0 slide-in-from-right-2 motion-reduce:animate-none">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 data-focus-line className="m-0 text-[19px] font-semibold tracking-[-0.01em] max-[760px]:sr-only">{line}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sub">
            <span data-focus-title className="font-mono text-[11.5px] text-ink-3">{title}</span>
            <span aria-hidden="true">·</span><span>landed {landedWords(take.made)}</span>
            {take.seconds !== undefined && <><span aria-hidden="true">·</span><span>{secs(take.seconds)}</span></>}
            {modelChip(l?.spend) && <Chip>{modelChip(l?.spend)}</Chip>}
            <VerdictChip l={l} />
            <StatusChip row={row!} film={inFilm} />
          </div>
        </div>
        {!phone && (
          <div className="flex flex-none items-center gap-1.5">
            <span data-k-of-n className="mr-1 text-[12px] tabular-nums text-sub">{idx + 1} of {rows.length}</span>
            <button type="button" onClick={() => step(-1)} disabled={idx <= 0} aria-label="Previous take (K)" title="Previous take (← or K)" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-edge text-ink-3 transition-colors duration-200 hover:bg-raised hover:text-ink disabled:cursor-default disabled:opacity-35"><IconChevronLeft size={14} /></button>
            <button type="button" onClick={() => step(1)} disabled={idx >= rows.length - 1} aria-label="Next take (J)" title="Next take (→ or J)" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-edge text-ink-3 transition-colors duration-200 hover:bg-raised hover:text-ink disabled:cursor-default disabled:opacity-35"><IconChevronRight size={14} /></button>
          </div>
        )}
      </div>
      <PairPlayer ref={pair} a={takeSegs} b={cutSegs} labelA="New take" labelB={inFilm ? 'In the film now' : 'In the cut now'} ratio={ratio} tall={!wide} stacked={phone && wide}
        subA={title} subB={inFilm ? 'this take, as the film plays it' : reading?.out.map((p) => p.label).join(' + ') || undefined}
        emptyB={!tl ? 'Reading the cut…' : 'Nothing in the cut at this place now: the take would be added.'} onPlayed={() => addSeen([take.src])} />
      <div data-actions className="flex flex-wrap items-center gap-2">
        {touch ? (
          <button type="button" onClick={askAlma} data-act="ask" className="inline-flex h-11 cursor-pointer items-center rounded-lg bg-ink px-4 text-[13.5px] font-medium text-bg transition-opacity duration-200 hover:opacity-90">Ask Alma to use it</button>
        ) : (
          <button type="button" onClick={() => void decideOn('used')} disabled={busy || row?.decided?.d === 'used'} data-act="use" title={inFilm === 'in' ? 'It is in the film already: marks it used' : 'Puts it in the film as one step of the cut; Undo takes it back'}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-ink px-3.5 text-[13px] font-medium text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40">{busy ? 'Putting it in…' : inFilm === 'in' ? 'Mark it used' : 'Use in the film'}<Kbd>U</Kbd></button>
        )}
        <button type="button" onClick={() => void decideOn('later')} disabled={busy || row?.decided?.d === 'later'} data-act="later"
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-edge px-3.5 text-[13px] text-ink transition-colors duration-200 hover:bg-raised disabled:cursor-default disabled:opacity-40 max-[760px]:h-11">Keep for later<Kbd>L</Kbd></button>
        <button type="button" onClick={() => void decideOn('rejected')} disabled={busy || row?.decided?.d === 'rejected'} data-act="reject"
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-edge px-3.5 text-[13px] text-ink transition-colors duration-200 hover:border-[#7f1d1d] hover:text-bad disabled:cursor-default disabled:opacity-40 max-[760px]:h-11">Reject<Kbd>X</Kbd></button>
        {!touch && <Link href={shotDetailsHref(film, take.src)} className="ml-auto text-[12.5px] text-sub no-underline transition-colors duration-200 hover:text-ink">Shot details ›</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 @max-[620px]/focus:grid-cols-1">
        <Asked l={l} />
        <Check l={l} />
        <Replace r={reading} fps={fps} film={inFilm} stands={stands} />
        <Model l={l} t={take} />
      </div>
      {!phone && <p className="m-0 text-[11.5px] text-mute">← → or J K to step · Enter plays both · U uses it · L keeps it for later · X rejects it</p>}
    </div>
  ) : undefined;

  const toastEl = toast && (
    <div key={toast.k} role="status" data-toast className="fixed bottom-5 left-1/2 z-40 flex max-w-[min(640px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-xl border border-edge bg-raised px-3.5 py-2.5 text-[12.5px] text-ink shadow-[0_8px_30px_rgba(0,0,0,0.5)] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none max-[760px]:bottom-24">
      <span className="min-w-0 [overflow-wrap:anywhere]">{toast.text}</span>
      {toast.undo && <button type="button" data-undo onClick={() => { const u = toast.undo!; setToast(undefined); void u(); }} className="flex-none cursor-pointer rounded-md px-2 py-1 font-medium text-ink underline decoration-edge-strong underline-offset-4 hover:decoration-ink">Undo</button>}
    </div>
  );

  // the phone: the list, or one take as its own view (Back returns to the list)
  if (phone) {
    return (
      <>
        <Header crumbs={take ? [...crumbs.slice(0, 2), { label: 'New takes', href: `${base}/takes` }, { label: line }] : crumbs}
          back={take ? { label: 'Back to New takes', href: `${base}/takes${all ? '?all=1' : ''}`, soft: true } : { label: 'Back to the film', href: base, soft: true }} phoneSub={take ? title : toLook ? plural(toLook, 'take') + ' to look at' : undefined} />
        <div data-takes-inbox className="flex w-full flex-col gap-3 px-4 pb-10 pt-3">
          {loading ? <p className="m-0 text-[13px] text-sub">Reading the takes…</p> : take ? (
            <>
              {/* big Previous and Next over the take (Alma's box holds the bottom of the phone) */}
              <div className="flex items-center gap-2">
                <button type="button" data-phone-prev onClick={() => step(-1)} disabled={idx <= 0} className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-edge text-[14px] text-ink transition-colors duration-200 active:bg-raised disabled:opacity-35"><IconChevronLeft size={16} />Previous</button>
                <span data-k-of-n className="w-16 flex-none text-center text-[12px] tabular-nums text-sub">{idx + 1} of {rows.length}</span>
                <button type="button" data-phone-next onClick={() => step(1)} disabled={idx >= rows.length - 1} className="inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-edge text-[14px] text-ink transition-colors duration-200 active:bg-raised disabled:opacity-35">Next<IconChevronRight size={16} /></button>
              </div>
              {focus}
            </>
          ) : (
            <>
              <p className="m-0 text-[13px] leading-normal text-sub">Every take that came back and is not looked at or decided yet, newest first. Tap one to play it beside the cut.</p>
              <StepIntro step="newtakes" />
              {listHead}
              {rows.length ? list : empty}
            </>
          )}
        </div>
        {toastEl}
      </>
    );
  }

  return (
    <>
      <Header crumbs={crumbs} back={{ label: 'Back to the film', href: base, soft: true }} />
      <div data-takes-inbox className="flex w-full max-w-[1320px] flex-col gap-4 px-6 pb-12 pt-5">
        <div className="flex items-end gap-6 border-b border-line pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">New takes</h1>
            <p className="m-0 max-w-[720px] text-[13px] leading-normal text-sub">Every take that came back and is not looked at or decided yet, newest first. Play each beside what the cut has at its place, then use it, keep it for later or reject it.</p>
            <StepIntro step="newtakes" />
          </div>
          {listHead}
        </div>
        {loading ? <p className="m-0 py-6 text-[13px] text-sub duration-200 animate-in fade-in-0">{shots.waiting ? `Cutting ${plural(shots.waiting, 'take')} into their shots…` : 'Reading the takes…'}</p> : (
          <div className="grid grid-cols-[296px_minmax(0,1fr)] items-start gap-6 duration-200 animate-in fade-in-0">
            <div className="sticky top-4 flex max-h-[calc(100vh-140px)] flex-col overflow-y-auto pr-1 [scrollbar-width:thin]">{rows.length ? list : empty}</div>
            {focus ?? <div />}
          </div>
        )}
      </div>
      {toastEl}
    </>
  );
}
