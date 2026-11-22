// "Save to the library" (Flow v3.3 - 2 Characters step 11): copies one candidate of a film into the library
// across films, with its meta.json. Shared by POST /api/library/save and its unit check (scripts/library-save-test.ts).
// The film's own files and its pick are never changed: the library gets a copy.
import path from 'node:path';
import { filmTarget } from '../actions/film';
import { Writer } from '../actions/writes';
import { characterDraft, faceDraft, findCandidate, idFolder, locationDraft, voiceDraft } from './sources';
import { LIBRARY_KINDS, saveEntry, type LibraryDraft, type LibraryKind, type LibraryMeta } from './store';

export interface SaveBody {
  film?: string;
  kind?: string;
  ref?: string;          // a film-relative path, or an ID with a candidate ("C01 r2-7", "C01 option 3", "L01 u5b-2")
  target?: string;
  candidate?: string;
  round?: string;
  note?: string;         // a line of the user's own, kept in meta.json
}

export type SaveAnswer =
  | { ok: true; id: string; kind: LibraryKind; created: boolean; noted?: boolean; meta: LibraryMeta; writes: unknown[] }
  | { ok: false; status: number; error: string };

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The note the user typed: one line, at most 400 characters. */
export const cleanNote = (v: unknown): string | undefined => s(v)?.replace(/\s+/g, ' ').slice(0, 400);

export async function saveToLibrary(body: SaveBody): Promise<SaveAnswer> {
  const kind = s(body.kind) as LibraryKind | undefined;
  if (!kind || !LIBRARY_KINDS.includes(kind)) return { ok: false, status: 400, error: `kind must be one of ${LIBRARY_KINDS.join(', ')}` };
  const ft = await filmTarget(s(body.film) ?? '');
  if (!ft) return { ok: false, status: 404, error: 'no such film folder' };
  const ref = s(body.ref) ?? '';
  const film = { slug: ft.slug, title: ft.title, dir: ft.dir };
  const idm = /^([A-Z]\d+[a-z]?)(?:\s+(?:option\s+)?(\S+))?$/.exec(ref);
  const target = s(body.target) ?? idm?.[1] ?? /(?:cast|locations)\/([A-Z]\d+[a-z]?)-/.exec(ref)?.[1];
  const candidate = s(body.candidate) ?? idm?.[2];
  const fileAbs = !idm && ref ? path.join(ft.dir, path.normalize(ref)) : undefined;
  if (fileAbs && !fileAbs.startsWith(ft.dir + path.sep)) return { ok: false, status: 400, error: 'ref is outside the film folder' };
  if (!target) return { ok: false, status: 400, error: 'ref names no character or location ID' };
  let d: LibraryDraft | undefined;
  if (kind === 'face') {
    let abs = fileAbs;
    if (!abs && candidate) {
      const folder = await idFolder(film, 'cast', target);
      abs = folder ? (await findCandidate(folder.dir, target, candidate, s(body.round)))?.abs : undefined;
    }
    d = abs ? await faceDraft(film, target, abs, 'saved', { round: abs.split(path.sep).at(-2) }) : undefined;
  } else if (kind === 'voice') {
    const n = Number(/(\d+)(?:\.mp3)?$/.exec(candidate ?? ref)?.[1]);
    d = await voiceDraft(film, target, Number.isInteger(n) ? n : undefined, 'saved');
  } else if (kind === 'character') {
    d = await characterDraft(film, target, 'saved');
  } else {
    let abs = fileAbs;
    if (!abs && candidate) {
      const folder = await idFolder(film, 'locations', target);
      abs = folder ? (await findCandidate(folder.dir, target, candidate, s(body.round)))?.abs : undefined;
    }
    d = await locationDraft(film, target, 'saved', abs ? { candidateAbs: abs, round: abs.split(path.sep).at(-2) } : {});
  }
  if (!d) return { ok: false, status: 404, error: `nothing to save for ${kind} ${ref}` };
  const note = cleanNote(body.note);
  if (note) d.meta.note = note;
  const w = new Writer(`library save ${kind} ${ft.slug} ${ref}`, ft.show);
  const r = await saveEntry(d, w);
  return { ok: true, id: r.id, kind, created: r.created, ...(r.noted ? { noted: true } : {}), meta: r.meta, writes: w.records };
}
