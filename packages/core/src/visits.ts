/**
 * Being in the same place.
 *
 * The app assumes the two of them are apart, and for most of the year it is
 * right. When it is wrong it should behave differently rather than show a
 * smaller number: a distance card reading "0 km" is a worse answer than not
 * asking the question.
 *
 * **Never triggered by GPS.** Location here is coarse, opt-in, off by default
 * and can be hours stale — flipping an entire interface on a signal like that
 * is worse than asking, because the failure is silent and the recovery is
 * confusing. A visit starts when somebody says it has, or when a countdown they
 * set themselves reaches zero, and is confirmed either way.
 */

export interface Visit {
  id: string;
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
}

/**
 * Whole days, counting the day it started as the first.
 *
 * **Calendar days, not elapsed hours.** Somebody who lands on Saturday morning
 * and leaves the following Thursday *evening* was there six days; one who
 * leaves on the Thursday *morning* was there six days as well. Dividing the
 * difference by twenty-four hours calls the second one five, which is wrong on
 * roughly half of all trips and is the kind of wrong that gets noticed on the
 * one memory somebody keeps.
 *
 * `offsetMinutes` is the couple's own offset from UTC. Without it the day
 * boundary is midnight UTC, which for a couple at +5:30 puts every evening
 * arrival on the previous day and takes a day off the count.
 */
export function visitDays(
  startedAt: string,
  endedAt: string | null,
  now: number,
  offsetMinutes = 0,
): number {
  const from = Date.parse(startedAt);
  const to = endedAt ? Date.parse(endedAt) : now;
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;

  const shift = offsetMinutes * 60_000;
  const dayOf = (ms: number): number => Math.floor((ms + shift) / 86_400_000);

  return Math.max(1, dayOf(to) - dayOf(from) + 1);
}

/**
 * "Six days in Pune", or "Six days" if nobody said where.
 *
 * The place is optional and stays optional. Asking for it is one field between
 * somebody and the thing they are trying to record, and a visit with no label
 * is still a visit.
 */
export function visitTitle(visit: Visit, now: number, offsetMinutes = 0): string {
  const days = visitDays(visit.started_at, visit.ended_at, now, offsetMinutes);
  const count = days === 1 ? 'One day' : `${days} days`;
  return visit.place_label ? `${count} in ${visit.place_label}` : count;
}

/**
 * How long they have been together this time, in the app's own voice.
 *
 * Hours for the first day, because "one day together" on the afternoon somebody
 * arrived is wrong in a way people notice; days after that, because nobody
 * counts hours on the fourth morning.
 */
export function togetherFor(startedAt: string, now: number): string {
  const from = Date.parse(startedAt);
  if (Number.isNaN(from)) return '';

  const ms = Math.max(0, now - from);
  const hours = Math.floor(ms / 3_600_000);

  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return minutes === 1 ? 'One minute' : `${minutes} minutes`;
  }
  if (hours < 24) return hours === 1 ? 'One hour' : `${hours} hours`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'One day' : `${days} days`;
}

/**
 * What to say on the day it ends.
 *
 * Deliberately flat. It is a hard day and the app should not perform about it —
 * no illustration, no encouragement, no "until next time". One line that says
 * what happened and how long it was.
 */
export function departureLine(visit: Visit, now: number, offsetMinutes = 0): string {
  const days = visitDays(visit.started_at, visit.ended_at, now, offsetMinutes);
  const count = days === 1 ? 'One day' : `${days} days`;
  return visit.place_label ? `${count} in ${visit.place_label}. Back to the counter.` : `${count} together. Back to the counter.`;
}

/**
 * A zone's offset from UTC in minutes, right now.
 *
 * Needed because `visitDays` counts calendar days and a calendar has to belong
 * to somewhere. Read out of a formatted string because that is the only way to
 * ask `Intl` what a zone's clock says; an unknown zone answers zero, which is
 * UTC and is the same answer the app had before this existed.
 */
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const value = (type: string): number =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    const local = value('hour') * 60 + value('minute');
    const utc = at.getUTCHours() * 60 + at.getUTCMinutes();

    let diff = local - utc;
    // The day rolled over one side of midnight but not the other.
    if (value('day') !== at.getUTCDate()) diff += diff > 0 ? -1440 : 1440;
    if (diff > 840) diff -= 1440;
    if (diff < -840) diff += 1440;

    return diff;
  } catch {
    return 0;
  }
}
