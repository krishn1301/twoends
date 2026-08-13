import { supabase } from '../lib/supabase.ts';

/**
 * Unpairing, which means deleting.
 *
 * "Unpair means delete" is one of the load-bearing promises in
 * docs/PRIVACY.md, and the whole reason it takes two people is that the other
 * kind — one partner wiping a shared life on a bad evening — is exactly the
 * threat this app is designed against. So: one asks, the other confirms, and
 * either can call it off until then. The rule lives in `confirm_unpair()`,
 * which refuses the person who asked.
 *
 * The ordering here matters and is easy to get wrong. Storage objects are not
 * reached by the couple row's cascade, and the storage policies stop matching
 * the moment the couple is gone — so the files must be deleted *first*, while
 * there is still permission to touch them. Delete the row first and every photo
 * becomes an orphan nobody can reach or remove, including the people who own it.
 */

const BUCKETS = ['photos', 'covers'] as const;

export type UnpairState =
  | { kind: 'none' }
  /** You asked. Nothing happens until they confirm. */
  | { kind: 'waiting' }
  /** They asked. The confirm button is yours. */
  | { kind: 'asked' };

export function unpairState(
  requestedBy: string | null | undefined,
  myId: string | null | undefined,
): UnpairState {
  if (!requestedBy) return { kind: 'none' };
  return requestedBy === myId ? { kind: 'waiting' } : { kind: 'asked' };
}

export async function requestUnpair(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('request_unpair');
  return { error: error?.message ?? null };
}

export async function cancelUnpair(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_unpair');
  return { error: error?.message ?? null };
}

/**
 * Deletes the shared life, then checks that it is gone.
 *
 * The verification is not ceremony. A delete promise that has never been
 * checked is a delete promise nobody knows the truth of, and the failure mode —
 * a cascade that silently missed a table — looks identical to success from the
 * app's side.
 */
export async function confirmUnpair(
  coupleId: string,
  onProgress?: (step: string) => void,
): Promise<{ error: string | null; leftover: string[] }> {
  onProgress?.('Deleting photos');

  for (const bucket of BUCKETS) {
    const { data: files } = await supabase.storage.from(bucket).list(coupleId, { limit: 1000 });
    const paths = (files ?? []).map((file) => `${coupleId}/${file.name}`);
    if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
  }

  onProgress?.('Deleting everything else');
  const { error } = await supabase.rpc('confirm_unpair');
  if (error) return { error: friendly(error.message), leftover: [] };

  onProgress?.('Checking nothing survived');
  return { error: null, leftover: await leftovers(coupleId) };
}

/**
 * Asks the server what it still holds.
 *
 * Runs as the ordinary user, after the couple is gone — so row-level security
 * is now the thing being tested as much as the cascade is. Anything that comes
 * back is a real leak and the app says so rather than claiming success.
 */
async function leftovers(coupleId: string): Promise<string[]> {
  const tables = [
    'answers',
    'canvases',
    'photos',
    'countdowns',
    'journal_entries',
    'list_items',
    'capsules',
    'prompt_days',
    'streaks',
    'game_picks',
  ] as const;

  const found: string[] = [];
  for (const table of tables) {
    const { data } = await supabase.from(table).select('id').eq('couple_id', coupleId).limit(1);
    if ((data?.length ?? 0) > 0) found.push(table);
  }

  for (const bucket of BUCKETS) {
    const { data } = await supabase.storage.from(bucket).list(coupleId, { limit: 1 });
    if ((data?.length ?? 0) > 0) found.push(`storage/${bucket}`);
  }

  /*
    Checked separately, because it is keyed on profile_id and so does not appear
    in any sweep by couple_id — which is exactly how a coordinate survived a
    delete that reported success. `confirm_unpair` clears it now, and this is
    the client-side half of noticing if that ever stops being true.

    Only my own row is readable here; the partner's became unreadable the moment
    the couple went, which is the point.
  */
  const { data: mine } = await supabase.from('presence').select('lat').not('lat', 'is', null);
  if ((mine?.length ?? 0) > 0) found.push('presence');

  return found;
}

/** The RPCs raise machine names on purpose; this is where they become English. */
function friendly(message: string): string {
  if (message.includes('partner_must_confirm')) {
    return 'You asked for this — it has to be the other one of you who confirms.';
  }
  if (message.includes('no_unpair_requested')) {
    return 'Nobody has asked to unpair, or it was called off.';
  }
  if (message.includes('not_paired')) return 'There is nobody to unpair from.';
  return message;
}
