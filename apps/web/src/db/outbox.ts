import {
  coalesce,
  dueOps,
  withFailure,
  type OpKind,
  type OutboxOp,
  type SyncTable,
} from '@twoends/core';

import type { EntityTable } from 'dexie';

import { supabase } from '../lib/supabase.ts';
import { db } from './schema.ts';

/**
 * The outbox: every write goes here first, then to the server when it can.
 *
 * Two properties matter more than anything else here.
 *
 * **Idempotence.** Every row carries a primary key generated on this device, and
 * every send is an upsert. So replaying an operation is harmless, which is what
 * makes the next property safe.
 *
 * **Crash safety.** An operation is deleted from the queue only after the server
 * has confirmed it. Being killed mid-flush therefore loses nothing: the write is
 * still queued and gets replayed. If it had actually landed before the crash,
 * the replay upserts the same row to the same values and nothing duplicates.
 *
 * The opposite order — delete first, then send — would be simpler and would
 * silently lose writes exactly when people are least able to notice: on a train,
 * in a lift, with a dying battery.
 */

type FlushListener = (state: { pending: number; flushing: boolean }) => void;

const listeners = new Set<FlushListener>();
let flushing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function onOutboxChange(fn: FlushListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const pending = await db.outbox.count();
  for (const fn of listeners) fn({ pending, flushing });
}

/**
 * Queues a write and applies it locally in the same transaction.
 *
 * Same transaction on purpose: a UI that shows a change which is not queued, or
 * queues one it does not show, is lying in one direction or the other.
 */
export async function enqueue(
  table: SyncTable,
  kind: OpKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    table,
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  };

  const local = mirrorFor(table);

  // Every mirrored table joins the transaction rather than only the one being
  // written. Dexie needs the list up front, and a conditional spread here is
  // untypeable — the cost is a slightly wider lock on a single-user database.
  await db.transaction(
    'rw',
    // Array form: the positional overloads stop at five tables and there are six.
    [db.outbox, db.countdowns, db.answers, db.journal_entries, db.canvases, db.list_items],
    async () => {
      await db.outbox.add(op);
      if (!local) return;
      if (kind === 'delete') await local.delete(payload.id as string);
      else await local.put(payload as MirroredRow);
    },
  );

  await notify();
  void flush();
}

export interface MirroredRow {
  id: string;
  [key: string]: unknown;
}

/**
 * The local mirror of a table, or null for tables that only queue.
 *
 * Typed as one row shape rather than a union of the five. Dexie's per-table
 * generics do not survive being unioned — every write becomes `never` — and the
 * outbox genuinely does treat all rows the same: it moves whole objects with an
 * `id` and looks at nothing else.
 */
export function mirrorFor(table: SyncTable): EntityTable<MirroredRow, 'id'> | null {
  const found = {
    countdowns: db.countdowns,
    answers: db.answers,
    journal_entries: db.journal_entries,
    canvases: db.canvases,
    list_items: db.list_items,
  }[table as 'countdowns'];

  return (found as unknown as EntityTable<MirroredRow, 'id'>) ?? null;
}

/**
 * Sends everything due. Safe to call at any time and from anywhere — concurrent
 * calls collapse into the one already running.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Offline is not a failure and must not consume an attempt; burning the
    // backoff budget while in a tunnel means a long wait after leaving it.
    return;
  }

  flushing = true;
  await notify();

  try {
    const now = Date.now();
    const queued = await db.outbox.toArray();
    const batch = dueOps(coalesce(queued), now);

    for (const op of batch) {
      const superseded = queued.filter(
        (q) =>
          q.table === op.table &&
          (q.payload as { id?: string }).id === (op.payload as { id?: string }).id,
      );

      const error = await send(op);

      if (!error) {
        // Only now is it safe to forget. Everything that coalesced into this
        // operation goes with it.
        await db.outbox.bulkDelete(superseded.map((q) => q.id));
        continue;
      }

      const next = withFailure(op, error, Date.now());
      if (next) {
        await db.outbox.bulkPut(superseded.map((q) => ({ ...q, ...next, id: q.id })));
        // A failure now is a failure for everything behind it too: order
        // matters, and hammering the rest achieves nothing.
        break;
      }

      // Permanently rejected. Drop it rather than retrying forever, and leave a
      // trace — a write that vanishes silently is worse than one that failed.
      await db.outbox.bulkDelete(superseded.map((q) => q.id));
      console.error(`[outbox] dropped ${op.table} write:`, error.message);
    }
  } finally {
    flushing = false;
    await notify();
    await scheduleNext();
  }
}

/** Wakes exactly when the next operation is due, rather than polling. */
async function scheduleNext(): Promise<void> {
  if (timer) clearTimeout(timer);
  const next = await db.outbox.orderBy('nextAttemptAt').first();
  if (!next) return;

  const delay = Math.max(250, next.nextAttemptAt - Date.now());
  timer = setTimeout(() => void flush(), delay);
}

interface SendError {
  status?: number;
  code?: string;
  message: string;
}

async function send(op: OutboxOp): Promise<SendError | null> {
  try {
    /*
      The generated client types each table separately, so a union of table
      names collapses every argument to `never`. Narrowing to one concrete
      table restores the call signature. The rows themselves were type-checked
      where they were built, in `repository.ts`.
    */
    const from = supabase.from(op.table as 'countdowns');

    const { error } =
      op.kind === 'delete'
        ? await from.delete().eq('id', op.payload.id as string)
        : await from.upsert(op.payload as never);

    return error ? { status: statusOf(error), code: error.code, message: error.message } : null;
  } catch (thrown) {
    // A thrown error rather than a returned one means the request never left:
    // no status, which `isRetryable` reads as offline.
    return { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

/** PostgREST reports HTTP status in `code` for some failures and not others. */
function statusOf(error: { code?: string }): number | undefined {
  const numeric = Number(error.code);
  return Number.isFinite(numeric) && numeric >= 100 && numeric < 600 ? numeric : undefined;
}

/**
 * Flush on reconnect, and whenever the app comes back to the foreground.
 *
 * `visibilitychange` matters more than `online` on a phone: the browser is
 * suspended in the background, so the moment that actually needs a flush is the
 * one where someone reopens the app, not the one where the radio reconnects.
 */
export function watchConnectivity(): () => void {
  const kick = () => void flush();
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });

  return () => {
    window.removeEventListener('online', kick);
    if (timer) clearTimeout(timer);
  };
}
