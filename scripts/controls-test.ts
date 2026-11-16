// npm run controls:test
// The Edit page's controls for the render's new fields (controls.ts): a mirror and a fade set on the picture
// alone, dissolves set, refused and kept valid after every kind of edit (tidyDissolves, checked against the
// server's own validateTimeline), level points added, moved, removed and read through a sped-up clip and after a
// split and a trim, track presses folded into one change, and the line an undo writes.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack, TimelineVersionRef } from '../src/server/types';
import { filmTargetOf, validateTimeline } from '../src/server/edit/timeline';
import { deleteClip, moveClip, pasteClip, retimeClips, rollEdit, splitClip, trimClip, moveToTrack, findClip } from '../src/components/edit/model';
import {
  addGainPoint, dissolvePlan, levelAt, maxDissolveF, moveGainPoint, pointsDb, pressWords, removeGainPoint, setDissolve, setFade, setFlip, setSoundDissolve,
  soundJoin, srcTimeAt, tidyDissolves, timeOfSrc, undoLine, undoTitle, withPresses, stepUndoLine, stepTitle, saveStatus, outsideStepWords, staleWords,
} from '../src/components/edit/controls';

const film = filmTargetOf('x', '/tmp/hh-controls-x', '/tmp/hh-controls-x');
const shot = (id: string, at: number, inn: number, out: number, extra: Partial<TimelineClip> = {}): TimelineClip => ({ id, src: `assets/films/x/${id.replace(/a$/, '')}.mp4`, in: inn, out, at, ...extra });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[], extra: Partial<TimelineTrack> = {}): TimelineTrack => ({ id, kind, name, clips, ...extra });
/** Three shots of 2 s, 1 s and 3 s on V1, their sounds on A1, a music clip on A2 (4 s from a 20 s file). */
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z', markers: [],
  tracks: [
    track('V1', 'video', 'Picture', [shot('s1', 0, 1, 3), shot('s2', 2, 5, 6), shot('s3', 3, 0, 3)]),
    track('A1', 'audio', 'Dialogue', [shot('s1a', 0, 1, 3), shot('s2a', 2, 5, 6), shot('s3a', 3, 0, 3)]),
    track('A2', 'audio', 'Music', [{ id: 'm1', src: 'assets/films/x/music.wav', in: 2, out: 6, at: 1, gain: -6 }]),
  ],
});
const V = (id: string) => ({ trackId: 'V1', clipId: id });
const A = (id: string) => ({ trackId: 'A1', clipId: id });
const M = { trackId: 'A2', clipId: 'm1' };
const clipOf = (tl: Timeline, r: { trackId: string; clipId: string }) => findClip(tl, r)!.clip;
const valid = async (tl: Timeline, what: string) => {
  const { problems } = await validateTimeline(JSON.parse(JSON.stringify(tl)), film, { files: false });
  assert.deepEqual(problems, [], `${what}: the server's check refuses the cut`);
};

let n = 0;
const ok = async (what: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`ok · ${what}`); };

async function main() {
  const tl = base();
  const frozen = JSON.stringify(tl);

  // ---- mirror
  await ok('mirror: set on the picture only, its sound untouched; off again; a sound clip refused', async () => {
    const e = setFlip(tl, V('s2'), true)!;
    assert.equal(clipOf(e.tl, V('s2')).flip, 'h');
    assert.equal(clipOf(e.tl, A('s2a')).flip, undefined);
    assert.equal(e.note, 'mirrored s2.mp4');
    await valid(e.tl, 'mirror');
    assert.equal(setFlip(e.tl, V('s2'), true), undefined, 'already mirrored');
    const off = setFlip(e.tl, V('s2'), false)!;
    assert.equal('flip' in clipOf(off.tl, V('s2')), false);
    assert.equal(off.note, 'stopped mirroring s2.mp4');
    assert.equal(setFlip(tl, A('s2a'), true), undefined, 'a sound never gets flip');
    assert.equal(setFlip(tl, V('s2'), true, () => 'S2 shot 3')!.note, 'mirrored S2 shot 3');
  });
  await ok('mirror: kept by split, trim, move, speed and a moved join', async () => {
    const m = setFlip(tl, V('s3'), true)!.tl;
    const sp = splitClip(m, V('s3'), 4 * 24)!.tl;
    assert.ok(sp.tracks[0].clips.filter((c) => (c.src ?? '').endsWith('s3.mp4')).every((c) => c.flip === 'h'));
    assert.equal(clipOf(trimClip(m, V('s3'), 'tail', -10, true)!.tl, V('s3')).flip, 'h');
    assert.equal(clipOf(retimeClips(m, [V('s3')], 1.5)!.tl, V('s3')).flip, 'h');
    assert.equal(clipOf(rollEdit(m, V('s2'), V('s3'), 6, () => 20)!.tl, V('s3')).flip, 'h');
  });

  // ---- fades on one clip
  await ok('a picture fade is set on the picture only; a sound fade on the sound only', async () => {
    const e = setFade(tl, V('s1'), 'fadeIn', 0.5)!;
    assert.equal(clipOf(e.tl, V('s1')).fadeIn, 0.5);
    assert.equal(clipOf(e.tl, A('s1a')).fadeIn, undefined);
    assert.equal(e.note, 'fade in on the picture of s1.mp4: 12 f');
    const s = setFade(tl, A('s1a'), 'fadeOut', 1)!;
    assert.equal(clipOf(s.tl, A('s1a')).fadeOut, 1);
    assert.equal(clipOf(s.tl, V('s1')).fadeOut, undefined);
    assert.equal(s.note, 'fade out on the sound of s1.mp4: 24 f');
    // kept inside the clip with its other fade (2 s clip, 0.5 s in: at most 1.5 s out)
    assert.equal(clipOf(setFade(e.tl, V('s1'), 'fadeOut', 5)!.tl, V('s1')).fadeOut, 1.5);
    const none = setFade(e.tl, V('s1'), 'fadeIn', 0)!;
    assert.equal('fadeIn' in clipOf(none.tl, V('s1')), false);
    assert.equal(none.note, 'fade in on the picture of s1.mp4: none');
    await valid(e.tl, 'picture fade');
  });

  // ---- dissolves
  await ok('dissolve: set on the incoming clip only, cleared, refused when it does not fit', async () => {
    const e = setDissolve(tl, V('s3'), 12)!;
    assert.equal(clipOf(e.tl, V('s3')).dissolve, 0.5);
    assert.equal(clipOf(e.tl, V('s2')).dissolve, undefined);
    assert.equal(clipOf(e.tl, A('s3a')).dissolve, undefined, 'the sound still cuts');
    assert.equal(e.note, 'dissolve of 12 f between s2.mp4 and s3.mp4');
    await valid(e.tl, 'dissolve 12 f');
    const off = setDissolve(e.tl, V('s3'), 0)!;
    assert.equal('dissolve' in clipOf(off.tl, V('s3')), false);
    assert.equal(off.note, 'no dissolve between s2.mp4 and s3.mp4');
    // s2 is 1 s (24 f): a dissolve at its head and one at its tail share it
    assert.equal(maxDissolveF(tl, V('s3')), 48);
    assert.equal(maxDissolveF(tl, V('s2')), 48);
    const both = setDissolve(setDissolve(tl, V('s2'), 24)!.tl, V('s3'), 24)!.tl;
    await valid(both, 'two dissolves sharing a 1 s shot');
    assert.equal(maxDissolveF(both, V('s3')), 24);
    assert.equal(setDissolve(both, V('s3'), 26), undefined, 'refused: would not fit');
    assert.deepEqual(dissolvePlan(both, V('s3'), 26), { fits: false, why: 'the shot before is too short' });
    assert.equal(setDissolve(tl, V('s1'), 12), undefined, 'no clip before the first');
    assert.deepEqual(dissolvePlan(tl, V('s1'), 12), { fits: false, why: 'the shots do not touch' });
  });
  await ok('dissolve: the plan says when a file has no picture past the cut (the render holds a frame)', () => {
    // s3 starts at 0 in its file: nothing before its in point
    assert.equal(dissolvePlan(tl, V('s3'), 12).holds, 'holds the first frame');
    // s2 ends at 6 s of a file 6.1 s long: 2 frames past it, a 12 f dissolve needs 6
    assert.equal(dissolvePlan(tl, V('s2'), 12, () => 10).holds, undefined);
    const short = (src: string) => (src.endsWith('s1.mp4') ? 3.1 : 10);
    assert.equal(dissolvePlan(tl, V('s2'), 12, short).holds, 'holds the last frame');
    assert.equal(dissolvePlan(tl, V('s2'), 2, short).holds, undefined);
  });
  await ok('dissolve: "cross-fade their sound too" and "cut the sound hard" on the linked sounds', async () => {
    const e = setDissolve(tl, V('s2'), 12)!.tl;
    assert.deepEqual(soundJoin(e, V('s1'), V('s2')), { left: A('s1a'), right: A('s2a') });
    const s = setSoundDissolve(e, V('s1'), V('s2'), 12)!;
    assert.equal(clipOf(s.tl, A('s2a')).dissolve, 0.5);
    assert.equal(s.note, 'the sound of s1.mp4 and s2.mp4 cross-fades over 12 f');
    await valid(s.tl, 'sound cross-fade');
    const hard = setSoundDissolve(s.tl, V('s1'), V('s2'), 0)!;
    assert.equal('dissolve' in clipOf(hard.tl, A('s2a')), false);
    assert.equal(clipOf(hard.tl, V('s2')).dissolve, 0.5, 'the picture keeps its dissolve');
    // unlinked sounds: no sound side of the join
    const un = JSON.parse(JSON.stringify(e)) as Timeline;
    un.tracks[1].clips[1].unlinked = true; un.tracks[0].clips[1].unlinked = true;
    assert.equal(soundJoin(un, V('s1'), V('s2')), undefined);
  });

  // ---- tidyDissolves after every kind of edit
  const withD = (() => { let t = setDissolve(tl, V('s2'), 24)!.tl; t = setDissolve(t, V('s3'), 24)!.tl; t = setSoundDissolve(t, V('s2'), V('s3'), 24)!.tl; return t; })();
  await valid(withD, 'the starting cut');
  await ok('tidyDissolves: nothing to do gives the same timeline back', () => {
    assert.equal(tidyDissolves(tl).tl, tl);
    assert.equal(tidyDissolves(withD).tl, withD);
  });
  const after = async (what: string, t: Timeline | undefined) => {
    assert.ok(t, `${what}: no edit`);
    const r = tidyDissolves(t);
    await valid(r.tl, what);
    return r;
  };
  await ok('tidyDissolves: a trim that makes the shared shot shorter shortens the dissolves to fit', async () => {
    const r = await after('trim', trimClip(withD, V('s2'), 'tail', -8, true)?.tl);
    assert.ok(r.said.some((x) => /shortened to \d+ f/.test(x)), r.said.join('; '));
  });
  await ok('tidyDissolves: a moved join, a slower and a faster shot, a split', async () => {
    await after('join moved later', rollEdit(withD, V('s2'), V('s3'), 12, () => 20)?.tl);
    await after('join moved earlier', rollEdit(withD, V('s1'), V('s2'), -12, () => 20)?.tl);
    const r = await after('join moved into the short shot', rollEdit(withD, V('s1'), V('s2'), 16, () => 20)?.tl);
    assert.ok(r.said.length > 0, 'the shot after it got shorter: its dissolves shortened');
    await after('faster', retimeClips(withD, [V('s2')], 2)?.tl);
    await after('slower', retimeClips(withD, [V('s2')], 0.5)?.tl);
    await after('split the shared shot', splitClip(withD, V('s2'), 2 * 24 + 6)?.tl);
    await after('split the incoming shot', splitClip(withD, V('s3'), 3 * 24 + 4)?.tl);
  });
  await ok('tidyDissolves: a delete, a move and a move to another track clear the dissolve whose join is gone', async () => {
    const del = await after('delete without closing up', deleteClip(withD, V('s2'), false)?.tl);
    assert.equal(clipOf(del.tl, V('s3')).dissolve, undefined);
    assert.ok(del.said.some((x) => x === 'dissolve at s3.mp4 dropped: its join is gone'), del.said.join('; '));
    await after('delete closing up', deleteClip(withD, V('s2'), true)?.tl);
    const mv = await after('move with a gap', moveClip(withD, V('s3'), 12, false)?.tl);
    assert.equal(clipOf(mv.tl, V('s3')).dissolve, undefined);
    const lone = JSON.parse(JSON.stringify(withD)) as Timeline;
    lone.tracks.push(track('V2', 'video', 'Over', []));
    await after('moved to another track', moveToTrack(lone, V('s3'), 'V2')?.tl);
  });
  await ok('tidyDissolves: a paste drops the copied dissolve', async () => {
    const r = pasteClip(withD, clipOf(withD, V('s3')), 'V1', 10 * 24);
    assert.equal(clipOf(r.edit!.tl, r.edit!.ref).dissolve, undefined);
    await after('paste', r.edit!.tl);
  });
  await ok('tidyDissolves: a dissolve that is too long or has no room left is shortened or dropped', async () => {
    const t = JSON.parse(JSON.stringify(withD)) as Timeline;
    clipOf(t, V('s3')).dissolve = 9;             // far more than s2 can give
    const r = await after('too long', t);
    assert.equal(clipOf(r.tl, V('s3')).dissolve, 1, 'whole frames that fit beside s2\'s own dissolve');
    const t2 = JSON.parse(JSON.stringify(t)) as Timeline;
    clipOf(t2, V('s2')).dissolve = 2;            // s2 is 1 s: its own dissolve takes it all
    const r2 = await after('no room', t2);
    assert.equal(clipOf(r2.tl, V('s3')).dissolve, undefined);
    assert.ok(r2.said.includes('dissolve at s3.mp4 dropped: no room left'), r2.said.join('; '));
  });
  await ok('tidyDissolves: every edit on every clip of a cut with dissolves everywhere stays valid', async () => {
    let t = tl;
    for (const id of ['s2', 's3']) { t = setDissolve(t, V(id), 12)!.tl; t = setSoundDissolve(t, V(id === 's2' ? 's1' : 's2'), V(id), 12)!.tl; }
    const refs = [V('s1'), V('s2'), V('s3'), A('s1a'), A('s2a'), A('s3a')];
    let k = 0;
    for (const r of refs) {
      for (const d of [-30, -6, 6, 30]) {
        for (const edge of ['head', 'tail'] as const) for (const rp of [true, false]) { await after(`trim ${r.clipId} ${edge} ${d}`, trimClip(t, r, edge, d, rp, 20)?.tl ?? t); k++; }
        await after(`move ${r.clipId} ${d}`, moveClip(t, r, d, false)?.tl ?? t); k++;
      }
      for (const sp of [0.5, 0.8, 1.25, 3]) { await after(`speed ${r.clipId} ${sp}`, retimeClips(t, [r], sp)?.tl ?? t); k++; }
      await after(`delete ${r.clipId}`, deleteClip(t, r, true)?.tl); k++;
      await after(`delete ${r.clipId} leaving a gap`, deleteClip(t, r, false)?.tl); k++;
    }
    assert.ok(k > 100);
  });

  // ---- level points
  await ok('level points: added in source seconds, moved between neighbours, removed (the field goes with the last)', async () => {
    const a = addGainPoint(tl, M, 3, 0)!;
    assert.deepEqual(clipOf(a.tl, M).gainPoints, [{ t: 3, db: 0 }]);
    assert.equal(a.note, 'level point on music.wav: −6 dB at 00:00:02:00');
    const b = addGainPoint(a.tl, M, 5, -12)!;
    assert.deepEqual(clipOf(b.tl, M).gainPoints, [{ t: 3, db: 0 }, { t: 5, db: -12 }]);
    assert.equal(b.index, 1);
    const c = addGainPoint(b.tl, M, 4, -3)!;
    assert.equal(c.index, 1, 'kept in time order');
    await valid(c.tl, 'three points');
    // moved past its neighbour: stopped just before it; level kept to -96…24
    const m = moveGainPoint(c.tl, M, 1, 9, -200)!;
    const p = clipOf(m.tl, M).gainPoints!;
    assert.ok(p[1].t < p[2].t && p[1].t > p[0].t);
    assert.equal(p[1].db, -96);
    await valid(m.tl, 'moved point');
    // the first point cannot go before the clip's in point
    assert.equal(clipOf(moveGainPoint(c.tl, M, 0, 0, 0)!.tl, M).gainPoints![0].t, 2);
    const r = removeGainPoint(c.tl, M, 1)!;
    assert.deepEqual(clipOf(r.tl, M).gainPoints, [{ t: 3, db: 0 }, { t: 5, db: -12 }]);
    assert.match(r.note, /removed$/);
    const last = removeGainPoint(a.tl, M, 0)!;
    assert.equal('gainPoints' in clipOf(last.tl, M), false);
    await valid(last.tl, 'no points');
    assert.equal(addGainPoint(tl, V('s1'), 1.5, 0), undefined, 'not on a picture');
    assert.equal(addGainPoint(a.tl, M, 3, 0), undefined, 'not twice at one time');
  });
  await ok('level points: the curve, straight in dB between points, flat outside, added to the gain', () => {
    const pts = [{ t: 3, db: 0 }, { t: 5, db: -12 }];
    assert.equal(pointsDb(pts, 1), 0);
    assert.equal(pointsDb(pts, 4), -6);
    assert.equal(pointsDb(pts, 9), -12);
    assert.equal(pointsDb(undefined, 4), 0);
    const c: TimelineClip = { ...clipOf(tl, M), gainPoints: pts };
    assert.equal(levelAt(c, 4), -12);
  });
  await ok('level points: a sped-up clip reads its points through t = in + (T − at) × speed', () => {
    const fast = retimeClips(addGainPoint(addGainPoint(tl, M, 3, 0)!.tl, M, 5, -12)!.tl, [M], 2)!.tl;
    const c = clipOf(fast, M);
    assert.equal(c.speed, 2);
    assert.equal(srcTimeAt(c, 1.5), 3, 'half a second into the clip is a second into its file');
    assert.equal(timeOfSrc(c, 5), 2.5);
    assert.equal(levelAt(c, srcTimeAt(c, 2)), -6 - 6, 'one second in: halfway between the points');
    assert.deepEqual(c.gainPoints, [{ t: 3, db: 0 }, { t: 5, db: -12 }], 'a speed change leaves the points on their sound');
  });
  await ok('level points survive a split and a trim, and stay on the same sound', async () => {
    const t = addGainPoint(addGainPoint(tl, M, 3, 0)!.tl, M, 5, -12)!.tl;
    const sp = splitClip(t, M, 3 * 24)!.tl;
    const pieces = sp.tracks[2].clips;
    assert.equal(pieces.length, 2);
    for (const p of pieces) assert.deepEqual(p.gainPoints, [{ t: 3, db: 0 }, { t: 5, db: -12 }]);
    assert.equal(levelAt(pieces[1], srcTimeAt(pieces[1], 3.5)), levelAt(clipOf(t, M), srcTimeAt(clipOf(t, M), 3.5)), 'the same level at the same moment');
    await valid(sp, 'split with points');
    const tr = trimClip(t, M, 'head', 24, false, 20)!.tl;
    assert.deepEqual(clipOf(tr, M).gainPoints, [{ t: 3, db: 0 }, { t: 5, db: -12 }]);
    await valid(tr, 'trim with points');
  });

  // ---- presses
  await ok('track presses: shown at once, one note for what changed, nothing when they cancel out', () => {
    const p = { A2: { muted: true }, V1: { locked: true } };
    const shown = withPresses(tl, p);
    assert.equal(shown.tracks[2].muted, true);
    assert.equal(shown.tracks[0].locked, true);
    assert.equal(pressWords(tl, p), 'locked V1, muted A2');
    assert.equal(withPresses(tl, { A2: { muted: false } }), tl, 'pressed back: the same timeline');
    assert.equal(pressWords(tl, { A2: { muted: false } }), '');
    assert.equal(pressWords(shown, { A2: { muted: false } }), 'unmuted A2');
  });

  // ---- the undo line
  await ok('undo line: what was undone and whose, a redo of a redo traced to its change', () => {
    const vs: TimelineVersionRef[] = [
      { version: 'v1', at: '', note: 'Built from the record', by: 'migration' },
      { version: 'v2', at: '', note: 'trimmed tail of S2 shot 3 −6 f', by: 'user' },
      { version: 'v3', at: '', note: "card text 'Crete, about 350 BC'", by: 'alma' },
      { version: 'v4', at: '', note: 'undo: back to v2', by: 'user' },
      { version: 'v5', at: '', note: 'redo: v3 again', by: 'user' },
    ];
    assert.deepEqual(undoLine('undo', vs, 'v2'), { alma: false, text: 'Undid: trimmed tail of S2 shot 3 −6 f. ⇧⌘Z brings it back.' });
    assert.deepEqual(undoLine('undo', vs, 'v3'), { alma: true, text: "Undid Alma's change: card text 'Crete, about 350 BC'. ⇧⌘Z brings it back." });
    assert.deepEqual(undoLine('undo', vs, 'v5'), { alma: true, text: "Undid Alma's change: card text 'Crete, about 350 BC'. ⇧⌘Z brings it back." });
    assert.deepEqual(undoLine('redo', vs, 'v3'), { alma: true, text: "Redid Alma's change: card text 'Crete, about 350 BC'." });
    assert.equal(undoTitle(vs, 'v3'), `card text 'Crete, about 350 BC'" (Alma's)`);
    assert.equal(undoTitle(vs, 'v2'), 'trimmed tail of S2 shot 3 −6 f" (yours)');
    assert.equal(undoLine('undo', vs, 'v9'), undefined);
  });


  // ---- stage 2: the same words on the history's steps, and the line under the header
  await ok('step words: the very strings of the undo line, the buttons\' hover, the save status', () => {
    const mine = { words: 'trimmed tail of S2 shot 3 −6 f', by: 'user' as const };
    const alma = { words: "card text 'Crete, about 350 BC'", by: 'alma' as const };
    assert.deepEqual(stepUndoLine('undo', mine), { alma: false, text: 'Undid: trimmed tail of S2 shot 3 −6 f. ⇧⌘Z brings it back.' });
    assert.deepEqual(stepUndoLine('undo', alma), { alma: true, text: "Undid Alma's change: card text 'Crete, about 350 BC'. ⇧⌘Z brings it back." });
    assert.deepEqual(stepUndoLine('redo', alma), { alma: true, text: "Redid Alma's change: card text 'Crete, about 350 BC'." });
    assert.equal(stepUndoLine('undo', undefined), undefined);
    assert.equal(stepTitle('undo', { words: 'moved subtitle line 12', by: 'user' }), 'Undo: moved subtitle line 12');
    assert.equal(stepTitle('redo', alma), "Redo Alma's change: card text 'Crete, about 350 BC'");
    assert.equal(stepTitle('undo', undefined), 'Nothing to undo');
    const now = { words: 'moved subtitle line 12', by: 'user' as const };
    const base = { newest: 'v235', edited: true, since: { version: 'v235', count: 3 }, redo: 0, now };
    assert.deepEqual(saveStatus(base), { line1: '3 edits since v235, all kept. Not saved as a version.', line2: 'Now at: moved subtitle line 12' });
    assert.equal(saveStatus({ ...base, since: { version: 'v235', count: 1 } }).line1, '1 edit since v235, kept. Not saved as a version.');
    assert.deepEqual(saveStatus({ ...base, edited: false, equals: 'v235', redo: 5 }), { line1: 'Back at v235, as saved. 5 steps to redo.', line2: 'Now at: v235, as saved' });
    assert.equal(saveStatus({ ...base, edited: false, equals: 'v236', newest: 'v236' }).line1, 'No edits since v236.');
    assert.equal(saveStatus({ ...base, equals: 'v230', redo: 2 }).line1, 'Back at v230, as saved. 2 steps to redo.');
    assert.equal(saveStatus({ ...base, saved: { version: 'v236', why: 'you', made: true, edits: 3, since: 'v235' } }).line1, 'Saved as v236.');
    assert.equal(saveStatus({ ...base, saved: { version: 'v237', why: 'render', made: true, edits: 2, since: 'v236' } }).line1, 'Saved as v237 for this render, with your 2 edits since v236.');
    assert.equal(saveStatus({ ...base, notice: 'The cut changed somewhere else. Your last edit was not kept: do it again.' }).line1, 'The cut changed somewhere else. Your last edit was not kept: do it again.');
    // stage 4 meets stage 2: the words for a step from outside the page, and for a stale step
    assert.equal(outsideStepWords({ by: 'alma', words: 'tightened the opening.' }), 'Alma changed the cut: tightened the opening. Undo takes it back.');
    assert.equal(outsideStepWords({ by: 'alma', words: 'Alma: card text fixed' }), 'Alma changed the cut: card text fixed. Undo takes it back.');
    assert.equal(outsideStepWords({ by: 'alma', words: 'Alma: card text fixed, over 3 edits not saved as a version; Undo brings them back' }), 'Alma changed the cut: card text fixed, over 3 edits not saved as a version. Undo takes it back.');
    assert.equal(outsideStepWords({ by: 'user', words: 'v12 written on disk: retimed' }), 'v12 written on disk: retimed. Undo takes it back.');
    assert.equal(outsideStepWords({ by: 'user', words: 'moved subtitle line 12' }), undefined);
    assert.equal(outsideStepWords({ by: 'alma', words: '' }), 'Alma changed the cut: a change. Undo takes it back.');
    assert.equal(staleWords([{ rev: 4, by: 'user' }, { rev: 5, by: 'alma' }], 4), "Alma's change came in first. Your last edit was not kept: do it again.");
    assert.equal(staleWords([{ rev: 4, by: 'alma' }, { rev: 5, by: 'user' }], 4), 'The cut changed somewhere else. Your last edit was not kept: do it again.');
    for (const x of [saveStatus(base), saveStatus({ ...base, edited: false, equals: 'v235', redo: 5 })]) assert.ok(!/autosave|dirty|commit|snapshot|working copy|\brev\b| — | -> |→/.test(`${x.line1} ${x.line2}`), 'plain words only');
  });

  assert.equal(JSON.stringify(tl), frozen, 'the starting cut was never changed in place');
  console.log(`ok · ${n} checks of the Edit page's controls`);
}

main().catch((e) => { console.error(e); process.exit(1); });
