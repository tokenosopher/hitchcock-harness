// npx tsx scripts/reddit-two-test.ts
// Reddit is posted in two places every time, r/aivideo and r/aivideos, the same title and
// first comment in each. An old file with one link reads as r/aivideo posted and r/aivideos to come; each link is
// saved to its place; a link from another subreddit is refused; Reddit is posted only when both are in; a link can be
// removed. Pure: no server, nothing on disk.
import assert from 'node:assert/strict';
import { validateRelease, type ReleaseFile } from '../src/components/release/file';
import { applyOp, type OpResult, type ReleaseOp } from '../src/components/release/ops';
import { goCheck, nextUp, platformStatus, postedCount, waves } from '../src/components/release/derive';
import { anyPosted, isPosted, isPostedRaw, partlyPosted, placeForLink, placeInLink, placePosts } from '../src/components/release/places';
import { PLATFORMS } from '../src/components/release/platforms';
import { currentHand, handSteps, stepDone } from '../src/components/release/sendflow';
import { postBrief, releaseBrief } from '../src/components/edit/left';
import { boardRelease, BOARD_NOW } from '../src/fixtures/release';

let n = 0;
const ok = (c: unknown, what: string) => { n++; assert.ok(c, what); };
const eq = <T>(a: T, b: T, what: string) => { n++; assert.deepEqual(a, b, what); };
const now = BOARD_NOW;
const run = (f: ReleaseFile, op: ReleaseOp): OpResult => applyOp(f, op, now);
const yes = (r: OpResult, what: string): ReleaseFile => { n++; if (!r.ok) assert.fail(`${what}: refused "${r.refused}"`); assert.deepEqual(validateRelease(r.file).problems, [], `${what}: checks out`); return r.file; };
const no = (r: OpResult, re: RegExp, what: string) => { n++; if (r.ok) assert.fail(`${what}: should be refused`); assert.match(r.refused, re, what); };
const rd = (f: ReleaseFile) => f.platforms.find((p) => p.id === 'reddit')!;

const A = 'https://www.reddit.com/r/aivideo/comments/1y74eai/a_letter_in_a_bottle_reaches_a_lighthouse/';
const B = 'https://www.reddit.com/r/aivideos/comments/1y75abc/a_letter_in_a_bottle_reaches_a_lighthouse/';

// the two places are data on the platform
eq(PLATFORMS.reddit.places?.map((p) => [p.id, p.name, p.url]), [['aivideo', 'r/aivideo', 'https://www.reddit.com/r/aivideo/submit'], ['aivideos', 'r/aivideos', 'https://www.reddit.com/r/aivideos/submit']], 'Reddit: r/aivideo and r/aivideos, each with its address');
eq(placeInLink('reddit', A).place?.id, 'aivideo', 'a link names r/aivideo');
eq(placeInLink('reddit', 'reddit.com/r/AIVideos/comments/x').place?.id, 'aivideos', 'and r/aivideos, any case, with no https');
eq(placeInLink('reddit', 'https://redd.it/1y74eai'), {}, 'a short link names none');

// ---- 1. an old file: one link, read as r/aivideo posted and r/aivideos to come
const base = boardRelease();
const old = JSON.parse(JSON.stringify(base)) as ReleaseFile;
rd(old).send = { posted: { at: '2026-11-14T18:04:00.000Z', link: A } };   // as an older file has it
eq(validateRelease(old).problems, [], 'the old file checks out unchanged');
eq(rd(old).send.posted?.link, A, 'send.posted.link is the one link, as before');
eq(placePosts(rd(old)).map((x) => [x.place.name, !!x.posted, x.posted?.link]), [['r/aivideo', true, A], ['r/aivideos', false, undefined]], 'r/aivideo posted with that link, r/aivideos to come');
ok(!isPosted(rd(old)) && anyPosted(rd(old)), 'one of two: not posted, but something is up');
eq(partlyPosted(rd(old))?.toCome.map((x) => x.name), ['r/aivideos'], 'r/aivideos is still to come');
const st1 = platformStatus(old, 'reddit', now);
eq([st1.state, st1.word, st1.locked], ['ready', 'Posted in 1 of 2', true], 'its state: Posted in 1 of 2, still to do, the text locked');
eq(st1.tags.map((t) => t.text), ['r/aivideos to come'], 'the tag says what is to come');
eq(st1.partly, { posted: ['r/aivideo'], toCome: ['r/aivideos'] }, 'and which is which');
eq(goCheck(old, 'reddit', now), { ok: false, why: 'Reddit is posted in r/aivideo. Post it in r/aivideos by hand: follow its steps.' }, 'no go: the rest by hand');
eq(postedCount(old).n, postedCount(base).n - 1, 'not counted as posted');
eq(waves(old, now)[0].posted, 1, 'nor in its wave (YouTube only)');
eq(nextUp(old, now)?.words, 'Next: Reddit in r/aivideos, the same text.', 'Next: Reddit in r/aivideos');
ok(!isPostedRaw(rd(old)) && isPostedRaw(rd(base)), 'the raw reader agrees');
eq(releaseBrief(old)?.posted, releaseBrief(base)!.posted - 1, 'the brief counts it out');
eq(postBrief(JSON.parse(JSON.stringify(old)))?.posted, releaseBrief(base)!.posted - 1, 'and the brief read from disk');
no(run(old, { op: 'setPartText', platform: 'reddit', part: 'title', text: 'Cut.' }), /Reddit's text is locked\. Posted in r\/aivideo with this text\. r\/aivideos gets the same\./, 'the title cannot change between the two');

// ---- 2. each link saved to its place
const none = JSON.parse(JSON.stringify(base)) as ReleaseFile;
rd(none).send = {};
const b1 = yes(run(none, { op: 'pasteLink', platform: 'reddit', link: B, place: 'aivideos' }), 'the r/aivideos link in its box');
eq([rd(b1).send.posted, rd(b1).send.postedIn?.aivideos?.link], [undefined, B], 'saved as send.postedIn.aivideos; r/aivideo still empty');
eq(platformStatus(b1, 'reddit', now).tags.map((t) => t.text), ['r/aivideo to come'], 'r/aivideo to come');
const a1 = yes(run(none, { op: 'pasteLink', platform: 'reddit', link: A, place: 'aivideos' }), 'the r/aivideo link pasted in the r/aivideos box');
eq([rd(a1).send.posted?.link, rd(a1).send.postedIn], [A, undefined], 'goes in r/aivideo, where it belongs');
const a2 = yes(run(none, { op: 'pasteLink', platform: 'reddit', link: A }), 'a link pasted with no box');
eq(rd(a2).send.posted?.link, A, 'goes in the place it names');
const later = yes(run(none, { op: 'postedNoLink', platform: 'reddit', place: 'aivideos' }), 'posted in r/aivideos, link later');
eq([!!rd(later).send.postedIn?.aivideos, rd(later).send.postedIn?.aivideos?.link], [true, undefined], 'r/aivideos posted without its link');
const laterLinked = yes(run(later, { op: 'pasteLink', platform: 'reddit', link: B, place: 'aivideos' }), 'its link added later');
eq(rd(laterLinked).send.postedIn?.aivideos, { at: rd(later).send.postedIn!.aivideos.at, link: B }, 'keeps the time it was posted');

// ---- 3. a link from another subreddit is refused, in words
no(run(none, { op: 'pasteLink', platform: 'reddit', link: 'https://www.reddit.com/r/funny/comments/1/x', place: 'aivideo' }), /^That is a post in r\/funny\. Reddit goes to r\/aivideo and r\/aivideos only\.$/, 'r/funny refused');
no(run(none, { op: 'pasteLink', platform: 'reddit', link: 'https://redd.it/1y74eai' }), /does not say which of r\/aivideo and r\/aivideos/, 'a short link with no box: which one?');
yes(run(none, { op: 'pasteLink', platform: 'reddit', link: 'https://redd.it/1y74eai', place: 'aivideos' }), 'a short link in a box goes in that box');
const both0 = yes(run(old, { op: 'pasteLink', platform: 'reddit', link: B, place: 'aivideos' }), 'the second link');
no(run(both0, { op: 'pasteLink', platform: 'reddit', link: 'https://www.reddit.com/r/aivideo/comments/9/other/', place: 'aivideos' }), /^That is the r\/aivideo post, and r\/aivideo has its link already\. Paste the r\/aivideos post's link here\.$/, 'a second r/aivideo link in the r/aivideos box is refused, not swapped in');
no(run(none, { op: 'pasteLink', platform: 'tiktok', link: B } as ReleaseOp), /not a TikTok link|has not gone out/, 'a Reddit link elsewhere is still refused');
eq(placeForLink(rd(none), B, 'nowhere'), { error: 'Reddit is not posted in "nowhere".' }, 'an unknown box');

// ---- 4. posted only when both are in
const both = both0;
eq([rd(both).send.posted?.link, rd(both).send.postedIn?.aivideos?.link], [A, B], 'both links kept, each in its place');
ok(isPosted(rd(both)) && isPostedRaw(rd(both)), 'both in: posted');
const st4 = platformStatus(both, 'reddit', now);
eq([st4.state, st4.word, st4.partly], ['posted', 'Posted', undefined], 'its state: Posted');
eq(postedCount(both).n, postedCount(base).n, 'counted');
ok(nextUp(both, now)?.platform.id !== 'reddit', 'no longer next');
eq(goCheck(both, 'reddit', now), { ok: false, why: 'Reddit is already posted.' }, 'already posted');
const replaced = yes(run(both, { op: 'pasteLink', platform: 'reddit', link: 'https://www.reddit.com/r/aivideos/comments/2/new/', place: 'aivideos' }), 'r/aivideos replaced');
eq([rd(replaced).send.posted?.link, rd(replaced).send.postedIn?.aivideos?.link], [A, 'https://www.reddit.com/r/aivideos/comments/2/new/'], 'only r/aivideos changed');
no(run(both, { op: 'postedNoLink', platform: 'reddit' }), /already marked posted in r\/aivideo and r\/aivideos/, 'link later refused when both are in');

// ---- 5. removing one
const rmB = yes(run(both, { op: 'removeLink', platform: 'reddit', place: 'aivideos' }), 'take out r/aivideos');
eq([rd(rmB).send.posted?.link, rd(rmB).send.postedIn], [A, undefined], 'r/aivideo kept; postedIn gone with its last entry');
eq(platformStatus(rmB, 'reddit', now).word, 'Posted in 1 of 2', 'one of two again');
const rmA = yes(run(both, { op: 'removeLink', platform: 'reddit', place: 'aivideo' }), 'take out r/aivideo');
eq([rd(rmA).send.posted, rd(rmA).send.postedIn?.aivideos?.link], [undefined, B], 'r/aivideos kept, r/aivideo to come');
eq(platformStatus(rmA, 'reddit', now).tags.map((t) => t.text), ['r/aivideo to come'], 'r/aivideo to come');
no(run(rmB, { op: 'removeLink', platform: 'reddit', place: 'aivideos' }), /not marked posted in r\/aivideos/, 'nothing to take out');
no(run(both, { op: 'removeLink', platform: 'reddit' }), /Say which: r\/aivideo or r\/aivideos/, 'which one');

// ---- the check
{
  const bad = JSON.parse(JSON.stringify(both)) as ReleaseFile;
  (rd(bad).send.postedIn as Record<string, unknown>).aivideo = { at: now.toISOString() };
  ok(validateRelease(bad).problems.some((p) => /send.postedIn names "aivideo"/.test(p)), 'the first place is never in postedIn');
  const bad2 = JSON.parse(JSON.stringify(base)) as ReleaseFile;
  bad2.platforms.find((p) => p.id === 'tiktok')!.send.postedIn = { aivideos: { at: now.toISOString() } };
  ok(validateRelease(bad2).problems.some((p) => /TikTok: send.postedIn names "aivideos"/.test(p)), 'a platform with one post has no postedIn');
}

// ---- the steps: Alma's for r/aivideo, then the same in r/aivideos and its link
{
  const f = JSON.parse(JSON.stringify(old)) as ReleaseFile;
  rd(f).upload.hand = [{ id: 'save', text: 'Save the video', done: now.toISOString() }, { id: 'open', text: 'Open Reddit, r/aivideo, and start a video post', done: now.toISOString() },
    { id: 'copy-title', text: 'Copy the title', done: now.toISOString() }, { id: 'flair', text: 'I chose a tool flair', done: now.toISOString() },
    { id: 'copy-comment', text: 'Copy the first comment and post it straight after the post', done: now.toISOString() }, { id: 'link', text: 'Paste the post’s link' }];
  const s = handSteps(f, rd(f));
  eq(s.map((x) => `${x.id}:${x.kind}${x.place ? `@${x.place.id}` : ''}`), ['save:save', 'open:open@aivideo', 'copy-title:copy', 'flair:check', 'copy-comment:copy', 'link:link@aivideo', 'again-aivideos:again@aivideos', 'link-aivideos:link@aivideos'], 'Alma\'s steps, then r/aivideos');
  eq(s.filter((x) => x.kind === 'link').map((x) => x.text), ['Paste the r/aivideo post\'s link', 'Paste the r/aivideos post\'s link'], 'each link step names its place');
  eq(s.find((x) => x.kind === 'again')?.text, 'Post it in r/aivideos too: the same video, title and first comment', 'the step to post the same there');
  eq(currentHand(s, rd(f))?.id, 'again-aivideos', 'r/aivideo is in: the step to do now is r/aivideos');
  const t = yes(run(f, { op: 'tick', platform: 'reddit', list: 'hand', step: 'again-aivideos', done: true }), 'opening r/aivideos ticks its step');
  eq(rd(t).upload.hand.map((x) => x.id), ['save', 'open', 'copy-title', 'flair', 'copy-comment', 'link', 'again-aivideos', 'link-aivideos'], 'written into the list when ticked, Alma\'s steps as they were');
  eq(handSteps(t, rd(t)).map((x) => x.id), s.map((x) => x.id), 'and shown the same');
  eq(currentHand(handSteps(t, rd(t)), rd(t))?.id, 'link-aivideos', 'then its link');
  const t2 = yes(run(t, { op: 'pasteLink', platform: 'reddit', link: B, place: 'aivideos' }), 'its link');
  ok(handSteps(t2, rd(t2)).every((x) => stepDone(x, rd(t2))) && currentHand(handSteps(t2, rd(t2)), rd(t2)) === undefined, 'every step done');
  // a platform with one post: its steps exactly as before
  eq(handSteps(base, base.platforms[2]).map((x) => x.id), base.platforms[2].upload.hand.map((x) => x.id), 'TikTok\'s steps unchanged');
}

console.log(`ok · ${n} checks: an old one-link file reads as r/aivideo posted and r/aivideos to come; each link to its place; another subreddit refused; posted only with both; removing one; the steps`);
