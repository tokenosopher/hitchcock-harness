'use client';
// The voice beside a sheet: the voice the user picked and, once made, the line the video element speaks with.
import type { FilmState } from '@/server/types';
import { repoPath } from '@/components/lib/format';
import { sheetVoice } from '@/components/lib/sheetVoice';
import { PlayButton, PlayLine } from '@/components/media/Sound';

function Row({ path, label, seconds }: { path: string; label: string; seconds?: number }) {
  return (
    <span className="flex w-[340px] max-w-full items-center gap-2.5 rounded-lg border border-edge-strong px-2.5 py-1.5">
      <PlayButton path={path} label={label} className="size-7" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12.5px] text-ink-3">{label}</span>
        <PlayLine path={path} idle seconds={seconds} />
      </span>
    </span>
  );
}

/** Nothing when the character (and, for a form, its character) has no voice yet, unless `empty` gives words for that. */
export function SheetVoice({ state, id, empty }: { state: FilmState; id: string; empty?: string }) {
  const v = sheetVoice(state.characters, id);
  if (!v) return empty ? <span className="text-[12.5px] text-sub">{empty}</span> : null;
  const to = (p: string) => repoPath(state.film.folder, state.film.repo, p);
  const whose = v.owner.id === id ? v.owner.name : `${v.owner.name} (${v.owner.id})`;
  return (
    <div data-sheet-voice={id} data-voice-of={v.owner.id} className="flex flex-col gap-2 duration-200 animate-in fade-in-0">
      {v.picked && <Row path={to(v.picked.path)} seconds={v.picked.seconds} label={`${whose}'s voice, the one you picked`} />}
      {v.line && <Row path={to(v.line.path)} seconds={v.line.seconds} label={`${whose}'s line for the video element`} />}
    </div>
  );
}
