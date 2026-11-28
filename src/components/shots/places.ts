// The Shots page's list (the design's row 3): each scene's places in order (1, 2, 3, 4, 4a, 4b, 4c, 5),
// each place with every version made of it, newest first. Pure: from the takes cut into their shots (server/edit/
// shots.ts), each generation's shot list and prompt (server/films/read/shotlist.ts) and the cut. Nothing is written.
//
// How a shot of a take finds its place, in this order:
//   1. a list as long as the shots the take was cut into: its generation's shots file, else its newest prompt's SHOT
//      headings, else the ids the server already found (the previz take its sent record names);
//   2. the take's check (check.json) planned fewer cuts than the take has: each planned cut is matched to the nearest
//      cut found, in order; a planned shot cut in two keeps its longest piece, and the other piece is "a cut the prompt
//      did not ask for";
//   3. the cut names the shot ("S6 · FIX-S6b · take 1 · shot 3"): that clip is a version of place 3;
//   4. otherwise the shot is listed under "other takes of this scene", with why. Nothing is placed by a guess.
// A shot whose number is not a place of the scene (FIX-close-S6 calls its shot "10"; S6 has 7 places) stands where the
// cut has it when the cut leaves exactly one place open there, and so does the same shot of the pick-up's other takes;
// else it goes with the other takes, with why.
// A whole-scene replan (a shots file 1 … N of another length, not a part of an earlier version) is a new version of
// the scene: the newest version is the scene, the older ones fold under "earlier versions of this scene".
import type { Timeline, TimelineClip } from '@/server/types';
import { labelShot, mainTracks } from '@/components/edit/shots';
import { parseShotId } from '@/components/edit/shotCols';

export interface PlanShot { id: string; t0?: number; t1?: number }
/** One generation folder (generations/S6, generations/FIX-S6b): what it plans and how far it went. */
export interface GenPlan {
  name: string;
  scene: string;
  /** Its shots file (`<G>-shots.json`), in order. */
  plan?: PlanShot[];
  /** The SHOT numbers of its newest prompt, in order ("5", "6", "7"). */
  prompt?: string[];
  /** When its shots file was written (ms). */
  written?: number;
  /** The first storyboard panel of each shot (repo-relative), from previz/<G>/storyboard. */
  board?: { shot: string; src: string }[];
  /** The newest previz take of the scene (repo-relative video), for a place with neither take nor panel. */
  previz?: string;
  /** The pick-up was dropped (its dropped.txt). */
  dropped?: boolean;
}
/** A take as the server cuts it (edit/shots.ts TakeShots), with its check's planned cuts. */
export interface TakeIn {
  src: string; scene: string; name: string; group?: string;
  seconds?: number; cuts?: number[]; ids?: number[]; tags?: string[];
  state: string; made?: number;
  /** check.json's `planned_cuts`: where the prompt asked for cuts, in seconds. */
  planned?: number[];
}

/** One version of a place: one shot of one take. `i` is the shot's place in its take (1, 2, 3 …), for Shot details. */
export interface Made {
  key: string;
  src: string;
  gen: string;
  /** "Take 5", or the take's own name for one that is not numbered ("Seedance take 2"). */
  take: string;
  i: number;
  from: number;
  to: number;
  made?: number;
  inFilm: boolean;
  /** How its place was known, or why it has none, in words. */
  note?: string;
}
export interface Place {
  id: string;
  versions: Made[];
  /** The storyboard panel, or a frame of the previz take, for a place nothing was made of yet. */
  board?: { src: string; t?: number };
}
export interface SceneVersion {
  n: number;
  gens: string[];
  places: Place[];
  written?: number;
  /** No take of this version has landed. */
  unmade: boolean;
}
export interface Extra { v: Made; after?: string; before?: string }
export interface SceneShots {
  id: string;
  title: string;
  /** Newest first: the first is the scene now. */
  versions: SceneVersion[];
  /** While the newest version has no takes: the version the film still uses. */
  filmVersion?: number;
  /** Shots of the scene's takes whose place could not be known. */
  other: Made[];
  /** Cuts a take made that its prompt did not ask for. */
  extras: Extra[];
}
export interface ShotsList { scenes: SceneShots[]; made: number; inFilm: number }

// ---------------------------------------------------------------------------------------------------- small parts

/** A shot id as a place: "4", "4a" ("4A" in some files); anything else as written, lowercased. */
export const placeTag = (raw: string): string => parseShotId(raw)?.tag ?? String(raw).trim().toLowerCase();
/** Places in order: by number, then letter ("4" before "4a" before "5"). */
export function placeCmp(a: string, b: string): number {
  const x = parseShotId(a), y = parseShotId(b);
  if (!x || !y) return x ? -1 : y ? 1 : a.localeCompare(b);
  return x.n - y.n || x.tag.localeCompare(y.tag);
}
/** The generation folder a take file is in: the folder before `takes/` ("FIX-S6b"). */
export function genOf(src: string): string {
  const parts = src.split('/');
  const k = parts.lastIndexOf('takes');
  return k > 0 ? parts[k - 1] : parts[parts.length - 2] ?? '';
}
/** The take's folder: two files of one take (its "-nospot" fix beside it) share it. Takes kept loose in `takes/`
 *  (blocks/S1/takes/S1-grey-take1-480p.mp4) are their own file. */
export function takeFolder(src: string): string {
  const parts = src.split('/');
  const k = parts.lastIndexOf('takes');
  return k >= 0 && parts.length - k > 2 ? parts.slice(0, k + 2).join('/') : src;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "FIX-asia-S7 · take 5" → "Take 5"; "take 1" → "Take 1"; "FIX-burst · seedance take 2" → "Seedance take 2". */
export function takeLabel(name: string, gen: string): string {
  const rest = name.split(' · ').filter((p) => p !== gen && p.replace(/[-_]+/g, ' ') !== gen.replace(/[-_]+/g, ' ')).join(' · ') || name;
  return cap(rest.trim());
}
const isWhole = (ids: string[]) => ids.length >= 2 && ids.every((x, i) => x === String(i + 1));
const mid = (c: TimelineClip) => (c.in + c.out) / 2;
const near = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.abs(a - b) < 0.15;

/** Match each planned cut to one found cut, in order, the nearest in all (a small dynamic programme: takes have under
 *  twenty cuts). The index in `found` of each planned cut, or undefined when one lies over `slack` seconds away. */
export function alignCuts(found: number[], planned: number[], slack = 3): number[] | undefined {
  const F = found.length, P = planned.length;
  if (!P || F < P) return undefined;
  const INF = 1e9;
  // best[p][f]: the least cost of matching planned 0..p-1 within found 0..f-1
  const best = Array.from({ length: P + 1 }, () => new Array<number>(F + 1).fill(INF));
  for (let f = 0; f <= F; f++) best[0][f] = 0;
  for (let p = 1; p <= P; p++) for (let f = p; f <= F; f++) {
    const d = Math.abs(found[f - 1] - planned[p - 1]);
    best[p][f] = Math.min(best[p][f - 1], d <= slack ? best[p - 1][f - 1] + d : INF);
  }
  if (best[P][F] >= INF) return undefined;
  const out: number[] = new Array(P);
  for (let p = P, f = F; p > 0; f--) {
    if (best[p][f] === best[p][f - 1] && f - 1 >= p) continue;
    out[p - 1] = f - 1; p--;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- the list

interface Version { n: number; gens: string[]; ids: string[]; timing: Map<string, PlanShot>; written?: number; owner: string; added: Map<string, string> }
interface Entry extends Made { place?: string; version: number; clips: TimelineClip[] }

export function shotPlaces(input: { scenes: { id: string; title: string; shots?: number }[]; gens: GenPlan[]; takes: TakeIn[]; cut?: Timeline }): ShotsList {
  const { cut } = input;
  const ready = input.takes.filter((t) => t.state === 'ready' && !t.group && t.seconds);
  const v1 = cut ? (mainTracks(cut).v?.clips ?? []).filter((c) => !c.plan && c.src && !c.muted) : [];
  const sceneOfClip = (c: TimelineClip) => c.takeRef?.scene ?? c.scene;
  const genPlans = new Map(input.gens.map((g) => [g.name, g]));
  // the scenes in the order the film runs (first appearance in the cut), then the rest as the film lists them
  const order: string[] = [];
  for (const c of [...v1].sort((a, b) => a.at - b.at)) { const s = sceneOfClip(c); if (s && !order.includes(s) && input.scenes.some((x) => x.id === s)) order.push(s); }
  for (const s of input.scenes) if (!order.includes(s.id)) order.push(s.id);

  let made = 0, inFilm = 0;
  const scenes: SceneShots[] = [];
  for (const sid of order) {
    const sc = input.scenes.find((x) => x.id === sid)!;
    const takes = ready.filter((t) => t.scene === sid);
    // the scene's generations: its shots files, and any folder its takes are in
    const names = new Set<string>([...input.gens.filter((g) => g.scene === sid).map((g) => g.name), ...takes.map((t) => genOf(t.src))]);
    const firstMade = (g: string) => Math.min(Infinity, ...takes.filter((t) => genOf(t.src) === g).map((t) => t.made ?? Infinity));
    const when = (g: string) => (g === sid ? -Infinity : genPlans.get(g)?.written ?? (Number.isFinite(firstMade(g)) ? firstMade(g) : Infinity));
    const gens = [...names].map((n) => genPlans.get(n) ?? { name: n, scene: sid }).filter((g) => !(g.dropped && !takes.some((t) => genOf(t.src) === g.name)))
      .sort((a, b) => when(a.name) - when(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }));

    // ---- the versions of the scene
    const base = gens.find((g) => g.name === sid);
    const baseTakes = takes.filter((t) => genOf(t.src) === sid);
    let baseIds = base?.plan?.map((p) => placeTag(p.id));
    if (!baseIds?.length) {
      const n = sc.shots ?? Math.max(0, ...baseTakes.map((t) => (t.cuts?.length ?? 0) + 1));
      baseIds = Array.from({ length: n }, (_, i) => String(i + 1));
    }
    const timingOf = (plan?: PlanShot[]) => new Map((plan ?? []).map((p) => [placeTag(p.id), p]));
    const versions: Version[] = [];
    const genVersion = new Map<string, Version>();
    const v0: Version = { n: 1, gens: [], ids: baseIds, timing: timingOf(base?.plan), written: base?.written, owner: base?.name ?? sid, added: new Map() };
    versions.push(v0);
    if (base) { v0.gens.push(base.name); genVersion.set(base.name, v0); }
    for (const g of gens) {
      if (g === base) continue;
      const ids = g.plan?.map((p) => placeTag(p.id));
      const cur = versions[versions.length - 1];
      let into: Version | undefined;
      if (ids && isWhole(ids)) {
        const newestFirst = [...versions].reverse();
        // a part of a version: fewer shots, each timed as that version's shot of the same number (FIX-S5a); a version
        // that has takes first (FIX-S5a redoes version 2's shots, which version 3 also begins with, never made)
        const partOf = (v: Version) => ids.length < v.ids.length && g.plan!.every((p) => { const o = v.timing.get(placeTag(p.id)); return o ? near(o.t0, p.t0) && near(o.t1, p.t1) : false; });
        const made = (v: Version) => v.gens.some((x) => takes.some((t) => genOf(t.src) === x));
        into = newestFirst.find((v) => v.ids.length === ids.length)
          ?? newestFirst.find((v) => made(v) && partOf(v)) ?? newestFirst.find(partOf)
          // with no times to compare, fewer shots than the version now is a part of it
          ?? (ids.length < cur.ids.length && !g.plan!.some((p) => p.t0 !== undefined) ? cur : undefined);
        if (!into) {
          const v: Version = { n: versions.length + 1, gens: [g.name], ids, timing: timingOf(g.plan), written: g.written, owner: g.name, added: new Map() };
          versions.push(v); genVersion.set(g.name, v);
          continue;
        }
      }
      into ??= cur;
      into.gens.push(g.name); genVersion.set(g.name, into);
      // a shot added after another ("4a" after 4) becomes a place of the version; nothing is renumbered
      for (const id of [...(ids ?? []), ...(g.prompt ?? []).map(placeTag)]) {
        const p = parseShotId(id);
        if (p && p.tag !== String(p.n) && !into.ids.includes(p.tag) && into.ids.includes(String(p.n))) { into.ids.push(p.tag); into.added.set(p.tag, g.name); }
      }
      into.ids.sort(placeCmp);
    }

    // ---- every shot of every take, placed where the data says
    const entries: Entry[] = [];
    const extras: Extra[] = [];
    const clipsOf = (src: string) => v1.filter((c) => takeFolder(c.src!) === takeFolder(src));
    for (const t of takes) {
      const gen = genOf(t.src);
      const g = genPlans.get(gen);
      const ver = genVersion.get(gen) ?? versions[versions.length - 1];
      const b = [0, ...(t.cuts ?? []), t.seconds!];
      const segs = b.slice(0, -1).map((x, k) => ({ i: k + 1, from: x, to: b[k + 1] }));
      made += segs.length;
      const label = takeLabel(t.name, gen);
      const mine = clipsOf(t.src);
      const entry = (s: { i: number; from: number; to: number }, place: string | undefined, note?: string): Entry => {
        const clips = mine.filter((c) => mid(c) >= s.from - 1e-6 && mid(c) < s.to + 1e-6);
        return { key: `${t.src}#${s.i}@${s.from.toFixed(2)}`, src: t.src, gen, take: label, i: s.i, from: s.from, to: s.to, made: t.made, inFilm: clips.length > 0, clips, place, version: ver.n, ...(note ? { note } : {}) };
      };
      const lists: [string, string[] | undefined][] = [
        ['shots file', g?.plan?.map((p) => placeTag(p.id))],
        ['prompt', g?.prompt?.map(placeTag)],
        ['previz take', t.tags ?? t.ids?.map(String)],
      ];
      // a generation without its own list: its scene's base list, for the base's own takes
      if (gen === sid && !g?.plan) lists.unshift(['scene', baseIds]);
      const fit = lists.find(([, l]) => l && l.length === segs.length);
      if (fit) { for (const s of segs) entries.push(entry(s, fit[1]![s.i - 1])); continue; }
      // the check planned fewer cuts than were found: match them up; the extra pieces are cuts not asked for
      const plannedList = t.planned && lists.find(([, l]) => l && l.length === t.planned!.length + 1)?.[1];
      const match = plannedList && t.cuts && t.cuts.length > t.planned!.length ? alignCuts(t.cuts, t.planned!) : undefined;
      if (plannedList && match) {
        const shotOfSeg = segs.map((s) => match.filter((f) => t.cuts![f] <= s.from + 1e-6).length);
        const groups = new Map<number, typeof segs>();
        segs.forEach((s, k) => groups.set(shotOfSeg[k], [...(groups.get(shotOfSeg[k]) ?? []), s]));
        for (const [p, ss] of groups) {
          const keep = ss.reduce((a, x) => (x.to - x.from > a.to - a.from ? x : a));
          for (const s of ss) {
            if (s === keep) { entries.push(entry(s, plannedList[p])); continue; }
            const e = entry(s, undefined);
            const after = s.from >= keep.to ? plannedList[p] : plannedList[p - 1];
            const before = s.from >= keep.to ? plannedList[p + 1] : plannedList[p];
            extras.push({ v: e, ...(after ? { after } : {}), ...(before ? { before } : {}) });
            entries.push({ ...e, place: undefined, note: 'extra' });
          }
        }
        continue;
      }
      // the cut names its shots: each named clip is a version of that place, the rest of the take is unplaced
      const named = mine.map((c) => ({ c, tag: labelShot(c) })).filter((x): x is { c: TimelineClip; tag: string } => !!x.tag);
      const why = `${segs.length === 1 ? 'Its one shot' : `Its ${segs.length} shots`} could not be matched to places: ${[g?.plan ? `its shots file lists ${g.plan.length}` : '', g?.prompt ? `its prompt ${g.prompt.length}` : ''].filter(Boolean).join(', ') || 'it has no shots file or prompt to say which'}.`;
      if (named.length) {
        const covered = new Set<number>();
        for (const { c, tag } of named) {
          const s = segs.find((x) => mid(c) >= x.from && mid(c) < x.to) ?? segs[segs.length - 1];
          covered.add(s.i);
          entries.push({ ...entry({ i: s.i, from: c.in, to: c.out }, tag), clips: [c], inFilm: true, key: `${t.src}#${s.i}@${c.in.toFixed(2)}`, note: 'named in the cut' });
        }
        for (const s of segs) if (!covered.has(s.i)) entries.push(entry(s, undefined, why));
        continue;
      }
      for (const s of segs) entries.push(entry(s, undefined, why));
    }

    // ---- a shot whose number is not a place of its version: where the cut has it, when that leaves one place open
    const placesOf = (n: number) => versions[n - 1].ids;
    const sceneClips = v1.filter((c) => sceneOfClip(c) === sid).sort((a, b) => a.at - b.at);
    const placeOfClip = (c: TimelineClip) => entries.find((e) => e.clips.includes(c) && e.place && placesOf(e.version).includes(e.place))?.place;
    const stands = new Map<string, string>();
    const unknown: { e: Entry; said: string }[] = [];
    for (const e of entries) {
      if (!e.place || placesOf(e.version).includes(e.place)) continue;
      const said = e.place;
      const ids = placesOf(e.version);
      const c = e.clips[0];
      if (c) {
        const k = sceneClips.indexOf(c);
        const prev = sceneClips.slice(0, Math.max(0, k)).reverse().map(placeOfClip).find(Boolean);
        const next = sceneClips.slice(k + 1).map(placeOfClip).find(Boolean);
        const lo = prev ? ids.indexOf(prev) : -1, hi = next ? ids.indexOf(next) : ids.length;
        const filled = new Set(entries.filter((x) => x.inFilm && x.version === e.version && x.place && ids.includes(x.place)).map((x) => x.place));
        const open = ids.slice(lo + 1, hi).filter((p) => !filled.has(p));
        if (open.length === 1) { e.place = open[0]; e.note = `Its prompt calls it shot ${said}; it stands in place ${open[0]} in the film.`; stands.set(`${e.gen}|${e.version}|${said}`, open[0]); continue; }
      }
      e.place = undefined;
      e.note = `Its prompt calls it shot ${said}, and this version of the scene has no place ${said}${c ? ': the cut does not say which place it fills' : ''}.`;
      unknown.push({ e, said });
    }
    // another take of the same pick-up, its shot called by the same number, stands where the one in the film stands
    // (FIX-close-S6 take 2 beside its take 1)
    for (const { e, said } of unknown) {
      const p = stands.get(`${e.gen}|${e.version}|${said}`);
      if (p) { e.place = p; e.note = `Its prompt calls it shot ${said}; another take of ${e.gen} stands in place ${p} in the film, so this one does too.`; }
    }

    // ---- assemble
    const newest = (a: Made, b: Made) => (b.made ?? 0) - (a.made ?? 0) || b.take.localeCompare(a.take, undefined, { numeric: true }) || b.gen.localeCompare(a.gen) || a.i - b.i;
    const strip = (e: Entry): Made => { const { place: _p, version: _v, clips: _c, ...m } = e; void _p; void _v; void _c; return m; };
    const boardOf = (v: Version, id: string): Place['board'] => {
      const from = [v.added.get(id), v.owner, ...v.gens].filter((x): x is string => !!x);
      for (const n of from) {
        const panel = genPlans.get(n)?.board?.find((p) => placeTag(p.shot) === id);
        if (panel) return { src: panel.src };
      }
      // the base version's previz take, at the middle of the shot's planned time
      const tm = v.timing.get(id);
      const pv = genPlans.get(v.owner)?.previz ?? (v.n === 1 ? base?.previz : undefined);
      return pv && tm?.t0 !== undefined && tm.t1 !== undefined ? { src: pv, t: (tm.t0 + tm.t1) / 2 } : undefined;
    };
    const sv: SceneVersion[] = versions.map((v) => {
      const places = v.ids.map((id) => {
        const vs = entries.filter((e) => e.version === v.n && e.place === id).sort(newest).map(strip);
        const board = vs.length ? undefined : boardOf(v, id);
        return { id, versions: vs, ...(board ? { board } : {}) };
      });
      return { n: v.n, gens: v.gens, places, ...(v.written ? { written: v.written } : {}), unmade: !places.some((p) => p.versions.length) };
    }).reverse();
    // a take made for an earlier version of the scene says so
    const nowN = versions.length;
    const other = entries.filter((e) => !e.place && e.note !== 'extra').sort(newest)
      .map((e) => strip(e.version !== nowN && versions.length > 1 ? { ...e, note: `Made for version ${e.version} of the scene. ${e.note ?? ''}`.trim() } : e));
    inFilm += entries.filter((e) => e.inFilm).length;
    const filmVersion = sv[0].unmade ? sv.find((v) => v.places.some((p) => p.versions.some((x) => x.inFilm)))?.n : undefined;
    scenes.push({ id: sid, title: sc.title, versions: sv, ...(filmVersion ? { filmVersion } : {}), other, extras: extras.map((x) => ({ ...x, v: strip(x.v as Entry) })) });
  }
  return { scenes, made, inFilm };
}

/** The version of a place the card shows: the one in the film, else the newest. */
export const shownVersion = (p: Place): Made | undefined => p.versions.find((v) => v.inFilm) ?? p.versions[0];
/** A version's counts: places, shots made, shots in the film. */
export function versionCounts(v: SceneVersion): { places: number; made: number; inFilm: number } {
  const all = v.places.flatMap((p) => p.versions);
  return { places: v.places.length, made: all.length, inFilm: all.filter((x) => x.inFilm).length };
}
