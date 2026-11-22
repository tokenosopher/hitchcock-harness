'use client';
// The page header: breadcrumb, one meta line, the page's actions. On the phone, a top bar with the menu button.
import Link from 'next/link';
import { Fragment } from 'react';
import { useNav } from './Shell';
import { IconMenu } from './icons';
import { MoreMenu } from './MoreMenu';
import { BackLink, useRememberedBack, type Back } from './BackLink';

/** `node`: a crumb drawn by the page itself (a deeper page's step, with its menu). */
export interface Crumb { label: string; href?: string; node?: React.ReactNode }

/** `crumbExtra` sits after the last crumb on the desktop (the Edit page's version menu). `back`: a deeper page's way
 *  back before the trail ("Back to Characters", as drawn); on the phone the page's own row carries it. A `soft` way
 *  back is the page's usual parent ("Back to Scenes"): a way back remembered by the link that opened the page wins
 *  over it (BackLink.tsx), and the phone shows it in a row under the top bar, as it does a remembered one. */
export function Header({ crumbs, meta, actions, phoneSub, crumbExtra, back }: { crumbs: Crumb[]; meta?: React.ReactNode; actions?: React.ReactNode; phoneSub?: string; crumbExtra?: React.ReactNode; back?: Back & { soft?: boolean } }) {
  const { openNav } = useNav();
  const remembered = useRememberedBack();
  const way: Back | undefined = back && !back.soft ? back : remembered ?? back;
  const phoneRow = !!way && (way === remembered || !!back?.soft);
  const last = crumbs[crumbs.length - 1];
  // the phone bar already shows the page's name as its title: a sub-line that starts with it would say it twice
  const sub = phoneSub && last && phoneSub.startsWith(`${last.label} · `) ? phoneSub.slice(last.label.length + 3) : phoneSub;
  return (
    <>
      <div className="flex flex-none items-center gap-1 border-b border-line p-2 min-[761px]:hidden">
        <button type="button" aria-label="Films" onClick={openNav} className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-[10px] text-ink"><IconMenu size={20} /></button>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{last?.label}</span>
          {sub && <span className="truncate text-[12px] text-sub">{sub}</span>}
        </div>
        <MoreMenu phone />
      </div>
      {/* a deeper page without a row of its own: its way back under the top bar, on the phone */}
      {phoneRow && way && (
        <div className="flex flex-none px-4 pt-3 duration-200 animate-in fade-in-0 min-[761px]:hidden"><BackLink key={way.href} back={way} phone /></div>
      )}
      <header className="sticky top-0 z-20 flex h-14 flex-none items-center justify-between gap-3 border-b border-line bg-hdr px-6 max-[760px]:hidden">
        {way && <BackLink key={way.href} back={way} className={way === remembered ? 'duration-200 animate-in fade-in-0' : undefined} />}
        {/* the column takes the room the actions leave, so a crumb's 40 % is of that room: "The Lighthouse" was cut to
            "The Ligh…" with half the header empty (QC round two) */}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          {/* a long name is cut with an ellipsis (the full name on hover); it pushed the page sideways */}
          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[13px] text-sub">
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="flex-none text-faint">/</span>}
                {c.node ? c.node : i === crumbs.length - 1 ? (
                  <span className="min-w-0 truncate font-medium text-ink" title={c.label}>{c.label}</span>
                ) : c.href ? (
                  <Link href={c.href} title={c.label} className="-my-1.5 min-w-0 max-w-[40%] truncate py-1.5 text-sub no-underline hover:text-ink">{c.label}</Link>
                ) : (
                  <span className="min-w-0 max-w-[40%] truncate" title={c.label}>{c.label}</span>
                )}
              </Fragment>
            ))}
            {crumbExtra}
          </div>
          {meta && <div className="truncate text-[12px] text-sub">{meta}</div>}
        </div>
        <div className="flex flex-none gap-2">
          {actions}
          <MoreMenu />
        </div>
      </header>
    </>
  );
}

export function HeaderLink({ children, onClick, icon }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-edge px-3 text-[13px] font-medium text-ink hover:bg-raised">
      {icon}{children}
    </button>
  );
}
