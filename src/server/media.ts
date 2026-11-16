// The media the pages show: images and video from the film folders, the library and the final cuts,
// never anything else. Paths come in relative to a film repo ("assets/films/<slug>/…", the form every
// page shows) and are checked after the links are resolved. Thumbnails and video posters are made
// once with sharp and ffmpeg and kept under harness/thumbs/ (git-ignored), keyed by file, mtime and size.
import { promises as fs, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin, ffprobeBin, harnessConfig } from './config';

/** HARNESS_FFMPEG / HARNESS_FFPROBE, else the ones on the PATH. */
export const FFMPEG = ffmpegBin();
export const FFPROBE = ffprobeBin();

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};
export const contentTypeOf = (p: string): string | undefined => TYPES[path.extname(p).toLowerCase()];
export const isVideo = (p: string): boolean => /^video\//.test(contentTypeOf(p) ?? '');
export const isImage = (p: string): boolean => /^image\//.test(contentTypeOf(p) ?? '');
export const isPdf = (p: string): boolean => /\.pdf$/i.test(p);

/** A failure the route turns into a status: 400 bad path, 403 outside the roots, 404 missing, 503 cloud drive busy. */
export class MediaError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 415 | 500 | 503, message: string) {
    super(message);
  }
}

/** Races a file-system call against a time limit: a cloud-drive file still syncing can block or refuse
 *  ("Resource deadlock avoided", EDEADLK); both become a 503 with a retry hint. */
export async function limited<T>(p: Promise<T>, ms = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MediaError(503, 'the file did not answer in time (it may still be syncing)')), ms);
      }),
    ]);
  } catch (e) {
    throw asMediaError(e);
  } finally {
    clearTimeout(timer);
  }
}

export function asMediaError(e: unknown): MediaError {
  if (e instanceof MediaError) return e;
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return new MediaError(404, 'no such file');
  if (code === 'EDEADLK' || code === 'EAGAIN' || code === 'EBUSY' || code === 'ETIMEDOUT') return new MediaError(503, 'the file is still syncing');
  if (code === 'EACCES' || code === 'EPERM') return new MediaError(503, 'macOS refused the read (check Privacy & Security → Files and Folders)');
  return new MediaError(500, 'the file could not be read');
}

interface Roots { repos: string[]; allowed: string[] }
let rootsCache: { at: number; roots: Roots } | undefined;

/** The repos paths resolve against, and the real folders a resolved file must sit in:
 *  every repo's assets/films (through the link), the library and the final-cuts folders. */
async function roots(): Promise<Roots> {
  if (rootsCache && Date.now() - rootsCache.at < 60_000) return rootsCache.roots;
  const cfg = harnessConfig();
  const repos = [cfg.filmRepo, ...cfg.otherRepos];
  const raw = [...repos.map((r) => path.join(r, 'assets', 'films')), ...(cfg.library ? [cfg.library] : []), ...cfg.finalCuts];
  const allowed = new Set<string>();
  for (const r of raw) {
    allowed.add(path.resolve(r));
    try {
      allowed.add(await limited(fs.realpath(r), 3000));
    } catch {
      // a root that is not there (the folder missing or asleep) only loses its real-path form
    }
  }
  const out = { repos, allowed: [...allowed] };
  rootsCache = { at: Date.now(), roots: out };
  return out;
}

const inside = (p: string, root: string): boolean => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

export interface Resolved { abs: string; real: string; stat: Stats; type: string }

/** "assets/films/<slug>/cast/C01-x/pick-v2.png" (or an absolute path inside the library or the final cuts)
 *  → the file, after checking that its real location is inside an allowed root and below a film folder. */
export async function resolveMedia(p: string | null): Promise<Resolved> {
  if (!p || p.includes('\0')) throw new MediaError(400, 'no path');
  const type = contentTypeOf(p);
  if (!type) throw new MediaError(415, 'not an image, video or audio file');
  const { repos, allowed } = await roots();
  const norm = path.normalize(p);
  if (!path.isAbsolute(norm) && (norm.startsWith('..') || norm.split(path.sep).includes('..'))) throw new MediaError(403, 'outside the film folders');
  const candidates = path.isAbsolute(norm) ? [norm] : repos.map((r) => path.join(r, norm));
  let underRoot = false;
  for (const abs of candidates) {
    // the path as written must already sit under a root (a film folder needs a slug below assets/films)
    const okWritten = allowed.some((root) => inside(abs, root) && abs !== root);
    if (!okWritten) continue;
    underRoot = true;
    let real: string;
    try {
      real = await limited(fs.realpath(abs));
    } catch (e) {
      const err = asMediaError(e);
      if (err.status === 404) continue;
      throw err;
    }
    const okReal = allowed.some((root) => inside(real, root));
    if (!okReal) throw new MediaError(403, 'outside the film folders');
    const filmsRoot = allowed.find((root) => inside(real, root) && /assets\/films$|\/films$/.test(root));
    if (filmsRoot && path.relative(filmsRoot, real).split(path.sep).length < 2) throw new MediaError(403, 'not inside a film folder');
    const stat = await limited(fs.stat(real));
    if (!stat.isFile()) throw new MediaError(404, 'not a file');
    return { abs, real, stat, type };
  }
  throw underRoot ? new MediaError(404, 'no such file in the film folders') : new MediaError(403, 'outside the film folders, the library and the final cuts');
}

export const etagOf = (r: Resolved, extra = ''): string => `"${r.stat.size.toString(36)}-${Math.floor(r.stat.mtimeMs).toString(36)}${extra}"`;

// ---- Thumbnails and posters

export const THUMB_WIDTHS = [160, 320, 640, 960];

export interface Thumb { file: string; width: number; height: number; srcWidth?: number; srcHeight?: number }

const thumbDir = (): string => path.join(harnessConfig().harnessDir, 'thumbs');
const inflight = new Map<string, Promise<Thumb>>();
let running = 0;
const queue: (() => void)[] = [];

/** At most four thumbnails are made at once: a page of 60 tiles must not start 60 ffmpegs. */
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>((res) => queue.push(res));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function run(bin: string, args: string[], ms: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { encoding: 'buffer', maxBuffer: 64 << 20, signal: AbortSignal.timeout(ms) }, (err, stdout, stderr) => {
      if (err) {
        const text = stderr?.toString() ?? '';
        if (/Resource deadlock avoided/i.test(text)) return reject(new MediaError(503, 'the file is still syncing'));
        if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR' || err.name === 'AbortError') return reject(new MediaError(503, 'the frame did not come in time (the file may still be syncing)'));
        return reject(new MediaError(500, 'ffmpeg could not read a frame'));
      }
      resolve(stdout);
    });
  });
}

/** The video's picture size, from ffprobe (rotation applied). */
async function videoSize(file: string): Promise<{ width?: number; height?: number; duration?: number }> {
  try {
    const out = (await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', file], 8000)).toString();
    const j = JSON.parse(out) as { streams?: { width?: number; height?: number; side_data_list?: { rotation?: number }[] }[]; format?: { duration?: string } };
    const s = j.streams?.[0];
    const rot = Math.abs(s?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
    const swap = rot === 90 || rot === 270;
    return { width: swap ? s?.height : s?.width, height: swap ? s?.width : s?.height, duration: j.format?.duration ? Number(j.format.duration) : undefined };
  } catch {
    return {};
  }
}

/** A resized WebP of an image, or a poster frame of a video at `t` seconds, cached on disk. */
export async function thumbnail(r: Resolved, width: number, t: number): Promise<Thumb> {
  const video = isVideo(r.real);
  const key = createHash('sha1').update(`${r.real}\0${r.stat.size}\0${r.stat.mtimeMs}\0${width}\0${video ? t : ''}\0v1`).digest('hex');
  const file = path.join(thumbDir(), `${key}.webp`);
  const meta = path.join(thumbDir(), `${key}.json`);
  try {
    const m = JSON.parse(await fs.readFile(meta, 'utf8')) as Thumb;
    await fs.access(file);
    return { ...m, file };
  } catch {
    // not made yet
  }
  const hit = inflight.get(key);
  if (hit) return hit;
  const job = slot(async () => {
    const { default: sharp } = await import('sharp');
    await fs.mkdir(thumbDir(), { recursive: true });
    let input: Buffer;
    let srcWidth: number | undefined;
    let srcHeight: number | undefined;
    if (isPdf(r.real)) {
      // the first page, rendered by Quick Look (macOS); sharp's libvips has no PDF reader
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-ql-'));
      try {
        await run('/usr/bin/qlmanage', ['-t', '-s', String(Math.max(width * 2, 640)), '-o', dir, r.real], 20000);
        input = await fs.readFile(path.join(dir, `${path.basename(r.real)}.png`));
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
      const md = await sharp(input).metadata();
      srcWidth = md.width;
      srcHeight = md.height;
    } else if (video) {
      const size = await videoSize(r.real);
      srcWidth = size.width;
      srcHeight = size.height;
      const at = size.duration !== undefined ? Math.max(0, Math.min(t, size.duration - 0.05)) : t;
      input = await run(FFMPEG, ['-v', 'error', '-ss', String(at), '-i', r.real, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-vcodec', 'png', '-'], 20000);
      if (!input.length) throw new MediaError(500, 'ffmpeg gave no frame');
    } else {
      input = await limited(fs.readFile(r.real), 8000);
      const md = await sharp(input).metadata();
      const swap = (md.orientation ?? 1) >= 5;
      srcWidth = swap ? md.height : md.width;
      srcHeight = swap ? md.width : md.height;
    }
    const out = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
    const thumb: Thumb = { file, width: out.info.width, height: out.info.height, srcWidth: srcWidth ?? out.info.width, srcHeight: srcHeight ?? out.info.height };
    // write to a temporary name first so a half-written file is never served
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, out.data);
    await fs.rename(tmp, file);
    await fs.writeFile(meta, JSON.stringify({ width: thumb.width, height: thumb.height, srcWidth: thumb.srcWidth, srcHeight: thumb.srcHeight }));
    return thumb;
  });
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}
