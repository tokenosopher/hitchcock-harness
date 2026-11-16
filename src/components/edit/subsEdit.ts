// The edits that only subtitle lines have (14 Nov 2026, ASKS 40): retyping a line, an .srt file put on the subtitles
// track, and an .srt clip split into one line per cue. Pure, like model.ts: each returns the next timeline and its
// one-line note, or undefined (with the reason left for the status line) when nothing would change.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { smpte } from '@/components/lib/format';
import { endF, findClip, lockedWhy, refuse, startF, type ClipRef, type Edit } from './model';
import { cleanText, cuesToLines, isLine, isSrtClip, srtClipCues } from './subs';

const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;

/** The id and name of the subtitles track this cut would get: C1 "Subtitles" (Alma's and the page's). */
export const SUBS_TRACK = { id: 'C1', kind: 'captions' as const, name: 'Subtitles' };

/** Whether the cut has any subtitle line or .srt clip on a captions track. */
export function hasSubtitles(tl: Timeline): boolean {
  return tl.tracks.some((t) => t.kind === 'captions' && t.clips.some((c) => isLine(c) || isSrtClip(c)));
}

/** New words for a line (Enter in the field over the block, or the Inspector): cleaned (at most two rows, no empty
 *  ones); none refused. One version, its note naming where the line is. */
export function retypeLine(tl0: Timeline, r: ClipRef, raw: string): Edit | undefined {
  const f = findClip(tl0, r);
  if (!f || !isLine(f.clip)) return undefined;
  const lock = lockedWhy(tl0, [r]);
  if (lock) return refuse(lock);
  const text = cleanText(raw);
  if (!text) return refuse('A line needs words. To take it out, select it and press Delete.');
  if (text === f.clip.text) return undefined;
  const tl = clone(tl0);
  findClip(tl, r)!.clip.text = text;
  return { tl, note: `retyped the subtitle at ${smpte(f.clip.at, tl0.fps)}` };
}

const free = (tl: Timeline, t: TimelineTrack, from: number, to: number) => !t.clips.some((c) => startF(c, tl.fps) < to && endF(c, tl.fps) > from);

/** A captions track with room from `from` to `to`: the one asked for, else the first, else a new one ("Subtitles",
 *  or "Subtitles 2" beside one already there), put under the sound tracks. */
function roomOn(tl: Timeline, from: number, to: number, ask?: string): TimelineTrack | undefined {
  const caps = tl.tracks.filter((t) => t.kind === 'captions' && !t.locked);
  const asked = ask ? caps.find((t) => t.id === ask) : undefined;
  const hit = (asked && free(tl, asked, from, to) ? asked : undefined) ?? caps.find((t) => free(tl, t, from, to));
  if (hit) return hit;
  const n = Math.max(0, ...tl.tracks.filter((t) => t.id.startsWith('C')).map((t) => Number(t.id.slice(1)) || 0)) + 1;
  const names = new Set(tl.tracks.map((t) => t.name));
  let name = SUBS_TRACK.name;
  for (let k = 2; names.has(name); k++) name = `${SUBS_TRACK.name} ${k}`;
  const made: TimelineTrack = { id: `C${n}`, kind: 'captions', name, clips: [] };
  tl.tracks.push(made);
  return made;
}

/** An .srt file put on the subtitles track at frame `f` (the start of the film, or where it was dropped): one clip of
 *  the whole file, which plays its cues; on a new subtitles track when the one there has lines at that time. */
export function placeSrt(tl0: Timeline, file: { src: string; name: string; seconds?: number }, f: number, trackId?: string): { edit?: Edit & { ref: ClipRef }; error?: string } {
  const fps = tl0.fps;
  if (!file.seconds) return { error: `The cues of ${file.name} are not read yet, so it cannot be placed. Try again in a moment.` };
  const at = Math.max(0, Math.round(f));
  const frames = Math.max(1, Math.round(file.seconds * fps));
  const tl = clone(tl0);
  const t = roomOn(tl, at, at + frames, trackId);
  if (!t) return { error: 'No subtitles track has room there.' };
  const clip: TimelineClip = { id: `cap${Date.now().toString(36)}`, src: file.src, in: 0, out: Math.round((frames / fps) * 1e6) / 1e6, at: Math.round((at / fps) * 1e6) / 1e6, label: file.name };
  t.clips.push(clip);
  t.clips.sort((a, b) => a.at - b.at);
  return { edit: { tl, note: `added ${file.name}.srt on ${t.id} ${t.name} at ${smpte(at / fps, fps)}`, ref: { trackId: t.id, clipId: clip.id } } };
}

/** "Split into lines to edit": an .srt clip replaced by one text line per cue it shows, at the same times. One
 *  version. Refused when a line would land on another clip of the track. */
export function splitSrt(tl0: Timeline, r: ClipRef, srt: string): { edit?: Edit & { refs: ClipRef[] }; error?: string } {
  const f = findClip(tl0, r);
  if (!f || !isSrtClip(f.clip)) return { error: 'That clip is not an .srt file.' };
  const lock = lockedWhy(tl0, [r]);
  if (lock) return { error: lock };
  const fps = tl0.fps;
  const lines = cuesToLines(srtClipCues(f.clip, srt), fps);
  if (!lines.length) return { error: `${f.clip.label ?? 'The file'} has no cues in the part the clip plays.` };
  const tl = clone(tl0);
  const t = tl.tracks.find((x) => x.id === r.trackId)!;
  t.clips = t.clips.filter((c) => c.id !== r.clipId);
  const clash = lines.find((l) => !free(tl, t, startF(l, fps), endF(l, fps)));
  if (clash) return { error: `A line at ${smpte(clash.at, fps)} would land on another clip of ${t.id} ${t.name}. Move that clip first.` };
  t.clips.push(...lines);
  t.clips.sort((a, b) => a.at - b.at);
  return { edit: { tl, note: `split ${f.clip.label ?? 'the .srt'} into ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} to edit on ${t.id} ${t.name}`, refs: lines.map((l) => ({ trackId: t.id, clipId: l.id })) } };
}
