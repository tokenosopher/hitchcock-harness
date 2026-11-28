// The options of a render (13 Nov): a loudness pass on the full mix, stems, tracks or clips left out, and (14 Nov,
// ASKS 56) a smaller file of the master: the same render encoded again smaller, its sound copied. A render
// with options writes new files beside the plain render, never over one: cut/renders/<version>-<kind>-<tag>.mp4,
// its stems as <version>-<kind>-<tag>.<what>.wav, and <version>-<kind>-<tag>.json listing what it wrote and measured.
// The plain proxy and master are untouched by all of this.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { RenderKind, RenderOptions, Timeline, TimelineTrack } from '../types';
import { FFMPEG } from './probe';
import { adopt, checkCancelled } from './render-job';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0 && x.length < 120);

/** Checks the options of a render request; an empty or absent set comes back as undefined (the plain render). */
export function parseRenderOptions(raw: unknown): { options?: RenderOptions; problems: string[] } {
  if (raw === undefined || raw === null) return { problems: [] };
  const problems: string[] = [];
  if (typeof raw !== 'object' || Array.isArray(raw)) return { problems: ['options must be an object'] };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!['loudness', 'stems', 'leaveOut', 'small'].includes(k)) problems.push(`options.${k} is not an option (loudness, stems, leaveOut, small)`);
  const out: RenderOptions = {};
  if (o.loudness !== undefined) {
    const l = o.loudness as Record<string, unknown> | null;
    if (!l || typeof l !== 'object') problems.push('options.loudness must be {lufs, truePeak?}');
    else {
      for (const k of Object.keys(l)) if (!['lufs', 'truePeak'].includes(k)) problems.push(`options.loudness.${k} is not known (lufs, truePeak)`);
      if (!num(l.lufs) || l.lufs < -40 || l.lufs > -5) problems.push('options.loudness.lufs must be a number of LUFS from -40 to -5');
      if (l.truePeak !== undefined && (!num(l.truePeak) || l.truePeak < -9 || l.truePeak > 0)) problems.push('options.loudness.truePeak must be a number of dBTP from -9 to 0');
      if (num(l.lufs)) out.loudness = { lufs: round1(l.lufs), truePeak: num(l.truePeak) ? round1(l.truePeak) : -1 };
    }
  }
  if (o.stems !== undefined) {
    if (typeof o.stems !== 'boolean') problems.push('options.stems must be true or false');
    else if (o.stems) out.stems = true;
  }
  if (o.leaveOut !== undefined) {
    const l = o.leaveOut as Record<string, unknown> | null;
    if (!l || typeof l !== 'object') problems.push('options.leaveOut must be {tracks?, clips?, cards?}');
    else {
      for (const k of Object.keys(l)) if (!['tracks', 'clips', 'cards'].includes(k)) problems.push(`options.leaveOut.${k} is not known (tracks, clips, cards)`);
      if (l.tracks !== undefined && !ids(l.tracks)) problems.push('options.leaveOut.tracks must be a list of track ids');
      if (l.clips !== undefined && !ids(l.clips)) problems.push('options.leaveOut.clips must be a list of clip ids');
      if (l.cards !== undefined && typeof l.cards !== 'boolean') problems.push('options.leaveOut.cards must be true or false');
      const tracks = ids(l.tracks) ? [...new Set(l.tracks)].sort() : [];
      const clips = ids(l.clips) ? [...new Set(l.clips)].sort() : [];
      if (tracks.length || clips.length || l.cards === true) out.leaveOut = { ...(tracks.length ? { tracks } : {}), ...(clips.length ? { clips } : {}), ...(l.cards === true ? { cards: true } : {}) };
    }
  }
  if (o.small !== undefined) {
    if (typeof o.small !== 'boolean') problems.push('options.small must be true or false');
    else if (o.small && out.stems) problems.push('options.small does not go with options.stems: the smaller file is the film with its sound in one file; ask for the separate files in a render of their own');
    else if (o.small) out.small = true;
  }
  if (problems.length) return { problems };
  return { options: Object.keys(out).length ? out : undefined, problems };
}

/** What the options cannot do on this kind of render: the smaller file is of the master only (the 480p is small already). */
export function kindProblems(kind: RenderKind, o: RenderOptions | undefined): string[] {
  return o?.small && kind !== 'master' ? ['options.small is for the master only: the 480p is already a small file; ask for kind "master"'] : [];
}

/** The options a smaller file is made from: the same ones without `small` (undefined: the plain master). */
export function withoutSmall(o: RenderOptions): RenderOptions | undefined {
  const { small: _small, ...rest } = o;
  void _small;
  return Object.keys(rest).length ? rest : undefined;
}

/** The smaller file's encode: x264 veryslow at CRF 21, the master's pixel format and colour tags (render.ts ENC). */
export const SMALL_PRESET = 'veryslow', SMALL_CRF = 21, SMALL_MIN_SSIM = 0.98;

/** Megabytes in words, as the pages write them: "60 MB", "1.4 GB". */
export const mbWords = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/** Whether a smaller file may be written, from what it measured against its source; the reason when not. The frames
 *  first, then the size (cheap), then the SSIM (measured last, only when the rest passed). */
export function smallVerdict(m: { frames: number; srcFrames: number; bytes: number; fromBytes: number; ssim?: number }): string | undefined {
  if (m.frames !== m.srcFrames) return `the smaller file has ${m.frames} frames, the one it came from ${m.srcFrames}: nothing written`;
  if (m.bytes >= m.fromBytes) return `the smaller file came out no smaller (${mbWords(m.bytes)} against ${mbWords(m.fromBytes)}): the normal one is the one to use`;
  if (m.ssim !== undefined && !(m.ssim >= SMALL_MIN_SSIM)) return `the smaller file lost too much: SSIM ${String(Math.floor(m.ssim * 1000) / 1000)}; nothing written`;
  return undefined;
}
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The options as a part of a file name: "without-cards-V3", "lufs14-tp1", "stems", "small", joined by "-" in that order. */
export function optionsTag(o: RenderOptions): string {
  const parts: string[] = [];
  const lo = o.leaveOut;
  if (lo) {
    const list = [...(lo.tracks ?? []), ...(lo.clips ?? [])].map((x) => x.replace(/[^A-Za-z0-9_.]+/g, '_'));
    let s = ['without', ...(lo.cards ? ['cards'] : []), ...list].join('-');
    if (s.length > 48) s = `without-${lo.cards ? 'cards-' : ''}${list.length}-${createHash('sha1').update(list.join('/')).digest('hex').slice(0, 8)}`;
    parts.push(s);
  }
  if (o.loudness) parts.push(`lufs${String(Math.abs(o.loudness.lufs))}-tp${String(Math.abs(o.loudness.truePeak ?? -1))}`);
  if (o.stems) parts.push('stems');
  // last, so that the smaller file's name is its source's with "-small": v235-master-lufs14-tp1-small.mp4
  if (o.small) parts.push('small');
  return parts.join('-');
}

export const isCard = (label: string | undefined): boolean => /^title card/i.test(label ?? '');

/** The timeline with what the options leave out muted (so it is neither drawn nor heard, and the length stays);
 *  the words for the render's log and state; refuses ids the version does not have. */
export function applyLeaveOut(t: Timeline, lo: RenderOptions['leaveOut']): { t: Timeline; left: string[] } {
  if (!lo) return { t, left: [] };
  const tracks = new Set(lo.tracks ?? []);
  const clips = new Set(lo.clips ?? []);
  const known = new Set(t.tracks.map((tr) => tr.id));
  const knownClips = new Set(t.tracks.flatMap((tr) => tr.clips.map((c) => c.id)));
  const missing = [...[...tracks].filter((x) => !known.has(x)).map((x) => `track ${x}`), ...[...clips].filter((x) => !knownClips.has(x)).map((x) => `clip ${x}`)];
  if (missing.length) throw new Error(`leave out: ${version(t)} has no ${missing.join(', ')}`);
  const left: string[] = [];
  const out: Timeline = {
    ...t,
    tracks: t.tracks.map((tr) => {
      if (tracks.has(tr.id)) {
        left.push(`track ${tr.id} ${tr.name}${tr.muted ? ' (already muted)' : ''}`);
        return { ...tr, muted: true };
      }
      return {
        ...tr,
        clips: tr.clips.map((c) => {
          const card = lo.cards && isCard(c.label);
          if (!clips.has(c.id) && !card) return c;
          if (!c.muted) left.push(`${tr.id} clip ${c.id}${c.label ? ` "${c.label}"` : ''}`);
          return { ...c, muted: true };
        }),
      };
    }),
  };
  return { t: out, left };
}
const version = (t: Timeline): string => t.version;

/** The dialogue tracks: the first audio track (A1 when there is one, the one the page links to the picture) and the
 *  tracks the page made beside it for overlapping sounds, named after it with a number ("Dialogue 2"). */
export function dialogueTracks(t: Pick<Timeline, 'tracks'>): Set<string> {
  const main = t.tracks.find((tr) => tr.id === 'A1') ?? t.tracks.find((tr) => tr.kind === 'audio');
  if (!main) return new Set();
  const esc = main.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const beside = new RegExp(`^${esc} \\d+$`);
  return new Set(t.tracks.filter((tr: TimelineTrack) => tr.kind === 'audio' && (tr.id === main.id || beside.test(tr.name))).map((tr) => tr.id));
}

/** A track's name as part of a file name. */
export const fileWord = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'track';

// ---- loudness

/** Runs ffmpeg and returns its stderr (where loudnorm and ebur128 print), or throws with the end of it. */
export function ffmpegText(args: string[], timeoutMs = 600000): Promise<string> {
  return new Promise((resolve, reject) => {
    try { checkCancelled(); } catch (e) { reject(e); return; }
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    adopt(p);   // kept on the render job it runs for, so a cancel stops it (render-job.ts)
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-200000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(err); else reject(new Error(`ffmpeg failed: ${err.slice(-1500)}`)); });
  });
}

export interface LoudnormMeasure { i: number; tp: number; lra: number; thresh: number; offset: number }

/** loudnorm's first pass on a sound file: what it measures, for the second pass. */
export async function measureLoudnorm(file: string, target: number, ceiling: number): Promise<LoudnormMeasure> {
  const err = await ffmpegText(['-i', file, '-af', `loudnorm=I=${target}:TP=${ceiling}:LRA=20:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1)) as Record<string, string>;
  return { i: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra), thresh: Number(j.input_thresh), offset: Number(j.target_offset) };
}

/** Integrated loudness and true peak of a file's sound by ebur128 (true peak on, 4× oversampled). */
export async function measureEbur128(file: string): Promise<{ i: number; tp: number }> {
  const err = await ffmpegText(['-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const i = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(sum)?.[1]?.replace('-inf', '-Infinity'));
  const tp = Number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum)?.[1]?.replace('-inf', '-Infinity'));
  return { i, tp };
}

/** The filter that brings a measured mix to the target. One gain for the whole mix when its true peak stays under
 *  the ceiling (`margin` lower, for the encoder's overshoot); else the gain and a lookahead limiter at the ceiling,
 *  run at 192 kHz so that its sample peaks are the true peaks (alimiter, delay compensated, no auto level).
 *  `extra` is added to the gain when a limited mix measured under the target (the limiter takes loudness away). */
export function loudnessFilter(m: LoudnormMeasure, target: number, ceiling: number, margin: number, extra = 0): { af: string; mode: 'linear' | 'limiter'; gain: number } {
  const gain = Math.round((target - m.i + extra) * 100) / 100;
  if (extra === 0 && m.tp + gain <= ceiling - margin) return { af: `volume=${gain}dB`, mode: 'linear', gain };
  const limit = Math.max(0.0625, Math.pow(10, (ceiling - margin) / 20));
  return { af: `aresample=192000,volume=${gain}dB,alimiter=limit=${limit.toFixed(5)}:attack=1:release=50:level=false:latency=true,aresample=48000`, mode: 'limiter', gain };
}
