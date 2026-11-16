// GET /api/films/<film>/cut/renders (14 Nov 2026, ASKS 39): every master and every "More renders" file in
// cut/renders/, for the Edit page's Renders tab. Read-only and cheap: the folder's names (render.ts names them:
// renderRel, variantBase), a stat per file, the manifest a render with options writes last (<base>.json), and each
// version file once for its length and what renders.master recorded. No ffmpeg. The 480p of each version is left out
// of the list (there was one per change until 14 Nov, hundreds on a long edit): the page has the one of the version it
// shows, and the others are only counted, with their size (renderProxies, from the same reading of the folder).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import type { PictureMade, RenderKind, RenderState, Timeline } from '../types';
import type { RenderFile } from '@/components/edit/renderList';
import { variantBase } from './render';
import { mastersOf, masterNo } from '@/components/edit/masters';
import { RENDERS_DIR, timelineLength, versionFile } from './timeline';

/** The plain 480p files on disk, one per version that has one: counted on the Renders tab, never listed. */
export interface ProxyFile { version: string; bytes: number }
interface Kept { key: string; files: RenderFile[]; proxies: ProxyFile[] }
const kept = ((globalThis as unknown as { __cutRenderFiles?: Map<string, Kept> }).__cutRenderFiles ??= new Map());

// a "More renders" tag starts with a word (render-options.ts optionsTag), never a number: v231-master-2.mp4 is a master
const MANIFEST = /^(v\d+)-(proxy|master)-([a-z].*)\.json$/;

/** A version's length and what its file recorded of each of its masters (the newest and the earlier ones, by path),
 *  read once per version file change. */
interface MasterFacts { at: string; seconds?: number; picture?: PictureMade }
const versions = ((globalThis as unknown as { __cutRenderVersions2?: Map<string, { mtime: number; seconds?: number; masters?: Record<string, MasterFacts> }> }).__cutRenderVersions2 ??= new Map());
async function versionFacts(film: FilmTarget, v: string): Promise<{ seconds?: number; masters?: Record<string, MasterFacts> }> {
  const file = versionFile(film, v);
  try {
    const mtime = (await fs.stat(file)).mtimeMs;
    const hit = versions.get(file);
    if (hit && hit.mtime === mtime) return hit;
    const t = JSON.parse(await fs.readFile(file, 'utf8')) as Timeline;
    const masters: Record<string, MasterFacts> = {};
    for (const r of [...(t.renders?.earlierMasters ?? []), ...(t.renders?.master ? [t.renders.master] : [])]) if (r?.path) masters[r.path] = { at: r.at, seconds: r.seconds, picture: r.picture };
    const facts = { mtime, seconds: Array.isArray(t.tracks) ? Math.round(timelineLength(t) * 1000) / 1000 : undefined, masters };
    versions.set(file, facts);
    return facts;
  } catch {
    return {};
  }
}

export async function renderFiles(film: FilmTarget): Promise<RenderFile[]> {
  return (await listing(film)).files;
}

/** The 480p files of every version, from the same reading as renderFiles (no second pass over the folder). */
export async function renderProxies(film: FilmTarget): Promise<ProxyFile[]> {
  return (await listing(film)).proxies;
}

const NOTHING: Kept = { key: '', files: [], proxies: [] };
async function listing(film: FilmTarget): Promise<Kept> {
  const dir = path.join(film.dir, RENDERS_DIR);
  let names: string[];
  let mtime: number;
  try {
    mtime = (await fs.stat(dir)).mtimeMs;
    names = await fs.readdir(dir);
  } catch {
    return NOTHING;
  }
  // the folder changes whenever a render lands; a version file changes when its master is recorded
  const key = `${mtime}:${names.length}`;
  const hit = kept.get(dir);
  if (hit && hit.key === key) return hit;
  const have = new Set(names);
  const stat = async (rel: string) => { try { const s = await fs.stat(path.join(film.dir, rel)); return { bytes: s.size, at: s.mtime.toISOString() }; } catch { return undefined; } };
  const out: RenderFile[] = [];
  const proxies: ProxyFile[] = [];
  for (const name of names) {
    const pv = /^(v\d+)-proxy\.mp4$/.exec(name)?.[1];
    if (pv) {
      const s = await stat(`${RENDERS_DIR}/${name}`);
      if (s) proxies.push({ version: pv, bytes: s.bytes });
      continue;
    }
    const mn = masterNo(name);
    if (mn) {
      // every master of the version (masters.ts): the newest is the master of it, the others are marked earlier
      const v = mn.version;
      const all = mastersOf(names, v);
      const rel = all.find((x) => x.n === mn.n)!.path;
      const s = await stat(rel);
      if (!s) continue;
      const facts = await versionFacts(film, v);
      const rec = facts.masters?.[rel];
      out.push({ path: rel, version: v, kind: 'master', bytes: s.bytes, at: rec?.at ?? s.at, took: rec?.seconds, seconds: facts.seconds, index: 0, picture: rec?.picture,
        n: mn.n, ...(mn.n < all[all.length - 1].n ? { earlier: true } : {}) });
      continue;
    }
    const m = MANIFEST.exec(name);
    if (!m) continue;
    const [, v, kind, tag] = m;
    let st: RenderState;
    try {
      st = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as RenderState;
    } catch {
      continue;
    }
    const base = variantBase(v, kind as RenderKind, tag);
    const facts = await versionFacts(film, v);
    const outputs = st.outputs ?? (st.path ? [{ path: st.path, what: '' }] : []);
    for (const [i, o] of outputs.entries()) {
      if (!o.path.startsWith(base) || !have.has(path.basename(o.path))) continue;
      const s = await stat(o.path);
      if (!s) continue;
      out.push({ path: o.path, version: v, kind: kind as RenderKind, tag, options: st.options, what: o.what || undefined, index: i, bytes: s.bytes,
        at: st.finishedAt ?? s.at, took: st.seconds, seconds: facts.seconds, loudness: st.loudness, leftOut: st.leftOut, ...(i === 0 && st.picture ? { picture: st.picture } : {}),
        ...(i === 0 && st.small ? { small: st.small } : {}) });
    }
  }
  const got = { key, files: out, proxies };
  kept.set(dir, got);
  return got;
}
