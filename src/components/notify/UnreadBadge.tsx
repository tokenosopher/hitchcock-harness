'use client';
// The sidebar film row's unread mark: a white dot with the count of what happened there while the user
// was elsewhere (Alma's turns, finished sub-agents, picks waiting). The newest line is its tooltip.
import { useNotify } from './NotifyProvider';

export function UnreadBadge({ film }: { film: string }) {
  const u = useNotify().unread[film];
  if (!u?.count) return null;
  const label = `${u.count} unread${u.last ? ` · ${u.last}` : ''}`;
  return (
    <span role="status" aria-label={label} title={label} data-unread={u.count}
      className="inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center gap-1 rounded-[9px] bg-ink px-[5px] font-mono text-[10.5px] font-semibold tabular-nums text-bg">
      {u.count > 99 ? '99+' : u.count}
    </span>
  );
}
