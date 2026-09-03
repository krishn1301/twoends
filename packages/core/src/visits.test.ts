import { describe, expect, it } from 'vitest';

import {
  departureLine,
  togetherFor,
  visitDays,
  visitTitle,
  zoneOffsetMinutes,
  type Visit,
} from './visits.ts';

const AUG_1 = Date.parse('2026-08-01T09:00:00Z');
const visit = (started: string, ended: string | null, place: string | null = null): Visit => ({
  id: 'v',
  started_at: started,
  ended_at: ended,
  place_label: place,
});

/**
 * How a visit is counted and described.
 *
 * The arithmetic is small and the wrongness would be loud: "one day together"
 * on the afternoon somebody landed, or a six-day trip called five because it
 * ended before the hour it started.
 */
describe('visitDays', () => {
  it('counts the day it started as the first', () => {
    expect(visitDays('2026-08-01T09:00:00Z', '2026-08-01T22:00:00Z', AUG_1)).toBe(1);
  });

  /*
    The one that would be wrong on every trip. Somebody who arrives on Saturday
    morning and leaves the following Thursday evening was there six days, and a
    plain difference-in-days that ends an hour early calls it five.
  */
  it('counts a six-day trip as six even when it ends earlier in the day', () => {
    expect(visitDays('2026-08-01T09:00:00Z', '2026-08-06T07:00:00Z', AUG_1)).toBe(6);
  });

  it('counts up to now while it is still open', () => {
    const threeDaysOn = Date.parse('2026-08-03T12:00:00Z');
    expect(visitDays('2026-08-01T09:00:00Z', null, threeDaysOn)).toBe(3);
  });

  it('is never zero', () => {
    expect(visitDays('2026-08-01T09:00:00Z', '2026-08-01T09:00:01Z', AUG_1)).toBe(1);
  });

  it('is zero rather than NaN on a date it cannot read', () => {
    expect(visitDays('not a date', null, AUG_1)).toBe(0);
  });
});

describe('togetherFor', () => {
  /*
    Hours on the first day, because "one day together" on the afternoon
    somebody arrived is wrong in a way people notice immediately.
  */
  it('counts minutes in the first hour', () => {
    expect(togetherFor('2026-08-01T09:00:00Z', Date.parse('2026-08-01T09:20:00Z'))).toBe(
      '20 minutes',
    );
  });

  it('counts hours on the first day', () => {
    expect(togetherFor('2026-08-01T09:00:00Z', Date.parse('2026-08-01T14:00:00Z'))).toBe('5 hours');
    expect(togetherFor('2026-08-01T09:00:00Z', Date.parse('2026-08-01T10:00:00Z'))).toBe('One hour');
  });

  it('counts days after that', () => {
    expect(togetherFor('2026-08-01T09:00:00Z', Date.parse('2026-08-04T10:00:00Z'))).toBe('3 days');
  });

  it('does not go backwards if the clocks disagree', () => {
    expect(togetherFor('2026-08-01T09:00:00Z', Date.parse('2026-08-01T08:00:00Z'))).toBe(
      'One minute',
    );
  });
});

describe('what it is called', () => {
  it('names the place when there is one', () => {
    expect(visitTitle(visit('2026-08-01T09:00:00Z', '2026-08-06T18:00:00Z', 'Pune'), AUG_1)).toBe(
      '6 days in Pune',
    );
  });

  it('is still a visit without one', () => {
    expect(visitTitle(visit('2026-08-01T09:00:00Z', '2026-08-06T18:00:00Z'), AUG_1)).toBe('6 days');
  });

  /*
    The departure line is deliberately flat. It is a hard day and the app has
    nothing useful to add, so it says how long it was and stops — no "until next
    time", no encouragement, nothing that performs.
  */
  it('says what happened and nothing else', () => {
    const line = departureLine(visit('2026-08-01T09:00:00Z', '2026-08-06T18:00:00Z', 'Pune'), AUG_1);
    expect(line).toBe('6 days in Pune. Back to the counter.');
    expect(line).not.toMatch(/soon|miss|again|!/i);
  });
});

describe('zoneOffsetMinutes', () => {
  const at = new Date('2026-08-01T12:00:00Z');

  it('reads a whole-hour zone', () => {
    expect(zoneOffsetMinutes('UTC', at)).toBe(0);
    expect(zoneOffsetMinutes('Europe/London', at)).toBe(60);
  });

  /*
    The one this app actually needs. Without the half hour, an evening arrival
    in India lands on the previous UTC day and the trip is a day short.
  */
  it('reads a half-hour zone', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', at)).toBe(330);
  });

  it('reads one that is behind, across midnight', () => {
    expect(zoneOffsetMinutes('America/Los_Angeles', new Date('2026-08-01T02:00:00Z'))).toBe(-420);
  });

  it('answers UTC for a zone it does not know', () => {
    expect(zoneOffsetMinutes('Not/AZone', at)).toBe(0);
  });
});

describe('a day boundary in the couple’s own calendar', () => {
  /*
    An evening arrival in India is the previous day in UTC. Counting on the
    wrong calendar takes a day off every trip that starts after half past six
    in the evening, which is most of them — people land in the evening.
  */
  it('does not lose a day on an evening arrival', () => {
    const arrived = '2026-08-01T15:30:00Z'; // 9pm in Kolkata
    const left = '2026-08-06T05:00:00Z'; // 10:30am in Kolkata
    const now = Date.parse(left);

    expect(visitDays(arrived, left, now, 330)).toBe(6);
    // And the UTC reading, which is the bug this parameter exists to avoid.
    expect(visitDays(arrived, left, now, 0)).toBe(6);
  });

  it('counts the local calendar, not the elapsed hours', () => {
    const arrived = '2026-08-01T20:00:00Z'; // 1:30am on the 2nd in Kolkata
    const left = '2026-08-02T04:00:00Z'; // 9:30am on the 2nd in Kolkata
    expect(visitDays(arrived, left, Date.parse(left), 330)).toBe(1);
  });
});
