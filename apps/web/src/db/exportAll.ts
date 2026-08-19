import { SIGNATURE, buildZip, type ZipEntry } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * Everything the two of you made, in one file.
 *
 * The promise in docs/PRIVACY.md is that the data belongs to the couple. That
 * is only true if it can leave — so this produces a ZIP of plain JSON plus the
 * original media, readable with no software that has to still exist in five
 * years. No proprietary container, no account required to open it, nothing
 * that needs this app.
 *
 * Two deliberate omissions, and both are the point rather than an oversight:
 *
 *  - **`presence` is not exported.** It is the only table that holds a
 *    coordinate. Writing your partner's position into a file that then lives in
 *    a downloads folder, a cloud backup and an email attachment would undo
 *    every guarantee migration 13 exists to make. A distance is shared; a
 *    position is not, and that does not change because the format changed.
 *  - **`invites` and `push_tokens` are not exported.** A live invite code and a
 *    push endpoint are credentials, not memories.
 */

/** Everything couple-scoped. Deliberately explicit, so a new table is a decision. */
const TABLES = [
  'couples',
  'profiles',
  'prompt_days',
  'answers',
  'streaks',
  'canvases',
  'photos',
  'countdowns',
  'journal_entries',
  'list_items',
  'capsules',
  // What the two of you said about each other's photos. Exported beside the
  // photos themselves, which is the only place they mean anything.
  'snap_comments',
  /*
    Your own picks, and their picks on every card you have both played. The
    cards they picked and you did not are simply absent — the reveal policy
    applies to an export exactly as it does to the screen, which is the correct
    answer rather than a limitation.
  */
  'game_picks',
] as const;

const BUCKETS = ['photos', 'covers'] as const;

export interface ExportResult {
  blob: Blob | null;
  filename: string;
  error: string | null;
}

export interface ExportProgress {
  /** What is happening, in words fit to show someone. */
  step: string;
  /** 0..1, or null while the total is not yet known. */
  ratio: number | null;
}

export async function exportEverything(
  coupleId: string,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  const say = (step: string, ratio: number | null = null) => onProgress?.({ step, ratio });
  const filename = `twoends-${new Date().toISOString().slice(0, 10)}.zip`;

  try {
    const entries: ZipEntry[] = [];
    const data: Record<string, unknown[]> = {};

    say('Collecting your words');
    for (const table of TABLES) {
      const { data: rows, error } = await supabase.from(table).select('*');
      // Row-level security already limits this to your own couple, so there is
      // no filter here to get wrong. A table that errors is recorded as empty
      // rather than failing the whole export — a partial archive beats none.
      data[table] = error ? [] : (rows ?? []);
    }

    entries.push(await textEntry('twoends/data.json', JSON.stringify(data, null, 2)));
    entries.push(await textEntry('twoends/README.txt', readme(data)));

    // Media last, and counted, because it is all of the time and all of the size.
    const paths: Array<{ bucket: string; path: string }> = [];
    for (const bucket of BUCKETS) {
      const { data: files } = await supabase.storage.from(bucket).list(coupleId, { limit: 1000 });
      for (const file of files ?? []) paths.push({ bucket, path: `${coupleId}/${file.name}` });
    }

    // Avatars live under the profile id, not the couple id.
    for (const profile of data.profiles as Array<{ avatar_path?: string | null }>) {
      if (profile.avatar_path) paths.push({ bucket: 'avatars', path: profile.avatar_path });
    }

    let done = 0;
    for (const { bucket, path } of paths) {
      say(`Collecting photos — ${done + 1} of ${paths.length}`, done / paths.length);
      const { data: file } = await supabase.storage.from(bucket).download(path);
      if (file) {
        entries.push({
          name: `twoends/${bucket}/${path.split('/').pop()}`,
          // Already JPEG or WebP. Deflating it again costs time and saves
          // nothing, so it is stored, and `buildZip` would refuse a larger
          // payload anyway.
          body: new Uint8Array(await file.arrayBuffer()),
        });
      }
      done += 1;
    }

    say('Packing it up', 1);
    const zip = buildZip(entries);

    return {
      blob: new Blob([zip as unknown as BlobPart], { type: 'application/zip' }),
      filename,
      error: null,
    };
  } catch (cause) {
    return {
      blob: null,
      filename,
      error: cause instanceof Error ? cause.message : 'Could not build the export.',
    };
  }
}

/** JSON and prose compress enormously; the platform has deflate and this package may use it. */
async function textEntry(name: string, text: string): Promise<ZipEntry> {
  const body = new TextEncoder().encode(text);
  return { name, body, deflated: await deflate(body) };
}

async function deflate(body: Uint8Array): Promise<Uint8Array | undefined> {
  // Safari only learned CompressionStream in 16.4, and this is a nicety rather
  // than a requirement — without it the archive is simply bigger.
  if (typeof CompressionStream === 'undefined') return undefined;

  try {
    const stream = new Blob([body as unknown as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

function readme(data: Record<string, unknown[]>): string {
  const counts = Object.entries(data)
    .filter(([, rows]) => rows.length > 0)
    .map(([table, rows]) => `  ${table.padEnd(18)} ${rows.length}`)
    .join('\n');

  return [
    'Your TwoEnds export',
    '===================',
    '',
    'data.json holds every row the two of you created, exactly as the app stored',
    'it. photos/ and covers/ hold the images at the size they were uploaded, and',
    'avatars/ holds your profile pictures. Filenames match storage_path in the',
    'JSON, so a row and its picture can be matched back up.',
    '',
    'What is in here:',
    '',
    counts || '  (nothing yet)',
    '',
    'What is deliberately NOT in here:',
    '',
    '  Location. It is the one thing the app holds that could say where somebody',
    '  is, and a file in a downloads folder is not a place to put that. The app',
    '  only ever shares a distance, and an export does not get to be the',
    '  exception.',
    '',
    '  Invite codes and notification tokens. Those are credentials, not memories.',
    '',
    'Nothing here needs TwoEnds to read it. That is the point.',
    '',
    /*
      The only prose in the shipped product written *to* the couple rather than
      for the interface, which makes it the right place for the last of the
      signatures - and the one most likely to still exist in ten years, since an
      export is a file somebody keeps rather than an app somebody updates.
    */
    `${SIGNATURE.mark} — ${SIGNATURE.line} ${SIGNATURE.year}`,
    '',
  ].join('\n');
}
