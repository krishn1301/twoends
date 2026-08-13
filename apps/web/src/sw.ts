/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { registerRoute } from 'workbox-routing';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  // Workbox rewrites this placeholder into the precache list at build time.
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/**
 * The service worker.
 *
 * Two jobs: make the app open instantly and work with no network, and receive
 * pushes. On an iPhone the second one is the closest thing to a home-screen
 * widget that exists — and this app's whole thesis is feeling the other person
 * without opening anything.
 */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Photos, cached hard.
 *
 * Signed URLs expire in an hour, so the URL changes even when the image does
 * not — cache by the object path instead. Egress is the free tier's tightest
 * constraint, and a photo re-downloaded on every glance is the fastest way to
 * spend it.
 */
registerRoute(
  ({ url }: { url: URL }) => url.pathname.includes('/storage/v1/object/sign/'),
  new StaleWhileRevalidate({
    cacheName: 'twoends-media',
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 86_400 })],
  }),
);

/*
  Never cache the API. Everything the app reads from Postgres already has a
  local copy in Dexie, so a stale HTTP cache would add a second, worse answer
  with none of the conflict rules.
*/
registerRoute(
  ({ url }: { url: URL }) =>
    url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/'),
  new NetworkFirst({ cacheName: 'twoends-api', networkTimeoutSeconds: 10 }),
);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ── push ─────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      /*
        One notification at a time, replaced rather than stacked. Two people
        cannot generate enough news to need a pile, and a lock screen with four
        entries from the same app is how an app gets its notifications turned
        off.
      */
      tag: 'twoends',
      /*
        Replaces the previous notification rather than stacking. `renotify` is
        not in the DOM types yet, though every browser that supports `tag`
        supports it — without it, a replacement arrives silently and the second
        piece of news goes unnoticed.
      */
      renotify: true,
    } as NotificationOptions & { renotify: boolean }),
  );
});

function readPayload(data: PushMessageData | null): { title: string; body: string } {
  try {
    const parsed = data?.json() as { title?: string; body?: string } | undefined;
    if (parsed?.title) return { title: parsed.title, body: parsed.body ?? '' };
  } catch {
    // A push with no payload still deserves to arrive.
  }
  return { title: 'TwoEnds', body: 'Something happened.' };
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus the app if it is already open rather than opening a second copy.
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })(),
  );
});
