/**
 * Firebase Cloud Messaging, by hand — the other half of `webpush.ts`.
 *
 * The APK could never receive a notification. Android's WebView exposes no
 * Notification API to an installed Capacitor app, so the one build with
 * home-screen widgets was the one build that could not tap you on the shoulder.
 * Web Push cannot fix that: it is a browser API and there is no browser.
 *
 * So there are two transports now, and the row says which. `push_tokens` has
 * carried a `platform` column since migration 1 — `'web'` holds a serialised
 * PushSubscription, `'android'` holds a bare FCM registration token — and the
 * two functions that push branch on it.
 *
 * Written out rather than pulled in, for the same reasons `webpush.ts` gives:
 * the whole of it is a signed JWT, a token exchange and one POST, and the
 * `firebase-admin` SDK is a very large dependency to cold-start an edge
 * function with for that. Nothing here needs the rest of Firebase.
 */
import type { PushResult } from './webpush.ts';

/**
 * The service account, as JSON, in one secret.
 *
 * `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat key.json)"`. It is the whole
 * downloaded file rather than three separate secrets because Google rotates it
 * as a unit and a half-updated credential fails in a way nobody would read
 * correctly.
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function account(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

/** Whether this deployment can send to Android at all. */
export const fcmConfigured = (): boolean => account() !== null;

/*
  One access token, reused until it expires.

  An edge function instance serves many requests, and exchanging a JWT for a
  bearer token on every push would double the latency and the quota for no
  reason. Held in module scope, refreshed a minute early so a token cannot go
  stale between the check and the call.
*/
let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cached && Date.now() < cached.expires) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  let signature: string;
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signed = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    signature = b64urlBytes(new Uint8Array(signed));
  } catch {
    // A malformed private key. Nothing retriable, and nothing to say to the
    // caller that is not already true: the device did not get it.
    return null;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;

  cached = {
    token: body.access_token,
    expires: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  };
  return cached.token;
}

/**
 * Sends one message to one Android device.
 *
 * Shares `PushResult` with web push so the callers need no second rule. The
 * distinction matters most here: until the service account is set this returns
 * `failed`, never `gone`, so a deployment that has not been configured yet
 * cannot quietly de-register every Android device it was meant to reach.
 */
export async function pushAndroid(
  token: string,
  message: { title: string; body: string },
): Promise<PushResult> {
  const sa = account();
  if (!sa) return 'failed';

  const bearer = await accessToken(sa);
  if (!bearer) return 'failed';

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            /*
              A `notification` block rather than `data`, deliberately. It makes
              Android draw the notification itself, which is the only way it
              appears when the app is not running — and an app that has to be
              open to tell you something has not told you anything.
            */
            notification: { title: message.title, body: message.body },
            android: {
              priority: 'high',
              notification: {
                // The monochrome status-bar icon the widgets already ship.
                icon: 'ic_stat_icon',
                // One line, one couple: a second push replaces the first
                // rather than stacking a column of them.
                tag: 'twoends',
              },
            },
          },
        }),
      },
    );

    if (response.ok) return 'sent';

    /*
      404 and 403 mean this registration is gone — the app was uninstalled, or
      cleared its data, or the token was rotated. Same meaning as web push's
      404/410, so the caller deletes the row either way and stops retrying a
      dead device forever.
    */
    if (response.status === 404 || response.status === 403) return 'gone';

    return 'failed';
  } catch {
    return 'failed';
  }
}

/** PEM to the raw DER bytes `importKey` wants. */
function pkcs8(pem: string): Uint8Array {
  const body = pem
    // The secret arrives as JSON, so its newlines may still be escaped.
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const b64url = (text: string): string => b64urlBytes(new TextEncoder().encode(text));

function b64urlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
