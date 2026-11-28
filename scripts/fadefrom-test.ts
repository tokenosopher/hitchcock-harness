// npx tsx scripts/fadefrom-test.ts
// A sound fade from or to a level: the level at any time of a clip
// with such a fade (the one function the player, the drawing and the render's filter share), the default from the
// clip beside it at a split, "Smooth the change", Alma's head pair of level points read as the fade, the server's
// check, a split, a hear-it window, and a render of two music pieces at −13.5 and −5 dB with the change smoothed over
// 2 s, measured with ffmpeg: no jump at the split, the level rising across the 2 s, and a fade from silence unchanged.
// Synthetic film in a temp folder, deleted after; never touches a real film.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline, TimelineClip } from '../src/server/types';

const FFMPEG = process.env.HARNESS_FFMPEG || 'ffmpeg';
const root = mkdtempSync(path.join(os.tmpdir(), 'fadefrom-test-'));
const repo = path.join(root, 'repo');
const slug = 'synth';
const dir = path.join(repo, 'assets', 'films', slug);
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';
const SR = 48000;

let n = 0;
const ok = async (what: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`ok · ${what}`); };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

async function main(): Promise<void> {
  const F = await import('../src/components/edit/fades');
  const C = await import('../src/components/edit/controls');
  const Mo = await import('../src/components/edit/model');
  const T = await import('../src/server/edit/timeline');
  const H = await import('../src/components/feed/hearIt');

  // two pieces of one music file, split at 4 s: −13.5 dB, then −5 dB
  const music = (extra: Partial<TimelineClip> = {}, extraA: Partial<TimelineClip> = {}): Timeline => ({
    version: 'v1', fps: 24, width: 1080, height: 1920, at: '2026-11-25T00:00:00Z', markers: [],
    tracks: [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] },
      { id: 'M1', kind: 'audio', name: 'Music', clips: [
        { id: 'ma', src: 'media/music.wav', in: 0, out: 4, at: 0, gain: -13.5, ...extraA },
        { id: 'mb', src: 'media/music.wav', in: 4, out: 8, at: 4, gain: -5, ...extra },
      ] },
    ],
  });
  const MB = { trackId: 'M1', clipId: 'mb' }, MA = { trackId: 'M1', clipId: 'ma' };
  const clipOf = (tl: Timeline, id: string) => tl.tracks.find((t) => t.id === 'M1')!.clips.find((c) => c.id === id)!;
  const film = T.filmTargetOf('x', '/tmp/hh-fadefrom-x', '/tmp/hh-fadefrom-x');
  const valid = async (tl: Timeline) => (await T.validateTimeline(JSON.parse(JSON.stringify(tl)), film, { files: false })).problems;

  // ---- the level at time t
  await ok('the level of a fade from −13.5 into −5 dB over 2 s: −13.5 at the start, straight in dB, −5 at its end and after', () => {
    const c = clipOf(music({ fadeIn: 2, fadeInFrom: -13.5 }), 'mb');
    const lv = (pos: number) => (c.gain ?? 0) + F.fadeDb(c, pos);
    assert.ok(near(lv(0), -13.5) && near(lv(1), -9.25) && near(lv(0.5), -11.375) && near(lv(2), -5) && near(lv(3), -5), `${lv(0)} ${lv(1)} ${lv(2)}`);
    assert.equal(F.silenceFade(c, 0), 1, 'a fade from a level is not also a fade from silence');
    assert.ok(near(F.fadeFactor(c, 0), Math.pow(10, -8.5 / 20)), 'the factor at the start is the drop in dB as amplitude');
  });
  await ok('a fade from silence is as before: straight in amplitude, 0 at the start', () => {
    const c = clipOf(music({ fadeIn: 2 }), 'mb');
    assert.ok(near(F.fadeFactor(c, 0), 0) && near(F.fadeFactor(c, 1), 0.5) && near(F.fadeFactor(c, 2), 1));
    assert.deepEqual(F.fadeFilters(c, 0), [], 'no level filter for a fade from silence (afade does it, as always)');
  });
  await ok('a fade out to a level: the clip\'s level, then straight to the level at its end', () => {
    const c = clipOf(music({}, { fadeOut: 1, fadeOutTo: -5 }), 'ma');
    const lv = (pos: number) => (c.gain ?? 0) + F.fadeDb(c, pos);
    assert.ok(near(lv(2.9), -13.5) && near(lv(3.5), -9.25) && near(lv(4), -5), `${lv(3.5)} ${lv(4)}`);
  });
  await ok('the render\'s filter is the same curve: the expression evaluated in JS matches fadeDb', () => {
    const c = clipOf(music({ fadeIn: 2, fadeInFrom: -13.5, fadeOut: 1, fadeOutTo: -20 }), 'mb');
    const f = F.fadeFilters(c, 0.25);
    assert.equal(f[0], 'asetnsamples=n=480:p=0');
    const expr = /volume='pow\(10,\((.*)\)\/20\)'/.exec(f[1])![1];
    const js = (t: number) => Function('t', 'clip', `return ${expr};`)(t, (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))) as number;
    for (const pos of [0, 0.3, 1, 1.995, 2.5, 3.2, 3.6, 3.99]) {
      const t = pos + 0.25 - 0.005;   // the stream second of the block whose middle is at pos
      assert.ok(near(js(t), F.fadeDb(c, pos), 1e-4), `at ${pos}: filter ${js(t)} vs fadeDb ${F.fadeDb(c, pos)}`);
    }
  });

  // ---- the default from the neighbour
  await ok('a new fade in at a split starts from the clip before\'s level', () => {
    const e = C.setFade(music(), MB, 'fadeIn', 2)!;
    const c = clipOf(e.tl, 'mb');
    assert.equal(c.fadeIn, 2); assert.equal(c.fadeInFrom, -13.5);
    assert.match(e.note, /^fade in on the sound of .*: 48 f from −13\.5 dB$/);
  });
  await ok('a new fade out at a split ends at the next clip\'s level; dragging an existing one keeps its level', () => {
    const e = C.setFade(music(), MA, 'fadeOut', 1)!;
    assert.equal(clipOf(e.tl, 'ma').fadeOutTo, -5);
    const e2 = C.setFade(e.tl, MA, 'fadeOut', 1.5)!;
    assert.equal(clipOf(e2.tl, 'ma').fadeOutTo, -5);
    const e3 = C.setFade(e2.tl, MA, 'fadeOut', 0)!;
    assert.equal(clipOf(e3.tl, 'ma').fadeOut, undefined); assert.equal(clipOf(e3.tl, 'ma').fadeOutTo, undefined, 'the level goes with the fade');
  });
  await ok('no neighbour, the same level, or a cross-fade at the join: from silence, as today', () => {
    const alone = music(); alone.tracks[2].clips[1].at = 5;   // a gap before mb
    assert.equal(clipOf(C.setFade(alone, MB, 'fadeIn', 1)!.tl, 'mb').fadeInFrom, undefined);
    assert.equal(clipOf(C.setFade(music({ gain: -13.5 }), MB, 'fadeIn', 1)!.tl, 'mb').fadeInFrom, undefined);
    assert.equal(clipOf(C.setFade(music({ dissolve: 0.5 }), MB, 'fadeIn', 1)!.tl, 'mb').fadeInFrom, undefined);
    assert.equal(F.defaultFadeLevel(music(), 'M1', clipOf(music(), 'ma'), 'fadeIn'), undefined);
  });
  await ok('"Smooth the change": offered on the second piece only, makes a 2 s fade from −13.5, then is not offered again', async () => {
    const tl = music();
    assert.deepEqual(F.smoothOffer(tl, 'M1', clipOf(tl, 'mb')), { from: -13.5, len: 2 });
    assert.equal(F.smoothOffer(tl, 'M1', clipOf(tl, 'ma')), undefined);
    const e = C.smoothChange(tl, MB)!;
    const c = clipOf(e.tl, 'mb');
    assert.ok(c.fadeIn === 2 && c.fadeInFrom === -13.5, JSON.stringify(c));
    assert.match(e.note, /^smoothed the change into .*: fades in from −13\.5 dB over 48 f$/);
    assert.equal(F.smoothOffer(e.tl, 'M1', c), undefined);
    assert.deepEqual(await valid(e.tl), []);
  });
  await ok('the Inspector\'s "from": a level, silence, the clip before; a clip with no fade gets 2 s', () => {
    const e = C.setFadeLevel(music(), MB, 'fadeIn', -20)!;
    assert.ok(clipOf(e.tl, 'mb').fadeIn === 2 && clipOf(e.tl, 'mb').fadeInFrom === -20);
    const e2 = C.setFadeLevel(e.tl, MB, 'fadeIn', undefined)!;
    assert.ok(clipOf(e2.tl, 'mb').fadeIn === 2 && clipOf(e2.tl, 'mb').fadeInFrom === undefined);
    assert.equal(C.setFadeLevel(e2.tl, MB, 'fadeIn', undefined), undefined, 'nothing changed: no step');
  });

  // ---- Alma's head pair (a music clip's two level points, as she writes them)
  const alma: TimelineClip = { id: 'music-full-ride.mwwgnv5ne', src: 'media/music.wav', at: 56.833333, in: 51.958333, out: 56.875, gain: -5, fadeOut: 2.208333, gainPoints: [{ t: 51.958333, db: -8.5 }, { t: 53.958333, db: 0 }] };
  await ok('Alma\'s two head points read as a 2 s fade from −13.5 dB, with no points left, and the same sound', () => {
    assert.deepEqual(F.headPair(alma), { len: 2, from: -13.5 });
    const { clip, skip } = F.asFades(alma);
    assert.ok(clip.fadeIn === 2 && clip.fadeInFrom === -13.5 && clip.gainPoints === undefined && skip === 2 && clip.fadeOut === alma.fadeOut, JSON.stringify(clip));
    for (const pos of [0, 0.5, 1, 1.7, 2, 3, 4]) {
      const raw = C.levelAt(alma, C.srcTimeAt(alma, alma.at + pos)) + F.fadeDb(alma, pos);
      const as = C.levelAt(clip, C.srcTimeAt(clip, clip.at + pos)) + F.fadeDb(clip, pos);
      assert.ok(near(raw, as, 1e-3), `at ${pos}: points ${raw} vs fade ${as}`);
    }
  });
  await ok('a pair with more points after it keeps its 0 dB point as the anchor; a clip with a fade in of its own is not a pair', () => {
    const more = { ...alma, gainPoints: [...alma.gainPoints!, { t: 55, db: -3 }] };
    const { clip, skip } = F.asFades(more);
    assert.ok(skip === 1 && clip.gainPoints!.length === 2 && clip.gainPoints![0].db === 0);
    for (const pos of [0, 1, 2, 2.5, 3, 3.5]) assert.ok(near(C.levelAt(more, C.srcTimeAt(more, more.at + pos)), C.levelAt(clip, C.srcTimeAt(clip, clip.at + pos)) + F.fadeDb(clip, pos), 1e-3));
    assert.equal(F.headPair({ ...alma, fadeIn: 1 }), undefined);
    assert.equal(F.headPair({ ...alma, gainPoints: [{ t: 52.5, db: -8.5 }, { t: 53.958333, db: 0 }] }), undefined, 'the first point not at the head');
  });
  await ok('changing the fade of Alma\'s clip writes the fields and drops the pair; its "from" stays', () => {
    const tl: Timeline = { ...music(), tracks: [{ id: 'M1', kind: 'audio', name: 'Music', clips: [{ id: 'prev', src: 'media/music.wav', in: 41.541667, out: 51.958333, at: 46.416667, gain: -13.5 }, alma] }] };
    const r = { trackId: 'M1', clipId: alma.id };
    const e = C.setFade(tl, r, 'fadeIn', 1)!;
    const c = e.tl.tracks[0].clips[1];
    assert.ok(c.fadeIn === 1 && c.fadeInFrom === -13.5 && c.gainPoints === undefined, JSON.stringify(c));
    assert.equal(F.smoothOffer(tl, 'M1', alma), undefined, 'already smooth: no offer');
  });

  // ---- the server's check, a split, a hear-it window
  await ok('the server refuses a level fade on a picture clip or out of range, and takes it on a sound clip', async () => {
    assert.deepEqual(await valid(music({ fadeIn: 2, fadeInFrom: -13.5 })), []);
    assert.ok((await valid(music({ fadeIn: 2, fadeInFrom: 40 }))).some((p) => /fadeInFrom is dB/.test(p)));
    const pic = music(); pic.tracks[0].clips.push({ id: 'v', src: 'media/v.mov', in: 0, out: 1, at: 0, fadeIn: 0.5, fadeInFrom: -6 });
    assert.ok((await valid(pic)).some((p) => /fadeInFrom is dB .* on a sound clip/.test(p)));
  });
  await ok('a split leaves the fade in and its level on the first piece only, the fade out on the second only', () => {
    const tl = music({ fadeIn: 1, fadeInFrom: -13.5, fadeOut: 1, fadeOutTo: -30 });
    const s = Mo.splitClip(tl, MB, 6 * 24)!;
    const pieces = s.tl.tracks[2].clips.filter((c) => c.src === 'media/music.wav' && c.at >= 4).sort((a, b) => a.at - b.at);
    assert.equal(pieces.length, 2);
    assert.ok(pieces[0].fadeInFrom === -13.5 && pieces[0].fadeOutTo === undefined && pieces[1].fadeInFrom === undefined && pieces[1].fadeOutTo === -30, JSON.stringify(pieces));
  });
  await ok('a hear-it window that cuts into the fade starts at the fade\'s level there', () => {
    const tl = music({ fadeIn: 2, fadeInFrom: -13.5 });
    const { pieces } = H.piecesFor(tl.tracks, { id: 'x', label: 'x', at: 100, ends: 101, places: {} }, undefined, { start: 5, end: 7 });
    const p = pieces.find((x) => x.gainDb === -5)!;
    assert.ok(near(p.fadeIn, 1) && near(p.fadeInFrom!, -9.25), JSON.stringify(p));
  });

  // ---- the render, measured
  mkdirSync(path.join(dir, 'media'), { recursive: true });
  mkdirSync(path.join(dir, 'cut'), { recursive: true });
  writeFileSync(path.join(repo, 'films.txt'), `${slug}\n`);
  execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=${SR}:duration=12`, '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s16le', '-y', path.join(dir, 'media', 'music.wav')]);
  execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=480x854:r=24:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-y', path.join(dir, 'media', 'v.mov')]);
  const R = await import('../src/server/edit/render');
  const tf = await T.cutFilm(slug);
  let k = 0;
  const render = async (tl: Timeline): Promise<{ x: Float32Array; filter: string }> => {
    tl.tracks[0].clips = [{ id: 'v', src: 'media/v.mov', in: 0, out: 8, at: 0 }];
    const { timeline: t, problems } = await T.validateTimeline(JSON.parse(JSON.stringify(tl)), tf);
    assert.deepEqual(problems, []);
    const s = path.join(root, 'scratch', String(k++));
    mkdirSync(s, { recursive: true });
    const out = path.join(s, 'out.mp4');
    const g = await R.buildGraph(tf, t!, 'proxy', out, s);
    execFileSync(FFMPEG, ['-nostdin', ...g.args.filter((a) => a !== '-progress' && a !== 'pipe:1')]);
    const buf = execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-i', out, '-map', '0:a', '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    return { x: new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), filter: readFileSync(path.join(s, 'filter.txt'), 'utf8') };
  };
  const rmsDb = (x: Float32Array, a: number, b: number) => { let s = 0; const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = i0; i < i1; i++) s += x[i] * x[i]; return 10 * Math.log10(s / (i1 - i0) + 1e-20); };
  const FULL = 10 * Math.log10(0.5) + 20 * Math.log10(1 / 8);   // the RMS of ffmpeg's sine source (amplitude 1/8): −21.07 dB
  await ok('render: −13.5 then −5 dB smoothed over 2 s rises straight in dB, with no jump at the split', async () => {
    const smoothed = C.smoothChange(music(), MB)!.tl;
    const { x, filter } = await render(smoothed);
    assert.match(filter, /volume=volume='pow\(10,\(-8\.5\*\(1-clip/);
    const at = [3.5, 3.95, 4.05, 4.5, 5, 5.5, 5.95, 6.5, 7.5];
    const got = at.map((t) => rmsDb(x, t - 0.025, t + 0.025) - FULL);
    const want = at.map((t) => (t < 4 ? -13.5 : -5 + F.fadeDb(clipOf(smoothed, 'mb'), t - 4)));
    console.log(`   measured (dB): ${at.map((t, i) => `${t}s ${got[i].toFixed(2)} (want ${want[i].toFixed(2)})`).join(' · ')}`);
    got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) < 0.3, `at ${at[i]} s: ${g.toFixed(2)} dB, want ${want[i].toFixed(2)}`));
    assert.ok(Math.abs(got[2] - got[1]) < 0.5, `the split: ${got[1].toFixed(2)} → ${got[2].toFixed(2)} dB`);
    for (let i = 3; i < 7; i++) assert.ok(got[i] > got[i - 1], 'rising across the 2 s');
    const before = await render(music());
    const b1 = rmsDb(before.x, 3.925, 3.975) - FULL, b2 = rmsDb(before.x, 4.025, 4.075) - FULL;
    console.log(`   without it: ${b1.toFixed(2)} → ${b2.toFixed(2)} dB at the split (the jump the user heard)`);
    assert.ok(b2 - b1 > 8);
  });
  await ok('render: a fade from silence is unchanged (afade, no level filter), 0 at its start and half way at −6 dB', async () => {
    const { x, filter } = await render(music({ fadeIn: 2 }));
    assert.match(filter, /afade=t=in:st=0:d=2/);
    assert.doesNotMatch(filter, /volume=volume=/);
    const mid = rmsDb(x, 4.975, 5.025) - FULL, start = rmsDb(x, 4.0, 4.02) - FULL;
    console.log(`   from silence: ${start.toFixed(1)} dB in its first 20 ms, ${mid.toFixed(2)} dB at 1 s (want −11.02)`);
    assert.ok(Math.abs(mid - (-5 - 6.02)) < 0.3 && start < -30);
  });
}

main().then(() => { console.log(`${n} checks passed`); rmSync(root, { recursive: true, force: true }); }, (e) => { console.error(e); rmSync(root, { recursive: true, force: true }); process.exit(1); });
