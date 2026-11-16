// What a source file holds (length, picture, sound), for the timeline checks and the render graph.
// ffprobe once per file and mtime; the answers are small and kept for the life of the server process.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { ffmpegBin, ffprobeBin } from '../config';

/** HARNESS_FFMPEG / HARNESS_FFPROBE, else the ones on the PATH. */
export const FFMPEG = ffmpegBin();
export const FFPROBE = ffprobeBin();

export interface Probe {
  duration?: number;            // seconds
  video?: { width: number; height: number; fps?: number; frames?: number };
  audio: boolean;
}

const g = globalThis as unknown as { __cutProbes?: Map<string, { mtime: number; probe: Probe }> };
const cache = (g.__cutProbes ??= new Map());

export async function probe(file: string): Promise<Probe | undefined> {
  let mtime: number;
  try {
    mtime = (await fs.stat(file)).mtimeMs;
  } catch {
    return undefined;
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.probe;
  const out = await new Promise<string | undefined>((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames', '-of', 'json', file],
      { signal: AbortSignal.timeout(15000), maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });
  if (!out) return undefined;
  try {
    const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }[] };
    const v = j.streams?.find((s) => s.codec_type === 'video' && s.width);
    const [a, b] = (v?.r_frame_rate ?? '').split('/').map(Number);
    const p: Probe = {
      duration: j.format?.duration ? Number(j.format.duration) : undefined,
      video: v ? { width: v.width!, height: v.height!, fps: a && b ? a / b : undefined, frames: v.nb_frames ? Number(v.nb_frames) : undefined } : undefined,
      audio: !!j.streams?.some((s) => s.codec_type === 'audio'),
    };
    cache.set(file, { mtime, probe: p });
    return p;
  } catch {
    return undefined;
  }
}

/** Frames of the video stream, counted (exact; slower than the header): the migration checks use it. */
export async function countFrames(file: string): Promise<number | undefined> {
  const out = await new Promise<string | undefined>((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file],
      { signal: AbortSignal.timeout(60000) }, (err, stdout) => resolve(err ? undefined : String(stdout).trim()));
  });
  const n = Number(out);
  return out && Number.isFinite(n) ? n : undefined;
}
