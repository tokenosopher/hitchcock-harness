// A version's masters, and when one is out of date (14 Nov 2026, ASKS 42). Pure: the page, the render queue
// (render.ts), the Renders tab's listing (render-files.ts) and scripts/renders-test.ts all use it.
//
// Naming. The first master of cut v<n> is cut/renders/v<n>-master.mp4; a master made again is a new file beside it,
// v<n>-master-2.mp4, then -3, and so on. Nothing is ever written over. The newest one on disk (the highest number) is
// "the master of v<n>". A number cannot be a "More renders" tag: a tag always starts with a word (without, lufs, stems).
//
// Out of date. A master's picture is built from the best full-size source of every shot (fullsize.ts picturePieces)
// and records what it used (`picture`). It is out of date, although the cut has not changed, when:
//   - it has no record (made before 14 Nov, from the 480p scaled up) and any shot now has a full-size source;
//   - a full-size file it would use now (a take's Seedance or upscaled file, a card's original) is newer than it;
//   - the upscaled cut it would use now is newer than it, or is of another version than the one it used;
//   - fewer frames would be scaled up from 480p now than it scaled up.
// Names, times and the records only: no ffmpeg, no reading of video files.
import type { PictureMade } from '@/server/types';
import type { Piece, PieceKind } from './fullsize';

const DIR = 'cut/renders';

/** cut/renders/v231-master.mp4 for the first, v231-master-2.mp4 for the second, and so on. */
export const masterRel = (version: string, n = 1): string => `${DIR}/${version}-master${n > 1 ? `-${n}` : ''}.mp4`;
/** Its own log: the first master writes into the version's log (v231.log), as it always has; a later one has its own. */
export const masterLogRel = (version: string, n = 1): string => (n > 1 ? `${DIR}/${version}-master-${n}.log` : `${DIR}/${version}.log`);

const NAME = /^(v\d+)-master(?:-([1-9]\d*))?\.mp4$/;
/** The version and number of a master's file name (or path), else undefined. "-1" is not a name the app writes. */
export function masterNo(name: string): { version: string; n: number } | undefined {
  const m = NAME.exec(name.split('/').pop() ?? name);
  if (!m || m[2] === '1') return undefined;
  return { version: m[1], n: m[2] ? Number(m[2]) : 1 };
}

/** The masters of a version among a folder's names, oldest first. */
export function mastersOf(names: string[], version: string): { n: number; path: string }[] {
  const out: { n: number; path: string }[] = [];
  for (const name of names) {
    const m = masterNo(name);
    if (m && m.version === version) out.push({ n: m.n, path: masterRel(version, m.n) });
  }
  return out.sort((a, b) => a.n - b.n);
}
/** The master of a version: the newest on disk. */
export const newestMaster = (names: string[], version: string): { n: number; path: string } | undefined => mastersOf(names, version).pop();

// ---- out of date

export interface MasterAge {
  /** 'stale': out of date; 'fresh': made from what the page would use now; 'unknown': no record, and nothing
   *  full-size to compare with (shown as today). */
  state: 'fresh' | 'stale' | 'unknown';
  /** Why it is out of date, one sentence without the full stop. */
  reason?: string;
}

/** What the page would build a master from now: the pieces (picturePieces of the version, counted by shot), what they
 *  make (pictureMade) and the files' times (FullInfo.times, by the paths the pieces name). */
export interface PictureNow { pieces: Piece[]; made: PictureMade; times?: Record<string, string> }

const OWN: PieceKind[] = ['take', 'upscaled', 'original'];
const smallOf = (m: PictureMade, what: 'shots' | 'frames') => m.sources.find((s) => s.kind === 'small')?.[what] ?? 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const later = (a: string | undefined, b: string | undefined) => !!a && !!b && Date.parse(a) > Date.parse(b);

/** Is the master of `version`, made at `at` from `picture` (its record), out of date against what the page would use
 *  now? `at`: when it was made (its record's time, else its file's). */
export function masterAge(m: { version: string; at?: string; picture?: PictureMade }, now: PictureNow): MasterAge {
  const who = `The master of ${m.version}`;
  const total = now.made.shots;
  const full = total - smallOf(now.made, 'shots');
  const baseShots = now.made.sources.find((s) => s.kind === 'base')?.shots ?? 0;
  if (!m.picture) {
    if (full <= 0) return { state: 'unknown' };
    const cover = baseShots === total ? `the upscaled cut now covers all ${total} shots`
      : full === total ? `all ${total} shots now have a full-size picture`
        : baseShots === full ? `the upscaled cut now covers ${full} of ${total} shots`
          : `${full} of ${total} shots now have a full-size picture`;
    return { state: 'stale', reason: `${who} was made from the 480p scaled up; ${cover}` };
  }
  const parts: string[] = [];
  // a file of a shot's own that is newer than the master: counted by take (or card)
  if (m.at) {
    const newer = new Map<string, PieceKind>();
    for (const p of now.pieces) if (OWN.includes(p.kind) && later(now.times?.[p.src], m.at)) newer.set(p.clip.src ?? p.src, p.kind);
    if (newer.size) {
      const kinds = [...newer.values()];
      const noun = kinds.every((k) => k !== 'original') ? 'take' : kinds.every((k) => k === 'original') ? 'title card' : 'shot';
      parts.push(`before ${plural(newer.size, noun)} got ${newer.size === 1 ? 'its' : 'their'} full-size picture`);
    }
  }
  // the upscaled cut it would use now: newer than the master, or of another version than the one it used
  const b = now.made.base;
  if (b && now.pieces.some((p) => p.kind === 'base')) {
    const used = m.picture.base;
    if ((used && used.version !== b.version) || later(now.times?.[b.path], m.at)) parts.push(`before the upscaled cut of ${b.version} landed`);
  }
  if (parts.length) return { state: 'stale', reason: `${who} was made ${parts.join(' and ')}` };
  // less would be scaled up from 480p now
  const was = smallOf(m.picture, 'frames'), is = smallOf(now.made, 'frames');
  if (is < was) {
    const shots = smallOf(m.picture, 'shots'), left = smallOf(now.made, 'shots');
    return { state: 'stale', reason: `${who} was made with ${plural(shots, 'shot')} scaled up from 480p; ${left === 0 ? 'every shot now has a full-size picture' : `now ${plural(left, 'shot is', 'shots are')}`}` };
  }
  return { state: 'fresh' };
}

/** The quiet line on an earlier master's row: "An earlier master of v231", and when it has no record (made before
 *  the picture was recorded, from the 480p scaled up), "· scaled up from 480p". */
export function earlierWords(version: string, picture?: PictureMade): string {
  return `An earlier master of ${version}${picture ? '' : ' · scaled up from 480p'}`;
}
