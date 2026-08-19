import { describe, expect, it } from 'vitest';

import { adultEnabled, adultState } from './consent.ts';

const WHEN = '2026-08-19T12:00:00Z';

describe('two people agreeing', () => {
  it('is off until both have said so', () => {
    expect(adultState(null, null)).toBe('off');
    expect(adultEnabled(null, null)).toBe(false);
    expect(adultEnabled(WHEN, null)).toBe(false);
    expect(adultEnabled(null, WHEN)).toBe(false);
    expect(adultEnabled(WHEN, WHEN)).toBe(true);
  });

  it('tells the two halves of the middle apart', () => {
    /*
      "Off" and "waiting for them" look identical from the outside and mean
      completely different things. A switch that appears to do nothing because
      your partner has not moved yet is the thing people assume is broken, and
      then turn off, and then never try again.
    */
    expect(adultState(WHEN, null)).toBe('waiting-for-them');
    expect(adultState(null, WHEN)).toBe('waiting-for-you');
    expect(adultState(WHEN, WHEN)).toBe('on');
  });

  it('treats undefined as not yet, not as an error', () => {
    // A partner who has not loaded, or a slot with nobody in it. Neither is
    // consent, and neither should throw on a settings screen.
    expect(adultState(undefined, undefined)).toBe('off');
    expect(adultState(WHEN, undefined)).toBe('waiting-for-them');
  });
});

describe('withdrawing', () => {
  it('takes one person, not two', () => {
    /*
      The difference from unpairing, which is a handshake — one asks, the other
      confirms, either can call it off. That is right for destroying shared
      things and wrong for this: needing your partner's agreement to stop is not
      consent, it is negotiation.
    */
    expect(adultState(WHEN, WHEN)).toBe('on');
    expect(adultEnabled(null, WHEN)).toBe(false);
    expect(adultEnabled(WHEN, null)).toBe(false);
  });

  it('leaves the other person opted in rather than resetting them', () => {
    // Turning it off must not quietly revoke their answer too. They said yes;
    // that stays true, and it is why the state is "waiting for you" rather than
    // "off" from their side.
    expect(adultState(null, WHEN)).toBe('waiting-for-you');
  });
});
