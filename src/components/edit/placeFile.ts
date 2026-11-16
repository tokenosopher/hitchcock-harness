// A file of the film put on the timeline by hand, and a sound clip's file swapped for another (14 Nov 2026: the
// owner comes from DaVinci Resolve, where a file is dragged from the media pool onto a track; until now only Alma
// could lay a file into the cut). Pure: each returns the next timeline and its one-line note, or why not.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { smpte } from '@/components/lib/format';
import { clipName, endF, findClip, mainTrackIds, pasteClip, startF, swapSound, type ClipRef, type Edit } from './model';

/** What the page knows of a file (FilmFile, src/server/edit/files.ts). */
export interface PlaceableFile { src: string; name: string; kind: 'sound' | 'picture' | 'subtitles'; seconds?: number; audio?: boolean }

const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;
const num = (t: TimelineTrack) => Number(/\d+/.exec(t.id)?.[0] ?? 0);
const free = (tl: Timeline, t: TimelineTrack, from: number, to: number) => !t.clips.some((c) => startF(c, tl.fps) < to && endF(c, tl.fps) > from);

/**
 * The track a file of this kind goes on: the first of `prefer` that is of its kind and not locked (the lane the menu
 * was opened on or the file dropped on, then the track marked for pasting); else, for a sound, the first of the
 * effects and music tracks (every sound track but the dialogue) with room there, else the first of them; for a
 * picture, the first picture track above the main one with room there (it covers the picture under it). Undefined
 * when there is none: a new track is made for it.
 */
export function trackForFile(tl: Timeline, kind: 'video' | 'audio', prefer: (string | undefined)[], from: number, to: number): TimelineTrack | undefined {
  for (const id of prefer) {
    const t = id ? tl.tracks.find((x) => x.id === id && x.kind === kind && !x.locked) : undefined;
    if (t) return t;
  }
  const main = mainTrackIds(tl);
  if (kind === 'audio') {
    // not the dialogue track, and not the tracks beside it ("Dialogue 2": the dialogue's own overflow, counted as
    // dialogue by the render's stems) unless nothing else is there: a file added by hand is music or an effect
    const dlg = tl.tracks.find((t) => t.kind === 'audio' && main.has(t.id))?.name;
    const beside = (t: TimelineTrack) => !!dlg && t.name.startsWith(`${dlg} `) && /^\d+$/.test(t.name.slice(dlg.length + 1));
    const all = tl.tracks.filter((t) => t.kind === 'audio' && !t.locked && !main.has(t.id));
    const others = all.filter((t) => !beside(t));
    return others.find((t) => free(tl, t, from, to)) ?? others[0] ?? all.find((t) => free(tl, t, from, to)) ?? all[0];
  }
  const v = tl.tracks.find((t) => t.kind === 'video' && main.has(t.id));
  const above = tl.tracks.filter((t) => t.kind === 'video' && !t.locked && (!v || (t.id !== v.id && num(t) > num(v)))).sort((a, b) => num(a) - num(b));
  return above.find((t) => free(tl, t, from, to));
}

/** A track for a hand-placed file when no track takes it: "Effects" under the sound tracks; over the picture
 *  "Inserts", or "Over n" when the inserts are taken there (as a clip dragged over another gets). */
function makeTrack(tl: Timeline, kind: 'video' | 'audio'): TimelineTrack {
  const prefix = kind === 'video' ? 'V' : 'A';
  const n = Math.max(0, ...tl.tracks.filter((t) => t.id.startsWith(prefix)).map((t) => Number(t.id.slice(1)) || 0)) + 1;
  const pictures = tl.tracks.filter((t) => t.kind === 'video').length;
  const t: TimelineTrack = { id: `${prefix}${n}`, kind, name: kind === 'video' ? (pictures > 1 ? `Over ${n - 1}` : 'Inserts') : 'Effects', clips: [] };
  if (kind === 'video') tl.tracks.unshift(t);
  else tl.tracks.splice(tl.tracks.reduce((k, x, i) => (x.kind === 'audio' ? i + 1 : k), tl.tracks.length), 0, t);
  return t;
}

/** The frames of a file, whole frames only, so a clip never reads past its end. */
export const fileFrames = (seconds: number | undefined, fps: number) => (seconds ? Math.floor(seconds * fps + 1e-6) : 0);

/**
 * The whole file as a new clip at frame `f` (in 0, out its length, level 0 dB, no fades, labelled with its name),
 * through `pasteClip`: a sound that would land on another sound goes on the track beside it, a picture is refused
 * where one already sits. A picture file with sound of its own brings it as a second clip at the same place and
 * length: on the dialogue track when the picture went on the main picture track (so the two are linked as a take
 * and its sound are), else on the effects and music tracks as a sound would go. One edit, one note.
 */
export function placeFile(tl0: Timeline, file: PlaceableFile, f: number, prefer: (string | undefined)[] = []): { edit?: Edit & { ref: ClipRef }; error?: string } {
  const fps = tl0.fps;
  // an .srt goes on the subtitles track (subsEdit.ts placeSrt)
  if (file.kind === 'subtitles') return { error: `${file.name} is subtitles: it goes on the subtitles track.` };
  const frames = fileFrames(file.seconds, fps);
  if (!file.seconds) return { error: `The length of ${file.name} is not known yet, so it cannot be placed. Try again in a moment.` };
  if (frames < 1) return { error: `${file.name} is shorter than a frame.` };
  const at = Math.max(0, Math.round(f));
  const clip: TimelineClip = { id: 'new', src: file.src, in: 0, out: Math.round((frames / fps) * 1e6) / 1e6, at: 0, label: file.name };
  const kind = file.kind === 'sound' ? 'audio' : 'video';
  const tl = clone(tl0);
  const asked = trackForFile(tl, kind, prefer, at, at + frames) ?? makeTrack(tl, kind);
  const r = pasteClip(tl, clip, asked.id, at);
  if (!r.edit) return { error: r.error };
  const landed = r.edit.tl.tracks.find((t) => t.id === r.edit!.ref.trackId)!;
  const tc = smpte(at / fps, fps);
  let note = `added ${file.name} on ${landed.id} ${landed.name} at ${tc}${landed.id !== asked.id ? `, beside ${asked.name} where a sound already is` : ''}`;
  if (kind === 'video' && file.audio) {
    const main = mainTrackIds(r.edit.tl);
    const mainA = r.edit.tl.tracks.find((t) => t.kind === 'audio' && main.has(t.id));
    const onMain = main.has(landed.id);
    const tl2 = r.edit.tl;
    const at2 = trackForFile(tl2, 'audio', onMain ? [mainA?.id] : [], at, at + frames) ?? makeTrack(tl2, 'audio');
    const r2 = pasteClip(tl2, clip, at2.id, at);
    if (!r2.edit) return { error: r2.error };
    const sound = r2.edit.tl.tracks.find((t) => t.id === r2.edit!.ref.trackId)!;
    note += `, its sound on ${sound.id} ${sound.name}`;
    return { edit: { tl: r2.edit.tl, note, ref: r.edit.ref } };
  }
  return { edit: { tl: r.edit.tl, note, ref: r.edit.ref } };
}

/**
 * Another file in a sound clip's place (the right-click menu's "Replace with another file…"), through `swapSound`:
 * the clip keeps its id, place, level, fades and speed, and its length where the new file is long enough
 * (`optionWindow`); its label becomes the new file's name. Nothing else moves.
 */
export function replaceFile(tl: Timeline, ref: ClipRef, file: PlaceableFile): { edit?: Edit; error?: string } {
  const x = findClip(tl, ref);
  if (!x) return { error: 'That clip is no longer in the cut.' };
  if (x.track.kind !== 'audio' || file.kind !== 'sound') return { error: 'Only a sound clip can take another sound file.' };
  if (x.track.locked) return { error: `${x.track.id} ${x.track.name} is locked.` };
  if (!file.seconds) return { error: `The length of ${file.name} is not known yet. Try again in a moment.` };
  if (x.clip.src === file.src) return { error: `${file.name} is already the file of this clip.` };
  const was = clipName(x.clip);
  const e = swapSound(tl, ref, { src: file.src, name: file.name, seconds: file.seconds }, was);
  if (!e) return { error: 'Nothing would change.' };
  const c = findClip(e.tl, ref)!.clip;
  c.label = file.name;
  const shorter = endF(c, tl.fps) < endF(x.clip, tl.fps) ? `, ${endF(x.clip, tl.fps) - endF(c, tl.fps)} f shorter to fit the file` : '';
  return { edit: { tl: e.tl, note: `replaced ${was} with ${file.name} on ${x.track.id} ${x.track.name} at ${smpte(x.clip.at, tl.fps)}${shorter}` } };
}
