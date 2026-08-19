import { useEffect, useMemo } from 'react';

import { localDateIn, occasionFor, type Occasion } from '@twoends/core';

import { forgetOldDays } from './seenToday.ts';
import { useSession } from './session.ts';
import { useNow } from './useNow.ts';

/**
 * What today is, for the two people using this phone.
 *
 * The deciding is all in `packages/core/src/occasions.ts`; this only assembles
 * the inputs, and the inputs are where it can go wrong. Both the date and the
 * clock are read **in the couple's own timezone**, not the device's, for the
 * same reason the daily question is: two people in two cities must not get their
 * anniversary a day apart, and `localDateIn` is already the one function that
 * settles that.
 *
 * `useNow(60_000)` re-anchors to the wall clock on every tick rather than adding
 * a fixed interval, so it fires *on* the minute rather than drifting a little
 * further past it each hour. The minute occasion lasts exactly sixty seconds and
 * would otherwise be missed by an accumulating error before the first year was
 * out.
 */
export function useOccasion(): Occasion | null {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const now = useNow(60_000);
  const zone = couple?.day_timezone ?? 'UTC';
  const localDate = localDateIn(zone, now);

  /*
    Minutes since midnight where the couple lives, read the same way the date is
    rather than from `now.getHours()`. A phone that has travelled is the normal
    case for half of this app's users, and a couple whose date reads 16:04 on one
    handset and 20:34 on the other would each be told a different thing about
    their own start date.
  */
  const minutesOfDay = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);

      const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
      const hour = value('hour');
      const minute = value('minute');
      return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : undefined;
    } catch {
      return undefined;
    }
  }, [zone, now]);

  // Housekeeping, once a day rather than on every tick: the record of what has
  // already been shown is keyed by date and would otherwise grow forever.
  useEffect(() => forgetOldDays(localDate), [localDate]);

  return useMemo(
    () =>
      occasionFor({
        startedOn: couple?.started_on ?? null,
        myBirthday: profile?.birthday,
        theirBirthday: partner?.birthday,
        localDate,
        minutesOfDay,
      }),
    [couple?.started_on, profile?.birthday, partner?.birthday, localDate, minutesOfDay],
  );
}
