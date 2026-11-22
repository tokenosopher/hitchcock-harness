// The library across films: studio/assets/library/{faces,voices,characters,locations}/<id>/ (HARNESS_LIBRARY)
// with meta.json and the files, copied (never moved) from the film folders.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { harnessConfig } from '../config';
import { DRIVE_MISSING, driveConnected } from '../actions/film';
import { isDir, isFile, type Writer } from '../actions/writes';

/** What a library voice's voiceId is. 'saved voice': saved on Higgsfield, reused by its id. 'picked preview': a film's
 *  pick recorded without saving (Flow v3.3 - 3 step 5): no voice id, the picked preview file is the voice, reused by that
 *  file or its design. 'design preview': an option that was not picked (its id is the design's). 'deleted voice': saved
 *  once, deleted from Higgsfield since; its preview and samples remain. */
export type VoiceIdKind = 'saved voice' | 'picked preview' | 'design preview' | 'deleted voice';

export type LibraryKind = 'face' | 'voice' | 'character' | 'location';
export const LIBRARY_KINDS: LibraryKind[] = ['face', 'voice', 'character', 'location'];
export const FOLDER: Record<LibraryKind, string> = { face: 'faces', voice: 'voices', character: 'characters', location: 'locations' };

export interface LibraryFile {
  role: string;                 // "face", "sheet", "wardrobe", "element", "preview", "element line", "master", "view", "lighting"
  file: string;                 // name inside the item's folder
  source: string;               // where it came from: assets/films/<film>/… (or the final-cuts path)
  label?: string;               // a view's camera, a preview's option
}

export interface LibraryMeta {
  id: string;
  kind: LibraryKind;
  name: string;                 // "Maren", "the shore"
  film: { slug: string; title: string };
  character?: { id: string; name: string; role?: string };
  location?: { id: string; name: string };
  status: 'picked' | 'saved';
  round?: string;               // the round folder the candidate came from
  candidate?: string;           // "r1-7", "option 3", "u5b-2"
  prompt?: string;              // the prompt that made it, when the round's prompt file has it
  promptFrom?: string;
  voice?: { voiceId?: string; voiceIdKind?: VoiceIdKind; model?: string; hz?: number; seconds?: number; source?: string; note?: string };
  dates: { made?: string; picked?: string; saved: string };
  files: LibraryFile[];
  thumb?: string;               // a small jpeg made with sips for the grids
  tags: string[];               // film title, role, character or location id
  note?: string;
}

/** What a library entry is made from before it has a folder: the meta without dates, and the absolute sources. */
export interface LibraryDraft {
  meta: Omit<LibraryMeta, 'dates' | 'files' | 'thumb'> & { dates?: Partial<LibraryMeta['dates']> };
  files: { abs: string; role: string; label?: string; as?: string }[];
}

export function libraryRoot(): string {
  const cfg = harnessConfig();
  return cfg.library ?? path.join(cfg.driveRoot, 'library');
}

export class LibraryUnavailable extends Error {
  constructor() {
    super(DRIVE_MISSING);
  }
}

/** The library folder, created on first use; throws when the studio's assets folder (or the test root) is not there. */
export async function ensureLibrary(w?: Writer): Promise<string> {
  const root = libraryRoot();
  const onDrive = root.startsWith(harnessConfig().driveRoot + path.sep);
  if (onDrive && !(await driveConnected())) throw new LibraryUnavailable();
  if (!onDrive && !(await isDir(path.dirname(root)))) throw new LibraryUnavailable();
  for (const k of LIBRARY_KINDS) {
    const d = path.join(root, FOLDER[k]);
    if (!(await isDir(d))) {
      if (w) await w.mkdir(d);
      else await fs.mkdir(d, { recursive: true });
    }
  }
  return root;
}

/** "Maren and the Sea", "C01", "r1-7" → "maren-and-the-sea-c01-r1-7". */
export function libraryId(...parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

const today = (): string => new Date().toISOString().slice(0, 10);

function sips(src: string, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('/usr/bin/sips', ['-Z', '480', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', src, '--out', out], { timeout: 30000 }, (err) => resolve(!err));
  });
}

export interface SaveResult { id: string; kind: LibraryKind; dir: string; created: boolean; upgraded?: boolean; noted?: boolean; meta: LibraryMeta }

/** Writes one entry: copies the files beside meta.json. An entry already there keeps its files; a pick of a saved
 *  entry only turns its status to "picked", and a new note of the user's replaces its note (the library is the
 *  harness's own folder, not a film's). */
export async function saveEntry(draft: LibraryDraft, w: Writer): Promise<SaveResult> {
  const root = await ensureLibrary(w);
  const kind = draft.meta.kind;
  const dir = path.join(root, FOLDER[kind], draft.meta.id);
  const metaFile = path.join(dir, 'meta.json');
  if (await isFile(metaFile)) {
    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8')) as LibraryMeta;
    const upgraded = draft.meta.status === 'picked' && meta.status !== 'picked';
    const noted = !!draft.meta.note && draft.meta.note !== meta.note;
    if (upgraded || noted) {
      const next: LibraryMeta = {
        ...meta,
        ...(upgraded ? { status: 'picked' as const, dates: { ...meta.dates, picked: draft.meta.dates?.picked ?? today() } } : {}),
        ...(noted ? { note: draft.meta.note } : {}),
      };
      if (!w.dryRun) await fs.writeFile(metaFile, JSON.stringify(next, null, 1) + '\n');
      await w.ran([upgraded ? 'status saved → picked' : '', noted ? 'the note' : ''].filter(Boolean).join(', '), w.show(metaFile));
      return { id: meta.id, kind, dir, created: false, ...(upgraded ? { upgraded } : {}), ...(noted ? { noted } : {}), meta: next };
    }
    return { id: meta.id, kind, dir, created: false, meta };
  }
  const files: LibraryFile[] = [];
  const used = new Set<string>();
  for (const f of draft.files) {
    if (!(await isFile(f.abs))) continue;
    let name = f.as ?? path.basename(f.abs);
    for (let k = 2; used.has(name); k++) name = name.replace(/(\.[^.]+)$/, `-${k}$1`);
    used.add(name);
    await w.copyNew(f.abs, path.join(dir, name));
    files.push({ role: f.role, file: name, source: w.show(f.abs), ...(f.label ? { label: f.label } : {}) });
  }
  let thumb: string | undefined;
  const img = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f.file) && ['face', 'master', 'sheet', 'candidate'].includes(f.role)) ?? files.find((f) => /\.(png|jpe?g|webp)$/i.test(f.file));
  if (img && !w.dryRun && (await sips(path.join(dir, img.file), path.join(dir, 'thumb.jpg')))) thumb = 'thumb.jpg';
  const { dates, ...rest } = draft.meta;
  const meta: LibraryMeta = {
    ...rest,
    ...(rest.promptFrom ? { promptFrom: w.show(rest.promptFrom) } : {}),
    dates: { saved: today(), ...dates },
    files,
    ...(thumb ? { thumb } : {}),
  };
  await w.writeNew(metaFile, JSON.stringify(meta, null, 1) + '\n');
  return { id: meta.id, kind, dir, created: true, meta };
}

export interface LibraryList {
  root: string;
  counts: Record<'faces' | 'voices' | 'characters' | 'locations', number>;
  items: LibraryMeta[];
  note?: string;
}

/** Every entry's meta.json, newest saved first. */
export async function listLibrary(): Promise<LibraryList> {
  const root = libraryRoot();
  const counts = { faces: 0, voices: 0, characters: 0, locations: 0 };
  const onDrive = root.startsWith(harnessConfig().driveRoot + path.sep);
  if ((onDrive && !(await driveConnected())) || !(await isDir(root))) return { root, counts, items: [], note: onDrive && !(await driveConnected()) ? DRIVE_MISSING : 'library is empty' };
  const items: LibraryMeta[] = [];
  for (const k of LIBRARY_KINDS) {
    const dir = path.join(root, FOLDER[k]);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    for (const n of names) {
      if (n.startsWith('.')) continue;
      try {
        const m = JSON.parse(await fs.readFile(path.join(dir, n, 'meta.json'), 'utf8')) as LibraryMeta;
        if (m && m.id && m.kind === k) items.push(m);
      } catch { /* a folder without meta.json is not an entry yet */ }
    }
    counts[FOLDER[k] as keyof typeof counts] = items.filter((i) => i.kind === k).length;
  }
  items.sort((a, b) => (b.dates.picked ?? b.dates.saved).localeCompare(a.dates.picked ?? a.dates.saved) || a.id.localeCompare(b.id));
  return { root, counts, items };
}

export async function getEntry(kind: LibraryKind, id: string): Promise<{ meta: LibraryMeta; dir: string } | undefined> {
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return undefined;
  const dir = path.join(libraryRoot(), FOLDER[kind], id);
  try {
    return { meta: JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8')) as LibraryMeta, dir };
  } catch {
    return undefined;
  }
}

/** A file of an entry, for the page's thumbnails and players; only names listed in meta.json (or thumb.jpg). */
export async function entryFile(kind: LibraryKind, id: string, file: string): Promise<string | undefined> {
  // a plain name in the entry's folder: a meta.json (a library from elsewhere) may name "../" or a full path
  if (!file || path.basename(file) !== file) return undefined;
  const e = await getEntry(kind, id);
  if (!e) return undefined;
  if (file !== e.meta.thumb && !e.meta.files.some((f) => f.file === file)) return undefined;
  return path.join(e.dir, file);
}
