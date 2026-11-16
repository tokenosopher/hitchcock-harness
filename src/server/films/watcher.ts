// Watches a film's folder (and the film repo's taste.md) and rebuilds its FilmState on every change,
// so the state route's SSE can push it. Media contents are never read: only names and sizes.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { harnessConfig } from '../config';
import { findFilm } from './registry';
import { getFilmState, invalidateFilmState, markWatched, type FilmStateX } from './state';

type Listener = (state: FilmStateX) => void;

interface FilmWatch {
  watcher: FSWatcher;
  listeners: Set<Listener>;
  timer?: ReturnType<typeof setTimeout>;
  fire?: () => void;
}

// survive Next.js dev reloads: one watcher per film per process
const g = globalThis as unknown as { __filmWatches?: Map<string, FilmWatch> };
const watches = (g.__filmWatches ??= new Map());

/** Rebuilds the film's state after a burst of changes and hands it to every page that listens. */
function makeFire(slug: string, fw: FilmWatch): () => void {
  return () => {
    clearTimeout(fw.timer);
    fw.timer = setTimeout(async () => {
      invalidateFilmState(slug);
      const state = await getFilmState(slug).catch(() => undefined);
      if (state) for (const l of fw.listeners) l(state);
    }, 500);
  };
}

// A dev reload brings new reader code, but a watch made before it kept rebuilding with the old code for as long
// as a page stayed open (13 Nov 2026: a new field never reached the pages). Each load of this file takes the
// watches over: they rebuild with the code of this load.
for (const [slug, fw] of watches) {
  fw.watcher.removeAllListeners('all');
  const fire = makeFire(slug, fw);
  fw.fire = fire;
  fw.watcher.on('all', fire);
}

// scratch, caches, frame dumps and Blender autosaves change often and mean nothing to the pages; the working cut's
// snapshots (harness/cut-states/, one per step, working.ts) neither: the history file beside them says the same
const IGNORED = /(\.nosync|__pycache__|\.DS_Store|\.blend1$|\.lock$|\.tmp$|\/harness\/cut-states(\/|$)|\/(fr|frames[^/]*|[^/]*-frames|compare|segs[^/]*)(\/|$))/;

/** Calls `fn` with the rebuilt state after each burst of changes; returns the unsubscribe. */
export async function subscribeFilm(slug: string, fn: Listener): Promise<(() => void) | undefined> {
  let w = watches.get(slug);
  if (!w) {
    const film = await findFilm(slug);
    if (!film || !film.repo) return undefined;
    let root = film.folder;
    try {
      root = realpathSync(film.folder); // through the assets link to the drive
    } catch {
      return undefined;
    }
    const taste = path.join(film.repo || harnessConfig().filmRepo, 'taste.md');
    const watcher = watch([root, taste], {
      ignoreInitial: true,
      ignored: (p: string) => IGNORED.test(p),
      depth: 6,
      ignorePermissionErrors: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });
    const fw: FilmWatch = { watcher, listeners: new Set() };
    const fire = makeFire(slug, fw);
    fw.fire = fire;
    watcher.on('all', fire);
    watcher.on('error', () => undefined);
    // from here on the state is kept fresh by events; whatever changed between the last build and now is caught by one rebuild
    watcher.on('ready', () => {
      markWatched(slug, true);
      fire();
    });
    watches.set(slug, fw);
    w = fw;
  }
  const fw = w;
  fw.listeners.add(fn);
  return () => {
    fw.listeners.delete(fn);
    if (!fw.listeners.size) {
      clearTimeout(fw.timer);
      void fw.watcher.close();
      watches.delete(slug);
      markWatched(slug, false);
    }
  };
}

/** After the harness itself changed something the watcher does not see (harness/answers.json): drop the cached
 *  state and, when a page is listening, push the rebuilt one. */
export function pokeFilm(slug: string): void {
  invalidateFilmState(slug);
  watches.get(slug)?.fire?.();
}
