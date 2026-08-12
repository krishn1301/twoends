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
