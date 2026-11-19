// What waits for the user now, as What's next lists it: the things the user has to do (what "Waiting for you" lists),
// not only the steps that come after the edit. Pure: read from the flow (lib/flow.ts flowOf), the same
// reading "Waiting for you" makes (its cards that ask, then its picks), in the same order, so the two lists and their
// counts cannot disagree.
import type { FeedCard, FilmState } from '@/server/types';
import type { GateItem } from '@/components/lib/derive';
import { voiceParts } from '@/components/lib/derive';
import { ORDER, type Flow } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import type { LeftStep, StepId } from '@/components/edit/left';

/** One thing waiting for the user: a card of Alma's that asks, or a pick at the gate. */
export interface WaitItem {
  key: string;
  card?: FeedCard;
  gate?: GateItem;
  /** The flow step it belongs to (a card's page, a pick's step). */
  place: FlowKey;
  /** The question, in its own words. */
  title: string;
  /** What it asks for, in a word or two: "Pick one", "Yes or no", "Your go"; for a pick still being made, its state. */
  word: string;
  /** It can be answered now (a card, a pick whose round has landed, the go). */
  ready: boolean;
  /** For a go: the quote, as written. */
  cost?: string;
  /** One more line: the card's own line under its title, or the pick's round and count. */
  line?: string;
  /** What the answer is, for the steps' line: "your yes", "your go", "your pick". */
  answer: 'your yes' | 'your go' | 'your pick';
  /** The gate's Voices pick, narrowed to the characters no card of Alma's already asks about. */
  voiceIds?: string[];
}

const ASK_WORD = { pick: 'Pick one', yes: 'Yes or no', go: 'Your go' } as const;
const GATE_PLACE: Record<GateItem['kind'], FlowKey> = { face: 'faces', master: 'loc', clothing: 'clothing', sheet: 'sheet', voices: 'voices', prop: 'loc', go: 'scenes' };

/** Every item of "Waiting for you", in its order: Alma's cards that ask (in the order the work goes), then the picks in
 *  the chains, then those at the gate; each question once: where Alma's voice-round card asks about a character, the
 *  gate's Voices pick leaves that character out, and goes when no character is left (What's next only; "Waiting for
 *  you" keeps both). */
export function waitItemsOf(flow: Flow, s: FilmState): WaitItem[] {
  const asks = [...flow.asks].sort((a, b) => ORDER.indexOf(a.place) - ORDER.indexOf(b.place));
  const cards: WaitItem[] = asks.map((c) => {
    const k = c.ask?.kind ?? 'yes';
    return { key: `card:${c.key}`, card: c, place: c.place, title: c.title, word: ASK_WORD[k], ready: true,
      ...(k === 'go' && c.ask?.cost ? { cost: c.ask.cost } : {}), ...(c.sub ? { line: c.sub } : {}),
      answer: k === 'go' ? 'your go' : k === 'pick' ? 'your pick' : 'your yes' };
  });
  const gate = [...flow.gate.filter((g) => g.group === 'chains'), ...flow.gate.filter((g) => g.group === 'gate')];
  const picks: WaitItem[] = gate.map((g) => {
    const ready = g.state === 'ready';
    const word = !ready ? (g.state === 'running' ? 'Being made' : g.state === 'queued' ? 'Queued' : 'Not ready') : g.kind === 'go' ? 'Your go' : g.kind === 'sheet' ? 'Yes or no' : 'Pick one';
    return { key: `gate:${g.key}`, gate: g, place: GATE_PLACE[g.kind], title: g.kind === 'go' ? g.title : `${g.id ? `${g.id} · ` : ''}${g.title}`, word, ready, line: g.meta,
      answer: g.kind === 'go' ? 'your go' : g.kind === 'sheet' ? 'your yes' : 'your pick' };
  });
  return [...cards, ...picks.flatMap((it) => onceVoices(it, flow, s))];
}

/** The gate's Voices pick without the characters whose voice round Alma's own card asks about. */
function onceVoices(it: WaitItem, flow: Flow, s: FilmState): WaitItem[] {
  if (it.gate?.kind !== 'voices' || !it.ready) return [it];
  const ready = voiceParts(s, []).filter((p) => p.state === 'ready' && p.round).map((p) => p.id);
  const carded = new Set(flow.asks.filter((c) => c.place === 'voices' && c.ask?.kind === 'pick').flatMap((c) => c.ids));
  const rest = ready.filter((id) => !carded.has(id));
  if (rest.length === ready.length) return [it];
  if (!rest.length) return [];
  return [{ ...it, voiceIds: rest, line: `${rest.join(' ')} ready; ${ready.filter((id) => carded.has(id)).join(' ')} asked in a card above` }];
}

/** The step of What's next a flow step's question holds up. */
const STEP_OF: Record<FlowKey, StepId> = {
  story: 'script', faces: 'characters', clothing: 'characters', sheet: 'characters', voices: 'characters', elements: 'characters', gate: 'takes',
  loc: 'places', views: 'places', shots: 'shots', previz: 'boards', scenes: 'takes',
  edit: 'approved', finish: 'full', sound: 'sound', release: 'posted',
};

/** Which step each waiting item holds up: its own step while that is still to do and not behind the step to look at;
 *  else the step to look at (what waits holds the film where it is). Only what can be answered now. */
export function waitsByStep(items: WaitItem[], steps: Pick<LeftStep, 'id' | 'done' | 'current'>[]): Map<StepId, WaitItem[]> {
  const out = new Map<StepId, WaitItem[]>();
  const cur = steps.findIndex((s) => s.current);
  if (cur < 0) return out;
  for (const it of items.filter((x) => x.ready)) {
    const i = steps.findIndex((s) => s.id === STEP_OF[it.place]);
    const at = i >= cur && !steps[i].done ? steps[i].id : steps[cur].id;
    out.set(at, [...(out.get(at) ?? []), it]);
  }
  return out;
}

/** The question's title in a few words for the steps' line, without a trailing "approve" ("S1 and S2: the
 *  storyboards v2"). */
const shortTitle = (t: string, n = 46): string => {
  const s = t.replace(/[:,]?\s*(approve|approval)\??\s*$/i, '').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};
/** "Waits for your yes on “S1 and S2: the storyboards v2” and your pick on “C08 the Neighbour: which voice (round 1)”",
 *  two named and the rest counted. */
export function waitsLine(items: WaitItem[]): string {
  const named = items.slice(0, 2).map((x) => `${x.answer} on “${shortTitle(x.title)}”`);
  const more = items.length - named.length;
  const list = more > 0 ? `${named.join(', ')} and ${more} more` : named.join(' and ');
  return `Waits for ${list}`;
}

/** Where a waiting item lives in the app, relative to the film's address (`/films/<film>`): its page, else its step on
 *  the film's board. */
export function itemHref(it: WaitItem, flow: Flow): string {
  const g = it.gate;
  if (g) {
    if (g.kind === 'go') return '/go';
    if (g.kind === 'voices') return '/character/voices';
    if (g.kind === 'master' || g.kind === 'prop') return '/locations';
    return g.id ? `/character/${g.id}` : '/character';
  }
  const href = flow.nodes[it.place]?.href;
  return href ? `/${href}` : `?open=${it.place}`;
}

/** The sounds a waiting item asks the user to choose between: a card's options that are sound files, or the
 *  voices of each round waiting at the gate. Paths relative to the film folder. */
export function soundsOf(it: WaitItem, s: FilmState): { path: string; label: string; key: string }[] {
  const c = it.card;
  if (c?.ask?.kind === 'pick') {
    return c.ask.options.flatMap((o) => {
      const m = c.media.find((x) => x.option === o.id) ?? (o.path ? c.media.find((x) => x.path === o.path) : undefined);
      return m?.kind === 'audio' ? [{ path: m.path, label: optShort(o.id), key: o.id }] : [];
    });
  }
  if (it.gate?.kind === 'voices' && it.ready) {
    const ready = voiceParts(s, []).filter((p) => p.state === 'ready' && p.round && (!it.voiceIds || it.voiceIds.includes(p.id)));
    return ready.flatMap((p) => p.round!.candidates.filter((o) => !!o.path).map((o) => ({ path: o.path!, label: `${ready.length > 1 ? `${p.id} ` : ''}${optShort(o.id)}`, key: `${p.id}:${o.id}` })));
  }
  return [];
}
/** "option-3" and "3" both read "3"; any other id as it is. */
const optShort = (id: string): string => /^(?:option[-\s]?)?(\d+)$/i.exec(id)?.[1] ?? id;
