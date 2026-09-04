import { useEffect, useState } from 'react';

import { departureLine, togetherFor, zoneOffsetMinutes, type Visit } from '@twoends/core';

import { endVisit, openVisit, startVisit } from '../db/visits.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';

/**
 * Being in the same place, and stopping.
 *
 * Replaces the distance card while a visit is open, rather than sitting beside
 * it: "0 km" is a worse answer than not asking, and two cards about the same
 * fact is one too many.
 *
 * **Nothing here reads a position.** A visit starts because somebody said so,
 * or because a countdown they set themselves reached zero and they confirmed
 * it. Flipping the whole interface on a coarse, opt-in, possibly hours-stale
 * location would fail silently and recover confusingly, which is worse than
 * asking once.
 */
export function Arrival({
  mine,
  theirs,
  /** A countdown that has just reached zero, if there is one, to offer as a reason. */
  arrived,
  offerAlways = false,
  onChanged,
}: {
  mine: string;
  theirs: string;
  arrived?: { title: string } | null;
  /**
   * Show the invitation even when nothing has happened to prompt it.
   *
   * False on Home, and that is most of the fix for "I did not understand it".
   * These two are apart for most of the year; a card on the first screen asking
   * every morning whether they are in the same room is noise, and a question
   * with no occasion reads as the app not knowing anything about them. Home
   * only asks when a countdown *they set* has run out, which is a reason.
   * Everywhere else it lives in Us, where somebody goes looking.
   */
  offerAlways?: boolean;
  onChanged: () => void;
}) {
  const couple = useSession((s) => s.couple);
  const refreshSession = useSession((s) => s.refresh);

  const [visit, setVisit] = useState<Visit | null>(null);
  const [asking, setAsking] = useState(false);
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [justEnded, setJustEnded] = useState<Visit | null>(null);
  const [round, setRound] = useState(0);

  const now = useNow(60_000).getTime();
  // Days are counted in the couple's calendar, not the server's — see visitDays.
  const offset = zoneOffsetMinutes(couple?.day_timezone ?? 'UTC', new Date(now));

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId) return;

    let alive = true;
    void openVisit(coupleId).then((found) => {
      if (alive) setVisit(found);
    });
    return () => {
      alive = false;
    };
  }, [couple?.id, round]);

  async function begin() {
    if (!couple?.id) return;

    setBusy(true);
    const { error } = await startVisit(couple.id, place || null);
    setBusy(false);
    if (error) return;

    setAsking(false);
    setPlace('');
    setRound((n) => n + 1);
    // The couple row carries `together`, which the daily question is built
    // from. Without this the pack does not change until the next reload.
    void refreshSession();
    onChanged();
  }

  async function finish() {
    if (!visit) return;

    setBusy(true);
    const { error } = await endVisit(visit);
    setBusy(false);
    if (error) return;

    setJustEnded({ ...visit, ended_at: new Date().toISOString() });
    setVisit(null);
    setRound((n) => n + 1);
    void refreshSession();
    onChanged();
  }

  if (!couple?.member_b) return null;

  /*
    The day it ends.

    One line, no illustration, no encouragement, nothing that performs about it.
    It is a hard day and the app has nothing useful to add — saying how long it
    was and going quiet is the most respectful thing available to it.
  */
  if (justEnded) {
    return (
      <section className="bg-surface lift rounded-[28px] p-5">
        <p className="text-[0.95rem] leading-relaxed">{departureLine(justEnded, now, offset)}</p>
        <button
          type="button"
          onClick={() => setJustEnded(null)}
          className="text-ash mt-3 h-9 text-sm underline underline-offset-4"
        >
          All right
        </button>
      </section>
    );
  }

  if (visit) {
    return (
      <section
        className="lift rounded-[28px] p-5"
        style={{
          background: `linear-gradient(145deg, color-mix(in oklab, ${mine} 26%, var(--color-tint-base)), color-mix(in oklab, ${theirs} 26%, var(--color-tint-base)))`,
        }}
      >
        <p className="text-ash text-sm">
          {visit.place_label ? `Together in ${visit.place_label}` : 'Together'}
        </p>
        <p className="counter mt-1 text-[2rem] leading-none font-medium">
          {togetherFor(visit.started_at, now)}
        </p>
        <p className="text-ash mt-3 text-[0.85rem] leading-relaxed">
          The counter is paused and the app is quieter. Nothing here will nudge you to send a
          photograph to somebody in the same room.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void finish()}
          className="bg-surface-2 text-chalk mt-4 h-11 w-full rounded-full text-sm font-medium disabled:opacity-40"
        >
          {busy ? 'Ending…' : 'This is over'}
        </button>
      </section>
    );
  }

  if (asking) {
    return (
      <section className="bg-surface lift rounded-[28px] p-5">
        <p className="font-display text-[1.15rem] leading-snug font-semibold">Start a visit</p>
        <p className="text-ash mt-1.5 text-sm leading-relaxed">
          For the days you are actually in the same place. Only one of you has to start it and the
          app changes for both:
        </p>
        <ul className="text-ash mt-3 flex flex-col gap-1.5 text-sm leading-relaxed">
          <li>· the distance stops being shown, and a counter says how long you have had</li>
          <li>· the questions stop being about missing each other</li>
          <li>· notifications go quiet — nothing nudges you to send a photo across the room</li>
          <li>· when it ends it becomes one memory, with every photo from those days in it</li>
        </ul>
        <p className="text-ash mt-3 text-sm leading-relaxed">
          It ends when either of you says it has. Nothing is deleted either way.
        </p>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium">Where are you? Optional.</span>
          <span className="text-ash text-[0.85rem] leading-relaxed">
            Only so the memory has a name afterwards — &ldquo;six days in Pune&rdquo; rather than
            &ldquo;six days&rdquo;.
          </span>
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            maxLength={40}
            placeholder="Pune"
            className="bg-surface-2 text-chalk w-full rounded-2xl px-4 py-3.5 outline-none placeholder:text-[var(--color-placeholder)] focus:ring-2 focus:ring-white/25"
          />
        </label>
        <div className="mt-3 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void begin()}
            className="text-void h-12 w-full rounded-full font-semibold disabled:opacity-40"
            style={{ background: mine }}
          >
            {busy ? 'Starting…' : 'We are together now'}
          </button>
          <button type="button" onClick={() => setAsking(false)} className="text-ash h-11 text-sm">
            Not yet
          </button>
        </div>
      </section>
    );
  }

  /*
    Offered rather than assumed, even when a countdown they set themselves has
    just run out. A trip can be delayed and a flight can be missed, and an app
    that had already rearranged itself would be wrong in the least forgiving way
    available to it.

    And only offered when there is a reason, unless somebody came looking. See
    `offerAlways`.
  */
  if (!arrived && !offerAlways) return null;

  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      className="bg-surface lift w-full rounded-[28px] p-5 text-left"
    >
      <p className="font-display text-[1.05rem] leading-snug font-semibold">
        {arrived ? `${arrived.title} is today. Are you together?` : 'Are you together?'}
      </p>
      <p className="text-ash mt-1.5 text-sm leading-relaxed">
        {arrived
          ? 'If this is the day you are actually in the same place, say so and the app changes for both of you until it ends.'
          : 'For the days you are in the same place. The distance goes, the app goes quiet, and it all becomes one memory afterwards.'}
      </p>
    </button>
  );
}
