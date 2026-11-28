// A take's shot, or a whole take, dragged from the Takes view onto the timeline ("I'd like to
// be able to drag a take into the timeline from the takes view"). Pure: the clips a dragged shot or take becomes, and
// the edit that lays them on the lane they were dropped on. They land the way a file dropped from the Files list does
// (placeFile.ts): at the line, in a free place only (a picture is refused where one already sits; nothing moves), and
// the take's sound comes with its picture as `putShot` and `placeFile` bring it: the same clip on the dialogue track
// when the picture went on the main picture track, else on the effects and music tracks. Each picture clip and its
// sound carry the same `link` id, so they move, trim, split and go together on whatever tracks they landed.
import type { Timeline, TimelineClip } from '@/server/types';
import { smpte } from '@/components/lib/format';
import { endF, mainTrackIds, newLink, sideTrack, startF, toF, type ClipRef, type Edit } from './model';
import { fileFrames, makeTrack, trackForFile } from './placeFile';
import { shotOf, shotsOf, subTag, type TakeShots } from './shots';

const r6 = (s: number) => Math.round(s * 1e6) / 1e6;
const toS = (f: number, fps: number) => Math.round((f / fps) * 1e6) / 1e6;
const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;

/** What is being dragged: one shot of a take (`n`, and `tag` for a shot with a letter, "7b"), or the whole take. */
export interface TakeDrag { t: TakeShots; n?: number; tag?: string }

/** The clips a dragged shot or take becomes, each `at` in frames from where the first one starts (as a frame count in
 *  `at`, turned into seconds when placed), labelled and tagged as `putShot` labels a shot it puts in the film
 *  ("S6 · take 1 · shot 2", `takeRef` its scene and take), so the shot menus know them. A whole take is one clip a shot,
 *  cut at its cuts; a take whose cuts are not read yet is one clip of its whole file ("S6 · take 1"), split at its shots
 *  once they are known, as every clip of a take is (shotTimeline). */
export function takePieces(d: TakeDrag, takeName: string, fps: number): { clips: (TimelineClip & { f: number })[]; frames: number; label: string } | { error: string } {
  const { t } = d;
  const base = `${t.scene} · ${takeName}`;
  const ref = { scene: t.scene, take: takeName };
  // the shots on the cut's frame grid (shots.ts shotEdge): the pieces of a whole take meet exactly
  const shots = shotsOf(t, fps);
  if (d.n !== undefined) {
    const s = shotOf(t, d.n, d.tag, fps);
    if (!s) return { error: `${base} has no shot ${d.tag ?? d.n} now.` };
    const label = `${base} · shot ${subTag(s) ?? s.n}`;
    const clip = { id: 'new', src: t.src, in: r6(s.in), out: r6(s.out), at: 0, label, takeRef: ref, f: 0 };
    return { clips: [clip], frames: Math.max(1, toF(s.out - s.in, fps)), label };
  }
  if (!shots.length) {
    if (!t.seconds) return { error: `The length of ${base} is not known yet, so it cannot be placed. Try again in a moment.` };
    const frames = fileFrames(t.seconds, fps);
    if (frames < 1) return { error: `${base} is shorter than a frame.` };
    return { clips: [{ id: 'new', src: t.src, in: 0, out: r6(frames / fps), at: 0, label: base, takeRef: ref, f: 0 }], frames, label: base };
  }
  const f0 = toF(shots[0].in, fps);
  const clips = shots.map((s) => ({ id: 'new', src: t.src, in: r6(s.in), out: r6(s.out), at: 0, label: `${base} · shot ${subTag(s) ?? s.n}`, takeRef: ref, f: toF(s.in, fps) - f0 }));
  const last = shots[shots.length - 1];
  return { clips, frames: Math.max(1, clips[clips.length - 1].f + toF(last.out - last.in, fps)), label: base };
}

let seq = 0;
/** The dragged shot or take laid on picture track `trackId` from frame `f`, its sound with it, as one edit. Refused
 *  (with why) on a locked track, a track of another kind, or where a picture already sits on any frame it would cover. */
export function placeTake(tl0: Timeline, d: TakeDrag, takeName: string, trackId: string, f: number): { edit?: Edit & { ref: ClipRef; refs: ClipRef[] }; error?: string } {
  const fps = tl0.fps;
  const p = takePieces(d, takeName, fps);
  if ('error' in p) return { error: p.error };
  const tl = clone(tl0);
  const v = tl.tracks.find((x) => x.id === trackId);
  if (!v) return { error: 'That track is not in this cut.' };
  if (v.kind !== 'video') return { error: `${v.id} ${v.name} is not a picture track: a take goes on a picture track.` };
  if (v.locked) return { error: `${v.id} ${v.name} is locked.` };
  const at = Math.max(0, Math.round(f));
  const placed = p.clips.map(({ f: k, ...c }) => ({ ...c, at: toS(at + k, fps) }));
  const from = at, to = Math.max(...placed.map((c) => endF(c, fps)));
  const free = (clips: TimelineClip[]) => !clips.some((k) => startF(k, fps) < to && endF(k, fps) > from);
  if (!free(v.clips)) return { error: `No room on ${v.id} ${v.name} there: a clip already sits at that point. Drop it on a free place, or on another picture track.` };
  // the take's sound: the dialogue track when the picture is on the main picture track, else an effects or music track;
  // a sound already there sends it to the track beside (as a pasted sound goes)
  const main = mainTrackIds(tl);
  const mainA = tl.tracks.find((x) => x.kind === 'audio' && main.has(x.id));
  let a = trackForFile(tl, 'audio', main.has(v.id) ? [mainA?.id] : [], from, to) ?? makeTrack(tl, 'audio');
  let beside = '';
  if (!free(a.clips)) {
    const side = sideTrack(tl, a, from, to);
    if (!side) return { error: `No room for its sound on ${a.id} ${a.name} or the tracks beside it there.` };
    beside = `, beside ${a.name} where a sound already is`;
    a = side;
  }
  const stamp = `d${Date.now().toString(36)}${(seq++).toString(36)}`;
  const refs: ClipRef[] = [];
  placed.forEach((c, i) => {
    const id = `${stamp}${placed.length > 1 ? `-${i + 1}` : ''}`;
    const link = newLink();
    v.clips.push({ ...c, id, link });
    a.clips.push({ ...c, id: `${id}a`, link });
    refs.push({ trackId: v.id, clipId: id });
  });
  for (const t of [v, a]) t.clips.sort((x, y) => startF(x, fps) - startF(y, fps));
  const shots = placed.length > 1 ? ` (${placed.length} shots)` : '';
  const note = `${p.label}${shots} placed at ${smpte(at / fps, fps)} on ${v.id}, its sound on ${a.id}${beside}`;
  return { edit: { tl, note, ref: refs[0], refs } };
}
