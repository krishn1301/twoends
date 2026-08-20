import type { QuietPeriod } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * Asking to be left alone for a while.
 *
 * Either of them may turn it on and either may turn it off. That is deliberate
 * and different from the 18+ opt-in, where consent belongs to a person: this is
 * something done to the pair rather than to the other one, and a hush that
 * needed both of you to agree before it could start would be no use on the week
 * you actually needed it.
 *
 * Straight to Supabase rather than through the outbox. What quiet mode does is
 * stop the *server* sending things, so a request queued on a phone with no
 * signal has not turned anything off.
 */

export async function loadQuiet(coupleId: string): Promise<QuietPeriod[]> {
  const { data, error } = await supabase
    .from('quiet_periods')
    .select('from_date, to_date')
    .eq('couple_id', coupleId)
    .order('from_date', { ascending: true });

  // Printed rather than swallowed. An empty result and a failed query look
  // identical from here, and the difference is whether a streak is about to
  // break for a week somebody asked to be excused from.
  if (error) console.warn('quiet periods did not load:', error.message);

  return (data as QuietPeriod[] | null) ?? [];
}

/**
 * Starts today.
 *
 * Today rather than tomorrow, because somebody reaching for this has had the
 * kind of day that made them reach for it, and telling them the silence begins
 * in the morning misses the point of asking.
 */
export async function startQuiet(
  coupleId: string,
  today: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('quiet_periods')
    .insert({ couple_id: coupleId, from_date: today, to_date: null });

  // A unique index allows one open period per couple, so turning it on twice is
  // turning it on once. Not an error worth showing anybody.
  if (error?.code === '23505') return { error: null };
  return { error: error?.message ?? null };
}

/**
 * Ends it, today included.
 *
 * `to_date` is today rather than yesterday: the day you switch it off was still
 * a day you had asked to be left out of, and closing it behind you would take
 * that morning back.
 */
export async function endQuiet(
  coupleId: string,
  today: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('quiet_periods')
    .update({ to_date: today })
    .eq('couple_id', coupleId)
    .is('to_date', null);

  return { error: error?.message ?? null };
}
