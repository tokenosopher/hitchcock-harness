// npx tsx scripts/editwork-test.ts
// The Edit step while pick-ups are being made : with none, Edit reads What's next as before;
// with three at different stages it says which scene stands where; with one's go waiting it names "your go" and the
// step waits for you; once they land or are dropped the approve line comes back. Pure: a sample film's state.
import { leftSampleState } from '../src/fixtures/left';
import { editWork } from '../src/components/lib/editWork';
import { flowOf } from '../src/components/lib/flow';
import type { FeedCard, FilmState, PickupWork, TaskCard } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const clone = (s: FilmState): FilmState => JSON.parse(JSON.stringify(s)) as FilmState;

const plain = leftSampleState('sample-left-start')!;
const sample = leftSampleState('sample-left-pickups')!;
const task = (name: string, state: TaskCard['state'] = 'running'): TaskCard => ({ id: `t-${name}`, title: `Alma › pick-up · ${name}`, state, startedAt: '2026-11-21T09:22:00.000Z', steps: [] });
const pu = (name: string, scene: string, o: Partial<PickupWork> = {}): PickupWork => ({ name, scenes: [scene], previz: true, boards: 0, checked: false, prompts: 0, landed: 0, generating: 0, stopped: 0, ...o });
const tasks = [task('FIX-S1-wide'), task('FIX-S3-window'), task('FIX-S2-desk')];

// no pick-ups: nothing to say, and Edit is the timeline's as before
ok('no pick-ups: no line', editWork(plain, []) === undefined);
const f0 = flowOf(plain, []);
ok('no pick-ups: Edit is not running for them', !f0.work && f0.nodes.edit.state === 'done', [f0.nodes.edit.state, f0.nodes.edit.status]);

// all three at one stage: the scenes, then what comes next
const same = clone(sample);
same.pickups = [pu('FIX-S1-wide', 'S1'), pu('FIX-S3-window', 'S3'), pu('FIX-S2-desk', 'S2')];
const w1 = editWork(same, tasks);
ok('one stage: the words', w1?.line === '3 pick-ups being made · S1, S2, S3 · new boards, then prompts, then your go', w1?.line);

// three at mixed stages (the sample): furthest behind first
const w2 = editWork(sample, tasks);
ok('mixed: the headline', w2?.headline === '3 pick-ups being made', w2?.headline);
ok('mixed: S3 at boards, then S1 and S2 at the board check', w2?.detail === 'S3 at boards · S1, S2 at the board check', w2?.detail);
ok('mixed: the landed S1 pick-up says nothing', !w2?.items.some((i) => i.name === 'FIX-bottle-S1'));
ok('mixed: every one has its sub-agent', !!w2?.items.every((i) => i.live));
const f2 = flowOf(sample, tasks);
ok('mixed: Edit runs, not "waiting for you"', f2.nodes.edit.state === 'running', f2.nodes.edit.state);
ok('mixed: Edit\'s status is the line', f2.nodes.edit.status === w2?.line && f2.nodes.edit.short === '3 pick-ups being made', [f2.nodes.edit.status, f2.nodes.edit.short]);
ok('mixed: no go waits', w2?.go.length === 0);

// S2's prompt passed and its go card waits
const go = clone(sample);
go.pickups = [pu('FIX-S1-wide', 'S1', { boards: 1 }), pu('FIX-S3-window', 'S3', { boards: 1, checked: true, prompts: 1 }), pu('FIX-S2-desk', 'S2', { boards: 3, checked: true, prompts: 2, promptPassed: true })];
const card: FeedCard = { key: 'GO-FIX-S2-desk', id: 'GO-FIX-S2-desk', title: 'Go for FIX-S2-desk take 1?', section: 'Scenes', place: 'scenes', ids: ['FIX-S2-desk', 'S2'], placed: 'card', media: [],
  ask: { kind: 'go', options: [{ id: 'go', label: 'Go' }], cost: '78 credits' } };
go.feed = { counts: { scenes: 1 }, asks: [card] };
const w3 = editWork(go, tasks.slice(0, 2));
ok('a go waits: "your go" named first', w3?.detail === 'S2’s go waits for you · S1 at the board check · S3 at the prompt', w3?.detail);
ok('a go waits: the scene is named', w3?.go.join() === 'S2', w3?.go);
const f3 = flowOf(go, tasks.slice(0, 2));
ok('a go waits: Edit waits for you', f3.nodes.edit.state === 'pick', f3.nodes.edit.state);
const answered = clone(go);
answered.feed!.asks[0].ask!.answer = { option: 'go', by: 'harness' };
ok('the go given: S2 back at its prompt until the take is asked', editWork(answered, [])?.items.find((i) => i.name === 'FIX-S2-desk')?.stage === 'prompt');

// a take asked and not landed, then landed
const taking = clone(sample);
taking.pickups = [pu('FIX-S2-desk', 'S2', { boards: 3, checked: true, prompts: 2, generating: 1 })];
ok('one take generating', editWork(taking, [])?.line === '1 pick-up being made · S2 · the take being made', editWork(taking, [])?.line);
const landed = clone(sample);
landed.pickups = sample.pickups!.map((p) => ({ ...p, landed: 1 }));
ok('all landed: the approve line comes back', editWork(landed, []) === undefined && !flowOf(landed, []).work);
const dropped = clone(sample);
dropped.pickups = sample.pickups!.map((p) => ({ ...p, dropped: true }));
ok('all dropped: the approve line comes back', editWork(dropped, tasks.map((t) => ({ ...t, state: 'done' as const }))) === undefined);

// a sub-agent on a pick-up before its folders exist, and a retake of a scene in the cut
const early = clone(plain);
const w4 = editWork(early, [task('FIX-S2-door'), { ...task('x'), id: 't-r', title: 'Alma › retake · S3 take 3' }]);
ok('folders not there yet: at boards; a retake at its prompt', w4?.line === '1 pick-up and 1 retake being made · S2 at boards · S3 at the prompt', w4?.line);
ok('a finished sub-agent says nothing', editWork(early, [task('FIX-S2-door', 'done')]) === undefined);

// a delivered film is a record
const del = clone(sample);
del.film = { ...del.film, status: 'delivered' };
ok('delivered: nothing', editWork(del, tasks) === undefined);
// a pick-up of a scene with no take yet is the Scenes step's, not Edit's
const noTake = clone(sample);
noTake.scenes = noTake.scenes.map((sc) => (sc.id === 'S1' ? { ...sc, takes: [] } : sc));
ok('a scene not in the cut yet: left out', !editWork(noTake, tasks)?.items.some((i) => i.scenes.includes('S1')));

console.log(`${n - bad} of ${n} checks passed`);
if (bad) process.exit(1);
