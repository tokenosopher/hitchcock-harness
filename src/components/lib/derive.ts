// What the pages read off a FilmState: pick states, stage states, the gate inbox, scene summaries.
// Pure functions, no I/O; everything here is derived from the contract in src/server/types.ts.
import type { CharacterRef, CutInfo, FilmState, LocationRef, Round, SceneRef, ScriptLine, Stage, TakeRef, TaskCard, ThreadEvent } from '@/server/types';
import { cutTakeIds as timelineTakeIds } from './cut';
import { fmtCredits, fmtDate, sumCredits, takeLabel } from './format';

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
export const voiceDone = (c: CharacterRef) => !!(c.voice?.pick || c.voice?.elementLine || c.element?.state === 'final');
/** The master is settled when it is picked, or when views were made from it. */
export const locationSettled = (l: LocationRef) => !!(l.master?.picked || l.views?.length);

export type PartState = 'done' | 'ready' | 'running' | 'queued' | 'waiting';
/** One character, location or scene on a node: its state and one line. */
export interface Part { id: string; name: string; state: PartState; line: string; aims: TaskAim[]; round?: Round }

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
export function voiceParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).filter(speaks).map((c) => partOf({ id: c.id, name: c.name, rounds: c.voice?.rounds, aims: liveAims(tasks, 'voices', c.id),
    done: voiceDone(c) ? (c.voice?.pick ? `option ${c.voice.pick.candidateId} picked` : 'picked') : undefined,
    blocked: faceDone(c) ? undefined : 'after the face pick' }));
}
export function elementParts(s: FilmState, tasks: TaskCard[]): Part[] {
  return castOf(s).filter(speaks).map((c) => {
    const aims = liveAims(tasks, 'elements', c.id);
    if (c.element?.state === 'final') return { id: c.id, name: c.name, state: 'done', line: 'final', aims };
    if (aims.length) return { id: c.id, name: c.name, state: 'running', line: 'running', aims };
    if (c.element?.state === 'draft') return { id: c.id, name: c.name, state: 'ready', line: 'draft · waiting for your yes', aims };
    return { id: c.id, name: c.name, state: 'waiting', line: 'after the picks', aims };
  });
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

/** The scenes the go for the video starts: no take yet (landed or generating), the newest prompt passed its check.
 *  Empty unless every such scene is ready (SPEC principle 7: the one hard spend gate). */
export function goScenes(s: FilmState, tasks: TaskCard[]): string[] {
  if (s.film.status === 'delivered' || !s.scenes.length || liveAims(tasks, 'scenes').length) return [];
  const rest = s.scenes.filter((sc) => !sc.takes.some((t) => t.kind === 'take'));
  if (!rest.length) return [];
  return rest.every((sc) => sc.promptVersions[sc.promptVersions.length - 1]?.checkPassed) ? rest.map((sc) => sc.id) : [];
}

/** The gate page: every pick waiting, in the chains first (faces, masters), then at the gate (voices, the rest, the go). */
export function gateItems(s: FilmState, tasks: TaskCard[]): GateItem[] {
  if (s.film.status === 'delivered') return [];
  const items: GateItem[] = [];
  const cast = castOf(s);
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
  const voices = voiceParts(s, tasks).filter((v) => v.state !== 'done');
  if (voices.length) {
    const ready = voices.filter((v) => v.state === 'ready');
    const running = voices.filter((v) => v.state === 'running' || v.state === 'queued');
    const held = cast.filter(speaks).some((c) => !faceDone(c));  // the voice picks come after the face picks
    items.push({
      key: 'pick:voices', id: '', title: 'Voices', chip: 'Voices', group: 'gate', kind: 'voices',
      state: ready.length ? 'ready' : held ? 'waiting' : running.length ? 'running' : 'waiting',
      meta: ready.length ? `${ready.map((v) => v.id).join(' ')} ready · ${ready.length} of ${voices.length}` : held ? 'Waiting for faces'
        : running.length ? `${running.map((v) => v.id).join(' ')} running` : 'Not started',
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
  return items;
}

/** The page a stage belongs to, as the sidebar names it. */
export const STAGE_SHORT: Record<Stage, string> = {
  1: 'Story', 2: 'Characters', 3: 'Voices', 4: 'Locations', 5: 'Previz', 6: 'Scenes', 7: 'Scenes', 8: 'Scenes',
  9: 'Edit', 10: 'Finish', 11: 'Sound', 12: 'Release',
};

/** `<stage> · <state>` for the sidebar and the pinned chip on Main. */
export function filmSubtitle(s: FilmState, tasks: TaskCard[]): string {
  const stage = s.film.stage;
  const name = stage ? STAGE_SHORT[stage] : 'Story';
  const waiting = gateItems(s, tasks).length + (s.feed?.asks.length ?? 0);
  return waiting ? `${name} · ${picksWaiting(waiting)}` : name;
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

/** The "≈ s" cell of the scene's row in the script's timing table under it ("53 ÷ 2.9 + 3.0 + 4 = 25.3 → 25" → 25). */
function tableSeconds(body: string, sid: string): number | undefined {
  const rows = body.split('\n').filter((l) => l.trim().startsWith('|')).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const head = rows.find((r) => r.some((c) => /^≈\s*s$/.test(c)));
  if (!head) return undefined;
  const col = head.findIndex((c) => /^≈\s*s$/.test(c));
  const row = rows.find((r) => r[0] === sid || r[0]?.startsWith(`${sid} `));
  const cell = row?.[col];
  if (!cell) return undefined;
  const n = /→\s*(\d+(?:\.\d+)?)\s*$/.exec(cell)?.[1] ?? /^(\d+(?:\.\d+)?)\b/.exec(cell)?.[1];
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
