'use client';
// "Notify me" in the thread header: asks the browser once for notifications; a refusal is shown as such and
// the badges and the tab title go on counting. Also opens the thread when a notification brought the user
// here (the URL ends in #thread), which on the phone means the thread panel opens.
import { useEffect, useSyncExternalStore } from 'react';
import { useUI } from '@/components/data/ui';
import { cn } from '@/lib/utils';
import { useNotify } from './NotifyProvider';

function Bell({ off }: { off?: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

const noop = () => () => undefined;

export function NotifyToggle() {
  const { enabled, permission, enable, disable } = useNotify();
  const ui = useUI();
  const { setThreadOpen } = ui;

  useEffect(() => {
    const check = () => {
      if (window.location.hash !== '#thread') return;
      setThreadOpen(true);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [setThreadOpen]);

  // the server and the first client frame assume support, so the button is there from the first paint and the
  // model menu beside it does not jump when the provider has read the permission
  const supported = useSyncExternalStore(noop, () => 'Notification' in window, () => true);
  if (!supported) return null;
  const denied = permission === 'denied';
  const label = denied ? 'Notifications blocked in this browser' : enabled ? 'Notifications on' : 'Notify me';
  return (
    <button type="button" aria-pressed={enabled} aria-label={label} disabled={denied} title={denied ? 'The browser refused notifications; allow them in its site settings to switch them on. Unread counts still show in the sidebar and the tab title.' : enabled ? 'Notifications on: Alma’s turns, finished sub-agents and picks waiting, while you are looking elsewhere' : 'Get a notification when Alma finishes, a sub-agent lands or a pick is waiting'}
      onClick={() => (enabled ? disable() : void enable())}
      className={cn('ml-auto inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed',
        enabled ? 'border-faint bg-raised text-ink' : 'border-edge text-sub hover:text-ink', denied && 'border-dashed text-mute hover:text-mute')}>
      <Bell off={denied} />
    </button>
  );
}
