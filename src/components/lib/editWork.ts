// What the Edit step says while pick-ups or retakes are being made . The user, of the board's
// Edit box reading "Next: approve the cut at 480p" while three pick-ups were being rebuilt: "I would like a message
// under 'Edit' that expresses exactly what's going on." Pure: read off the film's pick-up folders (FilmState.pickups),
// its scenes' takes, the live sub-agents named "pick-up · …" or "retake · …" and the go cards waiting. Once every one
// has landed or is dropped this answers undefined and the Edit step reads What's next again.
import type { FilmState, TaskCard } from '@/server/types';
import { aimOf } from './derive';

/** Where one stands, furthest behind first: new previz and boards, the board check, the prompt, the go, the take. */
export type WorkStage = 'boards' | 'check' | 'prompt' | 'go' | 'take';
const ORDER: WorkStage[] = ['boards', 'check', 'prompt', 'go', 'take'];

export interface WorkItem {
  /** "FIX-S1-sit", or "S2 retake". */
  name: string;
  kind: 'pick-up' | 'retake';
  scenes: string[];
  stage: WorkStage;
  /** A sub-agent is on it now. */
  live: boolean;
}

export interface EditWork {
  items: WorkItem[];
  /** "3 pick-ups being made": the box's first line. */
  headline: string;
  /** "S1, S3, S4 · new boards, then prompts, then your go", or "S1 at boards · S3, S4 at prompts": its second. */
  detail: string;
  /** The two together, for the row under the flow and the step's header. */
  line: string;
  /** The scenes whose go waits for the user ("S4"): the step then waits for you, not only runs. */
  go: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const label = (i: WorkItem) => i.scenes.join('+') || i.name;
const labels = (xs: WorkItem[]) => [...new Set(xs.map(label))].sort(natural).join(', ');
const WORK_JOB = /^(pick-?ups?|retakes?)\b/i;

/** What is being made for scenes already in the cut, or undefined when nothing is (the approve-the-cut line stays). */
export function editWork(s: FilmState, tasks: TaskCard[]): EditWork | undefined {
  if (s.film.status === 'delivered') return undefined;
  // "in the cut": a scene with a first take landed
  const taken = new Set(s.scenes.filter((sc) => sc.takes.some((t) => t.kind === 'take' && t.path)).map((sc) => sc.id));
  const live = tasks.filter((t) => t.state === 'running' || t.state === 'queued').map(aimOf).filter((a) => WORK_JOB.test(a.job.trim()));
  const goCards = (s.feed?.asks ?? []).filter((c) => c.ask?.kind === 'go' && !c.ask.answer);
  const goFor = (name: string) => goCards.some((c) => c.ids.includes(name) || c.title.includes(name));
  const items: WorkItem[] = [];

  for (const p of s.pickups ?? []) {
    if (p.dropped || !p.scenes.some((id) => taken.has(id))) continue;
    const on = live.some((a) => a.task.title.includes(p.name));
    const go = goFor(p.name);
    if (p.landed && !p.generating && !on && !go) continue;
    const stage: WorkStage = p.generating ? 'take' : go ? 'go' : p.prompts || p.checked ? 'prompt' : p.boards ? 'check' : 'boards';
    items.push({ name: p.name, kind: 'pick-up', scenes: p.scenes, stage, live: on });
  }
  // a sub-agent on a pick-up whose folders are not there yet, or on a retake of a scene in the cut
  for (const a of live) {
    const fix = /\bFIX-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/.exec(a.task.title)?.[0];
    const scenes = a.ids.filter((x) => /^S\d+$/.test(x) && taken.has(x));
    if (!scenes.length) continue;
    if (/^pick/i.test(a.job.trim())) {
      if (!fix || items.some((i) => i.name === fix) || s.pickups?.some((p) => p.name === fix && (p.dropped || (p.landed && !p.generating)))) continue;
      items.push({ name: fix, kind: 'pick-up', scenes, stage: goFor(fix) ? 'go' : 'boards', live: true });
    } else {
      const name = `${scenes.join('+')} retake`;
      if (items.some((i) => i.name === name)) continue;
      const sc = s.scenes.find((x) => x.id === scenes[0]);
      const pending = sc?.takes.some((t) => t.kind === 'take' && !t.path && !t.stopped);
      items.push({ name, kind: 'retake', scenes, stage: pending ? 'take' : goCards.some((c) => c.ids.includes(scenes[0])) ? 'go' : 'prompt', live: true });
    }
  }
  // a new take of a scene in the cut, asked and not landed: a retake under way with no sub-agent on it
  for (const sc of s.scenes) {
    if (!taken.has(sc.id) || items.some((i) => i.kind === 'retake' && i.scenes.includes(sc.id))) continue;
    if (sc.takes.some((t) => t.kind === 'take' && !t.path && !t.stopped)) items.push({ name: `${sc.id} retake`, kind: 'retake', scenes: [sc.id], stage: 'take', live: false });
  }
  if (!items.length) return undefined;
  items.sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || natural(label(a), label(b)));

  const pk = items.filter((i) => i.kind === 'pick-up').length;
  const rt = items.length - pk;
  const headline = `${[pk ? plural(pk, 'pick-up') : '', rt ? plural(rt, 'retake') : ''].filter(Boolean).join(' and ')} being made`;
  const go = items.filter((i) => i.stage === 'go');
  const stages = ORDER.filter((st) => st !== 'go' && items.some((i) => i.stage === st));
  let detail: string;
  if (!go.length && stages.length === 1) {
    // all at one stage: the scenes, then what comes next for them
    const many = items.length > 1;
    const tail: Record<WorkStage, string> = {
      boards: `new boards, then ${many ? 'prompts' : 'the prompt'}, then your go`,
      check: `the board check, then ${many ? 'prompts' : 'the prompt'}, then your go`,
      prompt: `${many ? 'prompts' : 'the prompt'}, then your go`,
      go: 'your go',
      take: many ? 'takes being made' : 'the take being made',
    };
    detail = `${labels(items)} · ${tail[stages[0]]}`;
  } else {
    const at = (st: WorkStage, xs: WorkItem[]) => (st === 'take' ? `${labels(xs)} taking` : `${labels(xs)} at ${st === 'boards' ? 'boards' : st === 'check' ? 'the board check' : xs.length > 1 ? 'prompts' : 'the prompt'}`);
    detail = [
      go.length ? (go.length === 1 ? `${label(go[0])}’s go waits for you` : `the go for ${labels(go)} waits for you`) : '',
      ...stages.map((st) => at(st, items.filter((i) => i.stage === st))),
    ].filter(Boolean).join(' · ');
  }
  return { items, headline, detail, line: `${headline} · ${detail}`, go: go.flatMap((i) => i.scenes) };
}
