'use client';
// The library as the pages see it (GET /api/library), and the two actions that write: the pick and "Save to library".
import { useCallback, useEffect, useState } from 'react';

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
  voice?: { voiceId?: string; voiceIdKind?: 'saved voice' | 'design preview' | 'deleted voice'; model?: string; hz?: number; seconds?: number; source?: string; note?: string };
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
  kind: 'face' | 'wardrobe' | 'sheet' | 'voice' | 'location' | 'prop' | 'take';
  target: string;
  round?: string;
  candidate?: string;
  prediction?: string;
  note?: string;
  source?: 'round' | 'library';
  libraryId?: string;
  libraryKind?: LibraryKind;
  from?: string;
}

export async function postPick(film: string, body: PickBody): Promise<{ ok: boolean; error?: string; tasteRow?: string }> {
  try {
    const r = await fetch(`/api/films/${film}/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; tasteRow?: string };
    return r.ok ? { ok: true, tasteRow: j.tasteRow } : { ok: false, error: j.error ?? `pick: ${r.status}` };
  } catch {
    return { ok: false, error: 'The harness server is not answering' };
  }
}

export async function postSave(film: string, kind: LibraryKind, ref: string): Promise<{ ok: boolean; error?: string; created?: boolean; id?: string }> {
  try {
    const r = await fetch('/api/library/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ film, kind, ref }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; created?: boolean; id?: string };
    return r.ok ? { ok: true, created: j.created, id: j.id } : { ok: false, error: j.error ?? `save: ${r.status}` };
  } catch {
    return { ok: false, error: 'The harness server is not answering' };
  }
}
