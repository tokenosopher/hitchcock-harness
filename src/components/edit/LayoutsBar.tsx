'use client';
// A scene's layouts on the Takes view (layouts.ts says what a layout is). Shown
// only for a scene with two layouts or more, above its takes: one tab per layout (its previz take, its storyboard, its
// takes, and which one the film uses), the viewed layout's storyboard, and "Use Layout n in the film", one step that
// Undo takes back. The takes under it are the viewed layout's; a shot of another layout's take goes into a place of the
// layout the film uses, safe swaps marked and every warning said, never refused.
import { useEffect, useMemo, useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { layoutWords, sameShotIn, type Layout } from './layouts';

/** The film's scenes with two layouts or more, by scene; asks again when the takes change. */
export function useLayouts(film: string, takesKey: string): Map<string, Layout[]> {
  const [data, setData] = useState<{ key: string; text: string; by: Map<string, Layout[]> }>({ key: '', text: '', by: new Map() });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/layouts`, { cache: 'no-store' });
        if (!r.ok) return;
        const text = await r.text();
        if (!live) return;
        const j = JSON.parse(text) as { scenes?: { scene: string; layouts: Layout[] }[] };
        // the same answer draws nothing
        setData((cur) => (cur.text === text ? cur : { key: takesKey, text, by: new Map((j.scenes ?? []).filter((x) => x.layouts.length > 1).map((x) => [x.scene, x.layouts])) }));
      } catch { /* the page works without the layouts */ }
    })();
    return () => { live = false; };
  }, [film, takesKey]);
  return data.by;
}

const secs = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} s`;

export function LayoutsBar({ scene, title, layouts, inFilm, viewing, busy, readOnly, onView, onUse, picksWarn }: {
  scene: string; title?: string; layouts: Layout[];
  /** The layout the cut uses for the scene now. */
  inFilm?: Layout;
  /** The layout whose takes and storyboard are shown. */
  viewing: Layout;
  busy?: boolean; readOnly?: boolean;
  onView: (l: Layout) => void;
  onUse: (l: Layout) => void;
  /** What the shots selected from another layout bring: per shot, its words and its warnings. */
  picksWarn?: { label: string; safe: boolean; warnings: string[] }[];
}) {
  const foreign = !!inFilm && inFilm.key !== viewing.key;
  const landed = viewing.takes.filter((t) => t.landed);
  const puts = landed.length ? `${landed[0].name.charAt(0).toUpperCase()}${landed[0].name.slice(1)} takes ${scene}’s place` : `Its boards and lines take ${scene}’s place`;
  // the viewed layout's shots that are the same in the layout the film uses (its safe swaps)
  const same = useMemo(() => new Map(foreign && inFilm ? viewing.shots.flatMap((s) => { const t = sameShotIn(s, inFilm); return t ? [[s.n, t.n] as const] : []; }) : []), [foreign, inFilm, viewing]);
  const cols = { gridTemplateColumns: `104px repeat(${viewing.shots.length}, minmax(0, 1fr))` };
  return (
    <section data-layouts={scene} aria-label={`The layouts of ${scene}`} className="flex flex-col gap-2 duration-200 animate-in fade-in-0">
      <p className="m-0 text-[12.5px] text-sub">
        <b className="font-medium text-ink">{scene}{title ? ` · ${title}` : ''}</b> · {layouts.length} layouts: the scene was changed after takes of it were made. Each keeps its takes and its storyboard.
      </p>
      <div role="tablist" aria-label={`Layouts of ${scene}`} className="flex flex-wrap gap-1.5">
        {layouts.map((l) => {
          const on = l.key === viewing.key;
          const used = inFilm?.key === l.key;
          return (
            <button key={l.key} type="button" role="tab" aria-selected={on} data-layout={l.n} data-layout-in={used ? '' : undefined} onClick={() => onView(l)}
              title={`Layout ${l.n}: previz take ${l.key}${l.previz.length > 1 ? ` (the same as take${l.previz.length > 2 ? 's' : ''} ${l.previz.slice(0, -1).join(', ')})` : ''}${l.storyboard ? `, storyboard ${l.storyboard}` : ''}. ${l.takes.length ? `Takes made from it: ${l.takes.map((t) => `${t.name}${t.how === 'time' ? ' (by its date: its record does not say)' : ''}`).join(', ')}.` : 'No take made from it yet.'}`}
              className={cn('flex min-w-[148px] cursor-pointer flex-col items-start gap-0.5 rounded-[9px] border px-3 py-1.5 text-left transition-[border-color,background-color] duration-200',
                on ? 'border-ink bg-raised' : 'border-edge hover:border-sub')}>
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                Layout {l.n}
                <span aria-hidden={!used} className={cn('rounded-full border border-edge-strong px-1.5 text-[10.5px] font-normal leading-[15px] text-ink-3 transition-opacity duration-200', used ? 'opacity-100' : 'opacity-0')}>in the film</span>
              </span>
              <span data-layout-words className="text-[11.5px] text-sub">{layoutWords(l)}</span>
            </button>
          );
        })}
      </div>
      {/* the viewed layout's storyboard: a board a shot, its length, and (another layout's) the shot it is the same as */}
      <div key={viewing.key} data-layout-boards={viewing.n} className="grid gap-1 duration-200 animate-in fade-in-0 slide-in-from-bottom-1" style={cols}>
        <span className="flex flex-col justify-center pr-1.5 text-[12px] leading-tight text-sub">{viewing.storyboard ? `Storyboard ${viewing.storyboard}` : 'Its shots'}</span>
        {viewing.shots.map((s) => {
          const to = same.get(s.n);
          return (
            <div key={s.n} data-layout-shot={s.n} data-safe={to !== undefined ? to : undefined} title={`Shot ${s.n}${s.name ? `: ${s.name.replace(/^\s*\d+[A-Za-z]?\s+/, '')}` : ''} · ${secs(s.t1 - s.t0)}${s.lineText ? `\n${s.lineText}` : ''}${foreign ? (to !== undefined ? `\nThe same framing and line as shot ${to} of Layout ${inFilm!.n}: a safe swap.` : `\nNot in Layout ${inFilm!.n} as it is: a swap warns.`) : ''}`}
              className="flex min-w-0 flex-col gap-1 rounded-[7px] border border-edge bg-panel p-0.5 pb-1">
              <span className="relative h-[44px] w-full overflow-hidden rounded-[5px] bg-black">
                {s.board && (
                  // eslint-disable-next-line @next/next/no-img-element -- the shot's board, a still from /api/media
                  <img alt="" src={mediaUrl(s.board, { w: 160 })} loading="lazy" className="absolute inset-0 size-full object-cover opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
                <span className="absolute bottom-0.5 left-0.5 rounded-[4px] bg-black/75 px-1 font-mono text-[10.5px] leading-[14px] text-ink">{secs(s.t1 - s.t0)}</span>
              </span>
              <span className="@container/shot flex min-w-0 items-baseline justify-between gap-1 px-1 leading-tight">
                <span className="truncate text-[11.5px] text-ink-3"><span className="hidden @[84px]/shot:inline">Shot </span>{s.n}</span>
                {foreign && <span className={cn('truncate text-[10.5px]', to !== undefined ? 'text-ink-3' : 'text-mute')}>{to !== undefined ? `= ${to}` : 'differs'}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {foreign && inFilm && (
        <div data-layout-use={viewing.n} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
          <button type="button" disabled={busy || readOnly} onClick={() => onUse(viewing)}
            className="h-7 cursor-pointer rounded-[7px] bg-ink px-3 text-[12.5px] font-medium text-bg transition-opacity duration-150 hover:opacity-90 disabled:cursor-default disabled:opacity-50">
            Use Layout {viewing.n} in the film
          </button>
          <span className="text-[12px] leading-snug text-sub">{puts}, in place of Layout {inFilm.n}. Undo brings Layout {inFilm.n} back.</span>
          {landed.length > 0 && (
            <span className="basis-full text-[12px] leading-snug text-mute">
              Or put single shots of Layout {viewing.n}’s takes into Layout {inFilm.n}: click one below. <i aria-hidden="true" className="not-italic text-ink-3">safe</i> marks a shot that is the same in both (the same framing and line); any other shot can go in too, with a warning.
            </span>
          )}
        </div>
      )}
      {picksWarn && picksWarn.length > 0 && (
        <ul data-layout-warnings className="m-0 flex list-none flex-col gap-1 rounded-[9px] border border-edge p-2.5 pl-3 text-[12px] leading-snug duration-200 animate-in fade-in-0">
          {picksWarn.map((p) => (
            <li key={p.label} className="flex flex-col gap-0.5">
              <span className="text-ink">{p.label}{p.safe ? <span className="text-ink-3"> · a safe swap</span> : null}</span>
              {p.warnings.map((w) => <span key={w} className="text-warn">{w}</span>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
