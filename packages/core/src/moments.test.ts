import { describe, expect, it } from 'vitest';

import {
  MOMENT_HOURS,
  MOMENT_PROMPTS,
  MOMENT_WINDOW,
  momentForDay,
  momentLeft,
  momentOpensAt,
  momentState,
} from './moments.ts';

/**
 * The shared moment.
 *
 * Everything here is derived rather than scheduled, so the property that
 * matters is agreement: two phones with the same couple id and the same date
 * must reach the same prompt at the same hour, with nothing passing between
 * them. A disagreement here means one of them is photographing the sky while
 * the other is being asked about their shoes, and neither would ever see an
 * error.
 */
describe('momentForDay', () => {
  it('is the same on both phones', () => {
    const a = momentForDay('couple-1', '2026-09-04');
    const b = momentForDay('couple-1', '2026-09-04');
    expect(a).toEqual(b);
  });

  it('is a different day, a different moment', () => {
    const today = momentForDay('couple-1', '2026-09-04');
    const tomorrow = momentForDay('couple-1', '2026-09-05');
    expect(today).not.toEqual(tomorrow);
  });

  it('is a different couple, a different moment', () => {
    expect(momentForDay('couple-1', '2026-09-04')).not.toEqual(
      momentForDay('couple-2', '2026-09-04'),
    );
  });

  it('is nothing at all without a couple', () => {
    expect(momentForDay('', '2026-09-04')).toBeNull();
    expect(momentForDay('couple-1', '')).toBeNull();
  });

  /*
    The one outcome that would make this an alarm rather than a nudge. Checked
    across a year rather than asserted about the constant, because the bug would
    be in the arithmetic that picks from it.
  */
  it('never opens in the middle of the night', () => {
    for (let day = 1; day <= 365; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
      for (const couple of ['a', 'bbbb', 'cccccccc', 'couple-1', 'couple-2']) {
        const moment = momentForDay(couple, date)!;
        expect(MOMENT_HOURS).toContain(moment.hour);
        expect(moment.hour).toBeGreaterThanOrEqual(10);
        expect(moment.hour).toBeLessThanOrEqual(21);
      }
    }
  });

  it('always lands on a prompt that exists', () => {
    for (let day = 1; day <= 200; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
      const moment = momentForDay('couple-1', date)!;
      expect(MOMENT_PROMPTS[moment.index]).toBe(moment.prompt);
    }
  });

  /*
    The prompt and the hour are two draws from one hash, and they must not move
    together — otherwise every couple who gets the same prompt also opens at the
    same minute, which is how a feature meant to feel personal starts feeling
    like a broadcast.
  */
  it('does not tie the prompt to the hour', () => {
    const seen = new Map<number, Set<number>>();
    for (let day = 1; day <= 365; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
      const moment = momentForDay('couple-1', date)!;
      if (!seen.has(moment.index)) seen.set(moment.index, new Set());
      seen.get(moment.index)!.add(moment.hour);
    }
    const spread = [...seen.values()].filter((hours) => hours.size > 1);
    expect(spread.length).toBeGreaterThan(0);
  });
});

describe('the window', () => {
  const moment = { index: 0, prompt: 'The nearest window.', hour: 16 };

  it('has not opened before its hour', () => {
    expect(momentState(moment, 15 * 60 + 59)).toBe('before');
  });

  it('is open for exactly twenty minutes', () => {
    expect(momentState(moment, 16 * 60)).toBe('open');
    expect(momentState(moment, 16 * 60 + MOMENT_WINDOW - 1)).toBe('open');
    expect(momentState(moment, 16 * 60 + MOMENT_WINDOW)).toBe('missed');
  });

  it('is gone for the rest of the day once it closes', () => {
    expect(momentState(moment, 23 * 60 + 59)).toBe('missed');
  });

  it('counts down and stops at zero', () => {
    expect(momentLeft(moment, 16 * 60)).toBe(MOMENT_WINDOW);
    expect(momentLeft(moment, 16 * 60 + 5)).toBe(15);
    expect(momentLeft(moment, 20 * 60)).toBe(0);
  });

  it('says when it opens the way somebody would', () => {
    expect(momentOpensAt({ ...moment, hour: 10 })).toBe('10am');
    expect(momentOpensAt({ ...moment, hour: 12 })).toBe('12pm');
    expect(momentOpensAt({ ...moment, hour: 16 })).toBe('4pm');
    expect(momentOpensAt({ ...moment, hour: 21 })).toBe('9pm');
  });
});
