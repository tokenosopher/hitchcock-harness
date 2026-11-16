'use client';
// "More renders" (13 Nov 2026): the renders with options, from the Edit page's header. On the last films the loudness
// pass and the files for the upscaler were made outside the app ("Yeah let's raise to -14 inside davinci", "The output
// keeps hitting 0"; "It should only be the tracks that are the dialogue tracks … you should never input the cards").
// The render learned them as options (src/server/edit/render-options.ts); this panel asks for them. What each wrote
// is listed under the timeline, in the Renders tab (RendersTab.tsx, 14 Nov), which opens by itself when a render
// starts. A popover anchored to its button: the timeline and the player stay where they are under it. The choices
// and their words: renderAsk.ts. The request: useCut.ts renderWith; the states: useRenderVariants. Since 14 Nov
// (ASKS 56) the master can be asked as a smaller file ("Smaller file", under the size).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RenderKind, RenderOptions, RenderState, Timeline } from '@/server/types';
import { Dot } from '@/components/shell/atoms';
import { IconChevronDown, IconX } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { useRenderVariants } from './useCut';
import { askOptions, describe, emptyAsk, isCard, sizeOf, smallOff, type RenderAsk } from './renderAsk';

const QUICK = [-14, -16, -23];

export function RendersButton({ film, tl, fixture, renderWith, onStarted, onShowList, blocked }: {
  film: string;
  /** Why nothing can be rendered yet (a cut that still holds boards or planned shots, 15 Nov): the button is dimmed and says so. */
  blocked?: string;
  /** The version being shown (the one being viewed, else the current one): what is rendered. */
  tl: Timeline;
  fixture: boolean;
  renderWith: (version: string, kind: RenderKind, options: RenderOptions, retry?: boolean) => Promise<{ state?: RenderState; error?: string }>;
  /** A render was asked for: the page opens the Renders tab on it. */
  onStarted: (s: RenderState) => void;
  /** "Rendered files are under the timeline, in Renders". */
  onShowList: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<RenderAsk>(emptyAsk);
  const [said, setSaid] = useState<{ text: string; bad?: boolean }>();
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const version = tl.version;

  // asked while open; a render running is followed even when the panel is closed, so the button shows it
  const { variants, put, refresh } = useRenderVariants(film, version, open);
  const running = (variants ?? []).find((s) => s.state === 'running' || s.state === 'queued');

  // the page's middle column clips what leaves it: the panel keeps inside it (shifted right and narrowed when the
  // column is narrow, as at 1100 wide with both side columns open)
  const [place, setPlace] = useState<{ shift: number; width: number }>({ shift: 0, width: 456 });
  const measure = () => {
    const btn = box.current?.getBoundingClientRect();
    const col = box.current?.closest('header')?.getBoundingClientRect();
    if (!btn || !col) return;
    const width = Math.min(456, col.width - 16);
    const shift = Math.max(0, col.left + 8 - (btn.right - width));
    setPlace((p) => (p.shift === shift && p.width === width ? p : { shift, width }));
  };
  const toggle = () => { if (!open) measure(); setOpen((o) => !o); };

  useEffect(() => {
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    window.addEventListener('resize', measure);
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', measure); };
  }, [open]);

  const names = useMemo(() => new Map(tl.tracks.map((t) => [t.id, t.name])), [tl]);
  const trackName = (id: string) => names.get(id);
  const cards = useMemo(() => tl.tracks.reduce((n, t) => n + t.clips.filter((c) => isCard(c.label)).length, 0), [tl]);
  const audio = tl.tracks.filter((t) => t.kind === 'audio');
  const { options, why } = askOptions(ask);
  const summary = options ? describe(options, ask.kind, trackName) : undefined;
  const set = (p: Partial<RenderAsk>) => { setAsk((a) => ({ ...a, ...p })); setSaid(undefined); };
  const loudOn = ask.lufs.trim() !== '';
  // the smaller file: of the full size only, not with the separate files (renderAsk.ts smallOff)
  const smallWhy = smallOff(ask);

  const send = async (o: RenderOptions, kind: RenderKind, retry = false) => {
    setSending(true);
    setSaid(undefined);
    const r = await renderWith(version, kind, o, retry);
    setSending(false);
    if (r.error) { setSaid({ text: r.error, bad: true }); return; }
    if (r.state) {
      put(r.state);
      // the files are listed under the timeline, in Renders: it opens on this one
      onStarted(r.state);
      if (r.state.state === 'done') setSaid({ text: 'Already rendered: those files are in Renders, under the timeline.' });
      else if (r.state.state === 'failed' && !retry) setSaid({ text: 'This one failed before: “Try again” in Renders, under the timeline, asks for it again.', bad: true });
    }
    refresh();
  };

  return (
    <span ref={box} className="relative inline-flex">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle} disabled={!!blocked} data-render-blocked={blocked ? '' : undefined}
        title={blocked ?? 'Renders with a set loudness, separate sound files, without some tracks or the title cards, or a smaller file'}
        className={cn('inline-flex h-8 cursor-pointer items-center disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-raised', open ? 'border-sub bg-raised' : 'border-edge-strong')}>
        {running && <Dot state="running" />}
        More renders
        <IconChevronDown size={12} className={cn('text-sub transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {/* fades and slides in; closed it stays mounted (the list keeps its place) and out of the keyboard's way */}
      <section role="dialog" aria-label="More renders" aria-hidden={!open} inert={!open} data-renders-panel style={{ right: -place.shift, width: place.width }}
        className={cn('absolute top-[40px] z-40 flex max-h-[min(760px,calc(100vh-76px))] flex-col overflow-hidden whitespace-normal rounded-[12px] border border-edge bg-panel text-left shadow-[0_16px_40px_#000] transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none',
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1.5 opacity-0')}>
        <header className="flex flex-none items-start gap-3 border-b border-line px-4 pb-3 pt-3.5">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-medium">More renders of <span className="font-mono">{version}</span></span>
            <span className="text-[12px] leading-[1.45] text-sub">
              New files beside the film’s renders, never over one. {fixture ? 'Sample data: the render is played, nothing is made.' : 'One render at a time; the 480p after each change waits its turn too.'}
            </span>
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" title="Close (Esc)"
            className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-lg text-sub transition-colors duration-150 hover:bg-raised hover:text-ink"><IconX size={12} /></button>
        </header>

        <div className="scroll relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 px-4 py-3.5">
            {/* 1. loudness */}
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[13px] font-medium">The full mix at a set loudness</legend>
              <div className="flex flex-wrap items-center gap-2">
                <NumberField inputRef={first} label="Loudness in LUFS" value={ask.lufs} placeholder="as mixed" unit="LUFS" width="w-[118px]" onChange={(v) => set({ lufs: v })} />
                <span className="flex gap-1" role="group" aria-label="Fill in a loudness">
                  {QUICK.map((n) => {
                    const on = ask.lufs.replace('−', '-').trim() === String(n);
                    return (
                      <button key={n} type="button" aria-pressed={on} onClick={() => set({ lufs: on ? '' : String(n) })}
                        className={cn('inline-flex h-7 cursor-pointer items-center rounded-md border px-2 font-mono text-[12px] transition-colors duration-150', on ? 'border-sub bg-raised text-ink' : 'border-edge text-sub hover:text-ink')}>
                        −{Math.abs(n)}
                      </button>
                    );
                  })}
                </span>
                <span className={cn('ml-auto flex items-center gap-1.5 transition-opacity duration-200', loudOn ? 'opacity-100' : 'opacity-50')}>
                  <span className="text-[12px] text-sub">ceiling</span>
                  <NumberField label="Ceiling in dBTP" value={ask.ceiling} unit="dBTP" width="w-[64px]" small onChange={(v) => set({ ceiling: v })} />
                </span>
              </div>
              <p className="m-0 text-[12px] leading-[1.5] text-sub">
                Empty leaves the mix as it is. With a number, the mix is measured, raised or lowered to that loudness and held under the ceiling; what it measured is shown in the list when it is done. If it cannot be held under the ceiling, nothing is written.
              </p>
            </fieldset>

            {/* 2. stems */}
            <div className="flex flex-col gap-1">
              <Check checked={ask.stems} onChange={(v) => set({ stems: v })} label="Separate files for each kind of sound and the picture alone" strong />
              <p className="m-0 pl-[26px] text-[12px] leading-[1.5] text-sub">
                The picture with no sound; one WAV for each sound track ({audio.map((t) => `${t.id} ${t.name}`).join(', ') || 'none yet'}); the dialogue only; everything but the dialogue; and the full mix as cut. These are never brought to a loudness; a track left out has no file.
              </p>
            </div>

            {/* 3. leave out */}
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-medium">Leave out</legend>
              <p className="m-0 text-[12px] leading-[1.5] text-sub">For this render only: black or silence in their place, the length kept. The cut is not changed.</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Check checked={ask.cards} onChange={(v) => set({ cards: v })} label="the title cards" hint={cards ? `${cards} in ${version}` : `none in ${version}`} />
                {tl.tracks.map((t) => (
                  <Check key={t.id} checked={ask.tracks.includes(t.id)} label={t.name} hint={t.id}
                    onChange={(v) => set({ tracks: v ? [...ask.tracks, t.id] : ask.tracks.filter((x) => x !== t.id) })} />
                ))}
              </div>
            </fieldset>

            {/* 4. size */}
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-medium">Size</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Size">
                {(['proxy', 'master'] as const).map((k) => {
                  const on = ask.kind === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set({ kind: k })}
                      className={cn('flex cursor-pointer flex-col items-start gap-0.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors duration-150', on ? 'border-sub bg-raised' : 'border-line hover:border-edge-strong')}>
                      <span className="text-[12.5px] font-medium text-ink">{k === 'proxy' ? '480p' : 'Full size'} <span className="font-mono text-[11.5px] font-normal text-mute">{sizeOf(tl, k)}</span></span>
                      <span className="text-[11.5px] leading-[1.45] text-sub">
                        {k === 'proxy' ? 'Quick, from the files the cut plays. To check and to send around.' : 'The master’s quality, from the full-size (1080p) file beside each take where there is one. Much slower.'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* the master's option (ASKS 56): the same picture encoded again smaller, its sound copied */}
              <div className={cn('mt-1 flex flex-col gap-1 transition-opacity duration-200', smallWhy ? 'opacity-50' : 'opacity-100')} data-render-small>
                <Check checked={ask.small && !smallWhy} disabled={!!smallWhy} onChange={(v) => set({ small: v })} label="Smaller file" strong title={smallWhy} />
                <p className="m-0 pl-[26px] text-[12px] leading-[1.5] text-sub">
                  The same picture at a lower size, for posting. Takes longer to make.
                </p>
                {smallWhy && <p className="m-0 pl-[26px] text-[12px] leading-[1.5] text-mute duration-200 animate-in fade-in-0" data-render-small-why>{smallWhy}</p>}
              </div>
            </fieldset>

            {/* what the button makes, or why it waits; the server's refusal in its own words (the height is kept) */}
            <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-hdr p-3">
              <p className="m-0 min-h-[54px] text-[12.5px] leading-[1.45]" aria-live="polite" data-render-summary>
                {summary ? <span className="text-ink">{summary}.</span> : <span className="text-warn">{why}</span>}
                {said && <span className={cn('mt-1 block transition-opacity duration-200', said.bad ? 'text-bad' : 'text-sub')} data-render-said>{said.text}</span>}
              </p>
              <div className="flex items-center justify-end gap-2">
                {(ask.lufs || ask.stems || ask.cards || ask.small || ask.tracks.length > 0) && (
                  <button type="button" onClick={() => { setAsk(emptyAsk()); setSaid(undefined); }} className="h-8 cursor-pointer rounded-lg px-2.5 text-[12.5px] text-sub transition-colors duration-150 hover:text-ink">Clear</button>
                )}
                <button type="button" disabled={!options || sending} onClick={() => options && void send(options, ask.kind)} title={why}
                  className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-ink px-4 text-[13px] font-medium text-bg transition-[background-color,opacity] duration-150 hover:bg-ink-3 disabled:cursor-not-allowed disabled:opacity-40">
                  {sending ? 'Asking…' : 'Render'}
                </button>
              </div>
            </div>
          </div>

          {/* what was rendered is listed in one place: the Renders tab under the timeline */}
          <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-3">
            <button type="button" data-renders-list-link onClick={() => { setOpen(false); onShowList(); }}
              className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12.5px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
              Rendered files are under the timeline, in Renders
            </button>
          </div>
        </div>
      </section>
    </span>
  );
}

function NumberField({ label, value, placeholder, unit, width, small, onChange, inputRef }: {
  label: string; value: string; placeholder?: string; unit: string; width: string; small?: boolean; onChange: (v: string) => void; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={cn('inline-flex h-7 items-center gap-1 rounded-lg border border-edge bg-bg pr-2 transition-colors duration-150 focus-within:border-sub', width)}>
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} inputMode="decimal" spellCheck={false}
        className={cn('min-w-0 flex-1 bg-transparent pl-2 font-mono text-ink outline-none placeholder:font-sans placeholder:text-mute', small ? 'text-[12px]' : 'text-[12.5px]')} />
      <span className="flex-none text-[11px] text-mute">{unit}</span>
    </label>
  );
}

function Check({ checked, onChange, label, hint, strong, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; strong?: boolean; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={cn('flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-1', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={cn('flex size-4 flex-none items-center justify-center rounded-[4px] border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-edge-strong', checked ? 'border-ink bg-ink' : 'border-edge-strong bg-bg')}>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className={cn('text-bg transition-opacity duration-150', checked ? 'opacity-100' : 'opacity-0')}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <span className={cn('min-w-0 truncate text-[12.5px]', strong ? 'font-medium text-ink' : 'text-ink-3')}>{label}</span>
      {hint && <span className="flex-none font-mono text-[11px] text-mute">{hint}</span>}
    </label>
  );
}
