// npm run tracks:test
// The track menu's edits (model.ts: deleteTrack, deleteEmptyTracks, moveTrack, renameTrack) on a hand-made cut:
// the order is kept within each kind, ids never change, the other tracks' clips are untouched, the main picture
// and dialogue tracks and locked tracks stay, captions are neither moved nor jumped over.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import { deleteEmptyTracks, deleteTrack, emptyTracks, mainTrackIds, moveTrack, renameTrack, whyNotDeleteTrack, whyNotMoveTrack } from '../src/components/edit/model';

const clip = (id: string, at: number, src = `assets/films/x/${id}.mp4`): TimelineClip => ({ id, src, in: 0, out: 2, at });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[] = [], extra: Partial<TimelineTrack> = {}): TimelineTrack => ({ id, kind, name, clips, ...extra });
const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z', markers: [{ at: 1, text: 'here' }],
  tracks: [
    track('V3', 'video', 'Over 2'),
    track('V2', 'video', 'Inserts', [clip('i1', 4)]),
    track('V1', 'video', 'Picture', [clip('s1', 0), clip('s2', 2)]),
    track('A1', 'audio', 'Dialogue', [clip('s1a', 0, 'assets/films/x/s1.mp4'), clip('s2a', 2, 'assets/films/x/s2.mp4')]),
    track('A2', 'audio', 'Effects', [clip('fx1', 1, 'assets/films/x/fx1.wav'), clip('fx2', 5, 'assets/films/x/fx2.wav'), clip('fx3', 8, 'assets/films/x/fx3.wav')]),
    track('C1', 'captions', 'Captions', [{ id: 'cap1', src: 'assets/films/x/a.srt', in: 0, out: 10, at: 0 }], { muted: true }),
    track('A3', 'audio', 'Music'),
    track('A4', 'audio', 'Audio'),
    track('A5', 'audio', 'Locked empty', [], { locked: true }),
  ],
} as Timeline);

const ids = (tl: Timeline) => tl.tracks.map((t) => t.id).join(' ');
const clipsOf = (tl: Timeline, id: string) => JSON.stringify(tl.tracks.find((t) => t.id === id)?.clips);
let n = 0;
const ok = (what: string, f: () => void) => { f(); n++; console.log(`ok · ${what}`); };

const tl = base();
const frozen = JSON.stringify(tl);

ok('main tracks are V1 and A1', () => assert.deepEqual([...mainTrackIds(tl)].sort(), ['A1', 'V1']));

ok('delete a track with clips: gone, note counts them, the rest untouched', () => {
  const e = deleteTrack(tl, 'A2')!;
  assert.equal(e.note, 'deleted track A2 Effects (3 clips)');
  assert.equal(ids(e.tl), 'V3 V2 V1 A1 C1 A3 A4 A5');
  for (const id of ['V3', 'V2', 'V1', 'A1', 'C1', 'A3', 'A4', 'A5']) assert.equal(clipsOf(e.tl, id), clipsOf(tl, id), id);
  assert.deepEqual(e.tl.markers, tl.markers);
});
ok('delete an empty track: its own note', () => assert.equal(deleteTrack(tl, 'A4')!.note, 'deleted empty track A4 Audio'));
ok('one clip is "1 clip"', () => assert.equal(deleteTrack(tl, 'V2')!.note, 'deleted track V2 Inserts (1 clip)'));
ok('V1, A1 and a locked track are not deleted', () => {
  assert.equal(deleteTrack(tl, 'V1'), undefined); assert.equal(whyNotDeleteTrack(tl, 'V1'), 'the main picture');
  assert.equal(deleteTrack(tl, 'A1'), undefined); assert.equal(whyNotDeleteTrack(tl, 'A1'), 'the dialogue track');
  assert.equal(deleteTrack(tl, 'A5'), undefined); assert.equal(whyNotDeleteTrack(tl, 'A5'), 'locked');
  assert.equal(deleteTrack(tl, 'Z9'), undefined);
});
ok('without V1 the first video track is the main picture', () => {
  const t2 = { ...tl, tracks: tl.tracks.filter((t) => t.id !== 'V1') };
  assert.equal(whyNotDeleteTrack(t2, 'V3'), 'the main picture');
  assert.equal(whyNotMoveTrack(t2, 'V2', -1), 'the main picture stays first');
});

ok('delete empty tracks: every empty one but the main and locked ones, in one note', () => {
  assert.deepEqual(emptyTracks(tl).map((t) => t.id), ['V3', 'A3', 'A4']);
  const e = deleteEmptyTracks(tl)!;
  assert.equal(e.note, 'deleted 3 empty tracks: V3 Over 2, A3 Music, A4 Audio');
  assert.equal(ids(e.tl), 'V2 V1 A1 A2 C1 A5');
  for (const t of e.tl.tracks) assert.equal(clipsOf(e.tl, t.id), clipsOf(tl, t.id), t.id);
  assert.equal(deleteEmptyTracks(e.tl), undefined);
  const one = deleteEmptyTracks({ ...tl, tracks: tl.tracks.filter((t) => t.id !== 'V3' && t.id !== 'A4') })!;
  assert.equal(one.note, 'deleted empty track A3 Music');
  // an empty V1 or A1 stays
  const bare = { ...tl, tracks: [track('V1', 'video', 'Picture'), track('A1', 'audio', 'Dialogue'), track('A2', 'audio', 'x')] } as Timeline;
  assert.equal(ids(deleteEmptyTracks(bare)!.tl), 'V1 A1');
});

ok('move: swaps with the neighbour of its kind, ids and clips unchanged', () => {
  const up = moveTrack(tl, 'V2', -1)!;
  assert.equal(up.note, 'moved track V2 Inserts up');
  assert.equal(ids(up.tl), 'V2 V3 V1 A1 A2 C1 A3 A4 A5');
  for (const t of tl.tracks) assert.equal(JSON.stringify(up.tl.tracks.find((x) => x.id === t.id)), JSON.stringify(t), t.id);
  const back = moveTrack(up.tl, 'V2', 1)!;
  assert.equal(ids(back.tl), ids(tl));
  assert.equal(moveTrack(tl, 'A4', 1)!.note, 'moved track A4 Audio down');
  assert.equal(ids(moveTrack(tl, 'A4', 1)!.tl), 'V3 V2 V1 A1 A2 C1 A3 A5 A4');
});
ok('move: V1 may move up (its id keeps it under V2), the main track may change rows', () => {
  assert.equal(ids(moveTrack(tl, 'V1', -1)!.tl), 'V3 V1 V2 A1 A2 C1 A3 A4 A5');
});
ok('move: never past the edge of its kind', () => {
  assert.equal(moveTrack(tl, 'V3', -1), undefined); assert.equal(whyNotMoveTrack(tl, 'V3', -1), 'top of the picture tracks');
  assert.equal(moveTrack(tl, 'V1', 1), undefined); assert.equal(whyNotMoveTrack(tl, 'V1', 1), 'bottom of the picture tracks');
  assert.equal(moveTrack(tl, 'A1', -1), undefined); assert.equal(whyNotMoveTrack(tl, 'A1', -1), 'top of the sound tracks');
  assert.equal(moveTrack(tl, 'A5', 1), undefined); assert.equal(whyNotMoveTrack(tl, 'A5', 1), 'bottom of the sound tracks');
});
ok('move: captions are not moved and not jumped over', () => {
  assert.equal(moveTrack(tl, 'C1', -1), undefined); assert.equal(whyNotMoveTrack(tl, 'C1', 1), 'captions stay put');
  assert.equal(moveTrack(tl, 'A2', 1), undefined); assert.equal(whyNotMoveTrack(tl, 'A2', 1), 'captions below');
  assert.equal(moveTrack(tl, 'A3', -1), undefined); assert.equal(whyNotMoveTrack(tl, 'A3', -1), 'captions above');
});
ok('move: a locked track still changes rows (its clips stay as they are)', () => assert.ok(moveTrack(tl, 'A5', -1)));

ok('rename: the name only, the id stays', () => {
  const e = renameTrack(tl, 'A4', '  Wind  ')!;
  assert.equal(e.note, 'renamed track A4: Audio → Wind');
  assert.equal(e.tl.tracks.find((t) => t.id === 'A4')!.name, 'Wind');
  assert.equal(ids(e.tl), ids(tl));
  assert.equal(renameTrack(tl, 'A4', 'Audio'), undefined);
  assert.equal(renameTrack(tl, 'A4', '   '), undefined);
});

ok('the timeline given is never changed', () => assert.equal(JSON.stringify(tl), frozen));
console.log(`\n${n} checks passed`);
