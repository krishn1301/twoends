/**
 * Web Push, by hand — the sending half, shared by the two functions that push.
 *
 * Extracted from `notify` unchanged when `occasions` needed the same thing. A
 * library would be shorter, but the payload is a title and one line and the
 * whole encryption dance is a JWT plus an AES-GCM seal; pulling a dependency
 * into an edge function for that is a supply-chain risk and a cold-start cost
 * for something the platform already provides primitives for.
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Seals one message for one subscription and posts it. True if it landed. */
export async function push(
  subscription: PushSubscriptionJSON,
  message: { title: string; body: string },
): Promise<boolean> {
  try {
    const endpoint = new URL(subscription.endpoint);
    const jwt = await vapidToken(endpoint.origin);
    const body = await encrypt(JSON.stringify(message), subscription.keys);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${Deno.env.get('VAPID_PUBLIC_KEY')}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
    });

    // 404 and 410 mean the browser dropped this subscription.
    if (response.status === 404 || response.status === 410) return false;
    return response.ok;
  } catch {
    return false;
  }
}

/** The signed assertion that proves this server owns the VAPID key. */
async function vapidToken(audience: string): Promise<string> {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: 'mailto:noreply@twoends.app',
    }),
  );

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: Deno.env.get('VAPID_PRIVATE_KEY')!,
      // A JWK carries the curve points as base64url *strings*, not bytes. The
      // public key is an uncompressed P-256 point: a 0x04 marker then x then y.
      x: b64urlBytes(fromBase64Url(Deno.env.get('VAPID_PUBLIC_KEY')!).slice(1, 33)),
      y: b64urlBytes(fromBase64Url(Deno.env.get('VAPID_PUBLIC_KEY')!).slice(33, 65)),
      ext: true,
    } as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  return `${header}.${claims}.${b64urlBytes(new Uint8Array(signature))}`;
}

/** aes128gcm, per RFC 8291. */
async function encrypt(
  payload: string,
  keys: { p256dh: string; auth: string },
): Promise<Uint8Array> {
  const clientPublic = fromBase64Url(keys.p256dh);
  const authSecret = fromBase64Url(keys.auth);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: await crypto.subtle.importKey(
          'raw',
          clientPublic,
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          [],
        ),
      },
      local.privateKey,
      256,
    ),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await hkdf(
    authSecret,
    shared,
    concat(new TextEncoder().encode('WebPush: info\0'), clientPublic, localPublic),
    32,
  );

  const contentKey = await hkdf(
    salt,
    prk,
    new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
    16,
  );
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const plaintext = concat(new TextEncoder().encode(payload), new Uint8Array([2]));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']),
      plaintext,
    ),
  );

  // Header: salt, record size, key length, key — then the sealed body.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext);
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const b64url = (s: string) => b64urlBytes(new TextEncoder().encode(s));

function b64urlBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

