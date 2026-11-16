'use client';
// An edge you drag to resize what it borders: a thin strip that lights on hover. Double click puts the size back.
// The arrow keys move it too, for the keyboard.
import { SIZES, setSize, useDrag, useSize, type SizeName } from '@/components/lib/sizes';
import { cn } from '@/lib/utils';

export function Edge({ name, axis, sign, label, className, measure }: { name: SizeName; axis: 'x' | 'y'; sign: 1 | -1; label: string; className?: string; measure?: () => number }) {
  const size = useSize(name);
  const now = () => measure?.() ?? size;
  const down = useDrag(name, axis, sign, now);
  const s = SIZES[name];
  return (
    <div role="separator" tabIndex={0} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} aria-valuenow={size} aria-valuemin={s.min} aria-valuemax={s.max}
      title={`${label}. Drag to resize, double click to put it back.`}
      onPointerDown={down}
      onDoubleClick={() => setSize(name, s.initial)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const more = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        const less = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        if (e.key === more) { e.preventDefault(); setSize(name, now() + sign * step); }
        else if (e.key === less) { e.preventDefault(); setSize(name, now() - sign * step); }
      }}
      className={cn('group absolute z-20 touch-none outline-none max-[760px]:hidden', axis === 'x' ? 'inset-y-0 w-[9px] cursor-col-resize' : 'inset-x-0 h-[9px] cursor-row-resize', className)}>
      <span className={cn('absolute bg-transparent transition-colors group-hover:bg-edge-strong group-focus-visible:bg-ink group-active:bg-ink', axis === 'x' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:w-[3px] group-active:w-[3px]' : 'inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:h-[3px] group-active:h-[3px]')} />
    </div>
  );
}
