// A scene's layouts (5 Previz and storyboards step 13, 7 Takes step 18, 9 Edit
// step 1). Pure: the server (src/server/edit/layouts.ts), the sample films, the Edit page and scripts/layouts-test.ts use it.
//
// A scene's layout is how it is laid out in time: its shots, their order and lengths, and where each spoken line falls.
// It is one previz take and the storyboard version rendered from it. When the scene's shots or times change after a
// take of it was generated, the change makes the scene's next layout and the earlier one is kept. Here:
//   - which layouts a scene has (`sceneLayouts`): the previz takes its videos were made from, and the one its shown
//     storyboard was made from; two previz takes laid out the same are one layout;
//   - which layout the cut uses for a scene (`layoutInCut`);
//   - the safe swaps (`safeSwaps`): the shots that are the same in two layouts, the same framing and the same line;
//   - the warnings of a swap (`swapCheck`): a line that no longer matches the picture, a shot that no longer fits its
//     place. A swap is never refused for them (the user's choice, 19 Nov: "Way 2 with safe swaps marked");
//   - the step that puts a layout in the film (`chooseLayout`).
import type { Timeline, TimelineClip } from '@/server/types';
import { buildScene, type Pace, type PlanScene, type PrevizLine, type TakeIn } from './planned';

/** One shot of a previz take as its json says it: its id, its start and end in the scene, and its framing where the
 *  json gives it (the camera's place in metres, where it faces, the lens), else its name and its board line. */
export interface LayoutShotIn {
  id: string; t0: number; t1: number;
  name?: string; board?: string;
  cam?: [number, number, number]; yaw?: number; pitch?: number; lens?: number;
}
/** One previz take of a scene: its number, its shots, its spoken parts and when it was written (ms). */
export interface PrevizIn { n: number; shots: LayoutShotIn[]; lines: PrevizLine[]; written: number }
/** One storyboard version of a scene: the previz take it was made from (where something records it), and the first
 *  panel of each shot (a picture, relative to the film repo). `shown`: the version the timeline's boards come from. */
export interface BoardsIn { version: string; take?: number; shots: { shot: string; src: string }[]; shown?: boolean }
/** A take of a scene and the layout it was made from: the previz take its record of what was sent names (`record`), else
 *  the newest previz take written before the take was made (`time`; the take's record is missing). */
export interface TakeLayoutIn { src: string; name: string; previzTake?: number; storyboard?: string; made?: number; seconds?: number; landed: boolean }

export interface LayoutShot {
  /** Its place in the layout, 1, 2, 3 … (the column and the shot number the timeline uses). */
  n: number; id: string; t0: number; t1: number; name?: string;
  /** The words spoken in it, as compared (lower case, no punctuation); '' when nobody speaks. */
  line: string;
  /** The same words as written, for the warnings. */
  lineText: string;
  /** The shot's framing as a key, '' when the previz take does not say. */
  framing: string;
  /** Its board (the first panel of the layout's storyboard for the shot), when there is one. */
  board?: string;
}
export interface Layout {
  /** "Layout 1", "Layout 2" …: the number, oldest first. */
  n: number;
  /** The previz take it is: the newest that a video or the shown storyboard came from, when several were laid out the same. */
  key: number;
  /** Every previz take of the scene that is this layout. */
  previz: number[];
  /** The storyboard version made from it, where there is one. */
  storyboard?: string;
  shots: LayoutShot[];
  lines: PrevizLine[];
  /** The takes made from it (their files), and how each is known to be: recorded at submission, or by its date. */
  takes: { src: string; name: string; how: 'record' | 'time'; landed: boolean; seconds?: number }[];
  /** The layout the shown storyboard was made from: the scene's newest. */
  current: boolean;
}

const r6 = (s: number) => Math.round(s * 1e6) / 1e6;
const norm = (s: string) => s.toLowerCase().replace(/[’‘`´]/g, '\'').replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/\s+/g, ' ').trim();

/** The framing of a shot as a key: the camera's place to 5 cm, where it faces to a degree and the lens to a mm, when the
 *  previz take gives them; else its board line, else its name; '' when it says nothing. */
export function framingKey(s: Pick<LayoutShotIn, 'cam' | 'yaw' | 'pitch' | 'lens' | 'board' | 'name'>): string {
  if (s.cam && s.cam.length === 3 && s.cam.every((x) => typeof x === 'number')) {
    const q = (x: number, step: number) => Math.round(x / step);
    return `cam:${s.cam.map((x) => q(x, 0.05)).join(',')}:${q(s.yaw ?? 0, 1)}:${q(s.pitch ?? 0, 1)}:${s.lens !== undefined ? q(s.lens, 1) : ''}`;
  }
  if (s.board) return `board:${norm(s.board)}`;
  if (s.name) return `name:${norm(s.name.replace(/^\s*\d+[A-Za-z]?\s+/, ''))}`;
  return '';
}

/** The spoken parts that fall in a shot: those whose middle is inside it. */
function partsIn(lines: PrevizLine[], t0: number, t1: number): PrevizLine[] {
  return lines.filter((l) => { const m = (l.t[0] + l.t[1]) / 2; return m >= t0 && m < t1; });
}

/** The shots of a previz take as a layout has them. */
export function layoutShots(p: PrevizIn, boards?: BoardsIn): LayoutShot[] {
  return [...p.shots].sort((a, b) => a.t0 - b.t0).map((s, i) => {
    const said = partsIn(p.lines, s.t0, s.t1);
    const board = boards?.shots.find((b) => b.shot === s.id)?.src;
    return { n: i + 1, id: s.id, t0: s.t0, t1: s.t1, ...(s.name ? { name: s.name } : {}), line: norm(said.map((l) => l.text).join(' ')),
      lineText: said.map((l) => `${l.who}: ${l.text}`).join(' '), framing: framingKey(s), ...(board ? { board } : {}) };
  });
}

/** Two previz takes are the same layout: as many shots, each starting and ending within a frame of the other's, the
 *  same framing, and the same spoken parts, each within a frame. */
export function sameLayout(a: PrevizIn, b: PrevizIn, fps = 24): boolean {
  const f = 1 / fps + 1e-6;
  const sa = layoutShots(a), sb = layoutShots(b);
  if (sa.length !== sb.length || a.lines.length !== b.lines.length) return false;
  if (!sa.every((x, i) => Math.abs(x.t0 - sb[i].t0) <= f && Math.abs(x.t1 - sb[i].t1) <= f && x.framing === sb[i].framing)) return false;
  return a.lines.every((l, i) => norm(l.text) === norm(b.lines[i].text) && Math.abs(l.t[0] - b.lines[i].t[0]) <= f && Math.abs(l.t[1] - b.lines[i].t[1]) <= f);
}

/** The layouts of one scene, oldest first. A layout is a previz take a video was made from, or the one the shown
 *  storyboard was made from; previz takes in between that no video and no shown storyboard came from are not layouts
 *  (they are the work towards the next one), and two previz takes laid out the same are one layout. A take whose record
 *  does not say is given the newest previz take written before it was made. Empty when the scene has no previz take. */
export function sceneLayouts(previz: PrevizIn[], boards: BoardsIn[], takes: TakeLayoutIn[], fps = 24): Layout[] {
  if (!previz.length) return [];
  const byN = new Map(previz.map((p) => [p.n, p]));
  const asc = [...previz].sort((a, b) => a.n - b.n);
  const fromTime = (made?: number) => {
    const before = made === undefined ? [] : asc.filter((p) => p.written <= made);
    return (before.length ? before[before.length - 1] : asc[0]).n;
  };
  const placed = takes.map((t) => (t.previzTake !== undefined && byN.has(t.previzTake)
    ? { t, p: t.previzTake, how: 'record' as const }
    : { t, p: fromTime(t.made), how: 'time' as const }));
  const shown = boards.find((b) => b.shown);
  const keys = new Set(placed.map((x) => x.p));
  if (shown?.take !== undefined && byN.has(shown.take)) keys.add(shown.take);
  if (!keys.size) keys.add(asc[asc.length - 1].n);
  // previz takes laid out the same, one after another, are one layout
  const groups: number[][] = [];
  for (const n of [...keys].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last && sameLayout(byN.get(last[last.length - 1])!, byN.get(n)!, fps)) last.push(n); else groups.push([n]);
  }
  // a previz take no video and no shown storyboard came from, laid out as a layout is, is that layout too (a re-render)
  for (const p of asc) {
    if (groups.some((g) => g.includes(p.n))) continue;
    const g = groups.find((x) => sameLayout(byN.get(x[x.length - 1])!, p, fps));
    if (g) g.push(p.n);
  }
  for (const g of groups) g.sort((a, b) => a - b);
  return groups.map((g, i) => {
    const key = Math.max(...g.filter((n) => keys.has(n)));
    const p = byN.get(key)!;
    // its storyboard: the shown one when it is made from it, else the newest version made from it, else one a take names
    const made = boards.filter((b) => b.take !== undefined && g.includes(b.take));
    const named = placed.filter((x) => g.includes(x.p) && x.t.storyboard).map((x) => x.t.storyboard!);
    const sb = made.find((b) => b.shown) ?? made.sort((a, b) => Number(b.version.slice(1)) - Number(a.version.slice(1)))[0]
      ?? boards.find((b) => named.includes(b.version));
    const mine = placed.filter((x) => g.includes(x.p));
    return {
      n: i + 1, key, previz: g, ...(sb ? { storyboard: sb.version } : named[0] ? { storyboard: named[0] } : {}),
      shots: layoutShots(p, sb), lines: p.lines,
      takes: mine.map((x) => ({ src: x.t.src, name: x.t.name, how: x.how, landed: x.t.landed, ...(x.t.seconds !== undefined ? { seconds: x.t.seconds } : {}) })),
      current: !!shown && shown.take !== undefined && g.includes(shown.take),
    };
  });
}

/** The layout a take was made from. */
export const layoutOfTake = (layouts: Layout[], src: string): Layout | undefined => layouts.find((l) => l.takes.some((t) => t.src === src));
/** The layout a previz take belongs to. */
export const layoutOfPreviz = (layouts: Layout[], n: number): Layout | undefined => layouts.find((l) => l.previz.includes(n));

// ---- which shot is which

/** The layout's shot a take's shot is: by its place in the take when the take has as many shots as the layout, else
 *  the layout's shot its middle falls in (a take runs a little late, but its shots fall near the previz take's). */
export function layoutShotOfTake(l: Layout, takeShots: { i: number; in: number; out: number }[], i: number): LayoutShot | undefined {
  if (takeShots.length === l.shots.length) return l.shots[i - 1];
  const s = takeShots.find((x) => x.i === i);
  if (!s) return undefined;
  const m = (s.in + s.out) / 2;
  return l.shots.find((x) => m >= x.t0 && m < x.t1) ?? (m >= (l.shots[l.shots.length - 1]?.t1 ?? 0) ? l.shots[l.shots.length - 1] : undefined);
}

/** The shot of `to` that is the same as `s`: the same framing and the same line. The nearest by place when several are.
 *  A shot whose framing the previz take does not give is never safe. */
export function sameShotIn(s: LayoutShot, to: Layout): LayoutShot | undefined {
  if (!s.framing) return undefined;
  const same = to.shots.filter((x) => x.framing === s.framing && x.line === s.line);
  return same.sort((a, b) => Math.abs(a.n - s.n) - Math.abs(b.n - s.n))[0];
}

/** The safe swaps between two layouts: for each shot of `from` (its place), the shot of `to` that is the same. */
export function safeSwaps(from: Layout, to: Layout): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of from.shots) { const t = sameShotIn(s, to); if (t) out.set(s.n, t.n); }
  return out;
}

/** How far a shot's length may differ from its place's before it is said not to fit (seconds). */
export const FIT_SLACK = 0.25;
const s1 = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1)} s`;
const quote = (x: string) => (x ? `“${x}”` : 'no line');
/** A shot's name without the number the previz gives it in front ("2 Maren looks" → "Maren looks"). */
const bare = (x: string) => x.replace(/^\s*\d+[A-Za-z]?\s+/, '');

export interface SwapCheck {
  /** The shot is the same in both layouts: the same framing and the same line. */
  safe: boolean;
  /** What does not match, each in a plain sentence; empty when nothing. Never a reason to refuse. */
  warnings: string[];
  /** The same in a few words each, for a step's note: "the line differs", "framed for another place", "2.6 s longer". */
  short: string[];
}
/** What putting shot `s` (of a take of layout `from`, `secs` long on the timeline) in place `slot` of layout `to` means:
 *  safe or not, and the warnings. */
export function swapCheck(s: LayoutShot | undefined, slot: LayoutShot | undefined, secs: number, to: Layout, from?: Layout): SwapCheck {
  if (!slot) return { safe: false, warnings: [`${to ? `Layout ${to.n}` : 'The layout'} has no shot there.`], short: ['no such place'] };
  const warnings: string[] = [], short: string[] = [];
  const where = `shot ${slot.n}${from && from.n !== to.n ? ` of Layout ${to.n}` : ''}`;
  if (!s) { warnings.push(`It is not known which shot of ${from ? `Layout ${from.n}` : 'its layout'} this is, so its line and framing cannot be compared with ${where}.`); short.push('which shot is not known'); }
  else {
    if (s.line !== slot.line) { warnings.push(`The line no longer matches the picture: this shot has ${quote(s.lineText)}, ${where} has ${quote(slot.lineText)}.`); short.push('the line differs'); }
    if (!s.framing || !slot.framing) { warnings.push(`The framing cannot be compared: the previz does not say where the camera is.`); short.push('framing not known'); }
    else if (s.framing !== slot.framing) { warnings.push(`It was framed for another place: ${s.name ? `“${bare(s.name)}”` : `shot ${s.n}`} in place of ${slot.name ? `“${bare(slot.name)}”` : where}.`); short.push('framed for another place'); }
  }
  const d = secs - (slot.t1 - slot.t0);
  if (Math.abs(d) > FIT_SLACK) { warnings.push(`It is ${s1(Math.abs(d))} ${d > 0 ? 'longer' : 'shorter'} than ${where}: what follows moves ${d > 0 ? 'later' : 'earlier'} by as much.`); short.push(`${s1(Math.abs(d))} ${d > 0 ? 'longer' : 'shorter'}`); }
  const safe = !!s && !!s.framing && s.framing === slot.framing && s.line === slot.line;
  return { safe, warnings, short };
}

// ---- the layout in the cut

const mainsOf = (tl: Pick<Timeline, 'tracks'>) => ({
  v: tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'),
  a: tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio'),
});
const sceneOfClip = (c: TimelineClip) => c.scene ?? c.takeRef?.scene;

/** The layout the cut uses for a scene: the one a clip of it was put in by (`layout`, the previz take of the layout
 *  chosen or swapped into), else the storyboard version of its boards, else the previz take its lines are timed at, else
 *  the layout of the take with most of the scene's picture. Undefined when nothing says. */
export function layoutInCut(tl: Pick<Timeline, 'tracks'>, scene: string, layouts: Layout[]): Layout | undefined {
  if (!layouts.length) return undefined;
  const { v, a } = mainsOf(tl);
  const pic = (v?.clips ?? []).filter((c) => sceneOfClip(c) === scene);
  const put = pic.find((c) => typeof c.layout === 'number');
  if (put) { const l = layoutOfPreviz(layouts, put.layout!); if (l) return l; }
  for (const c of pic) {
    if (c.plan !== 'board' || !c.src) continue;
    const v2 = /\/storyboard\/(v\d+)\//.exec(c.src)?.[1];
    const l = v2 ? layouts.find((x) => x.storyboard === v2) : undefined;
    if (l) return l;
  }
  for (const c of (a?.clips ?? []).filter((x) => x.plan === 'line' && x.scene === scene)) {
    const k = Number(/previz take (\d+)/.exec(c.timing ?? '')?.[1]);
    const l = Number.isInteger(k) ? layoutOfPreviz(layouts, k) : undefined;
    if (l) return l;
  }
  const secs = new Map<Layout, number>();
  for (const c of pic) {
    const l = c.src ? layoutOfTake(layouts, c.src) : undefined;
    if (l) secs.set(l, (secs.get(l) ?? 0) + (c.out - c.in));
  }
  return [...secs.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
}

// ---- choosing a layout: one step

/** What a layout puts in its scene's place: its first take that landed (the whole take, as it took its boards' place
 *  when it landed; a later take goes in only by the user's word), else its boards and its lines at its own times. */
export function layoutContent(l: Layout): { take: Layout['takes'][number] } | { boards: true } {
  const landed = l.takes.filter((t) => t.landed);
  return landed.length ? { take: landed[0] } : { boards: true };
}

const lenOf = (c: TimelineClip) => (c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);

/** Layout `l` in its scene's place on the cut, as ONE edit: every picture and dialogue clip of the scene goes (its take,
 *  its boards and lines, shots swapped in from other layouts), and the layout's take (`take`, the whole take and its
 *  sound) or its boards and lines (`scene`, the PlanScene built for the layout) go in; what follows moves by the
 *  difference in length, on every track, markers too. Every clip put in carries `layout` (the layout's previz take), so
 *  the cut says which layout the scene uses and "Update the timeline" never changes it. A string when it cannot be done. */
export function chooseLayout(tl0: Timeline, scene: string, l: Layout, put: { take: TakeIn } | { scene: PlanScene; pace: Pace }, was?: Layout): { tl: Timeline; words: string } | string {
  const tl = JSON.parse(JSON.stringify(tl0)) as Timeline;
  const { v, a } = mainsOf(tl);
  if (!v || !a) return 'The cut has no picture or dialogue track.';
  if (v.locked || a.locked) return `${v.locked ? v.id : a.id} is locked: unlock it to change ${scene}.`;
  const mine = [...v.clips, ...a.clips].filter((c) => sceneOfClip(c) === scene);
  if (!mine.length) return `${scene} is not in the film: bring it back from the Takes view first.`;
  const from = Math.min(...mine.map((c) => c.at)), to = Math.max(...mine.map((c) => c.at + lenOf(c)));
  const fps = tl.fps;
  let pic: TimelineClip[] = [], snd: TimelineClip[] = [], len: number, what: string;
  if ('take' in put) {
    const secs = r6(Math.round(put.take.seconds * fps) / fps);
    const used = new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    let id = `${scene.toLowerCase()}-l${l.key}`;
    for (let k = 2; used.has(id) || used.has(`${id}a`); k++) id = `${scene.toLowerCase()}-l${l.key}-${k}`;
    const c: TimelineClip = { id, src: put.take.src, in: 0, out: secs, at: from, label: `${scene} · ${put.take.name}`, takeRef: { scene, take: put.take.name }, layout: l.key };
    pic = [c];
    if (put.take.sound !== false) snd = [{ ...c, id: `${id}a` }];
    len = secs;
    what = put.take.name;
  } else {
    const b = buildScene(put.scene, put.pace, fps);
    if (!b.picture.length && !b.lines.length) return `Layout ${l.n} of ${scene} has nothing to put in its place.`;
    pic = b.picture.map((c) => ({ ...c, at: r6(from + c.at), layout: l.key }));
    snd = b.lines.map((c) => ({ ...c, at: r6(from + c.at), layout: l.key }));
    len = b.length;
    what = `${b.kind === 'boards' ? 'its boards' : b.kind === 'shots' ? 'its planned shots' : b.kind === 'none' ? 'its lines' : 'its boards and planned shots'}${b.lines.length ? ' and lines' : ''}`;
  }
  const gone = new Set(mine);
  v.clips = v.clips.filter((c) => !gone.has(c));
  a.clips = a.clips.filter((c) => !gone.has(c));
  const d = r6(len - (to - from));
  if (Math.abs(d) > 1e-6) {
    for (const t of tl.tracks) for (const c of t.clips) if (c.at >= to - 1e-6) c.at = r6(Math.max(0, c.at + d));
    for (const m of tl.markers ?? []) if (m.at >= to - 1e-6) m.at = r6(Math.max(0, m.at + d));
  }
  v.clips = [...v.clips, ...pic].sort((x, y) => x.at - y.at);
  a.clips = [...a.clips, ...snd].sort((x, y) => x.at - y.at);
  const src = `previz take ${l.key}${l.storyboard ? `, boards ${l.storyboard}` : ''}`;
  return { tl, words: `${scene}: Layout ${l.n} in the film (${src}), ${what}${was && was.n !== l.n ? `, in place of Layout ${was.n}` : ''}` };
}

/** "Layout 2 · previz take 9 · boards v6 · 1 take": a layout in a few words. */
export function layoutWords(l: Layout): string {
  const landed = l.takes.filter((t) => t.landed).length;
  return [`previz take ${l.key}`, ...(l.storyboard ? [`boards ${l.storyboard}`] : []), landed ? `${landed} ${landed === 1 ? 'take' : 'takes'}` : 'no take yet'].join(' · ');
}
