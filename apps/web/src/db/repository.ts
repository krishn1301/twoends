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
