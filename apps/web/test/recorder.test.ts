import { describe, expect, it } from 'vitest';

import { PEAKS, clock, even } from '../src/lib/recorder.ts';

/**
 * The waveform normaliser.
 *
 * Tested because the failure is silent and ugly: a five-second note samples
 * eight times and a thirty-second one forty-eight, so without this the bar
 * count depends on how long somebody spoke and the same component renders at
 * six different densities down one screen.
 */
describe('even', () => {
  it('always gives the same number of bars', () => {
    expect(even([]).length).toBe(PEAKS);
    expect(even([0.5]).length).toBe(PEAKS);
    expect(even([0.1, 0.9, 0.4]).length).toBe(PEAKS);
    expect(even(new Array<number>(200).fill(0.3)).length).toBe(PEAKS);
  });

  it('is silence rather than nothing when there is nothing', () => {
    expect(even([])).toEqual(new Array<number>(PEAKS).fill(0));
  });

  it('keeps the ends where they were', () => {
    const stretched = even([0, 1]);
    expect(stretched[0]).toBeCloseTo(0);
    expect(stretched[PEAKS - 1]).toBeCloseTo(1);
  });

  it('interpolates rather than repeating, so a short clip is not a staircase', () => {
    const stretched = even([0, 1]);
    const middle = stretched[Math.floor(PEAKS / 2)] ?? 0;
    expect(middle).toBeGreaterThan(0.4);
    expect(middle).toBeLessThan(0.6);
  });

  it('never invents a longer clip than was recorded', () => {
    const long = new Array<number>(120).fill(0).map((_, i) => i / 120);
    expect(even(long).length).toBe(PEAKS);
    expect(Math.max(...even(long))).toBeLessThanOrEqual(1);
  });
});

describe('clock', () => {
  it('counts seconds, because nothing here is longer than thirty', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(7_400)).toBe('0:07');
    expect(clock(30_000)).toBe('0:30');
  });

  it('does not go negative when a timer overshoots', () => {
    expect(clock(-500)).toBe('0:00');
  });
});
