/**
 * The anniversary counter: days / hours / minutes / seconds since the pair's
 * start date. Pure — takes both instants as arguments so it is trivially
 * testable and has no clock of its own.
 *
 * Phase 5 will drive this from a monotonic clock rather than `setInterval`,
 * which drifts. That belongs in the UI layer; this stays a pure function.
 */

export interface Elapsed {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total whole days, the figure the "N days together" stat uses. */
  totalDays: number;
}

const MS = { sec: 1000, min: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

/**
 * Midnight local time on an ISO `YYYY-MM-DD` date.
 *
 * `new Date('2026-01-05')` parses as UTC midnight, which lands on the previous
 * day for anyone west of Greenwich. Constructing from parts keeps it local,
 * which is what an anniversary means to the people having it.
 */
export function localMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: ${isoDate}`);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Elapsed time between two instants. Clamps to zero for future start dates. */
export function elapsedBetween(startMs: number, nowMs: number): Elapsed {
  const delta = Math.max(0, nowMs - startMs);
  return {
    days: Math.floor(delta / MS.day),
    hours: Math.floor(delta / MS.hour) % 24,
    minutes: Math.floor(delta / MS.min) % 60,
    seconds: Math.floor(delta / MS.sec) % 60,
    totalDays: Math.floor(delta / MS.day),
  };
}

/** Convenience wrapper for an ISO start date. */
export function timeTogether(startedOn: string, now: Date): Elapsed {
  return elapsedBetween(localMidnight(startedOn).getTime(), now.getTime());
}

/**
 * Whole days until a target instant, rounded up, so "1 day" means the countdown
 * still has time on it today rather than having silently expired.
 */
export function daysUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / MS.day));
}
