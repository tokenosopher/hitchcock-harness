// Library entries made from a video-driven film folder (cast/, voices/, elements.json, locations/): one builder
// per kind, shared by the pick (every pick saves itself), "Save to library" and the import.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { natCmp, titleCase } from '../films/util';
import { isDir, isFile } from '../actions/writes';
import { libraryId, type LibraryDraft } from './store';

export interface FilmInfo { slug: string; title: string; dir: string }

const IMG = /\.(png|jpe?g|webp)$/i;

async function readJson(p: string): Promise<Record<string, unknown> | undefined> {
  try {
    const v: unknown = JSON.parse(await fs.readFile(p, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
async function names(dir: string): Promise<string[]> {
  return (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => !n.startsWith('.')).sort(natCmp);
}
async function mtimeDay(p: string): Promise<string | undefined> {
  try {
    return (await fs.stat(p)).mtime.toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}

/** cast/C01-maren, locations/L01-shore, props/P01-bottle: the folder of one ID. */
export async function idFolder(film: FilmInfo, area: 'cast' | 'locations' | 'props', id: string): Promise<{ dir: string; name: string; slug: string } | undefined> {
  for (const n of await names(path.join(film.dir, area))) {
    if (n === id || n.startsWith(`${id}-`)) {
      const dir = path.join(film.dir, area, n);
      if (await isDir(dir)) return { dir, name: n, slug: n.slice(id.length + 1) };
    }
  }
  return undefined;
}

/** "C01-r1-7.png" → "r1-7" (the reader's candidate id). */
export const candidateIdOf = (file: string, id: string): string => {
  const base = file.replace(/\.[^.]+$/, '');
  return base.startsWith(`${id}-`) ? base.slice(id.length + 1) : base;
};

export async function roundFolders(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const n of await names(dir)) if ((/^r\d+/.test(n) || n === 'sheet') && (await isDir(path.join(dir, n)))) out.push(n);
  return out;
}

/** The candidate's image: in the named round when given ("r2" matches "r2-faces"), else in any round, newest first. */
export async function findCandidate(dir: string, id: string, candidate: string, round?: string): Promise<{ abs: string; round: string } | undefined> {
  const rounds = await roundFolders(dir);
  const pick = round ? rounds.filter((r) => r === round || r.startsWith(`${round}-`)) : [...rounds].reverse();
  for (const r of pick) {
    for (const n of await names(path.join(dir, r))) {
      if (IMG.test(n) && candidateIdOf(n, id) === candidate) return { abs: path.join(dir, r, n), round: r };
    }
  }
  return undefined;
}

/** The prompt that made an image: its own .prompt.txt, the round's prompts.json entry, or a round prompt it shares. */
export async function promptFor(fileAbs: string, id: string): Promise<{ prompt: string; from: string } | undefined> {
  const dir = path.dirname(fileAbs);
  const stem = path.basename(fileAbs).replace(/\.[^.]+$/, '');
  const own = path.join(dir, `${stem}.prompt.txt`);
  if (await isFile(own)) return { prompt: (await fs.readFile(own, 'utf8')).trim(), from: own };
  const pj = await readJson(path.join(dir, 'prompts.json'));
  if (pj) {
    const cand = candidateIdOf(path.basename(fileAbs), id);
    for (const c of Array.isArray(pj.candidates) ? pj.candidates : []) {
      const r = rec(c);
      const cid = str(r?.id)?.replace(/^\S+\s+/, '');
      if (cid === cand && str(r?.prompt)) return { prompt: str(r!.prompt)!, from: path.join(dir, 'prompts.json') };
    }
    if (str(pj.prompt)) return { prompt: str(pj.prompt)!, from: path.join(dir, 'prompts.json') };
  }
  for (const n of await names(dir)) {
    if (!n.endsWith('.prompt.txt')) continue;
    const s = n.replace(/\.prompt\.txt$/, '');
    if (stem.startsWith(s)) return { prompt: (await fs.readFile(path.join(dir, n), 'utf8')).trim(), from: path.join(dir, n) };
  }
  return undefined;
}

/** voices/cast.json and voices/element-lines-5s.json name a character; the script heading may name it better. */
async function characterName(film: FilmInfo, cid: string, slug: string): Promise<string> {
  const cast = rec((await readJson(path.join(film.dir, 'voices', 'cast.json')))?.[cid]);
  return str(cast?.name) ?? titleCase(slug);
}

/** The newest pick-<what>(-vN).png at the character's root (the plain name counts as version 1). */
async function newestPick(dir: string, re: RegExp): Promise<string | undefined> {
  let best: { n: number; name: string } | undefined;
  for (const name of await names(dir)) {
    if (!re.test(name)) continue;
    const n = Number(/-v(\d+)\.[^.]+$/.exec(name)?.[1] ?? 1);
    if (!best || n > best.n) best = { n, name };
  }
  return best ? path.join(dir, best.name) : undefined;
}

/** The character's video element: elements.json first, else the newest 1080p clip under elements/<CID>…/. */
async function elementFile(film: FilmInfo, cid: string): Promise<string | undefined> {
  const ve = rec(rec(rec((await readJson(path.join(film.dir, 'elements.json'))))?.[cid])?.video_element);
  for (const k of ['muted_file', 'final_file', 'draft_file']) {
    const f = str(ve?.[k]);
    if (f && (await isFile(path.join(film.dir, f)))) return path.join(film.dir, f);
  }
  const found: string[] = [];
  const walk = async (d: string, depth: number): Promise<void> => {
    for (const n of await names(d)) {
      const p = path.join(d, n);
      if (await isDir(p)) { if (depth < 3) await walk(p, depth + 1); }
      else if (/1080p.*\.mp4$/i.test(n) && !/first3s|cleanline/i.test(n)) found.push(p);
    }
  };
  for (const n of await names(path.join(film.dir, 'elements'))) if (n === cid || n.startsWith(`${cid}-`)) await walk(path.join(film.dir, 'elements', n), 0);
  found.sort(natCmp);
  return found.filter((f) => /muted/.test(f)).pop() ?? found.pop();
}

export async function faceDraft(film: FilmInfo, cid: string, fileAbs: string, status: 'picked' | 'saved', opts: { round?: string; candidate?: string; role?: string } = {}): Promise<LibraryDraft | undefined> {
  const folder = await idFolder(film, 'cast', cid);
  if (!folder || !(await isFile(fileAbs))) return undefined;
  const name = await characterName(film, cid, folder.slug);
  const candidate = opts.candidate ?? candidateIdOf(path.basename(fileAbs), cid);
  const p = await promptFor(fileAbs, cid);
  return {
    meta: {
      id: libraryId(film.slug, cid, folder.slug, candidate),
      kind: 'face', name, film: { slug: film.slug, title: film.title },
      character: { id: cid, name, ...(opts.role ? { role: opts.role } : {}) },
      status, round: opts.round, candidate,
      ...(p ? { prompt: p.prompt, promptFrom: p.from } : {}),
      dates: { made: await mtimeDay(fileAbs), ...(status === 'picked' ? { picked: new Date().toISOString().slice(0, 10) } : {}) },
      tags: [film.title, cid, name, ...(opts.role ? [opts.role] : [])],
    },
    files: [{ abs: fileAbs, role: 'face' }],
  };
}

/** One voice: a design option (preview) or the character's picked voice, with its element line. Reads both shapes:
 *  cast.json + element-lines-5s.json as a list (newer films) or a map with voice_id (older films). */
export async function voiceDraft(film: FilmInfo, cid: string, option: number | undefined, status: 'picked' | 'saved', opts: { role?: string } = {}): Promise<LibraryDraft | undefined> {
  const folder = await idFolder(film, 'cast', cid);
  const base = cid.replace(/[a-z]$/, '');
  const optionsAll = await readJson(path.join(film.dir, 'voices', 'options.json'));
  const castAll = await readJson(path.join(film.dir, 'voices', 'cast.json'));
  const O = rec(optionsAll?.[cid]) ?? rec(optionsAll?.[base]);
  const C = rec(castAll?.[cid]);
  const lines = await fs.readFile(path.join(film.dir, 'voices', 'element-lines-5s.json'), 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
  const el = Array.isArray(lines) ? rec(lines.find((l) => rec(l)?.character === cid)) : rec(rec(lines)?.[cid]);
  const optNo = (o: unknown): number | undefined => num(rec(o)?.option) ?? num(rec(o)?.n);
  const fromSource = Number(/option (\d+)/.exec(str(C?.source) ?? '')?.[1]);
  const chosen = num(rec(O?.chosen)?.option) ?? num(el?.option) ?? (Number.isFinite(fromSource) ? fromSource : undefined);
  const pickedId = str(C?.voice_id) ?? str(el?.voice_id) ?? str(rec(O?.chosen)?.voice_id);
  const want = option ?? chosen;
  const opt = rec((Array.isArray(O?.options) ? O!.options : []).find((o) => optNo(o) === want));
  const isPick = !!pickedId && (option === undefined || option === chosen);
  if (!opt && !isPick) return undefined;
  const name = str(C?.name) ?? str(el?.name) ?? str(O?.name) ?? (folder ? titleCase(folder.slug) : cid);
  const files: LibraryDraft['files'] = [];
  const preview = str(opt?.file);
  if (preview) files.push({ abs: path.join(film.dir, preview), role: 'preview', label: `option ${want}` });
  const elFile = isPick ? str(el?.file) : undefined;
  if (elFile) files.push({ abs: path.join(film.dir, elFile), role: 'element line' });
  if (!files.length) return undefined;
  const voiceId = isPick ? pickedId : str(opt?.voice_id) ?? str(opt?.gid);
  const prompt = str(rec(rec(O?.rounds)?.[str(opt?.round) ?? ''])?.design_prompt) ?? str(O?.design_prompt) ?? str(opt?.desc) ?? str(opt?.brief);
  return {
    meta: {
      id: libraryId(film.slug, cid, folder?.slug ?? name, 'voice', want !== undefined ? `option-${want}` : 'pick'),
      kind: 'voice', name, film: { slug: film.slug, title: film.title },
      character: { id: cid, name, ...(opts.role ? { role: opts.role } : {}) },
      status, round: str(opt?.round), candidate: want !== undefined ? `option ${want}` : undefined,
      ...(prompt ? { prompt, promptFrom: path.join(film.dir, 'voices', 'options.json') } : {}),
      voice: {
        voiceId, voiceIdKind: isPick ? 'saved voice' : 'design preview',
        model: str(C?.model), hz: num(el?.f0) ?? num(opt?.f0_element_line) ?? num(opt?.f0), seconds: isPick ? num(el?.seconds) : num(opt?.seconds),
        source: isPick ? str(C?.source) ?? (want !== undefined ? `design option ${want}` : undefined) : `design option ${want}${opt?.round ? ` (${str(opt.round)} round)` : ''}`,
        note: isPick ? str(C?.note) ?? str(rec(O?.chosen)?.note) ?? str(el?.note) : undefined,
      },
      dates: { made: preview ? await mtimeDay(path.join(film.dir, preview)) : undefined, ...(status === 'picked' ? { picked: new Date().toISOString().slice(0, 10) } : {}) },
      tags: [film.title, cid, name, ...(opts.role ? [opts.role] : [])],
    },
    files,
  };
}

/** A whole character: the picked face, the wardrobe pick, the locked sheet, the video element and the voice. */
export async function characterDraft(film: FilmInfo, cid: string, status: 'picked' | 'saved', opts: { role?: string } = {}): Promise<LibraryDraft | undefined> {
  const folder = await idFolder(film, 'cast', cid);
  if (!folder) return undefined;
  const name = await characterName(film, cid, folder.slug);
  const files: LibraryDraft['files'] = [];
  const face = await newestPick(folder.dir, /^pick-face(-v\d+)?\.(png|jpe?g|webp)$/i);
  if (face) files.push({ abs: face, role: 'face' });
  const ward = await newestPick(folder.dir, /^pick-wardrobe(-v\d+)?\.(png|jpe?g|webp)$/i);
  if (ward) files.push({ abs: ward, role: 'wardrobe' });
  const sheet = await newestPick(folder.dir, /^pick(-v\d+)?\.(png|jpe?g|webp)$/i);
  if (sheet) files.push({ abs: sheet, role: 'sheet' });
  const els = rec(rec((await readJson(path.join(film.dir, 'elements.json')))?.[cid]));
  const element = await elementFile(film, cid);
  if (element) files.push({ abs: element, role: 'element' });
  const v = await voiceDraft(film, cid, undefined, status);
  for (const f of v?.files ?? []) files.push(f);
  if (!sheet && !face) {
    // a non-human character keeps one hero reference (pick-machine.png): that is its sheet
    const hero = (await names(folder.dir)).find((n) => /^pick-(?!face|wardrobe)[a-z]+\.(png|jpe?g|webp)$/i.test(n));
    if (!hero) return undefined;
    files.unshift({ abs: path.join(folder.dir, hero), role: 'sheet' });
  }
  return {
    meta: {
      id: libraryId(film.slug, cid, folder.slug),
      kind: 'character', name, film: { slug: film.slug, title: film.title },
      character: { id: cid, name, ...(opts.role ? { role: opts.role } : {}) },
      status,
      ...(v?.meta.voice ? { voice: v.meta.voice } : {}),
      note: [str(els?.name) ? `image element ${str(els!.name)}` : '', element ? `video element ${path.relative(film.dir, element)}` : ''].filter(Boolean).join(' · ') || undefined,
      dates: { made: sheet ? await mtimeDay(sheet) : undefined, ...(status === 'picked' ? { picked: new Date().toISOString().slice(0, 10) } : {}) },
      tags: [film.title, cid, name, ...(opts.role ? [opts.role] : [])],
    },
    files,
  };
}

/** A location: the master (else its newest pick), the plan, the lighting description and the newest version of each view. */
export async function locationDraft(film: FilmInfo, lid: string, status: 'picked' | 'saved', opts: { candidateAbs?: string; candidate?: string; round?: string; name?: string } = {}): Promise<LibraryDraft | undefined> {
  const folder = await idFolder(film, 'locations', lid);
  if (!folder) return undefined;
  const name = opts.name ?? `the ${titleCase(folder.slug)}`;
  const files: LibraryDraft['files'] = [];
  const root = await names(folder.dir);
  let main: string | undefined = opts.candidateAbs;
  if (!main) {
    const master = root.find((n) => /-master(-v\d+)?\.(png|jpe?g)$/i.test(n));
    const pick = root.filter((n) => /-pick-.*\.(png|jpe?g)$/i.test(n)).pop();
    main = master ? path.join(folder.dir, master) : pick ? path.join(folder.dir, pick) : undefined;
  }
  if (!main) return undefined;
  files.push({ abs: main, role: opts.candidateAbs ? 'candidate' : /-master/.test(main) ? 'master' : 'pick' });
  if (!opts.candidateAbs) {
    const top = root.find((n) => /-top(-v\d+)?\.(png|jpe?g)$/i.test(n));
    if (top) files.push({ abs: path.join(folder.dir, top), role: 'plan' });
    const light = root.find((n) => /-lighting\.md$/.test(n));
    if (light) files.push({ abs: path.join(folder.dir, light), role: 'lighting' });
    const viewsDir = path.join(folder.dir, 'views');
    const newest = new Map<string, string>();
    for (const n of await names(viewsDir)) {
      const m = /^(.*)-v(\d+)\.(png|jpe?g)$/i.exec(n);
      if (!m) continue;
      const prev = newest.get(m[1]);
      if (!prev || natCmp(prev, n) < 0) newest.set(m[1], n);
    }
    for (const [k, n] of newest) files.push({ abs: path.join(viewsDir, n), role: 'view', label: k.replace(`${folder.name}-`, '') });
  }
  const p = await promptFor(main, lid);
  const candidate = opts.candidate ?? (opts.candidateAbs ? candidateIdOf(path.basename(opts.candidateAbs), lid) : undefined);
  return {
    meta: {
      id: libraryId(film.slug, lid, folder.slug, candidate),
      kind: 'location', name, film: { slug: film.slug, title: film.title },
      location: { id: lid, name },
      status, round: opts.round, candidate,
      ...(p ? { prompt: p.prompt, promptFrom: p.from } : {}),
      dates: { made: await mtimeDay(main), ...(status === 'picked' ? { picked: new Date().toISOString().slice(0, 10) } : {}) },
      tags: [film.title, lid, name],
    },
    files,
  };
}
