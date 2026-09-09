import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Two numbers in two Kotlin files that have to agree, checked from the one
 * place that can fail a build.
 *
 * `pairMark` lays a `Together` mark out as two discs overlapping by 22% of a
 * diameter, so the bitmap it is handed must be **2 − 0.22 = 1.78** times as
 * wide as it is tall. The caller asked for 1.72 for months. That makes `left`
 * negative, the pair is drawn wider than the bitmap holding it, and both faces
 * lose a sliver off their outer edge — reported, accurately, as "the two circles
 * are in an invisible square".
 *
 * Nothing else could have caught it. It compiles, it runs, it draws, and the
 * error is three device pixels on the outside of a circle. There is no Kotlin
 * test harness in this project and adding one to assert a ratio would cost more
 * than it protects, so this reads the source — the same trick
 * `widget-occasions.test.ts` uses to keep `Theme.kt` honest about the milestone
 * list.
 */

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../android/app/src/main/java/com/twoends/app/widget/${path}`, import.meta.url)), 'utf8');

describe('the Together mark and the widget that asks for one', () => {
  const marks = read('Marks.kt');
  const widgets = read('CountWidgets.kt');

  it('states the overlap and the ratio once, together', () => {
    expect(marks).toContain('const val TOGETHER_OVERLAP = 0.22f');
    expect(marks).toContain('const val TOGETHER_RATIO = 2f - TOGETHER_OVERLAP');
  });

  it('lays the discs out from the same overlap it publishes', () => {
    expect(marks).toContain('val overlap = diameter * TOGETHER_OVERLAP');
    expect(marks).toContain('val spread = diameter * 2 - overlap');
  });

  /*
    The actual bug: a caller that hardcodes its own number. 1.72 is the value
    that shipped, and it is close enough to right that it looks deliberate.
  */
  it('asks for the width the drawing needs rather than a number of its own', () => {
    expect(widgets).toMatch(/markWide\s*=\s*kotlin\.math\.ceil\(markDp \* TOGETHER_RATIO\)/);
    expect(widgets).not.toMatch(/markDp \* 1\.\d+f/);
  });
});
