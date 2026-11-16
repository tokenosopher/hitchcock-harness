// npm run sound:test
// A shot's sound before or after its picture (model.ts: trimAlone, clampAlone, carryPlan, carrySound, relinkSound,
// tidyOverlaps; the Option-drag on a trim handle and the right-click menu's "Carry the sound over this join"), on
// a hand-made cut and on every join of the sample film: the sound alone runs on under the next shot or starts
// under the one before, goes on the track beside, the picture and the neighbours stay, the film keeps its length;
// each limited by its file; a picture trimmed alone; the menu's six choices; the fade on the new stretch; putting
// it back gives the original cut; a second carry; a sped-up clip.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import cutFixture from '../src/fixtures/boards/cut-the-lighthouse.json';
import {
  carryPlan, carrySound, clampAlone, endF, findClip, lenF, partnerOf, relinkSound, startF, tidyOverlaps, totalF, trimAlone, trimClip,
} from '../src/components/edit/model';

const F = 'assets/films/x';
const clip = (id: string, src: string, at: number, inn: number, out: number, extra: Partial<TimelineClip> = {}): TimelineClip => ({ id, src: `${F}/${src}`, in: inn, out, at, ...extra });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[]): TimelineTrack => ({ id, kind, name, clips });
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z', markers: [{ at: 3, text: 'here' }],
  tracks: [
    track('V1', 'video', 'Picture', [clip('s1', 's1.mp4', 0, 1, 3), clip('s2', 's2.mp4', 2, 0.5, 2.5), clip('s3', 's3.mp4', 4, 0, 1), clip('s5', 's5.mp4', 5, 0, 2, { speed: 2 }), clip('s4', 's4.mp4', 6, 0, 1)]),
    track('A1', 'audio', 'Dialogue', [clip('s1a', 's1.mp4', 0, 1, 3), clip('s2a', 's2.mp4', 2, 0.5, 2.5), clip('s3a', 's3.mp4', 4, 0, 1), clip('s5a', 's5.mp4', 5, 0, 2, { speed: 2 }), clip('s4a', 's4.mp4', 6, 0, 1)]),
    track('A2', 'audio', 'Effects', [clip('fx1', 'fx1.wav', 0.5, 0, 1)]),
  ],
} as Timeline);

// s1: 1 s hidden after it (24 f), s2: 0.5 s before it (12 f) and 0.5 s after; s4 uses its whole file; s3 not known;
// s5 plays 2 s of a 6 s file at double speed (the 4 s left = 2 s of timeline after it)
const LEN: Record<string, number> = { 's1.mp4': 4, 's2.mp4': 3, 's4.mp4': 1, 's5.mp4': 6, 'fx1.wav': 5 };
const secs = (src: string) => LEN[src.split('/').pop()!];
const R = (trackId: string, clipId: string) => ({ trackId, clipId });
/** A clip by id, wherever it is now. */
const where = (tl: Timeline, id: string) => { for (const t of tl.tracks) { const x = t.clips.find((k) => k.id === id); if (x) return { t, c: x }; } throw new Error(`no ${id}`); };
const c = (tl: Timeline, t: string, id: string) => findClip(tl, R(t, id))!.clip;
const same = (a: Timeline, b: Timeline, ids: string[], what: string) => {
  for (const id of ids) { const x = where(a, id), y = where(b, id); assert.equal(JSON.stringify([x.t.id, x.c]), JSON.stringify([y.t.id, y.c]), `${what}: ${id}`); }
};
const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} ≠ ${b}`);
const fadeOk = (x: TimelineClip) => assert.ok((x.fadeIn ?? 0) + (x.fadeOut ?? 0) <= (x.out - x.in) / (x.speed ?? 1) + 1e-6, `${x.id}: fades longer than the clip`);

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };
const tl = base();
const frozen = JSON.stringify(tl);
const OTHERS = ['s2', 's2a', 's3', 's3a', 's4', 's4a', 's5', 's5a', 'fx1'];

ok('the sound\'s tail alone runs on under the next shot and goes beside; the picture, the next shot and its sound stay', () => {
  const e = trimAlone(tl, R('A1', 's1a'), 'tail', 18, secs('s1.mp4'))!;
  assert.equal(e.note, 's1.mp4: its sound runs on 18 f after its picture (now on Dialogue 2)');
  const a = where(e.tl, 's1a');
  assert.equal(a.t.name, 'Dialogue 2');
  assert.equal(a.t.id, 'A3');
  close(a.c.out, 3.75, 's1a out');
  close(a.c.at, 0, 's1a at');
  assert.equal(a.c.unlinked, true);
  const p = c(e.tl, 'V1', 's1');
  assert.equal(p.unlinked, true, 'the picture is unlinked too');
  assert.equal(JSON.stringify({ ...p, unlinked: undefined }), JSON.stringify({ ...c(tl, 'V1', 's1'), unlinked: undefined }), 'the picture is otherwise as it was');
  same(e.tl, tl, OTHERS, 'untouched');
  assert.equal(totalF(e.tl), totalF(tl), 'the film keeps its length');
  assert.deepEqual(e.tl.markers, tl.markers);
  assert.equal(tidyOverlaps(e.tl).moved.length, 0, 'nothing left for the page to tidy');
  assert.equal(JSON.stringify(e.tl.tracks.map((t) => t.id)), JSON.stringify(['V1', 'A1', 'A3', 'A2']), 'the track beside sits under the dialogue');
  assert.equal(JSON.stringify(tl), frozen, 'the input is not changed');
});

ok('the sound\'s head alone starts under the shot before, as far as its file has sound', () => {
  assert.deepEqual(clampAlone(tl, R('A1', 's2a'), 'head', -18, secs('s2.mp4')), { d: -12, why: 'start of the file' });
  const e = trimAlone(tl, R('A1', 's2a'), 'head', -18, secs('s2.mp4'))!;
  assert.equal(e.note, 's2.mp4: its sound starts 12 f before its picture (now on Dialogue 2)');
  const a = where(e.tl, 's2a');
  assert.equal(a.t.name, 'Dialogue 2');
  close(a.c.at, 1.5, 's2a at'); close(a.c.in, 0, 's2a in'); close(a.c.out, 2.5, 's2a out');
  same(e.tl, tl, ['s1', 's1a', 's3', 's3a', 's4', 's4a', 'fx1'], 'untouched');
  assert.equal(c(e.tl, 'V1', 's2').unlinked, true);
  assert.equal(totalF(e.tl), totalF(tl));
});

ok('limits: the end of the file, the start of the film, one frame left; the next shot\'s sound is no limit', () => {
  assert.deepEqual(clampAlone(tl, R('A1', 's1a'), 'tail', 100, secs('s1.mp4')), { d: 24, why: 'end of the file' });
  assert.deepEqual(clampAlone(tl, R('A1', 's4a'), 'tail', 10, secs('s4.mp4')), { d: 0, why: 'end of the file' });
  assert.equal(trimAlone(tl, R('A1', 's4a'), 'tail', 10, secs('s4.mp4')), undefined);
  assert.deepEqual(clampAlone(tl, R('A1', 's1a'), 'head', -100, secs('s1.mp4')), { d: 0, why: 'start of the film' });
  assert.deepEqual(clampAlone(tl, R('A1', 's1a'), 'tail', -100, secs('s1.mp4')), { d: -47, why: 'one frame left' });
  assert.deepEqual(clampAlone(tl, R('A1', 's3a'), 'tail', 5, undefined), { d: 0, why: 'file length unknown' });
  assert.deepEqual(clampAlone(tl, R('A1', 's1a'), 'tail', 20, secs('s1.mp4')), { d: 20 });
});

ok('a sound made shorter alone: the picture stays, nothing closes up', () => {
  const e = trimAlone(tl, R('A1', 's1a'), 'tail', -6, secs('s1.mp4'))!;
  assert.equal(e.note, 's1.mp4: its sound ends 6 f before its picture');
  const a = where(e.tl, 's1a');
  assert.equal(a.t.id, 'A1', 'it overlaps nothing: it stays on the dialogue');
  close(a.c.out, 2.75, 's1a out');
  same(e.tl, tl, OTHERS, 'untouched');
  assert.equal(e.tl.tracks.length, tl.tracks.length, 'no track made');
});

ok('a picture trimmed alone: its sound stays, nothing closes up; it stops at its neighbour', () => {
  const e = trimAlone(tl, R('V1', 's1'), 'tail', -6, secs('s1.mp4'))!;
  assert.equal(e.note, 's1.mp4: its picture ends 6 f earlier, its sound left as it was');
  close(c(e.tl, 'V1', 's1').out, 2.75, 's1 out');
  close(c(e.tl, 'V1', 's2').at, 2, 's2 has not moved: a gap opens');
  assert.equal(c(e.tl, 'A1', 's1a').unlinked, true);
  close(c(e.tl, 'A1', 's1a').out, 3, 's1a out as it was');
  same(e.tl, tl, OTHERS, 'untouched');
  assert.deepEqual(clampAlone(tl, R('V1', 's1'), 'tail', 6, secs('s1.mp4')), { d: 0, why: 'the next clip' });
  assert.deepEqual(clampAlone(tl, R('V1', 's2'), 'head', -6, secs('s2.mp4')), { d: 0, why: 'the clip before' });
  // with gaps closing, the same trim without Option still takes the pair and closes up
  const r = trimClip(tl, R('V1', 's1'), 'tail', -6, true, secs('s1.mp4'))!;
  close(c(r.tl, 'A1', 's1a').out, 2.75, 'the pair trims together');
  close(c(r.tl, 'V1', 's2').at, 1.75, 'and what follows closes up');
});

ok('the menu: the earlier shot\'s sound runs on 0.5, 1 and 2 s (the last only 1 s: its file ends)', () => {
  const p = (f: number) => carryPlan(tl, R('V1', 's1'), 'tail', f, secs);
  assert.deepEqual(p(12), { sound: R('A1', 's1a'), now: 0, reach: 12, why: undefined });
  assert.deepEqual(p(24), { sound: R('A1', 's1a'), now: 0, reach: 24, why: undefined });
  assert.deepEqual(p(48), { sound: R('A1', 's1a'), now: 0, reach: 24, why: 'end of the file' });
});

ok('the menu: the later shot\'s sound starts 0.5 s early; 1 and 2 s give 0.5 s; a shot with no more sound is refused', () => {
  const p = (f: number) => carryPlan(tl, R('V1', 's2'), 'head', f, secs);
  assert.equal(p(12).reach, 12); assert.equal(p(12).why, undefined);
  assert.equal(p(24).reach, 12); assert.equal(p(24).why, 'start of the file');
  assert.equal(p(48).reach, 12);
  assert.deepEqual(carryPlan(tl, R('V1', 's4'), 'head', 12, secs), { sound: R('A1', 's4a'), now: 0, reach: 0, why: 'no more sound in the file' });
  assert.deepEqual(carryPlan(tl, R('V1', 's4'), 'tail', 12, secs), { sound: R('A1', 's4a'), now: 0, reach: 0, why: 'no more sound in the file' });
  assert.equal(carrySound(tl, R('V1', 's4'), 'tail', 12, secs), undefined);
  assert.equal(carryPlan(tl, R('V1', 's3'), 'tail', 12, secs).why, 'file length unknown');
});

ok('the menu\'s carry: one version, a fade over the new stretch as long as it, the neighbour left as it is', () => {
  const e = carrySound(tl, R('V1', 's1'), 'tail', 24, secs)!;
  assert.equal(e.note, 's1.mp4: its sound runs on 24 f after its picture, fading out (now on Dialogue 2)');
  const a = where(e.tl, 's1a').c;
  close(a.out, 4, 's1a to the end of its file');
  close(a.fadeOut!, 1, 'fade out over the 24 f');
  assert.equal(a.fadeIn, undefined);
  fadeOk(a);
  same(e.tl, tl, OTHERS, 'the next shot and its sound untouched, not quieter, not cut');
  const h = carrySound(tl, R('V1', 's2'), 'head', 24, secs)!;
  assert.equal(h.note, 's2.mp4: its sound starts 12 f before its picture, fading in (now on Dialogue 2)');
  const b = where(h.tl, 's2a').c;
  close(b.fadeIn!, 0.5, 'fade in over the 12 f');
  fadeOk(b);
  same(h.tl, tl, ['s1', 's1a', 's3', 's3a', 'fx1'], 'the shot before untouched');
});

// the cut with the tracks the original did not have taken away when empty: putting a carried sound back leaves the
// track it was carried to, even empty (14 Nov: a "Dialogue 2" may be one the owner made; "Delete empty tracks" takes it)
const bare = (x: Timeline) => JSON.stringify({ ...x, tracks: x.tracks.filter((t) => t.clips.length || tl.tracks.some((o) => o.id === t.id)) });

ok('putting it back ("Link to the picture again") gives the original cut, from the sound or from the picture', () => {
  for (const [pic, edge, f] of [['s1', 'tail', 24], ['s1', 'tail', 7], ['s2', 'head', 12]] as const) {
    const e = carrySound(tl, R('V1', pic), edge, f, secs)!;
    const s = where(e.tl, `${pic}a`);
    const back = relinkSound(e.tl, R(s.t.id, `${pic}a`))!;
    assert.equal(back.note, `${pic}.mp4: its sound back to its picture's length, linked again`);
    assert.equal(bare(back.tl), JSON.stringify(tl), `${pic} ${edge} ${f}: the original back, the track beside left empty`);
    assert.equal(bare(relinkSound(e.tl, R('V1', pic))!.tl), JSON.stringify(tl), 'from the picture too');
    assert.deepEqual(partnerOf(back.tl, R('V1', pic)), R('A1', `${pic}a`), 'linked again');
  }
  // an Option-drag that made it shorter, too
  const e = trimAlone(tl, R('A1', 's1a'), 'tail', -6, secs('s1.mp4'))!;
  assert.equal(JSON.stringify(relinkSound(e.tl, R('A1', 's1a'))!.tl), JSON.stringify(tl));
  // nothing to put back on a linked pair
  assert.equal(relinkSound(tl, R('A1', 's1a')), undefined);
  assert.equal(relinkSound(tl, R('V1', 's1')), undefined);
});

ok('both sides carried: each is put back once the dialogue under its picture is free', () => {
  const a = carrySound(tl, R('V1', 's1'), 'tail', 24, secs)!;
  const b = carrySound(a.tl, R('V1', 's2'), 'head', 12, secs)!;
  // s1a went beside; s2a, starting early, now overlaps nothing on the dialogue (s1a left it) and stays there
  assert.equal(where(b.tl, 's1a').t.name, 'Dialogue 2');
  assert.equal(where(b.tl, 's2a').t.id, 'A1');
  assert.equal(relinkSound(b.tl, R('A3', 's1a')), undefined, 's2a now starts under s1: no room yet');
  const x = relinkSound(b.tl, R('A1', 's2a'))!;
  const y = relinkSound(x.tl, R('A3', 's1a'))!;
  assert.equal(bare(y.tl), JSON.stringify(tl));
});

ok('a second carry on a sound already carried: it grows from where it is, and over another sound goes one track further', () => {
  const a = carrySound(tl, R('V1', 's1'), 'tail', 12, secs)!;
  assert.equal(carryPlan(a.tl, R('V1', 's1'), 'tail', 12, secs).why, 'already so');
  const p = carryPlan(a.tl, R('V1', 's1'), 'tail', 24, secs);
  assert.equal(p.now, 12); assert.equal(p.reach, 24);
  const b = carrySound(a.tl, R('V1', 's1'), 'tail', 24, secs)!;
  assert.equal(b.note, 's1.mp4: its sound runs on 24 f after its picture, fading out');
  assert.equal(where(b.tl, 's1a').t.name, 'Dialogue 2', 'it stays on the track beside');
  close(where(b.tl, 's1a').c.fadeOut!, 1, 'the fade covers the whole stretch');
  // a sound of its own on Dialogue 2 just after it: the Option-drag takes it to Dialogue 3
  const t2 = JSON.parse(JSON.stringify(a.tl)) as Timeline;
  t2.tracks.find((t) => t.name === 'Dialogue 2')!.clips.push(clip('fx9', 'fx1.wav', 2.75, 0, 1));
  const d = trimAlone(t2, R('A3', 's1a'), 'tail', 8, secs('s1.mp4'))!;
  assert.equal(d.note, 's1.mp4: its sound runs on 20 f after its picture (now on Dialogue 3)');
  assert.equal(where(d.tl, 'fx9').t.name, 'Dialogue 2', 'the other sound stays');
  assert.deepEqual(d.tl.tracks.map((t) => t.name), ['Picture', 'Dialogue', 'Dialogue 2', 'Dialogue 3', 'Effects']);
});

ok('a sped-up shot: its sound runs on 2 s of timeline for the 4 s left in its file', () => {
  assert.deepEqual(clampAlone(tl, R('A1', 's5a'), 'tail', 100, secs('s5.mp4')), { d: 48, why: 'end of the file' });
  const e = carrySound(tl, R('V1', 's5'), 'tail', 48, secs)!;
  const a = where(e.tl, 's5a');
  close(a.c.out, 6, 's5a to the end of its file');
  assert.equal(endF(a.c, 24) - endF(c(e.tl, 'V1', 's5'), 24), 48);
  close(a.c.fadeOut!, 2, 'a 2 s fade');
  fadeOk(a.c);
  assert.equal(a.t.name, 'Dialogue 2');
  assert.equal(bare(relinkSound(e.tl, R(a.t.id, 's5a'))!.tl), JSON.stringify(tl), 'and back');
});

ok('tidyOverlaps moves the carried sound, not its neighbour, even when both are unlinked', () => {
  // the tail of s1a over s2a, both unlinked, both on the dialogue: s1a goes
  const u = base();
  c(u, 'A1', 's1a').out = 3.5; c(u, 'A1', 's1a').unlinked = true; c(u, 'V1', 's1').unlinked = true;
  c(u, 'A1', 's2a').unlinked = true; c(u, 'V1', 's2').unlinked = true;
  const t = tidyOverlaps(u);
  assert.deepEqual(t.moved, ['Dialogue 2']);
  assert.equal(where(t.tl, 's1a').t.name, 'Dialogue 2');
  assert.equal(where(t.tl, 's2a').t.id, 'A1');
  // the head of s2a under s1a, both unlinked: s2a goes (it used to be the earlier one, s1a)
  const w = base();
  c(w, 'A1', 's2a').at = 1.5; c(w, 'A1', 's2a').in = 0; c(w, 'A1', 's2a').unlinked = true; c(w, 'V1', 's2').unlinked = true;
  c(w, 'A1', 's1a').unlinked = true; c(w, 'V1', 's1').unlinked = true;
  const v = tidyOverlaps(w);
  assert.equal(where(v.tl, 's2a').t.name, 'Dialogue 2');
  assert.equal(where(v.tl, 's1a').t.id, 'A1');
});

ok('every join of the sample film: each sound runs on 1 s and starts 1 s early where its file allows; the film keeps its length; put back gives the original', () => {
  const film = (cutFixture as unknown as { current: Timeline; sourceSeconds: Record<string, number> });
  const t0 = film.current;
  const ss = (src: string) => film.sourceSeconds[src];
  const v = t0.tracks.find((t) => t.id === 'V1')!.clips;
  let carried = 0, refused = 0;
  for (let i = 1; i < v.length; i++) {
    if (endF(v[i - 1], t0.fps) !== startF(v[i], t0.fps)) continue;
    for (const [pic, edge] of [[v[i - 1], 'tail'], [v[i], 'head']] as const) {
      const plan = carryPlan(t0, R('V1', pic.id), edge, 24, ss);
      const e = carrySound(t0, R('V1', pic.id), edge, 24, ss);
      if (!e) { refused++; assert.ok(plan.why, `${pic.id}: refused with a reason`); continue; }
      carried++;
      assert.equal(totalF(e.tl) >= totalF(t0), true);
      const s = where(e.tl, `${pic.id}a`);
      assert.ok(s.c.unlinked);
      assert.equal(lenF(s.c, t0.fps), lenF(pic, t0.fps) + plan.reach, `${pic.id}: longer by what the plan said`);
      assert.ok(s.c.out <= Math.max(ss((s.c.src ?? '')), pic.out) + 1.5 / 24 && s.c.in >= 0, `${pic.id}: inside its file (or no further past it than before: c21)`);
      fadeOk(s.c);
      assert.equal(tidyOverlaps(e.tl).moved.length, 0);
      for (const t of e.tl.tracks) if (t.kind === 'video') assert.equal(JSON.stringify(t.clips.map((x) => ({ ...x, unlinked: undefined }))), JSON.stringify(t0.tracks.find((x) => x.id === t.id)!.clips.map((x) => ({ ...x, unlinked: undefined }))), 'the picture stays');
      const back = relinkSound(e.tl, R(s.t.id, s.c.id));
      assert.ok(back, `${pic.id}: can be put back`);
      assert.equal(JSON.stringify(back.tl.tracks.filter((t) => t.clips.length || t0.tracks.some((o) => o.id === t.id))), JSON.stringify(t0.tracks), `${pic.id} ${edge}: put back gives the original (the track beside left, empty)`);
    }
  }
  assert.ok(carried > 10 && refused > 0, `${carried} carried, ${refused} refused`);
  console.log(`   (${carried} carried, ${refused} refused for want of sound in the file)`);
});

console.log(`ok · ${n} checks`);
