'use client';
// The way back from a sub-item to the step it was opened from ("Back to Shots", "Back to Locations"), the button the
// location views drew first. When the page just before this one in the tab's history is the
// parent, the button goes Back, so the parent comes back where it was scrolled (Shell.tsx's scroll memory); else it
// opens the parent's address.
// A link that opens a sub-item on another page says where it came from with `rememberBack`; that page's header shows
// the way back to it (and on the phone, a row under the top bar), until the tab opens something else.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconChevronLeft } from './icons';
import { cn } from '@/lib/utils';

export interface Back { label: string; href: string }

const here = () => `${location.pathname}${location.search}`;
const same = (a: string, b: string) => {
  try { const x = new URL(a, location.origin); const y = new URL(b, location.origin); return x.pathname === y.pathname && x.search === y.search; } catch { return false; }
};

/** Whether the entry before this one in the tab's history is `href` (the Navigation API, where the browser has it). */
function parentIsPrevious(href: string): boolean {
  if (typeof window === 'undefined') return false;
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number }; entries?: () => { url: string | null }[] } }).navigation;
  const at = nav?.currentEntry?.index;
  if (!nav?.entries || at === undefined || at < 1) return false;
  const prev = nav.entries()[at - 1]?.url;
  return !!prev && same(prev, href);
}

/** Go to the parent: Back when it is the page before (so its scroll comes back), else its address. */
export function goBack(router: ReturnType<typeof useRouter>, href: string) {
  if (parentIsPrevious(href)) router.back(); else router.push(href);
}

const KEY = 'hh:back';

/** Before opening `to` from a sub-item: the way back is the page open now, named `label` ("Back to Shots"). */
export function rememberBack(to: string, label: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ to, back: { label, href: here() } })); } catch { /* no way back remembered */ }
}

/** The way back remembered for the page open now; one remembered for another page is forgotten. */
export function useRememberedBack(): Back | undefined {
  const [back, setBack] = useState<Back>();
  useEffect(() => {
    let b: Back | undefined;
    try {
      const raw = sessionStorage.getItem(KEY);
      const r = raw ? (JSON.parse(raw) as { to: string; back: Back }) : undefined;
      // the page's own address may change its query as it opens (the Edit page's ?at=): the path is what counts
      if (r && new URL(r.to, location.origin).pathname === location.pathname) b = r.back; else if (r) sessionStorage.removeItem(KEY);
    } catch { /* none */ }
    // read after the first paint (sessionStorage is not there on the server); it fades in
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only in the browser
    setBack(b);
  }, []);
  return back;
}

/** The button: 30 px in the desktop header, 44 px on the phone (`phone`). */
export function BackLink({ back, phone, className }: { back: Back; phone?: boolean; className?: string }) {
  const router = useRouter();
  return (
    <Link href={back.href} {...(phone ? { 'data-phone-back': '' } : { 'data-header-back': '' })}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; if (parentIsPrevious(back.href)) { e.preventDefault(); router.back(); } }}
      className={cn('inline-flex flex-none items-center gap-1 rounded-lg border border-edge px-2.5 text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-raised',
        phone ? 'h-11 text-[12.5px]' : 'h-[30px]', className)}>
      <IconChevronLeft size={13} />{back.label}
    </Link>
  );
}
