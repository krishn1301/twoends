import { afterEach, describe, expect, it } from 'vitest';

import { forgetOldDays, markSeenToday, seenToday } from './seenToday.ts';

/**
 * A `localStorage` good enough for this file: real key enumeration, because the
 * sweep depends on `Object.keys`, and methods hidden from it so they are not
 * mistaken for stored values.
 */
function fakeStorage(): Storage {
  const store: Record<string, string> = {};
  return Object.defineProperties(store, {
    getItem: { value: (k: string) => store[k] ?? null },
    setItem: {
      value: (k: string, v: string) => {
        store[k] = v;
      },
    },
    removeItem: {
      value: (k: string) => {
        delete store[k];
      },
    },
  }) as unknown as Storage;
}

const useStorage = (storage: Storage | undefined) => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
};

afterEach(() => useStorage(undefined));

describe('once a day', () => {
  it('remembers a key it was told about, and nothing else', () => {
    useStorage(fakeStorage());
    expect(seenToday('anniversary:2027-04-16')).toBe(false);

    markSeenToday('anniversary:2027-04-16');
    expect(seenToday('anniversary:2027-04-16')).toBe(true);
    expect(seenToday('anniversary:2028-04-16')).toBe(false);
  });

  it('fails towards showing the card, unlike the email offer', () => {
    /*
      The one decision in this module. A browser that cannot remember gets shown
      the anniversary again, rather than never being shown it at all — being
      interrupted twice is recoverable and missing it is not. `emailOffered()`
      chooses the opposite default for the opposite reason, and the two must not
      be quietly made to match.
    */
    useStorage(undefined);
    expect(seenToday('anniversary:2027-04-16')).toBe(false);
    expect(() => markSeenToday('anniversary:2027-04-16')).not.toThrow();
  });
});

describe('forgetting days that have gone', () => {
  it('drops spent dates and keeps today', () => {
    useStorage(fakeStorage());
    markSeenToday('anniversary:2026-04-16');
    markSeenToday('minute:2026-08-19:256');
    markSeenToday('birthday:theirs:2026-08-19');

    forgetOldDays('2026-08-19');

    expect(seenToday('anniversary:2026-04-16')).toBe(false);
    expect(seenToday('minute:2026-08-19:256')).toBe(true);
    expect(seenToday('birthday:theirs:2026-08-19')).toBe(true);
  });

  it('keeps milestones, which carry no date and never come again', () => {
    useStorage(fakeStorage());
    markSeenToday('milestone:1000');

    forgetOldDays('2030-01-01');

    // Day 1000 happens once. Forgetting it would show the card to somebody who
    // is now on day 1001, which is a worse thing to read than nothing at all.
    expect(seenToday('milestone:1000')).toBe(true);
  });

  it('leaves keys that are not ours alone', () => {
    useStorage(fakeStorage());
    localStorage.setItem('twoends.email-offered', 'yes');
    localStorage.setItem('some.other.app:2020-01-01', 'x');

    forgetOldDays('2026-08-19');

    expect(localStorage.getItem('twoends.email-offered')).toBe('yes');
    expect(localStorage.getItem('some.other.app:2020-01-01')).toBe('x');
  });
});
