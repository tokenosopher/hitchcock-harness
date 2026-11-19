// Where the harness finds the films: the studio folder (Alma's working folder), the final-cuts folder, the library,
// and the programs it runs (ffmpeg, ffprobe, python). Every default is inside the app's own folder
// (<app>/studio) or found on the PATH; each can be changed in .env.local (see .env.example).
// Next.js loads .env.local into process.env; scripts run with tsx do not, so read it here when needed.
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let loaded = false;

function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  try {
    const text = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // no .env.local: the defaults below apply
  }
}

export interface HarnessConfig {
  /** The studio folder (the film workspace); every Alma process runs here. Default <app>/studio. */
  filmRepo: string;
  /** Other film workspaces whose films the registry lists (made the older, audio-first way). Default none. */
  otherRepos: string[];
  /** Folders holding delivered cuts as `<YYYY-MM-DD> <Title>/`. Default <studio>/assets/final-cuts. */
  finalCuts: string[];
  /** The cross-film library. Default <studio>/assets/library. */
  library?: string;
  port: number;
  /** The harness's own runtime folder (sessions.json, films.json). */
  harnessDir: string;
  /** The folder every film lives under; the films list is empty while it is missing. Default <studio>/assets. */
  driveRoot: string;
  /** HARNESS_AUTO_480P=1: render the 480p of every new version by itself, as before 14 Nov. Off by default: the 480p
   *  is made when someone asks for it (the Edit page, a marker file, QC of the cut). */
  auto480p: boolean;
}

const split = (v: string | undefined): string[] => (v ? v.split(':').map((s) => s.trim()).filter(Boolean) : []);

/** What the app says when the studio folder (or its assets folder) is not there. */
export const STUDIO_MISSING = 'Studio folder missing';

/** The studio folder: HARNESS_FILM_REPO, else <app>/studio. */
export function studioDir(): string {
  loadEnvLocal();
  // turbopackIgnore: a path read at run time, never bundled or traced (the studio holds the films and a Python venv)
  return process.env.HARNESS_FILM_REPO || path.join(/*turbopackIgnore: true*/ process.cwd(), 'studio');
}

export function harnessConfig(): HarnessConfig {
  loadEnvLocal();
  const env = process.env;
  const filmRepo = studioDir();
  const assets = env.HARNESS_DRIVE_ROOT || path.join(/*turbopackIgnore: true*/ filmRepo, 'assets');
  return {
    filmRepo,
    otherRepos: split(env.HARNESS_OTHER_REPOS),
    finalCuts: env.HARNESS_FINAL_CUTS ? split(env.HARNESS_FINAL_CUTS) : [path.join(/*turbopackIgnore: true*/ assets, 'final-cuts')],
    library: env.HARNESS_LIBRARY || path.join(/*turbopackIgnore: true*/ assets, 'library'),
    port: harnessPort(),
    harnessDir: path.join(process.cwd(), 'harness'),
    driveRoot: assets,
    auto480p: env.HARNESS_AUTO_480P === '1',
  };
}

/** The port this app really listens on. Next sets PORT in the server's own process once it is listening (the port
 *  of `-p` in package.json, or one given by hand: `npm run dev -- -p 8810`), so that comes first; HARNESS_PORT in
 *  .env.local, then 8800, only for a process that is not the server (a tsx script, a test). */
export function harnessPort(): number {
  loadEnvLocal();
  const n = Number(process.env.PORT || process.env.HARNESS_PORT || 8800);
  return Number.isInteger(n) && n > 0 ? n : 8800;
}

/** The address Alma is given for the harness's API: this app on this Mac, at the port it really listens on. */
export function harnessUrl(): string {
  return `http://localhost:${harnessPort()}`;
}

/** A program by name, looked up on the PATH as a shell would; the bare name when it is not found there
 *  (the spawn then fails with a plain "not found"). */
export function onPath(name: string): string {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(/*turbopackIgnore: true*/ dir, name);
    try {
      accessSync(/*turbopackIgnore: true*/ p, constants.X_OK);
      return p;
    } catch {
      // not in this folder
    }
  }
  return name;
}

/** ffmpeg and ffprobe: HARNESS_FFMPEG / HARNESS_FFPROBE, else the ones on the PATH. */
export function ffmpegBin(): string {
  loadEnvLocal();
  return process.env.HARNESS_FFMPEG || onPath('ffmpeg');
}
export function ffprobeBin(): string {
  loadEnvLocal();
  return process.env.HARNESS_FFPROBE || onPath('ffprobe');
}

/** The Python the studio's tools run with: HARNESS_PYTHON, else <studio>/.venv/bin/python (made by setup.sh),
 *  else python3 on the PATH. */
export function pythonBin(): string {
  loadEnvLocal();
  if (process.env.HARNESS_PYTHON) return process.env.HARNESS_PYTHON;
  const venv = path.join(/*turbopackIgnore: true*/ studioDir(), '.venv', 'bin', 'python');
  return existsSync(/*turbopackIgnore: true*/ venv) ? venv : onPath('python3');
}
