import {
  dayState,
  deterministicId,
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
  myAnswer: string | null;
  theirAnswer: string | null;
  theyHaveAnswered: boolean;
  state: DayState;
}

/** Which prompt today is, derived rather than fetched. */
export function todaysPrompt(
  couple: Couple,
  adultEnabled = false,
): {
  prompt: Prompt | null;
  localDate: string;
  promptDayId: string;
} {
  const localDate = localDateIn(couple.day_timezone ?? 'UTC');
  const pack = promptsFor({
    relationshipType: couple.relationship_type,
    adultEnabled,
  });

  return {
    prompt: promptForDay(couple.id, localDate, pack),
    localDate,
    // Both devices compute the same id offline, so neither has to ask the
    // server what today's row is called before writing to it.
    promptDayId: deterministicId(couple.id, localDate),
  };
}

export async function loadToday(
  couple: Couple,
  myId: string,
  adultEnabled = false,
): Promise<Today> {
  const { prompt, localDate, promptDayId } = todaysPrompt(couple, adultEnabled);

  const [answersRes, partnerRes] = await Promise.all([
    supabase.from('answers').select('author_id, body').eq('prompt_day_id', promptDayId),
    supabase.rpc('partner_has_answered', { p_prompt_day_id: promptDayId }),
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

  return {
    promptDayId,
    localDate,
    prompt,
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
  adultEnabled = false,
): Promise<{ error: string | null }> {
  const { prompt, localDate, promptDayId } = todaysPrompt(couple, adultEnabled);
  if (!prompt) return { error: 'No question today.' };

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
