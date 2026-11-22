// FilmState: everything a film's pages render, assembled from its files only.
// The contract's fields are filled where the files say so; what the contract has no field for rides
// in `extra` (film level) and `more` (on characters, locations, scenes, takes, spend lines).
import path from 'node:path';
import type { Cost, FilmState, Round, SoundSummary } from '../types';
import { harnessConfig } from '../config';
import { readBrief } from './read/brief';
import { readCut, readRecordAhead } from './read/cut';
import { withTimeline } from '../edit/state';
import { readCharacters, type CharacterRefX } from './read/cast';
import { readLocations, type LocationRefX } from './read/locations';
import { readPost } from './read/post';
import { masterYesOf, readMaster } from './read/master';
import { readPreviz, type PrevizInfo } from './read/previz';
import { readQC } from './read/qc';
import { readPickupWork } from './read/pickups';
import { feedSummary, isWaiting, readFeed } from './read/feed';
import { soundCounts } from './read/sound';
import { readResearch } from './read/research';
import { readStory } from './read/story';
import { withSettled } from '@/lib/story-settled';
import { readReview } from './read/review';
import { readScenes, type PickupInfo, type SceneRefX } from './read/scenes';
import { readScript } from './read/script';
import { addCosts, readSpend, type SpendLineX } from './read/spend';
import { readTasteAll, tasteFor, type TastePickX } from './read/taste';
import { findFilm, type FilmRefX } from './registry';
import { list, Warnings, type FilmCtx } from './util';
import { characterRowTest } from '../../lib/spendMatch';

export interface FilmExtra {
  layout?: 'blocks' | 'generations';
  previz?: PrevizInfo;
  review?: { title?: string; subtitle?: string; deliveryFolder?: string; sections: number };
  unassignedPickups: PickupInfo[];
  /** Spend per character (rows labelled with its ID or naming it) and per scene (its takes and pick-ups). */
  costs: { characters: Record<string, Cost>; scenes: Record<string, Cost>; unpricedLines: number };
  counts: { characters: number; scenes: number; takes: number; pickups: number; spendLines: number; tastePicks: number; scriptLines: number };
}
/** FilmState with the side channels typed; assignable to the contract's FilmState. */
export type FilmStateX = Omit<FilmState, 'film' | 'characters' | 'locations' | 'scenes' | 'spend' | 'taste'> & {
  film: FilmRefX;
  characters: CharacterRefX[];
  locations: LocationRefX[];
  scenes: SceneRefX[];
  spend: { lines: SpendLineX[]; total: Cost; charged?: Cost; refunded?: Cost };
  taste: TastePickX[];
  warnings: string[];
  extra: FilmExtra;
};

export async function buildFilmState(film: FilmRefX): Promise<FilmStateX> {
  const warn = new Warnings();
  const ctx: FilmCtx = { dir: film.folder, warn };
  const cfg = harnessConfig();
  const repoForTaste = film.repo || cfg.filmRepo;

  const [brief, script, spend, tasteAll, previz, post, qc] = await Promise.all([
    readBrief(ctx),
    readScript(ctx),
    readSpend(ctx),
    readTasteAll(repoForTaste, warn),
    readPreviz(ctx),
    readPost(ctx),
    readQC(ctx),
  ]);
  const taste = tasteFor(tasteAll, [film.title, film.workingTitle]);
  const spendLines = spend?.lines ?? [];

  const pickupFolders = [
    ...(await list(path.join(film.folder, 'blocks'))),
    ...(await list(path.join(film.folder, 'generations'))),
  ].filter((e) => e.dir && /^FIX-/.test(e.name)).map((e) => e.name);
  const review = await readReview(ctx, pickupFolders);
  const feed = await readFeed(ctx, film.slug);
  for (const w of feed.warnings) if (!warn.list.includes(w)) warn.list.push(w);
  const { scenes, layout, unassignedPickups } = await readScenes(ctx, spendLines, review?.misses ?? []);

  // the record's cut, plus the harness's own timeline versions (cut/v<n>.json, build step 4a)
  const cut = await withTimeline(film.slug, film.folder, film.repo || cfg.filmRepo, film.title, await readCut(ctx, scenes, post?.cuts ?? [], post?.masters ?? []));
  // the timeline's "(to confirm)" clips (facts the migration could not settle) badge their takes until the user confirms
  if (cut?.current) {
    const tl = cut.current;
    for (const t of tl.tracks) {
      if (t.kind !== 'video') continue;
      for (const c of t.clips) {
        if (!c.takeRef || !/\(to confirm\)/i.test(c.label ?? '')) continue;
        const take = scenes.find((x) => x.id === c.takeRef!.scene)?.takes.find((k) => k.id === c.takeRef!.take);
        if (!take) continue;
        const frames = Math.round(((c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1)) * tl.fps);
        take.placement ??= { cut: `cut ${tl.version}`, fps: tl.fps, pieces: [{ at: Math.round(c.at * tl.fps), frames, sourceIn: Math.round(c.in * tl.fps) }], frames };
        take.placement.toConfirm = true;
      }
    }
  }
  // a cut the terminal workflow rendered after the newest timeline version: the Edit page asks Alma to catch up
  if (cut?.current) {
    // a finished film or a 1080p file is not a cut change: only other renders of the cut can be ahead of the timeline
    const done = new Set(post?.finals ?? []);
    const ahead = await readRecordAhead(ctx, (post?.cuts ?? []).filter((f) => !done.has(f) && !/1080|final|as-posted/i.test(f.split('/').pop()!)));
    if (ahead) cut.recordAhead = ahead;
  }

  const delivered = film.status === 'delivered';
  const characters = await readCharacters(ctx, script, taste, delivered);
  // a yes the user gave on a sheet's own card (a card that asks, at the sheet step, for that character) approves it,
  // the same as the taste.md row the reader looks for (12 Nov: sheets locked by button kept asking at the gate)
  for (const c of characters) {
    if (!c.sheet?.path || c.sheet.approved) continue;
    if (feed.cards.some((k) => k.place === 'sheet' && k.ids.includes(c.id) && k.ask?.kind === 'yes' && k.ask.answer)) c.sheet.approved = true;
  }

  // the scene files name the location (the truth) and the props each scene uses
  const sceneLocations = new Map<string, string>();
  const sceneLoc = new Map<string, string>();
  const propScenes = new Map<string, Set<string>>();
  for (const s of scenes) {
    const lid = s.more.locationIds[0];
    if (lid) {
      sceneLoc.set(s.id, lid);
      if (s.more.locationName && !sceneLocations.has(lid)) sceneLocations.set(lid, s.more.locationName);
    }
    for (const p of s.more.props) {
      if (!propScenes.has(p)) propScenes.set(p, new Set());
      propScenes.get(p)!.add(s.id);
    }
  }
  const locations = await readLocations(ctx, script?.names ?? new Map(), sceneLocations, propScenes, sceneLoc, taste);

  // a character's rows: its ID in the row's label (C01, E-C01, whole word), never a name in the purpose
  const charCosts: Record<string, Cost> = {};
  const labelled = spendLines.some((l) => !!l.more.label);
  for (const c of characters) {
    const mine = characterRowTest(c.id, c.name, labelled);
    const lines = spendLines.filter((l) => mine(l.more.label, l.what));
    if (lines.length) charCosts[c.id] = addCosts(lines.map((l) => l.cost));
  }
  // a scene's cost: when the record labels its rows ("S3 prompt v5, take 1", "FIX-S3-laugh take 2"), every row of
  // stages 6 to 8 and every pick-up row whose label names that scene, pick-ups and refunds included; the rows no single scene owns (probes,
  // a reel across S2 and S3) are the scenes' rest. Older records without labels: the takes' and pick-ups' own costs.
  const sceneCosts: Record<string, Cost> = {};
  let scenesRest: FilmStateX['scenesRest'];
  if (labelled) {
    const per = new Map<string, Cost[]>();
    const rest: SpendLineX[] = [];
    for (const l of spendLines) {
      // stages 6 to 8, and a pick-up (FIX-…) whatever stage logged it (the S5 jar edit sits under 9 Edit)
      if (!/^[678]\b/.test(l.more.stage ?? '') && !/^FIX-/.test(l.more.label ?? '')) continue;
      const sid = sceneOfLabel(l.more.label);
      if (sid && scenes.some((x) => x.id === sid)) per.set(sid, [...(per.get(sid) ?? []), l.cost]);
      else rest.push(l);
    }
    for (const [sid, costs] of per) sceneCosts[sid] = addCosts(costs);
    if (rest.length) {
      const items = [...new Set(rest.map((l) => restName(l.more.label ?? l.what)))];
      scenesRest = { cost: addCosts(rest.map((l) => l.cost)), rows: rest.length, items };
    }
  } else {
    for (const s of scenes) {
      const costs = s.takes.map((t) => t.cost).filter((c): c is Cost => !!c);
      if (costs.length) sceneCosts[s.id] = addCosts(costs);
    }
  }

  // Lift what the contract now carries (integration, 8 Nov) out of the side channels.
  for (const c of characters) {
    c.cost = charCosts[c.id];
    for (const part of [c.face, c.wardrobe, c.voice]) markPick(part?.rounds, part?.pick?.candidateId);
  }
  for (const l of locations) for (const p of l.more.picks) markPick(l.styleImages, p.candidateId);
  for (const s of scenes) {
    const lid = s.more.locationIds[0];
    if (lid) s.location = [lid, s.more.locationName].filter(Boolean).join(' ');
    s.cost = sceneCosts[s.id];
  }
  for (const l of spendLines) {
    const m = l.more;
    l.details = { stage: m.stage, label: m.label, units: m.units, rate: m.rate, unpriced: m.unpriced };
  }

  if (!brief) warn.add('brief.md', 'missing');
  if (!script && film.flow === 'video-driven') warn.add('script.md', 'missing');
  if (!spend && film.flow === 'video-driven') warn.add('spend.md', 'missing');

  const takes = scenes.reduce((n, s) => n + s.takes.filter((t) => t.kind === 'take').length, 0);
  const pickups = scenes.reduce((n, s) => n + s.takes.filter((t) => t.kind === 'pickup').length, 0);
  return {
    film,
    brief: brief ? { path: brief.path, markdown: brief.markdown } : undefined,
    script: script
      ? { versions: script.versions, current: script.current, lines: script.lines, markdown: script.markdown }
      : undefined,
    characters,
    locations,
    scenes,
    spend: { lines: spendLines, total: spend?.total ?? {}, charged: spend?.charged, refunded: spend?.refunded },
    taste,
    reviewCardsPath: review?.path,
    previz: previz ? { film: previz.film.map((f) => ({ version: f.version, path: f.path })), storyboards: previz.storyboards } : undefined,
    post,
    cut,
    master: await readMaster(ctx, post, cut, feed.cards, feed.cards.filter(isWaiting)),
    qc,
    scenesRest,
    feed: feed.cards.length ? feedSummary(feed) : undefined,
    sound: withMasterYes(await soundCounts(ctx), masterYesOf(feed.cards)),
    pickups: await readPickupWork(ctx, scenes, unassignedPickups, qc),
    research: await readResearch(ctx),
    story: withSettled(await readStory(ctx), script),
    updatedAt: new Date().toISOString(),
    warnings: warn.list,
    extra: {
      layout,
      previz,
      review: review ? { title: review.title, subtitle: review.subtitle, deliveryFolder: review.deliveryFolder, sections: review.sections } : undefined,
      unassignedPickups,
      costs: { characters: charCosts, scenes: sceneCosts, unpricedLines: spendLines.filter((l) => l.more.unpriced).length },
      counts: {
        characters: characters.length,
        scenes: scenes.length,
        takes,
        pickups,
        spendLines: spendLines.length,
        tastePicks: taste.length,
        scriptLines: script?.lines.length ?? 0,
      },
    },
  };
}

/** The scene a spend label names: "S3 prompt v5, take 1" → S3; a pick-up "FIX-name-S2a take 1" → S2; a pick-up
 *  across scenes ("FIX-S2S3-reel") or a probe → undefined. */
function sceneOfLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const direct = /^(S\d+)\b/.exec(label);
  if (direct) return direct[1];
  const fix = /^FIX-[\w-]+/.exec(label);
  if (!fix) return undefined;
  const ids = [...new Set([...fix[0].matchAll(/S(\d+)/g)].map((m) => `S${m[1]}`))];
  return ids.length === 1 ? ids[0] : undefined;
}

/** "name matrix probe 7 (generations/…)" → "name matrix probe 7"; "FIX-S2S3-reel take 1, prompt v1: …" → "FIX-S2S3-reel take 1". */
const restName = (label: string): string => label.replace(/\s*[(:,].*$/, '').trim();

/** Marks the round a pick came from: the round whose candidates include the picked id. */
function markPick(rounds: Round[] | undefined, id: string | undefined): void {
  if (!rounds || !id) return;
  const r = rounds.find((x) => x.candidates.some((k) => k.id === id));
  if (r) r.pick = id;
}

// Survive Next.js dev reloads: one cache per process, shared with the watcher.
interface Cached { promise: Promise<FilmStateX>; at: number }
type BuiltListener = (slug: string, state: FilmStateX) => void;
const g = globalThis as unknown as { __filmStateCache?: Map<string, Cached>; __filmStateWatched?: Set<string>; __filmStateBuilt?: Set<BuiltListener> };
const cache = (g.__filmStateCache ??= new Map());
const watched = (g.__filmStateWatched ??= new Set());
const built = (g.__filmStateBuilt ??= new Set());

/** Told each film state built afresh, whoever asked for it (a page, the folder watcher, the notify hub): the hub counts
 *  the film's "Waiting for you" from it at no extra cost (src/server/claude/notify.ts). */
export function onFilmStateBuilt(fn: BuiltListener): () => void {
  built.add(fn);
  return () => { built.delete(fn); };
}

/** How long a state is trusted with no watcher on the film's folder (no page open on it). */
const UNWATCHED_MS = 5_000;
/** The ceiling while a watcher runs: a change the watcher missed (the drive remounted, a file deeper than it looks) still shows. */
const WATCHED_MS = 60_000;

/** The watcher says when it starts and stops looking at a film's folder; only a watched state is trusted for long. */
export function markWatched(slug: string, on: boolean): void {
  if (on) watched.add(slug);
  else watched.delete(slug);
}

/** The film's state. While a page is open the watcher keeps it fresh; with no page open it is rebuilt when older
 *  than a few seconds, so a film Alma finished overnight never reads as it stood when the last page closed. */
export async function getFilmState(slug: string): Promise<FilmStateX | undefined> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < (watched.has(slug) ? WATCHED_MS : UNWATCHED_MS)) return hit.promise;
  // the registry (status, stage, the delivery folders) refreshes itself once a minute
  const film = await findFilm(slug);
  if (!film) return undefined;
  const entry: Cached = { promise: buildFilmState(film), at: Date.now() };
  cache.set(slug, entry);
  entry.promise.then((state) => {
    for (const fn of built) {
      try { fn(slug, state); } catch { /* a listener's own trouble */ }
    }
  }, () => {
    if (cache.get(slug) === entry) cache.delete(slug);
  });
  return entry.promise;
}

export function invalidateFilmState(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}

/** The Sound node's counts with the user's yes on a master beside them (either may be missing). */
function withMasterYes(counts: SoundSummary | undefined, yes: SoundSummary['masterYes']): SoundSummary | undefined {
  if (!yes) return counts;
  return { counts: counts?.counts ?? {}, masterYes: yes };
}
