import { GRACE_PER_MONTH } from './streakMath.ts';
import type { DayMark, StreakState } from './types.ts';

/**
 * Two missed days a month are forgiven rather than punished. A couple app that
 * guilt-trips people is a worse product, and a streak that breaks the first time
 * someone has a bad week is a streak nobody keeps.
 *
 * Quiet mode (N6) is stronger still: while it is on, days are neither counted
 * nor forgiven — they simply do not participate.
 */
export function graceRemaining(streak: StreakState): number {
  return Math.max(0, GRACE_PER_MONTH - streak.graceUsedThisMonth);
}

/** Whether quiet mode is active on a given ISO date. */
export function isQuiet(quietUntil: string | undefined, isoToday: string): boolean {
  return quietUntil !== undefined && quietUntil >= isoToday;
}

/**
 * Copy for the streak row. Never shames — a broken streak states the number and
 * nothing else, and a forgiven day says so plainly rather than hiding it.
 */
export function streakLabel(streak: StreakState, quiet: boolean): string {
  if (quiet) return 'Quiet mode on';
  if (streak.current === 0) return 'No streak yet';
  const unit = streak.current === 1 ? 'day' : 'days';
  return `${streak.current} ${unit}`;
}

/** Monday-first labels for the weekly dot row. */
export const WEEKDAY_LABELS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'] as const;

export function isMarkComplete(mark: DayMark): boolean {
  return mark === 'done';
}

// ── quiet mode ───────────────────────────────────────────────────────────────

export interface QuietPeriod {
  from_date: string;
  /** Null while it is still running. */
  to_date: string | null;
}

/**
 * Every day the couple asked to be left alone, as a set.
 *
 * `computeStreak` has taken a set of quiet days since Phase 2 and has never once
 * been given a non-empty one. This is the missing half.
 *
 * Expanded from periods rather than read from a single `quiet_until`, because a
 * date on its own says when the hush *ends* and not which days were inside it —
 * so the streak would hold while quiet mode was on and break the morning it
 * lifted, turning "paused with no penalty" into "deferred".
 *
 * An open period is expanded only as far as today. Days that have not happened
 * cannot have been missed, and marking them quiet in advance would quietly
 * excuse a week nobody has lived yet.
 */
export function quietDays(periods: readonly QuietPeriod[], today: string): Set<string> {
  const days = new Set<string>();

  for (const period of periods) {
    const last = period.to_date && period.to_date < today ? period.to_date : today;
    if (period.from_date > last) continue;

    /*
      Walked as calendar dates rather than by adding 86,400,000 milliseconds:
      that arithmetic is wrong by an hour twice a year in any zone with daylight
      saving, and wrong in a way that shows up as one missing day in a run.
    */
    const cursor = new Date(`${period.from_date}T00:00:00Z`);
    const end = new Date(`${last}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) continue;

    // A guard, not a policy: a corrupt row must not spin here forever.
    for (let i = 0; cursor <= end && i < 3_650; i++) {
      days.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return days;
}

/** Whether quiet mode is running right now. */
export const isQuietNow = (periods: readonly QuietPeriod[], today: string): boolean =>
  periods.some((p) => p.from_date <= today && (p.to_date === null || p.to_date >= today));
