'use client';
// Full screen for the phone's player (the user wanted the film playing on the phone full screen,
// and the phone view had no button for it). The picture's own box goes full screen, so the same player keeps playing:
// the browser's full screen where the phone has one (Android, iPad), else the page's own (iPhone Safari has no full
// screen for anything but a lone video): the box laid over the whole window. A portrait film stays upright; a
// landscape one asks the phone to turn sideways (screen.orientation.lock, where there is one), and while the window
// still stands upright it is drawn turned a quarter, so the phone is turned to watch it. Every refusal is quiet: the
// page's own full screen stays.
import { useCallback, useEffect, useRef, useState } from 'react';

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FsDocument = Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean };
type Orientation = ScreenOrientation & { lock?: (o: 'landscape' | 'portrait') => Promise<void>; unlock?: () => void };

const fsElement = (): Element | null => { const d = document as FsDocument; return d.fullscreenElement ?? d.webkitFullscreenElement ?? null; };
const orientation = (): Orientation | undefined => (typeof screen !== 'undefined' ? (screen.orientation as Orientation | undefined) : undefined);
function unlock() { try { orientation()?.unlock?.(); } catch { /* no lock to undo */ } }

/** `full`: the player is full screen (the browser's or the page's own); `real`: it is the browser's; `sideways`: a
 *  landscape film in a window that stands upright, drawn turned a quarter. */
export function usePhoneFull(box: React.RefObject<HTMLElement | null>, landscape: boolean) {
  const [full, setFull] = useState(false);
  const [real, setReal] = useState(false);
  const [upright, setUpright] = useState(false);
  const realRef = useRef(false);
  const enter = useCallback(async () => {
    setFull(true);
    const el = box.current as FsElement | null;
    const d = document as FsDocument;
    if (!el || !(d.fullscreenEnabled || d.webkitFullscreenEnabled)) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    } catch { return; }
    // the phone turns for a landscape film and stays upright for a portrait one, where it can be told to
    try { await orientation()?.lock?.(landscape ? 'landscape' : 'portrait'); } catch { /* refused or not there: quiet */ }
  }, [box, landscape]);
  const leave = useCallback(() => {
    const d = document as FsDocument;
    if (fsElement()) { if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined); else d.webkitExitFullscreen?.(); }
    unlock();
    setFull(false);
  }, []);
  useEffect(() => {
    // the browser's full screen ended by itself (the back gesture, Esc): the page's ends with it
    const h = () => {
      const on = !!fsElement() && fsElement() === box.current;
      if (realRef.current && !on) { unlock(); setFull(false); }
      realRef.current = on;
      setReal(on);
    };
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => { document.removeEventListener('fullscreenchange', h); document.removeEventListener('webkitfullscreenchange', h); };
  }, [box]);
  useEffect(() => {
    if (!full) return;
    const measure = () => setUpright(window.innerHeight > window.innerWidth);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !fsElement()) leave(); };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); window.removeEventListener('keydown', esc); };
  }, [full, leave]);
  // leaving the page while full screen: let the phone turn freely again
  useEffect(() => () => { if (realRef.current) unlock(); }, []);
  return { full, real, sideways: full && landscape && upright, enter, leave };
}
