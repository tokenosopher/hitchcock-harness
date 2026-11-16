'use client';
// The model picked for a film that does not exist yet (the Idea page, /films/new). The picker sits in the thread
// column and Start sits on the page, so the choice lives here, outside both. It is sent with Start and becomes the
// new film's own choice. Kept in this browser so the next new film opens on the same one.
import { useSyncExternalStore } from 'react';
import { ALMA_MODELS, type AlmaModel } from '@/server/types';

const KEY = 'hh-new-film-model';
const listeners = new Set<() => void>();
let current: AlmaModel | undefined;

function read(): AlmaModel {
  if (current !== undefined) return current;
  let v = '';
  try { v = window.localStorage.getItem(KEY) ?? ''; } catch { /* private window */ }
  current = ALMA_MODELS.some((m) => m.id === v) ? (v as AlmaModel) : '';
  return current;
}

export function setNewFilmModel(m: AlmaModel): void {
  current = m;
  try { window.localStorage.setItem(KEY, m); } catch { /* private window */ }
  for (const l of listeners) l();
}

export function useNewFilmModel(): AlmaModel {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => '' as AlmaModel);
}
