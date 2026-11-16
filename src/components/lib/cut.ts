// The Scene page's cut lane, the Scenes page's "In the cut" and the cut's poster frames. When the film has a
// timeline of its own (cut/v<n>.json, FilmState.cut.current) they read its clips; otherwise TakeRef.placement,
// what the cut reader derived from the record (spend.md, the FCPXML, the review cards).
import type { CutInfo, SceneRef, TakeRef, TimelineClip } from '@/server/types';

export interface CutSeg {
  take: TakeRef; at: number; frames: number; shots?: string; over: boolean;
  /** The timeline's clip label says "(to confirm)" (also carried on TakePlacement.toConfirm by the server). */
  toConfirm?: boolean;
  /** The timeline clip this stretch comes from (track and id), when read from the timeline. */
  clip?: { track: string; id: string };
}

const speedOf = (c: TimelineClip) => (c.speed && c.speed > 0 ? c.speed : 1);
const norm = (p: string) => p.replace(/^.*?assets\/films\/[^/]+\//, '');

/** The scene's take a timeline clip shows: its takeRef, else the take whose file is the clip's source. */
function takeOf(sc: SceneRef, c: TimelineClip): TakeRef | undefined {
  if (c.takeRef && c.takeRef.scene !== sc.id) return undefined;
  const byId = c.takeRef ? sc.takes.find((t) => t.id === c.takeRef!.take) : undefined;
  if (byId) return byId;
  const src = norm((c.src ?? ''));
  return sc.takes.find((t) => t.path && norm(t.path) === src);
}

/** The cut's clips for this scene that are none of its takes: a test take or a trial the cut uses (13 Nov 2026:
 *  the cut was rebuilt from test takes while the scene's own takes still read "needs a redo"). Main lane only. */
export function outsideCutClips(sc: SceneRef, cut?: CutInfo): TimelineClip[] {
  const tl = cut?.current;
  if (!tl) return [];
  const video = tl.tracks.filter((t) => t.kind === 'video' && !t.muted);
  const lowest = [...video].sort((a, b) => (Number(a.id.slice(1)) || 0) - (Number(b.id.slice(1)) || 0))[0];
  const mine = (c: TimelineClip): boolean => (c.takeRef ? c.takeRef.scene === sc.id : new RegExp(`^${sc.id}\\b`).test(c.label ?? ''));
  return (lowest?.clips ?? []).filter((c) => !c.muted && mine(c) && !takeOf(sc, c));
}

/** The scene's clips on the timeline's video tracks: the lowest video track is the main lane, higher ones are "over". */
function timelineSegments(sc: SceneRef, cut: CutInfo): CutSeg[] {
  const tl = cut.current!;
  const fps = tl.fps;
  const video = tl.tracks.filter((t) => t.kind === 'video' && !t.muted);
  const lowest = [...video].sort((a, b) => (Number(a.id.slice(1)) || 0) - (Number(b.id.slice(1)) || 0))[0]?.id;
  const segs: CutSeg[] = [];
  for (const t of video) for (const c of t.clips) {
    if (c.muted) continue;
    const take = takeOf(sc, c);
    if (!take) continue;
    const at = Math.round(c.at * fps);
    const frames = Math.max(1, Math.round(((c.out - c.in) / speedOf(c)) * fps));
    const confirm = /\(to confirm\)/i.test(c.label ?? '');
    const shot = take.placement?.pieces.find((p) => p.shot)?.shot;
    segs.push({ take, at, frames, over: t.id !== lowest, shots: shot, toConfirm: confirm || undefined, clip: { track: t.id, id: c.id } });
  }
  return segs;
}

function placementSegments(sc: SceneRef): CutSeg[] {
  const segs: CutSeg[] = [];
  for (const t of sc.takes) for (const p of t.placement?.pieces ?? []) segs.push({ take: t, at: p.at, frames: p.frames, shots: p.shot, over: !!p.over, toConfirm: t.placement?.toConfirm || undefined });
  return segs;
}

/** The scene's stretch of the cut, in timeline order; neighbouring pieces of the same take are merged. */
export function cutSegments(sc: SceneRef, cut?: CutInfo): CutSeg[] {
  const segs = cut?.current ? timelineSegments(sc, cut) : placementSegments(sc);
  segs.sort((a, b) => a.at - b.at || Number(a.over) - Number(b.over));
  const out: CutSeg[] = [];
  for (const s of segs) {
    const last = out.filter((x) => x.over === s.over).pop();
    if (last && last.take.id === s.take.id && last.at + last.frames === s.at && last.shots === s.shots) last.frames += s.frames;
    else out.push({ ...s });
  }
  return out;
}

/** The take ids in the cut, in the order they first play: from the timeline when there is one, else SceneRef.inCut. */
export function cutTakeIds(sc: SceneRef, cut?: CutInfo): string[] {
  if (cut?.current) return [...new Set(cutSegments(sc, cut).map((s) => s.take.id))];
  return sc.inCut ? sc.inCut.split(/\s\+\s/).map((x) => x.trim()).filter(Boolean) : [];
}

/** The takes of the scene the cut holds "to confirm": the timeline's labels, or TakePlacement.toConfirm. */
export function cutToConfirm(sc: SceneRef, cut?: CutInfo): Set<string> {
  return new Set([...cutSegments(sc, cut).filter((s) => s.toConfirm).map((s) => s.take.id), ...sc.takes.filter((t) => t.placement?.toConfirm).map((t) => t.id)]);
}

/** The scene's span in the cut (first frame to last), from the main-lane pieces, else every piece. */
export function cutSpan(segs: CutSeg[]): { from: number; to: number } | undefined {
  const main = segs.filter((s) => !s.over);
  const use = main.length ? main : segs;
  if (!use.length) return undefined;
  return { from: Math.min(...use.map((s) => s.at)), to: Math.max(...use.map((s) => s.at + s.frames)) };
}

/** The take a scene's poster comes from: the first take of the cut on the main lane, else the newest take with a file. */
export function posterTake(sc: SceneRef, cut?: CutInfo): TakeRef | undefined {
  const main = cutSegments(sc, cut).find((s) => !s.over && s.take.path);
  return main?.take ?? [...sc.takes].reverse().find((t) => t.path);
}
