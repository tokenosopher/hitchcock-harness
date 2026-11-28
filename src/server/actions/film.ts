// Which folder a pick writes into. Normally the studio folder's assets/films/<slug> (HARNESS_FILM_REPO);
// a test process points HARNESS_FILM_REPO at a copy, so a test pick never touches a real film.
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import { harnessConfig, STUDIO_MISSING } from '../config';
import { readBrief } from '../films/read/brief';
import { Warnings } from '../films/util';
import type { ShowPath } from './writes';
import type { Aspect } from '@/lib/frame';

export interface FilmTarget {
  slug: string;
  repo: string;                 // the repo whose taste.md, tools/ and assets link the film uses
  dir: string;                  // absolute film folder, through the assets link
  title: string;
  show: ShowPath;               // absolute → "assets/films/<slug>/…"
  aspect?: Aspect;              // the brief's aspect ratio: the cut's frame follows it (src/lib/frame.ts)
}

/** The studio folder's assets folder is not there (setup.sh makes it). */
export const DRIVE_MISSING = STUDIO_MISSING;

export async function driveConnected(): Promise<boolean> {
  try {
    return (await fs.stat(harnessConfig().driveRoot)).isDirectory();
  } catch {
    return false;
  }
}

/** The film folder of the video-driven repo; undefined when it is not there. */
export async function filmTarget(slug: string, repo = harnessConfig().filmRepo): Promise<FilmTarget | undefined> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return undefined;
  const dir = path.join(repo, 'assets', 'films', slug);
  try {
    if (!(await fs.stat(dir)).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const brief = await readBrief({ dir, warn: new Warnings() });
  return { slug, repo, dir, title: brief?.title ?? slug, show: showPathFor(repo, dir), ...(brief?.aspect ? { aspect: brief.aspect } : {}) };
}

/** Paths inside the repo read "assets/films/…" (never the volume path); the real folder behind the link maps back. */
export function showPathFor(repo: string, filmDir: string): ShowPath {
  let real = filmDir;
  try {
    real = realpathSync(filmDir);
  } catch { /* drive missing: the plain path still maps */ }
  const shown = path.relative(repo, filmDir);
  return (p: string) => {
    if (p.startsWith(real + path.sep) || p === real) return path.join(shown, path.relative(real, p));
    if (p.startsWith(repo + path.sep)) return path.relative(repo, p);
    return p;
  };
}
