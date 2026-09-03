import { supabase } from '../lib/supabase.ts';

/**
 * The two photographs taken inside today's twenty minutes.
 *
 * Uses the `photos` bucket and the same shrink-then-upload path a snap does,
 * exactly as intended: this is a new prompt and a new way of showing two
 * pictures, not new infrastructure. The only thing that is different is the
 * table, which exists so the reveal can be a policy.
 *
 * Nothing here knows which prompt today is or when it opens — that is
 * `momentForDay` in `packages/core`, derived on both phones from the couple id
 * and the date.
 */

export interface MomentShot {
  id: string;
  author_id: string;
  local_date: string;
  prompt: string;
  storage_path: string;
  created_at: string;
  kept: boolean;
}

/**
 * Today's shots, which is either nothing, only yours, or both.
 *
 * Never "only theirs": the read policy hides the other person's row until you
 * have one, so a single row coming back always means it is yours.
 */
export async function shotsForDay(coupleId: string, localDate: string): Promise<MomentShot[]> {
  const { data, error } = await supabase
    .from('moment_shots')
    .select('id, author_id, local_date, prompt, storage_path, created_at, kept')
    .eq('couple_id', coupleId)
    .eq('local_date', localDate)
    .order('created_at', { ascending: true });

  if (error) console.warn('[moment] read:', error.message);
  return (data as MomentShot[] | null) ?? [];
}

export async function takeShot(
  coupleId: string,
  authorId: string,
  localDate: string,
  prompt: string,
  blob: Blob,
): Promise<{ error: string | null }> {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${coupleId}/${crypto.randomUUID()}.${extension}`;

  const upload = await supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (upload.error) return { error: upload.error.message };

  const { error } = await supabase.from('moment_shots').insert({
    couple_id: coupleId,
    author_id: authorId,
    local_date: localDate,
    prompt,
    storage_path: path,
  });

  if (error) {
    // Orphaned object, otherwise: nothing references it and nothing can reach
    // it, and it costs storage forever.
    await supabase.storage.from('photos').remove([path]);

    // 23505 is the one-each-per-day index. Worth saying plainly rather than
    // showing a constraint name — it means they already took today's.
    return {
      error:
        error.code === '23505'
          ? 'You already took one today. There is one each.'
          : error.message,
    };
  }

  return { error: null };
}

/** Either partner may keep a moment, the same way either may keep a snap. */
export async function keepShot(coupleId: string, localDate: string, kept: boolean): Promise<void> {
  await supabase
    .from('moment_shots')
    .update({ kept })
    .eq('couple_id', coupleId)
    .eq('local_date', localDate);
}

/**
 * Every day where both of them took one, newest first.
 *
 * For the recap, and for anywhere else that wants the finished pairs. Days with
 * one shot are left out rather than shown half-finished: a diptych with one
 * side missing is a picture of somebody being stood up.
 */
export async function completedMoments(
  coupleId: string,
  from: string,
  to: string,
): Promise<Map<string, MomentShot[]>> {
  const { data, error } = await supabase
    .from('moment_shots')
    .select('id, author_id, local_date, prompt, storage_path, created_at, kept')
    .eq('couple_id', coupleId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: false });

  if (error) console.warn('[moment] range:', error.message);

  const byDay = new Map<string, MomentShot[]>();
  for (const shot of (data as MomentShot[] | null) ?? []) {
    byDay.set(shot.local_date, [...(byDay.get(shot.local_date) ?? []), shot]);
  }

  for (const [day, shots] of byDay) if (shots.length < 2) byDay.delete(day);
  return byDay;
}
