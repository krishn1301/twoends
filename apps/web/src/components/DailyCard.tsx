import { useCallback, useEffect, useState } from 'react';

import { dayLabel, getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { useSession } from '../state/session.ts';
import { useToday } from '../state/today.ts';

/**
 * Today's question — the core loop.
 *
 * Neither of you sees the other's answer until you have written your own, and
 * that is enforced by a Postgres policy rather than by this component. What
 * arrives here is already filtered, so the reveal is a fact rather than a
 * curtain someone can look behind with dev tools.
 *
 * The question itself needs no network: the pack ships in the bundle and both
 * devices derive the same prompt from the couple id and the local date.
 */
export function DailyCard() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const today = useToday((s) => s.today);
  const busy = useToday((s) => s.busy);
  const error = useToday((s) => s.error);
  const load = useToday((s) => s.load);
  const answer = useToday((s) => s.answer);

  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const theirName = partner?.display_name ?? 'them';

  const refreshToday = useCallback(() => {
    if (couple && profile) void load(couple, profile);
  }, [couple, profile, load]);

  useEffect(() => {
    refreshToday();

    // The partner may answer while this screen is open, or while the phone was
    // asleep. Both are worth catching without a manual pull-to-refresh.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshToday();
    };
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(refreshToday, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [refreshToday]);

  async function send() {
    if (!couple || !profile || draft.trim().length === 0) return;
    if (await answer(couple, profile, draft)) {
      setDraft('');
      setComposing(false);
    }
  }

  if (!today?.prompt) return null;

  const state = today.state;
  // Their colour when the app is waiting on you, yours when it is not — the
  // card is tinted by whoever the screen is leaning toward.
  const tint = state === 'your-move' ? theirs : mine;

  return (
    <section
      className="rounded-[28px] p-5"
      style={{ background: `color-mix(in oklab, ${tint} 18%, #15120F)` }}
    >
      <div className="mb-3 flex items-center gap-2">
        {state === 'your-move' && <Avatar name={theirName} accent={theirs} size={24} />}
        <span className="text-ash text-sm">{dayLabel(state, theirName)}</span>
      </div>

      <p className="font-display text-[1.45rem] leading-[1.22] font-semibold tracking-[-0.01em]">
        {today.prompt.body}
      </p>

      {/* Both answered: the reveal. Theirs first — it is the one you have been
          waiting for, and yours you already know. */}
      {state === 'revealed' && (
        <div className="mt-5 flex flex-col gap-3">
          <Answer name={theirName} accent={theirs} body={today.theirAnswer} />
          <Answer name="You" accent={mine} body={today.myAnswer} />
        </div>
      )}

      {state === 'waiting' && (
        <div className="mt-5">
          <Answer name="You" accent={mine} body={today.myAnswer} />
          <p className="text-ash mt-3 text-sm">
            Theirs unlocks the moment they answer. Neither of you sees the other first.
          </p>
        </div>
      )}

      {(state === 'open' || state === 'your-move') &&
        (composing ? (
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              autoFocus
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="However long or short you like."
              className="bg-void/50 text-chalk placeholder:text-ash/60 w-full resize-none rounded-2xl p-4 text-base outline-none focus:ring-2 focus:ring-white/25"
            />
            {error && (
              <p className="text-sm" style={{ color: '#e4566e' }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || draft.trim().length === 0}
                className="text-void flex-1 rounded-full py-3.5 font-semibold disabled:opacity-40"
                style={{ background: mine }}
              >
                {busy ? 'Sending…' : 'Send it'}
              </button>
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="text-ash rounded-full px-5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="text-void mt-5 w-full rounded-full py-3.5 text-[1.02rem] font-semibold"
            style={{ background: mine }}
          >
            {state === 'your-move' ? 'Write yours to see theirs' : 'Answer'}
          </button>
        ))}
    </section>
  );
}

function Answer({ name, accent, body }: { name: string; accent: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.28)' }}>
      <p className="mb-1.5 text-xs" style={{ color: accent }}>
        {name}
      </p>
      <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}
