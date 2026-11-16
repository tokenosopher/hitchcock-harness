// The Renders tab's list (14 Nov 2026, ASKS 39), kept apart from React so scripts/renders-test.ts can check it: every
// rendered file of the version on screen, newest first, a render still running or that failed among them; under it
// the masters and the "More renders" files of the other versions. The words follow the "More renders" panel
// (renderAsk.ts). The server lists the files on disk as RenderFile (src/server/edit/render-files.ts, GET …/cut/renders).
import type { PictureMade, RenderInfo, RenderKind, RenderLoudness, RenderOptions, RenderSmall, RenderState } from '@/server/types';
import { madeWords } from './fullsize';
import { earlierWords } from './masters';
import { baseName, describe, signed } from './renderAsk';

/** One file a render wrote, as GET …/cut/renders lists it. Paths are relative to the film folder. */
export interface RenderFile {
  path: string;
  version: string;
  kind: RenderKind;
  /** A render with options: its tag and options (the plain master has neither). */
  tag?: string;
  options?: RenderOptions;
  /** The render's own words for this file (outputs[].what). */
  what?: string;
  /** Its place among the render's files (0 the main one). */
  index?: number;
  bytes?: number;
  /** When it was written. */
  at?: string;
  /** How long the render took, in seconds. */
  took?: number;
  /** Its length in seconds (the version's length). */
  seconds?: number;
  loudness?: RenderLoudness;
  leftOut?: string[];
  /** A smaller file (options.small): what it was made from and measured, its size before and after among it. */
  small?: RenderSmall;
  /** A master's picture: what it was made from (absent on masters made before 14 Nov). */
  picture?: PictureMade;
  /** A master: its number among the version's masters (1 for v231-master.mp4, 2 for v231-master-2.mp4), and whether
   *  a newer one is on disk (then it is not the master of the version). */
  n?: number;
  earlier?: boolean;
}

export type RowState = 'done' | 'running' | 'queued' | 'failed';

/** A row of the list. */
export interface RenderRow {
  /** The file's path, or kind/tag for a render with no file yet. */
  key: string;
  version: string;
  kind: RenderKind;
  tag?: string;
  state: RowState;
  percent?: number;
  path?: string;
  /** A sound file: no picture. */
  sound: boolean;
  /** "Master of cut v231". */
  title: string;
  /** "1080 × 1920", "480 × 854", or "WAV". */
  size: string;
  seconds?: number;
  /** What is in it when that differs from the whole cut: "dialogue only", "no title cards", "−14 LUFS". */
  extra?: string;
  /** The render's own words for the file, longer (a title on hover). */
  what?: string;
  at?: string;
  took?: number;
  error?: string;
  /** A master: what its picture was made from, in words, the scaled-up part marked (`warn`). None for a master
   *  made before this was recorded: nothing is guessed. */
  made?: { text: string; warn: boolean }[];
  /** A master still rendering: what it will scale up from 480p, in words. */
  warn?: string;
  /** What "Try again" asks for. */
  retry?: { kind: RenderKind; options?: RenderOptions };
  /** A master that is not the master of its version (a newer one is on disk): "An earlier master of v231", said in
   *  the quiet style, with "· scaled up from 480p" when it has no record. */
  earlier?: string;
  /** The master of the version on screen when it is out of date (masters.ts masterAge): why, said in amber, with
   *  "Render again" beside it. */
  stale?: string;
  index: number;
}

export interface ListInput {
  /** The version on screen. */
  shown: string;
  /** The timeline's picture size. */
  width: number;
  height: number;
  /** The length of the version on screen, in seconds. */
  seconds: number;
  /** The 480p and the master of the version on screen, as the render states say (live), and as its version file
   *  recorded them (renders.proxy, renders.master). */
  proxy?: RenderState;
  master?: RenderState;
  recorded?: { proxy?: RenderInfo; master?: RenderInfo };
  /** The version's renders with options (GET …/cut/render/<version> variants). */
  variants: RenderState[];
  /** Every file on disk (GET …/cut/renders). */
  files: RenderFile[];
  trackName?: (id: string) => string | undefined;
  /** Before a master: "3 shots have no full-size picture and will be scaled up from 480p" (fullsize.ts scaledUpWords). */
  masterHint?: string;
  /** The master of the version on screen, when it is out of date: its path and why (masters.ts masterAge). */
  masterStale?: { path: string; reason: string };
}

export interface RenderLists {
  /** The version on screen, newest first, running ones at the top. */
  shown: RenderRow[];
  /** Other versions' masters and "More renders" files, newest first. */
  earlier: RenderRow[];
}

const sizeWords = (w: number, h: number, kind: RenderKind): string => {
  if (kind === 'master') return `${w} × ${h}`;
  const short = Math.min(w, h);
  const long = 2 * Math.round((480 * Math.max(w, h)) / short / 2);
  return w <= h ? `480 × ${long}` : `${long} × 480`;
};

/** What the options leave out, short: "no title cards", "no A2 Music". */
function leaveWords(o: RenderOptions | undefined, trackName: (id: string) => string | undefined): string[] {
  const lo = o?.leaveOut;
  if (!lo) return [];
  return [
    ...(lo.cards ? ['no title cards'] : []),
    ...(lo.tracks ?? []).map((id) => { const n = trackName(id); return `no ${n ? `${id} ${n}` : `track ${id}`}`; }),
    ...(lo.clips?.length ? [`${lo.clips.length} clip${lo.clips.length === 1 ? '' : 's'} left out`] : []),
  ];
}

const isSound = (p: string): boolean => /\.(wav|aiff?|mp3|m4a|flac)$/i.test(p);

/** "60 MB", "1.4 GB" (render-options.ts mbWords, the server's words for the same sizes). */
export const mbWords = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
/** A smaller file in words: "smaller file (60 MB, from 101 MB)", or "smaller file" before it is measured. */
export const smallWords = (s: Pick<RenderSmall, 'bytes' | 'fromBytes'> | undefined): string => (s ? `smaller file (${mbWords(s.bytes)}, from ${mbWords(s.fromBytes)})` : 'smaller file');

/** What a file of a render is: its title, its size and what is in it, from its name and the render's options. */
export function fileWords(f: Pick<RenderFile, 'path' | 'version' | 'kind' | 'tag' | 'options' | 'loudness' | 'small'>, width: number, height: number, trackName: (id: string) => string | undefined = () => undefined): { title: string; size: string; extra?: string; sound: boolean } {
  const name = baseName(f.path);
  const cut = `cut ${f.version}`;
  const sound = isSound(name);
  const left = leaveWords(f.options, trackName);
  const big = f.kind === 'master' ? 'Full size' : '480p';
  if (!f.tag) return { title: `${f.kind === 'master' ? 'Master' : '480p'} of ${cut}`, size: sizeWords(width, height, f.kind), sound: false };
  // <version>-<kind>-<tag>[.<part>].<ext>
  const part = name.slice(`${f.version}-${f.kind}-${f.tag}`.length).replace(/\.[^.]+$/, '').replace(/^\./, '');
  if (sound) {
    const one = /^([A-Z]\d+)-(.+)$/.exec(part);
    const n = one ? trackName(one[1]) : undefined;
    const what = one ? `${one[1]} ${n ?? one[2].replace(/-/g, ' ')} alone` : part === 'dialogue' ? 'dialogue only' : part === 'no-dialogue' ? 'everything but dialogue' : part === 'mix' ? 'the full mix' : part;
    return { title: `Sound of ${cut}`, size: 'WAV', extra: [what, ...left].join(' · '), sound: true };
  }
  if (part === 'picture') return { title: `Picture alone of ${cut}`, size: sizeWords(width, height, f.kind), extra: ['no sound', ...left].join(' · '), sound: false };
  // the loudness asked for (what the file measured is in the render's own words, on hover)
  const loud = f.options?.loudness ? `${signed(f.options.loudness.lufs).replace(/^\+/, '')} LUFS` : f.loudness ? `${signed(f.loudness.target).replace(/^\+/, '')} LUFS` : undefined;
  const small = f.options?.small || f.small ? [smallWords(f.small)] : [];
  return { title: `${big} of ${cut}`, size: sizeWords(width, height, f.kind), extra: [...left, ...(loud ? [loud] : []), ...small].join(' · ') || undefined, sound: false };
}

const finishedOf = (s: RenderState): string | undefined =>
  s.finishedAt ?? (s.startedAt && s.seconds !== undefined ? new Date(Date.parse(s.startedAt) + s.seconds * 1000).toISOString() : undefined);

const live = (s: RowState) => (s === 'running' ? 2 : s === 'queued' ? 1 : 0);
/** Running and queued at the top, then the newest first; a render's files in their own order. */
export function byNewest(a: RenderRow, b: RenderRow): number {
  return live(b.state) - live(a.state) || (b.at ?? '').localeCompare(a.at ?? '') || a.index - b.index || a.key.localeCompare(b.key);
}

/** A master's "made from" words, when the render recorded them. */
const made = (kind: RenderKind, p?: PictureMade): { made?: { text: string; warn: boolean }[] } => {
  const w = kind === 'master' && p ? madeWords(p) : [];
  return w.length ? { made: w } : {};
};

/** The two lists of the Renders tab. */
export function renderLists(x: ListInput): RenderLists {
  const name = x.trackName ?? (() => undefined);
  const known = new Map(x.files.map((f) => [f.path, f]));
  const rows = new Map<string, RenderRow>();
  const fromFile = (f: RenderFile, i: number): RenderRow => {
    const w = fileWords(f, x.width, x.height, name);
    return { key: f.path, version: f.version, kind: f.kind, tag: f.tag, state: 'done', path: f.path, sound: w.sound, title: w.title, size: w.size, extra: w.extra, what: f.what,
      seconds: f.seconds ?? (f.version === x.shown ? x.seconds : undefined), at: f.at, took: f.took, index: f.index ?? i, ...made(f.kind, f.picture),
      ...(f.kind === 'master' && !f.tag && f.earlier ? { earlier: earlierWords(f.version, f.picture) } : {}) };
  };
  const put = (r: RenderRow) => { rows.set(r.key, { ...rows.get(r.key), ...r }); };

  // the plain 480p and master of the version on screen
  for (const kind of ['proxy', 'master'] as const) {
    const s = kind === 'proxy' ? x.proxy : x.master;
    const rec = x.recorded?.[kind];
    const cut = `cut ${x.shown}`;
    const title = `${kind === 'master' ? 'Master' : '480p'} of ${cut}`;
    const size = sizeWords(x.width, x.height, kind);
    if (s && s.version === x.shown && (s.state === 'running' || s.state === 'queued' || s.state === 'failed')) {
      put({ key: `${kind}/`, version: x.shown, kind, state: s.state, percent: s.percent, sound: false, title, size, seconds: x.seconds, error: s.error,
        at: s.state === 'failed' ? s.finishedAt ?? s.startedAt ?? s.queuedAt : undefined, retry: { kind }, index: 0, ...(kind === 'master' && s.state !== 'failed' && x.masterHint ? { warn: x.masterHint } : {}) });
      continue;
    }
    const path = (s && s.version === x.shown && s.state === 'done' ? s.path : undefined) ?? rec?.path;
    if (!path) continue;
    const f = known.get(path);
    put({ key: path, version: x.shown, kind, state: 'done', path, sound: false, title, size, seconds: f?.seconds ?? x.seconds,
      at: (s && s.version === x.shown ? finishedOf(s) : undefined) ?? (rec?.path === path ? rec.at : undefined) ?? f?.at,
      took: (s && s.version === x.shown ? s.seconds : undefined) ?? (rec?.path === path ? rec.seconds : undefined) ?? f?.took, index: 0,
      ...made(kind, (s && s.version === x.shown ? s.picture : undefined) ?? (rec?.path === path ? rec.picture : undefined) ?? f?.picture),
      ...(kind === 'master' && x.masterStale?.path === path ? { stale: x.masterStale.reason } : {}) });
  }

  // the renders with options of the version on screen: a row per file when done, else one row for the render
  for (const v of x.variants) {
    if (v.version !== x.shown) continue;
    if (v.state === 'done') {
      (v.outputs ?? (v.path ? [{ path: v.path, what: '' }] : [])).forEach((o, i) => {
        const f = known.get(o.path);
        const r = fromFile({ path: o.path, version: v.version, kind: v.kind, tag: v.tag, options: v.options, what: o.what || undefined, index: i, loudness: v.loudness, small: i === 0 ? v.small ?? f?.small : undefined, at: f?.at ?? finishedOf(v), took: f?.took ?? v.seconds, seconds: f?.seconds, picture: i === 0 && !isSound(o.path) ? v.picture : undefined }, i);
        put(r);
      });
      continue;
    }
    if (v.state === 'none') continue;
    put({ key: `${v.kind}/${v.tag ?? ''}`, version: v.version, kind: v.kind, tag: v.tag, state: v.state, percent: v.percent, sound: false,
      title: v.options ? describe(v.options, v.kind, name) : `${v.kind === 'master' ? 'Full size' : '480p'} of cut ${v.version}`, size: sizeWords(x.width, x.height, v.kind),
      seconds: x.seconds, error: v.error, at: v.state === 'failed' ? v.finishedAt ?? v.startedAt ?? v.queuedAt : undefined, retry: { kind: v.kind, options: v.options }, index: 0,
      ...(v.kind === 'master' && v.state !== 'failed' && x.masterHint ? { warn: x.masterHint } : {}) });
  }

  // what is on disk for the version on screen and nothing above named it (a render made before the page opened)
  x.files.forEach((f, i) => { if (f.version === x.shown && !rows.has(f.path)) put(fromFile(f, i)); });

  const earlier = x.files
    .filter((f) => f.version !== x.shown && (f.kind === 'master' || !!f.tag))
    .map((f, i) => fromFile(f, i))
    .sort(byNewest);
  return { shown: [...rows.values()].sort(byNewest), earlier };
}

/** "1:53" or "0:07". */
export const clockLen = (s: number | undefined): string => {
  if (s === undefined || !Number.isFinite(s)) return '';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

/** "74 s", "6 min". */
export const tookWords = (s: number | undefined): string => (s === undefined ? '' : s < 60 ? `${Math.round(s * 10) / 10} s` : `${Math.round(s / 60)} min`);

/** The tag on the picture while a render plays: "Render · master of v231", or of an older version. `gap`: that
 *  version's cut against the cut now, when the page knows it (sameCut.ts cutGap, words ending on "since", ASKS 49):
 *  the same content is not an older cut ("Render · master of v235 · nothing changed since"), a real difference says
 *  what it is ("Render of v235 · 1 subtitle line moved since"); unknown, the two numbers as before. */
export function playTag(r: Pick<RenderRow, 'title' | 'version' | 'extra' | 'sound'>, current: string | undefined, gap?: { same: boolean; words?: string }): { text: string; older: boolean } {
  const what = r.title.replace(/ of cut v\d+$/, '').replace(/^\w/, (c) => c.toLowerCase());
  const other = !!current && r.version !== current;
  if (other && gap?.same) return { text: `Render · ${what} of ${r.version} · nothing changed since`, older: false };
  if (other && gap?.words) return { text: `Render of ${r.version} · ${gap.words}`, older: true };
  return { text: other ? `Render of ${r.version} · the cut is now ${current}` : `Render · ${what} of ${r.version}`, older: other };
}
