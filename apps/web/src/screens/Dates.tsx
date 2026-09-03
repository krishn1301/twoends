import { useCallback, useEffect, useState } from 'react';

import {
  daysUntil,
  getAccent,
  localDateIn,
  recapTitle,
  visitTitle,
  zoneOffsetMinutes,
  type Visit,
} from '@twoends/core';
import { Avatar } from '@twoends/ui';
import { useLiveQuery } from 'dexie-react-hooks';

import { Empty, GhostCountdown, GhostMemory } from '../components/Empty.tsx';
import { Button, Field, TextInput } from '../components/Field.tsx';
import { catchUpRecaps, type Recap as RecapRow } from '../db/recap.ts';
import { pastVisits } from '../db/visits.ts';
import { Capsules } from './Capsules.tsx';
import { SharedList } from './SharedList.tsx';
import { addEntry, deleteEntry, type JournalEntry } from '../db/journal.ts';
import { addCountdown, removeCountdown } from '../db/repository.ts';
import { db } from '../db/schema.ts';
import { useChrome } from '../design/version.ts';
import { useAvatars } from '../state/avatars.ts';
import { useShared } from '../state/shared.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';
import { useOutbox } from '../state/useOutbox.ts';
import { Recap } from './Recap.tsx';

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

  const [view, setView] = useState<'ahead' | 'behind' | 'list' | 'sealed'>('ahead');
  const entries = useShared((s) => s.entries);
  const load = useShared((s) => s.load);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  /*
    The whole `tint` prop below is chrome — a sub-tab pill, an Add button, the
    day count on a Coming-up row. `mine` stays behind for `avatarFor`, which is
    the one thing on this screen that is about *whose* something is.
  */
  const chrome = useChrome(mine);
  const now = useNow(60_000).getTime();

  /*
    Every month that has closed, and any that were due while nobody was looking.

    Generated here rather than only by the scheduled function, so a couple whose
    cron missed an hour still gets their month — the function exists to send the
    notification, not to be the only way a recap can come into being. Racing
    with it is safe: the unique index makes the loser a no-op.
  */
  const [recaps, setRecaps] = useState<RecapRow[]>([]);
  const [openRecap, setOpenRecap] = useState<RecapRow | null>(null);

  /*
    Finished visits, which are the other kind of memory the app makes on its
    own. A closed visit is one object — the dates, how long, and every
    photograph taken between them — rather than a scatter of snaps somebody has
    to recognise as having been the same week.
  */
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId) return;

    let alive = true;
    void pastVisits(coupleId).then((found) => {
      if (alive) setVisits(found);
    });
    return () => {
      alive = false;
    };
  }, [couple?.id, couple?.together]);

  useEffect(() => {
    if (!couple?.started_on) return;

    let alive = true;
    void catchUpRecaps(couple, localDateIn(couple.day_timezone ?? 'UTC')).then((found) => {
      if (alive) setRecaps(found);
    });
    return () => {
      alive = false;
    };
  }, [couple]);

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

  if (openRecap) return <Recap recap={openRecap} onClose={() => setOpenRecap(null)} />;

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
              ['list', 'List'],
              ['sealed', 'Capsules'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`h-10 flex-1 rounded-full text-[0.78rem] font-medium transition-colors ${
                view === key ? 'text-void' : 'text-ash'
              }`}
              style={view === key ? { background: chrome } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'sealed' && <Capsules />}

        {/*
          The list lives here rather than in the tab bar. Three destinations is
          a deliberate cap — see TabBar — and "things we mean to do" is the same
          thought as "things that are coming", one step less committed.
        */}
        {view === 'list' && <SharedList coupleId={couple?.id} tint={chrome} />}

        {view === 'ahead' && (
          <Ahead coupleId={couple?.id} tint={chrome} now={now} rows={countdowns ?? []} />
        )}

        {view === 'behind' && visits.length > 0 && (
          <section className="mb-7">
            <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">Visits</h2>
            <div className="flex flex-col gap-3">
              {visits.map((visit) => (
                <div key={visit.id} className="bg-surface lift rounded-3xl px-5 py-4">
                  <p className="font-medium">
                    {visitTitle(
                      visit,
                      now,
                      zoneOffsetMinutes(couple?.day_timezone ?? 'UTC', new Date(now)),
                    )}
                  </p>
                  <p className="text-ash text-sm">{visitSpan(visit)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === 'behind' && recaps.length > 0 && (
          <section className="mb-7">
            <h2 className="text-ash mb-3 text-xs tracking-[0.18em] uppercase">Months</h2>
            <div className="flex flex-col gap-3">
              {recaps.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setOpenRecap(row)}
                  className="bg-surface lift flex items-center gap-4 rounded-3xl px-5 py-4 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{recapTitle(row.month)}</span>
                    <span className="text-ash text-sm">the whole month</span>
                  </span>
                  <span className="text-ash text-sm">Open</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === 'behind' && (
          <Behind
            coupleId={couple?.id}
            authorId={profile?.id}
            tint={chrome}
            mine={mine}
            theirs={theirs}
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
        <Empty ghost={<GhostCountdown chrome={tint} />}>
          <p className="text-ash text-[0.95rem] leading-relaxed">
            Nothing yet. A trip, a birthday, the next time you are in the same room.
          </p>
        </Empty>
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
  mine,
  theirs,
  entries,
  onChanged,
  avatarFor,
}: {
  coupleId?: string;
  authorId?: string;
  tint: string;
  /*
    The two accents, for the ghosted memory in the empty state. `avatarFor`
    cannot supply them: it takes an id, and the partner's id is not in scope
    here — which is exactly the point of the empty state, since a couple with
    nothing written down may not have a second row to read one from.
  */
  mine: string;
  theirs: string;
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
            className="bg-surface-2 text-chalk w-full resize-none rounded-2xl p-4 text-base outline-none placeholder:text-[var(--color-placeholder)] focus:ring-2 focus:ring-white/25"
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
        <Empty ghost={<GhostMemory mine={mine} theirs={theirs} />}>
          <p className="text-ash text-[0.95rem] leading-relaxed">
            Nothing written down yet. The small ones are the ones you forget.
          </p>
        </Empty>
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

/** "1 – 6 August", the two ends of a visit. */
function visitSpan(visit: { started_at: string; ended_at: string | null }): string {
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  return visit.ended_at
    ? `${day(visit.started_at)} – ${day(visit.ended_at)}`
    : day(visit.started_at);
}
