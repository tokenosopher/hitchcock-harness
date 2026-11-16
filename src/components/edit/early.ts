// What's next from the script on (15 Nov 2026, ASKS 47; drawn as To build 2, 3, 12, 13, 14 and 15). Pure: the six
// steps before today's seven (left.ts), read from the film's state (the same FilmState the film's board reads) and the
// cut on screen. Each says whether it is done and one plain fact; the first not done is the one to look at. Nothing
// here holds a film rule: how many takes, what needs a go and what a check must score are the flow's notes.
import type { FilmState, Timeline } from '@/server/types';
import { faceDone } from '@/components/lib/derive';
import { fmtDate } from '@/components/lib/format';
import { hasPlanned, plannedCounts, sceneKinds } from './planned';

export type EarlyId = 'script' | 'characters' | 'places' | 'shots' | 'boards' | 'takes';
export const EARLY_IDS: EarlyId[] = ['script', 'characters', 'places', 'shots', 'boards', 'takes'];
export const EARLY_NAME: Record<EarlyId, string> = {
  script: 'Script', characters: 'Characters', places: 'Locations', shots: 'Shot lists', boards: 'Boards', takes: 'First takes',
};
export const EARLY_SHORT: Record<EarlyId, string> = {
  script: 'the script', characters: 'characters', places: 'locations', shots: 'shot lists', boards: 'boards', takes: 'first takes',
};

/** What a press on an early step does: Alma's box (the idea), a page of the film, the planned shots on the timeline,
 *  the Takes tab, or the ask for the first takes sent to Alma as the user's own message. */
export type EarlyDo =
  | { kind: 'idea' }
  | { kind: 'page'; page: 'story' | 'character' | 'locations' | 'scenes' }
  | { kind: 'planned' }
  | { kind: 'takes-tab' }
  | { kind: 'go-takes'; n: number; scenes: string[] };

export interface EarlyStep { id: EarlyId; done: boolean; facts: string; row: EarlyDo; act?: { label: string; do: EarlyDo } }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The scenes whose take is being made: a job sent and no clip back, not stopped. */
export const makingScenes = (s: FilmState): string[] => s.scenes.filter((x) => x.takes.some((t) => !t.path && !t.stopped && !!t.jobId)).map((x) => x.id);

/** The six early steps. `tl`: the cut on screen (absent before the script is locked). A cut of takes only (nothing
 *  planned left in it) means the early steps are behind the film: all done. */
export function earlySteps(s: FilmState, tl?: Pick<Timeline, 'tracks'>): EarlyStep[] {
  const locked = s.script?.versions.find((v) => v.locked);
  const lines = (s.script?.lines ?? []).length;
  const after = (what: string) => `after ${what}`;
  const steps: EarlyStep[] = [];

  // 1. the script
  if (locked) steps.push({ id: 'script', done: true, facts: `script ${locked.version}, locked${locked.date ? ` ${fmtDate(locked.date)}` : ''}${lines ? ` · ${plural(lines, 'line')}` : ''}`, row: { kind: 'page', page: 'story' } });
  else {
    const story = s.story?.versions?.length ? s.story.current : undefined;
    const draft = s.script?.current;
    steps.push({ id: 'script', done: false, row: { kind: 'page', page: 'story' },
      facts: draft ? `script ${draft}, not locked yet` : story ? `story ${story} · no script yet` : 'no script yet',
      act: !draft && !story ? { label: 'Tell Alma the idea', do: { kind: 'idea' } } : { label: draft ? 'Open the script' : 'Open the story', do: { kind: 'page', page: 'story' } } });
  }

  // 2. characters: a face picked and a sheet approved for each (a group has its sheet only)
  const cast = s.characters;
  const ready = (c: (typeof cast)[number]) => (c.extra || faceDone(c)) && (!!c.sheet?.approved || !!c.reused);
  if (!locked && !cast.length) steps.push({ id: 'characters', done: false, facts: after('the script'), row: { kind: 'page', page: 'character' } });
  else if (!cast.length) steps.push({ id: 'characters', done: false, facts: 'no characters yet', row: { kind: 'page', page: 'character' } });
  else {
    const toPick = cast.filter((c) => !c.extra && !faceDone(c) && (c.face?.rounds.length ?? 0) > 0);
    const done = cast.every(ready);
    steps.push({ id: 'characters', done, row: { kind: 'page', page: 'character' },
      facts: done ? plural(cast.length, 'character') : toPick.length ? `${plural(toPick.length, 'face')} to pick: ${names(toPick.map((c) => c.name))}` : `${cast.filter(ready).length} of ${plural(cast.length, 'character')} ready` });
  }

  // 3. places: a main image picked for each
  const locs = s.locations;
  if (!locs.length) steps.push({ id: 'places', done: false, facts: locked ? 'no places yet' : after('the script'), row: { kind: 'page', page: 'locations' } });
  else {
    const picked = locs.filter((l) => !!l.master?.picked || !!l.master?.path).length;
    const views = locs.reduce((k, l) => k + (l.views?.length ?? 0), 0);
    steps.push({ id: 'places', done: picked === locs.length, row: { kind: 'page', page: 'locations' },
      facts: picked === locs.length ? `${plural(locs.length, 'place')}${views ? ` · ${plural(views, 'view')}` : ''}` : `${picked} of ${plural(locs.length, 'place')} picked` });
  }

  // 4. shot lists: a shot list for every scene of the script
  const scenes = s.scenes;
  const listed = scenes.filter((x) => (x.shots ?? 0) > 0 || !!x.sceneFile);
  const shotCount = scenes.reduce((k, x) => k + (x.shots ?? 0), 0);
  const planned = scenes.reduce((k, x) => k + (x.seconds ?? 0), 0);
  const shotsDone = scenes.length > 0 && listed.length === scenes.length;
  steps.push({ id: 'shots', done: shotsDone, row: { kind: 'planned' },
    facts: !locked ? after('the script') : shotsDone ? `${plural(scenes.length, 'scene')}, ${plural(shotCount, 'shot')}${planned ? `, planned ${mmss(planned)}` : ''}`
      : listed.length ? `${listed.length} of ${plural(scenes.length, 'scene')}` : after('the faces and places') });

  // 5. boards: every scene's shots have their boards on the timeline (or its take is in)
  const kinds = tl ? sceneKinds(tl) : new Map<string, string>();
  const ids = scenes.length ? scenes.map((x) => x.id) : [...kinds.keys()];
  const boarded = ids.filter((id) => kinds.get(id) === 'boards' || kinds.get(id) === 'take');
  const boards = tl ? plannedCounts(tl).boards : 0;
  const boardsDone = ids.length > 0 && boarded.length === ids.length;
  steps.push({ id: 'boards', done: boardsDone, row: { kind: 'planned' },
    facts: boardsDone ? `${boards ? `${plural(boards, 'board')}, ` : ''}${boarded.length} of ${plural(ids.length, 'scene')}` : !shotsDone ? after('the shot lists') : boarded.length ? `${boarded.length} of ${plural(ids.length, 'scene')} have their boards` : 'Alma makes them from the shot lists' });

  // 6. the first takes: every scene's take in the film
  const inFilm = ids.filter((id) => kinds.get(id) === 'take');
  const making = makingScenes(s).filter((id) => !inFilm.includes(id));
  const waiting = ids.filter((id) => !inFilm.includes(id));
  const takesDone = ids.length > 0 && inFilm.length === ids.length;
  // a cost is said only when Alma's open asking card states one (the page has none of its own)
  const go = s.feed?.asks.find((c) => c.ask?.kind === 'go' && !c.ask.answer && !!c.ask.cost && (c.place === 'scenes' || c.place === 'edit'));
  if (takesDone) steps.push({ id: 'takes', done: true, facts: `${plural(inFilm.length, 'take')} in the film`, row: { kind: 'takes-tab' } });
  else if (!boardsDone) steps.push({ id: 'takes', done: false, facts: after('the boards'), row: { kind: 'takes-tab' } });
  else if (!inFilm.length && !making.length) {
    steps.push({ id: 'takes', done: false, row: { kind: 'takes-tab' },
      facts: `${plural(waiting.length, 'take')}, one for each scene${planned ? ` · ${mmss(planned)} of film` : ''}${go?.ask?.cost ? ` · ${go.ask.cost}` : ''}`,
      act: { label: `Go for the ${plural(waiting.length, 'take')}`, do: { kind: 'go-takes', n: waiting.length, scenes: waiting } } });
  } else steps.push({ id: 'takes', done: false, row: { kind: 'takes-tab' }, facts: `${inFilm.length} of ${ids.length} in the film${making.length ? ` · ${making.length} being made` : ''}` });

  // a cut of takes (nothing planned in it), or a delivered film: the early steps are behind it
  const behind = s.film.status === 'delivered' || (!!tl && !hasPlanned(tl) && tl.tracks.some((t) => t.kind === 'video' && t.clips.length > 0));
  // characters and places run side by side, so only the script is implied by a later step's being done
  const lastDone = behind ? steps.length - 1 : steps.slice(1).some((x) => x.done) ? 0 : -1;
  const doneWords: Record<EarlyId, () => string> = {
    script: () => (s.script?.current ? `script ${s.script.current}` : 'written'),
    characters: () => (cast.length ? plural(cast.length, 'character') : 'none needed'),
    places: () => (locs.length ? plural(locs.length, 'place') : 'none needed'),
    shots: () => (scenes.length ? plural(scenes.length, 'scene') : 'written'),
    boards: () => 'made',
    takes: () => (scenes.length ? `${plural(scenes.length, 'scene')} in the film` : 'in the film'),
  };
  return steps.map((x, i) => (i <= lastDone && !x.done ? { id: x.id, done: true, facts: doneWords[x.id](), row: x.row } : x));
}

/** The words Alma gets when the user presses "Go for the n takes": the ask, as the user's own message. What she does
 *  with it (her asking card, its quote) is the flow's; the page sends nothing else and states no cost. */
export function goTakesAsk(n: number, scenes: string[]): string {
  return `Go for the first takes: ${plural(n, 'take')}, one for each scene (${scenes.join(', ')}). Every scene has its boards.`;
}
