// What is being made right now and has not landed yet. The user, right after locking the script: "What is
// the loading state that you see when you finish the script and then you go to the next stage? What gives you an
// indication that things are being worked on inside the flow?" A step whose work is under way says what is being made
// ("Painting 4 looks for the boathouse", "Making 20 faces for Tobias") and how many have landed of how many, instead of an
// empty page or a "nothing yet" line. Pure: read from what the app already knows, and nothing else.
//
// Where each fact comes from:
//   round   a round asked and not landed: its candidates listed before their pictures (cast/<C>/r*/prompts.json, a
//           location's <L>-<slug>-cand-*.prompt.txt, voices/options.json) and the pictures on disk; landed of asked
//   agent   a sub-agent of Alma's thread running or queued on the step (its task card, "Alma › faces · C02 round 1",
//           placed by derive.ts aimOf): what it makes, no count until its round is on disk
//   card    a card of Alma's being worked on instead of answered (review/cards.json "progress", FeedSummary.working)
import type { FeedCard, FilmState, Round, TaskCard } from '@/server/types';
import { castOf, faceDone, lastRound, liveAims, roundProgress, voiceParts, type FlowKey, type TaskAim } from './derive';

export interface Making {
  /** The flow step it belongs to. */
  step: FlowKey;
  /** The character, location or prop it is for ("C02", "L01"); empty for a job that names none. */
  id: string;
  /** "Painting 4 looks for the boathouse", in the words the user reads. */
  what: string;
  /** Landed of asked, when the round is on disk. */
  landed?: number;
  of?: number;
  from: 'round' | 'agent' | 'card';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A round still filling: asked, and not every candidate landed or refused. */
const filling = (r?: Round) => { const p = roundProgress(r); return !!r && p.pending > 0; };
/** "Boathouse" → "the Boathouse", "The harbour" → "the harbour"; a prop's name in lower case ("the nets"). */
const nameOf = (n: string) => `the ${n.replace(/^the /i, '')}`;
const propName = (n: string) => nameOf(n.toLowerCase());

/** Everything being made in the film now, step by step, each thing once: a round on disk first (it has a count), then a
 *  sub-agent on something no round names yet, then the cards being worked on. */
export function makingOf(s: FilmState, tasks: TaskCard[]): Making[] {
  if (s.film.status === 'delivered') return [];
  const out: Making[] = [];
  const has = (step: FlowKey, id: string) => out.some((m) => m.step === step && m.id === id);
  const round = (step: FlowKey, id: string, r: Round, what: (n: number) => string) => {
    const p = roundProgress(r);
    out.push({ step, id, what: what(p.asked), landed: p.landed, of: p.asked, from: 'round' });
  };

  // the places: each location's newest round, then each prop's
  const propsDone = new Set<string>(); // a prop used in several places is under each: once
  for (const l of s.locations) {
    const r = lastRound(l.styleImages);
    if (!l.master?.picked && filling(r)) round('loc', l.id, r!, (n) => `Painting ${plural(n, 'look')} for ${nameOf(l.name)}`);
    for (const pr of l.props ?? []) {
      if (propsDone.has(pr.id)) continue;
      propsDone.add(pr.id);
      const pr0 = lastRound(pr.rounds);
      if (!pr.pick && filling(pr0)) round('loc', pr.id, pr0!, (n) => `Making ${plural(n, 'picture')} of ${propName(pr.name)}`);
    }
  }
  // the people: faces, clothing and voices by their rounds
  for (const c of castOf(s)) {
    const f = lastRound(c.face?.rounds);
    if (!faceDone(c) && filling(f)) round('faces', c.id, f!, (n) => `Making ${plural(n, 'face')} for ${c.name}`);
    const w = lastRound(c.wardrobe?.rounds);
    if (faceDone(c) && !c.wardrobe?.pick && filling(w)) round('clothing', c.id, w!, (n) => `Making ${plural(n, 'look')} for ${c.name}`);
  }
  for (const v of voiceParts(s, [])) {
    if (v.state === 'running' && v.round && filling(v.round)) round('voices', v.id, v.round, (n) => `Designing ${plural(n, 'voice')} for ${v.name}`);
  }

  // a sub-agent on something no round on disk says yet
  const words: Partial<Record<FlowKey, (who: string) => string>> = {
    loc: (who) => `Painting looks for ${who}`, views: (who) => `Making the views of ${who}`, faces: (who) => `Making faces for ${who}`,
    clothing: (who) => `Making clothing for ${who}`, sheet: (who) => `Making the sheet of ${who}`, voices: (who) => `Designing voices for ${who}`,
    elements: (who) => `Making the video element of ${who}`, shots: (who) => `Writing the scene file of ${who}`, previz: (who) => `Making the previz of ${who}`,
  };
  const who = (id: string): string | undefined => {
    const c = s.characters.find((x) => x.id === id || x.id.split('-')[0] === id);
    if (c) return c.name;
    const l = s.locations.find((x) => x.id === id);
    if (l) return nameOf(l.name);
    const p = s.locations.flatMap((x) => x.props ?? []).find((x) => x.id === id);
    if (p) return propName(p.name);
    return s.scenes.find((x) => x.id === id) ? id : undefined;
  };
  const steps = Object.keys(words) as FlowKey[];
  for (const step of steps) {
    for (const a of liveAims(tasks, step)) {
      const ids = a.ids.filter((i) => who(i));
      if (!ids.length) { if (!out.some((m) => m.step === step && m.what === jobWords(a))) out.push({ step, id: '', what: jobWords(a), from: 'agent' }); continue; }
      for (const id of ids) {
        // a prop's job sits on the Locations step, its own words
        const w = /^P/.test(id) ? `Making ${who(id)}` : words[step]!(who(id)!);
        if (!has(step, id)) out.push({ step, id, what: w, from: 'agent' });
      }
    }
  }
  // the cards being worked on instead of answered
  for (const c of s.feed?.working ?? []) out.push({ step: c.place, id: c.ids[0] ?? '', what: cardWords(c), from: 'card' });
  return out;
}

/** "faces · C04 the students group" → "Faces · C04 the students group": a job no character or place of the film names. */
function jobWords(a: TaskAim): string {
  const t = [a.job, a.target].filter(Boolean).join(' · ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function cardWords(c: FeedCard): string {
  const note = c.ask?.progress?.note;
  return `Working on “${c.title.replace(/[:,]?\s*(approve|approval)\??\s*$/i, '')}”${note ? ` · ${note}` : ''}`;
}

/** The things being made on these steps (and, given an id, for that character, location or prop). */
export const makingFor = (all: Making[], steps: FlowKey[], id?: string): Making[] => all.filter((m) => steps.includes(m.step) && (!id || m.id === id));

/** The flow steps each of What's next's early steps holds (lib/flow.ts nodes by the early step they belong to). */
export const MAKING_STEPS: Record<string, FlowKey[]> = {
  places: ['loc', 'views'], characters: ['faces', 'clothing', 'sheet', 'voices', 'elements'], shots: ['shots'], boards: ['previz'], takes: ['scenes'],
};

/** "2 of 4 landed", "none landed yet", or nothing when no count is known. */
export function landedWords(m: Making): string | undefined {
  if (m.of === undefined) return undefined;
  return m.landed ? `${m.landed} of ${m.of} landed` : 'none landed yet';
}
