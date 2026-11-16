'use client';
// The QC panel: the "Next" sentence, the 0–10 score
// track with the 8.5 mark and a dot per round, open misses first and the resolved folded, each miss with its
// colour group, finding, exact fix, "fixed in" and expandable evidence; a sticky footer of three actions.
// Not run: "Not run · waits for <x>" (or "ready to run on <x>"), the checks folded, Run QC. Every action only prefills the composer.
import { useEffect, useMemo, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUI } from '@/components/data/ui';
import { useThread } from '@/components/data/thread';
import { repoPath } from '@/components/lib/format';
import { fmtScore, nextSentence, openOf, passes, qcStatus, recipePath, runQCText, type QCSpec } from '@/components/lib/qc';
import { Media, isImagePath, isVideoPath } from '@/components/media/Media';
import { IconChevronDown, IconChevronRight } from '@/components/shell/icons';
import { QC_CATEGORIES, QC_LOCK_SCORE, QC_MAX_ROUNDS, type QCCategory, type QCEntry, type QCMiss } from '@/server/types';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/shell/Reveal';

export const QC_HUE: Record<QCCategory, string> = {
  'camera+geometry': '#60A5FA', 'blocking+fluidity': '#F472B6', prop: '#FBBF24', lines: '#A78BFA', 'audio+effect': '#4ADE80',
};

export interface QCTarget {
  target: string;          // the file-name target ("S1", "C01", "film")
  label: string;           // how the chip and panel name it ("S1 boards v4", "script")
  entry?: QCEntry;
  waitsFor: string;        // what the first round waits for, or what the critic grades next
  ready: boolean;          // the artefact exists: Run QC is enabled
  /** Set when the misses come from the record, not from the critic (the Scene page's take check). */
  source?: string;
  /** What the check needs that is not there yet (the cut's 480p, 14 Nov): Run QC asks for it first, says so in
   *  `words`, waits, and only then asks Alma; `run` answers why it could not be had, if so. */
  before?: { words: string; run: () => Promise<string | undefined> };
}

/** The chip's words after "QC · <label> · ". */
export function targetStatus(t: QCTarget): string {
  if (t.source && t.entry) {
    const n = openOf(t.entry.latest).length;
    return `${n} open · ${t.source}`;
  }
  return qcStatus(t.entry);
}

const Shield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
const Arrow = ({ className }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const Lock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
);
const Check = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" className="mt-[3px] flex-none"><path d="M5 12l5 5 9-10" /></svg>
);

export function QCPanel({ spec, t, compact, onClose, lockWord }: {
  spec: QCSpec;
  t: QCTarget;
  /** The 520px popover: one column per miss instead of the three-column grid. */
  compact?: boolean;
  onClose?: () => void;
  /** "Lock previz" on the Previz page; "Lock" elsewhere. */
  lockWord?: string;
}) {
  const ui = useUI();
  const { state } = useFilm();
  const [recipe, setRecipe] = useState('recipes/qc-critic.md');
  const [filter, setFilter] = useState<QCCategory | 'all'>('all');
  const [row, setRow] = useState<string>();
  const [showResolved, setShowResolved] = useState(false);
  useEffect(() => { let live = true; void recipePath().then((p) => { if (live) setRecipe(p); }); return () => { live = false; }; }, []);

  const r = t.entry?.latest;
  const history = t.entry?.history ?? [];
  const label = t.label;
  const status = targetStatus(t);
  const chip = { id: `qc:${spec.stage}:${t.target}`, label: `QC · ${label}` };
  // the check's own need first (the cut's 480p), said while it runs; then the request in Alma's box
  const [getting, setGetting] = useState<{ words: string; error?: string }>();
  const run = async (round: number) => {
    if (t.before) {
      if (getting && !getting.error) return;
      setGetting({ words: t.before.words });
      const why = await t.before.run();
      if (why) { setGetting({ words: t.before.words, error: why }); return; }
      setGetting(undefined);
    }
    ui.prefill(runQCText(recipe, spec, t.target, label, round), chip);
  };
  const waiting = !!getting && !getting.error;

  const misses = useMemo(() => r?.misses ?? [], [r]);
  const open = misses.filter((m) => m.open);
  const resolved = misses.filter((m) => !m.open);
  const shown = (l: QCMiss[]) => (filter === 'all' ? l : l.filter((m) => m.category === filter));
  const flags = open.length;
  const lockable = !!r && passes(r) && !flags && !t.source;
  const lastRound = !!r && r.round >= QC_MAX_ROUNDS;
  // a sub-agent of Alma's is at work on this check: its name says QC, critic or fix, and names this stage or target
  const { tasks } = useThread();
  const word = (w: string) => new RegExp(`(^|[^A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i');
  const fixing = !!r && tasks.some((k) => (k.state === 'running' || k.state === 'queued') && /\b(qc|critic|fix(es|ing)?)\b/i.test(k.title)
    && (word(t.target).test(k.title) || (!/^[A-Z]+\d/.test(t.target) && word(spec.stage).test(k.title))));
  const fileOf = (p: string) => (state ? repoPath(state.film.folder, state.film.repo, p) : p);
  const nine = (state?.film.aspect ?? '9:16') === '9:16';

  return (
    <section aria-label={`QC · ${label} · ${status}`} className={cn('@container flex min-w-0 flex-col overflow-clip rounded-xl border border-edge bg-well', compact && 'max-h-[min(78vh,760px)] overflow-y-auto rounded-[10px] bg-[#0C0C0E] shadow-[0_16px_48px_rgba(0,0,0,0.6)]')}>
      {/* Head */}
      <div className={cn('flex items-start justify-between gap-4 border-b border-line', compact ? 'px-4 pb-3 pt-3.5' : 'px-[18px] pb-3.5 pt-4')}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-edge bg-panel text-ink"><Shield /></span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[15px] font-semibold tracking-[-0.01em] tabular-nums">QC · {label} · {status}</span>
            <span className="max-w-[560px] text-[12.5px] leading-normal text-sub">
              {t.source
                ? `These misses come from ${t.source} on the takes in the cut. Alma’s critic (Opus) has not graded this yet; it reads ${spec.reads} against ${spec.note}.`
                : `Alma’s critic (Opus) reads ${spec.reads}, and grades 1 to 10 against ${spec.note}${spec.stage === 'previz' ? ', camera design and action fluidity included' : ''}.`}
            </span>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close QC" className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-edge text-sub hover:bg-raised hover:text-ink">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>

      {!r ? (
        /* Not run */
        <>
          <div className={cn('flex items-start gap-2.5 border-b border-line bg-panel', compact ? 'px-4 py-2.5' : 'px-[18px] py-[11px]')}>
            <Arrow className="mt-1 flex-none text-ink" />
            <span className="text-[13.5px] leading-normal"><span className="font-semibold">Not run</span> · {t.ready ? `ready to run on ${t.waitsFor}` : `waits for ${t.waitsFor}`}.</span>
          </div>
          {getting && (
            <div data-qc-getting className={cn('flex items-center gap-2 border-b border-line text-[12.5px] duration-200 animate-in fade-in-0', getting.error ? 'text-bad' : 'text-sub', compact ? 'px-4 py-2' : 'px-[18px] py-2.5')}>
              {!getting.error && <span aria-hidden="true" className="dot-run size-2 flex-none rounded-full bg-sub" />}
              <span key={getting.error ? 'e' : 'w'} className="duration-200 animate-in fade-in-0">{getting.error ? `Not started: ${getting.error}` : getting.words}</span>
            </div>
          )}
          {/* folded until a round runs, so the artefact itself (the previz film, the boards) stays above the fold */}
          <details className={cn('group', compact ? 'px-4 py-2.5' : 'px-[18px] py-3')}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-sub hover:text-ink [&::-webkit-details-marker]:hidden">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="transition-transform group-open:rotate-90"><path d="M9 6l6 6-6 6" /></svg>
              Checks ({spec.checks.length})
            </summary>
            <div className="flex flex-col gap-2 pt-2.5">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {spec.checks.map((c) => <li key={c} className="flex gap-2 text-[13px] leading-normal text-ink-3"><span className="text-mute">–</span>{c}</li>)}
              </ul>
              <span className="text-[12px] text-mute">Checks from {spec.note}, loaded from studio/flow by the film skill.</span>
            </div>
          </details>
          <Footer compact={compact} note="Up to three rounds, or until 8.5.">
            <button type="button" disabled={!t.ready || waiting} title={t.ready ? undefined : `Waits for ${t.waitsFor}`} onClick={() => void run(1)}
              className="h-[34px] cursor-pointer whitespace-nowrap rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-bg hover:bg-ink-3 disabled:cursor-not-allowed disabled:bg-raised disabled:text-mute">
              Run QC{t.ready ? '' : ` · waits for ${t.waitsFor}`}
            </button>
          </Footer>
        </>
      ) : (
        <>
          {/* Next */}
          <div className={cn('flex items-start gap-2.5 border-b border-line bg-panel', compact ? 'px-4 py-2.5' : 'px-[18px] py-[11px]')}>
            <Arrow className="mt-1 flex-none text-ink" />
            <span className="text-[13.5px] leading-normal">
              {t.source
                ? <><span className="font-semibold">Next:</span> run the critic on this scene; it grades the take in the cut and keeps these misses as round 1’s findings.</>
                : (() => { const n = r.next || nextSentence(r); const m = /^Next:\s*/.exec(n); return m ? <><span className="font-semibold">Next:</span> {n.slice(m[0].length)}</> : <><span className="font-semibold">Next:</span> {n}</>; })()}
            </span>
          </div>

          {/* Score */}
          {!t.source && (
            <div className={cn('grid items-center gap-x-7 gap-y-4 border-b border-line', compact ? 'grid-cols-[auto_minmax(0,1fr)] px-4 pb-4 pt-4 max-[760px]:grid-cols-1' : 'grid-cols-[auto_minmax(0,1fr)_auto] px-[18px] pb-4 pt-[18px] max-[760px]:grid-cols-1 @max-[560px]:grid-cols-1')}>
              <span className="flex flex-col gap-1.5">
                <span className="flex items-baseline gap-1 tabular-nums">
                  {r.score === null ? <span className="text-[22px] font-semibold text-sub">No score</span> : <><span className="text-[40px] font-semibold leading-none tracking-[-0.03em]">{fmtScore(r.score)}</span><span className="text-[14px] text-mute">/ 10</span></>}
                </span>
                <span className="whitespace-nowrap text-[12px] text-sub">{r.locked ? 'locked' : passes(r) ? (flags ? `passes · ${flags} open ${flags === 1 ? 'flag' : 'flags'}, not locked` : 'passes · lockable') : `under ${QC_LOCK_SCORE} · not lockable`}</span>
              </span>
              <ScoreTrack history={history} />
              <span className={cn('flex flex-col items-end gap-1', compact && 'col-span-2 flex-row items-baseline gap-4 max-[760px]:col-span-1', 'max-[760px]:flex-row max-[760px]:items-baseline max-[760px]:gap-4 @max-[560px]:flex-row @max-[560px]:items-baseline @max-[560px]:gap-4')}>
                <span className="whitespace-nowrap text-[13px]"><span className="font-semibold">{open.length}</span> open</span>
                <span className="whitespace-nowrap text-[12.5px] text-sub">{resolved.length} resolved earlier</span>
              </span>
            </div>
          )}

          {/* Category filters: the five colour groups */}
          <div className="border-b border-line bg-hdr">
            <div role="group" aria-label="Filter by category" className={cn('flex flex-nowrap items-center gap-1.5 overflow-x-auto', compact ? 'px-4 py-2.5' : 'px-[18px] py-2.5')}>
              <FilterBtn on={filter === 'all'} onClick={() => setFilter('all')}>All <span className="text-mute">{misses.length}</span></FilterBtn>
              <span className="mx-1 h-4 w-px flex-none bg-edge" />
              {QC_CATEGORIES.map((c) => {
                const n = misses.filter((m) => m.category === c).length;
                return (
                  <FilterBtn key={c} on={filter === c} dim={!n} onClick={() => setFilter(filter === c ? 'all' : c)}>
                    <span className="size-1.5 flex-none rounded-full" style={{ background: QC_HUE[c] }} />{c.replace('+', ' + ')} <span className="text-mute">{n}</span>
                  </FilterBtn>
                );
              })}
            </div>
          </div>


          {shown(open).map((m) => (
            <MissRow key={m.id} m={m} compact={compact} openRow={row === m.id} fileOf={fileOf} nine={nine}
              onClick={() => { setRow(row === m.id ? undefined : m.id); ui.addChip({ id: `qcmiss:${t.target}:${m.id}`, label: `QC · ${m.where ?? label} · ${m.sub || m.category}` }); }} />
          ))}
          {!shown(open).length && (
            <div className={cn('border-b border-line text-[12.5px] text-mute', compact ? 'px-4 py-3' : 'px-[18px] py-3.5')}>
              {open.length ? 'No open miss in this category.' : 'No open miss.'}
            </div>
          )}

          {resolved.length > 0 && (
            <>
              <button type="button" aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}
                className={cn('flex w-full cursor-pointer items-center gap-2 border-0 border-b border-line bg-transparent text-left text-[12.5px] font-medium text-ink-3 hover:bg-tile', compact ? 'px-4 py-[11px]' : 'px-[18px] py-[11px]')}>
                <IconChevronRight size={13} className={cn('text-sub transition-transform', showResolved && 'rotate-90')} />
                Resolved earlier <span className="font-normal text-mute">({resolved.length})</span>
              </button>
              {showResolved && shown(resolved).map((m) => (
                <MissRow key={m.id} m={m} compact={compact} openRow={row === m.id} fileOf={fileOf} nine={nine} onClick={() => setRow(row === m.id ? undefined : m.id)} />
              ))}
            </>
          )}

          {/* the rounds run by themselves (the user, 12 Nov): nothing here asks. A button appears only when the user may
              want to push: nothing is running for it, or the three rounds are used up. */}
          <Footer compact={compact} note={t.source ? 'The critic grades it from round 1.'
            : fixing ? `Round ${r.round}: ${fmtScore(r.score ?? 0)} · Alma is applying the fixes · round ${r.round + 1} runs by itself.`
              : lastRound ? (open.length ? `Round ${r.round} of ${QC_MAX_ROUNDS} was the last. What is still open is yours to decide.` : `Round ${r.round} of ${QC_MAX_ROUNDS} was the last.`)
                : open.length ? `Alma applies these and runs round ${r.round + 1} by herself, up to ${QC_MAX_ROUNDS} rounds. Nothing to answer here.`
                  : 'Up to three rounds, or until 8.5.'}>
            {t.source ? (
              <button type="button" onClick={() => void run(1)} className="h-[34px] cursor-pointer whitespace-nowrap rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-bg hover:bg-ink-3">Run QC</button>
            ) : fixing ? (
              <span className="inline-flex h-[34px] items-center gap-2 whitespace-nowrap text-[12.5px] text-ink-3"><span aria-hidden="true" className="dot-run size-2 rounded-full bg-sub" />fixes running</span>
            ) : lastRound && open.length ? (
              <button type="button"
                onClick={() => ui.prefill(`About the ${open.length} QC ${open.length === 1 ? 'miss' : 'misses'} still open on ${label} after round ${r.round} (${open.map((m) => m.id).join(', ')}): `, chip)}
                className="h-[34px] cursor-pointer whitespace-nowrap rounded-lg border border-edge-strong bg-transparent px-3 text-[13px] font-medium text-ink hover:bg-raised">
                Tell Alma what to do with them
              </button>
            ) : !lastRound && open.length ? (
              <button type="button" title="Alma does this by herself; this only asks her to start now if she has not"
                onClick={() => ui.prefill(`Apply the ${open.length} open QC ${open.length === 1 ? 'fix' : 'fixes'} on ${label} (qc/${spec.stage}-${t.target}-r${r.round}.json: ${open.map((m) => m.id).join(', ')}), 0 credits; then run QC round ${r.round + 1} with the recipe at ${recipe}.`, chip)}
                className="h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-medium text-sub hover:text-ink">
                Not started? Nudge Alma
              </button>
            ) : null}
            {/* the lock shows once there is something to lock: a pass with nothing open */}
            {(lockable || r.locked) && (
              <button type="button" disabled={r.locked} aria-disabled={r.locked}
                onClick={() => ui.prefill(`${lockWord ?? 'Lock'} ${label}: QC ${fmtScore(r.score ?? 0)}, round ${r.round}.`, chip)}
                className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-edge-strong bg-transparent px-3 text-[13px] font-medium text-ink hover:bg-raised disabled:cursor-not-allowed disabled:border-edge disabled:text-mute">
                <Lock />{r.locked ? 'Locked' : lockWord ?? 'Lock'}
              </button>
            )}
          </Footer>
        </>
      )}
    </section>
  );
}

function Footer({ children, note, compact }: { children: React.ReactNode; note: string; compact?: boolean }) {
  return (
    <div className={cn('sticky bottom-0 z-[2] mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-edge bg-hdr shadow-[0_-10px_24px_rgba(9,9,11,0.9)]', compact ? 'px-4 py-3' : 'px-[18px] py-3')}>
      <span className="max-w-[300px] text-[12px] leading-normal text-sub max-[760px]:hidden">{note}</span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </div>
  );
}

function FilterBtn({ on, dim, onClick, children }: { on: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('inline-flex h-[26px] flex-none cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[13px] border px-2 text-[11.5px] tabular-nums', on ? 'border-mute bg-raised text-ink' : 'border-line bg-transparent text-sub hover:text-ink', dim && 'opacity-55')}>
      {children}
    </button>
  );
}

/** 0 to 10, the 8.5 mark, one dot per round (hollow when the round gave no score). */
function ScoreTrack({ history }: { history: QCEntry['history'] }) {
  const pos = (s: number | null) => `${((s ?? 0) / 10) * 100}%`;
  const last = history.length - 1;
  return (
    <div className="relative h-[50px] min-w-0" role="img" aria-label={history.map((h) => `round ${h.round} ${h.score === null ? 'no score' : fmtScore(h.score)}`).join(', ')}>
      <span className="absolute inset-x-0 top-[21px] h-1 rounded-sm bg-line" />
      <span className="absolute right-0 top-[21px] h-1 rounded-r-sm bg-edge" style={{ left: '85%' }} />
      <span className="absolute top-[13px] -ml-px h-5 w-0.5 rounded-[1px] bg-ink" style={{ left: '85%' }} />
      <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] text-ink-3" style={{ left: '85%' }}>lock {QC_LOCK_SCORE}</span>
      <span className="absolute right-0 top-0 text-[10.5px] text-faint">10</span>
      {history.map((h, i) => {
        const latest = i === last;
        // an earlier label is shown only when it does not crowd the next dot
        const next = history[i + 1];
        const crowded = !latest && next && Math.abs((next.score ?? 0) - (h.score ?? 0)) < 1.6;
        const hollow = h.score === null;
        return (
          <span key={h.round}>
            <span title={`round ${h.round} · ${hollow ? 'no score' : fmtScore(h.score!)}`}
              className={cn('absolute box-border rounded-full', hollow ? 'top-[18px] size-2.5 border-[1.5px] border-mute bg-well' : latest ? 'top-[17px] -ml-1.5 size-3 bg-ink shadow-[0_0_0_3px_#0C0C0E]' : 'top-[18px] -ml-[5px] size-2.5 bg-sub shadow-[0_0_0_3px_#0C0C0E]')}
              style={{ left: pos(h.score) }} />
            {!crowded && (
              <span className={cn('absolute top-8 whitespace-nowrap text-[10.5px] tabular-nums', latest ? 'text-ink' : 'text-mute', h.score === null || (h.score ?? 0) < 1 ? '' : '-translate-x-1/2')} style={{ left: pos(h.score) }}>
                round {h.round} · {hollow ? 'no score' : fmtScore(h.score!)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** A finding's sentences: split at a full stop that ends one, never inside "1.5" or "S5_doctor_helmsman.py". */
function sentences(t: string): string[] {
  return t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/).filter(Boolean);
}
/** The headline of a miss: the critic's own title, else the first sentence of the finding that says something
 *  (an opening "Yes, this can mislead the paid take." answers an earlier round and is skipped). */
function headline(m: QCMiss): { head: string; rest: string[] } {
  const all = sentences(m.finding);
  if (m.title) return { head: m.title, rest: all };
  let i = 0;
  while (i < all.length - 1 && (all[i].length < 28 || /^(yes|no|still|again|as before)\b/i.test(all[i]))) i++;
  const head = all[i] ?? m.finding;
  const cut = head.length > 190 ? `${head.slice(0, head.lastIndexOf(' ', 180))}…` : head;
  return { head: cut, rest: cut === head ? all.filter((_, k) => k !== i) : all };
}

/** One finding as a card that can be read at a glance: where it is, what is wrong in a sentence, the pictures that
 *  show it, and the fix in a line. A click opens the reasoning, the full fix and the files. One layout at every width:
 *  the old three-column row let a long "where" run into the finding. */
function MissRow({ m, compact, openRow, onClick, fileOf, nine }: { m: QCMiss; compact?: boolean; openRow: boolean; onClick: () => void; fileOf: (p: string) => string; nine: boolean }) {
  const hue = QC_HUE[m.category];
  const { head, rest } = headline(m);
  const fixAll = sentences(m.fix);
  const pictures = (m.evidence ?? []).filter((e) => isImagePath(e.path) || isVideoPath(e.path));
  const fixed = m.open
    ? <span className="inline-flex h-[22px] flex-none items-center whitespace-nowrap rounded-[11px] border border-dashed border-sub px-2 text-[11.5px] font-medium text-ink">open</span>
    : <span className="inline-flex max-w-[45%] flex-none items-start gap-1.5 rounded-[11px] border border-edge-strong bg-raised px-2 py-[3px] text-[11.5px] font-medium leading-[1.35] text-ink-3 [overflow-wrap:anywhere]"><Check />{m.fixedIn ?? 'fixed'}</span>;
  return (
    <div className={cn('border-b border-line', m.open ? 'border-l-2 border-l-[#FBBF24]' : '', openRow ? 'bg-tile' : '', compact ? 'px-4 py-3' : 'px-[18px] py-3.5')}>
      <button type="button" aria-expanded={openRow} onClick={onClick} className="flex w-full cursor-pointer flex-col gap-2 border-0 bg-transparent p-0 text-left text-ink">
        {/* where it is and its state */}
        <span className="flex w-full items-start gap-2.5">
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn('inline-flex flex-none items-center gap-[7px] whitespace-nowrap text-[12px] font-medium', m.open ? 'text-ink-2' : 'text-sub')}>
              <span className="size-[7px] flex-none rounded-full" style={{ background: hue, opacity: m.open ? 1 : 0.7 }} />{m.sub || m.category}
            </span>
            {m.where && <span className={cn('min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]', m.open ? 'text-sub' : 'text-mute')}>{m.where}</span>}
          </span>
          {fixed}
          <IconChevronDown size={14} className={cn('mt-1 flex-none text-sub transition-transform', openRow && 'rotate-180')} />
        </span>
        {/* what is wrong, in one sentence */}
        <span className={cn('max-w-[76ch] leading-[1.45]', m.open ? 'text-[14.5px] font-medium text-ink' : 'text-[13.5px] text-ink-3')}>{head}</span>
        {m.risk && m.open && <span className="max-w-[76ch] text-[12.5px] leading-[1.45] text-ink-3"><span className="text-sub">If left: </span>{m.risk}</span>}
        {/* the fix, in a line */}
        {!openRow && fixAll.length > 0 && (
          <span className="flex max-w-[76ch] gap-[7px] text-[12.5px] leading-[1.45] text-sub">
            <Arrow className="mt-[3px] flex-none text-mute" /><span className="line-clamp-2"><span className="font-medium text-ink-3">Fix: </span>{fixAll[0]}</span>
          </span>
        )}
      </button>
      {/* the pictures that show it: a click opens one full screen */}
      {pictures.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {pictures.slice(0, openRow ? 24 : 6).map((e) => (
            <span key={e.path} className="flex flex-col gap-1" title={`${e.note} · ${e.path}`}>
              <Media path={fileOf(e.path)} w={320} t={0.5} play={isVideoPath(e.path)} alt={e.note || e.path.split('/').pop()} missingLabel={e.path.split('/').pop()}
                className={cn('box-border rounded-[5px] border border-edge bg-raised', nine ? 'h-[128px] w-[72px]' : 'h-[72px] w-[128px]')} />
              {e.note && <span className={cn('truncate text-[10.5px] text-sub', nine ? 'max-w-[72px]' : 'max-w-[128px]')}>{e.note}</span>}
            </span>
          ))}
          {!openRow && pictures.length > 6 && <span className="self-center text-[11.5px] text-mute">+{pictures.length - 6} more</span>}
        </div>
      )}
      <Reveal open={openRow}>
        <div className="flex max-w-[76ch] flex-col gap-3 pt-3">
          {rest.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="lbl">How the critic got there</span>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {rest.map((x, i) => <li key={i} className="text-[13px] leading-[1.5] text-ink-3">{x}</li>)}
              </ul>
            </div>
          )}
          {fixAll.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="lbl">The fix, step by step</span>
              <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">
                {fixAll.map((x, i) => <li key={i} className="text-[13px] leading-[1.5] text-ink-3 [overflow-wrap:anywhere]">{x}</li>)}
              </ol>
            </div>
          )}
          {(m.evidence?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <span className="lbl">Files</span>
              <span className="flex flex-col gap-0.5 font-mono text-[11px] leading-normal text-sub">
                {m.evidence!.map((e) => <span key={e.path} className="[overflow-wrap:anywhere]">{e.path}{e.note ? ` · ${e.note}` : ''}</span>)}
              </span>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
