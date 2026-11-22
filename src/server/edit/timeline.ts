// The cut as the harness keeps it: one file per version, cut/v<n>.json in the film folder.
// Versions are never edited in place: every change is the next file, undo is a new version equal to an
// older one. The one in-place write is a version's `renders` field, after a render of it lands.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';
import { filmTarget, showPathFor, type FilmTarget } from '../actions/film';
import { Writer } from '../actions/writes';
import type { CutRenders, RenderInfo, Timeline, TimelineClip, TimelineMarker, TimelineTrack, TimelineVersionRef, TrackKind } from '../types';
import { madeOf } from '../types';
import { probe } from './probe';
import { renderPart, type RenderPart } from '@/components/edit/sameCut';

export class CutError extends Error {
  constructor(message: string, readonly status = 400, readonly problems: string[] = []) {
    super(message);
  }
}

export const CUT_DIR = 'cut';
export const RENDERS_DIR = 'cut/renders';
export const versionNum = (v: string): number => Number(/^v(\d+)$/.exec(v)?.[1] ?? NaN);
export const isVersion = (v: unknown): v is string => typeof v === 'string' && /^v\d{1,5}$/.test(v);
export const versionFile = (film: FilmTarget, v: string): string => path.join(film.dir, CUT_DIR, `${v}.json`);

export async function cutFilm(slug: string): Promise<FilmTarget> {
  const film = await filmTarget(slug);
  if (!film) throw new CutError(`no film folder for "${slug}"`, 404);
  return film;
}

/** cut/v<n>.json names, oldest first. */
export async function listVersions(film: FilmTarget): Promise<string[]> {
  const names = await fs.readdir(path.join(film.dir, CUT_DIR)).catch(() => [] as string[]);
  return names.map((n) => /^(v\d+)\.json$/.exec(n)?.[1]).filter((v): v is string => !!v).sort((a, b) => versionNum(a) - versionNum(b));
}

/** A clip's file on disk. `assets/…` is relative to the film repo (the contract's form); anything else is
 *  relative to the film folder. `..` and absolute paths are refused. */
export function resolveSrc(film: FilmTarget, src: string): string | undefined {
  if (!src || path.isAbsolute(src) || src.split(/[\\/]/).includes('..')) return undefined;
  return src.startsWith('assets/') ? path.join(film.repo, src) : path.join(film.dir, src);
}

export const frameOf = (sec: number, fps: number): number => Math.round(sec * fps);
/** Seconds → "00:01:10:00" at the film's fps. */
export function smpte(sec: number, fps: number): string {
  const f = Math.max(0, frameOf(sec, fps));
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (3600 * fps)))}:${p(Math.floor(f / (60 * fps)) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`;
}
/** How long a clip lasts on the timeline. */
export const clipLength = (c: TimelineClip): number => (c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);
export const clipEnd = (c: TimelineClip): number => c.at + clipLength(c);
/** The timeline's length: the end of its last clip that plays (muted tracks count: the page shows them). */
export function timelineLength(t: Pick<Timeline, 'tracks'>): number {
  let end = 0;
  for (const tr of t.tracks) for (const c of tr.clips) end = Math.max(end, clipEnd(c));
  return end;
}
/** What the picture and sound of a version are, without its name, note or renders: a proxy matches it. */
export function timelineHash(t: Pick<Timeline, 'fps' | 'width' | 'height' | 'tracks'>): string {
  return createHash('sha1').update(JSON.stringify({ fps: t.fps, width: t.width, height: t.height, tracks: t.tracks })).digest('hex').slice(0, 12);
}

// ---- validation

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const KINDS: TrackKind[] = ['video', 'audio', 'captions'];
const FPS = [24, 25, 30];
/** A track id becomes part of a stem's file name (render.ts) and so of an ffmpeg argument: a plain name only. */
export const TRACK_ID = /^[A-Za-z0-9_-]{1,32}$/;
/** The largest cut the harness renders: 4096 px a side, 20 minutes long (a short film is far below both), so a
 *  request cannot ask for a render that fills the disk or runs for hours. */
export const MAX_SIDE = 4096;
export const MAX_SECONDS = 20 * 60;
/** What is wrong with a cut's width and height, if anything (also used by the routes that take them). */
export function sizeProblem(width: unknown, height: unknown): string | undefined {
  if (!num(width) || !num(height) || width < 16 || height < 16) return 'width and height must be numbers';
  if (width > MAX_SIDE || height > MAX_SIDE) return `width and height must be ${MAX_SIDE} pixels or less`;
  return undefined;
}
/** A width or a height a route was sent: undefined when none was; refused (400) when it is not 16 to MAX_SIDE. */
export function sizeArg(v: unknown): number | undefined {
  if (typeof v !== 'number') return undefined;
  if (!num(v) || v < 16 || v > MAX_SIDE) throw new CutError(`width and height must be 16 to ${MAX_SIDE} pixels`);
  return v;
}

/** Checks a timeline's shape and its files; returns it normalised (clips in time order) or the problems.
 *  `files: false` skips the disk checks (a quick look before the full check). `base`, the version this one is
 *  based on: a clip past the end of its file is refused only when the base did not already read that far into
 *  the same file (old damage carried over does not block every later save; `checkFiles`). */
export async function validateTimeline(raw: unknown, film: FilmTarget, opts: { files?: boolean; base?: Pick<Timeline, 'tracks'> } = {}): Promise<{ timeline?: Timeline; problems: string[] }> {
  const problems: string[] = [];
  const t = raw as Partial<Timeline> | undefined;
  if (!t || typeof t !== 'object') return { problems: ['not an object'] };
  if (!isVersion(t.version)) problems.push('version must be "v<n>"');
  if (!FPS.includes(t.fps as number)) problems.push('fps must be 24, 25 or 30');
  const size = sizeProblem(t.width, t.height);
  if (size) problems.push(size);
  if (typeof t.at !== 'string') problems.push('at must be an ISO date');
  if (!Array.isArray(t.tracks) || !t.tracks.length) problems.push('tracks must be a non-empty list');
  if (t.markers !== undefined && !Array.isArray(t.markers)) problems.push('markers must be a list');
  if (problems.length) return { problems };
  const fps = t.fps!;
  const half = 0.5 / fps;
  const ids = new Set<string>();
  const clipIds = new Set<string>();
  const tracks: TimelineTrack[] = [];
  for (const [ti, tr] of t.tracks!.entries()) {
    const where = `track ${tr?.id ?? ti + 1}`;
    if (!tr || typeof tr.id !== 'string' || !tr.id) { problems.push(`${where}: id missing`); continue; }
    if (!TRACK_ID.test(tr.id)) { problems.push(`${where}: id must be 1 to 32 letters, digits, - or _ (it names files)`); continue; }
    if (ids.has(tr.id)) problems.push(`${where}: id used twice`);
    ids.add(tr.id);
    if (!KINDS.includes(tr.kind)) problems.push(`${where}: kind must be video, audio or captions`);
    if (!Array.isArray(tr.clips)) { problems.push(`${where}: clips must be a list`); continue; }
    const clips = [...tr.clips].sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0));
    if (clips.some((c, i) => c !== tr.clips[i])) problems.push(`${where}: clips are not in time order (sorted here; write them in order)`);
    let prevEnd = -Infinity;
    let prevId = '';
    for (const c of clips) {
      const cw = `${where} clip ${c?.id ?? '?'}`;
      if (!c || typeof c.id !== 'string' || !c.id) { problems.push(`${cw}: id missing`); continue; }
      if (clipIds.has(c.id)) problems.push(`${cw}: id used twice`);
      clipIds.add(c.id);
      // a planned clip (15 Nov, the timeline from day one): a line, a planned shot or a board, built by the app
      if (c.plan !== undefined) {
        const pp = planProblems(c, tr.kind, cw);
        if (pp.length) { problems.push(...pp); continue; }
        if (!num(c.in) || !num(c.out) || !num(c.at)) { problems.push(`${cw}: in, out and at must be numbers (seconds)`); continue; }
        // a line or a planned shot has in 0 (out is its length); a board is a still, so a head trimmed or a blade cut leaves in above 0
        if (c.plan !== 'board' && c.in !== 0) problems.push(`${cw}: a line or a planned shot has in 0 (out is its length in seconds)`);
        if (c.in < 0) problems.push(`${cw}: in must be 0 or more`);
        if (!(c.in < c.out)) problems.push(`${cw}: in (${c.in}) must be before out (${c.out})`);
        if (c.at < 0) problems.push(`${cw}: at must be 0 or more`);
        if (c.at < prevEnd - half) problems.push(`${cw}: overlaps ${prevId} on the same track (put one of them on another track)`);
        prevEnd = Math.max(prevEnd, clipEnd(c));
        prevId = c.id;
        continue;
      }
      // a subtitle line (14 Nov): words of its own and no file, on a captions track only
      const line = c.text !== undefined;
      if (line && c.src !== undefined) { problems.push(`${cw}: a captions clip has either text (a subtitle line) or src (an .srt file), not both`); continue; }
      if (line) {
        problems.push(...lineProblems(c, tr.kind, cw));
        if (!num(c.in) || !num(c.out) || !num(c.at)) { problems.push(`${cw}: in, out and at must be numbers (seconds)`); continue; }
      } else {
        if (c.src === undefined && tr.kind === 'captions') { problems.push(`${cw}: a captions clip needs text (a subtitle line) or src (an .srt file)`); continue; }
        if (typeof c.src !== 'string' || !resolveSrc(film, c.src)) { problems.push(`${cw}: src must be a path inside the film repo`); continue; }
        if (!num(c.in) || !num(c.out) || !num(c.at)) { problems.push(`${cw}: in, out and at must be numbers (seconds)`); continue; }
      }
      if (c.in < 0 || c.at < 0) problems.push(`${cw}: in and at must be 0 or more`);
      if (!(c.in < c.out)) problems.push(`${cw}: in (${c.in}) must be before out (${c.out})`);
      if (c.speed !== undefined && (!num(c.speed) || c.speed < 0.1 || c.speed > 10)) problems.push(`${cw}: speed must be between 0.1 and 10`);
      if (c.gain !== undefined && (!num(c.gain) || c.gain > 24 || c.gain < -96)) problems.push(`${cw}: gain must be dB between -96 and 24`);
      for (const k of ['fadeIn', 'fadeOut'] as const) if (c[k] !== undefined && (!num(c[k]) || c[k]! < 0 || c[k]! > clipLength(c) + half)) problems.push(`${cw}: ${k} must fit in the clip`);
      problems.push(...newFieldProblems(c, tr.kind, cw));
      if (!line && tr.kind === 'captions' && !/\.srt$/i.test(c.src!)) problems.push(`${cw}: a captions clip's src is an .srt file`);
      if (!line && tr.kind !== 'captions' && /\.srt$/i.test(c.src!)) problems.push(`${cw}: an .srt goes on a captions track`);
      if (c.at < prevEnd - half) problems.push(`${cw}: overlaps ${prevId} on the same track (put one of them on another track)`);
      prevEnd = Math.max(prevEnd, clipEnd(c));
      prevId = c.id;
    }
    problems.push(...dissolveProblems(clips, fps, where));
    tracks.push({ ...tr, clips });
  }
  const markers: TimelineMarker[] = [];
  for (const m of t.markers ?? []) {
    if (!m || !num(m.at) || typeof m.text !== 'string') problems.push('a marker needs at (seconds) and text');
    else markers.push(m);
  }
  if (!problems.length && timelineLength({ tracks }) > MAX_SECONDS) problems.push(`the cut is longer than ${MAX_SECONDS / 60} minutes`);
  if (opts.files !== false && !problems.length) problems.push(...(await checkFiles(film, tracks, fps, opts.base)));
  if (problems.length) return { problems };
  return { timeline: { ...(t as Timeline), tracks, markers }, problems };
}

/** A subtitle line: on a captions track, one or two rows of words (none empty), in 0 and out its length in seconds,
 *  and none of a picture's or a sound's fields (speed, gain, fades). */
function lineProblems(c: TimelineClip, kind: TrackKind, cw: string): string[] {
  const out: string[] = [];
  if (kind !== 'captions') out.push(`${cw}: text (a subtitle line) goes on a captions track`);
  if (typeof c.text !== 'string') return [...out, `${cw}: text must be a string`];
  const rows = c.text.split('\n');
  if (!c.text.trim()) out.push(`${cw}: a subtitle line's text is empty`);
  else if (rows.length > 2) out.push(`${cw}: a subtitle line has at most two rows (one "\\n")`);
  else if (rows.some((r) => !r.trim())) out.push(`${cw}: a row of a subtitle line is empty`);
  if (num(c.in) && c.in !== 0) out.push(`${cw}: a subtitle line has in 0 (out is its length in seconds)`);
  for (const k of ['speed', 'gain', 'fadeIn', 'fadeOut'] as const) if (c[k] !== undefined) out.push(`${cw}: a subtitle line has no ${k}`);
  return out;
}

const STILL = /\.(png|jpe?g|webp)$/i;
/** A planned clip (15 Nov): a line on a sound track, a planned shot or a board on a picture track; words of its own; a
 *  board's src a still image in the film repo; none of a take's sound fields. */
function planProblems(c: TimelineClip, kind: TrackKind, cw: string): string[] {
  const out: string[] = [];
  if (c.plan !== 'line' && c.plan !== 'shot' && c.plan !== 'board') return [`${cw}: plan is "line", "shot" or "board"`];
  if (c.plan === 'line' && kind !== 'audio') out.push(`${cw}: a line goes on a sound track (the Dialogue track)`);
  if (c.plan !== 'line' && kind !== 'video') out.push(`${cw}: a planned shot or a board goes on a picture track`);
  if (typeof c.text !== 'string' || !c.text.trim()) out.push(`${cw}: a planned clip has text (the words, or the shot's description)`);
  if (typeof c.scene !== 'string' || !c.scene) out.push(`${cw}: a planned clip names its scene`);
  if (c.plan === 'board') {
    if (typeof c.src !== 'string' || !resolveSrc({ dir: '/', repo: '/' } as FilmTarget, c.src) || !STILL.test(c.src)) out.push(`${cw}: a board's src is a still image (png, jpg or webp) inside the film repo`);
  } else if (c.src !== undefined) out.push(`${cw}: a line or a planned shot has no src`);
  if (c.panel !== undefined) {
    const p = c.panel as unknown as Record<string, unknown>;
    if (c.plan !== 'board') out.push(`${cw}: only a board is a panel`);
    else if (!p || typeof p !== 'object' || !Number.isInteger(p.k) || !Number.isInteger(p.of) || !Number.isInteger(p.n) || !num(p.s) || (p.k as number) < 1 || (p.k as number) > (p.of as number)) out.push(`${cw}: panel is {k, of (board k of the shot's of), n (its number in the storyboard), s (seconds in the scene)}`);
  }
  if (c.who !== undefined && typeof c.who !== 'string') out.push(`${cw}: who is a name`);
  if (c.inFrame !== undefined && typeof c.inFrame !== 'string') out.push(`${cw}: inFrame is words`);
  if (c.shot !== undefined && (!Number.isInteger(c.shot) || c.shot < 1)) out.push(`${cw}: shot is a whole number from 1`);
  if ((c.part !== undefined || c.parts !== undefined) && !(c.plan === 'line' && Number.isInteger(c.part) && Number.isInteger(c.parts) && c.part! >= 1 && c.part! <= c.parts!)) out.push(`${cw}: part and parts are whole numbers on a line, part 1 to parts`);
  if (c.timing !== undefined && typeof c.timing !== 'string') out.push(`${cw}: timing is words`);
  for (const k of ['speed', 'gainPoints', 'dissolve', 'flip'] as const) if (c[k] !== undefined) out.push(`${cw}: a planned clip has no ${k}`);
  return out;
}

/** The clip fields added for the render on 13 Nov (flip, dissolve, gainPoints): wrong types and out-of-range values. */
function newFieldProblems(c: TimelineClip, kind: TrackKind, cw: string): string[] {
  const out: string[] = [];
  if (c.flip !== undefined && (c.flip !== 'h' || kind !== 'video')) out.push(`${cw}: flip is "h" (mirrored left to right), on a picture clip only`);
  if (c.gainPoints !== undefined) {
    const pts = c.gainPoints as unknown;
    if (kind !== 'audio') out.push(`${cw}: gainPoints are for sound clips`);
    else if (!Array.isArray(pts) || !pts.length || pts.length > 500) out.push(`${cw}: gainPoints must be a list of 1 to 500 points {t, db}`);
    else if (!pts.every((p) => p && typeof p === 'object' && num((p as { t: unknown }).t) && num((p as { db: unknown }).db) && Object.keys(p).every((k) => k === 't' || k === 'db'))) out.push(`${cw}: each gain point is {t: seconds in the source file, db: number}`);
    else if (pts.some((p: { t: number; db: number }) => p.t < 0 || p.db < -96 || p.db > 24)) out.push(`${cw}: a gain point's t must be 0 or more and its db between -96 and 24`);
    else if (pts.some((p: { t: number }, i: number) => i > 0 && !(p.t > pts[i - 1].t))) out.push(`${cw}: gain points must be in time order, each later than the one before`);
  }
  if (c.dissolve !== undefined && (kind === 'captions' || !num(c.dissolve) || c.dissolve <= 0 || c.dissolve > 10)) out.push(`${cw}: dissolve must be seconds, more than 0 and at most 10, on a picture or sound clip`);
  return out;
}

/** A dissolve takes half its length from each of the two clips at its join: it must fit in both, with the clip
 *  before's own dissolve. A dissolve with no clip ending where it starts is allowed (it does nothing). */
function dissolveProblems(clips: TimelineClip[], fps: number, where: string): string[] {
  const out: string[] = [];
  const half = 0.5 / fps;
  for (const [i, c] of clips.entries()) {
    if (!c || !num(c.dissolve) || c.dissolve <= 0) continue;
    const next = clips[i + 1];
    const after = next && num(next.dissolve) && Math.abs(next.at - clipEnd(c)) < half ? next.dissolve / 2 : 0;
    if (c.dissolve / 2 + after > clipLength(c) + half) out.push(`${where} clip ${c.id}: dissolve ${c.dissolve} s does not fit in the clip (${clipLength(c).toFixed(3)} s) with the dissolve at its end`);
    const prev = clips[i - 1];
    if (prev && Math.abs(c.at - clipEnd(prev)) < half && c.dissolve / 2 > clipLength(prev) + half) out.push(`${where} clip ${c.id}: dissolve ${c.dissolve} s is longer than twice ${prev.id} before it`);
  }
  return out;
}

/** Every src exists and holds what its track needs, and no clip reads past the end of its file (1.5 frames of
 *  rounding allowed). A cut can already hold such a clip (written by hand, or its file changed since); when the
 *  version it is based on read as far into the same file, the clip is let through: the render holds its last
 *  frame or is silent for the rest, and the Edit page marks it. Only new damage is refused. */
async function checkFiles(film: FilmTarget, tracks: TimelineTrack[], fps: number, base?: Pick<Timeline, 'tracks'>): Promise<string[]> {
  const problems: string[] = [];
  const before = new Map<string, number>();         // per file, the furthest out the base version reads
  for (const tr of base?.tracks ?? []) for (const c of tr.clips ?? []) if (c && typeof c.src === 'string' && num(c.out)) before.set(c.src, Math.max(before.get(c.src) ?? 0, c.out));
  for (const tr of tracks) {
    for (const c of tr.clips) {
      if (c.src === undefined) continue;                 // a subtitle line has no file
      const file = resolveSrc(film, c.src)!;
      if (c.plan === 'board') {
        // a still: it exists; it has no length of its own (the board lasts as long as its planned shot)
        try { await fs.access(file); } catch { problems.push(`clip ${c.id}: ${c.src} does not exist`); }
        continue;
      }
      if (tr.kind === 'captions') {
        try {
          await fs.access(file);
        } catch {
          problems.push(`clip ${c.id}: ${c.src} does not exist`);
        }
        continue;
      }
      const p = await probe(file);
      if (!p) { problems.push(`clip ${c.id}: ${c.src} does not exist or is not a media file`); continue; }
      if (tr.kind === 'video' && !p.video) problems.push(`clip ${c.id}: ${c.src} has no picture (put it on an audio track)`);
      if (tr.kind === 'audio' && !p.audio) problems.push(`clip ${c.id}: ${c.src} has no sound`);
      if (p.duration !== undefined && c.out > p.duration + 1.5 / fps && !(c.out <= (before.get((c.src ?? '')) ?? -1) + 1e-6)) {
        problems.push(`clip ${c.id}${c.label ? ` (${c.label})` : ''} on ${tr.id}: out ${c.out} s is past the end of ${c.src} (${p.duration.toFixed(3)} s long, ${Math.round((c.out - p.duration) * fps)} f over)`);
      }
    }
  }
  return problems;
}

/** The length in seconds of every file a cut's clips play (picture and sound; captions files have none), for
 *  the Edit page: a trim or a moved join stops at a file's end. A file that cannot be read is left out. */
export async function sourceSeconds(film: FilmTarget, tracks: TimelineTrack[]): Promise<Record<string, number>> {
  const srcs = [...new Set(tracks.filter((t) => t.kind !== 'captions').flatMap((t) => t.clips.flatMap((c) => (c.src && !c.plan ? [c.src] : []))))];
  const out: Record<string, number> = {};
  let next = 0;
  const worker = async () => {
    while (next < srcs.length) {
      const src = srcs[next++];
      const file = resolveSrc(film, src);
      const p = file ? await probe(file) : undefined;
      if (p?.duration !== undefined && Number.isFinite(p.duration)) out[src] = Math.round(p.duration * 1e6) / 1e6;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, srcs.length) }, worker));
  return out;
}

// ---- reading

export async function readVersion(film: FilmTarget, version: string): Promise<Timeline> {
  if (!isVersion(version)) throw new CutError('version must be "v<n>"');
  let text: string;
  try {
    text = await fs.readFile(versionFile(film, version), 'utf8');
  } catch {
    throw new CutError(`${film.show(versionFile(film, version))} does not exist`, 404);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new CutError(`${version} is not valid JSON (${(e as Error).message.slice(0, 80)})`, 422);
  }
  const { timeline, problems } = await validateTimeline(raw, film, { files: false });
  if (!timeline) throw new CutError(`${version} does not read as a timeline`, 422, problems);
  if (timeline.version !== version) throw new CutError(`${version}.json says it is ${timeline.version}`, 422);
  return timeline;
}

/** The part of a version the master render reads (sameCut.ts renderPart), for comparing a render's cut with the cut
 *  now (ASKS 49). A version file is written once (writeNextVersion, never over a file); the one write in place is its
 *  `renders` field (recordRender), which this part leaves out. Cached by the file's path, size and time, so a file
 *  changed by hand is read again; one stat per call. Undefined when the version cannot be read. */
const parts = new Map<string, { size: number; mtimeMs: number; part: RenderPart }>();
export async function versionPart(film: FilmTarget, version: string): Promise<RenderPart | undefined> {
  if (!isVersion(version)) return undefined;
  const file = versionFile(film, version);
  const st = await fs.stat(file).catch(() => undefined);
  if (!st) return undefined;
  const had = parts.get(file);
  if (had && had.size === st.size && had.mtimeMs === st.mtimeMs) return had.part;
  const t = await readVersion(film, version).catch(() => undefined);
  if (!t) return undefined;
  const part = renderPart(t);
  if (parts.size > 200) parts.clear();
  parts.set(file, { size: st.size, mtimeMs: st.mtimeMs, part });
  return part;
}

export interface CutVersions { versions: TimelineVersionRef[]; current?: Timeline; problems: Record<string, string[]> }

/** Every version (a broken file is listed with its problems and skipped as current). */
export async function readVersions(film: FilmTarget): Promise<CutVersions> {
  const out: CutVersions = { versions: [], problems: {} };
  for (const v of await listVersions(film)) {
    try {
      const t = await readVersion(film, v);
      const made = madeOf(t);
      out.versions.push({ version: v, at: t.at, note: t.note, by: t.by, basedOn: t.basedOn, ...(made ? { made } : {}) });
      out.current = t;
    } catch (e) {
      out.problems[v] = e instanceof CutError && e.problems.length ? e.problems : [(e as Error).message];
    }
  }
  return out;
}

// ---- writing

export interface NewVersion {
  basedOn?: string;             // must be the current version (or absent when the film has none): a stale page cannot overwrite a newer change
  note?: string;
  by?: Timeline['by'];
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
  fps?: Timeline['fps'];
  width?: number;
  height?: number;
}

/** Validates and writes the next version file; returns it. The caller queues the proxy. */
export async function writeNextVersion(film: FilmTarget, input: NewVersion, opts: { action?: string } = {}): Promise<Timeline> {
  const versions = await listVersions(film);
  const last = versions[versions.length - 1];
  if ((input.basedOn ?? undefined) !== last)
    throw new CutError(last ? `the current version is ${last}, not ${input.basedOn ?? 'none'}: reload and apply the change to ${last}` : 'this film has no cut version yet; leave basedOn out', 409);
  const base = last ? await readVersion(film, last) : undefined;
  const version = `v${last ? versionNum(last) + 1 : 1}`;
  const fps = input.fps ?? base?.fps ?? 24;
  const t: Timeline = {
    version,
    fps,
    width: input.width ?? base?.width ?? 1080,
    height: input.height ?? base?.height ?? 1920,
    ...(last ? { basedOn: last } : {}),
    note: input.note?.trim() || undefined,
    by: input.by ?? 'user',
    at: new Date().toISOString(),
    tracks: input.tracks,
    markers: input.markers ?? base?.markers ?? [],
  };
  const { timeline, problems } = await validateTimeline(t, film, { base });
  if (!timeline) throw new CutError(`${version} not written: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, 422, problems);
  const w = new Writer(opts.action ?? `cut ${version}`, film.show);
  await w.writeNew(versionFile(film, version), JSON.stringify(timeline, null, 1) + '\n', timeline.note);
  serverWritten.add(versionFile(film, version));
  return timeline;
}

// The version files this server process wrote itself (every write goes through writeNextVersion), by path, so the
// cut watcher can tell them from a cut/v<n>.json written by hand (alma-drop.ts). Kept in memory only: after a restart
// the history's `saved` marks say the same (alma-drop.ts `handWritten`).
const gsw = globalThis as unknown as { __serverVersions?: Set<string> };
const serverWritten = (gsw.__serverVersions ??= new Set<string>());
/** Did this server process write cut/<version>.json (through writeNextVersion)? */
export const writtenByServer = (film: FilmTarget, version: string): boolean => serverWritten.has(versionFile(film, version));

/** The one in-place write: a version file's `renders` field, after its render lands. Everything else in the file
 *  is checked to be unchanged first; the write is a temp file renamed over it, logged like every other write. */
export async function recordRender(film: FilmTarget, version: string, kind: 'proxy' | 'master', info: RenderInfo): Promise<void> {
  const file = versionFile(film, version);
  const text = await fs.readFile(file, 'utf8');
  const j = JSON.parse(text) as Timeline;
  // a master made again (v<n>-master-2.mp4, masters.ts): the one before keeps its own record, under earlierMasters
  const was = j.renders?.[kind];
  const earlier = kind === 'master' && was && was.path !== info.path ? [...(j.renders?.earlierMasters ?? []).filter((x) => x.path !== was.path), was] : j.renders?.earlierMasters;
  const renders = { ...(j.renders ?? {}), [kind]: info, ...(earlier?.length ? { earlierMasters: earlier } : {}) };
  const next = JSON.stringify({ ...j, renders }, null, 1) + '\n';
  const tmp = `${file}.harness-tmp`;
  await fs.writeFile(tmp, next, { flag: 'wx' });
  if ((await fs.readFile(file, 'utf8')) !== text) {
    await fs.unlink(tmp);
    throw new Error(`${film.show(file)} changed while its render was recorded`);
  }
  await fs.rename(tmp, file);
  await logWrite(`cut ${version} render ${kind}`, 'write', film.show(file), `renders.${kind} only${kind === 'master' && was && was.path !== info.path ? ' (the master before it kept under renders.earlierMasters)' : ''}`);
}

/** A line of harness/writes.log in the Writer's format, for writes the Writer has no verb for. */
export async function logWrite(action: string, op: string, where: string, note?: string): Promise<void> {
  const log = path.join(claudeConfig().harnessDir, 'writes.log');
  await fs.mkdir(path.dirname(log), { recursive: true });
  await fs.appendFile(log, [new Date().toISOString(), action, op, where, note ?? ''].join('\t').replace(/\t+$/, '') + '\n');
}

export type { CutRenders };

/** A FilmTarget for a film the readers already found (its folder and repo), without another lookup. */
export function filmTargetOf(slug: string, dir: string, repo: string, title = slug): FilmTarget {
  return { slug, dir, repo, title, show: showPathFor(repo, dir) };
}
