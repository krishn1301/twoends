import {
  SAMPLE_COUNTDOWN,
  SAMPLE_COUPLE,
  SAMPLE_DISTANCE,
  SAMPLE_PROMPT,
  SAMPLE_STREAK,
  daysUntil,
  getAccent,
  seamPosition,
  streakLabel,
  timeTogether,
  turnFor,
  turnLabel,
  type Accent,
  type DayMark,
  type Elapsed,
} from '@twoends/core';

import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';

/**
 * One view model, three shells. The options must differ in treatment and never
 * in content — otherwise the comparison is measuring the copy, not the design.
 */

export interface DesignModel {
  myId: string;
  myName: string;
  theirName: string;
  myAccent: Accent;
  theirAccent: Accent;
  /** Share of the surface given to my colour, as a CSS percentage. */
  seam: string;
  turnLine: string;
  question: string;
  elapsed: Elapsed;
  streakLine: string;
  week: DayMark[];
  countdownTitle: string;
  countdownDays: number;
  distanceKm: number;
  myPlace: string;
  theirPlace: string;
}

/**
 * Real identity, sample everything else.
 *
 * Names and accents come from the signed-in pair — that is Phase 2's definition
 * of done, and it is also what makes the screen feel like *yours* the first time
 * you see it. The daily question, snaps, streak and countdown are still fixtures
 * until Phases 3 to 5 replace them with Dexie reads.
 */
export function useDesignModel(): DesignModel {
  const now = useNow(1000);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const couple = useSession((s) => s.couple);

  const them = SAMPLE_COUPLE.them;
  const startedOn = couple?.started_on ?? SAMPLE_COUPLE.startedOn ?? '2025-01-01';
  const turn = turnFor(SAMPLE_PROMPT, them !== null);
  const theirName = partner?.display_name ?? them?.displayName ?? 'them';

  return {
    myId: profile?.id ?? '',
    myName: profile?.display_name ?? SAMPLE_COUPLE.me.displayName,
    theirName,
    myAccent: getAccent(profile?.accent_key ?? SAMPLE_COUPLE.me.accentKey),
    theirAccent: getAccent(partner?.accent_key ?? them?.accentKey ?? 'rose'),
    seam: `${Math.round(seamPosition(turn) * 100)}%`,
    turnLine: turnLabel(turn, theirName),
    question: SAMPLE_PROMPT.body,
    elapsed: timeTogether(startedOn, now),
    streakLine: streakLabel(SAMPLE_STREAK, false),
    week: SAMPLE_STREAK.week,
    countdownTitle: SAMPLE_COUNTDOWN.title,
    countdownDays: daysUntil(Date.parse(SAMPLE_COUNTDOWN.targetIso), now.getTime()),
    distanceKm: SAMPLE_DISTANCE.km,
    myPlace: SAMPLE_DISTANCE.myPlace,
    theirPlace: SAMPLE_DISTANCE.theirPlace,
  };
}

/** Two digits, so the counter's width never changes as it ticks. */
export const pad = (n: number): string => String(n).padStart(2, '0');

export const WEEK_LABELS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'] as const;
