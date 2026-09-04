import { supabase } from '../lib/supabase.ts';

/**
 * Voice notes, which are snaps that you hear.
 *
 * Deliberately the same shape as `photos.ts` — upload, list, sign, keep, delete
 * — because they are the same thing to the couple: something one of you made
 * today, that goes after sixty days unless somebody keeps it. The only reason
 * this is a separate file and a separate table is that a table called `photos`
 * holding audio is a lie that costs an afternoon to every future reader.
 */

export interface VoiceNote {
  id: string;
  storage_path: string;
  author_id: string;
  duration_ms: number;
  peaks: number[];
  created_at: string;
  expires_at: string;
  kept: boolean;
}

/** What the recorder produced, and what to call the file it goes into. */
function extensionFor(type: string): string {
  if (type.includes('webm')) return 'webm';
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'bin';
}

export async function sendVoiceNote(
  coupleId: string,
  authorId: string,
  blob: Blob,
  durationMs: number,
  peaks: number[],
): Promise<{ error: string | null }> {
  const path = `${coupleId}/${crypto.randomUUID()}.${extensionFor(blob.type)}`;

  /*
    The bare container, without the codecs parameter the recorder asked for.

    `audio/mp4;codecs=mp4a.40.2` is a legal Content-Type and it is not what a
    player wants to be told over the wire — Safari is the strict one, and it
    refuses a media response whose type it cannot match exactly rather than
    sniffing the bytes the way Chrome does. Recording asks for codecs because
    that is the question MediaRecorder answers; serving does not.
  */
  const upload = await supabase.storage.from('voice').upload(path, blob, {
    contentType: blob.type.split(';')[0] || 'application/octet-stream',
    // Random paths, so a collision means something is badly wrong and
    // overwriting would hide it.
    upsert: false,
  });
  if (upload.error) return { error: upload.error.message };

  const { error } = await supabase.from('voice_notes').insert({
    couple_id: coupleId,
    author_id: authorId,
    storage_path: path,
    duration_ms: Math.max(1, Math.round(durationMs)),
    peaks,
  });

  if (error) {
    // The row is what makes the object findable. Without it the file is an
    // orphan nobody can reach and nothing can delete.
    await supabase.storage.from('voice').remove([path]);
    return { error: error.message };
  }

  return { error: null };
}

export async function recentVoiceNotes(coupleId: string, limit = 12): Promise<VoiceNote[]> {
  const { data, error } = await supabase
    .from('voice_notes')
    .select('id, storage_path, author_id, duration_ms, peaks, created_at, expires_at, kept')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) console.warn('[voice] list:', error.message);
  return (data as VoiceNote[] | null) ?? [];
}

/**
 * Signed links, an hour each.
 *
 * The bucket is private for the same reason the photo one is: a recording of
 * somebody's voice must never be one guessed URL away from anybody.
 */
export async function voiceUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data } = await supabase.storage.from('voice').createSignedUrls(paths, 3600);

  const urls = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

/** Either partner may keep anything. The one who said it does not own it. */
export async function keepVoiceNote(id: string, kept: boolean): Promise<void> {
  await supabase.from('voice_notes').update({ kept }).eq('id', id);
}

export async function deleteVoiceNote(note: VoiceNote): Promise<void> {
  // Object first: if the row goes first and this fails, the file is an orphan.
  await supabase.storage.from('voice').remove([note.storage_path]);
  await supabase.from('voice_notes').delete().eq('id', note.id);
}
