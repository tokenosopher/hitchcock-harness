// The flow board on Main (design/boards/Main.dc.html): Story, then two chains in parallel (A the places,
// B the people) with their small in-chain gates, the closing gate "Your picks", then the stages in order.
// Every node's state is read off the FilmState; "running" also comes from the thread's live task cards.
import type { FeedCard, FilmState, TaskCard } from '@/server/types';
import {
  clothingParts, elementParts, faceParts, gateItems, goScenes, liveAims, locationParts, locationSettled,
  partsStatus, roundNo, sheetParts, voiceParts, type FlowKey, type GateItem, type Part, type TaskAim,
} from './derive';
import { fmtDate } from './format';

/** locked = a check; done = white dot; running = pulsing dot; pick = ring (waits for the user); waiting = dashed border. */
export type NodeState = 'locked' | 'done' | 'running' | 'pick' | 'waiting';

export interface FlowNode {
  key: FlowKey;
  num: string;            // "2b", "6–8"
  name: string;
  /** The step's page title when the board's short name would not say enough ("Shots" → "Scene files and shot lists"). */
  title?: string;           // "Clothing"
  chip: string;           // what "Alma sees" gets: "2b Clothing"
  state: NodeState;
  status: string;         // one line, from the files
  short: string;          // the same in the few words a board node has room for
  aims: TaskAim[];        // the live sub-agents on it
  parts: Part[];          // per character, location or scene (the node's page lists them)
  href?: string;          // its full page, relative to the film
  kicker: string;         // the node page's label
  body: string;           // the node page's one paragraph
}

export interface Flow {
  nodes: Record<FlowKey, FlowNode>;
  gate: GateItem[];
  /** The review cards that ask and have no answer yet (a round of readings, a yes, a go): they wait at the gate too. */
  asks: FeedCard[];
  /** Cards that ask and are being worked on instead of answered: shown as in progress, options locked. */
  working: FeedCard[];
  /** Everything waiting for the user: the gate's picks plus the open asks. */
  waiting: number;
  faceGate: number;       // face picks still open (the small gate in chain B)
  masterGate: number;     // master picks still open (the small gate in chain A)
  /** The film went out: the board reads as a record. `deliveredOn` is the day, as shown ("9 Nov"). */
  done: boolean;
  deliveredOn?: string;
}

export const CHAIN_A: FlowKey[] = ['loc', 'views', 'shots', 'previz'];
export const CHAIN_B: FlowKey[] = ['faces', 'clothing', 'sheet', 'voices'];
export const AFTER: FlowKey[] = ['elements', 'scenes', 'edit', 'finish', 'sound', 'release'];
export const ORDER: FlowKey[] = ['story', ...CHAIN_A, ...CHAIN_B, 'gate', ...AFTER];
/** The board's three rows as drawn (ASKS 46 and 47, the timeline design's FlowWaiting): the places, the people (with
 *  the video elements at the end), then the gate, Edit and Release. Scenes, Finish and Sound are not boxes any more:
 *  their pages open by their addresses and from Edit's "What's next" list. */
export const PLACES: FlowKey[] = ['loc', 'views', 'shots', 'previz'];
export const PEOPLE: FlowKey[] = ['faces', 'clothing', 'sheet', 'voices', 'elements'];
export const THEN: FlowKey[] = ['gate', 'edit', 'release'];
/** A step that is no longer a box opens under the box that holds it now. */
export const BOX_OF: Partial<Record<FlowKey, FlowKey>> = { scenes: 'edit', finish: 'edit', sound: 'edit' };

function fromParts(parts: Part[]): NodeState {
  if (!parts.length) return 'waiting';
  if (parts.every((p) => p.state === 'done')) return 'done';
  if (parts.some((p) => p.state === 'running' || p.state === 'queued')) return 'running';
  if (parts.some((p) => p.state === 'ready')) return 'pick';
  return 'waiting';
}
const allAims = (parts: Part[], extra: TaskAim[] = []) => [...new Map([...parts.flatMap((p) => p.aims), ...extra].map((a) => [a.task.id, a])).values()];
const range = (ids: string[]) => (ids.length > 2 ? `${ids[0]} to ${ids[ids.length - 1]}` : ids.join(' and '));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// the sound folder groups (src/server/films/read/sound.ts) in the words the Sound node uses
const SOUND_GROUPS: [key: string, one: string, many: string][] = [
  ['mix', 'mix', 'mixes'], ['music', 'music take', 'music takes'], ['sfx', 'effect', 'effects'], ['fixes', 'voice fix', 'voice fixes'],
  ['lines', 'recorded line', 'recorded lines'], ['reads', 'table read', 'table reads'], ['stems', 'stem', 'stems'],
];
const SOUND_STATUS = ['mix', 'music', 'sfx', 'fixes'];
const SOUND_TITLE: Record<string, string> = { mix: 'Mixes', music: 'Music', sfx: 'Effects', fixes: 'Voice fixes', lines: 'Recorded lines', reads: 'Table reads', stems: 'Stems' };

/** The release in the words the board, the sidebar and the Release page share: what the record shows, and no more (ASKS 37). */
export function releaseWords(f: FilmState['film']): string {
  if (f.status === 'delivered') return f.delivered?.length ? `delivered ${fmtDate(f.delivered[0].date)}` : 'delivered';
  const c = f.copies?.[f.copies.length - 1];
  return c ? `nothing released yet · a copy in final cuts since ${fmtDate(c.date)}` : 'nothing released yet';
}

export function flowOf(s: FilmState, tasks: TaskCard[]): Flow {
  const delivered = s.film.status === 'delivered';
  const gate = gateItems(s, tasks);
  const asks = s.feed?.asks ?? [];
  const waiting = gate.length + asks.length;
  const node = (key: FlowKey, num: string, name: string, o: Partial<FlowNode> & { state: NodeState; status: string }): FlowNode => {
    const aims = o.aims ?? allAims(o.parts ?? []);
    // a live sub-agent makes a node run; a delivered film has nothing left waiting
    let state = o.state;
    let status = o.status;
    let short = o.short ?? o.status;
    const live = aims.some((a) => a.task.state === 'running');
    if (live && state !== 'locked') state = 'running';
    if (delivered && (state === 'waiting' || state === 'pick')) state = 'done';
    // a card that asks about this work waits for the user, on a delivered film too
    const here = key === 'gate' ? 0 : asks.filter((c) => c.place === key).length;
    if (here) {
      if (!live) state = 'pick';
      status = [here === 1 ? 'waits for you' : `${here} wait for you`, status].filter(Boolean).join(' · ');
      short = here === 1 ? 'waits' : `${here} wait`;
    }
    return { key, num, name, chip: num ? `${num} ${name}` : 'Gate · your picks', parts: [], kicker: '', body: '', ...o, aims, state, status, short };
  };

  // 1 Story
  const versions = s.script?.versions ?? [];
  const locked = versions.find((v) => v.version === s.script?.current && v.locked) ?? versions.find((v) => v.locked);
  const story = node('story', '1', 'Story', {
    state: locked ? 'locked' : s.script || s.story ? 'running' : 'waiting',
    status: locked ? `${locked.version} locked` : s.script ? `${s.script.current ?? 'draft'} draft` : s.story ? `story ${s.story.current}${s.story.settled?.version === s.story.current ? ' settled' : ''}` : 'no story yet',
    aims: liveAims(tasks, 'story'), href: 'story', kicker: locked ? 'Stage 1 · locked' : 'Stage 1 · Setup and story',
    body: locked
      ? `Script ${locked.version} is locked: ${plural(s.scenes.length, 'scene')}, ${plural(s.script?.lines.filter((l) => l.speaker).length ?? 0, 'line')}. Both chains started from it.`
      : s.script ? 'The script is not locked yet. The lock is the go for the first round of asset work in both chains.'
        : 'First the story, as prose with the dialogue in it, to read and edit on the Story page. Once you settle it Alma writes the script from it; the script lock is the go for the first round of asset work in both chains.',
  });

  // Chain A · places
  const locs = locationParts(s, tasks);
  const props = s.locations.flatMap((l) => l.props ?? []);
  const propsNote = props.length ? ` · ${plural(props.length, 'prop')}` : '';
  const settled = s.locations.filter(locationSettled);
  const open = locs.filter((p) => p.state !== 'done');
  const locStatus = !locs.length ? 'no locations yet'
    : !open.length ? (locs.length === 1 ? `${locs[0].id} picked${propsNote}` : `${locs.length} of ${locs.length} picked${propsNote}`)
    : open.map((p) => (p.round ? `${p.id} round ${roundNo(p.round)}${p.state === 'ready' ? ' · ready' : ''}` : `${p.id} not started`)).join(' · ') + propsNote;
  const locShort = !locs.length ? 'none yet'
    : !open.length ? `${locs.length === 1 ? locs[0].id : `${locs.length} of ${locs.length}`}${propsNote}`
    : open.length === 1 ? (open[0].round ? `${open[0].id} round ${roundNo(open[0].round)}${open[0].state === 'ready' ? ' · ready' : ''}` : `${open[0].id} not started`)
    : `${open.length} of ${locs.length} open`;
  const loc = node('loc', '4', 'Locations', {
    state: fromParts(locs), status: locStatus, short: locShort, parts: locs, aims: allAims(locs, liveAims(tasks, 'loc').filter((a) => !a.ids.some((i) => /^L/.test(i)))),
    href: 'locations', kicker: 'Stage 4 · chain A, the places',
    body: 'One style image per location, then your master pick; the props are made both ways, inside the place and on their own.',
  });
  const viewCount = settled.reduce((n, l) => n + (l.views?.length ?? 0), 0);
  const viewAims = liveAims(tasks, 'views');
  const views = node('views', '4b', 'Views', {
    state: !settled.length ? 'waiting' : settled.every((l) => l.views?.length) ? 'done' : viewAims.length ? 'running' : 'waiting',
    status: !settled.length ? 'after master' : viewCount ? `${settled.length === 1 ? `${settled[0].id} · ` : ''}${plural(viewCount, 'view')}` : 'not started',
    short: !settled.length ? 'after pick' : viewCount ? plural(viewCount, 'view') : 'not yet',
    aims: viewAims, href: 'locations', kicker: 'Stage 4 · chain A, after the master pick',
    parts: settled.map((l) => ({ id: l.id, name: l.name, state: l.views?.length ? 'done' : 'waiting', line: l.views?.length ? l.views.map((v) => v.camera).join(', ') : 'not started', aims: liveAims(tasks, 'views', l.id) })),
    body: 'Views of each picked master: cameras close together share one, and a camera that sees a really different side of the place gets its own.',
  });
  // Stage 5 begins with the text: one scene file per scene (generations/<G>/<G>-scene.md) with its shot list, acting
  // tasks, fight beats and start and end states. The Blender previz is built from it, and after the previz is approved
  // the scene prompt is assembled from it. So it gets its own step before Previz.
  const shotAims = liveAims(tasks, 'shots');
  const written = s.scenes.filter((sc) => sc.sceneFile);
  const shots = node('shots', '5', 'Shots', {
    title: 'Scene files and shot lists',
    state: !s.scenes.length ? (shotAims.length ? 'running' : 'waiting') : written.length === s.scenes.length ? 'done' : shotAims.length ? 'running' : 'waiting',
    status: !s.scenes.length ? (locked ? 'not started' : 'after the script lock') : `${written.length} of ${plural(s.scenes.length, 'scene file')} written`,
    short: !s.scenes.length ? (locked ? 'not started' : 'after lock')
      : written.length === s.scenes.length && s.scenes.some((sc) => sc.shots) ? `${plural(s.scenes.length, 'scene')}, ${plural(s.scenes.reduce((n, sc) => n + (sc.shots ?? 0), 0), 'shot')}`
      : `${written.length} of ${s.scenes.length}`,
    aims: shotAims, href: 'scenes', kicker: 'Stage 5 · chain A, before the Blender previz',
    parts: s.scenes.map((sc) => ({ id: sc.id, name: sc.title, state: sc.sceneFile ? 'done' : 'waiting', line: sc.sceneFile ? [sc.shots ? plural(sc.shots, 'shot') : '', sc.seconds ? `${sc.seconds} s` : ''].filter(Boolean).join(' · ') || 'written' : 'not written', aims: liveAims(tasks, 'shots', sc.id) })),
    body: 'One scene file per scene: the shot list, the acting task of everyone in frame, any fight beats, and where everyone starts and ends. The Blender previz is built from it, and once the previz is approved the scene prompt is assembled from the same text, so the boards and the prompt cannot disagree.',
  });
  const pv = s.previz?.film[s.previz.film.length - 1];
  const pb = s.previz?.storyboards[s.previz.storyboards.length - 1];
  const waitingFor = s.locations.filter((l) => !locationSettled(l)).map((l) => l.id);
  // a previz per scene (previz/<S>/<S>-previz-take-<n>.mp4, The Lighthouse) counts as the previz too
  const pvScenes = s.scenes.filter((sc) => sc.previzPath).length;
  const pvAll = s.scenes.length > 0 && pvScenes === s.scenes.length;
  const previz = node('previz', '5', 'Previz', {
    state: pv || pvAll ? 'done' : 'waiting',
    status: pvScenes ? `${pvScenes} of ${plural(s.scenes.length, 'scene')}${pv ? ` · ${pv.version}` : ''}` : pv ? [pv.version, pb ? `boards ${pb.version}` : ''].filter(Boolean).join(' · ') : waitingFor.length ? `waiting for ${waitingFor.join(' ')}` : 'not started',
    short: pvScenes ? `${pvScenes} of ${plural(s.scenes.length, 'scene')}` : pv ? (pb && pb.version !== pv.version ? `${pv.version} · ${pb.version}` : pv.version) : waitingFor.length ? 'waiting' : 'not yet',
    aims: liveAims(tasks, 'previz'), kicker: 'Stage 5 · chain A', body: '',
  });

  // Chain B · people
  const faceP = faceParts(s, tasks);
  const faces = node('faces', '2', 'Faces', { state: fromParts(faceP), status: partsStatus(faceP, 'picked') || 'no cast yet', parts: faceP, href: 'character',
    kicker: 'Stage 2 · chain B, the people', body: 'One face per character, picked from its rounds as they land; clothing and the sheet follow each pick at once.' });
  const clothP = clothingParts(s, tasks);
  const clothing = node('clothing', '2b', 'Clothing', { state: fromParts(clothP), status: partsStatus(clothP, 'picked') || 'after the face pick', parts: clothP, href: 'character',
    kicker: 'Stage 2 · chain B, after the face pick', body: 'Clothing per character, made from the picked face as soon as it is picked; its results land next to that face.' });
  const sheetP = sheetParts(s, tasks);
  const sheet = node('sheet', '2c', 'Sheet', { state: fromParts(sheetP), status: partsStatus(sheetP, 'approved') || 'after clothing', short: partsStatus(sheetP, 'done') || 'after clothing', parts: sheetP, href: 'character',
    kicker: 'Stage 2 · chain B, after clothing', body: 'One character sheet per character, from the picked face and clothing.' });
  const voiceP = voiceParts(s, tasks);
  const voices = node('voices', '3', 'Voices', { state: fromParts(voiceP), status: partsStatus(voiceP, 'picked') || 'after the face pick', parts: voiceP, href: 'character/voices',
    kicker: 'Stage 3 · chain B, picked at the gate', body: 'Voice designs per character, as options; you pick them at the gate.' });

  // The gate
  const gateNode = node('gate', '', 'Your picks', {
    state: waiting ? 'pick' : 'done', status: waiting ? `${waiting} waiting` : delivered ? 'every pick made' : 'nothing waiting', aims: [], kicker: 'Gate · where both chains meet', body: '',
  });

  // Then, in order
  const elP = elementParts(s, tasks);
  const elements = node('elements', '3b', 'Video elements', { state: fromParts(elP), status: elP.every((p) => p.state === 'done') && elP.length ? `${elP.length} of ${elP.length} final` : elP.some((p) => p.state !== 'waiting') ? partsStatus(elP, 'final') : 'after picks',
    short: elP.length ? `${elP.filter((p) => p.state === 'done').length} of ${elP.length}` : 'after picks',
    parts: elP, href: 'character/elements', kicker: 'Stage 3 · after the gate',
    body: 'One video element per character (1920×1080 split screen, 5 s, a hard cut each second), built from the picked face, clothing, sheet and voice.' });

  const scenes = s.scenes;
  const landed = scenes.flatMap((sc) => sc.takes.filter((t) => t.kind === 'take' && t.path));
  const stoppedTakes = scenes.flatMap((sc) => sc.takes.filter((t) => t.kind === 'take' && !t.path && t.stopped).map((t) => `${sc.id} ${t.id.replace(/^take/, 'take ')} ${t.stopped}`));
  const pending = scenes.flatMap((sc) => sc.takes.filter((t) => t.kind === 'take' && !t.path && !t.stopped).map((t) => `${sc.id} ${t.id.replace(/^take/, 'take ')}`));
  const pickups = scenes.reduce((n, sc) => n + sc.takes.filter((t) => t.kind === 'pickup').length, 0);
  const withTake = scenes.filter((sc) => sc.takes.some((t) => t.kind === 'take' && t.path)).length;
  const passed = scenes.filter((sc) => sc.promptVersions[sc.promptVersions.length - 1]?.checkPassed).length;
  const prompted = scenes.filter((sc) => sc.promptVersions.length).length;
  const go = goScenes(s, tasks);
  const sceneAims = liveAims(tasks, 'scenes');
  const sceneParts: Part[] = scenes.map((sc) => {
    const v = sc.promptVersions[sc.promptVersions.length - 1];
    const ts = sc.takes.filter((t) => t.kind === 'take');
    const gen = ts.filter((t) => !t.path && !t.stopped);
    const dead = ts.filter((t) => !t.path && t.stopped);
    const aims = liveAims(tasks, 'scenes', sc.id);
    const promptLine = v ? `prompt ${v.version}${v.checkPassed === true ? ' · check passed' : v.checkPassed === false ? ' · check failed' : v.checkPath ? '' : ' · no check yet'}` : 'no prompt yet';
    const took = ts.length - gen.length - dead.length;
    const takeLine = [took ? `${plural(took, 'take')} landed` : '', gen.length ? `${gen.map((t) => t.id.replace(/^take/, 'take ')).join(', ')} generating` : '', ...dead.map((t) => `${t.id.replace(/^take/, 'take ')} ${t.stopped}`)].filter(Boolean).map((x) => ` · ${x}`).join('');
    return { id: sc.id, name: sc.title, line: promptLine + takeLine, aims,
      state: gen.length || aims.length ? 'running' : took ? 'done' : go.includes(sc.id) ? 'ready' : 'waiting' };
  });
  const scenesNode = node('scenes', '6–8', 'Scenes', {
    state: !scenes.length ? 'waiting' : pending.length || sceneAims.length ? 'running' : go.length ? 'pick' : withTake === scenes.length ? 'done' : 'waiting',
    status: !scenes.length ? 'no scenes yet'
      : delivered ? `${plural(scenes.length, 'scene')} · ${plural(landed.length, 'take')}${pickups ? ` · ${plural(pickups, 'pick-up')}` : ''}`
      : go.length && !pending.length ? `go ready · ${plural(go.length, 'prompt')}`
      : landed.length || pending.length || stoppedTakes.length ? [pending.length ? `${pending.join(' ')} running` : '', stoppedTakes.join(', '), `${withTake} of ${scenes.length} scenes taken`].filter(Boolean).join(' · ')
      : prompted ? `${passed} of ${scenes.length} prompts${go.length ? ' · waiting for go' : ''}`
      : range(scenes.map((sc) => sc.id)),
    short: !scenes.length ? 'none yet' : delivered ? plural(scenes.length, 'scene')
      : go.length && !pending.length ? 'go ready'
      : landed.length || pending.length || stoppedTakes.length ? `${withTake} of ${scenes.length}`
      : prompted ? `${passed} of ${scenes.length}` : plural(scenes.length, 'scene'),
    aims: sceneAims, parts: sceneParts, href: 'scenes', kicker: 'Stages 6 to 8 · prompts, takes, redos',
    body: 'Prompts, takes and redos per scene. The go for the video, before the first takes, is the one hard spend gate: you review every scene, its prompt and the assets fed in, read the quote and say go.',
  });

  const post = s.post;
  const editAims = liveAims(tasks, 'edit');
  const cuts = post?.cuts ?? [];
  // the harness's own timeline (cut/v<n>.json) when the film has one, else the cut files the record names
  const tlVersions = s.cut?.versions ?? [];
  const tlCur = s.cut?.current;
  const tlProxy = tlCur ? s.cut?.renders?.[tlCur.version]?.proxy : undefined;
  const proxyBusy = tlProxy?.state === 'queued' || tlProxy?.state === 'running';
  // the terminal workflow rendered a newer cut than the timeline holds: the edit is still moving, not done
  const ahead = tlCur ? s.cut?.recordAhead : undefined;
  const edit = node('edit', '9', 'Edit', {
    // once the film is delivered, a final made outside the timeline is history, not an edit in progress
    state: tlCur ? (proxyBusy || editAims.length || (ahead && !delivered) ? 'running' : 'done') : cuts.length ? 'done' : 'waiting',
    status: tlCur && delivered && ahead ? `final edit: ${ahead.label.replace(new RegExp(`^${s.film.slug.replace(/-/g, '[ -]')}[ -]*`, 'i'), '') || ahead.label} (${fmtDate(ahead.date)}) · the timeline here stops at ${tlCur.version}`
      : tlCur
      ? [`${tlCur.version} · ${plural(tlVersions.length, 'version')}`, proxyBusy ? `480p ${tlProxy?.state === 'running' ? `${Math.round(tlProxy.percent ?? 0)}%` : 'queued'}` : tlProxy?.state === 'failed' ? '480p failed' : '', ahead ? `record ahead: ${ahead.label}` : ''].filter(Boolean).join(' · ')
      : cuts.length ? plural(cuts.length, 'cut') : 'own tracks',
    short: tlCur ? (proxyBusy ? (tlProxy?.state === 'running' ? `${Math.round(tlProxy.percent ?? 0)}%` : 'queued') : tlProxy?.state === 'failed' ? 'failed' : tlCur.version) : cuts.length ? plural(cuts.length, 'cut') : '',
    aims: editAims, kicker: 'Stage 9 · after Scenes', href: 'edit',
    parts: tlCur
      ? [...tlVersions].reverse().slice(0, 4).map((v) => ({ id: v.version, name: v.note ?? v.version, state: 'done' as const, line: `${v.by === 'alma' ? 'Alma' : v.by === 'migration' ? 'migration' : 'you'} · cut/${v.version}.json`, aims: [] }))
      : cuts.slice(-4).reverse().map((c) => ({ id: '', name: c.split('/').pop()!, state: 'done', line: c, aims: [] })),
    body: tlCur && delivered && ahead ? ''
      : tlCur
      ? `The harness’s own tracks: every change is a step you can undo, kept at once and saved as a version with ⌘S, played live on the Edit page; the 480p and the master are rendered with ffmpeg when asked for. Open the Edit page to cut, or ask Alma.${ahead ? ` The record is ahead: ${ahead.file} (${fmtDate(ahead.date)}) is newer than cut/${ahead.timeline}.json; the Edit page asks Alma to bring the timeline up to it.` : ''}`
      : cuts.length ? 'The cut files in cut/. The Edit page reads the timeline once a cut/v1.json exists.' : 'The harness’s own tracks, once the takes are in.',
  });
  // the film's master by the one rule (server/films/read/master.ts), not every file with 1080 in its folder (ASKS 37)
  const fm = s.master;
  const finish = node('finish', '10', 'Finish', {
    state: fm ? 'done' : 'waiting',
    status: fm ? [`1080p master${fm.version ? ` of ${fm.version}` : ''}${fm.date ? ` · ${fmtDate(fm.date)}` : ''}`, post?.captions.length ? 'captions' : ''].filter(Boolean).join(' · ') : '',
    short: fm ? '1080p' : '',
    aims: liveAims(tasks, 'finish'), kicker: 'Stage 10 · after the edit', href: 'finish',
    parts: [...(fm ? [fm.path] : []), ...(post?.captions ?? [])].map((m) => ({ id: '', name: m.split('/').pop()!, state: 'done', line: m, aims: [] })),
    body: delivered ? '' : '1080p and captions. 1080p runs only on your word.',
  });
  // stage 11, by what the sound folders hold: a mix means the sound is made; music, effects or voice fixes mean it is being made
  const snd = s.sound?.counts ?? {};
  const soundAims = liveAims(tasks, 'sound');
  const made = SOUND_GROUPS.filter(([k]) => snd[k]);
  const soundMade = !!(snd.mix || post?.finals?.length || post?.release?.final || s.sound?.masterYes);
  const soundNode = node('sound', '11', 'Sound', {
    // the finished sound is in the app's master (Film Flow v3.2): done on the user's yes on a master at the Sound page,
    // or once a final is named in social/release.json; older films: a finished film named final, or a mix kept as audio
    state: soundMade ? 'done' : soundAims.length || snd.music || snd.sfx || snd.fixes ? 'running' : 'waiting',
    status: made.filter(([k]) => SOUND_STATUS.includes(k)).map(([k, one, many]) => plural(snd[k], one, many)).join(' · '),
    short: soundMade ? 'mixed' : made.some(([k]) => SOUND_STATUS.includes(k)) ? 'in work' : '',
    aims: soundAims, kicker: 'Stage 11 · sound and music', href: 'sound',
    parts: made.map(([k, one, many]) => ({ id: '', name: SOUND_TITLE[k], state: 'done' as const, line: plural(snd[k], one, many), aims: [] })),
    body: delivered ? 'The mix that went out is the finished film’s own sound; the takes, fixes and effects behind it are below.' : 'Music, effects, voice fixes and the mix. Every round of takes or readings is a card you answer here or on the Sound page.',
  });
  const out = s.film.delivered ?? [];
  // released only when the record shows it went out (the registry's `released`); a copy in final cuts is said as one (ASKS 37)
  const copies = s.film.copies ?? [];
  const release = node('release', '12', 'Release', {
    // started once the release file exists (Film Flow v3.2), or the social kit of the films before it
    state: delivered ? 'done' : post?.kit || post?.release ? 'running' : 'waiting',
    status: delivered && out.length ? `delivered ${fmtDate(out[0].date)}` : releaseWords(s.film),
    short: delivered && out.length ? `delivered ${fmtDate(out[0].date)}` : post?.kit ? 'kit' : !delivered && post?.release?.final ? 'final named' : !delivered && post?.release ? 'in work' : copies.length ? 'not yet' : '',
    aims: liveAims(tasks, 'release'), kicker: 'Stage 12 · last', href: 'release',
    parts: [...(post?.kit ? [{ id: '', name: 'Social kit', state: 'done' as const, line: post.kit, aims: [] }] : []),
      ...out.map((d) => ({ id: '', name: `Delivered ${fmtDate(d.date)}`, state: 'done' as const, line: `final cuts/${d.folder.split('/').pop()}`, aims: [] })),
      ...copies.map((d) => ({ id: '', name: `A copy in final cuts since ${fmtDate(d.date)}`, state: 'waiting' as const, line: `final cuts/${d.folder.split('/').pop()}`, aims: [] }))],
    body: delivered ? '' : 'The captions, the FINAL files in the social kit, and the posts.',
  });

  return {
    nodes: { story, loc, views, shots, previz, faces, clothing, sheet, voices, gate: gateNode, elements, scenes: scenesNode, edit, finish, sound: soundNode, release },
    gate,
    asks,
    working: s.feed?.working ?? [],
    waiting,
    faceGate: faceP.filter((p) => p.state !== 'done').length,
    masterGate: open.length,
    done: delivered,
    deliveredOn: delivered && out.length ? fmtDate(out[0].date) : undefined,
  };
}

/** The node a page opens on: the gate while anything waits, else the first node still in progress (a step that is
 *  no longer a box, by the box that holds it: Scenes, Finish and Sound by Edit). */
export function defaultOpen(f: Flow): FlowKey {
  if (f.waiting) return 'gate';
  const k = ORDER.find((x) => f.nodes[x].state === 'running') ?? ORDER.find((x) => x !== 'gate' && f.nodes[x].state !== 'done' && f.nodes[x].state !== 'locked') ?? 'release';
  return BOX_OF[k] ?? k;
}

/** "Faces C02 · locations L01 · voices C01": what the live sub-agents work on, by node. */
export function runningSummary(f: Flow): string[] {
  return ORDER.flatMap((k) => f.nodes[k].aims.filter((a) => a.task.state === 'running').map((a) => a.task.title.replace(/^Alma\s*›\s*/, '')));
}

