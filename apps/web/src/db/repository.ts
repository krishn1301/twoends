import type { SyncTable } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';
import { enqueue, mirrorFor, type MirroredRow } from './outbox.ts';
import { db, type Countdown } from './schema.ts';

/**
 * The only thing the UI talks to.
 *
 * Reads come from Dexie, always — never from the network, even when the network
 * is right there. That single rule is what makes every screen render instantly
 * and work on a train, and it is why there is no loading spinner anywhere in
 * this app: there is nothing to wait for.
 *
 * Writes go to the outbox, which applies them locally in the same transaction
 * and sends them when it can.
 */

/** Client-generated so an offline write has a stable identity from birth. */
export const newId = (): string => crypto.randomUUID();

// ── countdowns ───────────────────────────────────────────────────────────────

export async function addCountdown(input: {
  coupleId: string;
  title: string;
  targetAt: string;
}): Promise<string> {
  const id = newId();
  await enqueue('countdowns', 'upsert', {
    id,
    couple_id: input.coupleId,
    title: input.title,
    target_at: input.targetAt,
    cover_path: null,
    created_at: new Date().toISOString(),
  });
  return id;
}

export async function renameCountdown(id: string, title: string): Promise<void> {
  const existing = await db.countdowns.get(id);
  if (!existing) return;
  await enqueue('countdowns', 'upsert', { ...existing, title });
}

export async function removeCountdown(id: string): Promise<void> {
  await enqueue('countdowns', 'delete', { id });
}

export const listCountdowns = (coupleId: string): Promise<Countdown[]> =>
  db.countdowns.where('couple_id').equals(coupleId).sortBy('target_at');

/**
 * The one worth putting on a home screen: the soonest that has not passed.
 *
 * Pure, and shared by Home, the widget snapshot and anything else that needs
 * "the next one" — because the rule has a judgement in it that must not drift
 * between them. A countdown stays current for a day *after* its date: the
 * evening of the day she lands is not the moment to replace "she lands today"
 * with the next thing on the list.
 */
export function soonestCountdown<T extends { target_at: string }>(
  rows: readonly T[],
  nowMs: number = Date.now(),
): T | undefined {
  return rows
    .filter((row) => Date.parse(row.target_at) >= nowMs - 86_400_000)
    .sort((a, b) => Date.parse(a.target_at) - Date.parse(b.target_at))[0];
}

// ── the shared list ──────────────────────────────────────────────────────────

/**
 * Things the two of you mean to do.
 *
 * `kind` splits one table into several lists rather than giving each its own —
 * the rows are identical in shape, and a `watch` list and a `date` list differ
 * only in the word at the top. Adding "places" later is a string, not a
 * migration.
 *
 * Done is a timestamp rather than a boolean, on purpose: "we did this in March"
 * is worth keeping, and a boolean throws that away the moment it is set.
 */
export const LIST_KINDS = ['date', 'watch', 'go', 'someday'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export async function addListItem(input: {
  coupleId: string;
  kind: ListKind;
  title: string;
}): Promise<string> {
  const id = newId();
  await enqueue('list_items', 'upsert', {
    id,
    couple_id: input.coupleId,
    kind: input.kind,
    title: input.title,
    done_at: null,
    created_at: new Date().toISOString(),
  });
  return id;
}

/**
 * Ticks an item off, or un-ticks it.
 *
 * Either of you may tick either item, including one the other person added.
 * A shared list where each person can only complete their own entries is two
 * lists in a trench coat.
 */
export async function setListItemDone(id: string, done: boolean): Promise<void> {
  const existing = await db.list_items.get(id);
  if (!existing) return;
  await enqueue('list_items', 'upsert', {
    ...existing,
    done_at: done ? new Date().toISOString() : null,
  });
}

export async function renameListItem(id: string, title: string): Promise<void> {
  const existing = await db.list_items.get(id);
  if (!existing) return;
  await enqueue('list_items', 'upsert', { ...existing, title });
}

export async function removeListItem(id: string): Promise<void> {
  await enqueue('list_items', 'delete', { id });
}

// ── pulling ──────────────────────────────────────────────────────────────────

/**
 * Tables the client mirrors, and the column each is ordered by when catching up.
 */
const MIRRORED: ReadonlyArray<[SyncTable, string]> = [
  ['countdowns', 'created_at'],
  ['answers', 'created_at'],
  ['journal_entries', 'created_at'],
  ['canvases', 'created_at'],
  ['list_items', 'created_at'],
];

/**
 * Catches the local database up with the server.
 *
 * Incremental: each table remembers the newest timestamp it has seen, so a
 * reconnect asks for what changed rather than re-downloading a year of rows on
 * a metered connection.
 *
 * Rows with a write still queued locally are skipped — that is the conflict rule
 * from `@twoends/core`, and without it your own unsent edit would snap back to
 * the server's older copy the moment you reconnected.
 */
export async function pull(): Promise<void> {
  const pending = await db.outbox.toArray();
  const pendingIds = new Set(
    pending.map((op) => `${op.table}:${(op.payload as { id?: string }).id}`),
  );

  for (const [table, cursorColumn] of MIRRORED) {
    const local = mirrorFor(table);
    if (!local) continue;

    const key = `pulled:${table}`;
    const since = (await db.meta.get(key))?.value;

    let query = supabase
      .from(table)
      .select('*')
      .order(cursorColumn, { ascending: true })
      .limit(500);
    if (since) query = query.gt(cursorColumn, since);

    const { data, error } = await query;
    if (error || !data?.length) continue;

    const rows = (data as MirroredRow[]).filter((row) => !pendingIds.has(`${table}:${row.id}`));
    if (rows.length > 0) await local.bulkPut(rows);

    const newest = data.at(-1) as Record<string, string> | undefined;
    if (newest?.[cursorColumn]) {
      await db.meta.put({ key, value: newest[cursorColumn] });
    }
  }
}

/**
 * Live updates from the partner's device.
 *
 * Realtime is an optimisation on top of `pull`, not a replacement for it: a
 * dropped socket, a backgrounded tab or a missed event would otherwise leave the
 * two devices quietly out of step, and nobody debugs "quietly out of step". Pull
 * runs on every reconnect regardless.
 */
export function subscribe(coupleId: string): () => void {
  const channel = supabase.channel(`couple:${coupleId}`);

  for (const [table] of MIRRORED) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `couple_id=eq.${coupleId}` },
      (payload) => {
        void applyRemote(table, payload);
      },
    );
  }

  void channel.subscribe();
  return () => void supabase.removeChannel(channel);
}

async function applyRemote(
  table: SyncTable,
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> },
): Promise<void> {
  const local = mirrorFor(table);
  if (!local) return;

  const id = (payload.new?.id ?? payload.old?.id) as string | undefined;
  if (!id) return;

  // An unsent local write outranks anything arriving from the server.
  const pending = await db.outbox
    .where('table')
    .equals(table)
    .filter((op) => (op.payload as { id?: string }).id === id)
    .count();
  if (pending > 0) return;

  if (payload.eventType === 'DELETE') await local.delete(id);
  else await local.put(payload.new as never);
}
