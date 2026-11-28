// npx tsx scripts/bookmarks-test.ts
// Bookmarks: one dropped at a frame with no name, the next and previous from a time (stopping
// at the ends), a move snapped to whole frames, a rename and a delete, an unnamed one read as "Bookmark", the flags'
// rows and labels on the ruler, and every result a cut the server's own check takes.
import assert from 'node:assert/strict';
import type { Timeline } from '../src/server/types';
import { filmTargetOf, validateTimeline } from '../src/server/edit/timeline';
import { addBookmark, deleteMarker, flagPlaces, FLAG_GAP, markerName, moveMarker, nextMarker, renameMarker, unnamed } from '../src/components/edit/bookmarks';

const base = (): Timeline => ({
  version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-26T00:00:00Z',
  tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 's1', src: 'assets/films/x/s1.mp4', in: 0, out: 20, at: 0 }] }],
  markers: [{ at: 2, text: 'hold this beat', by: 'user' }, { at: 10, text: 'To confirm: music', by: 'alma' }],
});
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; void name; };
const film = filmTargetOf('x', '/tmp/hh-bookmarks-x', '/tmp/hh-bookmarks-x');
const checks: Promise<void>[] = [];
/** The server's own check of the cut (its disk checks left out), awaited at the end. */
const valid = (tl: Timeline) => { checks.push(validateTimeline(JSON.parse(JSON.stringify(tl)), film, { files: false }).then((r) => assert.deepEqual(r.problems, [], 'the server takes the cut'))); };

const tl = base();
const frozen = JSON.stringify(tl);

t('M drops an unnamed bookmark at the frame, in time order', () => {
  const { edit, i } = addBookmark(tl, 120);
  assert.equal(i, 1);
  assert.deepEqual(edit.tl.markers[1], { at: 5, text: '', by: 'user' });
  assert.equal(edit.note, 'bookmark at 120 f');
  assert.deepEqual(edit.tl.markers.map((m) => m.at), [2, 5, 10]);
  valid(edit.tl);
  // a second one at the same frame goes after the first, and answers its own index
  const b = addBookmark(edit.tl, 120);
  assert.equal(b.i, 2);
  assert.equal(b.edit.tl.markers.length, 4);
  // with words, as "+ Marker here" makes it (the same note as before)
  const w = addBookmark(tl, 24, '  the turn ');
  assert.equal(w.edit.note, 'marker at 24 f: the turn');
  assert.equal(w.edit.tl.markers[w.i].text, 'the turn');
  // at frame 0 and never before it
  assert.equal(addBookmark(tl, -5).edit.tl.markers[0].at, 0);
});

t('next and previous from a time stop at the ends', () => {
  assert.equal(nextMarker(tl, 0, 1), 0);
  assert.equal(nextMarker(tl, 48, 1), 1, 'on a marker, next is the one after it');
  assert.equal(nextMarker(tl, 48, -1), undefined, 'on the first, there is none before');
  assert.equal(nextMarker(tl, 49, -1), 0);
  assert.equal(nextMarker(tl, 240, 1), undefined, 'on the last, there is none after (no wrap)');
  assert.equal(nextMarker(tl, 1000, -1), 1);
  assert.equal(nextMarker({ fps: 24, markers: [] }, 10, 1), undefined);
  // two at one frame: next goes to the first of them, then on past both
  const two = { fps: 24, markers: [{ at: 1, text: 'a' }, { at: 1, text: 'b' }, { at: 3, text: 'c' }] };
  assert.equal(nextMarker(two, 0, 1), 0);
  assert.equal(nextMarker(two, 24, 1), 2);
  assert.equal(nextMarker(two, 72, -1), 0);
});

t('a move snaps to whole frames and keeps the order', () => {
  const r = moveMarker(tl, 0, 300.4)!;
  assert.equal(r.edit.tl.markers[r.i].at, 12.5);
  assert.equal(r.i, 1, 'past the other one, it is second now');
  assert.match(r.edit.note, /^moved the marker “hold this beat” from 48 f to 300 f$/);
  valid(r.edit.tl);
  assert.equal(moveMarker(tl, 0, 48), undefined, 'not moved, no step');
  assert.equal(moveMarker(tl, 0, -10)!.edit.tl.markers[0].at, 0);
  assert.equal(moveMarker(tl, 7, 10), undefined, 'no such marker');
  const u = addBookmark(tl, 120);
  assert.match(moveMarker(u.edit.tl, u.i, 130)!.edit.note, /^moved a bookmark from 120 f to 130 f$/);
});

t('rename and delete; an unnamed one reads as "Bookmark"', () => {
  const u = addBookmark(tl, 120);
  const m = u.edit.tl.markers[u.i];
  assert.ok(unnamed(m));
  assert.equal(markerName(m), 'Bookmark');
  assert.equal(markerName({ at: 0, text: '   ' }), 'Bookmark');
  assert.equal(markerName(tl.markers[0]), 'hold this beat');
  const r = renameMarker(u.edit.tl, u.i, '  the   kiss ')!;
  assert.equal(r.tl.markers[u.i].text, 'the kiss');
  assert.equal(r.note, 'named the bookmark at 120 f: the kiss');
  assert.equal(renameMarker(r.tl, u.i, 'the kiss'), undefined, 'the same words, no step');
  assert.equal(renameMarker(r.tl, u.i, '')!.note, 'took the name off the marker at 120 f');
  valid(r.tl);
  const d = deleteMarker(u.edit.tl, u.i)!;
  assert.equal(d.note, 'deleted the bookmark at 120 f');
  assert.deepEqual(d.tl.markers, tl.markers);
  assert.equal(deleteMarker(tl, 0)!.note, 'deleted the marker “hold this beat” at 48 f');
  assert.equal(deleteMarker(tl, 9), undefined);
});

t('flags close together stack in two rows; names fit to the next flag or are left off', () => {
  const close = { fps: 24, markers: [{ at: 0, text: 'one' }, { at: 0.1, text: '' }, { at: 0.2, text: 'three' }, { at: 4, text: 'a long name for a moment in the film' }] };
  const p = flagPlaces(close, 2);       // 2 px a frame: frames 0, 2, 5 and 96 at 0, 4, 10 and 192 px
  assert.deepEqual(p.map((x) => x.row), [0, 1, 0, 0]);
  assert.equal(p[0].label, undefined, 'the flag at 10 px leaves no room for "one"');
  assert.equal(p[1].label, undefined, 'an unnamed flag has no label');
  assert.equal(p[2].label, 'three');
  assert.ok(p[2].labelW <= 192 - 10 - 8, 'a name stops before the next flag of its row');
  assert.equal(p[3].labelW, 120, 'at most 120 px');
  assert.ok(p.every((x, k) => k === 0 || x.row !== p[k - 1].row || x.x - p[k - 1].x >= FLAG_GAP || x.row === 0));
});

Promise.all(checks).then(() => {
  assert.equal(JSON.stringify(tl), frozen, 'the starting cut was never changed in place');
  console.log(`ok · ${n} checks of the bookmarks (${checks.length} cuts the server takes)`);
}).catch((e) => { console.error(e); process.exit(1); });
