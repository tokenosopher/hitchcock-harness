'use client';
// The app frame: Sidebar · page · ThreadColumn (design/boards/Main.dc.html).
// On the phone the sidebar sits behind the menu button and the thread is a bottom panel.
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FilmsProvider } from '@/components/data/films';
import { FilmProvider } from '@/components/data/film';
import { ThreadProvider, useThread } from '@/components/data/thread';
import { UIProvider } from '@/components/data/ui';
import { Sidebar } from './Sidebar';
import { ThreadColumn } from './ThreadColumn';
import { NewFilmThread } from './NewFilmThread';
import { cn } from '@/lib/utils';
import { Lightbox } from '@/components/media/Lightbox';
import { SIZES, useHydrated, useSize } from '@/components/lib/sizes';
import { Edge } from './Edge';
import { ChoicesTray } from './ChoicesTray';
import { IconLogo, IconPanel } from './icons';
import { useIsPhone } from './useIsPhone';
import { Dot } from './atoms';
import { usePresence } from './Reveal';

const NavCtx = createContext<{ openNav: () => void }>({ openNav: () => {} });
export const useNav = () => useContext(NavCtx);

// The films list on the left can be folded to a narrow rail (the user, 13 Nov 2026); this browser remembers it.
const NAV_KEY = 'hh-sidebar-hidden';
const RAIL = 52;
// The page between the two columns never gets less than this (14 Nov 2026, the Release QC: at 820 px with both
// columns open it had 188 px). Below it the films list folds to its rail for this window size only (the stored
// choice is kept; the rail's button then opens the list over the page) and Alma's column gives up width down to its
// own minimum. Kept in step with prepaint.ts.
export const PAGE_MIN = 400;
// The Edit page cannot be narrower than about 660 px (its header, the player beside the timeline): under it the page
// scrolled sideways at 1180 and 1280 with both columns open (the QC of 15 Nov 2026). There the films list folds the same way.
export const EDIT_PAGE_MIN = 680;
export const pageMinFor = (path: string | null | undefined): number => (/^\/films\/[^/]+\/edit\/?$/.test(path ?? '') ? EDIT_PAGE_MIN : PAGE_MIN);
const NAV_EVENT = 'hh:sidebar';
const subWin = (cb: () => void) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); };
const winWidth = () => window.innerWidth;
const subNav = (cb: () => void) => { window.addEventListener(NAV_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(NAV_EVENT, cb); window.removeEventListener('storage', cb); }; };
const navHidden = (): boolean => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };
const setNavHidden = (v: boolean): void => { try { localStorage.setItem(NAV_KEY, v ? '1' : '0'); } catch { /* storage blocked: it folds for this visit only */ } window.dispatchEvent(new Event(NAV_EVENT)); };

// Alma's column at the right folds the same way (the user, 13 Nov 2026: "retract Alma in the same way that I can
// do the other sidebar, and it should have the same cool effect"). Words put in her box unfold it ('hh:alma-show').
const THREAD_KEY = 'hh-thread-hidden';
const threadHidden = (): boolean => { try { return localStorage.getItem(THREAD_KEY) === '1'; } catch { return false; } };
const setThreadHidden = (v: boolean): void => { try { localStorage.setItem(THREAD_KEY, v ? '1' : '0'); } catch { /* this visit only */ } window.dispatchEvent(new Event(NAV_EVENT)); };

/** What the folded column still says: Alma is working, or is there. One click brings her back. */
function ThreadRail({ onOpen }: { onOpen: () => void }) {
  const { workingSince } = useThread();
  return (
    <>
      <button type="button" onClick={onOpen} aria-label="Show Alma" title="Show Alma"
        className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-sub transition-colors hover:bg-raised hover:text-ink">
        <span className="flex -scale-x-100"><IconPanel size={17} /></span>
      </button>
      <button type="button" onClick={onOpen} title={workingSince ? 'Alma is working. Show her.' : 'Show Alma'} aria-label={workingSince ? 'Alma is working. Show her.' : 'Show Alma'}
        className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-edge-strong bg-transparent text-[11px] font-medium text-ink-3 transition-colors hover:text-ink">
        A
        {workingSince ? <span className="absolute -right-0.5 -top-0.5"><Dot state="running" /></span> : null}
      </button>
    </>
  );
}

/** ⌘N (Ctrl+N outside a text field) opens the Idea page from anywhere, as the sidebar's New film button does.
 *  Some browsers keep ⌘N for a new window; the button is always there. */
function useNewFilmKey() {
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (!e.metaKey && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      router.push('/films/new');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router]);
}

// Back and Forward bring the page back to where it was scrolled. The page scrolls inside <main>, not the window,
// so the browser's own restoring did nothing: back to the Scenes list landed at its top every time.
const scrollAt = new Map<string, number>();
// Whether this render follows Back or Forward: the pre-paint script (prepaint.ts) marks every popstate before the
// router hears it (a listener added here ran after the router had already drawn the page).
const popped = (): boolean => { const w = window as unknown as { __hhPop?: number }; const p = !!w.__hhPop; w.__hhPop = 0; return p; };
function useScrollMemory(ref: React.RefObject<HTMLElement | null>) {
  const key = `${usePathname()}?${useSearchParams()?.toString() ?? ''}`;
  // a layout effect: the old page's listener must be gone before the new page resets the scroll, or that reset
  // was saved as the old page's place
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const save = () => scrollAt.set(key, el.scrollTop);
    el.addEventListener('scroll', save, { passive: true });
    let id = 0;
    if (popped()) {
      const want = scrollAt.get(key) ?? 0;
      // the page may still be drawing its sections: try for half a second, until it is long enough
      let tries = 0;
      const step = () => { el.scrollTop = want; if (Math.abs(el.scrollTop - want) > 2 && tries++ < 30) id = requestAnimationFrame(step); };
      id = requestAnimationFrame(step);
    }
    return () => { el.removeEventListener('scroll', save); cancelAnimationFrame(id); };
  }, [key, ref]);
}

function Frame({ film, thread, children }: { film?: string; thread?: React.ReactNode; children: React.ReactNode }) {
  const [nav, setNav] = useState(false);
  const pageMin = pageMinFor(usePathname());
  const mainRef = useRef<HTMLElement>(null);
  useScrollMemory(mainRef);
  const drawer = usePresence(nav);
  // Escape closes the phone's films list
  useEffect(() => {
    if (!nav) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNav(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [nav]);
  const sidebarW = useSize('sidebar');
  const hiddenNav = useSyncExternalStore(subNav, navHidden, () => false);
  const [sliding, setSliding] = useState(false);
  const fold = (v: boolean) => { setSliding(true); setNavHidden(v); setTimeout(() => setSliding(false), 450); };
  const phone = useIsPhone();
  const threadW = useSize('thread');
  const storedThread = useSyncExternalStore(subNav, threadHidden, () => false);
  const hiddenThread = storedThread && !phone && !!film;
  const [slidingT, setSlidingT] = useState(false);
  const foldThread = (v: boolean) => { setSlidingT(true); setThreadHidden(v); setTimeout(() => setSlidingT(false), 450); };
  useEffect(() => {
    const h = () => { if (threadHidden()) { setSlidingT(true); setThreadHidden(false); setTimeout(() => setSlidingT(false), 450); } };
    window.addEventListener('hh:alma-show', h);
    return () => window.removeEventListener('hh:alma-show', h);
  }, []);
  // until hydrated the widths and folds come from the pre-paint script's variables on <html> (prepaint.ts), so a
  // remembered fold or width is there from the first paint instead of arriving with React
  const ready = useHydrated();
  const winW = useSyncExternalStore(subWin, winWidth, () => 1440);
  const threadWant = Math.min(threadW, winW * 0.6);
  // too little room for the page: the films list folds to its rail, for this window size only
  const squeezed = ready && !!film && !phone && !hiddenNav && winW - sidebarW - (hiddenThread ? RAIL : threadWant) < pageMin;
  const navRail = hiddenNav || squeezed;
  const threadPx = Math.round(Math.max(SIZES.thread.min, Math.min(threadWant, winW - (navRail ? RAIL : sidebarW) - pageMin)));
  const wasRail = useRef(navRail);
  useEffect(() => {
    if (wasRail.current === navRail) return;
    wasRail.current = navRail;
    // the fold that follows the window slides too
    setSliding(true);
    const t = setTimeout(() => setSliding(false), 450);
    return () => clearTimeout(t);
  }, [navRail]);
  const threadWidth = ready ? `${threadPx}px` : 'var(--hh-thread-cap, min(var(--hh-thread-w, 384px), 60vw))';
  const navFrame = ready ? (navRail ? RAIL : sidebarW) : 'var(--hh-nav-frame, 248px)';
  const navW = ready ? sidebarW : 'var(--hh-nav-w, 248px)';
  const threadFrame = ready ? (hiddenThread ? RAIL : threadWidth) : 'var(--hh-thread-frame, min(384px, 60vw))';
  useNewFilmKey();
  return (
    <NavCtx.Provider value={{ openNav: () => setNav(true) }}>
      <div className="flex h-dvh overflow-hidden bg-bg text-ink">
        {/* The films list folds to a narrow rail and back in one movement: the width slides, the list fades out as
            the rail fades in. The slide is on only while folding, so dragging the list's edge stays direct. */}
        <div
          className={cn('relative flex-none border-r border-line max-[760px]:hidden', sliding && 'transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none')}
          style={{ width: navFrame }}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget) setSliding(false); }}>
          {/* the clip: the list keeps its own width while the frame narrows over it; the drag edge sits outside the clip */}
          <div className="absolute inset-0 overflow-hidden">
          <div inert={navRail} aria-hidden={navRail} className={cn('absolute inset-y-0 left-0 transition-opacity duration-200 ease-out motion-reduce:transition-none', navRail ? 'opacity-0' : 'opacity-100 delay-75', !ready && 'hh-pre-nav-list')} style={{ width: navW }}>
            <Sidebar current={film} onCollapse={() => fold(true)} />
          </div>
          <div inert={!navRail} aria-hidden={!navRail} className={cn('absolute inset-y-0 left-0 flex flex-col items-center gap-2 py-3 transition-opacity duration-200 ease-out motion-reduce:transition-none', navRail ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0', !ready && 'hh-pre-nav-rail')} style={{ width: RAIL }}>
            <Link href="/" aria-label="Hitchcock Harness, all films" className="flex size-7 items-center justify-center rounded-[7px] bg-ink text-bg no-underline"><IconLogo /></Link>
            <button type="button" onClick={() => (hiddenNav ? fold(false) : setNav(true))} aria-label="Show the films list" title="Show the films list"
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-sub transition-colors hover:bg-raised hover:text-ink">
              <IconPanel size={17} />
            </button>
          </div>
          </div>
          {!navRail && <Edge name="sidebar" axis="x" sign={1} label="The width of the films list" className="-right-[5px]" />}
        </div>
        {/* the phone's films list (and the desktop's while the window is too narrow for it) slides in from the left over a
            dimmed page, and back out */}
        {drawer.mounted && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Films">
            <button type="button" aria-label="Close films" onClick={() => setNav(false)}
              className={cn('absolute inset-0 bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none', drawer.shown ? 'opacity-100' : 'opacity-0')} />
            <div onTransitionEnd={(e) => { if (e.target === e.currentTarget) drawer.done(); }}
              className={cn('absolute inset-y-0 left-0 w-[280px] border-r border-line bg-bg transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none', drawer.shown ? 'translate-x-0' : '-translate-x-full')}>
              <Sidebar current={film} onNavigate={() => setNav(false)} />
            </div>
          </div>
        )}
        <main ref={mainRef} className={cn('scroll flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto', (film || thread) && 'max-[760px]:pb-[var(--hh-phone-bar,150px)] max-[760px]:transition-[padding] max-[760px]:duration-200')}>{children}{film && <ChoicesTray film={film} />}</main>
        {film ? (
          // Alma's column folds to a rail and back like the films list: the width slides, the column fades out as
          // the rail fades in. On a phone the column is a sheet of its own, so the frame steps aside (contents).
          <div
            className={cn('relative flex-none max-[760px]:contents', slidingT && 'transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none')}
            style={{ width: threadFrame }}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget) setSlidingT(false); }}>
            <div className="absolute inset-0 overflow-hidden max-[760px]:contents">
              <div inert={hiddenThread} aria-hidden={hiddenThread} className={cn('absolute inset-y-0 right-0 transition-opacity duration-200 ease-out motion-reduce:transition-none max-[760px]:contents', hiddenThread ? 'opacity-0' : 'opacity-100 delay-75', !ready && 'hh-pre-thread-col')} style={{ width: threadWidth }}>
                <ThreadColumn film={film} onCollapse={() => foldThread(true)} />
              </div>
              <div inert={!hiddenThread} aria-hidden={!hiddenThread} className={cn('absolute inset-y-0 right-0 flex flex-col items-center gap-2 border-l border-line py-3 transition-opacity duration-200 ease-out motion-reduce:transition-none max-[760px]:hidden', hiddenThread ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0', !ready && 'hh-pre-thread-rail')} style={{ width: RAIL }}>
                <ThreadRail onOpen={() => foldThread(false)} />
              </div>
            </div>
            {!hiddenThread && <Edge name="thread" axis="x" sign={-1} label="The width of the thread" className="-left-[5px] max-[760px]:hidden" />}
          </div>
        ) : thread}
        <Lightbox />
      </div>
    </NavCtx.Provider>
  );
}

/** Threads not tied to a film: the Library and Settings have their own Alma sessions, keyed
 *  "library" and "settings" in sessions.json. */
const LIBRARY_THREAD = 'library';
const SETTINGS_THREAD = 'settings';

export function Shell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ film?: string }>();
  const pathname = usePathname();
  const film = params?.film;
  const library = !film && (pathname === '/library' || pathname?.startsWith('/library/'));
  const settings = !film && pathname === '/settings';
  return (
    <FilmsProvider>
      {library ? (
        <ThreadProvider film={LIBRARY_THREAD}>
          <UIProvider film={LIBRARY_THREAD}>
            <Frame film={LIBRARY_THREAD}>{children}</Frame>
          </UIProvider>
        </ThreadProvider>
      ) : settings ? (
        <ThreadProvider film={SETTINGS_THREAD}>
          <UIProvider film={SETTINGS_THREAD}>
            <Frame film={SETTINGS_THREAD}>{children}</Frame>
          </UIProvider>
        </ThreadProvider>
      ) : film ? (
        <FilmProvider key={film} film={film}>
          <ThreadProvider film={film}>
            <UIProvider film={film}>
              <Frame film={film}>{children}</Frame>
            </UIProvider>
          </ThreadProvider>
        </FilmProvider>
      ) : pathname === '/films/new' ? (
        <Frame thread={<NewFilmThread />}>{children}</Frame>
      ) : (
        <Frame>{children}</Frame>
      )}
    </FilmsProvider>
  );
}
