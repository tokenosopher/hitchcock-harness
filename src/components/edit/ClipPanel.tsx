'use client';
// The small panel a clip's right-click menu opens: Speed, Level, Fades.
// It opens under the clip, by the pointer, with a short fade and slide (none with reduced motion), and stays inside the
// window. What is tried in it is shown and heard at once and kept as one step when it closes: Enter, Done, or a click
// elsewhere. Esc puts back what the clip had. Desktop only (the Edit page is view-only on touch).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Timeline } from '@/server/types';
import { cn } from '@/lib/utils';
import { clipName, findClip, patchClip, retimeClips, type ClipRef, type Edit, type NameOf } from './model';
import { setFade } from './controls';
import { asFades } from './fades';

/** What a panel tries: the speed of some clips (one, a scene, a selection), a sound clip's level, a clip's fades. */
export type PanelTry =
  | { kind: 'speed'; refs: ClipRef[]; what?: string; val?: number }
  | { kind: 'level'; ref: ClipRef; val?: number }
  | { kind: 'fades'; ref: ClipRef; val?: { fin: number; fout: number } };

/** The change a panel's value makes to the cut (undefined: none yet, the same, or refused by a lock). The same function
 *  shows it while it is tried and keeps it when the panel closes, so what is kept is what was seen and heard. */
export function panelEdit(p: PanelTry, tl: Timeline, nameOf?: NameOf): Edit | undefined {
  if (p.val === undefined) return undefined;
  if (p.kind === 'speed') return retimeClips(tl, p.refs, p.val / 100, p.what);
  const f = findClip(tl, p.ref);
  if (!f) return undefined;
  if (p.kind === 'level') {
    const was = f.clip.gain ?? 0;
    if (p.val === was) return undefined;
    return patchClip(tl, p.ref, { gain: p.val }, `${f.track.id} ${clipName(f.clip)} gain ${was} → ${p.val} dB`);
  }
  const fps = tl.fps;
  const heard = f.track.kind === 'audio' ? asFades(f.clip).clip : f.clip;
  const nowIn = Math.round((heard.fadeIn ?? 0) * fps), nowOut = Math.round((heard.fadeOut ?? 0) * fps);
  const sec = (n: number) => Math.round((n / fps) * 1e6) / 1e6;
  const a = p.val.fin !== nowIn ? setFade(tl, p.ref, 'fadeIn', sec(p.val.fin), nameOf) : undefined;
  const b = p.val.fout !== nowOut ? setFade(a?.tl ?? tl, p.ref, 'fadeOut', sec(p.val.fout), nameOf) : undefined;
  if (a && b) return { tl: b.tl, note: `${a.note}; ${b.note}` };
  return b ?? a;
}

export interface PanelAnchor { x: number; y: number; /** The clip's box on the page, to open under (or over) it. */ rect?: { top: number; bottom: number } }

export function ClipPanel({ anchor, title, label, onDismiss, onDone, children }: {
  anchor: PanelAnchor; title: string; label: string;
  /** A click outside the panel, the window resized or left: it closes, keeping what was tried. */
  onDismiss: () => void;
  /** The Done button. */
  onDone: () => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean }>({ left: anchor.x, top: anchor.y, up: false });
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = (anchor.rect?.bottom ?? anchor.y) + 6, above = (anchor.rect?.top ?? anchor.y) - 6 - r.height;
    const up = below + r.height > window.innerHeight - 8 && above >= 8;
    setPos({ left: Math.max(8, Math.min(anchor.x - 24, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(up ? above : below, window.innerHeight - r.height - 8)), up });
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [anchor.x, anchor.y, anchor.rect?.top, anchor.rect?.bottom]);
  const live = useRef(onDismiss);
  useEffect(() => { live.current = onDismiss; });
  useEffect(() => {
    // the right-click that opened the menu, and the menu's own click, are over before the panel is there
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) live.current(); };
    const gone = () => live.current();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', gone);
    window.addEventListener('blur', gone);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('resize', gone); window.removeEventListener('blur', gone); };
  }, []);
  return (
    <div ref={box} role="dialog" aria-label={label} data-clip-panel="" onContextMenu={(e) => e.preventDefault()}
      // no key typed in the panel reaches the page behind it (the arrows would move the playhead, ⌫ delete the clip)
      onKeyDown={(e) => e.stopPropagation()}
      className={cn('fixed z-[70] w-[272px] rounded-[11px] border border-edge-strong bg-[#18181b] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        on ? 'translate-y-0 opacity-100' : cn('opacity-0', pos.up ? 'translate-y-1' : '-translate-y-1'))}
      style={{ left: pos.left, top: pos.top }}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11.5px] text-sub" title={title}>{title}</span>
        <button type="button" onClick={onDone} className="flex-none cursor-pointer rounded-[6px] border-0 bg-transparent px-1.5 py-0.5 text-[12px] font-medium text-ink outline-none transition-colors duration-100 hover:bg-raised focus-visible:bg-raised">Done</button>
      </div>
      {children}
    </div>
  );
}

const nb = 'flex size-7 flex-none cursor-pointer items-center justify-center rounded-[6px] border border-edge bg-bg text-[14px] leading-none text-ink-3 outline-none transition-colors duration-100 hover:border-edge-strong hover:text-ink focus-visible:border-sub disabled:cursor-default disabled:opacity-40';

/** A number with − and + beside it, tried as it changes (the arrow keys step it, Shift five steps). */
function Nudge({ label, value, unit, step, min, max, autoFocus, onValue }: { label: string; value: number; unit: string; step: number; min: number; max: number; autoFocus?: boolean; onValue: (v: number) => void }) {
  const [text, setText] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [autoFocus]);
  const put = (v: number) => { setText(undefined); onValue(Math.max(min, Math.min(max, Math.round(v / step) * step))); };
  return (
    <label className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-sub">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label={`${label}, less`} className={nb} disabled={value <= min} onClick={(e) => put(value - step * (e.shiftKey ? 5 : 1))}>−</button>
        <span className="relative">
          <input ref={input} type="text" inputMode="decimal" aria-label={label} spellCheck={false} value={text ?? String(value)}
            onChange={(e) => { setText(e.target.value); const v = Number(e.target.value.replace(',', '.')); if (e.target.value.trim() !== '' && e.target.value.trim() !== '-' && Number.isFinite(v)) onValue(Math.max(min, Math.min(max, v))); }}
            onBlur={() => setText(undefined)} onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); put(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 5 : 1)); } }}
            className="h-7 w-[64px] rounded-[6px] border border-edge bg-bg pl-2 pr-6 text-right font-mono text-[12.5px] text-ink outline-none transition-colors duration-150 focus:border-sub" />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-mute">{unit}</span>
        </span>
        <button type="button" aria-label={`${label}, more`} className={nb} disabled={value >= max} onClick={(e) => put(value + step * (e.shiftKey ? 5 : 1))}>+</button>
      </span>
    </label>
  );
}

const chip = (on: boolean) => cn('h-6 cursor-pointer rounded-[6px] border px-2 font-mono text-[11.5px] outline-none transition-colors duration-150 focus-visible:border-sub',
  on ? 'border-edge-strong bg-raised text-ink' : 'border-edge bg-transparent text-ink-3 hover:text-ink');

/** Enter keeps, Esc puts back: the keys every panel body takes. */
const keysOf = (onCommit: () => void, onCancel: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  else if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
};

/** A sound clip's level (its gain, dB): typed, stepped by half a dB, slid, or a preset. */
export function LevelBody({ db, onValue, onCommit, onCancel }: { db: number; onValue: (db: number) => void; onCommit: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-2.5" onKeyDown={keysOf(onCommit, onCancel)} data-level-panel="">
      <Nudge label="Level" value={db} unit="dB" step={0.5} min={-60} max={12} autoFocus onValue={onValue} />
      <input type="range" aria-label="Level, dB" min={-30} max={12} step={0.5} value={Math.max(-30, db)} onChange={(e) => onValue(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-[#FAFAFA]" />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Levels to try">
        {[-12, -6, -3, 0, 3].map((v) => <button key={v} type="button" aria-pressed={db === v} className={chip(db === v)} onClick={() => onValue(v)}>{v > 0 ? `+${v}` : v} dB</button>)}
      </div>
      <span className="text-[11px] leading-snug text-mute">↑ ↓ half a dB · ⇧ 2.5 · Enter keeps · Esc puts it back</span>
    </div>
  );
}

/** A clip's fades, in frames: in and out, each typed, stepped or a preset. */
export function FadesBody({ fin, fout, max, fps, sound, onValue, onCommit, onCancel }: {
  fin: number; fout: number; max: number; fps: number; sound: boolean;
  onValue: (v: { fin: number; fout: number }) => void; onCommit: () => void; onCancel: () => void;
}) {
  const secs = (f: number) => `${(f / fps).toFixed(2)} s`;
  return (
    <div className="flex flex-col gap-2.5" onKeyDown={keysOf(onCommit, onCancel)} data-fades-panel="">
      <Nudge label={sound ? 'Sound fade in' : 'Picture fade in'} value={fin} unit="f" step={1} min={0} max={max} autoFocus onValue={(v) => onValue({ fin: v, fout })} />
      <div className="flex flex-wrap justify-end gap-1">
        {[0, 6, 12, 24].filter((f) => f <= max).map((f) => <button key={f} type="button" aria-pressed={fin === f} className={chip(fin === f)} onClick={() => onValue({ fin: f, fout })}>{f ? `${f} f` : 'none'}</button>)}
      </div>
      <Nudge label={sound ? 'Sound fade out' : 'Picture fade out'} value={fout} unit="f" step={1} min={0} max={max} onValue={(v) => onValue({ fin, fout: v })} />
      <div className="flex flex-wrap justify-end gap-1">
        {[0, 6, 12, 24].filter((f) => f <= max).map((f) => <button key={f} type="button" aria-pressed={fout === f} className={chip(fout === f)} onClick={() => onValue({ fin, fout: f })}>{f ? `${f} f` : 'none'}</button>)}
      </div>
      <span className="text-[11px] leading-snug text-mute">{secs(fin)} in · {secs(fout)} out{sound ? '' : ' · from and to black'} · Enter keeps · Esc puts it back</span>
    </div>
  );
}
