import { useCallback, useEffect, useRef, useState } from 'react';

import { dayLabel, getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { useChrome, useIsV2 } from '../design/version.ts';
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
export function DailyCard({ onAsk }: { onAsk?: () => void }) {
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
  const v2 = useIsV2();
  const chrome = useChrome(mine);

  /*
    **Items 6 and 8.** Two things about the moment both answers exist.

    The card used to swap its content in place, so the single most anticipated
    event in the app's day — their answer landing — happened silently. And once
    it had landed the card stayed about 470px tall and filled the whole first
    screen with a finished question, so Today and Together did not begin until
    you scrolled past something there was nothing left to do with.

    So: the block opens when the answer *arrives*, and afterwards the card is
    compact with both answers one tap away. `arrived` counts arrivals rather
    than describing a state, because it is used as a `key` — a CSS animation
    that has already finished cannot be restarted by adding a class, only by
    remounting the element it is on.
  */
  const [expanded, setExpanded] = useState(false);
  const [arrived, setArrived] = useState(0);
  const seen = useRef<string | undefined>(undefined);

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

  const state = today?.state;

  useEffect(() => {
    if (seen.current === 'waiting' && state === 'revealed') {
      setArrived((n) => n + 1);
      // Open, because you are looking at it. Coming back to it later gets the
      // compact card; watching it happen does not.
      setExpanded(true);
    }
    seen.current = state;
  }, [state]);

  async function send() {
    if (!couple || !profile || draft.trim().length === 0) return;
    if (await answer(couple, profile, draft)) {
      setDraft('');
      setComposing(false);
    }
  }

  if (!today?.prompt || !state) return null;

  /*
    Their colour when the app is waiting on you, yours when it is not — the card
    is tinted by whoever the screen is leaning toward.

    Left as an accent rather than moved to chrome under item 1, and deliberately:
    this tint answers "whose move is it", which is exactly the authorship
    question the accents are being reserved *for*. It changes with the person,
    so it is not interface colour.
  */
  const tint = state === 'your-move' ? theirs : mine;

  /** Item 6: compact once the day is done, unless the reveal just happened. */
  const collapsed = v2 && state === 'revealed' && !expanded;

  return (
    <section
      className="rounded-[28px] p-5"
      style={{ background: `color-mix(in oklab, ${tint} 18%, var(--color-surface))` }}
    >
      <div className="mb-3 flex items-center gap-2">
        {state === 'your-move' && <Avatar name={theirName} accent={theirs} size={24} />}
        <span className="text-ash text-sm">
          {today.isCustom ? 'One of you asked this' : dayLabel(state, theirName)}
        </span>

        {/*
          Only offered before anyone has answered. Swapping the question out
          from under someone who has already written a reply would throw their
          words away.
        */}
        {onAsk && state === 'open' && (
          <button
            type="button"
            onClick={onAsk}
            className="text-ash ml-auto h-9 text-sm underline underline-offset-4"
          >
            Ask your own
          </button>
        )}
      </div>

      <p
        className={`font-display leading-[1.22] font-semibold tracking-[-0.01em] ${
          collapsed ? 'text-[1.15rem]' : 'text-[1.45rem]'
        }`}
      >
        {today.prompt.body}
      </p>

      {/* Both answered: the reveal. Theirs first — it is the one you have been
          waiting for, and yours you already know. */}
      {state === 'revealed' &&
        (collapsed ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 flex w-full items-center gap-2.5 text-left"
          >
            <span className="flex -space-x-2">
              <Avatar name={theirName} accent={theirs} size={22} />
              <Avatar name="You" accent={mine} size={22} />
            </span>
            <span className="text-ash text-sm">You both answered</span>
            <span className="text-ash ml-auto text-sm underline underline-offset-4">Read</span>
          </button>
        ) : (
          <div
            /*
              Item 8. Keyed on the arrival so the unfold runs when their answer
              lands and not on every render of a day that was already finished.
            */
            key={arrived}
            className={`mt-5 ${v2 && arrived > 0 ? 'unfold' : ''}`}
          >
            <div className="flex flex-col gap-3">
              <Answer name={theirName} accent={theirs} body={today.theirAnswer} v2={v2} />
              <Answer name="You" accent={mine} body={today.myAnswer} v2={v2} />
              {v2 && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-ash h-9 self-start text-sm underline underline-offset-4"
                >
                  Fold away
                </button>
              )}
            </div>
          </div>
        ))}

      {state === 'waiting' && (
        <div className="mt-5">
          <Answer name="You" accent={mine} body={today.myAnswer} v2={v2} />
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
              className="bg-void/50 text-chalk w-full resize-none rounded-2xl p-4 text-base outline-none placeholder:text-[var(--color-placeholder)] focus:ring-2 focus:ring-white/25"
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
                style={{ background: chrome }}
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
            style={{ background: chrome }}
          >
            {state === 'your-move' ? 'Write yours to see theirs' : 'Answer'}
          </button>
        ))}
    </section>
  );
}

/**
 * One person's answer.
 *
 * **Item 9.** Both blocks were the same surface and the only thing separating
 * them was a 12px name in the author's colour — so whose was whose took reading
 * rather than glancing. The block carries the author's colour along its left
 * edge now, which is the same signal at a distance and costs no contrast: the
 * words stay chalk on the same dark ground they were always on.
 */
function Answer({
  name,
  accent,
  body,
  v2 = false,
}: {
  name: string;
  accent: string;
  body: string | null;
  v2?: boolean;
}) {
  if (!body) return null;
  return (
    <div
      className={`rounded-2xl p-4 ${v2 ? 'pl-5' : ''}`}
      style={{
        background: 'rgba(0,0,0,0.28)',
        boxShadow: v2 ? `inset 3px 0 0 ${accent}` : undefined,
      }}
    >
      <p className="mb-1.5 text-xs" style={{ color: accent }}>
        {name}
      </p>
      <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}
