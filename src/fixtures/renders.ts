// MOCK=boards: renders with options without ffmpeg (13 Nov). POST …/cut/render with options plays a made-up life
// for the render: queued, running 0 → 100 % over three seconds (one at a time, like the real queue), then done with
// the files a real one would write (named the same way, not on disk) and made-up loudness numbers. A loudness of
// −5 LUFS fails at the end with the real render's words for a mix that cannot be held under its ceiling. Kept in
// memory per film and version (on globalThis, so a dev reload keeps it). Server-only; nothing is written.
// Since 14 Nov (the Renders tab, ASKS 39) "Render master" plays one too (six seconds), and the sample films start with
// renders already made: the-lighthouse has a master of v1, a 480p at −14 LUFS, a full-size file without the title
// cards, the separate sound files and one that failed; sample-master-older has a master of v1 (its cut is v2).
// GET …/cut/renders lists them as files. /api/media plays src/fixtures/media/sample-render.mp4 for any of them.
// Since 14 Nov (ASKS 44) the 480p of a version is asked for too ("Render it" in the Renders tab, QC, the phone) and
// plays a made-up life of three seconds, landing as cut/renders/<version>-proxy.mp4; nothing renders by itself.
// Since 14 Nov (ASKS 42) the seeded master of v1 has no record of its picture (as a master made before that day), so
// the page shows it out of date ("Render master again"); a master made again plays the same life and lands as
// v1-master-2.mp4 (then -3), beside the first, with the record of its picture as the real render would write it. A
// master made here always has that record. The sample server keeps them for as long as it runs.
import type { PictureMade, RenderKind, RenderOptions, RenderState, Timeline } from '@/server/types';
import type { RenderFile } from '@/components/edit/renderList';
import type { CancelAnswer } from '@/server/edit/render';
import { baseFor, picturePieces, pictureMade, type FullInfo } from '@/components/edit/fullsize';
import { masterRel } from '@/components/edit/masters';
import { applyLeaveOut, dialogueTracks, fileWord, optionsTag } from '@/server/edit/render-options';
import { timelineLength } from '@/server/edit/timeline';
import { mockCut } from './mock';
import { sampleFull } from './masters';
import { leftMasterSeed } from './left';

/** tag '' is the plain render (the master: \"Render master\"); `fail` makes it end failed with these words. A plain
 *  master: `n` its number (masters.ts), `picture` the record of its picture (none on the seeded one). */
interface MockJob { film: string; version: string; kind: RenderKind; tag: string; options: RenderOptions; queuedAt: number; start: number; end: number; fail?: string; n?: number; picture?: PictureMade; /** Cancelled at. */ cancelled?: number }
const g = globalThis as unknown as { __hhMockRenders?: { jobs: Map<string, MockJob>; busyUntil: number } };
const S = (g.__hhMockRenders ??= { jobs: new Map(), busyUntil: 0 });

const WAIT = 600, RUN = 3000, RUN_MASTER = 6000;
const keyOf = (film: string, version: string, kind: RenderKind, tag: string, n = 1) => `${film}/${version}/${kind}/${tag}${n > 1 ? `#${n}` : ''}`;
const iso = (ms: number) => new Date(ms).toISOString();
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The sample film's timeline (the fixture's only version stands in for the versions the page made in memory). */
function sampleTimeline(film: string): Timeline | undefined {
  const c = mockCut(film)?.current as Timeline | undefined;
  return c && Array.isArray(c.tracks) ? c : undefined;
}
/** A version the sample keeps on the server (its current one or an older one), else undefined. */
function sampleVersion(film: string, version: string): Timeline | undefined {
  const c = mockCut(film);
  return ([c?.current, ...(c?.timelines ?? [])] as (Timeline | undefined)[]).find((t) => t?.version === version && Array.isArray(t.tracks));
}

/** What the job is at this moment. */
function stateOf(j: MockJob, now = Date.now()): RenderState {
  const base: RenderState = { version: j.version, kind: j.kind, ...(j.tag ? { tag: j.tag, options: j.options } : {}), state: 'queued', queuedAt: iso(j.queuedAt), log: `cut/renders/${j.version}.log` };
  // cancelled while it waited or ran (DELETE …/cut/render): stopped where it was, no file
  if (j.cancelled !== undefined && j.cancelled <= now) return { ...base, state: 'cancelled', ...(j.cancelled >= j.start ? { startedAt: iso(j.start) } : {}), finishedAt: iso(j.cancelled) };
  if (now < j.start) return { ...base, percent: 0 };
  if (now < j.end) return { ...base, state: 'running', startedAt: iso(j.start), percent: Math.min(99, Math.round(((now - j.start) / (j.end - j.start)) * 1000) / 10) };
  const done = { ...base, startedAt: iso(j.start), finishedAt: iso(j.end), seconds: r1((j.end - j.start) / 1000) };
  if (j.fail) return { ...done, state: 'failed', error: j.fail };
  // the plain master: one file, as render.ts names it, with the record of its picture
  if (!j.tag) return { ...done, state: 'done', percent: 100, path: j.kind === 'master' ? masterRel(j.version, j.n ?? 1) : `cut/renders/${j.version}-${j.kind}.mp4`, ...(j.picture ? { picture: j.picture } : {}) };
  const t = sampleTimeline(j.film);
  let left: string[] = [];
  let heard = t;
  try {
    if (t) ({ t: heard, left } = applyLeaveOut(t, j.options.leaveOut));
  } catch { left = (j.options.leaveOut?.tracks ?? []).map((x) => `track ${x}`); }
  const leftOut = left.length ? left : undefined;
  const o = j.options;
  const fileBase = `cut/renders/${j.version}-${j.kind}-${j.tag}`;
  const lefts = left.length ? `, without ${left.length} track${left.length === 1 ? '' : 's'} or clips` : '';
  const outputs: { path: string; what: string }[] = [];
  let loudness: RenderState['loudness'];
  if (o.loudness) {
    const target = o.loudness.lufs, ceiling = o.loudness.truePeak ?? -1;
    const before = { i: -20.8, tp: -3.5, lra: 7.2 };
    if (target >= -5) {
      const after = { i: r1(target - 0.3), tp: r1(ceiling + 0.4) };
      return { ...done, state: 'failed', leftOut, error: `the loudness pass left the true peak at ${after.tp} dBTP, over the ${ceiling} dBTP ceiling (${after.i} LUFS): nothing written` };
    }
    const gain = Math.round((target - before.i) * 100) / 100;
    const mode = before.tp + gain <= ceiling ? 'linear' : 'limiter';
    const after = { i: r1(target + 0.1), tp: r1(mode === 'linear' ? before.tp + gain : ceiling - 0.2) };
    loudness = { target, ceiling, before, after, mode, gain };
    outputs.push({ path: `${fileBase}.mp4`, what: `the film${lefts}, its sound at ${after.i} LUFS, true peak ${after.tp} dBTP (${mode === 'linear' ? `one gain of ${gain} dB` : `a gain of ${gain} dB and a limiter`})` });
  } else if (o.leaveOut) {
    outputs.push({ path: `${fileBase}.mp4`, what: `the film${lefts}` });
  }
  if (o.stems) {
    outputs.push({ path: `${fileBase}.picture.mp4`, what: `the picture alone, no sound${lefts}` });
    // as the real graph: a track muted (or left out) has no stem of its own
    const audio = (heard?.tracks ?? []).filter((tr) => tr.kind === 'audio' && !tr.muted);
    const dial = heard ? dialogueTracks(heard) : new Set<string>();
    for (const tr of audio) outputs.push({ path: `${fileBase}.${tr.id}-${fileWord(tr.name)}.wav`, what: `sound track ${tr.id} ${tr.name} alone` });
    outputs.push({ path: `${fileBase}.dialogue.wav`, what: `dialogue only (${audio.filter((tr) => dial.has(tr.id)).map((tr) => tr.id).join(', ') || 'no dialogue track'})` });
    outputs.push({ path: `${fileBase}.no-dialogue.wav`, what: `everything but dialogue (${audio.filter((tr) => !dial.has(tr.id)).map((tr) => tr.id).join(', ') || 'nothing'})` });
    outputs.push({ path: `${fileBase}.mix.wav`, what: 'the full mix at the cut\'s own levels (no loudness pass), the stems add up to it' });
  }
  // the smaller file (ASKS 56): one file, its made-up sizes as the real one measures them (60 MB from 101 MB, SSIM 0.992)
  let small: RenderState['small'];
  if (o.small) {
    const fromBytes = Math.round((t ? timelineLength(t) : 60) * 1_100_000), bytes = Math.round(fromBytes * 0.594);
    const mbw = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;
    small = { from: o.loudness || o.leaveOut ? 'made for it, not kept' : masterRel(j.version), made: !!(o.loudness || o.leaveOut), fromBytes, bytes, frames: Math.round((t ? timelineLength(t) : 60) * (t?.fps ?? 24)), ssim: 0.992,
      sound: { codec: 'aac', seconds: r1(t ? timelineLength(t) : 60), copied: true }, encode: 'libx264 veryslow CRF 21' };
    const what = `${outputs[0]?.what ?? 'the master'}, as a smaller file: ${mbw(bytes)}, from ${mbw(fromBytes)} (SSIM 0.992, the sound copied)`;
    outputs.splice(0, outputs.length, { path: `${fileBase}.mp4`, what });
  }
  return { ...done, state: 'done', percent: 100, path: outputs[0]?.path, outputs, leftOut, ...(loudness ? { loudness } : {}), ...(small ? { small } : {}) };
}

/** What a master of the sample film is made from, as the real render counts it (render.ts masterPlan): the sample's
 *  cut against its full-size pictures (sampleFull). The page makes versions in memory the server never sees, so every
 *  master here is counted on the sample's own version, or on `version` when the sample keeps it (a seeded master of
 *  an older version, ASKS 49), with the base's own version as the real render reads it. */
function samplePicture(film: string, version?: string): PictureMade | undefined {
  const t = (version ? sampleVersion(film, version) : undefined) ?? sampleTimeline(film);
  if (!t) return undefined;
  const info = sampleFull(film) as FullInfo;
  const b = baseFor(info, t.version);
  const btl = b ? (b.version === t.version ? t : sampleVersion(film, b.version)) : undefined;
  const pieces = picturePieces(t, info, b && btl ? { b, tl: btl } : undefined);
  return pictureMade(pieces, b);
}

/** The plain masters of a version, oldest first. */
const mastersOf = (film: string, version: string): MockJob[] =>
  [...S.jobs.values()].filter((j) => j.film === film && j.version === version && j.kind === 'master' && !j.tag).sort((a, b) => (a.n ?? 1) - (b.n ?? 1));

/** POST …/cut/render under MOCK=boards: as the real queueRender answers (render.ts). Without options, the plain 480p or master;
 *  `again`: a master made again beside the one there, when that one is out of date (here: when it has no record). */
export function mockQueueRender(film: string, version: string, kind: RenderKind, options: RenderOptions | undefined, retry: boolean, again = false): RenderState {
  seed(film);
  const tag = options ? optionsTag(options) : '';
  let n = 1;
  const plainMaster = kind === 'master' && !tag;
  const was = plainMaster ? mastersOf(film, version).pop() : S.jobs.get(keyOf(film, version, kind, tag));
  if (was) {
    const st = stateOf(was);
    if (plainMaster && st.state === 'done' && again && !was.picture) n = (was.n ?? 1) + 1;
    else if (st.state === 'cancelled') n = was.n ?? 1;   // a cancelled one is asked again like one never made
    else if (st.state !== 'failed' || !retry) return st;   // live or done: the same answer at once; failed: only again with retry
    else n = was.n ?? 1;
  }
  const key = keyOf(film, version, kind, tag, n);
  const now = Date.now();
  const start = Math.max(now + WAIT, S.busyUntil);
  const job: MockJob = { film, version, kind, tag, options: options ?? {}, queuedAt: now, start, end: start + (plainMaster ? RUN_MASTER : RUN),
    ...(plainMaster ? { n, picture: samplePicture(film) } : {}) };
  S.busyUntil = job.end;
  S.jobs.set(key, job);
  return stateOf(job, now);
}

/** The sample queue's state of one render (the Release page's companions, fixtures/release.ts sampleCompanions), or
 *  nothing when it was never asked for. */
export function mockJobState(film: string, version: string, kind: RenderKind, options?: RenderOptions): RenderState | undefined {
  seed(film);
  const tag = options ? optionsTag(options) : '';
  const j = kind === 'master' && !tag ? mastersOf(film, version).pop() : S.jobs.get(keyOf(film, version, kind, tag));
  return j ? stateOf(j) : undefined;
}

/** DELETE …/cut/render under MOCK=boards: as the real cancelRender answers (render.ts). A queued or running made-up
 *  render stops where it is; anything else is said plainly. */
export function mockCancelRender(film: string, version: string, kind: RenderKind, options: RenderOptions | undefined): CancelAnswer {
  seed(film);
  const tag = options ? optionsTag(options) : '';
  const j = kind === 'master' && !tag ? mastersOf(film, version).pop() : S.jobs.get(keyOf(film, version, kind, tag));
  const what = `the ${kind === 'proxy' ? '480p' : !tag ? 'master' : 'render'} of ${version}${tag ? ` (${tag})` : ''}`;
  if (!j) return { cancelled: false, state: { version, kind, ...(tag ? { tag, options } : {}), state: 'none' }, said: `Nothing to cancel: ${what} is not queued or running.` };
  const st = stateOf(j);
  if (st.state !== 'queued' && st.state !== 'running') {
    return { cancelled: false, state: st, said: st.state === 'done' ? `Nothing to cancel: ${what} is already made.` : st.state === 'cancelled' ? `Nothing to cancel: ${what} was cancelled already.` : `Nothing to cancel: ${what} failed and is not running.` };
  }
  const now = Date.now();
  j.cancelled = now;
  if (S.busyUntil === j.end) S.busyUntil = now;
  return { cancelled: true, state: stateOf(j, now), said: st.state === 'queued' ? `Cancelled ${what} before it started.` : `Cancelled ${what}; nothing was written into cut/renders.` };
}

/** GET …/cut/render/<version> under MOCK=boards: that version's 480p and master (when one was asked for) and its
 *  renders with options, as `variants`. */
export function mockRenderStates(film: string, version: string): { proxy?: RenderState; master?: RenderState; variants?: RenderState[] } {
  seed(film);
  const prefix = `${film}/${version}/`;
  const mine = [...S.jobs.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).map(([, j]) => j);
  // the master: one made again while it runs, else the newest done, else the last asked (as renderStates reads them)
  const ms = mastersOf(film, version);
  const live = (j: MockJob) => ['queued', 'running'].includes(stateOf(j).state);
  const master = ms.find(live) ?? ms.filter((j) => stateOf(j).state === 'done').pop() ?? ms.pop();
  const vs = mine.filter((j) => j.tag).map((j) => stateOf(j));
  const proxy = S.jobs.get(keyOf(film, version, 'proxy', ''));
  return { ...(proxy ? { proxy: stateOf(proxy) } : {}), ...(master ? { master: stateOf(master) } : {}), ...(vs.length ? { variants: vs } : {}) };
}

/** The plain 480p files under MOCK=boards (GET …/cut/renders `proxies`), as the real listing counts them. */
export function mockRenderProxies(film: string): { version: string; bytes: number }[] {
  seed(film);
  const t = sampleTimeline(film);
  const seconds = t ? timelineLength(t) : 60;
  return [...S.jobs.values()].filter((j) => j.film === film && j.kind === 'proxy' && !j.tag && stateOf(j).state === 'done')
    .map((j) => ({ version: j.version, bytes: Math.round(seconds * 160_000) }));
}

/** GET …/cut/renders under MOCK=boards: every finished master and "More renders" file, as the real listing reads them. */
export function mockRenderFiles(film: string): RenderFile[] {
  seed(film);
  const t = sampleTimeline(film);
  const seconds = t ? Math.round(timelineLength(t) * 1000) / 1000 : undefined;
  const out: RenderFile[] = [];
  for (const j of S.jobs.values()) {
    // the plain 480p of each version is left out, as on disk (render-files.ts): it is counted under `proxies`
    if (j.film !== film || (j.kind === 'proxy' && !j.tag)) continue;
    const st = stateOf(j);
    if (st.state !== 'done') continue;
    const files = st.outputs ?? (st.path ? [{ path: st.path, what: '' }] : []);
    // a master: its number, its record, and whether a newer one of its version is done (masters.ts)
    const plain = j.kind === 'master' && !j.tag;
    const newest = plain ? mastersOf(film, j.version).filter((x) => stateOf(x).state === 'done').pop() : undefined;
    files.forEach((o, i) => out.push({ path: o.path, version: j.version, kind: j.kind, ...(j.tag ? { tag: j.tag, options: j.options } : {}), what: o.what || undefined, index: i,
      bytes: i === 0 && st.small ? st.small.bytes : Math.round((seconds ?? 60) * (o.path.endsWith('.wav') ? 288_000 : j.kind === 'master' ? 1_100_000 : 160_000)), at: st.finishedAt, took: st.seconds, seconds, loudness: st.loudness, leftOut: st.leftOut,
      ...(i === 0 && st.small ? { small: st.small } : {}),
      ...(plain ? { n: j.n ?? 1, ...(j.picture ? { picture: j.picture } : {}), ...(newest && newest !== j ? { earlier: true } : {}) } : {}) }));
  }
  return out;
}

/** The newest master of a version that is done, for the sample films' Finish page (masters.ts sampleState): a master
 *  made again from the page is the film's master, as on a real film. */
export function mockNewestMaster(film: string, version: string): RenderState | undefined {
  seed(film);
  const done = mastersOf(film, version).map((j) => stateOf(j)).filter((st) => st.state === 'done');
  return done.pop();
}

/** The renders a sample film starts with (once per server). */
function seed(film: string): void {
  const seeded = (g as unknown as { __hhMockSeeded?: Set<string> }).__hhMockSeeded ??= new Set();
  if (seeded.has(film)) return;
  seeded.add(film);
  // made some minutes before the server first answered for the film
  const now = Date.now();
  const at = (minsAgo: number, took: number, version: string, kind: RenderKind, options?: RenderOptions, fail?: string) => {
    const end = now - minsAgo * 60_000, start = end - took * 1000;
    const tag = options ? optionsTag(options) : '';
    S.jobs.set(keyOf(film, version, kind, tag), { film, version, kind, tag, options: options ?? {}, queuedAt: start - 2000, start, end, fail });
  };
  if (film === 'the-lighthouse') {
    at(190, 412, 'v1', 'master');
    at(150, 41, 'v1', 'proxy', { loudness: { lufs: -14, truePeak: -1 } });
    at(95, 388, 'v1', 'master', { leaveOut: { cards: true } });
    at(62, 52, 'v1', 'proxy', { stems: true });
    at(25, 6, 'v1', 'proxy', { leaveOut: { tracks: ['A2'] } }, 'ffmpeg could not read a file the cut plays: blocks/FIX-bottle/takes/FIX-bottle-seedance-take2-480p.mp4 (No such file or directory)');
  }
  // the What's next samples (fixtures/left.ts): a master of v1 with the record of its picture, as the render writes it
  const lm = leftMasterSeed(film);
  if (lm) {
    const end = now - 40 * 60_000, start = end - 380_000;
    S.jobs.set(keyOf(film, lm.version, 'master', ''), { film, version: lm.version, kind: 'master', tag: '', options: {}, queuedAt: start - 2000, start, end, n: 1, picture: samplePicture(film, lm.version) });
  }
  if (film === 'sample-master-older') {
    at(300, 395, 'v1', 'master');
    at(240, 44, 'v1', 'proxy', { loudness: { lufs: -14, truePeak: -1 } });
  }
}
