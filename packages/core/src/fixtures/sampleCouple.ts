import type { Couple, PromptDay, StreakState } from '../types.ts';

/**
 * One fake pair, shared by all three Phase 0 design shells so they differ only
 * in treatment and never in content. Delete this file when real data lands in
 * Phase 3 — it exists to make a design decision, not to ship.
 *
 * Deliberately chosen: the turn is 'mine' (they answered, I have not), so every
 * shell has to show the seam leaning and the "your move" state, which is the
 * hardest thing the design has to do.
 */

export const SAMPLE_COUPLE: Couple = {
  id: 'sample-couple',
  me: { id: 'me', displayName: 'Aarav', accentKey: 'teal', birthday: '2000-09-09' },
  them: { id: 'them', displayName: 'Meera', accentKey: 'rose', birthday: '2001-02-14' },
  startedOn: '2025-04-17',
  proximity: 'long_distance',
};

export const SAMPLE_PROMPT: PromptDay = {
  promptId: 'sample-prompt',
  body: 'What did you almost tell me about today, and then didn’t?',
  localDate: '2026-08-10',
  myAnswer: null,
  theirAnswer: null,
  theyHaveAnswered: true,
};

export const SAMPLE_STREAK: StreakState = {
  current: 11,
  longest: 24,
  lastActiveDate: '2026-08-09',
  graceUsedThisMonth: 1,
  // Monday-first. One forgiven miss so the 'grace' mark gets exercised.
  week: ['done', 'done', 'grace', 'done', 'done', 'done', 'future'],
};

/** A countdown far enough out to render four digits, close enough to feel real. */
export const SAMPLE_COUNTDOWN = {
  title: 'She lands in Pune',
  targetIso: '2026-09-21T18:40:00',
} as const;

/** Coarse, city-level, opt-in — the only shape location is ever allowed to take. */
export const SAMPLE_DISTANCE = {
  km: 1174,
  myPlace: 'Pune',
  theirPlace: 'Delhi',
} as const;
