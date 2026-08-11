import { useState } from 'react';

import { daysUntil, getAccent } from '@twoends/core';
import { useLiveQuery } from 'dexie-react-hooks';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { db } from '../db/schema.ts';
import { addCountdown, removeCountdown } from '../db/repository.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';
import { useOutbox } from '../state/useOutbox.ts';

/**
 * Countdowns — and the first screen that proves the local-first engine.
 *
 * Everything here reads from Dexie through `useLiveQuery`, so adding one in
 * airplane mode appears instantly and stays after a reload. Nothing waits on a
 * network round trip, which is why there is no spinner and no optimistic-update
 * dance: the local write *is* the update, and the outbox catches the server up
 * whenever it can.
 */
export function Countdowns() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const { pending } = useOutbox();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const tint = getAccent(profile?.accent_key ?? 'teal').onDark;

  // The querier must always return a promise — returning undefined when there
  // is no couple makes useLiveQuery's own types unsatisfiable. An empty couple
  // id simply matches nothing, which is the same outcome without the branch.
  const rows = useLiveQuery(
    () =>
      db.countdowns
        .where('couple_id')
        .equals(couple?.id ?? '')
        .sortBy('target_at'),
    [couple?.id],
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !title.trim() || !date) return;
    await addCountdown({
      coupleId: couple.id,
      title: title.trim(),
      targetAt: new Date(`${date}T09:00:00`).toISOString(),
    });
    setTitle('');
    setDate('');
  }

  // A minute is plenty: these roll over at midnight, not by the second.
  const now = useNow(60_000).getTime();

  return (
    <div className="bg-void text-chalk min-h-full px-5 pt-6 pb-32">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Countdowns</h1>
          {pending > 0 && (
            <span className="text-ash text-sm" title="Saved here, waiting to reach the server">
              {pending} to sync
            </span>
          )}
        </header>

        <form onSubmit={add} className="mb-8 flex flex-col gap-3">
          <Field label="What are you waiting for?">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="She lands in Pune"
              maxLength={60}
            />
          </Field>
          <Field label="When">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button accent={tint} disabled={!title.trim() || !date}>
            Add it
          </Button>
        </form>

        {rows?.length === 0 && (
          <p className="text-ash text-[0.95rem] leading-relaxed">
            Nothing yet. A trip, a birthday, the next time you are in the same room.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {rows?.map((row) => {
            const left = daysUntil(Date.parse(row.target_at), now);
            return (
              <li key={row.id} className="bg-surface flex items-center gap-4 rounded-3xl px-5 py-4">
                <span className="counter text-2xl leading-none" style={{ color: tint }}>
                  {left}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.title}</span>
                  <span className="text-ash text-sm">
                    {left === 0 ? 'today' : left === 1 ? 'tomorrow' : `${left} days`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void removeCountdown(row.id)}
                  aria-label={`Remove ${row.title}`}
                  className="text-ash h-11 w-11 shrink-0 text-lg"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
