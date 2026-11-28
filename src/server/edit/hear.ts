// "Hear it in the film": one option of a sound pick at one moment of the current cut, as a short clip with
// picture: the cut's 480p for the picture (its newest one), the cut's own sound in that stretch with the sound laid
// there now taken out, and the option laid in at its placement, gain and fades (components/feed/hearIt.ts piecesFor),
// from 2 s before it to 2 s after. Rendered by ffmpeg once per option, moment and content, and kept under the harness's
// own folder (harness/hear/<film>/, git-ignored), never in the film folder. A plain MP4 (H.264 and AAC, the moov first),
// which an iPhone plays inline. Two renders at a time; asking again for one being made waits for that one.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HearMoment, TimelineTrack } from '../types';
import { piecesFor, windowOf, type HearPiece, type HearWindow } from '@/components/feed/hearIt';
import { claudeConfig } from '../claude/config';
import { FFMPEG, probe } from './probe';
import { atempo, levels } from './render';
import { fadeFilters } from '@/components/edit/fades';

const f3 = (n: number): string => (Math.round(n * 1000) / 1000).toString();
const f6 = (n: number): string => (Math.round(n * 1e6) / 1e6).toString();

/** A piece with its file on disk. */
export type HearInput = HearPiece & { file: string };

/** The ffmpeg command of one clip. `picture`: the cut's 480p and the second of it the clip starts at; without one,
 *  black at `size`. Pure: scripts/hearit-test.ts. */
export function hearArgs(o: { pieces: HearInput[]; picture?: { file: string; start: number }; w: HearWindow; out: string; size?: { w: number; h: number } }): string[] {
  const D = o.w.end - o.w.start;
  const size = o.size ?? { w: 480, h: 854 };
  const inputs: string[] = [];
  const filters: string[] = [];
  if (o.picture) inputs.push('-ss', f6(o.picture.start), '-t', f6(D + 0.2), '-i', o.picture.file);
  else inputs.push('-f', 'lavfi', '-t', f6(D), '-i', `color=c=black:s=${size.w}x${size.h}:r=24`);
  // even sides (H.264 4:2:0), never wider than 480; a landscape film's never taller than 480
  const fit = size.w > size.h ? `scale=-2:'min(480,ih)'` : `scale='min(480,iw)':-2`;
  filters.push(`[0:v]trim=duration=${f6(D)},setpts=PTS-STARTPTS,${fit}:flags=bicubic,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p[vout]`);
  const mix: string[] = [];
  o.pieces.forEach((p, k) => {
    const i = k + 1;
    const len = (p.out - p.in) / p.speed;
    inputs.push('-ss', f6(p.in), '-t', f6(p.out - p.in), '-i', p.file);
    const chain = ['asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', ...levels(p, p.in), ...atempo(p.speed), `atrim=end=${f3(len)}`];
    if (p.gainDb) chain.push(`volume=${p.gainDb}dB`);
    if (p.fadeIn > 0 && p.fadeInFrom === undefined) chain.push(`afade=t=in:st=0:d=${f3(Math.min(p.fadeIn, len))}`);
    if (p.fadeOut > 0 && p.fadeOutTo === undefined) chain.push(`afade=t=out:st=${f3(Math.max(0, len - p.fadeOut))}:d=${f3(Math.min(p.fadeOut, len))}`);
    chain.push(...fadeFilters({ ...p, gain: p.gainDb }, 0));
    const ms = Math.round(p.at * 1000);
    if (ms > 0) chain.push(`adelay=${ms}:all=1`);
    filters.push(`[${i}:a]${chain.join(',')}[a${k}]`);
    mix.push(`[a${k}]`);
  });
  // a silent bed under the sum, so the sound runs the clip's whole length; no normalising (the gains are what is heard);
  // a few milliseconds of fade at both ends, so the clip does not click in or out
  filters.push(`anullsrc=r=48000:cl=stereo,atrim=end=${f6(D)}[bed]`);
  const ends = `apad=whole_dur=${f6(D)},atrim=end=${f6(D)},afade=t=in:st=0:d=0.06,afade=t=out:st=${f3(Math.max(0, D - 0.08))}:d=0.08[aout]`;
  filters.push(`[bed]${mix.join('')}amix=inputs=${mix.length + 1}:normalize=0:duration=first:dropout_transition=0,${ends}`);
  return ['-hide_banner', '-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-g', '12', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-t', f6(D), o.out];
}

/** What one clip is asked from: the cut's sound tracks, the moment, the option (undefined: the moment without any),
 *  the cut's 480p, the film's length, and how a clip's path is found on disk. */
export interface HearJob {
  film: string;
  tracks: TimelineTrack[];
  moment: HearMoment;
  option?: string;
  picture?: string;             // the 480p of the cut, on disk
  size?: { w: number; h: number };  // the cut's 480p size (render.ts outputSize): black at it when there is no picture
  filmEnd?: number;
  resolve: (src: string) => Promise<string | undefined>;
}
export interface HearClip { file: string; window: HearWindow; inCut?: string; pieces: number; skipped: string[] }

const g = globalThis as unknown as { __hearJobs?: { running: number; waiting: (() => void)[]; made: Map<string, Promise<HearClip>> } };
const Q = (g.__hearJobs ??= { running: 0, waiting: [] as (() => void)[], made: new Map<string, Promise<HearClip>>() });
const SLOTS = 2;
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (Q.running >= SLOTS) await new Promise<void>((r) => Q.waiting.push(r));
  Q.running++;
  try { return await fn(); } finally { Q.running--; Q.waiting.shift()?.(); }
}

export const hearDir = (film: string): string => path.join(claudeConfig().harnessDir, 'hear', film.replace(/[^a-z0-9-]/gi, '_'));

/** The clip of one option at one moment: made once, kept, and made again only when what it is made of changes. */
export async function hearClip(j: HearJob): Promise<HearClip> {
  const w = windowOf(j.moment, j.filmEnd);
  const { pieces, inCut } = piecesFor(j.tracks, j.moment, j.option, w);
  const inputs: HearInput[] = [];
  const skipped: string[] = [];
  for (const p of pieces) {
    const file = await j.resolve(p.src);
    const pr = file ? await probe(file) : undefined;
    if (!file || !pr?.audio) { skipped.push(p.what); continue; }
    inputs.push({ ...p, file });
  }
  const pic = j.picture ? await fs.stat(j.picture).then((s) => `${j.picture}@${s.mtimeMs}`).catch(() => undefined) : undefined;
  const stamps = await Promise.all(inputs.map((p) => fs.stat(p.file).then((s) => s.mtimeMs).catch(() => 0)));
  const key = createHash('sha1').update(JSON.stringify({ v: 1, w, pic, pieces: inputs.map((p, k) => ({ ...p, m: stamps[k] })) })).digest('hex').slice(0, 20);
  const dir = hearDir(j.film);
  const file = path.join(dir, `${key}.mp4`);
  const answer: HearClip = { file, window: w, ...(inCut ? { inCut } : {}), pieces: inputs.length, skipped };
  if (await fs.stat(file).then((s) => s.size > 0).catch(() => false)) return answer;
  const busy = Q.made.get(file);
  if (busy) return busy;
  const job = slot(async () => {
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${key}.part.mp4`);
    const args = hearArgs({ pieces: inputs, picture: pic ? { file: j.picture!, start: w.start } : undefined, w, out: tmp, ...(j.size ? { size: j.size } : {}) });
    await new Promise<void>((resolve, reject) => {
      execFile(FFMPEG, args, { signal: AbortSignal.timeout(90000), maxBuffer: 4 << 20 }, (err, _o, stderr) =>
        err ? reject(new Error(`the clip could not be made: ${String(stderr).trim().split('\n').slice(-2).join(' ').slice(0, 300) || err.message}`)) : resolve());
    });
    await fs.rename(tmp, file);
    return answer;
  });
  Q.made.set(file, job);
  try { return await job; } finally { Q.made.delete(file); }
}
