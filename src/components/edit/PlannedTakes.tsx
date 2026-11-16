'use client';
// The Takes tab for a scene with no take yet (15 Nov 2026, ASKS 47; drawn as To build 2, 3 and 12): the scene's planned
// shots as the grid's columns, each with its planned seconds (and its board once it is made), and one row saying no take
// is here yet. With only the script, what the scene is so far. A press on a column puts the playhead at that shot.
// Also "Put the boards back" under a scene whose take took its boards' place.
import type { TimelineClip } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { cn } from '@/lib/utils';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div data-takes-empty className="flex flex-col gap-1 rounded-[10px] border border-dashed border-edge px-4 py-3.5 duration-200 animate-in fade-in-0">
      <b className="text-[13px] font-medium text-ink">{title}</b>
      <span className="text-[12.5px] leading-normal text-sub">{text}</span>
    </div>
  );
}

export function PlannedTakes({ scene, title, picture, lines, making, hot, onShot }: {
  scene: string; title?: string;
  /** The scene's planned shots or boards on the picture track, in order. */
  picture: TimelineClip[];
  /** The scene's lines and actions on the Dialogue track. */
  lines: TimelineClip[];
  /** A take of the scene is being made. */
  making?: boolean;
  /** The shot under the playhead. */
  hot?: number;
  onShot: (c: TimelineClip) => void;
}) {
  const spoken = lines.filter((c) => c.who).length, actions = lines.length - spoken;
  const head = (rest: string) => (
    <p className="m-0 text-[12.5px] text-sub"><b className="font-medium text-ink">{scene}{title ? ` · ${title}` : ''}</b> · {rest}</p>
  );
  if (!picture.length) {
    return (
      <div data-planned-takes={scene} className="flex flex-col gap-2.5 duration-200 animate-in fade-in-0">
        {head('no takes yet')}
        <EmptyCard title="No takes yet." text={`${scene} is ${plural(spoken, 'line')} and ${plural(actions, 'action')} for now. Its shots come with the shot list, then its boards; the takes come after.`} />
      </div>
    );
  }
  const total = picture.reduce((k, c) => k + (c.out - c.in), 0);
  const boards = picture.filter((c) => c.plan === 'board').length;
  return (
    <div data-planned-takes={scene} className="flex flex-col gap-2.5 duration-200 animate-in fade-in-0">
      {head(`${plural(picture.length, 'shot')}, ${mmss(total)} planned · ${making ? 'a take is being made' : 'no takes yet'}`)}
      <div className="grid gap-1" style={{ gridTemplateColumns: `104px repeat(${picture.length}, minmax(0, 1fr))` }}>
        <span />
        {picture.map((c) => (
          <button key={c.id} type="button" onClick={() => onShot(c)} data-planned-col={c.shot} title={`${c.text ?? ''}${c.inFrame ? `\nIn frame: ${c.inFrame}` : ''}`}
            className={cn('flex cursor-pointer flex-col items-start gap-0.5 truncate rounded-md px-1 py-0.5 text-left text-[11.5px] transition-colors duration-150 hover:text-ink', hot === c.shot ? 'text-ink' : 'text-sub')}>
            <span className="truncate">Shot {c.shot}</span>
            <span className="font-mono text-[11px] text-mute">{Math.round((c.out - c.in) * 10) / 10} s</span>
          </button>
        ))}
        <span className="flex items-center text-[12px] text-mute">No take yet</span>
        {boards ? picture.map((c) => (
          <button key={c.id} type="button" onClick={() => onShot(c)} aria-label={`${scene} shot ${c.shot}`}
            className={cn('relative aspect-[9/16] max-h-[96px] cursor-pointer overflow-hidden rounded-[7px] border border-dashed bg-black transition-colors duration-150', hot === c.shot ? 'border-ink' : 'border-edge-strong hover:border-sub')}>
            {c.src && (
              // eslint-disable-next-line @next/next/no-img-element -- the shot's board, a still from /api/media
              <img alt="" src={mediaUrl(c.src, { w: 160 })} className="absolute inset-0 size-full object-cover opacity-70" loading="lazy" />
            )}
          </button>
        )) : (
          <span className="flex min-h-[64px] items-center rounded-[7px] border border-dashed border-edge px-3 text-[12px] text-sub" style={{ gridColumn: `span ${picture.length}` }}>
            {making ? 'A take of this scene is being made.' : 'Its boards come next; the takes come after them.'}
          </span>
        )}
      </div>
    </div>
  );
}

/** Under a scene whose take took its boards' place: the way back, as one step. */
export function BoardsBack({ scene, busy, onBack }: { scene: string; busy?: boolean; onBack: () => void }) {
  return (
    <div data-boards-back={scene} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 duration-200 animate-in fade-in-0">
      <button type="button" disabled={busy} onClick={onBack}
        className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-150 hover:bg-raised disabled:cursor-default disabled:opacity-50">Put the boards back</button>
      <span className="text-[12px] text-mute">The take leaves the film and {scene}’s boards come back in its place. Undo brings the take back.</span>
    </div>
  );
}
