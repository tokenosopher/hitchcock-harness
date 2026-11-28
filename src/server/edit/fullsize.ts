// The full-size pictures on disk for the Edit page's 1080p view (13 Nov 2026, ASKS 37). Served by
// GET /api/films/<film>/full as FullInfo (src/components/edit/fullsize.ts says how the player uses them). Read-only.
//
// This is a naming convention, written for Alma in recipes/edit.md ("Full-size pictures"):
//   - the full-size picture of a whole version of the cut, frame-aligned with it, is `video/1080/cut-v<n>-1080.mp4`
//     (the cheap upscale of that version's render, on Higgsfield). The app's own master render
//     `cut/renders/v<n>-master.mp4` is NOT one: it is made from these pictures (or, where there is none, from the 480p
//     scaled up), so showing it as the full-size picture called a plain scale-up "Higgsfield" (14 Nov 2026);
//   - a take's own full-size files sit beside its 480p file: `…-480p.mp4` → `…-1080p.mp4` (the take redone in Seedance)
//     and `…-1080p-up.mp4` (the whole take upscaled on Higgsfield, so later trims stay covered);
//   - the name is only a hint: a `…-480p.mp4` whose real picture is already at the cut's size (a take made at
//     1920x1080) is its own original, and `sizes` says each take's real size class;
//   - a made piece (a title card) has its full-size original beside it: `…-480x854.mp4` → `…-1080x1920.mp4` (the cut's
//     size); a picture file that is already at the cut's size is its own original (14 Nov).
// The master render reads the same (render.ts, through picturePieces).
// The cheap pass is called "Higgsfield" when the film's folder shows an upscale run (video/1080/upscale/ or
// video/1080/segments/segments.json), else "upscaled".
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Timeline } from '../types';
import { atCutSize, resClass, type FullBase, type FullInfo, type ResClass } from '@/components/edit/fullsize';
import { probe } from './probe';
import type { FilmTarget } from '../actions/film';
import { readVersion, readVersions, resolveSrc } from './timeline';

const exists = (p: string) => fs.access(p).then(() => true, () => false);
const names = (p: string) => fs.readdir(p).catch(() => [] as string[]);

/** `also`: timelines whose clips need their files too (a render of a version that is not the current one). */
export async function readFullSize(film: FilmTarget, also: Timeline[] = []): Promise<FullInfo> {
  const rel = (p: string) => path.relative(film.repo, path.join(film.dir, p)).split(path.sep).join('/');
  const seed = (await exists(path.join(film.dir, 'video/1080/upscale'))) || (await exists(path.join(film.dir, 'video/1080/segments/segments.json')));
  const label = seed ? 'Higgsfield' : 'upscaled';
  const bases: FullBase[] = [];
  for (const n of await names(path.join(film.dir, 'video/1080'))) {
    const m = /^cut-(v\d+)-1080\.mp4$/.exec(n);
    if (m) bases.push({ version: m[1], path: rel(`video/1080/${n}`), frames: (await probe(path.join(film.dir, 'video/1080', n)))?.video?.frames, label });
  }
  // each take's own full-size file, for the clips of the current version and of every base's version
  const tls: Timeline[] = [...also];
  const { current } = await readVersions(film).catch(() => ({ current: undefined }));
  if (current) tls.push(current);
  for (const b of bases) { const t = await readVersion(film, b.version).catch(() => undefined); if (t) tls.push(t); }
  const takes: Record<string, string> = {};
  const upscaled: Record<string, string> = {};
  const originals: Record<string, string> = {};
  const W = tls[0]?.width ?? 1080, H = tls[0]?.height ?? 1920;
  const on = (src: string) => { const p = resolveSrc(film, src); return p ? exists(p) : Promise.resolve(false); };
  const srcs = new Set(tls.flatMap((t) => t.tracks.filter((x) => x.kind === 'video').flatMap((x) => x.clips.flatMap((c) => (c.src ? [c.src] : [])))));
  const sizes: Record<string, ResClass> = {};
  for (const src of srcs) {
    if (/-480p\.[a-z0-9]+$/i.test(src)) {
      // the name says 480p; the file's real picture decides (a take made at 1920x1080 can land as
      // "…-480p.mp4"). The probe is cached by path and mtime (probe.ts); without one, the name is the hint
      const abs = resolveSrc(film, src);
      const size = resClass((abs ? await probe(abs) : undefined)?.video, src);
      if (size) sizes[src] = size;
      const hi = src.replace(/-480p\.([a-z0-9]+)$/i, '-1080p.$1');
      if (await on(hi)) takes[src] = hi;   // a full-size copy beside it wins, as before: one take, counted once
      else if (atCutSize(size, { width: W, height: H })) { originals[src] = src; continue; }   // full size itself
      const sv = src.replace(/-480p\.([a-z0-9]+)$/i, '-1080p-up.$1');
      if (await on(sv)) upscaled[src] = sv;
      continue;
    }
    // a made piece (a title card): "…-480x854.mp4" beside "…-1080x1920.mp4", or a file already at the cut's size
    const sized = /-(\d+)x(\d+)(\.[a-z0-9]+)$/i.exec(src);
    if (sized && Number(sized[1]) < W && Number(sized[2]) < H) {
      const big = src.slice(0, sized.index) + `-${W}x${H}${sized[3]}`;
      if (await on(big)) originals[src] = big;
      continue;
    }
    const abs = resolveSrc(film, src);
    const v = abs ? (await probe(abs))?.video : undefined;
    if (v && v.width >= W && v.height >= H) originals[src] = src;
  }
  // each file's time (a stat, no reading): a master older than a file it would use now is out of date (masters.ts)
  const times: Record<string, string> = {};
  const paths = new Set([...bases.map((b) => b.path), ...Object.values(takes), ...Object.values(upscaled), ...Object.values(originals)]);
  for (const p of paths) {
    const a = resolveSrc(film, p);
    const st = a ? await fs.stat(a).catch(() => undefined) : undefined;
    if (st) times[p] = st.mtime.toISOString();
  }
  return { bases, takes, upscaled, originals, label, times, sizes };
}
