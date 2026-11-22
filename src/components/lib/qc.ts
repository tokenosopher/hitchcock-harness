// Where QC runs, in one list: every stage page's chip and the flow board's nodes
// read it, so the journey and the pages name the same set by construction. Each entry says which page
// carries the chip, which flow node it belongs to, the stage note its checks come from, and the checks
// the not-run state lists. Reports are keyed "<stage>-<target>" (qc/<stage>-<target>-r<n>.json).
import type { FilmState, QCEntry, QCReport, QCStage } from '@/server/types';
import { QC_LOCK_SCORE, QC_MAX_ROUNDS } from '@/server/types';
import type { FlowKey } from './derive';

export interface QCSpec {
  stage: QCStage;
  name: string;            // the chip's word for it: "script", "previz & boards", "take check"
  page: string;            // the page whose title row carries the chip
  node: FlowKey;           // the flow board node it belongs to
  note: string;            // the stage note (studio/flow) whose checks the critic loads
  reads: string;           // what the critic reads, for the panel's sub line
  checks: string[];        // what it will check (the not-run state lists these)
}

export const QC_SPECS: QCSpec[] = [
  { stage: 'script', name: 'script', page: 'Story', node: 'story', note: 'Flow v3.3 - 1 Setup and story',
    reads: 'the script, the brief and the film record',
    checks: ['IDs unique: spoken lines must not share the L prefix with locations', 'Words a second fit each generation, the tail included', 'Filter words the video model refuses'] },
  { stage: 'sheet', name: 'sheet', page: 'Character', node: 'sheet', note: 'Flow v3.3 - 2 Characters',
    reads: 'the picked face, the wardrobe and the sheet',
    checks: ['Wardrobe as briefed, nothing added', 'Three views on one mid-grey backdrop, one light, hands empty', 'Light and skin matched to the first sheet of the film'] },
  { stage: 'voice', name: 'voices', page: 'Main, the Voices step', node: 'voices', note: 'Flow v3.3 - 3 Voices and video elements',
    reads: 'the picked voices and their element lines',
    checks: ['The element line audible, heard once', 'The cast sounds distinct from one another, with a pitch spread', 'The element line about 3.3 s'] },
  { stage: 'views', name: 'views', page: 'Locations', node: 'views', note: 'Flow v3.3 - 4 Locations and props',
    reads: 'the master, the views and the scene files',
    checks: ['Every wide has an empty view painted from its own camera; every other camera has a view of the side of the place it sees, and cameras close together share one', 'The panel’s camera is the camera that rendered it', 'The props where the script puts them'] },
  { stage: 'previz', name: 'previz & boards', page: 'Main, the Previz step', node: 'previz', note: 'Flow v3.3 - 5 Previz and storyboards',
    reads: 'the shots file, the boards and the views',
    checks: ['Camera design: angles and sizes worth having; neighbouring shots change position, not only size', 'Action fluidity: beats of one to two seconds, poses matched across each cut', 'One action per wide, each wide on the view from its own camera', 'A shot’s text names only what is in frame', 'States agree across cuts', 'Lines fit their shots at the measured rate, with the tail', 'Reference videos under 30 s in one generation', 'No full-size grey panel alone; every grey image with its “blocking only” line', 'Boards match the picked sheets and views'] },
  { stage: 'elements', name: 'elements', page: 'Elements', node: 'elements', note: 'Flow v3.3 - 3 Voices and video elements',
    reads: 'each element, its sheet and its voice',
    checks: ['The line heard once, in the picked voice, lips closed after the last word', 'Six views in five cuts, 1920×1080 split, 5 s', 'Face and costume match the sheet'] },
  { stage: 'prompt', name: 'prompt', page: 'Scene', node: 'scenes', note: 'Flow v3.3 - 6 Scene prompts',
    reads: 'the prompt, its references and the scene file',
    checks: ['A shot’s text names only what is in frame', 'Lines fit their shots at the measured rate, with the tail', 'Reference videos under 30 s in total', 'Every grey image with its “blocking only” line', 'The scene plan agrees with the scene file (lengths, shots, who is in frame)'] },
  { stage: 'take', name: 'take check', page: 'Scene', node: 'scenes', note: 'Flow v3.3 - 7 Takes',
    reads: 'the half-second strips of the take and the review cards',
    checks: ['Lines once each, in order, word for word', 'Framing and blocking as the shot plan asks', 'The tail after the last word', 'States across the cuts'] },
  { stage: 'cut', name: 'cut', page: 'Edit', node: 'edit', note: 'Flow v3.3 - 9 Edit',
    reads: 'the timeline, its 480p and the review cards',
    checks: ['No take in the cut with an open blocking miss', 'Poses and states matched across every cut', 'No line clipped at a cut; the tails kept', 'Length as the plan says'] },
  { stage: 'frames', name: '1080p frames', page: 'Finish', node: 'finish', note: 'Flow v3.3 - 10 Finish and 1080p',
    reads: 'frames of the 1080p master beside the 480p',
    checks: ['Faces and hands sharp, no upscale artefacts', 'Framing as the 480p, nothing cropped', 'No flicker brought in by the upscale'] },
  { stage: 'captions', name: 'captions', page: 'Finish', node: 'finish', note: 'Flow v3.3 - 12 Release',
    reads: 'the caption file against the spoken lines',
    checks: ['Captions word for word as spoken', 'Each caption inside its line’s time', 'Inside the 9:16 safe area'] },
  { stage: 'kit', name: 'kit', page: 'Release', node: 'release', note: 'Flow v3.3 - 12 Release',
    reads: 'each platform’s texts, the facts and the cover frames, and the platform checklist',
    checks: ['Thumbnail from the cut, the face readable at phone size', 'Caption and tags per platform', 'Every platform checklist item done'] },
];

export const qcSpec = (stage: QCStage): QCSpec => QC_SPECS.find((s) => s.stage === stage)!;
export const qcSpecsFor = (node: FlowKey): QCSpec[] => QC_SPECS.filter((s) => s.node === node);
export const qcKeyOf = (stage: string, target: string) => `${stage}-${target}`;

/** Film-level checks use the target "film" (qc/script-film-r1.json, qc/cut-film-r2.json). */
export const FILM_TARGET = 'film';

export function qcEntry(s: FilmState | undefined, stage: QCStage, target: string): QCEntry | undefined {
  return s?.qc?.[qcKeyOf(stage, target)];
}

export const openOf = (r: QCReport) => r.misses.filter((m) => m.open);
export const passes = (r: QCReport) => r.score !== null && r.score >= QC_LOCK_SCORE;
export const fmtScore = (n: number) => n.toFixed(1);

/** The chip's and the panel header's words after "QC · <target> · ": "not run", "7.4 · round 2 of 3",
 *  "8.6 · 1 open flag" (a pass with an open miss does not count as locked), "9.0 · locked". */
export function qcStatus(e: QCEntry | undefined): string {
  if (!e) return 'not run';
  const r = e.latest;
  const open = openOf(r).length;
  if (r.score === null) return `no score · round ${r.round} of ${QC_MAX_ROUNDS}`;
  if (passes(r) && open) return `${fmtScore(r.score)} · ${open} open ${open === 1 ? 'flag' : 'flags'}`;
  if (r.locked) return `${fmtScore(r.score)} · locked`;
  return `${fmtScore(r.score)} · round ${r.round} of ${QC_MAX_ROUNDS}`;
}

/** The "Next" sentence when the report gives none. */
export function nextSentence(r: QCReport): string {
  const open = openOf(r).length;
  if (r.locked) return 'Locked. Nothing to do here.';
  if (passes(r) && !open) return `Passed at ${fmtScore(r.score!)}. You can lock it.`;
  if (passes(r)) return `Passed at ${fmtScore(r.score!)} with ${open} open ${open === 1 ? 'flag' : 'flags'}: Alma applies ${open === 1 ? 'it' : 'them'} (0 cr), then you lock.`;
  if (r.round >= QC_MAX_ROUNDS) return `Round ${r.round} was the last and the score stays under ${QC_LOCK_SCORE}: your call, fix by hand or lock anyway.`;
  return `Next: Alma applies ${open} ${open === 1 ? 'fix' : 'fixes'} (0 cr), then round ${r.round + 1} runs. You lock at ${QC_LOCK_SCORE} or above.`;
}

// The recipes' absolute paths come from the server once (the client does not know where the harness lives);
// the same paths almaAppendPrompt() names (src/server/recipes.ts).
let recipes: Promise<{ recipe: string; edit: string }> | undefined;
function recipePaths(): Promise<{ recipe: string; edit: string }> {
  recipes ??= fetch('/api/qc').then((r) => r.json() as Promise<{ recipe: string; edit: string }>)
    .catch(() => { recipes = undefined; return { recipe: 'recipes/qc-critic.md', edit: 'recipes/edit.md' }; });
  return recipes;
}
/** The QC critic's recipe. */
export const recipePath = (): Promise<string> => recipePaths().then((j) => j.recipe);
/** The edit recipe (recipes/edit.md). */
export const editRecipePath = (): Promise<string> => recipePaths().then((j) => j.edit);

/** The message "Run QC" puts in the composer: names the recipe file and the target, so Alma spawns the critic. */
export function runQCText(recipeAbs: string, spec: QCSpec, target: string, label: string, round = 1): string {
  return `${round > 1 ? `Run QC round ${round}` : 'Run QC'} on ${label} (stage ${spec.stage}, target ${target}; write qc/${spec.stage}-${target}-r${round}.json). Use the recipe at ${recipeAbs}: spawn the critic as an Opus sub-agent in the background, checks from ${spec.note}.`;
}
