// npm run trim-shots:test
// Trimming the shots of a take cut into shots: a shot grows and shrinks at either edge, never into another piece of
// the take and never doubling the shot before it. On the sample film of that take
// (src/fixtures/trim.ts, the same numbers), through the page's own path: the cut shown split at its shots
// (shotTimeline), the drag's limit (trimLimit, as Tracks' adjust), the edit (trimClip) and the page's tidying before a
// step. Checks: the user's steps, both edges shrunk, grown back exactly and stopped at the shot's own first and last
// frame, many alternations, a very short clip, a file with no shots, the linked sound and Option, a moved join, ripple
// positions in whole frames, undo and redo through the working cut's store, a clip already past its stop, the words.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip } from '../src/server/types';
import { clampRoll, findClip, pastShot, rollEdit, shotFrames, tidyOverlaps, trimAlone, trimClip, trimLimit, type ClipFrames, type ClipRef, type Edit } from '../src/components/edit/model';
import { clipFrames, shotTimeline, type BySrc } from '../src/components/edit/shots';
import { tidyDissolves } from '../src/components/edit/controls';
import { TRIM_FILM, TRIM_SECONDS, TRIM_TAKE, TRIM_TITLE, trimCut, trimSampleCut, trimShots } from '../src/fixtures/trim';

const FPS = 24;
const by: BySrc = new Map(trimShots().map((t) => [t.src, t]));
const R = (trackId: string, clipId: string): ClipRef => ({ trackId, clipId });
const fr = (s: number) => Math.round(s * FPS);
/** What the page shows: the cut split at its takes' shots. */
const shown = (raw: Timeline) => shotTimeline(raw, by);
const framesOf = (c: TimelineClip): ClipFrames => clipFrames(c, by, TRIM_SECONDS[c.src ?? ''], FPS);
const clip = (tl: Timeline, t: string, id: string) => findClip(tl, R(t, id))!.clip;
const json = (x: unknown) => JSON.stringify(x);
const cutOf = (tl: Timeline) => json([tl.tracks, tl.markers]);
/** The two cuts are the same, clip for clip and marker for marker; the first difference named when not. */
function sameCut(a: Timeline, b: Timeline, what: string) {
  if (cutOf(a) === cutOf(b)) return;
  for (const t of b.tracks) {
    const u = a.tracks.find((x) => x.id === t.id);
    if (!u) return assert.fail(`${what}: track ${t.id} missing`);
    for (const c of t.clips) { const k: TimelineClip | undefined = u.clips.find((x) => x.id === c.id); if (json(k) !== json(c)) assert.fail(`${what}: ${t.id} ${c.id} is ${json(k)}, want ${json(c)}`); }
    if (u.clips.length !== t.clips.length) assert.fail(`${what}: ${t.id} has ${u.clips.length} clips, want ${t.clips.length}`);
  }
  assert.fail(`${what}: the markers or the tracks differ: ${json(a.markers)} vs ${json(b.markers)}`);
}

/** A drag of `d` frames on an edge, as the page does it: the limit Tracks puts on the drag, then the edit, then the
 *  page's tidying (apply). The cut it would commit (or the same one), the frames taken, why it stopped, the words. */
function drag(raw: Timeline, ref: ClipRef, edge: 'head' | 'tail', d: number, o: { ripple?: boolean; alone?: boolean } = {}) {
  const tl = shown(raw);
  const c = findClip(tl, ref)?.clip;
  assert.ok(c, `${ref.clipId} is on the page`);
  const lim = framesOf(c);
  const ripple = o.ripple ?? true;
  const l = o.alone ? { d } : trimLimit(tl, ref, edge, d, ripple, lim);
  let e: Edit | undefined;
  if (o.alone) e = trimAlone(tl, ref, edge, d, lim);
  else if (l.d) e = trimClip(tl, ref, edge, l.d, ripple, lim);
  if (!e) return { raw, d: 0, why: (l as { why?: string }).why, note: undefined as string | undefined };
  const t1 = tidyDissolves(tidyOverlaps(e.tl).tl).tl;
  const next = { ...raw, tracks: t1.tracks, markers: t1.markers };
  // (a sound trimmed alone over its neighbour goes on the track beside)
  const k = next.tracks.flatMap((t) => t.clips).find((x) => x.id === ref.clipId)!;
  const got = edge === 'head' ? fr(k.in) - fr(c.in) : fr(k.out) - fr(c.out);
  return { raw: next, d: got, why: (l as { why?: string }).why, note: e.note };
}

/** The page shows the cut whole: every picture clip one shot (one label), no frame of the take shown twice, the sound
 *  linked to each picture where it is, every position on a whole frame. */
function sound(raw: Timeline, what: string, ids?: string[]) {
  const tl = shown(raw);
  const v = tl.tracks.find((t) => t.id === 'V1')!.clips, a = tl.tracks.find((t) => t.id === 'A1')!.clips;
  if (ids) assert.deepEqual(v.map((c) => c.id).sort(), [...ids].sort(), `${what}: the same clips, no piece added (${v.map((c) => c.id).join(', ')})`);
  assert.equal(v.length, raw.tracks.find((t) => t.id === 'V1')!.clips.length, `${what}: nothing split on the page`);
  for (const c of v) {
    const f = shotFrames(framesOf(c));
    if (f) {
      assert.equal(f.first, f.last, `${what}: ${c.id} is one shot`);
      assert.ok(fr(c.in) >= fr(f.from) && fr(c.out) <= fr(f.to), `${what}: ${c.id} (${c.in}→${c.out}) inside its shot ${f.first} (${f.from}→${f.to})`);
    }
  }
  // no frame of a take is shown twice
  const used = v.filter((c) => c.src === TRIM_TAKE).map((c) => [fr(c.in), fr(c.out)] as const).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < used.length; i++) assert.ok(used[i][0] >= used[i - 1][1], `${what}: frames ${used[i][0]}–${used[i - 1][1]} of the take shown twice`);
  for (const c of v.filter((k) => k.src)) {
    const s = a.find((k) => k.src === c.src && fr(k.at) === fr(c.at) && fr(k.in) === fr(c.in));
    if (c.id !== 'card') assert.ok(s && fr(s.out) === fr(c.out), `${what}: ${c.id}'s sound is under it, as long`);
  }
  for (const t of raw.tracks) for (const c of t.clips) assert.ok(Math.abs(c.at * FPS - Math.round(c.at * FPS)) < 1e-3, `${what}: ${t.id} ${c.id} at a whole frame (${c.at})`);
  for (const m of raw.markers) assert.ok(Math.abs(m.at * FPS - Math.round(m.at * FPS)) < 1e-3, `${what}: marker at a whole frame`);
}

let n = 0;
const ok = (what: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => { n++; console.log(`ok · ${what}`); });
const IDS = trimCut().tracks[0].clips.map((c) => c.id);

async function main() {
  // ---- the user's steps (a real film's history, revs 57 to 79)

  await ok('the tail of shot 2 (already its whole shot) dragged +14 f: it stops at shot 2\'s last frame, no piece of shot 3 appears (was: a second clip "shot 3")', () => {
    const r = drag(trimCut(), R('V1', 's4-take'), 'tail', 14);
    assert.equal(r.d, 0);
    assert.equal(r.why, "end of shot 2's frames");
    sound(r.raw, 'after', IDS);
    sameCut(r.raw, trimCut(), 'nothing changed');
  });

  await ok('the head of shot 3 (trimmed to 6.625) dragged −24, −23, −47 f: it grows back to shot 3\'s first frame (4.292) and stops, shot 2 is not doubled (was: 2.708, a second clip of shot 2\'s frames)', () => {
    let raw = trimCut();
    const steps = [[-24, -24], [-23, -23], [-47, -9]] as const;
    for (const [ask, want] of steps) {
      const r = drag(raw, R('V1', 's4-take~2'), 'head', ask);
      assert.equal(r.d, want, `${ask} f asked, ${want} f taken`);
      raw = r.raw;
      sound(raw, `head ${ask}`, IDS);
    }
    assert.equal(clip(raw, 'V1', 's4-take~2').in, 4.291667);
    assert.equal(clip(raw, 'A1', 's4-takea~2').in, 4.291667);
    // and once more: nothing, with why
    const r = drag(raw, R('V1', 's4-take~2'), 'head', -10);
    assert.equal(r.d, 0);
    assert.equal(r.why, "start of shot 3's frames");
  });

  await ok('the words of a trim that reaches its shot\'s stop say so; the others as before', () => {
    const a = drag(trimCut(), R('V1', 's4-take~2'), 'head', -100);
    assert.equal(a.note, "trimmed head of S4 · take 1 · shot 3 −56 f to shot 3's first frame, what follows moved on");
    const b = drag(trimCut(), R('V1', 's4-take~2'), 'head', 10);
    assert.equal(b.note, 'trimmed head of S4 · take 1 · shot 3 +10 f, what follows moved back');
    const c = drag(trimCut(), R('V1', 'c-f4a'), 'tail', 40);
    assert.equal(c.note, "trimmed tail of S4 · FIX-S4-reel · take 1 · shot 1 +11 f to shot 1's last frame, what follows moved on");
  });

  // ---- the four moves, on each edge

  await ok('head: shrink, grow back exactly to where it was (frame for frame, every track), grow on to the shot\'s first frame and stop', () => {
    const r0 = trimCut();
    const a = drag(r0, R('V1', 'c-s4b'), 'head', 10);
    assert.equal(a.d, 10);
    sound(a.raw, 'shrunk', IDS);
    const b = drag(a.raw, R('V1', 'c-s4b'), 'head', -10);
    sameCut(b.raw, r0, 'grown back: the cut is the sample cut again');
    // shot 8 starts at 19.917 in the take; the clip at 21.667: 42 f to grow
    const c = drag(b.raw, R('V1', 'c-s4b'), 'head', -60);
    assert.equal(c.d, -42);
    assert.equal(c.why, "start of shot 8's frames");
    assert.equal(clip(c.raw, 'V1', 'c-s4b').in, 19.916667);
    sound(c.raw, 'grown to the stop', IDS);
  });

  await ok('tail: shrink, grow back exactly, grow on to the shot\'s last frame and stop', () => {
    const r0 = trimCut();
    const a = drag(r0, R('V1', 'c-f4a'), 'tail', -12);
    const b = drag(a.raw, R('V1', 'c-f4a'), 'tail', 12);
    sameCut(b.raw, r0, 'grown back exactly');
    // FIX-S4-reel's shot 1 ends at 3.75; the clip at 3.292: 11 f
    const c = drag(b.raw, R('V1', 'c-f4a'), 'tail', 30);
    assert.equal(c.d, 11);
    assert.equal(c.why, "end of shot 1's frames");
    sound(c.raw, 'tail at its stop', IDS);
    const d = drag(c.raw, R('V1', 'c-f4a'), 'tail', 1);
    assert.equal(d.d, 0);
  });

  await ok('a shot that already is its whole shot can be shrunk at either end and grown back, never past', () => {
    let raw = trimCut();
    for (const [edge, k] of [['head', 7], ['tail', -9], ['head', -7], ['tail', 9]] as const) raw = drag(raw, R('V1', 's4-take~3'), edge, k).raw;
    sameCut(raw, trimCut(), 'back');
    assert.equal(drag(raw, R('V1', 's4-take~3'), 'head', -1).d, 0);
    assert.equal(drag(raw, R('V1', 's4-take~3'), 'tail', 1).d, 0);
  });

  await ok('many alternations on both edges of several shots, in any order: one clip each, inside its shot, then every edge back exactly', () => {
    let raw = trimCut();
    let seed = 7;
    const rnd = (k: number) => { seed = (seed * 16807) % 2147483647; return seed % k; };
    const ids = ['s4-take', 's4-take~2', 's4-take~3', 's4-take~4', 'c-s4b', 'c-f4a'];
    for (let i = 0; i < 160; i++) {
      const id = ids[rnd(ids.length)], edge = rnd(2) ? 'head' : 'tail';
      const r = drag(raw, R('V1', id), edge, rnd(61) - 30);
      raw = r.raw;
      sound(raw, `step ${i + 1}`, IDS);
    }
    // each edge back to the sample's own place: out to its stops first (a clip left short cannot take its head past
    // its tail), then in to where it was
    const want = trimCut();
    for (const id of ids) {
      const w = clip(want, 'V1', id);
      raw = drag(raw, R('V1', id), 'head', -1000).raw;
      raw = drag(raw, R('V1', id), 'tail', 1000).raw;
      raw = drag(raw, R('V1', id), 'head', fr(w.in) - fr(clip(raw, 'V1', id).in)).raw;
      raw = drag(raw, R('V1', id), 'tail', fr(w.out) - fr(clip(raw, 'V1', id).out)).raw;
    }
    sameCut(raw, want, 'back to the sample cut, frame for frame, on every track (the effect, the lines, the markers)');
  });

  await ok('a very short clip: shrunk to one frame, never less; grown again only inside its shot', () => {
    let raw = drag(trimCut(), R('V1', 's4-take~3'), 'tail', -500).raw;
    const c = clip(raw, 'V1', 's4-take~3');
    assert.equal(fr(c.out) - fr(c.in), 1, 'one frame left');
    sound(raw, 'one frame', IDS);
    assert.equal(shotFrames(framesOf(c))?.first, 4, 'a one-frame clip still knows its shot');
    assert.equal(drag(raw, R('V1', 's4-take~3'), 'head', -5).d, 0, 'at its shot\'s first frame: the head does not grow');
    assert.equal(drag(raw, R('V1', 's4-take~3'), 'head', 5).d, 0, 'one frame: the head does not shrink');
    raw = drag(raw, R('V1', 's4-take~3'), 'tail', 500).raw;
    assert.equal(clip(raw, 'V1', 's4-take~3').out, 10.583333, 'grown back to the end of shot 4, not into shot 5');
    sound(raw, 'grown again', IDS);
  });

  await ok('a file with no shots (the title card): its own start and end are the stops', () => {
    const a = drag(trimCut(), R('V1', 'card'), 'head', -40);
    assert.equal(a.d, -12);
    assert.equal(a.why, 'start of the file');
    const b = drag(trimCut(), R('V1', 'card'), 'tail', 100);
    assert.equal(b.d, 36);
    assert.equal(b.why, 'end of the file');
    assert.equal(framesOf(clip(trimCut(), 'V1', 'card')), 5, 'its frames are its file');
    // a take of one shot is its file too
    const one: BySrc = new Map([[TRIM_TITLE, { src: TRIM_TITLE, scene: 'S9', name: 'card', seconds: 5, cuts: [], state: 'ready' }]]);
    assert.equal(clipFrames(clip(trimCut(), 'V1', 'card'), one, 5, FPS), 5);
  });

  await ok('the linked sound follows every trim; with Option the picture alone stops at its shot, the sound alone runs on (one recording)', () => {
    const a = drag(trimCut(), R('A1', 's4-takea~2'), 'head', -100);
    assert.equal(a.d, -56, 'the sound grabbed: the same stop as its picture');
    assert.equal(clip(a.raw, 'V1', 's4-take~2').in, 4.291667);
    sound(a.raw, 'sound grabbed', IDS);
    const p = drag(trimCut(), R('V1', 's4-take'), 'tail', 14, { alone: true });
    assert.equal(fr(clip(p.raw, 'V1', 's4-take').out), fr(4.291667), 'the picture alone stays at shot 2\'s last frame');
    const s = drag(trimCut(), R('A1', 's4-takea'), 'tail', 14, { alone: true });
    const moved = s.raw.tracks.flatMap((t) => t.clips.map((c) => ({ t: t.id, c }))).find((x) => x.c.id === 's4-takea')!;
    assert.equal(fr(moved.c.out), fr(4.291667) + 14, 'the sound alone runs on 14 f into the next shot\'s sound');
    assert.ok(moved.c.unlinked && clip(s.raw, 'V1', 's4-take').unlinked, 'and the two are unlinked');
    assert.equal(fr(clip(s.raw, 'V1', 's4-take').out), fr(4.291667), 'its picture stays');
    assert.equal(shown(s.raw).tracks.reduce((k, t) => k + t.clips.length, 0), s.raw.tracks.reduce((k, t) => k + t.clips.length, 0), 'nothing split on the page');
  });

  await ok('a moved join stops at the shots\' own frames too: shot 2 | shot 3 cannot go later (shot 2 is whole), shot 3 | shot 4 neither way', () => {
    const tl = shown(trimCut());
    const fb = (src: string, c?: TimelineClip) => (c ? framesOf(c) : TRIM_SECONDS[src]);
    const later = clampRoll(tl, R('V1', 's4-take'), R('V1', 's4-take~2'), 10, fb);
    assert.deepEqual(later, { d: 0, why: "end of shot 2's frames" });
    const earlier = clampRoll(tl, R('V1', 's4-take'), R('V1', 's4-take~2'), -10, fb);
    assert.equal(earlier.d, -10, 'earlier: shot 3 grows back into its own frames');
    assert.deepEqual(clampRoll(tl, R('V1', 's4-take~2'), R('V1', 's4-take~3'), 5, fb), { d: 0, why: "end of shot 3's frames" });
    assert.deepEqual(clampRoll(tl, R('V1', 's4-take~2'), R('V1', 's4-take~3'), -5, fb), { d: 0, why: "start of shot 4's frames" });
    // and the edit itself takes no more than its limit
    const e = rollEdit(tl, R('V1', 's4-take'), R('V1', 's4-take~2'), -10, fb)!;
    assert.equal(clip(e.tl, 'V1', 's4-take~2').in, 6.208333);
    assert.equal(rollEdit(tl, R('V1', 's4-take'), R('V1', 's4-take~2'), 10, fb), undefined);
  });

  await ok('ripple: what follows moves by exactly the frames taken, on every track (the effect, the lines, the markers), in whole frames', () => {
    const r0 = trimCut();
    // a line over shot 3 too: a head grown back puts frames in at the shot's start, so its words move on with its sound
    r0.tracks.find((t) => t.id === 'C1')!.clips.unshift({ id: 'l0', in: 0, out: 1, at: 5.5, text: 'A bottle.' });
    const a = drag(r0, R('V1', 's4-take~2'), 'head', -30);
    const k = 30 / FPS;
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
    assert.ok(near(clip(a.raw, 'V1', 's4-take~3').at, clip(r0, 'V1', 's4-take~3').at + k), 'the next shot');
    assert.ok(near(clip(a.raw, 'A2', 'boom').at, clip(r0, 'A2', 'boom').at + k), 'the effect after it');
    assert.ok(near(a.raw.markers[0].at, r0.markers[0].at + k) && near(a.raw.markers[1].at, r0.markers[1].at + k), 'the markers after it');
    assert.ok(['l0', 'l1', 'l2'].every((id) => near(clip(a.raw, 'C1', id).at, clip(r0, 'C1', id).at + k)), 'the lines (one is over the shot: its words stay with its sound)');
    assert.equal(clip(a.raw, 'V1', 's4-take~2').at, clip(r0, 'V1', 's4-take~2').at, 'the shot keeps its place');
    sound(a.raw, 'rippled', IDS);
    // gaps left open (R): the clip before bounds a head that grows
    const g = drag(r0, R('V1', 's4-take~2'), 'head', -5, { ripple: false });
    assert.equal(g.d, 0);
    assert.equal(g.why, 'the clip before');
  });

  await ok('undo and redo of trims, through the working cut\'s store: each step back is the cut before it, exactly', async () => {
    const W = await import('../src/server/edit/working');
    const { filmTargetOf } = await import('../src/server/edit/timeline');
    W.forgetMock(TRIM_FILM);
    const s = W.memoryStore(filmTargetOf(TRIM_FILM, '/nonexistent-sample-film', '/nonexistent-sample-film'), trimSampleCut(TRIM_FILM))!;
    let w = (await W.ensureWorking(s))!;
    const cuts: Timeline[] = [trimCut()];
    for (const [id, edge, k] of [['s4-take~2', 'head', -40], ['c-s4b', 'tail', -6], ['s4-take~2', 'head', -40]] as const) {
      const r = drag(cuts[cuts.length - 1], R('V1', id), edge, k);
      w = await W.step(s, { rev: w.working.rev, words: r.note!, tracks: r.raw.tracks, markers: r.raw.markers });
      cuts.push(r.raw);
    }
    const words = w.history.steps.slice(-3).map((x) => x.words);
    assert.deepEqual(words, ['trimmed head of S4 · take 1 · shot 3 −40 f, what follows moved on', 'trimmed tail of S4 · take 1 · shot 8 −6 f, what follows moved back', "trimmed head of S4 · take 1 · shot 3 −16 f to shot 3's first frame, what follows moved on"]);
    const now = () => json([w.working.tracks, w.working.markers]);
    for (let i = cuts.length - 2; i >= 0; i--) { w = await W.undo(s, w.working.rev); assert.equal(now(), cutOf(cuts[i]), `undo to step ${i}`); }
    for (let i = 1; i < cuts.length; i++) { w = await W.redo(s, w.working.rev); assert.equal(now(), cutOf(cuts[i]), `redo to step ${i}`); }
    W.forgetMock(TRIM_FILM);
  });

  // ---- a clip already past its stop (the real film's shot 3 at rev 79: in 2.708, 38 f of shot 2's frames)

  const past = () => {
    const t = trimCut();
    const v = t.tracks.find((x) => x.id === 'V1')!, a = t.tracks.find((x) => x.id === 'A1')!;
    const grow = (c: TimelineClip) => { c.in = 2.708333; };
    grow(v.clips.find((c) => c.id === 's4-take~2')!); grow(a.clips.find((c) => c.id === 's4-takea~2')!);
    // what follows moved on as it did then (94 f)
    for (const tr of t.tracks) for (const c of tr.clips) if (c.at > 6) c.at = Math.round((c.at * FPS + 94)) / FPS;
    return t;
  };
  await ok('a shot already past its stop shows as the one clip it is (not cut in two), its extra frames counted, the cut not rewritten', () => {
    const raw = past();
    const tl = shown(raw);
    assert.equal(tl, raw, 'shotTimeline gives the same cut back: nothing to split');
    const c = clip(tl, 'V1', 's4-take~2');
    const f = framesOf(c);
    assert.deepEqual(shotFrames(f), { from: 4.291667, to: 8.333333, first: 3, last: 3 });
    assert.deepEqual(pastShot(c, f, FPS), { head: 38, tail: 0 });
  });
  await ok('…it never grows further, and its head dragged in stops nowhere early: to the stop (38 f) it is mended, further it shrinks on', () => {
    const raw = past();
    const g = drag(raw, R('V1', 's4-take~2'), 'head', -5);
    assert.equal(g.d, 0);
    assert.equal(g.why, "start of shot 3's frames");
    const m = drag(raw, R('V1', 's4-take~2'), 'head', 38);
    assert.equal(clip(m.raw, 'V1', 's4-take~2').in, 4.291667, 'mended');
    assert.equal(m.note, "trimmed head of S4 · take 1 · shot 3 +38 f back to shot 3's first frame, what follows moved back");
    assert.deepEqual(pastShot(clip(m.raw, 'V1', 's4-take~2'), framesOf(clip(m.raw, 'V1', 's4-take~2')), FPS), { head: 0, tail: 0 });
    sound(m.raw, 'mended', IDS);
    const f = drag(raw, R('V1', 's4-take~2'), 'head', 50);
    assert.equal(f.d, 50);
    const t = drag(raw, R('V1', 's4-take~2'), 'tail', -10);
    assert.equal(t.d, -10, 'its other end trims as any');
  });
  await ok('a whole take left in one clip ("S4 · take 1") is still shown cut at its shots, as before', () => {
    const t = trimCut();
    const v = t.tracks.find((x) => x.id === 'V1')!;
    v.clips = [{ id: 'w', src: TRIM_TAKE, in: 0, out: 26.041667, at: 0, label: 'S4 · take 1', takeRef: { scene: 'S4', take: 'take 1' } }];
    t.tracks = [v];
    const s = shown(t).tracks[0].clips;
    assert.equal(s.length, 9);
    assert.deepEqual(s.map((c) => c.label), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `S4 · take 1 · shot ${k}`));
    // a clip named for one shot that holds another whole shot is cut too (not a trim past its stop)
    t.tracks[0].clips = [{ ...t.tracks[0].clips[0], in: 2.333333, out: 10, label: 'S4 · take 1 · shot 2' }];
    assert.equal(shown(t).tracks[0].clips.length, 3);
  });

  console.log(`\n${n} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
