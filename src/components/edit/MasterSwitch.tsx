'use client';
// The Edit page's 1080p view (13 Nov 2026, ASKS 37; the owner: "The 480p finished, and then you're like, 'Yep, okay,
// great.' The view goes to the 1080, with everything in the timeline, and I can do what I need to do there"). When a
// full-size picture exists for the cut (GET …/full: an upscaled base of a version, or a take's own 1080p file) the page
// opens in the 1080p view: the player plays the full-size pieces (fullsize.ts) under the live mix, and the timeline stays
// as it is and stays editable. The switch on the player goes back to 480p; the choice is kept for the tab.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Timeline } from '@/server/types';
import { resKey } from '@/components/media/MasterPlayer';
import { cn } from '@/lib/utils';
import { baseFor, hasFull, type FullBase, type FullInfo } from './fullsize';

export function useFullView(film: string, info: FullInfo | undefined, version: string | undefined, view: (v: string) => Promise<Timeline | undefined>) {
  const has = hasFull(info);
  const [choice, setChoice] = useState<'480' | '1080'>();
  const [fellBack, setFellBack] = useState<string>();
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(resKey(film));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the tab's storage, which the server render cannot see
      if (v === '480' || v === '1080') setChoice(v);
    } catch { /* the default */ }
  }, [film]);
  const setRes = useCallback((r: '480' | '1080') => {
    setChoice(r);
    setFellBack(undefined);
    try { sessionStorage.setItem(resKey(film), r); } catch { /* this page only */ }
  }, [film]);
  const res = choice ?? '1080';
  // the 1080p picture could not be shown here: the view goes to 480p for this page and says why; the tab's
  // choice is kept, so the next visit tries 1080p again
  const fail = useCallback((why: string) => { setFellBack(why); setChoice('480'); }, []);
  const b = version ? baseFor(info, version) : undefined;
  // the base's own version, to map the clips shown onto it
  const [btl, setBtl] = useState<Timeline>();
  const bv = b?.version;
  useEffect(() => {
    if (!bv || btl?.version === bv) return;
    let live = true;
    void view(bv).then((t) => { if (live && t) setBtl(t); });
    return () => { live = false; };
  }, [bv, btl?.version, view]);
  const on = has && res === '1080';
  // one object while nothing changes, so the player does not rebuild its pieces on every frame
  const ready = !!b && btl?.version === b.version;
  const full = useMemo(() => (on && info ? { info, base: ready && b && btl ? { b, tl: btl } : undefined } : undefined), [on, info, ready, b, btl]);
  // the same sources whichever view is on, once the base's timeline is in: what a master would be made from
  const sources = useMemo(() => (info && (!b || ready) ? { info, base: b && btl && ready ? { b, tl: btl } : undefined } : undefined), [info, ready, b, btl]);
  // the player waiting for a file at the playhead, in either view (16 Nov: the 480p waits too on a slow link). Kept
  // outside the page's state: the dot is drawn again, not the whole Edit page
  const [loading] = useState(flag);
  return { has, res, setRes, on, full, sources, loading, setLoading: loading.set, base: b as FullBase | undefined, fail, fellBack };
}
export type FullView = ReturnType<typeof useFullView>;

/** A true/false that a component can follow without its parent drawing again. */
function flag() {
  let on = false;
  const subs = new Set<() => void>();
  return {
    get: () => on,
    set: (v: boolean) => { if (v !== on) { on = v; subs.forEach((f) => f()); } },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}

/** The two words on the player. */
export function MasterSwitch({ sw, className }: { sw: FullView; className?: string }) {
  const loading = useSyncExternalStore(sw.loading.subscribe, sw.loading.get, () => false);
  if (!sw.has) return null;
  const count = (m?: Record<string, string>) => Object.keys(m ?? {}).length;
  const takes = count(sw.full?.info.takes);
  const upscaled = count(sw.full?.info.upscaled);
  const originals = count(sw.full?.info.originals);
  const title1080 = [sw.base ? `The full-size picture of cut ${sw.base.version} (${sw.base.label})` : '', takes ? `${takes} take${takes === 1 ? '' : 's'} with their own full-size file` : '',
    upscaled ? `${upscaled} take${upscaled === 1 ? '' : 's'} upscaled whole` : '', originals ? `${originals} full-size original${originals === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(', ') + '. Shots nothing full-size covers play at 480p, marked in amber.';
  const seg = (on: boolean) => cn('inline-flex h-6 cursor-pointer items-center gap-1 rounded-[5px] px-1.5 font-mono text-[10.5px] transition-colors duration-200',
    on ? 'bg-white/90 text-black' : 'text-white/75 hover:text-white');
  return (
    <div onClick={(e) => e.stopPropagation()} className={cn('flex flex-col items-end gap-1', className)}>
    <div role="group" aria-label="Picture size"
      className="flex items-center gap-0.5 rounded-[7px] border border-white/15 bg-black/65 p-0.5 duration-200 animate-in fade-in-0">
      <button type="button" aria-pressed={sw.res === '480'} onClick={() => sw.setRes('480')} className={seg(sw.res === '480')} title="The 480p: the takes themselves, played live">
        480p{loading && sw.res === '480' && <Dot />}
      </button>
      <button type="button" aria-pressed={sw.res === '1080'} onClick={() => sw.setRes('1080')} className={seg(sw.res === '1080')} title={title1080}>
        1080p{loading && sw.res === '1080' && <Dot />}
      </button>
    </div>
    {sw.fellBack && (
      <p role="status" data-full-fell-back className="max-w-[260px] rounded-[6px] bg-black/75 px-2 py-1 text-right text-[11px] leading-snug text-white/85 duration-300 animate-in fade-in-0 slide-in-from-top-1">
        1080p did not play here: {sw.fellBack}. Showing 480p; press 1080p to try again.
      </p>
    )}
    </div>
  );
}

/** The player is waiting for a file: the picture holds on its last frame, the sound and the playhead with it. */
const Dot = () => <span aria-label="loading" className="size-1.5 animate-pulse rounded-full bg-current duration-200 animate-in fade-in-0" />;
