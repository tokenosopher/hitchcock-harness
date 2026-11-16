// What the "More renders" panel asks of the render (Renders.tsx) and how it says it, kept apart from React so that
// scripts/render-test.ts can feed the exact request the page posts to the server's own check (parseRenderOptions)
// and read the answer back with the same words the panel shows. The options themselves: types.ts RenderOptions,
// src/server/edit/render-options.ts.
import type { RenderKind, RenderLoudness, RenderOptions, RenderState, Timeline } from '@/server/types';

/** The panel's choices, as typed (the numbers are text until they check out). */
export interface RenderAsk {
  kind: RenderKind;
  lufs: string;                 // empty: the mix as it is
  ceiling: string;              // dBTP; empty: the server's −1
  stems: boolean;
  cards: boolean;
  tracks: string[];             // track ids left out
  small: boolean;               // the master as a smaller file (ASKS 56); counted only on a master without stems (smallOff)
}
export const emptyAsk = (): RenderAsk => ({ kind: 'proxy', lufs: '', ceiling: '-1', stems: false, cards: false, tracks: [], small: false });

/** Why "Smaller file" cannot be ticked now (the panel shows it disabled with these words), else undefined. */
export function smallOff(a: Pick<RenderAsk, 'kind' | 'stems'>): string | undefined {
  if (a.kind !== 'master') return 'For the full size only: the 480p is a small file already.';
  if (a.stems) return 'Not with the separate files: the smaller file is the film with its sound in one file.';
  return undefined;
}

/** The limits the server holds (render-options.ts parseRenderOptions). */
export const LUFS_RANGE = [-40, -5] as const;
export const CEILING_RANGE = [-9, 0] as const;

/** A number as typed: "−14", "-14", "-14,5"; undefined when empty, NaN when not a number. */
export function readNumber(s: string): number | undefined {
  const t = s.trim().replace(/[−–]/g, '-').replace(',', '.');
  if (!t) return undefined;
  return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** The request's options, or why there is none to send. */
export function askOptions(a: RenderAsk): { options?: RenderOptions; why?: string } {
  const lufs = readNumber(a.lufs);
  const ceiling = readNumber(a.ceiling);
  const o: RenderOptions = {};
  if (lufs !== undefined) {
    if (!Number.isFinite(lufs) || lufs < LUFS_RANGE[0] || lufs > LUFS_RANGE[1]) return { why: `The loudness goes from −40 to −5 LUFS${Number.isFinite(lufs) && lufs > 0 ? ' (with the minus sign)' : ''}.` };
    if (ceiling !== undefined && (!Number.isFinite(ceiling) || ceiling < CEILING_RANGE[0] || ceiling > CEILING_RANGE[1])) return { why: 'The ceiling goes from −9 to 0 dBTP.' };
    o.loudness = { lufs, ...(ceiling !== undefined ? { truePeak: ceiling } : {}) };
  }
  if (a.stems) o.stems = true;
  if (a.cards || a.tracks.length) o.leaveOut = { ...(a.tracks.length ? { tracks: [...a.tracks].sort() } : {}), ...(a.cards ? { cards: true } : {}) };
  if (a.small && !smallOff(a)) o.small = true;
  if (!Object.keys(o).length) return { why: 'Choose a loudness, the separate files, something to leave out or a smaller file: without any, it is the plain render that Render master and the 480p after each change already make.' };
  return { options: o };
}

/** The body of POST …/cut/render. */
export const askBody = (version: string, kind: RenderKind, options: RenderOptions, retry = false): { version: string; kind: RenderKind; options: RenderOptions; retry?: true } =>
  ({ version, kind, options, ...(retry ? { retry: true as const } : {}) });

/** −14 with a real minus sign, one decimal at most. */
export const signed = (n: number): string => {
  const r = Math.round(n * 10) / 10;
  return `${r < 0 ? '−' : r > 0 ? '+' : ''}${Math.abs(r)}`;
};
const minus = (n: number): string => signed(n).replace(/^\+/, '');

/** The size each kind makes: the master is the timeline's own size, the 480p one 480 on its short side (render.ts outputSize). */
export function sizeOf(t: Pick<Timeline, 'width' | 'height'>, kind: RenderKind): string {
  if (kind === 'master') return `${t.width}×${t.height}`;
  const short = Math.min(t.width, t.height);
  const long = 2 * Math.round((480 * Math.max(t.width, t.height)) / short / 2);
  return t.width <= t.height ? `480×${long}` : `${long}×480`;
}

const list = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "A 480p file without the title cards and A2 Music, its sound at −14 LUFS under −1 dBTP, and the separate sound files";
 *  "A full-size file, its sound at −14 LUFS under −1 dBTP, as a smaller file"; "The master as a smaller file". */
export function describe(o: RenderOptions, kind: RenderKind, trackName: (id: string) => string | undefined): string {
  const size = kind === 'master' ? 'full-size' : '480p';
  const lo = o.leaveOut;
  const out = [...(lo?.cards ? ['the title cards'] : []), ...(lo?.tracks ?? []).map((id) => { const n = trackName(id); return n ? `${id} ${n}` : `track ${id}`; }), ...(lo?.clips?.length ? [`${lo.clips.length} clip${lo.clips.length === 1 ? '' : 's'}`] : [])];
  const without = out.length ? ` without ${list(out)}` : '';
  const loud = o.loudness ? `, its sound at ${minus(o.loudness.lufs)} LUFS under ${minus(o.loudness.truePeak ?? -1)} dBTP` : '';
  const parts: string[] = [];
  const small = o.small ? ', as a smaller file' : '';
  if (o.loudness || lo) parts.push(`A ${size} file${without}${loud}${small}`);
  else if (o.small) parts.push('The master as a smaller file');
  if (o.stems) parts.push(parts.length ? 'the separate sound files and the picture alone' : `The separate sound files and the picture alone${without}, at ${size}`);
  return parts.join(', and ');
}

/** "was −20.8 LUFS, peak −3.5 dBTP → now −14.1 LUFS, peak −1.3 dBTP · one gain of +6.7 dB". */
export function loudnessLine(l: RenderLoudness): string {
  return `was ${minus(l.before.i)} LUFS, peak ${minus(l.before.tp)} dBTP → now ${minus(l.after.i)} LUFS, peak ${minus(l.after.tp)} dBTP · ${l.mode === 'linear' ? `one gain of ${signed(l.gain)} dB` : `a gain of ${signed(l.gain)} dB, then held under the ceiling`}`;
}

/** The newest first: running and queued at the top, then by when each finished. */
export function newestFirst(vs: RenderState[]): RenderState[] {
  // a render read back from its .json has no finishedAt: its start orders it as well
  const when = (s: RenderState) => s.finishedAt ?? s.startedAt ?? s.queuedAt ?? '';
  const live = (s: RenderState) => (s.state === 'running' ? 2 : s.state === 'queued' ? 1 : 0);
  return [...vs].sort((a, b) => live(b) - live(a) || when(b).localeCompare(when(a)) || `${a.kind}/${a.tag}`.localeCompare(`${b.kind}/${b.tag}`));
}

/** One variant's key in the list: its kind and tag (the server's own key). */
export const variantKey = (s: Pick<RenderState, 'kind' | 'tag'>): string => `${s.kind}/${s.tag ?? ''}`;

/** A title card, as the render's leaveOut.cards counts one (render-options.ts isCard). */
export const isCard = (label: string | undefined): boolean => /^title card/i.test(label ?? '');

/** A file's name from its path. */
export const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
