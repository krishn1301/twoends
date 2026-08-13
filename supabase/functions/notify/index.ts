/**
 * Sends a push to the *other* person.
 *
 * Called by the client immediately after an action succeeds — you answered, you
 * sent a snap, you drew something. The sender is provably online at that moment,
 * which is why this needs no queue, no cron and no database trigger: three
 * things that would each be another thing to fail quietly on a free tier.
 *
 * The caller says what happened, never who to tell or what to say. It cannot
 * name a recipient, cannot supply a body, and cannot push to itself. Everything
 * a push contains is decided here, from the couple the caller actually belongs
 * to — a client that could choose the recipient is a client that could spam a
 * stranger's lock screen.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** What just happened. The only thing the caller gets to choose. */
type Kind = 'answered' | 'snap' | 'drawing' | 'capsule' | 'asked';

const COPY: Record<Kind, (name: string) => { title: string; body: string }> = {
  answered: (name) => ({
    title: `${name} answered`,
    body: 'Write yours to see theirs.',
  }),
  snap: (name) => ({ title: `${name} sent a photo`, body: 'From right now.' }),
  drawing: (name) => ({ title: `${name} drew something`, body: 'On your canvas.' }),
  capsule: (name) => ({ title: `${name} sealed a letter`, body: 'It opens on its day.' }),
  asked: (name) => ({ title: `${name} asked you something`, body: 'Their own question, today.' }),
};

/**
 * Two pushes per person per day, hard cap.
 *
 * From the build plan, and it is a product rule rather than a technical one: a
 * relationship app that pushes guilt is a product failure. The cap is counted
 * here rather than trusted to the client, because the client is the thing most
 * likely to loop.
 */
const DAILY_CAP = 2;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Who is calling, established from their own token rather than from the body.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'unauthorized' }, 401);

  const { kind } = (await req.json().catch(() => ({}))) as { kind?: Kind };
  if (!kind || !(kind in COPY)) return json({ error: 'unknown kind' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // The couple, read as the caller — so this can only ever act on their own.
  const { data: couple } = await caller
    .from('couples')
    .select('id, member_a, member_b, quiet_until')
    .maybeSingle();

  if (!couple?.member_b) return json({ sent: 0, reason: 'not paired' });

  const partnerId = couple.member_a === auth.user.id ? couple.member_b : couple.member_a;

  // Quiet mode silences everything. Not a preference — a promise.
  if (couple.quiet_until && new Date(couple.quiet_until) >= new Date()) {
    return json({ sent: 0, reason: 'quiet mode' });
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('push_log')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', partnerId)
    .gte('sent_at', since);

  if ((count ?? 0) >= DAILY_CAP) return json({ sent: 0, reason: 'daily cap' });

  const { data: sender } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  const { data: tokens } = await admin
    .from('push_tokens')
    .select('id, token')
    .eq('profile_id', partnerId)
    .eq('platform', 'web');

  if (!tokens?.length) return json({ sent: 0, reason: 'no devices' });

  const message = COPY[kind](sender?.display_name ?? 'They');
  let sent = 0;

  for (const row of tokens) {
    const subscription = JSON.parse(row.token) as PushSubscriptionJSON;
    const ok = await push(subscription, message);

    if (ok) sent++;
    // A subscription the browser has revoked is gone for good; leaving it would
    // mean retrying a dead endpoint on every action forever.
    else await admin.from('push_tokens').delete().eq('id', row.id);
  }

  if (sent > 0) {
    await admin.from('push_log').insert({ profile_id: partnerId, kind });
  }

  return json({ sent });
});

interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Web Push, by hand.
 *
 * A library would be shorter, but the payload here is a title and one line, and
 * the whole encryption dance is a JWT plus an AES-GCM seal. Pulling a dependency
 * into an edge function for that is a supply-chain risk and a cold-start cost
 * for something the platform already provides primitives for.
 */
async function push(
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
