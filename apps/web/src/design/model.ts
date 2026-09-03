import { getAccent, timeTogether, type Accent, type Elapsed } from '@twoends/core';

import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';

/**
 * Who the two of you are, and how long it has been.
 *
 * This started life as a view model for three competing Phase 0 shells, which
 * is why it once held a sample question, a sample streak, a sample countdown
 * and a sample distance — the options had to differ in treatment and never in
 * content, so every screen read from one fixture.
 *
 * All of that is now real, read from Dexie by the screen that shows it, and the
 * fixtures have been taken out one at a time as each feature landed. The last
 * one to go was the countdown, and it went because it was *visible*: Home
 * cheerfully showed a made-up trip and a made-up number of days beside a real
 * countdown the couple had actually entered.
 *
 * What is left is identity and arithmetic — the two things every screen needs
 * and no screen should compute for itself. Plus one decision: which colour the
 * interface is, which is item 1 of the visual review and is made here so that
 * it is made once.
 */

export interface DesignModel {
  myId: string;
  myName: string;
  theirName: string;
  myAccent: Accent;
  theirAccent: Accent;
  elapsed: Elapsed;

  /**
   * The colour of everything neither of you authored.
   *
   * **Item 1 was tried and reverted**, and this is the survivor of it. For a
   * while it was a fixed bone belonging to neither of you, so that `myAccent`
   * and `theirAccent` could mean *authorship* and nothing else — avatars, the
   * name over an answer, a Play pick, the gradient when both are present.
   *
   * It reads better on paper than on a phone. Choosing your colour on the first
   * screen and watching the rest of the app become it is the most personal
   * thing that happens in the first minute, and a rule about what an accent is
   * allowed to mean is not worth losing it.
   *
   * It stays as a named thing rather than collapsing back into `mine` because
   * the two jobs are still two jobs, and a call site that means *interface*
   * should say so.
   */
  chrome: string;

  /** Text and icons drawn *on* `chrome`. */
  chromeInk: string;
}

export function useDesignModel(): DesignModel {
  const now = useNow(1000);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const couple = useSession((s) => s.couple);

  const myAccent = getAccent(profile?.accent_key ?? 'teal');

  return {
    myId: profile?.id ?? '',
    myName: profile?.display_name ?? 'you',
    theirName: partner?.display_name ?? 'them',
    myAccent,
    theirAccent: getAccent(partner?.accent_key ?? 'rose'),
    chrome: myAccent.onDark,
    chromeInk: '#000000',
    /*
      Falls back to today rather than to a date in the past. A couple whose
      `started_on` has not been set yet should see a counter at zero and
      starting, not one claiming a year and a half of history it invented.
    */
    elapsed: timeTogether(couple?.started_on ?? localToday(now), now),
  };
}

const localToday = (now: Date): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Two digits, so the counter's width never changes as it ticks. */
export const pad = (n: number): string => String(n).padStart(2, '0');

export const WEEK_LABELS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'] as const;
