// What waits for the user now, as What's next lists it: the things the user has to do (what "Waiting for you" lists),
// not only the steps that come after the edit. Pure: read from the flow (lib/flow.ts flowOf), the same list "Waiting
// for you" shows (GatePage reads it from here): only what asks the user to choose, the most important first
// (byImportance), so the two lists, their order and their counts cannot disagree.
import type { FeedCard, FilmState } from '@/server/types';
import type { GateItem, StoryWait } from '@/components/lib/derive';
import { gateChoices, voiceParts } from '@/components/lib/derive';
import { ORDER, type Flow } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import type { LeftStep, StepId } from '@/components/edit/left';

/** One thing waiting for the user: the story or the script waiting on them, a card of Alma's that asks, or a pick at
 *  the gate. */
export interface WaitItem {
  key: string;
  card?: FeedCard;
  gate?: GateItem;
  /** The script waiting for the user's lock, or the story for their read and settle (derive.ts storyWait). */
  story?: StoryWait;
  /** The flow step it belongs to (a card's page, a pick's step). */
  place: FlowKey;
  /** The question, in its own words. */
  title: string;
  /** What it asks for, in a word or two: "Pick one", "Yes or no", "Your go", "Your lock", "Settle". */
  word: string;
  /** It can be answered now: always, since only choices are listed. */
  ready: boolean;
  /** For a go: the quote, as written. */
  cost?: string;
  /** One more line: the card's own line under its title, or the pick's round and count. */
  line?: string;
  /** What the answer is, for the steps' line: "your yes", "your go", "your pick", "your lock", "your read". */
  answer: 'your yes' | 'your go' | 'your pick' | 'your answer' | 'your lock' | 'your read';
  /** A character's voice pick at the gate: its character (one card per character). */
  voiceIds?: string[];
}

const ASK_WORD = { pick: 'Pick one', yes: 'Yes or no', go: 'Your go', why: 'Why?', debrief: 'Your answers' } as const;
const GATE_PLACE: Record<GateItem['kind'], FlowKey> = { face: 'faces', master: 'loc', clothing: 'clothing', sheet: 'sheet', voices: 'voices', prop: 'loc', go: 'scenes' };

/** What the most later work waits on comes first: the story, the locations
 *  and their masters, the faces, the clothing, the sheets, the voices, then the props, then every other step in the
 *  order the work goes (ORDER); the go for the video last. */
const FIRST: (FlowKey | 'prop')[] = ['story', 'loc', 'faces', 'clothing', 'sheet', 'voices', 'prop'];
const REST = ORDER.filter((k) => !FIRST.includes(k));
const RANK: (FlowKey | 'prop')[] = [...FIRST, ...REST];

/** An item's rank in "Waiting for you": its step's place in RANK (a prop pick ranks as a prop, not as its location);
 *  the go for the video after everything. Lower comes first. */
export function waitRank(it: Pick<WaitItem, 'place' | 'gate'>): number {
  if (it.gate?.kind === 'go') return RANK.length;
  const i = RANK.indexOf(it.gate?.kind === 'prop' ? 'prop' : it.place);
  return i < 0 ? RANK.length - 1 : i;
}

/** The items by importance (waitRank); equal ranks keep the order they came in. */
export function byImportance<T extends Pick<WaitItem, 'place' | 'gate'>>(items: T[]): T[] {
  return items.map((it, i) => ({ it, i, r: waitRank(it) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.it);
}

/** Every item of "Waiting for you", in its order: only what asks the user to choose now (the script waiting for
 *  their lock or the story for their read, Alma's cards that ask, and the gate's picks whose round landed:
 *  gateChoices), each question once (a character's voice pick goes where Alma's card at Voices asks it), ordered by
 *  importance (byImportance; the story first). The page and What's next list exactly these; their keys are derive.ts
 *  waitingKeys, which the sidebar's white dot and the server's count of every film go by. */
export function waitItemsOf(flow: Flow): WaitItem[] {
  const st = flow.story;
  const story: WaitItem[] = st ? [{ key: st.key, story: st, place: 'story', title: st.title, line: st.line, ready: true,
    ...(st.kind === 'script' ? { word: 'Your lock', answer: 'your lock' as const } : { word: 'Settle', answer: 'your read' as const }) }] : [];
  const cards: WaitItem[] = flow.asks.map((c) => {
    const k = c.ask?.kind ?? 'yes';
    return { key: `card:${c.key}`, card: c, place: c.place, title: c.title, word: c.sounds?.length ? 'Pick each' : ASK_WORD[k], ready: true,
      ...(k === 'go' && c.ask?.cost ? { cost: c.ask.cost } : {}), ...(c.sub ? { line: c.sub } : {}),
      answer: k === 'go' ? 'your go' : k === 'pick' ? 'your pick' : k === 'why' || k === 'debrief' ? 'your answer' : 'your yes' };
  });
  const picks: WaitItem[] = gateChoices(flow.gate, flow.asks).map((g) => ({
    key: `gate:${g.key}`, gate: g, place: GATE_PLACE[g.kind], title: g.kind === 'go' ? g.title : `${g.id ? `${g.id} · ` : ''}${g.title}`,
    word: g.kind === 'go' ? 'Your go' : g.kind === 'sheet' ? 'Yes or no' : 'Pick one', ready: true, line: g.meta,
    answer: g.kind === 'go' ? 'your go' : g.kind === 'sheet' ? 'your yes' : 'your pick',
    ...(g.kind === 'voices' ? { voiceIds: [g.id] } : {}),
  }));
  return byImportance([...story, ...cards, ...picks]);
}

/** The gate's picks still being made (a round running or queued) and Alma's questions being worked on: no choice yet,
 *  so not on "Waiting for you"; the page names how many in one quiet line. */
export function beingMade(flow: Flow): number {
  return flow.gate.filter((g) => g.state === 'running' || g.state === 'queued').length + flow.working.length;
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
  // the Story page at the script, where "Lock vN" is, or at the story, where "Settle" is
  if (it.story) return `/story?tab=${it.story.kind}`;
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
  // a card of sound picks: every try of every sound, "cheer-toast 2"
  if (c?.sounds?.length) return c.sounds.filter((x) => !x.answer).flatMap((x) => x.tries.filter((t) => t.file).map((t) => ({ path: t.file!, label: `${x.name} ${t.n}`, key: `${x.name}:${t.n}` })));
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
