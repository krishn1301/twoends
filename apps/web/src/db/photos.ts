import { supabase } from '../lib/supabase.ts';

/**
 * Snaps: a photograph sent straight to the other person's home screen.
 *
 * Two rules shape everything here.
 *
 * The original never leaves the phone — see `lib/image.ts` for why that is a
 * cost decision rather than a quality one.
 *
 * Every object lives under `<couple_id>/`, because that first path segment is
 * what the storage policies read to decide who may touch it. A file stored
 * anywhere else is not public; it is unreachable, since no policy can match it.
 */

export interface Snap {
  id: string;
  storage_path: string;
  caption: string | null;
  author_id: string;
  created_at: string;
  expires_at: string;
  kept: boolean;
}

/**
 * Uploads an already-shrunk photo.
 *
 * Takes the blob rather than the original file on purpose: the caller shrank it
 * to show a preview, and shrinking again here would decode and re-encode the
 * same pixels a second time — slow on an old phone, and a second chance for the
 * encoder to do something surprising.
 */
export async function uploadSnap(
  coupleId: string,
  authorId: string,
  blob: Blob,
  caption: string | null,
): Promise<{ error: string | null }> {
  // Derived from what was actually produced, not from what was asked for.
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${coupleId}/${crypto.randomUUID()}.${extension}`;

  const upload = await supabase.storage.from('photos').upload(path, blob, {
    contentType: blob.type,
    // Paths are random, so a collision means something is badly wrong and
    // overwriting would hide it.
    upsert: false,
  });
  if (upload.error) return { error: upload.error.message };

  const { error } = await supabase.from('photos').insert({
    couple_id: coupleId,
    author_id: authorId,
    storage_path: path,
    caption: caption?.trim() || null,
  });

  if (error) {
    // The row is what makes the object findable. Without it the file is an
    // orphan nobody can see and nobody can delete, quietly costing storage.
    await supabase.storage.from('photos').remove([path]);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * A page of snaps, newest first.
 *
 * The limit was 12 and nothing ever passed a different one, so the Snaps screen
 * showed the last twelve photographs and no more — which at one a day is a
 * fortnight, and reads exactly like the older ones having been deleted. They
 * had not been; nothing in this project deletes a photo. The app simply never
 * asked for them.
 *
 * `before` is a cursor rather than an offset. A photo arriving while somebody
 * is paging back would shift every offset by one and duplicate a row across the
 * boundary; a timestamp cannot do that.
 */
export const SNAP_PAGE = 30;

export async function recentSnaps(
  coupleId: string,
  limit = SNAP_PAGE,
  before?: string,
): Promise<Snap[]> {
  let query = supabase
    .from('photos')
    .select('id, storage_path, caption, author_id, created_at, expires_at, kept')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) console.warn('[snaps] page:', error.message);

  return (data as Snap[] | null) ?? [];
}

/**
 * Signed URLs for a batch of paths.
 *
 * The buckets are private, so there is no such thing as a permanent link — a
 * photograph of two people must never be one guessed URL away from anybody.
 * An hour is long enough that a session never sees a link expire under it, and
 * short enough that a leaked one is worthless by the time it travels.
 */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data } = await supabase.storage.from('photos').createSignedUrls(paths, 3600);

  const urls = new Map<string, string>();
  for (const row of data ?? []) {
    // A path that failed to sign comes back with a null url rather than an
    // error on the batch; skipping it shows a gap instead of a broken image.
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

/**
 * Opts a photo out of the sixty-day life. Either partner may keep anything —
 * the one who took it does not own the memory of it.
 */
export async function keepSnap(id: string, kept: boolean): Promise<void> {
  await supabase.from('photos').update({ kept }).eq('id', id);
}

/**
 * Every snap taken on this date in an earlier year.
 *
 * One query, and only when there is a year to look back on: a couple four
 * months in has nothing behind them, and asking anyway would be a round trip on
 * every Home render to be told so. The caller decides that — see `Home`.
 *
 * Whole local days rather than a clever `to_char` on the server: PostgREST
 * cannot express "same month and day, any year" without a function, and a
 * couple who have been together three years is three cheap range scans on an
 * indexed column. Ordered newest first, so the most recent anniversary of the
 * day leads.
 */
export async function snapsOnThisDayBefore(
  coupleId: string,
  today: Date,
  yearsBack: number,
): Promise<Snap[]> {
  if (yearsBack < 1) return [];

  const windows: string[] = [];
  for (let back = 1; back <= yearsBack; back++) {
    const from = new Date(today);
    from.setFullYear(today.getFullYear() - back);
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setDate(from.getDate() + 1);

    windows.push(`and(created_at.gte.${from.toISOString()},created_at.lt.${to.toISOString()})`);
  }

  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, caption, author_id, created_at, expires_at, kept')
    .eq('couple_id', coupleId)
    .or(windows.join(','))
    .order('created_at', { ascending: false });

  // A silent empty result reads exactly like a true empty result, and this
  // query is the only one in the app built out of `or` strings.
  if (error) console.warn('[snaps] this day, earlier years:', error.message);

  return (data as Snap[] | null) ?? [];
}

/**
 * How much room the two of you are taking up, in bytes.
 *
 * Shown in Us rather than left to the dashboard: if storage ever becomes a
 * problem the owner should find out from the app. It lists rather than sums a
 * column, because there is no size column — the size lives on the object, and a
 * number derived from the rows would drift the first time an upload half-failed
 * and left a row without a file.
 *
 * Only this couple's own folder. The buckets are private and the policies are
 * scoped to the first path segment, so a listing of anything else comes back
 * empty anyway.
 */
export async function storageUsed(coupleId: string): Promise<number | null> {
  let total = 0;

  for (const bucket of ['photos', 'covers', 'avatars'] as const) {
    // 100 is the default page size and a couple can pass it in four months.
    const { data, error } = await supabase.storage.from(bucket).list(coupleId, { limit: 1000 });
    if (error) {
      console.warn(`[storage] ${bucket}:`, error.message);
      return null;
    }

    for (const object of data ?? []) {
      const size: unknown = (object.metadata as { size?: unknown } | null)?.size;
      if (typeof size === 'number') total += size;
    }
  }

  return total;
}

export async function deleteSnap(snap: Snap): Promise<void> {
  // Object first: if the row goes first and this fails, the file is an orphan
  // that nothing references and nothing can reach.
  await supabase.storage.from('photos').remove([snap.storage_path]);
  await supabase.from('photos').delete().eq('id', snap.id);
}

// ── saying something about one ───────────────────────────────────────────────

export interface SnapComment {
  id: string;
  photo_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/**
 * Every comment on the snaps currently loaded, keyed by photo.
 *
 * Visible immediately, with nothing to wait for. That is the opposite of the
 * rule everywhere else in this app, and it is the right one here: answers and
 * picks hide until both people move because seeing theirs first would change
 * what you write, and a photo has nothing to change. Making somebody take a
 * turn before they can say your hair looks good would be a mechanic borrowed
 * from a feature it does not fit.
 */
export async function loadComments(coupleId: string): Promise<Map<string, SnapComment[]>> {
  const { data } = await supabase
    .from('snap_comments')
    .select('id, photo_id, author_id, body, created_at')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true });

  const byPhoto = new Map<string, SnapComment[]>();
  for (const row of (data as SnapComment[] | null) ?? []) {
    const list = byPhoto.get(row.photo_id) ?? [];
    list.push(row);
    byPhoto.set(row.photo_id, list);
  }
  return byPhoto;
}

/**
 * Straight to Supabase rather than through the outbox.
 *
 * Arguable, and decided the same way `asks.ts` and the game were: what makes a
 * comment worth writing is that they see it, so one queued on a phone with no
 * signal has not been sent in any sense the writer would recognise. The screen
 * says it could not reach them instead of showing a comment that is not there.
 */
export async function addComment(input: {
  coupleId: string;
  photoId: string;
  authorId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('snap_comments').insert({
    couple_id: input.coupleId,
    photo_id: input.photoId,
    author_id: input.authorId,
    body: input.body.trim(),
  });

  return { error: error?.message ?? null };
}

/** Only your own. The policy refuses anything else, and so does the screen. */
export async function deleteComment(id: string): Promise<void> {
  await supabase.from('snap_comments').delete().eq('id', id);
}
