import { describe, expect, it } from 'vitest';

import { computeStreak } from './streakMath.ts';
import { isQuietNow, quietDays } from './streak.ts';

/**
 * Quiet mode, and the one promise it has to keep: **it pauses the streak with no
 * penalty**.
 *
 * "No penalty" is the whole test surface. Holding a streak while quiet mode is
 * on is easy and was never the hard part — the failure this guards against is
 * the streak breaking the morning quiet mode *lifts*, retroactively, because the
 * days inside it stopped being remembered as quiet. That reads as a bug in the
 * streak and is actually a hole in the model.
 */

const run = (from: string, to: string | null) => ({ from_date: from, to_date: to });

describe('which days were quiet', () => {
  it('includes both ends of a closed period', () => {
    expect([...quietDays([run('2026-08-10', '2026-08-12')], '2026-08-20')]).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('runs an open period up to today and no further', () => {
    /*
      Days that have not happened cannot have been missed. Marking them quiet in
      advance would excuse a week nobody has lived yet, and would make the
      streak's "longest" wrong for as long as the period stayed open.
    */
    const days = quietDays([run('2026-08-18', null)], '2026-08-20');
    expect([...days]).toEqual(['2026-08-18', '2026-08-19', '2026-08-20']);
  });

  it('remembers a period that ended long ago', () => {
    // The point of keeping them. A hush in March still has to hold March.
    const days = quietDays([run('2026-03-01', '2026-03-03')], '2026-08-20');
    expect(days.has('2026-03-02')).toBe(true);
  });

  it('handles several periods at once', () => {
    const days = quietDays(
      [run('2026-03-01', '2026-03-02'), run('2026-08-19', null)],
      '2026-08-19',
    );
    expect([...days].sort()).toEqual(['2026-03-01', '2026-03-02', '2026-08-19']);
  });

  it('is empty when there have been none', () => {
    expect(quietDays([], '2026-08-20').size).toBe(0);
  });

  it('crosses a daylight-saving boundary without dropping a day', () => {
    /*
      Walked as calendar dates rather than by adding 86,400,000 milliseconds.
      That arithmetic is wrong by an hour twice a year in any zone that observes
      daylight saving, and the symptom is one missing day in the middle of a run.
    */
    const days = quietDays([run('2026-03-27', '2026-03-31')], '2026-04-10');
    expect([...days]).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]);
  });

  it('ignores a period whose dates make no sense rather than hanging', () => {
    expect(quietDays([run('not-a-date', null)], '2026-08-20').size).toBe(0);
  });
});

describe('whether it is on now', () => {
  it('is on inside an open period and on its first day', () => {
    expect(isQuietNow([run('2026-08-20', null)], '2026-08-20')).toBe(true);
    expect(isQuietNow([run('2026-08-01', null)], '2026-08-20')).toBe(true);
  });

  it('is on through the last day of a closed one, and off after', () => {
    expect(isQuietNow([run('2026-08-01', '2026-08-20')], '2026-08-20')).toBe(true);
    expect(isQuietNow([run('2026-08-01', '2026-08-19')], '2026-08-20')).toBe(false);
  });

  it('is off before it starts', () => {
    expect(isQuietNow([run('2026-08-21', null)], '2026-08-20')).toBe(false);
    expect(isQuietNow([], '2026-08-20')).toBe(false);
  });
});

describe('no penalty', () => {
  const days = (...d: string[]) => d;

  it('holds a streak across days nobody answered', () => {
    const quiet = quietDays([run('2026-08-16', '2026-08-18')], '2026-08-20');
    const streak = computeStreak(
      days('2026-08-14', '2026-08-15', '2026-08-19', '2026-08-20'),
      '2026-08-20',
      quiet,
    );
    expect(streak.current).toBe(4);
  });

  it('would break without it, which is the whole point', () => {
    // The same days, no quiet set. Three missed days is two more than the grace
    // rule forgives, so the run ends and only the recent pair survives.
    const streak = computeStreak(
      days('2026-08-14', '2026-08-15', '2026-08-19', '2026-08-20'),
      '2026-08-20',
      new Set(),
    );
    expect(streak.current).toBeLessThan(4);
  });

  it('still holds after the quiet period has lifted', () => {
    /*
      The failure worth having a test for. A streak that survives a quiet week
      and then breaks on the morning it ends has not been paused, it has been
      deferred — and it would look like a bug in the streak rather than a
      forgotten period.
    */
    const quiet = quietDays([run('2026-08-10', '2026-08-12')], '2026-08-20');
    const streak = computeStreak(
      days('2026-08-08', '2026-08-09', '2026-08-13', '2026-08-14'),
      '2026-08-14',
      quiet,
    );
    expect(streak.current).toBe(4);
  });

  it('does not build a streak out of silence', () => {
    // Quiet days are stepped over, not counted. A fortnight of saying nothing
    // must not come back as a fortnight-long streak.
    const quiet = quietDays([run('2026-08-01', '2026-08-14')], '2026-08-14');
    const streak = computeStreak(days(), '2026-08-14', quiet);
    expect(streak.current).toBe(0);
  });
});
