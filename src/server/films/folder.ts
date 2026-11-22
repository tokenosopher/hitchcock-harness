// The page header's "…" menu: "Open the film's folder" opens it in Finder on this Mac.
// The folder comes from the films registry by the film's slug, never from the request; `open` runs by execFile with the
// folder as its one argument, never through a shell. Only a request made on this Mac may open anything: through a
// tunnel the Finder window would open on the Mac, not on the phone that asked.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findFilm } from './registry';

export type FindFilm = (slug: string) => Promise<{ slug: string; folder: string } | undefined>;
export type OpenFolder = (folder: string) => Promise<void>;
export type IsDir = (p: string) => Promise<boolean>;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** The film's folder for a slug, as the registry has it; undefined for a slug the registry does not know. */
export async function filmFolder(slug: unknown, find: FindFilm = findFilm): Promise<string | undefined> {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return undefined;
  const f = await find(slug);
  if (!f || f.slug !== slug || typeof f.folder !== 'string' || !path.isAbsolute(f.folder)) return undefined;
  return f.folder;
}

/** macOS `open <folder>`: Finder shows the folder. execFile, no shell; an absolute path can never read as a flag. */
export const finderOpen: OpenFolder = (folder) =>
  new Promise((resolve, reject) => {
    execFile('/usr/bin/open', [folder], { timeout: 10_000 }, (e) => (e ? reject(e) : resolve()));
  });

const isDir: IsDir = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);

export type OpenAnswer = { ok: true } | { ok: false; status: number; error: string };

export async function openFilmFolder(slug: unknown, deps: { find?: FindFilm; open?: OpenFolder; dir?: IsDir } = {}): Promise<OpenAnswer> {
  const folder = await filmFolder(slug, deps.find);
  if (!folder) return { ok: false, status: 404, error: 'No such film' };
  if (!(await (deps.dir ?? isDir)(folder))) return { ok: false, status: 404, error: 'The film’s folder is not there (is the studio folder there?)' };
  try {
    await (deps.open ?? finderOpen)(folder);
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: 'Finder did not open the folder' };
  }
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const FORWARDED = ['forwarded', 'cf-connecting-ip', 'cf-ray', 'tailscale-user-login', 'tailscale-funnel-request'];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** A request made on this Mac: a localhost Host and nothing that says it came through a tunnel or a proxy (the same
 *  test as src/proxy.ts). */
export function fromThisMac(headers: Headers): boolean {
  if (!LOCAL_HOST.test(headers.get('host') ?? '')) return false;
  if (FORWARDED.some((h) => headers.has(h))) return false;
  const xff = headers.get('x-forwarded-for');
  return !xff || xff.split(',').every((a) => LOOPBACK.has(a.trim()));
}
