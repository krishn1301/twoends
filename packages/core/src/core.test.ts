import { describe, expect, it } from 'vitest';

import { ACCENTS, ACCENT_KEYS, getAccent, isAccentKey } from './accents.ts';
import { daysUntil, elapsedBetween, localMidnight, timeTogether } from './togetherness.ts';
import { seamPosition, turnFor, turnLabel } from './seam.ts';
import { GRACE_PER_MONTH, graceRemaining, isQuiet, streakLabel } from './streak.ts';
import type { PromptDay, StreakState } from './types.ts';

/** WCAG relative luminance and contrast, so the palette claim is tested, not asserted. */
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const INK = '#141110';
const PAPER = '#F4EFEA';

describe('accents', () => {
  it('every onDark variant clears 4.5:1 against --ink', () => {
    for (const key of ACCENT_KEYS) {
      expect(contrast(ACCENTS[key].onDark, INK), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every onLight variant clears 4.5:1 against the paper base', () => {
    for (const key of ACCENT_KEYS) {
      expect(contrast(ACCENTS[key].onLight, PAPER), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('spreads accents across lightness, not just hue', () => {
    // All eight solved to the same contrast target would be identically light,
    // which reads as one colour to a colourblind user. Guard the spread.
    const ratios = ACCENT_KEYS.map((k) => contrast(ACCENTS[k].onDark, INK));
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(3);
  });

  it('falls back rather than blanking on an unknown key', () => {
    expect(isAccentKey('teal')).toBe(true);
    expect(isAccentKey('chartreuse')).toBe(false);
    expect(getAccent('chartreuse').key).toBe('iris');
  });
});

describe('togetherness', () => {
  it('reads an ISO date as local midnight, not UTC midnight', () => {
    const d = localMidnight('2026-08-10');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });

  it('breaks elapsed time into days, hours, minutes, seconds', () => {
    const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const now = new Date(2026, 0, 4, 5, 6, 7).getTime();
    expect(elapsedBetween(start, now)).toEqual({
      days: 3,
      hours: 5,
      minutes: 6,
      seconds: 7,
      totalDays: 3,
    });
  });

  it('clamps a future start date to zero instead of counting backwards', () => {
    const now = new Date(2026, 0, 1).getTime();
    const start = new Date(2027, 0, 1).getTime();
    expect(elapsedBetween(start, now).totalDays).toBe(0);
  });

  it('survives a DST boundary without dropping or gaining a day', () => {
    // 1 Mar local midnight to 1 Apr local noon is 31 days and change. In a
    // timezone that springs forward it is 31d 11h; one that falls back, 31d 13h;
    // one with no DST, 31d 12h. All three floor to 31, so the counter cannot
    // silently gain or lose a day on whoever is running it.
    const now = new Date(2026, 3, 1, 12, 0, 0);
    expect(timeTogether('2026-03-01', now).totalDays).toBe(31);
  });

  it('rounds countdowns up so a live countdown never reads zero early', () => {
    const now = Date.parse('2026-08-10T12:00:00Z');
    expect(daysUntil(now + 1000, now)).toBe(1);
    expect(daysUntil(now, now)).toBe(0);
    expect(daysUntil(now - 86_400_000, now)).toBe(0);
  });
});

describe('seam', () => {
  const prompt = (mine: string | null, theirs: boolean): PromptDay => ({
    promptId: 'p',
    body: 'q',
    localDate: '2026-08-10',
    myAnswer: mine,
    theirAnswer: null,
    theyHaveAnswered: theirs,
  });

  it('leans toward whoever the app is waiting on', () => {
    expect(turnFor(prompt(null, true), true)).toBe('mine');
    expect(turnFor(prompt('yes', false), true)).toBe('theirs');
    expect(turnFor(prompt(null, false), true)).toBe('both');
    expect(turnFor(prompt('yes', true), true)).toBe('settled');
    expect(turnFor(null, false)).toBe('solo');
  });

  it('sits centred when the pair is even and leans when it is not', () => {
    expect(seamPosition('both')).toBe(0.5);
    expect(seamPosition('settled')).toBe(0.5);
    expect(seamPosition('mine')).toBeGreaterThan(0.5);
    expect(seamPosition('theirs')).toBeLessThan(0.5);
  });

  it('never shames in copy', () => {
    expect(turnLabel('mine', 'Meera')).toBe('Your move');
    expect(turnLabel('theirs', 'Meera')).toContain('Meera');
    expect(turnLabel('solo', 'Meera')).toBe('Just you, for now');
  });
});

describe('streak', () => {
  const streak = (used: number, current = 3): StreakState => ({
    current,
    longest: 9,
    lastActiveDate: '2026-08-09',
    graceUsedThisMonth: used,
    week: ['done', 'done', 'done', 'future', 'future', 'future', 'future'],
  });

  it('forgives two missed days a month', () => {
    expect(GRACE_PER_MONTH).toBe(2);
    expect(graceRemaining(streak(0))).toBe(2);
    expect(graceRemaining(streak(2))).toBe(0);
    expect(graceRemaining(streak(5))).toBe(0);
  });

  it('treats quiet mode as active through its final day', () => {
    expect(isQuiet('2026-08-10', '2026-08-10')).toBe(true);
    expect(isQuiet('2026-08-09', '2026-08-10')).toBe(false);
    expect(isQuiet(undefined, '2026-08-10')).toBe(false);
  });

  it('states the number without shaming', () => {
    expect(streakLabel(streak(0, 0), false)).toBe('No streak yet');
    expect(streakLabel(streak(0, 1), false)).toBe('1 day');
    expect(streakLabel(streak(0, 11), false)).toBe('11 days');
    expect(streakLabel(streak(0, 11), true)).toBe('Quiet mode on');
  });
});
