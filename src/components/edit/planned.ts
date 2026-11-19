// The timeline from day one (15 Nov 2026, ASKS 47; ARCHITECTURE.md "The timeline from day one"). Pure: the server
// (src/server/edit/plan.ts), the Edit page and scripts/planned-test.ts use it.
//
// From the day the script is locked the film has a cut, and until its takes are in that cut holds planned clips the app
// builds from the film's files (never Alma, never by hand): every spoken line and action on the Dialogue track at
// reading pace, every planned shot on the picture track at its planned seconds, and, once the previz is made, each
// shot's board in its place. A scene's take later takes its boards' place (`takeForBoards`), and "Put the boards back"
// is the reverse (`boardsBack`). `bringUp` brings a cut up to date with the files as ONE step: it keeps every take in
// place and every planned clip changed by hand, and fills or refreshes only what the files changed.
import type { PlanKind, Timeline, TimelineClip, TimelineMarker, TimelineTrack } from '@/server/types';

/** Reading pace when the script names none: words a second, and the pause between two spoken lines (seconds). The
 *  films' scripts say "about 2.9 words a second, 0.5 s word to word between lines" (The Lighthouse). */
export const READING_PACE = { wps: 2.9, gap: 0.5 } as const;
export type Pace = { wps: number; gap: number };

/** A spoken line (`who`) or an action as written (`secs`, its seconds). */
export interface PlanItem { who?: string; text: string; secs?: number }
/** One planned shot: its number in the scene, its id in the shot file ("5A"), its time in the scene, what it shows
 *  and, once the previz is made, its board (a still, relative to the film repo). */
export interface PlanShot { n: number; id: string; t0: number; t1: number; text?: string; inFrame?: string; board?: string; panels?: PlanPanel[] }
/** One storyboard panel of a shot: its number in the storyboard, its time in the scene (as in
 *  its file name, `NN-shot<k>-<t>.png`, and the version's panels.json) and its picture, relative to the film repo. */
export interface PlanPanel { n: number; t: number; src: string }
/** Which storyboard version a scene's boards come from, and why, in words. */
export interface PlanBoards {
  version: string; why: string; panels: number; newer?: string;
  /** The previz take the version was made from, which the scene's lines and shot times follow, the
   *  scene's newest take, and how the take is known: recorded by a check or a card, or the nearest in time. */
  take?: number; newestTake?: number; takeHow?: 'check' | 'card' | 'nearest';
  /** When the lines follow an older take than the newest, in words: "Lines at take 4, the take of boards v4; take 9 is newer." */
  lines?: string;
}
/** A spoken part of the newest previz take (`previz/<S>/<S>-previz-take-<n>.json` `lines`): who, the words, and its
 *  start and end in seconds from the scene's start. A long line is split there into its parts, one per shot. */
export interface PrevizLine { who: string; text: string; t: [number, number] }
export interface PlanPreviz { take: number; lines: PrevizLine[] }
export interface PlanScene {
  id: string; title: string;
  /** The script's own length for the scene ("≈ s"), used until the shot list gives one. */
  seconds?: number;
  items: PlanItem[];
  /** The shot list (empty or absent until it is written). */
  shots?: PlanShot[];
  /** The newest previz take's lines, once the scene has one. */
  previz?: PlanPreviz;
  /** The storyboard version its boards come from. */
  boards?: PlanBoards;
}
/** What the app reads to build the planned parts: the locked script, the shot lists and the boards. */
export interface PlanSource {
  /** The locked version of the script ("v2") and when; absent while the script is not locked (nothing is built). */
  locked?: { version: string; date?: string };
  pace: Pace;
  scenes: PlanScene[];
}

const r6 = (s: number) => Math.round(s * 1e6) / 1e6;
const snap = (s: number, fps: number) => r6(Math.round(s * fps) / fps);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A short, stable hash (FNV-1a, 32 bits, hex): pure, the same in the browser and on the server. */
export function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A spoken planned line, counted once however many parts the previz take splits it into. */
export const isFirstPart = (c: TimelineClip): boolean => c.plan === 'line' && !!c.who && (c.part ?? 1) === 1;
export const isPlanned = (c: Pick<TimelineClip, 'plan'>): boolean => !!c.plan;
export const hasPlanned = (tl: Pick<Timeline, 'tracks'> | undefined): boolean => !!tl?.tracks.some((t) => t.clips.some(isPlanned));
/** The scene a clip of the picture or the dialogue belongs to: a planned clip's own, else its take's. */
export const sceneOfClip = (c: TimelineClip): string | undefined => c.scene ?? c.takeRef?.scene;
/** Why a cut that still holds planned clips cannot be rendered, in a few words (the page and the render's refusal). */
export const PLANNED_RENDER_WHY = 'It renders once every scene’s take is in.';

/** The cut's main picture and dialogue tracks (V1 and A1, else the first of their kind), as shots.ts mainTracks. */
function mains(tl: Pick<Timeline, 'tracks'>): { v?: TimelineTrack; a?: TimelineTrack } {
  return {
    v: tl.tracks.find((t) => t.id === 'V1') ?? tl.tracks.find((t) => t.kind === 'video'),
    a: tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio'),
  };
}
const lenOf = (c: TimelineClip) => (c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);
const endOf = (c: TimelineClip) => c.at + lenOf(c);

// ---- one scene, built

export interface SceneBuild {
  id: string;
  /** The scene's length in seconds, on whole frames. */
  length: number;
  /** The clips with `at` from the scene's start. */
  lines: TimelineClip[];
  picture: TimelineClip[];
  /** What the scene is built from: a planned clip carries it as the first half of its `made`. */
  hash: string;
  /** What its picture is: planned shots, boards (every shot has one), some of each, or nothing yet. */
  kind: 'none' | 'shots' | 'boards' | 'some boards';
  /** Where its lines' times come from: the previz take, or reading pace (with `why` when a take exists but its lines
   *  and the script's do not match up). */
  timing: { by: 'previz' | 'reading'; take?: number; why?: string };
}

// ---- the lines of a scene at its previz take's times

/** Words as compared: lower case, one kind of apostrophe, no punctuation. */
const norm = (s: string) => s.toLowerCase().replace(/[’‘`´]/g, '\'').replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/\s+/g, ' ').trim();
/** A speaker as compared: "OLD_THANE" and "Old thane" are one. */
const whoKey = (s: string) => s.toUpperCase().replace(/[_\s]+/g, ' ').trim();
interface Run<T> { who: string; xs: T[] }
function runsOf<T extends { who: string }>(xs: T[]): Run<T>[] {
  const out: Run<T>[] = [];
  for (const x of xs) {
    const k = whoKey(x.who), last = out[out.length - 1];
    if (last && last.who === k) last.xs.push(x); else out.push({ who: k, xs: [x] });
  }
  return out;
}
/** The take's parts of each script line of one speaker's run, by their words: each line takes the parts that, one
 *  after another, say its words. Undefined when the words do not agree. */
function pairByWords(lines: PlanItem[], parts: PrevizLine[]): number[][] | undefined {
  const out: number[][] = [];
  let j = 0;
  for (const l of lines) {
    const want = norm(l.text);
    let got = '';
    const idx: number[] = [];
    while (j < parts.length && got !== want) {
      const next = got ? `${got} ${norm(parts[j].text)}` : norm(parts[j].text);
      if (next !== want && !want.startsWith(`${next} `)) break;
      got = next; idx.push(j); j++;
    }
    if (got !== want || !idx.length) return undefined;
    out.push(idx);
  }
  return j === parts.length ? out : undefined;
}
/** A changed line's words over the take's parts of it: a part whose words are still at the line's start or end keeps
 *  them; the parts between share the rest by their old number of words. */
export function splitWords(text: string, old: string[]): string[] {
  if (old.length === 1) return [text];
  const nw = text.split(/\s+/).filter(Boolean), nk = nw.map(norm);
  const ow = old.map((o) => o.split(/\s+/).filter(Boolean).map(norm).filter(Boolean));
  const out: string[] = old.map(() => '');
  let i = 0, p = 0, j = old.length - 1, q = nw.length;
  const fits = (k: string[], at: number) => k.length > 0 && at >= 0 && at + k.length <= nw.length && k.every((w, x) => w === nk[at + x]);
  while (i < old.length && fits(ow[i], p) && p + ow[i].length <= q) { out[i] = nw.slice(p, p + ow[i].length).join(' '); p += ow[i].length; i++; }
  while (j >= i && fits(ow[j], q - ow[j].length) && q - ow[j].length >= p) { out[j] = nw.slice(q - ow[j].length, q).join(' '); q -= ow[j].length; j--; }
  const tot = ow.slice(i, j + 1).reduce((k, w) => k + Math.max(1, w.length), 0) || 1;
  let acc = 0, start = p;
  for (let x = i; x <= j; x++) {
    acc += Math.max(1, ow[x].length);
    const stop = x === j ? q : p + Math.round(((q - p) * acc) / tot);
    out[x] = nw.slice(start, stop).join(' ');
    start = stop;
  }
  return out;
}
export interface TimedPart { who: string; text: string; t0: number; t1: number; part: number; parts: number }
/** The script's spoken lines of a scene matched to its previz take's parts. By speaker and order: the script's lines
 *  and the take's parts fall into runs of one speaker, which must follow the same order; inside a run, by the words
 *  when they still agree (the take's own words), else one part for one line, or every part of the run for its one
 *  line (the script's words, shared over the parts). Anything else does not match up: the reason, in words. */
export function previzParts(items: PlanItem[], pv: PlanPreviz): { parts: TimedPart[] } | { why: string } {
  const lines = items.filter((x): x is PlanItem & { who: string } => !!x.who);
  const takeParts = [...pv.lines].filter((x) => x && typeof x.who === 'string' && Array.isArray(x.t)).sort((a, b) => a.t[0] - b.t[0]);
  const take = `previz take ${pv.take}`;
  const lr = runsOf(lines), tr = runsOf(takeParts);
  const names = (rs: Run<unknown>[]) => rs.map((r) => r.who).join(', ') || 'no one';
  if (lr.length !== tr.length || lr.some((r, i) => r.who !== tr[i].who)) {
    return { why: `the speakers do not follow the same order (the script: ${names(lr)}; ${take}: ${names(tr)})` };
  }
  const out: TimedPart[] = [];
  for (let r = 0; r < lr.length; r++) {
    const L = lr[r].xs, P = tr[r].xs;
    const words = pairByWords(L, P);
    const pairs = words ?? (L.length === P.length ? L.map((_, i) => [i]) : L.length === 1 ? [P.map((_, i) => i)] : undefined);
    if (!pairs) return { why: `${L.length} lines of ${lr[r].who} in the script and ${P.length} parts in ${take} (from ${P[0].t[0]} s) do not pair up by their words` };
    L.forEach((l, li) => {
      const ps = pairs[li].map((k) => P[k]);
      const same = norm(l.text) === norm(ps.map((x) => x.text).join(' '));
      const texts = same ? ps.map((x) => x.text) : splitWords(l.text, ps.map((x) => x.text));
      const kept = ps.map((x, k) => ({ x, text: texts[k] })).filter((y) => y.text.trim());
      kept.forEach((y, k) => out.push({ who: l.who, text: y.text, t0: y.x.t[0], t1: y.x.t[1], part: k + 1, parts: kept.length }));
    });
  }
  return { parts: out };
}

/** The clip's own part of `made`: what it is and where it sits in its scene. */
function clipHash(c: TimelineClip, rel: number): string {
  const base = [c.plan, c.text ?? '', c.who ?? '', c.inFrame ?? '', c.src ?? '', r6(c.out - c.in), r6(rel), c.speed ?? 1, !!c.muted];
  // a panel  counts only where a clip is one, so a board built before panels hashes as it did
  return hash8(JSON.stringify(c.panel ? [...base, c.panel.k, c.panel.of, c.panel.n] : base));
}
/** A planned clip was changed by hand (trimmed, moved, retyped, muted) since the app built it. */
export function changedByHand(c: TimelineClip, sceneStart: number): boolean {
  if (!c.plan || !c.made) return false;
  return c.made.split('.')[1] !== clipHash(c, c.at - sceneStart);
}

/** The planned clips of a scene. Once the scene has a previz take, its lines at that take's own times, split into the
 *  take's parts, and no actions on the Dialogue track (the shots carry the scene's length); when the script's lines
 *  and the take's do not match up, and before there is a take, lines at reading pace (an action for its own seconds),
 *  then scaled to the scene's length: the shot list's once it exists, else the script's own. Shots at their planned
 *  seconds; a shot with a board is the board. */
export function buildScene(s: PlanScene, pace: Pace, fps: number): SceneBuild {
  const shots = [...(s.shots ?? [])].filter((x) => x.t1 > x.t0).sort((a, b) => a.t0 - b.t0);
  const pv = s.previz ? previzParts(s.items, s.previz) : undefined;
  if (pv && 'parts' in pv) return timedScene(s, shots, pv.parts, s.previz!.take, fps);
  const timing: SceneBuild['timing'] = pv && 'why' in pv ? { by: 'reading', take: s.previz!.take, why: `the script's lines do not match previz take ${s.previz!.take}: ${pv.why}` } : { by: 'reading' };
  const raw: { d: number; it?: PlanItem }[] = [];
  let prevLine = false;
  for (const it of s.items) {
    if (!it.who) { raw.push({ d: Math.max(0.5, it.secs ?? 2), it }); prevLine = false; continue; }
    if (prevLine) raw.push({ d: pace.gap });
    raw.push({ d: Math.max(0.6, words(it.text) / pace.wps), it });
    prevLine = true;
  }
  const rawTotal = raw.reduce((k, x) => k + x.d, 0);
  const fromShots = shots.length ? shots[shots.length - 1].t1 : 0;
  const length = snap(fromShots || s.seconds || rawTotal || 1, fps);
  const k = rawTotal > 0 ? length / rawTotal : 1;
  const lines: TimelineClip[] = [];
  let t = 0;
  for (const x of raw) {
    const a = snap(t * k, fps), b = snap((t + x.d) * k, fps);
    t += x.d;
    if (!x.it || b - a < 1 / fps) continue;
    lines.push({ id: `${s.id}-l${lines.length + 1}`, plan: 'line', scene: s.id, ...(x.it.who ? { who: x.it.who } : {}), text: x.it.text, in: 0, out: r6(b - a), at: a,
      label: x.it.who ? `${s.id} · ${x.it.who}` : `${s.id} · action`, ...(timing.why ? { timing: `at reading pace: ${timing.why}` } : {}) });
  }
  return finish(s, length, lines, picturesOf(s, shots, fps), timing);
}

/** A scene whose lines sit at its previz take's times: each part on whole frames inside the scene, nothing else on
 *  the Dialogue track. */
function timedScene(s: PlanScene, shots: PlanShot[], parts: TimedPart[], take: number, fps: number): SceneBuild {
  const fromShots = shots.length ? shots[shots.length - 1].t1 : 0;
  const length = snap(fromShots || s.seconds || Math.max(1, ...parts.map((x) => x.t1)), fps);
  const lines: TimelineClip[] = [];
  for (const x of parts) {
    const a = Math.min(length, Math.max(0, snap(x.t0, fps))), b = Math.min(length, snap(x.t1, fps));
    if (b - a < 1 / fps) continue;
    const many = x.parts > 1;
    lines.push({ id: `${s.id}-l${lines.length + 1}`, plan: 'line', scene: s.id, who: x.who, text: x.text, in: 0, out: r6(b - a), at: a,
      label: `${s.id} · ${x.who}${many ? ` · part ${x.part} of ${x.parts}` : ''}`, ...(many ? { part: x.part, parts: x.parts } : {}),
      timing: `at previz take ${take}'s times` });
  }
  return finish(s, length, lines, picturesOf(s, shots, fps), { by: 'previz', take });
}

/** Where each panel of a shot starts in the shot (seconds from its start, on whole frames). A panel is a picture of the
 *  moment around its own time (so the last panels do not go by too fast): the first starts at the shot's
 *  start, the last ends at its end, and two neighbours meet halfway between their two times, on a frame; each keeps at
 *  least a frame. Panels in time order; those that cannot get a frame are left out. */
export function panelStarts(panels: PlanPanel[], t0: number, length: number, fps: number): { p: PlanPanel; at: number }[] {
  const a = snap(t0, fps), f = 1 / fps;
  const sorted = [...panels].sort((x, y) => x.t - y.t || x.n - y.n).slice(0, Math.max(1, Math.round(length * fps)));
  const out: { p: PlanPanel; at: number }[] = [];
  sorted.forEach((p, k) => {
    if (k === 0) { out.push({ p, at: 0 }); return; }
    const want = r6(snap((sorted[k - 1].t + p.t) / 2, fps) - a);
    const at = r6(Math.min(length - (sorted.length - k) * f, Math.max(out[k - 1].at + f, want)));
    out.push({ p, at });
  });
  return out;
}

/** A scene's picture: a planned shot as its words; a shot with a storyboard as its panels, each its own board clip from
 *  its own time to the next panel's, the first from the shot's start, the last to its end. */
function picturesOf(s: PlanScene, shots: PlanShot[], fps: number): TimelineClip[] {
  return shots.flatMap((x): TimelineClip[] => {
    const a = snap(x.t0, fps), b = snap(x.t1, fps);
    const len = r6(Math.max(1 / fps, b - a));
    const base = { scene: s.id, shot: x.n, text: x.text?.trim() || `Shot ${x.id}`, ...(x.inFrame ? { inFrame: x.inFrame } : {}) };
    if (x.panels?.length) {
      const starts = panelStarts(x.panels, x.t0, len, fps);
      const of = starts.length;
      return starts.map(({ p, at }, i) => {
        const end = i + 1 < of ? starts[i + 1].at : len;
        const k = i + 1;
        return { id: k === 1 ? `${s.id}-p${x.n}` : `${s.id}-p${x.n}-${k}`, plan: 'board' as PlanKind, ...base, src: p.src, in: 0, out: r6(end - at), at: r6(a + at),
          label: `${s.id} · shot ${x.id} · board ${k} of ${of}`, panel: { k, of, n: p.n, s: p.t } };
      });
    }
    const kind: PlanKind = x.board ? 'board' : 'shot';
    return [{
      id: `${s.id}-p${x.n}`, plan: kind, ...base, ...(x.board ? { src: x.board } : {}),
      in: 0, out: len, at: a, label: `${s.id} · shot ${x.id}`,
    }];
  });
}

/** A shot's planned clips as the user left them, its panels laid out afresh inside them: each
 *  planned clip of the shot that is not a panel yet (one board, or one planned shot) gives way to the shot's panel clips,
 *  from that clip's start to its end, at their places in proportion. Everything else stays as it is. */
function panelsInto(old: TimelineClip[], fresh: TimelineClip[], fps: number): { clips: TimelineClip[]; shots: number } {
  const byShot = new Map<number, TimelineClip[]>();
  for (const c of fresh) if (c.panel && c.shot) { const g = byShot.get(c.shot) ?? []; g.push(c); byShot.set(c.shot, g); }
  let shots = 0;
  const clips = old.flatMap((c): TimelineClip[] => {
    const g = c.plan && c.plan !== 'line' && !c.panel && c.shot ? byShot.get(c.shot) : undefined;
    if (!g?.length) return [c];
    shots++;
    const from = g[0].at, span = Math.max(1e-6, endOf(g[g.length - 1]) - from), L = lenOf(c);
    const at = g.map((p) => r6(c.at + snap(((p.at - from) / span) * L, fps)));
    return g.map((p, i) => {
      const a = at[i], b = i + 1 < g.length ? at[i + 1] : r6(c.at + L);
      return { ...p, at: a, in: 0, out: r6(Math.max(1 / fps, b - a)), ...(c.muted ? { muted: true } : {}) };
    }).filter((p, i) => i === 0 || at[i] > at[i - 1]);
  });
  return { clips, shots };
}

function finish(s: PlanScene, length: number, lines: TimelineClip[], picture: TimelineClip[], timing: SceneBuild['timing']): SceneBuild {
  const boards = picture.filter((c) => c.plan === 'board').length;
  const kind = !picture.length ? 'none' : boards === picture.length ? 'boards' : boards ? 'some boards' : 'shots';
  // a scene laid out at reading pace with no take is hashed as before, so cuts made before panels and previz times read as up to date
  const lh = lines.map((c) => (c.timing || c.part ? [c.who, c.text, c.at, c.out, c.timing ?? '', c.part ?? 0, c.parts ?? 0] : [c.who, c.text, c.at, c.out]));
  const hash = hash8(JSON.stringify([s.id, length, lh, picture.map((c) => (c.panel ? [c.plan, c.src, c.text, c.inFrame, c.at, c.out, c.panel] : [c.plan, c.src, c.text, c.inFrame, c.at, c.out]))]));
  for (const c of [...lines, ...picture]) c.made = `${hash}.${clipHash(c, c.at)}`;
  return { id: s.id, length, lines, picture, hash, kind, timing };
}

// ---- bringing a cut up to date

export interface BringUp {
  tl: Timeline;
  /** The step's words: "the script: 19 lines in 7 scenes", "the boards of S4". */
  words: string;
  /** The scenes laid out again from their files. */
  scenes: string[];
  /** Tracks of a scene kept as they were because they were changed by hand ("S4 dialogue"). */
  kept: string[];
}

interface Extent { from: number; to: number }
/** Where each scene sits on the picture and dialogue tracks now. */
function extentsOf(tl: Timeline): Map<string, Extent> {
  const { v, a } = mains(tl);
  const out = new Map<string, Extent>();
  for (const t of [v, a]) for (const c of t?.clips ?? []) {
    const s = sceneOfClip(c);
    if (!s) continue;
    const e = out.get(s);
    if (e) { e.from = Math.min(e.from, c.at); e.to = Math.max(e.to, endOf(c)); } else out.set(s, { from: c.at, to: endOf(c) });
  }
  return out;
}

/** The film's scenes in their order: the script's, with a scene the script no longer has but whose take is in the cut
 *  kept after the scene before it. */
function orderOf(src: PlanSource, ext: Map<string, Extent>, keep: Set<string>): string[] {
  const order = src.scenes.map((s) => s.id);
  const old = [...ext.entries()].sort((x, y) => x[1].from - y[1].from).map(([id]) => id);
  old.forEach((id, i) => {
    if (order.includes(id) || !keep.has(id)) return;
    const before = old.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return order;
}

/** A time on the cut before, moved to where it is after: inside a scene by that scene's move; between or after scenes
 *  with the end of the scene before it; before the first scene, not at all. */
function mover(moves: { from: number; to: number; d: number; newTo: number }[]): (t: number) => number {
  const sorted = [...moves].sort((a, b) => a.from - b.from);
  return (t) => {
    const m = sorted.find((x) => t >= x.from - 1e-6 && t < x.to - 1e-6);
    if (m) return r6(Math.max(0, t + m.d));
    const prev = sorted.filter((x) => x.to <= t + 1e-6).pop();
    return prev ? r6(Math.max(0, t + prev.newTo - prev.to)) : t;
  };
}

const emptyTracks = (): TimelineTrack[] => [
  { id: 'V1', kind: 'video', name: 'Picture', clips: [] },
  { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] },
];

/** The cut brought up to date with the film's files, or undefined when nothing would change. `tl` undefined: the first
 *  cut, from the locked script. */
export function bringUp(tl: Timeline | undefined, src: PlanSource, o: { fps?: Timeline['fps']; width?: number; height?: number } = {}): BringUp | undefined {
  if (!src.locked) return undefined;
  // a cut made of takes only has left planning behind: from then on it changes by hand and by drops, never from here
  if (tl && !hasPlanned(tl) && tl.tracks.some((t) => t.clips.length > 0)) return undefined;
  const fps = tl?.fps ?? o.fps ?? 24;
  const base: Timeline = tl ? JSON.parse(JSON.stringify(tl)) as Timeline : { version: 'v0', fps, width: o.width ?? 1080, height: o.height ?? 1920, at: new Date(0).toISOString(), tracks: emptyTracks(), markers: [] };
  if (!base.tracks.some((t) => t.kind === 'video')) base.tracks.unshift({ id: 'V1', kind: 'video', name: 'Picture', clips: [] });
  if (!base.tracks.some((t) => t.kind === 'audio')) {
    const i = base.tracks.findIndex((t) => t.kind !== 'video');
    base.tracks.splice(i < 0 ? base.tracks.length : i, 0, { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [] });
  }
  const { v, a } = mains(base);
  if (!v || !a) return undefined;
  const ext = extentsOf(base);
  const withTake = new Set([...v.clips, ...a.clips].filter((c) => !c.plan && c.takeRef).map((c) => c.takeRef!.scene));
  const order = orderOf(src, ext, withTake);
  const byId = new Map(src.scenes.map((s) => [s.id, s]));
  const scenes: string[] = [], kept: string[] = [];
  const newV: TimelineClip[] = [], newA: TimelineClip[] = [];
  const moves: { from: number; to: number; d: number; newTo: number }[] = [];
  const kinds = { lines: [] as string[], shots: [] as string[], lists: [] as string[], boards: [] as string[], other: [] as string[], gone: [] as string[], timed: [] as string[], unmatched: [] as string[], split: [] as string[] };
  let cursor = 0;
  for (const id of order) {
    const e = ext.get(id);
    const oldV = v.clips.filter((c) => sceneOfClip(c) === id), oldA = a.clips.filter((c) => sceneOfClip(c) === id);
    const s = byId.get(id);
    const fresh = s ? buildScene(s, src.pace, fps) : undefined;
    const put = (clips: TimelineClip[], into: TimelineClip[], from: number) => { for (const c of clips) into.push({ ...c, at: r6(cursor + c.at - from) }); };
    let len: number;
    if (withTake.has(id) || (!fresh && e)) {
      // a scene whose take is in stays as it is; a planned scene the script no longer has goes
      if (!fresh && !withTake.has(id)) { if (e) { moves.push({ ...e, d: cursor - e.from, newTo: cursor }); kinds.gone.push(id); } continue; }
      put(oldV, newV, e!.from); put(oldA, newA, e!.from);
      len = e!.to - e!.from;
    } else if (!fresh) continue;
    else {
      const planned = [...oldV, ...oldA].filter((c) => c.plan);
      const same = !!e && planned.length > 0 && planned.every((c) => c.made?.split('.')[0] === fresh.hash);
      if (same) {
        put(oldV, newV, e!.from); put(oldA, newA, e!.from);
        len = e!.to - e!.from;
      } else {
        const handV = !!e && oldV.some((c) => !c.plan || changedByHand(c, e.from));
        const handA = !!e && oldA.some((c) => !c.plan || changedByHand(c, e.from));
        // a track kept as the user changed it is marked as read against these files (its clips' own halves of `made`
        // stay, so what was changed by hand still reads so), and the bar does not ask again until the files change
        const seen = (cs: TimelineClip[]) => cs.map((c) => (c.plan && c.made ? { ...c, made: `${fresh.hash}.${c.made.split('.')[1] ?? ''}` } : c));
        let keptV = oldV;
        if (handV) {
          // its shots of one board (or none yet) are split into their panels inside the span the user gave them
          const sp = panelsInto(oldV, fresh.picture, fps);
          keptV = sp.clips.map((c) => (c.panel && !oldV.includes(c) ? { ...c, made: `${fresh.hash}.${clipHash(c, c.at - e!.from)}` } : c));
          if (sp.shots) kinds.split.push(`${id} (${plural(sp.shots, 'shot')})`);
          put(seen(keptV), newV, e!.from); kept.push(`${id} picture`);
        } else put(fresh.picture, newV, 0);
        if (handA) { put(seen(oldA), newA, e!.from); kept.push(`${id} dialogue`); } else put(fresh.lines, newA, 0);
        const ends = [fresh.length, ...(handV ? keptV.map((c) => endOf(c) - e!.from) : []), ...(handA ? oldA.map((c) => endOf(c) - e!.from) : [])];
        len = Math.max(...ends);
        scenes.push(id);
        // what changed, in the user's words
        const oldBoards = oldV.filter((c) => c.plan === 'board').length, oldShots = oldV.filter((c) => c.plan).length;
        const freshBoards = fresh.picture.filter((c) => c.plan === 'board').length;
        let said = false;
        if (!handV && !oldShots && fresh.picture.length) { kinds.shots.push(id); said = true; }
        if (!handV && freshBoards > oldBoards) { kinds.boards.push(id); said = true; }
        if (handV && kinds.split.some((x) => x.startsWith(`${id} `))) said = true;
        const shape = (cs: TimelineClip[], from: number) => JSON.stringify(cs.filter((c) => c.plan).map((c) => [c.shot, r6(c.at - from), r6(c.out - c.in)]));
        if (!handV && !said && oldShots && shape(oldV, e!.from) !== shape(fresh.picture, 0)) { kinds.lists.push(id); said = true; }
        const oldL = oldA.filter((c) => c.plan);
        const textsChanged = JSON.stringify(oldL.map((c) => [c.who, c.text])) !== JSON.stringify(fresh.lines.map((c) => [c.who, c.text]));
        const timesChanged = !!e && JSON.stringify(oldL.map((c) => [r6(c.at - e.from), r6(c.out - c.in), c.timing ?? ''])) !== JSON.stringify(fresh.lines.map((c) => [c.at, c.out, c.timing ?? '']));
        if (!e) { kinds.lines.push(id); said = true; }
        else if (!handA && (textsChanged || timesChanged) && fresh.timing.by === 'previz') { kinds.timed.push(id); said = true; }
        else if (!handA && (textsChanged || timesChanged) && fresh.timing.why) { kinds.unmatched.push(`${id} at reading pace (${fresh.timing.why})`); said = true; }
        else if (!handA && textsChanged) { kinds.lines.push(id); said = true; }
        if (!said) kinds.other.push(id);
      }
    }
    if (e) moves.push({ ...e, d: cursor - e.from, newTo: r6(cursor + len) });
    cursor = r6(cursor + len);
  }
  if (!scenes.length && !kinds.gone.length) return undefined;
  // clips of the picture and dialogue tracks that belong to no scene (a title card), and every other track and the
  // markers, move with the scene they are in
  const move = mover(moves);
  const loose = (t: TimelineTrack) => t.clips.filter((c) => !sceneOfClip(c)).map((c) => ({ ...c, at: move(c.at) }));
  const tracks = base.tracks.map((t) => {
    if (t === v) return { ...t, clips: [...newV, ...loose(t)].sort((x, y) => x.at - y.at) };
    if (t === a) return { ...t, clips: [...newA, ...loose(t)].sort((x, y) => x.at - y.at) };
    return { ...t, clips: t.clips.map((c) => ({ ...c, at: move(c.at) })).sort((x, y) => x.at - y.at) };
  });
  const markers: TimelineMarker[] = (base.markers ?? []).map((m) => ({ ...m, at: move(m.at) }));
  return { tl: { ...base, tracks, markers }, words: wordsOf(src, kinds, !tl, tracks), scenes, kept };
}

/** The step's words: what the files brought, in the user's terms. */
function wordsOf(src: PlanSource, k: { lines: string[]; shots: string[]; lists: string[]; boards: string[]; other: string[]; gone: string[]; timed: string[]; unmatched: string[]; split: string[] }, first: boolean, tracks: TimelineTrack[]): string {
  const all = tracks.flatMap((t) => t.clips);
  const spoken = all.filter(isFirstPart).length;
  const pc = plannedCounts({ tracks });
  const shots = pc.shots + pc.boardShots;
  const boards = pc.boards;
  const list = (ids: string[]) => (ids.length === src.scenes.length && ids.length > 1 ? 'every scene' : ids.join(', '));
  const out: string[] = [];
  if (first || k.lines.length) out.push(`the script: ${plural(spoken, 'line')} in ${plural(src.scenes.length, 'scene')}`);
  if (k.shots.length || (first && shots > boards)) out.push(`the shot lists: ${plural(shots, 'planned shot')}`);
  if (k.lists.length) out.push(`the shot list${k.lists.length === 1 ? '' : 's'} of ${list(k.lists)}`);
  if (k.boards.length || (first && boards)) out.push(k.boards.length && k.boards.length < src.scenes.length ? `the boards of ${list(k.boards)}` : `the boards: ${plural(boards, 'board')}${boards > pc.boardShots ? ` in ${plural(pc.boardShots, 'shot')}` : ''}`);
  if (k.split.length) out.push(`the boards of the shots you changed by hand laid out panel by panel inside them: ${k.split.join(', ')}`);
  if (k.timed.length) out.push(`the lines of ${list(k.timed)} at the times of ${k.timed.length === 1 ? 'its previz take' : 'their previz takes'}`);
  out.push(...k.unmatched);
  if (k.other.length && !out.length) out.push(`${list(k.other)} brought up to date`);
  if (k.gone.length) out.push(`${k.gone.join(', ')} taken out (no longer in the script)`);
  const s = out.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- a take in its boards' place, and back

export interface PlanEdit { tl: Timeline; words: string }
export interface TakeIn { src: string; seconds: number; name: string; sound?: boolean }

/** Every clip of every track from `at` on moved by `d` seconds (a scene got longer or shorter), markers too. */
function ripple(tl: Timeline, at: number, d: number, skip: Set<TimelineClip>): void {
  if (Math.abs(d) < 1e-6) return;
  for (const t of tl.tracks) for (const c of t.clips) if (!skip.has(c) && c.at >= at - 1e-6) c.at = r6(Math.max(0, c.at + d));
  for (const m of tl.markers ?? []) if (m.at >= at - 1e-6) m.at = r6(Math.max(0, m.at + d));
}
const freshId = (tl: Timeline, base: string): string => {
  const used = new Set(tl.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  let id = base;
  for (let k = 2; used.has(id) || used.has(`${id}a`); k++) id = `${base}-${k}`;
  return id;
};

/** A scene's take in place of its planned clips (boards or planned shots, and its lines): one picture clip, the whole
 *  take, and its sound under it; what follows moves by the difference in length. Refused (a string) when the scene has
 *  no planned clips or its take is in already. */
export function takeForBoards(tl0: Timeline, scene: string, take: TakeIn): PlanEdit | string {
  const tl = JSON.parse(JSON.stringify(tl0)) as Timeline;
  const { v, a } = mains(tl);
  if (!v || !a) return 'The cut has no picture or dialogue track.';
  if (v.clips.some((c) => !c.plan && c.takeRef?.scene === scene)) return `${scene} has its take in the film already.`;
  const mine = [...v.clips, ...a.clips].filter((c) => c.plan && c.scene === scene);
  if (!mine.length) return `${scene} has no boards or planned shots on the timeline.`;
  const from = Math.min(...mine.map((c) => c.at)), to = Math.max(...mine.map(endOf));
  const gone = new Set(mine);
  v.clips = v.clips.filter((c) => !gone.has(c));
  a.clips = a.clips.filter((c) => !gone.has(c));
  const secs = r6(Math.round(take.seconds * tl.fps) / tl.fps);
  const id = freshId(tl, `${scene.toLowerCase()}-take`);
  const label = `${scene} · ${take.name}`;
  const pic: TimelineClip = { id, src: take.src, in: 0, out: secs, at: from, label, takeRef: { scene, take: take.name } };
  const snd: TimelineClip | undefined = take.sound === false ? undefined : { ...pic, id: `${id}a` };
  ripple(tl, to, secs - (to - from), new Set());
  v.clips = [...v.clips, pic].sort((x, y) => x.at - y.at);
  if (snd) a.clips = [...a.clips, snd].sort((x, y) => x.at - y.at);
  const kind = mine.some((c) => c.plan === 'board') ? 'boards' : 'planned shots';
  return { tl, words: `${scene} ${take.name} took the place of its ${kind} (${secs.toFixed(1)} s)` };
}

/** "Put the boards back": the scene's take out of the film and its planned clips (boards, else planned shots, and its
 *  lines) back in its place; what follows moves by the difference in length. */
export function boardsBack(tl0: Timeline, scene: string, src: PlanSource): PlanEdit | string {
  const s = src.scenes.find((x) => x.id === scene);
  if (!s) return `${scene} is not in the locked script.`;
  const tl = JSON.parse(JSON.stringify(tl0)) as Timeline;
  const { v, a } = mains(tl);
  if (!v || !a) return 'The cut has no picture or dialogue track.';
  const takes = [...v.clips, ...a.clips].filter((c) => !c.plan && c.takeRef?.scene === scene);
  if (!takes.length) return `${scene} has no take in the film.`;
  const fresh = buildScene(s, src.pace, tl.fps);
  if (!fresh.picture.length && !fresh.lines.length) return `${scene} has nothing planned to put back.`;
  const from = Math.min(...takes.map((c) => c.at)), to = Math.max(...takes.map(endOf));
  const gone = new Set(takes);
  v.clips = v.clips.filter((c) => !gone.has(c));
  a.clips = a.clips.filter((c) => !gone.has(c));
  ripple(tl, to, fresh.length - (to - from), new Set());
  v.clips = [...v.clips, ...fresh.picture.map((c) => ({ ...c, at: r6(from + c.at) }))].sort((x, y) => x.at - y.at);
  a.clips = [...a.clips, ...fresh.lines.map((c) => ({ ...c, at: r6(from + c.at) }))].sort((x, y) => x.at - y.at);
  // a planned clip's `made` is relative to its scene: moved with it, it still reads as the app's
  const names = [...new Set(takes.map((c) => c.takeRef!.take))].join(', ');
  const kind = fresh.kind === 'boards' ? 'boards' : fresh.kind === 'shots' ? 'planned shots' : fresh.kind === 'none' ? 'lines' : 'boards and planned shots';
  return { tl, words: `${scene}: the ${kind} put back in place of ${names}` };
}

// ---- a retake of a planned shot 

/** The whole planned shot a planned clip of the picture belongs to (a board panel, a board, or a planned shot): every
 *  planned clip of its scene and shot on the main picture track, where it starts on the cut, its length, where it sits
 *  in its scene (from the scene's first planned clip) and how many boards it has. Undefined for anything else. */
export function shotSpan(tl: Pick<Timeline, 'tracks'>, c: TimelineClip): { scene: string; shot: number; first: TimelineClip; clips: TimelineClip[]; at: number; length: number; inScene: [number, number]; boards: number } | undefined {
  if (!c.plan || c.plan === 'line' || !c.scene || c.shot === undefined) return undefined;
  const { v, a } = mains(tl);
  const clips = (v?.clips ?? []).filter((x) => x.plan && x.plan !== 'line' && x.scene === c.scene && x.shot === c.shot).sort((x, y) => x.at - y.at);
  if (!clips.length) return undefined;
  const at = clips[0].at, to = Math.max(...clips.map(endOf));
  const from = Math.min(...[...(v?.clips ?? []), ...(a?.clips ?? [])].filter((x) => x.plan && x.scene === c.scene).map((x) => x.at));
  return { scene: c.scene, shot: c.shot, first: clips[0], clips, at, length: r6(to - at), inScene: [r6(at - from), r6(to - from)], boards: clips.filter((x) => x.plan === 'board').length };
}

const s1 = (s: number) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;
const s2 = (s: number) => `${Math.round(s * 100) / 100} s`;
/** "Retake this shot" on a planned clip: the words for Alma's box, of the whole shot whichever of its panels is selected
 *  (its scene, its number, its boards, its real length and start on the cut and in the scene). Undefined for a clip
 *  that is not a planned shot. `tc` writes a time on the cut as a timecode. */
export function retakeWords(tl: Pick<Timeline, 'tracks'>, c: TimelineClip, cut: string, tc: (s: number) => string): string | undefined {
  const sp = shotSpan(tl, c);
  if (!sp) return undefined;
  const what = sp.boards > 1 ? `no take yet, its ${sp.boards} boards` : sp.boards ? 'no take yet, its board' : 'no take yet, planned';
  return `Retake ${sp.scene} shot ${sp.shot} (${what}, the whole shot ${s1(sp.length)}, from ${s2(sp.inScene[0])} to ${s2(sp.inScene[1])} in the scene, at ${tc(sp.at)} in cut ${cut}). What should change: `;
}

// ---- what a cut holds, for the page

/** `shots`: planned shots with no board yet; `boards`: board clips (one per storyboard panel); `boardShots`: the
 *  shots those boards belong to. */
export interface PlannedCounts { lines: number; actions: number; shots: number; boards: number; boardShots: number; takes: number; scenes: number }
export function plannedCounts(tl: Pick<Timeline, 'tracks'>): PlannedCounts {
  const all = tl.tracks.flatMap((t) => t.clips);
  const { v } = mains(tl);
  const scenes = new Set(all.map(sceneOfClip).filter((x): x is string => !!x));
  return {
    lines: all.filter(isFirstPart).length,
    actions: all.filter((c) => c.plan === 'line' && !c.who).length,
    shots: all.filter((c) => c.plan === 'shot').length,
    boards: all.filter((c) => c.plan === 'board').length,
    boardShots: new Set(all.filter((c) => c.plan === 'board').map((c) => `${c.scene}:${c.shot ?? c.id}`)).size,
    takes: new Set((v?.clips ?? []).filter((c) => !c.plan && c.takeRef).map((c) => c.takeRef!.scene)).size,
    scenes: scenes.size,
  };
}
/** The scenes whose take is in the film (their picture is a take), and those still planned. */
export function sceneKinds(tl: Pick<Timeline, 'tracks'>): Map<string, 'take' | 'boards' | 'shots' | 'lines'> {
  const { v, a } = mains(tl);
  const out = new Map<string, 'take' | 'boards' | 'shots' | 'lines'>();
  for (const c of a?.clips ?? []) { const s = sceneOfClip(c); if (s && c.plan === 'line' && !out.has(s)) out.set(s, 'lines'); }
  for (const c of v?.clips ?? []) {
    const s = sceneOfClip(c);
    if (!s) continue;
    const k = !c.plan ? 'take' : c.plan === 'board' ? 'boards' : 'shots';
    const was = out.get(s);
    if (!was || was === 'lines' || k === 'take' || (k === 'boards' && was === 'shots')) out.set(s, k);
  }
  return out;
}
