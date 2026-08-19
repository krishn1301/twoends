import { describe, expect, it } from 'vitest';

import {
  MILESTONES,
  fillsTheScreen,
  minutesFor,
  occasionFor,
  occasionHeadline,
} from './occasions.ts';

/*
  The couple this was built for, because their dates are the hard case rather
  than a convenient one: they started on 16 April, her birthday is the 18th, and
  their first year lands on the 15th. Three occasions inside four days, every
  spring, forever.
*/
const THEM = {
  startedOn: '2026-04-16',
  myBirthday: '2006-01-13',
  theirBirthday: '2008-04-18',
};

describe('the minute', () => {
  it('reads the start date as a clock, both ways round when both are times', () => {
    // 16/04 and 04/16 are the same date written by two different people, and
    // both spellings are on the clock.
    expect(minutesFor('2026-04-16')).toEqual([
      { hour: 4, minute: 16 },
      { hour: 16, minute: 4 },
    ]);
  });

  it('keeps only the month-as-hour reading when the day is not an hour', () => {
    // Nobody who started on the 31st should be waiting for half past thirty.
    expect(minutesFor('2026-12-31')).toEqual([{ hour: 12, minute: 31 }]);
    expect(minutesFor('2026-05-24')).toEqual([{ hour: 5, minute: 24 }]);
  });

  it('does not say the same time twice', () => {
    // The 1st of January is 01:01 whichever way you read it, and the 4th of
    // April is 04:04. One occasion, not two identical ones.
    expect(minutesFor('2026-01-01')).toEqual([{ hour: 1, minute: 1 }]);
    expect(minutesFor('2026-04-04')).toEqual([{ hour: 4, minute: 4 }]);
  });

  /*
    The reason month-as-hour is the reading that always exists, asserted rather
    than argued in a comment: it is the one that never runs out. Every couple
    gets at least one time, and the tests above cover which ones get two.
  */
  it('produces at least one real time for every date in a year, leap day included', () => {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 31; day++) {
        const iso = `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const times = minutesFor(iso);
        expect(times.length, iso).toBeGreaterThanOrEqual(1);
        for (const at of times) {
          expect(at.hour, `${iso} hour`).toBeGreaterThanOrEqual(0);
          expect(at.hour, `${iso} hour`).toBeLessThan(24);
          expect(at.minute, `${iso} minute`).toBeGreaterThanOrEqual(0);
          expect(at.minute, `${iso} minute`).toBeLessThan(60);
        }
      }
    }
  });

  it('is empty without a start date', () => {
    expect(minutesFor(null)).toEqual([]);
  });

  it('fires on both readings, and on nothing either side of them', () => {
    const at = { ...THEM, localDate: '2026-06-01' };
    expect(occasionFor({ ...at, minutesOfDay: 4 * 60 + 16 })?.kind).toBe('minute');
    expect(occasionFor({ ...at, minutesOfDay: 16 * 60 + 4 })?.kind).toBe('minute');
    expect(occasionFor({ ...at, minutesOfDay: 4 * 60 + 15 })).toBeNull();
    expect(occasionFor({ ...at, minutesOfDay: 16 * 60 + 5 })).toBeNull();
  });

  it('gives the two readings different keys, so seeing one does not spend the other', () => {
    const at = { ...THEM, localDate: '2026-06-01' };
    const morning = occasionFor({ ...at, minutesOfDay: 4 * 60 + 16 })?.key;
    const evening = occasionFor({ ...at, minutesOfDay: 16 * 60 + 4 })?.key;
    expect(morning).not.toBe(evening);
  });

  it('does not take the whole screen, unlike the others', () => {
    expect(fillsTheScreen('minute')).toBe(false);
    expect(fillsTheScreen('anniversary')).toBe(true);
    expect(fillsTheScreen('birthday')).toBe(true);
    expect(fillsTheScreen('milestone')).toBe(true);
  });
});

describe('anniversaries', () => {
  it('counts years, and only from the first', () => {
    expect(occasionFor({ ...THEM, localDate: '2027-04-16' })).toMatchObject({
      kind: 'anniversary',
      years: 1,
    });
    expect(occasionFor({ ...THEM, localDate: '2036-04-16' })).toMatchObject({ years: 10 });
  });

  it('is not the day you started', () => {
    // Nought years together is not an anniversary, and would be a strange first
    // thing for the feature to say to somebody.
    expect(occasionFor({ ...THEM, localDate: '2026-04-16' })).toBeNull();
  });
});

describe('the April cluster', () => {
  /*
    Three days in which three occasions land, and originally two of them landed
    on the same morning: day 365 *is* the first anniversary, because a year after
    16 April 2026 is 16 April 2027 and there is no leap day in between.

    That was worth finding. It was first written down as "day 365 falls the day
    before", from a script that built the date in local time and printed it in
    UTC — five and a half hours is enough to move a date backwards, and the whole
    point of this module is that it is the thing that does not make that mistake.

    The collision is gone now, but not by resolving it: 365 was taken out of
    MILESTONES entirely, because "365 days" and "one year" are the same sentence
    said twice. A rule that cannot fire twice beats a rule about which one wins.
  */
  it('says one year, once, on the morning that used to be two things', () => {
    expect(occasionFor({ ...THEM, localDate: '2027-04-16' })).toMatchObject({
      kind: 'anniversary',
      years: 1,
    });
  });

  it('gives her birthday the morning after', () => {
    expect(occasionFor({ ...THEM, localDate: '2027-04-18' })).toMatchObject({
      kind: 'birthday',
      whose: 'theirs',
    });
  });

  it('lets the anniversary win when a birthday falls on the same day', () => {
    // Someone, somewhere, started going out on their partner's birthday.
    const same = { startedOn: '2020-04-16', theirBirthday: '1999-04-16', localDate: '2027-04-16' };
    expect(occasionFor(same)?.kind).toBe('anniversary');
  });

  it('lets a birthday win over a milestone', () => {
    // 100 days after 9 January is 19 April; give that couple her birthday.
    const clash = {
      startedOn: '2027-01-09',
      theirBirthday: '2000-04-19',
      localDate: '2027-04-19',
    };
    expect(occasionFor(clash)?.kind).toBe('birthday');
  });
});

describe('milestones', () => {
  it('fires on the day and never after it', () => {
    // Day 100 for this couple was 24 July 2026. Today is day 120.
    expect(occasionFor({ ...THEM, localDate: '2026-07-25' })).toMatchObject({ days: 100 });
    expect(occasionFor({ ...THEM, localDate: '2026-08-14' })).toBeNull();
  });

  it('says nothing on day 365, even when it is not the anniversary', () => {
    /*
      A couple who started in a year with a leap day in the way: 1 January 2028
      plus 365 days is 31 December 2028, a day short of their anniversary. So
      here the two really are different mornings — and this is still silent,
      because the reason for dropping 365 was that it duplicates a word people
      already have, not that it happened to collide for one couple. Making it
      fire for the leap-year minority would be a rule almost nobody could
      predict.
    */
    expect(occasionFor({ startedOn: '2028-01-01', localDate: '2028-12-31' })).toBeNull();
  });

  it('has a key that survives a year passing, unlike the dated ones', () => {
    // A milestone happens once ever, so its key needs no date. An anniversary
    // happens again, so its key carries one — otherwise "already seen" would
    // silence it for good the second time round.
    expect(occasionFor({ ...THEM, localDate: '2026-07-25' })?.key).toBe('milestone:100');
    expect(occasionFor({ ...THEM, localDate: '2027-04-16' })?.key).toBe('anniversary:2027-04-16');
    expect(occasionFor({ ...THEM, localDate: '2028-04-16' })?.key).toBe('anniversary:2028-04-16');
  });

  it('is sparse enough not to become furniture', () => {
    // One interruption in the first year, not eleven.
    expect(MILESTONES.filter((d) => d < 365)).toEqual([100]);
  });

  it('carries no count that a year already says', () => {
    // 365 and 730 are "one year" and "two years" in a worse notation, and the
    // anniversary is already saying both. Adding either back needs a decision
    // about precedence that this deliberately does not have.
    for (const yearly of [365, 730, 1095]) {
      expect(MILESTONES, `${yearly} duplicates an anniversary`).not.toContain(yearly);
    }
  });
});

describe('most days are nothing', () => {
  it('says so', () => {
    expect(occasionFor({ ...THEM, localDate: '2026-08-14' })).toBeNull();
    expect(occasionFor({ ...THEM, localDate: '2026-11-03' })).toBeNull();
  });

  it('survives a couple with no start date and no birthdays', () => {
    expect(occasionFor({ startedOn: null, localDate: '2026-04-16' })).toBeNull();
    expect(occasionFor({ startedOn: null, localDate: '2026-04-16', minutesOfDay: 256 })).toBeNull();
  });

  it('ignores a date it cannot parse rather than throwing', () => {
    // A widget or a card must never be the thing that takes the screen down.
    expect(occasionFor({ startedOn: 'not a date', localDate: '2026-04-16' })).toBeNull();
    expect(occasionFor({ ...THEM, localDate: 'nonsense' })).toBeNull();
  });

  it('reads a timestamp as well as a plain date', () => {
    // `started_on` is a date column but a birthday could arrive as either.
    expect(
      occasionFor({ startedOn: '2026-04-16T00:00:00Z', localDate: '2027-04-16' })?.kind,
    ).toBe('anniversary');
  });
});

describe('the headline three surfaces share', () => {
  /*
    The card, the notification that arrives before anybody opens the app, and
    the widget. Two of those reach somebody who is not looking at the app, so a
    second copy of this wording would show up as a phone saying one thing beside
    a screen saying another.
  */
  const on = (localDate: string) => occasionFor({ ...THEM, localDate })!;

  it('spells small numbers and leaves large ones as digits', () => {
    expect(occasionHeadline(on('2027-04-16'))).toBe('One year');
    expect(occasionHeadline(on('2028-04-16'))).toBe('2 years');
    expect(occasionHeadline(on('2027-08-29'))).toBe('500 days');
  });

  it('names them on their birthday and not on yours', () => {
    // You know when your own is. The reason to say it out loud is so the other
    // one is reminded, which is why only that direction carries a name.
    expect(occasionHeadline(on('2027-04-18'), 'Sansu')).toBe('Sansu’s birthday');
    expect(occasionHeadline(on('2027-01-13'), 'Sansu')).toBe('Your birthday');
  });

  it('says something rather than nothing without a name', () => {
    // The push has a name to hand; a widget may not.
    expect(occasionHeadline(on('2027-04-18'))).toBe('Their birthday');
    expect(occasionHeadline(on('2027-04-18'), null)).toBe('Their birthday');
  });
});
