import { describe, expect, it } from 'vitest';

import {
  MOMENT_HOURS,
  MOMENT_PROMPTS,
  MOMENT_RUN_MS,
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

describe('the hour', () => {
  const moment = { index: 0, prompt: 'The nearest window.', hour: 16 };

  // A fixed wall clock, so nothing here depends on when the suite runs.
  const at = (hhmm: string): number => Date.parse(`2026-09-04T${hhmm}:00Z`);

  it('has not opened before its hour', () => {
    expect(momentState(moment, 15 * 60 + 59, null, at('15:59'))).toBe('before');
  });

  /*
    Nobody has moved, so nothing is counting. This is the state that used to be
    a deadline, and the day it ran for real it produced nothing: one of them
    photographed the thing inside twenty minutes, the other opened the app later
    and the card had already deleted itself. What ends a moment is somebody
    starting it, not the clock reaching a number.
  */
  it('waits, with no clock, until one of them takes one', () => {
    expect(momentState(moment, 16 * 60, null, at('16:00'))).toBe('waiting');
    expect(momentState(moment, 23 * 60 + 59, null, at('23:59'))).toBe('waiting');
  });

  it('runs for an hour from the first photograph, wherever in the day it lands', () => {
    const first = at('16:05');
    expect(momentState(moment, 16 * 60 + 5, first, first)).toBe('running');
    expect(momentState(moment, 17 * 60 + 4, first, at('17:04'))).toBe('running');
  });

  // The boundary itself, pinned: at exactly one hour it is over, not still open.
  it('closes on the hour mark rather than a minute after it', () => {
    const first = at('16:05');
    expect(momentState(moment, 17 * 60 + 4, first, first + MOMENT_RUN_MS - 1)).toBe('running');
    expect(momentState(moment, 17 * 60 + 5, first, first + MOMENT_RUN_MS)).toBe('closed');
  });

  /*
    An hour begun at half past eleven at night runs past midnight, and the local
    date has rolled by then — so tomorrow's moment is a different moment and
    this one is simply gone. Nothing here has to special-case that; it is the
    caller passing tomorrow's date.
  */
  it('stays closed once it has closed', () => {
    const first = at('16:05');
    expect(momentState(moment, 23 * 60, first, at('23:00'))).toBe('closed');
  });

  it('counts whole minutes down and stops at zero', () => {
    const first = at('16:05');
    expect(momentLeft(first, first)).toBe(60);
    expect(momentLeft(first, first + 5 * 60_000)).toBe(55);
    expect(momentLeft(first, first + MOMENT_RUN_MS)).toBe(0);
    expect(momentLeft(first, first + MOMENT_RUN_MS + 60_000)).toBe(0);
  });

  /*
    Rounded up, deliberately. With thirty seconds left a floor says "0 minutes"
    while the button still works, which reads as a broken counter — and the one
    number nobody may see is a zero that is not a deadline.
  */
  it('never says zero while there is still time', () => {
    const first = at('16:05');
    expect(momentLeft(first, first + MOMENT_RUN_MS - 1_000)).toBe(1);
  });

  it('has no clock at all before anybody starts one', () => {
    expect(momentLeft(null, at('16:30'))).toBe(0);
  });

  it('says when it opens the way somebody would', () => {
    expect(momentOpensAt({ ...moment, hour: 10 })).toBe('10am');
    expect(momentOpensAt({ ...moment, hour: 12 })).toBe('12pm');
    expect(momentOpensAt({ ...moment, hour: 16 })).toBe('4pm');
    expect(momentOpensAt({ ...moment, hour: 21 })).toBe('9pm');
  });
});
