import { shrinkForUpload } from '../lib/image.ts';
import { supabase } from '../lib/supabase.ts';

/**
 * Profile pictures.
 *
 * Stored under `<profile_id>/`, not `<couple_id>/` like everything else. Two
 * reasons, both structural: you set yours before there is a couple, and it has
 * to survive unpairing. Your face is yours.
 *
 * A fixed filename per person rather than a random one, so replacing a picture
 * overwrites the old object instead of leaving it behind. Otherwise every change
 * of mind would cost storage forever, and nothing would ever reference the
 * abandoned file to clean it up.
 */

const AVATAR_MAX_EDGE = 512;

export async function uploadAvatar(
  profileId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  let blob: Blob;
  try {
    // Reuses the photo pipeline, so the same WebP-or-JPEG discipline applies —
    // and then shrinks much harder, because this is rendered at 60px.
    const shrunk = await shrinkForUpload(file);
    blob = await downscale(shrunk.blob);
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : 'Could not read that photo.' };
  }

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${profileId}/avatar.${extension}`;

  const upload = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: blob.type,
    // The one place upsert is right: this path is deliberately stable.
    upsert: true,
  });
  if (upload.error) return { path: null, error: upload.error.message };

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', profileId);

  return { path: error ? null : path, error: error?.message ?? null };
}

/** A second pass down to avatar size. A 1600px image for a 60px circle is waste. */
async function downscale(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.8),
  );

  // Same trap as the photo pipeline: an unsupported format comes back as PNG
  // rather than null, so the type is checked instead of the value.
  if (encoded?.type === 'image/webp') return encoded;

  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.8),
  );
  return jpeg?.type === 'image/jpeg' ? jpeg : source;
}

/**
 * Signed URLs for a set of avatar paths.
 *
 * Long-lived by the standards of this app — a day rather than an hour — because
 * an avatar appears on every screen and re-signing it constantly is pure
 * round-trips for a picture that rarely changes.
 */
export async function signedAvatarUrls(paths: string[]): Promise<Map<string, string>> {
  const wanted = paths.filter(Boolean);
  if (wanted.length === 0) return new Map();

  const { data } = await supabase.storage.from('avatars').createSignedUrls(wanted, 86_400);

  const urls = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

export async function removeAvatar(profileId: string, path: string): Promise<void> {
  await supabase.storage.from('avatars').remove([path]);
  await supabase.from('profiles').update({ avatar_path: null }).eq('id', profileId);
}
