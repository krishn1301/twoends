import { supabase } from '../lib/supabase.ts';

/**
 * Web push, from the client's side.
 *
 * On iOS this only works once the app has been added to the Home Screen — Safari
 * does not grant notification permission to a tab, at all, and there is no way
 * to detect refusal versus impossibility. So the app asks only when it can
 * actually succeed, and says why when it cannot.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState =
  | 'unsupported'
  /** iOS, in a browser tab. Add to Home Screen first. */
  | 'needs-install'
  | 'denied'
  | 'off'
  | 'on';

export function pushState(): PushState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return isIos() && !isInstalled() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'on';
  return 'off';
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports as a Mac; the touch points give it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true;

/** Asks, subscribes, and stores the subscription against this profile. */
export async function enablePush(profileId: string): Promise<{ error: string | null }> {
  if (!VAPID_PUBLIC_KEY) return { error: 'Push is not configured for this build.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { error: 'Notifications are off. You can turn them on in your browser settings.' };
  }

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription rather than making a second one for the same
  // browser — the endpoint would be identical and the row a duplicate.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Chrome refuses a subscription without this, and a silent push is not
      // something this app wants anyway.
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(VAPID_PUBLIC_KEY),
    }));

  const { error } = await supabase.from('push_tokens').upsert(
    {
      profile_id: profileId,
      platform: 'web',
      token: JSON.stringify(subscription.toJSON()),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,token' },
  );

  return { error: error?.message ?? null };
}

export async function disablePush(profileId: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await supabase
      .from('push_tokens')
      .delete()
      .eq('profile_id', profileId)
      .eq('token', JSON.stringify(subscription.toJSON()));
    await subscription.unsubscribe();
  }
}

/**
 * Tells the partner something happened.
 *
 * Fire-and-forget on purpose: a push that fails to send must never make the
 * action that triggered it look like it failed. The answer is already written.
 */
export function notifyPartner(
  kind: 'answered' | 'snap' | 'drawing' | 'capsule' | 'asked' | 'moment',
): void {
  void supabase.functions.invoke('notify', { body: { kind } }).catch(() => {
    // Nothing to do and nothing worth saying. The other device will find out
    // when it next opens the app.
  });
}

/**
 * Backed by an explicit ArrayBuffer.
 *
 * `Uint8Array.from` produces an `ArrayBufferLike`, which could in principle be
 * a SharedArrayBuffer — and `applicationServerKey` will not accept one. Building
 * the buffer up front says what this actually is.
 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = atob(padded);

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
