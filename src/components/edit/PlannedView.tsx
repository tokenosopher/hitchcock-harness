'use client';
// What the player shows before the takes are in (15 Nov 2026, ASKS 47; drawn as To build 3, 12 and 13): over the live
// player, the planned clip under the playhead. With only the script, the line being read (who, the words, what comes
// next); a planned shot as its description and who is in frame; a board as its picture. The line under the playhead is
// the subtitle under a shot or a board. A take plays as before and this draws nothing. Each change fades (200 ms).
import type { Timeline, TimelineClip } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { endF, pictureAt, startF } from './model';
import { isFirstPart } from './planned';

const secs = (c: TimelineClip) => `${Math.round((c.out - c.in) * 10) / 10} s`;
const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="pointer-events-none absolute left-2 top-2 z-[2] max-w-[calc(100%-16px)] truncate rounded-[5px] border border-white/15 bg-black/75 px-1.5 py-px text-[11px] text-ink">{children}</span>
);

/** The lines of the Dialogue track that are lines of the script, in time order. */
function scriptLines(tl: Timeline): TimelineClip[] {
  const a = tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio');
  return (a?.clips ?? []).filter((c) => c.plan === 'line' && !c.muted).sort((x, y) => x.at - y.at);
}

/** The planned picture under the playhead, or the line being read; nothing while a take plays. */
export function PlannedView({ tl, frame }: { tl: Timeline; frame: number }) {
  const fps = tl.fps;
  const pic = pictureAt(tl, frame);
  if (pic && !pic.clip.plan) return null;
  const lines = scriptLines(tl);
  if (!pic && !lines.length) return null;
  const at = lines.find((c) => startF(c, fps) <= frame && endF(c, fps) > frame);
  const spoken = at?.who ? at : undefined;
  const subtitle = spoken && (
    <p key={spoken.id} data-planned-sub className="pointer-events-none absolute inset-x-3 bottom-[11%] z-[2] m-0 text-center text-[12.5px] leading-snug text-ink duration-200 animate-in fade-in-0">
      <span className="rounded-[4px] bg-black/60 px-1.5 py-px [box-decoration-break:clone]">“{spoken.text}”</span>
    </p>
  );
  if (pic?.clip.plan === 'board') {
    const c = pic.clip;
    return (
      <span data-planned="board" className="absolute inset-0 z-[1] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- the board, a still from /api/media */}
        <img key={c.src} alt={`Board for ${c.scene}, shot ${c.shot}: ${c.text ?? ''}`} src={mediaUrl(c.src ?? '', { w: 640 })} className="absolute inset-0 size-full object-contain duration-200 animate-in fade-in-0" />
        <Tag>{c.scene} · shot {c.shot} · {c.panel ? `board ${c.panel.k} of ${c.panel.of} · ${c.panel.s.toFixed(2)} s` : 'board'}</Tag>
        {subtitle}
      </span>
    );
  }
  if (pic?.clip.plan === 'shot') {
    const c = pic.clip;
    return (
      <span data-planned="shot" className="absolute inset-0 z-[1] flex flex-col bg-black">
        <Tag>{c.scene} · shot {c.shot} · planned</Tag>
        <span key={c.id} className="flex flex-1 flex-col justify-center gap-2 px-4 pb-14 pt-10 duration-200 animate-in fade-in-0">
          <span className="text-[11px] text-sub">Shot {c.shot} <span className="text-mute">· {secs(c)} planned</span></span>
          <span className="line-clamp-6 text-[13.5px] font-medium leading-snug text-ink">{c.text}</span>
          {c.inFrame && <span className="line-clamp-3 text-[11.5px] leading-snug text-sub">In frame: {c.inFrame}.</span>}
        </span>
        {subtitle}
      </span>
    );
  }
  // only the script: the line being read, else the one just read (a pause between lines), else the first to come
  const shown = at ?? [...lines].reverse().find((c) => startF(c, fps) <= frame) ?? lines[0];
  const scene = lines.filter((c) => c.scene === shown.scene);
  const spokenIn = scene.filter(isFirstPart);
  const next = lines[lines.indexOf(shown) + 1];
  const n = spokenIn.filter((c) => c.at <= shown.at + 1e-6).length;
  return (
    <span data-planned="line" className="absolute inset-0 z-[1] flex flex-col bg-black">
      <Tag>{shown.scene} · {shown.who ? `line ${n} of ${spokenIn.length}${shown.parts ? ` · part ${shown.part} of ${shown.parts}` : ''}` : 'action'}</Tag>
      <span key={shown.id} className="flex flex-1 flex-col justify-center gap-2 px-4 pt-8 duration-200 animate-in fade-in-0">
        {shown.who ? (
          <>
            <span className="font-mono text-[11px] tracking-[0.06em] text-sub">{shown.who}</span>
            <span className="line-clamp-[8] text-[15px] font-medium leading-snug text-ink">“{shown.text}”</span>
          </>
        ) : <span className="line-clamp-[8] text-[13.5px] italic leading-snug text-ink-3">{shown.text}</span>}
      </span>
      {next && next.scene === shown.scene && (
        <span key={`n-${next.id}`} title={next.who ? `${next.who.charAt(0) + next.who.slice(1).toLowerCase()}, “${next.text}”` : next.text} className="mx-3 mb-3 truncate border-t border-white/10 pt-2 text-[11px] text-sub duration-200 animate-in fade-in-0">
          Next: {next.who ? <span className="text-ink-3">{next.who.charAt(0) + next.who.slice(1).toLowerCase()}, “{next.text}”</span> : <i className="text-ink-3">{next.text}</i>}
        </span>
      )}
    </span>
  );
}
