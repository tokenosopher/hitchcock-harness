// npm run history-list:test
// The History tab's and the Versions menu's model (src/components/edit/historyList.ts, 15 Nov 2026): the steps grouped
// between the saved versions, newest first; undone steps; the one "The cut now"; unreadable versions listed; the
// stretches; who and why; the marks; plain words for a problem; the fold that says what it holds.
import { anchorsOf, foldVersions, historyModel, marksOf, marksWords, noteOf, plainProblem, savedWho, sinceTitle, stepText, whenWords, whyOf } from '../src/components/edit/historyList';
import type { HistoryStep } from '../src/components/edit/history';
import type { TimelineVersionRef } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const H = (k: number) => k.toString(16).padStart(16, '0');
let rev = 0;
const st = (o: Partial<HistoryStep> & { k: number }): HistoryStep => ({ rev: ++rev, by: 'user', words: `step ${o.k}`, at: '2026-11-15T10:00:00Z', state: H(o.k), ...o });
// v1 seeded (start), 2 steps, v2 saved, 3 steps, v3 saved for a render, 4 steps (the last 2 undone)
const steps: HistoryStep[] = [
  st({ k: 1, by: 'start', version: 'v1', words: 'the first version' }), st({ k: 2 }), st({ k: 3 }), st({ k: 4, saved: 'v2', why: 'you' }),
  st({ k: 5 }), st({ k: 6, by: 'alma', words: 'S5 shot 1 uses take 2' }), st({ k: 7 }), st({ k: 8, saved: 'v3', why: 'render' }),
  st({ k: 9 }), st({ k: 10 }), st({ k: 11 }), st({ k: 12 }),
];
const versions: TimelineVersionRef[] = [
  { version: 'v1', at: '2026-11-14T10:00:00Z', by: 'migration' },
  { version: 'v2', at: '2026-11-15T09:00:00Z', by: 'user', made: { proxy: true } },
  { version: 'v3', at: '2026-11-15T09:30:00Z', by: 'user', note: 'step 5; step 6 (saved for a render)', made: { master: true } },
];
const m = historyModel({ at: 9, steps }, versions, { v0: ['track C1 clip s1: id used twice'] });
ok('anchors: the step that saved it, else the first seeded from it', JSON.stringify([...anchorsOf(steps)]) === JSON.stringify([['v2', 3], ['v3', 7], ['v1', 0]]), [...anchorsOf(steps)]);
ok('since: after the newest version the history holds, newest first', m.since.version === 'v3' && m.since.steps.map((r) => r.step.words).join() === 'step 12,step 11,step 10,step 9', m.since);
ok('since: the undone ones first, marked', m.since.steps.filter((r) => r.undone).map((r) => r.step.words).join() === 'step 12,step 11');
ok('one "cut now": the pointer\'s step', [...m.since.steps, ...m.versions.flatMap((v) => v.stretch?.steps ?? [])].filter((r) => r.now).map((r) => r.step.words).join() === 'step 10' && !m.versions.some((v) => v.now));
ok('versions newest first, the unreadable one listed', m.versions.map((v) => v.version).join() === 'v3,v2,v1,v0' && m.versions[3].bad === 'track C1 clip s1: id used twice');
ok('stretches: the steps between two versions', m.versions[0].stretch?.words === '3 steps between v2 and v3' && m.versions[0].stretch.steps.map((r) => r.step.words).join() === 'step 7,S5 shot 1 uses take 2,step 5', m.versions[0].stretch);
ok('stretches: v2 to v1', m.versions[1].stretch?.words === '2 steps between v1 and v2', m.versions[1].stretch);
ok('stretches: none below the oldest, none before the first seeded step', !m.versions[2].stretch && !m.before);
ok('every step is listed exactly once', [...m.since.steps, ...m.versions.flatMap((v) => v.stretch?.steps ?? [])].length + 3 === steps.length);
ok('why: from the step that saved it', m.versions[0].why === 'render' && m.versions[1].why === 'you');
const eq = historyModel({ at: 7, steps }, versions, {}, 'v3');
ok('the cut equals a version: its row carries "the cut now", no step does', eq.versions[0].now && ![...eq.since.steps, ...eq.versions.flatMap((v) => v.stretch?.steps ?? [])].some((r) => r.now));
const back = historyModel({ at: 5, steps }, versions, {});
ok('the pointer inside a stretch: that stretch holds the cut now', back.versions[0].stretch?.hasNow === true && back.since.steps.every((r) => r.undone));
// a restore of v1 later: v1 stays where it was made
const rs = [...steps.slice(0, 10), st({ k: 1, by: 'restore', words: 'restored v1', version: 'v1' })];
ok('a restore step is not where its version was made', anchorsOf(rs).get('v1') === 0);
ok('a history with no version step: one group, "Not saved as a version"', historyModel({ at: 1, steps: [st({ k: 50 }), st({ k: 51 })] }, [], {}).since.steps.length === 2 && sinceTitle() === 'Not saved as a version' && sinceTitle('v3') === 'Since v3, not saved as a version');
// a history kept to its last steps: the steps before the oldest version it holds
const cut = steps.slice(2);
const mc = historyModel({ at: 7, steps: cut }, versions, {});
ok('steps before the oldest version the history holds', mc.before?.words === '1 step before v2' && mc.before.steps[0].step.words === 'step 3', mc.before);

ok('who: you, Alma, saved for a render, saved as the final', savedWho({ by: 'user' }) === 'you' && savedWho({ by: 'alma' }) === 'Alma' && savedWho({ by: 'user', why: 'render' }) === 'saved for a render' && savedWho({ why: 'final' }) === 'saved as the final');
ok('why from the note when no step says it', whyOf({ note: 'x (saved for a render)' }) === 'render' && whyOf({ note: 'x', by: 'alma' }) === 'alma' && whyOf({ note: 'x' }) === undefined && noteOf('moved a line (saved for a render)') === 'moved a line');
ok('marks: 480p, 480p approved, Master, Final', JSON.stringify(marksOf({ version: 'v2', made: { proxy: true } }, {})) === '["480p"]'
  && JSON.stringify(marksOf({ version: 'v2', made: { proxy: true } }, { approved: 'v2' })) === '["480p, approved"]'
  && JSON.stringify(marksOf({ version: 'v3', made: { master: true } }, { final: 'v3' })) === '["Master","Final"]'
  && JSON.stringify(marksOf({ version: 'v4' }, { masters: new Set(['v4']) })) === '["Master"]');
ok('marks in the History tab\'s words', marksWords(['Master']) === 'the master was made from it' && marksWords(['480p', 'Master']) === 'the 480p and the master were made from it' && marksWords([]) === '');
ok('a step\'s words: Alma\'s start with her name', stepText({ by: 'alma', words: 'S5 shot 1 uses take 2' }) === 'Alma: S5 shot 1 uses take 2' && stepText({ by: 'alma', words: 'Alma: x' }) === 'Alma: x' && stepText({ by: 'user', words: 'moved S3' }) === 'Moved S3');
ok('a problem in plain words', plainProblem('track C1 clip s1: id used twice') === 'one clip is in it twice' && plainProblem('clip c4: assets/x.mp4 does not exist') === 'a file it plays is missing' && plainProblem('cut/v3.json: Unexpected token } in JSON') === 'the file is not readable');
const now = new Date(2026, 10, 15, 12, 0).getTime();
ok('when: today, yesterday, a date', whenWords(new Date(2026, 10, 15, 10, 44).toISOString(), now) === 'today 10:44' && whenWords(new Date(2026, 10, 14, 18, 40).toISOString(), now) === 'yesterday 18:40' && whenWords(new Date(2026, 10, 12, 9, 5).toISOString(), now) === '12 Nov 09:05');
const many = Array.from({ length: 19 }, (_, k) => ({ version: `v${236 - k}` }));
const f = foldVersions(many, 7);
ok('no silent gap: the fold says how many and which', f.head.length === 7 && f.rest.length === 12 && f.words === '12 older versions, v218 to v229', f.words);
ok('no fold for one more row than shown', !foldVersions(many.slice(0, 8), 7).words && foldVersions(many.slice(0, 8), 7).head.length === 8);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
