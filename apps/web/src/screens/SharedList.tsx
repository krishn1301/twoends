import { useState } from 'react';

import { useLiveQuery } from 'dexie-react-hooks';

import { Button, TextInput } from '../components/Field.tsx';
import {
  LIST_KINDS,
  addListItem,
  removeListItem,
  setListItemDone,
  type ListKind,
} from '../db/repository.ts';
import { db, type ListItem } from '../db/schema.ts';

/**
 * The shared list — things the two of you mean to do.
 *
 * Deliberately not a task manager. No assignee, no due date, no priority, no
 * reminders. Every one of those turns "we should watch that" into work, and the
 * thing this list is for is the sentence somebody says at eleven at night that
 * both of you have forgotten by Tuesday.
 *
 * Either person can tick anything, including an item the other one added. A
 * shared list where you can only complete your own entries is two lists in a
 * trench coat.
 *
 * Reads come from Dexie and writes go through the outbox, so this works on a
 * train and on a plane — which is most of the point when half the couples using
 * it are long distance and adding things from an airport.
 */

const LABELS: Record<ListKind, { tab: string; prompt: string; empty: string }> = {
  date: {
    tab: 'Do',
    prompt: 'Something to do together',
    empty: 'Nothing yet. The next time you are in the same city, what happens first?',
  },
  watch: {
    tab: 'Watch',
    prompt: 'Something to watch',
    empty: 'Nothing yet. The one you keep meaning to start.',
  },
  go: {
    tab: 'Go',
    prompt: 'Somewhere to go',
    empty: 'Nothing yet. Anywhere counts, including the place round the corner.',
  },
  someday: {
    tab: 'Someday',
    prompt: 'Something for later',
    empty: 'Nothing yet. The unreasonable ones belong here.',
  },
};

export function SharedList({ coupleId, tint }: { coupleId?: string; tint: string }) {
  const [kind, setKind] = useState<ListKind>('date');
  const [title, setTitle] = useState('');

  const rows = useLiveQuery(
    () =>
      db.list_items
        .where('couple_id')
        .equals(coupleId ?? '')
        .toArray(),
    [coupleId],
  );

  const forKind = (rows ?? []).filter((row) => row.kind === kind);

  /*
    Open first, oldest at the top; done sink to the bottom, most recently ticked
    first. Ticking something makes it move, which is the whole reward, and a
    finished item that vanishes takes the evidence with it.
  */
  const open = forKind
    .filter((row) => !row.done_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = forKind
    .filter((row) => row.done_at)
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!coupleId || !text) return;
    setTitle('');
    await addListItem({ coupleId, kind, title: text });
  }

  return (
    <>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {LIST_KINDS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            aria-pressed={kind === key}
            className={`h-9 shrink-0 rounded-full px-4 text-[0.8rem] font-medium transition-colors ${
              kind === key ? 'text-void' : 'text-ash bg-surface'
            }`}
            style={kind === key ? { background: tint } : undefined}
          >
            {LABELS[key].tab}
          </button>
        ))}
      </div>

      <form onSubmit={add} className="mb-7 flex gap-2">
        <TextInput
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={LABELS[kind].prompt}
          maxLength={120}
          aria-label={LABELS[kind].prompt}
        />
        <Button accent={tint} disabled={!title.trim()} className="shrink-0 px-5">
          Add
        </Button>
      </form>

      {open.length === 0 && done.length === 0 && (
        <p className="text-ash text-[0.95rem] leading-relaxed">{LABELS[kind].empty}</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {open.map((row) => (
          <Row key={row.id} row={row} tint={tint} />
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="text-ash mt-8 mb-2.5 px-1 text-xs tracking-[0.18em] uppercase">
            Done — {done.length}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {done.map((row) => (
              <Row key={row.id} row={row} tint={tint} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Row({ row, tint }: { row: ListItem; tint: string }) {
  const done = row.done_at != null;

  return (
    <li className="bg-surface flex items-center gap-3 rounded-3xl py-3 pr-2 pl-4">
      {/*
        The tick is the whole row's button, not a small circle beside it. On a
        phone, a 24px checkbox next to 300px of tappable-looking text is a
        target people miss and then think the app is broken.
      */}
      <button
        type="button"
        onClick={() => void setListItemDone(row.id, !done)}
        aria-pressed={done}
        className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.7rem]"
          style={
            done
              ? { background: tint, color: '#000' }
              : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.22)' }
          }
          aria-hidden="true"
        >
          {done ? '✓' : ''}
        </span>
        <span className={`min-w-0 text-[0.95rem] leading-snug ${done ? 'text-ash' : ''}`}>
          <span className={done ? 'line-through decoration-1' : ''}>{row.title}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => void removeListItem(row.id)}
        aria-label={`Remove ${row.title}`}
        className="text-ash grid h-11 w-11 shrink-0 place-items-center text-lg"
      >
        ×
      </button>
    </li>
  );
}
