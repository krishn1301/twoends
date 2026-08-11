import { describe, expect, it } from 'vitest';

import {
  APPEND_ONLY,
  MAX_ATTEMPTS,
  backoffMs,
  coalesce,
  dueOps,
  isRetryable,
  resolve,
  withFailure,
  type OutboxOp,
} from './sync.ts';

const op = (over: Partial<OutboxOp> = {}): OutboxOp => ({
  id: 'op-1',
  table: 'countdowns',
  kind: 'upsert',
  payload: { id: 'row-1', title: 'She lands' },
  createdAt: 1000,
  attempts: 0,
  nextAttemptAt: 0,
  ...over,
});

describe('backoff', () => {
  it('grows exponentially and stops growing', () => {
    const ceilingAt = (n: number) => backoffMs(n, () => 1);
    expect(ceilingAt(0)).toBe(1_000);
    expect(ceilingAt(1)).toBe(2_000);
    expect(ceilingAt(4)).toBe(16_000);
    expect(ceilingAt(50)).toBe(5 * 60_000);
  });

  it('jitters across the whole interval, not just the tail', () => {
    // Both partners come back from the same tunnel at the same moment. Without
    // full jitter they retry in lockstep against a free-tier database.
    expect(backoffMs(5, () => 0)).toBe(0);
    expect(backoffMs(5, () => 0.5)).toBe(16_000);
    expect(backoffMs(5, () => 1)).toBe(32_000);
  });
});

describe('which failures are worth retrying', () => {
  it('retries when the request never arrived', () => {
    expect(isRetryable({ message: 'Failed to fetch' })).toBe(true);
  });

  it('retries server trouble and rate limits', () => {
    for (const status of [408, 429, 500, 502, 503]) {
      expect(isRetryable({ status }), String(status)).toBe(true);
    }
  });

  it('gives up on refusals, because they do not improve with time', () => {
    // 403 is row-level security saying no; 409 and 422 are the data being wrong.
    for (const status of [400, 403, 404, 409, 422]) {
      expect(isRetryable({ status }), String(status)).toBe(false);
    }
  });

  it('retries an expired token once the session refreshes', () => {
    expect(isRetryable({ status: 401 })).toBe(true);
  });
});

describe('failing an op', () => {
  it('schedules the next attempt in the future', () => {
    const failed = withFailure(op(), { status: 503 }, 10_000, () => 1);
    expect(failed?.attempts).toBe(1);
    expect(failed?.nextAttemptAt).toBeGreaterThan(10_000);
    expect(failed?.lastError).toBeDefined();
  });

  it('drops an op that can never succeed', () => {
    expect(withFailure(op(), { status: 403, message: 'denied' }, 0)).toBeNull();
  });

  it('gives up rather than retrying forever', () => {
    const exhausted = op({ attempts: MAX_ATTEMPTS - 1 });
    expect(withFailure(exhausted, { status: 500 }, 0)).toBeNull();
  });
});

describe('picking what to send', () => {
  it('sends oldest first, so writes land in the order they were made', () => {
    const ops = [op({ id: 'b', createdAt: 2000 }), op({ id: 'a', createdAt: 1000 })];
    expect(dueOps(ops, 5000).map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('skips ops that are still backing off', () => {
    const ops = [op({ id: 'now', nextAttemptAt: 0 }), op({ id: 'later', nextAttemptAt: 9999 })];
    expect(dueOps(ops, 100).map((o) => o.id)).toEqual(['now']);
  });
});

describe('conflict', () => {
  it('never lets a stale local copy overwrite someone’s words', () => {
    expect(APPEND_ONLY.has('answers')).toBe(true);
    expect(APPEND_ONLY.has('journal_entries')).toBe(true);
    expect(resolve('answers', true)).toBe('remote');
    expect(resolve('journal_entries', true)).toBe('remote');
  });

  it('keeps your own unflushed edit rather than snapping it back', () => {
    expect(resolve('countdowns', true)).toBe('local');
  });

  it('takes the server copy once there is nothing pending', () => {
    expect(resolve('countdowns', false)).toBe('remote');
  });
});

describe('coalescing', () => {
  it('collapses repeated edits of one row into a single write', () => {
    const ops = [
      op({ id: '1', createdAt: 1, payload: { id: 'r', title: 'a' } }),
      op({ id: '2', createdAt: 2, payload: { id: 'r', title: 'b' } }),
      op({ id: '3', createdAt: 3, payload: { id: 'r', title: 'c' } }),
    ];
    const out = coalesce(ops);
    expect(out).toHaveLength(1);
    expect(out[0]?.payload).toMatchObject({ id: 'r', title: 'c' });
  });

  it('merges fields rather than dropping earlier ones', () => {
    const ops = [
      op({ id: '1', createdAt: 1, payload: { id: 'r', title: 'a' } }),
      op({ id: '2', createdAt: 2, payload: { id: 'r', cover_path: 'x' } }),
    ];
    expect(coalesce(ops)[0]?.payload).toEqual({ id: 'r', title: 'a', cover_path: 'x' });
  });

  it('lets a delete cancel the edits before it', () => {
    // Otherwise we create a row on the server purely to delete it, and fail
    // loudly if it was never there.
    const ops = [
      op({ id: '1', createdAt: 1, payload: { id: 'r', title: 'a' } }),
      op({ id: '2', createdAt: 2, kind: 'delete', payload: { id: 'r' } }),
    ];
    const out = coalesce(ops);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('delete');
  });

  it('treats an upsert after a delete as a real re-creation', () => {
    const ops = [
      op({ id: '1', createdAt: 1, kind: 'delete', payload: { id: 'r' } }),
      op({ id: '2', createdAt: 2, payload: { id: 'r', title: 'back' } }),
    ];
    expect(coalesce(ops)[0]?.kind).toBe('upsert');
  });

  it('keeps separate rows separate', () => {
    const ops = [
      op({ id: '1', createdAt: 1, payload: { id: 'r1' } }),
      op({ id: '2', createdAt: 2, payload: { id: 'r2' } }),
    ];
    expect(coalesce(ops)).toHaveLength(2);
  });

  it('does not merge across tables that happen to share a row id', () => {
    const ops = [
      op({ id: '1', createdAt: 1, table: 'countdowns', payload: { id: 'same' } }),
      op({ id: '2', createdAt: 2, table: 'list_items', payload: { id: 'same' } }),
    ];
    expect(coalesce(ops)).toHaveLength(2);
  });
});
