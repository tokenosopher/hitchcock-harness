'use client';
// The speed control: a dial or a typed number, to go a little faster or slower and try it out. One component in
// two places: the panel the clip's right-click menu opens ("Speed of this shot…") and the Inspector's Speed row.
// A number to type, − and +, a dial to drag or scroll (1% a step, Shift 5%), presets, and the length it gives. Every
// value is shown and heard at once (onChange, a preview: nothing saved); it is kept as one step on Enter, when the
// panel closes, or in the Inspector when the value rests; Esc puts back the speed it had.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS, clampPct, dragPct, lengthWords, parsePct, pctAngle, stepPct } from './speed';

interface Props {
  /** The speed it has now, in percent. */
  pct: number;
  /** Each clip's length of file (out − in, seconds) and their frames now on the timeline, for "2.00 s → 1.74 s". */
  srcs: number[];
  nowF: number;
  fps: number;
  disabled?: boolean;
  /** 'panel': kept on Enter or when the panel closes (its owner calls the last value in); 'row': also when it rests. */
  mode: 'panel' | 'row';
  autoFocus?: boolean;
  /** Each value tried, to show and hear (undefined: back to the speed it has). */
  onChange: (pct: number | undefined) => void;
  onCommit: (pct: number) => void;
  /** Esc: back to the speed it had, nothing kept. */
  onCancel: () => void;
}

const btn = 'flex size-7 flex-none cursor-pointer items-center justify-center rounded-[6px] border border-edge bg-bg text-[14px] leading-none text-ink-3 outline-none transition-colors duration-100 hover:border-edge-strong hover:text-ink focus-visible:border-sub disabled:cursor-default disabled:opacity-40';

export function SpeedControl({ pct, srcs, nowF, fps, disabled, mode, autoFocus, onChange, onCommit, onCancel }: Props) {
  const [v, setV] = useState(clampPct(pct));
  const [text, setText] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rest = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // the value tried last (set and cancel keep it), and the owner's callbacks as they are now, for the timers
  const live = useRef(v);
  const cb = useRef({ onChange, onCommit, onCancel });
  useEffect(() => { cb.current = { onChange, onCommit, onCancel }; });
  useEffect(() => () => { clearTimeout(typed.current); clearTimeout(rest.current); }, []);
  useEffect(() => { if (autoFocus) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [autoFocus]);

  const commit = useCallback((p: number) => {
    clearTimeout(rest.current); clearTimeout(typed.current);
    setText(undefined);
    if (p === clampPct(pct)) { cb.current.onChange(undefined); cb.current.onCancel(); return; }
    cb.current.onCommit(p);
  }, [pct]);
  /** A value tried: shown and heard at once; in the Inspector kept once it rests 1.5 s. */
  const set = useCallback((p: number) => {
    const n = clampPct(p);
    setV(n); live.current = n;
    cb.current.onChange(n === clampPct(pct) ? undefined : n);
    if (mode === 'row') { clearTimeout(rest.current); rest.current = setTimeout(() => commit(live.current), 1500); }
  }, [pct, mode, commit]);
  const cancel = () => {
    clearTimeout(rest.current); clearTimeout(typed.current);
    setText(undefined); setV(clampPct(pct)); live.current = clampPct(pct);
    cb.current.onChange(undefined); cb.current.onCancel();
  };
  const nudge = (dir: number, big: boolean) => { setText(undefined); set(stepPct(live.current, dir, big)); };

  const onKey = (e: React.KeyboardEvent) => {
    // the page's own keys (the arrows move the playhead, Esc lets go of the clip) never see what is typed here
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter') { e.preventDefault(); commit(text !== undefined ? parsePct(text) ?? live.current : live.current); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey); }
  };

  return (
    <div data-speed-control={mode} onKeyDown={onKey}
      onBlur={mode === 'row' ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && live.current !== clampPct(pct)) commit(live.current); } : undefined}
      className={cn('flex flex-col', mode === 'panel' ? 'gap-3' : 'gap-2')}>
      <div className={cn('flex items-center', mode === 'panel' ? 'gap-3' : 'justify-end gap-2')}>
        <Dial pct={v} disabled={disabled} size={mode === 'panel' ? 52 : 30} onPct={(p) => { setText(undefined); set(p); }} />
        <div className={cn('flex min-w-0 flex-col gap-1.5', mode === 'panel' ? 'flex-1' : 'flex-none')}>
          <div className={cn('flex items-center gap-1', mode === 'row' && 'justify-end')}>
            <button type="button" aria-label="Slower by 1% (Shift: 5%)" title="Slower by 1% (Shift: 5%)" disabled={disabled || v <= SPEED_MIN} className={btn}
              onClick={(e) => nudge(-1, e.shiftKey)}>−</button>
            <span className="relative">
              <input ref={input} type="text" inputMode="numeric" aria-label="Speed, percent" data-speed-input="" disabled={disabled} spellCheck={false}
                value={text ?? String(v)}
                onChange={(e) => {
                  const t = e.target.value;
                  setText(t);
                  clearTimeout(typed.current);
                  // tried once the typing pauses, so "115" is never shown as 11% on its way
                  const p = parsePct(t);
                  if (p !== undefined) typed.current = setTimeout(() => set(p), 260);
                }}
                onFocus={(e) => e.target.select()}
                className="h-7 w-[64px] rounded-[6px] border border-edge bg-bg pl-2 pr-5 text-right font-mono text-[12.5px] text-ink outline-none transition-colors duration-150 focus:border-sub disabled:opacity-50" />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-mute">%</span>
            </span>
            <button type="button" aria-label="Faster by 1% (Shift: 5%)" title="Faster by 1% (Shift: 5%)" disabled={disabled || v >= SPEED_MAX} className={btn}
              onClick={(e) => nudge(1, e.shiftKey)}>+</button>
          </div>
          {/* the length it gives, live; it breaks between the length and the change rather than cut either */}
          <span data-speed-length="" className={cn('flex flex-wrap gap-x-1.5 font-mono text-[11.5px] leading-[1.35] text-sub', mode === 'row' && 'justify-end')}>
            {lengthWords(srcs, nowF, v, fps).split(' · ').map((w, i) => <span key={i} className="whitespace-nowrap">{i ? `· ${w}` : w}</span>)}
          </span>
        </div>
      </div>
      <div className={cn('grid gap-1', mode === 'panel' ? 'grid-cols-6' : 'ml-auto w-full max-w-[180px] grid-cols-3')} role="group" aria-label="Speeds to try">
        {SPEED_PRESETS.map((p) => (
          <button key={p} type="button" disabled={disabled} aria-pressed={v === p} onClick={() => { setText(undefined); set(p); }}
            className={cn('h-6 cursor-pointer rounded-[6px] border px-0 text-center font-mono text-[11.5px] outline-none transition-colors duration-150 focus-visible:border-sub disabled:cursor-default disabled:opacity-40',
              v === p ? 'border-edge-strong bg-raised text-ink' : 'border-edge bg-transparent text-ink-3 hover:text-ink')}>
            {p}%
          </button>
        ))}
      </div>
      {mode === 'panel' && <span className="text-[11px] leading-snug text-mute">↑ ↓ 1% · ⇧ 5% · drag or scroll the dial · Enter keeps · Esc puts it back</span>}
    </div>
  );
}

/** A small dial: drag (right or up faster), scroll, or the arrow keys, 1% a step, Shift 5%; a double-click is 100%. */
function Dial({ pct, size, disabled, onPct }: { pct: number; size: number; disabled?: boolean; onPct: (p: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: number } | undefined>(undefined);
  const acc = useRef(0);
  const live = useRef({ pct, onPct, disabled });
  useEffect(() => { live.current = { pct, onPct, disabled }; });
  useEffect(() => {
    const d = el.current;
    if (!d) return;
    // a wheel notch (or a trackpad's worth of small moves) is one step; not passive, so the page does not scroll too
    const wheel = (e: WheelEvent) => {
      if (live.current.disabled) return;
      e.preventDefault();
      const dy = e.deltaY || -e.deltaX;
      if (Math.abs(dy) >= 50) { live.current.onPct(stepPct(live.current.pct, -dy, e.shiftKey)); acc.current = 0; return; }
      acc.current += dy;
      if (Math.abs(acc.current) >= 24) { live.current.onPct(stepPct(live.current.pct, -acc.current, e.shiftKey)); acc.current = 0; }
    };
    d.addEventListener('wheel', wheel, { passive: false });
    return () => d.removeEventListener('wheel', wheel);
  }, []);
  const r = size / 2 - 4, c = size / 2;
  const pt = (deg: number) => { const a = ((deg - 90) * Math.PI) / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M ${x1} ${y1} A ${r} ${r} 0 ${Math.abs(b - a) > 180 ? 1 : 0} ${b > a ? 1 : 0} ${x2} ${y2}`; };
  const ang = pctAngle(pct);
  const [nx, ny] = pt(ang);
  return (
    <div ref={el} role="slider" tabIndex={disabled ? -1 : 0} aria-label="Speed dial" aria-valuemin={SPEED_MIN} aria-valuemax={SPEED_MAX} aria-valuenow={pct} aria-valuetext={`${pct}%`} data-speed-dial=""
      title="Drag or scroll: 1% a step, Shift 5%. Double-click: 100%"
      className={cn('flex-none touch-none select-none rounded-full outline-none transition-shadow duration-150 focus-visible:ring-1 focus-visible:ring-sub', disabled ? 'opacity-40' : 'cursor-ns-resize')}
      style={{ width: size, height: size }}
      onPointerDown={(e) => { if (disabled || e.button !== 0) return; e.preventDefault(); (e.currentTarget as HTMLElement).focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, from: pct }; }}
      onPointerMove={(e) => { const g = drag.current; if (!g) return; const p = dragPct(g.from, e.clientX - g.x, e.clientY - g.y, e.shiftKey); if (p !== pct) onPct(p); }}
      onPointerUp={(e) => { drag.current = undefined; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = undefined; }}
      onDoubleClick={() => { if (!disabled) onPct(100); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault(); e.stopPropagation();
          onPct(stepPct(pct, e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1, e.shiftKey));
        } else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); onPct(100); }
      }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r + 2.5} className="fill-bg stroke-edge" strokeWidth="1" />
        <path d={arc(-135, 135)} fill="none" className="stroke-edge-strong" strokeWidth="2" strokeLinecap="round" />
        {Math.abs(ang) > 0.5 && <path d={ang > 0 ? arc(0, ang) : arc(ang, 0)} fill="none" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round" className="transition-[d] duration-100" />}
        {/* 100%: a small tick at the top */}
        <line x1={c} y1={c - r - 2} x2={c} y2={c - r + 2} className="stroke-mute" strokeWidth="1" />
        <line x1={c} y1={c} x2={nx} y2={ny} stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={c} cy={c} r="2" fill="#FAFAFA" />
      </svg>
    </div>
  );
}
