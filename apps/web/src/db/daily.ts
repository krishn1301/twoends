import {
  HER_PACK,
  dayState,
  deterministicId,
  isHerCouple,
  localDateIn,
  promptForDay,
  promptsFor,
  type DayState,
  type Prompt,
} from '@twoends/core';

import { supabase } from '../lib/supabase.ts';
import type { Couple } from '../state/session.ts';

/**
 * Today's question, and answering it.
 *
 * The question itself needs no network: the pack ships in the bundle and both
 * devices derive the same prompt from (couple id, local date). Only the answers
 * travel.
 *
 * The reveal is enforced in Postgres, not here. A restrictive policy hides the
 * partner's row until you have written your own, so this code cannot leak it
 * even if it tried — what arrives is already filtered. That matters because a
 * client-side curtain is not a mechanic; it is a thing anyone can look behind
 * with dev tools.
 */

export interface Today {
  promptDayId: string;
  localDate: string;
  prompt: Prompt | null;
  /** True when one of you wrote today's question rather than the app. */
  isCustom: boolean;
  myAnswer: string | null;
  theirAnswer: string | null;
  theyHaveAnswered: boolean;
  state: DayState;
}

/**
 * Which prompt today is, derived rather than fetched.
 *
 * Everything that narrows the pack is read off the couple, never off the reader.
 * That is not tidiness: `promptForDay` picks by index, so two devices building
 * different lists get different questions on the same morning and neither answer
 * ever unlocks the other — no error anywhere, and the failure is invisible to
 * whichever of them looks first.
 *
 * `adultEnabled` used to be a parameter here with a default of false. Every
 * caller left it at the default, which is how six prompts shipped to every
 * device for eleven phases and were served to nobody.
 */
export function todaysPrompt(couple: Couple): {
  prompt: Prompt | null;
  localDate: string;
  promptDayId: string;
} {
  const localDate = localDateIn(couple.day_timezone ?? 'UTC');
  const pack = promptsFor({
    relationshipType: couple.relationship_type,
    /*
      The server's answer, not ours. `couples.adult_packs_enabled` is derived by
      a trigger from both members' opt-in timestamps, so both phones read one
      value out of one row rather than each computing it from two profiles and
      risking a disagreement.
    */
    adultEnabled: couple.adult_packs_enabled,
    /*
      Read off the couple row rather than off whoever is holding the phone. Both
      devices have the same two member ids, so both build the same list and both
      derive the same question — which is the only reason the reveal works at
      all. See the note on `promptsFor`.
    */
    hasHer: isHerCouple(couple.member_a, couple.member_b),
  });

  return {
    prompt: promptForDay(couple.id, localDate, pack),
    localDate,
    // Both devices compute the same id offline, so neither has to ask the
    // server what today's row is called before writing to it.
    promptDayId: deterministicId(couple.id, localDate),
  };
}

export async function loadToday(couple: Couple, myId: string): Promise<Today> {
  const { prompt, localDate, promptDayId } = todaysPrompt(couple);

  const [answersRes, partnerRes, dayRes] = await Promise.all([
    supabase.from('answers').select('author_id, body').eq('prompt_day_id', promptDayId),
    supabase.rpc('partner_has_answered', { p_prompt_day_id: promptDayId }),
    /*
      If a row exists for today it wins over the derived pack question — that is
      how a question one of you wrote replaces the app's own. The derivation is
      the default, not the authority.
    */
    supabase
      .from('prompt_days')
      .select('prompt_id, prompts(id, body, pack, is_adult)')
      .eq('id', promptDayId)
      .maybeSingle(),
  ]);

  const rows = answersRes.data ?? [];
  const mine = rows.find((r) => r.author_id === myId)?.body ?? null;
  const theirs = rows.find((r) => r.author_id !== myId)?.body ?? null;

  /*
    `theyHaveAnswered` comes from a function, not from the rows: until you have
    answered, their row is invisible to you by policy, so counting rows would
    always say "no" and the screen would never be able to say "your move".
  */
  const theyHaveAnswered = partnerRes.data === true;

  const asked = dayRes.data?.prompts as
    { id: string; body: string; pack: string; is_adult: boolean } | null | undefined;

  return {
    promptDayId,
    localDate,
    prompt: asked
      ? { id: asked.id, body: asked.body, pack: asked.pack, isAdult: asked.is_adult }
      : prompt,
    isCustom: asked ? asked.pack === 'ours' : false,
    myAnswer: mine,
    theirAnswer: theirs,
    theyHaveAnswered,
    state: dayState(mine !== null, theyHaveAnswered),
  };
}

/**
 * Writes an answer, creating the day's row if this is the first of the two.
 *
 * Not queued through the outbox. Everything else in the app can be written
 * offline and reconciled later, but this cannot: the answer's whole meaning is
 * that it unlocks the other person's, and "you answered two hours ago but they
 * still cannot see it" is a worse experience than "this needs a connection".
 * Phase 5 revisits it once the media pipeline settles.
 */
export async function submitAnswer(
  couple: Couple,
  myId: string,
  body: string,
): Promise<{ error: string | null }> {
  const { prompt: derived, localDate, promptDayId } = todaysPrompt(couple);

  // An existing row means someone asked their own question today; do not
  // overwrite it with the pack's.
  const existing = await supabase
    .from('prompt_days')
    .select('prompt_id')
    .eq('id', promptDayId)
    .maybeSingle();

  const prompt = existing.data ? { id: existing.data.prompt_id } : derived;
  if (!prompt) return { error: 'No question today.' };

  /*
    A question that ships in the bundle but was never seeded needs its row made
    before anything can point at it. `prompt_days.prompt_id` is
    `references prompts on delete restrict`, so without this the first person to
    answer gets a foreign key violation and the day is simply dead for both of
    them — on a morning chosen to be a good one, which is the worst possible
    time to find out.

    Only the private pack is in this state, and deliberately: seeding it the
    ordinary way would write a null `couple_id`, which migration 11 makes
    readable by every signed-in user. Written couple-scoped instead, so the row
    is covered by "read our own questions" and genuinely is theirs — the policy
    doing the work the hash only pretends to.

    `author_id` has to be the caller because the insert policy demands it. It is
    never displayed: `isCustom` keys on the pack, not the author, so this still
    reads as a question the app asked rather than one of them wrote.
  */
  if (!existing.data && derived && derived.pack === HER_PACK) {
    const seeded = await supabase.from('prompts').upsert(
      {
        id: derived.id,
        body: derived.body,
        pack: derived.pack,
        is_adult: derived.isAdult,
        couple_id: couple.id,
        author_id: myId,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (seeded.error) return { error: seeded.error.message };
  }

  // Idempotent: whoever answers first creates the row, and the second person's
  // identical insert is ignored rather than failing.
  const day = await supabase.from('prompt_days').upsert(
    {
      id: promptDayId,
      couple_id: couple.id,
      prompt_id: prompt.id,
      local_date: localDate,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (day.error) return { error: day.error.message };

  const { error } = await supabase.from('answers').upsert(
    {
      couple_id: couple.id,
      prompt_day_id: promptDayId,
      author_id: myId,
      body: body.trim(),
    },
    { onConflict: 'prompt_day_id,author_id' },
  );

  return { error: error?.message ?? null };
}

/** Dates where both partners answered — the input to the streak. */
export async function completedDays(coupleId: string): Promise<string[]> {
  const { data } = await supabase
    .from('prompt_days')
    .select('local_date, answers(author_id)')
    .eq('couple_id', coupleId);

  return (data ?? [])
    .filter((row) => {
      const authors = new Set((row.answers as { author_id: string }[]).map((a) => a.author_id));
      return authors.size >= 2;
    })
    .map((row) => row.local_date);
}
