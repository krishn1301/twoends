import { useEffect, useState } from 'react';

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

/**
 * One view model, three shells. The options must differ in treatment and never
 * in content — otherwise the comparison is measuring the copy, not the design.
 */

export interface DesignModel {
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
 * Ticks once per second, re-anchoring to the wall clock each time.
 *
 * A bare `setInterval(fn, 1000)` drifts: it fires *at least* a second later, and
 * the error accumulates until the seconds digit visibly skips. Scheduling the
 * next tick for the start of the next real second keeps it honest. Phase 5 moves
 * this behind the counter component; the maths already lives in core.
 */
function useSecond(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        1000 - (Date.now() % 1000),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return now;
}

export function useDesignModel(): DesignModel {
  const now = useSecond();

  const them = SAMPLE_COUPLE.them;
  const startedOn = SAMPLE_COUPLE.startedOn ?? '2025-01-01';
  const turn = turnFor(SAMPLE_PROMPT, them !== null);
  const theirName = them?.displayName ?? 'them';

  return {
    myName: SAMPLE_COUPLE.me.displayName,
    theirName,
    myAccent: getAccent(SAMPLE_COUPLE.me.accentKey),
    theirAccent: getAccent(them?.accentKey ?? 'rose'),
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
