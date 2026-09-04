import { describe, expect, it } from 'vitest';

import { PEAKS, clock, downsample, even, join, wav } from '../src/lib/recorder.ts';

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

/**
 * The WAV writer.
 *
 * Forty-four bytes of header written by hand, and the only way to find out it
 * is wrong on a phone is that a note plays as static or does not play at all —
 * which is exactly the report this whole file exists to stop happening twice.
 * So the header is asserted byte for byte.
 */
describe('wav', () => {
  const read = (buffer: ArrayBuffer, at: number, length: number): string =>
    String.fromCharCode(...new Uint8Array(buffer, at, length));

  it('writes a RIFF/WAVE header of the right shape', () => {
    const out = wav(new Float32Array(100), 16_000);
    const view = new DataView(out);

    expect(read(out, 0, 4)).toBe('RIFF');
    expect(read(out, 8, 4)).toBe('WAVE');
    expect(read(out, 12, 4)).toBe('fmt ');
    expect(read(out, 36, 4)).toBe('data');

    expect(view.getUint16(20, true)).toBe(1); // uncompressed PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits
  });

  it('declares the sizes it actually wrote', () => {
    const out = wav(new Float32Array(100), 16_000);
    const view = new DataView(out);

    expect(out.byteLength).toBe(44 + 200);
    expect(view.getUint32(4, true)).toBe(36 + 200);
    expect(view.getUint32(40, true)).toBe(200);
    expect(view.getUint32(28, true)).toBe(32_000); // bytes per second
  });

  /*
    A sample past full scale wraps rather than clipping if it is not clamped —
    +1.2 becomes a large negative number, which is heard as a click on every
    loud syllable rather than as distortion.
  */
  it('clamps rather than wrapping', () => {
    const view = new DataView(wav(new Float32Array([1.5, -1.5, 0]), 8_000));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
    expect(view.getInt16(48, true)).toBe(0);
  });
});

describe('downsample', () => {
  it('takes 48k to 16k at a third of the length', () => {
    expect(downsample(new Float32Array(4800), 48_000, 16_000).length).toBe(1600);
  });

  it('averages rather than picking, so a spike does not survive alone', () => {
    // Three samples collapse to one: 1, 0, 0 must come back as a third, not 1.
    const out = downsample(new Float32Array([1, 0, 0, 1, 0, 0]), 48_000, 16_000);
    expect(out[0]).toBeCloseTo(1 / 3);
  });

  it('leaves a rate that is already low enough alone', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsample(input, 16_000, 16_000)).toBe(input);
  });
});

describe('join', () => {
  it('lays the blocks end to end', () => {
    const out = join([new Float32Array([1, 2]), new Float32Array([3, 4])], 4);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('never runs past the count it was given', () => {
    const out = join([new Float32Array([1, 2]), new Float32Array([3, 4])], 3);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});
