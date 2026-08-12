import { compact, isDrawing, isEmpty, mergeBatches, type Drawing, type Json } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * One shared canvas, built from append-only batches.
 *
 * The canvas both people see is the union of every batch of strokes since the
 * last clear. Nobody edits a shared row, so nobody can overwrite anyone: two
 * people drawing at the same moment on two phones produce two batches that
 * merge by time. Clearing is itself a batch — a tombstone — so it syncs and
 * survives being offline like everything else.
 */

export interface CanvasContributor {
  authorId: string;
  at: string;
}

export interface SharedCanvas {
  drawing: Drawing;
  /** Who last added to it, so the card can say "they drew something". */
  lastAuthorId: string | null;
  lastAt: string | null;
}

/** Everything on the canvas right now. */
export async function loadCanvas(coupleId: string): Promise<SharedCanvas> {
  const { data } = await supabase
    .from('canvases')
    .select('id, author_id, strokes, is_clear, created_at')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true })
    // Generous: a canvas is a few kilobytes per batch, and reading a year of
    // them still costs less than one photograph.
    .limit(500);

  const batches = (data ?? [])
    .filter((row) => isDrawing(row.strokes))
    .map((row) => ({
      drawing: row.strokes as unknown as Drawing,
      isClear: row.is_clear,
      authorId: row.author_id,
      at: row.created_at,
    }));

  const drawn = batches.filter((b) => !b.isClear);
  const last = drawn.at(-1);

  return {
    drawing: mergeBatches(batches),
    lastAuthorId: last?.authorId ?? null,
    lastAt: last?.at ?? null,
  };
}

/**
 * Adds strokes to the shared canvas.
 *
 * Only the new strokes travel, not the whole surface. Re-sending everything on
 * every edit would grow quadratically and would also reintroduce the overwrite
 * problem this design exists to avoid.
 */
export async function appendStrokes(
  coupleId: string,
  authorId: string,
  added: Drawing,
): Promise<{ error: string | null }> {
  if (isEmpty(added)) return { error: 'Nothing new to send yet.' };

  const { error } = await supabase.from('canvases').insert({
    couple_id: coupleId,
    author_id: authorId,
    strokes: compact(added) as unknown as Json,
  });

  return { error: error?.message ?? null };
}

/**
 * Wipes the shared canvas for both of you.
 *
 * A tombstone rather than a delete of the history, so it reaches the other
 * device the same way a stroke does, and so it cannot race with someone drawing
 * at that instant — their batch simply lands after the tombstone and survives.
 */
export async function clearCanvas(
  coupleId: string,
  authorId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('canvases').insert({
    couple_id: coupleId,
    author_id: authorId,
    strokes: { version: 1, strokes: [] } as unknown as Json,
    is_clear: true,
  });

  return { error: error?.message ?? null };
}
