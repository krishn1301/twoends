import { daysBetween } from './daily.ts';
import type { DayMark } from './types.ts';

/**
 * The streak, computed from the days both people actually answered.
 *
 * Derived rather than stored. A counter that is incremented by whichever device
 * happens to notice first will drift between two phones and slowly become
 * fiction; recomputing from the record cannot.
 *
 * The forgiveness rule is the reason this is not three lines: two missed days
 * per calendar month do not break the run. That is a deliberate stance — a
 * relationship app that punishes a bad week is a worse product, and the number
 * is meant to describe a habit, not enforce one.
 */

export const GRACE_PER_MONTH = 2;

export interface StreakResult {
  current: number;
  longest: number;
  /** Days forgiven inside the current run, by `YYYY-MM` month. */
  graceUsed: Record<string, number>;
  lastActiveDate: string | null;
}

/**
 * @param completedDays  `YYYY-MM-DD` dates where BOTH partners answered.
 * @param today          The couple's local date.
 * @param quietDays      Dates inside quiet mode: neither counted nor forgiven.
 */
export function computeStreak(
  completedDays: readonly string[],
  today: string,
  quietDays: ReadonlySet<string> = new Set(),
): StreakResult {
  const done = new Set(completedDays);
  const sorted = [...done].sort();
  const lastActiveDate = sorted.at(-1) ?? null;

  if (sorted.length === 0) {
    return { current: 0, longest: 0, graceUsed: {}, lastActiveDate: null };
  }

  // Walk backwards from today. Today itself not being answered is not a miss —
  // the day is not over, and a streak that drops to zero every morning until
  // you open the app would be both wrong and cruel.
  const current = runEndingAt(done, quietDays, today, done.has(today) ? today : yesterday(today));

  let longest = current.length;
  for (const day of sorted) {
    const run = runEndingAt(done, quietDays, today, day);
    if (run.length > longest) longest = run.length;
  }

  return {
    current: current.length,
    longest,
    graceUsed: current.graceByMonth,
    lastActiveDate,
  };
}

interface Run {
  length: number;
  graceByMonth: Record<string, number>;
}

/** Walks backwards from `end`, spending grace where a day is missed. */
function runEndingAt(
  done: ReadonlySet<string>,
  quiet: ReadonlySet<string>,
  today: string,
  end: string,
): Run {
  const graceByMonth: Record<string, number> = {};
  let length = 0;
  let cursor = end;

  // A run cannot start in the future, and cannot run forever.
  if (daysBetween(cursor, today) < 0) return { length: 0, graceByMonth };

  for (let guard = 0; guard < 3650; guard++) {
    if (quiet.has(cursor)) {
      // Quiet mode: the day does not participate at all. It neither extends the
      // run nor breaks it, and it does not cost grace.
      cursor = yesterday(cursor);
      continue;
    }

    if (done.has(cursor)) {
      length++;
      cursor = yesterday(cursor);
      continue;
    }

    // A missed day. Forgive it if this month has any forgiveness left.
    const month = cursor.slice(0, 7);
    const used = graceByMonth[month] ?? 0;
    if (used < GRACE_PER_MONTH) {
      graceByMonth[month] = used + 1;
      cursor = yesterday(cursor);
      continue;
    }

    break;
  }

  return { length, graceByMonth };
}

function yesterday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday-first week for the dot row, ending today.
 *
 * A forgiven day renders as `grace` rather than `done` or `missed`, because
 * hiding the miss would be dishonest and marking it as a break would be a lie
 * about the number next to it.
 */
export function weekMarks(
  completedDays: readonly string[],
  today: string,
  quietDays: ReadonlySet<string> = new Set(),
): DayMark[] {
  const done = new Set(completedDays);
  const monday = mondayOf(today);
  const { graceUsed } = computeStreak(completedDays, today, quietDays);

  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);

    if (daysBetween(day, today) < 0) return 'future';
    if (quietDays.has(day)) return 'quiet';
    if (done.has(day)) return 'done';

    // Inside the current run, a missed day was forgiven rather than fatal.
    const month = day.slice(0, 7);
    return (graceUsed[month] ?? 0) > 0 ? 'grace' : 'missed';
  });
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  // getUTCDay: 0 is Sunday, so Sunday sits at the end of a Monday-first week.
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
