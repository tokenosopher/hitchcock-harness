// npm run files:test
// The film's files put on the timeline by hand (src/server/edit/files.ts, src/components/edit/placeFile.ts), on a
// tiny fake film built in a temp folder with ffmpeg (sine tones, test patterns, a picture whose brightness steps at
// 2 s) and deleted after. Checks the listing (groups, lengths, what is left out, links, an attached file), the copy
// of an attached file into the film (its own name, a number when the name is taken by other bytes, the same file
// reused, never an overwrite, names and links that try to leave refused), the frame at a point of the timeline
// (time in the file, speed, the clip on top, mirror, full size), and the placing and swapping on the timeline.
// One line per check; exits non-zero on the first failure. Never touches a real film.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline } from '../src/server/types';

const FFMPEG = process.env.HARNESS_FFMPEG || 'ffmpeg';
const root = mkdtempSync(path.join(os.tmpdir(), 'files-test-'));
const repo = path.join(root, 'repo');
const slug = 'fake';
const dir = path.join(repo, 'assets', 'films', slug);
const harness = path.join(root, 'harness');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = harness;
process.env.HARNESS_NO_CUT_WATCH = '1';

let checks = 0;
function check(what: string, ok: boolean, got: string): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what} · ${got}`);
  if (!ok) throw new Error(`failed: ${what}`);
}
const ff = (args: string[]): Buffer => execFileSync(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', ...args], { maxBuffer: 1 << 28 });
const put = (rel: string): string => { const p = path.join(dir, rel); mkdirSync(path.dirname(p), { recursive: true }); return p; };
const tone = (p: string, secs: number, hz = 440) => ff(['-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${secs}`, '-y', p]);
const video = (p: string, src: string, secs: number, sound: boolean, vf?: string) => ff([
  '-f', 'lavfi', '-i', `${src}${src.includes('=') ? ':' : '='}s=160x284:r=24:d=${secs}`, ...(sound ? ['-f', 'lavfi', '-i', `sine=frequency=660:duration=${secs}`] : []),
  ...(vf ? ['-vf', vf] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '1', ...(sound ? ['-c:a', 'aac', '-shortest'] : []), '-y', p]);

function build(): void {
  tone(put('audio/sfx/boom/boom-try1.wav'), 1.5);
  tone(put('audio/sfx/boom/boom-try2.wav'), 2.25);
  tone(put('audio/music/theme.mp3'), 5);
  tone(put('voices/names/island.wav'), 0.75);
  tone(put('cast/C01-ana/voice/ana-line1.wav'), 1);
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x32', '-frames:v', '1', '-y', put('cast/C01-ana/pick-face.png')]);
  video(put('edits/island-card/island-card-480x854.mp4'), 'testsrc2', 2, true);
  ff(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32', '-frames:v', '1', '-y', put('edits/still.png')]);
  video(put('cut/cards/title.mp4'), 'color=c=gray', 1.5, false);
  video(put('cut/renders/v1-proxy.mp4'), 'color=c=black', 1, true);
  tone(put('cut/renders/v1.mix.wav'), 1);
  video(put('generations/S1/takes/take1/S1-take1-480p.mp4'), 'testsrc2', 1, true);
  tone(put('review/site.nosync/a.wav'), 1);
  tone(put('social/teaser.mp3'), 1);
  tone(put('audio/.hidden.wav'), 1);
  tone(put('audio/tmp.nosync/z.wav'), 1);
  // a link out of the film (not followed) and one inside it (followed, the same file listed once)
  mkdirSync(path.join(root, 'outside'), { recursive: true });
  tone(path.join(root, 'outside', 'secret.wav'), 1);
  symlinkSync(path.join(root, 'outside'), path.join(dir, 'audio', 'outside-link'));
  symlinkSync(path.join(dir, 'voices', 'names'), path.join(dir, 'audio', 'names-link'));
  // the picture for the frame checks: dark grey for 2 s then light grey; and one black on the left half
  video(put('media/step.mp4'), 'color=c=black', 5, false, "geq=lum='if(lt(T,2),60,200)':cb=128:cr=128");
  video(put('media/half.mp4'), 'color=c=white', 3, false, 'drawbox=x=0:y=0:w=80:h=284:color=black:t=fill');
  // the chat's uploads for this film
  const up = path.join(harness, 'uploads', slug);
  mkdirSync(up, { recursive: true });
  tone(path.join(up, '20261113-101500-rain-loop.wav'), 3, 300);
  tone(path.join(up, '20261113-111500-rain-loop.wav'), 2, 900);     // the same name, other bytes
  video(path.join(up, '20261113-121500-street.mp4'), 'testsrc2', 1, true);
  writeFileSync(path.join(up, '20261113-131500-notes.txt'), 'not for the timeline');
  symlinkSync(path.join(root, 'outside', 'secret.wav'), path.join(up, '20261113-141500-evil.wav'));
}

/** The mean brightness of a PNG (scaled to 8×8 grey), and of its left and right halves. */
function bright(png: Buffer): { all: number; left: number; right: number } {
  const f = path.join(root, 'frame.png');
  writeFileSync(f, png);
  const raw = ff(['-i', f, '-vf', 'scale=8:8:flags=area', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  let all = 0, left = 0, right = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = raw[y * 8 + x]; all += v; if (x < 3) left += v; if (x > 4) right += v; }
  return { all: all / 64, left: left / 24, right: right / 24 };
}
const pngSize = (png: Buffer) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });

async function main(): Promise<void> {
  build();
  const T = await import('../src/server/edit/timeline');
  const F = await import('../src/server/edit/files');
  const P = await import('../src/components/edit/placeFile');
  const M = await import('../src/components/edit/model');
  const film = T.filmTargetOf(slug, dir, repo);
  const A = `assets/films/${slug}`;

  // ---- the listing
  const list = await F.filmFiles(film, { budgetMs: 20000 });
  const by = new Map(list.files.map((f) => [f.upload ? `upload:${f.upload}` : f.src, f]));
  const has = (src: string) => by.has(src);
  check('nothing waits once measured', list.waiting === 0, `waiting ${list.waiting}`);
  for (const s of ['audio/sfx/boom/boom-try1.wav', 'audio/sfx/boom/boom-try2.wav', 'audio/music/theme.mp3', 'voices/names/island.wav', 'cast/C01-ana/voice/ana-line1.wav', 'edits/island-card/island-card-480x854.mp4', 'cut/cards/title.mp4']) {
    check(`listed: ${s}`, has(`${A}/${s}`), by.get(`${A}/${s}`)?.group ?? 'missing');
  }
  for (const s of ['cast/C01-ana/pick-face.png', 'edits/still.png', 'cut/renders/v1-proxy.mp4', 'cut/renders/v1.mix.wav', 'generations/S1/takes/take1/S1-take1-480p.mp4', 'review/site.nosync/a.wav', 'social/teaser.mp3', 'audio/.hidden.wav', 'audio/tmp.nosync/z.wav', 'audio/outside-link/secret.wav']) {
    check(`left out: ${s}`, !has(`${A}/${s}`), has(`${A}/${s}`) ? 'listed' : 'not listed');
  }
  check('a link inside the film is followed, the same file listed once', list.files.filter((f) => f.name === 'island').length === 1, list.files.filter((f) => f.name === 'island').map((f) => f.src).join(', '));
  check('nothing from outside the film through a link', !list.files.some((f) => f.name === 'secret'), list.files.map((f) => f.name).join(','));
  const boom = by.get(`${A}/audio/sfx/boom/boom-try2.wav`)!;
  check('a sound: kind, group, length', boom.kind === 'sound' && boom.group === 'audio/sfx/boom' && Math.abs((boom.seconds ?? 0) - 2.25) < 0.03, `${boom.kind} · ${boom.group} · ${boom.seconds}`);
  const card = by.get(`${A}/edits/island-card/island-card-480x854.mp4`)!;
  check('a made picture: kind, its sound, size, length', card.kind === 'picture' && card.audio === true && card.width === 160 && card.height === 284 && Math.abs((card.seconds ?? 0) - 2) < 0.05, `${card.kind} · audio ${card.audio} · ${card.width}×${card.height} · ${card.seconds}`);
  const title = by.get(`${A}/cut/cards/title.mp4`)!;
  check('a title card without sound', title.kind === 'picture' && title.audio === false && title.group === 'cut/cards', `${title.group} · audio ${title.audio}`);
  const rain = by.get('upload:20261113-101500-rain-loop.wav');
  check('an attached file: listed with its plain name and where it will go', !!rain && rain.group === F.ATTACHED && rain.name === 'rain-loop' && rain.src === `${A}/audio/added/rain-loop.wav` && Math.abs((rain.seconds ?? 0) - 3) < 0.03, rain ? `${rain.name} · ${rain.src} · ${rain.seconds}` : 'missing');
  check('an attached video is a picture', by.get('upload:20261113-121500-street.mp4')?.kind === 'picture', String(by.get('upload:20261113-121500-street.mp4')?.kind));
  check('an attached text file and a link out are left out', !by.has('upload:20261113-131500-notes.txt') && !by.has('upload:20261113-141500-evil.wav'), 'not listed');
  const again = await F.filmFiles(film, { budgetMs: 0 });
  check('the lengths are kept: a second listing measures nothing', again.waiting === 0 && again.files.length === list.files.length, `${again.files.length} files, waiting ${again.waiting}`);

  // ---- an attached file into the film
  const read = (src: string) => readFileSync(path.join(repo, src));
  const upFile = (n: string) => readFileSync(path.join(harness, 'uploads', slug, n));
  const a1 = await F.adoptUpload(film, '20261113-101500-rain-loop.wav');
  check('copied into audio/added under its own name', a1.src === `${A}/audio/added/rain-loop.wav` && !a1.reused && read(a1.src).equals(upFile('20261113-101500-rain-loop.wav')), `${a1.src} · reused ${a1.reused}`);
  const a2 = await F.adoptUpload(film, '20261113-101500-rain-loop.wav');
  check('the same bytes already there are reused', a2.src === a1.src && a2.reused, `${a2.src} · reused ${a2.reused}`);
  const a3 = await F.adoptUpload(film, '20261113-111500-rain-loop.wav');
  check('a name taken by other bytes gets a number', a3.src === `${A}/audio/added/rain-loop-2.wav` && !a3.reused && read(a3.src).equals(upFile('20261113-111500-rain-loop.wav')), a3.src);
  check('the first file is untouched (never an overwrite)', read(a1.src).equals(upFile('20261113-101500-rain-loop.wav')), 'same bytes as its upload');
  const a4 = await F.adoptUpload(film, '20261113-121500-street.mp4');
  check('a video goes into edits/added', a4.src === `${A}/edits/added/street.mp4`, a4.src);
  for (const bad of ['../../outside/secret.wav', '..%2Fsecret.wav', 'a/b.wav', '/etc/hosts', '20261113-141500-evil.wav', '20261113-131500-notes.txt', 'missing.wav', '']) {
    let why = '';
    try { await F.adoptUpload(film, bad); } catch (e) { why = e instanceof Error ? e.message : String(e); }
    check(`refused: "${bad}"`, !!why, why || 'copied!');
  }
  check('nothing copied out of the refusals', !existsSync(path.join(dir, 'audio', 'added', 'secret.wav')) && !existsSync(path.join(dir, 'audio', 'added', 'evil.wav')), 'audio/added has no secret or evil');
  const log = readFileSync(path.join(harness, 'writes.log'), 'utf8').trim().split('\n');
  check('each copy is one line of writes.log', log.filter((l) => /\tcopy\t/.test(l)).length === 3 && log.some((l) => l.includes(`${A}/audio/added/rain-loop-2.wav`)), `${log.length} lines`);
  // a film whose audio/ leads out of it: nothing is copied there
  const dir2 = path.join(repo, 'assets', 'films', 'fake2');
  mkdirSync(dir2, { recursive: true });
  symlinkSync(path.join(root, 'outside'), path.join(dir2, 'audio'));
  mkdirSync(path.join(harness, 'uploads', 'fake2'), { recursive: true });
  tone(path.join(harness, 'uploads', 'fake2', '20261113-101500-x.wav'), 1);
  let out = '';
  try { await F.adoptUpload(T.filmTargetOf('fake2', dir2, repo), '20261113-101500-x.wav'); } catch (e) { out = e instanceof Error ? e.message : String(e); }
  check('refused: a destination folder that leads out of the film', !!out && !existsSync(path.join(root, 'outside', 'added')), out || 'copied!');

  // ---- the frame at a point of the timeline
  const clip = (id: string, src: string, inn: number, o: number, at: number, extra: object = {}) => ({ id, src: `${A}/${src}`, in: inn, out: o, at, ...extra });
  const tl: Timeline = {
    version: 'v3', fps: 24, width: 160, height: 284, at: '2026-11-14T00:00:00.000Z', markers: [],
    tracks: [
      { id: 'V2', kind: 'video', name: 'Inserts', clips: [clip('h1', 'media/half.mp4', 0, 1, 4), clip('h2', 'media/half.mp4', 0, 1, 5, { flip: 'h' })] },
      { id: 'V1', kind: 'video', name: 'Picture', clips: [clip('s1', 'media/step.mp4', 1, 3, 0), clip('s2', 'media/step.mp4', 0, 4, 2, { speed: 2 })] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] },
    ],
  };
  const fr = async (f: number) => (await F.frameAt(film, tl, f));
  const b23 = bright((await fr(23)).png).all, b24 = bright((await fr(24)).png).all;
  check('the frame just before 2 s of the file is the dark one (in 1 s, frame 23)', b23 < 90, `brightness ${b23.toFixed(0)}`);
  check('the frame at 2 s of the file is the light one (frame 24)', b24 > 170, `brightness ${b24.toFixed(0)}`);
  const sp1 = bright((await fr(48 + 23)).png).all, sp2 = bright((await fr(48 + 24)).png).all;
  check('a clip at speed 2 reads its file twice as fast (1.92 s dark, 2 s light)', sp1 < 90 && sp2 > 170, `${sp1.toFixed(0)} then ${sp2.toFixed(0)}`);
  const top = await fr(4 * 24 + 6);
  const tb = bright(top.png);
  check('the clip on the upper track is the one saved', tb.left < 60 && tb.right > 190, `left ${tb.left.toFixed(0)} right ${tb.right.toFixed(0)}`);
  const fl = bright((await fr(5 * 24 + 6)).png);
  check('a mirrored clip is saved mirrored', fl.left > 190 && fl.right < 60, `left ${fl.left.toFixed(0)} right ${fl.right.toFixed(0)}`);
  const sz = pngSize(top.png);
  check('at the file\'s full size', sz.w === 160 && sz.h === 284, `${sz.w}×${sz.h}`);
  check('named <film>-<version>-<timecode>.png', top.name === 'fake-v3-00-00-04-06.png', top.name);
  let none = '';
  try { await fr(10 * 24); } catch (e) { none = e instanceof Error ? e.message : String(e); }
  check('no picture there: refused with words', /no picture at 00:00:10:00/.test(none), none);

  // ---- placing and swapping on the timeline (pure)
  const cut: Timeline = {
    version: 'v7', fps: 24, width: 1080, height: 1920, at: '2026-11-14T00:00:00.000Z', markers: [],
    tracks: [
      { id: 'V2', kind: 'video', name: 'Inserts', clips: [clip('i1', 'edits/x.mp4', 0, 2, 0)] },
      { id: 'V1', kind: 'video', name: 'Picture', clips: [clip('c1', 'media/step.mp4', 0, 5, 0), clip('c2', 'media/step.mp4', 0, 5, 5)] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [clip('c1a', 'media/step.mp4', 0, 5, 0), clip('c2a', 'media/step.mp4', 0, 5, 5)] },
      { id: 'A2', kind: 'audio', name: 'Effects', clips: [clip('s1', 'audio/sfx/boom/boom-try1.wav', 0, 1.5, 2, { gain: -6, fadeIn: 0.25, fadeOut: 0.5 })] },
      { id: 'A3', kind: 'audio', name: 'Music', clips: [] },
    ],
  };
  const theme = { src: `${A}/audio/music/theme.mp3`, name: 'theme', kind: 'sound' as const, seconds: 5.01 };
  const p1 = P.placeFile(cut, theme, 24);
  const c1 = p1.edit && M.findClip(p1.edit.tl, p1.edit.ref);
  check('a sound at the playhead: the first effects or music track with room (A2 has a sound there), whole length, no level, no fades', !!c1 && c1.track.id === 'A3' && c1.clip.in === 0 && c1.clip.out === 5 && c1.clip.at === 1 && c1.clip.gain === undefined && !c1.clip.fadeIn && c1.clip.label === 'theme', c1 ? `${c1.track.id} in ${c1.clip.in} out ${c1.clip.out} at ${c1.clip.at}` : String(p1.error));
  check('its note', p1.edit?.note === 'added theme on A3 Music at 00:00:01:00', String(p1.edit?.note));
  const p0 = P.placeFile(cut, theme, 4 * 24);
  check('a sound where the effects track is free: there', p0.edit?.ref.trackId === 'A2', String(p0.edit?.note ?? p0.error));
  const p2 = P.placeFile(cut, theme, 24, ['A2']);
  const c2 = p2.edit && M.findClip(p2.edit.tl, p2.edit.ref);
  check('asked for a track where a sound already is: it goes on the track beside it', !!c2 && c2.track.name === 'Effects 2' && /beside Effects/.test(p2.edit!.note), p2.edit?.note ?? String(p2.error));
  const p3 = P.placeFile(cut, { src: `${A}/cut/cards/title.mp4`, name: 'title', kind: 'picture', seconds: 1.5, audio: false }, 24);
  const c3 = p3.edit && M.findClip(p3.edit.tl, p3.edit.ref);
  check('a picture where the insert track is taken: on a new picture track above', !!c3 && c3.track.id === 'V3' && c3.track.name === 'Over 2', p3.edit?.note ?? String(p3.error));
  const p4 = P.placeFile(cut, { src: `${A}/edits/island-card/island-card-480x854.mp4`, name: 'island card', kind: 'picture', seconds: 2, audio: true }, 72);
  const pic = p4.edit && M.findClip(p4.edit.tl, p4.edit.ref);
  const its = p4.edit?.tl.tracks.flatMap((t) => t.clips.filter((c) => (c.src ?? '').endsWith('island-card-480x854.mp4')).map((c) => `${t.id}@${c.at}`)) ?? [];
  check('a picture with sound: on the insert track, and its sound on a sound track at the same place', !!pic && pic.track.id === 'V2' && its.length === 2 && its.includes('A3@3') && /its sound on A3 Music/.test(p4.edit!.note), `${its.join(', ')} · ${p4.edit?.note}`);
  const p5 = P.placeFile(cut, { src: `${A}/cut/cards/title.mp4`, name: 'title', kind: 'picture', seconds: 1.5 }, 24, ['V1']);
  check('a picture asked onto a track where a picture sits is refused', !p5.edit && /No room on V1/.test(p5.error ?? ''), String(p5.error));
  check('a file of unknown length is not placed', !!P.placeFile(cut, { ...theme, seconds: undefined }, 0).error, String(P.placeFile(cut, { ...theme, seconds: undefined }, 0).error));
  const r1 = P.replaceFile(cut, { trackId: 'A2', clipId: 's1' }, { src: `${A}/audio/sfx/boom/boom-try2.wav`, name: 'boom-try2', kind: 'sound', seconds: 2.25 });
  const rc = r1.edit && M.findClip(r1.edit.tl, { trackId: 'A2', clipId: 's1' })!.clip;
  check('replace: the file changes, the place, level, fades and length stay', !!rc && (rc.src ?? '').endsWith('boom-try2.wav') && rc.at === 2 && rc.gain === -6 && rc.fadeIn === 0.25 && rc.fadeOut === 0.5 && rc.in === 0 && rc.out === 1.5 && rc.label === 'boom-try2', rc ? JSON.stringify(rc) : String(r1.error));
  check('replace: its note', r1.edit?.note === 'replaced boom-try1.wav with boom-try2 on A2 Effects at 00:00:02:00', String(r1.edit?.note));
  const r2 = P.replaceFile(cut, { trackId: 'A2', clipId: 's1' }, { src: `${A}/voices/names/island.wav`, name: 'island', kind: 'sound', seconds: 0.75 });
  const rc2 = r2.edit && M.findClip(r2.edit.tl, { trackId: 'A2', clipId: 's1' })!.clip;
  check('replace with a shorter file: the clip ends with the file, its fades fit', !!rc2 && rc2.out === 0.75 && (rc2.fadeOut ?? 0) <= 0.375 && /shorter/.test(r2.edit!.note), rc2 ? `out ${rc2.out} fadeOut ${rc2.fadeOut} · ${r2.edit?.note}` : String(r2.error));
  check('replace refuses a picture clip', !!P.replaceFile(cut, { trackId: 'V1', clipId: 'c1' }, theme).error, String(P.replaceFile(cut, { trackId: 'V1', clipId: 'c1' }, theme).error));

  // ---- the sample film's fixture (what the page shows under MOCK=boards)
  const { mockFiles } = await import('../src/fixtures/files');
  const mf = mockFiles('the-lighthouse').files;
  check('the sample film lists sounds, pictures and two attached files, each with a length', mf.some((f) => f.kind === 'sound') && mf.some((f) => f.kind === 'picture') && mf.filter((f) => f.upload).length === 2 && mf.every((f) => f.seconds), `${mf.length} files`);
}

main().then(() => {
  console.log(`ok · ${checks} checks`);
  rmSync(root, { recursive: true, force: true });
}, (e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  console.error(`kept for a look: ${root}`);
  process.exit(1);
});
