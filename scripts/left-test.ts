// npm run left:test
// What's next (src/components/edit/left.ts; named "What is left" until 14 Nov), fed with made-up inputs: every state
// of each of the seven steps, the current step, the steps left (the tab's number, the words, Alma's chip), the line
// under the list; the ticks file's check and its changes; the record's yes for a cut; the counts read from a cut; and which unreadable versions the header shows.
import { applyTick, approvalOf, changesSince, cleanLeft, stepsSince, fullCounts, leftChip, leftWords, newestMasterFileOf, parseTickOp, shortProblem, soundCounts, subsCounts, unreadableSplit, whatIsLeft, type LeftInput, type LeftView } from '../src/components/edit/left';
import type { FeedCard, Timeline } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const versions = Array.from({ length: 10 }, (_, k) => `v${230 + k}`);   // v230 … v239
const base: LeftInput = {
  cut: 'v239', versions, ready: true,
  full: { shots: 36, full: 36, takes: 0, markedShots: 0, has: true },
  sound: { music: 3, effects: 16 }, subs: { lines: 32, srt: 0, unread: 0 },
  master: { state: 'done' }, release: { final: { version: 'v239' }, platforms: 6, posted: 6 },
  approved: { version: 'v230' }, ticks: { sound: { at: '2026-11-14T10:00:00Z', cut: 'v236' } },
};
const step = (v: LeftView, id: string) => v.steps.find((s) => s.id === id)!;
const with_ = (o: Partial<LeftInput>): LeftView => whatIsLeft({ ...base, ...o });

// everything done
const all = whatIsLeft(base);
ok('all done: seven steps in the order asked', all.steps.map((s) => s.id).join() === 'approved,full,sound,subs,master,final,posted', all.steps.map((s) => s.id));
ok('all done: numbered 1 to 7', all.steps.map((s) => s.n).join() === '1,2,3,4,5,6,7');
ok('all done: 7 of 7, no current step, no button', all.done === 7 && !all.current && all.steps.every((s) => !s.current && !s.action), all);
ok('all done: the label is the plain tab name', all.label === "What's next", all.label);
ok('all done: nothing left, in number and words', all.left === 0 && all.count === 'Nothing left', all);
ok('all done: the chip', leftChip(all) === "What's next · nothing left", leftChip(all));
ok('all done: the line under the list', all.footer === 'Published on every platform. The film is done.', all.footer);
ok('all done: the chip says nothing is left', all.next === 'nothing left');
ok('all done: names', all.steps.map((s) => s.name).join(' | ') === 'The cut approved at 480p | The 1080p | Sound and music | Subtitles | Render the master | The final | Publish on every platform', all.steps.map((s) => s.name));

// 1. approved
ok('1: from the record, with the changes since', step(all, 'approved').facts === 'approved at v230 · 9 changes since', step(all, 'approved').facts);
ok('1: approved on the cut now says no changes', step(with_({ approved: { version: 'v239' } }), 'approved').facts === 'approved at v239');
const tick1 = with_({ approved: undefined, ticks: { ...base.ticks, approved: { at: '2026-11-14T09:00:00Z', cut: 'v238' } } });
ok('1: ticked by you, quietly with the change since', step(tick1, 'approved').done && step(tick1, 'approved').facts === 'ticked by you at v238 · 1 change since' && step(tick1, 'approved').ticked === 'approved', step(tick1, 'approved'));
const none1 = with_({ approved: undefined, ticks: {} });
ok('1: neither: current, its tick is the one button', !step(none1, 'approved').done && none1.current === 'approved' && step(none1, 'approved').action?.label === 'Approve v239' && step(none1, 'approved').action?.do.kind === 'tick', step(none1, 'approved'));
ok('1: the record wins over a tick (nothing to take back)', !step(with_({ ticks: { approved: { at: '2026-11-14T09:00:00Z', cut: 'v231' } } }), 'approved').ticked);

// 2. the 1080p
const f2 = with_({ full: { shots: 36, full: 34, takes: 3, markedShots: 4, has: true } });
ok('2: the counts and the marks', step(f2, 'full').facts === '34 of 36 shots full size · 3 takes to redo in Seedance, which is 4 shots', step(f2, 'full').facts);
ok('2: not done, current, "Go through them" opens Upscale', f2.current === 'full' && step(f2, 'full').action?.label === 'Go through them' && step(f2, 'full').action?.do.kind === 'upscale' && step(f2, 'full').row.kind === 'upscale');
ok('2: one mark of one shot', step(with_({ full: { shots: 36, full: 36, takes: 1, markedShots: 1, has: true } }), 'full').facts === 'all 36 shots full size · 1 take to redo in Seedance, which is 1 shot');
ok('2: all full size but a take marked is not done', !step(with_({ full: { shots: 36, full: 36, takes: 1, markedShots: 2, has: true } }), 'full').done);
ok('2: all full size, no marks: done', step(all, 'full').done && step(all, 'full').facts === 'all 36 shots full size');
const none2 = with_({ full: { shots: 29, full: 0, takes: 0, markedShots: 0, has: false } });
ok('2: nothing full size: the upscale ask', step(none2, 'full').facts === '0 of 29 shots full size' && step(none2, 'full').action?.do.kind === 'upscaled' && step(none2, 'full').row.kind === 'upscaled', step(none2, 'full'));
ok('2: still reading', !step(with_({ full: undefined }), 'full').done && step(with_({ full: undefined }), 'full').facts === 'reading the full-size pictures…');

// 3. sound
ok('3: ticked on an older cut: done, says so quietly', step(all, 'sound').done && step(all, 'sound').facts === '3 music clips, 16 effects · listened through at v236 · 3 changes since', step(all, 'sound').facts);
const s3 = with_({ ticks: {}, sound: { music: 1, effects: 0 } });
ok('3: not ticked: current, "Listened through"', s3.current === 'sound' && step(s3, 'sound').facts === '1 music clip, 0 effects' && step(s3, 'sound').action?.label === 'Listened through' && step(s3, 'sound').row.kind === 'sound', step(s3, 'sound'));
ok('3: ticked on the cut now', step(with_({ ticks: { sound: { at: '2026-11-14T10:00:00Z', cut: 'v239' } } }), 'sound').facts === '3 music clips, 16 effects · listened through at v239');

// 4. subtitles
ok('4: lines: done, the row goes to the track', step(all, 'subs').done && step(all, 'subs').facts === '32 lines' && step(all, 'subs').row.kind === 'subs');
ok('4: one line', step(with_({ subs: { lines: 1, srt: 0, unread: 0 } }), 'subs').facts === '1 line');
ok('4: an .srt being read counts as subtitles', step(with_({ subs: { lines: 0, srt: 1, unread: 1 } }), 'subs').done && step(with_({ subs: { lines: 0, srt: 1, unread: 1 } }), 'subs').facts === '1 subtitle file being read');
ok('4: text lines and the cues of an .srt', step(with_({ subs: { lines: 14, srt: 1, unread: 0 } }), 'subs').facts === '14 lines');
const s4 = with_({ subs: { lines: 0, srt: 0, unread: 0 } });
ok('4: none: "Create subtitles", and the tick as the quiet way', s4.current === 'subs' && step(s4, 'subs').facts === 'no lines yet' && step(s4, 'subs').action?.do.kind === 'subs-ask' && step(s4, 'subs').also?.label === 'No subtitles on this film' && step(s4, 'subs').also?.do.kind === 'tick', step(s4, 'subs'));
const t4 = with_({ subs: { lines: 0, srt: 0, unread: 0 }, ticks: { ...base.ticks, subs: { at: '2026-11-14T10:00:00Z', cut: 'v239' } } });
ok('4: none, ticked: done', step(t4, 'subs').done && step(t4, 'subs').ticked === 'subs' && step(t4, 'subs').facts === 'no subtitles on this film, ticked by you at v239', step(t4, 'subs'));

// 5. the master
ok('5: up to date', step(all, 'master').done && step(all, 'master').facts === 'the master of v239, up to date');
const m5 = with_({ master: { state: 'none', newest: 'v236' } });
ok('5: of an older version', !step(m5, 'master').done && step(m5, 'master').facts === 'out of date: the master is of v236, the cut is v239' && step(m5, 'master').action?.label === 'Render master again' && step(m5, 'master').row.kind === 'renders', step(m5, 'master'));
// of an older version whose cut is the same as the cut now (ASKS 49): current, the versions said quietly
const same5 = with_({ master: { state: 'none', newest: 'v235', gap: { same: true, app: true } } });
ok('5: of an older version with the same content: done', step(same5, 'master').done && step(same5, 'master').facts === 'the master of v235 · nothing changed since' && !step(same5, 'master').action && step(same5, 'master').versions === 'master v235 · cut v239', step(same5, 'master'));
ok('5: of an older version with the same content: not the current step', same5.current !== 'master' && same5.next !== 'the master', same5.current);
const gap5 = with_({ master: { state: 'none', newest: 'v235', gap: { same: false, words: '1 subtitle line moved since the master', app: true } } });
ok('5: of an older version with a real difference: out of date, in words', !step(gap5, 'master').done && step(gap5, 'master').facts === 'out of date: 1 subtitle line moved since the master' && step(gap5, 'master').action?.label === 'Render master again' && step(gap5, 'master').versions === 'master v235 · cut v239', step(gap5, 'master'));
const stale5 = with_({ master: { state: 'none', newest: 'v235', gap: { same: true, app: true, stale: 'The master of v235 was made before the upscaled cut of v237 landed' } } });
ok('5: the same content, but its picture out of date: out of date, why', !step(stale5, 'master').done && step(stale5, 'master').facts === 'out of date: the master of v235 was made before the upscaled cut of v237 landed' && step(stale5, 'master').action?.do.kind === 'master', step(stale5, 'master'));
const out5 = with_({ master: { state: 'none', newest: 'v235', gap: { same: true, app: false } } });
ok('5: an outside master of the same content counts as one of the cut: not the app\'s master yet', step(out5, 'master').facts === 'no master yet' && step(out5, 'master').action?.label === 'Render master', step(out5, 'master'));
ok('5: no gap known: the two numbers, as before', step(m5, 'master').versions === undefined);
const n5 = with_({ master: { state: 'none' } });
ok('5: none', step(n5, 'master').facts === 'no master yet' && step(n5, 'master').action?.label === 'Render master' && step(n5, 'master').action?.do.kind === 'master', step(n5, 'master'));
const st5 = with_({ master: { state: 'done', stale: 'The master of v239 was made from the 480p scaled up; all 36 shots now have a full-size picture' } });
ok('5: of this version, out of date by its picture', step(st5, 'master').facts === 'out of date: the master of v239 was made from the 480p scaled up; all 36 shots now have a full-size picture' && step(st5, 'master').action?.do.kind === 'master' && (step(st5, 'master').action?.do as { again: boolean }).again, step(st5, 'master'));
ok('5: rendering: no button', step(with_({ master: { state: 'running' } }), 'master').facts === 'rendering the master of v239' && !step(with_({ master: { state: 'running' } }), 'master').action);
ok('5: failed: "Try again"', step(with_({ master: { state: 'failed' } }), 'master').action?.label === 'Try again');

// 6. the final
ok('6: the final of the cut now', step(all, 'final').done && step(all, 'final').facts === 'the final is the master of v239' && !step(all, 'final').note);
const f6 = with_({ release: { final: { version: 'v235' }, platforms: 6, posted: 2 } });
ok('6: the final of an older cut, with the amber note', step(f6, 'final').done && step(f6, 'final').facts === 'the final is the master of v235' && step(f6, 'final').note === 'The final is of v235. The cut is now v239.', step(f6, 'final'));
const fs6 = with_({ release: { final: { version: 'v235' }, platforms: 6, posted: 2 }, finalGap: { same: true } });
ok('6: the final of an older version with the same content: no amber note', step(fs6, 'final').done && !step(fs6, 'final').note && step(fs6, 'final').facts === 'the final is the master of v235 · nothing changed since' && step(fs6, 'final').versions === 'final v235 · cut v239', step(fs6, 'final'));
const fg6 = with_({ release: { final: { version: 'v235' }, platforms: 6, posted: 2 }, finalGap: { same: false, words: '2 shots trimmed and 1 sound clip added since the final' } });
ok('6: the final of an older version with a real difference: the amber note in words', step(fg6, 'final').note === '2 shots trimmed and 1 sound clip added since the final.' && step(fg6, 'final').facts === 'the final is the master of v235', step(fg6, 'final'));
ok('6: the final of the cut now: a gap is not looked at', !step(with_({ finalGap: { same: false, words: 'x since the final' } }), 'final').note);
const n6 = with_({ release: { platforms: 6, posted: 0 } });
ok('6: no final: "Open Renders"', n6.current === 'final' && step(n6, 'final').facts === 'no final yet' && step(n6, 'final').action?.label === 'Open Renders' && step(n6, 'final').action?.do.kind === 'renders', step(n6, 'final'));

// 7. published
ok('7: two of six', f6.current === 'posted' && step(f6, 'posted').facts === '2 of 6 posted' && step(f6, 'posted').action?.label === 'Open Release' && step(f6, 'posted').row.kind === 'release', step(f6, 'posted'));
ok('7: the line under the list until every platform is posted', f6.footer === 'The film is done when it is published on every platform.');
ok('7: no release file: no texts yet', step(with_({ release: undefined }), 'posted').facts === 'no texts yet' && !step(with_({ release: undefined }), 'posted').done);
ok('7: no platforms yet', step(with_({ release: { final: { version: 'v239' }, platforms: 0, posted: 0 } }), 'posted').facts === 'no texts yet');

// nothing done
const zero = whatIsLeft({ cut: 'v1', versions: ['v1'], ready: true, full: { shots: 29, full: 0, takes: 0, markedShots: 0, has: false }, sound: { music: 1, effects: 0 }, subs: { lines: 0, srt: 0, unread: 0 }, master: { state: 'none' }, ticks: {} });
ok('nothing done: 0 of 7, step 1 current', zero.done === 0 && zero.label === "What's next" && zero.left === 7 && zero.count === '7 steps left' && zero.current === 'approved' && zero.next === 'the cut approved at 480p', zero);
ok('nothing done: one button, on the current step', zero.steps.filter((s) => s.action).length === 1 && !!zero.steps[0].action);
ok('the current step is the first not done', with_({ full: { shots: 36, full: 30, takes: 0, markedShots: 0, has: true }, ticks: {} }).current === 'full');
ok('a count before the route answered is not shown', with_({ ready: false }).count === '' && with_({ ready: false }).left === undefined && with_({ ready: false }).label === "What's next");
ok('before the route answered the chip names only the step', leftChip(with_({ ready: false, release: undefined })) === "What's next · the final", leftChip(with_({ ready: false, release: undefined })));
ok('the steps left in words', leftWords(5) === '5 steps left' && leftWords(1) === '1 step left' && leftWords(0) === 'Nothing left');
ok('nothing done: the chip', leftChip(zero) === "What's next · 7 steps left · the cut approved at 480p", leftChip(zero));
ok('the chip names the step', f2.next === 'the 1080p');
ok('one step left: the number and the words', f6.left === 1 && f6.count === '1 step left', f6);
ok('every state the steps can say has a row press', [all, f2, none1, none2, s3, s4, m5, n6, zero].every((v) => v.steps.every((s) => !!s.row)));

// the ticks file
ok('file: read as written', JSON.stringify(cleanLeft({ ticks: { sound: { at: '2026-11-14T10:00:00Z', cut: 'v239' } } })) === JSON.stringify({ ticks: { sound: { at: '2026-11-14T10:00:00Z', cut: 'v239' } } }));
ok('file: a broken tick and an unknown step are dropped', JSON.stringify(cleanLeft({ ticks: { sound: { at: 'x', cut: 'v1' }, colour: { at: '2026-11-14T10:00:00Z', cut: 'v1' }, subs: { at: '2026-11-14T10:00:00Z', cut: 'v2' } } })) === JSON.stringify({ ticks: { subs: { at: '2026-11-14T10:00:00Z', cut: 'v2' } } }));
ok('file: none is empty', JSON.stringify(cleanLeft({})) === JSON.stringify({ ticks: {} }) && cleanLeft('x') === undefined && cleanLeft({ ticks: [] }) === undefined);
const added = applyTick(undefined, { tick: 'sound', cut: 'v239' }, '2026-11-14T11:00:00Z');
ok('tick: kept with its cut and time', added.ticks.sound?.cut === 'v239' && added.ticks.sound?.at === '2026-11-14T11:00:00Z' && /Only the user/.test(added.note ?? ''), added);
ok('tick: taken back', !applyTick(added, { untick: 'sound' }, 'x').ticks.sound);
ok('tick op: parsed', JSON.stringify(parseTickOp({ tick: 'subs', cut: 'v3' })) === JSON.stringify({ tick: 'subs', cut: 'v3' }) && JSON.stringify(parseTickOp({ untick: 'approved' })) === JSON.stringify({ untick: 'approved' }));
ok('tick op: refused', parseTickOp({ tick: 'master', cut: 'v3' }) === undefined && parseTickOp({ tick: 'sound', cut: '3' }) === undefined && parseTickOp(null) === undefined);

// the record's yes
const card = (o: Partial<FeedCard>): FeedCard => ({ key: o.id ?? 'k', title: '', section: 'Finish', place: 'finish', ids: [], placed: 'card', media: [], ...o });
const yes = { kind: 'yes' as const, options: [], answer: { at: '2026-11-13T07:00:00Z', by: 'card' as const } };
ok('yes: an answered yes naming a cut', JSON.stringify(approvalOf([card({ id: 'YES-master-v230-1080', title: 'Is this 1080p version the one? (cut v230 at 1080p)', ask: yes })], versions)) === JSON.stringify({ version: 'v230', card: 'YES-master-v230-1080' }));
ok('yes: the newest of two', approvalOf([card({ id: 'a', title: 'cut v231 approved?', place: 'edit', ask: yes }), card({ id: 'b', title: 'cut v234, approve?', place: 'edit', ask: yes })], versions)?.version === 'v234');
ok('yes: not answered, answered no, a guess, another place, a version the film does not have: nothing', approvalOf([
  card({ title: 'cut v231', ask: { ...yes, answer: undefined } }),
  card({ title: 'cut v232', ask: { ...yes, answer: { option: 'no', by: 'harness' } } }),
  card({ title: 'cut v233', placed: 'guess', ask: yes }),
  card({ title: 'cut v234', place: 'scenes', ask: yes }),
  card({ title: 'cut v299', ask: yes }),
  card({ title: 'cut v235', ask: { ...yes, kind: 'go' } }),
], versions) === undefined);

// counts read from a cut
ok('changes since', changesSince(versions, 'v230', 'v239') === 9 && changesSince(versions, 'v239', 'v239') === 0 && changesSince(['v1', 'v3', 'v4'], 'v2', 'v4') === 2);
const tl = { tracks: [
  { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p1', src: 'a.mp4', in: 0, out: 1, at: 0 }] },
  { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'd1', in: 0, out: 1, at: 0 }] },
  { id: 'A3', kind: 'audio', name: 'Dialogue 2', clips: [{ id: 'd2', in: 0, out: 1, at: 0 }] },
  { id: 'A2', kind: 'audio', name: 'Music', clips: [{ id: 'm1', in: 0, out: 1, at: 5 }, { id: 'm2', in: 0, out: 1, at: 9 }] },
  { id: 'A4', kind: 'audio', name: 'Effects', clips: [{ id: 'e1', in: 0, out: 1, at: 2 }] },
  { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: 'One', in: 0, out: 1, at: 3 }, { id: 's2', src: 'subtitles/x.srt', in: 0, out: 9, at: 1 }] },
] } as unknown as Timeline;
const sc = soundCounts(tl);
ok('sound: music and effects, dialogue left out, the first clip', sc.music === 2 && sc.effects === 1 && sc.first?.clipId === 'e1', sc);
ok('subs: a line and an .srt not read yet', JSON.stringify(subsCounts(tl)) === JSON.stringify({ lines: 1, srt: 1, unread: 1, first: { trackId: 'C1', clipId: 's2', at: 1 } }), subsCounts(tl));
ok('subs: with the .srt read', subsCounts(tl, () => 6).lines === 7 && subsCounts(tl, () => 6).unread === 0);
const pieces = [
  { kind: 'base', clip: { id: 'c1', src: 'a.mp4' } }, { kind: 'small', clip: { id: 'c1', src: 'a.mp4' } },
  { kind: 'base', clip: { id: 'c2', src: 'b.mp4' } }, { kind: 'take', clip: { id: 'c3', src: 'b.mp4' } }, { kind: 'base', clip: { id: 'c4', src: 'c.mp4' } },
];
ok('full: a shot with any 480p frame is not full size; marks counted by shot', JSON.stringify(fullCounts(pieces, new Set(['b.mp4']))) === JSON.stringify({ shots: 4, full: 3, takes: 1, markedShots: 2 }), fullCounts(pieces, new Set(['b.mp4'])));

// the newest master's file, with its record (ASKS 49)
const mfiles = [
  { kind: 'master', version: 'v235', path: 'cut/renders/v235-master.mp4', at: '2026-11-14T10:00:00Z', picture: { sources: [], shots: 36, frames: 100 } },
  { kind: 'master', version: 'v236', path: 'cut/renders/v236-master-lufs14.mp4', tag: 'lufs14' },
  { kind: 'master', version: 'v234', path: 'cut/renders/v234-master.mp4' },
];
ok('the newest master\'s file and its record', JSON.stringify(newestMasterFileOf(mfiles)) === JSON.stringify({ version: 'v235', path: 'cut/renders/v235-master.mp4', at: '2026-11-14T10:00:00Z', picture: { sources: [], shots: 36, frames: 100 } }), newestMasterFileOf(mfiles));

// the unreadable versions
const u = { v232: ['track C1 clip s1: id used twice'] };
ok('unreadable: an old one is quiet', JSON.stringify(unreadableSplit(u, versions.filter((v) => v !== 'v232'), 'v239')) === JSON.stringify({ loud: [], quiet: [['v232', 'track C1 clip s1: id used twice']] }));
ok('unreadable: one newer than the version on screen is loud', unreadableSplit({ v240: ['x: bad'] }, versions, 'v239').loud.length === 1);
ok('unreadable: an older version viewed, the unreadable one after it is loud', unreadableSplit(u, versions.filter((v) => v !== 'v232'), 'v231').loud[0]?.[0] === 'v232');
ok('unreadable: a version the page reads is not unreadable', unreadableSplit({ v2: ['x'] }, ['v1', 'v2'], 'v1').loud.length === 0);
ok('unreadable: the short reason', shortProblem('track C1 clip s1: id used twice') === 'id used twice' && shortProblem('invalid') === 'invalid');

// stage 3b (15 Nov): a tick records the state it was made on; "n changes since" counts the history's steps
const H = (k: number) => k.toString(16).padStart(16, '0');
const hist = { at: 4, steps: [
  { rev: 1, state: H(1), version: 'v1', by: 'start' }, { rev: 2, state: H(2) }, { rev: 3, state: H(3), saved: 'v2' }, { rev: 4, state: H(4) }, { rev: 5, state: H(1), version: 'v1', by: 'restore' }, { rev: 6, state: H(6) },
] };
ok('steps since: a tick\'s own step, by its rev: 3 steps', stepsSince(hist, { cut: 'v2', state: H(2), step: 2 }) === 3);
ok('steps since: the cut still at the tick\'s step says nothing', stepsSince(hist, { cut: 'v1', state: H(1), step: 5 }) === 0);
ok('steps since: steps taken and the same content again: "same"', stepsSince(hist, { cut: 'v1', state: H(1), step: 1 }) === 'same');
ok('steps since: by state alone, the newest step with it', stepsSince(hist, { cut: 'v2', state: H(3) }) === 2);
ok('steps since: by a version name (a tick before 15 Nov, the record\'s yes)', stepsSince(hist, { cut: 'v2' }) === 2 && stepsSince(hist, { cut: 'v1' }) === 'same');
ok('steps since: a version the history does not hold', stepsSince(hist, { cut: 'v9' }) === undefined && stepsSince(undefined, { cut: 'v1' }) === undefined);
ok('steps since: a pointer before the step (undone) counts the steps between', stepsSince({ ...hist, at: 1 }, { cut: 'v2' }) === 1);
const tk = { at: '2026-11-15T10:00:00Z', cut: 'v2', state: H(2), step: 2, edited: true };
ok('tick op: the state, its step and "edited" are kept', JSON.stringify(parseTickOp({ tick: 'sound', cut: 'v2', state: H(2), step: 2, edited: true })) === JSON.stringify({ tick: 'sound', cut: 'v2', state: H(2), step: 2, edited: true }));
ok('tick op: a bad state or step is refused', parseTickOp({ tick: 'sound', cut: 'v2', state: 'zz' }) === undefined && parseTickOp({ tick: 'sound', cut: 'v2', step: -1 }) === undefined);
ok('file: a tick with its state read as written', JSON.stringify(cleanLeft({ ticks: { sound: tk } })?.ticks.sound) === JSON.stringify(tk));
ok('apply: the state goes into the file', JSON.stringify(applyTick(undefined, { tick: 'sound', cut: 'v2', state: H(2), step: 2, edited: true }, tk.at).ticks.sound) === JSON.stringify(tk));
const onState = whatIsLeft({ ...base, cut: 'v2', edited: true, history: hist, ticks: { sound: tk }, approved: undefined });
ok('a tick on an edited cut: "listened through with edits since v2 · 3 changes since"', step(onState, 'sound').facts === '3 music clips, 16 effects · listened through with edits since v2 · 3 changes since', step(onState, 'sound').facts);
ok('the approve button on an edited cut: "Approve this cut"', step(onState, 'approved').action?.label === 'Approve this cut', step(onState, 'approved').action);
const same = whatIsLeft({ ...base, cut: 'v1', history: hist, ticks: { sound: { at: tk.at, cut: 'v1', state: H(1), step: 1 } } });
ok('the same content again: "nothing changed since"', step(same, 'sound').facts.endsWith('listened through at v1 · nothing changed since'), step(same, 'sound').facts);
const here = whatIsLeft({ ...base, cut: 'v1', history: { ...hist, at: 4 }, ticks: { sound: { at: tk.at, cut: 'v1', state: H(1), step: 5 } } });
ok('the cut still where it was ticked: nothing more said', step(here, 'sound').facts.endsWith('listened through at v1'), step(here, 'sound').facts);
ok('without the history: the versions are counted, as before', step(whatIsLeft(base), 'sound').facts.endsWith('· 3 changes since'), step(whatIsLeft(base), 'sound').facts);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
