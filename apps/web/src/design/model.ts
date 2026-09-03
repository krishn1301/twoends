import { getAccent, timeTogether, type Accent, type Elapsed } from '@twoends/core';

import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';
import { CHROME, CHROME_INK, useDesignVersion } from './version.ts';

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
   * **Item 1 — split the accent in two.** `mine` was doing two jobs at once: it
   * was the authorship colour *and* the interface colour, so Continue, the
   * progress bar, every sub-tab pill, every category chip and the day count on
   * a Coming-up row all took it. Confirmed live rather than inferred — an
   * account assigned teal during the review turned the entire app teal. Which
   * means "my colour" was indistinguishable from "the app's colour", and the
   * best idea in the design could not be read.
   *
   * In the proposed look this is a fixed warm bone belonging to neither of you,
   * and `myAccent` / `theirAccent` become reserved, strictly, for authorship:
   * avatars, the name above an answer, the two dots on the distance card, a
   * Play pick, and the gradient drawn when both are present. The moment a red
   * thing on screen is *always* Krishn, the app starts telling you who is in
   * the room.
   *
   * Bone rather than the other two candidates in the review — a fixed neutral,
   * or the blend of the two accents. The blend is the most on-brief answer on
   * paper and the wrong one here: it puts a third colour on screen competing
   * with the two that are supposed to be the only colour in the app. Keeping
   * the chrome monochrome is what makes an accent mean something when it
   * appears. It is one constant away if that reads wrong on a phone — see
   * `--color-chrome` in `theme.css`.
   *
   * In `classic` this is `myAccent.onDark`, which is what the app has always
   * done, so every call site can pass this unconditionally.
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
  const version = useDesignVersion((s) => s.version);

  const myAccent = getAccent(profile?.accent_key ?? 'teal');

  return {
    myId: profile?.id ?? '',
    myName: profile?.display_name ?? 'you',
    theirName: partner?.display_name ?? 'them',
    myAccent,
    theirAccent: getAccent(partner?.accent_key ?? 'rose'),
    chrome: version === 'v2' ? CHROME : myAccent.onDark,
    chromeInk: version === 'v2' ? CHROME_INK : '#000000',
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
