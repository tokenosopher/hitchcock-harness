// npx tsx scripts/pickupqc-test.ts
// A pick-up's own check as its scene's current one : the scene's boards or prompt card shows
// the check of its pick-up (qc/<stage>-FIX-<name>-r<n>.json) with its own round, score and open misses, the scene's
// first check kept as the earlier record; the pick-up checked last wins; a dropped pick-up never does; a scene with
// no pick-up is unchanged. Pure: the sample film sample-left-pickupqc and edits of it.
import { leftSampleState } from '../src/fixtures/left';
import { pickupCheck, pickupLabel, pickupWord, withPickupCheck } from '../src/components/lib/pickupCheck';
import { qcStatus, openOf } from '../src/components/lib/qc';
import { qcTargets } from '../src/components/qc/targets';
import type { FilmState } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const clone = (s: FilmState): FilmState => JSON.parse(JSON.stringify(s)) as FilmState;

const s = leftSampleState('sample-left-pickupqc')!;
const plain = leftSampleState('sample-left-pickups')!;
const previz = qcTargets(s, 'previz');
const prompt = qcTargets(s, 'prompt');
const at = (list: typeof previz, id: string) => list.find((t) => t.target === id)!;

// the readable name and the label
ok('word: FIX-S1-sit → sit', pickupWord('FIX-S1-sit') === 'sit', pickupWord('FIX-S1-sit'));
ok('word: FIX-sword-S9 → sword', pickupWord('FIX-sword-S9') === 'sword');
ok('word: FIX-S2S3-reel → reel', pickupWord('FIX-S2S3-reel') === 'reel');
ok('word: a name of scenes only has none', pickupWord('FIX-S1') === undefined);
ok('label: from the report’s label', pickupLabel('S1', 'FIX-S1-sit', 'previz', 'FIX-S1-sit boards v4') === 'S1 pick-up “sit” boards v4', pickupLabel('S1', 'FIX-S1-sit', 'previz', 'FIX-S1-sit boards v4'));
ok('label: no report label says boards', pickupLabel('S1', 'FIX-S1-sit', 'previz') === 'S1 pick-up “sit” boards');
ok('label: a prompt', pickupLabel('S4', 'FIX-S4-reel', 'prompt', 'FIX-S4-reel prompt v1') === 'S4 pick-up “reel” prompt v1');
ok('label: a name of scenes only is kept', pickupLabel('S1', 'FIX-S1', 'previz', 'FIX-S1 boards v2') === 'S1 pick-up FIX-S1 boards v2');

// S1: the pick-up's check is current, the scene's round 3 of 3 the earlier record
const s1 = at(previz, 'S1');
ok('S1: the pick-up is FIX-S1-sit', s1.pickup === 'FIX-S1-sit', s1.pickup);
ok('S1: its label', s1.label === 'S1 pick-up “sit” boards v4', s1.label);
ok('S1: its own round and score', qcStatus(s1.entry) === '7.9 · round 2 of 3', qcStatus(s1.entry));
ok('S1: its own open misses', !!s1.entry && openOf(s1.entry.latest).map((m) => m.id).join() === 'm3,m4,m5', s1.entry && openOf(s1.entry.latest).map((m) => m.id));
ok('S1: the tab stays the scene', s1.target === 'S1');
ok('S1: the earlier record is the scene’s own check', s1.earlier?.label === 'S1 boards v7' && qcStatus(s1.earlier.entry) === '8.3 · round 3 of 3', s1.earlier && [s1.earlier.label, qcStatus(s1.earlier.entry)]);
ok('S1: the earlier record keeps its rounds', s1.earlier?.entry.history.length === 3);

// newest pick-up wins: FIX-S1-sit (checked 21 Nov) over FIX-S1-door (20 Nov), whatever the order of the folders
ok('newest: the sit pick-up, checked last', pickupCheck(s, 'previz', 'S1')?.pickup === 'FIX-S1-sit');
const flipped = clone(s);
flipped.pickups = [...flipped.pickups!].reverse();
ok('newest: the order of the folders does not matter', pickupCheck(flipped, 'previz', 'S1')?.pickup === 'FIX-S1-sit');
const later = clone(s);
later.qc!['previz-FIX-S1-door'].latest.at = '2026-11-21T12:00:00Z';
ok('newest: the door pick-up once it is checked later', pickupCheck(later, 'previz', 'S1')?.pickup === 'FIX-S1-door');
const untimed = clone(s);
for (const k of ['previz-FIX-S1-door', 'previz-FIX-S1-sit']) untimed.qc![k].latest.at = '';
ok('newest: no times, the reader’s last (by name) wins', pickupCheck(untimed, 'previz', 'S1')?.pickup === 'FIX-S1-sit');

// a dropped pick-up never takes the card: S2 shows its own check
const s2 = at(previz, 'S2');
ok('dropped: S2 unchanged', !s2.pickup && !s2.earlier && s2.label === 'S2 boards v5' && qcStatus(s2.entry) === '8.8 · round 2 of 3', [s2.pickup, s2.label, qcStatus(s2.entry)]);

// S3 and S4: their pick-ups' board checks; S4's prompt check too
ok('S3: the bench pick-up', at(previz, 'S3').pickup === 'FIX-S3-bench' && at(previz, 'S3').label === 'S3 pick-up “bench” boards v3');
ok('S4: the reel pick-up’s boards', at(previz, 'S4').pickup === 'FIX-S4-reel' && qcStatus(at(previz, 'S4').entry) === '8.7 · round 2 of 3', qcStatus(at(previz, 'S4').entry));
const p4 = at(prompt, 'S4');
ok('S4 prompt: the pick-up’s prompt check is current', p4.pickup === 'FIX-S4-reel' && p4.label === 'S4 pick-up “reel” prompt v1' && qcStatus(p4.entry) === '7.6 · round 1 of 3', [p4.label, qcStatus(p4.entry)]);
ok('S4 prompt: the scene’s prompt check is the earlier record', p4.earlier?.entry.key === 'prompt-S4' && qcStatus(p4.earlier.entry) === '8.8 · round 2 of 3');
// a pick-up with a boards check and no prompt check leaves the scene's prompt card as it was
ok('S1 prompt: no pick-up prompt check, unchanged', !at(prompt, 'S1').pickup && !at(prompt, 'S1').earlier);
ok('S3 prompt: unchanged', !at(prompt, 'S3').pickup);

// a scene with no pick-up: the target is the very same
const s5 = at(previz, 'S5');
ok('no pick-up: S5 not run, as before', !s5.pickup && !s5.earlier && !s5.entry && s5.label === 'S5 previz & boards', s5);
const t = { target: 'S5', label: 'S5 prompt v3', ready: true, waitsFor: 'S5 prompt v3' };
ok('no pick-up: withPickupCheck gives back the same object', withPickupCheck(s, 'prompt', t) === t);
ok('no pick-ups at all (the older sample): nothing changes', qcTargets(plain, 'previz').every((x) => !x.pickup && !x.earlier));
ok('no state: nothing changes', withPickupCheck(undefined, 'previz', t) === t);

// a pick-up that covers two scenes shows on both; a pick-up whose scene has no check of its own has no earlier record
const two = clone(s);
two.pickups!.push({ name: 'FIX-S5S6-run', scenes: ['S5', 'S6'], previz: true, boards: 1, checked: true, prompts: 0, landed: 0, generating: 0, stopped: 0 });
const run = clone(s).qc!['previz-FIX-S3-bench'];
run.latest.label = 'FIX-S5S6-run boards v1';
two.qc!['previz-FIX-S5S6-run'] = { ...run, key: 'previz-FIX-S5S6-run', target: 'FIX-S5S6-run' };
const t2 = qcTargets(two, 'previz');
ok('two scenes: on S5 and S6', at(t2, 'S5').pickup === 'FIX-S5S6-run' && at(t2, 'S6').pickup === 'FIX-S5S6-run');
ok('two scenes: no earlier record where the scene had no check', !at(t2, 'S5').earlier);
ok('two scenes: the label names the scene of the card', at(t2, 'S6').label === 'S6 pick-up “run” boards v1', at(t2, 'S6').label);

console.log(`${n - bad}/${n} pick-up check tests passed`);
process.exit(bad ? 1 : 0);
