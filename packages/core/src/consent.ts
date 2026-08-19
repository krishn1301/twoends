/**
 * Where two people stand on something they both have to agree to.
 *
 * Only one thing needs this today — the 18+ packs — but the shape is the point
 * and it is not the shape the rest of the app uses. Unpairing is a handshake:
 * one asks, the other confirms, either can call it off. That is right for an act
 * that destroys shared things and wrong for this one, because **withdrawing
 * consent must never require the other person's agreement.** Here, both saying
 * yes turns it on and either saying no turns it off, immediately and alone.
 *
 * The four states exist so the interface can be honest about the middle. "Off"
 * and "waiting for them" look identical from the outside and mean completely
 * different things, and a switch that silently does nothing because your partner
 * has not moved yet is the kind of thing people assume is broken.
 */

export type AdultState =
  /** Neither of you has asked for it. The state every account starts in. */
  | 'off'
  /** You said yes. Nothing changes until they do, and they may never. */
  | 'waiting-for-them'
  /** They said yes and you have not. Shown as an invitation, never as pressure. */
  | 'waiting-for-you'
  | 'on';

/**
 * Read from the two opt-in timestamps, which are the only record of consent.
 *
 * Takes both rather than the reader's own, because every one of the four answers
 * depends on both. `null` is off, and off is the default — a person who has never
 * seen this feature is indistinguishable from one who turned it down, which is
 * correct: neither of them has agreed to anything.
 */
export function adultState(
  mineOptedInAt: string | null | undefined,
  theirsOptedInAt: string | null | undefined,
): AdultState {
  const mine = mineOptedInAt != null;
  const theirs = theirsOptedInAt != null;

  if (mine && theirs) return 'on';
  if (mine) return 'waiting-for-them';
  if (theirs) return 'waiting-for-you';
  return 'off';
}

/**
 * Whether the packs should actually be served.
 *
 * Deliberately *not* what the app gates content on. The server derives
 * `couples.adult_packs_enabled` from the same two timestamps and both phones
 * read that one value, which is what makes it impossible for the two of them to
 * disagree about which prompts are in the deck — and the daily question is
 * chosen from that deck by index, so a disagreement there hands them different
 * questions on the same morning and neither answer ever unlocks the other.
 *
 * This exists for tests and for the one place the interface has to predict what
 * the server is about to say. If the two ever disagree, the server is right.
 */
export const adultEnabled = (
  mineOptedInAt: string | null | undefined,
  theirsOptedInAt: string | null | undefined,
): boolean => adultState(mineOptedInAt, theirsOptedInAt) === 'on';
