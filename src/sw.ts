/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  const { title, body, choreKey } = event.data.json() as {
    title: string;
    body: string;
    choreKey: string;
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      data: { choreKey },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const choreKey = (event.notification.data as { choreKey?: string }).choreKey;
  const url = choreKey ? `/chores/${encodeURIComponent(choreKey)}` : '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      }),
  );
});
