import { supabase } from '../lib/supabase.ts';

/**
 * Time capsules.
 *
 * Something written now that neither of you can read until a date you choose.
 * The seal is a Postgres policy, not a client decision — a client that receives
 * the text and declines to render it has built a countdown, and anyone with dev
 * tools can read ahead. Knowing you *could* is enough to spoil it.
 *
 * The author cannot read their own back early either. That is not an oversight:
 * a capsule you can reread on a bad Tuesday is just a note.
 */

export interface SealedCapsule {
  deliver_at: string;
  title: string | null;
  author_id: string;
}

export interface OpenCapsule {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  deliver_at: string;
}

export async function sealCapsule(input: {
  coupleId: string;
  authorId: string;
  title: string;
  body: string;
  deliverAt: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('capsules').insert({
    couple_id: input.coupleId,
    author_id: input.authorId,
    title: input.title.trim() || null,
    body: input.body.trim(),
    deliver_at: input.deliverAt,
  });

  return { error: error?.message ?? null };
}

/**
 * The ones that have opened.
 *
 * An ordinary select: the policy already hides everything still sealed, so this
 * cannot accidentally return one early even if the query were wrong.
 */
export async function openedCapsules(coupleId: string): Promise<OpenCapsule[]> {
  const { data } = await supabase
    .from('capsules')
    .select('id, author_id, title, body, deliver_at')
    .eq('couple_id', coupleId)
    .order('deliver_at', { ascending: false });

  return (data as OpenCapsule[] | null) ?? [];
}

/**
 * What is still sealed, and when each one opens.
 *
 * Titles and dates only — the waiting is most of the pleasure, and the app has
 * to be able to say "one opens in November" without leaking a word of it.
 */
export async function sealedCapsules(): Promise<SealedCapsule[]> {
  const { data } = await supabase.rpc('sealed_capsules');
  return (data as SealedCapsule[] | null) ?? [];
}
