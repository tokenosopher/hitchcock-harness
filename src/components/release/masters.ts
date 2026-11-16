// The masters the user can name as the final (the Release page while it is closed, board 14), each with the same four
// fact rows (picture, subtitles, sound, length and size), only a difference that would disqualify it in amber; and the
// names the final and its companions go out as. Pure: the server builds the facts (src/server/release/final.ts), the
// sample data does the same by hand, the page draws the rows.
import type { PictureMade } from '@/server/types';
import { madeWords } from '@/components/edit/fullsize';
import { cutGap, type CutLike } from '@/components/edit/sameCut';

export interface MasterRow { label: 'Picture' | 'Subtitles' | 'Sound' | 'Length'; text: string; warn: boolean }

/** A master, as the closed Release page lists it (GET …/release `masters`, newest first). */
export interface MasterOption {
  /** Relative to the film folder. */
  path: string;
  version: string;
  /** "Master of v236", "Master of v236 at −14 LUFS". */
  title: string;
  at?: string;
  bytes?: number;
  /** A smaller file (ASKS 56): the size of the render it was made from. */
  fromBytes?: number;
  seconds?: number;
  rows: MasterRow[];
  /** Out of date (masters.ts masterAge): why. The page offers the Renders tab instead of the button. */
  stale?: string;
  /** Of the cut as it is now: of its version, or of a version whose content is the same (sameCut.ts). */
  current: boolean;
  /** A still to show: the file itself (the media route makes a poster). */
  still?: string;
}

/** What the rows are built from. */
export interface MasterFacts {
  picture?: PictureMade;
  /** Subtitle lines in the version (captions tracks not muted); `left`: the render left them out. */
  lines: number;
  subtitlesLeft: boolean;
  /** The version's sound tracks by name, and those the render left out. */
  sound: string[];
  soundLeft: string[];
  lufs?: number;
  seconds?: number;
  width: number;
  height: number;
  bytes?: number;
  /** A smaller file (ASKS 56): the size of the render it was made from ("60 MB, from 101 MB"). */
  fromBytes?: number;
}
/** The cut as it is now, to compare with. */
export interface CutNow { seconds?: number; lines: number }

const and = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
export const clock = (s: number | undefined): string => {
  if (s === undefined || !Number.isFinite(s)) return '';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};
export const mb = (bytes: number | undefined): string => (bytes === undefined ? '' : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const minus = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n)}`;

/** The four rows: picture, subtitles, sound, length and size. Amber only where it would not do as the final. */
export function masterRows(m: MasterFacts, cut: CutNow): MasterRow[] {
  const made = m.picture ? madeWords(m.picture) : [];
  const picture: MasterRow = made.length
    ? { label: 'Picture', text: made.map((x) => x.text).join(', '), warn: made.some((x) => x.warn) }
    : { label: 'Picture', text: 'made before the picture was recorded', warn: false };
  const has = m.lines > 0 && !m.subtitlesLeft;
  const subtitles: MasterRow = { label: 'Subtitles', text: has ? `in the picture, ${m.lines} ${m.lines === 1 ? 'line' : 'lines'}` : 'none', warn: !has && cut.lines > 0 };
  const heard = m.sound.filter((x) => !m.soundLeft.includes(x));
  const loud = m.lufs !== undefined ? `, ${minus(m.lufs)} LUFS` : '';
  const sound: MasterRow = !heard.length
    ? { label: 'Sound', text: 'none', warn: true }
    : m.soundLeft.length
      ? { label: 'Sound', text: `${and(heard.map((x) => x.toLowerCase()))} only, no ${and(m.soundLeft.map((x) => x.toLowerCase()))}${loud}`, warn: true }
      : { label: 'Sound', text: `the full mix: ${and(heard.map((x) => x.toLowerCase()))}${loud}`, warn: false };
  const off = m.seconds !== undefined && cut.seconds !== undefined && Math.abs(m.seconds - cut.seconds) > 0.5;
  const length: MasterRow = { label: 'Length', text: [clock(m.seconds), `${m.width} × ${m.height}`, mb(m.bytes), m.fromBytes !== undefined && m.bytes !== undefined ? `from ${mb(m.fromBytes)}` : ''].filter(Boolean).join(', '), warn: off };
  return [picture, subtitles, sound, length];
}

/** The cut now as the Release pages see it (ReleaseView.cut), and the final's cut against it when the final is of
 *  another version (ASKS 49, sameCut.ts): `finalCut` is what the render reads of the final's version, undefined when
 *  it could not be read (then nothing is said about its content). */
export function cutNowView(now: (CutLike & { version: string }) | undefined, final: { version: string } | undefined, finalCut: CutLike | undefined): { version: string; final?: { version: string; same: boolean; words?: string } } | undefined {
  if (!now) return undefined;
  if (!final || final.version === now.version || !finalCut) return { version: now.version };
  return { version: now.version, final: { version: final.version, ...cutGap(finalCut, now, 'the final') } };
}

/** The amber line on the open Release page when the final is of an older cut: what changed since, in words; nothing
 *  when the content is the same; the two numbers when the content is not known. `title`: the two numbers, always. */
export function cutNewerLine(finalVersion: string, cut: ReturnType<typeof cutNowView>): { text: string; title: string } | undefined {
  if (!cut || cut.version === finalVersion) return undefined;
  const title = `The final is of ${finalVersion}. The cut is now ${cut.version}.`;
  const gap = cut.final?.version === finalVersion ? cut.final : undefined;
  if (gap?.same) return undefined;
  return { text: gap?.words ? `${gap.words.charAt(0).toUpperCase()}${gap.words.slice(1)}.` : title, title };
}

/** The names the final and its companions go out as ("The Lighthouse - FINAL captioned.mp4"), the
 *  names the delivery's Social kit uses (read/release.ts kindOf). */
export const finalNames = (title: string) => ({
  final: `${title} - FINAL captioned.mp4`,
  clean: `${title} - FINAL clean.mp4`,
  phone: `${title} - FINAL captioned 480p.mp4`,
  srt: `${title} - FINAL.srt`,
});

/** A file made from the final, as the Release page's left column shows it (quiet rows; nothing is spent). */
export interface CompanionStatus {
  key: 'clean' | 'phone' | 'srt' | 'post';
  /** "Without subtitles", "Phone copy, 480p", "Subtitle file", "Smaller file, for posting". */
  label: string;
  path?: string;
  /** 'same': the final itself serves (it has no subtitles to leave out); 'none': not made and not asked for. */
  state: 'none' | 'queued' | 'running' | 'done' | 'failed' | 'same';
  percent?: number;
  bytes?: number;
  error?: string;
}
export const COMPANION_LABEL: Record<CompanionStatus['key'], string> = { clean: 'Without subtitles', phone: 'Phone copy, 480p', srt: 'Subtitle file', post: 'Smaller file, for posting' };
