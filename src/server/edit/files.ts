// The film's files that can go on the timeline by hand (14 Nov 2026, from the owner's editing of the last film:
// 6 effects and 2 music lays asked of Alma, music attached in her box only so she could place it, then levelled
// and trimmed by hand). The Edit page lists them, plays or shows each, and places one at the playhead; a sound
// clip's file can be swapped for any of them. Read-only, except `adoptUpload`, which copies a file attached in the
// chat into the film's folder when the owner places it (a clip's src must be inside the film's folder).
//
//   sound    every sound file under audio/, voices/, music/, sfx/, sound/, edits/, cut/cards/, cut/derived/, cards/,
//            titles/ and cast/<who>/voice(s)/
//   picture  every video file under edits/, cut/cards/, cut/derived/, cards/, titles/ (title cards and made pieces;
//            still pictures are left out: the render plays video files only)
//   subtitles every .srt file under subtitles/ and social/ (14 Nov: one goes on the subtitles track as a clip)
//   attached the sound, video and .srt files attached in Alma's box for this film (harness/uploads/<film>/)
// Left out: the takes (generations/, blocks/, tests/: they have the takes grid), the cut's own renders (the rest of
// cut/), review/, social/, harness/, hidden files and anything under a folder ending in .nosync. A symbolic link is
// followed only when it stays inside the film's folder. The walk is bounded (depth and count) and the lengths are
// measured a few at a time under a time limit, cached by file, size and time; what is not measured yet comes back
// without a length and the page asks again.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';
import type { FilmTarget } from '../actions/film';
import { Writer } from '../actions/writes';
import { pictureAt, startF, speedOf } from '@/components/edit/model';
import { parseSrt } from '@/components/edit/subs';
import type { Timeline } from '../types';
import { FFMPEG, probe } from './probe';
import { CutError, resolveSrc, smpte } from './timeline';

export interface FilmFile {
  /** "assets/films/<film>/…" for the film's own files (the form a clip uses); for an attached file, the name it
   *  will get once placed (`upload` says where it is now). */
  src: string;
  /** "door-creak-try2", "rain loop" (an attached file without its time stamp). */
  name: string;
  kind: 'sound' | 'picture' | 'subtitles';
  /** Where it is: "audio/sfx/door-creak", "edits/island-card"; "attached" for the files attached in the chat. */
  group: string;
  seconds?: number;
  /** An .srt file: how many cues it has (its `seconds` is the end of its last cue). */
  cues?: number;
  /** A picture file with sound of its own. */
  audio?: boolean;
  width?: number; height?: number;
  size: number;
  /** The file's name in harness/uploads/<film>/, for a file attached in the chat (not in the film's folder yet). */
  upload?: string;
}

export interface FilmFiles { files: FilmFile[]; waiting: number; truncated?: boolean }

export const SOUND_EXT = /\.(wav|mp3|m4a|aac|aiff?|flac|ogg)$/i;
export const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
export const SUBS_EXT = /\.srt$/i;
const SUBS_ROOTS = ['subtitles', 'social'];
const SOUND_ROOTS = ['audio', 'voices', 'music', 'sfx', 'sound', 'edits', 'cut/cards', 'cut/derived', 'cards', 'titles'];
const PICTURE_ROOTS = new Set(['edits', 'cut/cards', 'cut/derived', 'cards', 'titles']);
const MAX_DEPTH = 6;
const MAX_FILES = 1500;
const MAX_VISITS = 20000;
const PROBE_AT_ONCE = 4;
const PROBE_BUDGET_MS = 4000;
export const ATTACHED = 'attached';

const uploadsDir = (slug: string): string => path.join(claudeConfig().harnessDir, 'uploads', slug);

/** Whether `p` is `root` or inside it (both real paths). */
const inside = (root: string, p: string): boolean => p === root || p.startsWith(root + path.sep);

async function realOrUndefined(p: string): Promise<string | undefined> {
  try { return await fs.realpath(p); } catch { return undefined; }
}

interface Found { abs: string; group: string; kind: FilmFile['kind']; st: Stats; upload?: string; viaLink?: boolean }

/** The files under `root` (an absolute folder) of the kinds `pictures` allows, never leaving `fence` (a real path). */
async function walk(root: string, fence: string, pictures: boolean | 'subtitles', groupOf: (dir: string) => string, out: Found[], budget: { visits: number }): Promise<void> {
  const go = async (dir: string, depth: number, viaLink = false): Promise<void> => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES || budget.visits > MAX_VISITS) return;
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    ents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of ents) {
      if (out.length >= MAX_FILES || ++budget.visits > MAX_VISITS) return;
      if (e.name.startsWith('.') || e.name.endsWith('.nosync')) continue;
      const p = path.join(dir, e.name);
      let isDir = e.isDirectory(), isFile = e.isFile();
      const link = e.isSymbolicLink();
      if (link) {
        // followed only while it stays inside the film's folder
        const real = await realOrUndefined(p);
        if (!real || !inside(fence, real)) continue;
        const st = await fs.stat(real).catch(() => undefined);
        isDir = !!st?.isDirectory(); isFile = !!st?.isFile();
      }
      if (isDir) { await go(p, depth + 1, viaLink || link); continue; }
      if (!isFile) continue;
      const kind = pictures === 'subtitles' ? (SUBS_EXT.test(e.name) ? 'subtitles' : undefined) : SOUND_EXT.test(e.name) ? 'sound' : pictures && VIDEO_EXT.test(e.name) ? 'picture' : undefined;
      if (!kind) continue;
      const st = await fs.stat(p).catch(() => undefined);
      if (!st || !st.size) continue;
      out.push({ abs: p, group: groupOf(dir), kind, st, viaLink: viaLink || link });
    }
  };
  await go(root, 0);
}

/** "20261113-101500-rain-loop.wav" → "rain-loop.wav": the time stamp uploads.ts puts in front. */
export const attachedName = (file: string): string => file.replace(/^\d{8}-\d{6}(?:-\d+)?-/, '');
const stemOf = (file: string): string => file.replace(/\.[^.]+$/, '');

// ---- lengths, cached by file, size and time
interface Measured { size: number; mtime: number; seconds?: number; audio?: boolean; width?: number; height?: number; cues?: number }
const g = globalThis as unknown as { __filmFiles?: { kept: Map<string, Measured>; busy: Map<string, Promise<void>> } };
const mem = (g.__filmFiles ??= { kept: new Map(), busy: new Map() });

function measure(abs: string, st: Stats): Promise<void> {
  const key = abs;
  const was = mem.busy.get(key);
  if (was) return was;
  // an .srt is read, not probed: its length is the end of its last cue
  const run = (SUBS_EXT.test(abs) ? fs.readFile(abs, 'utf8').then((t) => {
    const cues = parseSrt(t);
    mem.kept.set(key, { size: st.size, mtime: Math.floor(st.mtimeMs), seconds: cues.length ? Math.max(...cues.map((q) => q.b)) : undefined, cues: cues.length });
  }) : probe(abs).then((p) => {
    mem.kept.set(key, { size: st.size, mtime: Math.floor(st.mtimeMs), seconds: p?.duration, audio: p?.audio, width: p?.video?.width, height: p?.video?.height });
  })).catch(() => undefined).finally(() => mem.busy.delete(key));
  mem.busy.set(key, run);
  return run;
}
const keptFor = (abs: string, st: Stats): Measured | undefined => {
  const k = mem.kept.get(abs);
  return k && k.size === st.size && k.mtime === Math.floor(st.mtimeMs) ? k : undefined;
};

/** Measures what is not measured yet, a few at a time, for at most `budgetMs`; the rest go on in the background. */
async function measureAll(found: Found[], budgetMs: number): Promise<void> {
  const todo = found.filter((f) => !keptFor(f.abs, f.st));
  let next = 0;
  const worker = async () => { while (next < todo.length) { const f = todo[next++]; await measure(f.abs, f.st); } };
  const all = Promise.all(Array.from({ length: Math.min(PROBE_AT_ONCE, todo.length) }, worker));
  await Promise.race([all, new Promise((r) => setTimeout(r, budgetMs))]);
}

/** Every file of the film that can go on the timeline, and the files attached in the chat for it. */
export async function filmFiles(film: FilmTarget, opts: { budgetMs?: number } = {}): Promise<FilmFiles> {
  const fence = (await realOrUndefined(film.dir)) ?? film.dir;
  const found: Found[] = [];
  const budget = { visits: 0 };
  const rel = (dir: string) => {
    // the group is the folder as the film names it, through the link or not
    const real = path.relative(film.dir, dir);
    return real.split(path.sep).join('/') || '.';
  };
  for (const r of SOUND_ROOTS) {
    const abs = path.join(film.dir, ...r.split('/'));
    const real = await realOrUndefined(abs);
    if (!real || !inside(fence, real)) continue;
    // a folder listed twice (edits/ holds both kinds) is walked once, with pictures where allowed
    await walk(abs, fence, PICTURE_ROOTS.has(r), rel, found, budget);
  }
  // subtitles/ and social/: the .srt files only (the rest of social/ is the release kit)
  for (const r of SUBS_ROOTS) {
    const abs = path.join(film.dir, r);
    const real = await realOrUndefined(abs);
    if (real && inside(fence, real)) await walk(abs, fence, 'subtitles', rel, found, budget);
  }
  // cast/<who>/voice(s)/: each character's own voice files
  for (const who of await fs.readdir(path.join(film.dir, 'cast'), { withFileTypes: true }).catch(() => [])) {
    if (!who.isDirectory() || who.name.startsWith('.') || who.name.endsWith('.nosync')) continue;
    for (const v of ['voice', 'voices']) {
      const abs = path.join(film.dir, 'cast', who.name, v);
      const real = await realOrUndefined(abs);
      if (real && inside(fence, real)) await walk(abs, fence, false, rel, found, budget);
    }
  }
  // the files attached in the chat for this film (outside the film's folder until placed)
  const up = uploadsDir(film.slug);
  const upReal = await realOrUndefined(up);
  if (upReal) {
    for (const e of await fs.readdir(up, { withFileTypes: true }).catch(() => [])) {
      if (!e.isFile() || e.name.startsWith('.') || found.length >= MAX_FILES + 200) continue;
      const kind = SOUND_EXT.test(e.name) ? 'sound' : VIDEO_EXT.test(e.name) ? 'picture' : SUBS_EXT.test(e.name) ? 'subtitles' : undefined;
      if (!kind) continue;
      const abs = path.join(up, e.name);
      const st = await fs.stat(abs).catch(() => undefined);
      if (st?.size) found.push({ abs, group: ATTACHED, kind, st, upload: e.name });
    }
  }
  // the same file reached twice (a link inside the film) is listed once, where it really is
  const best = new Map<string, Found>();
  for (const f of found) {
    const k = `${f.st.dev}:${f.st.ino}:${f.upload ?? ''}`;
    const was = best.get(k);
    if (!was || (was.viaLink && !f.viaLink)) best.set(k, f);
  }
  const uniq = found.filter((f) => best.get(`${f.st.dev}:${f.st.ino}:${f.upload ?? ''}`) === f);
  await measureAll(uniq, opts.budgetMs ?? PROBE_BUDGET_MS);
  let waiting = 0;
  const files = uniq.map((f): FilmFile => {
    const m = keptFor(f.abs, f.st);
    if (!m) waiting++;
    const name = f.upload ? stemOf(attachedName(f.upload)) : stemOf(path.basename(f.abs));
    const src = f.upload ? `${film.show(film.dir)}/${addedDir(f.kind).join('/')}/${safeFileName(attachedName(f.upload))}` : film.show(f.abs);
    return {
      src, name, kind: f.kind, group: f.group, size: f.st.size, upload: f.upload,
      ...(m?.seconds ? { seconds: Math.round(m.seconds * 1e6) / 1e6 } : {}),
      ...(f.kind === 'subtitles' && m ? { cues: m.cues ?? 0 } : {}),
      ...(f.kind === 'picture' && m ? { audio: !!m.audio, width: m.width, height: m.height } : {}),
    };
  });
  return { files, waiting, ...(found.length >= MAX_FILES ? { truncated: true } : {}) };
}

// ---- an attached file into the film's folder

/** Where a file attached in the chat is copied when placed: sound to audio/added, video to edits/added, an .srt to
 *  subtitles/added. */
const addedDir = (kind: FilmFile['kind']): string[] => (kind === 'sound' ? ['audio', 'added'] : kind === 'subtitles' ? ['subtitles', 'added'] : ['edits', 'added']);

/** The words of an .srt file of the film (for "Split into lines to edit"): only an .srt inside the film's folder, at
 *  most 2 MB. */
export async function readSrt(film: FilmTarget, src: string): Promise<string> {
  if (typeof src !== 'string' || !SUBS_EXT.test(src)) throw new CutError('only an .srt file can be read here', 400);
  const abs = resolveSrc(film, src);
  const fence = (await realOrUndefined(film.dir)) ?? film.dir;
  const real = abs ? await realOrUndefined(abs) : undefined;
  if (!real || !inside(fence, real)) throw new CutError(`${src} is not an .srt of this film`, 404);
  const st = await fs.stat(real);
  if (st.size > 2 << 20) throw new CutError(`${src} is larger than 2 MB`, 400);
  return fs.readFile(real, 'utf8');
}

/** "Rain Loop (final).WAV" → "rain-loop-final.wav": letters, digits, dots and dashes, at most 80 long. */
export function safeFileName(name: string): string {
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? 'bin').toLowerCase();
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').normalize('NFKD').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/\.{2,}/g, '.').slice(0, 72).toLowerCase();
  return `${stem || 'file'}.${ext}`;
}

async function sha256Of(file: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}
async function sameBytes(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)]);
  if (sa.size !== sb.size) return false;
  return (await sha256Of(a)) === (await sha256Of(b));
}

export interface Adopted { src: string; name: string; reused: boolean }

/**
 * Copies a file attached in the chat (its name in harness/uploads/<film>/) into the film's folder, so a clip can
 * play it: sound into audio/added/, video into edits/added/, under its own name made safe. Never over a file: a
 * name that is taken by other bytes gets a number ("rain-loop-2.wav"); the same bytes already there are reused.
 * The copy is one line of harness/writes.log.
 */
export async function adoptUpload(film: FilmTarget, file: string, opts: { dryRun?: boolean } = {}): Promise<Adopted> {
  // a plain name of this film's uploads folder, and nothing reached through a link out of it
  if (typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(file) || file.includes('..')) throw new CutError('not a file attached for this film', 400);
  const kind = SOUND_EXT.test(file) ? 'sound' : VIDEO_EXT.test(file) ? 'picture' : SUBS_EXT.test(file) ? 'subtitles' : undefined;
  if (!kind) throw new CutError('only sound, video and .srt files can go on the timeline', 400);
  const up = uploadsDir(film.slug);
  const from = path.join(up, file);
  const [upReal, fromReal] = await Promise.all([realOrUndefined(up), realOrUndefined(from)]);
  if (!upReal || !fromReal || path.dirname(fromReal) !== upReal) throw new CutError('that attached file is not there', 404);
  const lst = await fs.lstat(from);
  if (!lst.isFile()) throw new CutError('that attached file is not a plain file', 400);
  // the destination folder: audio/added or edits/added, inside the film's own folder (no link leads out)
  const fence = (await realOrUndefined(film.dir)) ?? film.dir;
  const dirRel = addedDir(kind);
  const dir = path.join(film.dir, ...dirRel);
  for (let i = 1; i <= dirRel.length; i++) {
    const real = await realOrUndefined(path.join(film.dir, ...dirRel.slice(0, i)));
    if (real && !inside(fence, real)) throw new CutError(`${dirRel.slice(0, i).join('/')} leads out of the film's folder; nothing copied`, 400);
  }
  const safe = safeFileName(attachedName(file));
  const stem = stemOf(safe), ext = path.extname(safe);
  const writer = new Writer(`edit · add ${safe} by hand`, film.show, !!opts.dryRun);
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? safe : `${stem}-${n}${ext}`;
    const to = path.join(dir, name);
    const there = await fs.lstat(to).catch(() => undefined);
    if (there) {
      if (there.isFile() && (await sameBytes(fromReal, to))) return { src: film.show(to), name: stemOf(name), reused: true };
      continue;
    }
    try {
      await writer.copyNew(fromReal, to, `attached in the chat as ${attachedName(file)}`);
      return { src: film.show(to), name: stemOf(name), reused: false };
    } catch (e) {
      // another copy took the name first: try the next one
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new CutError('could not find a free name for the file', 409);
}

// ---- the frame at the playhead

/** The picture of `tl` at frame `f` as a PNG at its file's full size (mirrored when the clip is), and its name. */
export async function frameAt(film: FilmTarget, tl: Timeline, f: number): Promise<{ png: Buffer; name: string }> {
  const fps = tl.fps;
  const hit = pictureAt(tl, f);
  if (!hit) throw new CutError(`no picture at ${smpte(f / fps, fps)}`, 404);
  const c = hit.clip;
  const abs = resolveSrc(film, (c.src ?? ''));
  if (!abs) throw new CutError(`${c.src} is not a path of this film`, 400);
  const fence = (await realOrUndefined(film.repo)) ?? film.repo;
  const real = await realOrUndefined(abs);
  if (!real) throw new CutError(`${c.src} is not there`, 404);
  const filmReal = (await realOrUndefined(film.dir)) ?? film.dir;
  if (!inside(filmReal, real) && !inside(fence, real)) throw new CutError(`${c.src} is outside the film's folder`, 400);
  const p = await probe(real);
  const srcFps = p?.video?.fps || fps;
  // the frame shown at that point of the timeline, as seconds of the file; a quarter frame early, so a timestamp
  // rounded a hair under the frame's own time still picks that frame and not the next
  const t = c.in + ((f - startF(c, fps)) * speedOf(c)) / fps;
  const at = Math.max(0, t - 0.25 / srcFps);
  const png = await new Promise<Buffer>((resolve, reject) => {
    execFile(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-ss', at.toFixed(6), '-i', real, '-map', '0:v:0', '-frames:v', '1',
      ...(c.flip === 'h' ? ['-vf', 'hflip'] : []), '-f', 'image2', '-c:v', 'png', 'pipe:1'],
    { signal: AbortSignal.timeout(30000), maxBuffer: 64 << 20, encoding: 'buffer' }, (err, out) => {
      if (err || !out || !(out as Buffer).length) reject(new CutError(`the frame could not be read from ${c.src}`, 500));
      else resolve(out as Buffer);
    });
  });
  const tc = smpte(f / fps, fps).replace(/:/g, '-');
  return { png, name: `${film.slug}-${tl.version}-${tc}.png` };
}
