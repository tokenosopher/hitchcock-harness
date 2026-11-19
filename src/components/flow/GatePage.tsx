'use client';
// The gate page (Main, the default page while anything waits): the inbox of every pick waiting for the user,
// "In the chains" (face picks, master picks) and "At the gate" (voices, the rest, and the go for the video).
// A pick is the one thing a button does itself (build step 2): two steps in the card, then the pick route writes
// it and tells Alma. Everything that would spend credits still prefills the composer (SPEC principle 1). design/boards/Main.dc.html.
import Link from 'next/link';
import { useState } from 'react';
import type { GateItem } from '@/components/lib/derive';
import { CHAIN_A, CHAIN_B, ORDER, runningSummary, type Flow } from '@/components/lib/flow';
import { capital, fmtDate, repoPath, word } from '@/components/lib/format';
import { useFilm } from '@/components/data/film';
import { Media } from '@/components/media/Media';
import { Badge, Btn, Dot, type DotState } from '@/components/shell/atoms';
import { IconBookmark } from '@/components/shell/icons';
import { FromLibrary } from '@/components/library/FromLibrary';
import { PickButton, SaveButton } from '@/components/library/PickButton';
import type { LibraryKind, PickBody } from '@/components/library/data';
import type { FilmState } from '@/server/types';
import { cn } from '@/lib/utils';
import { AskCard } from '@/components/feed/Feed';
import { Who } from '@/components/feed/Who';
import { castBoxLines } from '@/components/characters/Cards';
import { VoiceRounds } from './VoiceOptions';
import { StepIntro } from '@/components/intro/StepIntro';

function stateDot(st: GateItem['state']): DotState {
  return st === 'running' ? 'running' : st === 'ready' ? 'done' : st === 'queued' ? 'queued' : 'waiting';
}

export function PickCard({ p, onChip, onPrefill, from = 'the gate page', voices }: { p: GateItem; onChip: (id: string, label: string) => void; onPrefill: (t: string, id: string, label: string) => void; from?: string; voices?: string[] }) {
  const [sel, setSel] = useState<string | undefined>(p.prediction);
  const state = useFilm().state;
  const film = state?.film;
  const sheetPath = p.kind === 'sheet' ? state?.characters.find((c) => c.id === p.id)?.sheet?.path : undefined;
  const [tab, setTab] = useState<'round' | 'lib'>('round');
  const ready = p.state === 'ready';
  const wait = p.state === 'waiting';
  const all = p.round?.candidates.filter((c) => c.path) ?? [];
  const shown = all.slice(0, 16);
  const badge = ready ? 'Ready' : wait ? 'Waiting' : p.state === 'queued' ? 'Queued' : 'Running';
  const tabs = (ready && (p.kind === 'face' || p.kind === 'master')) || p.kind === 'voices';
  const target = p.id || p.title;
  // what the pick route calls each gate item, and the library kind its candidates belong to
  const pickKind: PickBody['kind'] | undefined = ({ face: 'face', master: 'location', clothing: 'wardrobe', prop: 'prop' } as const)[p.kind as 'face' | 'master' | 'clothing' | 'prop'];
  const libKind: LibraryKind | undefined = p.kind === 'face' ? 'face' : p.kind === 'master' ? 'location' : undefined;
  const saveRef = (id: string) => p.round?.candidates.find((c) => c.id === id)?.path;
  return (
    <article className={cn('flex min-w-0 flex-col gap-3 rounded-[10px] border bg-well px-4 py-3.5', wait ? 'border-dashed border-edge-strong' : 'border-edge')}>
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
      {tabs && tab === 'lib' && p.kind === 'voices' && film && (
        <span className="pl-3.5 text-[12.5px] text-ink-3">A library voice is chosen per character: <Link href={`/films/${film.slug}/character/voices`} className="text-ink">open Voices</Link>, pick the character, then its “From the library” tab.</span>
      )}
      {ready && tab === 'round' && p.kind === 'sheet' && (
        <div className="flex flex-col gap-3 pl-3.5">
          {/* what is being approved: the sheet itself (a click opens it full screen) and who the character is */}
          {state && sheetPath && <Media path={repoPath(state.film.folder, state.film.repo, sheetPath)} w={960} fit="contain" alt={`${p.id} sheet`} className="aspect-[16/9] w-full max-w-[640px] rounded-[8px] border border-edge bg-black" />}
          {state && <Who state={state} ids={[p.id]} face={false} />}
          <div className="flex flex-wrap items-center gap-2">
            <Btn primary onClick={() => onPrefill(`I approve the ${p.id} sheet.`, p.key, p.chip)} title="Puts the words in Alma's box; press send there">Approve the sheet</Btn>
            <Btn onClick={() => onPrefill(`About the ${p.id} sheet: `, p.key, p.chip)}>Ask for a change</Btn>
            {film && <Link href={`/films/${film.slug}/character/${p.id}`} className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-sub no-underline hover:text-ink">Open {p.id}</Link>}
          </div>
        </div>
      )}
      {/* each voice heard and picked in the card itself */}
      {p.kind === 'voices' && ready && tab === 'round' && state && <div className="pl-3.5"><VoiceRounds s={state} from={from} only={voices} /></div>}
      {p.kind === 'voices' && film && tab === 'round' && (
        <div className="pl-3.5"><Link href={`/films/${film.slug}/character/voices`} className="inline-flex h-8 items-center rounded-lg border border-edge-strong px-3 text-[13px] font-medium text-ink no-underline hover:bg-raised">Open Voices</Link></div>
      )}
      {/* a row that has nothing to choose yet still leads somewhere */}
      {!ready && film && p.id && (
        <div className="pl-3.5">
          <Link href={/^[LP]/.test(p.id) ? `/films/${film.slug}/locations` : `/films/${film.slug}/character/${p.id}`} className="text-[12.5px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">Open {p.id}</Link>
        </div>
      )}
      {ready && tab === 'round' && shown.length > 0 && (
        <>
          <div className="scroll strip flex gap-1 overflow-x-auto pb-1 pl-3.5 pr-4 pt-0.5">
            {shown.map((c, i) => {
              const on = c.id === sel;
              return (
                <button key={c.id} type="button" aria-label={`Candidate ${c.id}`} aria-pressed={on}
                  onClick={() => { setSel(c.id); onChip(`cand:${target}`, `${target} · ${c.id}`); }}
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
              <Btn disabled={!sel} onClick={() => sel && onPrefill(`Pick ${sel} for ${target}`, `pick:${target}`, p.chip)}>Pick <span className="font-mono text-[12.5px]">{sel ?? '…'}</span></Btn>
            )}
            {sel && film && libKind && saveRef(sel) ? (
              <SaveButton key={`s-${sel}`} film={film.slug} kind={libKind} refPath={saveRef(sel)!} label={<>Save {sel} to the library</>} />
            ) : sel && <Btn ghost onClick={() => onPrefill(`Save ${sel} (${target}) to the library`, `save:${target}`, `save ${sel}`)}><IconBookmark size={13} />Save {sel} to the library</Btn>}
          </div>
        </>
      )}
    </article>
  );
}

/** The one hard spend gate: every remaining scene has a checked prompt and no take yet (SPEC principle 7).
 *  Its button opens the review (/films/[film]/go), where the go is sent from. */
export function GoCard({ p, base, onChip, onPrefill }: { p: GateItem; base: string; onChip: (id: string, label: string) => void; onPrefill: (t: string, id: string, label: string) => void }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-edge-strong bg-panel px-4 py-3.5">
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
        <button type="button" onClick={() => onPrefill(`Before the go for the video (${p.scenes?.join(', ')}), change: `, p.key, `Go · ${p.scenes?.join(' ')}`)} className="inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[13px] font-medium text-sub hover:text-ink">Change something first</button>
      </div>
    </article>
  );
}

/** The steps whose picks the gate collects, in board order. */
const GATE_INPUTS = [...CHAIN_A, ...CHAIN_B];

/** When nothing waits: what Alma is doing (the live sub-agents, else the node in progress on the files). */
function idleLines(s: FilmState, flow: Flow): { title: string; sub: string } {
  const live = runningSummary(flow);
  if (live.length) return { title: `Alma is running ${word(live.length)} ${live.length === 1 ? 'job' : 'jobs'}`, sub: `${live.join(' · ')}. No pick waits for you; each lands here as soon as it is ready.` };
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
  const items = flow.gate;
  const ready = items.filter((i) => i.state === 'ready');
  const chains = items.filter((i) => i.group === 'chains');
  const gate = items.filter((i) => i.group === 'gate');
  const locNames = s.locations.filter((l) => chains.some((c) => c.id === l.id)).map((l) => l.id);
  // in the order the work goes: a character's face before their voice
  const asks = [...flow.asks].sort((a, b) => ORDER.indexOf(a.place) - ORDER.indexOf(b.place));
  const working = flow.working;
  // nothing waits, but questions are being worked on: say that, not the next stage
  const idle = flow.waiting ? undefined : working.length
    ? { title: `Nothing waits for you · ${working.length} in progress`, sub: `Alma is working on ${working.length === 1 ? 'the question' : `the ${working.length} questions`} below. ${working.length === 1 ? 'It comes' : 'They come'} back here when she needs your answer.` }
    : idleLines(s, flow);
  const toRepo = (rel: string) => repoPath(s.film.folder, s.film.repo, rel);
  // the people steps in the board's own words ("5 picked, 1 group"), so the list under the gate and the boxes above it
  // count the same characters (QC round two: the board said "5 picked, 1 group", this list "6 of 6 picked")
  const boxWords = castBoxLines(s, flow);
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="lbl">Gate · where both chains meet</span>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{idle ? idle.title : asks.length ? `Waiting for you · ${flow.waiting}` : `Picks waiting · ${items.length}`}</h1>
        <span className="text-[13px] leading-normal text-sub">
          {idle ? idle.sub
            : !items.length ? `Alma asked and waits for your answer. ${asks.length === 1 ? 'It is' : 'Each is'} also on the page of the work it belongs to.`
            : items.every((i) => i.kind === 'go')
              ? 'Every pick in the chains is made. The go for the video is the one hard spend gate: review every scene, its prompt and the assets fed in, read the quote, then say go.'
              : `Faces and the master are picked inside the chains as they land; the gate holds the voices and anything still unpicked. ${ready.length ? `${capital(word(ready.length))} ${ready.length === 1 ? 'is' : 'are'} ready now.` : 'None is ready yet.'}`}
        </span>
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
      {asks.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="lbl">Alma asks</span><span className="text-[12px] text-mute">rounds to pick from · a yes · the go for a quoted job</span></div>
          {asks.map((c) => <AskCard key={c.key} film={s.film.slug} card={c} toRepo={toRepo} from="the gate on Main" where={<span>{flow.nodes[c.place]?.name}</span>} />)}
        </div>
      )}
      {working.length > 0 && (
        <div className={cn('flex flex-col gap-2.5', asks.length > 0 && 'pt-2.5')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="lbl">In progress · {working.length}</span><span className="text-[12px] text-mute">being worked on, not waiting for you · the options are locked</span></div>
          {working.map((c) => <AskCard key={c.key} film={s.film.slug} card={c} toRepo={toRepo} from="the gate on Main" where={<span>{flow.nodes[c.place]?.name}</span>} />)}
        </div>
      )}
      {[{ label: 'In the chains', sub: `face pick per character · master pick${locNames.length === 1 ? ` for ${locNames[0]}` : ' per location'}`, list: chains },
        { label: 'At the gate', sub: 'voices and anything still unpicked · the go for the video', list: gate }]
        .filter((g) => g.list.length)
        .map((g, i) => (
          <div key={g.label} className={cn('flex flex-col gap-2.5', (i > 0 || asks.length > 0) && 'pt-2.5')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="lbl">{g.label}</span><span className="text-[12px] text-mute">{g.sub}</span></div>
            {g.list.map((p) => (p.kind === 'go'
              ? <GoCard key={p.key} p={p} base={base} onChip={onChip} onPrefill={onPrefill} />
              : <PickCard key={p.key} p={p} onChip={onChip} onPrefill={onPrefill} />))}
          </div>
        ))}
      {items.some((i) => i.prediction) && <p className="m-0 text-[12.5px] leading-normal text-sub">Alma predicts your pick from your earlier picks; every pick is recorded.</p>}
    </>
  );
}
