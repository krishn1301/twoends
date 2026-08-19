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

export async function recentSnaps(coupleId: string, limit = 12): Promise<Snap[]> {
  const { data } = await supabase
    .from('photos')
    .select('id, storage_path, caption, author_id, created_at, expires_at, kept')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(limit);

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
 * Opts a photo out of the 30-day sweep. Either partner may keep anything — the
 * one who took it does not own the memory of it.
 */
export async function keepSnap(id: string, kept: boolean): Promise<void> {
  await supabase.from('photos').update({ kept }).eq('id', id);
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
