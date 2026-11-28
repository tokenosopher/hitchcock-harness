// The films registry: every film the user has made or is making, across the repos and the
// final-cuts folders, so Alma can resolve "like in The Ferry" to a folder.
// Written to harness/films.json on every build; the sidebar reads it through GET /api/films.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmRef, Flow, Stage } from '../types';
import { harnessConfig, STUDIO_MISSING, type HarnessConfig } from '../config';
import { readBrief } from './read/brief';
import { readPreviz } from './read/previz';
import { publishedIn, readPublishedNote } from './read/release';
import { cells, exists, isoDay, list, listSlow, natCmp, readText, titleCase, VIDEO_RE, Warnings, type FilmCtx } from './util';
import { isAspect } from '@/lib/frame';

/** `final`: the folder holds the release stage's FINAL files (a Social kit folder with a video in it, or a video named
 *  FINAL, "as posted" or "… Final.mov"). A video without them is a copy, not a release (ASKS 37). */
export interface DeliveryFolder { date: string; folder: string; hasVideo: boolean; final?: boolean }

export interface FilmRefExtra {
  /** The record files Alma reads first, relative to the film folder, when present. */
  record: { brief?: string; spend?: string; reviewCards?: string; script?: string };
  /** Every final-cuts folder named for the film, with or without a video in it yet. */
  deliveryFolders: DeliveryFolder[];
  series?: { slug: string; title?: string; episode: string };
  supersededBy?: string;        // the film that carried this one on (a draft folder kept as a record)
  layout?: 'blocks' | 'generations';
  note?: string;
}
export type FilmRefX = FilmRef & { more: FilmRefExtra };

export interface Registry {
  generatedAt: string;
  drive: 'connected' | 'not connected';
  films: FilmRefX[];
  warnings: string[];
}

/** The release stage's FINAL files by name: "<Title> - FINAL captioned.mp4", "… as posted 9 Nov …", "… take 5 Final.mov". */
const isFinalName = (n: string): boolean => /\bFINAL\b/.test(n) || /\bas[- ]posted\b/i.test(n) || /\bfinal\.(mp4|mov|m4v)$/i.test(n);
const KIT_DIR = /^social[- ]kit$/i;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function filmsTxt(repo: string): Promise<string[] | undefined> {
  const t = await readText(path.join(repo, 'films.txt'));
  return t?.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** The day the film was delivered: spend.md's last delivery row ("… delivered to final cuts"), else the
 *  newest video in the final-cuts folder. The folder's own name carries the day the folder was started, not this. */
async function deliveryDay(f: FilmRefX, folder: string): Promise<string | undefined> {
  if (f.repo) {
    const md = (await readText(path.join(f.folder, 'spend.md'))) ?? '';
    let last: string | undefined;
    for (const raw of md.split('\n')) {
      if (!raw.trim().startsWith('|') || !/\bdeliver(?:ed|y)\b/i.test(raw)) continue;
      const day = /^\d{4}-\d\d-\d\d/.exec(cells(raw)[0] ?? '')?.[0];
      if (day && (!last || day > last)) last = day;
    }
    if (last) return last;
  }
  return newestVideoDay(folder);
}

/** The newest video's day in a final-cuts folder and one level down, time-limited (a synced folder can hang on a permission prompt). */
function newestVideoDay(folder: string, ms = 5000): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('/usr/bin/find', [folder, '-maxdepth', '2', '-type', 'f', '(', '-iname', '*.mp4', '-o', '-iname', '*.mov', '-o', '-iname', '*.m4v', ')', '-exec', '/usr/bin/stat', '-f', '%m', '{}', '+'],
      { signal: AbortSignal.timeout(ms), maxBuffer: 1 << 20 }, (err, stdout) => {
        const secs = String(stdout ?? '').split('\n').map(Number).filter((n) => n > 0);
        resolve(err && !secs.length ? undefined : secs.length ? isoDay(new Date(Math.max(...secs) * 1000)) : undefined);
      });
  });
}

/** The furthest stage the folder shows, from what exists (a cheap guess for the sidebar). */
async function stageOf(dir: string, delivered: boolean): Promise<Stage | undefined> {
  if (delivered) return 12;
  const has = async (rel: string, re: RegExp, depth = 2): Promise<boolean> => {
    const walk = async (p: string, d: number): Promise<boolean> => {
      for (const e of await list(p)) {
        if (!e.dir && re.test(e.name)) return true;
        if (e.dir && d > 0 && (await walk(path.join(p, e.name), d - 1))) return true;
      }
      return false;
    };
    return walk(path.join(dir, rel), depth);
  };
  // the release file (Film Flow v3.3: the release starts from it); after the edit: a mix of stage 11 (audio/master/, or
  // the clean finished film in cut/ of older films), a full-size master of stage 10
  // (the app's own master render, cut/*1080*, video/1080/, never a file whose name says a smaller size)
  if (await exists(path.join(dir, 'social', 'release.json'))) return 12;
  if (await has('audio/master', /\.(wav|mp3|m4a|aac|flac)$/i, 1) || (await has('cut', /final-clean.*\.(mp4|mov)$/i, 0))) return 11;
  if (await has('cut/renders', /^v\d+-master(-\d+)?\.mp4$/, 0) || (await has('cut', /1080.*\.(mp4|mov|m4v)$/i, 0))
    || (await has('video/1080', /^(?!.*(?:[^0-9](?:[1-9][0-9]{2})p[^a-z0-9]|proxy)).*\.(mp4|mov|m4v)$/i, 0))) return 10;
  for (const lay of ['generations', 'blocks']) {
    if (await has(lay, /\.jobid$|-take\w*-\d+p\.mp4$/, 2)) return (await has('cut', VIDEO_RE, 1)) ? 9 : 7;
    if (await has(lay, /-prompt-v\d+.*\.txt$/, 2)) return 6;
  }
  if (await has('previz', /\.mp4$/, 2)) return 5;
  if (await has('locations', /master.*\.(png|jpe?g)$/i, 2)) return 4;
  if (await has('elements', /\.mp4$/, 3)) return 3;
  if (await has('cast', /\.(png|jpe?g)$/i, 2)) return 2;
  return 1;
}

/** The final-cuts folders, read with a time limit (a synced folder can hang on a permission prompt). */
interface FinalCut { date: string; title: string; folder: string; hasVideo: boolean; final?: boolean }

/** The delivered cuts. A cloud drive sometimes does not answer in time (a sync in progress, a macOS permission prompt), and
 *  a missed read used to turn every delivered film back into "in progress" (11 Nov). So the last good reading of each
 *  root and of each folder is kept in harness/final-cuts.json and used, with a warning, when a read gets no answer.
 *  A delivery only ever adds a video, so the kept reading can be behind but not wrong about a film being delivered. */
async function readFinalCuts(cfg: HarnessConfig, driveUp: boolean, warn: Warnings): Promise<FinalCut[]> {
  const keptFile = path.join(cfg.harnessDir, 'final-cuts.json');
  let kept: Record<string, FinalCut[]> = {};
  try {
    kept = JSON.parse(await fs.readFile(keptFile, 'utf8')) as Record<string, FinalCut[]>;
  } catch {
    // no reading kept yet
  }
  const out: FinalCut[] = [];
  let changed = false;
  for (const root of cfg.finalCuts) {
    if (root.startsWith(cfg.driveRoot) && !driveUp) continue;
    const before = kept[root] ?? [];
    const entries = await listSlow(root);
    if (!entries) {
      warn.add(root, `not available (no answer within 4 s: the folder may be syncing or waiting on a macOS permission prompt)${before.length ? '; showing the last reading' : ''}`);
      out.push(...before);
      continue;
    }
    const now: FinalCut[] = [];
    for (const e of entries.filter((x) => x.dir)) {
      const m = /^(\d{4}-\d\d-\d\d) (.+)$/.exec(e.name);
      if (!m) continue;
      const folder = path.join(root, e.name);
      const inside = await listSlow(folder);
      const videos = (xs: { name: string; dir: boolean }[] | undefined) => (xs ?? []).filter((x) => !x.dir && VIDEO_RE.test(x.name)).map((x) => x.name);
      const names = videos(inside);
      let hasVideo = names.length > 0;
      let final = names.some(isFinalName);
      let missed = !inside;
      // one level down: a video anywhere makes it a copy; a video inside its Social kit is the release's FINAL files
      const subs = (inside ?? []).filter((x) => x.dir).sort((a, b) => Number(KIT_DIR.test(b.name)) - Number(KIT_DIR.test(a.name)));
      for (const sub of subs.slice(0, 40)) {
        if (hasVideo && final) break;
        if (hasVideo && !KIT_DIR.test(sub.name)) continue;
        const deeper = await listSlow(path.join(folder, sub.name));
        if (!deeper) missed = true;
        const vs = videos(deeper);
        // a kit kept per platform (social-kit/x/, social-kit/youtube/): one level further
        if (KIT_DIR.test(sub.name) && !vs.length) {
          for (const d of (deeper ?? []).filter((x) => x.dir).slice(0, 12)) {
            vs.push(...videos(await listSlow(path.join(folder, sub.name, d.name))));
            if (vs.length) break;
          }
        }
        if (vs.length) hasVideo = true;
        if (vs.length && KIT_DIR.test(sub.name)) final = true;
        if (vs.some(isFinalName)) final = true;
      }
      const was = before.find((b) => b.folder === folder);
      if (missed && was?.hasVideo && (!hasVideo || (was.final && !final))) {
        hasVideo = true;
        final ||= !!was.final;
        warn.add(folder, 'no answer within 4 s; the last reading had a video in it');
      }
      now.push({ date: m[1], title: m[2], folder, hasVideo, ...(final ? { final } : {}) });
    }
    if (JSON.stringify(now) !== JSON.stringify(before)) {
      kept[root] = now;
      changed = true;
    }
    out.push(...now);
  }
  if (changed) {
    try {
      await fs.mkdir(cfg.harnessDir, { recursive: true });
      await fs.writeFile(keptFile, JSON.stringify(kept, null, 1));
    } catch {
      // the next good reading tries again
    }
  }
  return out;
}

export async function buildRegistry(cfg: HarnessConfig = harnessConfig()): Promise<Registry> {
  const warn = new Warnings();
  const driveUp = await exists(cfg.driveRoot);
  const films: FilmRefX[] = [];
  if (!driveUp) warn.add(cfg.driveRoot, STUDIO_MISSING);

  if (driveUp) {
    const repos = [cfg.filmRepo, ...cfg.otherRepos];
    const lists = await Promise.all(repos.map(filmsTxt));
    const claimed = new Set(lists.flatMap((l) => l ?? []));
    // repos with films.txt first; a repo without one owns what nobody listed
    const order = repos.map((r, i) => ({ repo: r, listed: lists[i] })).sort((a, b) => Number(!a.listed) - Number(!b.listed));
    const seen = new Set<string>();
    for (const { repo, listed } of order) {
      const flow: Flow = repo === cfg.filmRepo ? 'video-driven' : 'audio-first';
      const base = path.join(repo, 'assets', 'films');
      const present = (await list(base)).filter((e) => e.dir).map((e) => e.name);
      const slugs = listed ?? present.filter((s) => !claimed.has(s));
      for (const slug of slugs) {
        if (seen.has(slug)) continue;
        seen.add(slug);
        const dir = path.join(base, slug);
        if (!present.includes(slug)) {
          warn.add(path.join(repo, 'films.txt'), `${slug} is listed but assets/films/${slug} is missing`);
          continue;
        }
        const top = await list(dir);
        const isSeries = !top.some((e) => /^(brief|story|script)\.md$/.test(e.name)) && top.some((e) => e.dir && /^ep\d+/.test(e.name));
        if (isSeries) {
          const seriesTitle = (await readBrief({ dir, warn }))?.title?.replace(/\s*\(series\)$/i, '');
          for (const ep of top.filter((e) => e.dir && /^ep\d+/.test(e.name))) {
            films.push(await filmRef(`${slug}-${ep.name}`, path.join(dir, ep.name), repo, flow, warn, { slug, title: seriesTitle, episode: ep.name }));
          }
        } else films.push(await filmRef(slug, dir, repo, flow, warn));
      }
    }
  }

  // delivered cuts: "<date> <Title>" matched to a film by title, working title or folder name
  const cuts = await readFinalCuts(cfg, driveUp, warn);
  const used = new Set<string>();
  for (const f of films) {
    const names = new Set([f.title, f.workingTitle, titleCase(f.slug)].filter(Boolean).map((s) => norm(s!)));
    for (const c of cuts)
      if (names.has(norm(c.title))) {
        used.add(c.folder);
        if (!f.more.deliveryFolders.some((d) => d.folder === c.folder)) f.more.deliveryFolders.push({ date: c.date, folder: c.folder, hasVideo: c.hasVideo, final: c.final });
      }
  }
  // a delivered film with no working folder left (made before the studio folder existed)
  const orphans = new Map<string, FilmRefX>();
  for (const c of cuts.filter((x) => !used.has(x.folder))) {
    const slug = norm(c.title).replace(/ /g, '-');
    const have = orphans.get(slug);
    if (have) {
      have.more.deliveryFolders.push({ date: c.date, folder: c.folder, hasVideo: c.hasVideo, final: c.final });
      continue;
    }
    const brief = (await readText(path.join(c.folder, 'HANDOFF.md'))) !== undefined ? 'HANDOFF.md' : undefined;
    orphans.set(slug, {
      slug,
      title: c.title,
      folder: c.folder,
      repo: '',
      flow: 'audio-first',
      started: undefined,
      status: 'in-progress',
      more: {
        record: { brief },
        deliveryFolders: [{ date: c.date, folder: c.folder, hasVideo: c.hasVideo, final: c.final }],
        note: 'only the final-cuts folder is known; no working folder in any repo',
      },
    });
    warn.add(c.folder, 'a delivered film with no working folder in any repo; listed from the final cut alone');
  }
  films.push(...orphans.values());

  // Released (13 Nov, ASKS 37): only what the record shows went out, never a copy in final cuts alone. Two facts count:
  // the film's section of the published-links note with a row that went out, or the FINAL files of the release
  // stage in one of its final-cuts folders. A final-cuts folder with only other videos in it is a copy (`copies`).
  const note = driveUp || cuts.length ? await readPublishedNote(warn) : undefined;
  for (const f of films) {
    f.more.deliveryFolders.sort((a, b) => natCmp(a.date, b.date));
    const withVideo = f.more.deliveryFolders.filter((d) => d.hasVideo);
    const titles = [f.title, f.workingTitle].filter((t): t is string => !!t);
    const posts = note ? titles.map((t) => publishedIn(note, t)).find((p) => p?.rows.some((r) => r.link || r.posted || r.pending)) : undefined;
    const finals = withVideo.filter((d) => d.final);
    const released = !!posts || finals.length > 0;
    // the delivery day, not the folder's start day (the sidebar and the Release page show the same date)
    const days = await Promise.all(withVideo.map(async (d, i) => ({ date: (released && i === withVideo.length - 1 ? await deliveryDay(f, d.folder) : await newestVideoDay(d.folder)) ?? d.date, folder: d.folder })));
    f.delivered = released && days.length ? days : undefined;
    f.copies = !released && days.length ? days : undefined;
    // the note's heading carries the day it went out: "## Maren and the Sea (9 Nov 2026)", "(3–4 Nov 2026)"
    const headDay = posts ? Date.parse(/\(([^)]*?\d{4})\)\s*$/.exec(posts.heading)?.[1]?.replace(/^\d+[–-]/, '') ?? '') : NaN;
    const postedDay = Number.isNaN(headDay) ? undefined : isoDay(new Date(headDay + 12 * 3600e3));
    f.released = released ? { date: days[days.length - 1]?.date ?? postedDay ?? '', by: posts ? 'posted' : 'final files' } : undefined;
    f.status = released ? 'delivered' : 'in-progress';
    f.stage = f.repo ? await stageOf(f.folder, f.status === 'delivered') : f.status === 'delivered' ? 12 : undefined;
  }

  // a draft folder another film says it carried on ("that folder is kept at assets/films/<slug>/")
  for (const f of films) {
    if (!f.more.record.brief || !f.repo) continue;
    const md = (await readText(path.join(f.folder, f.more.record.brief))) ?? '';
    for (const m of md.matchAll(/assets\/films\/([\w-]+)\/?/g)) {
      const other = films.find((o) => o.slug === m[1] && o !== f);
      if (other && other.status !== 'delivered') other.more.supersededBy = other.supersededBy = f.slug;
    }
  }

  films.sort((a, b) => Number(a.status === 'delivered') - Number(b.status === 'delivered') || natCmp(b.started ?? b.delivered?.[0]?.date ?? '', a.started ?? a.delivered?.[0]?.date ?? ''));
  const reg: Registry = { generatedAt: new Date().toISOString(), drive: driveUp ? 'connected' : 'not connected', films, warnings: warn.list };
  await writeRegistry(cfg, reg, warn);
  return reg;
}

async function filmRef(slug: string, dir: string, repo: string, flow: Flow, warn: Warnings, series?: FilmRefExtra['series']): Promise<FilmRefX> {
  const ctx: FilmCtx = { dir, warn };
  const brief = await readBrief(ctx);
  const previz = await readPreviz(ctx);
  if (!brief) warn.add(path.join(dir, 'brief.md'), 'no brief.md or story.md; the title comes from the folder name');
  const record: FilmRefExtra['record'] = { brief: brief?.path };
  for (const [k, rel] of [['spend', 'spend.md'], ['reviewCards', 'review/cards.json'], ['script', 'script.md']] as const)
    if (await exists(path.join(dir, rel))) record[k] = rel;
  const layout = (await exists(path.join(dir, 'generations'))) ? 'generations' : (await exists(path.join(dir, 'blocks'))) ? 'blocks' : undefined;
  // the brief's aspect first (the cut's frame follows it), else the previz's
  const ratio = brief?.aspect ?? (isAspect(previz?.ratio) ? previz.ratio : undefined);
  return {
    slug,
    title: brief?.title ?? titleCase(slug),
    workingTitle: brief?.workingTitle && brief.workingTitle !== brief.title ? brief.workingTitle : undefined,
    folder: dir,
    repo,
    flow,
    started: brief?.started,
    status: 'in-progress',
    aspect: ratio,
    more: { record, deliveryFolders: [], series, layout },
  };
}

async function writeRegistry(cfg: HarnessConfig, reg: Registry, warn: Warnings): Promise<void> {
  try {
    await fs.mkdir(cfg.harnessDir, { recursive: true });
    const tmp = path.join(cfg.harnessDir, `films.json.${process.pid}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(reg, null, 2) + '\n');
    await fs.rename(tmp, path.join(cfg.harnessDir, 'films.json'));
  } catch (e) {
    warn.add(path.join(cfg.harnessDir, 'films.json'), `not written (${(e as Error).message})`);
  }
}

let cached: { at: number; reg: Promise<Registry> } | undefined;

/** The registry, rebuilt at most once a minute (the final-cuts reads are slow). */
export function getRegistry(maxAgeMs = 60_000): Promise<Registry> {
  if (!cached || Date.now() - cached.at > maxAgeMs) {
    const reg = buildRegistry();
    cached = { at: Date.now(), reg };
    reg.catch(() => (cached = undefined));
  }
  return cached.reg;
}

export function invalidateRegistry(): void {
  cached = undefined;
}

export async function findFilm(slug: string): Promise<FilmRefX | undefined> {
  return (await getRegistry()).films.find((f) => f.slug === slug);
}
