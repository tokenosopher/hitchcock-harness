// npm run subs:test
// Subtitle lines in the cut (14 Nov 2026, ASKS 40), pure: the server's check of both forms (a text line, an .srt
// clip), the blade's split at a word, SRT to lines and lines back to SRT, the no-overlap rule, the film changing under
// the lines (a shot removed, trimmed, moved, sped up, swapped) and an undo. Never touches a real film.
import assert from 'node:assert/strict';
import type { Timeline, TimelineClip, TimelineTrack } from '../src/server/types';
import { deleteClip, findClip, moveClip, moveClips, pasteClips, retimeClips, sameEdit, splitClip, takeRefusal, trimClip, rollEdit, endF, startF } from '../src/components/edit/model';
import { cleanText, cuesToLines, followFilm, isLine, lineAt, linesToSrt, parseSrt, rippleChange, shownLines, splitText, srtClipCues } from '../src/components/edit/subs';
import { hasSubtitles, placeSrt, retypeLine, splitSrt } from '../src/components/edit/subsEdit';
import { filmTargetOf, validateTimeline } from '../src/server/edit/timeline';

const film = filmTargetOf('x', '/tmp/subs-test/assets/films/x', '/tmp/subs-test');
const FPS = 24;
const s = (f: number) => Math.round((f / FPS) * 1e6) / 1e6;
const shot = (id: string, at: number, len: number, src = `assets/films/x/${id.replace(/a$/, '')}.mp4`): TimelineClip => ({ id, src, in: 0, out: s(len), at: s(at) });
const line = (id: string, at: number, len: number, text: string): TimelineClip => ({ id, text, in: 0, out: s(len), at: s(at) });
const track = (id: string, kind: TimelineTrack['kind'], name: string, clips: TimelineClip[] = []): TimelineTrack => ({ id, kind, name, clips });
// three shots of 48, 48 and 72 frames; four lines: one inside s1, one over the cut of s1 and s2, one inside s2, one in s3
const base = (): Timeline => ({
  version: 'v1', fps: FPS, width: 1080, height: 1920, at: '2026-11-14T00:00:00Z', markers: [],
  tracks: [
    track('V1', 'video', 'Picture', [shot('a', 0, 48), shot('b', 48, 48), shot('c', 96, 72)]),
    track('A1', 'audio', 'Dialogue', [shot('aa', 0, 48), shot('ba', 48, 48), shot('ca', 96, 72)]),
    track('A2', 'audio', 'Effects', [{ id: 'fx', src: 'assets/films/x/fx.wav', in: 0, out: s(12), at: s(60) }]),
    track('C1', 'captions', 'Subtitles', [line('l1', 6, 30, 'Who opened\nthe door?'), line('l2', 40, 20, 'It was never locked'), line('l3', 60, 24, 'Listen'), line('l4', 110, 30, 'She is thinking now')]),
  ],
});
const C = (id: string) => ({ trackId: 'C1', clipId: id });
const V = (id: string) => ({ trackId: 'V1', clipId: id });
const lineOf = (tl: Timeline, id: string) => findClip(tl, C(id))?.clip;
const span = (tl: Timeline, id: string) => { const c = lineOf(tl, id); return c ? [startF(c, FPS), endF(c, FPS)] : undefined; };
const valid = async (tl: Timeline, what: string) => {
  const { problems } = await validateTimeline(JSON.parse(JSON.stringify(tl)), film, { files: false });
  assert.deepEqual(problems, [], `${what}: the server's check refuses the cut`);
};
const problems = async (tl: unknown) => (await validateTimeline(JSON.parse(JSON.stringify(tl)), film, { files: false })).problems;
const noOverlap = (tl: Timeline) => {
  for (const t of tl.tracks.filter((x) => x.kind === 'captions')) {
    const cs = [...t.clips].sort((a, b) => a.at - b.at);
    cs.forEach((c, i) => { if (i) assert.ok(startF(c, FPS) >= endF(cs[i - 1], FPS), `${cs[i - 1].id} overlaps ${c.id}`); });
  }
};

let n = 0;
const ok = async (what: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`ok · ${what}`); };

async function main() {
  const tl = base();
  const frozen = JSON.stringify(tl);

  // ---- the server's check
  await ok('a text line and an .srt clip both pass the check', async () => {
    await valid(tl, 'text lines');
    const t2 = base();
    t2.tracks[3].clips.push({ id: 'srt', src: 'assets/films/x/subtitles/x.srt', in: 0, out: 3, at: 10 });
    await valid(t2, 'an .srt clip beside the lines');
  });
  await ok('a captions clip with neither text nor src, or with both, is refused', async () => {
    const neither = base(); neither.tracks[3].clips = [{ id: 'z', in: 0, out: 1, at: 0 } as TimelineClip];
    assert.match((await problems(neither)).join(), /needs text .* or src/);
    const both = base(); both.tracks[3].clips = [{ id: 'z', text: 'hi', src: 'assets/films/x/a.srt', in: 0, out: 1, at: 0 }];
    assert.match((await problems(both)).join(), /either text .* or src/);
  });
  await ok('a line is not empty, has at most two rows, in 0, and no speed, gain or fades', async () => {
    const bad = (c: Partial<TimelineClip>) => { const t = base(); Object.assign(t.tracks[3].clips[0], c); return problems(t); };
    assert.match((await bad({ text: '  ' })).join(), /is empty/);
    assert.match((await bad({ text: 'one\ntwo\nthree' })).join(), /at most two rows/);
    assert.match((await bad({ text: 'one\n ' })).join(), /a row .* is empty/);
    assert.match((await bad({ in: 0.5, out: 1.5 })).join(), /in 0/);
    assert.match((await bad({ speed: 2 })).join(), /no speed/);
    assert.match((await bad({ fadeIn: 0.2 })).join(), /no fadeIn/);
    const onPicture = base(); onPicture.tracks[2].clips.push({ id: 'w', text: 'hi', in: 0, out: 1, at: 20 });
    assert.match((await problems(onPicture)).join(), /goes on a captions track/);
  });
  await ok('two lines that overlap on one track are refused', async () => {
    const t = base(); t.tracks[3].clips[1].at = s(30);
    assert.match((await problems(t)).join(), /overlaps l1/);
  });

  // ---- words
  await ok('cleanText keeps two rows at most, trims, drops empty rows', () => {
    assert.equal(cleanText('  Hello   there \n\n how  are you \n friend '), 'Hello there\nhow are you friend');
    assert.equal(cleanText(' \n '), undefined);
  });
  await ok('splitText splits at the word nearest the share asked, keeping the row break', () => {
    assert.deepEqual(splitText('It was never locked', 0.3), ['It was', 'never locked']);
    assert.deepEqual(splitText('It was never locked', 0.5), ['It was never', 'locked']);
    assert.deepEqual(splitText('It was never locked', 0.1), ['It', 'was never locked']);
    assert.deepEqual(splitText('Who opened\nthe door?', 0.6), ['Who opened', 'the door?']);
    assert.equal(splitText('Listen', 0.5), undefined);
  });

  // ---- the blade
  await ok('the blade splits a line and its words by where the cut falls', async () => {
    const e = splitClip(tl, C('l2'), 45)!;     // a quarter in
    const [l, r] = e.tl.tracks[3].clips.filter((c) => c.id === 'l2' || c.id.startsWith('l2.'));
    assert.deepEqual([l.text, startF(l, FPS), endF(l, FPS)], ['It was', 40, 45]);
    assert.deepEqual([r.text, startF(r, FPS), endF(r, FPS), r.in], ['never locked', 45, 60, 0]);
    await valid(e.tl, 'split');
    assert.equal(JSON.stringify(tl), frozen);
  });
  await ok('a one-word line is not split, and says why', () => {
    assert.equal(splitClip(tl, C('l3'), 70), undefined);
    assert.match(takeRefusal() ?? '', /one word/);
  });

  // ---- moving, trimming, the join
  await ok('a line moved onto another is refused with a reason; into a gap it moves alone', async () => {
    assert.equal(moveClip(tl, C('l3'), -24, false), undefined);
    assert.match(takeRefusal() ?? '', /two lines never overlap/);
    const e = moveClip(tl, C('l4'), 12, false)!;
    assert.deepEqual(span(e.tl, 'l4'), [122, 152]);
    assert.ok(sameEdit({ ...e.tl, tracks: e.tl.tracks.filter((t) => t.id !== 'C1') }, { ...tl, tracks: tl.tracks.filter((t) => t.id !== 'C1') }), 'nothing else moved');
    await valid(e.tl, 'moved');
  });
  await ok('a nudge of several lines stops at a line not selected', () => {
    const e = moveClips(tl, [C('l1')], 3)!;
    assert.deepEqual(span(e.tl, 'l1'), [9, 39]);
    // l2 ends at 60 where l3 starts: no room forward, so nothing moves
    assert.equal(moveClips(tl, [C('l1'), C('l2')], 10), undefined);
  });
  await ok('a head trimmed back grows the line to the start of the film; in stays 0', async () => {
    const e = trimClip(tl, C('l1'), 'head', -10, true)!;
    assert.deepEqual([span(e.tl, 'l1'), lineOf(e.tl, 'l1')!.in], [[0, 36], 0]);
    const t2 = trimClip(tl, C('l2'), 'head', 5, true)!;
    assert.deepEqual([span(t2.tl, 'l2'), lineOf(t2.tl, 'l2')!.in], [[45, 60], 0]);
    await valid(t2.tl, 'head trimmed');
    // a tail stops at the next line, and nothing ripples
    const t3 = trimClip(tl, C('l1'), 'tail', 50, true)!;
    assert.deepEqual(span(t3.tl, 'l1'), [6, 40]);
    assert.deepEqual(span(t3.tl, 'l2'), [40, 60]);
  });
  await ok('the join of two touching lines moves both ways', async () => {
    const back = rollEdit(tl, C('l2'), C('l3'), -6, () => undefined)!;
    assert.deepEqual([span(back.tl, 'l2'), span(back.tl, 'l3'), lineOf(back.tl, 'l3')!.in], [[40, 54], [54, 84], 0]);
    const on = rollEdit(tl, C('l2'), C('l3'), 6, () => undefined)!;
    assert.deepEqual([span(on.tl, 'l2'), span(on.tl, 'l3')], [[40, 66], [66, 84]]);
    await valid(back.tl, 'join');
  });
  await ok('a line pasted on a line is refused; into a gap it lands', () => {
    const c = lineOf(tl, 'l3')!;
    assert.match(pasteClips(tl, [{ clip: c, kind: 'captions', trackId: 'C1' }], 70).error ?? '', /No room on C1/);
    const p = pasteClips(tl, [{ clip: c, kind: 'captions', trackId: 'C1' }], 86).edit!;
    noOverlap(p.tl);
    assert.equal(p.tl.tracks[3].clips.length, 5);
  });
  await ok('a line deleted leaves the film and every other track as they were', () => {
    const e = deleteClip(tl, C('l3'), true)!;
    assert.equal(lineOf(e.tl, 'l3'), undefined);
    assert.deepEqual(span(e.tl, 'l4'), [110, 140]);
    assert.equal(JSON.stringify(e.tl.tracks.slice(0, 3)), JSON.stringify(tl.tracks.slice(0, 3)));
  });

  // ---- retyping
  await ok('retype: cleaned words, one version, the note names the place; empty refused', async () => {
    const e = retypeLine(tl, C('l2'), '  It was  never\nlocked  ')!;
    assert.equal(lineOf(e.tl, 'l2')!.text, 'It was never\nlocked');
    assert.equal(e.note, 'retyped the subtitle at 00:00:01:16');
    assert.equal(retypeLine(tl, C('l2'), 'It was never locked'), undefined, 'the same words: no version');
    assert.equal(retypeLine(tl, C('l2'), ' \n '), undefined);
    assert.match(takeRefusal() ?? '', /needs words/);
    await valid(e.tl, 'retyped');
  });

  // ---- the film changing under the lines
  await ok('a shot removed: lines inside it go, one over its cut is shortened, later ones move back', async () => {
    const e = deleteClip(tl, V('b'), true)!;          // 48..96 goes
    assert.deepEqual(span(e.tl, 'l1'), [6, 36]);       // before: untouched
    assert.deepEqual(span(e.tl, 'l2'), [40, 48]);      // 40..60 over the cut at 48: its end went
    assert.equal(lineOf(e.tl, 'l3'), undefined);      // 60..84 inside: gone
    assert.deepEqual(span(e.tl, 'l4'), [62, 92]);      // after: back 48
    const fx = e.tl.tracks[2].clips[0];
    assert.equal(startF(fx, FPS), 60, 'an effect inside the stretch stays, as today');
    noOverlap(e.tl);
    await valid(e.tl, 'shot removed');
  });
  await ok('a shot removed under a line that straddles its cut: shortened to what is left', () => {
    const t = base(); t.tracks[3].clips[0] = line('l1', 30, 30, 'Who opened\nthe door?');   // 30..60 over the cut at 48
    t.tracks[3].clips.splice(1, 1);                                                    // (l2 out of the way)
    const e = deleteClip(t, V('a'), true)!;           // 0..48 goes
    assert.deepEqual(span(e.tl, 'l1'), [0, 12]);       // its first 18 frames went with the shot
    const e2 = deleteClip(t, V('b'), true)!;          // 48..96 goes
    assert.deepEqual(span(e2.tl, 'l1'), [30, 48]);     // its end went
  });
  await ok('a line over a whole removed shot is shortened by the shot', () => {
    const t = base(); t.tracks[3].clips = [line('l9', 40, 64, 'Over the whole of it')];   // 40..104
    const e = deleteClip(t, V('b'), true)!;
    assert.deepEqual(span(e.tl, 'l9'), [40, 56]);
  });
  await ok('an .srt clip over a removed shot is split in two so its words stay on the lips', () => {
    const t = base(); t.tracks[3].clips = [{ id: 'srt', src: 'assets/films/x/a.srt', in: 0, out: s(168), at: 0 }];
    const e = deleteClip(t, V('b'), true)!;
    const cs = e.tl.tracks[3].clips;
    assert.deepEqual(cs.map((c) => [c.in * FPS, c.out * FPS, startF(c, FPS)].map((x) => Math.round(x))), [[0, 48, 0], [96, 168, 48]]);
  });
  await ok('a shot trimmed at its head: the frames that went take their lines; the rest stay on the lips', () => {
    const e = trimClip(tl, V('b'), 'head', 12, true)!;   // the first 12 frames of b (48..60) go
    assert.deepEqual(span(e.tl, 'l2'), [40, 48]);        // 40..60 lost 48..60
    assert.deepEqual(span(e.tl, 'l3'), [48, 72]);        // moved back 12 with the rest of b
    assert.deepEqual(span(e.tl, 'l4'), [98, 128]);
  });
  await ok('a shot trimmed at its tail: the line over the frames that went is shortened', () => {
    const e = trimClip(tl, V('b'), 'tail', -20, true)!;  // 76..96 go
    assert.deepEqual(span(e.tl, 'l3'), [60, 76]);
    assert.deepEqual(span(e.tl, 'l4'), [90, 120]);
    const grown = trimClip(tl, V('a'), 'head', 0, true);
    assert.equal(grown, undefined);
  });
  await ok('a shot moved along its track (gaps not closing): the lines stay where they are', () => {
    const e = moveClip(tl, V('c'), 24, false)!;
    assert.deepEqual(e.tl.tracks[3].clips, tl.tracks[3].clips);
  });
  await ok('a shot sped up: its lines keep their place in it, later ones move back', () => {
    const e = retimeClips(tl, [V('b')], 2)!;               // 48..96 now 48..72
    assert.deepEqual(span(e.tl, 'l2'), [40, 54]);          // 40..60 → 40..54
    assert.deepEqual(span(e.tl, 'l3'), [54, 66]);          // 60..84 → 54..66
    assert.deepEqual(span(e.tl, 'l4'), [86, 116]);
    noOverlap(e.tl);
  });
  await ok('a shot swapped for a shorter one (the takes grid): lines over what went are shortened or go', () => {
    // putShot moves what follows by the difference (rippleChange at the old end); the lines take the same change
    const t = base();
    const c1 = t.tracks.find((x) => x.id === 'C1')!;
    followFilm(c1, rippleChange(96, -30), FPS);          // b is 30 frames shorter: 66..96 went
    assert.deepEqual(c1.clips.map((c) => [c.id, startF(c, FPS), endF(c, FPS)]), [['l1', 6, 36], ['l2', 40, 60], ['l3', 60, 66], ['l4', 80, 110]]);
    const c2 = base().tracks.find((x) => x.id === 'C1')!;
    followFilm(c2, rippleChange(96, 12), FPS);           // 12 frames longer: what follows moves on
    assert.deepEqual(c2.clips.map((c) => [c.id, startF(c, FPS)]), [['l1', 6], ['l2', 40], ['l3', 60], ['l4', 122]]);
  });
  await ok('undo: the version before is the cut before, line for line', () => {
    const e = deleteClip(tl, V('b'), true)!;
    assert.ok(!sameEdit(e.tl, tl));
    assert.ok(sameEdit(JSON.parse(frozen) as Timeline, tl), 'the cut it was made on is as it was');
  });

  // ---- SRT in and out
  const SRT = '1\n00:00:01,000 --> 00:00:02,500\nWho opened\nthe door?\n\n2\n00:00:02,250 --> 00:00:04,000\n<i>Listen.</i>\n\n3\n00:00:05,000 --> 00:00:05,000\nzero\n\n4\n00:00:06,000 --> 00:00:07,000\nOne\nTwo\nThree\n';
  await ok('SRT to lines: tags out, an overlap shortens the one before, two rows at most', () => {
    const lines = cuesToLines(parseSrt(SRT), FPS, 0, (() => { let k = 0; return () => `n${++k}`; })());
    assert.deepEqual(lines.map((c) => [c.id, c.text, startF(c, FPS), endF(c, FPS)]), [
      ['n1', 'Who opened\nthe door?', 24, 54], ['n2', 'Listen.', 54, 96], ['n3', 'zero', 120, 121], ['n4', 'One\nTwo Three', 144, 168],
    ]);
  });
  await ok('lines to SRT and back give the same lines (the round trip)', () => {
    const srt = linesToSrt(tl.tracks[3].clips, FPS);
    assert.match(srt, /^1\n00:00:00,250 --> 00:00:01,500\nWho opened\nthe door\?\n/);
    const back = cuesToLines(parseSrt(srt), FPS, 0, (() => { let k = 0; return () => `l${++k}`; })());
    assert.deepEqual(back.map((c) => [c.id, c.text, c.at, c.out]), tl.tracks[3].clips.map((c) => [c.id, c.text, c.at, c.out]));
  });
  await ok('an .srt clip shows the cues of its stretch where it sits', () => {
    const cues = srtClipCues({ id: 'x', src: 'a.srt', in: 2, out: 6.5, at: 10 }, SRT);
    assert.deepEqual(cues.map((q) => [q.a, q.b]), [[10, 10.5], [10.25, 12], [14, 14.5]]);
  });
  await ok('an .srt placed: on the subtitles track, made when missing; split into lines, one version', async () => {
    const t = base(); t.tracks = t.tracks.filter((x) => x.kind !== 'captions');
    assert.equal(hasSubtitles(t), false);
    const p = placeSrt(t, { src: 'assets/films/x/subtitles/x.srt', name: 'x', seconds: 7 }, 0).edit!;
    assert.deepEqual(p.tl.tracks.map((x) => `${x.id} ${x.name}`).pop(), 'C1 Subtitles');
    assert.equal(p.note, 'added x.srt on C1 Subtitles at 00:00:00:00');
    assert.ok(hasSubtitles(p.tl));
    await valid(p.tl, 'an .srt placed');
    const sp = splitSrt(p.tl, p.ref, SRT).edit!;
    assert.equal(sp.tl.tracks.find((x) => x.id === 'C1')!.clips.length, 3, 'the cue of no length is left out');
    assert.match(sp.note, /^split x into 3 lines to edit on C1 Subtitles/);
    assert.ok(sp.tl.tracks.find((x) => x.id === 'C1')!.clips.every(isLine));
    noOverlap(sp.tl);
    await valid(sp.tl, 'split into lines');
    // a second .srt over lines goes on a track of its own
    const again = placeSrt(sp.tl, { src: 'assets/films/x/subtitles/y.srt', name: 'y', seconds: 7 }, 0).edit!;
    assert.equal(again.ref.trackId, 'C2');
    assert.equal(again.tl.tracks.find((x) => x.id === 'C2')!.name, 'Subtitles 2');
  });

  // ---- the player's line under the playhead
  await ok('the line under a frame, found by halving; none between lines; none on a muted track', () => {
    const ls = shownLines(tl);
    assert.deepEqual([5, 6, 35, 36, 40, 59, 60, 100, 139].map((f) => lineAt(ls, f)?.id ?? '-'), ['-', 'l1', 'l1', '-', 'l2', 'l2', 'l3', '-', 'l4']);
    const muted = base(); muted.tracks[3].muted = true;
    assert.equal(shownLines(muted).length, 0);
  });

  assert.equal(JSON.stringify(tl), frozen, 'nothing changed the cut it was given');
  console.log(`\n${n} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
