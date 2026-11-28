// npx tsx scripts/thumb-frame-test.ts
// The user's own cover frame: what a pick of any frame writes (the exact `at`, the user's mark, Alma's
// options untouched), "Use for the other platforms too", and the cover's offset (thumbnailOffset) for a free frame as for an
// offered one. Pure: the samples of src/fixtures/release.ts, nothing on disk.
import assert from 'node:assert/strict';
import { validateRelease, type ReleaseFile } from '../src/components/release/file';
import { applyOp, parseOp, type OpResult, type ReleaseOp } from '../src/components/release/ops';
import { deriveAll } from '../src/components/release/derive';
import { frameAt, frameCount, frameOf, offsetMs, thumbOffset, timecode } from '../src/components/release/frames';
import { BOARD_NOW, coverRelease, shortsRelease, SHORTS_NOW } from '../src/fixtures/release';

let n = 0;
const ok = (c: unknown, what: string) => { n++; assert.ok(c, what); };
const eq = <T>(a: T, b: T, what: string) => { n++; assert.deepEqual(a, b, what); };
const run = (f: ReleaseFile, op: ReleaseOp, t = BOARD_NOW): OpResult => applyOp(f, op, t);
const yes = (r: OpResult, what: string): ReleaseFile => { n++; if (!r.ok) assert.fail(`${what}: refused "${r.refused}"`); assert.deepEqual(validateRelease(r.file).problems, [], `${what}: checks out`); return r.file; };
const refused = (r: OpResult, re: RegExp, what: string) => { n++; if (r.ok) assert.fail(`${what}: should be refused`); assert.match(r.refused, re, what); };
const thumb = (f: ReleaseFile, id: string) => f.platforms.find((x) => x.id === id)!.thumbnail!;
const plat = (f: ReleaseFile, id: string) => f.platforms.find((x) => x.id === id)!;
const almas = (f: ReleaseFile, id: string) => JSON.stringify(thumb(f, id).options.filter((o) => o.by !== 'user'));

// ---- 1. the frame arithmetic: a frame's name lands inside that frame, also in whole milliseconds
for (const fps of [24, 25, 30, 29.97, 60, 2]) {
  for (const k of [0, 1, 2, 7, 23, 24, 29, 30, 997, 2711]) {
    const at = frameAt(k, fps);
    eq(frameOf(at, fps), k, `${fps} fps, frame ${k}: the time names that frame`);
    eq(frameOf(offsetMs(at) / 1000, fps), k, `${fps} fps, frame ${k}: so does its offset in milliseconds`);
    ok(at * 1000 === Math.round(at * 1000) || Math.abs(at * 1000 - Math.round(at * 1000)) < 1e-6, `${fps} fps, frame ${k}: kept to the millisecond`);
  }
}
eq(frameAt(1, 30), 0.034, 'a thirtieth of a second is named 0.034 (0.033 would be the frame before)');
eq(frameCount(182, 2), 364, 'frames in a video');
eq(timecode(frameAt(996, 24), 24), '0:41.12', 'timecode with the frame in its second');
eq(timecode(61.5), '1:01.500', 'timecode without a rate');

// ---- 2. a pick of any frame: one platform (the Shorts sample)
const shorts = shortsRelease();
const before = almas(shorts, 'youtube-shorts');
const at1 = frameAt(996, 24);   // 41.5
const r1 = run(shorts, { op: 'pickFrame', platform: 'youtube-shorts', at: at1 }, SHORTS_NOW);
const s1 = yes(r1, 'pickFrame on YouTube');
const t1 = thumb(s1, 'youtube-shorts');
const mine1 = t1.options.find((o) => o.by === 'user')!;
eq(mine1, { id: 'mine', at: 41.5, does: 'your own frame', by: 'user' }, 'written: one option marked as the user\'s, at the exact time');
eq(t1.pick, 'mine', 'and it is the pick');
eq(almas(s1, 'youtube-shorts'), before, 'Alma\'s options untouched');
eq(t1.options.filter((o) => o.by === 'user').length, 1, 'one user frame');
eq(r1.ok && r1.said, 'Picked your own thumbnail at 41.5 s for YouTube Shorts', 'said');
// a second pick replaces the first; the id stays
const at2 = frameAt(1, 30);
const s2 = yes(run(s1, { op: 'pickFrame', platform: 'youtube-shorts', at: at2 }, SHORTS_NOW), 'a second free frame');
eq(thumb(s2, 'youtube-shorts').options.filter((o) => o.by === 'user'), [{ id: 'mine', at: 0.034, does: 'your own frame', by: 'user' }], 'the second replaces the first, exact');
eq(almas(s2, 'youtube-shorts'), before, 'Alma\'s options still untouched');
// back to one of Alma's: the user's frame stays as an option, not picked
const s3 = yes(run(s2, { op: 'pickThumbnail', platform: 'youtube-shorts', option: 'bottle' }, SHORTS_NOW), 'back to Alma\'s');
eq([thumb(s3, 'youtube-shorts').pick, thumb(s3, 'youtube-shorts').options.some((o) => o.id === 'mine')], ['bottle', true], 'Alma\'s picked, the user\'s frame kept to pick again');
const s4 = yes(run(s3, { op: 'pickThumbnail', platform: 'youtube-shorts', option: 'mine' }, SHORTS_NOW), 'the user\'s frame picked again as an option');
eq(thumb(s4, 'youtube-shorts').pick, 'mine', 'picked again');
// an id Alma already used
const taken = shortsRelease();
thumb(taken, 'youtube-shorts').options.push({ id: 'mine', at: 3, does: 'Alma\'s own "mine"' });
const s5 = yes(run(taken, { op: 'pickFrame', platform: 'youtube-shorts', at: 5 }, SHORTS_NOW), 'Alma used the id');
eq(thumb(s5, 'youtube-shorts').pick, 'mine-2', 'the user\'s frame under a free id');
// a time a frame of Alma's is near: never matched to hers
const near = yes(run(shorts, { op: 'pickFrame', platform: 'youtube-shorts', at: 12.042 }, SHORTS_NOW), 'one frame after Alma\'s at 12');
eq(thumb(near, 'youtube-shorts').pick, 'mine', 'a frame next to Alma\'s is the user\'s own, not hers');
// refusals and the shape
refused(run(shorts, { op: 'pickFrame', platform: 'tiktok', at: 3 }, SHORTS_NOW), /TikTok has no cover frame to pick/, 'a platform without a cover frame');
refused(run(shorts, { op: 'pickFrame', platform: 'youtube-shorts', at: -1 }, SHORTS_NOW), /0 or more/, 'a negative time');
const postedYt = shortsRelease(); plat(postedYt, 'youtube-shorts').send = { posted: { at: '2026-11-14T17:00:00.000Z' } };
refused(run(postedYt, { op: 'pickFrame', platform: 'youtube-shorts', at: 3 }, SHORTS_NOW), /locked/, 'a locked platform');
eq(parseOp({ op: 'pickFrame', platform: 'youtube-shorts', at: 41.5 }), { op: 'pickFrame', platform: 'youtube-shorts', at: 41.5 }, 'pickFrame\'s shape');
ok(typeof parseOp({ op: 'pickFrame', platform: 'youtube-shorts', at: '41.5' }) === 'string', 'at must be a number');
const badBy = shortsRelease(); (thumb(badBy, 'youtube-shorts').options[0] as { by?: string }).by = 'alma';
ok(validateRelease(badBy).problems.some((p) => p.includes('"thumbnail"')), 'the check refuses a "by" other than "user"');

// ---- 3. it spreads as a pick does, and "Use for the other platforms too"
const cover = coverRelease();   // YouTube, TikTok and Instagram with the same frames; Instagram posted (locked)
plat(cover, 'instagram-reels').send = { posted: { at: '2026-11-14T18:40:00.000Z', link: 'https://www.instagram.com/reel/C0lighthouse/' } };
const c1r = run(cover, { op: 'pickFrame', platform: 'youtube-shorts', at: 41.5 });
const c1 = yes(c1r, 'a free frame on YouTube');
eq([thumb(c1, 'youtube-shorts').pick, thumb(c1, 'tiktok').pick, thumb(c1, 'instagram-reels').pick], ['mine', 'mine', 'face'], 'TikTok takes it, Instagram (posted) keeps its frame');
eq(thumb(c1, 'tiktok').options.find((o) => o.id === 'mine'), { id: 'mine', at: 41.5, does: 'your own frame', by: 'user' }, 'on TikTok with the same time and mark');
eq(c1r.ok && c1r.said, 'Picked your own cover frame at 41.5 s for YouTube Shorts and TikTok. Instagram Reels was posted, so it keeps the frame it has.', 'said: who took it');
eq(JSON.stringify(thumb(c1, 'instagram-reels')), JSON.stringify(thumb(cover, 'instagram-reels')), 'nothing changes on the locked platform');
// TikTok keeps its own: the pick on YouTube leaves it; "Use for the other platforms too" brings it
const o1 = yes(run(cover, { op: 'thumbnailOwn', platform: 'tiktok', own: true }), 'TikTok keeps its own');
const o2 = yes(run(o1, { op: 'pickFrame', platform: 'youtube-shorts', at: 41.5 }), 'a free frame on YouTube, TikTok its own');
eq(thumb(o2, 'tiktok').pick, 'face', 'TikTok keeps its own frame');
const o3r = run(o2, { op: 'frameToOthers', platform: 'youtube-shorts' });
const o3 = yes(o3r, 'Use for the other platforms too');
eq([thumb(o3, 'tiktok').pick, thumb(o3, 'tiktok').own, thumb(o3, 'instagram-reels').pick], ['mine', undefined, 'face'], 'TikTok takes it and shares again; Instagram (posted) does not');
eq(thumb(o3, 'tiktok').options.find((o) => o.id === 'mine')?.at, 41.5, 'the same frame');
eq(o3r.ok && o3r.said, 'Your own frame is now the cover frame on YouTube Shorts and TikTok. Instagram Reels was posted, so it keeps the frame it has.', 'said, the locked one in words');
eq(almas(o3, 'tiktok'), almas(cover, 'tiktok'), 'TikTok\'s offered frames untouched');
// from a platform that keeps its own: all of them share it after
const k1 = yes(run(o1, { op: 'pickFrame', platform: 'tiktok', at: 7.25 }), 'a free frame on TikTok (its own)');
eq(thumb(k1, 'youtube-shorts').pick, 'face', 'kept on TikTok only');
const k2 = yes(run(k1, { op: 'frameToOthers', platform: 'tiktok' }), 'Use for the others, from TikTok');
eq([thumb(k2, 'youtube-shorts').pick, thumb(k2, 'tiktok').own, thumb(k2, 'youtube-shorts').options.find((o) => o.id === 'mine')?.at], ['mine', undefined, 7.25], 'YouTube takes it; TikTok shares again');
// nobody can take it
const lone = shortsRelease();
const l1 = yes(run(lone, { op: 'pickFrame', platform: 'youtube-shorts', at: 3 }, SHORTS_NOW), 'free frame on the only one');
refused(run(l1, { op: 'frameToOthers', platform: 'youtube-shorts' }, SHORTS_NOW), /No other platform has a thumbnail/, 'no other platform with one');
const allLocked = coverRelease(); plat(allLocked, 'instagram-reels').send = { posted: { at: '2026-11-14T18:40:00.000Z', link: 'https://www.instagram.com/reel/C0lighthouse/' } }; plat(allLocked, 'tiktok').send = { posted: { at: '2026-11-14T18:40:00.000Z', link: 'https://www.tiktok.com/@sample_studio/video/1/' } };
const al = yes(run(allLocked, { op: 'pickFrame', platform: 'youtube-shorts', at: 3 }), 'free frame, the others locked');
refused(run(al, { op: 'frameToOthers', platform: 'youtube-shorts' }), /No other platform can take it: TikTok (is|was) posted/, 'the others locked: said in words');
eq(parseOp({ op: 'frameToOthers', platform: 'tiktok' }), { op: 'frameToOthers', platform: 'tiktok' }, 'frameToOthers\'s shape');
// "Same as the others again" carries the user's frame with its mark
const b1 = yes(run(o2, { op: 'thumbnailOwn', platform: 'tiktok', own: false }), 'TikTok back with the others');
eq(thumb(b1, 'tiktok').options.find((o) => o.id === thumb(b1, 'tiktok').pick), { id: 'mine', at: 41.5, does: 'your own frame', by: 'user' }, 'it takes the user\'s frame, marked');
// an offered pick spread later never lands on the user's frame nearby
const nearC = yes(run(cover, { op: 'pickFrame', platform: 'tiktok', at: 12.01 }), 'a free frame by Alma\'s at 12 on TikTok');
const nearC2 = yes(run(nearC, { op: 'pickThumbnail', platform: 'youtube-shorts', option: 'face' }), 'Alma\'s "face" picked on YouTube');
eq(thumb(nearC2, 'tiktok').pick, 'face', 'TikTok takes Alma\'s frame, not the user\'s 0.01 s from it');

// ---- 4. downstream: the cover's offset, the same for a free frame as for an offered one
eq(thumbOffset(plat(c1, 'youtube-shorts')), 41500, 'free frame: 41.5 s is 41500 ms');
eq(thumbOffset(plat(cover, 'youtube-shorts')), 12000, 'offered frame: 12 s is 12000 ms');
const odd = yes(run(cover, { op: 'pickFrame', platform: 'youtube-shorts', at: frameAt(1, 30) }), 'the second frame at 30 fps');
eq(thumbOffset(plat(odd, 'youtube-shorts')), 34, 'its offset, 34 ms, is inside that frame (33.3 to 66.7 ms)');
const d = deriveAll(c1, BOARD_NOW);
eq(d.thumbnails['youtube-shorts'], { option: 'mine', at: 41.5, thumbnailOffset: 41500, by: 'user' }, 'derived: the user\'s frame and its offset');
eq(d.thumbnails['instagram-reels'], { option: 'face', at: 12, thumbnailOffset: 12000 }, 'derived: an offered frame and its offset');
eq(d.thumbnails.x, undefined, 'derived: none for a platform without a cover frame');

console.log(`thumb-frame-test: ${n} checks passed`);
