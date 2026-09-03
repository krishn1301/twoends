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
  momentForDay,
  pendingWindows,
  occasionCopy,
  occasionFor,
  occasionHeadline,
  fillsTheScreen,
  worthShowing,
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
    .select('id, member_a, member_b, started_on, day_timezone, together');

  let sent = 0;
  let considered = 0;
  const would: { to: string; title: string }[] = [];

  for (const couple of couples ?? []) {
    if (!couple.member_b) continue;

    const zone = couple.day_timezone ?? 'UTC';
    const localHour = hourIn(zone, now);
    const localDate = localDateIn(zone, now);

    /*
      Two things can want this hour, and they are not the same hour.

      The occasion card goes at nine. The shared moment goes at an hour derived
      from the couple id and the date — deliberately not nine, deliberately not
      the same for two couples — and it is only twenty minutes long, so a push
      an hour late is a push about something that has already closed. Gating on
      either lets one function serve both without a second cron.
    */
    const moment = momentForDay(couple.id, localDate);
    const momentHour = moment?.hour ?? -1;
    if (localHour !== HOUR && localHour !== momentHour) continue;

    considered++;

    /*
      Quiet mode silences everything, including this. Asked of `is_quiet`, which
      reads the periods, rather than of `couples.quiet_until` — nothing has
      written that column since migration 21, and a guard against a column
      nobody can fill is not a guard.

      After the hour gate rather than before it. This is a round trip per couple
      and the gate throws away twenty-three hours in twenty-four for nothing.

      Given their own local date, not the server's: a hush that lifted yesterday
      where they live should not still be silencing them.
    */
    const { data: quiet } = await admin.rpc('is_quiet', {
      p_couple_id: couple.id,
      p_on: localDate,
    });
    if (quiet === true) continue;

    /*
      The twenty minutes opening.

      Sent to both, once, and only in the hour it opens — this is the one
      notification in the app that is useless late, because the thing it is
      about is gone twenty minutes after it starts. Logged per person per day
      like everything else, so a scheduler firing twice cannot double it.
    */
    /*
      Quieter while they are in the same place.

      The spec asks for at most one notification a day during a visit, and the
      one worth keeping is the occasion — a birthday matters whoever is in the
      room. The moment is the one that goes: asking two people sitting together
      to each photograph the nearest window is a game they can play by talking,
      and a phone buzzing twice in a house where both phones are is the app
      failing to notice where it is.
    */
    if (localHour === momentHour && moment && !couple.together) {
      await pushMoment(admin, couple, moment.prompt, localDate, dryRun, would);
      if (localHour !== HOUR) continue;
    }

    /*
      The month, if today closed one.

      Folded into this function rather than given a cron of its own, and that is
      the whole reason it is here: the monthly anniversary already sends a push,
      and a recap with its own schedule would make two arrive on the same
      morning. The spec asks for one. So the recap is made first and the
      notification that was going out anyway says what is in it.

      The app does this too, when somebody opens Dates. Neither is the owner of
      it; the unique index is, and the loser of the race is a no-op.
    */
    const madeRecap = await ensureRecap(admin, couple, localDate, dryRun);

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
        /*
          The month replaces the line rather than adding to it. Two sentences
          about two different things in one notification is how a push stops
          being read at all, and the recap is the more useful of the two on a
          morning that has one.
        */
        body: madeRecap && occasion.kind === 'monthly' ? RECAP_LINE : copy.line,
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

/**
 * What the monthly push says when there is a month waiting.
 *
 * Restrained on purpose, like everything else the app writes: it says what
 * exists and where, and leaves the feeling to the two of them.
 */
const RECAP_LINE = 'The month is ready to look at, in Dates.';

/**
 * Makes the recap for a window that closed today, if there is one worth making.
 *
 * A near-copy of what `db/recap.ts` does in the app, and deliberately not
 * shared with it: that file speaks to PostgREST through the browser client and
 * this one holds a service key, so the only thing they could usefully share is
 * the arithmetic — and they do, through `nextRecapWindow` and `worthShowing`
 * in `packages/core`. The rule about when a month turns has exactly one home.
 *
 * Returns true only when a row was actually written, so a morning that made
 * nothing sends the ordinary monthly line.
 */
async function ensureRecap(
  admin: ReturnType<typeof createClient>,
  couple: { id: string; started_on: string | null },
  localDate: string,
  dryRun: boolean,
): Promise<boolean> {
  if (!couple.started_on) return false;

  const { data: last } = await admin
    .from('recaps')
    .select('to_date')
    .eq('couple_id', couple.id)
    .order('to_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  /*
    The window that *ends today*, which is not always the earliest pending one:
    if the months before this were too thin to close, today's window reaches
    back past them. Asking only about the head would mean a couple with a quiet
    first month never got a notification at all.
  */
  const window = pendingWindows(couple.started_on, localDate, last?.to_date ?? null).find(
    (candidate) => candidate.to === localDate,
  );

  // Only on the day it closes. One that came due while nobody opened the app is
  // the app's to make when somebody next does — this function is a
  // notification, and one arriving four days late is worse than none.
  if (!window) return false;

  const from = `${window.from}T00:00:00.000Z`;
  const to = `${window.to}T23:59:59.999Z`;

  const counts = await Promise.all([
    countIn(admin, 'photos', couple.id, 'created_at', from, to),
    countIn(admin, 'canvases', couple.id, 'created_at', from, to),
    countIn(admin, 'capsules', couple.id, 'deliver_at', from, to),
    countIn(admin, 'countdowns', couple.id, 'target_at', from, to),
    countIn(admin, 'prompt_days', couple.id, 'local_date', window.from, window.to),
  ]);

  // A month too thin is not skipped: nothing is written, the period never
  // closes, and the next window covers both.
  if (!worthShowing(counts.reduce((total, n) => total + n, 0))) return false;
  if (dryRun) return true;

  const { error } = await admin.from('recaps').insert({
    couple_id: couple.id,
    month: window.month,
    from_date: window.from,
    to_date: window.to,
  });

  // 23505 means the app got there first, which is a success from here.
  if (error && error.code !== '23505') return false;

  /*
    Claim the photographs. After the row, never before: the other order keeps a
    month of pictures forever on a recap that failed to exist.
  */
  await admin
    .from('photos')
    .update({ kept: true })
    .eq('couple_id', couple.id)
    .gte('created_at', from)
    .lte('created_at', to);

  return true;
}

async function countIn(
  admin: ReturnType<typeof createClient>,
  table: string,
  coupleId: string,
  column: string,
  from: string,
  to: string,
): Promise<number> {
  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', coupleId)
    .gte(column, from)
    .lte(column, to);

  return count ?? 0;
}

/**
 * Tells both of them the twenty minutes have started.
 *
 * The prompt itself is the notification. A title saying "a moment is open" and
 * a body saying what it is would be two sentences for one idea, and the prompt
 * is the more useful half — somebody reading it on a lock screen can take the
 * photograph without opening anything.
 */
async function pushMoment(
  admin: ReturnType<typeof createClient>,
  couple: { id: string; member_a: string; member_b: string | null },
  prompt: string,
  localDate: string,
  dryRun: boolean,
  would: { to: string; title: string }[],
): Promise<void> {
  const kind = `moment:${localDate}`;

  for (const profileId of [couple.member_a, couple.member_b]) {
    if (!profileId) continue;

    const { count } = await admin
      .from('push_log')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('kind', kind);

    if ((count ?? 0) > 0) continue;

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('id, token')
      .eq('profile_id', profileId)
      .eq('platform', 'web');

    if (!tokens?.length) continue;

    const message = { title: 'Twenty minutes', body: prompt };

    if (dryRun) {
      would.push({ to: profileId, title: message.title });
      continue;
    }

    let landed = 0;
    for (const row of tokens) {
      const subscription = JSON.parse(row.token) as PushSubscriptionJSON;
      const ok = await push(subscription, message);
      if (ok) landed++;
      else await admin.from('push_tokens').delete().eq('id', row.id);
    }

    if (landed > 0) await admin.from('push_log').insert({ profile_id: profileId, kind });
  }
}

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
