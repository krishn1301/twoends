import { useCallback, useEffect, useRef, useState } from 'react';

import {
  momentForDay,
  momentLeft,
  momentOpensAt,
  momentState,
  type Moment,
} from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { signedUrls } from '../db/photos.ts';
import { shotsForDay, takeShot, type MomentShot } from '../db/moments.ts';
import { shrinkForUpload } from '../lib/image.ts';
import { useSession } from '../state/session.ts';

/**
 * Same thing, same time.
 *
 * Twenty minutes, once a day, at an hour neither of them chose. It is the only
 * thing in the app with a deadline, and the deadline is the whole point: a
 * photograph taken because a timer said so is a truer picture of an ordinary
 * Tuesday than one taken because it was worth photographing.
 *
 * It appears at its hour and stays until midnight. It used to remove itself
 * twenty minutes later, which cost the first real pair the feature ever had:
 * one of them took the photograph inside the window, the other opened the app
 * an hour after and found nothing there at all — and the first one watched
 * their own picture disappear off Home with it. Whatever the twenty minutes
 * were protecting, it was not worth that.
 */
export function MomentCard({
  minutes,
  localDate,
  mine,
  theirs,
}: {
  /** Minutes past midnight where the couple lives. */
  minutes: number;
  localDate: string;
  mine: string;
  theirs: string;
}) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const [shots, setShots] = useState<MomentShot[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const moment: Moment | null = couple?.id ? momentForDay(couple.id, localDate) : null;
  const state = moment ? momentState(moment, minutes) : null;

  const refresh = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId || !moment) return;

    let alive = true;
    void (async () => {
      const found = await shotsForDay(coupleId, localDate);
      if (!alive) return;
      setShots(found);

      const signed = await signedUrls(found.map((shot) => shot.storage_path));
      if (alive) setUrls(signed);
    })();

    return () => {
      alive = false;
    };
  }, [couple?.id, localDate, moment?.index, round]);

  /*
    While it is open, the other person's photograph can arrive at any second and
    there is nothing to pull down to refresh — the card is on Home and the
    window is twenty minutes. Polling beats realtime here: one query every ten
    seconds for twenty minutes a day is nothing, and a channel that has to be
    torn down at the right moment is a subscription leak waiting to happen.
  */
  useEffect(() => {
    if (state !== 'open' || shots.length !== 1) return;

    const poll = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(poll);
  }, [state, shots.length, refresh]);

  if (!moment || !couple?.id || !profile?.id) return null;

  const mineShot = shots.find((shot) => shot.author_id === profile.id);
  const theirShot = shots.find((shot) => shot.author_id !== profile.id);
  const both = Boolean(mineShot && theirShot);

  /*
    The one thing that still hides it: the hour has not come round yet is
    handled below, and a day where *neither* of them did anything and the
    invitation has gone stale is not worth a card. Anything you took yourself
    stays on the screen until midnight — a photograph you took at the app's
    request must never vanish from the app that asked for it.
  */

  // Before it opens, and only if they have not somehow already taken one.
  if (state === 'before') {
    return (
      <Shell tint={theirs}>
        <p className="text-ash text-sm">Some time after {momentOpensAt(moment)}</p>
        <p className="font-display mt-1 text-[1.15rem] leading-snug font-semibold">
          You will both be asked the same thing.
        </p>
        <p className="text-ash mt-2 text-[0.85rem] leading-relaxed">
          Twenty minutes to answer it, in a photograph. Neither of you sees the other&rsquo;s
          until both are in.
        </p>
      </Shell>
    );
  }

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen || !moment || !couple?.id || !profile?.id) return;

    setBusy(true);
    setError(null);

    try {
      // The same shrink a snap goes through. The original never leaves the
      // phone, which is a cost decision the whole app is built on.
      const { blob } = await shrinkForUpload(chosen);
      const sent = await takeShot(couple.id, profile.id, localDate, moment.prompt, blob);
      if (sent.error) setError(sent.error);
      else refresh();
    } catch {
      setError('That photo could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell tint={both ? undefined : theirs} gradient={both ? [mine, theirs] : undefined}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void choose(event)}
        className="hidden"
      />

      <p className="text-ash text-sm">
        {both
          ? 'Same thing, same time'
          : state === 'open'
            ? `${momentLeft(moment, minutes)} minutes left`
            : 'Still open today'}
      </p>
      <p className="font-display mt-1 text-[1.3rem] leading-snug font-semibold">{moment.prompt}</p>

      {both ? (
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
            <span className="text-ash text-xs">Both of you, on the same day.</span>
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
            {`Yours is in. Nothing shows until ${partner?.display_name ?? 'they'} takes one — they
            have until midnight.`}
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
            Neither of you sees the other&rsquo;s until both are in. It stays here until midnight.
          </p>
        </>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: '#e4566e' }}>
          {error}
        </p>
      )}
    </Shell>
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
