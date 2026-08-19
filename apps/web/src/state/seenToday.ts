const PREFIX = 'twoends.seen.';

/**
 * Whether a once-a-day moment has already had its turn.
 *
 * Modelled on `emailOffer.ts`, with **one difference that is the whole reason
 * this is a separate file**: `emailOffered()` treats a `localStorage` failure as
 * *already asked*, because the cost of being wrong is nagging somebody on every
 * launch. Here the cost of being wrong runs the other way. Missing your first
 * anniversary is worse than being shown it twice, so a browser that cannot
 * remember gets the card.
 *
 * Device-local, like everything else about "have we shown this". The two of you
 * see your own copy of the day on your own phone; there is nothing to
 * synchronise and a server round-trip would only mean the card arrives late or
 * not at all.
 *
 * The key is `Occasion.key`, which already carries the date for exactly this
 * reason — `anniversary:2027-04-16` rather than `anniversary`, so next year is a
 * different key and the card is not silenced for good the second time round. A
 * milestone happens once ever and keeps a bare `milestone:100`.
 */
export function seenToday(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === 'yes';
  } catch {
    return false;
  }
}

export function markSeenToday(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, 'yes');
  } catch {
    // Nothing to do. The consequence is being shown it again, which this file
    // has already decided is the acceptable direction to fail in.
  }
}

/**
 * Drop the records of days that have gone.
 *
 * Without this the list grows by one key per occasion forever — slowly, but
 * `localStorage` is a few megabytes shared with Dexie's own bookkeeping and the
 * app is meant to last years. Anything carrying a date earlier than today is
 * spent: the key includes the date precisely so it can never come round again.
 *
 * Milestone keys carry no date and are kept. That is correct — day 1000 happens
 * once, and forgetting it would show the card a second time to somebody who is
 * now on day 1001.
 */
export function forgetOldDays(today: string): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;

      const date = /(\d{4}-\d{2}-\d{2})/.exec(key)?.[1];
      if (date && date < today) localStorage.removeItem(key);
    }
  } catch {
    // Private browsing, or a quota error mid-sweep. Leaving the keys is
    // harmless; this is housekeeping, not correctness.
  }
}
