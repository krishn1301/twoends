import { useCallback, useEffect, useState } from 'react';

import { daysUntil, getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { Empty, GhostCapsule } from '../components/Empty.tsx';
import { Button, Field, TextInput } from '../components/Field.tsx';
import { sealCapsule } from '../db/capsules.ts';
import { notifyPartner } from '../db/push.ts';
import { useChrome } from '../design/version.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';
import { useNow } from '../state/useNow.ts';

/**
 * Time capsules.
 *
 * Write something now that neither of you can read until a date you pick. The
 * seal is enforced by the database — the author cannot read their own back
 * early either, which is the whole point. A capsule you can reread on a bad
 * Tuesday is just a note.
 *
 * The sealed ones are still listed, with their titles and dates, because the
 * waiting is most of the pleasure. Titles and dates cross; not a word of the
 * body does.
 */
export function Capsules() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const sealed = useShared((s) => s.sealed);
  const opened = useShared((s) => s.opened);
  const loadShared = useShared((s) => s.load);

  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [deliverOn, setDeliverOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = getAccent(profile?.accent_key).onDark;
  const theirs = getAccent(partner?.accent_key).onDark;
  const chrome = useChrome(mine);
  const now = useNow(60_000).getTime();

  const load = useCallback(() => {
    if (couple) void loadShared(couple);
  }, [couple, loadShared]);

  useEffect(load, [load]);

  async function seal(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !profile || !body.trim() || !deliverOn) return;

    setBusy(true);
    setError(null);
    const { error } = await sealCapsule({
      coupleId: couple.id,
      authorId: profile.id,
      title,
      body,
      // Morning, so it opens as part of a day rather than at midnight when
      // nobody is looking.
      deliverAt: new Date(`${deliverOn}T09:00:00`).toISOString(),
    });
    setBusy(false);

    if (error) {
      setError(error);
      return;
    }
    setTitle('');
    setBody('');
    setDeliverOn('');
    setWriting(false);
    notifyPartner('capsule');
    load();
  }

  // Derived from the ticking clock rather than `Date.now()` in the render body,
  // which is impure and can differ between two renders of the same frame.
  const soonest = new Date(now + 86_400_000).toISOString().slice(0, 10);

  if (writing) {
    return (
      <form onSubmit={seal} className="flex flex-col gap-4">
        <p className="text-ash text-[0.95rem] leading-relaxed">
          Neither of you can open this until the day you choose — not even you. That is what makes
          it worth writing.
        </p>

        <Field label="What is it about?" hint="They will see this much while it waits.">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="For your birthday"
            maxLength={60}
          />
        </Field>

        <Field label="The letter">
          <textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write it to whoever you both are by then."
            className="bg-surface-2 text-chalk w-full resize-none rounded-2xl p-4 text-base outline-none placeholder:text-[var(--color-placeholder)] focus:ring-2 focus:ring-white/25"
          />
        </Field>

        <Field label="Opens on" hint="Tomorrow at the earliest.">
          <TextInput
            type="date"
            min={soonest}
            value={deliverOn}
            onChange={(e) => setDeliverOn(e.target.value)}
          />
        </Field>

        {error && (
          <p className="text-sm" style={{ color: '#e4566e' }}>
            {error}
          </p>
        )}

        <Button accent={chrome} disabled={busy || !body.trim() || !deliverOn}>
          {busy ? 'Sealing…' : 'Seal it'}
        </Button>
        <Button type="button" variant="quiet" accent={chrome} onClick={() => setWriting(false)}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button accent={chrome} onClick={() => setWriting(true)}>
        Write one
      </Button>

      {sealed.length === 0 && opened.length === 0 && (
        <Empty ghost={<GhostCapsule mine={mine} theirs={theirs} />}>
          <p className="text-ash py-6 text-[0.95rem] leading-relaxed">
            Nothing sealed yet. A letter for an anniversary, or for a day you already know will be
            hard.
          </p>
        </Empty>
      )}

      {sealed.length > 0 && (
        <section>
          <h3 className="text-ash mb-2 px-1 text-xs tracking-[0.18em] uppercase">Sealed</h3>
          <ul className="flex flex-col gap-3">
            {sealed.map((capsule) => {
              const left = daysUntil(Date.parse(capsule.deliver_at), now);
              const isTheirs = capsule.author_id !== profile?.id;
              return (
                <li
                  key={`${capsule.deliver_at}-${capsule.author_id}`}
                  className="bg-surface flex items-center gap-4 rounded-3xl px-5 py-4"
                >
                  <span
                    className="counter text-xl leading-none"
                    style={{ color: isTheirs ? theirs : mine }}
                  >
                    {left}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {capsule.title ?? 'A letter'}
                    </span>
                    <span className="text-ash text-sm">
                      {isTheirs ? `${partner?.display_name ?? 'They'} sealed it` : 'You sealed it'}{' '}
                      · opens in {left} {left === 1 ? 'day' : 'days'}
                    </span>
                  </span>
                  <Lock />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {opened.length > 0 && (
        <section className="mt-2">
          <h3 className="text-ash mb-2 px-1 text-xs tracking-[0.18em] uppercase">Opened</h3>
          <ul className="flex flex-col gap-3">
            {opened.map((capsule) => {
              const isTheirs = capsule.author_id !== profile?.id;
              return (
                <li key={capsule.id} className="bg-surface rounded-3xl p-5">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <Avatar
                      name={
                        isTheirs ? (partner?.display_name ?? '?') : (profile?.display_name ?? '?')
                      }
                      accent={isTheirs ? theirs : mine}
                      size={24}
                    />
                    <span className="text-ash text-xs">
                      {capsule.title ? `${capsule.title} · ` : ''}
                      sealed for {capsule.deliver_at.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap">
                    {capsule.body}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Lock() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" fill="none" aria-label="Sealed">
      <rect x="4" y="10.5" width="16" height="11" rx="2.5" fill="#948A82" />
      <path
        d="M8 10.5V7.5a4 4 0 0 1 8 0v3"
        stroke="#948A82"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
