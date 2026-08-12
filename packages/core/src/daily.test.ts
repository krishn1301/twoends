import { describe, expect, it } from 'vitest';

import {
  dayLabel,
  dayState,
  daysBetween,
  deterministicId,
  localDateIn,
  promptForDay,
  type Prompt,
} from './daily.ts';
import { GRACE_PER_MONTH, computeStreak, weekMarks } from './streakMath.ts';

const pack: Prompt[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  body: `Question ${i}`,
  pack: 'core',
  isAdult: false,
}));

describe('the couple’s day', () => {
  it('uses the couple’s timezone, not UTC', () => {
    // 18:30 UTC is already tomorrow in Kolkata and still today in London. An
    // app whose whole loop is "one question per day" cannot be a day out.
    const instant = new Date('2026-08-11T18:30:00Z');
    expect(localDateIn('Asia/Kolkata', instant)).toBe('2026-08-12');
    expect(localDateIn('Europe/London', instant)).toBe('2026-08-11');
    expect(localDateIn('America/Los_Angeles', instant)).toBe('2026-08-11');
  });

  it('falls back rather than breaking on an unknown zone', () => {
    expect(localDateIn('Mars/Olympus', new Date('2026-08-11T12:00:00Z'))).toBe('2026-08-11');
  });

  it('counts calendar days, including across a month boundary', () => {
    expect(daysBetween('2026-08-11', '2026-08-12')).toBe(1);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-08-12', '2026-08-11')).toBe(-1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 is not a leap year
  });
});

describe('deterministic ids', () => {
  it('gives both devices the same id for the same day', () => {
    const a = deterministicId('couple-1', '2026-08-11');
    const b = deterministicId('couple-1', '2026-08-11');
    expect(a).toBe(b);
  });

  it('is different per couple and per day', () => {
    expect(deterministicId('couple-1', '2026-08-11')).not.toBe(
      deterministicId('couple-2', '2026-08-11'),
    );
    expect(deterministicId('couple-1', '2026-08-11')).not.toBe(
      deterministicId('couple-1', '2026-08-12'),
    );
  });

  it('is a well-formed UUID, because it goes in a uuid column', () => {
    expect(deterministicId('couple-1', '2026-08-11')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('picking the day’s question', () => {
  it('gives both partners the same question', () => {
    const a = promptForDay('couple-1', '2026-08-11', pack);
    const b = promptForDay('couple-1', '2026-08-11', pack);
    expect(a?.id).toBe(b?.id);
  });

  it('uses every prompt once before repeating any', () => {
    // Picking by hash(date) would repeat within a fortnight, which reads as the
    // app not paying attention.
    const seen = new Set<string>();
    for (let i = 0; i < pack.length; i++) {
      const date = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
      seen.add(promptForDay('couple-1', date, pack)!.id);
    }
    expect(seen.size).toBe(pack.length);
  });

  it('gives two couples different orders on the same day', () => {
    const orders = ['couple-1', 'couple-2', 'couple-3'].map((c) =>
      Array.from({ length: 6 }, (_, i) => {
        const date = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
        return promptForDay(c, date, pack)!.id;
      }).join(','),
    );
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('survives an empty pack rather than throwing', () => {
    expect(promptForDay('couple-1', '2026-08-11', [])).toBeNull();
  });
});

describe('the state of today', () => {
  it('leans at whoever has not answered', () => {
    expect(dayState(false, false)).toBe('open');
    expect(dayState(false, true)).toBe('your-move');
    expect(dayState(true, false)).toBe('waiting');
    expect(dayState(true, true)).toBe('revealed');
  });

  it('never shames in copy', () => {
    expect(dayLabel('your-move', 'Meera')).toBe('Meera answered');
    expect(dayLabel('waiting', 'Meera')).toBe('Waiting for Meera');
  });
});

describe('streaks', () => {
  const days = (...d: string[]) => d;

  it('counts a clean run', () => {
    const s = computeStreak(days('2026-08-09', '2026-08-10', '2026-08-11'), '2026-08-11');
    expect(s.current).toBe(3);
    expect(s.lastActiveDate).toBe('2026-08-11');
  });

  it('does not punish today being unanswered yet', () => {
    // The day is not over. A streak that reads zero every morning until you open
    // the app would be both wrong and cruel.
    const s = computeStreak(days('2026-08-09', '2026-08-10'), '2026-08-11');
    expect(s.current).toBe(2);
  });

  it('forgives two missed days a month', () => {
    expect(GRACE_PER_MONTH).toBe(2);
    // Missed the 9th and the 7th; both forgiven, so the run reaches back to the 6th.
    const s = computeStreak(
      days('2026-08-06', '2026-08-08', '2026-08-10', '2026-08-11'),
      '2026-08-11',
    );
    expect(s.current).toBe(4);
  });

  it('breaks on the third miss in a month', () => {
    const s = computeStreak(
      days('2026-08-04', '2026-08-06', '2026-08-08', '2026-08-11'),
      '2026-08-11',
    );
    /*
      Walking back from the 11th: answered (1), the 10th missed and forgiven,
      the 9th missed and forgiven, the 8th answered (2), the 7th missed with no
      forgiveness left — so the run is the 11th and the 8th.
    */
    expect(s.current).toBe(2);
  });

  it('gives grace back at the start of a new month', () => {
    // Two forgiven in August must not spend July's allowance.
    const s = computeStreak(
      days('2026-07-29', '2026-07-31', '2026-08-02', '2026-08-03'),
      '2026-08-03',
    );
    expect(s.current).toBe(4);
  });

  it('treats quiet days as not participating at all', () => {
    const quiet = new Set(['2026-08-09', '2026-08-10']);
    const s = computeStreak(days('2026-08-08', '2026-08-11'), '2026-08-11', quiet);
    // Quiet days neither extend nor break, and cost no grace.
    expect(s.current).toBe(2);
  });

  it('starts at zero with nothing answered', () => {
    const s = computeStreak([], '2026-08-11');
    expect(s).toMatchObject({ current: 0, longest: 0, lastActiveDate: null });
  });

  it('remembers the longest run even after it breaks', () => {
    const s = computeStreak(
      days('2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-08-11'),
      '2026-08-11',
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBeGreaterThanOrEqual(4);
  });
});

describe('the week row', () => {
  it('is Monday-first and marks the future as future', () => {
    // 2026-08-12 is a Wednesday.
    const marks = weekMarks(['2026-08-10', '2026-08-11', '2026-08-12'], '2026-08-12');
    expect(marks).toHaveLength(7);
    expect(marks.slice(0, 3)).toEqual(['done', 'done', 'done']);
    expect(marks.slice(3)).toEqual(['future', 'future', 'future', 'future']);
  });

  it('shows a forgiven day as neither done nor broken', () => {
    const marks = weekMarks(['2026-08-10', '2026-08-12'], '2026-08-12');
    // Tuesday was missed but forgiven: hiding it would be dishonest, calling it
    // a break would contradict the number beside it.
    expect(marks[1]).toBe('grace');
  });

  it('marks quiet days as quiet', () => {
    const marks = weekMarks(['2026-08-10'], '2026-08-12', new Set(['2026-08-11']));
    expect(marks[1]).toBe('quiet');
  });
});
