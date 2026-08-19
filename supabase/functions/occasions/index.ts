/**
 * Wishing them on the day, without anybody opening the app.
 *
 * The card that takes the screen has always worked and has always had a hole in
 * it: it needs somebody to open the app that morning. On a birthday, the person
 * who does not open it gets nothing — which is the exact opposite of the thing
 * this project is for.
 *
 * So this is the one scheduled thing in the whole backend, and it is worth being
 * uncomfortable about. `notify` deliberately has no cron, no queue and no
 * trigger, because each of those is another thing to fail quietly on a free
 * tier. This one cannot be avoided: a date arriving is not an action anybody
 * takes, so there is nothing to hang it off.
 *
 * **It imports the rule rather than restating it.** `packages/core` has no
 * platform imports — a property enforced by a test since Phase 0 for reasons
 * that had nothing to do with this — and that is exactly what lets Deno run the
 * same `occasionFor` the two phones run. A second copy of "what today is",
 * written in SQL or in Deno, would drift and the first anybody would know is a
 * notification arriving on the wrong morning, once, a year from now.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  localDateIn,
  occasionCopy,
  occasionFor,
  occasionHeadline,
  fillsTheScreen,
} from '../../../packages/core/src/index.ts';
import { push, type PushSubscriptionJSON } from '../_shared/webpush.ts';

/**
 * The hour, in the couple's own timezone, that this is allowed to arrive.
 *
 * Nine, because a thing meant to feel like being thought of should not be the
 * reason a phone lights up at midnight. The job runs hourly and each couple is
 * only acted on in the hour that is nine where they are, which is also how two
 * people in two cities each get it in their own morning rather than in one of
 * theirs.
 */
const HOUR = 9;

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  /*
    Scheduled, so there is no signed-in caller to establish. This endpoint can
    push to anybody, so it has to be unreachable by anything that is not the
    scheduler — and it is checked rather than assumed.

    A secret of its own rather than the service key, for two reasons. The
    platform injects its own `SUPABASE_SERVICE_ROLE_KEY` into the function and
    it is not necessarily the string in `.env.local`, so comparing against it
    fails in a way that looks like a bug in the caller. And a scheduler that
    only needs to say "run" should not be carrying a credential that can read
    every row in the database.
  */
  const secret = Deno.env.get('OCCASIONS_SECRET');
  if (!secret) return json({ error: 'not configured' }, 500);
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${secret}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  /*
    The clock, overridable by the caller — who can only be the scheduler, since
    nothing else gets past the check above.

    Not a backdoor: it is the only way to find out whether this works without
    waiting until nine in the morning on a day that happens to be somebody's
    anniversary. The alternative is editing the date the code checks against,
    which tests the edit rather than the code.
  */
  const body = (await req.json().catch(() => ({}))) as { at?: string; dryRun?: boolean };
  const asked = body.at ? new Date(body.at) : new Date();
  const now = Number.isNaN(asked.getTime()) ? new Date() : asked;

  /*
    Works everything out and sends nothing.

    Added after a test invocation dated on somebody's birthday put a real
    notification on a real phone — and, worse, logged it, which would have
    silenced the genuine one on the genuine morning a year later. The lesson is
    not "be careful with the date"; it is that a function whose only way to be
    exercised is to fire for real will eventually fire for real by accident.

    `at` is deliberately harmless on its own now: anything that reaches a device
    or writes a row needs this to be false, and it defaults to true whenever a
    clock override is supplied.
  */
  const dryRun = body.dryRun ?? body.at != null;

  const { data: couples } = await admin
    .from('couples')
    .select('id, member_a, member_b, started_on, day_timezone, quiet_until');

  let sent = 0;
  let considered = 0;
  const would: { to: string; title: string }[] = [];

  for (const couple of couples ?? []) {
    if (!couple.member_b) continue;

    // Quiet mode silences everything. Not a preference — a promise.
    if (couple.quiet_until && new Date(couple.quiet_until) >= now) continue;

    const zone = couple.day_timezone ?? 'UTC';
    if (hourIn(zone, now) !== HOUR) continue;

    considered++;
    const localDate = localDateIn(zone, now);

    const { data: people } = await admin
      .from('profiles')
      .select('id, display_name, birthday')
      .in('id', [couple.member_a, couple.member_b]);

    if (!people || people.length < 2) continue;

    for (const me of people) {
      const them = people.find((p) => p.id !== me.id)!;

      /*
        Worked out per person, not per couple. A birthday is "yours" to one of
        them and "theirs" to the other, and the two notifications have to say
        different things or one of them reads as a stranger's.
      */
      const occasion = occasionFor({
        startedOn: couple.started_on,
        myBirthday: me.birthday,
        theirBirthday: them.birthday,
        localDate,
      });

      // The minute is sixty seconds long and is never announced — see
      // `fillsTheScreen`. Nothing else here should ever arrive as a push.
      if (!occasion || !fillsTheScreen(occasion.kind)) continue;

      /*
        Once per person per occasion, ever.

        Stronger than the two-a-day cap and the reason this is allowed to skip
        it: the cap protects people from a client that loops, and the thing to
        protect against here is a scheduler that fires twice. An occasion key
        carries its date, so this can be at most one notification on a day that
        is already unusual.
      */
      const kind = `occasion:${occasion.key}`;
      const { count } = await admin
        .from('push_log')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', me.id)
        .eq('kind', kind);

      if ((count ?? 0) > 0) continue;

      const copy = occasionCopy(occasion.kind, occasion.whose);
      // An unwritten line means no card in the app, and it must mean no
      // notification either — a push saying only "One year" with nothing under
      // it is worse than the silence it replaced.
      if (!copy) continue;

      const { data: tokens } = await admin
        .from('push_tokens')
        .select('id, token')
        .eq('profile_id', me.id)
        .eq('platform', 'web');

      if (!tokens?.length) continue;

      const message = {
        title: occasionHeadline(occasion, them.display_name),
        body: copy.line,
      };

      if (dryRun) {
        would.push({ to: me.display_name, title: message.title });
        continue;
      }

      let landed = 0;
      for (const row of tokens) {
        const subscription = JSON.parse(row.token) as PushSubscriptionJSON;
        const ok = await push(subscription, message);
        if (ok) landed++;
        else await admin.from('push_tokens').delete().eq('id', row.id);
      }

      if (landed > 0) {
        await admin.from('push_log').insert({ profile_id: me.id, kind });
        sent++;
      }
    }
  }

  return json(dryRun ? { dryRun: true, considered, would } : { considered, sent });
});

/** The hour of the day where they live, 0–23. */
function hourIn(zone: string, at: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        hour12: false,
      }).format(at),
    );
  } catch {
    // An unknown zone should not stop everybody else's morning.
    return -1;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
