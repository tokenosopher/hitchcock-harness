// Hitchcock Harness service worker. It exists so the app installs on the home screen as its own window,
// and so a notification can be shown (and clicked) where `new Notification()` is not allowed. It caches
// nothing and handles no fetches: every request goes to the harness on the Mac as before.
//
// TODO(web-push): real Web Push to a locked phone (a `push` handler here, a VAPID key and the stored
// subscription on the server) needs a stable https origin; the quick tunnel's name changes on every start.
// Build it once the harness is reached through Tailscale. See src/components/notify/NotifyProvider.tsx.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// a click on a notification opens that film's thread: in an open harness window if there is one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      await w.focus();
      w.postMessage({ open: url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
