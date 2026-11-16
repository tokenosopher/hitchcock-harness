// Watches a film's cut/ folder. A version file written by anyone (the Edit page through the route, or Alma straight
// to disk by recipes/edit.md) is checked at once, and a refusal goes to its log (render.ts afterNewVersion; nothing is
// rendered since 14 Nov, ASKS 44, unless HARNESS_AUTO_480P=1). A marker file cut/renders/<version>.proxy-requested
// becomes a 480p render, cut/renders/<version>.master-requested a master. One watcher per film per server process
// (globalThis survives dev reloads).
// Stage 4 of "saving apart from history" (alma-drop.ts): a drop cut/alma/<YYYYMMDD-HHMMSS>.json (not an answer, not a
// temp name) is taken into the working cut (`takeIn`); a version written by hand, not by the server, becomes one step
// on top of the working cut (`takeInVersion`), after its check. At start, both kinds left while the server was down
// are taken in, oldest first.
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { FilmTarget } from '../actions/film';
import { isDropFile, takeIn, takeInVersion, takeInWaiting } from './alma-drop';
import { afterNewVersion, auto480p, queueRender } from './render';
import { CUT_DIR, listVersions, RENDERS_DIR } from './timeline';

interface CutWatch { watcher: FSWatcher; film: FilmTarget; root: string }
const g = globalThis as unknown as { __cutWatches?: Map<string, CutWatch | FSWatcher> };
const watches = (g.__cutWatches ??= new Map());

const quiet = (p: Promise<unknown>): void => void p.catch(() => undefined);

/** What a new or changed file under cut/ starts, with the render code of this load of the file. */
function listen(cw: CutWatch): void {
  const onFile = (p: string): void => {
    const rel = path.relative(cw.root, p);
    const v = /^(v\d+)\.json$/.exec(rel)?.[1];
    // the check first (its refusal log, as before), then the fallback for a version written by hand
    if (v) return quiet(afterNewVersion(cw.film.slug, v, 'file').finally(() => takeInVersion(cw.film, v)));
    const drop = /^alma\/([^/]+)$/.exec(rel)?.[1];
    if (drop) return isDropFile(drop) ? quiet(takeIn(cw.film, p)) : undefined;
    // the 480p asked for (Alma, when she needs to look at her change): made once; one there is the answer
    const asked = /^renders\/(v\d+)\.proxy-requested$/.exec(rel)?.[1];
    if (asked) return quiet(queueRender(cw.film.slug, asked, 'proxy'));
    const m = /^renders\/(v\d+)\.master-requested$/.exec(rel)?.[1];
    // a marker written now (Alma, on the user's word): a master out of date is made again beside it (masters.ts);
    // the markers found when the server starts only get the master a version does not have yet
    if (m) quiet(queueRender(cw.film.slug, m, 'master', { again: true }));
  };
  cw.watcher.removeAllListeners('add');
  cw.watcher.removeAllListeners('change');
  cw.watcher.on('add', onFile);
  cw.watcher.on('change', onFile);
}

// A dev reload brings new render code, but a watch made before it kept queueing with the code it was made with
// (14 Nov 2026: a version with subtitle lines written by Alma failed its 480p with a refusal the new code no longer
// makes; ASKS 43). Each load of this file takes the watches over. One made before this (no film kept with it) is
// closed, and the next request for the film makes it again.
for (const [slug, cw] of watches) {
  if ('film' in cw) listen(cw);
  else { void cw.close().catch(() => undefined); watches.delete(slug); }
}

export function ensureCutWatch(film: FilmTarget): void {
  if (watches.has(film.slug) || process.env.HARNESS_NO_CUT_WATCH === '1') return;
  let root: string;
  try {
    root = realpathSync(path.join(film.dir, CUT_DIR));
  } catch {
    return; // no cut/ folder yet: the first version write creates it (the route checks what it writes itself)
  }
  const w = watch(root, {
    ignoreInitial: true,
    depth: 1,
    ignored: (p: string) => /\.(mp4|harness-tmp|tmp)$|\.DS_Store$/.test(p),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignorePermissionErrors: true,
  });
  const cw: CutWatch = { watcher: w, film, root };
  listen(cw);
  w.on('error', () => undefined);
  watches.set(film.slug, cw);
  // what was asked while the server was down: any 480p or master marker still waiting (a version that has its file is
  // left alone); with HARNESS_AUTO_480P=1 also the current version's 480p, as before 14 Nov
  quiet((async () => {
    const versions = new Set(await listVersions(film));
    if (auto480p()) {
      const current = [...versions].pop();
      if (current) await queueRender(film.slug, current, 'proxy').catch(() => undefined);   // a planned cut is refused
    }
    const names = await fs.readdir(path.join(film.dir, RENDERS_DIR)).catch(() => [] as string[]);
    for (const name of names) {
      const m = /^(v\d+)\.(proxy|master)-requested$/.exec(name);
      if (m && versions.has(m[1])) await queueRender(film.slug, m[1], m[2] as 'proxy' | 'master').catch(() => undefined);
    }
    // versions written by hand and Alma's drops left while the server was down, oldest first
    await takeInWaiting(film).catch(() => undefined);
  })());
}
