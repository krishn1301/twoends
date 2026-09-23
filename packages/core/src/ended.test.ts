import { describe, expect, it } from 'vitest';

import { occasionFor } from './occasions.ts';
import { localMidnight, timeTogether } from './togetherness.ts';

/**
 * A counter that can be put down, and a silence that has to hold.
 *
 * Every number in this app is derived from an anchor at draw time, which is
 * what makes a widget right on a morning nobody opened the app — and which also
 * meant the count could never stop. `ended_on` is the one thing that stops it.
 *
 * These are not edge cases. The first is somebody watching their own counter go
 * up after it should not; the second is a notification arriving on the sixteenth
 * of a month to say how long a thing that is over went on for. Both land on a
 * real morning, in front of somebody who did not ask for them, and neither
 * shows up in any other test.
 */

describe('the counter stops on the day it is told to', () => {
  const start = '2026-01-01';

  it('counts to the end date instead of to now', () => {
    const later = new Date(2026, 5, 30); // months are zero-based: 30 June.
    expect(timeTogether(start, later, '2026-01-11').totalDays).toBe(10);
  });

  it('agrees with what it read on the day it stopped', () => {
    const end = '2026-03-04';
    const muchLater = new Date(2027, 0, 1);

    expect(timeTogether(start, muchLater, end).totalDays).toBe(
      timeTogether(start, localMidnight(end)).totalDays,
    );
  });

  it('stays stopped, however long afterwards you look', () => {
    const end = '2026-03-04';
    const a = timeTogether(start, new Date(2026, 5, 1), end);
    const b = timeTogether(start, new Date(2030, 5, 1), end);
    expect(a).toEqual(b);
  });

  it('reads as a whole number of days with nothing running under it', () => {
    // Frozen at midnight, so the hours, minutes and seconds are not left
    // ticking under a day count that is standing still.
    const stopped = timeTogether(start, new Date(2026, 5, 30, 17, 42, 9), '2026-01-11');
    expect(stopped).toEqual({ days: 10, hours: 0, minutes: 0, seconds: 0, totalDays: 10 });
  });

  /*
    An end date nobody has reached yet is not an end. Somebody typing next month
    into a date field must not fast-forward the count past today.
  */
  it('does not run ahead to an end date in the future', () => {
    const now = new Date(2026, 0, 6);
    expect(timeTogether(start, now, '2026-12-25').totalDays).toBe(
      timeTogether(start, now).totalDays,
    );
  });

  it('is unchanged when there is no end date', () => {
    const now = new Date(2026, 0, 6);
    expect(timeTogether(start, now, null).totalDays).toBe(timeTogether(start, now).totalDays);
    expect(timeTogether(start, now, undefined).totalDays).toBe(timeTogether(start, now).totalDays);
  });
});

describe('nothing is announced after the end', () => {
  const startedOn = '2026-01-16';

  /*
    The monthly is the one that matters most here. It comes round twelve times a
    year on the same day of the month, so a pair who have ended would be told
    how long it went on for, by name, every month, forever.
  */
  it('silences the monthly that would otherwise land every month', () => {
    const asked = { startedOn, localDate: '2026-04-16' };

    expect(occasionFor(asked)?.kind).toBe('monthly');
    expect(occasionFor({ ...asked, endedOn: '2026-03-04' })).toBeNull();
  });

  it('silences the anniversary', () => {
    const asked = { startedOn, localDate: '2027-01-16' };

    expect(occasionFor(asked)?.kind).toBe('anniversary');
    expect(occasionFor({ ...asked, endedOn: '2026-03-04' })).toBeNull();
  });

  it('silences a milestone', () => {
    const asked = { startedOn, localDate: '2026-04-26' }; // day 100.

    expect(occasionFor(asked)?.kind).toBe('milestone');
    expect(occasionFor({ ...asked, endedOn: '2026-03-04' })).toBeNull();
  });

  /*
    A birthday is the only one with an argument for itself, and it loses. The
    copy is written to two people who are together; an app that has been told
    otherwise has no business being what raises it.
  */
  it('silences a birthday too, deliberately', () => {
    const asked = { startedOn, localDate: '2026-07-09', theirBirthday: '1999-07-09' };

    expect(occasionFor(asked)?.kind).toBe('birthday');
    expect(occasionFor({ ...asked, endedOn: '2026-03-04' })).toBeNull();
  });

  it('silences the minute egg', () => {
    const asked = { startedOn, localDate: '2026-05-02', minutesOfDay: 1 * 60 + 16 };

    expect(occasionFor({ ...asked, endedOn: '2026-03-04' })).toBeNull();
  });

  /*
    The end date is the last day, and it is silent too. Whatever that morning
    was, it is not something to be congratulated on.
  */
  it('is already silent on the day itself', () => {
    expect(occasionFor({ startedOn, localDate: '2026-04-16', endedOn: '2026-04-16' })).toBeNull();
  });

  it('says what it always said right up to the day before', () => {
    const occasion = occasionFor({ startedOn, localDate: '2026-04-16', endedOn: '2026-04-17' });
    expect(occasion?.kind).toBe('monthly');
  });

  it('changes nothing when there is no end date', () => {
    expect(occasionFor({ startedOn, localDate: '2026-04-16', endedOn: null })?.kind).toBe('monthly');
  });
});
