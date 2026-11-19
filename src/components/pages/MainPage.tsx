'use client';
// Main: the flow board (two chains in parallel, the gate, then the stages in order) and the open node's page
// below it: the gate page while anything waits, else the node in progress. ?open=<node> keeps the choice in the URL.
// design/boards/Main.dc.html. Since ASKS 46 (14 Nov 2026) a row under the flow names what shows below ("Waiting for
// you", and the pressed step beside it); a pressed step shows its content there at once, and a place inside Locations
// or Views opens deeper with ?at=<id>. The change between them fades in; the flow above never moves.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { usePage } from '@/components/data/ui';
import { picksWaiting, type FlowKey } from '@/components/lib/derive';
import { defaultOpen, flowOf, ORDER, type Flow } from '@/components/lib/flow';
import type { FilmState, Stage } from '@/server/types';
import { Header } from '@/components/shell/Header';
import { PageBody, Loading } from '@/components/shell/StageTitle';
import { ReadingNotes } from '@/components/shell/atoms';
import { FlowBoard, glyphOf, type BoardLines, type Glyph } from '@/components/flow/FlowBoard';
import { GatePage } from '@/components/flow/GatePage';
import { NodePage, NodeRight } from '@/components/flow/NodePage';
import { StepBar } from '@/components/flow/StepBar';
import { StepMenu } from '@/components/flow/StepMenu';
import { placeName, placesLine, viewsLine } from '@/components/flow/Places';
import { shotsLine } from '@/components/flow/CutSteps';
import { WhatsNextReader, type WhatsNext } from '@/components/flow/useWhatsNext';
import { waitWords } from '@/components/edit/left';
import { waitItemsOf } from '@/components/flow/waitList';
import { castBoxLines, castLine, type CastPart } from '@/components/characters/Cards';
import { useFilmPage, filmMeta, filmMetaText } from './common';
import { StepIntro } from '@/components/intro/StepIntro';

/** The flow board's node for each stage number. */
const STAGE_NODE: Record<Stage, FlowKey> = {
  1: 'story', 2: 'faces', 3: 'voices', 4: 'loc', 5: 'previz', 6: 'scenes', 7: 'scenes', 8: 'scenes',
  9: 'edit', 10: 'finish', 11: 'sound', 12: 'release',
};

/** The pinned chip's part on Main: "stage 9 · 1 cut", from the stage's node on the flow board, and the picks waiting. */
function stagePinned(stage: Stage | undefined, flow: Flow): string {
  const n = flow.nodes[stage ? STAGE_NODE[stage] : 'story'];
  const parts = [stage ? `stage ${stage}` : n.chip, n.status || n.name];
  if (flow.waiting) parts.push(picksWaiting(flow.waiting));
  return parts.join(' · ');
}

/** The line beside the chips: what the open step shows, in a few words. */
function stepLine(s: FilmState, flow: Flow, k: FlowKey, wn: WhatsNext): string {
  if (k === 'gate') return 'Press a step on the flow to see its content here.';
  if (k === 'loc') return placesLine(s);
  if (k === 'views') return viewsLine(s);
  if (k === 'shots') return shotsLine(s);
  // what waits for the user first, then the steps left, as What's next's tab says it
  if (k === 'edit') { const n = waitItemsOf(flow, s).length; return ["What's next", n ? waitWords(n) : '', wn.view?.count].filter(Boolean).join(' · '); }
  if (k === 'release' && wn.posted) return [flow.nodes.release.status, `${wn.posted.n} of ${wn.posted.of} posted`].filter(Boolean).join(' · ');
  if (k === 'faces' || k === 'clothing' || k === 'sheet' || k === 'voices' || k === 'elements') return castLine(s, k as CastPart);
  return flow.nodes[k].status;
}

export function MainPage() {
  const { state, error, tasks, ui, base } = useFilmPage();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const flow = useMemo(() => (state ? flowOf(state, tasks) : undefined), [state, tasks]);
  const asked = params.get('open') as FlowKey | null;
  const open: FlowKey = asked && ORDER.includes(asked) ? asked : flow ? defaultOpen(flow) : 'gate';
  const at = (open === 'loc' || open === 'views') ? params.get('at') ?? undefined : undefined;

  const firstReady = flow?.gate.find((i) => i.state === 'ready' && i.prediction);
  const go = flow?.gate.find((i) => i.kind === 'go');
  const running = flow?.gate.find((i) => i.kind === 'master' && i.state === 'running');
  usePage(state && flow ? stagePinned(state.film.stage, flow) : undefined, undefined, [
    ...(go ? ['Go for the video'] : []),
    ...(firstReady ? [`Pick ${firstReady.prediction} for ${firstReady.id}`] : []),
    ...(running ? [`Show ${running.id} so far`] : []),
  ].slice(0, 2), ['What did this film cost?', 'What was redone, and why?']);
  const [wn, setWn] = useState<WhatsNext>({});
  const onRead = useCallback((w: WhatsNext) => setWn(w), []);
  const lines = useMemo(() => (state && flow ? boardLines(state, flow, wn) : undefined), [state, flow, wn]);
  if (!state || !flow) return <Loading error={error} />;

  const onOpen = (k: FlowKey) => {
    router.replace(`${pathname}?open=${k}`, { scroll: false });
    ui.addChip({ id: 'node', label: flow.nodes[k].chip });
  };
  // one place is its own page (as a character is): opening it adds to the browser's history, so Back returns to the
  // step it was opened from (QC round two); pressing steps replaces the address, as tabs do
  const onAt = (id: string) => router.push(`${pathname}?open=${open}&at=${encodeURIComponent(id)}`, { scroll: false });
  const place = at ? state.locations.find((l) => l.id === at) : undefined;
  const chip = (id: string, label: string, ref?: string) => ui.addChip({ id, label, ref });
  const prefill = (t: string, id: string, label: string) => ui.prefill(t, { id, label });
  const n = flow.nodes[open];

  return (
    <>
      {/* What's next for the Edit box, from the script on (15 Nov: before the takes it names the early step to do) */}
      <WhatsNextReader s={state} onRead={onRead} />
      {/* one place, deeper, is its own page as drawn (FlowLocation): the way back and the trail in the header, no board */}
      {place ? (
        <Header crumbs={[{ label: state.film.title, href: base }, { label: n.name, node: <StepMenu flow={flow} base={base} label={n.name} g={glyphOf(n.state)} /> }, { label: placeName(place.name) }]}
          back={{ label: `Back to ${n.name}`, href: `${pathname}?open=${open}` }} phoneSub={n.name} />
      ) : (
        <Header crumbs={[{ label: 'Films' }, { label: state.film.title }]} meta={filmMeta(state)} phoneSub={filmMetaText(state).split(' · ').slice(2).join(' · ')} />
      )}
      {!place && <div className="duration-200 animate-in fade-in-0"><FlowBoard flow={flow} open={open} onOpen={onOpen} lines={lines} /></div>}
      <PageBody>
        <StepIntro key={open} step={open} className="duration-200 animate-in fade-in-0 motion-reduce:animate-none" />
        <StepBar waiting={flow.waiting} step={open === 'gate' ? undefined : n.name} line={place ? undefined : stepLine(state, flow, open, wn)} deep={!!place}
          right={place || open === 'gate' ? undefined : <NodeRight s={state} n={n} base={base} />}
          back={place ? `Back to ${n.name}` : undefined} backPhoneOnly onBack={() => onOpen(open)} onWaiting={() => onOpen('gate')} />
        {/* a new step or place fades in; the flow above stays where it is */}
        <div key={`${open}:${place?.id ?? ''}`} data-step-view={open} aria-label={open === 'gate' ? 'Your picks' : n.name} role="region"
          className="flex flex-col gap-5 duration-200 ease-out animate-in fade-in-0 motion-reduce:animate-none">
          {open === 'gate'
            ? <GatePage s={state} flow={flow} base={base} onChip={chip} onPrefill={prefill} />
            : <NodePage s={state} n={n} base={base} onChip={chip} at={place?.id} onAt={onAt} />}
        </div>
        <ReadingNotes notes={state.warnings} />
      </PageBody>
    </>
  );
}

/** The board's own words where the drawn board says more than a node's short line: the people boxes from the same
 *  Characters cards, Edit's two lines and Release's posts from What's next. */
function boardLines(s: FilmState, flow: Flow, wn: WhatsNext): BoardLines {
  const N = flow.nodes;
  const withTakes = s.scenes.filter((sc) => sc.takes.some((t) => t.kind === 'take' && t.path)).length;
  const editG: Glyph = !s.scenes.length || !withTakes ? glyphOf(N.edit.state) === 'run' ? 'run' : 'todo' : withTakes === s.scenes.length ? 'done' : 'run';
  const edit0: { line: string; g: Glyph } = s.scenes.length && withTakes ? { line: `${withTakes} of ${s.scenes.length} scenes have takes`, g: editG } : { line: N.edit.short || 'not yet', g: editG };
  // a card that asks about the edit, the scenes, the finish or the sound waits in Edit's box (they are inside it now)
  const asking = flow.asks.filter((c) => c.place === 'edit' || c.place === 'scenes' || c.place === 'finish' || c.place === 'sound').length;
  const running = [N.scenes, N.finish, N.sound].some((x) => x.state === 'running');
  const edit = asking ? { line: `${asking === 1 ? '1 waits' : `${asking} wait`} for you · ${edit0.line}`, g: 'now' as const } : running && edit0.g !== 'now' ? { ...edit0, g: 'run' as const } : edit0;
  const p = wn.posted;
  const delivered = s.film.status === 'delivered';
  const release: BoardLines['release'] = p
    ? { line: `${p.n} of ${p.of} posted`, g: p.n >= p.of ? 'done' : wn.view?.current === 'posted' ? 'now' : 'todo' }
    : { line: N.release.short || 'not yet', g: delivered ? 'done' : 'todo' };
  return { box: castBoxLines(s, flow), edit, next: wn.next, release };
}
