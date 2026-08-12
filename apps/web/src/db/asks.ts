import { supabase } from '../lib/supabase.ts';

/**
 * Questions one of you wrote.
 *
 * Every app in this category ships a fixed deck, and the question you actually
 * want to ask is rarely in it. These reuse the entire daily-loop machinery — the
 * prompt day, the answers, the reveal that waits for both of you — by simply
 * being a prompt with an author and a couple.
 */

export interface Ask {
  id: string;
  body: string;
  author_id: string;
}

export async function askQuestion(input: {
  coupleId: string;
  authorId: string;
  body: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prompts')
    .insert({
      body: input.body.trim(),
      pack: 'ours',
      kind: 'conversation',
      couple_id: input.coupleId,
      author_id: input.authorId,
    })
    .select('id')
    .single();

  return { id: data?.id ?? null, error: error?.message ?? null };
}

export async function ourQuestions(coupleId: string): Promise<Ask[]> {
  const { data } = await supabase
    .from('prompts')
    .select('id, body, author_id')
    .eq('couple_id', coupleId)
    .order('id');

  return (data as Ask[] | null) ?? [];
}

export async function unaskQuestion(id: string): Promise<void> {
  await supabase.from('prompts').delete().eq('id', id);
}

/**
 * Puts one of your own questions in front of the pair today, in place of the
 * pack question.
 *
 * Upserted on the day's deterministic id, so asking twice replaces rather than
 * duplicates — and so it works even if the other person's device created the
 * day's row first.
 */
export async function askToday(input: {
  coupleId: string;
  promptDayId: string;
  promptId: string;
  localDate: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('prompt_days').upsert(
    {
      id: input.promptDayId,
      couple_id: input.coupleId,
      prompt_id: input.promptId,
      local_date: input.localDate,
    },
    { onConflict: 'id' },
  );

  return { error: error?.message ?? null };
}
