// npm run afterlock:test
// After the script lock: the locations are the very first thing to choose; voices come only as part of a character's
// creation, after its face is picked. Checks, on a synthetic film folder laid out as a real film is (a character taken
// whole from the library with its files at the folder's root and its meta.json, a location's candidates at its root as <L>-<slug>-cand-*.prompt.txt before their pictures), and on the after-lock
// samples:
//   - the reader: the reused character's voice (element line, length, pitch), its library film and its element; the
//     location's candidates as one round, the ones still being painted without a path
//   - the order: Locations before Characters in What's next, the masters first at the gate, no Voices step before a
//     face pick and never for a reused character
//   - the loading state: what is being made, landed of asked, and where each fact came from
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCharacters } from '../src/server/films/read/cast';
import { readLocations } from '../src/server/films/read/locations';
import { Warnings, type FilmCtx } from '../src/server/films/util';
import { gateItems, voiceDone, voiceParts, voiceStepFor } from '../src/components/lib/derive';
import { earlySteps } from '../src/components/edit/early';
import { makingOf, makingFor } from '../src/components/lib/making';
import { flowOf } from '../src/components/lib/flow';
import { waitItemsOf } from '../src/components/flow/waitList';
import { afterlockSampleState, AFTERLOCK_THREADS } from '../src/fixtures/afterlock';
import { latestTasks } from '../src/components/lib/derive';
import type { FilmState, TaskCard } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const put = async (root: string, rel: string, body: string | Buffer = PNG) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body);
};

async function film(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'afterlock-test-'));
  // C01: taken from the library as the library copies it: every file at the folder's root, with the entry's meta.json
  await put(dir, 'cast/C01-maren/pick-face.png', Buffer.concat([PNG, Buffer.from('a')]));
  await put(dir, 'cast/C01-maren/pick.png', Buffer.concat([PNG, Buffer.from('b')]));
  await put(dir, 'cast/C01-maren/element-line-5s.mp3', 'mp3');
  await put(dir, 'cast/C01-maren/C01-maren-r1-3.mp3', 'mp3');
  await put(dir, 'cast/C01-maren/E-C01-take1-1080p.mp4', 'mp4');
  await put(dir, 'cast/C01-maren/meta.json', JSON.stringify({
    id: 'the-lighthouse-c01-maren', kind: 'character', name: 'Maren', film: { slug: 'the-lighthouse', title: 'The Lighthouse' },
    voice: { hz: 89.4, seconds: 3.85 },
    files: [{ role: 'face', file: 'pick-face.png' }, { role: 'sheet', file: 'pick.png' }, { role: 'element', file: 'E-C01-take1-1080p.mp4' },
      { role: 'preview', file: 'C01-maren-r1-3.mp3' }, { role: 'element line', file: 'element-line-5s.mp3' }],
  }));
  // C02: twenty faces asked, three landed
  await put(dir, 'cast/C02-tobias/r1-faces/prompts.json', JSON.stringify({ candidates: Array.from({ length: 20 }, (_, i) => ({ id: `C02 r1-${i + 1}`, what: 'a face' })) }));
  for (let i = 1; i <= 3; i++) await put(dir, `cast/C02-tobias/r1-faces/C02-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`p${i}`)]));
  // L01: four looks asked (their prompts), two pictures landed, at the location's root
  for (const k of ['a', 'b', 'c', 'd']) await put(dir, `locations/L01-boathouse/L01-boathouse-cand-${k}.prompt.txt`, 'a prompt');
  for (const k of ['a', 'b']) await put(dir, `locations/L01-boathouse/L01-boathouse-cand-${k}.png`);
  return dir;
}

const state = (over: Partial<FilmState>): FilmState => ({
  film: { slug: 't', title: 'T', folder: '/x', repo: '/x', flow: 'video-driven', status: 'in-progress' },
  script: { versions: [{ version: 'v9', locked: true, path: 'script.md' }], current: 'v9', lines: [] },
  characters: [], locations: [], scenes: [], spend: { lines: [] }, feed: { counts: {}, asks: [] }, warnings: [],
  ...over,
} as unknown as FilmState);

async function main(): Promise<void> {
  const dir = await film();
  try {
    const ctx: FilmCtx = { dir, warn: new Warnings() };
    const chars = await readCharacters(ctx, undefined, [], false);
    const c01 = chars.find((c) => c.id === 'C01')!;
    // the reader
    ok('reader: C01 is reused', c01.reused === true, c01);
    ok('reader: C01 names the library film it came from', c01.reusedFrom?.title === 'The Lighthouse', c01.reusedFrom);
    ok('reader: C01 voice is the element line the entry names, at the root', c01.voice?.elementLine?.path === 'cast/C01-maren/element-line-5s.mp3', c01.voice);
    ok('reader: its length and pitch from the entry', c01.voice?.elementLine?.seconds === 3.85 && c01.voice?.elementLine?.hz === 89.4, c01.voice?.elementLine);
    ok('reader: its video element, final', c01.element?.state === 'final' && c01.element.path === 'cast/C01-maren/E-C01-take1-1080p.mp4', c01.element);
    const c02 = chars.find((c) => c.id === 'C02')!;
    ok('reader: C02 faces, 3 of 20 landed', c02.face?.rounds[0].candidates.length === 20 && c02.face.rounds[0].candidates.filter((k) => k.path).length === 3, c02.face?.rounds[0].candidates.length);
    const locs = await readLocations(ctx, new Map(), new Map(), new Map(), new Map(), []);
    const r = locs[0]?.styleImages?.[0];
    ok('reader: the root candidates are one round r1', r?.id === 'r1' && r.candidates.map((k) => k.id).join() === 'cand-a,cand-b,cand-c,cand-d', r);
    ok('reader: two landed, two being painted (no path)', r?.candidates.filter((k) => k.path).length === 2 && r.candidates.filter((k) => !k.path).length === 2, r?.candidates);

    // the reused-voice rule
    ok('reused: its voice counts as done', voiceDone(c01));
    ok('reused: no voice step for it', !voiceStepFor(c01));
    const s = state({ characters: chars, locations: locs });
    ok('reused: not among the voices to make', !voiceParts(s, []).some((p) => p.id === 'C01'), voiceParts(s, []));
    ok('face not picked: C02 voice waits, not started', voiceParts(s, []).find((p) => p.id === 'C02')?.state === 'waiting');
    // a voice round on file before the face pick is not shown either (the voice comes after the face)
    const early = state({ characters: chars.map((c) => (c.id === 'C02' ? { ...c, voice: { rounds: [{ id: 'r1', candidates: [{ id: '1', path: 'v.mp3' }] }] } } : c)), locations: locs });
    ok('face not picked: a voice round on file still waits', voiceParts(early, []).find((p) => p.id === 'C02')?.state === 'waiting');
    ok('gate: no Voices row before a face is picked', !gateItems(early, []).some((g) => g.kind === 'voices'), gateItems(early, []).map((g) => g.key));
    // a face picked and a voice being designed, nothing landed: still no card ("Waiting for faces" is not a card)
    const making = state({ characters: chars.map((c) => (c.id === 'C02' ? { ...c, face: { rounds: c.face!.rounds, pick: { candidateId: 'r1-1' } }, voice: { rounds: [{ id: 'r1', candidates: [{ id: '1' }, { id: '2' }] }] } } : c)), locations: locs });
    ok('gate: no voice card while its options are being made', !gateItems(making, []).some((g) => g.kind === 'voices'), gateItems(making, []).map((g) => g.key));
    const landed = state({ characters: chars.map((c) => (c.id === 'C02' ? { ...c, face: { rounds: c.face!.rounds, pick: { candidateId: 'r1-1' } }, voice: { rounds: [{ id: 'r1', candidates: [{ id: '1', path: 'a.mp3' }, { id: '2', path: 'b.mp3' }, { id: '3', path: 'c.mp3' }] }] } } : c)), locations: locs });
    const vc = gateItems(landed, []).filter((g) => g.kind === 'voices');
    ok('gate: one voice card per character once its options landed, none for the reused', vc.map((g) => `${g.key}:${g.state}:${g.round?.candidates.length}`).join() === 'pick:C02:voice:ready:3', vc.map((g) => g.key));

    // the order after the lock
    const g = gateItems(s, []);
    ok('gate: the location master comes first', g[0]?.kind === 'master' && g[0].id === 'L01', g.map((x) => x.key));
    const steps = earlySteps(s);
    ok('What\'s next: Locations before Characters', steps.map((x) => x.id).join() === 'script,places,characters,shots,boards,takes', steps.map((x) => x.id));
    ok('What\'s next: the first step to look at after the lock is Locations', steps.find((x) => !x.done)?.id === 'places', steps.map((x) => [x.id, x.done]));
    const flow = flowOf(s, []);
    const items = waitItemsOf(flow);
    // only choices wait: the master still being painted is no choice yet; once its round lands it is first
    ok('What\'s next: nothing still being made is waiting', items.every((x) => x.gate?.state !== 'running' && x.gate?.state !== 'queued' && x.gate?.state !== 'waiting'), items.map((x) => x.key));
    const landedFlow = { ...flow, gate: flow.gate.map((x) => (x.kind === 'master' ? { ...x, state: 'ready' as const } : x)) };
    ok('What\'s next: the location is the first thing waiting once its round landed', waitItemsOf(landedFlow)[0]?.place === 'loc', waitItemsOf(landedFlow).map((x) => x.key));
    ok('What\'s next: no voice row', !items.some((x) => x.place === 'voices'), items.map((x) => x.key));

    // the loading state, from the files and the thread
    const tasks: TaskCard[] = [
      { id: 't1', title: 'Alma › faces · C03 round 1', state: 'running', startedAt: '', steps: [] },
      { id: 't2', title: 'Alma › location · L01 candidates', state: 'running', startedAt: '', steps: [] },
    ];
    const withC03 = state({ characters: [...chars, { id: 'C03', name: 'the Assistant', folder: 'cast/C03-assistant' }], locations: locs });
    const m = makingOf(withC03, tasks);
    const l01 = makingFor(m, ['loc'], 'L01');
    ok('making: the boathouse, from its round', l01.length === 1 && l01[0].what === 'Painting 4 looks for the Boathouse' && l01[0].landed === 2 && l01[0].of === 4 && l01[0].from === 'round', l01);
    const p = makingFor(m, ['faces'], 'C02');
    ok('making: Tobias\'s faces, 3 of 20', p.length === 1 && p[0].what === 'Making 20 faces for Tobias' && p[0].landed === 3 && p[0].of === 20, p);
    const a = makingFor(m, ['faces'], 'C03');
    ok('making: the assistant, from the running sub-agent, no count', a.length === 1 && a[0].what === 'Making faces for the Assistant' && a[0].of === undefined && a[0].from === 'agent', a);
    ok('making: nothing for the reused character', !m.some((x) => x.id === 'C01'), m);
    ok('making: a delivered film makes nothing', makingOf({ ...withC03, film: { ...withC03.film, status: 'delivered' } }, tasks).length === 0);

    // the samples
    const s1 = afterlockSampleState('sample-after-lock')!;
    const t1 = latestTasks(AFTERLOCK_THREADS['sample-after-lock']);
    const m1 = makingOf(s1, t1);
    ok('sample-after-lock: the boathouse being painted, none landed', makingFor(m1, ['loc'], 'L01')[0]?.landed === 0 && makingFor(m1, ['loc'], 'L01')[0]?.of === 4, m1);
    ok('sample-after-lock: Tobias\'s 20 faces asked', makingFor(m1, ['faces'], 'C02')[0]?.of === 20, m1);
    ok('sample-after-lock: the assistant from the sub-agent', makingFor(m1, ['faces'], 'C03')[0]?.from === 'agent', m1);
    ok('sample-after-lock: Locations is the step to look at', earlySteps(s1).find((x) => !x.done)?.id === 'places');
    const s2 = afterlockSampleState('sample-after-lock-library')!;
    const g2 = gateItems(s2, []);
    ok('sample-after-lock-library: the master first, ready', g2[0]?.kind === 'master' && g2[0].state === 'ready', g2.map((x) => `${x.key}:${x.state}`));
    ok('sample-after-lock-library: Tobias\'s voices at the gate, not Maren\'', voiceParts(s2, []).map((x) => `${x.id}:${x.state}`).join() === 'C02:ready,C03:waiting' && g2.filter((x) => x.kind === 'voices').map((x) => x.key).join() === 'pick:C02:voice', voiceParts(s2, []));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`${n - bad} of ${n} checks passed`);
  if (bad) process.exit(1);
}
void main();
