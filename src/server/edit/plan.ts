// The timeline from day one, on the server (15 Nov 2026, ASKS 47; ARCHITECTURE.md "The timeline from day one").
// `readPlanSource` reads what the planned parts are built from: the locked script, the shot lists and the boards.
// `planUpdate`, `planTake` and `planBoards` change the working cut as ONE step each, in the film's serial queue
// (working.ts inFilmQueue: never between a page step and a drop). A step asked by Alma is saved as a version with
// her note, as a drop is; one asked by the page is a step only. Nothing here runs by itself.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { QC_LOCK_SCORE, type Timeline } from '../types';
import { frameSize } from '@/lib/frame';
import { bringUp, boardsBack, hasPlanned, READING_PACE, takeForBoards, type PlanPreviz, type PlanScene, type PlanShot, type PlanSource, type PrevizLine, type TakeIn } from '@/components/edit/planned';
import { CutError, resolveSrc } from './timeline';
import { ensureNow, historyNow, inFilmQueue, saveNow, stateNow, stepNow, WorkingError, type CutStore, type WorkingAnswer } from './working';
import { probe } from './probe';
import { chooseLayout, layoutInCut, type BoardsIn, type Layout, type LayoutShotIn } from '@/components/edit/layouts';

// ---- reading the files

const read = (f: string) => fs.readFile(f, 'utf8').catch(() => undefined);
const readJson = async <T>(f: string): Promise<T | undefined> => { const t = await read(f); try { return t === undefined ? undefined : JSON.parse(t) as T; } catch { return undefined; } };

/** The `## Script` section of script.md, up to the next `## ` heading. */
function scriptSection(md: string): string | undefined {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Script\s*$/.test(l));
  if (start < 0) return undefined;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

const LINE = /^\*\*([^*]+?):?\*\*\s*(?:\*\(([^)]*)\):?\*\s*)?:?\s*["“](.*)["”]\s*$/;
/** A line's direction that says it is heard over the picture, not spoken in the scene ("over the picture", "V.O.",
 *  "voice-over"): a narrator's line, laid in the edit, which no previz take speaks. */
export const VOICE_OVER = /\bover the (?:picture|pictures|image|scene|shot)\b|\bV\.\s?O\.?(?![a-z])|\bvoice[- ]?over\b/i;
const ACTION = /^`\[(\d+(?:\.\d+)?)\s*s\]`\s*(.*)$/;

/** script.md as the planned parts read it: the locked version, the pace it names, and per scene its title, its lines
 *  and actions in order and its own length ("≈ s"). Undefined when there is no `## Script`. */
export function parseScript(md: string): { locked?: { version: string; date?: string }; pace: { wps: number; gap: number }; scenes: PlanScene[]; names: Map<string, string> } | undefined {
  const body = scriptSection(md);
  if (!body) return undefined;
  const note = body.split('\n').find((l) => /^\*v\d/.test(l.trim())) ?? '';
  const lock = /\bv(\d+(?:\.\d+)*),?\s+LOCKED\b(?:[^(]*?(\d{4}-\d{2}-\d{2}))?/.exec(note);
  const wps = Number(/about\s+(\d+(?:\.\d+)?)\s+words a second/i.exec(md)?.[1]);
  const gap = Number(/(\d+(?:\.\d+)?)\s*s\s+(?:word to word\s+)?between lines/i.exec(md)?.[1]);
  const scenes: PlanScene[] = [];
  let cur: PlanScene | undefined;
  let tableCol = -1;
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    const h = /^###\s+(S\d+[A-Za-z]?)\s*[·:-]\s*([^·]+?)(?:\s*·.*)?$/.exec(l);
    if (h) { cur = { id: h[1], title: h[2].trim(), items: [] }; scenes.push(cur); tableCol = -1; continue; }
    if (/^###\s/.test(l)) { cur = undefined; continue; }
    if (!cur) continue;
    const a = ACTION.exec(l);
    if (a) { cur.items.push({ text: a[2].trim(), secs: Number(a[1]) }); continue; }
    const m = LINE.exec(l);
    if (m) { cur.items.push({ who: m[1].trim(), text: m[3].trim(), ...(m[2] && VOICE_OVER.test(m[2]) ? { vo: true } : {}) }); continue; }
    // the scene's timing row: | S1 | 2 | 19 | 6 | 19 ÷ 2.9 + 0.5 + 6 = 13.1 → 13 | 0:13 |
    if (l.startsWith('|')) {
      const cells = l.split('|').slice(1, -1).map((c) => c.trim());
      const i = cells.findIndex((c) => /^≈\s*s$/.test(c));
      if (i >= 0) { tableCol = i; continue; }
      if (tableCol >= 0 && cells[0] === cur.id) {
        const n = Number(/(?:→\s*)?(\d+(?:\.\d+)?)(?:\s*\([^)]*\))?\s*$/.exec(cells[tableCol])?.[1] ?? /^(\d+(?:\.\d+)?)/.exec(cells[tableCol])?.[1]);
        if (Number.isFinite(n) && n > 0) cur.seconds = n;
      }
    }
  }
  // the names of the ID table, for "in frame": "MAREN" → "Maren", "the BOY" → "the boy"
  const names = new Map<string, string>();
  const ids = /^##\s+IDs\b[\s\S]*?(?=^##\s)/m.exec(md)?.[0] ?? /^##\s+IDs\b[\s\S]*$/m.exec(md)?.[0] ?? '';
  for (const m of `${ids}\n${md}`.matchAll(/(\bthe\s+)?\b([A-Z][A-Z'’]{2,})\b/g)) {
    const tag = m[2];
    if (names.has(tag) || /^(ID|IDS|LOCKED|HARD|CUT|CAM|S|L|C|P)$/.test(tag)) continue;
    names.set(tag, m[1] ? `the ${tag.toLowerCase()}` : tag.charAt(0) + tag.slice(1).toLowerCase());
  }
  return {
    ...(lock ? { locked: { version: `v${lock[1]}`, ...(lock[2] ? { date: lock[2] } : {}) } } : {}),
    pace: { wps: wps > 0 ? wps : READING_PACE.wps, gap: gap >= 0 && Number.isFinite(gap) ? gap : READING_PACE.gap },
    scenes, names,
  };
}

/** A shot file's `in_frame` tags in words: a character by its name, anything else as "the rope". */
export function inFrameWords(tags: string[], names: Map<string, string>): string {
  return tags.map((t) => {
    const k = t.toUpperCase();
    const n = names.get(k);
    if (n) return n;
    return `the ${t.toLowerCase().replace(/_/g, ' ')}`;
  }).join(', ');
}

/** The scene file's shots: "### SHOT 3: THE SHADE AND THE PURSE (CAM FACING: N)" and its "**Size:**" line. */
export function sceneFileShots(md: string): Map<string, { title: string; size?: string }> {
  const out = new Map<string, { title: string; size?: string }>();
  let cur: string | undefined;
  for (const l of md.split('\n')) {
    const h = /^###\s+SHOT\s+([0-9A-Za-z]+)\s*:\s*(.+?)(?:\s*\(CAM[^)]*\))?\s*$/.exec(l.trim());
    if (h) { cur = h[1]; out.set(cur, { title: h[2].trim() }); continue; }
    if (/^#{1,3}\s/.test(l.trim())) { cur = undefined; continue; }
    const s = /^\*\*Size:\*\*\s*(.+)$/.exec(l.trim());
    if (s && cur && out.get(cur) && !out.get(cur)!.size) out.get(cur)!.size = s[1].trim();
  }
  return out;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** How long a storyboard folder must have been left alone before it counts as finished when nothing else vouches
 *  for it: a builder writes its panels over a minute or two. */
export const BOARDS_QUIET_MS = 5 * 60_000;

export interface StoryboardPick {
  version: string;
  /** Every panel of the version: its number, its shot id, its time in the scene and its picture (relative to the repo). */
  panels: { n: number; shot: string; t: number; src: string }[];
  /** Why this version, in words: "the last checked, 8.6", "on your card". */
  why: string;
  /** A newer version that is not shown, in words: "v10 is being made", "v9 is not checked yet". */
  newer?: string;
  /** The previz take the version was made from, where something records it: the take the version's
   *  newest previz check ran on (its `inputs`), else the take its boards card names. The storyboard folder itself does
   *  not record it (tools/previz/asvlib.py `--panels` writes panels.json and the pictures only). */
  take?: { n: number; how: 'check' | 'card' };
  /** When anything in the version was last written (ms). */
  touched: number;
}

/** The storyboard versions of a scene that something vouches for: the version each passed previz
 *  check ran on (`qc/previz-<S>-r<n>.json`: the storyboard folder in its `inputs`, else "boards v<n>" in its label),
 *  the newest check of any score, and the versions the boards cards of the scene name (review/cards.json). With each,
 *  the previz take it was made from where they say it: a check's first take of the scene in its `inputs`
 *  (the film, `<S>-previz-take-<n>.mp4`, else its json), a card's "previz take <n>" or the take's film in its files. */
async function vouched(film: FilmTarget, scene: string): Promise<{ passed: Map<number, number>; last?: { v: number; score?: number }; cards: Set<number>; checkTake: Map<number, number>; cardTake: Map<number, number> }> {
  const passed = new Map<number, number>(), cards = new Set<number>();
  const checkTake = new Map<number, number>(), cardTake = new Map<number, number>();
  const takeRound = new Map<number, number>();
  let last: { v: number; score?: number; round: number } | undefined;
  const re = new RegExp(`^previz-${scene}-r(\\d+)\\.json$`);
  const inFolder = new RegExp(`previz/${scene}/storyboard/v(\\d+)/`);
  const takeFilm = new RegExp(`previz/${scene}/${scene}-previz-take-(\\d+)\\.mp4$`), takeJson = new RegExp(`previz/${scene}/${scene}-previz-take-(\\d+)\\.json$`);
  for (const f of await fs.readdir(path.join(film.dir, 'qc')).catch(() => [] as string[])) {
    const m = re.exec(f);
    if (!m) continue;
    const j = await readJson<{ score?: unknown; label?: unknown; round?: unknown; inputs?: unknown }>(path.join(film.dir, 'qc', f));
    if (!j) continue;
    const paths = Array.isArray(j.inputs) ? j.inputs.map((x) => String((typeof x === 'string' ? x : (x as { path?: unknown })?.path) ?? '')) : [];
    const fromInputs = paths.map((p) => inFolder.exec(p)?.[1]).find(Boolean);
    const v = Number(fromInputs ?? /\bboards v(\d+)\b/i.exec(String(j.label ?? ''))?.[1]);
    if (!Number.isInteger(v) || v < 1) continue;
    const score = typeof j.score === 'number' ? j.score : undefined;
    const round = typeof j.round === 'number' ? j.round : Number(m[1]);
    if (score !== undefined && score >= QC_LOCK_SCORE) passed.set(v, Math.max(score, passed.get(v) ?? 0));
    if (!last || round > last.round) last = { v, score, round };
    const tk = Number(paths.map((p) => takeFilm.exec(p)?.[1]).find(Boolean) ?? paths.map((p) => takeJson.exec(p)?.[1]).find(Boolean));
    if (Number.isInteger(tk) && tk > 0 && round >= (takeRound.get(v) ?? -1)) { checkTake.set(v, tk); takeRound.set(v, round); }
  }
  const cardsJson = await readJson<unknown>(path.join(film.dir, 'review', 'cards.json'));
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.title === 'string') {
      const words = `${o.title} ${typeof o.sub === 'string' ? o.sub : ''}`;
      const forScene = o.for === scene || (typeof o.for !== 'string' && new RegExp(`^${scene}\\b`).test(o.title));
      const named = forScene ? /\bstoryboards? v(\d+)\b/i.exec(words)?.[1] : undefined;
      const files = forScene ? JSON.stringify(o.items ?? o.media ?? []) : '';
      // the take it names ("previz take 4 and storyboard v4"), else the take's film among its files
      const tk = Number(/\bprevi[sz] take (\d+)\b/i.exec(words)?.[1] ?? new RegExp(`previz/${scene}/${scene}-previz-take-(\\d+)\\.mp4`).exec(files)?.[1]);
      const vs: number[] = [];
      // the version its title names, else the storyboard folder its files are in (never a version its words mention)
      if (named) vs.push(Number(named));
      else if (forScene) for (const m of files.matchAll(new RegExp(inFolder.source, 'g'))) vs.push(Number(m[1]));
      for (const v of vs) cards.add(v);
      if (Number.isInteger(tk) && tk > 0 && new Set(vs).size === 1) cardTake.set(vs[0], tk);
      return;
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(cardsJson);
  return { passed, last: last ? { v: last.v, score: last.score } : undefined, cards, checkTake, cardTake };
}

/** A storyboard folder read whole: its panels.json and every panel it lists on disk, and when anything in it was last
 *  written. Undefined while it is not whole. */
async function readVersion(film: FilmTarget, dir: string): Promise<{ panels: StoryboardPick['panels']; touched: number } | undefined> {
  const list = await readJson<{ n?: unknown; shot?: unknown; t?: unknown; file?: unknown }[]>(path.join(dir, 'panels.json'));
  if (!Array.isArray(list) || !list.length) return undefined;
  const stat = (f: string) => fs.stat(f).then((x) => x.mtimeMs, () => undefined);
  let touched = Math.max((await stat(dir)) ?? 0, (await stat(path.join(dir, 'panels.json'))) ?? 0, (await stat(path.join(dir, 'panels'))) ?? 0);
  const panels: StoryboardPick['panels'] = [];
  for (const [i, p] of list.entries()) {
    if (!p || typeof p.file !== 'string' || p.shot === undefined || p.shot === null) return undefined;
    const t = typeof p.t === 'number' ? p.t : Number(/-(\d+(?:\.\d+)?)\.(?:png|jpe?g|webp)$/i.exec(p.file)?.[1]);
    if (!Number.isFinite(t)) return undefined;
    const abs = path.join(dir, p.file);
    const m = await stat(abs);
    if (m === undefined || !resolveSrc(film, film.show(abs))) return undefined;
    touched = Math.max(touched, m);
    panels.push({ n: typeof p.n === 'number' ? p.n : i + 1, shot: String(p.shot), t, src: film.show(abs) });
  }
  return { panels, touched };
}

/** The storyboard version a scene's boards come from, never a folder still being written: the
 *  newest of the versions a passed previz check ran on and the versions a boards card of the scene names (what the
 *  user saw in "Waiting for you"); else the version the newest check ran on, whatever its score; else the newest
 *  version that is whole and has been left alone for a few minutes. Whole: its panels.json and every panel it lists. */
export async function storyboardOf(film: FilmTarget, scene: string, now = Date.now()): Promise<StoryboardPick | undefined> {
  const dir = path.join(film.dir, 'previz', scene, 'storyboard');
  const vs = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => /^v\d+$/.test(n)).map((n) => Number(n.slice(1))).sort((a, b) => b - a);
  if (!vs.length) return undefined;
  const { passed, last, cards, checkTake, cardTake } = await vouched(film, scene);
  const read = new Map<number, Awaited<ReturnType<typeof readVersion>>>();
  const whole = async (v: number) => { if (!read.has(v)) read.set(v, await readVersion(film, path.join(dir, `v${v}`))); return read.get(v); };
  const quiet = (r: { touched: number }) => now - r.touched >= BOARDS_QUIET_MS;
  let pick: { v: number; why: string } | undefined;
  for (const v of vs) {
    if (!passed.has(v) && !cards.has(v)) continue;
    if (!await whole(v)) continue;
    const said = [passed.has(v) ? `checked, ${passed.get(v)}` : '', cards.has(v) ? 'on your card' : ''].filter(Boolean).join(' and ');
    pick = { v, why: `${said}` };
    break;
  }
  if (!pick && last && await whole(last.v)) pick = { v: last.v, why: `the last checked${last.score !== undefined ? `, ${last.score}, not passed` : ''}` };
  if (!pick) for (const v of vs) { const r = await whole(v); if (r && quiet(r)) { pick = { v, why: 'the newest finished, not checked yet' }; break; } }
  if (!pick) return undefined;
  const top = vs[0];
  let newer: string | undefined;
  if (top > pick.v) {
    const r = await whole(top);
    newer = !r || !quiet(r) ? `v${top} is being made` : `v${top} is newer, not checked yet`;
  }
  const tk = checkTake.get(pick.v) ?? cardTake.get(pick.v);
  const take = tk === undefined ? undefined : { n: tk, how: checkTake.has(pick.v) ? 'check' as const : 'card' as const };
  const got = read.get(pick.v)!;
  return { version: `v${pick.v}`, panels: got.panels, why: pick.why, touched: got.touched, ...(newer ? { newer } : {}), ...(take ? { take } : {}) };
}

/** Every storyboard version of a scene that is whole, newest first: the previz take it was made
 *  from (recorded by a check or a card, else the take whose shots hold its panels, nearest in time), the first panel of
 *  each shot, and `shown` on the version the timeline's boards come from (`storyboardOf`). */
export async function boardsVersions(film: FilmTarget, scene: string, takes: PrevizTake[], now = Date.now()): Promise<BoardsIn[]> {
  const dir = path.join(film.dir, 'previz', scene, 'storyboard');
  const vs = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => /^v\d+$/.test(n)).map((n) => Number(n.slice(1))).sort((a, b) => b - a);
  if (!vs.length) return [];
  const { checkTake, cardTake } = await vouched(film, scene);
  const shown = await storyboardOf(film, scene, now);
  const out: BoardsIn[] = [];
  for (const v of vs) {
    const r = await readVersion(film, path.join(dir, `v${v}`));
    if (!r) continue;
    const rec = checkTake.get(v) ?? cardTake.get(v);
    const pick: StoryboardPick = { version: `v${v}`, panels: r.panels, why: '', touched: r.touched, ...(rec !== undefined ? { take: { n: rec, how: checkTake.has(v) ? 'check' as const : 'card' as const } } : {}) };
    const of = takeOfBoards(pick, takes);
    const first = new Map<string, string>();
    for (const p of [...r.panels].sort((a, b) => a.t - b.t)) if (!first.has(p.shot)) first.set(p.shot, p.src);
    out.push({ version: `v${v}`, ...(of ? { take: of.take.n } : {}), shots: [...first].map(([shot, src]) => ({ shot, src })), ...(shown?.version === `v${v}` ? { shown: true } : {}) });
  }
  return out;
}

/** One storyboard version of a scene read whole, as `storyboardOf` gives one ("v6"); undefined while it is not whole. */
async function versionAsPick(film: FilmTarget, scene: string, version: string): Promise<StoryboardPick | undefined> {
  if (!/^v\d+$/.test(version)) return undefined;
  const r = await readVersion(film, path.join(film.dir, 'previz', scene, 'storyboard', version));
  return r ? { version, panels: r.panels, why: 'the layout you chose', touched: r.touched } : undefined;
}

/** One previz take of a scene as its json says it: its number, its spoken parts (`lines: [{who, text, t: [start, end]}]`,
 *  seconds from the scene's start), its shots' own start and end (`shots: [{label, t0, t1}]`) and when it was written. */
export interface PrevizTake { n: number; lines: PrevizLine[]; shots: LayoutShotIn[]; written: number }

/** Every previz take of a scene that reads (`previz/<S>/<S>-previz-take-<n>.json`), newest first. */
export async function previzTakes(film: FilmTarget, scene: string): Promise<PrevizTake[]> {
  const dir = path.join(film.dir, 'previz', scene);
  const re = new RegExp(`^${scene}-previz-take-(\\d+)\\.json$`);
  const ns = (await fs.readdir(dir).catch(() => [] as string[])).map((n) => Number(re.exec(n)?.[1])).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => b - a);
  const out: PrevizTake[] = [];
  for (const n of ns) {
    const f = path.join(dir, `${scene}-previz-take-${n}.json`);
    const j = await readJson<{ lines?: unknown; shots?: unknown }>(f);
    if (!j) continue;
    const lines = (Array.isArray(j.lines) ? j.lines : []).filter((l): l is PrevizLine => !!l && typeof l.who === 'string' && typeof l.text === 'string' && Array.isArray(l.t)
      && typeof l.t[0] === 'number' && typeof l.t[1] === 'number' && l.t[1] > l.t[0]);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const shots = (Array.isArray(j.shots) ? j.shots as { label?: unknown; id?: unknown; t0?: unknown; t1?: unknown; name?: unknown; board?: unknown; cam?: unknown; yaw?: unknown; pitch?: unknown; lens_mm?: unknown }[] : []).flatMap((x, i): LayoutShotIn[] => {
      if (!x || typeof x.t0 !== 'number' || typeof x.t1 !== 'number' || x.t1 <= x.t0) return [];
      // its framing, for a scene's layouts: where the camera is and faces, its lens, else its name and board line
      const cam = Array.isArray(x.cam) && x.cam.length === 3 && x.cam.every((k) => typeof k === 'number') ? x.cam as [number, number, number] : undefined;
      return [{ id: String(x.label ?? x.id ?? i + 1), t0: x.t0, t1: x.t1, ...(typeof x.name === 'string' ? { name: x.name } : {}), ...(typeof x.board === 'string' ? { board: x.board } : {}),
        ...(cam ? { cam } : {}), ...(num(x.yaw) !== undefined ? { yaw: num(x.yaw) } : {}), ...(num(x.pitch) !== undefined ? { pitch: num(x.pitch) } : {}), ...(num(x.lens_mm) !== undefined ? { lens: num(x.lens_mm) } : {}) }];
    });
    const written = await fs.stat(f).then((x) => x.mtimeMs, () => 0);
    out.push({ n, lines: lines.map((l) => ({ who: l.who, text: l.text, t: [l.t[0], l.t[1]] })), shots, written });
  }
  return out;
}

/** A take's shots hold every panel of a storyboard: each panel's time inside its own shot's start and end. */
const holdsPanels = (t: PrevizTake, panels: StoryboardPick['panels']): boolean => {
  if (!t.shots.length) return false;
  const by = new Map(t.shots.map((s) => [s.id, s]));
  return panels.every((p) => { const s = by.get(p.shot); return !!s && p.t >= s.t0 - 1e-6 && p.t <= s.t1 + 1e-6; });
};

/** The previz take a storyboard version was made from: the one its check or its card records; else, as
 *  nothing records it, the take whose shots hold every panel and was written nearest in time to the version's files
 *  (the kit renders a version's panels and its take from the same scene within minutes). */
export function takeOfBoards(sb: StoryboardPick, takes: PrevizTake[]): { take: PrevizTake; how: 'check' | 'card' | 'nearest' } | undefined {
  const rec = sb.take && takes.find((t) => t.n === sb.take!.n);
  if (rec) return { take: rec, how: sb.take!.how };
  const fit = takes.filter((t) => holdsPanels(t, sb.panels));
  const near = (fit.length ? fit : takes).slice().sort((a, b) => Math.abs(a.written - sb.touched) - Math.abs(b.written - sb.touched) || b.n - a.n)[0];
  return near ? { take: near, how: 'nearest' } : undefined;
}

/** A scene's newest previz take (`previz/<S>/<S>-previz-take-<n>.json`, the highest n that reads) and its spoken parts.
 *  Undefined before the first take. */
export async function previzOf(film: FilmTarget, scene: string): Promise<PlanPreviz | undefined> {
  const t = (await previzTakes(film, scene))[0];
  return t ? { take: t.n, lines: t.lines } : undefined;
}

/** The words for a scene whose lines follow an older take than its newest: "Lines at take 4, the take of
 *  boards v4; take 9 is newer." Undefined when they follow the newest. */
export function linesTakeWords(take: number, newest: number, version: string, how: 'check' | 'card' | 'nearest'): string | undefined {
  if (take === newest) return undefined;
  const whose = how === 'nearest' ? `the take made nearest in time to boards ${version} (the boards do not record theirs)` : `the take of boards ${version}`;
  return `Lines at take ${take}, ${whose}; take ${newest} is newer.`;
}

/** What the planned parts are built from, read from the film's files; undefined when the film has no script. */
export async function readPlanSource(film: FilmTarget, layouts?: Map<string, { take: number; version?: string }>): Promise<PlanSource | undefined> {
  const md = await read(path.join(film.dir, 'script.md'));
  if (md === undefined) return undefined;
  const sc = parseScript(md);
  if (!sc) return undefined;
  const took = new Set<string>();
  for (const s of sc.scenes) {
    let folder: string | undefined;
    for (const f of ['generations', 'blocks']) if (await fs.access(path.join(film.dir, f, s.id)).then(() => true, () => false)) { folder = path.join(film.dir, f, s.id); break; }
    if (!folder) continue;
    const j = await readJson<{ duration?: number; shots?: { id?: string | number; t0?: number; t1?: number; in_frame?: string[] }[] }>(path.join(folder, `${s.id}-shots.json`));
    if (!j || !Array.isArray(j.shots) || !j.shots.length) continue;
    const file = sceneFileShots((await read(path.join(folder, `${s.id}-scene.md`))) ?? '');
    // a layout asked for by name (the user chose it under Takes): its storyboard version and its previz take
    const ov = layouts?.get(s.id);
    const sb = ov ? (ov.version ? await versionAsPick(film, s.id, ov.version) : undefined) : await storyboardOf(film, s.id);
    // the lines and the shots' own times follow the previz take the shown boards were made from, never a newer one
    //: a line sits under the picture it was timed with
    const takes = sb || ov ? await previzTakes(film, s.id) : [];
    const asked = ov ? takes.find((t) => t.n === ov.take) : undefined;
    const of = asked ? { take: asked, how: 'check' as const } : sb ? takeOfBoards(sb, takes) : undefined;
    if (of) {
      s.previz = { take: of.take.n, lines: of.take.lines };
      took.add(s.id);
    }
    const lines = sb && of ? linesTakeWords(of.take.n, takes[0].n, sb.version, of.how) : undefined;
    if (sb) s.boards = { version: sb.version, why: sb.why, panels: sb.panels.length, ...(sb.newer ? { newer: sb.newer } : {}), ...(of ? { take: of.take.n, newestTake: takes[0].n, takeHow: of.how } : {}), ...(lines ? { lines } : {}) };
    // the shots' start and end: the take's own where it has them, else the shot file's (the shot file is rewritten
    // with every take, so it may already be a newer take's)
    const fileShots = j.shots;
    const list = of?.take.shots.length ? of.take.shots.map((x) => ({ ...(fileShots.find((y, i) => String(y?.id ?? i + 1) === x.id) ?? {}), id: x.id, t0: x.t0, t1: x.t1 })) : fileShots;
    const shots: PlanShot[] = [];
    list.forEach((x, i) => {
      if (typeof x?.t0 !== 'number' || typeof x.t1 !== 'number') return;
      const id = String(x.id ?? i + 1);
      const f = file.get(id);
      const text = f ? (f.size ? `${sentence(f.title)}. ${f.size}` : sentence(f.title)) : undefined;
      shots.push({ n: shots.length + 1, id, t0: x.t0, t1: x.t1, ...(text ? { text } : {}), ...(x.in_frame?.length ? { inFrame: inFrameWords(x.in_frame, sc.names) } : {}),
        ...(() => {
          const ps = (sb?.panels ?? []).filter((p) => p.shot === id).map((p) => ({ n: p.n, t: p.t, src: p.src }));
          return ps.length ? { board: [...ps].sort((a, b) => a.t - b.t)[0].src, panels: ps } : {};
        })() });
    });
    if (shots.length) s.shots = shots;
  }
  // a scene with no storyboard shown: its newest take's lines, as before
  for (const s of sc.scenes) {
    if (took.has(s.id)) continue;
    const pv = await previzOf(film, s.id);
    if (pv) s.previz = pv;
  }
  return { ...(sc.locked ? { locked: sc.locked } : {}), pace: sc.pace, scenes: sc.scenes };
}

// ---- the steps

export interface PlanAnswer extends Partial<WorkingAnswer> {
  /** Nothing to change: the cut already says what the files say. */
  same?: boolean;
  words?: string;
  /** The version written (a step by Alma, or the first cut). */
  version?: string;
  /** Tracks kept as they were because they were changed by hand. */
  kept?: string[];
}

const timelineOf = (c: { fps: Timeline['fps']; width: number; height: number; tracks: Timeline['tracks']; markers: Timeline['markers'] }, version = 'v0'): Timeline =>
  ({ version, fps: c.fps, width: c.width, height: c.height, at: new Date().toISOString(), tracks: c.tracks, markers: c.markers ?? [] });

/** After a version the app wrote on a real film: its check, as the save route does (loaded late, as alma-drop does). */
async function afterVersion(s: CutStore, version: string): Promise<void> {
  if (!s.files) return;
  const { afterNewVersion } = await import('./render');
  await afterNewVersion(s.film.slug, version, 'page').catch(() => undefined);
}

/** One step on the working cut (by the page: a step; by Alma: a step and a version with her words). */
async function stepAndSave(s: CutStore, rev: number, tl: Timeline, words: string, by: 'user' | 'alma'): Promise<PlanAnswer> {
  const stepped = await stepNow(s, { rev, words, by, tracks: tl.tracks, markers: tl.markers });
  if (stepped.same) return { ...stepped, same: true };
  if (by !== 'alma') return { ...stepped, words };
  const saved = await saveNow(s, { rev: stepped.working.rev, why: 'alma', note: words });
  if (saved.made) await afterVersion(s, saved.version);
  return { working: saved.working, history: saved.history, words, version: saved.version };
}

/** The cut and the history now, or the first cut from the locked script. `rev`, when given, must be the history's. */
async function here(s: CutStore, rev?: number): Promise<{ tl?: Timeline; rev?: number }> {
  const a = await ensureNow(s);
  if (!a) return {};
  const h = (await historyNow(s))!;
  if (rev !== undefined && rev !== h.rev) throw new WorkingError('stale', `the cut changed meanwhile (it is at ${h.rev}, not ${rev}): reload and ask again`, 409, [], h.rev);
  return { tl: timelineOf(await stateNow(s, h), a.working.version), rev: h.rev };
}

/** Brings the cut up to date with the film's files (`bringUp`) as one step. A film with no cut gets its first version. */
export function planUpdate(s: CutStore, src: PlanSource | undefined, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    if (!src) throw new CutError('This film has no script.md with a "## Script" section yet.', 409);
    if (!src.locked) throw new CutError('The script is not locked yet: the timeline starts when it is.', 409);
    const now = await here(s, o.rev);
    // the first cut takes the brief's frame (src/lib/frame.ts); a cut there already keeps its own
    const b = bringUp(now.tl, src, now.tl ? {} : frameSize(await s.aspect()));
    if (!b) return { same: true, ...(now.tl ? await peekNow(s) : {}) };
    if (!now.tl) {
      // the first cut: written as v1, then the working cut and its history seeded from it
      const t = await s.saveVersion({ note: b.words, by: o.by, tracks: b.tl.tracks, markers: b.tl.markers, fps: b.tl.fps, width: b.tl.width, height: b.tl.height });
      await afterVersion(s, t.version);
      const a = await ensureNow(s);
      return { ...(a ?? {}), words: b.words, version: t.version };
    }
    return { ...(await stepAndSave(s, now.rev!, b.tl, b.words, o.by)), kept: b.kept };
  });
}

async function peekNow(s: CutStore): Promise<Partial<WorkingAnswer>> {
  const a = await ensureNow(s);
  return a ?? {};
}

/** What an update would change, without writing anything: its words, or nothing. */
export async function planPending(s: CutStore | undefined, src: PlanSource | undefined): Promise<{ locked: boolean; pending?: string; first?: boolean; boards?: BoardsNote[] }> {
  if (!src?.locked) return { locked: false };
  const boards = boardsNotes(src);
  return { ...(await pendingOf(s, src)), ...(boards.length ? { boards } : {}) };
}

/** Per scene, the storyboard version its boards come from and why, for the page to say. */
export interface BoardsNote { scene: string; version: string; why: string; panels: number; newer?: string; take?: number; newestTake?: number; takeHow?: 'check' | 'card' | 'nearest'; lines?: string }
export const boardsNotes = (src: PlanSource): BoardsNote[] => src.scenes.flatMap((x) => (x.boards ? [{ scene: x.id, ...x.boards }] : []));

async function pendingOf(s: CutStore | undefined, src: PlanSource): Promise<{ locked: boolean; pending?: string; first?: boolean }> {
  if (!s) return { locked: true, first: true, pending: bringUp(undefined, src)?.words };
  const h = await historyNow(s).catch(() => undefined);
  if (!h) {
    const newest = await s.newestReadable().catch(() => undefined);
    const b = bringUp(newest, src);
    return { locked: true, ...(newest ? {} : { first: true }), ...(b ? { pending: b.words } : {}) };
  }
  const tl = timelineOf(await stateNow(s, h));
  const b = bringUp(tl, src);
  return { locked: true, ...(b ? { pending: b.words } : {}) };
}

/** A scene's take in place of its boards (`takeForBoards`), as one step. */
export function planTake(s: CutStore, scene: string, take: TakeIn, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    const now = await here(s, o.rev);
    if (!now.tl) throw new WorkingError('no-cut', 'this film has no cut yet', 404);
    const r = takeForBoards(now.tl, scene, take);
    if (typeof r === 'string') throw new CutError(r, 409);
    return stepAndSave(s, now.rev!, r.tl, r.words, o.by);
  });
}

/** "Put the boards back" (`boardsBack`), as one step. */
export function planBoards(s: CutStore, scene: string, src: PlanSource | undefined, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    if (!src) throw new CutError('This film has no script to build the boards from.', 409);
    const now = await here(s, o.rev);
    if (!now.tl) throw new WorkingError('no-cut', 'this film has no cut yet', 404);
    const r = boardsBack(now.tl, scene, src);
    if (typeof r === 'string') throw new CutError(r, 409);
    return stepAndSave(s, now.rev!, r.tl, r.words, o.by);
  });
}

/** A take as `takeForBoards` takes it: its file, its length and whether it has sound. */
export async function takeInfo(film: FilmTarget, t: { src: string; name: string; seconds?: number }): Promise<TakeIn | undefined> {
  const abs = resolveSrc(film, t.src);
  const p = abs ? await probe(abs) : undefined;
  const seconds = p?.duration ?? t.seconds;
  if (!seconds) return undefined;
  return { src: t.src, name: t.name, seconds, sound: p ? p.audio : true };
}

export { hasPlanned };

/** A scene's layout in its place (`chooseLayout`), as one step: its newest take, else its boards
 *  and lines. `put` is what the caller read for it. Nothing changes when the cut uses that layout already. */
export function planLayout(s: CutStore, scene: string, l: Layout, layouts: Layout[], put: { take: TakeIn } | { scene: PlanScene; pace: PlanSource['pace'] }, o: { by: 'user' | 'alma'; rev?: number }): Promise<PlanAnswer> {
  return inFilmQueue(s, async () => {
    const now = await here(s, o.rev);
    if (!now.tl) throw new WorkingError('no-cut', 'this film has no cut yet', 404);
    const was = layoutInCut(now.tl, scene, layouts);
    if (was?.key === l.key) return { same: true, words: `${scene} uses Layout ${l.n} already.`, ...(await peekNow(s)) };
    const r = chooseLayout(now.tl, scene, l, put, was);
    if (typeof r === 'string') throw new CutError(r, 409);
    return stepAndSave(s, now.rev!, r.tl, r.words, o.by);
  });
}
