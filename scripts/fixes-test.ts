// npm run fixes:test
// The model's side of the night's fixes (docs/timeline-findings.md, 14 Nov), on a hand-made cut: the lock rule on
// every edit that can touch a locked track (F2, F7's reason), the speed of an effect or an insert changing it alone
// (F3), several clips pasted at once (F4), the trim and the moved join stopping at the same end of a file, the track
// beside never a locked one, a carried sound put back leaving its track in place, `unlinked` going with a moved
// clip, and a picture and its sound left in sync on V2 and "Dialogue 2" staying in sync through later edits.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import {
  carrySound, clampRoll, clampTrim, deleteClip, deleteClips, endF, findClip, lenF, lockedWhy, moveClip, moveClips, moveToTrack, partnerOf, pasteClip, pasteClips,
  patchClip, relinkSound, retimeClips, rollEdit, setLinked, splitClip, startF, takeRefusal, tidyOverlaps, trimAlone, trimClip, type ClipRef,
} from '../src/components/edit/model';
import { putShot, takeOutShot } from '../src/components/edit/shots';
import { tidyDissolves } from '../src/components/edit/controls';

const F = 'assets/films/x';
const clip = (id: string, src: string, at: number, inn: number, out: number, extra: Partial<TimelineClip> = {}): TimelineClip => ({ id, src: `${F}/${src}`, in: inn, out, at, ...extra });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[], extra: Partial<TimelineTrack> = {}): TimelineTrack => ({ id, kind, name, clips, ...extra });
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-14T00:00:00Z', markers: [{ at: 5, text: 'here' }],
  tracks: [
    track('V2', 'video', 'Inserts', [clip('i1', 'i1.mp4', 4.5, 0, 1), clip('i2', 'i2.mp4', 5.5, 0, 1)]),
    track('V1', 'video', 'Picture', [clip('s1', 's1.mp4', 0, 1, 3), clip('s2', 's2.mp4', 2, 0.5, 2.5), clip('s3', 's3.mp4', 4, 0, 2), clip('s4', 's4.mp4', 6, 0, 2)]),
    track('A1', 'audio', 'Dialogue', [clip('s1a', 's1.mp4', 0, 1, 3), clip('s2a', 's2.mp4', 2, 0.5, 2.5), clip('s3a', 's3.mp4', 4, 0, 2), clip('s4a', 's4.mp4', 6, 0, 2)]),
    track('A2', 'audio', 'Effects', [clip('fx1', 'fx1.wav', 0, 0, 1), clip('fx2', 'fx2.wav', 1, 0, 1), clip('fx3', 'fx3.wav', 7, 0, 1)]),
    track('A3', 'audio', 'Music', [clip('m1', 'm1.wav', 6.5, 0, 1)]),
  ],
} as Timeline);
const LEN: Record<string, number> = { 's1.mp4': 4, 's2.mp4': 3, 's3.mp4': 2, 's4.mp4': 5, 'fx1.wav': 1, 'fx2.wav': 3, 'fx3.wav': 2, 'm1.wav': 9, 'i1.mp4': 3, 'i2.mp4': 3 };
const secs = (src: string) => LEN[src.split('/').pop()!];
const R = (trackId: string, clipId: string): ClipRef => ({ trackId, clipId });
const c = (tl: Timeline, t: string, id: string) => findClip(tl, R(t, id))!.clip;
const lock = (tl: Timeline, ...ids: string[]): Timeline => ({ ...tl, tracks: tl.tracks.map((t) => (ids.includes(t.id) ? { ...t, locked: true } : t)) });
const sameCut = (a: Timeline, b: Timeline) => JSON.stringify([a.tracks, a.markers]) === JSON.stringify([b.tracks, b.markers]);

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };
/** The edit is refused, and the reason names the track. */
const refused = (e: unknown, track: string, what: string) => {
  const why = takeRefusal();
  assert.equal(e, undefined, `${what}: refused`);
  assert.ok(why && why.startsWith(track), `${what}: the reason names ${track}: ${why}`);
};

// ---- F2: a locked track is never changed by anything; an edit that would need to is refused, with why

ok('delete a shot whose picture is locked: refused, nothing else moves (was: sound gone, the rest closed up)', () => {
  const tl = lock(base(), 'V1');
  refused(deleteClip(tl, R('V1', 's2'), true), 'V1 Picture', 'delete');
});
ok('delete or trim the sound of a shot whose picture is locked: refused', () => {
  const tl = lock(base(), 'V1');
  refused(deleteClip(tl, R('A1', 's2a'), true), 'V1 Picture', 'delete the sound');
  refused(trimClip(tl, R('A1', 's2a'), 'tail', -6, true, 3), 'V1 Picture', 'trim the sound');
  refused(trimClip(tl, R('A1', 's2a'), 'tail', -6, false, 3), 'V1 Picture', 'trim the sound, gaps open');
});
ok('closing a gap with a locked track holding clips after it: refused, why says so', () => {
  const tl = lock(base(), 'A3');
  const e = deleteClip(tl, R('V1', 's2'), true);
  const why = takeRefusal();
  assert.equal(e, undefined);
  assert.match(why!, /^A3 Music is locked and has clips after this point/);
  refused(trimClip(tl, R('V1', 's2'), 'tail', -6, true, 3), 'A3 Music', 'trim closing up');
  refused(trimClip(tl, R('V1', 's2'), 'tail', 6, true, 3), 'A3 Music', 'trim opening up');
  refused(retimeClips(tl, [R('V1', 's2')], 2), 'A3 Music', 'speed of a shot');
  refused(deleteClips(tl, [R('V1', 's1'), R('A2', 'fx2')], true), 'A3 Music', 'delete of several');
});
ok('…and with gaps kept open (R), or before nothing locked, the same edits go through', () => {
  const tl = lock(base(), 'A3');
  const e = deleteClip(tl, R('V1', 's2'), false)!;
  assert.ok(e && !findClip(e.tl, R('V1', 's2')) && !findClip(e.tl, R('A1', 's2a')));
  assert.equal(JSON.stringify(e.tl.tracks.find((t) => t.id === 'A3')), JSON.stringify(tl.tracks.find((t) => t.id === 'A3')));
  // a locked track with nothing after the point does not stop it
  const t2 = lock(base(), 'A2');
  const e2 = deleteClip({ ...t2, tracks: t2.tracks.map((t) => (t.id === 'A2' ? { ...t, clips: t.clips.slice(0, 2) } : t)) }, R('V1', 's3'), true);
  assert.ok(e2 && e2.note.endsWith(', what follows moved back'), e2?.note);
});
ok('split, move, Option-trim, unlink, link, a patch and a speed of a shot whose sound is locked: refused', () => {
  const tl = lock(base(), 'A1');
  refused(splitClip(tl, R('V1', 's2'), 60), 'A1 Dialogue', 'split');
  refused(moveClip(tl, R('V1', 's2'), 5, false), 'A1 Dialogue', 'move');
  refused(moveClips(tl, [R('V1', 's2')], 5), 'A1 Dialogue', 'move of a group');
  refused(trimAlone(tl, R('V1', 's2'), 'tail', -5, 3), 'A1 Dialogue', 'trim alone');
  refused(setLinked(tl, R('V1', 's2'), false), 'A1 Dialogue', 'unlink');
  refused(patchClip(tl, R('V1', 's2'), { gain: -3 }, 'gain', true), 'A1 Dialogue', 'linked patch');
  refused(patchClip(tl, R('A1', 's2a'), { gain: -3 }, 'gain'), 'A1 Dialogue', 'patch of a locked clip');
  refused(retimeClips(tl, [R('V1', 's2')], 2), 'A1 Dialogue', 'speed');
  assert.equal(carrySound(tl, R('V1', 's2'), 'tail', 12, secs), undefined, 'carrying a locked sound');
  // the picture alone, not linked: its own patch is fine
  assert.ok(patchClip(tl, R('V1', 's2'), { flip: 'h' }, 'mirror'));
});
ok('taking a shot out and putting one in respect the locks', () => {
  const by = new Map([[`${F}/s2.mp4`, { src: `${F}/s2.mp4`, scene: 'S2', take: 't', name: 't', seconds: 3, cuts: [] }]]) as never;
  const tl = lock(base(), 'A3');
  refused(takeOutShot(tl, by, 'S2', 1), 'A3 Music', 'take a shot out');
  const take = { src: `${F}/s2.mp4`, scene: 'S2', take: 't', name: 't', seconds: 3, cuts: [] } as never;
  assert.equal(putShot(lock(base(), 'V1'), 'S2', 1, take, 't', by), undefined, 'put a shot on a locked picture');
  assert.equal(putShot(tl, 'S2', 1, take, 't', by), undefined, 'put a longer shot in, a locked track after it');
});
ok('tidyOverlaps and tidyDissolves leave a locked track as it is', () => {
  const tl = lock(base(), 'A2');
  tl.tracks.find((t) => t.id === 'A2')!.clips.push(clip('fx9', 'fx2.wav', 0.5, 0, 1));
  assert.ok(sameCut(tidyOverlaps(tl).tl, tl));
  const t2 = lock(base(), 'V1');
  c(t2, 'V1', 's3').dissolve = 5;      // far longer than fits
  assert.ok(sameCut(tidyDissolves(t2).tl, t2));
});
ok('a refusal is read once and does not outlive the task', async () => {
  deleteClip(lock(base(), 'V1'), R('V1', 's2'), true);
  assert.ok(takeRefusal());
  assert.equal(takeRefusal(), undefined);
});
ok('lockedWhy names the track a partner is on', () => assert.match(lockedWhy(lock(base(), 'A1'), [R('V1', 's1')])!, /^A1 Dialogue is locked and holds the sound linked to this clip/));

// ---- F3: the speed of an effect, music, an insert or a lone sound changes it alone

ok('an effect slowed down gets longer by itself: nothing else moves, no gap in the picture', () => {
  const tl = base();
  const e = retimeClips(tl, [R('A2', 'fx3')], 0.5)!;
  assert.equal(lenF(c(e.tl, 'A2', 'fx3'), 24), 48);
  for (const t of e.tl.tracks) for (const x of t.clips) if (x.id !== 'fx3') assert.deepEqual(x, c(tl, t.id, x.id), x.id);
  assert.deepEqual(e.tl.markers, tl.markers);
  assert.match(e.note, /speed 100% → 50%, 24 f longer$/);
});
ok('an effect sped up gets shorter by itself (was: everything after it moved back over the picture)', () => {
  const tl = base();
  const e = retimeClips(tl, [R('A2', 'fx1')], 2)!;
  assert.equal(lenF(c(e.tl, 'A2', 'fx1'), 24), 12);
  assert.equal(startF(c(e.tl, 'A2', 'fx2'), 24), 24);
  assert.equal(startF(c(e.tl, 'V1', 's2'), 24), 48);
});
ok('an effect slowed into the next sound goes on the track beside, whole', () => {
  const e = retimeClips(base(), [R('A2', 'fx1')], 0.5)!;
  const t = e.tl.tracks.find((x) => x.clips.some((k) => k.id === 'fx1'))!;
  assert.equal(t.name, 'Effects 2');
  assert.equal(startF(c(e.tl, 'A2', 'fx2'), 24), 24);
  assert.match(e.note, /\(now on Effects 2\)$/);
});
ok('an insert slowed into the next insert on V2: refused, with why', () => {
  const e = retimeClips(base(), [R('V2', 'i1')], 0.5);
  const why = takeRefusal();
  assert.equal(e, undefined);
  assert.match(why!, /would run 24 f into the next clip on V2 Inserts/);
});
ok('a shot still closes up: everything after it moves on every track', () => {
  const tl = base();
  const e = retimeClips(tl, [R('V1', 's2')], 2)!;
  assert.equal(startF(c(e.tl, 'V1', 's3'), 24), 72);
  assert.equal(startF(c(e.tl, 'A3', 'm1'), 24), 132);
  assert.equal(startF(c(e.tl, 'A2', 'fx3'), 24), 144);
});

// ---- F4: several clips pasted at once

ok('a shot copied with its sound pastes both, at the playhead, on their own tracks when free', () => {
  const tl = base();
  const items = [{ clip: c(tl, 'V1', 's2'), kind: 'video' as const, trackId: 'V1' }, { clip: c(tl, 'A1', 's2a'), kind: 'audio' as const, trackId: 'A1' }];
  // nowhere free on V1 before the end: refused whole, naming the picture
  const r0 = pasteClips(tl, items, 30);
  assert.equal(r0.edit, undefined);
  assert.match(r0.error!, /^S2|s2\.mp4 does not fit, so nothing was pasted/);
  const r = pasteClips(tl, items, 192)!;
  assert.equal(r.edit!.refs.length, 2);
  const [p, s] = r.edit!.refs;
  assert.equal(p.trackId, 'V1'); assert.equal(s.trackId, 'A1');
  assert.equal(startF(c(r.edit!.tl, 'V1', p.clipId), 24), 192);
  assert.deepEqual(partnerOf(r.edit!.tl, p), s, 'the pasted picture and sound are linked');
});
ok('two clips keep their distance and kinds; a sound that lands on another goes beside it', () => {
  const tl = base();
  const items = [{ clip: c(tl, 'A2', 'fx1'), kind: 'audio' as const, trackId: 'A2' }, { clip: c(tl, 'V2', 'i1'), kind: 'video' as const, trackId: 'V2' }];
  const r = pasteClips(tl, items, 168)!;     // fx1 at 168 (over fx3), i1 108 frames later
  const fx = r.edit!.refs.find((x) => findClip(r.edit!.tl, x)!.track.kind === 'audio')!;
  const ins = r.edit!.refs.find((x) => x.trackId === 'V2')!;
  assert.equal(findClip(r.edit!.tl, fx)!.track.name, 'Effects 2');
  assert.equal(startF(c(r.edit!.tl, 'V2', ins.clipId), 24) - startF(findClip(r.edit!.tl, fx)!.clip, 24), 108);
  assert.match(r.edit!.note, /^pasted 2 clips at 168 f/);
});
ok('a single clip goes on the track marked for its kind', () => {
  const tl = base();
  const r = pasteClips(tl, [{ clip: c(tl, 'A2', 'fx1'), kind: 'audio', trackId: 'A2' }], 300, { audio: 'A3' })!;
  assert.equal(r.edit!.refs[0].trackId, 'A3');
});

// ---- fragile things

ok('a trim and a moved join stop at the same end of a file (half a frame of rounding, the server allows 1.5)', () => {
  // fx2.wav is 3 s; fx2 reads 0–1 s and touches fx3? no: put a clip right after it
  const tl = base();
  tl.tracks.find((t) => t.id === 'A2')!.clips.splice(2, 0, clip('fxb', 'fx3.wav', 2, 0, 1));
  LEN['fx2.wav'] = 3.03;                       // 72.72 frames: the out may land on 73 f (0.28 f past)
  const trim = clampTrim(tl, R('A2', 'fx2'), 'tail', 999, false, 3.03, true);
  const roll = clampRoll(tl, R('A2', 'fx2'), R('A2', 'fxb'), 999, secs);
  assert.equal(trim, 49);
  assert.equal(roll.d, Math.min(49, lenF(c(tl, 'A2', 'fxb'), 24) - 1));
  const tl2 = base();
  tl2.tracks.find((t) => t.id === 'A2')!.clips.splice(2, 0, clip('fxb', 'fx3.wav', 2, 0, 2.5));
  assert.equal(clampRoll(tl2, R('A2', 'fx2'), R('A2', 'fxb'), 999, secs).d, 49, 'the join reaches the file\'s end like the trim');
  const e = rollEdit(tl2, R('A2', 'fx2'), R('A2', 'fxb'), 49, secs)!;
  assert.ok(c(e.tl, 'A2', 'fx2').out <= 3.03 + 1.5 / 24);
  LEN['fx2.wav'] = 3;
});
ok('the track beside is never a locked one', () => {
  const tl = base();
  tl.tracks.splice(4, 0, track('A4', 'audio', 'Effects 2', [], { locked: true }));
  const r = pasteClip(tl, c(tl, 'A2', 'fx1'), 'A2', 0);
  assert.equal(findClip(r.edit!.tl, r.edit!.ref)!.track.name, 'Effects 3');
  assert.equal(r.edit!.tl.tracks.find((t) => t.id === 'A4')!.clips.length, 0);
});
ok('a carried sound put back leaves its track where it is, even empty (it may be one the owner made)', () => {
  const tl = base();
  const carried = carrySound(tl, R('V1', 's2'), 'tail', 12, secs)!;
  const on = carried.tl.tracks.find((t) => t.clips.some((k) => k.id === 's2a'))!;
  assert.equal(on.name, 'Dialogue 2');
  const back = relinkSound(carried.tl, R(on.id, 's2a'))!;
  assert.ok(back.tl.tracks.some((t) => t.id === on.id && !t.clips.length), 'Dialogue 2 stays');
  assert.deepEqual(c(back.tl, 'A1', 's2a'), c(tl, 'A1', 's2a'));
});
ok('`unlinked` goes with a clip moved to another track; a paste starts linked to nothing', () => {
  const tl = setLinked(base(), R('V1', 's2'), false)!.tl;
  const m = moveToTrack(tl, R('A1', 's2a'), 'A3')!;
  assert.equal(c(m.tl, 'A3', 's2a').unlinked, true);
  const p = pasteClip(tl, c(tl, 'A1', 's2a'), 'A2', 400)!;
  assert.equal(findClip(p.edit!.tl, p.edit!.ref)!.clip.unlinked, undefined);
});
ok('a shot moved over its neighbour (now on V2, its sound on Dialogue 2) stays in sync through later edits', () => {
  let tl = moveClip(base(), R('V1', 's3'), -12, false)!.tl;
  const pic = () => tl.tracks.find((t) => t.kind === 'video' && t.clips.some((k) => k.id === 's3'))!;
  const snd = () => tl.tracks.find((t) => t.kind === 'audio' && t.clips.some((k) => k.id === 's3a'))!;
  assert.equal(pic().id, 'V3'); assert.equal(snd().name, 'Dialogue 2');    // V2 has an insert there
  const sync = (what: string) => assert.equal(startF(c(tl, pic().id, 's3'), 24), startF(c(tl, snd().id, 's3a'), 24), what);
  sync('after the move');
  tl = deleteClip(tl, R('V1', 's1'), true)!.tl; sync('after a delete before it closed up');
  tl = trimClip(tl, R('V1', 's2'), 'tail', -6, true, 3)!.tl; sync('after a trim before it closed up');
  tl = retimeClips(tl, [R('V1', 's2')], 1.5)!.tl; sync('after a speed change before it');
  tl = tidyOverlaps(tl).tl; sync('after tidying overlaps');
  assert.equal(endF(c(tl, pic().id, 's3'), 24) - startF(c(tl, pic().id, 's3'), 24), endF(c(tl, snd().id, 's3a'), 24) - startF(c(tl, snd().id, 's3a'), 24));
});

console.log(`ok · ${n} checks of the night's fixes`);
