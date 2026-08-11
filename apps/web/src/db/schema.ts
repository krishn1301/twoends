import type { OutboxOp } from '@twoends/core';
import Dexie, { type EntityTable } from 'dexie';

/**
 * The local database. This is what the UI reads — always, and only.
 *
 * It mirrors the Postgres schema closely enough that a row can move between
 * them untouched, which is what lets the outbox send exactly what it stored.
 * Where it differs, it differs on purpose:
 *
 *  - No row-level security here, because there is nothing to defend against:
 *    this database only ever contains one couple's data, on their own device.
 *    The security boundary is the server's, and it is tested there.
 *  - An `outbox` table that has no server counterpart.
 *  - `meta`, holding sync bookkeeping.
 *
 * Indexes are declared for the queries the app actually makes — couple-scoped
 * lists, ordered by time — rather than for every column.
 */

export interface LocalRow {
  id: string;
  couple_id: string;
}

export interface Countdown extends LocalRow {
  title: string;
  target_at: string;
  cover_path: string | null;
  created_at: string;
}

export interface Answer extends LocalRow {
  prompt_day_id: string;
  author_id: string;
  body: string | null;
  media_path: string | null;
  created_at: string;
}

export interface JournalEntry extends LocalRow {
  author_id: string;
  body: string | null;
  place_label: string | null;
  lat: number | null;
  lng: number | null;
  happened_on: string | null;
  created_at: string;
}

export interface Canvas extends LocalRow {
  author_id: string;
  strokes: unknown;
  created_at: string;
}

export interface ListItem extends LocalRow {
  kind: string;
  title: string;
  done_at: string | null;
  created_at: string;
}

/**
 * Sync bookkeeping. One row per key.
 *
 * `pulled:<table>` holds the newest `created_at` seen from the server, so a
 * reconnect asks for what changed rather than re-downloading a year of rows on
 * a metered connection.
 */
export interface Meta {
  key: string;
  value: string;
}

export class TwoEndsDb extends Dexie {
  countdowns!: EntityTable<Countdown, 'id'>;
  answers!: EntityTable<Answer, 'id'>;
  journal_entries!: EntityTable<JournalEntry, 'id'>;
  canvases!: EntityTable<Canvas, 'id'>;
  list_items!: EntityTable<ListItem, 'id'>;
  outbox!: EntityTable<OutboxOp, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('twoends');

    this.version(1).stores({
      countdowns: 'id, couple_id, target_at',
      answers: 'id, couple_id, prompt_day_id, [prompt_day_id+author_id], created_at',
      journal_entries: 'id, couple_id, happened_on',
      canvases: 'id, couple_id, created_at',
      list_items: 'id, couple_id, done_at',
      // `nextAttemptAt` is indexed because the flusher's only question is
      // "what is due now?", and it asks it on every tick.
      outbox: 'id, nextAttemptAt, createdAt, table',
      meta: 'key',
    });
  }
}

export const db = new TwoEndsDb();

/**
 * Wipes everything local. Used on sign-out and on unpair.
 *
 * Unpair promises a delete that actually deletes, and a copy of the shared life
 * sitting in IndexedDB after the server rows are gone would make that a lie.
 */
export async function wipeLocal(): Promise<void> {
  await db.delete();
  await db.open();
}
