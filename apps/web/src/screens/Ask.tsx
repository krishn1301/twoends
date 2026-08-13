import { useState } from 'react';

import { getAccent } from '@twoends/core';

import { Button, Field } from '../components/Field.tsx';
import { askQuestion, askToday } from '../db/asks.ts';
import { todaysPrompt } from '../db/daily.ts';
import { notifyPartner } from '../db/push.ts';
import { useSession } from '../state/session.ts';
import { useToday } from '../state/today.ts';

/**
 * Ask them something.
 *
 * Every app in this category ships a fixed deck, and the question you actually
 * want to ask is rarely in it. This writes one and puts it in front of the pair
 * today, in place of the app's.
 *
 * It reuses the whole daily loop underneath — the same prompt day, the same
 * answers, the same reveal that waits for both of you. So a question one of you
 * wrote behaves exactly like one that shipped with the app, including the part
 * where you have to answer it yourself before you can read theirs.
 */
export function Ask({ onAsked }: { onAsked?: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const loadToday = useToday((s) => s.load);

  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = getAccent(profile?.accent_key).onDark;
  const theirName = partner?.display_name ?? 'them';

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !profile || body.trim().length < 3) return;

    setBusy(true);
    setError(null);

    const { id, error: askError } = await askQuestion({
      coupleId: couple.id,
      authorId: profile.id,
      body,
    });

    if (askError || !id) {
      setBusy(false);
      setError(askError ?? 'Could not save that question.');
      return;
    }

    const { promptDayId, localDate } = todaysPrompt(couple);
    const { error: dayError } = await askToday({
      coupleId: couple.id,
      promptDayId,
      promptId: id,
      localDate,
    });

    setBusy(false);
    if (dayError) {
      setError(dayError);
      return;
    }

    setBody('');
    notifyPartner('asked');
    await loadToday(couple, profile);
    onAsked?.();
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <p className="text-ash text-[0.95rem] leading-relaxed">
        This replaces today&rsquo;s question for both of you. You will have to answer it yourself
        before you can read {theirName}&rsquo;s — same as any other day.
      </p>

      <Field label="Your question" error={error}>
        <textarea
          autoFocus
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Something you have been meaning to ask."
          maxLength={280}
          className="bg-surface-2 text-chalk placeholder:text-ash/60 w-full resize-none rounded-2xl p-4 text-base outline-none focus:ring-2 focus:ring-white/25"
        />
      </Field>

      <Button accent={mine} disabled={busy || body.trim().length < 3}>
        {busy ? 'Asking…' : 'Ask it today'}
      </Button>
    </form>
  );
}
