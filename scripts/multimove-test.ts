// npx tsx scripts/multimove-test.ts
// Several selected clips dragged onto another track at once, not one by one. The pure rule, planTrackMove and moveClipsToTracks:
// four dialogue sounds go two sound tracks down at their times; a picture and its sound both selected move the sound
// only; a selection on two tracks moves each by the same N; a clip with no track of its kind N away, a clip in the way
// or a locked track refuses the whole move with a plain reason; a pair kept by `link` moved in time takes its picture
// along by as many frames. One line per check.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import { findClip, moveClipsToTracks, partnerOf, planTrackMove, startF, takeRefusal, type ClipRef } from '../src/components/edit/model';

const F = 'assets/films/x';
const clip = (id: string, src: string, at: number, inn: number, out: number, extra: Partial<TimelineClip> = {}): TimelineClip => ({ id, src: `${F}/${src}`, in: inn, out, at, ...extra });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[]): TimelineTrack => ({ id, kind, name, clips });
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-26T00:00:00Z', markers: [],
  tracks: [
    track('V2', 'video', 'Inserts', [clip('x', 'x.mp4', 10, 0, 1, { link: 'L1' })]),
    track('V1', 'video', 'Picture', [clip('s1', 's1.mp4', 0, 0, 2), clip('s2', 's2.mp4', 2, 0, 2), clip('s3', 's3.mp4', 4, 0, 2), clip('s4', 's4.mp4', 6, 0, 2)]),
    track('A1', 'audio', 'Dialogue', [clip('s1a', 's1.mp4', 0, 0, 2), clip('s2a', 's2.mp4', 2, 0, 2), clip('s3a', 's3.mp4', 4, 0, 2), clip('s4a', 's4.mp4', 6, 0, 2), clip('xa', 'x.mp4', 10, 0, 1, { link: 'L1' })]),
    track('A2', 'audio', 'Music', [clip('m1', 'm1.wav', 0, 0, 1)]),
    track('A3', 'audio', 'Dialogue 3', [clip('d3', 'd3.wav', 20, 0, 1)]),
    track('C1', 'captions', 'Subtitles', [clip('t1', '', 0, 0, 1, { text: 'hi' })]),
  ],
} as Timeline);
const R = (trackId: string, clipId: string): ClipRef => ({ trackId, clipId });
const where = (tl: Timeline, id: string) => { const t = tl.tracks.find((x) => x.clips.some((k) => k.id === id))!; return `${t.id}@${startF(t.clips.find((k) => k.id === id)!, tl.fps)}`; };
const same = (a: Timeline, b: Timeline) => assert.equal(JSON.stringify(a.tracks), JSON.stringify(b.tracks));
const four = [R('A1', 's1a'), R('A1', 's2a'), R('A1', 's3a'), R('A1', 's4a')];

let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

ok('four dialogue sounds dragged two tracks down: all on A3 at their times, pictures stay, one edit', () => {
  const tl = base();
  const e = moveClipsToTracks(tl, four, four[0], 'A3')!;
  assert.ok(e, takeRefusal());
  for (const [id, f] of [['s1a', 0], ['s2a', 48], ['s3a', 96], ['s4a', 144]] as const) assert.equal(where(e.tl, id), `A3@${f}`);
  for (const id of ['s1', 's2', 's3', 's4']) assert.equal(where(e.tl, id), where(tl, id));
  assert.match(e.note, /^moved 4 clips from A1 Dialogue to A3 Dialogue 3, same time/);
});

ok('dragged sideways too: every clip by the same frames, gaps kept; held at frame 0 for the group', () => {
  const tl = base();
  const e = moveClipsToTracks(tl, four, four[1], 'A3', 12)!;
  assert.deepEqual(['s1a', 's2a', 's3a', 's4a'].map((id) => where(e.tl, id)), ['A3@12', 'A3@60', 'A3@108', 'A3@156']);
  assert.equal(planTrackMove(tl, four, four[1], 'A3', -30).d, 0);
});

ok('a picture and its sound both selected (a box over both rows): the sound goes, the picture stays', () => {
  const tl = base();
  const refs = [R('V1', 's1'), R('A1', 's1a'), R('V1', 's2'), R('A1', 's2a')];
  const p = planTrackMove(tl, refs, R('A1', 's1a'), 'A3');
  assert.equal(p.why, undefined);
  assert.deepEqual(p.moves.map((m) => m.ref.clipId).sort(), ['s1a', 's2a']);
  // pictures alone selected, one's sound in hand: the sounds of both go (the selection draws each pair as one)
  const q = planTrackMove(tl, [R('V1', 's3'), R('V1', 's4')], R('A1', 's4a'), 'A3');
  assert.deepEqual(q.moves.map((m) => `${m.ref.clipId}>${m.to}`).sort(), ['s3a>A3', 's4a>A3']);
});

ok('a selection on two sound tracks one down: each goes one sound track down', () => {
  const tl = base();
  const refs = [R('A1', 's3a'), R('A2', 'm1')];
  const e = moveClipsToTracks(tl, refs, refs[0], 'A2')!;
  assert.ok(e, takeRefusal());
  assert.equal(where(e.tl, 's3a'), 'A2@96'); assert.equal(where(e.tl, 'm1'), 'A3@0');
});

ok('no track of its kind N away: refused with the reason, nothing moved', () => {
  const tl = base();
  const refs = [R('A1', 's3a'), R('A3', 'd3')];
  assert.equal(moveClipsToTracks(tl, refs, refs[0], 'A2'), undefined);
  assert.match(takeRefusal() ?? '', /has no sound track 1 below A3 Dialogue 3: nothing moved/);
  same(tl, base());
});

ok('a clip in the way on the target track: refused, all or nothing, the clip named', () => {
  const tl = base();
  assert.equal(moveClipsToTracks(tl, four, four[0], 'A2'), undefined);
  assert.match(takeRefusal() ?? '', /^m1\.wav on A2 Music is in the way of s1\.mp4: nothing moved\.$/);
});

ok('clips leaving the target track are not in the way', () => {
  const tl = base();
  const refs = [R('A1', 's1a'), R('A2', 'm1')];
  assert.equal(planTrackMove(tl, refs, refs[0], 'A2').why, undefined);
});

ok('a locked target refuses', () => {
  const tl = base();
  tl.tracks.find((t) => t.id === 'A3')!.locked = true;
  assert.equal(moveClipsToTracks(tl, four, four[0], 'A3'), undefined);
  assert.match(takeRefusal() ?? '', /A3 Dialogue 3 is locked/);
});

ok('a sound kept by link moved in time takes its picture along on its own track, the link kept', () => {
  const tl = base();
  const refs = [R('A1', 'xa'), R('A1', 's4a')];
  const same0 = moveClipsToTracks(tl, refs, refs[0], 'A3')!;
  assert.equal(where(same0.tl, 'x'), 'V2@240');
  const e = moveClipsToTracks(tl, refs, refs[0], 'A3', 24)!;
  assert.equal(where(e.tl, 'xa'), 'A3@264'); assert.equal(where(e.tl, 'x'), 'V2@264');
  assert.deepEqual(partnerOf(e.tl, R('A3', 'xa')), R('V2', 'x'));
  assert.equal(findClip(e.tl, R('A3', 'xa'))!.clip.link, 'L1');
});

console.log(`${n} checks passed`);
