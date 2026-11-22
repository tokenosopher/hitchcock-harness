'use client';
// The library as the pages see it (GET /api/library), and the two actions that write: the pick and "Save to library".
import { useCallback, useEffect, useState } from 'react';
import { almaFetch } from '@/components/data/almaOutbox';

/** What a library voice's voiceId is. 'saved voice': saved on Higgsfield, reused by its id. 'picked preview': a film's
 *  pick recorded without saving (Flow v3.3 - 3 step 5): no voice id, the picked preview file is the voice, reused by that
 *  file or its design. 'design preview': an option that was not picked (its id is the design's). 'deleted voice': saved
 *  once, deleted from Higgsfield since; its preview and samples remain. */
export type VoiceIdKind = 'saved voice' | 'picked preview' | 'design preview' | 'deleted voice';

export type LibraryKind = 'face' | 'voice' | 'character' | 'location';
export const KIND_FOLDER: Record<LibraryKind, 'faces' | 'voices' | 'characters' | 'locations'> = { face: 'faces', voice: 'voices', character: 'characters', location: 'locations' };

/** One entry's meta.json, as the server writes it (src/server/library/store.ts). */
export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  name: string;
  film: { slug: string; title: string };
  character?: { id: string; name: string; role?: string };
  location?: { id: string; name: string };
  status: 'picked' | 'saved';
  round?: string;
  candidate?: string;
  prompt?: string;
  voice?: { voiceId?: string; voiceIdKind?: VoiceIdKind; model?: string; hz?: number; seconds?: number; source?: string; note?: string };
  dates: { made?: string; picked?: string; saved: string };
  files: { role: string; file: string; source: string; label?: string }[];
  thumb?: string;
  tags: string[];
  note?: string;
}

export interface LibraryData {
  counts: Record<'faces' | 'voices' | 'characters' | 'locations', number>;
  items: LibraryItem[];
  note?: string;
}

export const fileUrl = (it: LibraryItem, file: string) => `/api/library/file/${it.kind}/${encodeURIComponent(it.id)}/${encodeURIComponent(file)}`;
export const thumbUrl = (it: LibraryItem) => (it.thumb ? fileUrl(it, it.thumb) : undefined);
export const audioOf = (it: LibraryItem) => it.files.find((f) => f.role === 'element line') ?? it.files.find((f) => f.role === 'preview') ?? it.files.find((f) => /\.(mp3|wav|m4a)$/i.test(f.file));

export function useLibrary(): { data?: LibraryData; error?: string; reload: () => void } {
  const [data, setData] = useState<LibraryData>();
  const [error, setError] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetch('/api/library', { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as LibraryData) : Promise.reject(new Error(`library: ${r.status}`))))
      .then((d) => { if (live) { setData(d); setError(undefined); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, reload };
}

export interface PickBody {
  kind: 'face' | 'wardrobe' | 'sheet' | 'voice' | 'location' | 'prop' | 'take' | 'sfx';
  target: string;
  round?: string;
  candidate?: string;
  prediction?: string;
  note?: string;
  source?: 'round' | 'library';
  libraryId?: string;
  libraryKind?: LibraryKind;
  from?: string;
  /** sfx: the pick card it was made on. */
  card?: string;
}

export async function postPick(film: string, body: PickBody): Promise<{ ok: boolean; error?: string; tasteRow?: string }> {
  try {
    const r = await almaFetch(film, `/api/films/${film}/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; tasteRow?: string };
    return r.ok ? { ok: true, tasteRow: j.tasteRow } : { ok: false, error: j.error ?? `pick: ${r.status}` };
  } catch {
    return { ok: false, error: 'The harness server is not answering' };
  }
}

/** "Save to the library": the server copies the file in. With `note`, the user's own line goes into meta.json; sent
 *  again for an entry already saved, it only replaces the note. */
export async function postSave(film: string, kind: LibraryKind, ref: string, note?: string): Promise<{ ok: boolean; error?: string; created?: boolean; id?: string; meta?: LibraryItem }> {
  try {
    const r = await fetch('/api/library/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ film, kind, ref, ...(note ? { note } : {}) }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; created?: boolean; id?: string; meta?: LibraryItem };
    return r.ok ? { ok: true, created: j.created, id: j.id, meta: j.meta } : { ok: false, error: j.error ?? `save: ${r.status}` };
  } catch {
    return { ok: false, error: 'The harness server is not answering' };
  }
}

/** The library entry a film's file was saved as, when it was: the entry whose file came from that path. */
export function savedFrom(items: LibraryItem[] | undefined, film: string, kind: LibraryKind, refPath: string | undefined): LibraryItem | undefined {
  if (!items || !refPath) return undefined;
  const src = `assets/films/${film}/${refPath}`;
  return items.find((i) => i.kind === kind && i.film.slug === film && i.files.some((f) => f.source === src || f.source.endsWith(`/${src}`)));
}
