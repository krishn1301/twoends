/**
 * The five cards you were dealt, remembered.
 *
 * A round of "Do you know me?" ends on a scoreboard, and that scoreboard was
 * component state — so switching to This or that, or to another tab, threw it
 * away and came back to "Deal five" as though the round had never happened.
 * The score is the point of the round; it has to outlive looking away from it.
 *
 * Only the ids and how far through you are. The cards themselves are rebuilt
 * from the deck, which is the same argument the rest of the app makes about
 * derived data: a stored copy of a card is a card that can disagree with the
 * deck it came from. The answers were never here anyway — those are rows.
 *
 * Keyed by couple, so unpairing and pairing again does not inherit somebody
 * else's five.
 */

const key = (coupleId: string): string => `twoends.round.${coupleId}`;

export interface LastRound {
  ids: string[];
  /** How many of the five have been played. Five means the scoreboard. */
  at: number;
}

/**
 * What was dealt, or null.
 *
 * Every path returns null rather than throwing. `localStorage` throws outright
 * in a few real contexts — a private window, a browser set to block site data
 * — and a game that cannot start because a convenience failed would be a much
 * worse bug than the one this fixes.
 */
export function readRound(coupleId: string | undefined): LastRound | null {
  if (!coupleId) return null;

  try {
    const raw = window.localStorage.getItem(key(coupleId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { ids, at } = parsed as { ids?: unknown; at?: unknown };
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null;

    return { ids: ids as string[], at };
  } catch {
    return null;
  }
}

export function writeRound(coupleId: string | undefined, round: LastRound): void {
  if (!coupleId) return;

  try {
    window.localStorage.setItem(key(coupleId), JSON.stringify(round));
  } catch {
    // The round still works for as long as the screen is open. Nothing to say.
  }
}
