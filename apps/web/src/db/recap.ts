import {
  pendingWindows,
  pickTwo,
  worthShowing,
  type RecapExchange,
  type RecapWindow,
} from '@twoends/core';

import { supabase } from '../lib/supabase.ts';
import type { Couple } from '../state/session.ts';

/**
 * A month, assembled from the month.
 *
 * Nothing here is generated content. Every field is a query against the tables
 * the app was already writing, bounded by the recap's window — which is what
 * makes a recap opened in five years as correct as the day it was made, and
 * what makes it worth almost nothing to store.
 *
 * The one thing generation *writes* is `photos.kept` on every photograph the
 * recap uses. That is the whole retention story: a snap has sixty days, a recap
 * claims the ones it shows, and the claimed ones have no deadline at all.
 */

export interface Recap {
  id: string;
  month: string;
  from_date: string;
  to_date: string;
  created_at: string;
}

export interface RecapPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  author_id: string;
  created_at: string;
}

export interface RecapDrawing {
  id: string;
  author_id: string;
  strokes: unknown;
  created_at: string;
}

export type { RecapExchange };

export interface RecapContents {
  window: RecapWindow;
  photos: RecapPhoto[];
  drawings: RecapDrawing[];
  /** The pair who answered most alike, and the pair furthest apart. */
  closest: RecapExchange | null;
  furthest: RecapExchange | null;
  /** Every capsule that opened inside the window. */
  capsules: { id: string; body: string; author_id: string; deliver_at: string }[];
  /** Countdowns whose date fell inside it. */
  arrived: { id: string; title: string; target_at: string }[];
  /** How many days together on the last day of the window. */
  daysTogether: number;
  /** How many of the window's days had an answer from both. */
  daysAnswered: number;
  /** Everything countable, for the "is this worth a page" rule. */
  items: number;
}

/** Every recap this couple has, newest first. */
export async function listRecaps(coupleId: string): Promise<Recap[]> {
  const { data, error } = await supabase
    .from('recaps')
    .select('id, month, from_date, to_date, created_at')
    .eq('couple_id', coupleId)
    .order('to_date', { ascending: false });

  if (error) console.warn('[recap] list:', error.message);
  return (data as Recap[] | null) ?? [];
}

/** Midnight-to-midnight, as timestamps, for a window given in local dates. */
const startOf = (date: string): string => `${date}T00:00:00.000Z`;
const endOf = (date: string): string => `${date}T23:59:59.999Z`;

/**
 * Everything a recap shows, for one window.
 *
 * Six queries in parallel rather than one clever join: they touch six unrelated
 * tables, PostgREST would need a view to join them, and a view is a second
 * place the window would have to be written down.
 */
export async function recapContents(
  coupleId: string,
  window: RecapWindow,
  startedOn: string | null,
): Promise<RecapContents> {
  const from = startOf(window.from);
  const to = endOf(window.to);

  const [photos, drawings, days, capsules, countdowns] = await Promise.all([
    supabase
      .from('photos')
      .select('id, storage_path, caption, author_id, created_at')
      .eq('couple_id', coupleId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true }),

    supabase
      .from('canvases')
      .select('id, author_id, strokes, created_at')
      .eq('couple_id', coupleId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true }),

    supabase
      .from('prompt_days')
      .select('id, local_date, prompts(body), answers(author_id, body)')
      .eq('couple_id', coupleId)
      .gte('local_date', window.from)
      .lte('local_date', window.to)
      .order('local_date', { ascending: true }),

    supabase
      .from('capsules')
      .select('id, body, author_id, deliver_at')
      .eq('couple_id', coupleId)
      .gte('deliver_at', from)
      .lte('deliver_at', to)
      .order('deliver_at', { ascending: true }),

    supabase
      .from('countdowns')
      .select('id, title, target_at')
      .eq('couple_id', coupleId)
      .gte('target_at', from)
      .lte('target_at', to)
      .order('target_at', { ascending: true }),
  ]);

  for (const [what, result] of [
    ['photos', photos],
    ['canvases', drawings],
    ['prompt days', days],
    ['capsules', capsules],
    ['countdowns', countdowns],
  ] as const) {
    // A silent empty result reads exactly like a true empty one, and a recap
    // that quietly lost a month is the worst possible way for this to fail.
    if (result.error) console.warn(`[recap] ${what}:`, result.error.message);
  }

  const exchanges = readExchanges(days.data);
  const { closest, furthest } = pickTwo(exchanges);

  const daysTogether =
    startedOn === null
      ? 0
      : Math.max(0, Math.round((Date.parse(window.to) - Date.parse(startedOn)) / 86_400_000));

  const photoRows = (photos.data as RecapPhoto[] | null) ?? [];
  const drawingRows = ((drawings.data as RecapDrawing[] | null) ?? []).filter(hasStrokes);
  const capsuleRows = (capsules.data as RecapContents['capsules'] | null) ?? [];
  const arrivedRows = (countdowns.data as RecapContents['arrived'] | null) ?? [];

  return {
    window,
    photos: photoRows,
    drawings: drawingRows,
    closest,
    furthest,
    capsules: capsuleRows,
    arrived: arrivedRows,
    daysTogether,
    daysAnswered: exchanges.length,
    items:
      photoRows.length +
      drawingRows.length +
      exchanges.length +
      capsuleRows.length +
      arrivedRows.length,
  };
}

/** A drawing with nothing in it is not a drawing. */
function hasStrokes(row: RecapDrawing): boolean {
  const strokes = (row.strokes as { strokes?: unknown[] } | null)?.strokes;
  return Array.isArray(strokes) && strokes.length > 0;
}

/** The days where both of them answered, which are the only ones worth showing. */
function readExchanges(rows: unknown): RecapExchange[] {
  const days = (rows ?? []) as {
    local_date: string;
    prompts: { body: string } | { body: string }[] | null;
    answers: { author_id: string; body: string | null }[] | null;
  }[];

  const out: RecapExchange[] = [];

  for (const day of days) {
    const prompt = Array.isArray(day.prompts) ? day.prompts[0] : day.prompts;
    const answers = (day.answers ?? []).filter(
      (a): a is { author_id: string; body: string } =>
        typeof a.body === 'string' && a.body.trim() !== '',
    );

    // Both, or it is half a conversation and reads as one.
    if (!prompt || answers.length < 2) continue;

    out.push({ date: day.local_date, question: prompt.body, answers });
  }

  return out;
}

/**
 * Makes the recap real: writes the row and claims its photographs.
 *
 * Idempotent by the unique index rather than by checking first — the app does
 * this on open and the scheduled function does it to send the push, and they
 * are allowed to race. The loser gets a duplicate-key error and stops, which is
 * the correct outcome and needs no lock.
 *
 * Photos are marked *after* the row exists. The other order would keep a
 * month's photographs forever on a recap that failed to be created.
 */
export async function createRecap(
  coupleId: string,
  contents: RecapContents,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recaps').insert({
    couple_id: coupleId,
    month: contents.window.month,
    from_date: contents.window.from,
    to_date: contents.window.to,
  });

  // 23505 is the unique index doing its job: somebody else made it first.
  if (error && error.code !== '23505') return { error: error.message };

  const ids = contents.photos.map((photo) => photo.id);
  if (ids.length > 0) {
    const kept = await supabase.from('photos').update({ kept: true }).in('id', ids);
    if (kept.error) return { error: kept.error.message };
  }

  return { error: null };
}

/**
 * Makes any recap that is now due, and returns the ones that exist.
 *
 * Runs one window at a time and loops, so a couple who has not opened the app
 * for three months gets three recaps rather than one covering the lot — except
 * where a month was too thin, which folds forward exactly as intended.
 */
export async function catchUpRecaps(couple: Couple, today: string): Promise<Recap[]> {
  if (!couple.started_on) return [];

  let existing = await listRecaps(couple.id);

  /*
    Walks every uncovered anniversary rather than only the earliest.

    The difference matters and it is the whole fold-forward rule: a quiet first
    month is never worth a page *on its own*, so asking only about it would
    write nothing, forever, and the couple would never get a recap at all. Every
    pending window shares the same start, so trying the next one is trying a
    longer period — which eventually has enough in it.
  */
  for (let round = 0; round < 24; round++) {
    const windows = pendingWindows(couple.started_on, today, existing[0]?.to_date ?? null);
    if (windows.length === 0) break;

    let made = false;

    for (const window of windows) {
      const contents = await recapContents(couple.id, window, couple.started_on);
      if (!worthShowing(contents.items)) continue;

      const { error } = await createRecap(couple.id, contents);
      if (error) {
        console.warn('[recap] create:', error);
        return existing;
      }

      existing = await listRecaps(couple.id);
      made = true;
      break;
    }

    // Nothing in any remaining window was worth a page. They fold into whatever
    // month closes next, which has not happened yet.
    if (!made) break;
  }

  return existing;
}
