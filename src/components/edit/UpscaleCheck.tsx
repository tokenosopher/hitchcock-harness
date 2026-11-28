'use client';
// Checking the 1080p, and marking what to redo with Seedance (13 Nov 2026, ASKS 37; the owner: "the check is 'Did it
// generate well with the upscale?' … If it didn't, then we have the option in this 1080 view to select the cuts that we want
// or to click on a particular cut and go, 'Yep, upscale this with Seedance.' … if multiple cuts that are now in the video
// exist in that same video that we are now going to upscale to Seedance, then all of those cuts are going to be replaced").
// In the 1080p view this list takes the takes grid's place: one row per take the film uses (a redo with Seedance redoes a
// whole take), its shots in film order as full-size stills; a click plays a shot from just before it. Each row has one
// switch, "Redo with Seedance"; the bar above sums the marks up and puts the request in Alma's box (nothing is sent or
// spent from here). The marks are kept with the film (marks.ts), shown to Alma in "Alma sees" with every message, and
// dropped for a take once it has its own full-size file.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline, TimelineClip } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { smpte } from '@/components/lib/format';
import { useUIActions } from '@/components/data/ui';
import { liveMarks, markOf, marksLabel, marksText, refreshMarks, shotLabel, type CutTake, type SeedanceMark } from './marks';
import { lenF, startF } from './model';
import { sceneOf, shotNo, type BySrc } from './shots';
import { hasOwnFull, madeFull, type FullInfo, type Piece } from './fullsize';

type Cut = { takes: CutTake[]; version: string; fps: number };

/** The takes marked to redo with Seedance, kept with the film (<film>/harness/upscale-marks.json, read and written
 *  through /api/films/<film>/marks). A toggle shows at once and saves the whole list; a failed save puts the switch
 *  back and says why. Read again when the film's folder changed (`changed`, the state's time) and when the window
 *  comes back, so a change Alma made shows. */
export function useSeedanceMarks(film: string, info: FullInfo | undefined, changed?: string) {
  const [list, setList] = useState<SeedanceMark[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ text: string; on: boolean }>();
  const latest = useRef<SeedanceMark[]>([]);   // what the page shows, for the next toggle
  const saved = useRef<SeedanceMark[]>([]);    // what the server last held, to go back to
  const busy = useRef(0);                      // saves on their way
  const seq = useRef(0);                       // one more per toggle: a read begun before a toggle is stale
  const cut = useRef<Cut>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());   // saves go one after another, in the order made
  const read = useCallback(async () => {
    const at = seq.current;
    try {
      const r = await fetch(`/api/films/${film}/marks`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { seedance?: SeedanceMark[] };
      if (busy.current || at !== seq.current || !Array.isArray(j.seedance)) return;
      saved.current = j.seedance;
      if (JSON.stringify(j.seedance) !== JSON.stringify(latest.current)) { latest.current = j.seedance; setList(j.seedance); }
      setLoaded(true);
    } catch { /* the server is not answering: the marks stay as shown */ }
  }, [film]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the list is set after the fetch answers, not in the effect itself
  useEffect(() => { void read(); }, [read, changed]);
  useEffect(() => {
    const back = () => { if (document.visibilityState !== 'hidden') void read(); };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => { window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); };
  }, [read]);
  // a take that has its own full-size file now is done: its mark goes
  const live = useMemo(() => liveMarks(list, info), [list, info]);
  const marks = useMemo(() => new Set(live.map((m) => m.src)), [live]);
  const toggle = useCallback((src: string) => {
    const c = cut.current, fps = c?.fps ?? 24, tc = (s: number) => smpte(s, fps);
    const cur = latest.current;
    const t = c?.takes.find((x) => x.src === src);
    const added = t && c ? markOf(t, c.version, fps, tc, new Date().toISOString()) : { src, take: src.split('/').pop() ?? src, markedAt: new Date().toISOString(), cut: c?.version ?? '', shots: [] };
    const next = liveMarks(refreshMarks(cur.some((m) => m.src === src) ? cur.filter((m) => m.src !== src) : [...cur, added], c?.takes, c?.version, fps, tc), info);
    seq.current++;
    latest.current = next;
    setList(next);
    setError((e) => (e?.on ? { ...e, on: false } : e));
    busy.current++;
    queue.current = queue.current.then(() => fetch(`/api/films/${film}/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seedance: next }) }))
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `the server answered ${r.status}`); saved.current = next; })
      .catch((e: unknown) => {
        // only the newest toggle puts the list back; an older failure is covered by the save after it
        if (latest.current === next) { latest.current = saved.current; setList(saved.current); }
        setError({ text: `The mark was not saved: ${e instanceof Error ? e.message : String(e)}`, on: true });
      })
      .finally(() => { busy.current--; });
  }, [film, info]);
  const setCut = useCallback((c: Cut | undefined) => { cut.current = c; }, []);
  return useMemo(() => ({ marks, toggle, list: live, loaded, error, setCut }), [marks, toggle, live, loaded, error, setCut]);
}
export type SeedanceMarks = ReturnType<typeof useSeedanceMarks>;

const MARKS_CHIP = 'keep:seedance-marks';

/** Keeps the marks in "Alma sees" while any take is marked: one chip, "Marked for Seedance · 2 takes", whose content is
 *  the list Alma is given with every message (it stays after a send). Removed by its cross, it comes back on the next
 *  change of the marks; the marks themselves stay. Also the line that says a save failed. Writes nothing in the box. */
export function SeedanceMarksLink({ film, seedance, takes, version, fps }: { film: string; seedance: SeedanceMarks; takes?: CutTake[]; version?: string; fps: number }) {
  const { setCut, list, loaded, error } = seedance;
  useEffect(() => { setCut(takes && version ? { takes, version, fps } : undefined); }, [setCut, takes, version, fps]);
  const text = useMemo(() => (list.length ? marksText(refreshMarks(list, takes, version, fps, (s) => smpte(s, fps)), film) : ''), [list, takes, version, fps, film]);
  const { addChip, removeChip } = useUIActions();
  const last = useRef<string>(undefined);
  useEffect(() => {
    if (!loaded || text === last.current) return;
    last.current = text;
    if (text) addChip({ id: MARKS_CHIP, label: marksLabel(list.length), ref: text });
    else removeChip(MARKS_CHIP);
  }, [loaded, text, list.length, addChip, removeChip]);
  // the chip is the Edit page's: it goes when the page does
  useEffect(() => () => { last.current = undefined; removeChip(MARKS_CHIP); }, [removeChip]);
  return (
    <div role="status" className={cn('grid transition-[grid-template-rows,opacity,margin] duration-200', error?.on ? 'grid-rows-[1fr] opacity-100' : '-mt-2.5 grid-rows-[0fr] opacity-0')}>
      <p className="m-0 min-h-0 overflow-hidden text-[12px] leading-normal text-bad">{error?.text}</p>
    </div>
  );
}

export interface CheckShot { clip: TimelineClip; from: number; len: number; at: string; scene?: string; n?: number; still: string; kind: Piece['kind']; label: string }
/** `own`: the take needs no redo (its own full-size file, or full size itself); `full`: made at full size itself. */
export interface CheckTake { src: string; name: string; shots: CheckShot[]; own: boolean; full?: boolean }

/** The film's shots in film order, each with a still from its full-size picture, grouped by take in the order the
 *  takes first appear. */
export function checkTakes(tl: Timeline, pieces: Piece[], by: BySrc, names: Map<string, string>, info: FullInfo): { shots: CheckShot[]; takes: CheckTake[] } {
  const fps = tl.fps;
  const seen = new Map<string, CheckShot>();
  for (const p of pieces) {
    const c = p.clip;
    const had = seen.get(c.id);
    if (had) { if (p.kind === 'small') { had.kind = 'small'; had.label = p.label; } continue; }
    const from = startF(c, fps), len = lenF(c, fps);
    // a still from the middle of the shot, from whatever plays it there
    const mid = Math.min(Math.max(p.from, from + Math.floor(len / 2)), p.to - 1);
    const t = p.t0 + ((mid - p.from) * p.rate) / fps;
    seen.set(c.id, { clip: c, from, len, at: `${Math.floor(from / fps / 60)}:${String(Math.floor((from / fps) % 60)).padStart(2, '0')}`, scene: sceneOf(c, by), n: shotNo(c, by), still: mediaUrl(p.src, { w: 160, t: Math.max(0, Math.round(t * 100) / 100) }), kind: p.kind, label: p.label });
  }
  const shots = [...seen.values()].sort((a, b) => a.from - b.from);
  const takes = new Map<string, CheckTake>();
  for (const s of shots) {
    const src = s.clip.src ?? '';
    if (!takes.has(src)) takes.set(src, { src, name: names.get(src) ?? s.clip.takeRef?.take ?? src.split('/').pop() ?? src, shots: [], own: hasOwnFull(info, src), ...(madeFull(info, src) ? { full: true } : {}) });
    takes.get(src)!.shots.push(s);
  }
  return { shots, takes: [...takes.values()] };
}

const shotName = (s: CheckShot) => shotLabel(s);
const secs = (f: number, fps: number) => `${(Math.round((f / fps) * 10) / 10).toFixed(1)} s`;

/** The words of the requests, for Alma's box: each take (its file), its shots with their timecodes in the cut, the
 *  version. Nothing about what it costs or who says yes: that is the film's own rules, with Alma. */
const takeLines = (takes: CheckTake[], tc: (s: number) => string, fps: number, only?: (s: CheckShot) => boolean) =>
  takes.map((t) => `- ${t.name} (${t.src}): ${t.shots.filter((s) => !only || only(s)).map((s) => `${shotName(s)} at ${tc(s.from / fps)}`).join(', ')}`).join('\n');
export function seedanceAsk(takes: CheckTake[], version: string, tc: (s: number) => string, fps: number): string {
  return `Finalize these takes at 1080p with Seedance 2.5 for cut ${version}, each as its …-1080p.mp4 beside its 480p. Every shot of a take finalized this way is replaced in the cut by the new full-size take:\n${takeLines(takes, tc, fps)}\n`;
}
export function upscaleAsk(takes: CheckTake[], version: string, tc: (s: number) => string, fps: number): string {
  return `Upscale these takes on Higgsfield for cut ${version}, each whole take so later trims stay covered; these shots play at 480p in the 1080p view:\n${takeLines(takes, tc, fps, (s) => s.kind === 'small')}\n`;
}

/** The slim bar over the lower panel in the 1080p view: how much of the film is full size, the two requests (Seedance 2.5
 *  first, the Higgsfield upscale second), the keys. */
export function FullBar({ shots, takes, marks, onUpscale, onSeedance }: { shots: CheckShot[]; takes: CheckTake[]; marks: Set<string>; onUpscale: () => void; onSeedance: () => void }) {
  const small = shots.filter((s) => s.kind === 'small').length;
  const marked = takes.filter((t) => marks.has(t.src));
  const n = marked.reduce((k, t) => k + t.shots.length, 0);
  const btn = 'inline-flex h-7 cursor-pointer items-center rounded-lg border px-2.5 text-[12px] font-medium transition-colors duration-200';
  return (
    <div aria-label="Full size" className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] text-sub duration-300 animate-in fade-in-0">
      <span><span className="text-ink">Full size</span> · {shots.length - small} of {shots.length} shots{small ? <span className="text-warn"> · {small} at 480p</span> : ''}</span>
      {marked.length > 0 && <span className="text-warn">· {marked.length} {marked.length === 1 ? 'take' : 'takes'} marked for Seedance 2.5 · {n} {n === 1 ? 'shot' : 'shots'} will be replaced</span>}
      {marked.length > 0 && <button type="button" onClick={onSeedance} className={cn(btn, 'border-warn/70 text-warn hover:bg-warn/10')}>Ask Alma for 1080p in Seedance 2.5</button>}
      {small > 0 && <button type="button" onClick={onUpscale} className={cn(btn, 'border-edge-strong text-ink hover:bg-raised')}>Upscale on Higgsfield</button>}
      <span className="ml-auto font-mono text-[11px] text-mute">↑ ↓ shot by shot · hold C to see the 480p</span>
    </div>
  );
}

export function UpscaleCheck({ tl, takes, shots, marks, onToggle, frame, fps, label, onPlay }: {
  tl: Timeline; takes: CheckTake[]; shots: CheckShot[]; marks: Set<string>; onToggle: (src: string) => void; frame: number; fps: number; label: string;
  onPlay: (s: CheckShot) => void;
}) {
  const cur = shots.find((s) => s.from <= frame && s.from + s.len > frame);
  return (
    <section aria-label="Checking the 1080p" className="flex min-w-0 flex-col gap-3 duration-300 animate-in fade-in-0">
      <span className="text-[12.5px] leading-normal text-sub">
        Each take of cut {tl.version}, with its shots at full size. Click a shot to watch it. If a take did not come out well with {label}, mark it to redo in Seedance: every shot from that take is replaced.
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {takes.map((t) => {
          const on = marks.has(t.src);
          return (
            <li key={t.src} data-take={t.src} className={cn('flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 transition-[border-color,background-color] duration-200', on ? 'border-dashed border-warn bg-warn/5' : 'border-line')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium">{t.name}</span>
                  <span className="truncate font-mono text-[11px] text-mute">{t.src.split('/').pop()}</span>
                </span>
                {t.own ? (
                  <span className="text-[12px] text-sub">{t.full ? '1080p · made at full size' : 'Seedance · its own full-size file'}</span>
                ) : (
                  <button type="button" role="switch" aria-checked={on} onClick={() => onToggle(t.src)}
                    className={cn('inline-flex h-7 cursor-pointer items-center gap-2 rounded-[14px] border px-2.5 text-[12px] transition-colors duration-200', on ? 'border-warn text-warn' : 'border-edge-strong text-sub hover:text-ink')}>
                    <span aria-hidden="true" className={cn('relative h-3.5 w-6 rounded-full transition-colors duration-200', on ? 'bg-warn' : 'bg-edge-strong')}>
                      <span className={cn('absolute top-0.5 size-2.5 rounded-full bg-bg transition-[left] duration-200', on ? 'left-3' : 'left-0.5')} />
                    </span>
                    Redo in Seedance
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {t.shots.map((s) => (
                  <button key={s.clip.id} type="button" data-shot={s.clip.id} onClick={() => onPlay(s)} title={`${shotName(s)} · ${secs(s.len, fps)} · ${s.kind === 'small' ? '480p · not upscaled' : s.label}`}
                    className={cn('flex w-[84px] [[data-frame=wide]_&]:w-[132px] cursor-pointer flex-col gap-1 rounded-[7px] border bg-transparent p-1 text-left transition-colors duration-200',
                      cur?.clip.id === s.clip.id ? 'border-ink' : on ? 'border-dashed border-warn' : 'border-edge hover:border-sub')}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a WebP still from /api/media */}
                    <img alt="" src={s.still} loading="lazy" className="aspect-[9/16] w-full rounded-[4px] bg-black object-cover [[data-frame=wide]_&]:aspect-[var(--film-aspect)] [[data-frame=wide]_&]:object-contain" />
                    <span className="truncate text-[11px] text-ink">{shotName(s)}</span>
                    <span className={cn('truncate font-mono text-[10px]', s.kind === 'small' ? 'text-warn' : 'text-mute')}>{secs(s.len, fps)} · {s.kind === 'small' ? '480p' : s.label}</span>
                  </button>
                ))}
              </div>
              <div className={cn('grid transition-[grid-template-rows,opacity] duration-200', on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                <p className="m-0 min-h-0 overflow-hidden text-[12px] leading-normal text-warn">
                  {t.shots.length === 1 ? 'Its one shot will be replaced' : `All ${t.shots.length} shots from this take will be replaced`}: {t.shots.map(shotName).join(', ')}.
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
