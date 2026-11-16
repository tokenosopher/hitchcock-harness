'use client';
// The thread column of the Idea page (/films/new): the new film's Alma thread before it exists. Empty, with one
// line saying when she starts; the composer is shown but closed, because the idea goes in on the page itself.
// Desktop: the 384px column of ThreadColumn. Phone (≤760px): a bottom bar.
import { useEffect, useState } from 'react';
import { ALMA_MODELS, type AlmaModel } from '@/server/types';
import { setNewFilmModel, useNewFilmModel } from '@/components/data/newFilmModel';
import { IconSend } from './icons';
import { useSize } from '@/components/lib/sizes';
import { Edge } from './Edge';

export function NewFilmThread() {
  const model = useNewFilmModel();
  const threadW = useSize('thread');
  const [fallback, setFallback] = useState<string>();
  useEffect(() => {
    let live = true;
    fetch('/api/films/new', { cache: 'no-store' })
      .then(async (r) => { const d = (await r.json()) as { defaultModel?: string }; if (live && r.ok) setFallback(d.defaultModel); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  // the model the new film's Alma starts on; it goes in with Start and can be changed in her thread afterwards
  const picker = (id: string) => (
    <>
      <label className="sr-only" htmlFor={id}>The model Alma starts on</label>
      <select id={id} value={model} onChange={(e) => setNewFilmModel(e.target.value as AlmaModel)}
        title={`The model Alma starts this film on.${model ? '' : ` Default is Claude Code's own setting${fallback ? ` (${fallback})` : ''}.`}`}
        className="h-8 max-w-[172px] flex-none cursor-pointer truncate rounded-lg border border-edge bg-bg px-2 text-[12px] text-ink outline-none hover:bg-raised focus-visible:border-edge-strong">
        {ALMA_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.id ? m.label : `Default${fallback ? ` · ${fallback}` : ''}`}</option>
        ))}
      </select>
    </>
  );
  return (
    <aside aria-label="Thread with Alma" style={{ '--thread-w': `${threadW}px` } as React.CSSProperties}
      className="relative flex min-w-0 flex-col bg-bg min-[761px]:h-full min-[761px]:w-[var(--thread-w)] min-[761px]:max-w-[60vw] min-[761px]:flex-none min-[761px]:border-l min-[761px]:border-line max-[760px]:fixed max-[760px]:inset-x-0 max-[760px]:bottom-0 max-[760px]:z-30 max-[760px]:border-t max-[760px]:border-line">
      <Edge name="thread" axis="x" sign={-1} label="The width of the thread" className="-left-[5px]" />
      <div className="flex h-14 flex-none items-center justify-between gap-2.5 border-b border-line px-4 py-3 max-[760px]:hidden">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold">Thread · New film</span>
          <span className="text-[12px] text-sub">0 messages · stage 1</span>
        </div>
        {picker('alma-model-new')}
      </div>
      <div className="flex flex-none flex-col gap-2 border-b border-edge px-4 pb-3 pt-2.5 max-[760px]:hidden">
        <span className="lbl">Nothing running</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center max-[760px]:hidden">
        <div className="flex size-[30px] items-center justify-center rounded-full border border-edge text-[12px] font-semibold text-ink-3" aria-hidden="true">A</div>
        <p role="status" className="m-0 text-[13.5px] font-medium text-ink-2">Alma starts when you press Start</p>
        <p className="m-0 max-w-[280px] text-[12.5px] leading-normal text-sub">
          Then she fills brief.md from your idea, researches what the story needs and writes the first draft of the script, with the film skill.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-3 pb-3.5 pt-2.5 max-[760px]:border-t-0 max-[760px]:pb-3">
        <span className="flex items-center gap-1.5 px-0.5 text-[12px] text-sub min-[761px]:hidden">
          <span aria-hidden="true" className="size-1.5 rounded-full border border-mute" /><span className="min-w-0 flex-1">Alma starts when you press Start</span>
          {picker('alma-model-new-phone')}
        </span>
        <div className="flex items-center rounded-xl border border-edge bg-well opacity-60 min-[761px]:flex-col min-[761px]:items-stretch">
          <label htmlFor="composer-new" className="sr-only">Message Alma</label>
          <textarea id="composer-new" disabled rows={1} placeholder="Write the idea on the page; Alma reads it at Start"
            className="h-11 w-full resize-none overflow-hidden whitespace-nowrap border-0 bg-transparent px-3 py-[11px] text-[14px] text-ink outline-none placeholder:text-mute min-[761px]:h-auto min-[761px]:whitespace-normal min-[761px]:px-[13px] min-[761px]:pb-1 min-[761px]:pt-[11px]" />
          <div className="flex items-center justify-end py-1.5 pr-1.5 min-[761px]:px-2 min-[761px]:pb-2 min-[761px]:pt-1.5">
            <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-lg bg-edge text-sub"><IconSend /></span>
          </div>
        </div>
      </div>
    </aside>
  );
}
