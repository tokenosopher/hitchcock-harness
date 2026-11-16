'use client';
// Unread per film, across the whole app. One EventSource on GET /api/notify (every film's thread at once);
// a notice counts as unread when the user is not looking at its film (another film is open, the tab is
// hidden, or the window is not focused). Unread counts and the last notice seen live in localStorage, so a
// reload keeps them and asks the server only for what came after. Shown three ways: the tab title
// "(2) Hitchcock Harness", a dot with the count on the sidebar's film row (UnreadBadge), and a browser
// notification when the user switched them on (NotifyToggle in the thread header).
//
// TODO(web-push): a notification on a locked iPhone needs real Web Push (a VAPID key, a push subscription
// stored on the server, a push handler in public/sw.js), and that needs a stable https origin: the quick
// tunnel's name changes on every start. Build it once the harness sits behind Tailscale. Until then a
// notification shows only while a harness page is open somewhere (a tab, or the home-screen app awake).
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { HarnessNotice } from '@/server/types';

export interface Unread { count: number; last?: string; at?: string }
type Permission = NotificationPermission | 'unsupported';

interface NotifyValue {
  unread: Record<string, Unread>;
  total: number;
  /** Notifications switched on in this browser (and allowed by it). */
  enabled: boolean;
  permission: Permission;
  /** Asks the browser once; a refusal leaves the badges and the tab title working. */
  enable: () => Promise<void>;
  disable: () => void;
  clear: (film: string) => void;
}

const Ctx = createContext<NotifyValue>({ unread: {}, total: 0, enabled: false, permission: 'unsupported', enable: async () => {}, disable: () => {}, clear: () => {} });

const UNREAD_KEY = 'hh:unread';
const SEQ_KEY = 'hh:notify:seq';
const ON_KEY = 'hh:notify';
const BASE_TITLE = 'Hitchcock Harness';
const TITLE_COUNT = /^\(\d+\)\s+/;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
}

/** The thread a page belongs to: the film in the URL, "library" on /library. */
function threadOf(film: string | undefined, pathname: string | null): string | undefined {
  if (film) return film;
  if (pathname === '/library' || pathname?.startsWith('/library/')) return 'library';
  return undefined;
}

function hrefOf(film: string): string {
  return film === 'library' ? '/library#thread' : `/films/${film}#thread`;
}

function permissionNow(): Permission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ film?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const current = threadOf(params?.film, pathname);
  const [unread, setUnread] = useState<Record<string, Unread>>({});
  const [on, setOn] = useState(false);
  const [permission, setPermission] = useState<Permission>('unsupported');
  const [looking, setLooking] = useState(true);

  // refs for the EventSource handler, which lives as long as the page
  const currentRef = useRef(current);
  const lookingRef = useRef(true);
  const onRef = useRef(false);
  const routerRef = useRef(router);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { onRef.current = on && permission === 'granted'; }, [on, permission]);
  useEffect(() => { routerRef.current = router; }, [router]);

  // restore after mount (localStorage is not there during the server render)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restoring per-browser state from storage after mount */
    setUnread(read<Record<string, Unread>>(UNREAD_KEY, {}));
    setOn(read<boolean>(ON_KEY, false));
    setPermission(permissionNow());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // looking = the tab is visible and the window has focus
  useEffect(() => {
    const update = () => {
      const v = document.visibilityState === 'visible' && document.hasFocus();
      lookingRef.current = v;
      setLooking(v);
    };
    update();
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const clear = useCallback((film: string) => {
    setUnread((u) => {
      if (!u[film]) return u;
      const next = { ...u };
      delete next[film];
      write(UNREAD_KEY, next);
      return next;
    });
  }, []);

  // looking at a film reads it
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a film (or coming back to the tab) marks it read
    if (current && looking) clear(current);
  }, [current, looking, clear]);

  const show = useCallback(async (n: HarnessNotice) => {
    const title = `Alma · ${n.filmTitle}`;
    const opts: NotificationOptions = { body: n.text, tag: `hh-${n.film}`, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: hrefOf(n.film) } };
    try {
      const note = new Notification(title, opts);
      note.onclick = () => {
        window.focus();
        routerRef.current.push(hrefOf(n.film));
        note.close();
      };
    } catch {
      // Chrome on Android and the iPhone home-screen app only show notifications through the service worker
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.showNotification(title, opts);
      } catch { /* notifications are not available here: the badges still count */ }
    }
  }, []);

  // one stream for every film; ?after= asks only for what this browser has not seen
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    const after = read<number | null>(SEQ_KEY, null);
    const open = () => {
      if (closed) return;
      es = new EventSource(`/api/notify${after ? `?after=${after}` : ''}`);
      es.onmessage = (m) => {
        let n: HarnessNotice;
        try { n = JSON.parse(m.data) as HarnessNotice; } catch { return; }
        write(SEQ_KEY, n.seq);
        const watching = lookingRef.current && currentRef.current === n.film;
        if (watching) return;
        setUnread((u) => {
          const next = { ...u, [n.film]: { count: (u[n.film]?.count ?? 0) + 1, last: n.text, at: n.at } };
          write(UNREAD_KEY, next);
          return next;
        });
        if (onRef.current) void show(n);
      };
    };
    open();
    return () => { closed = true; es?.close(); };
  }, [show]);

  // the service worker makes the app installable (and shows notifications where `new Notification` cannot)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    const onMsg = (e: MessageEvent) => {
      const url = (e.data as { open?: string } | null)?.open;
      if (typeof url === 'string' && url.startsWith('/')) routerRef.current.push(url);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const total = useMemo(() => Object.values(unread).reduce((a, u) => a + u.count, 0), [unread]);

  // the tab title carries the count; pages that set their own title keep it, with the count in front
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_COUNT, '') || BASE_TITLE;
      const want = total ? `(${total}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const el = document.querySelector('title');
    if (!el) return;
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [total, pathname]);

  const enable = useCallback(async () => {
    if (!('Notification' in window)) { setPermission('unsupported'); return; }
    let p = Notification.permission;
    if (p === 'default') {
      try { p = await Notification.requestPermission(); } catch { p = Notification.permission; }
    }
    setPermission(p);
    const yes = p === 'granted';
    setOn(yes);
    write(ON_KEY, yes);
  }, []);
  const disable = useCallback(() => { setOn(false); write(ON_KEY, false); }, []);

  const value = useMemo<NotifyValue>(() => ({ unread, total, enabled: on && permission === 'granted', permission, enable, disable, clear }),
    [unread, total, on, permission, enable, disable, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotify = () => useContext(Ctx);
