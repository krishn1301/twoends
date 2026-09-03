import { describe, expect, it } from 'vitest';

import {
  anniversariesSoFar,
  anniversaryDay,
  dayAfter,
  nextRecapWindow,
  pendingWindows,
  overlap,
  pickTwo,
  recapTitle,
  worthShowing,
  type RecapExchange,
} from './recap.ts';

/**
 * The month arithmetic behind the recap.
 *
 * Tested hard because every one of these mistakes is invisible for a month and
 * then permanent: a window that starts a day late loses a photograph out of the
 * only page that was ever going to show it, and a couple who started on the
 * 31st either get seven recaps a year or none at all depending on which way the
 * rounding goes.
 */
describe('anniversaryDay', () => {
  it('is the day they started, in a month long enough to have it', () => {
    expect(anniversaryDay(16, 2026, 9)).toBe(16);
    expect(anniversaryDay(1, 2026, 2)).toBe(1);
  });

  it('lands on the last day of a month too short to contain it', () => {
    expect(anniversaryDay(31, 2026, 2)).toBe(28);
    expect(anniversaryDay(31, 2026, 4)).toBe(30);
    expect(anniversaryDay(30, 2026, 2)).toBe(28);
  });

  it('knows about February in a leap year', () => {
    expect(anniversaryDay(31, 2028, 2)).toBe(29);
  });
});

describe('anniversariesSoFar', () => {
  it('does not count the day they started', () => {
    expect(anniversariesSoFar('2026-04-16', '2026-04-16')).toEqual([]);
    expect(anniversariesSoFar('2026-04-16', '2026-05-15')).toEqual([]);
  });

  it('counts one on the day the month turns', () => {
    expect(anniversariesSoFar('2026-04-16', '2026-05-16')).toEqual(['2026-05-16']);
  });

  it('walks months rather than days', () => {
    expect(anniversariesSoFar('2026-04-16', '2026-09-04')).toEqual([
      '2026-05-16',
      '2026-06-16',
      '2026-07-16',
      '2026-08-16',
    ]);
  });

  it('crosses a year end', () => {
    expect(anniversariesSoFar('2026-11-30', '2027-02-01')).toEqual([
      '2026-12-30',
      '2027-01-30',
    ]);
  });

  /*
    Twelve a year for somebody who started on the 31st, not seven. The short
    months land on their last day, which is the rule `occasions.ts` uses for the
    card and has to be the rule here too or the two disagree about what a month
    is.
  */
  it('gives a couple who started on the 31st twelve a year', () => {
    const year = anniversariesSoFar('2026-01-31', '2027-01-31');
    expect(year).toHaveLength(12);
    expect(year[1]).toBe('2026-03-31');
    expect(year).toContain('2026-02-28');
  });
});

describe('nextRecapWindow', () => {
  it('is null before the first month is up', () => {
    expect(nextRecapWindow('2026-04-16', '2026-05-15', null)).toBeNull();
  });

  it('runs from the day they started to the first anniversary', () => {
    expect(nextRecapWindow('2026-04-16', '2026-05-16', null)).toEqual({
      month: '2026-05-01',
      from: '2026-04-16',
      to: '2026-05-16',
    });
  });

  it('starts the day after the last one ended, never repeating a day', () => {
    expect(nextRecapWindow('2026-04-16', '2026-07-01', '2026-05-16')).toEqual({
      month: '2026-06-01',
      from: '2026-05-17',
      to: '2026-06-16',
    });
  });

  it('is null once everything up to today is covered', () => {
    expect(nextRecapWindow('2026-04-16', '2026-09-04', '2026-08-16')).toBeNull();
  });
});

describe('pendingWindows', () => {
  /*
    The whole mechanism for "a thin month rolls into the next", and the bug that
    made it necessary. Every pending window shares the same start, so trying the
    next one is trying a *longer* period.

    Asking only about the earliest uncovered anniversary deadlocks: a quiet
    first month is never worth a page on its own, so nothing is written, so the
    period never closes, so nothing is ever written. A couple with a quiet April
    would have got no recap for the rest of their lives.
  */
  it('offers every uncovered anniversary, all reaching back to the same day', () => {
    expect(pendingWindows('2026-04-16', '2026-07-20', null)).toEqual([
      { month: '2026-05-01', from: '2026-04-16', to: '2026-05-16' },
      { month: '2026-06-01', from: '2026-04-16', to: '2026-06-16' },
      { month: '2026-07-01', from: '2026-04-16', to: '2026-07-16' },
    ]);
  });

  it('starts the day after the last one that actually closed', () => {
    expect(pendingWindows('2026-04-16', '2026-07-20', '2026-05-16')).toEqual([
      { month: '2026-06-01', from: '2026-05-17', to: '2026-06-16' },
      { month: '2026-07-01', from: '2026-05-17', to: '2026-07-16' },
    ]);
  });

  it('is empty when nothing is due', () => {
    expect(pendingWindows('2026-04-16', '2026-05-15', null)).toEqual([]);
    expect(pendingWindows('2026-04-16', '2026-09-04', '2026-08-16')).toEqual([]);
  });

});

describe('the rest', () => {
  it('rolls the day forward across a month end', () => {
    expect(dayAfter('2026-08-31')).toBe('2026-09-01');
    expect(dayAfter('2026-02-28')).toBe('2026-03-01');
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
  });

  it('needs four things before a month is worth a page', () => {
    expect(worthShowing(3)).toBe(false);
    expect(worthShowing(4)).toBe(true);
  });

  it('names a month the way somebody opening it in a year would', () => {
    expect(recapTitle('2026-08-01')).toBe('August 2026');
  });
});

describe('overlap', () => {
  it('is nothing when they share no real words', () => {
    expect(overlap('the coffee at that place', 'walking home in the rain')).toBe(0);
  });

  it('is high when they said the same thing', () => {
    expect(overlap('the trip to Pune', 'our trip to Pune, obviously')).toBeGreaterThan(0.6);
  });

  /*
    The stop list is the whole reason this is not just a length comparison.
    Without it, two long answers about completely different things share enough
    "the" and "and" to look aligned, and the closest day of every month is
    whichever one somebody wrote most words on.
  */
  it('is not fooled by common words', () => {
    const a = 'I think that the thing about this is really just what you would know';
    const b = 'And they have been more than that, because you think about it';
    expect(overlap(a, b)).toBeLessThan(0.2);
  });

  it('is zero rather than NaN when one side is empty', () => {
    expect(overlap('', 'anything at all')).toBe(0);
    expect(overlap('a b c', '')).toBe(0);
  });
});

describe('pickTwo', () => {
  const day = (date: string, one: string, two: string): RecapExchange => ({
    date,
    question: 'Something?',
    answers: [
      { author_id: 'a', body: one },
      { author_id: 'b', body: two },
    ],
  });

  it('has nothing to say about an empty month', () => {
    expect(pickTwo([])).toEqual({ closest: null, furthest: null });
  });

  /*
    The rule the spec is most insistent about: do not ship a bad insight. One or
    two days is not a spread, so no claim is made about either end — the longest
    thing somebody actually wrote stands in instead.
  */
  it('makes no claim about a month with two days in it', () => {
    const picked = pickTwo([
      day('2026-08-02', 'short', 'also short'),
      day('2026-08-03', 'a much longer answer about the harbour at night', 'no'),
    ]);
    expect(picked.furthest).toBeNull();
    expect(picked.closest?.date).toBe('2026-08-03');
  });

  it('makes no claim when every day scored about the same', () => {
    const flat = [
      day('2026-08-01', 'coffee', 'coffee'),
      day('2026-08-02', 'sleep', 'sleep'),
      day('2026-08-03', 'trains', 'trains'),
    ];
    expect(pickTwo(flat).furthest).toBeNull();
  });

  it('names both ends when the month actually has two', () => {
    const picked = pickTwo([
      day('2026-08-01', 'the harbour at night', 'the harbour, at night, obviously'),
      day('2026-08-02', 'sleeping in properly', 'sleeping in, properly, yes'),
      day('2026-08-03', 'mountains and cold air', 'a very loud restaurant downtown'),
    ]);
    expect(picked.closest?.date).toBe('2026-08-01');
    expect(picked.furthest?.date).toBe('2026-08-03');
  });
});
