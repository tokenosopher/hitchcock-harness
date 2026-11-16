// Files the user pasted, dropped or attached in Alma's message box. Each is kept in harness/uploads/<thread>/ under
// a name that starts with the time it came in, and goes to Alma as a chip whose reference is the file's full path,
// which she opens herself. Nothing here is in a film folder: Alma copies a file into the film when it belongs there.
//
// A file larger than one part comes in parts (receivePart): the request proxy (src/proxy.ts) makes Next buffer
// every request body and keeps only the first 10 MB of it, silently, so a 17.8 MB music file was saved as 10 MB
// (13 Nov 2026). The parts are appended under uploads/.incoming/ and the whole is kept only when its size, and its
// SHA-256 when the browser sent one, match what was declared.
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from './claude/config';

export const UPLOAD_MAX = 50 * 1024 * 1024;
/** The largest part accepted: well under the proxy's 10 MB buffer (the page sends 4 MB parts). */
export const UPLOAD_PART_MAX = 8 * 1024 * 1024;
export const TOO_BIG = 'the file is larger than 50 MB; give Alma its path instead';
const STALE_MS = 60 * 60 * 1000;
const UPLOAD_ID = /^[A-Za-z0-9-]{8,64}$/;
const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', json: 'application/json', csv: 'text/csv; charset=utf-8', srt: 'text/plain; charset=utf-8',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime',
};
const BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'application/pdf': 'pdf', 'text/plain': 'txt', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

export interface Upload { file: string; name: string; path: string; type: string; size: number }

const dirOf = (thread: string): string => path.join(claudeConfig().harnessDir, 'uploads', thread);
export const uploadType = (file: string): string => TYPES[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** "Screenshot 2026-11-11 at 09.12.png" → "screenshot-2026-11-11-at-09.12.png"; a pasted picture has no name, so it gets "pasted". */
function safeName(name: string, type: string): string {
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? BY_TYPE[type.split(';')[0].trim()] ?? 'bin').toLowerCase();
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').normalize('NFKD').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60).toLowerCase();
  return `${stem && !/^image$/.test(stem) ? stem : 'pasted'}.${ext}`;
}

export async function saveUpload(thread: string, name: string, type: string, bytes: Uint8Array): Promise<Upload> {
  return place(thread, name, type, bytes.length, (dest) => fs.writeFile(dest, bytes, { flag: 'wx' }));
}

/** Keeps the file under its time-stamped name; `put` writes it there and fails with EEXIST when the name is taken. */
async function place(thread: string, name: string, type: string, size: number, put: (dest: string) => Promise<void>): Promise<Upload> {
  const dir = dirOf(thread);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const base = safeName(name, type);
  for (let n = 0; n < 100; n++) {
    const file = `${stamp}${n ? `-${n}` : ''}-${base}`;
    try {
      await put(path.join(dir, file));
      return { file, name: name && !/^image\.\w+$/.test(name) ? name : base, path: path.join(dir, file), type: uploadType(file), size };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('could not find a free name for the file');
}

/** The full path of an uploaded file of this thread; undefined for anything that is not a plain name in its folder. */
export function uploadPath(thread: string, file: string): string | undefined {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(file) || file.includes('..')) return undefined;
  return path.join(dirOf(thread), file);
}

// ---- uploads in parts ----

/** A refusal the route answers with its status and words. */
export class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const mb = (n: number): string => (n / (1024 * 1024)).toFixed(1);
/** "music.wav arrived cut (10.0 of 17.8 MB) and was not attached; try again or give Alma its path" */
export const cutMessage = (name: string, got: number, want: number): string =>
  `${name || 'The file'} arrived cut (${mb(got)} of ${mb(want)} MB) and was not attached; try again or give Alma its path`;

export interface Part {
  /** The browser's id for this upload: letters, digits and dashes. */
  id: string;
  index: number;
  count: number;
  /** Where this part starts in the file. */
  offset: number;
  /** The whole file's size. */
  size: number;
  /** The whole file's SHA-256 in hex, when the browser could work it out. */
  sha256?: string;
  name: string;
  type: string;
}

const incomingDir = (): string => path.join(claudeConfig().harnessDir, 'uploads', '.incoming');

/** The part file of one upload; undefined for an id that is not letters, digits and dashes. */
function partFile(thread: string, id: string): string | undefined {
  if (!UPLOAD_ID.test(id)) return undefined;
  const dir = incomingDir();
  const p = path.join(dir, `${thread}--${id}.part`);
  return path.dirname(p) === dir ? p : undefined;
}

/** Throws away the parts of uploads that have not moved for an hour (a closed tab, a lost connection). */
async function sweepStale(): Promise<void> {
  const dir = incomingDir();
  const now = Date.now();
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!f.endsWith('.part')) continue;
    const st = await fs.stat(path.join(dir, f)).catch(() => undefined);
    if (st && now - st.mtimeMs > STALE_MS) await fs.rm(path.join(dir, f), { force: true });
  }
}

/** Drops an unfinished upload (the page gave up on it). */
export async function dropUpload(thread: string, id: string): Promise<void> {
  const p = partFile(thread, id);
  if (p) await fs.rm(p, { force: true });
}

async function sha256Of(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}

// one part of an upload at a time, in the order they came
const queues = new Map<string, Promise<unknown>>();

/**
 * Appends one part. `got` is what arrived for this part, `sent` the request's Content-Length. Answers how much of
 * the file is in so far, or, on the last part, the kept file. Any mismatch throws away the upload and throws.
 */
export async function receivePart(thread: string, part: Part, got: Uint8Array, sent: number): Promise<Upload | { received: number }> {
  const p = partFile(thread, part.id);
  if (!p) throw new UploadError('bad upload id');
  const ints = [part.index, part.count, part.offset, part.size];
  if (!ints.every((n) => Number.isSafeInteger(n) && n >= 0) || part.index >= part.count || part.count > 1000) throw new UploadError('bad upload part');
  if (part.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(part.sha256)) throw new UploadError('bad upload checksum');
  if (part.size > UPLOAD_MAX) throw new UploadError(TOO_BIG, 413);
  if (!part.size) throw new UploadError('the file is empty');
  const prev = queues.get(p) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => take(p, thread, part, got, sent));
  queues.set(p, run);
  try {
    return await run;
  } catch (e) {
    await fs.rm(p, { force: true });
    throw e;
  } finally {
    if (queues.get(p) === run) queues.delete(p);
  }
}

async function take(p: string, thread: string, part: Part, got: Uint8Array, sent: number): Promise<Upload | { received: number }> {
  const before = part.index === 0 ? 0 : (await fs.stat(p).catch(() => undefined))?.size;
  if (before === undefined) throw new UploadError(`${part.name || 'The file'} was lost midway (part ${part.index + 1} of ${part.count}) and was not attached; try again`);
  // this part arrived cut, or a part went missing or came twice
  if (before !== part.offset) throw new UploadError(cutMessage(part.name, before, part.size));
  if (got.length !== sent || before + got.length > part.size || got.length > UPLOAD_PART_MAX) {
    throw new UploadError(cutMessage(part.name, Math.min(before + got.length, part.size), part.size));
  }
  if (part.index === 0) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await sweepStale();
    await fs.writeFile(p, got);
  } else {
    await fs.appendFile(p, got);
  }
  const now = before + got.length;
  if (part.index < part.count - 1) return { received: now };
  const size = (await fs.stat(p)).size;
  if (size !== part.size) throw new UploadError(cutMessage(part.name, size, part.size));
  if (part.sha256 && (await sha256Of(p)) !== part.sha256) {
    throw new UploadError(`${part.name || 'The file'} arrived damaged (its checksum does not match) and was not attached; try again or give Alma its path`);
  }
  const kept = await place(thread, part.name, part.type, size, async (dest) => {
    // a hard link fails with EEXIST like the "wx" write does; a copy where links are not possible
    try { await fs.link(p, dest); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw e;
      await fs.copyFile(p, dest, fs.constants.COPYFILE_EXCL);
    }
  });
  await fs.rm(p, { force: true });
  return kept;
}
