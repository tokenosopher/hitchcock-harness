// The Story page's own small icons (design/boards/Story-2.dc.html), drawn like the shell's (icons.tsx).
type P = { size?: number; className?: string };
const S = ({ size = 13, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={className}>{children}</svg>
);
export const IconPen = (p: P) => <S {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></S>;
export const IconLock = (p: P) => <S {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></S>;
export const IconLink = (p: P) => <S {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></S>;
export const IconClock = (p: P) => <S {...p}><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></S>;
