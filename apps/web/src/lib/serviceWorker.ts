import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker — on the web, and deliberately never in the Android app.
 *
 * **This is what a white screen on a fresh APK install actually was.** Capacitor
 * serves the bundle from `https://localhost` and injects its native bridge into
 * the HTML it hands over. A service worker registered at that origin takes
 * control and serves the *precached* `index.html` instead — the plain web one,
 * with no bridge in it. The next thing to touch `Capacitor` finds it half
 * missing and the app dies before it renders, with one line in logcat:
 *
 *     Uncaught TypeError: Cannot read properties of undefined (reading 'triggerEvent')
 *
 * It hid for months behind an install ordering. The first launch after an
 * install works, because the page was already loaded from the native server
 * before the worker took over; it is the *second* one that breaks. Installing
 * over an existing app kept a warm cache and kept getting away with it, and the
 * note in CLAUDE.md about a fresh APK "running the previous web bundle for one
 * launch" was this bug, seen and mistaken for staleness.
 *
 * The app has nothing to gain from it either way: an APK's assets are already
 * on the device, so there is no offline win to trade against a broken bridge.
 */
export function startServiceWorker(): void {
  if (Capacitor.isNativePlatform()) {
    void removeAny();
    return;
  }

  // `immediate` because the worker also handles push and notification clicks,
  // and a registration that waits for a navigation is one that misses the first
  // notification somebody would have received.
  registerSW({ immediate: true });
}

/**
 * Unregisters anything a previous build left behind, and drops its caches.
 *
 * Needed because the fix cannot reach a phone that already has the worker
 * installed: it would serve its cached `index.html` forever, and that copy has
 * no new code in it to correct itself with. This runs on every native launch and
 * costs nothing once there is nothing to remove.
 */
async function removeAny(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const workers = await navigator.serviceWorker.getRegistrations();
      await Promise.all(workers.map((worker) => worker.unregister()));
    }

    // The registration going away does not empty the cache it was serving from.
    if ('caches' in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Nothing to do and nothing to say. A WebView that refuses either call is
    // one where there was no worker to remove in the first place.
  }
}
