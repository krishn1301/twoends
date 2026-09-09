import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { supabase } from '../lib/supabase.ts';

/**
 * Notifications, from the client's side. Two transports, one switch.
 *
 * **Web push** everywhere there is a browser. On iOS it works only once the app
 * has been added to the Home Screen — Safari does not grant notification
 * permission to a tab, at all, and there is no way to tell refusal from
 * impossibility. So the app asks only when it can actually succeed, and says
 * why when it cannot.
 *
 * **FCM in the APK**, because there is no browser there to ask. Android's
 * WebView exposes no Notification API to an installed Capacitor app, which is
 * why the one build with home-screen widgets was for a long time the one build
 * that could not tap you on the shoulder. A native registration writes an
 * `android` row and `_shared/fcm.ts` sends to it.
 *
 * The two differ in a way that leaks into the shape of this file: a browser
 * knows its permission synchronously and a Capacitor plugin does not, and the
 * token does not arrive from a promise but from an event some time after
 * `register()`. Hence `refreshPushState`, which the screen awaits once on
 * mount.
 */

const native = (): boolean => Capacitor.isNativePlatform();

/*
  The last answer the plugin gave, so `pushState()` can stay synchronous for
  the screen that reads it as a lazy initial value. It is only ever a cache —
  `refreshPushState` is what actually asks.
*/
let nativeState: PushState = 'off';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState =
  | 'unsupported'
  /** iOS, in a browser tab. Add to Home Screen first. */
  | 'needs-install'
  | 'denied'
  | 'off'
  | 'on';

export function pushState(): PushState {
  if (native()) return nativeState;

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

/**
 * The real answer, which on native has to be awaited.
 *
 * Also quietly re-registers when permission is already granted. A registration
 * token is not forever — it changes when the app is reinstalled or its data is
 * cleared — and without this the switch would say On while the server held a
 * token belonging to an app that no longer exists. Silent because the person
 * already said yes; this is bookkeeping, not a second ask.
 */
export async function refreshPushState(profileId?: string): Promise<PushState> {
  if (!native()) return pushState();

  try {
    const { receive } = await PushNotifications.checkPermissions();
    nativeState = receive === 'granted' ? 'on' : receive === 'denied' ? 'denied' : 'off';
  } catch {
    nativeState = 'unsupported';
    return nativeState;
  }

  if (nativeState === 'on' && profileId) await storeNativeToken(profileId);
  return nativeState;
}

/**
 * Registers with FCM and writes the token down.
 *
 * The token arrives on an event rather than from the promise `register()`
 * returns, so this waits for one of three things: the token, a registration
 * error, or ten seconds. The timeout matters — a device with no Play Services
 * fires neither event, and without it the switch would spin forever.
 */
async function storeNativeToken(profileId: string): Promise<{ error: string | null }> {
  await PushNotifications.removeAllListeners();

  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    void PushNotifications.addListener('registration', (t) => finish(t.value));
    void PushNotifications.addListener('registrationError', () => finish(null));
    void PushNotifications.register();

    setTimeout(() => finish(null), 10_000);
  });

  await PushNotifications.removeAllListeners();
  if (!token) return { error: 'This phone could not register for notifications.' };

  const { error } = await supabase.from('push_tokens').upsert(
    {
      profile_id: profileId,
      platform: 'android',
      token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,token' },
  );

  return { error: error?.message ?? null };
}

/** Asks, subscribes, and stores the subscription against this profile. */
export async function enablePush(profileId: string): Promise<{ error: string | null }> {
  if (native()) {
    /*
      Android 13 and up need POST_NOTIFICATIONS at runtime, and this is the
      prompt for it. Below 13 it resolves granted without showing anything.
    */
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') {
      nativeState = receive === 'denied' ? 'denied' : 'off';
      return { error: 'Notifications are off. You can turn them on in Android settings.' };
    }

    const result = await storeNativeToken(profileId);
    nativeState = result.error ? 'off' : 'on';
    return result;
  }

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
  if (native()) {
    /*
      The row goes and the registration stays. There is no un-register in the
      plugin, and there does not need to be: a device nothing is addressed to
      receives nothing. Android's own switch is the other half, and it is the
      one people actually look for.
    */
    await supabase.from('push_tokens').delete().eq('profile_id', profileId).eq('platform', 'android');
    nativeState = 'off';
    return;
  }

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
