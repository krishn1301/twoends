/**
 * The rules the sync engine follows. Pure, so they can be tested without a
 * database, a network, or a browser — and so the Kotlin widget layer in Phase 7
 * can be held to the same ones.
 *
 * The engine itself (Dexie, Supabase, realtime) lives in `apps/web/src/db`,
 * because `packages/core` may not import either.
 */

/** Tables the client is allowed to queue writes for. */
export type SyncTable =
  | 'answers'
  | 'canvases'
  | 'countdowns'
  | 'journal_entries'
  | 'list_items'
  | 'photos'
  | 'capsules'
  | 'couples'
  | 'profiles'
  | 'streaks';

export type OpKind = 'upsert' | 'delete';

export interface OutboxOp {
  /** Client-generated, so a retry after a crash is the same operation. */
  id: string;
  table: SyncTable;
  kind: OpKind;
  /** The row. Always carries its own primary key, generated on this device. */
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  /** Epoch ms. The flusher skips ops until now passes this. */
  nextAttemptAt: number;
  lastError?: string;
}

/**
 * Append-only tables: someone's words.
 *
 * A partner may read everything in the pair but never rewrite it — the database
 * enforces that with restrictive policies, and the client honours the same rule
 * so a stale local copy can never overwrite what the other person actually
 * wrote. When these conflict, the server always wins.
 */
export const APPEND_ONLY: ReadonlySet<SyncTable> = new Set(['answers', 'journal_entries']);

// ── retry ────────────────────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 12;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5 * 60_000;

/**
 * Exponential backoff with full jitter.
 *
 * The jitter is not decoration. Both partners' apps come back online at the
 * same moment after the same tunnel or the same flight, and a deterministic
 * backoff would have them retry in lockstep, repeatedly, against a free-tier
 * database. Randomising the whole interval spreads them out.
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts));
  return Math.round(random() * ceiling);
}

/**
 * Which failures are worth retrying.
 *
 * The distinction that matters: a network failure means "not yet", but a policy
 * refusal or a constraint violation means "not ever". Retrying the second kind
 * burns battery and quota forever, and hides a real bug behind a queue that
 * never drains.
 */
export function isRetryable(error: { status?: number; code?: string; message?: string }): boolean {
  // No status at all is the offline case: the request never reached anyone.
  if (error.status === undefined) return true;

  if (error.status === 408 || error.status === 429) return true;
  if (error.status >= 500) return true;

  // 401 is a token that expired while queued — worth one more go after refresh.
  if (error.status === 401) return true;

  // 403 is row-level security saying no. 409 and 422 are the database saying
  // the data is wrong. Neither improves by asking again.
  return false;
}

export function withFailure(
  op: OutboxOp,
  error: { status?: number; code?: string; message?: string },
  now: number,
  random: () => number = Math.random,
): OutboxOp | null {
  const attempts = op.attempts + 1;

  if (!isRetryable(error) || attempts >= MAX_ATTEMPTS) {
    // Dropped from the queue. The caller surfaces it — a write that silently
    // vanishes is worse than one that says it failed.
    return null;
  }

  return {
    ...op,
    attempts,
    nextAttemptAt: now + backoffMs(attempts, random),
    lastError: error.message ?? String(error.status ?? 'unknown'),
  };
}

/** Ops due now, oldest first, so writes land in the order they were made. */
export function dueOps(ops: readonly OutboxOp[], now: number): OutboxOp[] {
  return ops.filter((op) => op.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt);
}

// ── conflict ─────────────────────────────────────────────────────────────────

export type Winner = 'local' | 'remote';

/**
 * Who wins when the server sends a row we also have.
 *
 * The rule is deliberately simple, because a sync engine nobody can reason
 * about is a sync engine nobody can debug:
 *
 * 1. If this device has an unflushed write for that row, the local copy stands.
 *    Anything else makes your own typing disappear under a slow round trip.
 * 2. Otherwise the server wins, including for append-only tables, where it
 *    always wins.
 *
 * There is no per-field merge. Two people editing the same countdown title in
 * the same second is a coin toss either way, and pretending otherwise would add
 * a merge algorithm to save a case that does not really happen in a two-person
 * app.
 */
export function resolve(table: SyncTable, hasPendingLocalWrite: boolean): Winner {
  if (APPEND_ONLY.has(table)) return 'remote';
  return hasPendingLocalWrite ? 'local' : 'remote';
}

/**
 * Collapses queued writes to the same row.
 *
 * Editing a countdown title four times offline should send one row, not four.
 * A later delete cancels earlier upserts entirely — sending them first would
 * mean creating a row purely to remove it, and would fail loudly if the row was
 * never on the server to begin with.
 */
export function coalesce(ops: readonly OutboxOp[]): OutboxOp[] {
  const byRow = new Map<string, OutboxOp>();

  for (const op of ops) {
    const rowId = (op.payload as { id?: string }).id;
    const key = `${op.table}:${rowId ?? op.id}`;
    const existing = byRow.get(key);

    if (!existing) {
      byRow.set(key, op);
      continue;
    }

    if (op.kind === 'delete') {
      // Keep the delete, but under the original queue position so ordering
      // against other rows is preserved.
      byRow.set(key, { ...op, createdAt: existing.createdAt });
    } else if (existing.kind === 'delete') {
      // An upsert after a delete is a genuine re-creation. Let it through.
      byRow.set(key, op);
    } else {
      byRow.set(key, {
        ...op,
        createdAt: existing.createdAt,
        payload: { ...existing.payload, ...op.payload },
      });
    }
  }

  return [...byRow.values()].sort((a, b) => a.createdAt - b.createdAt);
}
