import { useCallback, useEffect, useState } from 'react';

import { daysUntil, getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';
import { useLiveQuery } from 'dexie-react-hooks';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { addEntry, deleteEntry, type JournalEntry } from '../db/journal.ts';
import { addCountdown, removeCountdown } from '../db/repository.ts';
import { db } from '../db/schema.ts';
import { useAvatars } from '../state/avatars.ts';
import { useShared } from '../state/shared.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';
import { useOutbox } from '../state/useOutbox.ts';

/**
 * Dates — the couple's calendar, in both directions.
 *
 * Countdowns look forward, memories look back, and they belong on one screen
 * because that is how people actually think about them: things that are coming,
 * and things that happened. Splitting them into two tabs would mean two mostly
 * empty screens.
 *
 * Countdowns come from Dexie and work offline. Memories do not yet — they are a
 * straight read, and moving them behind the outbox is a small job for whenever
 * writing one on a plane stops being hypothetical.
 */
export function Dates() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const { pending } = useOutbox();
  const urls = useAvatars((s) => s.urls);

  const [view, setView] = useState<'ahead' | 'behind'>('ahead');
  const entries = useShared((s) => s.entries);
  const load = useShared((s) => s.load);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const now = useNow(60_000).getTime();

  const countdowns = useLiveQuery(
    () =>
      db.countdowns
        .where('couple_id')
        .equals(couple?.id ?? '')
        .sortBy('target_at'),
    [couple?.id],
  );

  const loadEntries = useCallback(() => {
    if (couple) void load(couple);
  }, [couple, load]);

  useEffect(loadEntries, [loadEntries]);

  return (
    <div className="bg-void text-chalk min-h-full px-5 pt-6 pb-32">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Dates</h1>
          {pending > 0 && (
            <span className="text-ash text-sm" title="Saved here, waiting to reach the server">
              {pending} to sync
            </span>
          )}
        </header>

        <div className="bg-surface mb-6 flex gap-1 rounded-full p-1">
          {(
            [
              ['ahead', 'Coming up'],
              ['behind', 'Memories'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`h-10 flex-1 rounded-full text-sm font-medium transition-colors ${
                view === key ? 'text-void' : 'text-ash'
              }`}
              style={view === key ? { background: mine } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'ahead' ? (
          <Ahead coupleId={couple?.id} tint={mine} now={now} rows={countdowns ?? []} />
        ) : (
          <Behind
            coupleId={couple?.id}
            authorId={profile?.id}
            tint={mine}
            entries={entries}
            onChanged={loadEntries}
            avatarFor={(id) => {
              const person = id === profile?.id ? profile : partner;
              return {
                name: person?.display_name ?? '?',
                accent: id === profile?.id ? mine : theirs,
                src: person?.avatar_path ? urls.get(person.avatar_path) : null,
              };
            }}
          />
        )}
      </div>
    </div>
  );
}

function Ahead({
  coupleId,
  tint,
  now,
  rows,
}: {
  coupleId?: string;
  tint: string;
  now: number;
  rows: { id: string; title: string; target_at: string }[];
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!coupleId || !title.trim() || !date) return;
    await addCountdown({
      coupleId,
      title: title.trim(),
      targetAt: new Date(`${date}T09:00:00`).toISOString(),
    });
    setTitle('');
    setDate('');
  }

  return (
    <>
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

      {rows.length === 0 && (
        <p className="text-ash text-[0.95rem] leading-relaxed">
          Nothing yet. A trip, a birthday, the next time you are in the same room.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
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
    </>
  );
}

function Behind({
  coupleId,
  authorId,
  tint,
  entries,
  onChanged,
  avatarFor,
}: {
  coupleId?: string;
  authorId?: string;
  tint: string;
  entries: JournalEntry[];
  onChanged: () => void;
  avatarFor: (id: string) => { name: string; accent: string; src?: string | null };
}) {
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const [happenedOn, setHappenedOn] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!coupleId || !authorId || !body.trim()) return;

    setBusy(true);
    await addEntry({
      coupleId,
      authorId,
      body,
      placeLabel: place || null,
      happenedOn: happenedOn || null,
    });
    setBusy(false);

    setBody('');
    setPlace('');
    setHappenedOn('');
    onChanged();
  }

  return (
    <>
      <form onSubmit={add} className="mb-8 flex flex-col gap-3">
        <Field label="What happened?">
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="The bench by the lake, and the dog that would not leave."
            className="bg-surface-2 text-chalk placeholder:text-ash/60 w-full resize-none rounded-2xl p-4 text-base outline-none focus:ring-2 focus:ring-white/25"
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Where">
              <TextInput
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Optional"
                maxLength={60}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="When">
              <TextInput
                type="date"
                value={happenedOn}
                onChange={(e) => setHappenedOn(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <Button accent={tint} disabled={busy || !body.trim()}>
          {busy ? 'Saving…' : 'Remember it'}
        </Button>
      </form>

      {entries.length === 0 && (
        <p className="text-ash text-[0.95rem] leading-relaxed">
          Nothing written down yet. The small ones are the ones you forget.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {entries.map((entry) => {
          const who = avatarFor(entry.author_id);
          return (
            <li key={entry.id} className="bg-surface rounded-3xl p-5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <Avatar name={who.name} accent={who.accent} size={24} src={who.src} />
                <span className="text-ash text-xs">
                  {entry.happened_on}
                  {entry.place_label && ` · ${entry.place_label}`}
                </span>

                {/* Only your own. Their memory is not yours to delete. */}
                {entry.author_id === authorId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteEntry(entry.id);
                      onChanged();
                    }}
                    aria-label="Delete this memory"
                    className="text-ash ml-auto h-11 w-11 shrink-0 text-lg"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap">{entry.body}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
