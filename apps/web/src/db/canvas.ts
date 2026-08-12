import { compact, isDrawing, isEmpty, type Drawing, type Json } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * Drawings, to and from the database.
 *
 * Each one is a row rather than an edit of a shared canvas. A drawing is a thing
 * you sent, like a photograph — if the two of you shared one mutable surface,
 * whoever drew last would quietly erase the other, and the reference apps that
 * do this get complaints about exactly that.
 */

export interface SavedDrawing {
  id: string;
  author_id: string;
  drawing: Drawing;
  created_at: string;
}

export async function sendDrawing(
  coupleId: string,
  authorId: string,
  drawing: Drawing,
): Promise<{ error: string | null }> {
  if (isEmpty(drawing)) return { error: 'Nothing to send yet.' };

  const { error } = await supabase.from('canvases').insert({
    couple_id: coupleId,
    author_id: authorId,
    /*
      Simplified and rounded before it travels; see packages/core/src/strokes.ts.

      The cast is because the generated `Json` type demands an index signature,
      which a precise interface deliberately does not have. `Drawing` is plain
      data — objects, arrays, numbers and strings — so it is valid JSON; the
      types simply cannot see that. `isDrawing` checks the shape on the way back
      out, which is the direction that actually needs guarding.
    */
    strokes: compact(drawing) as unknown as Json,
  });

  return { error: error?.message ?? null };
}

export async function recentDrawings(coupleId: string, limit = 12): Promise<SavedDrawing[]> {
  const { data } = await supabase
    .from('canvases')
    .select('id, author_id, strokes, created_at')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows: SavedDrawing[] = [];
  for (const row of data ?? []) {
    /*
      A jsonb column holds whatever it was given, including something written by
      an older version of the app — so the shape is checked rather than assumed.
      Skip what cannot be rendered instead of crashing the gallery.
    */
    if (!isDrawing(row.strokes)) continue;
    rows.push({
      id: row.id,
      author_id: row.author_id,
      created_at: row.created_at,
      drawing: row.strokes,
    });
  }
  return rows;
}

export async function deleteDrawing(id: string): Promise<void> {
  await supabase.from('canvases').delete().eq('id', id);
}
