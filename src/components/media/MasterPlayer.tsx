'use client';
// The way into the 1080p cut (13 Nov 2026, ASKS 37). The owner: "there is no finish step at that point … you finish the
// 480p, you get to 1080p … The view goes to the 1080, with everything in the timeline". So the full-size cut is not a
// player of its own: the Finish page and the board's Finish step say plainly what exists (a full-size picture of cut
// v230, made 13 Nov, and its sound) and open the Edit page in its 1080p view. FilmState.master comes from
// src/server/films/read/master.ts.
import Link from 'next/link';
import type { FilmState } from '@/server/types';
import { fmtDate, repoPath } from '@/components/lib/format';
import { mediaUrl } from '@/components/media/Media';
import { IconChevronRight } from '@/components/shell/icons';
import { aspectStyle, isWide } from '@/lib/frame';
import { cn } from '@/lib/utils';

/** The key the Edit page reads for its 480p · 1080p choice, kept for the tab. */
export const resKey = (film: string) => `hh:edit-res:${film}`;

export function FullCutLink({ s, base }: { s: FilmState; base: string }) {
  const m = s.master;
  if (!m) return null;
  const still = mediaUrl(repoPath(s.film.folder, s.film.repo, m.path), { w: 320, t: 1 });
  const now = s.cut?.current?.version;
  const toEdit = () => { try { sessionStorage.setItem(resKey(s.film.slug), '1080'); } catch { /* the Edit page opens at 1080p by itself */ } };
  return (
    <section id="master" aria-label="The 1080p cut" className="flex scroll-mt-4 items-center gap-4 duration-300 animate-in fade-in-0 motion-reduce:animate-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- a WebP still from /api/media */}
      <img alt="" src={still} style={aspectStyle(s.film.aspect)} className={cn('aspect-[9/16] flex-none rounded-[6px] border border-edge bg-black object-cover', isWide(s.film.aspect) ? 'w-[114px] max-[760px]:w-[72px]' : 'w-[64px]')} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="lbl">The 1080p cut</span>
        <span className="text-[13.5px] leading-normal">
          A full-size picture of {m.version ? `cut ${m.version}` : 'the cut'}{m.date ? `, made ${fmtDate(m.date)}` : ''}{m.sound ? ` (${m.sound})` : ''}.
          {now && m.version && now !== m.version ? <span className="text-sub"> The cut is now {now}; the timeline shows each shot at full size where the picture is the same.</span> : null}
        </span>
        {m.ask && <span className="text-[12.5px] text-sub">It waits for your yes: “{m.ask.title}”.</span>}
      </div>
      {s.cut?.current && (
        <Link href={`${base}/edit`} onClick={toEdit} className="inline-flex h-8 flex-none items-center gap-1 rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline transition-colors duration-200 hover:bg-ink-3">
          Open it on the timeline<IconChevronRight size={13} />
        </Link>
      )}
    </section>
  );
}
