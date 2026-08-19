/**
 * What today is, if today is anything.
 *
 * Most days it is nothing, and that is the point — a day that announces itself
 * every time you open the app has stopped meaning anything. This decides,
 * exactly once and in one place, whether the app should say something today.
 *
 * Pure, and in core, for two reasons. The obvious one is that the alternative to
 * a test is waiting until April. The less obvious one is that the *precedence*
 * matters more than any single rule: this couple started on 16 April, her
 * birthday is the 18th, and their first year lands on the 15th. Three occasions
 * inside four days is not an edge case for them, it is every spring — and left
 * to the order of a few `if` statements, which one wins would be an accident
 * nobody had decided.
 */

import { localMidnight } from './togetherness.ts';

export type OccasionKind = 'anniversary' | 'birthday' | 'milestone' | 'monthly' | 'minute';

export interface Occasion {
  kind: OccasionKind;
  /**
   * Stable for the day, and unique. Used as the key for "already shown today",
   * so it carries the date rather than only the kind — otherwise a second
   * anniversary a year later would be remembered as already seen.
   */
  key: string;
  /** Years together, on an anniversary. */
  years?: number;
  /** Days together, on a milestone. */
  days?: number;
  /** Whole months together, on a monthly. Twelve and its multiples never occur. */
  months?: number;
  /** Whose birthday. `mine` and `theirs` are from the reader's point of view. */
  whose?: 'mine' | 'theirs';
}

/**
 * The day counts worth stopping for.
 *
 * Round numbers, and deliberately sparse. Every hundred days would be eleven
 * interruptions before the first anniversary, which is how a thing that should
 * feel rare becomes furniture.
 *
 * **365 is deliberately not here, and neither is 730.** "365 days" and "one
 * year" are the same sentence said twice, and for this couple they fall on the
 * same morning — a year after 16 April 2026 is 16 April 2027, with no leap day
 * in between. Dropping the yearly counts dissolves that collision at the source
 * instead of leaving precedence to resolve it, which is the better fix: a rule
 * that never fires twice beats a rule about which one wins.
 */
export const MILESTONES = [100, 500, 1000, 2000, 3000, 5000, 10_000] as const;

/**
 * The couple's date, read as a clock — both ways round, when both are times.
 *
 * A couple who started on 16 April get **04:16** and **16:04**. Neither reading
 * is more correct than the other; 16/04 and 04/16 are the same date written by
 * two different people, and both spellings are on the clock.
 *
 * Taking both matters more than it looks. Month-as-hour always works — months
 * are 1–12, days are 1–31, so it is always a real time — but it is also always
 * before midday, and for this couple that is four in the morning, a time nobody
 * is awake to notice. Day-as-hour only exists when the day is 23 or less, and
 * for them it is the late-afternoon one they will actually catch.
 *
 * So: always at least one, sometimes two, and a couple who started on the 30th
 * simply gets the morning. That is a degradation, not a hole — the other reading
 * would have given them half past thirty and nothing at all.
 *
 * It is the one occasion that is not a whole day, so it is never announced. It
 * lasts sixty seconds and is either noticed or it is not.
 */
export function minutesFor(startedOn: string | null): Array<{ hour: number; minute: number }> {
  const parts = split(startedOn);
  if (!parts) return [];

  const times = [{ hour: parts.month, minute: parts.day }];

  // Only when the day is a valid hour, and only when it is not the same time
  // said twice — somebody who started on the 4th of April has one, not two.
  if (parts.day < 24 && parts.day !== parts.month) {
    times.push({ hour: parts.day, minute: parts.month });
  }

  return times;
}

/**
 * Whether an occasion deserves the whole screen.
 *
 * The three that come round on a calendar do; the minute does not. A card
 * filling the screen because the clock happens to read 04:16 would interrupt
 * whatever somebody actually opened the app to do, and it would do it while
 * they were mid-sentence in an answer.
 */
export const fillsTheScreen = (kind: OccasionKind): boolean => kind !== 'minute';

export interface OccasionInput {
  /** The couple's start date, `YYYY-MM-DD`. */
  startedOn: string | null;
  /** The reader's birthday, `YYYY-MM-DD`. */
  myBirthday?: string | null;
  /** Their partner's. */
  theirBirthday?: string | null;
  /** Today, in the couple's own timezone. See `localDateIn`. */
  localDate: string;
  /** Minutes since midnight, for the clock. Omit to skip it. */
  minutesOfDay?: number;
}

/**
 * The one thing today is, or nothing.
 *
 * Precedence, decided rather than inherited: **anniversary, then a birthday,
 * then a milestone, then the minute.** The reasoning is that the rarer thing
 * wins — an anniversary happens once a year and a milestone can be moved past
 * without being missed, since the next one is always coming. A birthday sits
 * between them because it is somebody's, not something the two of you did.
 *
 * Returning one occasion rather than a list is the whole design. Two cards on
 * one morning is a notification tray.
 */
export function occasionFor(input: OccasionInput): Occasion | null {
  const today = split(input.localDate);
  if (!today) return null;

  const started = split(input.startedOn);

  if (started) {
    // Not the start date itself — a beginning is not an anniversary of anything,
    // and showing "0 years" to somebody on the day they started would be a
    // strange first impression of the feature.
    const years = today.year - started.year;
    if (years >= 1 && today.month === started.month && today.day === started.day) {
      return { kind: 'anniversary', key: `anniversary:${input.localDate}`, years };
    }
  }

  const birthdays: Array<['mine' | 'theirs', string | null | undefined]> = [
    ['theirs', input.theirBirthday],
    ['mine', input.myBirthday],
  ];

  for (const [whose, birthday] of birthdays) {
    const born = split(birthday);
    if (born && today.month === born.month && today.day === born.day) {
      return { kind: 'birthday', key: `birthday:${whose}:${input.localDate}`, whose };
    }
  }

  if (started) {
    /*
      Days elapsed, counted between two calendar dates rather than from a
      duration. A millisecond subtraction is wrong by one twice a year in any
      zone that observes daylight saving, and wrong in a way nobody notices
      until a milestone lands on the wrong morning.
    */
    const days = Math.round(
      (localMidnight(input.localDate).getTime() - localMidnight(input.startedOn!).getTime()) /
        86_400_000,
    );

    // Only on the day. A milestone that fires late is a milestone that fires on
    // an ordinary Tuesday, which is worse than not firing at all.
    if ((MILESTONES as readonly number[]).includes(days)) {
      return { kind: 'milestone', key: `milestone:${days}`, days };
    }
  }

  /*
    The same day of the month, every month.

    Last of the four that take the screen, and that ordering is the point: it
    comes round twelve times a year, so it must never be the reason a birthday
    or a thousandth day went unsaid. On 16 April the yearly one wins, which is
    also why `months` is never twelve or a multiple of it.

    This does sit against the argument the rest of this module makes for
    sparseness — milestones were cut to "one interruption in the first year, not
    eleven" for exactly this reason. Once a month was judged to be on the right
    side of that line and eleven times in a hundred days was not; the difference
    is that a month is a unit people already count in.
  */
  if (started) {
    const months = monthsBetween(started, today);
    if (months >= 1 && today.day === monthlyDay(started.day, today.year, today.month)) {
      return { kind: 'monthly', key: `monthly:${input.localDate}`, months };
    }
  }

  const now = input.minutesOfDay;
  if (now != null && minutesFor(input.startedOn).some((t) => t.hour * 60 + t.minute === now)) {
    return { kind: 'minute', key: `minute:${input.localDate}:${now}` };
  }

  return null;
}

/** Whole months from one date to another, ignoring the day-of-month. */
function monthsBetween(
  from: { year: number; month: number },
  to: { year: number; month: number },
): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * Which day of *this* month a monthly falls on.
 *
 * A couple who started on the 31st have no 31st in February, and there are four
 * months a year with no 31st at all. Skipping would quietly give them seven
 * monthlies a year instead of twelve, and nothing on screen would explain why —
 * so a month that is too short lands on its last day instead.
 *
 * The same arithmetic that makes 29 February work, which is the case people
 * actually notice.
 */
function monthlyDay(startedDay: number, year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(startedDay, lastDay);
}

/** `YYYY-MM-DD` into numbers, or null if it is not one. */
function split(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/**
 * The one line that is a fact rather than a sentiment.
 *
 * In core because three things say it now: the card that takes the screen, the
 * notification that arrives before anybody opens the app, and the widget. Two of
 * those reach somebody who is not looking at the app, so a copy that drifted
 * would be a phone saying "one year today" beside a card saying something else.
 *
 * Small numbers are spelled and large ones are digits, because "One year" is how
 * somebody says it and "10,000 days" is how somebody reads it.
 */
export function occasionHeadline(
  occasion: Occasion,
  theirName?: string | null,
): string {
  switch (occasion.kind) {
    case 'anniversary':
      return occasion.years === 1 ? 'One year' : `${occasion.years} years`;

    case 'birthday':
      // Named when it is theirs, because that is the useful half: you know when
      // your own is, and the reason to say it out loud is so the other one is
      // reminded.
      if (occasion.whose !== 'theirs') return 'Your birthday';
      return theirName ? `${theirName}\u2019s birthday` : 'Their birthday';

    case 'milestone':
      return `${occasion.days?.toLocaleString('en-GB')} days`;

    /*
      Months on their own for the first year, then years and months — because
      "nineteen months" is a thing somebody has to do arithmetic on and "one
      year seven months" is not. A whole number of years never reaches here:
      that morning belongs to the anniversary.
    */
    case 'monthly': {
      const total = occasion.months ?? 0;
      if (total < 12) return total === 1 ? 'One month' : `${total} months`;

      const years = Math.floor(total / 12);
      const months = total % 12;
      const yearPart = years === 1 ? '1 year' : `${years} years`;
      return months === 0 ? yearPart : `${yearPart} ${months} month${months === 1 ? '' : 's'}`;
    }

    default:
      return '';
  }
}
