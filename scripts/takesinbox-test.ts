// npx tsx scripts/takesinbox-test.ts
// New takes (components/takes/inbox.ts, landed.ts, decisions.ts, server/edit/takeDecisions.ts): which takes
// came back and are listed, in what order, what a decision does to the list and the count; the model, the cost and
// Alma's check read from the film's files, each optional; what "Use in the film" would take out and put in, on the
// sample film's cut.
import assert from 'node:assert/strict';
import type { Looked } from '../src/components/edit/seenTakes';
import { shotTimeline, takeNames, type TakeShots } from '../src/components/edit/shots';
import { pickupView } from '../src/components/edit/pickupRows';
import { cameBack, countWords, cutSrcs, deltaWords, inboxCount, inboxRows, inFilmOf, landedWords, placesLine, replaceOf, takeTitle } from '../src/components/takes/inbox';
import { creditsOf, modelChip, modelOf, readCheck, readFindings, readFindingsNote, readReadme, readVerdict, verdictOf } from '../src/components/takes/landed';
import { cleanDecision, readDecidedMap, type DecidedMap } from '../src/components/takes/decisions';
import { applyDecision } from '../src/server/edit/takeDecisions';
import { mockShots } from '../src/fixtures/shots';
import { mockShotList } from '../src/fixtures/shotlist';
import { leftSampleCut, leftSampleState } from '../src/fixtures/left';
import { mockLanded } from '../src/fixtures/takesinbox';
import { INBOX_SAMPLE } from '../src/fixtures/takesinbox-takes';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n++; console.log(`PASS ${name}`); };

const SINCE = Date.UTC(2026, 10, 26, 6);
const look = (seen: string[] = [], keep: string[] = []): Looked => ({ ready: true, since: SINCE, seen: new Set(seen), keep: new Set(keep), old: new Set() });
const tk = (src: string, made: number | undefined, o: Partial<TakeShots> = {}): TakeShots => ({ src, scene: 'S1', name: 'take 1', seconds: 6, cuts: [], state: 'ready', made, ...o });
const H = 3600000;
const A = tk('g/FIX-a-S1/takes/take1/a.mp4', SINCE + 1 * H);
const B = tk('g/FIX-b-S2/takes/take1/b.mp4', SINCE + 3 * H, { scene: 'S2' });
const C = tk('g/S3/takes/take2/c.mp4', SINCE + 2 * H, { scene: 'S3', name: 'take 2' });
const OLD = tk('g/S4/takes/take1/old.mp4', SINCE - H, { scene: 'S4' });
const KEPT = tk('g/S5/takes/take1/kept.mp4', SINCE - 2 * H, { scene: 'S5' });
const WAIT = tk('g/S6/takes/take1/w.mp4', SINCE + 4 * H, { scene: 'S6', state: 'waiting' });
const TAKES = [A, B, C, OLD, KEPT, WAIT];
const srcs = (rows: { take: TakeShots }[]) => rows.map((r) => r.take.src.split('/').pop());

// ---- which takes, in what order
check('came back: ready and landed after the list began, or kept new when it began', () => {
  const l = look([], [KEPT.src]);
  assert.deepEqual(TAKES.filter((t) => cameBack(t, l)).map((t) => t.src.split('/').pop()), ['a.mp4', 'b.mp4', 'c.mp4', 'kept.mp4']);
  assert.equal(cameBack(A, { ...l, since: null }), false, 'the list not begun: none');
  assert.equal(cameBack(A, { ...l, ready: false }), false, 'not answered yet: none');
});
check('the list: new ones newest first; a seen one leaves it unless the page holds it', () => {
  assert.deepEqual(srcs(inboxRows(TAKES, look(), {})), ['b.mp4', 'c.mp4', 'a.mp4']);
  assert.deepEqual(srcs(inboxRows(TAKES, look([C.src]), {})), ['b.mp4', 'a.mp4']);
  assert.deepEqual(srcs(inboxRows(TAKES, look([C.src]), {}, { hold: new Set([C.src]) })), ['b.mp4', 'c.mp4', 'a.mp4']);
  const held = inboxRows(TAKES, look([C.src]), {}, { hold: new Set([C.src]) });
  assert.equal(held.find((r) => r.take === C)!.isNew, false, 'held, but its new dot is gone');
});
check('decisions: used and rejected leave the list; kept for later stays, after the rest; "all" shows every one', () => {
  const d: DecidedMap = { [B.src]: { d: 'later', at: 1 }, [C.src]: { d: 'rejected', at: 2 } };
  assert.deepEqual(srcs(inboxRows(TAKES, look(), d)), ['a.mp4', 'b.mp4'], 'B kept for later moves down; C rejected is out');
  assert.equal(inboxRows(TAKES, look([B.src]), d).some((r) => r.take === B), true, 'kept for later stays though looked at');
  const used: DecidedMap = { [A.src]: { d: 'used', at: 3 } };
  assert.deepEqual(srcs(inboxRows(TAKES, look(), used)), ['b.mp4', 'c.mp4']);
  const all = inboxRows(TAKES, look(), { ...d, ...used }, { all: true });
  assert.deepEqual(srcs(all), ['b.mp4', 'c.mp4', 'a.mp4'], 'all: newest first, decided included, none moved down');
  assert.equal(all.find((r) => r.take === C)!.decided?.d, 'rejected');
  assert.equal(all.find((r) => r.take === C)!.isNew, false, 'a decided take is never new');
});
check('a take the cut plays already is not one to look at (unless kept for later); "all" shows it', () => {
  const inCut = new Set([C.src]);
  assert.deepEqual(srcs(inboxRows(TAKES, look(), {}, { inCut })), ['b.mp4', 'a.mp4']);
  assert.deepEqual(srcs(inboxRows(TAKES, look(), { [C.src]: { d: 'later', at: 1 } }, { inCut })), ['b.mp4', 'a.mp4', 'c.mp4']);
  assert.equal(inboxRows(TAKES, look(), {}, { inCut, all: true }).length, 3);
  assert.equal(countWords(TAKES, look(), {}, inCut), '2 new takes');
});
check('the count is the list as the page opens it', () => {
  assert.equal(inboxCount(TAKES, look(), {}), 3);
  assert.equal(countWords(TAKES, look(), {}), '3 new takes');
  assert.equal(countWords(TAKES, look([A.src, C.src]), {}), '1 new take');
  assert.equal(countWords(TAKES, look(), { [B.src]: { d: 'later', at: 1 } }), '3 takes to look at, 1 kept for later');
  assert.equal(countWords(TAKES, look([A.src, B.src, C.src]), {}), '');
});

// ---- the words
check('takeTitle, placesLine, landedWords, deltaWords', () => {
  assert.equal(takeTitle(tk('assets/films/f/generations/FIX-year-S1/takes/take2/x.mp4', 1, { name: 'FIX year S1 · take 2' })), 'FIX-year-S1 · take 2');
  assert.equal(takeTitle(tk('assets/films/f/generations/S19/takes/take2/x.mp4', 1, { scene: 'S19', name: 'take 2' })), 'S19 · take 2');
  assert.equal(placesLine('S1', [{ place: '5', label: '5–6' }]), 'S1 · places 5–6');
  assert.equal(placesLine('S4', [{ place: '4' }]), 'S4 · place 4');
  assert.equal(placesLine('S8', [{ place: '3' }, { place: '4' }]), 'S8 · places 3–4');
  assert.equal(placesLine('S1', [{ place: '1' }, { place: '2' }, { place: '3' }, { place: '4' }]), 'S1 · places 1–4', 'a whole scene\'s retake');
  assert.equal(placesLine('S9', [{ place: '2' }, { place: '5' }]), 'S9 · places 2, 5');
  assert.equal(placesLine('S2', [{}]), 'S2 · place not known');
  const now = new Date(2026, 10, 26, 15, 0).getTime();
  assert.equal(landedWords(new Date(2026, 10, 26, 10, 42).getTime(), now), '10:42');
  assert.equal(landedWords(new Date(2026, 10, 25, 18, 10).getTime(), now), 'yesterday 18:10');
  assert.equal(landedWords(new Date(2026, 10, 20, 9, 5).getTime(), now), '20 Nov, 09:05');
  assert.equal(deltaWords(-29, 24), '1.2 s shorter');
  assert.equal(deltaWords(0, 24), 'the same length');
});

// ---- what is known: the model, the cost, Alma's check
check('modelOf reads the spend row\'s service cell and a card\'s sub line', () => {
  assert.deepEqual(modelOf('Higgsfield seedance_2_5 omni_reference, 480p draft, 16:9, 5 s'), { model: 'Seedance 2.5', res: '480p', draft: true, seconds: 5 });
  assert.deepEqual(modelOf('Higgsfield seedance_2_5 omni_reference, 480p, 16:9, 7 s'), { model: 'Seedance 2.5', res: '480p', draft: true, seconds: 7 }, 'Seedance at 480p is a draft');
  assert.deepEqual(modelOf('Higgsfield magi_2, 1080p, 16:9, 10 s'), { model: 'MAGI-2', res: '1080p', draft: false, seconds: 10 });
  assert.deepEqual(modelOf('job 6790fd21 · 20 credits · 8.1 s · 1920x1080 draft'), { res: '1080p', draft: false, seconds: 8.1 }, 'a 1080p card line is no draft');
  assert.deepEqual(modelOf('job 8d192a90 · 21 credits · 7.0 s · 854x480 draft'), { res: '480p', draft: true, seconds: 7 });
  assert.equal(creditsOf('15 credits (made)'), 15);
  assert.equal(creditsOf('0 credits (MAGI-2 failed, not charged)'), 0);
  assert.equal(creditsOf('on the plan'), undefined);
  assert.equal(modelChip({ model: 'Seedance 2.5', res: '480p', draft: true, from: 'spend.md' }), 'Seedance draft · 480p');
  assert.equal(modelChip({ model: 'MAGI-2', res: '1080p', draft: false, from: 'spend.md' }), 'MAGI-2 · 1080p');
  assert.equal(modelChip(undefined), undefined);
});
check('Alma\'s findings record: schema 1, one take\'s entry, read leniently', () => {
  const rec = { schema: 1, by: 'alma', at: '2026-11-26T10:00:00Z', takes: { take2: { summary: 'Good.', verdict: 'use', lines: [{ said: '2226.', heard: '2226.', ok: true }, { heard: 'x' }], findings: ['6 s', 3] } } };
  const f = readFindings(rec, 'take2')!;
  assert.equal(f.verdict, 'use');
  assert.equal(f.lines.length, 1, 'a line without what was said is dropped');
  assert.deepEqual(f.findings, ['6 s']);
  assert.equal(f.at, '2026-11-26T10:00:00Z');
  assert.equal(readFindings(rec, 'take1'), undefined, 'another take: none');
  assert.equal(readFindings({ ...rec, schema: 2 }, 'take2'), undefined, 'an unknown schema: none');
  assert.equal(readFindings({ schema: 1, takes: { take1: {} } }, 'take1'), undefined, 'an empty entry: none');
  assert.equal(readVerdict('Not usable'), 'reject');
  assert.equal(readVerdict('good — both lines'), 'use');
  assert.equal(readVerdict('redo'), 'fix');
  assert.equal(readVerdict('nice'), undefined);
});
check('check.json, findings.md and README.md, as the films write them', () => {
  const c = readCheck({ transcript: '2226. Just a number difference.', missing: ['twenty two twenty six'], extra: ['2226'], words_match: false, tail_ok: true, seconds: 6.04 })!;
  assert.equal(c.heard, '2226. Just a number difference.');
  assert.equal(c.wordsMatch, false);
  assert.deepEqual(c.missing, ['twenty two twenty six']);
  assert.equal(readCheck({ gen: 'S1' }), undefined);
  const n2 = readFindingsNote('# S8 take 1: findings\n\nVerdict: good — both lines word for word.\n\n- 18.0 s, 1920x1080.\n- Lines: all word for word.\n')!;
  assert.equal(n2.verdict, 'good — both lines word for word.');
  assert.equal(n2.points.length, 2);
  const r = readReadme('# FIX-rope-S4 · S4 shot 4b\nThe user: "Hold the rope longer" …\n\nSame line, run together.\n## Later\nmore')!;
  assert.equal(r.title, 'FIX-rope-S4 · S4 shot 4b');
  assert.deepEqual(r.lines, ['The user: "Hold the rope longer" …', 'Same line, run together.']);
});
check('verdictOf: her record, else findings.md, else the card\'s first word', () => {
  const base = { folder: 'f', gen: 'G', take: 'take1' };
  assert.equal(verdictOf({ ...base, alma: { verdict: 'watch', lines: [], findings: [] }, card: { title: 't', text: ['Good: fine'] } })?.v, 'watch');
  assert.equal(verdictOf({ ...base, note: { verdict: 'good — fine', points: [] } })?.v, 'use');
  const c = verdictOf({ ...base, card: { title: 't', text: ['Not usable: she says "2026".'] } })!;
  assert.deepEqual([c.v, c.from, c.words], ['reject', 'card', 'she says "2026".']);
  assert.equal(verdictOf({ ...base, card: { title: 't', text: ['Checks running; this text gets the findings.'] } }), undefined);
  assert.equal(verdictOf(undefined), undefined);
});

// ---- decisions
check('a decision checked, kept, taken back; a hand-edited store read leniently', () => {
  assert.deepEqual(cleanDecision({ src: 'a.mp4', d: 'later' }), { src: 'a.mp4', d: 'later' });
  assert.deepEqual(cleanDecision({ src: 'a.mp4', d: null }), { src: 'a.mp4', d: null });
  assert.equal(cleanDecision({ src: 'a.mp4', d: 'maybe' }), undefined);
  assert.equal(cleanDecision({ d: 'used' }), undefined);
  const m1 = applyDecision(undefined, { src: 'a', d: 'used' }, 5);
  assert.deepEqual(m1, { a: { d: 'used', at: 5 } });
  assert.deepEqual(applyDecision(m1, { src: 'a', d: null }, 6), {});
  assert.deepEqual(readDecidedMap({ a: { d: 'used', at: 1 }, b: { d: 'nope' }, c: 3 }), { a: { d: 'used', at: 1 } });
});

// ---- what a Use does, on the sample film (fixtures: sample-takes-inbox)
check('the sample: five takes came back, the pick-up newest; Use puts FIX-cork-S2 in place 2 of S2, one clip out, one in', () => {
  const { takes } = mockShots(INBOX_SAMPLE);
  const state = leftSampleState(INBOX_SAMPLE)!;
  const cut = leftSampleCut(INBOX_SAMPLE)!.current;
  const sl = mockShotList(INBOX_SAMPLE);
  const pv = pickupView({ takes, scenes: state.scenes, gens: sl.gens, checks: sl.checks, cut });
  const l: Looked = { ready: true, since: Date.UTC(2026, 10, 10, 12), seen: new Set(), keep: new Set(), old: new Set() };
  const rows = inboxRows(pv.takes, l, {});
  assert.deepEqual(rows.map((r) => r.take.name), ['FIX-cork-S2 · take 1', 'sample take A', 'sample take A', 'sample take A variation 1', 'sample take B']);
  assert.deepEqual(rows.map((r) => r.take.scene), ['S2', 'S1', 'S2', 'S3', 'S3']);
  const landed = mockLanded(INBOX_SAMPLE);
  assert.equal(Object.keys(landed).length, 4, 'what is known of four of them; S3 take B has nothing');
  assert.equal(inboxRows(pv.takes, l, {}, { inCut: cutSrcs(cut) }).length, 5, 'none of the five is in the sample\'s cut');
  const tl = shotTimeline(cut, pv.by);
  const pick = rows[0].take;
  assert.equal(inFilmOf(tl, pick), undefined);
  const r = replaceOf(tl, pick, pv.by, takeNames(pv.takes, cut), state.scenes.map((s) => s.id), new Set());
  assert.ok(r.after, 'a change');
  assert.equal(r.in.length, 1);
  assert.equal(r.in[0].src, pick.src);
  assert.equal(r.out.length, 1, 'the clip of S2 at place 2');
  assert.match(r.out[0].src, /S2-grey-take1/);
  assert.equal(r.delta, Math.round(13.5 * 24) - r.out[0].frames, 'the film changes by the difference');
  assert.equal(inFilmOf(r.after, pick), 'in', 'after: in the film');
  // the same Use on the cut after it changes nothing
  assert.equal(replaceOf(shotTimeline(r.after!, pv.by), pick, pv.by, takeNames(pv.takes, r.after), undefined, new Set()).after, undefined);
});

console.log(`\n${n} passed`);
