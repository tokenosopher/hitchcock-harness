// npx tsx scripts/openat-test.ts
// The Edit page opened at what a decision is about (components/edit/openAt.ts, cutLink.ts): the address read
// and taken out again, a card's "cut" read loosely and turned back into an address, Alma's page: links keeping their
// ?part, and the place found on a hand-made cut (a clip, a moment, a take tried in its shot's place, a sound's try heard
// in its place, what is not found, what waits for the takes or the options). Also the takes newer than the cut's.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { isNewTake, notNew, type Looked } from '../src/components/edit/seenTakes';
import { findTake, freshCount, hasOpenAt, newTakes, parseShotAt, readOpenAt, resolveOpenAt, tryOf, withoutOpenAt, type OpenCtx } from '../src/components/edit/openAt';
import { cutHref, cutOf, cutWords, takeCutOf } from '../src/components/edit/cutLink';
import { pageHref } from '../src/components/shell/AlmaText';
import { shotTimeline, type BySrc, type TakeShots } from '../src/components/edit/shots';
import type { SoundOption } from '../src/components/edit/Options';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n++; console.log(`PASS ${name}`); };

// ---- the address
check('readOpenAt reads each key and leaves out what is not one', () => {
  const q = (s: string) => readOpenAt(new URLSearchParams(s));
  assert.deepEqual(q('clip=s-laugh2'), { clip: 's-laugh2' });
  assert.deepEqual(q('t=72.5'), { t: 72.5 });
  assert.deepEqual(q('at=1732'), { at: 1732 });
  assert.deepEqual(q('take=FIX-S4-tap-take3&shot=S4:7a'), { take: 'FIX-S4-tap-take3', shot: { scene: 'S4', n: 7, tag: '7a' } });
  assert.deepEqual(q('sound=crowd-laugh-long&try=4'), { sound: 'crowd-laugh-long', try: 4 });
  assert.equal(q('tab=next'), undefined);
  assert.equal(q('t=-3&at=1.5&try=0&clip=%20'), undefined);
  assert.ok(hasOpenAt(new URLSearchParams('tab=next&clip=x')) && !hasOpenAt(new URLSearchParams('tab=next')));
});
check('parseShotAt: "S4:7", "S4:7b", "S4 shot 7", "s4#7"', () => {
  assert.deepEqual(parseShotAt('S4:7'), { scene: 'S4', n: 7 });
  assert.deepEqual(parseShotAt('S4:7B'), { scene: 'S4', n: 7, tag: '7b' });
  assert.deepEqual(parseShotAt('S4 shot 7'), { scene: 'S4', n: 7 });
  assert.deepEqual(parseShotAt('s4#7'), { scene: 'S4', n: 7 });
  assert.equal(parseShotAt('shot 7'), undefined);
  assert.equal(parseShotAt('S4:0'), undefined);
});
check('withoutOpenAt takes out only the place keys', () => {
  assert.equal(withoutOpenAt('http://h/films/f/edit?tab=next&clip=c1&t=3&take=x&shot=S1:2&sound=a&try=2&at=4'), 'http://h/films/f/edit?tab=next');
  assert.equal(withoutOpenAt('http://h/films/f/edit?clip=c1'), 'http://h/films/f/edit');
});

// ---- a card's "cut" and Alma's links
check('cutOf reads the card\'s "cut" loosely; cutHref and cutWords', () => {
  assert.deepEqual(cutOf({ clip: 's-laugh2' }), { clip: 's-laugh2' });
  assert.deepEqual(cutOf({ take: 'generations/S4/takes/take2/S4-take2-480p.mp4', shot: 'S4:7' }), { take: 'generations/S4/takes/take2/S4-take2-480p.mp4', shot: 'S4:7' });
  assert.deepEqual(cutOf({ sound: 'crowd-laugh-long', try: '2' }), { sound: 'crowd-laugh-long', try: 2 });
  assert.deepEqual(cutOf({ t: 72 }), { t: 72 });
  assert.equal(cutOf({ shot: 'S4:7' }), undefined);
  assert.equal(cutOf('s-laugh2'), undefined);
  assert.equal(cutOf({ t: -1, try: 2 }), undefined);
  assert.equal(cutHref('f', { sound: 'crowd-laugh-long', try: 2, at: 1732 }), '/films/f/edit?at=1732&sound=crowd-laugh-long&try=2');
  assert.equal(cutHref('f', { take: 'S4 take 2', shot: 'S4:7' }), '/films/f/edit?take=S4+take+2&shot=S4%3A7');
  assert.equal(cutWords({ sound: 'x' }), 'Hear it in the cut');
  assert.equal(cutWords({ clip: 'x' }), 'See it in the cut');
  assert.deepEqual(takeCutOf('generations/S4/takes/take2/S4-take2-480p.mp4'), { take: 'generations/S4/takes/take2/S4-take2-480p.mp4' });
  assert.equal(takeCutOf('characters/C01/face.png'), undefined);
  assert.equal(takeCutOf('previz/S1/take1.mp4'), undefined);
});
check('a page: link keeps its ?part (and its #part)', () => {
  assert.equal(pageHref('f', 'page:edit?clip=s-laugh2')?.href, '/films/f/edit?clip=s-laugh2');
  assert.equal(pageHref('f', 'page:edit?sound=crowd-laugh-long&try=4')?.href, '/films/f/edit?sound=crowd-laugh-long&try=4');
  assert.equal(pageHref('f', 'page:scenes/S3?take=take2')?.href, '/films/f/scenes/S3?take=take2');
  assert.equal(pageHref('f', 'page:shots?x=1')?.href, '/films/f?open=shots&x=1');
  assert.equal(pageHref('f', 'page:scenes/S2#tests')?.href, '/films/f/scenes/S2#tests');
  assert.equal(pageHref('f', 'page:edit')?.href, '/films/f/edit');
});

// ---- a hand-made cut: S1 in two shots of take 1, S2 in one; a laugh on its own track
const F = 'assets/films/f';
const takes: TakeShots[] = [
  { src: `${F}/generations/S1/takes/take1/S1-take1-480p.mp4`, scene: 'S1', name: 'take 1', seconds: 8, cuts: [4], state: 'ready', made: 1000 },
  { src: `${F}/generations/S1/takes/take2/S1-take2-480p.mp4`, scene: 'S1', name: 'take 2', seconds: 9, cuts: [5], state: 'ready', made: 3000 },
  { src: `${F}/generations/FIX-S1-hand/takes/take1/FIX-S1-hand-take1-480p.mp4`, scene: 'S1', name: 'FIX-S1-hand · take 1', seconds: 3, cuts: [], ids: [2], state: 'ready', made: 4000 },
  { src: `${F}/generations/S2/takes/take1/S2-take1-480p.mp4`, scene: 'S2', name: 'take 1', seconds: 6, cuts: [], state: 'ready', made: 1000 },
  { src: `${F}/generations/S2/takes/take2/S2-take2-480p.mp4`, scene: 'S2', name: 'take 2', state: 'waiting', made: 5000 },
];
const by: BySrc = new Map(takes.filter((t) => t.state === 'ready').map((t) => [t.src, t]));
const pic = (id: string, src: string, a: number, b: number, at: number, scene: string): TimelineClip => ({ id, src, in: a, out: b, at, label: `${scene} · take 1`, takeRef: { scene, take: 'take 1' } });
const LAUGH = `${F}/audio/sfx/crowd-laugh-long`;
const raw: Timeline = {
  version: 'w1', fps: 24, width: 1080, height: 1920, at: '2026-11-22T00:00:00Z', markers: [],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [pic('s1', takes[0].src, 0, 8, 0, 'S1'), pic('s2', takes[3].src, 0, 6, 8, 'S2')] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ ...pic('s1a', takes[0].src, 0, 8, 0, 'S1') }, { ...pic('s2a', takes[3].src, 0, 6, 8, 'S2') }] },
    { id: 'A4', kind: 'audio', name: 'Effects 3', clips: [{ id: 's-laugh2', src: `${LAUGH}/crowd-laugh-long-try1.wav`, in: 0, out: 3, at: 10, label: 'crowd-laugh-long-try1' }] },
  ],
};
const tl = shotTimeline(raw, by);
const opt = (k: number): SoundOption => ({ src: `${LAUGH}/crowd-laugh-long-try${k}.wav`, files: [`${LAUGH}/crowd-laugh-long-try${k}.wav`], name: `try ${k}` });
const options = new Map([[LAUGH, [opt(1), opt(2), opt(3), opt(4)]]]);
const ctx = (o: Partial<OpenCtx> = {}): OpenCtx => ({ tl, by, takes, names: new Map(), order: ['S1', 'S2'], options, final: false, ...o });
const open = (q: string, o?: Partial<OpenCtx>) => resolveOpenAt(readOpenAt(new URLSearchParams(q))!, ctx(o));

check('a clip: selected, the playhead a second before it, never before 0', () => {
  const r = open('clip=s-laugh2');
  assert.equal(r.kind, 'clip');
  if (r.kind !== 'clip') return;
  assert.deepEqual(r.ref, { trackId: 'A4', clipId: 's-laugh2' });
  assert.equal(r.frame, 10 * 24 - 24);
  assert.deepEqual(r.span, [240, 312]);
  const s = open('clip=V1:s1');
  assert.ok(s.kind === 'clip' && s.frame === 0 && s.ref.trackId === 'V1');
});
check('a moment: t in seconds, at in frames', () => {
  assert.deepEqual(open('t=3.5'), { kind: 'frame', frame: 84 });
  assert.deepEqual(open('at=100'), { kind: 'frame', frame: 100 });
});
check('not found: the page stays, the line says what, a moment given is kept', () => {
  const r = open('clip=nope');
  assert.ok(r.kind === 'none' && /“nope” is not on the timeline/.test(r.say) && r.frame === undefined);
  const s = open('sound=birds&try=2&at=480');
  assert.ok(s.kind === 'none' && /birds” is not on the timeline yet/.test(s.say) && s.frame === 456, JSON.stringify(s));
  const t = open('take=S7 take 9', { final: true });
  assert.ok(t.kind === 'none' && /was not found/.test(t.say));
});
check('a sound\'s try: its clip selected and the try in its place; the one in the cut is said so', () => {
  const r = open('sound=crowd-laugh-long&try=3');
  assert.ok(r.kind === 'sound' && r.hear === opt(3).src && r.ref.clipId === 's-laugh2' && r.frame === 216 && /in its place, not in the cut yet/.test(r.say), JSON.stringify(r));
  const own = open('sound=Crowd Laugh Long&try=1');
  assert.ok(own.kind === 'sound' && own.hear === undefined && /is the one in the cut/.test(own.say));
  const none = open('sound=crowd-laugh-long&try=9');
  assert.ok(none.kind === 'sound' && none.hear === undefined && /Try 9 .* was not found/.test(none.say));
  const plain = open('sound=crowd-laugh-long');
  assert.ok(plain.kind === 'sound' && plain.hear === undefined);
});
check('a sound waits for its options, then goes without them', () => {
  assert.deepEqual(open('sound=crowd-laugh-long&try=3', { options: new Map() }), { kind: 'wait' });
  const r = open('sound=crowd-laugh-long&try=3', { options: new Map(), final: true });
  assert.ok(r.kind === 'sound' && !r.hear && /was not found/.test(r.say));
});
check('tryOf: "try 3", "crowd-laugh-long-try4-tight", "title boom 10"', () => {
  assert.equal(tryOf({ name: 'try 3', src: 'a/x-try3.wav' }), 3);
  assert.equal(tryOf({ name: 'try 4 tight', src: 'a/crowd-laugh-long-try4-tight.wav' }), 4);
  assert.equal(tryOf({ name: 'title boom 10', src: 'a/title-boom-10.wav' }), 10);
});
check('a take by its file, its path, "S1-take2", "S1 take 2", its name', () => {
  for (const s of [takes[1].src, 'generations/S1/takes/take2/S1-take2-480p.mp4', 'S1-take2', 'S1 take 2', 'S1-take2-480p.mp4']) assert.equal(findTake(takes, s)?.src, takes[1].src, s);
  assert.equal(findTake(takes, 'FIX-S1-hand · take 1')?.src, takes[2].src);
  assert.equal(findTake(takes, 'FIX-S1-hand-take1')?.src, takes[2].src);
  assert.equal(findTake(takes, 'take 9'), undefined);
});
check('a take: its shots in their places as a selection, the playhead a second before the first', () => {
  const r = open('take=S1-take2');
  assert.ok(r.kind === 'take', JSON.stringify(r));
  if (r.kind !== 'take') return;
  assert.deepEqual(r.picks.map((p) => [p.scene, p.n, p.src]), [['S1', 1, takes[1].src], ['S1', 2, takes[1].src]]);
  assert.equal(r.frame, 0);
  assert.match(r.say, /S1 shots 1, 2 of take 2 are in place, not in the film yet/);
  const one = open('take=S1-take2&shot=S1:2');
  assert.ok(one.kind === 'take' && one.picks.length === 1 && one.picks[0].n === 2 && one.frame === 4 * 24 - 24, JSON.stringify(one));
  const pk = open('take=FIX-S1-hand-take1');
  assert.ok(pk.kind === 'take' && pk.picks.length === 1 && pk.picks[0].n === 2);
});
check('a take already in the cut: its clip, selected; one still being cut waits, then says so', () => {
  const r = open('take=S1-take1&shot=S1:2');
  assert.ok(r.kind === 'clip' && /in the cut already/.test(r.say ?? ''), JSON.stringify(r));
  assert.deepEqual(open('take=S2-take2'), { kind: 'wait' });
  const w = open('take=S2-take2', { final: true });
  assert.ok(w.kind === 'none' && /still being cut/.test(w.say));
  assert.deepEqual(open('take=S1-take2', { takes: [] }), { kind: 'wait' });
});
check('newTakes: per shot of the cut, the takes landed after its own, never looked at', () => {
  const m = newTakes(tl, by, takes, new Set());
  const s1 = tl.tracks[0].clips.filter((c) => c.takeRef?.scene === 'S1');
  assert.equal(s1.length, 2);
  const a = m.get(s1[0].id), b = m.get(s1[1].id);
  assert.ok(a && a.count === 1 && a.pick.src === takes[1].src && a.pick.n === 1, JSON.stringify(a));
  // shot 2: take 2 and the newer pick-up, the newest first
  assert.ok(b && b.count === 2 && b.pick.src === takes[2].src && b.pick.n === 2, JSON.stringify(b));
  // S2's newer take is still being read: nothing
  assert.equal([...m.values()].some((x) => x.pick.scene === 'S2'), false);
  // looked at: gone
  const seen = newTakes(tl, by, takes, new Set([`${takes[1].src}#1`, `${takes[2].src}#2`]));
  assert.ok(!seen.has(s1[0].id) && seen.get(s1[1].id)?.count === 1);
  // takes with no landing time are never new
  assert.equal(newTakes(tl, by, takes.map((t) => ({ ...t, made: undefined })), new Set()).size, 0);
});
check('a take looked at: the whole take, on every mark; one landed before the list began is not new', () => {
  const s1 = tl.tracks[0].clips.filter((c) => c.takeRef?.scene === 'S1');
  // the pick-up (takes[2]) played once: gone from shot 2's mark, which still counts take 2 behind it
  const one = newTakes(tl, by, takes, new Set([takes[2].src]));
  assert.ok(one.get(s1[1].id)?.count === 1 && one.get(s1[1].id)?.srcs.join() === takes[1].src, JSON.stringify(one.get(s1[1].id)));
  // every take counted, newest first
  assert.deepEqual(newTakes(tl, by, takes, new Set()).get(s1[1].id)?.srcs, [takes[2].src, takes[1].src]);
  const l = (since: number, seen: string[] = [], keep: string[] = []): Looked => ({ ready: true, since, seen: new Set(seen), keep: new Set(keep), old: new Set() });
  const late = Math.max(...takes.map((t) => t.made ?? 0));
  assert.equal(newTakes(tl, by, takes, new Set(), notNew(l(late))).size, 0, 'all landed before the list began');
  assert.equal(newTakes(tl, by, takes, new Set(), notNew(l(late, [], [takes[1].src]))).size, 2, 'kept new when it began');
  const t1 = takes[1];
  assert.equal(isNewTake(t1, l(0)), true);
  assert.equal(isNewTake(t1, l(0, [t1.src])), false, 'looked at');
  assert.equal(isNewTake(t1, { ...l(0), since: null }), false, 'the list not begun: nothing new');
  assert.equal(isNewTake(t1, { ...l(0), ready: false }), false, 'not answered yet');
  assert.equal(isNewTake({ ...t1, state: 'waiting' }, l(0)), false, 'not ready');
  assert.equal(isNewTake({ ...t1, made: undefined }, l(0)), false, 'no landing time');
});
check('freshCount: the takes the marks name, each once (What\'s next\'s "n new takes to check")', () => {
  assert.equal(freshCount(newTakes(tl, by, takes, new Set())), 2);
  assert.equal(freshCount(new Map([['a', { pick: { src: 'x.mp4' } }], ['b', { pick: { src: 'x.mp4' } }]])), 1);
  assert.equal(freshCount(undefined), 0);
});

console.log(`\n${n} passed`);
