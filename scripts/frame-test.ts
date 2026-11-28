// npx tsx scripts/frame-test.ts
// A film's frame: the size of each aspect, the brief's words read, the rule for a cut
// whose stored size is not the brief's (adopt when there is no picture in the stored shape, ask when there is), a
// drop's `aspect` or `width`/`height`, the 480p and hear-it sizes of a landscape cut, and the working cut on a
// synthetic film in a temp folder (deleted after): nothing is written on a read, the next step sets the brief's frame
// as its own step, a save writes it, the older versions keep theirs, a drop may set it. Never touches a real film.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline, TimelineTrack } from '../src/server/types';

const root = mkdtempSync(path.join(os.tmpdir(), 'frame-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';
delete process.env.HARNESS_AUTO_480P;

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 600)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}

const subs = (n: string): TimelineTrack => ({ id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: `line ${n}`, in: 0, out: 2, at: 0 }] });
const noPicture = (n: string): TimelineTrack[] => [{ id: 'V1', kind: 'video', name: 'Picture', clips: [] }, subs(n)];
const withPicture = (n: string, src: string): TimelineTrack[] => [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src, in: 0, out: 1, at: 0 }] }, subs(n)];

function makeFilm(slug: string, brief: string, tracks: TimelineTrack[]): string {
  const dir = path.join(repo, 'assets', 'films', slug);
  mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
  writeFileSync(path.join(dir, 'brief.md'), brief);
  const v1: Timeline = { version: 'v1', fps: 24, width: 1080, height: 1920, note: 'the script', by: 'alma', at: new Date().toISOString(), markers: [], tracks };
  writeFileSync(path.join(dir, 'cut', 'v1.json'), JSON.stringify(v1, null, 1) + '\n');
  return dir;
}
const readJson = <X>(f: string): X => JSON.parse(readFileSync(f, 'utf8')) as X;

async function main(): Promise<void> {
  const F = await import('../src/lib/frame');
  const R = await import('../src/server/edit/render');
  const H = await import('../src/server/edit/hear');
  const A = await import('../src/server/edit/alma-drop');
  const W = await import('../src/server/edit/working');
  const T = await import('../src/server/edit/timeline');

  console.log('\n== the size of each aspect');
  check('9:16 is 1080x1920', F.sizeWords(F.frameSize('9:16')) === '1080x1920');
  check('16:9 is 1920x1080', F.sizeWords(F.frameSize('16:9')) === '1920x1080');
  check('21:9 is 2520x1080 (exactly 21:9, even sides)', F.sizeWords(F.frameSize('21:9')) === '2520x1080' && 2520 / 1080 === 21 / 9);
  check('1:1 is 1080x1080', F.sizeWords(F.frameSize('1:1')) === '1080x1080');
  check('no aspect, or one we do not know, is 9:16', F.sizeWords(F.frameSize(undefined)) === '1080x1920' && F.sizeWords(F.frameSize('4:3')) === '1080x1920');
  check('cssAspect and aspectStyle: 9:16 gets no style (its box is as drawn)', F.aspectStyle('9:16') === undefined && F.aspectStyle(undefined) === undefined && F.aspectStyle('16:9')?.aspectRatio === '1920 / 1080');

  console.log('\n== the brief');
  check('"- Aspect ratio: 16:9"', F.briefAspect('# T\n\n- Aspect ratio: 16:9\n- later it says 9:16 too') === '16:9');
  check('"- **Aspect ratio 9:16**, for TikTok"', F.briefAspect('# T\n- **Aspect ratio 9:16**, for TikTok. Elements 16:9') === '9:16');
  check('the line wins over an earlier mention', F.briefAspect('# T\nvideo elements are 16:9 split\n- Aspect ratio: 9:16') === '9:16');
  check('no line: the first ratio named', F.briefAspect('# T\nShot for YouTube at 21:9.') === '21:9');
  check('"Aspect ratio: 1:1"', F.briefAspect('- Aspect ratio: 1:1') === '1:1');
  check('nothing: undefined (9:16 then)', F.briefAspect('# T\nno ratio, a timecode 01:09:16 here') === undefined);

  console.log('\n== the rule for a cut of another size');
  const cut = (w: number, h: number, tracks: TimelineTrack[]) => ({ width: w, height: h, tracks });
  check('the same size: same', F.frameRule(cut(1920, 1080, withPicture('a', 'x.mp4')), '16:9').kind === 'same');
  check('no aspect in the brief: same (a 9:16 film is never touched)', F.frameRule(cut(1080, 1920, noPicture('a')), undefined).kind === 'same');
  check('a 9:16 brief and a 480x854 cut: same ratio, same', F.frameRule(cut(480, 854, withPicture('a', 'x.mp4')), '9:16').kind === 'same');
  const ad = F.frameRule(cut(1080, 1920, noPicture('a')), '16:9');
  check('16:9 brief, 9:16 cut, no picture: adopt 1920x1080 with the words', ad.kind === 'adopt' && ad.width === 1920 && ad.height === 1080 && ad.words === 'frame size set to 1920x1080 from the brief', ad);
  const ask = F.frameRule(cut(1080, 1920, withPicture('a', 'p.mp4')), '16:9');
  check('16:9 brief, 9:16 cut with a picture of unknown size: ask, in plain words', ask.kind === 'ask' && ask.words === 'The brief says 16:9 but this cut is 9:16', ask);
  check('…with a portrait picture: ask', F.frameRule(cut(1080, 1920, withPicture('a', 'p.mp4')), '16:9', () => ({ width: 480, height: 854 })).kind === 'ask');
  check('…with only landscape pictures: adopt', F.frameRule(cut(1080, 1920, withPicture('a', 'l.mp4')), '16:9', () => ({ width: 1920, height: 1080 })).kind === 'adopt');
  check('shownFrame: the brief\'s for an adoptable cut, the cut\'s own otherwise', F.sizeWords(F.shownFrame(cut(1080, 1920, noPicture('a')), '16:9')) === '1920x1080' && F.sizeWords(F.shownFrame(cut(1080, 1920, withPicture('a', 'p')), '16:9')) === '1080x1920');

  console.log('\n== a drop\'s frame');
  check('aspect "16:9"', F.sizeWords(F.dropFrame({ aspect: '16:9' }, T.MAX_SIDE).frame!) === '1920x1080');
  check('width and height', F.sizeWords(F.dropFrame({ width: 2520, height: 1080 }, T.MAX_SIDE).frame!) === '2520x1080');
  check('an unknown aspect is refused', F.dropFrame({ aspect: '4:3' }, T.MAX_SIDE).problems.length === 1);
  check('both aspect and a size are refused', F.dropFrame({ aspect: '16:9', width: 1920, height: 1080 }, T.MAX_SIDE).problems.length === 1);
  check('past the 4096 cap, odd, or one side alone: refused', [{ width: 5000, height: 1080 }, { width: 1921, height: 1080 }, { width: 1920 }].every((d) => F.dropFrame(d, T.MAX_SIDE).problems.length === 1));
  check('no frame: nothing asked', F.dropFrame({}, T.MAX_SIDE).frame === undefined && F.dropFrame({}, T.MAX_SIDE).problems.length === 0);
  const cd = A.checkDrop({ basedOnRev: 1, note: 'frame', tracks: noPicture('a'), aspect: '16:9' });
  check('checkDrop keeps it as width and height', cd.drop?.width === 1920 && cd.drop?.height === 1080, cd);
  check('checkDrop refuses a bad one with the reason', A.checkDrop({ basedOnRev: 1, note: 'frame', tracks: noPicture('a'), aspect: '3:2' }).problems.some((p) => p.includes('aspect must be one of')));
  check('a drop with no frame is as before', A.checkDrop({ basedOnRev: 1, note: 'x', tracks: noPicture('a') }).drop?.width === undefined);

  console.log('\n== the render sizes');
  const sz = (t: { width: number; height: number }, k: 'proxy' | 'master') => { const o = R.outputSize(t, k); return `${o.w}x${o.h}`; };
  check('9:16: 480x854 and 1080x1920, as before', sz({ width: 1080, height: 1920 }, 'proxy') === '480x854' && sz({ width: 1080, height: 1920 }, 'master') === '1080x1920');
  check('16:9: 854x480 and 1920x1080', sz({ width: 1920, height: 1080 }, 'proxy') === '854x480' && sz({ width: 1920, height: 1080 }, 'master') === '1920x1080');
  check('21:9: 1120x480 and 2520x1080', sz({ width: 2520, height: 1080 }, 'proxy') === '1120x480' && sz({ width: 2520, height: 1080 }, 'master') === '2520x1080');
  const w = { start: 0, end: 4 } as Parameters<typeof H.hearArgs>[0]['w'];
  const portrait = H.hearArgs({ pieces: [], w, out: '/x.mp4' }).join(' ');
  check('a hear-it clip of a 9:16 cut: the command as before', portrait.includes("scale='min(480,iw)':-2:flags=bicubic") && portrait.includes('s=480x854'));
  const land = H.hearArgs({ pieces: [], w, out: '/x.mp4', size: { w: 854, h: 480 } }).join(' ');
  check('…of a 16:9 cut: never taller than 480, black at 854x480', land.includes("scale=-2:'min(480,ih)':flags=bicubic") && land.includes('s=854x480'), land);

  console.log('\n== the working cut on a 16:9 film with no picture yet (the contest film\'s case)');
  const dir = makeFilm('wide-new', '# Wide\n\n- Aspect ratio: 16:9\n', noPicture('1'));
  const film = { ...T.filmTargetOf('wide-new', dir, repo), aspect: '16:9' as const };
  const s = W.diskStore(film);
  const a0 = (await W.ensureWorking(s))!;
  check('made from v1 at 1080x1920', a0.working.width === 1080 && a0.working.height === 1920);
  const wf = path.join(dir, 'cut', 'working.json');
  const m0 = statSync(wf).mtimeMs;
  const peek = await W.peekWorking(s);
  await W.ensureWorking(s);
  check('reading it writes nothing (working.json untouched, still 1080x1920)', statSync(wf).mtimeMs === m0 && peek!.working.width === 1080);
  const st = await W.step(s, { rev: a0.working.rev, words: 'a line changed', tracks: noPicture('2') });
  const steps = st.history.steps.map((x) => x.words);
  check('the next step: 1920x1080, the frame its own step before it', st.working.width === 1920 && st.working.height === 1080 && steps.slice(-2).join(' | ') === 'frame size set to 1920x1080 from the brief | a line changed', steps);
  check('working.json says 1920x1080', readJson<{ width: number }>(wf).width === 1920);
  const sv = await W.save(s, { rev: st.working.rev, why: 'you' });
  check('the save writes v2 at 1920x1080', sv.made && sv.version === 'v2' && readJson<Timeline>(path.join(dir, 'cut', 'v2.json')).width === 1920);
  check('v1 keeps its own size', readJson<Timeline>(path.join(dir, 'cut', 'v1.json')).width === 1080);
  const again = await W.step(s, { rev: sv.working.rev, words: 'another', tracks: noPicture('3') });
  check('a later step adds no second frame step', again.history.steps.filter((x) => x.words.startsWith('frame size set')).length === 1);

  console.log('\n== a save alone adopts it too');
  const dir2 = makeFilm('wide-save', '# Wide\n- Aspect ratio: 16:9\n', noPicture('1'));
  const s2 = W.diskStore(T.filmTargetOf('wide-save', dir2, repo));
  const b0 = (await W.ensureWorking(s2))!;
  const sv2 = await W.save(s2, { rev: b0.working.rev, why: 'you' });
  check('save on an unchanged cut: the frame step, then v2 at 1920x1080', sv2.made && readJson<Timeline>(path.join(dir2, 'cut', 'v2.json')).height === 1080 && sv2.history.steps.some((x) => x.words === 'frame size set to 1920x1080 from the brief'));

  console.log('\n== a 16:9 brief and a cut with a portrait picture: nothing changes by itself');
  // a 2 s portrait picture (made with ffmpeg in the temp folder)
  const tall = path.join(root, 'tall.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=270x480:rate=24:duration=2', '-pix_fmt', 'yuv420p', tall]);
  const dir3 = makeFilm('wide-ask', '# Wide\n- Aspect ratio: 16:9\n', withPicture('1', 'tall.mp4'));
  copyFileSync(tall, path.join(dir3, 'tall.mp4'));
  const s3 = W.diskStore(T.filmTargetOf('wide-ask', dir3, repo));
  const c0 = (await W.ensureWorking(s3))!;
  check('the rule asks (the picture probed portrait)', (await W.frameRuleOf(s3, c0.working)).kind === 'ask');
  const c1 = await W.step(s3, { rev: c0.working.rev, words: 'a line', tracks: withPicture('2', 'tall.mp4') });
  check('a step keeps 1080x1920 and adds no frame step', c1.working.width === 1080 && !c1.history.steps.some((x) => x.words.startsWith('frame size')), c1.history.steps);
  const c2 = await W.step(s3, { rev: c1.working.rev, words: 'frame size set to 1920x1080 from the brief', tracks: c1.working.tracks, width: 1920, height: 1080 });
  check('the switch (the Edit page\'s button): one step to 1920x1080, the picture kept', c2.working.width === 1920 && c2.working.tracks[0].clips.length === 1);
  const c3 = await W.undo(s3, c2.working.rev);
  check('…which undo takes back', c3.working.width === 1080);

  console.log('\n== a 9:16 film: as before');
  const dir4 = makeFilm('tall', '# Tall\n- Aspect ratio: 9:16\n', noPicture('1'));
  const s4 = W.diskStore(T.filmTargetOf('tall', dir4, repo));
  const d0 = (await W.ensureWorking(s4))!;
  const d1 = await W.step(s4, { rev: d0.working.rev, words: 'a line', tracks: noPicture('2') });
  check('one step, the size unchanged', d1.working.width === 1080 && d1.working.height === 1920 && d1.history.steps.length === d0.history.steps.length + 1);
  const dir5 = path.join(repo, 'assets', 'films', 'no-brief');
  mkdirSync(path.join(dir5, 'cut'), { recursive: true });
  const first = await T.writeNextVersion(T.filmTargetOf('no-brief', dir5, repo), { tracks: noPicture('1'), note: 'first' });
  check('a first version with no brief is 1080x1920', first.width === 1080 && first.height === 1920);
  const dir6 = path.join(repo, 'assets', 'films', 'wide-first');
  mkdirSync(path.join(dir6, 'cut'), { recursive: true });
  const first6 = await T.writeNextVersion({ ...T.filmTargetOf('wide-first', dir6, repo), aspect: '16:9' }, { tracks: noPicture('1'), note: 'first' });
  check('a 16:9 film\'s first version is 1920x1080', first6.width === 1920 && first6.height === 1080);

  console.log('\n== Alma\'s drop with an aspect');
  const dir7 = makeFilm('wide-drop', '# Wide\n- Aspect ratio: 16:9\n', withPicture('1', 'tall.mp4'));
  copyFileSync(tall, path.join(dir7, 'tall.mp4'));
  // the brief was changed to 16:9 and the cut has a portrait picture: nothing adopts; her drop asks 16:9
  const s7 = W.diskStore(T.filmTargetOf('wide-drop', dir7, repo));
  const e0 = (await W.ensureWorking(s7))!;
  const dd = path.join(dir7, 'cut', 'alma');
  mkdirSync(dd, { recursive: true });
  const file = path.join(dd, '20261125-210000.json');
  writeFileSync(`${file}.tmp`, JSON.stringify({ basedOnRev: e0.working.rev, note: 'frame 16:9 for the contest', tracks: withPicture('2', 'tall.mp4'), markers: [], aspect: '16:9' }));
  renameSync(`${file}.tmp`, file);
  const r = await A.takeIn(T.filmTargetOf('wide-drop', dir7, repo), file);
  check('taken as a version at 1920x1080', r.answer?.taken === true && readJson<Timeline>(path.join(dir7, 'cut', `${(r.answer as { version: string }).version}.json`)).width === 1920, r.answer);

  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); }, (e: Error) => { console.log(e.message); rmSync(root, { recursive: true, force: true }); process.exit(1); });
