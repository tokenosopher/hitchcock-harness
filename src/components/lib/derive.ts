// What the pages read off a FilmState: pick states, stage states, the gate inbox, scene summaries.
// Pure functions, no I/O; everything here is derived from the contract in src/server/types.ts.
import type { CharacterRef, CutInfo, FeedCard, FilmState, LocationRef, Round, SceneRef, ScriptLine, Stage, TakeRef, TaskCard, ThreadEvent } from '@/server/types';
import { cutTakeIds as timelineTakeIds } from './cut';
import { fmtClock, fmtCredits, fmtDate, sumCredits, takeLabel } from './format';
import { takesReady } from '@/components/edit/takesReady';
import { scriptCards } from '@/lib/script-cards';
import { sectionSpan, storyVersionOf } from '@/lib/script-edit';

export type PickState = 'ready' | 'running' | 'queued' | 'waiting' | 'picked';

export interface RoundProgress { landed: number; refused: number; asked: number; pending: number }

export function roundProgress(r?: Round): RoundProgress {
  const cands = r?.candidates ?? [];
  const refused = cands.filter((c) => !c.path && /refused/i.test(c.note ?? '')).length;
  const landed = cands.filter((c) => !!c.path).length;
  return { landed, refused, asked: cands.length, pending: cands.length - landed - refused };
}

export const lastRound = (rounds?: Round[]) => (rounds && rounds.length ? rounds[rounds.length - 1] : undefined);

/** Latest state of every task in the thread, keyed by task id. */
export function latestTasks(events: ThreadEvent[]): TaskCard[] {
  const map = new Map<string, TaskCard>();
  for (const e of events) if (e.kind === 'task') map.set(e.task.id, e.task);
  return [...map.values()];
}

/** A task whose title names the target ("Alma › faces · C03 round 1" for C03 faces). */
export function taskFor(tasks: TaskCard[], job: string, target: string): TaskCard | undefined {
  const t = tasks.filter((k) => k.title.includes(job) && k.title.includes(target));
  return t[t.length - 1];
}

export function faceState(c: CharacterRef, tasks: TaskCard[]): PickState {
  if (c.face?.pick) return 'picked';
  const r = lastRound(c.face?.rounds);
  if (!r) {
    const t = taskFor(tasks, 'faces', c.id);
    return t?.state === 'running' ? 'running' : t?.state === 'queued' ? 'queued' : 'waiting';
  }
  const p = roundProgress(r);
  return p.pending > 0 ? 'running' : 'ready';
}

export function locationState(rounds: Round[] | undefined, picked: boolean | undefined): PickState {
  if (picked) return 'picked';
  const r = lastRound(rounds);
  if (!r) return 'waiting';
  return roundProgress(r).pending > 0 ? 'running' : 'ready';
}

// ---- Sub-agents: which node of the flow board a task card works on

/** The nodes of the flow board (Main): the two chains, the gate and the stages after it. */
export type FlowKey = 'story' | 'loc' | 'views' | 'shots' | 'previz' | 'faces' | 'clothing' | 'sheet' | 'voices' | 'gate' | 'elements' | 'scenes' | 'edit' | 'finish' | 'sound' | 'release';

// the job word of "Alma › <job> · <target>" → its node; first match wins
const JOBS: [RegExp, FlowKey][] = [
  // stage 11 first: "voice fix", "word clone" and "music" are sound work, not the Voices node or Finish
  [/music|\bscore\b|\bsound\b|\bmix(es)?\b|\bsfx\b|loudness|\bstems?\b|table.?read|\breadings?\b|\bclon(e|ed|es|ing)\b|voice fix|re-?voic|\blufs\b|\bmux|sam audio/, 'sound'],
  // "1080p master" is Finish; "master" alone is a location's master image, further down
  [/1080|upscale/, 'finish'],
  [/\bfaces?\b/, 'faces'], [/cloth|wardrobe|costume/, 'clothing'], [/\bsheets?\b/, 'sheet'], [/voice/, 'voices'],
  [/\bviews?\b|\bplates?\b|\bangles?\b/, 'views'], [/shot ?lists?|\bshots\b|scene ?files?|scene text/, 'shots'], [/previz|storyboard|\bboards?\b/, 'previz'],
  [/locations?|style image|\bmasters?\b|\bprops?\b/, 'loc'], [/\belements?\b/, 'elements'],
  [/prompts?\b|\btakes?\b|\bscenes?\b|generations?\b|\bredos?\b|pick-?ups?|^fix\b|\bspeeds?\b/, 'scenes'],
  [/\bedit\b|\bcut\b|stitch|proxy|timeline|\brenders?\b|\bdrafts?\b/, 'edit'], [/1080|finish|upscale|captions?|subtitles?|title card/, 'finish'],
  [/release|\bkit\b|social|deliver|\bpost(s|ing)?\b|thumbnails?/, 'release'], [/script|story|brief|research/, 'story'],
];

export interface TaskAim { task: TaskCard; node?: FlowKey; job: string; target: string; ids: string[] }

/** "Alma › faces · C02 round 1" → the Faces node, C02. A QC job is placed by what it checks. */
export function aimOf(t: TaskCard): TaskAim {
  const body = t.title.replace(/^Alma\s*›\s*/, '');
  const [job = '', ...rest] = body.split(/\s+·\s+/);
  const target = rest.join(' · ');
  const j = job.toLowerCase();
  const qc = /\b(qc|critic|check)\b/.test(j);
  const hay = qc ? `${j.replace(/\b(qc|critic|check)\b/g, ' ')} ${target.toLowerCase()}` : j;
  // "FIX-S2S3-reel" names two scenes in one word
  const ids = [...new Set((body.match(/\b(?:C\d+[a-z]?(?:-C\d+)?|L\d+|P\d+|(?:S\d+)+)\b/g) ?? []).flatMap((m) => (/^(?:S\d+){2,}$/.test(m) ? m.match(/S\d+/g)! : [m])))];
  let node = JOBS.find(([re]) => re.test(hay))?.[1];
  // a check that names only what it checks ("QC · C01", "QC · film") goes by the ID's kind
  if (!node && qc) node = /^S/.test(ids[0] ?? '') ? 'scenes' : /^[LP]/.test(ids[0] ?? '') ? 'loc' : /^C/.test(ids[0] ?? '') ? 'sheet' : /\b(film|cut)\b/.test(hay) ? 'edit' : undefined;
  return { task: t, node, job, target, ids };
}

/** The running and queued task cards on a node (and, given an id, on that character, location or scene). */
export function liveAims(tasks: TaskCard[], node: FlowKey, id?: string): TaskAim[] {
  return tasks.filter((t) => t.state === 'running' || t.state === 'queued').map(aimOf).filter((a) => a.node === node && (!id || a.ids.includes(id)));
}

// ---- What is done, per character and location, from the files

/** The speaking cast. In a delivered film a character with no files at all needed none (C03a the Machine). */
export function castOf(s: FilmState): CharacterRef[] {
  const speaking = s.characters.filter((c) => !c.extra);
  if (s.film.status !== 'delivered') return speaking;
  return speaking.filter((c) => c.face?.rounds.length || c.sheet?.path || c.voice?.rounds.length || c.voice?.elementLine || (c.element && c.element.state !== 'none'));
}
/** Needs a voice and a video element: not an extra, and has lines. A silent character is done with the image element. */
export const speaks = (c: CharacterRef) => !c.extra && !c.silent;
/** A face counts as picked when the record says so, or when what follows it exists (an approved sheet, a final element). */
export const faceDone = (c: CharacterRef) => !!(c.face?.pick || c.reused || c.sheet?.approved || c.element?.state === 'final');
export const clothingDone = (c: CharacterRef) => !!(c.wardrobe?.pick || c.reused || c.sheet?.approved || c.element?.state === 'final');
export const voiceDone = (c: CharacterRef) => !!(c.voice?.pick || c.voice?.elementLine || c.element?.state === 'final' || c.reused);
/** The Voices step is one of this character's steps (Flow v3.3): it speaks, it was not taken from the
 *  library (a reused character brings its voice), and its face is picked (a voice comes inside the character's
 *  creation, after the face). */
export const voiceStepFor = (c: CharacterRef) => speaks(c) && !c.reused && faceDone(c);
/** The master is settled when it is picked, or when views were made from it. */
export const locationSettled = (l: LocationRef) => !!(l.master?.picked || l.views?.length);

export type PartState = 'done' | 'ready' | 'running' | 'queued' | 'waiting';
/** One character, location or scene on a node: its state and one line. */
export interface Part { id: string; name: string; state: PartState; line: string; aims: TaskAim[]; round?: Round; /** Character elements: a new video element to make, counted on the step */ newElement?: boolean }

export const roundNo = (r: Round) => /^r(\d+[a-z]?)/.exec(r.id)?.[1] ?? r.id;

/** hold: a step that may run early but whose pick waits (voices before the face pick: "Waiting for faces").
 *  strict: a step that does not start before its pick (clothing before the face pick). */
function partOf(o: { id: string; name: string; done?: string; rounds?: Round[]; aims: TaskAim[]; blocked?: string; idle?: string; strict?: boolean }): Part {
  const base = { id: o.id, name: o.name, aims: o.aims };
  const r = lastRound(o.rounds);
  if (o.done) return { ...base, state: 'done', line: o.done, round: r };
  if (o.strict && o.blocked && !o.aims.length) return { ...base, state: 'waiting', line: o.blocked, round: r };
  const p = r ? roundProgress(r) : undefined;
  const run = o.aims.some((a) => a.task.state === 'running');
  const so = r && p ? `round ${roundNo(r)} · ${p.landed} of ${p.asked} landed` : 'running';
  if (run || (p && p.pending > 0)) return { ...base, state: 'running', line: so, round: r };
  if (o.aims.some((a) => a.task.state === 'queued')) return { ...base, state: 'queued', line: 'queued', round: r };
  if (r && p && p.landed && !o.blocked) return { ...base, state: 'ready', line: `round ${roundNo(r)} · ${p.landed} landed`, round: r };
  return { ...base, state: 'waiting', line: o.blocked ?? o.idle ?? 'not started', round: r };
}

export function faceParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).map((c) => partOf({ id: c.id, name: c.name, rounds: c.face?.rounds, aims: liveAims(tasks, 'faces', c.id),
    done: faceDone(c) ? (c.face?.pick ? `${c.face.pick.candidateId} picked` : 'picked') : undefined }));
}
export function clothingParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).map((c) => partOf({ id: c.id, name: c.name, rounds: c.wardrobe?.rounds, aims: liveAims(tasks, 'clothing', c.id),
    done: clothingDone(c) ? (c.wardrobe?.pick ? `${c.wardrobe.pick.candidateId} picked` : 'done') : undefined,
    blocked: faceDone(c) ? undefined : 'waiting for the face pick', strict: true }));
}
export function sheetParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).map((c) => {
    const aims = liveAims(tasks, 'sheet', c.id);
    if (c.sheet?.approved) return { id: c.id, name: c.name, state: 'done', line: 'approved', aims };
    if (aims.length) return { id: c.id, name: c.name, state: aims.some((a) => a.task.state === 'running') ? 'running' : 'queued', line: 'running', aims };
    if (c.sheet?.path) return { id: c.id, name: c.name, state: 'ready', line: 'made · waiting for your yes', aims };
    return { id: c.id, name: c.name, state: 'waiting', line: clothingDone(c) ? 'not started' : 'after clothing', aims };
  });
}
/** The voices to make or pick: every speaking character but those taken from the library (they bring their voice, so
 *  no voice step is shown for them). Before the face pick a voice is not started, whatever is on file (strict). */
export function voiceParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).filter(speaks).filter((c) => !c.reused).map((c) => partOf({ id: c.id, name: c.name, rounds: c.voice?.rounds, aims: liveAims(tasks, 'voices', c.id),
    done: voiceDone(c) ? (c.voice?.pick ? `${/^\d+$/.test(c.voice.pick.candidateId) ? 'option ' : ''}${c.voice.pick.candidateId} picked` : 'picked') : undefined,
    blocked: faceDone(c) ? undefined : 'after the face pick', strict: true }));
}
/** The Character elements step : one row per character, the people and the groups. Only a speaking
 *  character not brought whole from the library needs a new video element, and only those count ("1 of 1" while
 *  Tobias's is made); a reused one with its final element is done "from the library"; a silent character or a group of
 *  extras has its image element only and is done at once (Flow v3.3, 3, step 19: extras get no video element). */
export const needsNewElement = (c: CharacterRef) => speaks(c) && !(c.reused && c.element?.state === 'final');
export function elementPart(s: FilmState, tasks: TaskCard[], c: CharacterRef): Part {
  const base = { id: c.id, name: c.name, newElement: needsNewElement(c) || undefined };
  if (!speaks(c))
    return { ...base, state: 'done', aims: [], line: c.extra ? 'Image element only · a group of extras, no video element needed' : 'Image element only · no lines, no video element needed' };
  const aims = liveAims(tasks, 'elements', c.id);
  const v = (line: string) => `Video element · ${line}`;
  if (c.element?.state === 'final') return { ...base, state: 'done', aims, line: v(c.reused ? 'from the library' : 'done') };
  if (aims.length) return { ...base, state: aims.some((a) => a.task.state === 'running') ? 'running' : 'queued', line: v('being made'), aims };
  if (c.element?.state === 'draft') return { ...base, state: 'ready', line: v('draft waiting for your yes'), aims };
  const mine = (id: string) => id === c.id || new RegExp(`^${c.id}[a-z]$`).test(id);
  if ((s.feed?.asks ?? []).some((a) => a.place === 'elements' && a.ids.some(mine))) return { ...base, state: 'ready', line: v('waiting for your go'), aims };
  return { ...base, state: 'waiting', line: v(faceDone(c) && c.sheet?.approved && voiceDone(c) ? 'not made yet' : 'after the picks'), aims };
}
export function elementParts(s: FilmState, tasks: TaskCard[]): Part[] {
  const cast = new Set(castOf(s));
  return s.characters.filter((c) => cast.has(c) || c.extra).map((c) => elementPart(s, tasks, c));
}
export function locationParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return s.locations.map((l) => {
    const rounds = l.styleImages;
    const picked = [...(rounds ?? [])].reverse().find((r) => r.pick);
    return partOf({ id: l.id, name: l.name, rounds, aims: liveAims(tasks, 'loc', l.id),
      done: locationSettled(l) ? (picked?.pick ? `${picked.pick} picked as the master` : 'master settled') : undefined });
  });
}

/** "C01 C04 ready · C02 running · 1 of 4 picked": what is not done, by state, then the count done. */
export function partsStatus(parts: Part[], doneWord: string): string {
  if (!parts.length) return '';
  const done = parts.filter((p) => p.state === 'done').length;
  if (done === parts.length) return `${done} of ${parts.length} ${doneWord}`;
  const groups = (['ready', 'running', 'queued'] as const)
    .map((st) => [st, parts.filter((p) => p.state === st).map((p) => p.id)] as const)
    .filter(([, ids]) => ids.length)
    .map(([st, ids]) => `${ids.join(' ')} ${st}`);
  const waiting = parts.filter((p) => p.state === 'waiting');
  if (!groups.length) {
    const lines = [...new Set(waiting.map((p) => p.line))];
    groups.push(lines.length === 1 ? lines[0] : `${waiting.length} waiting`);
  }
  if (done) groups.push(`${done} of ${parts.length} ${doneWord}`);
  return groups.join(' · ');
}

// ---- The gate page: every pick waiting for the user

export interface GateItem {
  key: string;            // chip id
  id: string;             // "C01", "L01", ""
  title: string;          // "Maren face"
  chip: string;           // "C01 · Maren face"
  state: PickState;
  meta: string;
  round?: Round;
  progress?: RoundProgress;
  prediction?: string;
  predictionNote?: string;
  group: 'chains' | 'gate';
  kind: 'face' | 'master' | 'voices' | 'clothing' | 'sheet' | 'prop' | 'go';
  scenes?: string[];      // the go: the scenes it starts
}

function predictionNote(r: Round): string {
  const c = r.candidates.find((k) => k.id === r.prediction);
  return c?.note && !/refused|pink/.test(c.note) ? c.note : 'from your earlier picks';
}
const pickState = (p: PartState): PickState => (p === 'done' ? 'picked' : p);

/** The scenes the go for the video starts: no take yet (landed or generating), the newest prompt passed its check,
 *  and everything else the takes need made and approved (takesReady.ts). Empty unless every such scene is ready (SPEC principle 7: the one hard spend gate). */
export function goScenes(s: FilmState, tasks: TaskCard[]): string[] {
  if (s.film.status === 'delivered' || !s.scenes.length || liveAims(tasks, 'scenes').length) return [];
  const rest = s.scenes.filter((sc) => !sc.takes.some((t) => t.kind === 'take'));
  if (!rest.length) return [];
  // and everything else the takes need is made and approved (the same test as What's next's go, takesReady.ts)
  return rest.every((sc) => sc.promptVersions[sc.promptVersions.length - 1]?.checkPassed) && takesReady(s, rest.map((sc) => sc.id)).ready ? rest.map((sc) => sc.id) : [];
}

/** The gate page: every pick waiting, in the chains first (faces, masters), then at the gate (voices, the rest, the go). */
export function gateItems(s: FilmState, tasks: TaskCard[]): GateItem[] {
  if (s.film.status === 'delivered') return [];
  const items: GateItem[] = [];
  const cast = castOf(s);
  // after the lock the location pick is the first thing put in front of the user (Flow v3.3): the masters
  // come before the faces
  for (const lp of locationParts(s, tasks)) {
    if (lp.state === 'done') continue;
    const l = s.locations.find((x) => x.id === lp.id)!;
    const r = lp.round;
    const p = r ? roundProgress(r) : undefined;
    items.push({
      key: `pick:${l.id}`, id: l.id, title: `${l.name} master`, chip: `${l.id} · ${l.name} master`, state: pickState(lp.state),
      meta: r ? `Round ${roundNo(r)} · ${p?.asked} candidates${lp.state === 'ready' ? ` landed ${fmtDate(r.date)}` : ''}` : 'Round 1',
      round: r, progress: p, prediction: lp.state === 'ready' ? r?.prediction : undefined, predictionNote: r && lp.state === 'ready' ? predictionNote(r) : undefined,
      group: 'chains', kind: 'master',
    });
  }
  for (const f of faceParts(s, tasks)) {
    if (f.state === 'done') continue;
    const c = cast.find((x) => x.id === f.id)!;
    const r = f.round;
    const p = r ? roundProgress(r) : undefined;
    const roundId = r ? roundNo(r) : '1';
    const cost = s.spend.lines.filter((l) => l.what.includes(c.id) && l.what.includes(`round ${roundId}`) && (l.cost.credits ?? 0) > 0);
    let meta = `Round ${roundId}`;
    if (f.state === 'ready' && p) meta += ` · ${p.landed} candidates landed ${fmtDate(r?.date)}` + (cost.length ? ` · ${fmtCredits(sumCredits(cost.map((l) => l.cost)))}` : '');
    else if (f.state === 'running' && p) meta += ` · ${p.asked} asked`;
    items.push({
      key: `pick:${c.id}`, id: c.id, title: `${c.name} face`, chip: `${c.id} · ${c.name} face`, state: pickState(f.state), meta, round: r, progress: p,
      prediction: f.state === 'ready' ? r?.prediction : undefined, predictionNote: r && f.state === 'ready' ? predictionNote(r) : undefined,
      group: 'chains', kind: 'face',
    });
  }
  // at the gate: what landed and waits for a pick or a yes
  for (const cp of clothingParts(s, tasks).filter((x) => x.state === 'ready')) {
    const c = cast.find((x) => x.id === cp.id)!;
    const r = cp.round;
    items.push({ key: `pick:${c.id}:clothing`, id: c.id, title: `${c.name} clothing`, chip: `${c.id} · ${c.name} clothing`, state: 'ready',
      meta: r ? `Round ${roundNo(r)} · ${roundProgress(r).landed} candidates landed ${fmtDate(r.date)}` : '', round: r, progress: r ? roundProgress(r) : undefined,
      prediction: r?.prediction, predictionNote: r ? predictionNote(r) : undefined, group: 'gate', kind: 'clothing' });
  }
  for (const sp of sheetParts(s, tasks).filter((x) => x.state === 'ready')) {
    const c = cast.find((x) => x.id === sp.id)!;
    // Alma's own card already asks about this sheet (under "Alma asks"): one question, not two
    if (s.feed?.asks.some((k) => k.place === 'sheet' && k.ids.includes(c.id))) continue;
    items.push({ key: `pick:${c.id}:sheet`, id: c.id, title: `${c.name} sheet`, chip: `${c.id} · ${c.name} sheet`, state: 'ready', meta: 'Made from the picked face and clothing · waiting for your yes', group: 'gate', kind: 'sheet' });
  }
  // a voice is asked only inside a character's creation, once its face is picked, and never for a character taken from
  // the library (Flow v3.3); and only once its options exist: one card per character whose voice round
  // landed, nothing before ("Waiting for faces" is not a card)
  for (const v of voiceParts(s, tasks).filter((x) => x.state === 'ready' && x.round)) {
    const r = v.round!;
    const p = roundProgress(r);
    items.push({
      key: `pick:${v.id}:voice`, id: v.id, title: `${v.name} voice`, chip: `${v.id} · ${v.name} voice`, group: 'gate', kind: 'voices', state: 'ready',
      meta: `Round ${roundNo(r)} · ${p.landed} ${p.landed === 1 ? 'voice' : 'voices'} landed${r.date ? ` ${fmtDate(r.date)}` : ''}`, round: r, progress: p,
      prediction: r.prediction, predictionNote: r.prediction ? predictionNote(r) : undefined,
    });
  }
  for (const l of s.locations) for (const pr of l.props ?? []) {
    const r = lastRound(pr.rounds);
    if (pr.pick || !r || !roundProgress(r).landed) continue;
    items.push({ key: `pick:${pr.id}`, id: pr.id, title: pr.name, chip: `${pr.id} · ${pr.name}`, state: 'ready',
      meta: `Round ${roundNo(r)} · ${roundProgress(r).landed} candidates landed ${fmtDate(r.date)}`, round: r, progress: roundProgress(r), group: 'gate', kind: 'prop' });
  }
  const go = goScenes(s, tasks);
  if (go.length) {
    const taken = s.scenes.filter((sc) => sc.takes.some((t) => t.kind === 'take')).map((sc) => sc.id);
    items.push({
      key: 'go:video', id: '', title: 'Go for the video', chip: 'Go for the video', state: 'ready', group: 'gate', kind: 'go', scenes: go,
      meta: `${go.length} ${go.length === 1 ? 'prompt' : 'prompts'} ready${taken.length ? ` (${go.join(' ')}; ${taken.join(' ')} already taken)` : ''} · review the scenes, their prompts and the assets fed in, then say go`,
    });
  }
  // what "Done picking" just sent is not asked again while the server catches up (data/film.tsx)
  if (s.sentKeys?.length) { const sent = new Set(s.sentKeys); return items.filter((g) => !sent.has(g.key)); }
  return items;
}

/** The gate's picks that ask the user to choose now ("Waiting for you" is only cards to choose from): only those whose round has landed (a round being made, queued or not started is no
 *  choice yet), and each question once: a character's voice pick goes where Alma's own card at Voices asks to pick
 *  that character's voice. */
export function gateChoices(gate: GateItem[], asks: FeedCard[]): GateItem[] {
  return gate.filter((g) => g.state === 'ready'
    && !(g.kind === 'voices' && asks.some((c) => c.place === 'voices' && c.ask?.kind === 'pick' && c.ids.includes(g.id)))
    // a character's sheet goes where Alma's own card at Sheet asks about that character's sheet: one question a sheet
    //
    && !(g.kind === 'sheet' && asks.some((c) => c.place === 'sheet' && !!c.ask && c.ids.includes(g.id))));
}

/** Every item of "Waiting for you" now, by its key ("story:<script|story>-<version>", "card:<card key>", "gate:<gate
 *  item key>"): the story or the script when it waits on the user (storyWait), Alma's cards that ask and the gate's picks
 *  that can be made (gateChoices), what was sent and not shown answered yet left out (the state as the pages read it,
 *  lib/sent.ts withSent). The one rule the page (waitList.ts waitItemsOf lists these items), the sidebar's subtitle and
 *  white dot, and the server's count for every film (src/server/claude/notify.ts) all go by. */
export function waitingKeys(s: FilmState, tasks: TaskCard[], gate: GateItem[] = gateItems(s, tasks)): string[] {
  const asks = s.feed?.asks ?? [];
  const story = storyWait(s, tasks);
  const release = releaseWait(s);
  return [...(story && !story.sent ? [story.key] : []), ...asks.map((c) => `card:${c.key}`), ...gateChoices(gate, asks).map((g) => `gate:${g.key}`), ...(release ? [release.key] : [])];
}
/** How many items "Waiting for you" lists (waitingKeys); `gate` when the caller has gateItems(s, tasks) already. */
export const waitingCount = (s: FilmState, tasks: TaskCard[], gate?: GateItem[]): number => waitingKeys(s, tasks, gate).length;

/** What waits, in a few words, from waitingKeys: "1 pick waiting", "3 picks waiting"; the story or the script alone
 *  says what it waits for ("waits for your lock", and `long`: "Script v3 waits for your lock", for a notice). */
export function waitingWords(keys: string[], long = false): string {
  if (keys.length === 1 && keys[0] === RELEASE_WAIT_KEY) return long ? 'The film waits for your post' : 'waits for your post';
  const m = keys.length === 1 ? /^story:(script|story)-(.+)$/.exec(keys[0]) : null;
  if (!m) return picksWaiting(keys.length);
  const what = m[1] === 'script' ? 'your lock' : 'your read';
  return long ? `${m[1] === 'script' ? 'Script' : 'Story'} ${m[2]} waits for ${what}` : `waits for ${what}`;
}

// ---- Posting the film: once the final and its texts are in, posting waits for the user in What's next and in
// "Waiting for you" (so the sidebar's white dot shows), and the card takes them to the Release page

export const RELEASE_WAIT_KEY = 'release:post';
/** The film waits for the user to post it: one item of "Waiting for you" (key `release:post`). */
export interface ReleaseWait {
  key: typeof RELEASE_WAIT_KEY;
  /** "Post the film: 2 of 5 platforms posted". */
  title: string;
  /** "The final is the master of v12 · the texts for every platform are in". */
  line: string;
  platforms: number;
  posted: number;
}
/** A final named, platforms with their texts in the release file (Alma writes a platform with its texts), and not every
 *  one posted, nor publishing ticked done by the user in What's next (PostInfo.release, read by the server from
 *  social/release.json and harness/left.json). Never on a delivered film. */
export function releaseWait(s: FilmState): ReleaseWait | undefined {
  if (s.film.status === 'delivered') return undefined;
  const r = s.post?.release;
  const n = r?.platforms ?? 0, p = r?.posted ?? 0;
  if (!r?.final || !n || p >= n || r.done) return undefined;
  return {
    key: RELEASE_WAIT_KEY, platforms: n, posted: p,
    title: `Post the film: ${p} of ${plural(n, 'platform')} posted`,
    line: [r.final.version ? `The final is the master of ${r.final.version}` : 'The final is named', `the texts for ${n === 1 ? 'the platform are' : `all ${n} platforms are`} in`].join(' · '),
  };
}

// ---- The story or the script waiting on the user: the sidebar's white dot shows for them too

/** The story or the script that waits on the user: the script draft for their lock, or, before there is a script, the
 *  story for their read and settle. One item of "Waiting for you" (key `story:script-v3`, `story:story-v6`). */
export interface StoryWait {
  kind: 'script' | 'story';
  key: string;
  version: string;
  /** "Script v3 is ready to lock", "Story v7 is ready to read and settle". */
  title: string;
  /** One line under it: "1:38 · 5 scenes · 13 spoken lines · 3 differ from story v6". */
  line: string;
  /** The Story step's words on the flow: "v3 draft · waits for your lock". */
  status: string;
  /** What goes on in the story, from the files: a few lines for its card. */
  summary: string[];
  /** "Lock v3" or "Settle" was pressed and the state does not show it yet (lib/sent.ts): Alma's move, not waiting. */
  sent: boolean;
}

/** The film is still at the story, so a draft or an unsettled story is the user's to look at: stage 1 by its files
 *  (the registry's stageOf: no cast picture, element, location master, previz, prompt, take or cut video on disk), no
 *  scene file, prompt or take in its state, no cut file or master, and not delivered. A film made before the harness
 *  had a script lock (takes and cuts, no lock flag in script.md) is past it, so its unlocked script never waits. (The
 *  timeline alone does not count: the planned cut is made from the script at the lock.) */
export function atStoryStage(s: FilmState): boolean {
  if (s.film.status === 'delivered' || (s.film.stage ?? 1) > 1) return false;
  if (s.scenes.some((sc) => sc.sceneFile || sc.promptVersions.length || sc.takes.length)) return false;
  return !s.post?.cuts?.length && !s.master;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "S1 lines 2 and 3, S5 line 4". */
function linesWord(rows: { scene: string; n: number }[]): string {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.scene, [...(by.get(r.scene) ?? []), r.n]);
  return [...by].map(([sc, ns]) => `${sc} ${ns.length === 1 ? 'line' : 'lines'} ${ns.length > 2 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns.join(' and ')}`).join(', ');
}
/** Words only, for comparing a line with the story it came from ("It's sweet," she says → it's sweet she says). */
const bare = (t: string) => ` ${t.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
/** A spoken line is in the story when each of its phrases is, word for word: the story's prose may split a line
 *  around "she says". */
const inStory = (line: string, story: string) => line.split(/[.,!?;:—–…]+/).map((p) => bare(p)).filter((p) => p.trim()).every((p) => story.includes(p));

/** The story or the script, when it waits on the user (the one rule waitingKeys, the flow's Story step and the item of
 *  "Waiting for you" share):
 *  - the script: its current version is a draft and no version of it was ever locked, and Alma's own card does not
 *    ask for the lock already (one question, not two);
 *  - the story, before there is a script: its current version is not settled, and no card of Alma's asks to settle it.
 *  Never while a story sub-agent is running or queued (it is Alma's work then), and only at the story stage
 *  (atStoryStage): a settled story without a script waits on Alma, not the user. */
export function storyWait(s: FilmState, tasks: TaskCard[]): StoryWait | undefined {
  if (!atStoryStage(s) || liveAims(tasks, 'story').length) return undefined;
  const asks = (s.feed?.asks ?? []).filter((c) => c.place === 'story');
  const sent = (key: string) => !!s.sentKeys?.includes(key);
  const sc = s.script;
  if (sc) {
    const v = sc.current;
    if (!v || sc.versions.some((x) => x.locked) || asks.some((c) => /\block/i.test(c.title))) return undefined;
    const md = sc.markdown ?? '';
    const scenes = scriptScenes(s).filter((x) => x.rows.length);
    const spoken = scenes.flatMap((x) => x.rows.flatMap((r) => (r.kind === 'line' ? [{ scene: x.id, n: r.n, text: r.text }] : [])));
    // the length as the Script page's timing table adds it up: each scene's seconds and the cards with a length
    const timed = scenes.every((x) => (x.seconds ?? x.scriptSeconds) !== undefined);
    const secs = timed && scenes.length ? scenes.reduce((n, x) => n + (x.seconds ?? x.scriptSeconds ?? 0), 0) + scriptCards(md).reduce((n, c) => n + (c.seconds ?? 0), 0) : undefined;
    // the story it came from: the settled one (its words are the newest story's while that one is settled), else the
    // version the script's own "## Story" names, whose words it copies under that heading
    const from = storyVersionOf(md);
    const settledV = s.story?.settled?.version;
    const baseV = settledV ?? from;
    const lines = md.split('\n');
    const span = sectionSpan(lines, /^##\s+Story\b/);
    const baseText = settledV && settledV === s.story?.current ? s.story.text : baseV && baseV === from && span ? lines.slice(span.head + 1, span.end).join('\n') : undefined;
    const story = baseText ? bare(baseText) : undefined;
    const differ = story ? spoken.filter((l) => !inStory(l.text, story)) : undefined;
    const key = `story:script-${v}`;
    const newer = s.story && baseV && s.story.current !== baseV ? s.story.current : undefined;
    return {
      kind: 'script', key, version: v, sent: sent(key),
      title: `Script ${v} is ready to lock`,
      line: [secs !== undefined ? fmtClock(secs) : '', plural(scenes.length, 'scene'), plural(spoken.length, 'spoken line'),
        differ && baseV ? (differ.length ? `${differ.length} ${differ.length === 1 ? 'differs' : 'differ'} from story ${baseV}` : `word for word from story ${baseV}`) : ''].filter(Boolean).join(' · '),
      status: `${v} draft · waits for your lock`,
      summary: [
        scenes.length ? `The scenes: ${scenes.map((x) => `${x.id} ${x.title}`).join(' · ')}.` : '',
        baseV ? `Written from story ${baseV}${baseV === settledV ? `, the story you settled${s.story?.settled?.at ? ` on ${fmtDate(s.story.settled.at)}` : ''}` : ''}${newer ? `; story ${newer} is newer and not in it` : ''}.` : '',
        differ && baseV ? (differ.length ? `Changed from story ${baseV}: ${linesWord(differ)}.` : `Every spoken line is word for word from story ${baseV}.`) : '',
        'Your lock is the go for the first round of asset work: the places and the people start from it.',
      ].filter(Boolean),
    };
  }
  const st = s.story;
  if (!st || st.settled?.version === st.current || asks.some((c) => /\bsettl/i.test(c.title))) return undefined;
  const cur = st.versions.find((x) => x.version === st.current);
  const words = st.text.split(/\s+/).filter(Boolean).length;
  // its first sentence, past any heading
  const prose = st.text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n').trim();
  const first = /^[\s\S]*?[.!?]["”’]?(?=\s|$)/.exec(prose)?.[0].replace(/\s+/g, ' ').trim();
  const key = `story:story-${st.current}`;
  return {
    kind: 'story', key, version: st.current, sent: sent(key),
    title: `Story ${st.current} is ready to read and settle`,
    line: [plural(words, 'word'), cur?.by === 'you' ? 'your edit' : 'Alma’s draft', cur?.date ? fmtDate(cur.date) : '', st.versions.length > 1 ? plural(st.versions.length, 'version') : ''].filter(Boolean).join(' · '),
    status: `story ${st.current} · waits for your read`,
    summary: [
      first ? `It opens: “${first.length > 180 ? `${first.slice(0, 179).trimEnd()}…` : first}”` : '',
      st.settled ? `Story ${st.settled.version} was settled before; ${st.current} is newer.` : '',
      'Once you settle it, Alma writes the script from it. The lock comes after, and it is yours.',
    ].filter(Boolean),
  };
}

/** The page a stage belongs to, as the sidebar names it (SPEC §6a: Story = 1, Character = 2–3, …). */
export const STAGE_SHORT: Record<Stage, string> = {
  1: 'Story', 2: 'Characters', 3: 'Voices', 4: 'Locations', 5: 'Previz', 6: 'Scenes', 7: 'Scenes', 8: 'Scenes',
  9: 'Edit', 10: 'Finish', 11: 'Sound', 12: 'Release',
};

/** `<stage> · <state>` for the sidebar and the pinned chip on Main. */
export function filmSubtitle(s: FilmState, tasks: TaskCard[]): string {
  const stage = s.film.stage;
  const name = stage ? STAGE_SHORT[stage] : 'Story';
  const keys = waitingKeys(s, tasks);
  return keys.length ? `${name} · ${waitingWords(keys)}` : name;
}

/** "1 pick waiting", "6 picks waiting" (never "0 of 6"). */
export function picksWaiting(n: number): string {
  return `${n} ${n === 1 ? 'pick' : 'picks'} waiting`;
}

// ---- Scenes

/** A scene's credits: SceneRef.cost (its takes and pick-ups, refunds netted), else its takes' and pick-ups' own costs. */
export function sceneCredits(sc: SceneRef): number {
  return sc.cost?.credits ?? sumCredits(sc.takes.map((t) => t.cost));
}

/** "7 · test A–D · grey 1": take ids grouped by their word, numbered takes counted. */
export function summariseTakes(takes: TakeRef[]): string {
  const groups = new Map<string, string[]>();
  for (const t of takes.filter((k) => k.kind === 'take')) {
    const m = /^([a-z]+?)(?:-take)?-?(\d+[A-Z]?|[A-Z])$/.exec(t.id);
    const key = m ? m[1] : t.id;
    const val = m ? m[2] : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(val);
  }
  const out: string[] = [];
  for (const [k, v] of groups) {
    if (k === 'take') out.push(String(v.length));
    else if (v.length === 1) out.push(`${k} ${v[0]}`.trim());
    else out.push(`${k} ${v[0]}–${v[v.length - 1]}`);
  }
  const fixes = takes.filter((k) => k.kind === 'pickup').length;
  if (fixes) out.push(`${fixes} ${fixes === 1 ? 'pick-up' : 'pick-ups'}`);
  return out.join(' + ') || '—';
}

/** The take ids in the cut: the timeline's clips when FilmState.cut.current exists (pass state.cut), else
 *  SceneRef.inCut ("grey3 + FIX-lamp-S3 · take 4", what the record says). */
export function cutTakeIds(sc: SceneRef, cut?: CutInfo): string[] {
  return timelineTakeIds(sc, cut);
}
export function cutLabel(sc: SceneRef, cut?: CutInfo): string {
  return cutTakeIds(sc, cut).map(takeLabel).join(' + ') || '—';
}

export interface Miss { category: string; text: string }
/** "blocking: Small background figures…" → {category, text}. */
export function parseMiss(m: string): Miss {
  const x = /^([a-z][a-z +-]{1,24}):\s+([\s\S]*)$/.exec(m);
  return x ? { category: x[1], text: x[2] } : { category: 'miss', text: m };
}

export function openMisses(sc: SceneRef, cut?: CutInfo): Miss[] {
  const inCut = new Set(cutTakeIds(sc, cut));
  return sc.takes.filter((t) => inCut.has(t.id)).flatMap((t) => (t.misses ?? []).map(parseMiss));
}

/** Location per scene: the scene file's (SceneRef.location), else the script's heading ("### S1 · The bottle · L01 the shore"). */
export function sceneLocations(markdown?: string, scenes?: SceneRef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sc of scenes ?? []) if (sc.location) out[sc.id] = sc.location;
  if (!markdown) return out;
  for (const m of markdown.matchAll(/^###\s+(S\d+)\s+·\s+[^·\n]+·\s+(.+)$/gm)) if (!(m[1] in out)) out[m[1]] = m[2].trim();
  return out;
}

// ---- Script

/** `seconds` is the scene file's length (the truth); `scriptSeconds` what the script's own table under the scene says ("≈ s"). */
export interface ScriptScene { id: string; title: string; location?: string; seconds?: number; scriptSeconds?: number; rows: ScriptRow[] }
export type ScriptRow = { kind: 'line'; id: string; n: number; speaker: string; text: string; direction?: string } | { kind: 'action'; id: string; seconds?: string; text: string };

const norm = (t: string) => t.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The rows of one "### S<n>" section of script.md: `[2 s]` actions and **SPEAKER:** lines, in order.
 *  Spoken lines take their IDs from the state's lines (matched by text), so chips cite L01, L02 … */
function sectionRows(section: string, sid: string, lines: ScriptLine[]): ScriptRow[] {
  const rows: ScriptRow[] = [];
  let n = 0;
  let a = 0;
  for (const raw of section.split('\n')) {
    const act = /^`\[(\d+(?:\.\d+)?)\s*s\]`\s*(.*)$/.exec(raw.trim());
    if (act) { rows.push({ kind: 'action', id: `${sid}-a${++a}`, seconds: `${act[1]} s`, text: act[2] }); continue; }
    const sp = /^\*\*([^*]+?):?\*\*\s*(?:\*\(([^)]*)\)\*)?\s*:?\s*"(.*)"\s*$/.exec(raw.trim());
    if (!sp) continue;
    const text = sp[3];
    const hit = lines.find((l) => l.sceneId === sid && norm(l.text) === norm(text));
    n += 1;
    rows.push({ kind: 'line', id: hit?.id ?? `${sid}-l${n}`, n, speaker: sp[1].trim(), text, direction: hit?.direction ?? sp[2] });
  }
  return rows;
}

/** The "≈ s" cell of the scene's row in the script's timing table under it: the figure after its last "→" or "="
 *  ("53 ÷ 2.9 + 3.0 + 4 = 25.3 → 25" → 25, "14.2 → **15**" → 15, "52 ÷ 2.9 + 0.5 × 3 + 5 = 24" → 24), else its first
 *  ("**12** (inside S7's 23 s)" → 12). */
function tableSeconds(body: string, sid: string): number | undefined {
  const rows = body.split('\n').filter((l) => l.trim().startsWith('|')).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const head = rows.find((r) => r.some((c) => /^≈\s*s$/.test(c)));
  if (!head) return undefined;
  const col = head.findIndex((c) => /^≈\s*s$/.test(c));
  const row = rows.find((r) => r[0] === sid || r[0]?.startsWith(`${sid} `));
  const cell = row?.[col];
  if (!cell) return undefined;
  const c = cell.replace(/\*\*/g, '');
  const n = /[→=]\s*(\d+(?:\.\d+)?)(?![\s\S]*[→=])/.exec(c)?.[1] ?? /^(\d+(?:\.\d+)?)\b/.exec(c)?.[1];
  return n ? Number(n) : undefined;
}

/** Lines grouped by scene; a line with no speaker is a direction, its "[2 s]" prefix the action time. */
export function scriptScenes(s: FilmState): ScriptScene[] {
  const locs = sceneLocations(s.script?.markdown, s.scenes);
  const byId = new Map<string, ScriptScene>();
  for (const sc of s.scenes) byId.set(sc.id, { id: sc.id, title: sc.title, location: locs[sc.id], seconds: sc.seconds, rows: [] });
  const md = s.script?.markdown ?? '';
  const heads = [...md.matchAll(/^###\s+(S\d+)\s+·\s+([^·\n]+?)(?:\s+·.*)?$/gm)];
  if (heads.length) {
    const seen = new Set<string>();
    heads.forEach((h, i) => {
      const sid = h[1];
      if (seen.has(sid)) return;   // a later "### S1" (an earlier draft) is not the current script
      seen.add(sid);
      const body = md.slice((h.index ?? 0) + h[0].length, heads[i + 1]?.index ?? md.length).split(/^##\s/m)[0];
      if (!byId.has(sid)) byId.set(sid, { id: sid, title: h[2].trim(), location: locs[sid], rows: [] });
      byId.get(sid)!.rows = sectionRows(body, sid, s.script?.lines ?? []);
      byId.get(sid)!.scriptSeconds = tableSeconds(body, sid);
    });
    return [...byId.values()];
  }
  const counters = new Map<string, number>();
  for (const l of s.script?.lines ?? []) {
    const sid = l.sceneId ?? '—';
    if (!byId.has(sid)) byId.set(sid, { id: sid, title: '', location: locs[sid], rows: [] });
    const scene = byId.get(sid)!;
    if (!l.speaker) {
      const m = /^\[(\d+(?:\.\d+)?\s*s)\]\s*([\s\S]*)$/.exec(l.text);
      scene.rows.push({ kind: 'action', id: l.id, seconds: m?.[1], text: m ? m[2] : l.text });
    } else {
      const n = (counters.get(sid) ?? 0) + 1;
      counters.set(sid, n);
      scene.rows.push({ kind: 'line', id: l.id, n, speaker: l.speaker, text: l.text });
    }
  }
  return [...byId.values()];
}

// ---- Brief

export interface BriefParts { title: string; subtitle: string; fields: [string, string][]; premise?: string; sections: { heading: string; items: { label?: string; text: string }[] }[] }

/** A light read of brief.md: the title line, the "- Key: value" facts, the premise and each "##" section's bullets. */
export function parseBrief(md?: string): BriefParts {
  const out: BriefParts = { title: '', subtitle: '', fields: [], sections: [] };
  if (!md) return out;
  const lines = md.split('\n');
  let section: BriefParts['sections'][number] | undefined;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = /^#\s+(.*?)(?:\s+\((.*)\))?$/.exec(line);
    if (h1 && !out.title) {
      out.title = h1[1];
      const wt = /working title (?:was )?([^;)]+)/.exec(h1[2] ?? '');
      if (wt) out.subtitle = `working title ${wt[1].trim()}`;
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) { section = { heading: h2[1], items: [] }; out.sections.push(section); continue; }
    const started = /^Started ([^.]+)\./.exec(line);
    if (started && !section) { out.subtitle = `Started ${started[1]}${out.subtitle ? ` · ${out.subtitle}` : ''}`; continue; }
    const prem = /^\*\*Premise:?\*\*:?\s*(.*)$/.exec(line);
    if (prem) { out.premise = prem[1]; continue; }
    // a "## Premise" section's paragraph is the premise (brief.md since Nov 2026)
    if (section && /^Premise$/i.test(section.heading) && line.trim() && !out.premise && !/^-\s/.test(line)) { out.premise = line.trim(); continue; }
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1];
      if (!section) {
        const kv = /^([A-Z][A-Za-z ]{1,20}):\s+(.*)$/.exec(text);
        if (kv && !/^Title$/.test(kv[1])) out.fields.push([kv[1] === 'Aspect ratio' ? 'Ratio' : kv[1], kv[2]]);
        continue;
      }
      const lab = /^\*\*(.+?)\*\*[,:]?\s*(.*)$/.exec(text);
      section.items.push(lab ? { label: lab[1].replace(/:$/, ''), text: lab[2] } : { text });
    }
  }
  return out;
}

/** The character's bullet in the brief: "- **C01 Maren**, …" (bold = ID and name only, not "C01 face: r1-7")
 *  with its indented continuation lines. */
function characterBullet(md: string, id: string): { head: string; body: string[] } | undefined {
  const lines = md.split('\n');
  const idRe = id.replace(/[–-]/g, '[–-]');
  const headRe = new RegExp(`^-\\s+\\*\\*${idRe}\\s+[^*:]*\\*\\*(.*)$`);
  const i = lines.findIndex((l) => headRe.test(l));
  if (i < 0) return undefined;
  const body: string[] = [];
  for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) body.push(lines[j].trim());
  return { head: headRe.exec(lines[i])![1], body };
}

const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((x) => x.replace(/\.$/, '').trim()).filter(Boolean);

/** The brief's lines for one character: the description under its Cast bullet, one sentence per line.
 *  Bold "Locked …" notes are records, not the brief, and are left out. */
export function characterBrief(md: string | undefined, id: string): string[] {
  if (!md) return [];
  const b = characterBullet(md, id);
  if (!b) return [];
  const body = b.body.filter((l) => !/^\*\*/.test(l)).map((l) => l.replace(/\*\*/g, ''));
  if (!body.length) return sentences(b.head.replace(/^[,;:\s]+/, ''));
  return body.flatMap(sentences);
}

/** The scenes the brief names for a character ("…, the keeper of the light; every generation (S1 to S5)."). */
export function briefScenes(md: string | undefined, id: string): string | undefined {
  if (!md) return undefined;
  const head = characterBullet(md, id)?.head;
  return head ? /\b(S\d+(?:\s+(?:to|and)\s+S\d+)?)\b/.exec(head)?.[1] : undefined;
}

export function scenesWhere(s: FilmState, c: CharacterRef): string {
  const name = c.name.replace(/^the /, '').toUpperCase();
  const ids = s.scenes.filter((sc) => s.script?.lines.some((l) => l.sceneId === sc.id && (l.speaker === name || l.text.includes(name)))).map((sc) => sc.id);
  if (!ids.length) return '';
  if (ids.length === 1) return ids[0];
  return `${ids[0]} to ${ids[ids.length - 1]}`;
}

// ---- Props

/** The prop's one-line description from the brief: "- **P01 the bottle (pithos)**: a large clay storage jar of …, about …" → its first clause. */
export function propBrief(md: string | undefined, id: string): string | undefined {
  if (!md) return undefined;
  const m = new RegExp(`^-\\s+\\*\\*${id}\\b[^*]*\\*\\*:?\\s*(.+)$`, 'm').exec(md);
  return m ? m[1].split(/[,;.:]\s/)[0].trim() : undefined;
}

/** A prop round made inside a place (cut out of a location image) rather than on its own. */
export const inPlaceRound = (r: Round) => /extract|place|cut|from/i.test(r.id) || (r.candidates.length > 0 && r.candidates.every((c) => /^from-/.test(c.id)));
