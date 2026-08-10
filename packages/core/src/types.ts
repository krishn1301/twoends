import type { AccentKey } from './accents.ts';

/** How the pair describes their situation. Drives copy, not logic. */
export type Proximity = 'together' | 'nearby' | 'long_distance' | 'varies';

export interface Person {
  id: string;
  displayName: string;
  accentKey: AccentKey;
  /** ISO date, `YYYY-MM-DD`. Optional — onboarding lets it be skipped. */
  birthday?: string;
}

export interface Couple {
  id: string;
  /** The person using this device. */
  me: Person;
  /** Null until the invite is accepted — the solo state is a real state. */
  them: Person | null;
  /** ISO date, `YYYY-MM-DD`. The anniversary. */
  startedOn?: string;
  proximity?: Proximity;
  /** ISO date. While set and in the future, streaks and nudges are paused. */
  quietUntil?: string;
}

/** Today's shared question and where each of us is with it. */
export interface PromptDay {
  promptId: string;
  body: string;
  /** ISO date in the couple's local day, not UTC. */
  localDate: string;
  myAnswer: string | null;
  /** Stays null until I have answered too — the reveal is mutual. */
  theirAnswer: string | null;
  /** True once the partner has answered, even while their text is hidden. */
  theyHaveAnswered: boolean;
}

export interface StreakState {
  current: number;
  longest: number;
  /** ISO date of the last day both partners answered. */
  lastActiveDate: string | null;
  /** Misses forgiven so far this calendar month. Cap is GRACE_PER_MONTH. */
  graceUsedThisMonth: number;
  /** Monday-first, seven entries, index 0 = Monday. */
  week: DayMark[];
}

/**
 * `grace` is a day that was missed but forgiven — it renders differently from
 * both `done` and `missed`, because hiding the miss would be dishonest and
 * marking it as a break would be a lie about the streak number.
 */
export type DayMark = 'done' | 'missed' | 'grace' | 'quiet' | 'future';
