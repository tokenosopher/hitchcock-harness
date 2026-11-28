// npm run render:test
// The render's graph on a tiny synthetic film (480×854 at 24 fps, test patterns, colour fields and sine tones of
// different pitch per clip), built in a temp folder and deleted after. Every check is a measurement on the rendered
// file: frame counts, mean colours, left/right halves, tone power at a frequency, RMS levels, loudness. One line per
// check; exits non-zero on the first failure. Never touches a real film.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PictureMade } from '../src/server/types';

const FFMPEG = process.env.HARNESS_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.HARNESS_FFPROBE || 'ffprobe';
const root = mkdtempSync(path.join(os.tmpdir(), 'render-test-'));
const repo = path.join(root, 'repo');
const slug = 'synth';
const dir = path.join(repo, 'assets', 'films', slug);
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';

const W = 480, H = 854, FPS = 24, SR = 48000;
let checks = 0;
const t0 = Date.now();
function check(what: string, ok: boolean, got: string): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what} · ${got}`);
  if (!ok) throw new Error(`failed: ${what}`);
}
const ff = (args: string[]): Buffer => execFileSync(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', ...args], { maxBuffer: 1 << 30 });
const loudErr = (args: string[]): string => {
  // ffmpeg writes loudness summaries to stderr on success; run with -v info and return stderr
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return String(r.stderr);
};

// ---- media
function makeMedia(): void {
  const m = path.join(dir, 'media');
  mkdirSync(m, { recursive: true });
  const vid = (name: string, src: string, secs: number, hz: number, db: number, vf?: string): void => {
    ff(['-f', 'lavfi', '-i', `${src}${src.includes("=") ? ":" : "="}s=${W}x${H}:r=${FPS}:d=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=${SR}:duration=${secs}`,
      ...(vf ? ['-vf', vf] : []), '-af', `volume=${db}dB,aformat=channel_layouts=stereo`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', '-g', '1',
      '-c:a', 'pcm_s16le', '-shortest', '-y', path.join(m, name)]);
  };
  const wav = (name: string, hz: number, secs: number, db: number): void => {
    ff(['-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=${SR}:duration=${secs}`, '-af', `volume=${db}dB,aformat=channel_layouts=stereo`, '-c:a', 'pcm_s16le', '-y', path.join(m, name)]);
  };
  vid('pattern.mov', 'testsrc2', 6, 440, 0);
  vid('red.mov', 'color=c=0xC02020', 5, 660, 0);
  vid('blue.mov', 'color=c=0x2040C0', 5, 880, 0);
  vid('green.mov', 'color=c=0x20B040', 5, 990, 0);
  vid('half.mov', 'color=c=white', 4, 550, 0, 'drawbox=x=0:y=0:w=240:h=854:color=black:t=fill');
  vid('card.mov', 'color=c=0x808080', 2, 330, 0);
  vid('black.mov', 'color=c=black', 5, 770, 0);
  vid('step.mov', 'color=c=black', 5, 1100, 0, "geq=lum='if(lt(T,2),60,200)':cb=128:cr=128");   // dark grey for 2 s, then light grey
  wav('fx.wav', 1500, 3, 0);
  wav('music.wav', 220, 30, 0);
  wav('quiet.wav', 1000, 10, -40);
  // a soft tone with a short loud burst every second: one gain cannot reach a loud target under the ceiling
  ff(['-f', 'lavfi', '-i', `aevalsrc=exprs='0.05*sin(2*PI*500*t)+if(lt(mod(t,1),0.01),0.9*sin(2*PI*3000*t),0)':s=${SR}:d=10`, '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s16le', '-y', path.join(m, 'crest.wav')]);
}

// ---- measuring
const frameCount = (file: string): number => Number(execFileSync(FFPROBE, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]).toString().trim());
const hasAudio = (file: string): boolean => execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString().trim() !== '';
/** Decoded frames, scaled down (area) to 48×86 RGB: enough for mean colours and halves. */
const SW = 48, SH = 86;
function frames(file: string): Uint8Array[] {
  const buf = ff(['-i', file, '-map', '0:v', '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const n = SW * SH * 3;
  const out: Uint8Array[] = [];
  for (let i = 0; i + n <= buf.length; i += n) out.push(buf.subarray(i, i + n));
  return out;
}
function mean(f: Uint8Array, x0 = 0, x1 = SW): [number, number, number] {
  const s = [0, 0, 0];
  let k = 0;
  for (let y = 4; y < SH - 4; y++) for (let x = x0; x < x1; x++) { const i = (y * SW + x) * 3; s[0] += f[i]; s[1] += f[i + 1]; s[2] += f[i + 2]; k++; }
  return [s[0] / k, s[1] / k, s[2] / k];
}
const dist = (a: number[], b: number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const rgb = (c: number[]): string => `(${c.map((v) => v.toFixed(0)).join(',')})`;
/** Decoded sound, mono (the channels are the same), float, from the file's time 0 as a player hears it (a sound
 *  stream that starts late is padded with silence in front). */
function pcm(file: string, stream = '0:a'): Float32Array {
  const buf = ff(['-i', file, '-map', stream, '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
const rmsDb = (x: Float32Array, a: number, b: number): number => {
  let s = 0;
  const i0 = Math.round(a * SR), i1 = Math.round(b * SR);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-20);
};
/** Power of one frequency in a window, dB (Goertzel; a full-scale sine reads about −3 dB). */
function toneDb(x: Float32Array, hz: number, a: number, b: number): number {
  const i0 = Math.round(a * SR), i1 = Math.round(b * SR), n = i1 - i0;
  const k = 2 * Math.cos((2 * Math.PI * hz) / SR);
  let s1 = 0, s2 = 0;
  for (let i = i0; i < i1; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  const p = s1 * s1 + s2 * s2 - k * s1 * s2;
  return 10 * Math.log10((2 * p) / (n * n) + 1e-20);
}
function frameMd5(file: string, stream: string): string {
  const txt = ff(['-i', file, '-map', stream, ...(stream.endsWith('a') ? ['-c:a', 'pcm_f32le'] : []), '-f', 'framemd5', '-']).toString();
  return createHash('md5').update(txt.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop()).join('\n')).digest('hex');
}
/** Integrated loudness and true peak of a file's sound, by ebur128 (independent of the render's loudnorm). */
function loudness(file: string): { i: number; tp: number } {
  const err = loudErr(['-i', file, '-map', '0:a', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const i = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
  const tp = Number(/True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS/.exec(sum)?.[1]);
  return { i, tp };
}

// ---- the film
type Clip = Record<string, unknown> & { id: string; src: string; in: number; out: number; at: number };
const f6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const fr = (n: number): number => f6(n / FPS);
function timeline(version: string, tracks: { id: string; kind: string; name: string; clips: Clip[]; muted?: boolean; solo?: boolean }[]): Record<string, unknown> {
  return { version, fps: FPS, width: 1080, height: 1920, at: '2026-11-13T00:00:00.000Z', by: 'user', tracks, markers: [] };
}
const M = (n: string): string => `media/${n}`;

/** The cut with only the fields that existed before tonight: gaps, an upper track with fades, a slowed and a
 *  sped clip, gains, fades, music. Its render must not change. */
function baseline(version: string): Record<string, unknown> {
  return timeline(version, [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [
      { id: 'c1', src: M('pattern.mov'), in: 1, out: 4, at: 0, fadeIn: 0.5 },
      { id: 'c2', src: M('red.mov'), in: 1, out: 3, at: 3, speed: 1.25 },
      { id: 'c3', src: M('blue.mov'), in: 0.5, out: 2.5, at: fr(120), fadeOut: 1 },
      { id: 'c4', src: M('card.mov'), in: 0, out: 2, at: fr(168), label: 'Title card · The point, 1890' },
    ] },
    { id: 'V2', kind: 'video', name: 'Inserts', clips: [{ id: 'i1', src: M('half.mov'), in: 0, out: 1.5, at: 1, fadeIn: 0.5, fadeOut: 0.5 }] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [
      { id: 'c1a', src: M('pattern.mov'), in: 1, out: 4, at: 0, fadeIn: 0.5 },
      { id: 'c2a', src: M('red.mov'), in: 1, out: 3, at: 3, speed: 1.25 },
      { id: 'c3a', src: M('blue.mov'), in: 0.5, out: 2.5, at: fr(120), gain: -6 },
    ] },
    { id: 'A2', kind: 'audio', name: 'Effects', clips: [
      { id: 's1', src: M('fx.wav'), in: 0, out: 2, at: 2, gain: -10, fadeIn: 0.25, fadeOut: 0.5 },
      { id: 'c4a', src: M('card.mov'), in: 0, out: 2, at: fr(168), label: 'Title card · The point, 1890' },
    ] },
    { id: 'A3', kind: 'audio', name: 'Music', clips: [{ id: 'm1', src: M('music.wav'), in: 0, out: 8, at: 0, gain: -12, fadeIn: 2, fadeOut: 2 }] },
  ]);
}

// the render of baseline() as it was before the fields of 13 Nov (ffmpeg 8.1.1; decoded frames and samples)
const BASE = { filter: 'ce88d44657bdbe56f0e6113e83c85173', video: 'f41027818289a8fb985912b583ef1dc4', audio: 'b8340b1c8877a50f8a260cc160ac00c1' };

async function main(): Promise<void> {
  mkdirSync(path.join(dir, 'cut'), { recursive: true });
  writeFileSync(path.join(repo, 'films.txt'), `${slug}\n`);
  makeMedia();
  const T = await import('../src/server/edit/timeline');
  const R = await import('../src/server/edit/render');
  const film = await T.cutFilm(slug);
  const scratch = path.join(root, 'scratch');
  let n = 0;
  /** Renders a timeline object straight through buildGraph (checked first), returns the file. */
  const render = async (raw: Record<string, unknown>, kind: 'proxy' | 'master' = 'proxy', lossless = false): Promise<{ file: string; filter: string; problems: string[]; picture?: PictureMade; summary: string[] }> => {
    const { timeline: t, problems } = await T.validateTimeline(raw, film);
    if (!t) return { file: '', filter: '', problems, summary: [] };
    const s = path.join(scratch, String(n++));
    mkdirSync(s, { recursive: true });
    const out = path.join(s, 'out.mp4');
    const g = await R.buildGraph(film, t, kind, out, s);
    // lossless for the frame-exact checks: the encoder then cannot change a frame because a neighbour changed
    const args = g.args.filter((a) => a !== '-progress' && a !== 'pipe:1');
    if (lossless) args.splice(args.indexOf('-crf'), 2, '-qp', '0');
    ff(args);
    return { file: out, filter: readFileSync(path.join(s, 'filter.txt'), 'utf8').replaceAll(root, '<root>'), problems, picture: g.picture, summary: g.summary };
  };

  // ---- the cut without any new field
  const base = await render(baseline("v1"));
  if (base.problems.length) throw new Error(base.problems.join("; "));
  const baseFrames = frameCount(base.file);
  check('baseline: frame count', baseFrames === 216, `${baseFrames} frames (9 s at 24 fps)`);
  const baseV = frameMd5(base.file, '0:v'), baseA = frameMd5(base.file, '0:a');
  const filterMd5 = createHash('md5').update(base.filter).digest('hex');
  if (process.env.RENDER_TEST_BASELINE) {
    writeFileSync(process.env.RENDER_TEST_BASELINE, JSON.stringify({ baseV, baseA, filterMd5, filter: base.filter }, null, 1));
    console.log(`baseline written: video ${baseV} audio ${baseA} filter ${filterMd5}`);
  }
  check('baseline: the filter graph is the one before tonight', filterMd5 === BASE.filter, filterMd5);
  check('baseline: decoded picture identical to before tonight', baseV === BASE.video, baseV);
  check('baseline: decoded sound identical to before tonight', baseA === BASE.audio, baseA);

  /** Writes a version into the film's cut/ folder and renders it through the queue with options. */
  const queued = async (v: string, raw: Record<string, unknown>, kind: 'proxy' | 'master', options?: Record<string, unknown>) => {
    writeFileSync(path.join(dir, 'cut', `${v}.json`), JSON.stringify(raw, null, 1));
    const parsed = (await import('../src/server/edit/render-options')).parseRenderOptions(options);
    if (parsed.problems.length) throw new Error(parsed.problems.join('; '));
    await R.queueRender(slug, v, kind, { options: parsed.options });
    await R.drain();
    const st = await R.renderStates(slug, v);
    const tag = parsed.options ? (await import('../src/server/edit/render-options')).optionsTag(parsed.options) : '';
    return { states: st, st: st.variants?.find((x) => x.tag === tag && x.kind === kind) ?? (tag ? undefined : st[kind]) };
  };
  const out = (st: { outputs?: { path: string }[] } | undefined, suffix: string): string => {
    const o = st?.outputs?.find((x) => x.path.endsWith(suffix));
    if (!o) throw new Error(`no output ending ${suffix}: ${JSON.stringify(st?.outputs)}`);
    return path.join(dir, o.path);
  };

  // ---- 1. mirror
  for (const kind of ['proxy', 'master'] as const) {
    const r = await render(timeline('v2', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'h1', src: M('half.mov'), in: 0, out: 2, at: 0 },
        { id: 'h2', src: M('half.mov'), in: 0, out: 2, at: 2, flip: 'h' },
        { id: 'p1', src: M('pattern.mov'), in: 0, out: 2, at: 4 },
      ] },
      { id: 'V2', kind: 'video', name: 'Inserts', clips: [{ id: 'h3', src: M('half.mov'), in: 0, out: 1, at: 4.5, flip: 'h' }] },
    ]), kind);
    const fs = frames(r.file);
    const lr = (f: Uint8Array): [number, number] => [mean(f, 0, SW / 2)[0], mean(f, SW / 2, SW)[0]];
    const [a, b, c] = [lr(fs[24]), lr(fs[72]), lr(fs[120])];
    check(`mirror (${kind}): unflipped clip dark left, bright right`, a[0] < 20 && a[1] > 235, `left ${a[0].toFixed(0)} right ${a[1].toFixed(0)}`);
    check(`mirror (${kind}): flipped V1 clip bright left, dark right`, b[0] > 235 && b[1] < 20 && Math.abs(b[0] - a[1]) < 2 && Math.abs(b[1] - a[0]) < 2, `left ${b[0].toFixed(0)} right ${b[1].toFixed(0)}`);
    check(`mirror (${kind}): flipped V2 clip over the pattern bright left, dark right`, c[0] > 235 && c[1] < 20, `left ${c[0].toFixed(0)} right ${c[1].toFixed(0)}`);
  }
  {
    const bad = await render(timeline('v3', [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'x', src: M('half.mov'), in: 0, out: 1, at: 0, flip: 'v' }] }]));
    check('mirror: flip "v" refused', bad.problems.some((p) => /flip is "h"/.test(p)), bad.problems.join('; '));
  }
  // ---- 3. fades and dissolves
  {
    // a picture fade-out on its own: the picture goes to black, its sound twin keeps its level
    const r = await render(timeline('v30', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c', src: M('red.mov'), in: 0, out: 2, at: 0, fadeOut: 1, fadeIn: 0.5 }] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'ca', src: M('red.mov'), in: 0, out: 2, at: 0 }] },
    ]));
    const fs = frames(r.file), x = pcm(r.file);
    const lum = (k: number): number => mean(fs[k])[0];
    check('fades: a picture clip fades in from black and out to black by itself', lum(0) < 15 && lum(47) < 15 && Math.abs(lum(36) - lum(20) / 2) < 12 && lum(20) > 180,
      `red at frame 0 ${lum(0).toFixed(0)}, 20 ${lum(20).toFixed(0)}, 36 (half way out) ${lum(36).toFixed(0)}, 47 ${lum(47).toFixed(0)}`);
    const lv = [rmsDb(x, 0.05, 0.45), rmsDb(x, 1, 1.4), rmsDb(x, 1.55, 1.95)];
    check('fades: its sound twin keeps its level through the picture fades', Math.max(...lv) - Math.min(...lv) < 0.2, lv.map((d) => d.toFixed(2)).join(' / ') + ' dB');
  }
  {
    const cut = (dis: boolean): Record<string, unknown> => timeline('v31', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'r1', src: M('step.mov'), in: 1, out: 2, at: 0 },
        { id: 'k1', src: M('black.mov'), in: 1, out: 2, at: 1, ...(dis ? { dissolve: 0.5 } : {}) },
        { id: 'r2', src: M('step.mov'), in: 2, out: 3, at: 2, ...(dis ? { dissolve: 0.5 } : {}) },
        { id: 'r3', src: M('step.mov'), in: 4, out: 5, at: 3 },
        { id: 'k2', src: M('black.mov'), in: 0, out: 1, at: 4, ...(dis ? { dissolve: 0.5 } : {}) },
        { id: 'c1', src: M('red.mov'), in: 1, out: 3, at: 5 },
        { id: 'c2', src: M('blue.mov'), in: 1, out: 3, at: 7, ...(dis ? { dissolve: 1 } : {}) },
      ] },
      { id: 'V2', kind: 'video', name: 'Inserts', clips: [
        { id: 'u1', src: M('red.mov'), in: 1, out: 2, at: 9.5 },
        { id: 'u2', src: M('blue.mov'), in: 1, out: 2, at: 10.5, ...(dis ? { dissolve: 0.5 } : {}) },
      ] },
      { id: 'V3', kind: 'video', name: 'Under', clips: [] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [
        { id: 'a1', src: M('red.mov'), in: 1, out: 3, at: 5 },
        { id: 'a2', src: M('blue.mov'), in: 1, out: 3, at: 7, ...(dis ? { dissolve: 1 } : {}) },
      ] },
      { id: 'A2', kind: 'audio', name: 'Effects', clips: [
        { id: 'b1', src: M('red.mov'), in: 1, out: 3, at: 5 },
        { id: 'b2', src: M('blue.mov'), in: 1, out: 3, at: 7 },
      ] },
      { id: 'A3', kind: 'audio', name: 'Bed', clips: [{ id: 'g', src: M('green.mov'), in: 0, out: 2.5, at: 9.5 }] },
    ]);
    // V2 lies over V1's green bed: put green on V1 under it
    const withBed = (raw: Record<string, unknown>): Record<string, unknown> => {
      const v1 = (raw.tracks as { id: string; clips: Clip[] }[]).find((t) => t.id === 'V1')!;
      v1.clips.push({ id: 'gb', src: M('green.mov'), in: 0, out: 3.5, at: 9 });
      return raw;
    };
    const plain = await render(withBed(cut(false)), 'proxy', true);
    const dis = await render(withBed(cut(true)), 'proxy', true);
    if (dis.problems.length) throw new Error(dis.problems.join('; '));
    const A = frames(plain.file), B = frames(dis.file);
    check('dissolve: the length is unchanged', A.length === 300 && B.length === 300 && frameCount(dis.file) === 300, `${A.length} and ${B.length} frames`);
    const stretches = [[18, 30], [42, 54], [90, 102], [156, 180], [246, 258]];
    const inside = (k: number): boolean => stretches.some(([a, b]) => k >= a && k < b);
    const same = A.map((f, k) => inside(k) || Buffer.compare(Buffer.from(f), Buffer.from(B[k])) === 0);
    const changed = A.map((f, k) => Buffer.compare(Buffer.from(f), Buffer.from(B[k])) !== 0).filter(Boolean).length;
    check('dissolve: every frame outside the five stretches is untouched', same.every(Boolean), `${same.filter((x) => !x).length} frames outside differ; ${changed} differ in all (stretches ${stretches.map(([a, b]) => `${a}-${b - 1}`).join(', ')})`);
    // the step file is dark grey (51) until 2 s and light grey (214) after: past r1's out point (2 s) the file is
    // light, its last frame dark; before r2's in point (2 s) the file is dark, its first frame light
    const w = (k: number, D: number): number => (k + 1) / (D + 1);
    const grey = (f: Uint8Array): number => mean(f)[1];
    const dark = grey(A[10]), light = grey(A[60]);
    const outgoing = [25, 27].map((f) => grey(B[f]) / (1 - w(f - 18, 12)));
    check('dissolve: the outgoing clip runs on past its out point from its file', outgoing.every((g) => Math.abs(g - light) < 15), `${outgoing.map((g) => g.toFixed(0)).join(', ')} after the out point (the file there ${light.toFixed(0)}, its last frame held would be ${dark.toFixed(0)})`);
    const incoming = [44, 46].map((f) => grey(B[f]) / w(f - 42, 12));
    check('dissolve: the incoming clip starts before its in point from its file', incoming.every((g) => Math.abs(g - dark) < 15), `${incoming.map((g) => g.toFixed(0)).join(', ')} before the in point (the file there ${dark.toFixed(0)}, its first frame held would be ${light.toFixed(0)})`);
    const heldOut = [96, 98].map((f) => grey(B[f]) / (1 - w(f - 90, 12)));
    const last = grey(A[95]);
    check('dissolve: at the end of its file the outgoing clip holds its last frame', heldOut.every((g) => Math.abs(g - last) < 15), `${heldOut.map((g) => g.toFixed(0)).join(', ')} (its last frame ${last.toFixed(0)})`);
    const red = mean(A[160]), blue = mean(A[175]);
    const mid = mean(B[167]).map((v, i) => (v + mean(B[168])[i]) / 2);
    const avg = red.map((v, i) => (v + blue[i]) / 2);
    check('dissolve: the middle of the stretch is the average of the two clips', dist(mid, avg) < 3 && dist(mean(B[155]), red) < 1.5 && dist(mean(B[180]), blue) < 1.5,
      `red ${rgb(red)}, blue ${rgb(blue)}, middle ${rgb(mid)} (average ${rgb(avg)}), first frame of the stretch ${rgb(mean(B[156]))}`);
    const uMid = mean(B[251]).map((v, i) => (v + mean(B[252])[i]) / 2);
    check('dissolve: on an upper track too, the clip under unseen', dist(uMid, avg) < 3 && dist(mean(B[244]), red) < 1.5 && dist(mean(B[260]), blue) < 1.5, `middle ${rgb(uMid)}, before ${rgb(mean(B[244]))}, after ${rgb(mean(B[260]))}`);
    // sound: A1's incoming clip has the dissolve field and cross-fades; A2, the same two clips without it, cuts
    const solo = await render((() => { const r = withBed(cut(true)); (r.tracks as { id: string; muted?: boolean }[]).find((t) => t.id === 'A2')!.muted = true; return r; })(), 'proxy', true);
    const xs = pcm(solo.file);
    const rms660 = [6.55, 6.75, 7.0, 7.25, 7.45].map((t) => toneDb(xs, 660, t - 0.04, t + 0.04));
    const rms880 = [6.55, 6.75, 7.0, 7.25, 7.45].map((t) => toneDb(xs, 880, t - 0.04, t + 0.04));
    const lin = (d: number): number => Math.pow(10, d / 20);
    const full = toneDb(xs, 660, 6.0, 6.4);
    const shares = rms660.map((d) => lin(d - full));
    const sharesIn = rms880.map((d) => lin(d - full));
    check('dissolve: alone, the cross-fade is linear in level from 6.5 s to 7.5 s and the two add to one', [0.95, 0.75, 0.5, 0.25, 0.05].every((v, i) => Math.abs(shares[i] - v) < 0.04 && Math.abs(shares[i] + sharesIn[i] - 1) < 0.05),
      `outgoing ${shares.map((v) => v.toFixed(2)).join(' ')} · incoming ${sharesIn.map((v) => v.toFixed(2)).join(' ')} at 6.55 6.75 7.0 7.25 7.45 s`);
    const only2 = await render((() => { const r = withBed(cut(true)); (r.tracks as { id: string; muted?: boolean }[]).find((t) => t.id === 'A1')!.muted = true; return r; })(), 'proxy', true);
    const x2 = pcm(only2.file);
    const hard = [toneDb(x2, 660, 6.6, 6.98), toneDb(x2, 660, 7.02, 7.4), toneDb(x2, 880, 6.6, 6.98), toneDb(x2, 880, 7.02, 7.4)];
    check('dissolve: the picture\'s dissolve leaves the sound alone; a sound without the field cuts at the join', Math.abs(hard[0] - full) < 0.1 && hard[1] < -60 && hard[2] < -60 && Math.abs(hard[3] - full) < 0.1,
      `A2: 660 Hz ${hard[0].toFixed(1)} then ${hard[1].toFixed(0)} dB, 880 Hz ${hard[2].toFixed(0)} then ${hard[3].toFixed(1)} dB`);
    const tooLong = await render(timeline('v32', [{ id: 'V1', kind: 'video', name: 'Picture', clips: [
      { id: 'x1', src: M('red.mov'), in: 0, out: 1, at: 0 }, { id: 'x2', src: M('blue.mov'), in: 0, out: 2, at: 1, dissolve: 3 }] }]));
    const zero = await render(timeline('v33', [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'x1', src: M('red.mov'), in: 0, out: 1, at: 0, dissolve: -1 }] }]));
    check('dissolve: one that does not fit, or is not a length, is refused in words', tooLong.problems.length > 0 && zero.problems.length > 0, [...tooLong.problems, ...zero.problems].join(' | '));
  }

  // ---- 4. level points inside a sound clip
  {
    // music (a steady 220 Hz tone) from 1 s, its source from 0; points in source seconds; the clip's gain -6
    const pts = [{ t: 2, db: 0 }, { t: 4, db: -12 }, { t: 6, db: -12 }, { t: 6.5, db: 3 }];
    const curve = (s: number): number => {
      if (s <= pts[0].t) return pts[0].db;
      for (let k = 1; k < pts.length; k++) if (s <= pts[k].t) return pts[k - 1].db + ((pts[k].db - pts[k - 1].db) * (s - pts[k - 1].t)) / (pts[k].t - pts[k - 1].t);
      return pts[pts.length - 1].db;
    };
    const cut = (withPts: boolean, speed = 1): Record<string, unknown> => timeline('v50', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('pattern.mov'), in: 0, out: 6, at: 0 }, { id: 'p2', src: M('pattern.mov'), in: 0, out: 4, at: 6 }] },
      { id: 'A3', kind: 'audio', name: 'Music', clips: [{ id: 'm', src: M('music.wav'), in: 0, out: 8, at: 1, gain: -6, fadeOut: 0.5, ...(speed !== 1 ? { speed } : {}), ...(withPts ? { gainPoints: pts } : {}) }] },
    ]);
    const flat = pcm((await render(cut(false))).file);
    const x = pcm((await render(cut(true))).file);
    const ref = rmsDb(flat, 1.5, 2.5);
    const at = [1.5, 2.9, 3.5, 4.0, 4.6, 5.5, 6.9, 7.1, 7.3, 7.6, 8.2];   // timeline seconds (source = timeline - 1)
    const errs = at.map((tl) => { const got = rmsDb(x, tl - 0.025, tl + 0.025) - ref; const want = curve(tl - 1); return { tl, got, want, err: got - want }; });
    check('level points: before, along and after each point the level follows the curve', errs.every((e) => Math.abs(e.err) < 0.5),
      errs.map((e) => `${e.tl}s ${e.got.toFixed(2)}/${e.want.toFixed(2)}`).join(' · ') + ' dB (got/want, against the clip without points)');
    check('level points: the clip\'s fade-out still applies on top', rmsDb(x, 8.96, 8.99) < rmsDb(x, 8.4, 8.45) - 15 && Math.abs(rmsDb(flat, 0.2, 0.8) - rmsDb(x, 0.2, 0.8)) < 0.01,
      `last 40 ms ${rmsDb(x, 8.96, 8.99).toFixed(1)} dB vs ${rmsDb(x, 8.4, 8.45).toFixed(1)} before the fade`);
    const xs = pcm((await render(cut(true, 2))).file);
    const flat2 = pcm((await render(cut(false, 2))).file);
    const ref2 = rmsDb(flat2, 1.2, 1.8);
    const at2 = [1.4, 2.0, 2.5, 3.2, 3.5, 4.2];   // at speed 2, source second s is at 1 + s/2
    const e2 = at2.map((tl) => { const got = rmsDb(xs, tl - 0.025, tl + 0.025) - ref2; const want = curve((tl - 1) * 2); return { tl, got, want }; });
    check('level points: at speed 2 the points stay with the source (twice as close on the timeline)', e2.every((e) => Math.abs(e.got - e.want) < 0.6),
      e2.map((e) => `${e.tl}s ${e.got.toFixed(2)}/${e.want.toFixed(2)}`).join(' · '));
    const bad = await Promise.all([
      render(timeline('v51', [{ id: 'A1', kind: 'audio', name: 'D', clips: [{ id: 'q', src: M('fx.wav'), in: 0, out: 2, at: 0, gainPoints: [{ t: 1, db: 0 }, { t: 0.5, db: -3 }] }] }])),
      render(timeline('v52', [{ id: 'A1', kind: 'audio', name: 'D', clips: [{ id: 'q', src: M('fx.wav'), in: 0, out: 2, at: 0, gainPoints: [{ t: 1, db: 40 }] }] }])),
      render(timeline('v53', [{ id: 'V1', kind: 'video', name: 'P', clips: [{ id: 'q', src: M('red.mov'), in: 0, out: 2, at: 0, gainPoints: [{ t: 1, db: 0 }] }] }])),
    ]);
    check('level points: out of order, out of range, or on a picture clip, refused in words', bad.every((b) => b.problems.length === 1), bad.map((b) => b.problems[0]).join(' | '));
  }

  // ---- the page's edits keep the new fields (model.ts and shots.ts: split, paste, move, the shot split)
  {
    const Mo = await import('../src/components/edit/model');
    const Sh = await import('../src/components/edit/shots');
    const tl = timeline('v40', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'e1', src: M('red.mov'), in: 0, out: 2, at: 0 },
        { id: 'e2', src: M('blue.mov'), in: 0, out: 4, at: 2, flip: 'h', dissolve: 0.5, gainPoints: [{ t: 1, db: 0 }, { t: 3, db: -6 }] },
      ] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] },
    ]) as unknown as Parameters<typeof Mo.splitClip>[0];
    const sp = Mo.splitClip(tl, { trackId: 'V1', clipId: 'e2' }, 72)!.tl.tracks[0].clips;
    const [l, r] = [sp.find((c) => c.id === 'e2')!, sp.find((c) => c.id !== 'e1' && c.id !== 'e2')!] as (typeof sp[number] & Record<string, unknown>)[];
    check('page: a split keeps flip and level points on both pieces, the dissolve on the first only', l.flip === 'h' && r.flip === 'h' && l.dissolve === 0.5 && r.dissolve === undefined && JSON.stringify(l.gainPoints) === JSON.stringify(r.gainPoints),
      `left ${JSON.stringify({ flip: l.flip, dissolve: l.dissolve, gainPoints: l.gainPoints })} · right ${JSON.stringify({ flip: r.flip, dissolve: r.dissolve, gainPoints: r.gainPoints })}`);
    const pasted = Mo.pasteClip(tl, tl.tracks[0].clips[1], 'V1', 200).edit!.tl.tracks[0].clips.find((c) => c.id.startsWith('p'))! as unknown as Record<string, unknown>;
    const moved = Mo.moveClip(tl, { trackId: 'V1', clipId: 'e2' }, 24, false)!.tl.tracks[0].clips.find((c) => c.id === 'e2')! as unknown as Record<string, unknown>;
    const shot = Sh.shotTimeline(tl, new Map([[M('blue.mov'), { src: M('blue.mov'), scene: 'S1', name: 'take 1', seconds: 5, cuts: [2], state: 'ready' as const }]])).tracks[0].clips.filter((c) => c.src === M('blue.mov')) as unknown as Record<string, unknown>[];
    check('page: paste, move and the shot split keep them too', pasted.flip === 'h' && JSON.stringify(pasted.gainPoints) === JSON.stringify(moved.gainPoints) && moved.dissolve === 0.5 && shot.length === 2 && shot[0].dissolve === 0.5 && shot[1].dissolve === undefined && shot[1].flip === 'h',
      `pasted ${JSON.stringify({ flip: pasted.flip, dissolve: pasted.dissolve })}, moved ${JSON.stringify({ dissolve: moved.dissolve })}, shot pieces ${shot.map((c) => JSON.stringify({ dissolve: c.dissolve, flip: c.flip })).join(' ')}`);
  }

  // ---- 2. stems and leaving out
  {
    const raw = timeline('v10', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'k1', src: M('card.mov'), in: 0, out: 2, at: 0, label: 'Title card · The harbour' },
        { id: 'c1', src: M('pattern.mov'), in: 0, out: 3, at: 2 },
        { id: 'c2', src: M('red.mov'), in: 0, out: 3, at: 5 },
      ] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [
        { id: 'c1a', src: M('pattern.mov'), in: 0, out: 3, at: 2 },
        { id: 'c2a', src: M('red.mov'), in: 0, out: 3, at: 5 },
      ] },
      { id: 'A2', kind: 'audio', name: 'Effects', clips: [
        { id: 'k1a', src: M('card.mov'), in: 0, out: 2, at: 0, label: 'Title card · The harbour' },
        { id: 'fx', src: M('fx.wav'), in: 0, out: 2, at: 3, gain: -6 },
      ] },
      { id: 'A3', kind: 'audio', name: 'Music', clips: [{ id: 'm1', src: M('music.wav'), in: 0, out: 8, at: 0, gain: -12, fadeIn: 1, fadeOut: 1 }] },
      { id: 'A4', kind: 'audio', name: 'Dialogue 2', clips: [{ id: 'u1', src: M('blue.mov'), in: 0, out: 2, at: 4, unlinked: true }] },
    ]);
    const { st, states } = await queued('v10', raw, 'proxy', { stems: true, leaveOut: { cards: true } });
    check('stems: the render with options is done and listed with the version', st?.state === 'done' && states.proxy?.state === 'none', `${st?.state} ${st?.error ?? ''} · tag ${st?.tag} · plain proxy ${states.proxy?.state}`);
    const names = (st?.outputs ?? []).map((o) => path.basename(o.path));
    check('stems: every file, beside the plain render', names.join(' ') === 'v10-proxy-without-cards-stems.mp4 v10-proxy-without-cards-stems.picture.mp4 v10-proxy-without-cards-stems.A1-Dialogue.wav v10-proxy-without-cards-stems.A2-Effects.wav v10-proxy-without-cards-stems.A3-Music.wav v10-proxy-without-cards-stems.A4-Dialogue-2.wav v10-proxy-without-cards-stems.dialogue.wav v10-proxy-without-cards-stems.no-dialogue.wav v10-proxy-without-cards-stems.mix.wav', names.join(' '));
    const pic = out(st, '.picture.mp4');
    check('stems: the picture alone has no sound and every frame', !hasAudio(pic) && frameCount(pic) === 192, `${frameCount(pic)} frames, sound ${hasAudio(pic)}`);
    const fsMain = frames(out(st, 'stems.mp4'));
    const card = mean(fsMain[24]), pat = mean(fsMain[72]);
    check('leave out cards: black where the card was, the rest drawn', Math.max(...card) < 3 && Math.max(...pat) > 40 && fsMain.length === 192, `card ${rgb(card)} · pattern ${rgb(pat)} · ${fsMain.length} frames`);
    const tones: Record<string, [number, number, number]> = { 440: [2, 5, 0], 660: [5, 8, 0], 880: [4, 6, 0], 1500: [3, 5, 0], 220: [0, 8, 0], 330: [0, 2, 0] };
    const want: Record<string, number[]> = {
      'A1-Dialogue.wav': [440, 660], 'A2-Effects.wav': [1500], 'A3-Music.wav': [220], 'A4-Dialogue-2.wav': [880],
      'dialogue.wav': [440, 660, 880], 'no-dialogue.wav': [1500, 220], 'mix.wav': [440, 660, 880, 1500, 220],
    };
    const mix = pcm(out(st, 'mix.wav'));
    const sums = { tracks: new Float32Array(mix.length), groups: new Float32Array(mix.length) };
    for (const [file, hz] of Object.entries(want)) {
      const x = pcm(out(st, `.${file}`));
      const got = Object.keys(tones).map((f) => { const [a, b] = tones[f]; return [Number(f), toneDb(x, Number(f), a + 0.2, b - 0.2)] as const; });
      const present = got.filter(([f]) => hz.includes(f)), absent = got.filter(([f]) => !hz.includes(f));
      check(`stem ${file}: its tones and only its tones`, x.length === mix.length && present.every(([, d]) => d > -45) && absent.every(([, d]) => d < -90),
        got.map(([f, d]) => `${f} Hz ${d.toFixed(0)}`).join(', ') + ' dB');
      if (/^A\d/.test(file)) x.forEach((v, i) => (sums.tracks[i] += v));
      if (/^(no-)?dialogue/.test(file)) x.forEach((v, i) => (sums.groups[i] += v));
    }
    const maxErr = (a: Float32Array): number => { let m = 0; for (let i = 0; i < mix.length; i++) m = Math.max(m, Math.abs(a[i] - mix[i])); return m; };
    check('stems: the track stems add up to the mix', maxErr(sums.tracks) < 1e-5, `largest difference ${maxErr(sums.tracks).toExponential(1)} (24-bit steps are 1.2e-7)`);
    check('stems: dialogue + everything but dialogue add up to the mix', maxErr(sums.groups) < 1e-5, `largest difference ${maxErr(sums.groups).toExponential(1)}`);
    const again = Date.now();
    const twice = await queued('v10', raw, 'proxy', { leaveOut: { cards: true }, stems: true });
    check('stems: asked again, it answers done at once (nothing rendered or written over)', twice.st?.state === 'done' && Date.now() - again < 1500, `${Date.now() - again} ms`);
    // a cut whose sound all starts late: a WAV has no start time of its own, so the stems must hold the silence
    const late = timeline('v12', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('pattern.mov'), in: 0, out: 6, at: 0 }] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] },
      { id: 'A2', kind: 'audio', name: 'Effects', clips: [{ id: 'fx', src: M('fx.wav'), in: 0, out: 2, at: 3 }, { id: 'fx2', src: M('fx.wav'), in: 0, out: 1, at: 5 }] },
    ]);
    const lst = (await queued('v12', late, 'proxy', { stems: true })).st;
    const lx = pcm(out(lst, '.A2-Effects.wav')), lm = pcm(out(lst, '.mix.wav'));
    check('stems: sound that starts late stays in its place in the WAVs', lx.length === 6 * SR && lm.length === 6 * SR && toneDb(lx, 1500, 0.5, 2.9) < -90 && toneDb(lx, 1500, 3.1, 4.9) > -25 && toneDb(lm, 1500, 0.5, 2.9) < -90 && toneDb(lm, 1500, 3.1, 4.9) > -25,
      `${(lx.length / SR).toFixed(2)} s; 1500 Hz before 3 s ${toneDb(lx, 1500, 0.5, 2.9).toFixed(0)} dB, from 3 s ${toneDb(lx, 1500, 3.1, 4.9).toFixed(1)} dB`);
    const bad = await queued('v11', { ...raw, version: 'v11' }, 'proxy', { leaveOut: { tracks: ['A9'] } });
    check('leave out: an id the version does not have fails, in words', bad.st?.state === 'failed' && /has no track A9/.test(bad.st.error ?? ''), bad.st?.error ?? '');
  }
  {
    const P = (await import('../src/server/edit/render-options')).parseRenderOptions;
    const a = P({ loudness: { lufs: 3 } }), b = P({ loud: true }), c = P({ leaveOut: { tracks: 'A1' } }), d = P({ stems: false });
    check('options: nonsense refused in words, an empty set is the plain render', a.problems.length === 1 && b.problems.length === 1 && c.problems.length === 1 && d.options === undefined && !d.problems.length,
      [...a.problems, ...b.problems, ...c.problems].join(' | '));
  }

  // ---- 2. loudness
  {
    const cases: [string, string, Clip[], number, number, 'linear' | 'limiter'][] = [
      ['a quiet mix up to -14', 'v20', [{ id: 'q', src: M('quiet.wav'), in: 0, out: 10, at: 0 }], -14, -1, 'linear'],
      ['a loud mix down to -23', 'v21', [{ id: 'q', src: M('music.wav'), in: 0, out: 10, at: 0, gain: 17 }], -23, -1, 'linear'],
      ['a mix with loud bursts up to -14', 'v22', [{ id: 'q', src: M('crest.wav'), in: 0, out: 10, at: 0 }], -14, -1, 'limiter'],
      ['a ceiling of -2 dBTP', 'v23', [{ id: 'q', src: M('crest.wav'), in: 0, out: 10, at: 0 }], -16, -2, 'limiter'],
    ];
    for (const [what, v, clips, lufs, tp, mode] of cases) {
      const raw = timeline(v, [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('pattern.mov'), in: 0, out: 2, at: 0 }] }, { id: 'A1', kind: 'audio', name: 'Dialogue', clips }]);
      const { st } = await queued(v, raw, 'proxy', { loudness: { lufs, truePeak: tp } });
      const file = st?.state === 'done' ? out(st, '.mp4') : '';
      const m = file ? loudness(file) : { i: NaN, tp: NaN };
      const L = st?.loudness;
      check(`loudness: ${what}`, Math.abs(m.i - lufs) <= 0.5 && m.tp <= tp && L?.mode === mode && Math.abs((L?.after.i ?? 0) - m.i) < 0.2,
        `${st?.state} ${st?.error ?? ''} · before ${L?.before.i} LUFS ${L?.before.tp} dBTP → ${m.i} LUFS, true peak ${m.tp} dBTP (${L?.mode}${L?.gain !== undefined ? ` ${L.gain} dB` : ''}); stored ${L?.after.i} / ${L?.after.tp}`);
    }
    const silent = timeline('v24', [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('pattern.mov'), in: 0, out: 2, at: 0 }] }]);
    const { st } = await queued('v24', silent, 'proxy', { loudness: { lufs: -14 } });
    check('loudness: a silent mix fails in words, nothing written', st?.state === 'failed' && /silent/.test(st.error ?? '') && !st.outputs, st?.error ?? '');
  }

  // ---- 3. the Edit page's "More renders" panel: the exact body it posts (renderAsk.ts askOptions/askBody, through
  // JSON as fetch sends it) is accepted by the route's check, renders, and comes back in the shape the panel reads
  {
    const A = await import('../src/components/edit/renderAsk');
    const raw = timeline('v26', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'k1', src: M('card.mov'), in: 0, out: 2, at: 0, label: 'Title card · The harbour' },
        { id: 'p1', src: M('pattern.mov'), in: 0, out: 4, at: 2 },
      ] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'q', src: M('quiet.wav'), in: 0, out: 6, at: 0 }] },
      { id: 'A2', kind: 'audio', name: 'Music', clips: [{ id: 'm', src: M('music.wav'), in: 0, out: 6, at: 0, gain: -6 }] },
    ]);
    const ask = { ...A.emptyAsk(), lufs: '−16', ceiling: '-1.5', stems: true, cards: true, tracks: ['A2'] };
    const { options, why } = A.askOptions(ask);
    const body = JSON.parse(JSON.stringify(A.askBody('v26', ask.kind, options!))) as { version: string; kind: 'proxy'; options: Record<string, unknown> };
    const P = (await import('../src/server/edit/render-options')).parseRenderOptions(body.options);
    check('page: its request checks out on the server unchanged', !why && !P.problems.length && JSON.stringify(P.options) === JSON.stringify(body.options),
      `${JSON.stringify(body)} → ${JSON.stringify(P.options)} ${P.problems.join('; ')}`);
    const { st } = await queued(body.version, raw, body.kind, body.options);
    const names = new Map((raw.tracks as { id: string; name: string }[]).map((t) => [t.id, t.name]));
    const said = A.describe(options!, ask.kind, (id) => names.get(id));
    const listed = st?.options ? A.describe(st.options, st.kind, (id) => names.get(id)) : '';
    check('page: the render the panel lists is the one its summary promised', st?.state === 'done' && st.tag === 'without-cards-A2-lufs16-tp1.5-stems' && listed === said
      && said === 'A 480p file without the title cards and A2 Music, its sound at −16 LUFS under −1.5 dBTP, and the separate sound files and the picture alone',
      `${st?.state} ${st?.error ?? ''} · ${st?.tag} · "${listed}"`);
    const line = st?.loudness ? A.loudnessLine(st.loudness) : '';
    const m = loudness(out(st, `${st?.tag}.mp4`));
    check('page: its loudness line is what the file measures', /^was −\d+(\.\d+)? LUFS, peak −\d+(\.\d+)? dBTP → now −1[56](\.\d)? LUFS, peak −\d+(\.\d)? dBTP · /.test(line) && Math.abs(m.i - (st?.loudness?.after.i ?? 0)) < 0.2 && m.tp <= -1.5,
      `${line} · measured ${m.i} LUFS ${m.tp} dBTP`);
    const outs = st?.outputs ?? [];
    check('page: every file has a path under cut/renders/ and words, and what was left out is said', outs.length === 6 && outs.every((o) => o.path.startsWith('cut/renders/v26-proxy-') && o.what.length > 5)
      && JSON.stringify([...(st?.leftOut ?? [])].sort()) === JSON.stringify(['V1 clip k1 "Title card · The harbour"', 'track A2 Music']) && !!st?.startedAt && st.seconds !== undefined,
      `${outs.map((o) => A.baseName(o.path)).join(' ')} · ${JSON.stringify(st?.leftOut)}`);
    const refused = [A.askOptions({ ...A.emptyAsk(), lufs: '-50' }).why, A.askOptions({ ...A.emptyAsk(), lufs: '-14', ceiling: '1' }).why, A.askOptions(A.emptyAsk()).why];
    check('page: out of range, or nothing chosen, nothing is posted', refused.every(Boolean), refused.join(' | '));
  }

  // ---- the smaller file (14 Nov, ASKS 56): options.small, a master encoded again (x264 veryslow CRF 21), its sound
  // copied. The films are 360×640 and two seconds long so that veryslow takes a second or two.
  {
    const RO = await import('../src/server/edit/render-options');
    const A = await import('../src/components/edit/renderAsk');
    const P = RO.parseRenderOptions;
    const ok1 = P({ small: true }), bad1 = P({ small: 'yes' }), bad2 = P({ small: true, stems: true }), off = P({ small: false });
    check('small: parsed; a wrong type and stems refused in words; false is the plain render', JSON.stringify(ok1.options) === '{"small":true}' && bad1.problems[0] === 'options.small must be true or false'
      && /does not go with options\.stems/.test(bad2.problems[0] ?? '') && !bad2.options && off.options === undefined && !off.problems.length,
      [...bad1.problems, ...bad2.problems].join(' | '));
    const proxyNo = RO.kindProblems('proxy', { small: true });
    let thrown = '';
    try { await R.queueRender(slug, 'v1', 'proxy', { options: { small: true } }); } catch (e) { thrown = `${(e as { status?: number }).status} ${(e as Error).message}`; }
    check('small: on a 480p refused, before anything is queued', proxyNo.length === 1 && /^400 .*options\.small is for the master only/.test(thrown), thrown);
    const tags = [RO.optionsTag({ small: true }), RO.optionsTag({ loudness: { lufs: -14, truePeak: -1 }, small: true }), RO.optionsTag({ leaveOut: { cards: true }, loudness: { lufs: -14, truePeak: -1 }, small: true })];
    const names = [`${R.variantBase('v235', 'master', tags[0])}.mp4`, `${R.variantBase('v235', 'master', tags[1])}.mp4`, `${R.variantBase('v235', 'master', tags[2])}.mp4`];
    check('small: the tag is the last part of the name', names.join(' ') === 'cut/renders/v235-master-small.mp4 cut/renders/v235-master-lufs14-tp1-small.mp4 cut/renders/v235-master-without-cards-lufs14-tp1-small.mp4', names.join(' '));
    const vs = [RO.smallVerdict({ frames: 48, srcFrames: 47, bytes: 1, fromBytes: 2 }), RO.smallVerdict({ frames: 48, srcFrames: 48, bytes: 98e6, fromBytes: 96e6 }),
      RO.smallVerdict({ frames: 48, srcFrames: 48, bytes: 60e6, fromBytes: 101e6, ssim: 0.97 }), RO.smallVerdict({ frames: 48, srcFrames: 48, bytes: 60e6, fromBytes: 101e6, ssim: 0.992 })];
    check('small: the refusals in words (frames, no smaller, SSIM under 0.98); a good one passes', vs[0] === 'the smaller file has 48 frames, the one it came from 47: nothing written'
      && vs[1] === 'the smaller file came out no smaller (98 MB against 96 MB): the normal one is the one to use' && vs[2] === 'the smaller file lost too much: SSIM 0.97; nothing written' && vs[3] === undefined, vs.join(' | '));
    // the panel: the box is counted only on a master without stems; its words
    const askM = { ...A.emptyAsk(), kind: 'master' as const, lufs: '-14', small: true };
    const said = A.describe(A.askOptions(askM).options!, 'master', () => undefined);
    const alone = A.askOptions({ ...A.emptyAsk(), kind: 'master', small: true }).options;
    check('small: the panel asks for it with a master, says it, and not on a 480p or with stems', JSON.stringify(A.askOptions(askM).options) === '{"loudness":{"lufs":-14,"truePeak":-1},"small":true}'
      && said === 'A full-size file, its sound at −14 LUFS under −1 dBTP, as a smaller file' && JSON.stringify(alone) === '{"small":true}' && A.describe(alone!, 'master', () => undefined) === 'The master as a smaller file'
      && A.askOptions({ ...A.emptyAsk(), small: true }).why !== undefined && !A.askOptions({ ...askM, stems: true }).options?.small
      && A.smallOff({ kind: 'proxy', stems: false }) === 'For the full size only: the 480p is a small file already.' && !!A.smallOff({ kind: 'master', stems: true })?.startsWith('Not with the separate files') && A.smallOff({ kind: 'master', stems: false }) === undefined,
      `${said} · ${A.describe(alone!, 'master', () => undefined)}`);

    const tiny = (v: string, clips: Clip[]): Record<string, unknown> => ({ ...timeline(v, [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('pattern.mov'), in: 0, out: 2, at: 0 }] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips },
    ]), width: 360, height: 640 });
    const rd = path.join(dir, 'cut', 'renders');
    const md5 = (f: string): string => createHash('md5').update(readFileSync(f)).digest('hex');
    const { existsSync, statSync, readdirSync, unlinkSync } = await import('node:fs');
    const soundMd5 = (f: string): string => ff(['-i', f, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-']).toString().trim();
    const probeV = (f: string): string => execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,color_space,color_primaries,color_transfer', '-of', 'csv=p=0', f]).toString().trim();
    const logCount = (v: string, re: RegExp): number => (readFileSync(path.join(rd, `${v}.log`), 'utf8').match(re) ?? []).length;

    // 1. from the master already there: the master is not rendered again
    const v1 = tiny('v80', [{ id: 'q', src: M('pattern.mov'), in: 0, out: 2, at: 0 }]);
    writeFileSync(path.join(dir, 'cut', 'v80.json'), JSON.stringify(v1, null, 1));
    await R.queueRender(slug, 'v80', 'master');
    await R.drain();
    const master = path.join(rd, 'v80-master.mp4');
    const before = { md5: md5(master), mtime: statSync(master).mtimeMs };
    const first = await R.queueRender(slug, 'v80', 'master', { options: { small: true } });
    const second = await R.queueRender(slug, 'v80', 'master', { options: { small: true } });
    check('small: a second ask while it runs is the same render, not another', first === second && (first.state === 'queued' || first.state === 'running') && first.tag === 'small', `${first.state} ${first.tag} · same job ${first === second}`);
    let sawRunning = false, maxPct = 0;
    while ((await R.renderStates(slug, 'v80')).variants?.some((x) => x.state === 'queued' || x.state === 'running')) {
      const st = (await R.renderStates(slug, 'v80')).variants?.find((x) => x.tag === 'small');
      if (st?.state === 'running') { sawRunning = true; maxPct = Math.max(maxPct, st.percent ?? 0); }
      await new Promise((r) => setTimeout(r, 15));
    }
    const sm = (await R.renderStates(slug, 'v80')).variants?.find((x) => x.tag === 'small');
    const smFile = path.join(rd, 'v80-master-small.mp4');
    check('small: from the master there, written as v80-master-small.mp4 with its record', sm?.state === 'done' && sm.path === 'cut/renders/v80-master-small.mp4' && existsSync(smFile) && existsSync(path.join(rd, 'v80-master-small.json'))
      && sm.small?.from === 'cut/renders/v80-master.mp4' && sm.small.made === false, `${sm?.state} ${sm?.error ?? ''} · ${JSON.stringify(sm?.small)}`);
    check('small: its progress is followed as a master\'s is (state and percent)', sawRunning && maxPct > 0 && maxPct < 100, `running seen ${sawRunning}, highest ${maxPct}%`);
    check('small: the master was not rendered again, nor touched', md5(master) === before.md5 && statSync(master).mtimeMs === before.mtime && logCount('v80', /^== master render of v80/gm) === 1
      && /rendered already and up to date; it is not rendered again/.test(readFileSync(path.join(rd, 'v80.log'), 'utf8')), `master renders in the log: ${logCount('v80', /^== master render of v80/gm)}`);
    check('small: the same frames, recorded', frameCount(smFile) === frameCount(master) && sm?.small?.frames === frameCount(master) && frameCount(master) === 48, `${frameCount(smFile)} and ${frameCount(master)} frames, recorded ${sm?.small?.frames}`);
    check('small: the sound copied byte for byte, recorded', soundMd5(smFile) === soundMd5(master) && sm?.small?.sound.copied === true && sm.small.sound.codec === 'aac' && Math.abs(sm.small.sound.seconds - 2) < 0.05,
      `${soundMd5(smFile)} · ${JSON.stringify(sm?.small?.sound)}`);
    check('small: the sizes before and after, recorded, and smaller', sm?.small?.bytes === statSync(smFile).size && sm.small.fromBytes === statSync(master).size && sm.small.bytes < sm.small.fromBytes,
      `${sm?.small?.bytes} from ${sm?.small?.fromBytes} bytes`);
    check('small: SSIM against the master recorded, at 0.98 or more', (sm?.small?.ssim ?? 0) >= 0.98 && (sm?.small?.ssim ?? 2) <= 1 && sm?.small?.encode === 'libx264 veryslow CRF 21', `SSIM ${sm?.small?.ssim} · ${sm?.small?.encode}`);
    check('small: the master\'s pixel format and colour tags', probeV(smFile) === probeV(master) && probeV(smFile) === 'h264,yuv420p,bt709,bt709,bt709', `${probeV(smFile)} (master ${probeV(master)})`);
    const again = Date.now();
    const twice = await R.queueRender(slug, 'v80', 'master', { options: { small: true } });
    check('small: asked again when done, it answers done at once', twice.state === 'done' && Date.now() - again < 1500, `${twice.state} in ${Date.now() - again} ms`);
    const { renderFiles } = await import('../src/server/edit/render-files');
    const L = await import('../src/components/edit/renderList');
    const listed = (await renderFiles(film)).find((f) => f.path === 'cut/renders/v80-master-small.mp4');
    const words = listed ? L.fileWords(listed, 360, 640) : undefined;
    const mb = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;
    check('small: the Renders tab lists it as a smaller file with both sizes', !!listed?.small && words?.title === 'Full size of cut v80' && words.extra === `smaller file (${mb(listed.small.bytes)}, from ${mb(listed.small.fromBytes)})`, `${words?.title} · ${words?.extra}`);
    // never over a file: its list gone, the film there: refused, the film untouched
    const smMd5 = md5(smFile);
    unlinkSync(path.join(rd, 'v80-master-small.json'));
    const over = (await (async () => { await R.queueRender(slug, 'v80', 'master', { options: { small: true } }); await R.drain(); return (await R.renderStates(slug, 'v80')).variants?.find((x) => x.tag === 'small'); })());
    check('small: never written over a file there', over?.state === 'failed' && /v80-master-small\.mp4 is already there: nothing written/.test(over.error ?? '') && md5(smFile) === smMd5, over?.error ?? '');

    // 2. from scratch, with a loudness: the normal render is made first and not kept
    const v2 = tiny('v81', [{ id: 'q', src: M('quiet.wav'), in: 0, out: 2, at: 0 }]);
    writeFileSync(path.join(dir, 'cut', 'v81.json'), JSON.stringify(v2, null, 1));
    await R.queueRender(slug, 'v81', 'master', { options: { loudness: { lufs: -14, truePeak: -1 }, small: true } });
    await R.drain();
    const s2 = (await R.renderStates(slug, 'v81')).variants?.find((x) => x.tag === 'lufs14-tp1-small');
    const f2 = path.join(rd, 'v81-master-lufs14-tp1-small.mp4');
    const m2 = existsSync(f2) ? loudness(f2) : { i: NaN, tp: NaN };
    const v81files = readdirSync(rd).filter((n) => n.startsWith('v81')).sort();
    check('small: from scratch, the normal one made first and not kept', s2?.state === 'done' && s2.small?.made === true && s2.small.from === 'made for it, not kept'
      && JSON.stringify(v81files) === JSON.stringify(['v81-master-lufs14-tp1-small.json', 'v81-master-lufs14-tp1-small.mp4', 'v81.log']), `${s2?.state} ${s2?.error ?? ''} · ${v81files.join(' ')}`);
    check('small: from scratch, its loudness pass recorded and heard, the frames kept', Math.abs(m2.i + 14) <= 0.5 && m2.tp <= -1 && Math.abs((s2?.loudness?.after.i ?? 0) - m2.i) < 0.2 && frameCount(f2) === 48 && s2?.small?.frames === 48 && (s2?.small?.ssim ?? 0) >= 0.98,
      `${m2.i} LUFS ${m2.tp} dBTP · stored ${s2?.loudness?.after.i} · ${frameCount(f2)} frames · SSIM ${s2?.small?.ssim}`);

    // 3. from a loudness render already there: it is used, its record carried over
    const v3 = tiny('v82', [{ id: 'q', src: M('quiet.wav'), in: 0, out: 2, at: 0 }]);
    writeFileSync(path.join(dir, 'cut', 'v82.json'), JSON.stringify(v3, null, 1));
    await R.queueRender(slug, 'v82', 'master', { options: { loudness: { lufs: -14, truePeak: -1 } } });
    await R.drain();
    const loud = path.join(rd, 'v82-master-lufs14-tp1.mp4');
    const loudMd5 = md5(loud);
    await R.queueRender(slug, 'v82', 'master', { options: { loudness: { lufs: -14, truePeak: -1 }, small: true } });
    await R.drain();
    const s3 = (await R.renderStates(slug, 'v82')).variants?.find((x) => x.tag === 'lufs14-tp1-small');
    const f3 = path.join(rd, 'v82-master-lufs14-tp1-small.mp4');
    check('small: from the loudness render there, not rendered again; its loudness carried', s3?.state === 'done' && s3.small?.from === 'cut/renders/v82-master-lufs14-tp1.mp4' && s3.small.made === false && md5(loud) === loudMd5
      && logCount('v82', /^== master lufs14-tp1 render of v82/gm) === 1 && JSON.stringify(s3.loudness) === JSON.stringify((await R.renderStates(slug, 'v82')).variants?.find((x) => x.tag === 'lufs14-tp1')?.loudness)
      && soundMd5(f3) === soundMd5(loud), `${s3?.state} ${s3?.error ?? ''} · ${JSON.stringify(s3?.small)}`);

    // 4. no smaller: the master there is a hand-made file at CRF 45 (blocky), which CRF 21 encodes back larger
    const v4 = tiny('v83', [{ id: 'q', src: M('pattern.mov'), in: 0, out: 2, at: 0 }]);
    // with the record of its picture that a master of this cut has (v80's, the same picture), so that it is up to date
    const rec80 = (JSON.parse(readFileSync(path.join(dir, 'cut', 'v80.json'), 'utf8')) as { renders: { master: { picture: PictureMade } } }).renders.master;
    writeFileSync(path.join(dir, 'cut', 'v83.json'), JSON.stringify({ ...v4, renders: { master: { path: 'cut/renders/v83-master.mp4', at: new Date(Date.now() + 1000).toISOString(), hash: 'by hand', picture: rec80.picture } } }, null, 1));
    ff(['-f', 'lavfi', '-i', `testsrc2=s=360x640:r=${FPS}:d=2`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${SR}:duration=2`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '45', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', path.join(rd, 'v83-master.mp4')]);
    await R.queueRender(slug, 'v83', 'master', { options: { small: true } });
    await R.drain();
    const s4 = (await R.renderStates(slug, 'v83')).variants?.find((x) => x.tag === 'small');
    check('small: one that comes out no smaller is refused in words, nothing written', s4?.state === 'failed' && /^the smaller file came out no smaller \(\d+ MB against \d+ MB\): the normal one is the one to use$/.test(s4.error ?? '')
      && !existsSync(path.join(rd, 'v83-master-small.mp4')) && !existsSync(path.join(rd, 'v83-master-small.json')) && (s4.small?.bytes ?? 0) >= (s4.small?.fromBytes ?? 1) && s4.small?.from === 'cut/renders/v83-master.mp4', `${s4?.error} · ${JSON.stringify(s4?.small)}`);
    // the later sections count the masters on disk: these go
    for (const n of readdirSync(rd)) if (/^v8[0-3][-.]/.test(n)) unlinkSync(path.join(rd, n));
  }

  // ---- subtitle lines (14 Nov, ASKS 40): a text line is drawn exactly as an .srt cue is (the same cards); a muted
  // subtitles track, or one left out, gives the picture without them
  {
    writeFileSync(path.join(dir, 'subs.srt'), '1\n00:00:00,500 --> 00:00:01,500\nWho opened\nthe door?\n\n2\n00:00:02,000 --> 00:00:03,000\n<i>Listen.</i>\n');
    const pic = { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'p', src: M('black.mov'), in: 0, out: 4, at: 0 }] };
    const lines = [{ id: 's1', text: 'Who opened\nthe door?', in: 0, out: 1, at: 0.5 }, { id: 's2', text: 'Listen.', in: 0, out: 1, at: 2 }] as unknown as Clip[];
    const withCaps = (v: string, caps: Clip[], muted = false) => timeline(v, [pic as never, { id: 'C1', kind: 'captions', name: 'Subtitles', clips: caps, ...(muted ? { muted: true } : {}) }]);
    for (const kind of ['proxy', 'master'] as const) {
      const none = await render(timeline('v60', [pic as never]), kind, true);
      const srt = await render(withCaps('v61', [{ id: 'cap', src: 'subs.srt', in: 0, out: 4, at: 0 }]), kind, true);
      const txt = await render(withCaps('v62', lines), kind, true);
      const muted = await render(withCaps('v63', lines, true), kind, true);
      const bad = [none, srt, txt, muted].flatMap((r) => r.problems);
      check(`subtitles (${kind}): the cuts with text lines and with an .srt pass the check`, !bad.length, bad.join('; ') || 'no problems');
      const [mNone, mSrt, mTxt, mMuted] = [none, srt, txt, muted].map((r) => frameMd5(r.file, '0:v'));
      check(`subtitles (${kind}): text lines draw the very frames the .srt's cues draw`, mTxt === mSrt, `${mTxt} / ${mSrt}`);
      check(`subtitles (${kind}): and they are drawn (the picture differs from the one without)`, mTxt !== mNone, `${mTxt} / ${mNone}`);
      check(`subtitles (${kind}): a muted subtitles track draws nothing`, mMuted === mNone, `${mMuted} / ${mNone}`);
      const fs = frames(txt.file);
      const lum = (k: number): number => mean(fs[k])[0];
      check(`subtitles (${kind}): a line shows only in its time`, lum(6) < 0.05 && lum(24) > 0.2 && lum(43) < 0.05 && lum(60) > 0.05, `frame 6 ${lum(6).toFixed(2)}, 24 ${lum(24).toFixed(2)}, 43 ${lum(43).toFixed(2)}, 60 ${lum(60).toFixed(2)}`);
      // the words' gold as the file is meant to be seen (decoded by its own colour tags): the master is BT.709 from
      // its sources on (14 Nov), and its subtitles keep their colour
      const full = ff(['-i', txt.file, '-map', '0:v', '-vf', 'select=eq(n\\,24),format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
      const gold = [0, 0, 0]; let k = 0;
      for (let i = 0; i + 2 < full.length; i += 3) if (full[i] > 200 && full[i + 1] > 170 && full[i + 2] > 90 && full[i + 2] < 170) { gold[0] += full[i]; gold[1] += full[i + 1]; gold[2] += full[i + 2]; k++; }
      const g = gold.map((v) => v / Math.max(1, k));
      // (the master measured (239,210,132) over 3969 pixels both before and after the change; the 480p's small words
      // are mostly edge, so it is not checked)
      if (kind === 'master') check('subtitles (master): the words keep their gold (246, 214, 128)', k > 1000 && dist(g, [246, 214, 128]) < 8, `${k} gold pixels, mean ${rgb(g)}`);
    }
    const { st } = await queued('v64', withCaps('v64', lines), 'proxy', { leaveOut: { tracks: ['C1'] } });
    const left = st?.state === 'done' ? frames(out(st, '.mp4')) : [];
    const plain = await queued('v65', withCaps('v65', lines), 'proxy');
    const shown = plain.st?.state === 'done' && plain.st.path ? frames(path.join(dir, plain.st.path)) : [];
    check('subtitles: "leave out" of the subtitles track in More renders gives the picture without them', left.length === 96 && shown.length === 96 && mean(left[24])[0] < 2 && mean(shown[24])[0] > mean(left[24])[0] + 0.5,
      `${st?.state} ${st?.error ?? ''} · frame 24: without ${left[24] ? mean(left[24])[0].toFixed(2) : '?'}, with ${shown[24] ? mean(shown[24])[0].toFixed(2) : '?'}`);
  }

  // ---- 7. the master's picture (14 Nov): the page's own pieces, the upscaled cut (the base) included
  {
    // takes whose every frame says what it is: its number in nine bars at the top (white = 1), a colour tag at the
    // left of the middle (dark at the right, so a mirror shows), grey at the bottom; the base is cut v1's 480p render
    // upscaled with the bottom painted white, so a frame from the base is told from a scaled-up 480p one
    const fm = path.join(dir, 'media', 'full');
    mkdirSync(fm, { recursive: true });
    const take = (name: string, cb: number, cr: number, secs: number, big = false): void => {
      const lum = "if(lt(Y,396),if(mod(floor(N/pow(2,floor(Y/44))),2),235,16),if(lt(Y,750),if(lt(X,240),140,30),128))";
      const ch = (v: number) => `if(between(Y/SH,396,749)*lt(X/SW,240),${v},128)`;
      ff(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${secs}`, '-vf', `format=yuv420p,geq=lum='${lum}':cb='${ch(cb)}':cr='${ch(cr)}'${big ? ',scale=1080:1920:flags=lanczos' : ''}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', '-g', '24', '-y', path.join(fm, name)]);
    };
    const TAGS: Record<string, [number, number]> = { A: [90, 200], B: [90, 60], C: [200, 90], Cs: [40, 150], D: [160, 200], Dv: [190, 40], E: [128, 128], K: [100, 100], Ko: [200, 170] };
    take('A-480p.mp4', ...TAGS.A, 12); take('B-480p.mp4', ...TAGS.B, 12); take('E-480p.mp4', ...TAGS.E, 12);
    take('C-480p.mp4', ...TAGS.C, 12); take('C-1080p.mp4', ...TAGS.Cs, 12, true);
    take('D-480p.mp4', ...TAGS.D, 12); take('D-1080p-up.mp4', ...TAGS.Dv, 12, true);
    take('card-480x854.mp4', ...TAGS.K, 2); take('card-1080x1920.mp4', ...TAGS.Ko, 2, true);
    const wav = (name: string, hz: number) => ff(['-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=${SR}:duration=20`, '-af', 'aformat=channel_layouts=stereo', '-c:a', 'pcm_s16le', '-y', path.join(fm, name)]);
    wav('voice.wav', 660); wav('loud.wav', 1500);
    const F = (n: string) => `media/full/${n}`;
    /** What a frame shows: its number, its tag, mirrored or not, from the base (white bottom) or not. */
    const tagMean = (f: Uint8Array, x0: number, x1: number): number[] => {
      const s = [0, 0, 0]; let k = 0;
      for (let y = 46; y < 72; y++) for (let x = x0; x < x1; x++) { const i = (y * SW + x) * 3; s[0] += f[i]; s[1] += f[i + 1]; s[2] += f[i + 2]; k++; }
      return s.map((v) => v / k);
    };
    const refs: Record<string, number[]> = {};
    for (const [k, file] of Object.entries({ A: 'A-480p.mp4', B: 'B-480p.mp4', C: 'C-480p.mp4', Cs: 'C-1080p.mp4', D: 'D-480p.mp4', Dv: 'D-1080p-up.mp4', E: 'E-480p.mp4', K: 'card-480x854.mp4', Ko: 'card-1080x1920.mp4' })) {
      refs[k] = tagMean(frames(path.join(fm, file))[0], 2, 20);
    }
    const rowMean = (f: Uint8Array, y: number, x0 = 4, x1 = SW - 4): number => { let s = 0; for (let x = x0; x < x1; x++) s += f[(y * SW + x) * 3]; return s / (x1 - x0); };
    const id = (f: Uint8Array) => {
      let n = 0;
      for (let k = 0; k < 9; k++) if (rowMean(f, Math.round(((22 + 44 * k) * SH) / H)) > 125) n += 1 << k;
      const left = tagMean(f, 2, 20), right = tagMean(f, 28, 46);
      const flipped = Math.max(...right) > Math.max(...left);
      const tagC = flipped ? right : left;
      const tag = Object.entries(refs).sort((x, y) => dist(x[1], tagC) - dist(y[1], tagC))[0][0];
      let bot = 0; for (let y = 79; y < 85; y++) bot += rowMean(f, y); bot /= 6;
      return { n, tag, flipped, base: bot > 200 };
    };
    /** The luma plane alone, scaled down: compares the pixels themselves. */
    const luma = (file: string): Uint8Array[] => {
      const buf = ff(['-i', file, '-map', '0:v', '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
      const n = SW * SH, out: Uint8Array[] = [];
      for (let i = 0; i + n <= buf.length; i += n) out.push(buf.subarray(i, i + n));
      return out;
    };
    const ldiff = (a: Uint8Array, b: Uint8Array): number => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    const diff = (a: Uint8Array, b: Uint8Array, y0 = 0, y1 = SH): number => { let s = 0; for (let i = y0 * SW * 3; i < y1 * SW * 3; i++) s += Math.abs(a[i] - b[i]); return s / ((y1 - y0) * SW * 3); };
    type Want = { n: number; tag: string; flipped?: boolean; base: boolean };
    const same = (got: ReturnType<typeof id>, w: Want) => got.n === w.n && got.tag === w.tag && got.flipped === !!w.flipped && got.base === w.base;
    const show = (g: ReturnType<typeof id>) => `#${g.n} ${g.tag}${g.flipped ? ' mirrored' : ''}${g.base ? ' base' : ''}`;
    /** Every frame in [a, b) of `out` is the one `want(f)` says; the first that is not is reported. */
    const expect = (what: string, out: Uint8Array[], a: number, b: number, want: (f: number) => Want): void => {
      let bad = '';
      for (let f = a; f < b && !bad; f++) { const g = id(out[f]); const w = want(f); if (!same(g, w)) bad = `frame ${f}: ${show(g)}, wanted ${show({ ...w, flipped: !!w.flipped })}`; }
      check(what, !bad, bad || `frames ${a}–${b - 1}: ${show(id(out[a]))} … ${show(id(out[b - 1]))}`);
    };
    const v1 = timeline('v1', [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [
        { id: 'a1', src: F('A-480p.mp4'), in: 1, out: 3, at: 0 },
        { id: 'b1', src: F('B-480p.mp4'), in: 0.5, out: 2.5, at: 2 },
        { id: 'c1', src: F('C-480p.mp4'), in: 0, out: 2, at: 4 },
        { id: 'd1', src: F('D-480p.mp4'), in: 0, out: 2, at: 6 },
        { id: 'a2', src: F('A-480p.mp4'), in: 5, out: 7, at: 8, flip: 'h' },
        { id: 'b2', src: F('B-480p.mp4'), in: 4, out: 6, at: 10, fadeOut: 0.5 },
        { id: 'a3', src: F('A-480p.mp4'), in: 8, out: 9, at: 12 },
        { id: 'b3', src: F('B-480p.mp4'), in: 7, out: 8, at: 13, dissolve: 0.5 },
        { id: 'k1', src: F('card-480x854.mp4'), in: 0, out: 1, at: 14, label: 'Title card' },
      ] },
      { id: 'V2', kind: 'video', name: 'Inserts', clips: [{ id: 'e1', src: F('B-480p.mp4'), in: 9, out: 9.5, at: 1 }] },
    ]);
    // the base: cut v1's 480p render, upscaled, its bottom painted white; an upscale run's folder beside it
    writeFileSync(path.join(dir, 'cut', 'v1.json'), JSON.stringify(v1, null, 1));
    const p480 = await render(v1, 'proxy', true);
    const v1080 = path.join(dir, 'video', '1080');
    mkdirSync(path.join(v1080, 'upscale'), { recursive: true });
    const baseFile = path.join(v1080, 'cut-v1-1080.mp4');
    ff(['-i', p480.file, '-map', '0:v', '-vf', 'scale=1080:1920:flags=lanczos,drawbox=x=0:y=1700:w=1080:h=220:color=white:t=fill', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-g', '48', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-y', baseFile]);   // tagged as the upscale's is
    const base = frames(baseFile), baseY = luma(baseFile);
    check('master: the base is as long as cut v1', base.length === 360, `${base.length} frames`);
    const A = (n: number, flipped = false): Want => ({ n, tag: 'A', flipped, base: false });
    const B = (n: number): Want => ({ n, tag: 'B', base: false });
    const fromBase = (g: number): Want => ({ ...id(base[g]), base: true });

    // 1. the cut unchanged: the base frame for frame, except the shots with files of their own
    {
      const r = await render(v1, 'master', true);
      const out = frames(r.file), outY = luma(r.file);
      check('master unchanged: as long as the cut', out.length === 360, `${out.length} frames`);
      let worst = 0, at = 0;
      for (const [a, b] of [[0, 96], [192, 336]]) for (let f = a; f < b; f++) { const d = ldiff(outY[f], baseY[f]); if (d > worst) { worst = d; at = f; } }
      check('master unchanged: every frame of the base\'s shots is the base\'s own frame (mirror, fade, dissolve and insert drawn once, by the base)', worst < 1.5, `largest mean difference ${worst.toFixed(2)} (frame ${at})`);
      expect('master unchanged: a frame number check on the base\'s frames', out, 0, 96, (f) => fromBase(f));
      expect('master unchanged: the mirrored shot is mirrored once', out, 192, 240, (f) => ({ ...A(120 + f - 192, true), base: true }));
      expect('master unchanged: the take with a Seedance file plays it', out, 96, 144, (f) => ({ n: f - 96, tag: 'Cs', base: false }));
      expect('master unchanged: the take with a upscaled file plays it', out, 144, 192, (f) => ({ n: f - 144, tag: 'Dv', base: false }));
      expect('master unchanged: the title card plays its full-size original', out, 336, 360, (f) => ({ n: f - 336, tag: 'Ko', base: false }));
      const m = r.picture;
      const k = (kind: string) => m?.sources.find((x) => x.kind === kind);
      check('master unchanged: counted by source', !!m && k('base')?.shots === 7 && k('base')?.frames === 240 && k('take')?.shots === 1 && k('upscaled')?.shots === 1 && k('original')?.shots === 1 && !k('small') && m.base?.version === 'v1',
        JSON.stringify(m?.sources) + ` base ${m?.base?.version}`);
      check('master unchanged: the log says what the picture is made from', r.summary.some((l) => l.startsWith('picture: 7 shots from the Higgsfield upscale of v1 · 1 from Seedance · 1 from upscaled takes · 1 from full-size originals')),
        r.summary.find((l) => l.startsWith('picture:')) ?? 'no line');
    }

    // 2. edited since: trimmed, reordered, deleted, a new shot, sped up, a new fade; the same dissolve moved; a
    //    subtitle line, a muted picture track and a muted sound track
    {
      const r = await render(timeline('v80', [
        { id: 'V1', kind: 'video', name: 'Picture', clips: [
          { id: 'a1', src: F('A-480p.mp4'), in: 1.25, out: 2.75, at: 0 },                       // trimmed at both ends
          { id: 'a2', src: F('A-480p.mp4'), in: 5, out: 7, at: 1.5, flip: 'h' },                // moved before b1
          { id: 'b1', src: F('B-480p.mp4'), in: 0.5, out: 2.5, at: 3.5 },
          { id: 'e1', src: F('E-480p.mp4'), in: 0, out: 1, at: 5.5 },                           // new, nothing full size
          { id: 'b4', src: F('B-480p.mp4'), in: 0.5, out: 2.5, at: 6.5, speed: 2 },             // sped up
          { id: 'b2', src: F('B-480p.mp4'), in: 4, out: 5.5, at: 7.5, fadeOut: 0.5 },           // a fade the base does not have there
          { id: 'a3', src: F('A-480p.mp4'), in: 8, out: 9, at: 9 },
          { id: 'b3', src: F('B-480p.mp4'), in: 7, out: 8, at: 10, dissolve: 0.5 },             // the base's dissolve, moved
        ] },                                                                                   // c1, d1, the card: deleted
        { id: 'V3', kind: 'video', name: 'Muted', muted: true, clips: [{ id: 'x1', src: F('E-480p.mp4'), in: 0, out: 11, at: 0 }] },
        { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'v', src: F('voice.wav'), in: 0, out: 11, at: 0 }] },
        { id: 'A2', kind: 'audio', name: 'Effects', muted: true, clips: [{ id: 'l', src: F('loud.wav'), in: 0, out: 11, at: 0 }] },
        { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's', text: 'A line', in: 0, out: 1, at: 0 } as unknown as Clip] },
      ]), 'master', true);
      check('master edited: the cut checks out', !r.problems.length, r.problems.join('; ') || 'no problems');
      const out = frames(r.file);
      check('master edited: as long as the cut', out.length === 264, `${out.length} frames`);
      expect('master edited: a shot trimmed at head and tail is the base 6 frames on', out, 0, 18, (f) => ({ ...A(30 + f), base: true }));
      // where the base showed the insert over it, the base has no frame of it: from the 480p
      expect('master edited: where the base had an insert over the shot, its 480p', out, 18, 30, (f) => A(30 + f));
      expect('master edited: then the base again', out, 30, 36, (f) => ({ ...A(30 + f), base: true }));
      const oY = luma(r.file);
      let dCap = 0;
      for (let y = Math.round(SH * 0.70); y < Math.round(SH * 0.80); y++) for (let x = 0; x < SW; x++) dCap = Math.max(dCap, Math.abs(oY[12][y * SW + x] - baseY[18][y * SW + x]));
      const dAfter = ldiff(oY[30], baseY[36]);
      check('master edited: the subtitle line is drawn over the base in its time, and gone after', dCap > 40 && dAfter < 0.5, `largest difference from the base in the subtitle rows at frame 12: ${dCap}; mean over frame 30: ${dAfter.toFixed(2)}`);
      expect('master edited: a shot moved earlier plays its base frames, mirrored once', out, 36, 84, (f) => ({ ...A(120 + f - 36, true), base: true }));
      expect('master edited: the shot it swapped with plays its base frames', out, 84, 132, (f) => ({ ...B(12 + f - 84), base: true }));
      expect('master edited: a new shot with nothing full size is its 480p, scaled up', out, 132, 156, (f) => ({ n: f - 132, tag: 'E', base: false }));
      expect('master edited: a shot sped up twice takes every other base frame', out, 156, 180, (f) => ({ ...B(12 + 2 * (f - 156)), base: true }));
      expect('master edited: a shot under a new fade plays the base before the fade', out, 180, 204, (f) => ({ ...B(96 + f - 180), base: true }));
      const outY = luma(r.file);
      // over the grey bars only (colours can leave the range when converted to BT.709, and then do not scale); the
      // fade scales the level itself, towards 0, as it does on every clip
      const lv = (f: Uint8Array) => f.subarray(0, 38 * SW).reduce((a, v) => a + v, 0) / (38 * SW);
      const ratio = (f: number, g: number) => lv(outY[f]) / lv(baseY[g]);
      check('master edited: and the fade is drawn over the base frames once (half way: half as bright)', Math.abs(ratio(204, 264) - 1) < 0.03 && Math.abs(ratio(205, 265) - 11 / 12) < 0.03 && Math.abs(ratio(210, 270) - 0.5) < 0.03 && Math.abs(ratio(215, 275) - 1 / 12) < 0.03 && id(out[205]).base && id(out[205]).n === 121,
        `brightness against the base at 204 ${ratio(204, 264).toFixed(2)}, 205 ${ratio(205, 265).toFixed(2)}, 210 ${ratio(210, 270).toFixed(2)}, 215 ${ratio(215, 275).toFixed(2)}`);
      let worst = 0;
      for (let f = 216; f < 264; f++) worst = Math.max(worst, ldiff(outY[f], baseY[f + 72]));
      check('master edited: the same dissolve, moved, is the base\'s own frames (drawn once)', worst < 1.5, `largest mean difference ${worst.toFixed(2)}`);
      const m = r.picture;
      const k = (kind: string) => m?.sources.find((x) => x.kind === kind);
      check('master edited: counted: 6 shots from the base, 2 scaled up (the new one, and the one under the base\'s insert)', k('base')?.shots === 6 && k('small')?.shots === 2 && k('small')?.frames === 36, JSON.stringify(m?.sources));
      const { madeWords } = await import('../src/components/edit/fullsize');
      const words = m ? madeWords(m) : [];
      check('master edited: in words, the scaled-up part marked', words.map((w) => w.text).join(' · ') === '6 shots from the Higgsfield upscale of v1 · 2 scaled up from 480p' && words[1]?.warn === true && words[0]?.warn === false,
        words.map((w) => `${w.text}${w.warn ? ' (amber)' : ''}`).join(' · '));
      const x = pcm(r.file);
      check('master edited: the sound track plays and the muted one does not', toneDb(x, 660, 2, 4) > -30 && toneDb(x, 1500, 2, 4) < -60, `660 Hz ${toneDb(x, 660, 2, 4).toFixed(1)} dB, 1500 Hz ${toneDb(x, 1500, 2, 4).toFixed(1)} dB`);
    }

    // 3. what the base has and the cut no longer has, or the other way round: from the 480p, drawn by the render
    {
      const r = await render(timeline('v81', [
        { id: 'V1', kind: 'video', name: 'Picture', clips: [
          { id: 'b2', src: F('B-480p.mp4'), in: 4, out: 6, at: 0 },                               // the base's fade taken off
          { id: 'a3', src: F('A-480p.mp4'), in: 8, out: 9, at: 2 },
          { id: 'b3', src: F('B-480p.mp4'), in: 7, out: 8, at: 3 },                               // the base's dissolve taken off
          { id: 'a1', src: F('A-480p.mp4'), in: 1, out: 3, at: 4 },
          { id: 'b1', src: F('B-480p.mp4'), in: 0.5, out: 2.5, at: 6, dissolve: 0.5 },             // a dissolve the base does not have
          { id: 'a2', src: F('A-480p.mp4'), in: 5, out: 7, at: 8 },                               // the base's mirror taken off
        ] },
      ]), 'master', true);
      const out = frames(r.file);
      check('master changed effects: as long as the cut', out.length === 240, `${out.length} frames`);
      // the base's fade-out: its last 11 frames below full (the 12th from the end is the fade's start, still whole)
      expect('master changed effects: a fade taken off: the base until its fade', out, 0, 37, (f) => ({ ...B(96 + f), base: true }));
      expect('master changed effects: then the 480p, not faded', out, 37, 48, (f) => B(96 + f));
      expect('master changed effects: a dissolve taken off: the base away from it', out, 48, 66, (f) => ({ ...A(192 + f - 48), base: true }));
      expect('master changed effects: and the 480p over the stretch the base dissolves', out, 66, 78, (f) => (f < 72 ? A(192 + f - 48) : B(168 + f - 72)));
      expect('master changed effects: the base after it', out, 78, 96, (f) => ({ ...B(168 + f - 72), base: true }));
      // the new dissolve, frame 144 (7 of 13 into it): A's 480p frame 72 and B's 480p frame 12, mixed
      const a480 = frames(path.join(fm, 'A-480p.mp4')), b480 = frames(path.join(fm, 'B-480p.mp4'));
      const k = 7 / 13;
      const mixed = a480[72].map((v, i) => Math.round(v * (1 - k) + b480[12][i] * k));
      const dMix = diff(out[144], Uint8Array.from(mixed));
      check('master changed effects: a new dissolve is drawn from the 480p of both shots', dMix < 4 && !id(out[144]).base, `mean difference from the mix of the two 480p frames ${dMix.toFixed(2)}`);
      expect('master changed effects: the base on either side of the new dissolve', out, 96, 120, (f) => ({ ...A(24 + f - 96), base: true }));
      expect('master changed effects: (where the base had its insert, the 480p)', out, 120, 132, (f) => A(24 + f - 96));
      expect('master changed effects: the base up to the new dissolve', out, 132, 138, (f) => ({ ...A(24 + f - 96), base: true }));
      expect('master changed effects: and after it', out, 150, 192, (f) => ({ ...B(12 + f - 144), base: true }));
      expect('master changed effects: a mirror taken off is not taken from the base', out, 192, 240, (f) => A(120 + f - 192));
      const m = r.picture;
      const small = m?.sources.find((x) => x.kind === 'small');
      check('master changed effects: the frames drawn from the 480p are counted', small?.frames === 11 + 6 + 6 + 12 + 6 + 6 + 48 && small.shots === 6, JSON.stringify(m?.sources));
    }

    // 4. a master made again (14 Nov, ASKS 42): the master of v1 there was made before its picture was recorded; a press
    //    of "Render master again" makes v1-master-2.mp4 beside it, never over it, and the newest is the master of v1
    {
      const rd = path.join(dir, 'cut', 'renders');
      mkdirSync(rd, { recursive: true });
      const first = path.join(rd, 'v1-master.mp4');
      ff(['-i', p480.file, '-c', 'copy', '-y', first]);
      const firstMd5 = createHash('md5').update(readFileSync(first)).digest('hex');
      writeFileSync(path.join(dir, 'cut', 'v1.json'), JSON.stringify({ ...v1, renders: { master: { path: 'cut/renders/v1-master.mp4', at: '2026-11-13T13:25:25.205Z', hash: 'old', seconds: 42.5 } } }, null, 1));
      const age = await R.masterStaleness(slug, 'v1');
      check('again: a master with no record, every shot now full size: out of date', age.state === 'stale' && age.reason === 'The master of v1 was made from the 480p scaled up; all 10 shots now have a full-size picture', JSON.stringify(age));
      const plain = await R.queueRender(slug, 'v1', 'master');
      check('again: "Render master" without "again" answers the one there', plain.state === 'done' && plain.path === 'cut/renders/v1-master.mp4', JSON.stringify(plain));
      const q = await R.queueRender(slug, 'v1', 'master', { again: true });
      check('again: "again" queues a new file beside it', q.state === 'queued' && q.path === 'cut/renders/v1-master-2.mp4' && q.log === 'cut/renders/v1-master-2.log', JSON.stringify(q));
      const during = await R.renderStates(slug, 'v1');
      check('again: while it runs, the version\'s master state is the running one', during.master?.state === 'queued' || during.master?.state === 'running', JSON.stringify(during.master));
      await R.drain();
      const st = (await R.renderStates(slug, 'v1')).master;
      check('again: the newest is the master of v1', st?.state === 'done' && st.path === 'cut/renders/v1-master-2.mp4', JSON.stringify(st));
      check('again: the first is untouched', createHash('md5').update(readFileSync(first)).digest('hex') === firstMd5, firstMd5);
      check('again: the second is a full-size master', frameCount(path.join(rd, 'v1-master-2.mp4')) === 360, `${frameCount(path.join(rd, 'v1-master-2.mp4'))} frames`);
      const rec = JSON.parse(readFileSync(path.join(dir, 'cut', 'v1.json'), 'utf8')) as { renders: { master: { path: string; picture?: PictureMade }; earlierMasters?: { path: string; hash: string }[] } };
      check('again: its own record, the first one\'s kept', rec.renders.master.path === 'cut/renders/v1-master-2.mp4' && !!rec.renders.master.picture && rec.renders.earlierMasters?.length === 1 && rec.renders.earlierMasters[0].path === 'cut/renders/v1-master.mp4' && rec.renders.earlierMasters[0].hash === 'old',
        JSON.stringify({ master: rec.renders.master.path, earlier: rec.renders.earlierMasters }));
      const log = readFileSync(path.join(rd, 'v1-master-2.log'), 'utf8');
      check('again: its own log', /^== master render of v1 \(made again: v1-master-2\.mp4, beside the one before\)/.test(log) && /done in .* → cut\/renders\/v1-master-2\.mp4/.test(log), log.split('\n')[0]);
      const now = await R.masterStaleness(slug, 'v1');
      check('again: the new one is up to date', now.state === 'fresh' && now.path === 'cut/renders/v1-master-2.mp4', JSON.stringify(now));
      const twice = await R.queueRender(slug, 'v1', 'master', { again: true });
      check('again: "again" on an up-to-date master answers it, no third', twice.state === 'done' && twice.path === 'cut/renders/v1-master-2.mp4', JSON.stringify(twice));
      // a take's Seedance file lands after it
      const later = new Date(Date.now() + 60_000);
      const { utimesSync } = await import('node:fs');
      utimesSync(path.join(fm, 'C-1080p.mp4'), later, later);
      const stale = await R.masterStaleness(slug, 'v1');
      check('again: a take\'s full-size file newer than it: out of date', stale.state === 'stale' && stale.reason === 'The master of v1 was made before 1 take got its full-size picture', JSON.stringify(stale));
      const { renderFiles } = await import('../src/server/edit/render-files');
      const listed = (await renderFiles(film)).filter((f) => f.kind === 'master' && !f.tag).map((f) => `${f.path.split('/').pop()}${f.earlier ? ' (earlier)' : ''}`).sort();
      check('again: the Renders tab lists both, the first marked earlier', JSON.stringify(listed) === JSON.stringify(['v1-master-2.mp4', 'v1-master.mp4 (earlier)']), listed.join(', '));
    }

    // 5. every frame of each upscaled stretch. A stretch of the base cut with a seek could lose its last frame, and the
    //    black under it showed, wherever the picture under the stretch ran a hair late: the picture's pieces are joined
    //    in microseconds, so after a piece whose length is not a whole number of them (a title card of 74 frames, say)
    //    the frames under a stretch can come a microsecond after the stretch's own. Here: a new shot of 74 frames from
    //    the 480p, then two stretches of the base, each cut with a seek (v1's b1 less its last two frames, then its
    //    mirrored a2: the second is not the next frame of the base), then a new shot. The lengths matter: with these,
    //    both stretches end on a frame that runs late (made as before the fix, black at 119 and 167); with b1 whole,
    //    both would land on time and hide the fault.
    {
      const r = await render(timeline('v90', [
        { id: 'V1', kind: 'video', name: 'Picture', clips: [
          { id: 'e1', src: F('E-480p.mp4'), in: 0, out: fr(74), at: 0 },
          { id: 'b1', src: F('B-480p.mp4'), in: 0.5, out: fr(58), at: fr(74) },
          { id: 'a2', src: F('A-480p.mp4'), in: 5, out: 7, at: fr(120), flip: 'h' },
          { id: 'e2', src: F('E-480p.mp4'), in: 4, out: 5, at: fr(168) },
        ] },
      ]), 'master', true);
      const line = r.summary.find((l) => l.startsWith('upscaled cut:')) ?? 'no line';
      check('stretches: the cut checks out, and the base gives two stretches', !r.problems.length && /, 2 stretches laid over the picture/.test(line), r.problems.join('; ') || line);
      const out = frames(r.file);
      check('stretches: as long as the cut', out.length === 192, `${out.length} frames`);
      const dark = out.flatMap((fm, k) => (mean(fm)[0] < 20 ? [k] : []));
      check('stretches: no black frame anywhere (none at the end of a stretch)', !dark.length, dark.length ? `black at frame ${dark.join(', ')}` : 'none');
      expect('stretches: the new shot before them is its 480p', out, 0, 74, (f) => ({ n: f, tag: 'E', base: false }));
      expect('stretches: the first stretch gives every frame, its last one included', out, 74, 120, (f) => ({ ...B(12 + f - 74), base: true }));
      expect('stretches: the second, cut with its own seek, gives every frame, mirrored once', out, 120, 168, (f) => ({ ...A(120 + f - 120, true), base: true }));
      expect('stretches: then the new shot after them', out, 168, 192, (f) => ({ n: 96 + f - 168, tag: 'E', base: false }));
    }

    // 6. a master made before that fix: from a cut that uses the upscaled cut it counts as out of date, so it is made
    //    again on request without a change to the cut. Its record names the very picture a master would be made from
    //    now, and every file it uses is older than it, so the fix is the only reason it can be out of date: made after
    //    the fix it is up to date, and so is one made before the fix from a cut that uses no upscaled cut.
    {
      const rd = path.join(dir, 'cut', 'renders');
      const { utimesSync, copyFileSync } = await import('node:fs');
      const before = new Date('2026-11-17T12:00:00.000Z');
      utimesSync(baseFile, before, before);
      const madeAt = async (v: string, clips: Clip[], at: string) => {
        const raw = timeline(v, [{ id: 'V1', kind: 'video', name: 'Picture', clips }]);
        const { timeline: t, problems } = await T.validateTimeline(raw, film);
        if (!t) throw new Error(problems.join('; '));
        const s = path.join(scratch, v);
        mkdirSync(s, { recursive: true });
        const { picture } = await R.buildGraph(film, t, 'master', path.join(s, 'out.mp4'), s);
        writeFileSync(path.join(dir, 'cut', `${v}.json`), JSON.stringify({ ...raw, renders: { master: { path: `cut/renders/${v}-master.mp4`, at, hash: 'by hand', picture } } }, null, 1));
        copyFileSync(p480.file, path.join(rd, `${v}-master.mp4`));
        return R.masterStaleness(slug, v);
      };
      const baseClips: Clip[] = [{ id: 'b1', src: F('B-480p.mp4'), in: 0.5, out: 2.5, at: 0 }, { id: 'a2', src: F('A-480p.mp4'), in: 5, out: 7, at: 2, flip: 'h' }];
      const pre = await madeAt('v91', baseClips, '2026-11-18T12:00:00.000Z');
      check('before the fix: a master from a cut that uses the upscaled cut is out of date, and says why', pre.state === 'stale' && pre.reason === 'The master of v91 was made before the upscaled-stretch fix: it has one black frame at the end of each stretch from the upscaled cut' && pre.path === 'cut/renders/v91-master.mp4', JSON.stringify(pre));
      const post = await madeAt('v92', baseClips, '2026-11-19T07:00:00.000Z');
      check('after the fix: the same master is up to date', post.state === 'fresh', JSON.stringify(post));
      const none = await madeAt('v93', [{ id: 'e1', src: F('E-480p.mp4'), in: 0, out: 2, at: 0 }], '2026-11-18T12:00:00.000Z');
      check('before the fix, from a cut without the upscaled cut: up to date', none.state === 'fresh', JSON.stringify(none));
    }
  }

  console.log(`ok · ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => rmSync(root, { recursive: true, force: true }));
