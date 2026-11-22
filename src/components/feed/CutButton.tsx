'use client';
// "See it in the cut" and "Hear it in the cut". A card that is
// about something on the cut opens the Edit page at it: the playhead a second before, the clip selected, a take or a
// sound's try in place and not in the film (components/edit/openAt.ts). Nothing is saved by the press.
import Link from 'next/link';
import type { FeedCut, FilmState } from '@/server/types';
import { cutHref, cutWords } from '@/components/edit/cutLink';
import { cn } from '@/lib/utils';

export function CutButton({ film, cut, label, className }: { film: string; cut: FeedCut; label?: string; className?: string }) {
  const words = label ?? cutWords(cut);
  return (
    <Link href={cutHref(film, cut)} data-cut-link={cut.sound ? 'hear' : 'see'} title={`${words}: the Edit page opens there, with the playhead just before it. Nothing changes until you keep it.`}
      className={cn('inline-flex h-7 w-fit flex-none items-center gap-1.5 rounded-lg border border-edge px-2.5 text-[12px] text-ink no-underline transition-colors duration-150 hover:border-edge-strong hover:bg-raised', className)}>
      {cut.sound ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6z" /><path d="M11 5.5a3.5 3.5 0 010 5M12.8 3.5a6.3 6.3 0 010 9" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M1.5 9.5h13M6 9.5V13M10 9.5V13" /></svg>
      )}
      {words}
    </Link>
  );
}

/** Whether the film's cut has a picture of a scene (a take of it can be tried there). */
export function sceneInCut(state: FilmState | undefined, scene: string | undefined): boolean {
  if (!state || !scene) return false;
  return !!state.cut?.current?.tracks.some((t) => t.kind === 'video' && t.clips.some((c) => (c.takeRef?.scene ?? c.scene) === scene));
}
