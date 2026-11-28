// The Shots page's list (the design's row 3): each scene's places in order (1, 2, 3, 4, 4a, 4b, 4c, 5),
// each place with every version made of it, newest first. Pure: from the takes cut into their shots (server/edit/
// shots.ts), each generation's shot list and prompt (server/films/read/shotlist.ts) and the cut. Nothing is written.
//
// The one rule for which place of its scene a shot stands for: the Shots page, Shot details
// (useShotPlaces.ts) and the Takes view (edit/pickupRows.ts) all ask this function, and nothing else decides it. How a
// shot of a take finds its place, in this order:
//   0. the pick-up's stands record (<G>-stands.json, stands.ts), matched to the shots the take was cut into;
//   1. a list as long as the shots the take was cut into: its generation's shots file, else its newest prompt's SHOT
//      headings, else the ids the server already found (the previz take its sent record names);
//   2. the take's check (check.json) planned fewer cuts than the take has: each planned cut is matched to the nearest
//      cut found, in order; a planned shot cut in two keeps its longest piece, and the other piece is "a cut the prompt
//      did not ask for";
//   2b. a pick-up's shots file of another count, with times in the take: matched by time (FIX-snatch-S10's one-shot
//      file for a take cut in two: both pieces under its place, said plainly);
//   3. the cut names the shot ("S6 · FIX-S6b · take 1 · shot 3"): that clip is a version of place 3;
//   4. otherwise the shot is listed under "other takes of this scene", with why. Nothing is placed by a guess.
// Then the cut, for a pick-up in the film: where its clip sits among its scene's placed clips. A place said above stands
// when it fits there; when it does not and the cut leaves places open, the cut's are shown and both are said
// (`conflict`); a clip nothing placed takes the places open there (FIX-year-S1 take 2 after place 4: 5 and 6). Then
// another take of the same pick-up stands where it stands.
// A whole-scene replan (a shots file 1 … N of another length, not a part of an earlier version) is a new version of
// the scene: the newest version is the scene, the older ones fold under "earlier versions of this scene".
import type { Timeline, TimelineClip } from '@/server/types';
import { labelShot, mainTracks } from '@/components/edit/shots';
import { parseShotId } from '@/components/edit/shotCols';
import { fitsGap, gapOf, gapWords, matchShots, placeCmp, placesLabel, placeTag, standsOfTake, type Claim, type Inside, type StandsRecord } from './stands';

export { placeCmp, placeTag } from './stands';

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
  /** Its stands record (`<G>-stands.json`, stands.ts): which place or places each of its shots stands for. */
  stands?: StandsRecord;
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
  /** Every place it stands for, when more than one (FIX-year-S1 take 2 replaced places 5 and 6 as one clip): it is
   *  listed under the first. */
  places?: string[];
  /** The places as the page names the shot: "5–6"; absent when it is the one place. */
  label?: string;
  /** The part of a place it is (an insert, or the start of a place that cuts back to another take). */
  inside?: Inside;
  /** The record (or the shots file) and the cut disagree about its place: what each says. The cut's place is shown. */
  conflict?: string;
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
interface Entry extends Made { place?: string; version: number; clips: TimelineClip[]; pickup: boolean; how?: string }

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
        // a pick-up is never a version of the scene: one with a stands record, or a shots file of under half the scene's
        // places (FIX-hands-S14 written as 1, 2 for a scene of 6), is a pick-up of those places of the version now
        if (!into && (g.stands || ids.length * 2 <= cur.ids.length)) into = cur;
        if (!into) {
          const v: Version = { n: versions.length + 1, gens: [g.name], ids, timing: timingOf(g.plan), written: g.written, owner: g.name, added: new Map() };
          versions.push(v); genVersion.set(g.name, v);
          continue;
        }
      }
      into ??= cur;
      into.gens.push(g.name); genVersion.set(g.name, into);
      // a shot added after another ("4a" after 4) becomes a place of the version; nothing is renumbered
      for (const id of [...(ids ?? []), ...(g.prompt ?? []).map(placeTag), ...(g.stands ? [g.stands.shots, ...Object.values(g.stands.takes ?? {})].flat().flatMap((x) => x.places) : [])]) {
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
        return { key: `${t.src}#${s.i}@${s.from.toFixed(2)}`, src: t.src, gen, take: label, i: s.i, from: s.from, to: s.to, made: t.made, inFilm: clips.length > 0, clips, place, version: ver.n, pickup: gen !== sid, ...(note ? { note } : {}) };
      };
      // a claim (stands.ts): its first place is where it is listed, all of them are what it stands for
      const claimed = (s: { i: number; from: number; to: number }, c: Claim, how: string): Entry => {
        const e = entry(s, c.places[0], c.note);
        e.how = how;
        if (c.places.length > 1) { e.places = c.places; e.label = placesLabel(c.places, ver.ids); }
        // one listed shot the take was cut in pieces: each piece stands where it does, named "2 · 1/2", "2 · 2/2"
        if (c.piece) e.label = `${e.label ?? c.places[0]} · ${c.piece.k}/${c.piece.of}`;
        if (c.inside) e.inside = c.inside;
        return e;
      };
      // 0. the pick-up's stands record, written when it landed: what it stands for, matched to the shots found
      if (g?.stands) {
        const dir = takeFolder(t.src).split('/').pop() ?? '';
        const claims = matchShots(standsOfTake(g.stands, dir), segs);
        segs.forEach((s, k) => entries.push(claimed(s, claims[k], 'record')));
        continue;
      }
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
      // a pick-up's shots file of another count than the take's shots, with times in the take: matched by time, so a
      // shot cut in two keeps its place for both pieces (FIX-snatch-S10's one-shot file), never neither
      if (gen !== sid && g?.plan && g.plan.every((p) => p.t1 !== undefined) && Math.abs((g.plan[0].t0 ?? 0)) < 0.5 && Math.abs(g.plan[g.plan.length - 1].t1! - t.seconds!) < 0.5) {
        const claims = matchShots(g.plan.map((p) => ({ places: [placeTag(p.id)], t0: p.t0 ?? 0, t1: p.t1 })), segs, 'its shots file');
        if (claims.some((c) => c.places.length)) {
          segs.forEach((s, k) => { const e = claimed(s, claims[k], 'shots file'); if (!e.place) e.note = claims[k].note; entries.push(e); });
          continue;
        }
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

    // ---- a pick-up's clip in the cut: where it sits among its scene's placed clips. The cut is what the film
    // is; a place said by the record, the shots file or the prompt stands when it fits there (between the placed clips
    // before and after it, either included: an insert, a split place, the scene's own shot kept after it), and refines
    // it; when it does not fit and the cut leaves places open there, the cut's places are shown and the two are told
    // apart in words. A clip nothing places stands for the places open where it sits, when a placed clip is beside it.
    const allOf = (e: Entry): string[] => e.places ?? (e.place ? [e.place] : []);
    const entryOf = (c: TimelineClip) => entries.find((e) => e.clips.includes(c));
    const placesOfClip = (c: TimelineClip) => { const e = entryOf(c); return e?.place && placesOf(e.version).includes(e.place) ? allOf(e) : undefined; };
    const setPlaces = (e: Entry, ps: string[]) => {
      e.place = ps[0];
      if (ps.length > 1) { e.places = ps; e.label = placesLabel(ps, placesOf(e.version)); } else { delete e.places; delete e.label; }
    };
    for (const folder of [...new Set(entries.filter((e) => e.pickup && e.inFilm).map((e) => takeFolder(e.src)))]) {
      const mineIn = sceneClips.filter((c) => takeFolder(c.src!) === folder);
      const skip = (c: TimelineClip) => takeFolder(c.src!) === folder;
      // the take's clips by the gap they sit in: a run of them between the same placed clips shares it
      const runs: { gap: ReturnType<typeof gapOf>; clips: TimelineClip[] }[] = [];
      for (const c of mineIn) {
        const e = entryOf(c);
        if (!e) continue;
        const ids = placesOf(e.version);
        const filled = new Set(entries.filter((x) => x.inFilm && x.version === e.version && takeFolder(x.src) !== folder).flatMap(allOf));
        const gap = gapOf(sceneClips, sceneClips.indexOf(c), placesOfClip, skip, ids, filled);
        const last = runs[runs.length - 1];
        if (last && last.gap.after === gap.after && last.gap.before === gap.before) last.clips.push(c); else runs.push({ gap, clips: [c] });
      }
      for (const { gap, clips } of runs) {
        const es = [...new Set(clips.map(entryOf).filter((e): e is Entry => !!e))];
        const beside = gap.after !== undefined || gap.before !== undefined;
        // what the cut alone says: one place each when as many are open as there are shots; for one shot, the run of open
        // places from the placed clip beside it whose planned length is nearest the clip's (FIX-year-S1 take 2, 5.6 s
        // after place 4: places 5 and 6, planned 4.6 s, rather than 5 alone, 2.6 s); with no planned times, the open
        // places when they are two at most, else none
        const runFor = (e: Entry): string[] | undefined => {
          const o = gap.open;
          if (o.length === 1) return o;
          const timing = versions[e.version - 1].timing;
          const len = (ps: string[]) => ps.reduce((a, p) => { const t = timing.get(p); return a + (t?.t0 !== undefined && t.t1 !== undefined ? t.t1 - t.t0 : NaN); }, 0);
          const secs = e.clips.reduce((a, c) => a + (c.out - c.in), 0);
          const runs = o.map((_, k) => (gap.after !== undefined ? o.slice(0, k + 1) : o.slice(o.length - 1 - k)));
          if (runs.some((r) => !Number.isFinite(len(r)))) return o.length <= 2 ? o : undefined;
          return runs.reduce((a, r) => (Math.abs(len(r) - secs) < Math.abs(len(a) - secs) ? r : a));
        };
        const byCut = (k: number): string[] | undefined => !beside || !gap.open.length ? undefined
          : es.length === gap.open.length ? [gap.open[k]] : es.length === 1 ? runFor(es[0]) : undefined;
        es.forEach((e, k) => {
          const said = e.place && placesOf(e.version).includes(e.place) ? allOf(e) : [];
          const cut = byCut(k);
          if (said.length && fitsGap(gap, said)) {
            // one shot alone in the gap, said for the first of the places the cut has it replacing: it stands for all of
            // them (it replaced them as one clip: FIX-year-S1 take 2, its file "5", for 5 and 6)
            if (es.length === 1 && cut && cut.length > said.length && said.every((p, j) => cut[j] === p)) {
              setPlaces(e, cut);
              e.note = `${e.note ? `${e.note} ` : ''}In the cut it sits ${gapWords(gap)}, where places ${placesLabel(cut, placesOf(e.version))} are out of the film: it stands for them.`;
            }
            return;
          }
          if (said.length) {
            const from = e.how === 'record' ? 'its stands record' : e.how === 'shots file' || !e.how ? 'its shot list' : e.how;
            if (cut) {
              e.conflict = `${cap(from)} says place ${placesLabel(said)}; in the cut it sits ${gapWords(gap)}, so it is shown at ${placesLabel(cut, placesOf(e.version))}.`;
              setPlaces(e, cut);
            } else if (e.how === 'record') {
              e.conflict = `${cap(from)} says place ${placesLabel(said)}; in the cut it sits ${gapWords(gap)}.`;
            }
            if (e.conflict) e.note = `${e.note ? `${e.note} ` : ''}${e.conflict}`;
            return;
          }
          if (cut) {
            setPlaces(e, cut);
            e.note = `Nothing names its place; in the cut it sits ${gapWords(gap)}, in place of ${cut.length > 1 ? 'places' : 'place'} ${placesLabel(cut, placesOf(e.version))}.`;
            e.how = 'cut';
          }
        });
      }
    }
    // ---- another take of the same pick-up, cut into as many shots, stands where it stands (FIX-year-S1 take 1 beside
    // take 2, which the film uses): a pick-up's takes are made for the same places
    for (const e of entries) {
      if (!e.pickup || (e.place && placesOf(e.version).includes(e.place))) continue;
      const count = (src: string) => entries.filter((x) => x.src === src).length;
      const sib = entries.find((x) => x.gen === e.gen && x.src !== e.src && x.i === e.i && x.version === e.version && x.place && placesOf(x.version).includes(x.place) && count(x.src) === count(e.src));
      if (!sib) continue;
      setPlaces(e, allOf(sib));
      if (sib.inside) e.inside = sib.inside;
      e.note = `Another take of ${e.gen}, ${sib.take.toLowerCase()}, stands for place ${sib.label ?? sib.place}${sib.inFilm ? ' in the film' : ''}, so this one does too.`;
    }

    // ---- assemble
    const newest = (a: Made, b: Made) => (b.made ?? 0) - (a.made ?? 0) || b.take.localeCompare(a.take, undefined, { numeric: true }) || b.gen.localeCompare(a.gen) || a.i - b.i;
    const strip = (e: Entry): Made => { const { place: _p, version: _v, clips: _c, pickup: _k, how: _h, ...m } = e; void _p; void _v; void _c; void _k; void _h; return m; };
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
