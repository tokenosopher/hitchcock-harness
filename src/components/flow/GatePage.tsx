'use client';
// "Waiting for you" (Main, the default page while anything waits): one list of the cards that ask the user to choose,
// Alma's asking cards and the picks whose round landed together, the most important first (waitList.ts
// byImportance). What is still being made is one quiet line, no card; each step's own page shows its work.
// A pick is the one thing a button does itself (build step 2): a candidate tile selects it to look at, "Pick X" (or
// "Choose this one" in the full-screen view) sets it aside, and "Done picking" writes it and tells Alma. Everything that would spend credits still only puts its ask in the composer, as a chip (SPEC principle 1). design/boards/Main.dc.html.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { storyWait, type GateItem, type ReleaseWait, type StoryWait } from '@/components/lib/derive';
import { CHAIN_A, CHAIN_B, ORDER, runningSummary, type Flow } from '@/components/lib/flow';
import { Reveal } from '@/components/shell/Reveal';
import { capital, fmtDate, repoPath, word } from '@/components/lib/format';
import { useFilm } from '@/components/data/film';
import { useUIActions } from '@/components/data/ui';
import { Media } from '@/components/media/Media';
import { Badge, Btn, Dot, type DotState } from '@/components/shell/atoms';
import { IconBookmark } from '@/components/shell/icons';
import { FromLibrary } from '@/components/library/FromLibrary';
import { choosePick, pickChoiceId, PickButton, SaveButton } from '@/components/library/PickButton';
import { choose, unchoose, useChoice } from '@/components/data/choices';
import { ClearChoice } from '@/components/shell/ClearChoice';
import { removeChoiceId, waitMark } from '@/components/lib/remove';
import { approvalChoiceId } from '@/components/lib/approve';
import type { LibraryKind, PickBody } from '@/components/library/data';
import type { FilmState } from '@/server/types';
import { cn } from '@/lib/utils';
import { AskCard } from '@/components/feed/Feed';
import { Who } from '@/components/feed/Who';
import { SheetVoice } from '@/components/characters/SheetVoice';
import { castBoxLines } from '@/components/characters/Cards';
import { VoiceRounds } from './VoiceOptions';
import { StepIntro } from '@/components/intro/StepIntro';
import { beingMade, waitItemsOf, type WaitItem } from './waitList';
import { useKept } from './useKept';
import { refData } from '@/components/lib/refPick';
import type { InlineRef } from '@/lib/refs';

/** A pick, a go or a lock the gate asks for, as a card for Alma's message box (Option-click). */
const GATE_PLACE: Record<GateItem['kind'], string> = { face: 'faces', master: 'loc', voices: 'voices', clothing: 'clothing', sheet: 'sheet', prop: 'loc', go: 'scenes' };
const gateRefOf = (p: GateItem): InlineRef => ({ kind: 'card', label: p.chip, card: p.key, place: GATE_PLACE[p.kind], title: p.title });

function stateDot(st: GateItem['state']): DotState {
  return st === 'running' ? 'running' : st === 'ready' ? 'done' : st === 'queued' ? 'queued' : 'waiting';
}

export function PickCard({ p, onChip, onPrefill, from = 'the gate page', voices }: { p: GateItem; onChip: (id: string, label: string) => void; onPrefill: (t: string, id: string, label: string) => void; from?: string; voices?: string[] }) {
  const [sel, setSel] = useState<string | undefined>(p.prediction);
  const ui = useUIActions();
  const state = useFilm().state;
  const film = state?.film;
  const sheetPath = p.kind === 'sheet' ? state?.characters.find((c) => c.id === p.id)?.sheet?.path : undefined;
  const [tab, setTab] = useState<'round' | 'lib'>('round');
  const ready = p.state === 'ready';
  const wait = p.state === 'waiting';
  const all = p.round?.candidates.filter((c) => c.path) ?? [];
  const shown = all.slice(0, 16);
  const badge = ready ? 'Ready' : wait ? 'Waiting' : p.state === 'queued' ? 'Queued' : 'Running';
  // a character's voice card is the voices to hear and choose, nothing more
  const tabs = ready && (p.kind === 'face' || p.kind === 'master');
  const target = p.id || p.title;
  // what the pick route calls each gate item, and the library kind its candidates belong to
  const pickKind: PickBody['kind'] | undefined = ({ face: 'face', master: 'location', clothing: 'wardrobe', prop: 'prop' } as const)[p.kind as 'face' | 'master' | 'clothing' | 'prop'];
  const libKind: LibraryKind | undefined = p.kind === 'face' ? 'face' : p.kind === 'master' ? 'location' : undefined;
  // the candidate set aside for Done picking, if any (the tile is only selected to look at until then)
  const setAside = useChoice(film?.slug ?? '', pickKind ? pickChoiceId({ kind: pickKind, target }) : '')?.pick?.candidate;
  // a sheet's yes set aside for Done picking
  const sheetYes = !!useChoice(film?.slug ?? '', p.kind === 'sheet' ? approvalChoiceId({ id: p.id }) : '');
  const saveRef = (id: string) => p.round?.candidates.find((c) => c.id === id)?.path;
  return (
    <article {...refData(gateRefOf(p))} className={cn('flex min-w-0 flex-col gap-3 rounded-[10px] border bg-well px-4 py-3.5', wait ? 'border-dashed border-edge-strong' : 'border-edge')}>
      <button type="button" onClick={() => onChip(p.key, p.chip)} aria-label={`Add ${p.chip} to what Alma sees`} className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <Dot state={stateDot(p.state)} />
          {p.id && <span className="font-mono text-[12px] text-sub">{p.id}</span>}
          <span className="truncate text-[14px] font-medium">{p.title}</span>
          <Badge dashed={wait} dim={!ready}>{badge}</Badge>
        </span>
        <span className="flex items-baseline justify-between gap-3 pl-3.5 text-[12.5px] leading-normal text-sub">
          <span>{p.meta}</span>
          <span className="whitespace-nowrap text-[12px] tabular-nums">
            {p.state === 'running' && p.progress && p.progress.pending > 0 ? `${p.progress.landed} of ${p.progress.asked} landed` : p.state === 'queued' ? 'queued' : ''}
          </span>
        </span>
        {p.state === 'running' && p.progress && p.progress.pending > 0 && (
          <span className="ml-3.5 mt-1.5 block h-1 overflow-hidden rounded-sm bg-edge">
            <span className="block h-full bg-sub" style={{ width: `${(p.progress.landed / Math.max(1, p.progress.asked)) * 100}%` }} />
          </span>
        )}
        {p.prediction && (
          <span className="pl-3.5 text-[12.5px] leading-normal text-ink-3">
            Alma predicts <span className="font-mono text-[12px] text-ink">{p.prediction}</span><span className="text-sub"> · {p.predictionNote}</span>
          </span>
        )}
      </button>
      {tabs && (
        <div role="tablist" aria-label={`${target} candidates`} className="ml-3.5 flex gap-4 border-b border-line">
          {(['round', 'lib'] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn('-mb-px h-[30px] cursor-pointer border-b-2 text-[12.5px] font-medium', tab === t ? 'border-ink text-ink' : 'border-transparent text-sub')}>
              {t === 'round' ? 'This round' : 'From the library'}
            </button>
          ))}
        </div>
      )}
      {tabs && tab === 'lib' && film && libKind && (
        <div className="pl-3.5"><FromLibrary film={film.slug} kind={libKind} target={target} from={from} /></div>
      )}
      {ready && tab === 'round' && p.kind === 'sheet' && (
        <div className="flex flex-col gap-3 pl-3.5">
          {/* what is being approved: the sheet itself (a click opens it full screen) and who the character is */}
          {state && sheetPath && <Media path={repoPath(state.film.folder, state.film.repo, sheetPath)} w={960} fit="contain" alt={`${p.id} sheet`} className="aspect-[16/9] w-full max-w-[640px] rounded-[8px] border border-edge bg-black" />}
          {state && <Who state={state} ids={[p.id]} face={false} />}
          {/* the sheet is approved as face, clothing and voice together: the voice plays here */}
          {state && <SheetVoice state={state} id={p.id} />}
          <div className="flex flex-wrap items-center gap-2">
            {/* one tap sets the yes aside; "Done picking" sends it with the other choices */}
            {sheetYes ? (
              <span data-chosen className="inline-flex h-8 items-center gap-1.5 text-[12.5px] text-ink duration-200 animate-in fade-in-0"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />Chosen: approve the {p.id} sheet · goes with Done picking</span>
            ) : film && sheetPath ? (
              <Btn primary onClick={() => choose(film.slug, { id: approvalChoiceId({ id: p.id }), label: `Approve · ${p.chip}`, approve: { kind: 'sheet', id: p.id, path: sheetPath } })}>Approve the sheet</Btn>
            ) : (
              <Btn primary onClick={() => onPrefill(`I approve the ${p.id} sheet.`, p.key, `Approve · ${p.chip}`)} title="Puts it in Alma's box; press send there">Approve the sheet</Btn>
            )}
            {film && <ClearChoice shown={sheetYes} onClear={() => unchoose(film.slug, approvalChoiceId({ id: p.id }))} />}
            <Btn onClick={() => ui.about({ id: p.key, label: p.chip }, `the ${p.id} sheet: a change to it`, `What should change in the ${p.id} sheet…`)}>Ask for a change</Btn>
            {film && <Link href={`/films/${film.slug}/character/${p.id}`} className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-sub no-underline hover:text-ink">Open {p.id}</Link>}
          </div>
        </div>
      )}
      {/* each voice heard and picked in the card itself */}
      {p.kind === 'voices' && ready && state && <div className="pl-3.5"><VoiceRounds s={state} from={from} only={voices ?? (p.id ? [p.id] : undefined)} /></div>}
      {/* a row that has nothing to choose yet still leads somewhere */}
      {!ready && film && p.id && (
        <div className="pl-3.5">
          <Link href={/^[LP]/.test(p.id) ? `/films/${film.slug}/locations` : `/films/${film.slug}/character/${p.id}`} className="text-[12.5px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">Open {p.id}</Link>
        </div>
      )}
      {ready && tab === 'round' && p.kind !== 'voices' && shown.length > 0 && (
        <>
          <div data-zoom-set className="scroll strip flex gap-1 overflow-x-auto pb-1 pl-3.5 pr-4 pt-0.5">
            {shown.map((c, i) => {
              const on = c.id === sel;
              return (
                <button key={c.id} type="button" aria-label={`Candidate ${c.id}`} aria-pressed={on} data-zoom-choose data-zoom-chosen={pickKind ? String(setAside === c.id) : undefined}
                  onClick={(e) => {
                    setSel(c.id); onChip(`cand:${target}`, `${target} · ${c.id}`);
                    // "Choose this one" in the full-screen view chooses it as "Pick" does: set aside for Done picking
                    if (e.currentTarget.hasAttribute('data-zoom-from-view') && film && pickKind) choosePick(film.slug, { kind: pickKind, target, round: p.round?.id, candidate: c.id, prediction: p.prediction, from }, `${c.id} for ${target}`);
                  }}
                  className={cn('relative flex h-12 w-9 flex-none cursor-pointer items-end justify-center overflow-hidden rounded-[5px] border pb-1 font-mono text-[9.5px] focus-visible:outline-offset-[-2px]', on ? 'border-sub text-ink outline outline-1 outline-offset-1 outline-ink' : 'border-line text-mute', i % 3 === 0 ? 'bg-bubble' : 'bg-tile')}>
                  {c.path && film && <Media path={repoPath(film.folder, film.repo, c.path)} w={160} missingLabel="" className="absolute inset-0" />}
                  <span className={cn('relative', c.path && film && 'rounded-[3px] bg-black/60 px-0.5 text-ink-3')}>{c.id.split('-').pop()}</span>
                </button>
              );
            })}
            {all.length > 16 && <span aria-label={`${all.length - 16} more candidates`} className="flex h-12 w-9 flex-none items-center justify-center rounded-[5px] border border-dashed border-edge-strong text-[11.5px] font-medium text-sub">+{all.length - 16}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-3.5">
            {film && pickKind && sel ? (
              <PickButton key={sel} film={film.slug} body={{ kind: pickKind, target, round: p.round?.id, candidate: sel, prediction: p.prediction, from }}
                label={<>Pick <span className="font-mono text-[12.5px]">{sel}</span></>} what={`${sel} for ${target}`} />
            ) : (
              <Btn disabled={!sel} onClick={() => sel && onPrefill(`Pick ${sel} for ${target}`, `pick:${target}`, `Pick ${sel} · ${p.chip}`)}>Pick <span className="font-mono text-[12.5px]">{sel ?? '…'}</span></Btn>
            )}
            {sel && film && libKind && saveRef(sel) ? (
              <SaveButton key={`s-${sel}`} film={film.slug} kind={libKind} refPath={saveRef(sel)!} label={<>Save {sel} to the library</>} />
            ) : sel && <Btn ghost onClick={() => onPrefill(`Save ${sel} (${target}) to the library`, `save:${target}`, `Save to the library · ${sel}`)}><IconBookmark size={13} />Save {sel} to the library</Btn>}
          </div>
        </>
      )}
    </article>
  );
}

/** The one hard spend gate: every remaining scene has a checked prompt and no take yet (SPEC principle 7).
 *  Its button opens the review (/films/[film]/go), where the go is sent from. */
export function GoCard({ p, base, onChip }: { p: GateItem; base: string; onChip: (id: string, label: string) => void }) {
  const ui = useUIActions();
  return (
    <article {...refData(gateRefOf(p))} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-edge-strong bg-panel px-4 py-3.5">
      <button type="button" onClick={() => onChip(p.key, p.chip)} aria-label={`Add ${p.chip} to what Alma sees`} className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <Dot state="done" />
          <span className="truncate text-[14px] font-medium">{p.title}</span>
          <Badge>Ready</Badge>
          <span className="ml-auto whitespace-nowrap font-mono text-[11.5px] text-sub">{p.scenes?.join(' ')}</span>
        </span>
        <span className="pl-3.5 text-[12.5px] leading-normal text-sub">{p.meta}</span>
      </button>
      <div className="flex flex-wrap items-center gap-2 pl-3.5">
        {/* the go itself is sent from the review: every scene, its prompt and the exact assets fed in, then the quote */}
        <Link href={`${base}/go`} onClick={() => onChip(p.key, p.chip)} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline hover:bg-ink-3">Review and go</Link>
        <button type="button" onClick={() => ui.about({ id: p.key, label: `Go · ${p.scenes?.join(' ')}` }, `a change before the go for the video (${p.scenes?.join(', ')})`, 'What should change before the go…')} className="inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[13px] font-medium text-sub hover:text-ink">Change something first</button>
      </div>
    </article>
  );
}

/** The script waiting for the user's lock, or the story for their read and settle (derive.ts storyWait): what
 *  the draft is, what goes on in it, from the files, and the way to the Story page, where "Lock vN" (or
 *  "Settle") is. The lock is never given from here: it is the go for the first round of asset work. */
export function StoryWaitCard({ w, base, onChip }: { w: StoryWait; base: string; onChip: (id: string, label: string) => void }) {
  const ui = useUIActions();
  const what = `${w.kind} ${w.version}`;
  return (
    <article data-story-wait={w.kind} {...refData({ kind: 'card', label: `${w.kind.charAt(0).toUpperCase()}${w.kind.slice(1)} ${w.version}`, card: `${w.kind}-${w.version}`, place: 'story', title: `The ${what} waits for you` })} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-edge bg-well px-4 py-3.5">
      <button type="button" onClick={() => onChip(w.key, what)} aria-label={`Add ${what} to what Alma sees`} className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <Dot state="done" />
          <span className="truncate text-[14px] font-medium">{w.title}</span>
          <Badge>{w.kind === 'script' ? 'Your lock' : 'Your read'}</Badge>
        </span>
        <span className="pl-3.5 text-[12.5px] leading-normal text-sub">{w.line}</span>
      </button>
      {/* what goes on in the story, from the files */}
      <div data-story-summary className="ml-3.5 flex max-w-[640px] flex-col gap-1 border-l border-line pl-3 text-[12.5px] leading-normal text-ink-3">
        {w.summary.map((l) => <p key={l} className="m-0">{l}</p>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-3.5">
        <Link href={`${base}/story?tab=${w.kind}`} onClick={() => onChip(w.key, what)} data-story-open
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline hover:bg-ink-3">
          {w.kind === 'script' ? 'Open the script' : 'Open the story'}
        </Link>
        <button type="button" onClick={() => ui.about({ id: w.key, label: what }, `${what}: a change before ${w.kind === 'script' ? 'the lock' : 'the settle'}`, `What should change in ${what}…`)}
          className="inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[13px] font-medium text-sub hover:text-ink">Ask for a change</button>
      </div>
    </article>
  );
}

/** The film waiting for the user to post it (derive.ts releaseWait): what is posted and one button, to the
 *  Release page, where each platform is posted (or tick publishing done in What's next). */
export function ReleaseWaitCard({ w, base, onChip }: { w: ReleaseWait; base: string; onChip: (id: string, label: string) => void }) {
  return (
    <article data-release-wait {...refData({ kind: 'card', label: 'Post the film', card: w.key, place: 'release', title: w.title })} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-edge bg-well px-4 py-3.5">
      <button type="button" onClick={() => onChip(w.key, 'the release')} aria-label="Add the release to what Alma sees" className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
        <span className="flex min-w-0 items-center gap-2">
          <Dot state="done" />
          <span className="truncate text-[14px] font-medium">{w.title}</span>
          <Badge>Your post</Badge>
        </span>
        <span className="pl-3.5 text-[12.5px] leading-normal text-sub">{w.line}</span>
      </button>
      <div className="flex flex-wrap items-center gap-2 pl-3.5">
        <Link href={`${base}/release`} data-release-open
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline hover:bg-ink-3">Open Release</Link>
      </div>
    </article>
  );
}

/** "Remove" at the foot of an entry: one tap sets it aside to come off the list, not answered, and "Done
 *  picking" sends it with the other choices; a second tap, or an answer chosen instead, takes it back. Quiet, at the
 *  edge, so it does not compete with the answers. */
function RemoveToggle({ s, it, set }: { s: FilmState; it: WaitItem; set: boolean }) {
  const film = s.film.slug;
  const id = removeChoiceId(it.key);
  const toggle = () => {
    if (set) { unchoose(film, id); return; }
    const mark = waitMark(it, s);
    choose(film, { id, label: `Remove · ${it.title}`, remove: { key: it.key, title: it.title, ...(mark ? { mark } : {}) } });
  };
  return (
    <div className="flex justify-end pt-1">
      <button type="button" data-remove={it.key} aria-pressed={set} onClick={toggle}
        aria-label={set ? `Keep ${it.title} in Waiting for you` : `Remove ${it.title} from Waiting for you, without answering`}
        className={cn('inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors duration-200', set ? 'text-ink-3 hover:text-ink' : 'text-mute hover:text-ink')}>
        {set ? (
          <span key="set" className="inline-flex items-center gap-1.5 duration-200 animate-in fade-in-0"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />Removed · goes with Done picking · <span className="text-ink underline decoration-edge-strong underline-offset-4">Undo</span></span>
        ) : <span key="unset" className="duration-200 animate-in fade-in-0">Remove</span>}
      </button>
    </div>
  );
}

/** One entry of the list: its card, dimmed while it is set to be removed, and "Remove" at its foot. */
function WaitRow({ s, it, children }: { s: FilmState; it: WaitItem; children: React.ReactNode }) {
  const set = !!useChoice(s.film.slug, removeChoiceId(it.key));
  return (
    <div data-wait-item={it.key} data-removed={set || undefined} className="pb-2.5">
      <div className={cn('transition-opacity duration-200 motion-reduce:transition-none', set && 'opacity-45')}>{children}</div>
      <RemoveToggle s={s} it={it} set={set} />
    </div>
  );
}

/** The steps whose picks the gate collects, in board order. */
const GATE_INPUTS = [...CHAIN_A, ...CHAIN_B];

/** When nothing waits: what Alma is doing (the live sub-agents, else the node in progress on the files). */
function idleLines(s: FilmState, flow: Flow): { title: string; sub: string } {
  const live = runningSummary(flow);
  if (live.length) return { title: `Alma is running ${word(live.length)} ${live.length === 1 ? 'job' : 'jobs'}`, sub: `${live.join(' · ')}. No pick waits for you; each lands here as soon as it is ready.` };
  // a lock or a settle just pressed (lib/sent.ts storySent): Alma's move now, said as such until the files show it
  const sw = storyWait(s, []);
  if (sw?.sent) {
    return { title: `Story · ${flow.nodes.story.status}`, sub: sw.kind === 'script'
      ? `No pick waits for you. Alma locks script ${sw.version} and says so in the thread; the lock starts the places and the people.`
      : `No pick waits for you. Alma writes the script from story ${sw.version}; it comes back here for your lock.` };
  }
  if (s.film.status === 'delivered') {
    // the day the generations started is the day of the earliest take on file
    const first = s.scenes.flatMap((sc) => sc.takes.map((t) => t.date)).filter((d): d is string => !!d).sort()[0];
    return { title: 'The go for the video was given', sub: `Every pick was made before it${first ? `, and the first take is dated ${fmtDate(first)}` : ''}. What went into the gate:` };
  }
  const busy = ORDER.find((k) => k !== 'gate' && flow.nodes[k].state === 'running');
  if (busy) {
    const n = flow.nodes[busy];
    return { title: `${n.name} · ${n.status}`, sub: `No pick waits for you. The files show ${n.name.toLowerCase()} in progress; no sub-agent of this thread is running, so it is running elsewhere (a terminal session) or waiting for Alma's next step.` };
  }
  const next = ORDER.find((k) => k !== 'gate' && flow.nodes[k].state !== 'done' && flow.nodes[k].state !== 'locked');
  if (next) {
    const n = flow.nodes[next];
    return { title: `Next: ${n.num} ${n.name}`, sub: `No pick waits for you and Alma has no job running. ${n.status.trim() ? `${capital(n.status.trim())}; ask` : 'Ask'} Alma to start it.` };
  }
  return { title: 'Every stage has its files', sub: 'No pick waits for you and Alma has no job running.' };
}

export function GatePage({ s, flow, base, onChip, onPrefill }: { s: FilmState; flow: Flow; base: string; onChip: (id: string, label: string) => void; onPrefill: (t: string, id: string, label: string) => void }) {
  // one list of what asks the user to choose, the most important first (waitList.ts, the same list What's next shows);
  // an answered one folds away instead of vanishing
  // the same list while the flow is the same: the kept rows compare it by identity
  const items = useMemo(() => waitItemsOf(flow), [flow]);
  const rows = useKept(items);
  const made = beingMade(flow);
  const working = flow.working;
  // nothing waits, but questions are being worked on: say that, not the next stage
  const idle = items.length ? undefined : working.length
    ? { title: `Nothing waits for you · ${working.length} in progress`, sub: `Alma is working on ${working.length === 1 ? 'a question' : `${working.length} questions`}. ${working.length === 1 ? 'It comes' : 'They come'} back here when she needs your answer.` }
    : idleLines(s, flow);
  const toRepo = (rel: string) => repoPath(s.film.folder, s.film.repo, rel);
  // the people steps in the board's own words ("5 picked, 1 group"), so the list under the gate and the boxes above it
  // count the same characters (QC round two: the board said "5 picked, 1 group", this list "6 of 6 picked")
  const boxWords = castBoxLines(s, flow);
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{idle ? idle.title : `Waiting for you · ${items.length}`}</h1>
        {idle && <span className="text-[13px] leading-normal text-sub">{idle.sub}</span>}
      </div>
      <StepIntro step="gate" width="full" />
      {flow.done && idle && (
        <div className="flex max-w-[560px] flex-col overflow-hidden rounded-[10px] border border-edge bg-well">
          {GATE_INPUTS.map((k, i) => (
            <Link key={k} href={`${base}?open=${k}`} className={cn('flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13px] text-ink no-underline hover:bg-raised', i > 0 && 'border-t border-line')}>
              <span className="font-medium">{flow.nodes[k].name}</span>
              <span className="min-w-0 truncate text-[12.5px] text-sub">{boxWords[k] ?? flow.nodes[k].status}</span>
            </Link>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div data-wait-list className="-mb-2.5 flex flex-col">
          {rows.map(({ it, here }) => {
            const g = it.gate;
            return (
              <Reveal key={it.key} open={here} className="min-w-0">
                <WaitRow s={s} it={it}>
                  {it.story ? <StoryWaitCard w={it.story} base={base} onChip={onChip} />
                    : it.release ? <ReleaseWaitCard w={it.release} base={base} onChip={onChip} />
                    : it.card ? <AskCard film={s.film.slug} card={it.card} toRepo={toRepo} from="the gate on Main" where={<span>{flow.nodes[it.card.place]?.name}</span>} />
                    : g?.kind === 'go' ? <GoCard p={g} base={base} onChip={onChip} />
                    : g ? <PickCard p={g} onChip={onChip} onPrefill={onPrefill} voices={it.voiceIds} /> : null}
                </WaitRow>
              </Reveal>
            );
          })}
        </div>
      )}
      {items.some((i) => i.gate?.prediction) && <p className="m-0 text-[12.5px] leading-normal text-sub">Alma predicts your pick from your earlier picks; every pick is recorded.</p>}
      {/* work still running is no choice yet: one quiet line, no cards */}
      {items.length > 0 && made > 0 && <p data-being-made className="m-0 text-[12.5px] leading-normal text-mute duration-200 animate-in fade-in-0">{made} more being made</p>}
    </>
  );
}
