// Inline stroke icons, copied from the boards' SVGs (no emoji, no icon font).
type P = { size?: number; className?: string; strokeWidth?: number };
const S = ({ size = 15, className, strokeWidth = 2, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true" className={className}>{children}</svg>
);
/** The Hitchcock Harness mark: two lowercase h's as one line, the second lying with its legs to the right
 *  (brand/final/hh-mark.svg; picked 12 Nov 2026). Wider than tall: `size` is its width. */
export const IconLogo = ({ size = 19, className }: P) => (
  <svg width={size} height={(size * 14) / 22} viewBox="-2 -2 22 14" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d="M0,0 V10 M0,6.5 A3,3 0 0 1 6,6.5 V10 H18 M14.5,10 A3,3 0 0 1 14.5,4 H18" />
  </svg>
);
/** A window with its left panel marked: hide or show the films list. */
export const IconPanel = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></S>;
export const IconArrowUpRight = (p: P) => <S {...p}><path d="M7 17L17 7M9 7h8v8" /></S>;
export const IconMore = ({ size = 15, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
export const IconMenu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h10" /></S>;
export const IconChevronRight = (p: P) => <S {...p}><path d="M9 18l6-6-6-6" /></S>;
export const IconChevronLeft = (p: P) => <S {...p}><path d="M15 18l-6-6 6-6" /></S>;
export const IconChevronDown = (p: P) => <S {...p}><path d="M6 9l6 6 6-6" /></S>;
export const IconX = (p: P) => <S {...p} strokeWidth={2.5}><path d="M6 6l12 12M18 6L6 18" /></S>;
export const IconPin = (p: P) => <S {...p}><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8" /></S>;
export const IconInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></S>;
export const IconSend = (p: P) => <S {...p} strokeWidth={2.2}><path d="M12 19V5M5 12l7-7 7 7" /></S>;
export const IconStop = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const IconBookmark = (p: P) => <S {...p}><path d="M6 3h12v18l-6-4-6 4z" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const IconPlay = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><path d="M8 5v14l11-7z" /></svg>
);
export const IconFile = (p: P) => <S {...p}><path d="M14 3H6v18h12V7zM14 3v4h4" /></S>;
