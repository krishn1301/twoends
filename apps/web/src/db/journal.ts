import { supabase } from '../lib/supabase.ts';

/**
 * Memories.
 *
 * A journal entry is a thing that happened, on a day, optionally somewhere.
 * Countdowns look forward and these look back, which is why they share a screen:
 * between them they are the couple's calendar in both directions.
 *
 * Append-only from the partner's side, enforced by a restrictive policy — you
 * can read what they wrote and never rewrite it.
 */

export interface JournalEntry {
  id: string;
  author_id: string;
  body: string | null;
  place_label: string | null;
  happened_on: string | null;
  created_at: string;
}

export async function addEntry(input: {
  coupleId: string;
  authorId: string;
  body: string;
  placeLabel: string | null;
  happenedOn: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('journal_entries').insert({
    couple_id: input.coupleId,
    author_id: input.authorId,
    body: input.body.trim(),
    place_label: input.placeLabel?.trim() || null,
    // Defaults to today rather than null: an undated memory sorts nowhere and
    // is the one thing nobody can fix later from memory.
    happened_on: input.happenedOn || new Date().toISOString().slice(0, 10),
  });

  return { error: error?.message ?? null };
}

export async function recentEntries(coupleId: string, limit = 50): Promise<JournalEntry[]> {
  const { data } = await supabase
    .from('journal_entries')
    .select('id, author_id, body, place_label, happened_on, created_at')
    .eq('couple_id', coupleId)
    .order('happened_on', { ascending: false })
    .limit(limit);

  return (data as JournalEntry[] | null) ?? [];
}

/** Only your own — the policy refuses anything else, and so does the UI. */
export async function deleteEntry(id: string): Promise<void> {
  await supabase.from('journal_entries').delete().eq('id', id);
}
