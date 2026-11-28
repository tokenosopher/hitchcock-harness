// npx tsx scripts/realres-test.ts
// A take's size by its real picture, not its name: a take made at 1920x1080 can land as "…-480p.mp4" and must not
// show as 480p. Checked: the size class from sizes and from names (the name only a hint); and, on three tiny files made
// here with ffmpeg in a temp folder (a 1920x1080 file named -480p, a real 854x480 one, and a full-size -480p with a
// -1080p copy beside it), what the 1080p view, the badge, the upscale offers and the master are given by
// readFullSize: the full-size take is its own original, the small one is still scaled up, the pair is counted once.
// One line per check, a summary line, exit 1 when any check fails. Writes only in the OS temp folder.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atCutSize, clipMarks, hasOwnFull, madeFull, picturePieces, pictureMade, resClass, scaledUpWords } from '../src/components/edit/fullsize';
import { liveMarks } from '../src/components/edit/marks';
import { readFullSize } from '../src/server/edit/fullsize';
import { FFMPEG } from '../src/server/edit/probe';
import type { FilmTarget } from '../src/server/actions/film';
import type { Timeline } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};

// ---- the size class, pure
ok('1920x1080 is 1080p', resClass({ width: 1920, height: 1080 }) === '1080p');
ok('1080x1920 (portrait) is 1080p', resClass({ width: 1080, height: 1920 }) === '1080p');
ok('854x480 is 480p', resClass({ width: 854, height: 480 }) === '480p');
ok('480x854 (portrait) is 480p', resClass({ width: 480, height: 854 }) === '480p');
ok('1280x720 is 720p', resClass({ width: 1280, height: 720 }) === '720p');
ok('the real size beats the name', resClass({ width: 1920, height: 1080 }, 'S9-take5-480p.mp4') === '1080p');
ok('no probe: the name is the hint (-480p)', resClass(undefined, 'S9-take5-480p.mp4') === '480p');
ok('no probe: the name is the hint (-1080p-up)', resClass(undefined, 'S6-take1-1080p-up.mp4') === '1080p');
ok('no probe and no size in the name: unknown', resClass(undefined, 'title.mp4') === undefined);
ok('a 1080p file is at a 1920x1080 cut\'s size', atCutSize('1080p', { width: 1920, height: 1080 }));
ok('a 480p file is not', !atCutSize('480p', { width: 1920, height: 1080 }));
ok('an unknown size is not', !atCutSize(undefined, { width: 1920, height: 1080 }));

// ---- on real files
const tmp = mkdtempSync(path.join(os.tmpdir(), 'realres-'));
const film: FilmTarget = { slug: 'realres', repo: tmp, dir: path.join(tmp, 'assets/films/realres'), title: 'realres', show: (p: string) => p } as unknown as FilmTarget;
const make = (rel: string, w: number, h: number) => {
  const f = path.join(film.dir, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=gray:s=${w}x${h}:r=24:d=2`, '-pix_fmt', 'yuv420p', '-y', f]);
};
const BIG = 'generations/S9/takes/take5/S9-take5-480p.mp4';        // made at 1920x1080, named -480p
const SMALL = 'generations/S6/takes/take1/S6-take1-480p.mp4';      // a real 854x480
const PAIR = 'generations/S1/takes/take1/S1-take1-480p.mp4';       // full size, with a -1080p copy beside it
async function main(): Promise<void> {
try {
  make(BIG, 1920, 1080);
  make(SMALL, 854, 480);
  make(PAIR, 1920, 1080);
  make(PAIR.replace('-480p.', '-1080p.'), 1920, 1080);
  const src = (r: string) => `assets/films/realres/${r}`;
  const clip = (id: string, r: string, at: number) => ({ id, src: src(r), at, in: 0, out: 2 });
  const tl = {
    version: 'v1', fps: 24, width: 1920, height: 1080,
    tracks: [{ id: 'V1', kind: 'video', name: 'V1', clips: [clip('a', BIG, 0), clip('b', SMALL, 2), clip('c', PAIR, 4)] }],
  } as unknown as Timeline;
  const info = await readFullSize(film, [tl]);
  ok('sizes by the real picture', info.sizes?.[src(BIG)] === '1080p' && info.sizes?.[src(SMALL)] === '480p' && info.sizes?.[src(PAIR)] === '1080p', info.sizes);
  ok('the full-size -480p is its own original', info.originals?.[src(BIG)] === src(BIG), info.originals);
  ok('the real 480p has no full-size file', !info.takes[src(SMALL)] && !info.originals?.[src(SMALL)] && !info.upscaled?.[src(SMALL)]);
  ok('the pair uses its -1080p copy, once', info.takes[src(PAIR)] === src(PAIR.replace('-480p.', '-1080p.')) && !info.originals?.[src(PAIR)], { takes: info.takes, originals: info.originals });
  const pieces = picturePieces(tl, info);
  const marks = clipMarks(pieces);
  ok('the 1080p view plays the full-size take from the clip itself', pieces.some((p) => p.clip.id === 'a' && p.kind === 'original' && p.src === src(BIG)));
  ok('marks: full-size take not "small", the 480p one is, the pair is the take', marks.get('a')?.kind === 'original' && marks.get('b')?.kind === 'small' && marks.get('c')?.kind === 'take', [...marks]);
  ok('the badge reads 1080p for both full-size takes, not for the 480p', madeFull(info, src(BIG)) && madeFull(info, src(PAIR)) && !madeFull(info, src(SMALL)));
  ok('no upscale or redo offered for a take already full size', hasOwnFull(info, src(BIG)) && hasOwnFull(info, src(PAIR)) && !hasOwnFull(info, src(SMALL)));
  const made = pictureMade(pieces);
  const shots = Object.fromEntries(made.sources.map((s) => [s.kind, s.shots]));
  ok('the master: 1 shot from the original, 1 from the take, 1 scaled up (3 in all)', shots.original === 1 && shots.take === 1 && shots.small === 1 && made.shots === 3, shots);
  ok('before a master: only the real 480p is scaled up', scaledUpWords(made) === '1 shot has no full-size picture and will be scaled up from 480p', scaledUpWords(made));
  const mk = (r: string) => ({ src: src(r), take: r, markedAt: '', cut: 'v1', shots: [] });
  ok('a Seedance mark on a full-size take goes; on the 480p one it stays', liveMarks([mk(BIG), mk(SMALL), mk(PAIR)], info).map((m) => m.src).join() === src(SMALL));
  // without a probe (the file gone): the name is the hint, as before
  const gone = { ...tl, tracks: [{ ...tl.tracks[0], clips: [clip('z', 'generations/S0/takes/take1/S0-take1-480p.mp4', 0)] }] } as unknown as Timeline;
  const info2 = await readFullSize(film, [gone]);
  ok('a missing file falls back to its name: 480p, nothing full size', info2.sizes?.[src('generations/S0/takes/take1/S0-take1-480p.mp4')] === '480p' && !Object.keys(info2.originals ?? {}).length, info2);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
}

void main().then(() => {
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
});
