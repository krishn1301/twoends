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
 * and no screen should compute for itself.
 */

export interface DesignModel {
  myId: string;
  myName: string;
  theirName: string;
  myAccent: Accent;
  theirAccent: Accent;
  elapsed: Elapsed;
}

export function useDesignModel(): DesignModel {
  const now = useNow(1000);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const couple = useSession((s) => s.couple);

  return {
    myId: profile?.id ?? '',
    myName: profile?.display_name ?? 'you',
    theirName: partner?.display_name ?? 'them',
    myAccent: getAccent(profile?.accent_key ?? 'teal'),
    theirAccent: getAccent(partner?.accent_key ?? 'rose'),
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
