// The render: one ffmpeg command (filter_complex) per timeline, and the queue that runs them one at a time.
// Graph: the lowest video track is a concat of its clips and black gaps; each clip of a higher video
// track is overlaid at its time; captions are PNG cards (PIL, scripts/caption-cards.py) joined into one stream and
// overlaid; every audio clip is trimmed, retimed, given its gain and fades, delayed to its place and mixed (amix,
// no normalising, so the gains are what you hear). Video clips are picture only: a take's sound is its A-track twin.
// The 480p (fast, CRF 23, AAC 128k) and the master at the timeline's size (slow, CRF 18, AAC 192k) are both made
// only when asked for (14 Nov, ASKS 44: the Edit page, a marker file, QC of the cut); a new version is only checked
// (checkVersion), unless HARNESS_AUTO_480P=1 brings back the 480p of every version (afterNewVersion). The master's picture comes from the same pieces the Edit page's 1080p view plays
// (components/edit/fullsize.ts picturePieces, 14 Nov): each clip drawn from its best file of its own (the take redone in
// Seedance, its upscaled file, a card's full-size original, else its 480p scaled up), and over that, frame for frame, the
// stretches the upscaled cut (the base) already shows exactly as this cut draws them. A render with options.small (ASKS
// 56) is a master encoded again smaller (makeSmall): from the finished one when it is up to date, else made first.
import { hasPlanned, PLANNED_RENDER_WHY } from '@/components/edit/planned';
import { spawn, execFile } from 'node:child_process';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';
import { harnessConfig, pythonBin } from '../config';
import { childEnv } from '../childEnv';
import type { FilmTarget } from '../actions/film';
import { Writer } from '../actions/writes';
import type { CutRenders, RenderKind, RenderOptions, RenderSmall, RenderState, Timeline, TimelineClip, TimelineTrack } from '../types';
import { countFrames, FFMPEG, FFPROBE, probe } from './probe';
import { applyLeaveOut, dialogueTracks, ffmpegText, fileWord, kindProblems, loudnessFilter, mbWords, measureEbur128, measureLoudnorm, optionsTag, SMALL_CRF, SMALL_PRESET, smallVerdict, withoutSmall } from './render-options';
import { clipLength, CutError, cutFilm, frameOf, isVersion, logWrite, readVersion, recordRender, RENDERS_DIR, resolveSrc, smpte, timelineHash, timelineLength, validateTimeline } from './timeline';
import { parseSrt, type Cue } from '@/components/edit/subs';
import { baseFor, dissolveJoins, madeWords, picturePieces, pictureMade, videoLayout, type FullBase, type FullInfo, type Join, type Piece, type Placed } from '@/components/edit/fullsize';
import { shotTimeline } from '@/components/edit/shots';
import type { PictureMade } from '../types';
import { readFullSize } from './fullsize';
import { masterAge, masterLogRel, masterNo, masterRel, newestMaster, type MasterAge } from '@/components/edit/masters';
import { storedShots } from './shots';
import { adopt, checkCancelled, jobScope, RenderCancelled, stopJob, type JobProcs } from './render-job';

const CAPTION_SCRIPT = path.join(process.cwd(), 'scripts', 'caption-cards.py');

/** The plain render's file; `n`: a master made again (masters.ts: v231-master-2.mp4, then -3). */
export const renderRel = (version: string, kind: RenderKind, n = 1): string => (kind === 'master' ? masterRel(version, n) : `${RENDERS_DIR}/${version}-${kind}.mp4`);
export const logRel = (version: string, n = 1): string => masterLogRel(version, n);
export const masterRequestRel = (version: string): string => `${RENDERS_DIR}/${version}.master-requested`;
/** Alma's way to ask for the 480p of a version (recipes/edit.md): an empty file, as for the master. */
export const proxyRequestRel = (version: string): string => `${RENDERS_DIR}/${version}.proxy-requested`;
/** The 480p rendered after every change, as before 14 Nov: HARNESS_AUTO_480P=1 (config.ts). Off by default. */
export const auto480p = (): boolean => harnessConfig().auto480p;

const ENC: Record<RenderKind, string[]> = {
  proxy: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'],
  master: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '192k'],
};
/** The smaller file's picture (options.small, ASKS 56): the master's video encode with x264 veryslow at CRF 21, the
 *  same pixel format and colour tags; its sound is copied, not encoded. */
export const SMALL_VIDEO: string[] = (() => {
  const v = ENC.master.slice(0, ENC.master.indexOf('-c:a'));
  v[v.indexOf('-preset') + 1] = SMALL_PRESET;
  v[v.indexOf('-crf') + 1] = String(SMALL_CRF);
  return v;
})();

/** Output size: the master is the timeline's own size; the proxy is 480 on the short side (480×854 for 9:16). */
export function outputSize(t: Pick<Timeline, 'width' | 'height'>, kind: RenderKind): { w: number; h: number } {
  if (kind === 'master') return { w: even(t.width), h: even(t.height) };
  const short = Math.min(t.width, t.height);
  const long = even((480 * Math.max(t.width, t.height)) / short);
  return t.width <= t.height ? { w: 480, h: long } : { w: long, h: 480 };
}
const even = (n: number): number => 2 * Math.round(n / 2);
const f3 = (n: number): string => (Math.round(n * 1000) / 1000).toString();
const f6 = (n: number): string => (Math.round(n * 1e6) / 1e6).toString();

// ---- SRT

// parsed where the page can read it too (components/edit/subs.ts): the render and the page show the same cues
export { parseSrt, type Cue } from '@/components/edit/subs';

// ---- the graph

/** Which tracks are heard and seen: muted tracks drop out; when any audio track is solo, only solo tracks are heard. */
function playing(t: Timeline): { video: TimelineTrack[]; audio: TimelineTrack[]; captions: TimelineTrack[] } {
  const live = t.tracks.filter((tr) => !tr.muted);
  const audio = live.filter((tr) => tr.kind === 'audio');
  const solo = audio.filter((tr) => tr.solo);
  const order = (a: TimelineTrack, b: TimelineTrack): number => (Number(/\d+/.exec(a.id)?.[0] ?? 0) - Number(/\d+/.exec(b.id)?.[0] ?? 0)) || a.id.localeCompare(b.id);
  return {
    video: live.filter((tr) => tr.kind === 'video').sort(order),
    audio: solo.length ? solo : audio,
    captions: live.filter((tr) => tr.kind === 'captions'),
  };
}

/** The sound of a clip: the master reads the take's own full-size file beside a "…-480p.mp4" source when there is one
 *  ("…-1080p.mp4", else "…-1080p-up.mp4"), as it always has; the picture has its own rule (pictureFile). */
async function sourceFor(film: FilmTarget, c: TimelineClip, kind: RenderKind): Promise<string> {
  const file = resolveSrc(film, (c.src ?? ''))!;
  if (kind === 'master' && /-480p\./.test(file)) {
    for (const hi of [file.replace(/-480p\./, '-1080p.'), file.replace(/-480p\.([a-z0-9]+)$/i, '-1080p-up.$1')]) {
      try {
        await fs.access(hi);
        return hi;
      } catch { /* the next, else the 480p source, scaled */ }
    }
  }
  return file;
}

/** The master's picture plan: where each stretch comes from (picturePieces, the Edit page's own rule), what it is
 *  made from in counts, and which frames the base gives (`covered`). */
interface MasterPlan { info: FullInfo; base?: { b: FullBase; tl: Timeline }; pieces: Piece[]; made: PictureMade; covered: Uint8Array }
async function masterPlan(film: FilmTarget, t: Timeline, frames: number): Promise<MasterPlan> {
  const info = await readFullSize(film, [t]);
  const b = baseFor(info, t.version);
  const btl = b ? await readVersion(film, b.version).catch(() => undefined) : undefined;
  const base = b && btl ? { b, tl: btl } : undefined;
  const pieces = picturePieces(t, info, base);
  // counted by shot, the way the page counts them (a clip split at its take's shot cuts)
  const by = await storedShots(film).catch(() => new Map());
  const made = pictureMade(picturePieces(shotTimeline(t, by), info, base), b);
  const covered = new Uint8Array(frames);
  for (const p of pieces) if (p.kind === 'base') covered.fill(1, Math.max(0, p.from), Math.min(frames, p.to));
  return { info, base, pieces, made, covered };
}

/** A clip's picture file: in a master, its best file of its own, in the page's order (fullsize.ts): the take redone
 *  in Seedance, its upscaled file, a made piece's full-size original, else the clip's own file (scaled up). */
function pictureFile(film: FilmTarget, c: TimelineClip, plan?: MasterPlan): string {
  const src = c.src ?? '';
  const own = plan ? (plan.info.takes[src] ?? plan.info.upscaled?.[src] ?? plan.info.originals?.[src]) : undefined;
  return resolveSrc(film, own ?? src)!;
}

/** The dissolves of one track's clips (fullsize.ts dissolveJoins); the summary says which were left out. */
function joinsOf(clips: Placed[], fps: number, summary: string[], track: string): (Join | undefined)[] {
  const { joins: out, dropped } = dissolveJoins(clips, fps);
  for (const id of dropped) summary.push(`${track}: dissolve on ${id} left out (no clip ends where it starts)`);
  const made = out.filter((j): j is Join => !!j);
  if (made.length) summary.push(`${track}: ${made.length} dissolve${made.length === 1 ? '' : 's'} (${made.map((j) => `${j.D} f`).join(', ')})`);
  return out;
}

/** One sound stream of a render with stems: its output label in the graph, and what it holds. */
export interface StemOut { label: string; name: string; what: string }
export interface Graph {
  args: string[]; frames: number; seconds: number; inputs: number; summary: string[];
  inputArgs: string[]; script: string;   // for renders with options, which map the graph's outputs to several files
  stems: StemOut[];                      // with opts.stems: [vout] and [aout] plus these
  picture?: PictureMade;                 // a master: what its picture is made from
}
export interface GraphOptions {
  /** A silent bed from 0 under every sum, so that every sum starts at 0 whatever its sounds (the plain render's
   *  sound stream starts at its first sound when every sound starts late, which a player places right but a
   *  WAV cannot carry). Renders with options use it; the plain ones are left as they were. */
  bed?: boolean;
  /** Stems: each sound track summed alone, then the dialogue tracks (these ids), everything else, and the mix. */
  stems?: { dialogue: Set<string> };
}

export async function buildGraph(film: FilmTarget, t: Timeline, kind: RenderKind, out: string, scratch: string, opts: GraphOptions = {}): Promise<Graph> {
  const { w, h } = outputSize(t, kind);
  const fps = t.fps;
  const frames = Math.max(1, frameOf(timelineLength(t), fps));
  const T = frames / fps;
  const inputs: string[][] = [];
  const filters: string[] = [];
  const summary: string[] = [];
  const addInput = (args: string[]): number => inputs.push(args) - 1;
  // the master is written as BT.709: each picture is brought to it as it comes in (an untagged file is read as BT.601,
  // as the encoder used to convert the whole picture), so a file already in BT.709, the upscaled cut, goes in untouched
  const bt709 = kind === 'master' ? ',setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv' : '';
  const fit = kind === 'master'
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos:out_color_matrix=bt709:out_range=tv,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1${bt709}`
    : `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  const { video, audio, captions } = playing(t);
  // the master: the page's pieces; a clip whose every frame (dissolves included) the base gives is not drawn at all
  const plan = kind === 'master' ? await masterPlan(film, t, frames) : undefined;
  const allBase = (a: number, b: number): boolean => {
    if (!plan) return false;
    for (let f = Math.max(0, a); f < Math.min(frames, b); f++) if (!plan.covered[f]) return false;
    return true;
  };
  /** In a master, the joins whose whole dissolve the base gives are not drawn (the base has them). */
  const liveJoins = (on: Placed[], joins: (Join | undefined)[]): (Join | undefined)[] =>
    joins.map((j, i) => (j && allBase(on[i].start - j.h1, on[i].start + j.h2) ? undefined : j));
  const needed = (e: Placed, jin?: Join, jout?: Join): boolean => !allBase(e.start - (jin?.h1 ?? 0), e.start + e.n + (jout?.h2 ?? 0));

  /** One clip's picture: its source frames, retimed, at the film's fps, exactly as many frames as it lasts.
   *  `pre` and `post` (dissolves) add frames before and after it: the source's own frames beyond its in and out
   *  points when the file has them, else its first or last frame held. Its fades stay at its own start and end. */
  const pictureOf = async (c: TimelineClip, label: string, alpha: boolean, pre = 0, post = 0): Promise<number> => {
    const speed = c.speed && c.speed > 0 ? c.speed : 1;
    const n = Math.max(1, frameOf(c.at + clipLength(c), fps) - frameOf(c.at, fps));
    // trimmed on the decoded stream, not seeked: input seeking can land a frame off, which shows on fast shots
    const i = addInput(['-i', kind === 'master' ? pictureFile(film, c, plan) : await sourceFor(film, c, kind)]);
    const fromSrc = Math.min(pre, Math.floor((c.in * fps) / speed + 1e-6));   // frames before `in` the file has
    const hold = pre - fromSrc;
    const total = pre + n + post;
    const chain = [`trim=start=${f6(Math.max(0, c.in - (fromSrc * speed) / fps - 0.5 / fps))}`, `setpts=(PTS-STARTPTS)/${speed}`, `fps=${fps}`, ...(hold ? [`tpad=start_mode=clone:start=${hold}`] : []), `tpad=stop_mode=clone:stop=${total}`, `trim=end_frame=${total}`, 'setpts=PTS-STARTPTS', ...(c.flip === 'h' ? ['hflip'] : []), fit, alpha ? 'format=yuva420p' : 'format=yuv420p'];
    const len = n / fps;
    const st = pre / fps;
    if (c.fadeIn) chain.push(`fade=t=in:st=${f3(st)}:d=${f3(c.fadeIn)}${alpha ? ':alpha=1' : ''}`);
    if (c.fadeOut) chain.push(`fade=t=out:st=${f3(st + Math.max(0, len - c.fadeOut))}:d=${f3(c.fadeOut)}${alpha ? ':alpha=1' : ''}`);
    filters.push(`[${i}:v]${chain.join(',')}[${label}]`);
    return n;
  };

  /** A clip's picture cut in the pieces its dissolves need: `head` (the frames that dissolve in, from h1 before
   *  its start to h2 after), `solo` (what plays alone), `tail` (the frames that dissolve out). A clip without
   *  dissolves is one piece, made exactly as before dissolves existed. */
  const piecesOf = async (e: Placed, label: string, alpha: boolean, jin?: Join, jout?: Join): Promise<{ head?: string; solo?: string; tail?: string }> => {
    if (!jin && !jout) {
      await pictureOf(e.c, label, alpha);
      return { solo: label };
    }
    const pre = jin?.h1 ?? 0, post = jout?.h2 ?? 0;
    await pictureOf(e.c, `${label}x`, alpha, pre, post);
    const a = pre + (jin?.h2 ?? 0), b = pre + e.n - (jout?.h1 ?? 0);
    const parts: [string, number, number][] = [];
    if (jin) parts.push([`${label}h`, 0, a]);
    if (b > a) parts.push([label, a, b]);
    if (jout) parts.push([`${label}t`, b, pre + e.n + post]);
    filters.push(`[${label}x]split=${parts.length}${parts.map(([l]) => `[${l}s]`).join('')}`);
    for (const [l, from, to] of parts) filters.push(`[${l}s]trim=start_frame=${from}:end_frame=${to},setpts=PTS-STARTPTS[${l}]`);
    return { head: jin ? `${label}h` : undefined, solo: b > a ? label : undefined, tail: jout ? `${label}t` : undefined };
  };
  /** The dissolve's frames: the outgoing tail and the incoming head mixed, the incoming one's share rising from
   *  1/(D+1) to D/(D+1), so the middle of the stretch is half and half and neither end is a plain frame. */
  const dissolve = (tail: string, head: string, j: Join, label: string): void => {
    // by the frame's time (T from 0 in the stretch): blend's frame counter N does not start at 0
    const k = `(T*${fps}+1)/${j.D + 1}`;
    filters.push(`[${tail}][${head}]blend=all_expr=A*(1-${k})+B*${k}[${label}]`);
  };

  // the lowest video track: concat of clips and black gaps, to the timeline's end
  const [base, ...upper] = video;
  const segs: string[] = [];
  let cursor = 0;
  let gapN = 0;
  const black = (n: number): void => {
    const l = `g${gapN++}`;
    filters.push(`color=c=black:s=${w}x${h}:r=${fps}:d=${f3(n / fps + 1)},trim=end_frame=${n},setsar=1,format=yuv420p${bt709}[${l}]`);
    segs.push(`[${l}]`);
  };
  const placed: Placed[] = [];
  for (const [k, c] of (base?.clips ?? []).filter((c) => !c.muted).entries()) {
    const start = frameOf(c.at, fps);
    if (start < cursor) continue;               // validated away; a stray overlap is skipped, not stacked
    placed.push({ c, k, start, n: Math.max(1, frameOf(c.at + clipLength(c), fps) - start) });
    cursor = start + placed[placed.length - 1].n;
  }
  cursor = 0;
  const baseJoins = liveJoins(placed, joinsOf(placed, fps, summary, base?.id ?? ''));
  let skipped = 0;
  for (const [i, e] of placed.entries()) {
    if (!needed(e, baseJoins[i], baseJoins[i + 1])) { skipped++; continue; }
    if (e.start > cursor) black(e.start - cursor);
    const p = await piecesOf(e, `b${e.k}`, false, baseJoins[i], baseJoins[i + 1]);
    if (p.head) {
      dissolve(`b${placed[i - 1].k}t`, p.head, baseJoins[i]!, `b${e.k}d`);
      segs.push(`[b${e.k}d]`);
    }
    if (p.solo) segs.push(`[${p.solo}]`);
    cursor = e.start + e.n;
  }
  if (cursor < frames) black(frames - cursor);
  filters.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[vb0]`);
  summary.push(`${base?.id ?? 'black'}: ${base?.clips.length ?? 0} clips + ${gapN} black gaps, concat${skipped ? ` (${skipped} given whole by the upscaled cut, not drawn)` : ''}`);
  let v = 'vb0';
  let ov = 0;
  /** Lays a stream over the picture from frame `at`. `exact`: placed by the frame itself, not by its time rounded to
   *  a millisecond (which, rounded up, starts it a frame late; the older overlays keep their rounding, so the 480p
   *  stays as it was). */
  /** Lays a picture over everything drawn so far from frame `at`; with `upto`, shown only up to that frame (not kept). */
  const over = (label: string, at: number, exact = false, upto?: number): void => {
    const l = `o${ov}`;
    filters.push(`[${label}]setpts=PTS+${exact ? `${at}/(${fps}*TB)` : `${f3(at / fps)}/TB`}[${l}]`);
    const only = upto !== undefined ? `enable='between(n,${at},${upto - 1})':` : '';
    filters.push(`[${v}][${l}]overlay=${only}eof_action=pass:repeatlast=0:format=auto[v${ov + 1}]`);
    v = `v${ov + 1}`;
    ov++;
  };
  for (const [ti, tr] of upper.entries()) {
    let n = 0;
    const on = tr.clips.filter((c) => !c.muted).map((c, k) => { const start = frameOf(c.at, fps); return { c, k, start, n: Math.max(1, frameOf(c.at + clipLength(c), fps) - start) }; });
    const joins = liveJoins(on, joinsOf(on, fps, summary, tr.id));
    for (const [i, e] of on.entries()) {
      if (!needed(e, joins[i], joins[i + 1])) continue;
      if (!joins[i] && !joins[i + 1]) {
        // exactly as before dissolves existed
        await pictureOf(e.c, `o${ov}p`, true);
        over(`o${ov}p`, e.start);
      } else {
        const label = `u${ti}c${i}`;
        const p = await piecesOf(e, label, true, joins[i], joins[i + 1]);
        if (p.head) {
          dissolve(`u${ti}c${i - 1}t`, p.head, joins[i]!, `${label}d`);
          over(`${label}d`, e.start - joins[i]!.h1);
        }
        if (p.solo) over(p.solo, e.start + (joins[i]?.h2 ?? 0));
      }
      n++;
    }
    summary.push(`${tr.id}: ${n} clips overlaid at their times`);
  }

  // the master: the stretches the upscaled cut gives, cut out of it by frame and laid over everything drawn so far
  if (plan?.base) {
    const bfps = plan.base.tl.fps;
    const file = resolveSrc(film, plan.base.b.path)!;
    const layout = new Map(videoLayout(t).flatMap((L) => L.clips.map((e) => [e.c, e] as const)));
    const G = (p: Piece) => Math.round(p.t0 * bfps);
    const one = (p: Piece) => Math.abs(p.rate - 1) < 1e-9;
    // neighbours that continue in the base become one stretch (an unchanged cut is a single one)
    const runs: Piece[] = [];
    for (const p of plan.pieces.filter((x) => x.kind === 'base').sort((a, b) => a.from - b.from)) {
      const l = runs[runs.length - 1];
      if (l && l.to === p.from && one(l) && one(p) && !l.fades && !p.fades && G(p) === G(l) + (l.to - l.from)) runs[runs.length - 1] = { ...l, to: p.to };
      else runs.push({ ...p });
    }
    for (const [k, p] of runs.entries()) {
      const len = p.to - p.from, g0 = G(p);
      // seeked to half a frame before the first frame wanted, so it is the first one kept; then counted by frames
      const i = addInput([...(g0 > 0 ? ['-ss', f6((g0 - 0.5) / bfps)] : []), '-i', file]);
      const chain = one(p)
        ? [`trim=end_frame=${len}`, `setpts=N/(${fps}*TB)`]
        : [`setpts=(PTS-STARTPTS)/${f6(p.rate)}`, `fps=${fps}`, `trim=end_frame=${len}`, `setpts=N/(${fps}*TB)`];
      chain.push(fit, 'format=yuv420p');
      const e = layout.get(p.clip);
      if (p.fades && e) {
        // a fade the base does not have (fullsize.ts): drawn as pictureOf draws it, by the frame's place in its clip
        const o = p.from - e.start, c = e.c;
        chain.push(`tpad=start=${Math.max(0, o)}`);
        if (c.fadeIn) chain.push(`fade=t=in:st=0:d=${f3(c.fadeIn)}`);
        if (c.fadeOut) chain.push(`fade=t=out:st=${f3(Math.max(0, e.n / fps - c.fadeOut))}:d=${f3(c.fadeOut)}`);
        chain.push(`trim=start_frame=${Math.max(0, o)}`, `setpts=N/(${fps}*TB)`);
      }
      // The stretch's last frame was lost (one black frame at the end of every stretch cut with a
      // seek, seen as a flicker before S6 shot 1 and S7 shot 2): the overlay took the stretch as ended at that frame.
      // One copy of the last frame is added after it, and the stretch is shown only over its own frames, so every frame
      // of it is there and the copy is never seen. Tried on v87's own graph: the four black frames gone, nothing else.
      chain.push('tpad=stop=1:stop_mode=clone');
      filters.push(`[${i}:v]${chain.join(',')}[bp${k}]`);
      over(`bp${k}`, p.from, true, p.to);
    }
    summary.push(`upscaled cut: ${plan.base.b.path} (${plan.base.b.version}), ${runs.length} stretch${runs.length === 1 ? '' : 'es'} laid over the picture, cut by frame`);
  }
  if (plan) {
    const m = plan.made;
    summary.push(`picture: ${madeWords(m).map((x) => x.text).join(' · ') || 'nothing'} (${m.sources.map((s) => `${s.kind} ${s.shots} shots, ${s.frames} frames`).join('; ')})`);
  }

  // captions: cues of every captions clip, shifted to the timeline, drawn as cards, one overlaid stream
  const cues: Cue[] = [];
  for (const tr of captions) {
    for (const c of tr.clips.filter((c) => !c.muted)) {
      // a subtitle line (14 Nov): its own words, drawn as a cue's are
      if (c.src === undefined) {
        if (typeof c.text === 'string' && c.text.trim()) cues.push({ a: c.at, b: c.at + clipLength(c), lines: c.text.split('\n') });
        continue;
      }
      const text = await fs.readFile(resolveSrc(film, c.src)!, 'utf8').catch(() => '');
      for (const q of parseSrt(text)) {
        const a = Math.max(q.a, c.in);
        const b = Math.min(q.b, c.out);
        if (b > a) cues.push({ a: c.at + a - c.in, b: c.at + b - c.in, lines: q.lines });
      }
    }
  }
  if (cues.length) {
    const job = path.join(scratch, 'captions.json');
    await fs.writeFile(job, JSON.stringify({ width: w, height: h, duration: T, out_dir: path.join(scratch, 'captions'), font_roots: [film.repo, harnessConfig().filmRepo], cues }));
    const list = await new Promise<string>((resolve, reject) => {
      execFile(pythonBin(), [CAPTION_SCRIPT, job], { timeout: 120000, env: childEnv({ PYTHONDONTWRITEBYTECODE: '1' }) }, (err, stdout, stderr) =>
        err ? reject(new Error(`caption cards failed: ${String(stderr).slice(-300)}`)) : resolve(String(stdout).trim().split('\n').pop()!));
    });
    const i = addInput(['-f', 'concat', '-safe', '0', '-i', list]);
    filters.push(`[${i}:v]format=rgba,fps=${fps},setpts=PTS-STARTPTS[cap]`, `[${v}][cap]overlay=0:0:eof_action=pass:repeatlast=0[vcap]`);
    v = 'vcap';
    summary.push(`captions: ${cues.length} cues as PNG cards, one overlay`);
  }
  filters.push(`[${v}]trim=end_frame=${frames},setpts=PTS-STARTPTS,format=yuv420p[vout]`);

  // sound
  const mix: string[] = [];
  const byTrack = new Map<string, string[]>();
  for (const tr of audio) {
    byTrack.set(tr.id, []);
    const on = tr.clips.filter((c) => !c.muted).map((c, k) => { const start = frameOf(c.at, fps); return { c, k, start, n: Math.max(1, frameOf(c.at + clipLength(c), fps) - start) }; });
    const joins = joinsOf(on, fps, summary, tr.id);
    for (const [ci, { c }] of on.entries()) {
      const file = await sourceFor(film, c, kind);
      if (!(await probe(file))?.audio) continue;
      const speed = c.speed && c.speed > 0 ? c.speed : 1;
      const len = clipLength(c);
      const i = addInput(['-i', file]);
      const jin = joins[ci], jout = joins[ci + 1];
      let chain: string[];
      if (!jin && !jout) {
        // exactly as before dissolves existed
        chain = [`atrim=start=${f6(c.in)}:end=${f6(c.out)}`, 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', ...levels(c, c.in), ...atempo(speed), `atrim=end=${f3(len)}`];
        if (c.gain) chain.push(`volume=${c.gain}dB`);
        if (c.fadeIn) chain.push(`afade=t=in:st=0:d=${f3(c.fadeIn)}`);
        if (c.fadeOut) chain.push(`afade=t=out:st=${f3(Math.max(0, len - c.fadeOut))}:d=${f3(c.fadeOut)}`);
        const ms = Math.round(c.at * 1000);
        if (ms > 0) chain.push(`adelay=${ms}:all=1`);
      } else {
        // a cross-fade at a join: the outgoing sound runs on h2 frames past its end and fades out, the incoming one
        // starts h1 frames early and fades in, both linear over the same D frames; silence where a file has no more
        const pre = (jin?.h1 ?? 0) / fps, post = (jout?.h2 ?? 0) / fps;
        const srcStart = Math.max(0, c.in - pre * speed);
        const silent = pre - (c.in - srcStart) / speed;
        const total = pre + len + post;
        chain = [`atrim=start=${f6(srcStart)}:end=${f6(c.out + post * speed)}`, 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', ...levels(c, srcStart), ...atempo(speed),
          ...(silent > 1e-6 ? [`adelay=${Math.round(silent * 48000)}S:all=1`] : []), `apad=whole_dur=${f6(total)}`, `atrim=end=${f6(total)}`];
        if (c.gain) chain.push(`volume=${c.gain}dB`);
        if (c.fadeIn) chain.push(`afade=t=in:st=${f6(pre)}:d=${f3(c.fadeIn)}`);
        if (c.fadeOut) chain.push(`afade=t=out:st=${f6(pre + Math.max(0, len - c.fadeOut))}:d=${f3(c.fadeOut)}`);
        if (jin) chain.push(`afade=t=in:st=0:d=${f6(jin.D / fps)}`);
        if (jout) chain.push(`afade=t=out:st=${f6(total - jout.D / fps)}:d=${f6(jout.D / fps)}`);
        const at = Math.round((c.at - pre) * 48000);
        if (at > 0) chain.push(`adelay=${at}S:all=1`);
      }
      const l = `a${mix.length}`;
      filters.push(`[${i}:a]${chain.join(',')}[${l}]`);
      mix.push(`[${l}]`);
      byTrack.get(tr.id)!.push(`[${l}]`);
    }
  }
  /** Sums sound streams (no normalising) and pads or cuts the sum to the timeline's length. */
  const sum = (ins0: string[], label: string): void => {
    const tail = `apad=whole_dur=${f3(T)},atrim=end=${f3(T)}[${label}]`;
    const ins = [...ins0];
    if (opts.bed && ins.length) {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=end=${f3(T)}[bed${label}]`);
      ins.unshift(`[bed${label}]`);
    }
    if (!ins.length) filters.push(`anullsrc=r=48000:cl=stereo,${tail}`);
    else if (ins.length === 1) filters.push(`${ins[0]}${tail}`);
    else filters.push(`${ins.join('')}amix=inputs=${ins.length}:normalize=0:duration=longest:dropout_transition=0,${tail}`);
  };
  const stems: StemOut[] = [];
  if (!opts.stems) sum(mix, 'aout');
  else {
    // each track alone, split three ways: into the mix, into its group (dialogue or the rest), and its own stem
    const toMix: string[] = [], dial: string[] = [], rest: string[] = [];
    for (const [k, tr] of audio.entries()) {
      sum(byTrack.get(tr.id) ?? [], `tk${k}`);
      filters.push(`[tk${k}]asplit=3[tk${k}m][tk${k}g][st${k}]`);
      toMix.push(`[tk${k}m]`);
      (opts.stems.dialogue.has(tr.id) ? dial : rest).push(`[tk${k}g]`);
      stems.push({ label: `st${k}`, name: `${tr.id}-${fileWord(tr.name)}`, what: `sound track ${tr.id} ${tr.name} alone` });
    }
    sum(toMix, 'aout');
    sum(dial, 'sdial');
    sum(rest, 'srest');
    stems.push({ label: 'sdial', name: 'dialogue', what: `dialogue only (${audio.filter((tr) => opts.stems!.dialogue.has(tr.id)).map((tr) => tr.id).join(', ') || 'no dialogue track'})` });
    stems.push({ label: 'srest', name: 'no-dialogue', what: `everything but dialogue (${audio.filter((tr) => !opts.stems!.dialogue.has(tr.id)).map((tr) => tr.id).join(', ') || 'nothing'})` });
  }
  summary.push(`sound: ${mix.length} clips from ${audio.map((a) => a.id).join(', ') || 'no tracks'}, amix (no normalising)${opts.stems ? ', and stems per track' : ''}`);

  const script = path.join(scratch, 'filter.txt');
  await fs.writeFile(script, filters.join(';\n'));
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-progress', 'pipe:1', '-nostats',
    ...inputs.flat(), '-filter_complex_script', script, '-map', '[vout]', '-map', '[aout]',
    '-r', String(fps), '-frames:v', String(frames), ...ENC[kind], '-movflags', '+faststart', out];
  return { args, frames, seconds: T, inputs: inputs.length, summary, inputArgs: inputs.flat(), script, stems, picture: plan?.made };
}

/** A sound clip's level points (gainPoints) as a volume filter on its source, before any change of speed: in
 *  10 ms blocks, each at the level of the curve at its middle; the curve linear in dB between the points and flat
 *  outside them, written as one sum (no nesting, so a long list stays one short expression per point). `from` is
 *  the source second the stream starts at. Nothing when the clip has no points. */
export function levels(c: Pick<TimelineClip, 'gainPoints'>, from: number): string[] {
  const p = c.gainPoints;
  if (!p?.length) return [];
  const s = `(t+${f6(from + 0.005)})`;
  const terms = [String(p[0].db)];
  for (let k = 1; k < p.length; k++) {
    const d = p[k].db - p[k - 1].db;
    if (d) terms.push(`${f6(d)}*clip((${s}-${f6(p[k - 1].t)})/${f6(p[k].t - p[k - 1].t)},0,1)`);
  }
  return ['asetnsamples=n=480:p=0', `volume=volume='pow(10,(${terms.join('+')})/20)':eval=frame`];
}

/** atempo takes 0.5–2 per stage; chain stages for slower or faster clips. */
export function atempo(speed: number): string[] {
  if (Math.abs(speed - 1) < 1e-6) return [];
  const out: string[] = [];
  let s = speed;
  while (s < 0.5) { out.push('atempo=0.5'); s /= 0.5; }
  while (s > 2) { out.push('atempo=2'); s /= 2; }
  out.push(`atempo=${f3(s)}`);
  return out;
}

// ---- the queue (one render at a time for the whole server; survives dev reloads on globalThis)

/** `checked`: a 480p refused by the check a new version gets (checkVersion), not by a render that ran. `procs`: the
 *  processes it spawned while it runs, and whether it was asked to stop (render-job.ts). `committing`: its files are
 *  being copied into cut/renders/ (too late to cancel: it ends done in a moment). */
interface Job extends RenderState { film: string; checked?: boolean; procs?: JobProcs; committing?: boolean }
interface Queue { jobs: Map<string, Job>; waiting: string[]; running?: string }
const g = globalThis as unknown as { __cutRenderQueue?: Queue };
const Q: Queue = (g.__cutRenderQueue ??= { jobs: new Map(), waiting: [] });
const keyOf = (film: string, version: string, kind: RenderKind, tag?: string): string => `${film}/${version}/${kind}${tag ? `/${tag}` : ''}`;

/** `again`: a master of a version that already has one is made again, as a new file beside it, when (and only when)
 *  the one there is out of date (masterStaleness); otherwise the one there is the answer, as without it. */
export interface QueueOptions { force?: boolean; options?: RenderOptions; again?: boolean }
/** The files of a render with options start with this: cut/renders/<version>-<kind>-<tag> (.mp4, .json, .<stem>.wav). */
export const variantBase = (version: string, kind: RenderKind, tag: string): string => `${RENDERS_DIR}/${version}-${kind}-${tag}`;

/** Queues a render of a version unless it is already queued, running or rendered (its file exists). */
export async function queueRender(slug: string, version: string, kind: RenderKind, opts: QueueOptions = {}): Promise<RenderState> {
  const film = await cutFilm(slug);
  // with options: its own job and files, beside the plain render (render-options.ts)
  const tag = opts.options ? optionsTag(opts.options) || undefined : undefined;
  // the smaller file is of the master only (render-options.ts kindProblems)
  const wrong = kindProblems(kind, opts.options);
  if (wrong.length) throw new CutError(`the render options do not check out: ${wrong.join('; ')}`, 400, wrong);
  const key = keyOf(slug, version, kind, tag);
  const live = Q.jobs.get(key);
  if (live && (live.state === 'queued' || live.state === 'running')) return live;
  const done = tag ? await variantFromFiles(film, version, kind, tag) : await fromFiles(film, version, kind);
  let n = 1;
  if (done.state === 'done') {
    // a master made again: only when the one there is out of date, as the next number beside it
    // "Try again" on a master made again that failed asks again too, and "Render it" on one cancelled
    const retrying = !!opts.force && (live?.state === 'failed' || live?.state === 'cancelled') && (masterNo(live.path ?? '')?.n ?? 1) > 1;
    if (!((opts.again || retrying) && kind === 'master' && !tag)) return done;
    if ((await masterStaleness(film, version)).state !== 'stale') return done;
    n = (masterNo(done.path ?? '')?.n ?? 1) + 1;
  } else if (live?.state === 'failed' && !opts.force) return live;
  // a master asked again that failed: only again with retry (force), as any failed render
  if (n > 1 && live?.state === 'failed' && live.path === renderRel(version, kind, n) && !opts.force) return live;
  try {
    const t = await readVersion(film, version);
    // a cut that still holds boards, planned shots or script lines (the timeline from day one) is not a film yet
    if (hasPlanned(t)) throw new CutError(`${version} still holds boards, planned shots or script lines. ${PLANNED_RENDER_WHY}`, 409);
  } catch (e) {
    if (e instanceof CutError && e.status === 409) throw e;
    // a version file that does not read as a timeline (Alma wrote it by hand): say why in its render log
    const problems = e instanceof CutError && e.problems.length ? `\n  ${e.problems.join('\n  ')}` : '';
    const failed: Job = { film: slug, version, kind, state: 'failed', error: `${(e as Error).message}${problems}`, finishedAt: new Date().toISOString(), log: logRel(version), ...(tag ? { tag, options: opts.options } : {}) };
    Q.jobs.set(key, failed);
    if (!(e instanceof CutError && e.status === 404)) {
      await appendLog(film, new Writer(`cut ${version} render ${kind}`, film.show), version, `== ${kind}${tag ? ` ${tag}` : ''} render of ${version} · ${failed.finishedAt}\nFAILED: ${failed.error}\n`).catch(() => undefined);
    }
    if (e instanceof CutError && e.status === 404) throw e;
    return strip(failed);
  }
  const job: Job = tag
    ? { film: slug, version, kind, state: 'queued', queuedAt: new Date().toISOString(), log: logRel(version), tag, options: opts.options }
    : { film: slug, version, kind, state: 'queued', queuedAt: new Date().toISOString(), path: renderRel(version, kind, n), log: logRel(version, n) };
  Q.jobs.set(key, job);
  Q.waiting.push(key);
  void pump();
  return job;
}

/** A version's render states: the live queue first, else what the files say. */
export async function renderStates(slug: string | FilmTarget, version: string): Promise<CutRenders> {
  const film = typeof slug === 'string' ? await cutFilm(slug) : slug;
  const out: CutRenders = {};
  for (const kind of ['proxy', 'master'] as const) {
    const live = Q.jobs.get(keyOf(film.slug, version, kind));
    const files = await fromFiles(film, version, kind, live);
    // a master made again runs while the one before is on disk: the running one is what the page follows
    out[kind] = live && (live.state === 'queued' || live.state === 'running') ? strip(live) : files.state === 'done' || !live ? files : strip(live);
  }
  // renders with options: their manifests on disk, then what the queue holds that is not done yet
  const variants = new Map<string, RenderState>();
  const re = new RegExp(`^${version}-(proxy|master)-(.+)\\.json$`);
  for (const name of await rendersDir(film)) {
    const m = re.exec(name);
    if (!m) continue;
    const st = await variantFromFiles(film, version, m[1] as RenderKind, m[2]);
    if (st.state === 'done') variants.set(`${m[1]}/${m[2]}`, st);
  }
  const prefix = `${film.slug}/${version}/`;
  for (const [key, job] of Q.jobs) {
    const rest = key.startsWith(prefix) ? key.slice(prefix.length) : '';
    if (job.tag && rest.includes('/') && !variants.has(rest)) variants.set(rest, strip(job));
  }
  if (variants.size) out.variants = [...variants.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, st]) => st);
  return out;
}

/** cut/renders/ file names, read again only when the folder changed. */
const dirCache = ((globalThis as unknown as { __cutRendersDir?: Map<string, { mtime: number; names: string[] }> }).__cutRendersDir ??= new Map());
async function rendersDir(film: FilmTarget): Promise<string[]> {
  const d = path.join(film.dir, RENDERS_DIR);
  try {
    const mtime = (await fs.stat(d)).mtimeMs;
    const hit = dirCache.get(d);
    if (hit && hit.mtime === mtime) return hit.names;
    const names = await fs.readdir(d);
    dirCache.set(d, { mtime, names });
    return names;
  } catch {
    return [];
  }
}

/** A render with options is done when its list of files (<base>.json, written last) is there. */
async function variantFromFiles(film: FilmTarget, version: string, kind: RenderKind, tag: string): Promise<RenderState> {
  try {
    const st = JSON.parse(await fs.readFile(path.join(film.dir, `${variantBase(version, kind, tag)}.json`), 'utf8')) as RenderState;
    return { ...st, version, kind, tag, state: 'done', percent: 100 };
  } catch {
    return { version, kind, tag, state: 'none' };
  }
}

const strip = (j: Job): RenderState => {
  const { film: _film, checked: _checked, procs: _procs, committing: _committing, ...rest } = j;
  void _film; void _checked; void _procs; void _committing;
  return rest;
};

/** What cancelling a render answers: whether it was stopped, its state now, and in words. */
export interface CancelAnswer { cancelled: boolean; state: RenderState; said: string }

/** Cancels a render, named as POST …/cut/render names it (version, kind, options). Queued: taken
 *  out of the queue, it never runs. Running: the ffmpeg it spawned (the ChildProcess kept on the job, nothing else) gets
 *  SIGTERM, then SIGKILL on the same object after a few seconds; its scratch folder (its partial files) is removed as
 *  after any render, nothing is written into cut/renders/, and the queue moves on. Either way its state is 'cancelled'
 *  and it can be asked for again like any other. Done, not there, or already over: said plainly, nothing changes. */
export async function cancelRender(slug: string, version: string, kind: RenderKind, opts: { options?: RenderOptions } = {}): Promise<CancelAnswer> {
  const film = await cutFilm(slug);
  const tag = opts.options ? optionsTag(opts.options) || undefined : undefined;
  const key = keyOf(slug, version, kind, tag);
  const job = Q.jobs.get(key);
  const what = `the ${kind === 'proxy' ? '480p' : kind === 'master' && !tag ? 'master' : 'render'} of ${version}${tag ? ` (${tag})` : ''}`;
  if (!job || (job.state !== 'queued' && job.state !== 'running')) {
    const files = tag ? await variantFromFiles(film, version, kind, tag) : await fromFiles(film, version, kind);
    const st = files.state === 'done' || !job ? files : strip(job);
    const said = st.state === 'done' ? `Nothing to cancel: ${what} is already made.` : st.state === 'cancelled' ? `Nothing to cancel: ${what} was cancelled already.`
      : st.state === 'failed' ? `Nothing to cancel: ${what} failed and is not running.` : `Nothing to cancel: ${what} is not queued or running.`;
    return { cancelled: false, state: st, said };
  }
  const at = new Date().toISOString();
  if (job.state === 'queued') {
    Q.waiting = Q.waiting.filter((k) => k !== key);
    job.state = 'cancelled';
    job.finishedAt = at;
    job.percent = undefined;
    return { cancelled: true, state: strip(job), said: `Cancelled ${what} before it started.` };
  }
  if (job.committing) return { cancelled: false, state: strip(job), said: `Too late to cancel: ${what} is writing its file now and is done in a moment.` };
  if (job.procs) stopJob(job.procs);
  else job.procs = { children: new Set(), cancelled: true };
  // the job ends by itself once its ffmpeg has stopped (run(): its scratch removed, its state 'cancelled')
  const t0 = Date.now();
  while (job.state === 'running' && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
  const st = strip(job);
  return st.state === 'cancelled' ? { cancelled: true, state: st, said: `Cancelled ${what}; nothing was written into cut/renders.` }
    : st.state === 'running' ? { cancelled: true, state: st, said: `Stopping ${what}; it is cancelled as soon as its ffmpeg has exited.` }
    : { cancelled: false, state: st, said: `Too late to cancel: ${what} is ${st.state} already.` };
}

/** The checks a render makes before it starts: the version reads as a timeline and its files are there and long
 *  enough. A clip already past its file's end in the version this one is based on is not new damage (it renders, its
 *  last frame held, its sound silent for the rest) instead of blocking every later version. */
async function checkTimeline(film: FilmTarget, raw: Timeline): Promise<{ timeline?: Timeline; problems: string[] }> {
  const base = raw.basedOn && isVersion(raw.basedOn) ? await readVersion(film, raw.basedOn).catch(() => undefined) : undefined;
  return validateTimeline(raw, film, { base });
}

/** A version file that just appeared (Alma's, or the page's): checked at once with the same checks a render makes
 *  before it starts. Refused, its reasons go to cut/renders/<version>.log as a failed render's do, and the page shows
 *  its 480p as failed; a good version writes nothing. Nothing is rendered. */
export async function checkVersion(slug: string, version: string): Promise<{ ok: boolean; error?: string }> {
  const film = await cutFilm(slug);
  const key = keyOf(slug, version, 'proxy');
  const live = Q.jobs.get(key);
  if (live && (live.state === 'queued' || live.state === 'running')) return { ok: true };
  if ((await fromFiles(film, version, 'proxy')).state === 'done') return { ok: true };
  let error: string;
  try {
    const { timeline, problems } = await checkTimeline(film, await readVersion(film, version));
    if (timeline) {
      // the file was written again and now checks out: the refusal kept for it goes
      if (live?.checked) Q.jobs.delete(key);
      return { ok: true };
    }
    error = `the timeline does not check out:\n  ${problems.join('\n  ')}`;
  } catch (e) {
    if (e instanceof CutError && e.status === 404) return { ok: false, error: e.message };
    error = `${(e as Error).message}${e instanceof CutError && e.problems.length ? `\n  ${e.problems.join('\n  ')}` : ''}`;
  }
  error = error.slice(0, 2000);
  // the same refusal said once (a file event can come twice for one write)
  if (live?.state === 'failed' && live.error === error) return { ok: false, error };
  const at = new Date().toISOString();
  Q.jobs.set(key, { film: slug, version, kind: 'proxy', state: 'failed', error, finishedAt: at, log: logRel(version), checked: true });
  await appendLog(film, new Writer(`cut ${version} check`, film.show), version, `== proxy render of ${version} · ${at} (the check made when the version appeared; nothing rendered)\nFAILED: ${error}\n`).catch(() => undefined);
  return { ok: false, error };
}

/** What a new version starts, wherever it came from (the cut route: `page`; a file on disk, Alma's: `file`). By
 *  default only the check (the route has already validated what it wrote); with HARNESS_AUTO_480P=1 its 480p, as
 *  before 14 Nov. */
export async function afterNewVersion(slug: string, version: string, from: 'page' | 'file'): Promise<RenderState> {
  if (auto480p()) {
    const planned = await cutFilm(slug).then((f) => readVersion(f, version)).then(hasPlanned, () => false);
    if (!planned) return queueRender(slug, version, 'proxy');
  }
  if (from === 'file') {
    const c = await checkVersion(slug, version);
    if (!c.ok) return strip(Q.jobs.get(keyOf(slug, version, 'proxy')) ?? { film: slug, version, kind: 'proxy', state: 'failed', error: c.error });
  }
  return { version, kind: 'proxy', state: 'none' };
}

/** The plain render of a version on disk: the 480p, or the newest master (masters.ts: the highest number). */
async function fromFiles(film: FilmTarget, version: string, kind: RenderKind, live?: Job): Promise<RenderState> {
  if (kind === 'master') {
    const m = newestMaster(await rendersDir(film), version);
    if (!m) return { version, kind, state: 'none' };
    // the live job's own words (its record of the picture) only when it is the job that made this file
    const own = live && live.path === m.path && live.state === 'done' ? strip(live) : {};
    return { ...own, version, kind, state: 'done', percent: 100, path: m.path, log: logRel(version, m.n) };
  }
  try {
    await fs.access(path.join(film.dir, renderRel(version, kind)));
    return { ...(live ? strip(live) : {}), version, kind, state: 'done', percent: 100, path: renderRel(version, kind), log: logRel(version) };
  } catch {
    return { version, kind, state: 'none' };
  }
}

/** Is the master of a version out of date (masters.ts masterAge)? Its record (the version file's renders.master when
 *  it names this file), against what a master would be built from now: the same reading the render makes (readFullSize,
 *  the base, the pieces counted by shot). No ffmpeg; the bases' frame counts are probed as the page's reading does. */
export async function masterStaleness(slug: string | FilmTarget, version: string): Promise<MasterAge & { path?: string }> {
  const film = typeof slug === 'string' ? await cutFilm(slug) : slug;
  const m = newestMaster(await rendersDir(film), version);
  if (!m) return { state: 'unknown' };
  const t = await readVersion(film, version);
  const rec = t.renders?.master?.path === m.path ? t.renders.master : undefined;
  const at = rec?.at ?? (await fs.stat(path.join(film.dir, m.path)).then((s) => s.mtime.toISOString(), () => undefined));
  const now = await pictureNow(film, t);
  const age = masterAge({ version, at, picture: rec?.picture }, now);
  if (age.state !== 'stale' && madeBeforeFix(at, now.pieces)) return { state: 'stale', reason: `The master of ${version} was made before the upscaled-stretch fix: it has one black frame at the end of each stretch from the upscaled cut`, path: m.path };
  return { ...age, path: m.path };
}

/** A render made before the upscaled-stretch fix (the time below; v0.1.0 had the fault) from a cut that uses an
 *  upscaled cut lost the last frame of each stretch taken from it: such a master counts as out of date, so it is made again on request without a change to the
 *  cut. */
const STRETCH_FIX_AT = '2026-11-19T06:00:00Z';
const madeBeforeFix = (at: string | undefined, pieces: Piece[]): boolean =>
  !!at && Date.parse(at) < Date.parse(STRETCH_FIX_AT) && pieces.some((p) => p.kind === 'base');

/** What a master of the version would be built from now (masters.ts PictureNow): the same reading the render makes. */
async function pictureNow(film: FilmTarget, t: Timeline): Promise<Parameters<typeof masterAge>[1]> {
  const info = await readFullSize(film, [t]);
  const b = baseFor(info, t.version);
  const btl = b ? await readVersion(film, b.version).catch(() => undefined) : undefined;
  const base = b && btl ? { b, tl: btl } : undefined;
  const by = await storedShots(film).catch(() => new Map());
  const pieces = picturePieces(shotTimeline(t, by), info, base);
  return { pieces, made: pictureMade(pieces, b), times: info.times };
}

/** The finished render a smaller file of `version` with these other options (undefined: the plain master) would be
 *  encoded from, when there is one and it is up to date by the same reading as the master's (masters.ts masterAge,
 *  on its own record of its picture and its time); `stale`: the one there and why it is not used. */
async function smallSource(film: FilmTarget, version: string, src: RenderOptions | undefined): Promise<{ use?: RenderState & { path: string; what?: string }; stale?: string }> {
  if (!src) {
    const done = await fromFiles(film, version, 'master');
    if (done.state !== 'done' || !done.path) return {};
    const age = await masterStaleness(film, version);
    if (age.state === 'stale' && age.path === done.path) return { stale: `${done.path} is out of date (${age.reason})` };
    const t = await readVersion(film, version);
    const rec = t.renders?.master?.path === done.path ? t.renders.master : t.renders?.earlierMasters?.find((r) => r.path === done.path);
    return { use: { ...done, path: done.path, ...(rec?.picture ? { picture: rec.picture } : {}), what: 'the master' } };
  }
  const tag = optionsTag(src);
  const st = await variantFromFiles(film, version, 'master', tag);
  const main = `${variantBase(version, 'master', tag)}.mp4`;
  if (st.state !== 'done' || !(await fs.access(path.join(film.dir, main)).then(() => true, () => false))) return {};
  const t = await readVersion(film, version);
  const now = await pictureNow(film, t);
  const age0 = masterAge({ version, at: st.finishedAt, picture: st.picture }, now);
  const age = age0.state !== 'stale' && madeBeforeFix(st.finishedAt, now.pieces) ? { state: 'stale' as const, reason: 'The master was made before the upscaled-stretch fix (a black frame at the end of each upscaled stretch)' } : age0;
  if (age.state === 'stale') return { stale: `${main} is out of date (${age.reason?.replace(/^The master of/, 'the render of')})` };
  return { use: { ...st, path: main, what: st.outputs?.find((o) => o.path === main)?.what } };
}

async function pump(): Promise<void> {
  if (Q.running) return;
  const key = Q.waiting.shift();
  if (!key) return;
  const job = Q.jobs.get(key);
  // a job cancelled while it waited (cancelRender takes it out of the list; this is the safety net)
  if (!job || job.state !== 'queued') return void pump();
  Q.running = key;
  // the processes it spawns are kept on it, for a cancel (render-job.ts)
  const procs: JobProcs = (job.procs ??= { children: new Set(), cancelled: false });
  try {
    await jobScope.run(procs, () => run(job));
  } catch (e) {
    job.state = procs.cancelled ? 'cancelled' : 'failed';
    job.error = (e as Error).message.slice(0, 2000);
    job.finishedAt = new Date().toISOString();
  } finally {
    job.procs = undefined;
    job.committing = undefined;
    Q.running = undefined;
    void pump();
  }
}

/** Renders a job into the harness's own scratch folder, then copies the result into cut/renders/ (never over a file). */
async function run(job: Job): Promise<void> {
  const film = await cutFilm(job.film);
  const t0 = Date.now();
  job.state = 'running';
  job.percent = 0;
  job.startedAt = new Date().toISOString();
  const scratch = path.join(claudeConfig().harnessDir, 'render-tmp', `${job.film}-${job.version}-${job.kind}-${process.pid}-${t0}`);
  await fs.mkdir(scratch, { recursive: true });
  const again = job.kind === 'master' && !job.tag && job.path && masterNo(job.path)?.n !== 1 ? ` (made again: ${job.path.split('/').pop()}, beside the one before)` : '';
  const logLines: string[] = [`== ${job.kind}${job.tag ? ` ${job.tag}` : ''} render of ${job.version}${again} · ${job.startedAt}`];
  const w = new Writer(`cut ${job.version} render ${job.kind}`, film.show);
  // the file this job makes (a master made again: the next number beside the one before)
  const rel = job.path ?? renderRel(job.version, job.kind);
  const n = job.kind === 'master' ? masterNo(rel)?.n ?? 1 : 1;
  const target = path.join(film.dir, rel);
  let skipped = false;
  try {
    const there = job.tag ? (await variantFromFiles(film, job.version, job.kind, job.tag)).state === 'done' : await fs.access(target).then(() => true, () => false);
    if (there) {
      // another process (the migration script, a second server) rendered it meanwhile
      job.state = 'done';
      job.percent = 100;
      skipped = true;
      return;
    }
    const { timeline: t, problems } = await checkTimeline(film, await readVersion(film, job.version));
    if (!t) throw new Error(`the timeline does not check out:\n  ${problems.join('\n  ')}`);
    if (job.tag) {
      await runVariant(job, film, t, scratch, w, logLines);
      const seconds = Math.round((Date.now() - t0) / 100) / 10;
      job.state = 'done';
      job.percent = 100;
      job.seconds = seconds;
      await w.writeNew(path.join(film.dir, `${variantBase(job.version, job.kind, job.tag)}.json`), JSON.stringify(strip(job), null, 1) + '\n', 'what this render wrote and measured');
      logLines.push(`done in ${seconds} s → ${(job.outputs ?? []).map((o) => o.path).join(', ')}`);
      return;
    }
    const tmpOut = path.join(scratch, 'out.mp4');
    const graph = await buildGraph(film, t, job.kind, tmpOut, scratch);
    if (graph.picture) job.picture = graph.picture;
    logLines.push(`length ${smpte(graph.seconds, t.fps)} (${graph.frames} frames at ${t.fps} fps), ${graph.inputs} inputs`, ...graph.summary.map((s) => `  ${s}`),
      `ffmpeg ${graph.args.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`, `-- filter_complex_script\n${await fs.readFile(path.join(scratch, 'filter.txt'), 'utf8')}`);
    const err = await ffmpeg(graph.args, graph.seconds, (p) => (job.percent = p));
    checkCancelled();
    if (err) throw new Error(`ffmpeg failed:\n${err}`);
    // from here its file is being written: a cancel now is too late (cancelRender says so)
    job.committing = true;
    await w.copyNew(tmpOut, target, `${graph.frames} frames`);
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    await recordRender(film, job.version, job.kind, { path: rel, at: new Date().toISOString(), hash: timelineHash(t), seconds, ...(graph.picture ? { picture: graph.picture } : {}) });
    job.state = 'done';
    job.percent = 100;
    job.seconds = seconds;
    logLines.push(`done in ${seconds} s → ${rel}`);
  } catch (e) {
    if (e instanceof RenderCancelled || (job.procs?.cancelled && !job.committing)) {
      // stopped on request: nothing was copied into cut/renders/; the scratch folder goes below
      job.state = 'cancelled';
      job.error = undefined;
      logLines.push(`CANCELLED at ${Math.round(job.percent ?? 0)}%: stopped on request; nothing written`);
    } else {
      job.state = 'failed';
      job.error = (e as Error).message.slice(0, 2000);
      logLines.push(`FAILED: ${job.error}`);
    }
  } finally {
    job.finishedAt = new Date().toISOString();
    if (!skipped) await appendLog(film, w, job.version, logLines.join('\n') + '\n', n).catch(() => undefined);
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** One file a render with options makes in its scratch folder, and where it goes in cut/renders/. */
interface Out { from: string; to: string; what: string }

/** A render with options (render-options.ts): its files made in the scratch folder (makeVariant, or makeSmall for the
 *  smaller file); nothing is copied into cut/renders/ unless all of it worked; every file is new there (never over
 *  another). */
async function runVariant(job: Job, film: FilmTarget, t0: Timeline, scratch: string, w: Writer, logLines: string[]): Promise<void> {
  const o = job.options ?? {};
  const base = variantBase(job.version, job.kind, job.tag!);
  const outs = o.small
    ? await makeSmall(job, film, t0, scratch, logLines)
    : await makeVariant(job, o, film, t0, scratch, logLines, base, (p) => (job.percent = Math.min(95, p)));
  checkCancelled();
  for (const x of outs) {
    try {
      await fs.access(path.join(film.dir, x.to));
      throw new Error(`${x.to} is already there: nothing written (a render never writes over a file)`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  // from here its files are being written: a cancel now is too late (cancelRender says so)
  checkCancelled();
  job.committing = true;
  for (const x of outs) await w.copyNew(x.from, path.join(film.dir, x.to), x.what);
  job.outputs = outs.map((x) => ({ path: x.to, what: x.what }));
  job.path = outs[0]?.to;
}

/** The files of a render with options `o`, made in `scratch` (base: their names in cut/renders/): the graph once, to a
 *  picture-only file, the mix as a float WAV and each stem; then the loudness pass on the mix; then the picture and
 *  the sound joined. What it measured goes on the job (leftOut, picture, loudness). */
async function makeVariant(job: Job, o: RenderOptions, film: FilmTarget, t0: Timeline, scratch: string, logLines: string[], base: string, onPercent: (p: number) => void): Promise<Out[]> {
  const { t, left } = applyLeaveOut(t0, o.leaveOut);
  job.leftOut = left.length ? left : undefined;
  if (o.leaveOut) logLines.push(left.length ? `left out: ${left.join('; ')}` : 'left out: nothing matched');
  const graph = await buildGraph(film, t, job.kind, path.join(scratch, 'unused.mp4'), scratch, { bed: true, ...(o.stems ? { stems: { dialogue: dialogueTracks(t) } } : {}) });
  if (graph.picture) job.picture = graph.picture;
  const enc = ENC[job.kind];
  const vEnc = enc.slice(0, enc.indexOf('-c:a'));
  const aEnc = enc.slice(enc.indexOf('-c:a'));
  const pic = path.join(scratch, 'picture.mp4');
  const mixWav = path.join(scratch, 'mix.wav');
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-progress', 'pipe:1', '-nostats', ...graph.inputArgs, '-filter_complex_script', graph.script,
    '-map', '[vout]', '-r', String(t.fps), '-frames:v', String(graph.frames), ...vEnc, '-movflags', '+faststart', pic,
    '-map', '[aout]', '-c:a', 'pcm_f32le', mixWav,
    ...graph.stems.flatMap((st) => ['-map', `[${st.label}]`, '-c:a', 'pcm_s24le', path.join(scratch, `${st.name}.wav`)])];
  logLines.push(`length ${smpte(graph.seconds, t.fps)} (${graph.frames} frames at ${t.fps} fps), ${graph.inputs} inputs`, ...graph.summary.map((x) => `  ${x}`),
    `ffmpeg ${args.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`, `-- filter_complex_script\n${await fs.readFile(graph.script, 'utf8')}`);
  const err = await ffmpeg(args, graph.seconds, onPercent);
  if (err) throw new Error(`ffmpeg failed:\n${err}`);
  const outs: Out[] = [];
  const mux = async (wav: string, out: string): Promise<void> => {
    await ffmpegText(['-y', '-v', 'error', '-i', pic, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...aEnc, '-movflags', '+faststart', out]);
  };
  const lefts = left.length ? `, without ${left.length} track${left.length === 1 ? '' : 's'} or clips` : '';
  if (o.loudness) {
    const target = o.loudness.lufs, ceiling = o.loudness.truePeak ?? -1;
    const m = await measureLoudnorm(mixWav, target, ceiling);
    if (!Number.isFinite(m.i) || m.i < -69) throw new Error('the mix is silent: there is no loudness to bring to the target');
    logLines.push(`loudness: the mix measures ${m.i} LUFS, true peak ${m.tp} dBTP, range ${m.lra} LU; target ${target} LUFS, ceiling ${ceiling} dBTP`);
    let margin = 0, extra = 0;
    let last: { f: ReturnType<typeof loudnessFilter>; after: { i: number; tp: number }; mp4: string } | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      const f = loudnessFilter(m, target, ceiling, margin, extra);
      const wav = path.join(scratch, `loud${attempt}.wav`);
      const mp4 = path.join(scratch, `main${attempt}.mp4`);
      await ffmpegText(['-y', '-v', 'error', '-i', mixWav, '-af', f.af, '-c:a', 'pcm_f32le', '-ar', '48000', wav]);
      await mux(wav, mp4);
      const after = await measureEbur128(mp4);
      last = { f, after, mp4 };
      logLines.push(`  pass ${attempt + 1}: gain ${f.gain} dB${f.mode === 'limiter' ? `, limiter at ${(ceiling - margin).toFixed(2)} dBTP` : ''} → ${after.i} LUFS, true peak ${after.tp} dBTP`);
      if (after.tp > ceiling) margin += after.tp - ceiling + 0.1;          // the encoder or the resampling went over: aim lower
      else if (f.mode === 'limiter' && Math.abs(after.i - target) > 0.3) extra += target - after.i;   // the limiter took some loudness: more gain
      else break;
    }
    const { f, after, mp4 } = last!;
    job.loudness = { target, ceiling, before: { i: m.i, tp: m.tp, lra: m.lra }, after, mode: f.mode, gain: f.gain };
    if (after.tp > ceiling) throw new Error(`the loudness pass left the true peak at ${after.tp} dBTP, over the ${ceiling} dBTP ceiling (${after.i} LUFS): nothing written`);
    outs.push({ from: mp4, to: `${base}.mp4`, what: `the film${lefts}, its sound at ${after.i} LUFS, true peak ${after.tp} dBTP (${f.mode === 'linear' ? `one gain of ${f.gain} dB` : `a gain of ${f.gain} dB and a limiter`})` });
  } else if (o.leaveOut) {
    const mp4 = path.join(scratch, 'main.mp4');
    await mux(mixWav, mp4);
    outs.push({ from: mp4, to: `${base}.mp4`, what: `the film${lefts}` });
  }
  if (o.stems) {
    const mix24 = path.join(scratch, 'mix24.wav');
    await ffmpegText(['-y', '-v', 'error', '-i', mixWav, '-c:a', 'pcm_s24le', mix24]);
    outs.push({ from: pic, to: `${base}.picture.mp4`, what: `the picture alone, no sound${lefts}` });
    for (const st of graph.stems) outs.push({ from: path.join(scratch, `${st.name}.wav`), to: `${base}.${st.name}.wav`, what: st.what });
    outs.push({ from: mix24, to: `${base}.mix.wav`, what: 'the full mix at the cut\'s own levels (no loudness pass), the stems add up to it' });
  }
  return outs;
}

/** The smaller file (options.small, ASKS 56): the render with the same other options, encoded again smaller. From
 *  the finished one when it is up to date (smallSource), else made first here, in the scratch folder, and not kept.
 *  The picture: x264 veryslow at CRF 21 (SMALL_VIDEO), the sound copied. Then checked: the same frame count, the
 *  sound byte for byte the source's, smaller than it, and SSIM against it over the whole film at 0.98 or more; what
 *  it measured is recorded (job.small) whether it passes or not, and nothing is written when it does not. */
async function makeSmall(job: Job, film: FilmTarget, t: Timeline, scratch: string, logLines: string[]): Promise<Out[]> {
  const src = withoutSmall(job.options ?? {});
  const there = await smallSource(film, job.version, src);
  let from: string, fromRel: string, what: string;
  // the share of the percent each step has: the normal render when it is made here, the encode, the SSIM pass
  let at = 0;
  const step = (a: number, b: number) => (p: number) => { job.percent = Math.round((a + ((b - a) * Math.min(100, p)) / 100) * 10) / 10; };
  if (there.use) {
    from = path.join(film.dir, there.use.path);
    fromRel = there.use.path;
    what = there.use.what || 'the film';
    if (there.use.picture) job.picture = there.use.picture;
    if (there.use.loudness) job.loudness = there.use.loudness;
    if (there.use.leftOut) job.leftOut = there.use.leftOut;
    logLines.push(`smaller file: from ${there.use.path}, rendered already and up to date; it is not rendered again`);
  } else {
    logLines.push(`smaller file: ${there.stale ? `${there.stale}, so` : 'no finished render with these options, so'} the normal render is made first, here, and not kept`);
    const sub = path.join(scratch, 'normal');
    await fs.mkdir(sub, { recursive: true });
    if (!src) {
      const tmp = path.join(sub, 'out.mp4');
      const graph = await buildGraph(film, t, 'master', tmp, sub);
      if (graph.picture) job.picture = graph.picture;
      logLines.push(`length ${smpte(graph.seconds, t.fps)} (${graph.frames} frames at ${t.fps} fps), ${graph.inputs} inputs`, ...graph.summary.map((x) => `  ${x}`),
        `ffmpeg ${graph.args.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      const err = await ffmpeg(graph.args, graph.seconds, step(0, 35));
      if (err) throw new Error(`ffmpeg failed:\n${err}`);
      from = tmp;
      what = 'the master';
    } else {
      const outs = await makeVariant(job, src, film, t, sub, logLines, variantBase(job.version, job.kind, optionsTag(src)), step(0, 35));
      if (!outs[0]) throw new Error('the normal render made no film to make smaller');
      from = outs[0].from;
      what = outs[0].what;
    }
    fromRel = 'made for it, not kept';
    at = 35;
  }
  const seconds = (await probe(from))?.duration ?? timelineLength(t);
  const smallOut = path.join(scratch, 'small.mp4');
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-i', from,
    '-map', '0:v:0', '-map', '0:a:0', ...SMALL_VIDEO, '-c:a', 'copy', '-movflags', '+faststart', smallOut];
  logLines.push(`smaller file: ffmpeg ${args.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  const err = await ffmpeg(args, seconds, step(at, at + (100 - at) * 0.75));
  if (err) throw new Error(`ffmpeg failed:\n${err}`);
  // the checks: frames, sound, size, then the SSIM pass (the slow one) only when the rest passed
  const [frames, srcFrames, fromBytes, bytes, sound, srcSound] = await Promise.all([countFrames(smallOut), countFrames(from), size(from), size(smallOut), soundOf(smallOut, scratch, 'a'), soundOf(from, scratch, 'b')]);
  const copied = !!sound && !!srcSound && sound.md5 === srcSound.md5 && sound.codec === srcSound.codec && Math.abs(sound.seconds - srcSound.seconds) < 1e-3;
  const record = (ssim: number): RenderSmall => ({ from: fromRel, made: !there.use, fromBytes, bytes, frames: frames ?? -1, ssim,
    sound: { codec: sound?.codec ?? 'none', seconds: sound?.seconds ?? 0, copied }, encode: `libx264 ${SMALL_PRESET} CRF ${SMALL_CRF}` });
  logLines.push(`smaller file: ${frames} frames (the source ${srcFrames}), ${mbWords(bytes)} from ${mbWords(fromBytes)} (${bytes} from ${fromBytes} bytes), sound ${sound?.codec} ${sound?.seconds} s ${copied ? 'copied byte for byte' : 'NOT the same as the source\'s'}`);
  const early = frames === undefined || srcFrames === undefined ? 'the frames of the smaller file could not be counted: nothing written' : smallVerdict({ frames, srcFrames, bytes, fromBytes });
  if (early) { job.small = record(NaN); throw new Error(early); }
  if (!copied) { job.small = record(NaN); throw new Error('the smaller file\'s sound is not the source\'s byte for byte: nothing written'); }
  const ssimErr = await ffmpegRun(['-hide_banner', '-nostdin', '-v', 'info', '-progress', 'pipe:1', '-nostats', '-i', smallOut, '-i', from, '-lavfi', '[0:v][1:v]ssim', '-f', 'null', '-'],
    seconds, step(at + (100 - at) * 0.75, 99));
  if (ssimErr.error) throw new Error(`ffmpeg failed (SSIM):\n${ssimErr.error}`);
  const ssim = Number(/SSIM [^\n]*All:([\d.]+)/.exec(ssimErr.tail)?.[1]);
  job.small = record(Math.round(ssim * 10000) / 10000);
  logLines.push(`smaller file: SSIM ${job.small.ssim} against the source, the whole film`);
  const late = Number.isFinite(ssim) ? smallVerdict({ frames: frames!, srcFrames: srcFrames!, bytes, fromBytes, ssim }) : 'the SSIM of the smaller file could not be read: nothing written';
  if (late) throw new Error(late);
  return [{ from: smallOut, to: `${variantBase(job.version, job.kind, job.tag!)}.mp4`, what: `${what}, as a smaller file: ${mbWords(bytes)}, from ${mbWords(fromBytes)} (SSIM ${job.small.ssim}, the sound copied)` }];
}
const size = (f: string): Promise<number> => fs.stat(f).then((s) => s.size);

/** A file's first sound stream: its codec, its length, and the MD5 of its packets as they are (no decoding). */
async function soundOf(file: string, scratch: string, name: string): Promise<{ codec: string; seconds: number; md5: string } | undefined> {
  checkCancelled();
  const j = await new Promise<string | undefined>((resolve) => {
    adopt(execFile(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,duration', '-of', 'json', file], { signal: AbortSignal.timeout(30000) },
      (err, stdout) => resolve(err ? undefined : String(stdout))));
  });
  const st = j ? (JSON.parse(j) as { streams?: { codec_name?: string; duration?: string }[] }).streams?.[0] : undefined;
  if (!st?.codec_name) return undefined;
  const out = path.join(scratch, `sound-${name}.md5`);
  await ffmpegText(['-y', '-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', out]);
  return { codec: st.codec_name, seconds: Number(st.duration), md5: (await fs.readFile(out, 'utf8')).trim() };
}

/** cut/renders/<version>.log: written once, then appended to by the version's later renders. */
async function appendLog(film: FilmTarget, w: Writer, version: string, text: string, n = 1): Promise<void> {
  const file = path.join(film.dir, logRel(version, n));
  try {
    await fs.access(file, constants.F_OK);
  } catch {
    await w.writeNew(file, text);
    return;
  }
  await fs.appendFile(file, '\n' + text);
  await logWrite(`cut ${version} render log`, 'append', film.show(file));
}

/** Runs ffmpeg with -progress on stdout; calls back with percent from out_time; resolves to the error text or undefined. */
async function ffmpeg(args: string[], seconds: number, onPercent: (p: number) => void): Promise<string | undefined> {
  return (await ffmpegRun(args, seconds, onPercent)).error;
}
/** ffmpeg as above, with the end of what it printed (where a filter such as ssim prints its summary). */
function ffmpegRun(args: string[], seconds: number, onPercent: (p: number) => void): Promise<{ error?: string; tail: string }> {
  return new Promise((resolve) => {
    // a job asked to stop starts nothing more; what it starts is kept on it (render-job.ts)
    try { checkCancelled(); } catch (e) { resolve({ error: (e as Error).message, tail: '' }); return; }
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    adopt(p);
    let err = '';
    let buf = '';
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
        if (m) onPercent(Math.min(99, Math.round((Number(m[1]) / 1e6 / seconds) * 1000) / 10));
      }
    });
    p.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
    });
    p.on('error', (e) => resolve({ error: e.message, tail: err }));
    p.on('close', (code) => resolve({ error: code === 0 ? undefined : err || `exit ${code}`, tail: err }));
  });
}

/** For scripts: the pids of the processes a job has running now, read from the ChildProcess objects kept on it
 *  (scripts/cancel-render-test.ts checks they exit on a cancel). */
export function jobChildPids(slug: string, version: string, kind: RenderKind, tag?: string): number[] {
  const procs = Q.jobs.get(keyOf(slug, version, kind, tag))?.procs;
  return procs ? [...procs.children].map((p) => p.pid).filter((n): n is number => typeof n === 'number') : [];
}

/** For scripts: wait until nothing is queued or running. */
export async function drain(): Promise<void> {
  while (Q.running || Q.waiting.length) await new Promise((r) => setTimeout(r, 200));
}
