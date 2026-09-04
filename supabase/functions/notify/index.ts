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

import { push, type PushSubscriptionJSON } from '../_shared/webpush.ts';

/** What just happened. The only thing the caller gets to choose. */
type Kind = 'answered' | 'snap' | 'drawing' | 'capsule' | 'asked' | 'moment';

const COPY: Record<Kind, (name: string) => { title: string; body: string }> = {
  answered: (name) => ({
    title: `${name} answered`,
    body: 'Write yours to see theirs.',
  }),
  snap: (name) => ({ title: `${name} sent a photo`, body: 'From right now.' }),
  drawing: (name) => ({ title: `${name} drew something`, body: 'On your canvas.' }),
  capsule: (name) => ({ title: `${name} sealed a letter`, body: 'It opens on its day.' }),
  asked: (name) => ({ title: `${name} asked you something`, body: 'Their own question, today.' }),
  /*
    Only the *first* of the day's two photographs sends this, and the client is
    what knows which one that is. An hour that starts silently is an hour the
    other person cannot see — and the second photograph would push the one who
    already went, about a moment they had finished, out of a cap of two a day.
  */
  moment: (name) => ({
    title: `${name} took today's`,
    body: 'You have an hour to take yours.',
  }),
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
    .select('id, member_a, member_b')
    .maybeSingle();

  if (!couple?.member_b) return json({ sent: 0, reason: 'not paired' });

  const partnerId = couple.member_a === auth.user.id ? couple.member_b : couple.member_a;

  /*
    Quiet mode silences everything. Not a preference — a promise.

    Asked of `is_quiet`, which reads the periods, rather than of
    `couples.quiet_until`, which nothing has written since migration 21 and which
    this checked for months while being impossible to set. A guard against a
    column nobody can fill is not a guard.
  */
  const { data: quiet } = await admin.rpc('is_quiet', { p_couple_id: couple.id });
  if (quiet === true) return json({ sent: 0, reason: 'quiet mode' });

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

/*
  The sending half lives in `_shared/webpush.ts` now, because `occasions`
  pushes too and a second copy of a VAPID JWT and an AES-GCM seal is a second
  copy that can be subtly wrong.
*/

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
