/**
 * Which month a recap covers, and whether there is one to make.
 *
 * A recap is a **live view over a date range**, not a document. The row that
 * records it holds the range and nothing else, so the page renders from the
 * same tables it always did and is still correct in five years — which is only
 * true because nothing sweeps a photograph (see migration 25).
 *
 * All of the date arithmetic is here rather than in the screen or the scheduled
 * function, for the same reason `occasions.ts` is: two copies of "when does the
 * month turn" would drift, and the first anybody would know is a recap arriving
 * on the wrong morning or covering a fortnight twice.
 */

/**
 * Below this, a month is not worth a page.
 *
 * A recap of two snaps and one answer is a worse object than no recap: it makes
 * the month look empty rather than quiet, and it spends the anticipation that
 * is the whole point of the feature. A thin month is not skipped, though — its
 * content rolls into the next one, which is why the window is stored rather
 * than derived from the month alone.
 */
export const THIN = 4;

export interface RecapWindow {
  /** The month it is *called*, as the first of that month. */
  month: string;
  /** First day it covers, inclusive. */
  from: string;
  /** Last day it covers, inclusive. This is the monthly anniversary. */
  to: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** `YYYY-MM-DD` into numbers, or null if it is not one. */
function split(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const [, y, m, d] = match;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/**
 * Which day of a given month the monthly anniversary lands on.
 *
 * A couple who started on the 31st have no 31st in February. Skipping would
 * give them seven recaps a year instead of twelve with nothing on screen to
 * explain the gaps, so a month too short lands on its last day — the same rule
 * `occasions.ts` uses for the monthly card, deliberately identical.
 */
export function anniversaryDay(startedDay: number, year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(startedDay, lastDay);
}

/** The day after `date`, as `YYYY-MM-DD`. */
export function dayAfter(date: string): string {
  const parts = split(date);
  if (!parts) return date;

  const next = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + 1));
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/**
 * Every monthly anniversary that has already happened, oldest first.
 *
 * The day they started is not one of them: a couple has to have been together a
 * month before there is a month to look back on.
 */
export function anniversariesSoFar(startedOn: string, today: string): string[] {
  const start = split(startedOn);
  const now = split(today);
  if (!start || !now) return [];

  const out: string[] = [];

  // Walk months rather than days: twelve iterations a year, and no arithmetic
  // that has to know how long February is.
  for (let step = 1; ; step++) {
    const total = start.m - 1 + step;
    const year = start.y + Math.floor(total / 12);
    const month = (total % 12) + 1;
    const day = anniversaryDay(start.d, year, month);
    const date = iso(year, month, day);

    if (date > today) break;
    out.push(date);

    // Nothing sane reaches this; it is here so a bad `startedOn` cannot spin.
    if (step > 1200) break;
  }

  return out;
}

/**
 * Every window that has not been recapped yet, oldest first.
 *
 * One per monthly anniversary that has passed and is not already covered. They
 * all share the same `from` — the day after the last recap ended, or the day
 * they started — because until one is actually written, nothing has closed and
 * the start of the period has not moved.
 *
 * That sharing *is* the fold-forward rule. A month too thin to be worth a page
 * is not recorded at all, so the next anniversary's window still reaches back
 * to the same day and simply covers two months. The alternative — asking only
 * about the earliest uncovered anniversary — deadlocks: a quiet first month is
 * never worth a page on its own, so nothing is ever written, so the window
 * never grows, so nothing is ever written. That was the first version of this,
 * and it would have given a couple with a quiet April no recaps at all, ever.
 */
export function pendingWindows(
  startedOn: string,
  today: string,
  lastCovered: string | null,
): RecapWindow[] {
  const start = split(startedOn);
  if (!start) return [];

  const from = lastCovered ? dayAfter(lastCovered) : startedOn;

  return anniversariesSoFar(startedOn, today)
    .filter((date) => lastCovered === null || date > lastCovered)
    .map((to) => {
      const end = split(to)!;
      // Named for the month the period *ends* in, which is what somebody would
      // call it when they open it in a year.
      return { month: iso(end.y, end.m, 1), from, to };
    });
}

/**
 * The earliest window still to be made, or null.
 *
 * Thin wrapper over `pendingWindows` for the callers that only want the next
 * one. Anything deciding whether a month is *worth* making has to walk the
 * whole list instead — see the note there.
 */
export function nextRecapWindow(
  startedOn: string,
  today: string,
  lastCovered: string | null,
): RecapWindow | null {
  return pendingWindows(startedOn, today, lastCovered)[0] ?? null;
}

/**
 * A month worth a page, or one to fold into the next.
 *
 * Counted across everything the recap can show rather than photographs alone: a
 * month with no snaps but four long answers is a real month and reads like one.
 */
export const worthShowing = (items: number): boolean => items >= THIN;

/** "August 2026", for a recap somebody opens two years later. */
export function recapTitle(month: string): string {
  const parts = split(month);
  if (!parts) return month;

  return new Date(Date.UTC(parts.y, parts.m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ── what the two of them said ────────────────────────────────────────────────

export interface RecapExchange {
  date: string;
  question: string;
  answers: { author_id: string; body: string }[];
}

/**
 * Shared words as a fraction of the shorter answer, ignoring the common ones.
 *
 * Without the stop list, "the" and "and" make every pair of long answers look
 * alike, and the closest day is always just the longest one — which is the
 * failure mode that makes a computed insight worse than none.
 */
export function overlap(a: string, b: string): number {
  const words = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9']+/)
        .filter((word) => word.length > 2 && !COMMON.has(word)),
    );

  const one = words(a);
  const two = words(b);
  if (one.size === 0 || two.size === 0) return 0;

  let shared = 0;
  for (const word of one) if (two.has(word)) shared++;

  return shared / Math.min(one.size, two.size);
}

const COMMON = new Set([
  'the',
  'and',
  'you',
  'was',
  'that',
  'this',
  'with',
  'for',
  'but',
  'not',
  'are',
  'have',
  'had',
  'were',
  'they',
  'them',
  'our',
  'out',
  'get',
  'got',
  'would',
  'about',
  'just',
  'like',
  'when',
  'what',
  'from',
  'been',
  'more',
  'than',
  'then',
  'your',
  'mine',
  'because',
  'really',
  'think',
  'know',
  'thing',
  'things',
]);

/** Below this spread, the two ends of the month are noise rather than a finding. */
export const SPREAD = 0.15;

/**
 * The day they agreed most, and the day they agreed least.
 *
 * Shared words over the shorter answer: a blunt instrument, deliberately. The
 * alternative is a similarity model, and a confident, wrong "you two were
 * really aligned this month" is worse than making no claim at all.
 *
 * When the month is too short or the spread too narrow to mean anything, the
 * pair is dropped and the longest answer of the month stands in its place. A
 * real thing somebody wrote beats a manufactured insight, which is the whole
 * rule this function exists to keep.
 */
export function pickTwo(exchanges: RecapExchange[]): {
  closest: RecapExchange | null;
  furthest: RecapExchange | null;
} {
  if (exchanges.length === 0) return { closest: null, furthest: null };

  const scored = exchanges.map((exchange) => ({
    exchange,
    score: overlap(exchange.answers[0]?.body ?? '', exchange.answers[1]?.body ?? ''),
  }));

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const worst = scored[scored.length - 1]!;

  if (scored.length < 3 || best.score - worst.score < SPREAD) {
    const longest = [...exchanges].sort((a, b) => longestBody(b) - longestBody(a))[0]!;
    return { closest: longest, furthest: null };
  }

  return { closest: best.exchange, furthest: worst.exchange };
}

const longestBody = (exchange: RecapExchange): number =>
  Math.max(0, ...exchange.answers.map((a) => a.body.length));
