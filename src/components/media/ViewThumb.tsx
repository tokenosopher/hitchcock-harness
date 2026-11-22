'use client';
// The painted view of the location behind one shot: a small picture with the view's name over its foot. A
// click opens it large (the page's Lightbox reads data-zoom). The name hides when the cell is too narrow to read it;
// the large view still says it in full.
import { useState } from 'react';
import type { ShotView } from '@/server/types';
import { cn } from '@/lib/utils';
import { mediaUrl } from './Media';

/** "SHORE FRONT" as the page says it: "Shore front". */
export const viewName = (tag: string): string => {
  const t = tag.trim().replace(/[_\s]+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The words that tell a scene's views apart: the first word they all share (the place, "SHORE") is dropped, so a
 *  narrow cell still reads "Front", "Back", "West". Kept whole when a tag is that word alone. */
export function shortViewNames(views: ShotView[]): Map<string, string> {
  const tags = [...new Set(views.map((v) => v.tag.trim().replace(/[_\s]+/g, ' ')))];
  const first = tags[0]?.split(' ')[0];
  const shared = !!first && tags.every((t) => t.split(' ').length > 1 && t.split(' ')[0] === first);
  return new Map(views.map((v) => {
    const t = v.tag.trim().replace(/[_\s]+/g, ' ');
    return [v.tag, viewName(shared ? t.slice(first!.length + 1) : t)];
  }));
}

export function ViewThumb({ view, src, scene, label, className }: { view: ShotView; src: string; scene?: string; label?: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const name = viewName(view.tag);
  const alt = `${name}, the painted view behind ${scene ? `${scene} ` : ''}shot ${view.shot} · ${view.tag}`;
  return (
    <button type="button" data-shot-view={view.shot} data-zoom={mediaUrl(src)} data-zoom-alt={alt} aria-label={`${alt}. Open it large`} title={alt}
      className={cn('@container group/view relative block min-w-0 cursor-zoom-in overflow-hidden rounded-[6px] border border-edge bg-panel text-left duration-200 animate-in fade-in-0 transition-colors hover:border-sub', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail through the media route, as everywhere here */}
      <img src={mediaUrl(src, { w: 320 })} alt="" loading="lazy" draggable={false} onLoad={() => setLoaded(true)}
        className={cn('pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-200 ease-out', loaded ? 'opacity-100' : 'opacity-0')} />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden truncate bg-gradient-to-t from-black/85 to-black/0 px-1.5 pb-[3px] pt-3 text-[10.5px] font-medium leading-none text-ink @[40px]:block">
        {label ?? name}
      </span>
    </button>
  );
}
