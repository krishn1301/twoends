import type { Visit } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * A time the two of them were in the same place.
 *
 * Started by a person, or by a countdown they set themselves reaching zero and
 * then being confirmed. **Never by GPS** — location here is coarse, opt-in and
 * can be hours stale, and an interface that flips itself on a signal like that
 * fails silently and recovers confusingly.
 */

/** The one that is happening now, if there is one. */
export async function openVisit(coupleId: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, started_at, ended_at, place_label')
    .eq('couple_id', coupleId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) console.warn('[visit] open:', error.message);
  return (data as Visit | null) ?? null;
}

/** Every visit that has finished, newest first. */
export async function pastVisits(coupleId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, started_at, ended_at, place_label')
    .eq('couple_id', coupleId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });

  if (error) console.warn('[visit] past:', error.message);
  return (data as Visit[] | null) ?? [];
}

export async function startVisit(
  coupleId: string,
  place: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('visits').insert({
    couple_id: coupleId,
    place_label: place?.trim() || null,
  });

  /*
    23505 is the one-open-visit index, which means the other person started it
    first — a race between two people in the same room pressing the same button,
    which is exactly the situation this feature is for. Not an error.
  */
  if (error && error.code !== '23505') return { error: error.message };
  return { error: null };
}

/**
 * Ends it, and returns what it was so the caller can say so.
 *
 * Either of them can, deliberately: they arrived together and they leave
 * together, and a visit only its starter could close would strand the app in
 * the wrong state on the morning that person's phone was flat.
 */
export async function endVisit(visit: Visit): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('visits')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', visit.id)
    .is('ended_at', null);

  return { error: error?.message ?? null };
}

/** Naming the place afterwards, which most people will only think of later. */
export async function nameVisit(visitId: string, place: string): Promise<void> {
  await supabase
    .from('visits')
    .update({ place_label: place.trim() || null })
    .eq('id', visitId);
}

/**
 * The photographs taken while a visit was happening.
 *
 * Joined by timestamp rather than by a foreign key on `photos`. One index does
 * the work, and it means the boundaries of a visit can be corrected afterwards
 * — somebody who taps "we're together" the morning after they landed — without
 * rewriting a single photo row. A key would freeze the first guess.
 */
export async function visitPhotos(
  coupleId: string,
  visit: Visit,
): Promise<{ id: string; storage_path: string; caption: string | null; author_id: string }[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, caption, author_id')
    .eq('couple_id', coupleId)
    .gte('created_at', visit.started_at)
    .lte('created_at', visit.ended_at ?? new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) console.warn('[visit] photos:', error.message);
  return data ?? [];
}
