'use client';
// The options of an effect (the user, 13 Nov 2026: "I made an effect. That effect isn't the right one … now I
// want to make another one. What's going to happen to the previous one? … scroll through the various options
// very easily"). Every try of an effect is kept in the folder of the clip's file (src/server/edit/options.ts).
// With an effect selected, its tries are listed under the timeline. A click on one, or the up and down arrows,
// puts it in the effect's place and plays that passage of the film, so each is heard under the picture and
// the voices; nothing is saved until "Use in the film". Nothing is ever removed from the list.
import { useEffect, useMemo, useState } from 'react';
import type { Timeline } from '@/server/types';
import { cn } from '@/lib/utils';

export interface SoundOption { src: string; files: string[]; name: string; seconds?: number; words?: string; peaks?: number[] }

const SOUND = /\.(wav|mp3|m4a|aac|aiff?|flac|ogg)$/i;
export const isSoundFile = (src?: string) => !!src && SOUND.test(src);
export const dirOf = (src = '') => src.slice(0, Math.max(0, src.lastIndexOf('/')));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The options of every sound clip of the cut, by folder; looked up again every 20 s, so a new try shows up. */
export function useOptions(film: string, tl?: Timeline): Map<string, SoundOption[]> {
  const key = useMemo(() => {
    const dirs = new Set<string>();
    for (const t of tl?.tracks ?? []) if (t.kind === 'audio') for (const c of t.clips) if (isSoundFile(c.src)) dirs.add(dirOf(c.src));
    return [...dirs].sort().join('\n');
  }, [tl]);
  const [groups, setGroups] = useState<Map<string, SoundOption[]>>(() => new Map());
  useEffect(() => {
    if (!key) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const q = key.split('\n').map((d) => `dir=${encodeURIComponent(d)}`).join('&');
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/options?${q}`, { cache: 'no-store' });
        if (r.ok && live) {
          const j = (await r.json()) as { groups?: { dir: string; options: SoundOption[] }[] };
          setGroups((cur) => {
            const next = new Map((j.groups ?? []).map((g) => [g.dir, g.options]));
            // the same answer keeps the same object, so the page does not redraw for nothing
            return JSON.stringify([...cur]) === JSON.stringify([...next]) ? cur : next;
          });
        }
      } catch { /* the page works without the options */ }
      if (live) timer = setTimeout(() => void load(), 20000);
    };
    void load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [film, key]);
  return groups;
}

function Shape({ o, win, p }: { o: SoundOption; win: { in: number; out: number }; p?: number }) {
  const peaks = o.peaks ?? [];
  const secs = o.seconds || win.out || 1;
  const top = Math.max(0.05, ...peaks);
  return (
    <span className="relative block h-9 w-full overflow-hidden rounded-[6px] bg-black/40" title={`The bright part is what plays in the film: ${win.in.toFixed(1)} to ${win.out.toFixed(1)} s of ${secs.toFixed(1)} s`}>
      <svg viewBox={`0 0 ${Math.max(1, peaks.length)} 36`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
        {peaks.map((v, i) => {
          const t = ((i + 0.5) / peaks.length) * secs;
          const h = Math.max(1, (v / top) * 32);
          return <rect key={i} x={i + 0.18} y={18 - h / 2} width={0.64} height={h} fill={t >= win.in && t <= win.out ? '#e4e4e7' : '#3f3f46'} />;
        })}
      </svg>
      {p !== undefined && p >= 0 && p <= 1 && <span aria-hidden="true" className="absolute inset-y-0 w-px bg-warn" style={{ left: `${((win.in + p * (win.out - win.in)) / secs) * 100}%` }} />}
    </span>
  );
}

export function EffectOptions({ title, options, current, hearing, windowOf, p, playing, onHear, onAnother }: {
  title: string;
  options: SoundOption[];
  current: string;                              // the file the film's clip plays
  hearing?: string;                             // the option put in its place for listening, not saved
  windowOf: (o: SoundOption) => { in: number; out: number };
  p?: number;                                   // how far through the effect the film is, 0…1, while it is on it
  playing: boolean;
  onHear: (o: SoundOption) => void;
  onAnother: () => void;
}) {
  const inFilm = (o: SoundOption) => o.files.includes(current) || o.src === current;
  return (
    <section aria-label="Options of this effect" className="line-in flex flex-col gap-2.5 rounded-[10px] border border-line bg-hdr p-3">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-0.5">
        <span className="min-w-0 truncate text-[13.5px] font-medium">{title}</span>
        <span className="text-[12px] text-sub">{options.length === 1 ? 'one option so far' : `${options.length} options`}{options.length > 1 ? ' · ↑ ↓ plays each one in the film · Enter uses it · Esc goes back' : ''}</span>
        <button type="button" onClick={onAnother} title="Ask Alma for one more. The ones here stay." className="ml-auto flex-none cursor-pointer rounded-lg border border-edge-strong px-2.5 py-1 text-[12px] text-ink transition-colors duration-150 hover:bg-raised">Another option…</button>
      </header>
      <ol role="listbox" aria-label="Options" className="flex flex-col gap-1.5">
        {options.map((o, i) => {
          const film = inFilm(o);
          const on = hearing ? hearing === o.src : film;       // the one the film is playing now
          const tried = !!hearing && hearing === o.src;
          return (
            <li key={o.src} role="option" aria-selected={on} onClick={() => onHear(o)} title={tried ? 'Playing in the film, not saved. Enter uses it, Esc goes back.' : film ? 'In the film. Click to hear the passage again.' : 'Click to hear it in the film'}
              className={cn('grid cursor-pointer grid-cols-[22px_112px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-[9px] border px-2.5 py-2 transition-colors duration-200',
                tried ? 'border-dashed border-warn bg-warn/[0.05]' : film ? 'border-ink bg-raised/50' : 'border-line hover:border-edge-strong hover:bg-raised/40')}>
              <span className={cn('flex size-[22px] items-center justify-center rounded-full font-mono text-[11px] transition-colors duration-200', on ? 'bg-ink text-bg' : 'border border-edge-strong text-sub')}>
                {on && playing ? <span className="flex gap-[2px]"><span className="h-2 w-[2px] bg-bg" /><span className="h-2 w-[2px] bg-bg" /></span> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{cap(o.name)}</span>
                <span className={cn('truncate text-[11.5px]', tried ? 'text-warn' : film ? 'text-ink-3' : 'text-mute')}>
                  {tried ? 'Listening' : film ? 'In the film' : 'Kept'}{o.seconds ? ` · ${o.seconds.toFixed(1)} s` : ''}
                </span>
              </span>
              <Shape o={o} win={windowOf(o)} p={on ? p : undefined} />
              {o.words && <span className="col-span-2 col-start-2 truncate text-[11.5px] text-mute" title={o.words}>{o.words}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
