import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The two looks, measured.
 *
 * `theme.css` states contrast ratios in prose — that is how the elevation
 * problem was found in the first place, by measuring what the tokens actually
 * were rather than by looking at them. A number in a comment is a claim that
 * stops being true the moment somebody nudges a hex value, and nothing else in
 * the repo would notice: every screen keeps rendering, and the only symptom is
 * a card you cannot quite see on a phone in daylight.
 *
 * So the ratios are asserted here, against the file itself.
 *
 * The second half matters more than the first. The proposed look is a switch,
 * and the promise made with it is that the original is still exactly the
 * original — so the shipped values are pinned. If one of them has to change,
 * this test is the place that says so out loud.
 */

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const css = read('../src/styles/theme.css');

/**
 * The value of `--name` inside a block with this selector.
 *
 * Written by hand rather than with a regular expression, and deliberately: the
 * file has two `:root` blocks — the one that came with the app and the one the
 * proposed look adds — so "the first block that matches" is the wrong rule.
 * Every block with the selector is searched, and the first that actually
 * declares the token wins.
 */
function token(selector: string, name: string): string {
  const key = `--${name}:`;

  for (
    let at = css.indexOf(`${selector} {`);
    at !== -1;
    at = css.indexOf(`${selector} {`, at + 1)
  ) {
    const body = css.slice(at, css.indexOf('}', at));
    const found = body.indexOf(key);
    if (found === -1) continue;

    return body.slice(found + key.length, body.indexOf(';', found)).trim();
  }

  expect.unreachable(`no --${name} in a ${selector} block`);
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  expect(Number.isNaN(n), `${hex} is not a hex colour`).toBe(false);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const x = luminance(a) + 0.05;
  const y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

const VOID = '#000000';

describe('the original look', () => {
  /*
    Pinned, not derived. These are the values the app shipped with, and the
    whole point of keeping `classic` is that somebody can go back to exactly
    what they had — not to something a later edit has quietly moved.
  */
  const shipped: Record<string, string> = {
    'color-void': '#000000',
    'color-surface': '#15120f',
    'color-surface-2': '#201b17',
    'color-hairline': '#2c2522',
    'color-ash': '#948a82',
    'color-chalk': '#f2ede9',
  };

  for (const [name, value] of Object.entries(shipped)) {
    it(`--${name} is still ${value}`, () => {
      expect(token('@theme', name)).toBe(value);
    });
  }

  it('is the flat one, which is what the review was about', () => {
    // Kept as an assertion rather than a comment: it is the measurement the
    // proposed look exists to answer, and it should fail loudly if the two
    // ever converge by accident.
    expect(contrast(VOID, shipped['color-surface']!)).toBeLessThan(1.2);
    expect(contrast(shipped['color-surface']!, shipped['color-surface-2']!)).toBeLessThan(1.15);
  });
});

describe('the proposed look', () => {
  const v2 = (name: string) => token("[data-design='v2']", name);

  /*
    Bounded on both sides, because this one has now been wrong in both
    directions. At 1.13 a card was invisible against the page, which is what the
    review was about. At 1.60 it was pale enough that the text on it read as
    washed out on a real phone. The claim in the comment above the block is
    1.37, and the window is what keeps the next adjustment honest.
  */
  it('lifts a card off the page without washing it out', () => {
    const lift = contrast(VOID, v2('color-surface'));
    expect(lift).toBeGreaterThanOrEqual(1.3);
    expect(lift).toBeLessThanOrEqual(1.45);
  });

  it('separates a pressable surface from a card', () => {
    expect(contrast(v2('color-surface'), v2('color-surface-2'))).toBeGreaterThanOrEqual(1.18);
  });

  it('makes the hairline a line again', () => {
    expect(contrast(v2('color-hairline'), v2('color-surface'))).toBeGreaterThanOrEqual(1.7);
  });

  /*
    The reason the first step is capped rather than maximised. Everything
    written on a card has to stay comfortably clear of the bar, and a lighter
    card spends that margin.
  */
  it('keeps chalk far clear of a card', () => {
    expect(contrast(token('@theme', 'color-chalk'), v2('color-surface'))).toBeGreaterThanOrEqual(
      10,
    );
  });

  /*
    The one that constrains everything else. Widening the second elevation step
    any further puts `ash` under 4.5:1 on the lightest ground it is drawn on,
    and losing a legibility guarantee to win a shade of depth is a bad trade —
    which is why the two steps are lopsided rather than even.
  */
  it.each([
    ['void', VOID],
    ['surface', 'color-surface'],
    ['surface-2', 'color-surface-2'],
  ])('keeps ash readable on %s', (_where, ground) => {
    const on = ground.startsWith('#') ? ground : v2(ground);
    expect(contrast(v2('color-ash'), on)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps chalk far clear on both surfaces', () => {
    expect(contrast(token('@theme', 'color-chalk'), v2('color-surface'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('@theme', 'color-chalk'), v2('color-surface-2'))).toBeGreaterThanOrEqual(
      7,
    );
  });

  /*
    Item 15. A placeholder was `ash/60` on `surface-2` — 2.91:1. In the proposed
    look it is `ash` at full strength, which is why this is an alias rather than
    a colour: two values that are meant to be the same number should not be two
    numbers.
  */
  it('gives placeholders the same contrast as any other quiet text', () => {
    expect(v2('color-placeholder')).toBe('var(--color-ash)');
    expect(contrast(v2('color-ash'), v2('color-surface-2'))).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves the original placeholder exactly as it was', () => {
    // `rgb(148 138 130 / 0.6)` is `ash/60`, to the digit. Anything else here
    // would be a change to the look that is supposed to be unchanged.
    expect(token(':root', 'color-placeholder')).toBe('rgb(148 138 130 / 0.6)');
  });
});
