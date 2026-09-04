import { useCallback, useEffect, useRef, useState } from 'react';

import {
  momentForDay,
  momentLeft,
  momentOpensAt,
  momentState,
  type Moment,
  type MomentState,
} from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { signedUrls } from '../db/photos.ts';
import { momentStartedAt, shotsForDay, takeShot, type MomentShot } from '../db/moments.ts';
import { notifyPartner } from '../db/push.ts';
import { shrinkForUpload } from '../lib/image.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';

/**
 * Same thing, same time.
 *
 * The hour is derived on both phones and chosen by neither. The *clock* starts
 * when one of them actually takes a photograph, and the other has an hour.
 *
 * **It moves down the screen rather than disappearing.** It used to delete
 * itself when its window closed, which cost the first real pair the feature
 * ever had — one of them took the picture, the other opened the app later to
 * nothing at all, and the first watched their own photograph vanish off Home.
 * A card that is over is not a card that should be at the top; it is also not
 * a card that should be gone. Before its hour and after its hour it renders in
 * the bottom slot, and for the hour in between it is the third thing on Home.
 */
export function MomentCard({
  minutes,
  localDate,
  mine,
  theirs,
  place,
  delay,
}: {
  /** Minutes past midnight where the couple lives. */
  minutes: number;
  localDate: string;
  mine: string;
  theirs: string;
  /**
   * Which of Home's two slots this instance is.
   *
   * Home renders both and each one hides itself when the moment does not belong
   * to it. The alternative — Home deciding — means the ordering rule and the
   * state machine live in different files and drift the first time either
   * moves.
   */
  place: 'top' | 'bottom';
  /** The stagger for this slot. Home's delays are literals tied to position. */
  delay: string;
}) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const [shots, setShots] = useState<MomentShot[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // A minute is the resolution of the countdown, so a minute is the tick.
  const now = useNow(60_000).getTime();

  const moment: Moment | null = couple?.id ? momentForDay(couple.id, localDate) : null;
  const state: MomentState | null = moment ? momentState(moment, minutes, startedAt, now) : null;

  const refresh = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId || !moment) return;

    let alive = true;
    void (async () => {
      /*
        Both in one round trip. The clock has to come from a function rather
        than from the rows, because until you have taken one of your own the
        partner's row is not readable at all — see migration 31.
      */
      const [found, began] = await Promise.all([
        shotsForDay(coupleId, localDate),
        momentStartedAt(coupleId, localDate),
      ]);
      if (!alive) return;

      setShots(found);
      setStartedAt(began);

      const signed = await signedUrls(found.map((shot) => shot.storage_path));
      if (alive) setUrls(signed);
    })();

    return () => {
      alive = false;
    };
  }, [couple?.id, localDate, moment?.index, round]);

  /*
    While the moment is live, two things can arrive without anything on this
    device doing anything: the other person's photograph, and the start of the
    clock. There is nothing to pull down to refresh on Home.

    Thirty seconds rather than the ten it used to be, because this can now run
    for an hour rather than twenty minutes. Polling still beats realtime here —
    a channel that has to be torn down at the right moment is a subscription
    leak waiting to happen, and this one stops on its own when the hour does.
  */
  const both = shots.length === 2;
  const live = state === 'waiting' || state === 'running';

  useEffect(() => {
    if (!live || both) return;

    const poll = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(poll);
  }, [live, both, refresh]);

  if (!moment || !state || !couple?.id || !profile?.id) return null;

  // Live at the top, over or not yet at the bottom. One rule, one place.
  const belongsHere = (live ? 'top' : 'bottom') === place;
  if (!belongsHere) return null;

  const mineShot = shots.find((shot) => shot.author_id === profile.id);
  const theirShot = shots.find((shot) => shot.author_id !== profile.id);
  const paired = Boolean(mineShot && theirShot);
  const theirName = partner?.display_name ?? 'They';

  const wrapper = place === 'top' ? 'rise mb-9 px-5' : 'rise px-5';

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen || !moment || !couple?.id || !profile?.id) return;

    setBusy(true);
    setError(null);

    // Whether this is the one that starts the clock, read before the write.
    const first = startedAt === null;

    try {
      // The same shrink a snap goes through. The original never leaves the
      // phone, which is a cost decision the whole app is built on.
      const { blob } = await shrinkForUpload(chosen);
      const sent = await takeShot(couple.id, profile.id, localDate, moment.prompt, blob);
      if (sent.error) setError(sent.error);
      else {
        /*
          Only the first one pushes.

          An hour that starts silently is an hour the other person cannot see,
          and they have no other way to learn it began. The second photograph
          pushes nobody: it would tell the person who already went about a
          moment they finished, and it costs one of their two notifications a
          day to do it.
        */
        if (first) notifyPartner('moment');
        refresh();
      }
    } catch {
      setError('That photo could not be read.');
    } finally {
      setBusy(false);
    }
  }

  // Before it opens: the quiet version, at the bottom.
  if (state === 'before') {
    return (
      <div className={wrapper} style={{ animationDelay: delay }}>
        <Shell tint={theirs}>
          <p className="text-ash text-sm">Some time after {momentOpensAt(moment)}</p>
          <p className="font-display mt-1 text-[1.15rem] leading-snug font-semibold">
            You will both be asked the same thing.
          </p>
          <p className="text-ash mt-2 text-[0.85rem] leading-relaxed">
            Whoever takes theirs first starts an hour for the other. Neither of you sees the
            other&rsquo;s until both are in.
          </p>
        </Shell>
      </div>
    );
  }

  /*
    Over, and you took none.

    One flat line, at the bottom, and no number. Saying "you missed it" every
    evening would turn a gentle thing into a scoreboard — and saying nothing at
    all is how the card came to vanish without a trace, which is the report
    that started all of this.
  */
  if (state === 'closed' && !mineShot) {
    return (
      <div className={wrapper} style={{ animationDelay: delay }}>
        <p className="text-ash px-1 text-sm leading-relaxed">Today&rsquo;s went by.</p>
      </div>
    );
  }

  const left = momentLeft(startedAt, now);

  return (
    <div className={wrapper} style={{ animationDelay: delay }}>
      <Shell tint={paired ? undefined : theirs} gradient={paired ? [mine, theirs] : undefined}>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => void choose(event)}
          className="hidden"
        />

        <p className="text-ash text-sm">
          {paired
            ? 'Same thing, same time'
            : state === 'running'
              ? `${left} ${left === 1 ? 'minute' : 'minutes'} left`
              : state === 'waiting'
                ? 'Open now'
                : 'Today'}
        </p>
        <p className="font-display mt-1 text-[1.3rem] leading-snug font-semibold">
          {moment.prompt}
        </p>

        {paired ? (
          <>
            {/*
              The diptych. Each side framed in whoever took it, which is the only
              thing saying which is which — there is no caption and no name, and
              adding one would turn a pair of photographs into a table.
            */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[theirShot, mineShot].map((shot, index) => (
                <div
                  key={shot!.id}
                  className="aspect-square overflow-hidden rounded-2xl"
                  style={{ boxShadow: `inset 0 0 0 2px ${index === 0 ? theirs : mine}` }}
                >
                  <img
                    src={urls.get(shot!.storage_path)}
                    alt={index === 0 ? 'Theirs' : 'Yours'}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Avatar name={partner?.display_name ?? 'them'} accent={theirs} size={20} />
              <Avatar name={profile.display_name ?? 'you'} accent={mine} size={20} />
              <span className="text-ash text-xs">Both of you, within the hour.</span>
            </div>
          </>
        ) : mineShot ? (
          <>
            <div className="mt-4 aspect-square w-1/2 overflow-hidden rounded-2xl">
              <img
                src={urls.get(mineShot.storage_path)}
                alt="Yours"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-ash mt-3 text-[0.85rem] leading-relaxed">
              {state === 'running'
                ? `Yours is in, and it started the clock. ${theirName} ${
                    theirName === 'They' ? 'have' : 'has'
                  } ${left} ${left === 1 ? 'minute' : 'minutes'}.`
                : `Yours is in. ${theirName} did not get to it.`}
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="text-void mt-4 h-12 w-full rounded-full font-semibold disabled:opacity-40"
              style={{ background: mine }}
            >
              {busy ? 'Sending…' : 'Take it'}
            </button>
            <p className="text-ash mt-2 text-[0.85rem] leading-relaxed">
              {state === 'running'
                ? `${theirName} took theirs. Neither of you sees the other's until both are in.`
                : 'Whoever goes first starts an hour for the other. Neither of you sees the other’s until both are in.'}
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: '#e4566e' }}>
            {error}
          </p>
        )}
      </Shell>
    </div>
  );
}

function Shell({
  tint,
  gradient,
  children,
}: {
  tint?: string;
  gradient?: [string, string];
  children: React.ReactNode;
}) {
  return (
    <section
      className="lift rounded-[28px] p-5"
      style={{
        background: gradient
          ? `linear-gradient(145deg, color-mix(in oklab, ${gradient[0]} 22%, var(--color-tint-base)), color-mix(in oklab, ${gradient[1]} 22%, var(--color-tint-base)))`
          : tint
            ? `color-mix(in oklab, ${tint} 14%, var(--color-tint-base))`
            : 'var(--color-surface)',
      }}
    >
      {children}
    </section>
  );
}
