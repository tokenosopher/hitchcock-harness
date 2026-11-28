// npx tsx scripts/link-test.ts
// A picture and its sound kept together by `link` on any tracks: moving a dropped take's
// picture moves its sound with it. On a hand-made cut: a pair linked across V2/A1 and one
// across V2/A3 move, trim, split, delete and change speed together; Unlink frees them and link again restores; a split
// leaves two distinct links; a paste gives a fresh pair or none; a locked partner refuses; the old V1/A1 pair found by
// place behaves as before; a dropped take and a dropped file write the link. One line per check.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import {
  clampTrim, deleteClip, relinkSound, trimAlone, endF, findClip, lenF, moveClip, moveClips, moveToTrack, partnerOf, pasteClips, retimeClips, ripples, setLinked, splitClip, startF, takeRefusal, trimClip, type ClipRef,
} from '../src/components/edit/model';
import { placeTake } from '../src/components/edit/dragTake';
import { placeFile } from '../src/components/edit/placeFile';
import { shotTimeline, type TakeShots } from '../src/components/edit/shots';

const F = 'assets/films/x';
const clip = (id: string, src: string, at: number, inn: number, out: number, extra: Partial<TimelineClip> = {}): TimelineClip => ({ id, src: `${F}/${src}`, in: inn, out, at, ...extra });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[]): TimelineTrack => ({ id, kind, name, clips });
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-23T00:00:00Z', markers: [{ at: 5, text: 'here' }],
  tracks: [
    track('V2', 'video', 'Inserts', [clip('x', 'x.mp4', 5, 1, 2, { link: 'L1' }), clip('y', 'y.mp4', 7, 0, 1, { link: 'L2' }), clip('z', 'z.mp4', 8.5, 0, 1)]),
    track('V1', 'video', 'Picture', [clip('s1', 's1.mp4', 0, 0, 2), clip('s2', 's2.mp4', 2, 0, 2)]),
    track('A1', 'audio', 'Dialogue', [clip('s1a', 's1.mp4', 0, 0, 2), clip('s2a', 's2.mp4', 2, 0, 2), clip('xa', 'x.mp4', 5, 1, 2, { link: 'L1' })]),
    track('A2', 'audio', 'Effects', []),
    track('A3', 'audio', 'Music', [clip('m1', 'm1.wav', 0, 0, 1), clip('ya', 'y.mp4', 7, 0, 1, { link: 'L2' })]),
  ],
} as Timeline);
const R = (trackId: string, clipId: string): ClipRef => ({ trackId, clipId });
const c = (tl: Timeline, t: string, id: string) => findClip(tl, R(t, id))!.clip;
const lock = (tl: Timeline, ...ids: string[]): Timeline => ({ ...tl, tracks: tl.tracks.map((t) => (ids.includes(t.id) ? { ...t, locked: true } : t)) });
const at = (tl: Timeline, t: string, id: string) => startF(c(tl, t, id), tl.fps);
const len = (tl: Timeline, t: string, id: string) => lenF(c(tl, t, id), tl.fps);
/** The clips other than the named ones are exactly as in `was`. */
const restSame = (was: Timeline, now: Timeline, except: string[]) => {
  const keep = (tl: Timeline) => JSON.stringify(tl.tracks.map((t) => [t.id, t.clips.filter((k) => !except.includes(k.id))]));
  assert.equal(keep(now), keep(was), 'nothing else changed');
};
const links = (tl: Timeline) => tl.tracks.flatMap((t) => t.clips.flatMap((k) => (k.link ? [k.link] : [])));

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

ok('partners by link on any tracks; the V1/A1 pair still by place', () => {
  const tl = base();
  assert.deepEqual(partnerOf(tl, R('V2', 'x')), R('A1', 'xa'));
  assert.deepEqual(partnerOf(tl, R('A1', 'xa')), R('V2', 'x'));
  assert.deepEqual(partnerOf(tl, R('V2', 'y')), R('A3', 'ya'));
  assert.deepEqual(partnerOf(tl, R('A3', 'ya')), R('V2', 'y'));
  assert.equal(partnerOf(tl, R('V2', 'z')), undefined);
  assert.deepEqual(partnerOf(tl, R('V1', 's1')), R('A1', 's1a'));
  assert.deepEqual(partnerOf(tl, R('A1', 's2a')), R('V1', 's2'));
});

ok('ripples stays the main pair\'s: a dialogue sound linked to a V2 picture closes nothing', () => {
  const tl = base();
  assert.equal(ripples(tl, R('A1', 'xa')), false);
  assert.equal(ripples(tl, R('V2', 'x')), false);
  assert.equal(ripples(tl, R('A1', 's1a')), true);
  assert.equal(ripples(tl, R('V1', 's2')), true);
});

ok('move V2/A1: both by the same frames, nothing else', () => {
  const tl = base();
  const e = moveClip(tl, R('V2', 'x'), 6, false)!;
  assert.equal(at(e.tl, 'V2', 'x'), 126); assert.equal(at(e.tl, 'A1', 'xa'), 126);
  restSame(tl, e.tl, ['x', 'xa']);
  const back = moveClip(tl, R('A1', 'xa'), -12, false)!;
  assert.equal(at(back.tl, 'V2', 'x'), 108); assert.equal(at(back.tl, 'A1', 'xa'), 108);
});

ok('move V2/A3 by the sound, and the keyboard nudge (moveClips) by the picture', () => {
  const tl = base();
  const e = moveClip(tl, R('A3', 'ya'), -3, false)!;
  assert.equal(at(e.tl, 'V2', 'y'), 165); assert.equal(at(e.tl, 'A3', 'ya'), 165);
  restSame(tl, e.tl, ['y', 'ya']);
  const g = moveClips(tl, [R('V2', 'y')], 5)!;
  assert.equal(at(g.tl, 'V2', 'y'), 173); assert.equal(at(g.tl, 'A3', 'ya'), 173);
  restSame(tl, g.tl, ['y', 'ya']);
});

ok('trim head and tail: both the same, ripple on closes nothing (V2 is not the main pair)', () => {
  const tl = base();
  const t = trimClip(tl, R('V2', 'x'), 'tail', -6, true)!;
  assert.equal(len(t.tl, 'V2', 'x'), 18); assert.equal(len(t.tl, 'A1', 'xa'), 18);
  restSame(tl, t.tl, ['x', 'xa']);
  const h = trimClip(tl, R('A3', 'ya'), 'head', 4, true)!;
  assert.equal(at(h.tl, 'V2', 'y'), 172); assert.equal(at(h.tl, 'A3', 'ya'), 172);
  assert.equal(c(h.tl, 'V2', 'y').in, c(h.tl, 'A3', 'ya').in);
  assert.equal(JSON.stringify(h.tl.markers), JSON.stringify(tl.markers));
  restSame(tl, h.tl, ['y', 'ya']);
});

ok('a sound trimmed stops where its linked picture meets its neighbour on V2', () => {
  const tl = base();
  // y ends at 8 s (192 f), z starts at 8.5 s (204 f): 12 f of room for the picture; A3 is free after ya
  assert.equal(clampTrim(tl, R('A3', 'ya'), 'tail', 30, false, 10), 12);
});

ok('split: both split, the left halves keep L1, the right halves share a new link of their own', () => {
  const tl = base();
  const e = splitClip(tl, R('V2', 'x'), 132)!;
  const v = e.tl.tracks.find((t) => t.id === 'V2')!.clips.filter((k) => k.src?.endsWith('x.mp4'));
  const a = e.tl.tracks.find((t) => t.id === 'A1')!.clips.filter((k) => k.src?.endsWith('x.mp4'));
  assert.equal(v.length, 2); assert.equal(a.length, 2);
  assert.equal(v[0].link, 'L1'); assert.equal(a[0].link, 'L1');
  assert.ok(v[1].link && v[1].link !== 'L1' && v[1].link === a[1].link, 'right halves linked to each other');
  const all = links(e.tl);
  for (const l of new Set(all)) assert.equal(all.filter((k) => k === l).length, 2, `${l} on exactly two clips`);
  assert.deepEqual(partnerOf(e.tl, R('V2', v[1].id)), R('A1', a[1].id));
  assert.deepEqual(partnerOf(e.tl, R('V2', v[0].id)), R('A1', a[0].id));
  // the right picture moves with the right sound only
  const m = moveClip(e.tl, R('V2', v[1].id), 2, false)!;
  assert.equal(startF(c(m.tl, 'A1', a[1].id), 24), 134); assert.equal(startF(c(m.tl, 'A1', a[0].id), 24), 120);
});

ok('delete one: both go, ripple on closes nothing', () => {
  const tl = base();
  const e = deleteClip(tl, R('A1', 'xa'), true)!;
  assert.equal(findClip(e.tl, R('V2', 'x')), undefined); assert.equal(findClip(e.tl, R('A1', 'xa')), undefined);
  restSame(tl, e.tl, ['x', 'xa']);
  const f = deleteClip(tl, R('V2', 'y'), true)!;
  assert.equal(findClip(f.tl, R('A3', 'ya')), undefined);
  restSame(tl, f.tl, ['y', 'ya']);
});

ok('speed: both change, the film after them stays', () => {
  const tl = base();
  const e = retimeClips(tl, [R('V2', 'x')], 2)!;
  assert.equal(c(e.tl, 'V2', 'x').speed, 2); assert.equal(c(e.tl, 'A1', 'xa').speed, 2);
  assert.equal(len(e.tl, 'V2', 'x'), 12); assert.equal(len(e.tl, 'A1', 'xa'), 12);
  restSame(tl, e.tl, ['x', 'xa']);
});

ok('Unlink frees them; link again restores; moved apart it does not link', () => {
  const tl = base();
  const u = setLinked(tl, R('V2', 'x'), false)!;
  assert.ok(c(u.tl, 'V2', 'x').unlinked && c(u.tl, 'A1', 'xa').unlinked);
  assert.equal(partnerOf(u.tl, R('V2', 'x')), undefined); assert.equal(partnerOf(u.tl, R('A1', 'xa')), undefined);
  const m = moveClip(u.tl, R('V2', 'x'), 6, false)!;
  assert.equal(at(m.tl, 'A1', 'xa'), 120, 'the sound stays');
  const back = setLinked(u.tl, R('A1', 'xa'), true)!;
  assert.equal(c(back.tl, 'V2', 'x').unlinked, undefined); assert.equal(c(back.tl, 'A1', 'xa').unlinked, undefined);
  assert.deepEqual(partnerOf(back.tl, R('A1', 'xa')), R('V2', 'x'));
  assert.equal(setLinked(m.tl, R('V2', 'x'), true), undefined, 'not lined up: no link again');
  // the V2/A3 one too
  const u2 = setLinked(tl, R('A3', 'ya'), false)!;
  assert.deepEqual(partnerOf(setLinked(u2.tl, R('V2', 'y'), true)!.tl, R('V2', 'y')), R('A3', 'ya'));
});

ok('a linked sound trimmed alone (Option) runs on and is unlinked; link again puts it back under its V2 picture', () => {
  const tl = base();
  const e = trimAlone(tl, R('A1', 'xa'), 'tail', 6, 10)!;
  assert.equal(len(e.tl, 'A1', 'xa'), 30); assert.equal(len(e.tl, 'V2', 'x'), 24);
  assert.ok(c(e.tl, 'A1', 'xa').unlinked && c(e.tl, 'V2', 'x').unlinked);
  for (const from of [R('V2', 'x'), R('A1', 'xa')]) {
    const back = relinkSound(e.tl, from)!;
    assert.equal(len(back.tl, 'A1', 'xa'), 24);
    assert.deepEqual(partnerOf(back.tl, R('V2', 'x')), R('A1', 'xa'));
  }
});

ok('a locked partner refuses the move, the trim and the delete', () => {
  const tl = lock(base(), 'A1');
  assert.equal(moveClip(tl, R('V2', 'x'), 6, false), undefined); assert.ok(takeRefusal()?.startsWith('A1'));
  assert.equal(trimClip(tl, R('V2', 'x'), 'tail', -6, false), undefined); assert.ok(takeRefusal()?.startsWith('A1'));
  assert.equal(deleteClip(tl, R('V2', 'x'), false), undefined); assert.ok(takeRefusal()?.startsWith('A1'));
});

ok('moved onto another sound, the linked sound goes on the track beside, still linked', () => {
  const tl = base();
  // y moved 1 s earlier (6 s, right after x on V2): a sound sits at 6 s on A3
  tl.tracks.find((t) => t.id === 'A3')!.clips.splice(1, 0, clip('m2', 'm2.wav', 6, 0, 0.5));
  const e = moveClip(tl, R('V2', 'y'), -24, false)!;
  assert.equal(at(e.tl, 'V2', 'y'), 144);
  const ya = e.tl.tracks.find((t) => t.clips.some((k) => k.id === 'ya'))!;
  assert.notEqual(ya.id, 'A3'); assert.equal(ya.name, 'Music 2');
  assert.deepEqual(partnerOf(e.tl, R('V2', 'y')), R(ya.id, 'ya'));
});

ok('moved to another track with a shift, the other half shifts by as much on its own track', () => {
  const tl = base();
  const e = moveToTrack(tl, R('A3', 'ya'), 'A2', 5)!;
  assert.equal(at(e.tl, 'A2', 'ya'), 173); assert.equal(at(e.tl, 'V2', 'y'), 173);
  assert.deepEqual(partnerOf(e.tl, R('A2', 'ya')), R('V2', 'y'));
  const same = moveToTrack(tl, R('A3', 'ya'), 'A2')!;
  assert.equal(at(same.tl, 'V2', 'y'), 168);
});

ok('paste: both together get a fresh pair; one alone gets no link', () => {
  const tl = base();
  const items = [{ clip: c(tl, 'V2', 'x'), kind: 'video' as const, trackId: 'V2' }, { clip: c(tl, 'A1', 'xa'), kind: 'audio' as const, trackId: 'A1' }];
  const p = pasteClips(tl, items, 240)!.edit!;
  const [pv, pa] = p.refs.map((r) => findClip(p.tl, r)!.clip);
  assert.ok(pv.link && pv.link !== 'L1' && pv.link === pa.link);
  assert.deepEqual(partnerOf(p.tl, p.refs[0]), p.refs[1]);
  assert.deepEqual(partnerOf(p.tl, R('V2', 'x')), R('A1', 'xa'), 'the originals still linked');
  const one = pasteClips(tl, [items[0]], 240)!.edit!;
  assert.equal(findClip(one.tl, one.refs[0])!.clip.link, undefined);
});

ok('the old V1/A1 pair: no link written anywhere, behaves as before', () => {
  const tl = base();
  const e = deleteClip(tl, R('V1', 's1'), true)!;
  assert.equal(findClip(e.tl, R('A1', 's1a')), undefined);
  assert.equal(at(e.tl, 'V1', 's2'), 0); assert.equal(at(e.tl, 'A1', 's2a'), 0);
  // the ripple moves the V2/A3 pair along like any other track
  assert.equal(at(e.tl, 'V2', 'x'), 72); assert.equal(at(e.tl, 'A1', 'xa'), 72);
  const s = splitClip(tl, R('V1', 's2'), 72)!;
  assert.deepEqual(links(s.tl).sort(), ['L1', 'L1', 'L2', 'L2']);
  const u = setLinked(tl, R('V1', 's1'), false)!;
  assert.deepEqual(partnerOf(setLinked(u.tl, R('A1', 's1a'), true)!.tl, R('V1', 's1')), R('A1', 's1a'));
});

ok('a dropped shot and a dropped file write one link on picture and sound', () => {
  const tl = base();
  const take: TakeShots = { src: 'assets/films/x/S6/take1.mp4', scene: 'S6', name: 'take 1', seconds: 6, cuts: [2, 3.5], state: 'ready' };
  const p = placeTake(tl, { t: take, n: 2 }, 'take 1', 'V2', 240).edit!;
  const pic = findClip(p.tl, p.ref)!;
  const snd = partnerOf(p.tl, p.ref)!;
  assert.equal(findClip(p.tl, snd)!.track.kind, 'audio'); assert.ok(pic.clip.link && findClip(p.tl, snd)!.clip.link === pic.clip.link);
  const w = placeTake(tl, { t: take }, 'take 1', 'V2', 240).edit!;
  const ls = links(w.tl).filter((l) => l !== 'L1' && l !== 'L2');
  assert.equal(ls.length, 6); assert.equal(new Set(ls).size, 3, 'each shot its own link');
  for (const r of w.refs) assert.equal(endF(findClip(w.tl, partnerOf(w.tl, r)!)!.clip, 24), endF(findClip(w.tl, r)!.clip, 24));
  const f = placeFile(tl, { src: 'assets/films/x/ins.mp4', name: 'ins.mp4', kind: 'picture', seconds: 1, audio: true }, 240, ['V2']).edit!;
  const fp = findClip(f.tl, f.ref)!.clip;
  assert.ok(fp.link); assert.ok(partnerOf(f.tl, f.ref));
});

ok('a linked pair on V1/A1 split at its shots: piece by piece, a link each', () => {
  const tl = base();
  const take: TakeShots = { src: 'assets/films/x/S6/take1.mp4', scene: 'S6', name: 'take 1', seconds: 6, state: 'waiting' };
  const p = placeTake(tl, { t: take }, 'take 1', 'V1', 240).edit!;
  const s = shotTimeline(p.tl, new Map([[take.src, { ...take, cuts: [2, 3.5], state: 'ready' as const }]]));
  const v = s.tracks.find((t) => t.id === 'V1')!.clips.filter((k) => k.src === take.src);
  assert.equal(v.length, 3);
  const all = links(s);
  for (const l of new Set(all)) assert.equal(all.filter((k) => k === l).length, 2, `${l} on exactly two clips`);
  for (const k of v) assert.equal(startF(findClip(s, partnerOf(s, R('V1', k.id))!)!.clip, 24), startF(k, 24));
});

console.log(`${n} checks passed`);
