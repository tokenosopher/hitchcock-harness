// MOCK=boards: sample films for the Edit page's "What's next" tab (14 Nov 2026, ASKS 47), one for each moment of the
// seven steps. Each is the-lighthouse's cut (its files renamed into the sample's own folder), with its own record, ticks,
// full-size pictures, masters and release file, all in memory. Server-only; nothing is written.
//   sample-left-start     nothing done: no yes in the record, nothing full size, no subtitle lines, no master, no
//                         release file; a version newer than the cut could not be read (the header's orange line)
//   sample-left-1080      at the 1080p: the record's yes for cut v1, the cut now v3 with one shot re-trimmed past the
//                         upscaled cut, two takes marked to redo in Seedance; v2 could not be read (quiet, in the menu)
//   sample-left-remaster  the master is of v1 and the cut is v2 with a level changed: out of date, said in words
//                         ("1 sound level changed since the master"); the final is that master (the amber note, in
//                         words); the sound listened through at v1
//   sample-left-same      the master is of v1 and the cut is v3, where v2 moved a subtitle line and v3 undid it: the
//                         same content, so the master is current and the final has no amber note (ASKS 49)
//   sample-left-posting   everything up to the final, which is the master of the cut; Reddit and YouTube posted of six
//   sample-left-done      everything done: every platform posted
//   sample-left-drafting  the final just named (the master of v1), no platforms yet, and the user's "Release texts ·
//                         cut v1" ask in the thread with Alma's turn on it still going: Alma is drafting the texts
//   sample-left-pickups   the shape of a real film at its edit: every scene in the cut, nothing
//                         approved yet, and three pick-ups being made for S1, S2 and S3 (new previz and boards, the
//                         board check), each a running sub-agent "pick-up · FIX-…"; no take of theirs landed
//   sample-left-pickupqc  pick-ups with their own checks: S1's first boards check ended at round 3 of 3
//                         and its pick-up FIX-S1-sit is at round 2 of its own (an older S1 pick-up checked before it);
//                         S4's pick-up has its boards and its prompt checked; S3's pick-up its boards; S2's pick-up
//                         was dropped, so S2 shows its own check; S5 has no pick-up (S4 to S6 are scenes this
//                         sample adds after S3)
//   sample-left-landed    the shape of a film once its pick-ups land: nothing approved, three pick-ups for S1, S2
//                         and S3 landed, and in those scenes a take newer than the cut's (shots.ts), not looked at
//                         yet: What's next says "3 new takes to check"
import type { FeedCard, FilmRef, FilmState, PickupWork, QCCategory, QCEntry, QCMiss, QCReport, ThreadEvent, Timeline } from '@/server/types';
import type { SeedanceMark } from '@/components/edit/marks';
import type { LeftFile } from '@/components/edit/left';
import type { ReleaseFile } from '@/components/release/file';
import boardFilm from './boards/the-lighthouse.json';
import cutFilm from './boards/cut-the-lighthouse.json';
import { at, boardRelease } from './release';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
const FROM = 'assets/films/the-lighthouse/';

type Id = 'sample-left-start' | 'sample-left-1080' | 'sample-left-remaster' | 'sample-left-same' | 'sample-left-posting' | 'sample-left-done' | 'sample-left-drafting' | 'sample-left-pickups' | 'sample-left-pickupqc' | 'sample-left-landed';
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const LEFT_SAMPLES: Record<Id, FilmRef> = {
  'sample-left-start': ref('sample-left-start', "Sample · what's next: nothing done", 9),
  'sample-left-1080': ref('sample-left-1080', "Sample · what's next: the 1080p", 9),
  'sample-left-remaster': ref('sample-left-remaster', "Sample · what's next: the master again", 10),
  'sample-left-same': ref('sample-left-same', "Sample · what's next: a move and its undo", 10),
  'sample-left-posting': ref('sample-left-posting', "Sample · what's next: posting", 12),
  'sample-left-done': ref('sample-left-done', "Sample · what's next: done", 12),
  'sample-left-drafting': ref('sample-left-drafting', "Sample · what's next: texts being drafted", 12),
  'sample-left-pickups': ref('sample-left-pickups', 'Sample · three pick-ups being made', 8),
  'sample-left-pickupqc': ref('sample-left-pickupqc', 'Sample · pick-ups with their own checks', 8),
  'sample-left-landed': ref('sample-left-landed', 'Sample · three pick-ups landed, not looked at', 8),
};
/** The samples where nothing is approved, ticked or full size yet. */
const START = (slug: string) => slug === 'sample-left-start' || slug === 'sample-left-pickups' || slug === 'sample-left-pickupqc' || slug === 'sample-left-landed';
const isLeft = (slug: string): slug is Id => slug in LEFT_SAMPLES;
export const leftSampleFilms = (): FilmRef[] => Object.values(LEFT_SAMPLES);

/** the-lighthouse's cut with its files moved into the sample's folder (a mark or a full-size file names the film's own). */
const own = <T>(x: T, slug: string): T => JSON.parse(JSON.stringify(x).split(FROM).join(`assets/films/${slug}/`)) as T;
const v1Of = (slug: string): Timeline => ({ ...own(cutFilm.current as unknown as Timeline, slug), renders: undefined });
const refOf = (t: Timeline) => ({ version: t.version, at: t.at, note: t.note, by: t.by ?? 'user', basedOn: t.basedOn });

interface Cut { current: Timeline; versions: ReturnType<typeof refOf>[]; timelines?: Timeline[]; sourceSeconds?: Record<string, number>; problems?: Record<string, string[]> }
const cuts = new Map<string, Cut>();
export function leftSampleCut(slug: string): Cut | undefined {
  if (!isLeft(slug)) return undefined;
  const had = cuts.get(slug);
  if (had) return had;
  const v1 = v1Of(slug);
  const seconds = own(cutFilm.sourceSeconds as Record<string, number>, slug);
  let c: Cut;
  if (slug === 'sample-left-start') {
    // no subtitle lines yet, and a newer version that could not be read
    const t = { ...v1, tracks: v1.tracks.map((x) => (x.kind === 'captions' ? { ...x, clips: [] } : x)) };
    c = { current: t, versions: [refOf(t)], sourceSeconds: seconds, problems: { v2: ['track C1 clip s1: id used twice'] } };
  } else if (slug === 'sample-left-1080') {
    // the eighth picture clip plays 2.3 s of its take the upscaled cut never used: that shot is at 480p
    const v3: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    const p = v3.tracks.find((x) => x.id === 'V1')!;
    p.clips[7].in = 18; p.clips[7].out = 23.833;
    const a = v3.tracks.find((x) => x.id === 'A1')!;
    a.clips[7].in = 18; a.clips[7].out = 23.833;
    Object.assign(v3, { version: 'v3', basedOn: 'v1', note: 'S2 shot 4 re-trimmed', at: '2026-11-14T09:00:00.000Z' });
    c = { current: v3, versions: [refOf(v1), refOf(v3)], timelines: [v1], sourceSeconds: seconds, problems: { v2: ['track C1 clip s1: id used twice'] } };
  } else if (slug === 'sample-left-remaster') {
    // a level changed: the same picture, so still all full size from the upscaled v1
    const v2: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    v2.tracks.find((x) => x.id === 'A1')!.clips[0].gain = -3;
    Object.assign(v2, { version: 'v2', basedOn: 'v1', note: 'first line −3 dB', at: '2026-11-14T09:00:00.000Z' });
    c = { current: v2, versions: [refOf(v1), refOf(v2)], timelines: [v1], sourceSeconds: seconds };
  } else if (slug === 'sample-left-same') {
    // the first subtitle line moved 28 frames earlier, then the move undone: v3 is v1 clip for clip
    const v2: Timeline = JSON.parse(JSON.stringify(v1)) as Timeline;
    const line = v2.tracks.find((x) => x.kind === 'captions')!.clips[0];
    line.at = Math.round((line.at - 28 / v1.fps) * 1000) / 1000;
    Object.assign(v2, { version: 'v2', basedOn: 'v1', note: 'moved the first line −28 f', at: '2026-11-14T09:00:00.000Z' });
    const v3: Timeline = { ...(JSON.parse(JSON.stringify(v1)) as Timeline), version: 'v3', basedOn: 'v2', note: 'undo: back to v1', at: '2026-11-14T09:01:00.000Z' };
    c = { current: v3, versions: [refOf(v1), refOf(v2), refOf(v3)], timelines: [v1, v2], sourceSeconds: seconds };
  } else {
    c = { current: v1, versions: [refOf(v1)], sourceSeconds: seconds };
  }
  cuts.set(slug, c);
  return c;
}

/** The sample film's state: the-lighthouse's, with the film and its cut its own. */
export function leftSampleState(slug: string): FilmState | undefined {
  if (!isLeft(slug)) return undefined;
  const c = leftSampleCut(slug)!;
  const cur = c.current;
  return {
    ...lighthouse, film: LEFT_SAMPLES[slug], master: undefined,
    cut: { name: `cut ${cur.version}`, fps: cur.fps, source: { cut: `cut ${cur.version}`, from: [`cut/${cur.version}.json`], date: '2026-11-14', label: `from cut/${cur.version}.json` },
      versions: c.versions, current: cur },
    post: { cuts: [], masters: [], captions: [] },
    feed: { counts: START(slug) ? {} : { edit: 1 }, asks: [] },
    ...(slug === 'sample-left-pickups' ? { pickups: PICKUPS } : {}),
    // the pick-up checks sample is a longer cut of the film: three more scenes after S3, so the checks of S4 to S6 have a place
    ...(slug === 'sample-left-pickupqc' ? { pickups: PICKUPS_QC, qc: PICKUP_QC, scenes: [...lighthouse.scenes, ...EXTRA_SCENES] } : {}),
    ...(slug === 'sample-left-landed' ? { pickups: PICKUPS_LANDED } : {}),
  };
}

// ---- sample-left-pickups: the three pick-ups' folders, and Alma's sub-agents on them

const pickup = (name: string, scene: string, o: Partial<PickupWork>): PickupWork => ({ name, scenes: [scene], previz: true, boards: 0, checked: false, prompts: 0, landed: 0, generating: 0, stopped: 0, ...o });
/** S1 has its boards and waits for their check; S3 is at its new previz; S2 is at the check after three boards. An
 *  older pick-up of S1 landed long ago and says nothing. */
const PICKUPS: PickupWork[] = [
  pickup('FIX-S1-wide', 'S1', { boards: 1 }),
  pickup('FIX-S3-window', 'S3', {}),
  pickup('FIX-S2-desk', 'S2', { boards: 3 }),
  pickup('FIX-bottle-S1', 'S1', { boards: 0, previz: false, prompts: 2, promptPassed: true, landed: 1 }),
];
/** sample-left-landed: four pick-ups, each with its take landed (the takes themselves are in shots.ts). */
const PICKUPS_LANDED: PickupWork[] = ['S1', 'S2', 'S3'].map((sc) => pickup(`FIX-${sc}`, sc, { boards: 2, checked: true, prompts: 1, promptPassed: true, landed: 1 }));
const tAt = (m: number) => `2026-11-21T09:${String(m).padStart(2, '0')}:00.000Z`;
const pickupTask = (id: string, name: string, m: number): ThreadEvent => ({
  kind: 'task', id, at: tAt(m), task: { id, title: `Alma › pick-up · ${name}`, state: 'running', startedAt: tAt(m), steps: [{ at: tAt(m), text: 'Bash · Build the new previz in Blender' }] },
});

// ---- sample-left-pickupqc: pick-ups with their own boards and prompt checks

/** S4 to S6 for this sample only: S3's shape under new ids and names. */
const EXTRA_SCENES: FilmState['scenes'] = [['S4', 'Morning'], ['S5', 'The answer'], ['S6', 'Night falls']].map(([id, title]) => {
  const s3 = lighthouse.scenes.find((x) => x.id === 'S3')!;
  return { ...s3, id, title, folder: `blocks/${id}`, takes: [], inCut: undefined, promptVersions: [] };
});

/** S1's sit pick-up is being re-boarded (round 2 of its own check); an older S1 pick-up landed and was checked the day
 *  before; S3's and S4's pick-ups have their board checks, S4's its prompt check too; S2's pick-up was dropped. */
const PICKUPS_QC: PickupWork[] = [
  pickup('FIX-S1-door', 'S1', { boards: 2, checked: true, prompts: 1, promptPassed: true, landed: 1 }),
  pickup('FIX-S1-sit', 'S1', { boards: 4, checked: true }),
  pickup('FIX-S2-cup', 'S2', { boards: 1, checked: true, dropped: true }),
  pickup('FIX-S3-bench', 'S3', { boards: 3, checked: true }),
  pickup('FIX-S4-reel', 'S4', { boards: 6, checked: true, prompts: 1 }),
];
const miss = (id: string, category: QCCategory, sub: string, where: string, title: string, fix: string, fixedIn?: string): QCMiss =>
  ({ id, category, sub, where, title, finding: `${title}.`, fix, open: !fixedIn, ...(fixedIn ? { fixedIn } : {}) });
const qcRound = (stage: string, target: string, label: string, round: number, score: number, at: string, misses: QCMiss[], next = ''): QCReport =>
  ({ stage, target, label, round, score, model: 'opus', at, inputs: [], misses, next, file: `qc/${stage}-${target}-r${round}.json` });
const qcOf = (...history: QCReport[]): QCEntry => {
  const latest = history[history.length - 1];
  return { key: `${latest.stage}-${latest.target}`, stage: latest.stage, target: latest.target, latest, history };
};
const S1_OWN = [
  miss('m1', 'camera+geometry', 'camera', 'shots 1 → 2', 'Neighbouring shots change only size, not position', 'Move shot 2’s camera to the left of the table.', 'boards v6'),
  miss('m2', 'blocking+fluidity', 'fluidity', 'shot 3', 'The sit-down is one beat of four seconds', 'Split it into two beats of two seconds.', 'boards v7'),
  miss('m3', 'prop', 'prop', 'shot 1', 'The cup is in his hand in the text but on the table in the panel', 'Write the cup on the table in shot 1’s text.'),
  miss('m4', 'lines', 'view', 'shot 2', 'Shot 2’s text names the street view, the panel shows the yard', 'Name the yard view in shot 2’s text.'),
];
const PICKUP_QC: Record<string, QCEntry> = Object.fromEntries([
  qcOf(
    qcRound('previz', 'S1', 'S1 boards v5', 1, 6.9, '2026-11-20T09:10:00Z', S1_OWN.map((m) => ({ ...m, open: true, fixedIn: undefined }))),
    qcRound('previz', 'S1', 'S1 boards v6', 2, 7.8, '2026-11-20T10:05:00Z', S1_OWN.map((m) => (m.id === 'm1' ? m : { ...m, open: true, fixedIn: undefined }))),
    qcRound('previz', 'S1', 'S1 boards v7', 3, 8.3, '2026-11-20T11:00:00Z', S1_OWN, 'Next: round 3 of 3 ends at 8.3 with 2 open text fixes (0 cr); whether to apply them and lock is your call.'),
  ),
  qcOf(qcRound('previz', 'FIX-S1-door', 'FIX-S1-door boards v2', 1, 8.6, '2026-11-20T16:00:00Z', [])),
  qcOf(
    qcRound('previz', 'FIX-S1-sit', 'FIX-S1-sit boards v3', 1, 7.4, '2026-11-21T10:01:00Z', [
      miss('m1', 'blocking+fluidity', 'blocking', 'shot 2', 'He sits in the end seat, which the wide shows taken', 'Free the end seat in the wide.'),
      miss('m2', 'camera+geometry', 'geometry', 'shot 2b', 'The new close-up is on the far side of the line', 'Put the camera on the students’ side.'),
    ]),
    qcRound('previz', 'FIX-S1-sit', 'FIX-S1-sit boards v4', 2, 7.9, '2026-11-21T11:20:00Z', [
      miss('m1', 'blocking+fluidity', 'blocking', 'shot 2', 'He sits in the end seat, which the wide shows taken', 'Free the end seat in the wide.', 'boards v4'),
      miss('m2', 'camera+geometry', 'geometry', 'shot 2b', 'The new close-up is on the far side of the line', 'Put the camera on the students’ side.', 'boards v4'),
      miss('m3', 'blocking+fluidity', 'fluidity', '2 → 2b', 'His hand is on the bench in 2 and on his knee in 2b', 'Keep the hand on the bench across the cut.'),
      miss('m4', 'lines', 'lines', 'shot 2b', 'The line runs 0.4 s past the shot’s end at the measured rate', 'Give 2b half a second more, from shot 3.'),
      miss('m5', 'prop', 'prop', 'shot 2', 'The cup is missing from the table in the pick-up’s wide', 'Put the cup back on the table as in S1’s wide.'),
    ]),
  ),
  qcOf(
    qcRound('previz', 'S2', 'S2 boards v4', 1, 7.6, '2026-11-20T09:30:00Z', [miss('m1', 'camera+geometry', 'camera', 'shot 1', 'The wide is shot from the view of another camera', 'Paint the wide’s own view.', 'boards v5')]),
    qcRound('previz', 'S2', 'S2 boards v5', 2, 8.8, '2026-11-20T10:30:00Z', [miss('m1', 'camera+geometry', 'camera', 'shot 1', 'The wide is shot from the view of another camera', 'Paint the wide’s own view.', 'boards v5')]),
  ),
  qcOf(qcRound('previz', 'FIX-S2-cup', 'FIX-S2-cup boards v1', 1, 6.2, '2026-11-21T09:40:00Z', [miss('m1', 'prop', 'prop', 'shot 4', 'The cup changes hands between panels', 'Keep it in Tobias’s hand.')])),
  qcOf(
    qcRound('previz', 'S3', 'S3 boards v3', 1, 8.1, '2026-11-20T09:50:00Z', [miss('m1', 'lines', 'lines', 'shot 2', 'Two lines share one shot', 'Give each line its own shot.', 'boards v4')]),
    qcRound('previz', 'S3', 'S3 boards v4', 2, 8.7, '2026-11-20T10:50:00Z', [miss('m1', 'lines', 'lines', 'shot 2', 'Two lines share one shot', 'Give each line its own shot.', 'boards v4')]),
  ),
  qcOf(qcRound('previz', 'FIX-S3-bench', 'FIX-S3-bench boards v3', 1, 8.0, '2026-11-21T10:30:00Z', [
    miss('m1', 'camera+geometry', 'camera', 'shot 1', 'From behind Tobias the front bench is cut off', 'Re-aim to show the whole front bench.'),
  ])),
  qcOf(
    qcRound('previz', 'S4', 'S4 boards v4', 1, 7.7, '2026-11-20T10:10:00Z', [miss('m1', 'blocking+fluidity', 'fluidity', 'shot 3', 'The tap lands between beats', 'Put the tap on the beat.', 'boards v5')]),
    qcRound('previz', 'S4', 'S4 boards v5', 2, 8.9, '2026-11-20T11:10:00Z', [miss('m1', 'blocking+fluidity', 'fluidity', 'shot 3', 'The tap lands between beats', 'Put the tap on the beat.', 'boards v5')]),
  ),
  qcOf(
    qcRound('previz', 'FIX-S4-reel', 'FIX-S4-reel boards v5', 1, 7.9, '2026-11-21T09:50:00Z', [miss('m1', 'camera+geometry', 'camera', 'shot 7a', 'Tobias looks off the lens at the end of 7a', 'Turn his eye line to Maren.', 'boards v6')]),
    qcRound('previz', 'FIX-S4-reel', 'FIX-S4-reel boards v6', 2, 8.7, '2026-11-21T10:04:00Z', [miss('m1', 'camera+geometry', 'camera', 'shot 7a', 'Tobias looks off the lens at the end of 7a', 'Turn his eye line to Maren.', 'boards v6')]),
  ),
  qcOf(
    qcRound('prompt', 'S4', 'S4 prompt v3', 1, 8.2, '2026-11-20T12:00:00Z', [miss('m1', 'lines', 'lines', 'shot 2', 'The line is cut a word short', 'Write the whole line.', 'prompt v4')]),
    qcRound('prompt', 'S4', 'S4 prompt v4', 2, 8.8, '2026-11-20T12:40:00Z', [miss('m1', 'lines', 'lines', 'shot 2', 'The line is cut a word short', 'Write the whole line.', 'prompt v4')]),
  ),
  qcOf(qcRound('prompt', 'FIX-S4-reel', 'FIX-S4-reel prompt v1', 1, 7.6, '2026-11-21T11:40:00Z', [
    miss('m1', 'lines', 'lines', 'shot 7a', 'The laughter is written as a line, not a sound', 'Write the laughter as a sound under the tap.'),
    miss('m2', 'camera+geometry', 'camera', 'shot 1', 'The close-up names the wide’s view', 'Name the close-up’s own view.'),
  ])),
].map((e) => [e.key, e]));

export const LEFT_THREADS: Record<string, ThreadEvent[]> = {
  // naming the final sent the texts' ask (release/ui.tsx useNameFinal); Alma's turn on it has not ended
  'sample-left-drafting': [
    { kind: 'user', id: 'u-texts', at: at('17:02'), text: '', context: { film: 'sample-left-drafting', page: '/films/sample-left-drafting/edit', pinned: '', selected: [
      { id: 'release:final', label: 'Named the final: master of v1', ref: 'The user named the master of v1 as the final.' },
      { id: 'release:texts', label: 'Release texts · cut v1', ref: 'cut/renders/v1-master.mp4', command: 'I named the final: … Draft the text for every platform for this final now.' },
    ] } },
    { kind: 'assistant_text', id: 'a-texts', at: at('17:03'), text: 'Drafting the texts for every platform from the final of v1.' },
  ],
  'sample-left-pickups': [
    { kind: 'user', id: 'u-notes', at: tAt(20), text: 'S1: the wide from lower. S2: Maren from behind Tobias, over the desk. S3: the window close-up with the light, then the wide.' },
    { kind: 'assistant_text', id: 'a-notes', at: tAt(21), text: 'Three pick-ups are being built from your notes: new previz and boards for each, the board check, then the prompt and a go card.' },
    pickupTask('t-fix-s1', 'FIX-S1-wide', 22),
    pickupTask('t-fix-s3', 'FIX-S3-window', 22),
    pickupTask('t-fix-s4', 'FIX-S2-desk', 22),
  ],
};

/** The record's yes for cut v1 (a card at the edit stage, answered). */
export function leftSampleFeed(slug: string): FeedCard[] | undefined {
  if (!isLeft(slug)) return undefined;
  if (START(slug)) return [];
  return [{
    key: 'YES-cut-v1-480p', id: 'YES-cut-v1-480p', title: 'Is cut v1 the one at 480p?', date: '2026-11-13T21:10:00Z', section: 'Edit', place: 'edit', ids: [], placed: 'card', media: [],
    text: ['The whole cut at 480p, before the 1080p.'],
    ask: { kind: 'yes', options: [{ id: 'yes', label: 'Yes, this is the cut' }, { id: 'no', label: 'No, something needs changing' }], answer: { at: '2026-11-13T21:14:00Z', by: 'card', note: 'Yes, in chat.' } },
  }];
}

/** GET …/full: the upscaled cut of v1 and the FIX-bottle take with its own full-size file; nothing for the first sample. */
export function leftSampleFull(slug: string): unknown {
  if (!isLeft(slug)) return undefined;
  if (START(slug)) return { bases: [], takes: {}, label: 'upscaled' };
  const take = `assets/films/${slug}/blocks/FIX-bottle/takes/FIX-bottle-seedance-take2-480p.mp4`;
  return { bases: [{ version: 'v1', path: `assets/films/${slug}/video/1080/cut-v1-1080.mp4`, frames: 1655, label: 'Higgsfield' }], takes: { [take]: take.replace('-480p.', '-1080p.') }, label: 'Higgsfield' };
}

/** The takes marked to redo in Seedance the sample starts with. */
export function leftMarksSeed(slug: string): SeedanceMark[] | undefined {
  if (slug !== 'sample-left-1080') return undefined;
  const mark = (scene: string, take: string): SeedanceMark => ({ src: `assets/films/${slug}/blocks/${scene}/takes/${scene}-${take}-480p.mp4`, take: `${scene} ${take}`, scene, markedAt: '2026-11-14T08:40:00Z', cut: 'v3', shots: [] });
  return [mark('S2', 'grey-take1'), mark('S3', 'take4')];
}

/** The user's ticks the sample starts with. */
export function leftTicksSeed(slug: string): LeftFile | undefined {
  if (!isLeft(slug)) return undefined;
  if (START(slug) || slug === 'sample-left-1080') return { ticks: {} };
  return { ticks: { sound: { at: '2026-11-14T08:30:00.000Z', cut: 'v1' } } };
}

/** The masters the sample starts with: a master of v1 with the record of its picture (renders.ts seeds it). */
export function leftMasterSeed(slug: string): { version: string } | undefined {
  return slug === 'sample-left-remaster' || slug === 'sample-left-same' || slug === 'sample-left-posting' || slug === 'sample-left-done' || slug === 'sample-left-drafting' ? { version: 'v1' } : undefined;
}

/** The release file the sample starts with: the board's six platforms, the final the master of v1. */
export function leftReleaseSeed(slug: string): ReleaseFile | undefined {
  if (slug !== 'sample-left-remaster' && slug !== 'sample-left-same' && slug !== 'sample-left-posting' && slug !== 'sample-left-done' && slug !== 'sample-left-drafting') return undefined;
  const f = boardRelease();
  const final = { path: 'cut/renders/v1-master.mp4', version: 'v1', namedAt: at('17:02'), name: `${LEFT_SAMPLES[slug].title} - FINAL.mp4`, companions: {} };
  if (slug === 'sample-left-remaster' || slug === 'sample-left-same') return { ...f, final, platforms: f.platforms.map((p) => ({ ...p, send: {} })) };
  if (slug === 'sample-left-posting') return { ...f, final };
  if (slug === 'sample-left-drafting') return { ...f, final, platforms: [] };
  return { ...f, final, platforms: f.platforms.map((p, k) => ({ ...p, send: { posted: p.send.posted ?? { at: at(`18:${String(10 + k * 5).padStart(2, '0')}`) } } })) };
}
